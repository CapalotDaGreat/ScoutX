#!/bin/bash
set -u
cd /data/ScoutX
OUT=/data/out
GS=gs://scoutx-230b0-benchmarks/results/l4-20261029-netherlands
stamp() { python3 -c 'import json,sys,datetime,pathlib; p=pathlib.Path("/data/out/recovery_timestamps.json"); d=json.loads(p.read_text()) if p.exists() else {}; d[sys.argv[1]]=datetime.datetime.now(datetime.timezone.utc).isoformat(); p.write_text(json.dumps(d,indent=2))' "$1"; }
status() { echo "$1" > $OUT/STATUS; gcloud storage cp $OUT/STATUS $GS/STATUS >/dev/null 2>&1; }
export SKIP_GPU_BUILD=1 PRICES=/out/prices.json CHUNK_SEC=300
stamp compilerReady
status gpu_retry_after_compiler_fix
stamp gpuRetryStarted
BENCH_TIMEOUT_SEC=5400 bash workers/football-cv/bench/run_gpu_match.sh /data/videos/IMG_4809_proxy_10fps.mp4 $OUT/gpu
rc=$?; echo $rc > $OUT/gpu_retry_exit.txt; stamp gpuRetryFinished
if [ $rc != 0 ] && [ $rc != 3 ]; then status gpu_retry_failed; exit $rc; fi
# Retain the original VM deadline and leave 15 minutes for upload and verified deletion.
BUDGET=$(( $(date -d '2026-10-29T19:41:00Z' +%s) - $(date +%s) ))
if [ $BUDGET -gt 1200 ]; then
 status "cpu_reference_after_compiler_fix budget ${BUDGET}s"; stamp cpuRetryStarted
 CPU_REFERENCE=1 BENCH_TIMEOUT_SEC=$BUDGET bash workers/football-cv/bench/run_gpu_match.sh /data/videos/IMG_4809_proxy_10fps.mp4 $OUT/cpu
 echo $? > $OUT/cpu_retry_exit.txt; stamp cpuRetryFinished
fi
status recovery_runs_finished
echo finish | gcloud storage cp - $GS/control/next
kill -CONT 1108
