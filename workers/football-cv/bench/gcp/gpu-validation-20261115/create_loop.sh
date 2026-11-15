#!/bin/bash
# One VM at most. List before every create; stop at the first success. Backoff 5/10/20 min after a confirmed stockout.
set -uo pipefail
unset CLOUDSDK_AUTH_ACCESS_TOKEN
P=--project=scoutx-230b0
VM=pp-gpu-val-20261115
ZONES=(europe-west4-b europe-west4-c europe-west4-a europe-west1-b europe-west1-c europe-west2-a europe-west2-b europe-west3-b europe-west3-a europe-west6-b europe-west6-c)
WAITS=(300 600 1200)
START=${WINDOW_START:-$(date +%s)}; WINDOW=$((6*3600)); SKIP=${SKIP:-0}; [ -n "${INITIAL_WAIT:-}" ] && { echo "resume: waiting ${INITIAL_WAIT}s" | tee -a attempts.log; sleep "$INITIAL_WAIT"; }
A_SHA=308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f
B_SHA=4fdc0ea1bd4ac3ba66bfa4f624f48c7d17023b73301af17885be455e5f8fd90d
T_SHA=c291066783c99fd866789b4db8abce7bdd04eef25b7c76835539fe6939dfffef
C_SHA=71fd9871ecb1d74edf48dd6a5c935676bab0846cfb49d6b5fe0897e1fa91433b
n=0
for Z in "${ZONES[@]}"; do
  n=$((n+1))
  [ $n -le $SKIP ] && continue
  [ $(( $(date +%s) - START )) -lt $WINDOW ] || { echo "search window over"; echo window_over > state.txt; exit 2; }
  cnt=$(gcloud compute instances list $P --format="value(name)" | wc -l)
  if [ "$cnt" -ne 0 ]; then echo "an instance exists before attempt $n; stopping"; gcloud compute instances list $P > exists.txt; echo instance_exists > state.txt; exit 3; fi
  sed -e "s/__ZONE__/$Z/" -e "s/__VM__/$VM/" -e "s/__A_SHA__/$A_SHA/" -e "s/__B_SHA__/$B_SHA/" -e "s/__TOOL_SHA__/$T_SHA/" -e "s/__C_SHA__/$C_SHA/" startup.sh > startup-$Z.sh
  grep -q "__" startup-$Z.sh && { echo "placeholder left"; exit 4; }
  echo "attempt $n $Z $(date -u +%FT%TZ)" | tee -a attempts.log
  gcloud compute instances create "$VM" $P --zone="$Z" --machine-type=g2-standard-8 \
    --accelerator=type=nvidia-l4,count=1 --maintenance-policy=TERMINATE --provisioning-model=STANDARD \
    --image=common-cu129-ubuntu-2204-nvidia-580-v20261029 --image-project=deeplearning-platform-release \
    --boot-disk-size=200GB --boot-disk-type=pd-balanced --boot-disk-auto-delete \
    --scopes=cloud-platform --metadata=install-nvidia-driver=True --metadata-from-file=startup-script=startup-$Z.sh \
    --max-run-duration=300m --instance-termination-action=DELETE \
    --labels=purpose=pitchproof-gpu-validation,run=gpu-validation-20261115 > create-$Z.txt 2>&1
  rc=$?
  if [ $rc -eq 0 ]; then echo "$Z" > zone.txt; echo created > state.txt; echo "CREATED in $Z"; exit 0; fi
  # never create again while one may exist
  sleep 20
  cnt=$(gcloud compute instances list $P --format="value(name)" | wc -l)
  if [ "$cnt" -ne 0 ]; then echo "create rc=$rc but an instance exists"; gcloud compute instances list $P > exists.txt; echo "$Z" > zone.txt; echo ambiguous_exists > state.txt; exit 5; fi
  if grep -qE "ZONE_RESOURCE_POOL_EXHAUSTED|does not have enough resources|currently unavailable|STOCKOUT" create-$Z.txt; then
    echo "stockout $Z" | tee -a attempts.log
  else
    echo "non-stockout failure in $Z (rc=$rc); stopping for review"; tail -20 create-$Z.txt; echo failed_other > state.txt; exit 6
  fi
  [ $n -lt ${#ZONES[@]} ] || break
  i=$(( n-1 )); [ $i -lt ${#WAITS[@]} ] || i=$(( ${#WAITS[@]} - 1 ))
  echo "waiting ${WAITS[$i]}s" | tee -a attempts.log; sleep "${WAITS[$i]}"
done
echo all_stocked_out > state.txt; echo "all zones stocked out"; exit 1
