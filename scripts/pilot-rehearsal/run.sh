#!/usr/bin/env bash
# Pilot rollback rehearsal: Auth + Firestore + Storage + Functions + Cloud Tasks emulators, demo project only
# (no credentials, no production resources). Usage: scripts/pilot-rehearsal/run.sh [out.json] [phases]
#   FIREBASE_BIN   firebase-tools binary (>= 13 with the Cloud Tasks emulator)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/rehearsal-evidence.json}"
PHASES="${2:-gate,rollback,race,r4,r1,r2legacy,legacy,cleanup,r3}"
PROJECT=demo-pilot-reh
FIREBASE_BIN="${FIREBASE_BIN:-npx firebase}"
VERSION=football-cv/0.7.0-reh
MODELS='{"detector":"yolox-reh","ocr":"parseq-reh"}'
LOGDIR="${REHEARSAL_LOGDIR:-$ROOT/.rehearsal-logs}"
mkdir -p "$LOGDIR"
cd "$ROOT"

# No real credentials or proxies reach the emulators or the functions.
unset GOOGLE_APPLICATION_CREDENTIALS CLOUDSDK_AUTH_ACCESS_TOKEN JAVA_TOOL_OPTIONS GLOBAL_AGENT_HTTPS_PROXY GLOBAL_AGENT_HTTP_PROXY NODE_OPTIONS
# No egress at all: without proxies the sandbox has no route out, so every call must stay on 127.0.0.1.
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy
export NO_PROXY="*" no_proxy="*"
# Hide any gcloud application-default credentials from firebase-tools and the functions runtime.
export CLOUDSDK_CONFIG="$(mktemp -d)"

# Rehearsal-only functions entry: the real compiled functions (functions/lib) plus the emulator-only CV approval seam.
ENTRY=functions/rehearsal-entry
rm -rf "$ENTRY"; mkdir -p "$ENTRY"
node -e 'const p=require("./functions/package.json");console.log(JSON.stringify({name:"pilot-rehearsal-entry",private:true,main:"index.js",engines:p.engines,dependencies:{"firebase-admin":p.dependencies["firebase-admin"],"firebase-functions":p.dependencies["firebase-functions"]}}))' > "$ENTRY/package.json"
cat > "$ENTRY/index.js" <<'JS'
// Emulator only: setEmulatorCvApproval is ignored outside the emulators (cvConfig.ts).
const cv = require('../lib/analysis/cvConfig');
if (process.env.FUNCTIONS_EMULATOR === 'true') cv.setEmulatorCvApproval(JSON.parse(process.env.REHEARSAL_CV_APPROVAL));
module.exports = require('../lib/index');
JS
cat > "$ENTRY/.env.local" <<ENV
TRACKING_V3_ENABLED=true
CV_WORKER_URL=http://127.0.0.1:8790
CV_WORKER_APPROVED=true
OPENROUTER_BASE_URL=http://127.0.0.1:8791/api/v1
REHEARSAL_CV_APPROVAL={"workerVersion":"$VERSION","models":$MODELS,"eventsApproved":false}
ENV
t() { echo "reh-$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')"; }
cat > "$ENTRY/.secret.local" <<SEC
GUARDIAN_LINK_SECRET=$(t)
APPLE_TEAM_ID=rehearsal-unused
APPLE_KEY_ID=rehearsal-unused
APPLE_PRIVATE_KEY=rehearsal-unused
ADMIN_USER_IDS=
REVENUECAT_WEBHOOK_SECRET=$(t)
SEC
cat > firebase.rehearsal.json <<JSON
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "storage": { "rules": "storage.rules" },
  "functions": [{ "source": "$ENTRY", "codebase": "default" }],
  "emulators": { "auth": { "port": 9099 }, "firestore": { "port": 8080 }, "storage": { "port": 9199 },
    "functions": { "port": 5001 }, "tasks": { "port": 9499 }, "ui": { "enabled": false }, "singleProjectMode": true }
}
JSON

FAKE_WORKER_VERSION="$VERSION" FAKE_WORKER_MODELS="$MODELS" node scripts/pilot-rehearsal/fakeWorker.mjs > "$LOGDIR/worker.log" 2>&1 &
WPID=$!
node scripts/pilot-rehearsal/providerSink.mjs > "$LOGDIR/sink.log" 2>&1 &
SPID=$!
cleanup() { kill $WPID $SPID 2>/dev/null; rm -rf "$ENTRY" firebase.rehearsal.json; }
trap cleanup EXIT
sleep 1

COMMIT="$(git rev-parse HEAD)$(git diff --quiet HEAD -- functions/src functions/lib || echo '+dirty')"
REHEARSAL_COMMIT="$COMMIT" REHEARSAL_OUT="$OUT" STAGING_CONFIG="${STAGING_CONFIG:-}" REHEARSAL_PHASES="$PHASES" FAKE_WORKER_VERSION="$VERSION" \
  $FIREBASE_BIN emulators:exec --config firebase.rehearsal.json --project "$PROJECT" --only auth,firestore,storage,functions,tasks \
  "node ${REHEARSAL_DRIVER:-scripts/pilot-rehearsal/rehearse.mjs}" > "$LOGDIR/emulators.log" 2>&1
RC=$?
cp firebase-debug.log "$LOGDIR/firebase-debug.log" 2>/dev/null || true
echo "rehearsal exit=$RC evidence=$OUT logs=$LOGDIR"
exit $RC
