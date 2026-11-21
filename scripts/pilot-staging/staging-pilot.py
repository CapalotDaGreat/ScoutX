"""Run an already provisioned, private ScoutX staging pilot under the watchdog."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import uuid
import urllib.request

import artifact_repository

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
         "--format=json", "--quiet"], text=True, timeout=60, stderr=subprocess.PIPE
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
    artifact_repository.ensure(cloud_json, repo, "--location=" + region, "--project=" + PROJECT)
    build_member = "serviceAccount:" + NUMBER + "-compute@developer.gserviceaccount.com"
    step([*cli, "artifacts", "repositories", "add-iam-policy-binding", repo,
          "--location=" + region, "--member=" + build_member,
          "--role=roles/artifactregistry.writer", *scope])

    with tempfile.TemporaryDirectory(prefix="scoutx-fake-worker-") as directory:
        context = Path(directory)
        worker = context / "scripts" / "pilot-rehearsal"
        worker.mkdir(parents=True)
        shutil.copyfile(ROOT / "scripts" / "pilot-rehearsal" / "fakeWorker.mjs",
                        worker / "fakeWorker.mjs")
        shutil.copyfile(HERE / "fake-worker" / "Dockerfile", context / "Dockerfile")
        step([*cli, "builds", "submit", str(context), "--tag=" + image,
              "--region=" + region, "--timeout=600s",
              "--gcs-source-staging-dir=" + os.environ["STAGING_WORKER_SOURCE"], *scope])
    step([*cli, "run", "deploy", "stg-fake-worker", "--image=" + image,
          "--region=" + region, "--invoker-iam-check", "--min-instances=0",
          "--max-instances=1", "--timeout=210s", "--cpu=1", "--memory=512Mi", *scope])
WORKER = "stg-fake-worker"
WORKER_SCOPE = ("--region=europe-west6", "--project=" + PROJECT)
WORKER_IMAGE = f"europe-west6-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy/{WORKER}:pilot"
WORKER_INVOKERS = frozenset({
    f"serviceAccount:stg-pilot-operator@{PROJECT}.iam.gserviceaccount.com",
    f"serviceAccount:{NUMBER}-compute@developer.gserviceaccount.com",
})


def read_worker():
    try:
        worker = cloud_json("run", "services", "describe", WORKER, *WORKER_SCOPE)
    except subprocess.CalledProcessError as error:
        if artifact_repository.resource_absent(error.stderr):
            raise RuntimeError(f"Private staging worker is missing: {WORKER}") from error
        raise
    metadata = worker["metadata"]
    status = worker["status"]
    annotations = metadata.get("annotations", {})
    template = worker["spec"]["template"]["spec"]
    containers = template.get("containers", [])
    images = [container.get("image", "") for container in containers]
    expected_image = WORKER_IMAGE.rsplit(":", 1)[0]
    if (metadata.get("name") != WORKER
            or not any(c.get("type") == "Ready" and c.get("status") == "True"
                       for c in status.get("conditions", []))
            or annotations.get("run.googleapis.com/invoker-iam-disabled") == "true"
            or len(images) != 1
            or not (images[0] == WORKER_IMAGE or images[0].startswith(expected_image + "@sha256:"))):
        raise RuntimeError("Private staging worker is not ready or does not match the pilot deployment")
    return worker


def read_worker_bindings():
    policy = cloud_json("run", "services", "get-iam-policy", WORKER, *WORKER_SCOPE)
    bindings = policy.get("bindings", [])
    if any(b.get("role") != "roles/run.invoker" or b.get("condition") for b in bindings):
        raise RuntimeError("Unexpected service-level IAM on staging worker")
    return {member for binding in bindings for member in binding.get("members", [])}


def verify_private_worker():
    read_worker()
    if read_worker_bindings() != WORKER_INVOKERS:
        raise RuntimeError("Private staging worker invoker binding does not exactly match the pilot callers")


def apply_worker_invokers():
    read_worker()
    current = read_worker_bindings()
    if current - WORKER_INVOKERS:
        raise RuntimeError("Refusing to change worker IAM with unexpected invokers")
    for member in sorted(WORKER_INVOKERS - current):
        cloud_json("run", "services", "add-iam-policy-binding", WORKER, *WORKER_SCOPE,
                   "--member=" + member, "--role=roles/run.invoker")
    verify_private_worker()


def provision_firebase_project():
    cli = [sys.executable, os.environ["STAGING_GCLOUD_PY"]]
    scope = ["--project=" + PROJECT, "--quiet"]
    step([*cli, "firestore", "databases", "create", "--location=europe-west6", *scope])
    db = cloud_json("firestore", "databases", "describe", "--database=(default)", "--project=" + PROJECT)
    Path(os.environ["STAGING_LIMITS_STATE"]).with_name("firestore-uid").write_text(db["uid"], encoding="utf-8")


def verify_probe_account():
    expected = f"stg-no-invoker@{PROJECT}.iam.gserviceaccount.com"
    config = json.loads(load_config().read_text(encoding="utf-8-sig"))
    if config.get("unauthorizedServiceAccount") != expected:
        raise RuntimeError("Unexpected probe identity")
    probe = cloud_json("iam", "service-accounts", "describe", expected, "--project=" + PROJECT)
    if probe.get("email") != expected or probe.get("disabled"):
        raise RuntimeError("Staging probe account is missing or disabled")


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
    config_url = f"{identity}/admin/v2/projects/{PROJECT}/config"
    try:
        request("GET", config_url)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        request("POST", f"{identity}/v2/projects/{PROJECT}/identityPlatform:initializeAuth")
    request("PATCH", config_url + "?updateMask=signIn.email",
            {"signIn": {"email": {"enabled": True, "passwordRequired": True}}})
    email = request("GET", config_url)["signIn"]["email"]
    if not email.get("enabled") or not email.get("passwordRequired"):
        raise RuntimeError("Firebase email/password sign-in was not enabled")
    bucket = request("POST",
                     f"https://firebasestorage.googleapis.com/v1alpha/projects/{PROJECT}/defaultBucket",
                     {"location": "europe-west6"})
    if bucket.get("bucket", {}).get("name", bucket["name"]).split("/")[-1] != PROJECT + ".firebasestorage.app":
        raise RuntimeError("Firebase returned an unexpected default bucket")

def verify_runtime_iam():
    config = json.loads(load_config().read_text(encoding="utf-8-sig"))
    runtime = config["runtimeServiceAccount"]
    if runtime != NUMBER + "-compute@developer.gserviceaccount.com":
        raise RuntimeError("Unexpected staging runtime identity")
    account = cloud_json("iam", "service-accounts", "describe", runtime, "--project=" + PROJECT)
    if account.get("email") != runtime or account.get("disabled"):
        raise RuntimeError("Staging runtime account is missing or disabled")
    policy = cloud_json("projects", "get-iam-policy", PROJECT)
    granted = {binding["role"] for binding in policy.get("bindings", [])
               if not binding.get("condition")
               and "serviceAccount:" + runtime in binding.get("members", [])}
    required = {"roles/datastore.user", "roles/cloudtasks.enqueuer",
                "roles/eventarc.eventReceiver", "roles/logging.logWriter"}
    if required - granted:
        raise RuntimeError(f"Missing staging runtime roles: {sorted(required - granted)}")

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
    path = load_config()
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    suffix = uuid.uuid4().hex
    auth = config["authProbeQueue"] = f"stg-auth-probe-{suffix}"
    exhaust = config["exhaustProbeQueue"] = f"stg-exhaust-probe-{suffix}"
    # Record both names before creating either queue so partial setup can be cleaned.
    path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    for queue, attempts in ((auth, 1), (exhaust, 2)):
        step([*cli, "tasks", "queues", "create", queue, "--project=" + PROJECT,
              "--location=europe-west6", f"--max-attempts={attempts}",
              "--max-concurrent-dispatches=1", "--max-dispatches-per-second=1",
              "--min-backoff=30s", "--log-sampling-ratio=1.0", "--quiet"])

def deploy():
    verify_private_worker()
    config_env = ROOT / "functions" / (".env." + PROJECT)
    if not config_env.is_file():
        raise RuntimeError("Staging-only Functions environment has not been provisioned")
    project = cloud_json("projects", "describe", PROJECT)
    if str(project["projectNumber"]) != NUMBER or project["labels"].get("purpose") != "staging-verification":
        raise RuntimeError("Staging identity mismatch")
    billing = cloud_json("billing", "projects", "describe", PROJECT)
    if billing.get("billingEnabled") is not True:
        raise RuntimeError("Billing operator has not linked the staging project")
    verify_runtime_iam()
    verify_probe_account()
    provision_firebase_project()
    provision_auth_and_storage()
    provision_web_app()
    provision_probe_queues()
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
    phase = sys.argv[1] if len(sys.argv) > 1 else "watchdog"
    if phase == "provision-worker":
        scope = f"gs://{PROJECT}_cloudbuild/scoutx-pilot/"
        source = os.environ["STAGING_WORKER_SOURCE"]
        if not source.startswith(scope) or len(source.removeprefix(scope)) != 32 or any(c not in "0123456789abcdef" for c in source.removeprefix(scope)):
            raise RuntimeError("Expected the staging controller's run-specific worker source prefix")
        deploy_private_worker()
    elif phase == "apply-worker-invokers":
        apply_worker_invokers()
    elif phase == "deploy":
        os.environ["STAGING_CONFIG"] = str(load_config())
        deploy()
    elif phase == "test":
        os.environ["STAGING_CONFIG"] = str(load_config())
        tests()
    elif phase == "watchdog":
        os.environ["STAGING_CONFIG"] = str(load_config())
        verify_private_worker()
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
