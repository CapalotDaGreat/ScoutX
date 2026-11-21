"""Build and retire a single untagged ScoutX staging worker image."""
import json
import re
import time
import urllib.error
import urllib.request
from urllib.parse import quote

PROJECT = "pitchproof-stg-pilot2"
REGION = "europe-west6"
REPOSITORY = "scoutx-pilot-images"
PACKAGE = "stg-fake-worker"
HOST = f"{REGION}-docker.pkg.dev"
IMAGE = f"{HOST}/{PROJECT}/{REPOSITORY}/{PACKAGE}"
API = "https://artifactregistry.googleapis.com/v1/"


def validate(image):
    if not image.startswith(IMAGE + "@") or not re.fullmatch(r"sha256:[a-f0-9]{64}", image.removeprefix(IMAGE + "@")):
        raise RuntimeError("Expected a tagless worker digest in the dedicated staging repository")
    return image


def verify_run_id(run_id):
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise RuntimeError("Expected the staging run UUID")
    return run_id


def source_prefix(run_id):
    return f"gs://{PROJECT}_cloudbuild/scoutx-pilot/{verify_run_id(run_id)}"


def build_config(run_id):
    verify_run_id(run_id)
    # Cloud Build shares /builder/home between steps. Keep the registry
    # credential outside /workspace so Docker never receives it as build input.
    auth = (
        "import base64,json,pathlib,subprocess;"
        "d=pathlib.Path('/builder/home/.docker');d.mkdir(exist_ok=True);"
        "t=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip();"
        "a=base64.b64encode(('oauth2accesstoken:'+t).encode()).decode();"
        f"(d/'config.json').write_text(json.dumps({{'auths':{{'{HOST}':{{'auth':a}}}}}}))"
    )
    return {
        "timeout": "600s",
        "steps": [
            {"name": "gcr.io/google.com/cloudsdktool/cloud-sdk:slim", "entrypoint": "python3",
             "args": ["-c", auth]},
            {"name": "docker:27.5.1-cli", "entrypoint": "sh",
             "env": ["DOCKER_CONFIG=/builder/home/.docker"],
             "args": ["-ec", '\n'.join((
                 "docker buildx create --driver docker-container --use",
                 "docker buildx build --platform linux/amd64 --provenance=false --sbom=false "
                 f"--label org.scoutx.pilot-run={run_id} "
                 f"--output type=image,name={IMAGE},push=true,push-by-digest=true,name-canonical=true "
                 "--metadata-file /workspace/scoutx-build-metadata.json /workspace",
             ))]},
            {"name": "gcr.io/google.com/cloudsdktool/cloud-sdk:slim", "entrypoint": "python3",
             "args": ["-c", "import json;print('SCOUTX_WORKER_DIGEST='+json.load(open('/workspace/scoutx-build-metadata.json'))['containerimage.digest'])"]},
        ],
    }


def from_build_log(log):
    digests = set(re.findall(r"(?m)^(?:Step #[0-9]+: )?SCOUTX_WORKER_DIGEST=(sha256:[a-f0-9]{64})\r?$", log))
    if len(digests) != 1:
        raise RuntimeError("Cloud Build did not report exactly one worker digest")
    return validate(IMAGE + "@" + digests.pop())


def version_url(image):
    digest = validate(image).rsplit("@", 1)[1]
    return API + f"projects/{PROJECT}/locations/{REGION}/repositories/{REPOSITORY}/packages/{PACKAGE}/versions/{quote(digest, safe='')}"


def request_json(url, token, method="GET"):
    request = urllib.request.Request(url, method=method, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=30) as reply:
        return json.load(reply)


def delete_version(image, token, *, request=request_json, sleep=time.sleep):
    url = version_url(image)
    try:
        request(url, token)
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
    else:
        # Leave force unset. An unexpected tag must make deletion fail.
        operation = request(url, token, "DELETE")
        name = operation["name"]
        if not re.fullmatch(rf"projects/(?:{PROJECT}|315202089837)/locations/{REGION}/operations/[a-zA-Z0-9_-]+", name):
            raise RuntimeError("Unexpected staging image deletion operation name")
        for _ in range(30):
            if operation.get("done"):
                break
            sleep(2)
            operation = request(API + name, token)
        if not operation.get("done") or operation.get("error"):
            raise RuntimeError("Staging image deletion did not complete successfully")
        try:
            request(url, token)
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
        else:
            raise RuntimeError("Worker image version still exists after deletion")
    print(f"Verified HTTP 404: {url}", flush=True)
