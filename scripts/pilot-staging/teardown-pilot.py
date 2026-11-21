"""Emergency teardown for the dedicated ScoutX staging project."""
import argparse
import json
import os
import re
import subprocess
import time
import ssl
import urllib.request
from pathlib import Path

PROJECT = "pitchproof-stg-pilot2"
NUMBER = "315202089837"
REGION = "europe-west6"
ACTIVE = {"PENDING", "QUEUED", "WORKING"}

FUNCTIONS = {
    "answerTrackingQuestion", "buildDataExport", "cancelMatchAnalysis",
    "discoverTrackingTask", "explainTrackingMoment", "extractTrackingSegmentTask",
    "getMediaPlaybackUrl", "mediaLifecycleSweep", "onMatchJobDeleted",
    "onMatchJobMediaLifecycle", "refreshTrackingOcrTask", "requestDataExport",
    "resolveTrackingTask", "startPlayerAnalysis", "undoTrackingAnswer",
}
BUILD_REPOSITORIES = {"cloud-run-source-deploy", "gcf-artifacts"}

def resource_name(resource):
    return (resource.get("name") or resource.get("metadata", {}).get("name", "")).split("/")[-1]

def gcloud(*args):
    cli = os.environ["STAGING_GCLOUD_PY"]
    import sys
    result = subprocess.run([sys.executable, cli, *args, "--quiet", "--format=json"],
                            check=True, capture_output=True, text=True, timeout=90)
    return json.loads(result.stdout) if result.stdout.strip() else None

def remove_web_app():
    raw_path = os.environ.get("STAGING_CONFIG")
    if not raw_path:
        return
    config = json.loads(Path(raw_path).read_text(encoding="utf-8-sig"))
    app_id = config.get("pilotWebAppId")
    if not app_id:
        return
    if not isinstance(app_id, str) or not app_id.startswith(f"1:{NUMBER}:web:") or not app_id.rsplit(":", 1)[-1].isalnum():
        raise RuntimeError("Refusing to remove a web app outside the approved staging project")
    import sys
    token = subprocess.check_output(
        [sys.executable, os.environ["STAGING_GCLOUD_PY"], "auth", "print-access-token", "--quiet"],
        text=True, timeout=60
    ).strip()
    url = f"https://firebase.googleapis.com/v1beta1/projects/{PROJECT}/webApps/{app_id}:remove"
    request = urllib.request.Request(url, data=b'{}', headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(request, timeout=60, context=ssl.create_default_context()) as response:
        operation = json.load(response)
    if operation.get("error") or not operation.get("name"):
        raise RuntimeError("Firebase did not accept web app removal")
    name = operation["name"]
    if not name.startswith("operations/") or ".." in name or "?" in name:
        raise RuntimeError("Unexpected Firebase operation name")
    deadline = time.monotonic() + 120
    while not operation.get("done"):
        if time.monotonic() >= deadline:
            raise TimeoutError("Firebase web app removal did not finish within 120 seconds")
        time.sleep(2)
        poll = urllib.request.Request(f"https://firebase.googleapis.com/v1beta1/{name}",
                                      headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(poll, timeout=10, context=ssl.create_default_context()) as response:
            operation = json.load(response)
    if operation.get("error"):
        raise RuntimeError("Firebase web app removal operation failed")


def teardown(cli=gcloud, synthetic_cleanup=None, web_cleanup=remove_web_app):
    project = cli("projects", "describe", PROJECT)
    if (str(project.get("projectNumber")) != NUMBER
            or project.get("labels", {}).get("purpose") != "staging-verification"):
        raise RuntimeError("Staging project identity mismatch")
    errors = []
    for _ in range(2):
        for region in (REGION, "global"):
            try:
                builds = cli("builds", "list", f"--region={region}", f"--project={PROJECT}")
                for build in builds or []:
                    if build["status"] in ACTIVE:
                        try:
                            cli("builds", "cancel", build["id"], f"--region={region}", f"--project={PROJECT}")
                        except Exception as error:
                            errors.append(error)
            except Exception as error:
                errors.append(error)
    # Preserve the existing staging project. Remove the known pilot services and queues.
    scope = (f"--project={PROJECT}",)
    for group, location, allowed in (
        (("tasks", "queues"), "location", {
            "extractTrackingSegmentTask", "discoverTrackingTask", "resolveTrackingTask",
            "refreshTrackingOcrTask", "buildDataExport", "stg-auth-probe", "stg-exhaust-probe",
        }),
        (("functions",), "regions", FUNCTIONS),
        (("run", "services"), "region", {"stg-fake-worker"}),
        (("artifacts", "repositories"), "location", BUILD_REPOSITORIES),
    ):
        args = (*scope, f"--{location}={REGION}")
        try:
            names = {resource_name(resource) for resource in cli(*group, "list", *args) or []}
            delete_args = (*scope, f"--region={REGION}") if group == ("functions",) else args
            for name in sorted(names & allowed):
                try:
                    cli(*group, "delete", name, *delete_args)
                except Exception as error:
                    errors.append(error)
            remaining = {resource_name(resource) for resource in cli(*group, "list", *args) or []}
            if remaining & allowed:
                raise RuntimeError(f"Pilot resources remain: {sorted(remaining & allowed)}")
        except Exception as error:
            errors.append(error)
    source = os.environ.get("STAGING_WORKER_SOURCE")
    if source:
        try:
            if not re.fullmatch(r"gs://pitchproof-stg-pilot2_cloudbuild/scoutx-pilot/[a-f0-9]{32}", source):
                raise RuntimeError("Unexpected staging build source prefix")
            objects = cli("storage", "objects", "list", source + "/", f"--project={PROJECT}") or []
            for obj in objects:
                name = obj["name"]
                prefix = source.split("/", 3)[-1] + "/"
                if not name.startswith(prefix):
                    raise RuntimeError("Unexpected object in staging build source listing")
                cli("storage", "rm", f"gs://{PROJECT}_cloudbuild/{name}", f"--project={PROJECT}")
            if cli("storage", "objects", "list", source + "/", f"--project={PROJECT}"):
                raise RuntimeError("Staging build source objects remain")
        except Exception as error:
            errors.append(error)
    if synthetic_cleanup is not None:
        try:
            synthetic_cleanup()
        except Exception as error:
            errors.append(error)
    limit_state = os.environ.get("STAGING_LIMITS_STATE")
    marker = Path(limit_state).with_name("firestore-uid") if limit_state else None
    if marker and marker.exists():
        try:
            scope = (f"--project={PROJECT}",)
            databases = cli("firestore", "databases", "list", *scope) or []
            for database in databases:
                if database["name"].endswith("/databases/(default)"):
                    if database["uid"] != marker.read_text(encoding="utf-8"):
                        raise RuntimeError("Refusing to delete a database not created by this run")
                    cli("firestore", "databases", "delete", "--database=(default)", *scope)
            if any(db["name"].endswith("/databases/(default)")
                   for db in cli("firestore", "databases", "list", *scope) or []):
                raise RuntimeError("Pilot Firestore database is still active")
        except Exception as error:
            errors.append(error)
    try:
        web_cleanup()
    except Exception as error:
        errors.append(error)
    if errors:
        raise RuntimeError(f"Teardown encountered {len(errors)} error(s)") from errors[0]

def clean_synthetic_data():
    script = Path(__file__).with_name("clean-synthetic-data.mjs")
    subprocess.run(["node", "--use-system-ca", str(script)], timeout=180, check=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-data", action="store_true")
    args = parser.parse_args()
    teardown(synthetic_cleanup=clean_synthetic_data if args.synthetic_data else None)
