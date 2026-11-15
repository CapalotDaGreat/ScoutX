#!/bin/bash
set -uo pipefail
unset CLOUDSDK_AUTH_ACCESS_TOKEN
P=--project=scoutx-230b0; R=gs://scoutx-230b0-benchmarks/runs/gpu-validation-20261115
until [ -f state.txt ]; do sleep 5; done
s=$(cat state.txt); [ "$s" = created ] || [ "$s" = ambiguous_exists ] || { echo "no VM ($s); nothing uploaded"; exit 0; }
cnt=$(gcloud compute instances list $P --format="value(name)" | wc -l); [ "$cnt" -eq 1 ] || { echo "instances=$cnt; not uploading"; exit 1; }
date -u +%FT%TZ > upload_start.txt
for f in part-a-source.tar part-b-source.tar part-c-source.tar interval_profile_eval.py; do gcloud storage cp "$f" "$R/$f" $P || exit 2; done
gcloud storage cp /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 "$R/IMG_4809_proxy_10fps.mp4" $P || exit 3
date -u +%FT%TZ > upload_done.txt; echo uploaded
