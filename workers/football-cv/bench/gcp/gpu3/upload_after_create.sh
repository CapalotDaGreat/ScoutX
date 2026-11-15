#!/bin/bash
# Run by the operator only after gpu_search.py reports vm_created. Uploads the hash-pinned inputs for the session.
set -uo pipefail
unset CLOUDSDK_AUTH_ACCESS_TOKEN
cd "$(dirname "$0")"; P=--project=scoutx-230b0; R=gs://scoutx-230b0-benchmarks/runs/gpu-validation-gpu3
python3 -c "import json,sys; s=json.load(open('state.json')); sys.exit(0 if s['outcome']=='vm_created' else 1)" || { echo "no VM; nothing uploaded"; exit 1; }
[ "$(gcloud compute instances list $P --format='value(name)' | wc -l)" -eq 1 ] || { echo "not exactly one VM; not uploading"; exit 1; }
sha256sum -c inputs.sha256 || exit 2
date -u +%FT%TZ > upload_start.txt
for f in part-a-source.tar part-b-source.tar part-c-source.tar interval_profile_eval.py; do gcloud storage cp "$f" "$R/$f" $P || exit 3; done
gcloud storage cp /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 "$R/IMG_4809_proxy_10fps.mp4" $P || exit 4
date -u +%FT%TZ > upload_done.txt; echo uploaded
