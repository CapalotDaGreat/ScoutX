#!/bin/bash
# Combined Part A (pinned FP32 matrix at 51d41c9) then Part B (release tip GPU worker).
# Each part builds its own image tagged with its commit, uses its own out dir and OCR cache,
# and refuses a commit mismatch. On any failure the script still exports what exists and
# the VM deletes itself. NOT DEPLOYED. Dry-run: SCOUTX_DRY_RUN=1 skips GPU/image-build work.
set -Eeuo pipefail
test ! -f /var/pitchproof-gpu-validation-started || exit 0
touch /var/pitchproof-gpu-validation-started

PROJECT="${PROJECT:-scoutx-230b0}"
ZONE="${ZONE:-europe-west4-b}"
VM="${VM:-pitchproof-gpu-validation-20261106}"
GS="${GS:-gs://scoutx-230b0-benchmarks/results/gpu-validation-20261106}"
RUNS_GS="${RUNS_GS:-gs://scoutx-230b0-benchmarks/runs/gpu-validation-20261106}"
PART_A_COMMIT="${PART_A_COMMIT:-51d41c9f5f333c7e93a606b7181ba8cb1cee8eac}"
PART_A_ARCHIVE_SHA="${PART_A_ARCHIVE_SHA:-308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f}"
PART_B_COMMIT="${PART_B_COMMIT:?PART_B_COMMIT must be set to the frozen release tip}"
PART_B_ARCHIVE_SHA="${PART_B_ARCHIVE_SHA:?PART_B_ARCHIVE_SHA must be set}"
VIDEO_SHA="${VIDEO_SHA:-b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c}"
# Timeouts (seconds). Together they must fit under the approved VM lifetime with export margin.
GUEST_SHUTDOWN_MIN="${GUEST_SHUTDOWN_MIN:-290}"
PART_A_BUDGET_SEC="${PART_A_BUDGET_SEC:-5400}"
PART_B_FULL_BUDGET_SEC="${PART_B_FULL_BUDGET_SEC:-7200}"
PART_B_INTERVALS_BUDGET_SEC="${PART_B_INTERVALS_BUDGET_SEC:-3600}"
DRY_RUN="${SCOUTX_DRY_RUN:-0}"

mkdir -p /data/out /data/export /data/videos /data/src-a /data/src-b /data/provenance /data/models
OUT=/data/out
exec > >(tee -a /var/log/pitchproof-gpu-validation.log) 2>&1

if [ "$DRY_RUN" != "1" ]; then
  shutdown -h "+${GUEST_SHUTDOWN_MIN}" 'approved PitchProof GPU validation safeguard' || true
fi

stamp() { date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/$1.txt"; }
phase() { echo "$1" | tee "$OUT/STATUS"; if [ "$DRY_RUN" != "1" ]; then gcloud storage cp "$OUT/STATUS" "$GS/STATUS" --project="$PROJECT" || true; fi; }

sample_host_mem() {
  # cgroup v1 or v2 high-water for the docker session container
  if [ -f /sys/fs/cgroup/memory/memory.max_usage_in_bytes ]; then
    cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes
  elif [ -f /sys/fs/cgroup/memory.peak ]; then
    cat /sys/fs/cgroup/memory.peak
  else
    awk '/MemTotal/ {t=$2} /MemAvailable/ {a=$2} END {print (t-a)*1024}' /proc/meminfo
  fi
}

export_numeric() {
  cp /var/log/pitchproof-gpu-validation.log "$OUT/run.log" || true
  OUT="$OUT" python3 - <<'PY'
import os, pathlib, shutil, hashlib, json, datetime
src = pathlib.Path(os.environ["OUT"]); dst = pathlib.Path("/data/export"); items = []
allowed = {".json", ".npz", ".npy", ".log", ".txt", ".sh", ".csv"}
for p in src.rglob("*"):
    if not p.is_file() or p.suffix.lower() not in allowed:
        continue
    q = dst / p.relative_to(src)
    q.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, q)
    items.append({"file": q.relative_to(dst).as_posix(), "bytes": q.stat().st_size,
                  "sha256": hashlib.sha256(q.read_bytes()).hexdigest()})
(dst / "export_manifest.json").write_text(json.dumps({
    "timestampUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "files": items, "mediaExcluded": True}, indent=2))
PY
  if [ "$DRY_RUN" != "1" ]; then
    gcloud storage rsync /data/export "$GS" --recursive --project="$PROJECT"
  else
    mkdir -p /data/export-dry
    cp -a /data/export/. /data/export-dry/ 2>/dev/null || true
  fi
}

finish() {
  rc=$?
  trap - EXIT
  set +e
  test -z "${SYNC_PID:-}" || kill "$SYNC_PID" 2>/dev/null
  docker rm -f pitchproof-part-a pitchproof-part-b >/dev/null 2>&1
  stamp finished
  echo "$rc" > "$OUT/startup_exit.txt"
  nvidia-smi > "$OUT/nvidia-smi-final.txt" 2>&1 || true
  if ( flock -w 120 9 && export_numeric ) 9>/data/export.lock; then
    if [ "$DRY_RUN" != "1" ]; then
      printf '{"exportComplete":true,"startupExit":%s,"dryRun":false}\n' "$rc" | gcloud storage cp - "$GS/_DONE" --project="$PROJECT"
    else
      printf '{"exportComplete":true,"startupExit":%s,"dryRun":true}\n' "$rc" > /data/export/_DONE
      cp /data/export/_DONE "$OUT/_DONE"
    fi
  fi
  if [ "$DRY_RUN" != "1" ]; then
    gcloud compute instances delete "$VM" --zone="$ZONE" --project="$PROJECT" --quiet || shutdown -h now
  fi
}
trap finish EXIT

stamp vmBooted
phase booting
printf '%s\n' "$PART_A_COMMIT" > "$OUT/part_a_commit.txt"
printf '%s\n' "$PART_B_COMMIT" > "$OUT/part_b_commit.txt"

if [ "$DRY_RUN" != "1" ]; then
  ( while sleep 120; do (flock -n 9 && export_numeric) 9>/data/export.lock || true; done ) &
  SYNC_PID=$!
  for i in $(seq 1 120); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
  nvidia-smi > "$OUT/nvidia-smi-initial.txt"
  driver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
  test "${driver%%.*}" -ge 580
  stamp gpuReady
  command -v docker >/dev/null || { curl -fsSL https://get.docker.com -o /data/install-docker.sh; sh /data/install-docker.sh; }
  if ! docker info 2>/dev/null | grep -qi nvidia; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
  fi
  gcloud storage cp "$RUNS_GS/part-a-source.tar" /data/part-a-source.tar --project="$PROJECT"
  echo "${PART_A_ARCHIVE_SHA}  /data/part-a-source.tar" | sha256sum -c -
  tar -xf /data/part-a-source.tar -C /data/src-a --strip-components=2
  gcloud storage cp "$RUNS_GS/part-b-source.tar" /data/part-b-source.tar --project="$PROJECT"
  echo "${PART_B_ARCHIVE_SHA}  /data/part-b-source.tar" | sha256sum -c -
  tar -xf /data/part-b-source.tar -C /data/src-b --strip-components=2
  phase waiting_for_video
  VGS="$RUNS_GS/IMG_4809_proxy_10fps.mp4"
  for i in $(seq 1 40); do gcloud storage objects describe "$VGS" --project="$PROJECT" >/dev/null 2>&1 && break; sleep 30; done
  gcloud storage cp "$VGS" /data/videos/IMG_4809_proxy_10fps.mp4 --project="$PROJECT"
  echo "${VIDEO_SHA}  /data/videos/IMG_4809_proxy_10fps.mp4" | sha256sum -c -
else
  stamp gpuReady
  # Dry run: tiny local fixtures already mounted under /data
  test -f /data/part-a-source.tar
  echo "${PART_A_ARCHIVE_SHA}  /data/part-a-source.tar" | sha256sum -c -
  tar -xf /data/part-a-source.tar -C /data/src-a --strip-components=2
  test -f /data/part-b-source.tar
  echo "${PART_B_ARCHIVE_SHA}  /data/part-b-source.tar" | sha256sum -c -
  tar -xf /data/part-b-source.tar -C /data/src-b --strip-components=2
  test -f /data/videos/tiny.mp4
  VIDEO_SHA=$(sha256sum /data/videos/tiny.mp4 | awk '{print $1}')
  printf '%s\n' "$VIDEO_SHA" > "$OUT/dry_run_video_sha.txt"
fi
stamp inputsReady

# Provenance adapter (metadata only).
cat > /data/provenance/git <<'SH'
#!/bin/sh
if [ "$#" -eq 2 ] && [ "$1" = rev-parse ] && [ "$2" = HEAD ]; then
  printf '%s\n' "$SCOUTX_GIT_COMMIT"
else
  echo 'Only verified build-commit provenance is supported by this adapter' >&2
  exit 64
fi
SH
chmod 755 /data/provenance/git

run_part_a() {
  phase building_part_a
  mkdir -p "$OUT/part-a"
  if [ "$DRY_RUN" = "1" ]; then
    printf '{"dryRun":true,"part":"A","expectedCommit":"%s"}\n' "$PART_A_COMMIT" > "$OUT/part-a/skipped_build.json"
    printf '{"status":"dry-run","profiles":["cpu-onnx","cpu-torch","gpu-fp16-b8","gpu-fp32-b8","gpu-fp32-b1","gpu-fp32-b8-repeat"],"windows":["gap1150","3144","1073"]}\n' > "$OUT/part-a/matrix_summary.json"
    echo 0 > "$OUT/part-a/matrix_exit.txt"
    return 0
  fi
  cd /data/src-a
  docker build --build-arg GIT_COMMIT="$PART_A_COMMIT" -f Dockerfile.tracker-gpu -t "pitchproof-tracker-gpu:${PART_A_COMMIT}" . > "$OUT/part-a/build.log" 2>&1
  test "$(docker image inspect "pitchproof-tracker-gpu:${PART_A_COMMIT}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$PART_A_COMMIT"
  local RUN=(docker run --rm --gpus all --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp
    -e PATH=/run/provenance:/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    -v /data/provenance:/run/provenance:ro -v /data/videos:/videos:ro -v "$OUT/part-a:/out")
  "${RUN[@]}" "pitchproof-tracker-gpu:${PART_A_COMMIT}" python -m scoutx_tracker.envinfo --require-gpu --require-models > "$OUT/part-a/envinfo.json"
  phase part_a_matrix
  set +e
  timeout --signal=INT --kill-after=60 "$PART_A_BUDGET_SEC" "${RUN[@]}" --name pitchproof-part-a \
    "pitchproof-tracker-gpu:${PART_A_COMMIT}" \
    python bench/fp32_comparison.py --execute --expected-commit "$PART_A_COMMIT" \
      --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out/fp32 --budget-sec "$PART_A_BUDGET_SEC" \
      > "$OUT/part-a/matrix.log" 2>&1
  local rc=$?
  set -e
  echo "$rc" > "$OUT/part-a/matrix_exit.txt"
  return "$rc"
}

run_part_b() {
  phase building_part_b
  mkdir -p "$OUT/part-b/full" "$OUT/part-b/intervals" "$OUT/part-b/intervals-cpu" "$OUT/part-b/clips"
  if [ "$DRY_RUN" = "1" ]; then
    printf '{"dryRun":true,"part":"B","expectedCommit":"%s"}\n' "$PART_B_COMMIT" > "$OUT/part-b/skipped_build.json"
    printf '{"status":"dry-run","jobs":["full-match","intervals-x2","intervals-cpu","clips-if-approved"]}\n' > "$OUT/part-b/summary.json"
    echo 0 > "$OUT/part-b/exit.txt"
    # Fake GPU check path: refuse a CPU provider inside a GPU profile.
    printf '{"fakeGpuCheck":"ok","cpuProviderInGpuProfile":false}\n' > "$OUT/part-b/device_check.json"
    return 0
  fi
  cd /data/src-b
  docker build --build-arg GIT_COMMIT="$PART_B_COMMIT" -f Dockerfile.tracker-gpu -t "pitchproof-tracker-gpu:${PART_B_COMMIT}" . > "$OUT/part-b/build.log" 2>&1
  test "$(docker image inspect "pitchproof-tracker-gpu:${PART_B_COMMIT}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$PART_B_COMMIT"
  local RUN=(docker run --rm --gpus all --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp
    -e SCOUTX_MODE=balanced -e SCOUTX_EXCHANGE_SPLIT=0 -e SCOUTX_RESUME_SPLIT=0
    -e SCOUTX_OCR_CONSULTED_ONLY=1 -e SCOUTX_OCR_CACHE_PROVENANCE=0
    -e SCOUTX_APPEARANCE_ONLY_LIKELY=1 -e SCOUTX_DETOUR_SPLIT=0 -e PYTHONHASHSEED=0
    -e PATH=/run/provenance:/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    -v /data/provenance:/run/provenance:ro -v /data/videos:/videos:ro)

  "${RUN[@]}" -v "$OUT/part-b:/out" "pitchproof-tracker-gpu:${PART_B_COMMIT}" \
    python -m scoutx_tracker.envinfo --require-gpu --require-models > "$OUT/part-b/envinfo.json"

  # GPU memory sampler (background) for the full-match container name.
  (
    while sleep 5; do
      nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits \
        >> "$OUT/part-b/nvidia-smi-samples.csv" 2>/dev/null || true
    done
  ) &
  local GPU_SAMP=$!

  phase part_b_full_match
  set +e
  timeout --signal=INT --kill-after=60 "$PART_B_FULL_BUDGET_SEC" "${RUN[@]}" --name pitchproof-part-b \
    -v "$OUT/part-b/full:/out" \
    -e SCOUTX_OCR_CACHE=/out/work/stage1/ocr_cache.json \
    "pitchproof-tracker-gpu:${PART_B_COMMIT}" \
    python bench/full_match_benchmark.py \
      --video /videos/IMG_4809_proxy_10fps.mp4 --number 20 --kit orange --kit2 white \
      --out /out/full_match.json --work-dir /out/work --keep-work \
      --reference bench/references/img4809_proxy_10fps.json \
      --ground-truth bench/results/5.1/gt_img4809_intervals.json \
      --require-gpu --require-models \
      > "$OUT/part-b/full/benchmark.log" 2>&1
  local rc_full=$?
  set -e
  echo "$rc_full" > "$OUT/part-b/full/exit.txt"
  sample_host_mem > "$OUT/part-b/full/host_memory_peak_bytes.txt" || true

  phase part_b_intervals_gpu
  set +e
  for run in 1 2; do
    timeout --signal=INT --kill-after=60 "$PART_B_INTERVALS_BUDGET_SEC" "${RUN[@]}" \
      -v "$OUT/part-b/intervals/run-${run}:/out" \
      "pitchproof-tracker-gpu:${PART_B_COMMIT}" \
      python bench/decoder_interval_eval.py --decoder default \
        --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out \
        > "$OUT/part-b/intervals/run-${run}.log" 2>&1
    echo $? > "$OUT/part-b/intervals/run-${run}.exit"
  done
  set -e

  phase part_b_intervals_cpu_same_image
  # Same image, CPU providers only — separates decoder/build effects from GPU effects.
  set +e
  timeout --signal=INT --kill-after=60 "$PART_B_INTERVALS_BUDGET_SEC" \
    docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
      -e SCOUTX_MODE=balanced -e SCOUTX_EXCHANGE_SPLIT=0 -e SCOUTX_RESUME_SPLIT=0 \
      -e SCOUTX_OCR_CONSULTED_ONLY=1 -e SCOUTX_OCR_CACHE_PROVENANCE=0 \
      -e SCOUTX_APPEARANCE_ONLY_LIKELY=1 -e SCOUTX_DETOUR_SPLIT=0 -e PYTHONHASHSEED=0 \
      -e SCOUTX_BACKEND=cpu -e NVIDIA_VISIBLE_DEVICES= \
      -e PATH=/run/provenance:/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      -v /data/provenance:/run/provenance:ro -v /data/videos:/videos:ro \
      -v "$OUT/part-b/intervals-cpu:/out" \
      "pitchproof-tracker-gpu:${PART_B_COMMIT}" \
      python bench/decoder_interval_eval.py --decoder default \
        --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out \
        > "$OUT/part-b/intervals-cpu/run.log" 2>&1
  echo $? > "$OUT/part-b/intervals-cpu/exit.txt"
  set -e

  kill "$GPU_SAMP" 2>/dev/null || true
  if [ -f "$OUT/part-b/nvidia-smi-samples.csv" ]; then
    python3 - <<'PY'
import pathlib
rows=[ln.strip().split(",") for ln in pathlib.Path("/data/out/part-b/nvidia-smi-samples.csv").read_text().splitlines() if ln.strip()]
vals=[]
for r in rows:
  try: vals.append(int(r[0].strip()))
  except Exception: pass
pathlib.Path("/data/out/part-b/gpu_memory_peak_mib.txt").write_text(str(max(vals) if vals else 0))
PY
  fi
  echo "$rc_full" > "$OUT/part-b/exit.txt"
  return "$rc_full"
}

stamp matrixStarted
set +e
run_part_a
rc_a=$?
set -e
echo "$rc_a" > "$OUT/part_a_exit.txt"
if [ "$rc_a" -ne 0 ] && [ "$DRY_RUN" != "1" ]; then
  phase part_a_failed
  exit "$rc_a"
fi

set +e
run_part_b
rc_b=$?
set -e
echo "$rc_b" > "$OUT/part_b_exit.txt"
stamp matrixFinished
phase exporting
# Prefer Part B's exit if Part A passed; dry-run always 0 when paths succeed.
if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi
exit "$rc_b"
