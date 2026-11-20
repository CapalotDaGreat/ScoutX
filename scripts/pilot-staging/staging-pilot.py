"""Run an already provisioned, private ScoutX staging pilot under the watchdog."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PROJECT = "pitchproof-stg-pilot2"
NUMBER = "315202089837"
FUNCTIONS_HOST = "https://europe-west6-pitchproof-stg-pilot2.cloudfunctions.net"
WORKER_HOST = "https://stg-fake-worker-315202089837.europe-west6.run.app"

def step(command):
    subprocess.run(command, cwd=ROOT, check=True)

def cloud_json(*args):
    return json.loads(subprocess.check_output(
        [sys.executable, os.environ["STAGING_GCLOUD_PY"], *args,
         "--format=json", "--quiet"], text=True, timeout=60
    ))

def verify_budget():
    accounts = cloud_json("billing", "accounts", "list")
    account, = [item["name"].split("/")[-1] for item in accounts
                if item["open"] and item["displayName"] == "Firebase Payment"]
    budget = cloud_json(
        "billing", "budgets", "describe", "f7624433-1fc9-4cc5-b11f-fa329d7bb297",
        "--billing-account=" + account, "--billing-project=" + PROJECT,
    )
    amount = budget["amount"]["specifiedAmount"]
    filters = budget["budgetFilter"]
    alerts = {entry["thresholdPercent"] for entry in budget["thresholdRules"]
              if entry["spendBasis"] == "CURRENT_SPEND"}
    if (amount["currencyCode"] != "CHF" or int(amount["units"]) != 9
            or amount.get("nanos", 0) != 0 or filters["projects"] != ["projects/" + NUMBER]
            or filters["calendarPeriod"] != "MONTH" or alerts != {0.5, 0.9, 1.0}):
        raise RuntimeError("Approved staging budget does not match the required scope and thresholds")

def load_config():
    path = Path(os.environ["STAGING_CONFIG"]).resolve()
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    expected = {
        "project": PROJECT,
        "region": "europe-west6",
        "functionsBase": FUNCTIONS_HOST,
        "workerBase": WORKER_HOST,
        "bucket": PROJECT + ".firebasestorage.app",
        "workerAuth": "operator",
    }
    if any(config.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Staging configuration does not match the approved endpoints")
    for key in ("runtimeServiceAccount", "unauthorizedServiceAccount"):
        if not config.get(key) or "<" in config[key]:
            raise RuntimeError(f"Missing staging configuration: {key}")
    return path

def operator_member():
    member = os.environ["STAGING_OPERATOR_MEMBER"]
    if member != f"serviceAccount:stg-pilot-operator@{PROJECT}.iam.gserviceaccount.com":
        raise RuntimeError("Expected the dedicated staging-only operator service account")
    return member

def deploy_private_worker():
    region = "europe-west6"
    repo = "cloud-run-source-deploy"
    cli = [sys.executable, os.environ["STAGING_GCLOUD_PY"]]
    scope = ["--project=" + PROJECT, "--quiet"]
    image = f"{region}-docker.pkg.dev/{PROJECT}/{repo}/stg-fake-worker:pilot"
    step([*cli, "artifacts", "repositories", "create", repo,
          "--repository-format=docker", "--location=" + region, *scope])
    with tempfile.TemporaryDirectory(prefix="scoutx-fake-worker-") as directory:
        context = Path(directory)
        worker = context / "scripts" / "pilot-rehearsal"
        worker.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts" / "pilot-rehearsal" / "fakeWorker.mjs",
                        worker / "fakeWorker.mjs")
        shutil.copyfile(HERE / "fake-worker" / "Dockerfile", context / "Dockerfile")
        step([*cli, "builds", "submit", str(context), "--tag=" + image,
              "--region=" + region, "--timeout=600s", *scope])
    step([*cli, "run", "deploy", "stg-fake-worker", "--image=" + image,
          "--region=" + region, "--no-allow-unauthenticated", "--min-instances=0",
          "--max-instances=1", "--timeout=210s", "--cpu=1", "--memory=512Mi", *scope])
    config = json.loads(load_config().read_text(encoding="utf-8-sig"))
    for member in (operator_member(),
                   "serviceAccount:" + config["runtimeServiceAccount"]):
        step([*cli, "run", "services", "add-iam-policy-binding", "stg-fake-worker",
              "--region=" + region, "--role=roles/run.invoker", "--member=" + member, *scope])

def provision_firebase_project():
    cli = [sys.executable, os.environ["STAGING_GCLOUD_PY"]]
    scope = ["--project=" + PROJECT, "--quiet"]
    step([*cli, "services", "enable",
          "firebase.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com",
          "firebasestorage.googleapis.com", "firebaserules.googleapis.com",
          "identitytoolkit.googleapis.com", "iamcredentials.googleapis.com",
          "cloudfunctions.googleapis.com", "run.googleapis.com", "cloudtasks.googleapis.com",
          "cloudbuild.googleapis.com", "artifactregistry.googleapis.com",
          "eventarc.googleapis.com", "pubsub.googleapis.com", "secretmanager.googleapis.com",
          "cloudscheduler.googleapis.com", *scope])
    step(["node", "--use-system-ca", os.environ["STAGING_FIREBASE_JS"],
          "projects:addfirebase", PROJECT, "--non-interactive"])
    step([*cli, "firestore", "databases", "create", "--location=europe-west6", *scope])
    step([*cli, "iam", "service-accounts", "create", "stg-no-invoker", *scope])
    step([*cli, "iam", "service-accounts", "add-iam-policy-binding",
          "stg-no-invoker@" + PROJECT + ".iam.gserviceaccount.com",
          "--role=roles/iam.serviceAccountUser",
          "--member=user:" + os.environ["STAGING_OPERATOR_EMAIL"], *scope])

def provision_auth_and_storage():
    token = subprocess.check_output(
        [sys.executable, os.environ["STAGING_GCLOUD_PY"], "auth", "print-access-token", "--quiet"],
        text=True, timeout=60
    ).strip()

    def request(method, url, body=None):
        payload = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=payload, method=method, headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "x-goog-user-project": PROJECT,
        })
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
        return json.loads(data) if data else None

    identity = "https://identitytoolkit.googleapis.com"
    request("POST", f"{identity}/v2/projects/{PROJECT}/identityPlatform:initializeAuth")
    config_url = f"{identity}/admin/v2/projects/{PROJECT}/config"
    request("PATCH", config_url + "?updateMask=signIn.email",
            {"signIn": {"email": {"enabled": True, "passwordRequired": True}}})
    email = request("GET", config_url)["signIn"]["email"]
    if not email.get("enabled") or not email.get("passwordRequired"):
        raise RuntimeError("Firebase email/password sign-in was not enabled")
    bucket = request("POST",
                     f"https://firebasestorage.googleapis.com/v1alpha/projects/{PROJECT}/defaultBucket",
                     {"location": "europe-west6"})
    if bucket["name"].split("/")[-1] != PROJECT + ".firebasestorage.app":
        raise RuntimeError("Firebase returned an unexpected default bucket")

def provision_runtime_iam():
    cli = [sys.executable, os.environ["STAGING_GCLOUD_PY"]]
    config = json.loads(load_config().read_text(encoding="utf-8-sig"))
    runtime = config["runtimeServiceAccount"]
    if runtime != NUMBER + "-compute@developer.gserviceaccount.com":
        raise RuntimeError("Unexpected staging runtime identity")
    for role in ("roles/datastore.user", "roles/cloudtasks.enqueuer",
                 "roles/eventarc.eventReceiver", "roles/logging.logWriter"):
        step([*cli, "projects", "add-iam-policy-binding", PROJECT,
              "--member=serviceAccount:" + runtime, "--role=" + role, "--quiet"])

def provision_web_app():
    command = ["node", "--use-system-ca", os.environ["STAGING_FIREBASE_JS"]]
    options = ["--project", PROJECT, "--non-interactive", "--json"]
    created = json.loads(subprocess.check_output(
        [*command, "apps:create", "WEB", "ScoutX private pilot", *options],
        cwd=ROOT, text=True, timeout=90
    ))
    app_id = created["result"]["appId"]
    # Persist the ID before retrieving SDK config so teardown can see a partial setup.
    path = Path(os.environ["STAGING_CONFIG"])
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    config["pilotWebAppId"] = app_id
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    reply = json.loads(subprocess.check_output(
        [*command, "apps:sdkconfig", "WEB", app_id, *options],
        cwd=ROOT, text=True, timeout=60
    ))
    config["apiKey"] = reply["result"]["sdkConfig"]["apiKey"]
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")

def provision_probe_queues():
    cli = [sys.executable, os.environ["STAGING_GCLOUD_PY"]]
    for queue, attempts in (("stg-auth-probe", 1), ("stg-exhaust-probe", 2)):
        step([*cli, "tasks", "queues", "create", queue, "--project=" + PROJECT,
              "--location=europe-west6", f"--max-attempts={attempts}",
              "--max-concurrent-dispatches=1", "--max-dispatches-per-second=1",
              "--min-backoff=30s", "--log-sampling-ratio=1.0", "--quiet"])

def deploy():
    config_env = ROOT / "functions" / (".env." + PROJECT)
    if not config_env.is_file():
        raise RuntimeError("Staging-only Functions environment has not been provisioned")
    project = cloud_json("projects", "describe", PROJECT)
    if str(project["projectNumber"]) != NUMBER or project["labels"].get("purpose") != "staging-verification":
        raise RuntimeError("Staging identity mismatch")
    billing = cloud_json("billing", "projects", "describe", PROJECT)
    if billing.get("billingEnabled") is not True:
        raise RuntimeError("Billing operator has not linked the staging project")
    provision_firebase_project()
    provision_auth_and_storage()
    provision_runtime_iam()
    provision_web_app()
    provision_probe_queues()
    deploy_private_worker()
    functions = (
        "startPlayerAnalysis,answerTrackingQuestion,undoTrackingAnswer,"
        "cancelMatchAnalysis,explainTrackingMoment,getMediaPlaybackUrl,requestDataExport,"
        "buildDataExport,extractTrackingSegmentTask,discoverTrackingTask,resolveTrackingTask,"
        "refreshTrackingOcrTask,onMatchJobMediaLifecycle,onMatchJobDeleted,mediaLifecycleSweep"
    )
    targets = "firestore:rules,firestore:indexes,storage," + ",".join(
        "functions:" + name for name in functions.split(",")
    )
    step(["node", "--use-system-ca", os.environ["STAGING_FIREBASE_JS"], "deploy",
          "--project", PROJECT, "--only", targets, "--non-interactive"])
    path = load_config()
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    config["callableUrls"] = {}
    for name in ("startPlayerAnalysis", "getMediaPlaybackUrl", "requestDataExport"):
        service = cloud_json("functions", "describe", name, "--gen2",
                             "--region=europe-west6", "--project=" + PROJECT)
        url = service["serviceConfig"]["uri"]
        if not url.startswith("https://") or not url.endswith(".run.app"):
            raise RuntimeError("Expected a private Cloud Run service URL")
        config["callableUrls"][name] = url
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")


def tests():
    output = Path(os.environ["STAGING_EVIDENCE_DIR"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    for script, args in (
        ("private-smoke.mjs", []),
        ("probe-tasks.mjs", [str(output / "tasks.json")]),
        ("image-revocation.mjs", [str(output / "images.json")]),
    ):
        step(["node", "--use-system-ca", str(HERE / script), *args])

def main():
    os.environ["STAGING_CONFIG"] = str(load_config())
    phase = sys.argv[1] if len(sys.argv) > 1 else None
    if phase == "deploy":
        deploy()
    elif phase == "test":
        tests()
    elif phase is None:
        with tempfile.TemporaryDirectory(prefix="scoutx-staging-") as directory:
            os.environ["STAGING_LIMITS_STATE"] = str(Path(directory) / "limits.json")
            plan = Path(directory) / "plan.json"
            plan.write_text(json.dumps({
                "project": PROJECT,
                "deploy": {"argv": [sys.executable, __file__, "deploy"], "seconds": 1800},
                "test": {"argv": [sys.executable, __file__, "test"], "seconds": 5400},
            }), encoding="utf-8")
            step([sys.executable, str(HERE / "run-bounded-pilot.py"), str(plan)])
    else:
        raise RuntimeError("Unknown pilot phase")

if __name__ == "__main__":
    main()
