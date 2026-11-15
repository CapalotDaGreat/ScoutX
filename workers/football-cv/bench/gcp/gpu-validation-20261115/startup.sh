#!/bin/bash
# PitchProof GPU validation session 2026-11-15 (GPU-2 approved by the owner 2026-11-15 17:3x UTC; operator: Claude cloud workspace).
# Order: infra -> Part B (release tip 84fefc5, production defaults) -> export -> Part A (pinned 51d41c9 FP32 matrix,
# only if enough lifetime remains) -> export -> Part C (experimental 0bae8d7, teleport split on/off, only with >= 40 min left)
# -> export -> self-delete. Media and crops are never exported.
set -Eeuo pipefail
test ! -f /var/pp-gpu-1115-started || exit 0
touch /var/pp-gpu-1115-started

PROJECT=scoutx-230b0
ZONE=__ZONE__
VM=__VM__
GS=gs://scoutx-230b0-benchmarks/results/gpu-validation-20261115
RUNS_GS=gs://scoutx-230b0-benchmarks/runs/gpu-validation-20261115
PART_A_COMMIT=51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
PART_A_ARCHIVE_SHA=__A_SHA__
PART_B_COMMIT=84fefc570c001d6909e71ba7ec74fe8dc7755d54
PART_B_ARCHIVE_SHA=__B_SHA__
TOOL_SHA=__TOOL_SHA__
PART_C_COMMIT=0bae8d7ab3d7cd16645684e10500c9934e53cf9f
PART_C_ARCHIVE_SHA=__C_SHA__
PART_C_MIN_START_SEC=2400        # approved: Part C only with >= 40 min of lifetime left
VIDEO_SHA=b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c
GUEST_SHUTDOWN_MIN=290            # server limit is 300 min (DELETE)
RESERVE_SEC=1200                  # kept free for final export + delete
INFRA_MAX_SEC=2100                # driver, docker, inputs (incl. waiting for the video upload)
PART_B_MAX_SEC=7200               # approved Part B budget (includes its image build)
PART_A_MAX_SEC=6000               # approved Part A budget (includes its image build)
PART_A_MIN_START_SEC=2700         # do not start Part A with less than this left

T0=$(date +%s); END=$((T0 + GUEST_SHUTDOWN_MIN * 60))
left() { echo $(( END - $(date +%s) - RESERVE_SEC )); }
mn() { if [ "$1" -lt "$2" ]; then echo "$1"; else echo "$2"; fi; }

mkdir -p /data/out /data/export /data/videos /data/src-a /data/src-b /data/src-c /data/tools
OUT=/data/out
exec > >(tee -a /var/log/pp-gpu-1115.log) 2>&1
shutdown -h "+${GUEST_SHUTDOWN_MIN}" 'approved PitchProof GPU validation safeguard' || true

ts() { echo "$1 $(date -u +%Y-%m-%dT%H:%M:%SZ) left=$(left)" | tee -a "$OUT/timestamps.txt"; }
phase() { echo "$1" > "$OUT/STATUS"; ts "phase:$1"; gcloud storage cp "$OUT/STATUS" "$GS/STATUS" --project="$PROJECT" >/dev/null 2>&1 || true; }

# host used-memory high-water (MemTotal - MemAvailable), sampled every 5 s
( peak=0; while sleep 5; do u=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print (t-a)*1024}' /proc/meminfo)
  [ "$u" -gt "$peak" ] && peak=$u && echo "$peak" > "$OUT/host_used_mem_peak_bytes.txt"
  ph=$(cat "$OUT/STATUS" 2>/dev/null || echo none); echo "$(date +%s),$ph,$u" >> "$OUT/host_mem_samples.csv"; done ) &
MEM_PID=$!

export_numeric() {
  cp /var/log/pp-gpu-1115.log "$OUT/run.log" 2>/dev/null || true
  OUT="$OUT" python3 - <<'PY'
import os, pathlib, shutil, hashlib, json, datetime
src = pathlib.Path(os.environ["OUT"]); dst = pathlib.Path("/data/export"); items = []
allowed = {".json", ".npz", ".log", ".txt", ".csv", ".sh", ".py"}
def skip(rel):
    parts = rel.parts
    # stage-1 checkpoints (detections, embeddings, crops) stay on the VM; final timelines/reports are exported
    return any(p == "stage1" or p.startswith("c_") or p == "crops" for p in parts)
for p in src.rglob("*"):
    rel = p.relative_to(src)
    if not p.is_file() or p.suffix.lower() not in allowed or skip(rel) or p.stat().st_size > 64 * 2**20:
        continue
    q = dst / rel; q.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, q)
    items.append({"file": rel.as_posix(), "bytes": q.stat().st_size, "sha256": hashlib.sha256(q.read_bytes()).hexdigest()})
(dst / "export_manifest.json").write_text(json.dumps({"timestampUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "files": items, "mediaExcluded": True, "stage1Excluded": True}, indent=1))
PY
  gcloud storage rsync /data/export "$GS" --recursive --project="$PROJECT" >/dev/null 2>&1
}

finish() {
  rc=$?; trap - EXIT; set +e
  for p in "${SYNC_PID:-}" "${GPU_PID:-}" "${MEM_PID:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
  docker rm -f pp-b-full pp-iv pp-a pp-c >/dev/null 2>&1
  ts finished; echo "$rc" > "$OUT/startup_exit.txt"
  nvidia-smi > "$OUT/nvidia-smi-final.txt" 2>&1
  if ( flock -w 300 9 && export_numeric ) 9>/data/export.lock; then
    printf '{"exportComplete":true,"startupExit":%s}\n' "$rc" | gcloud storage cp - "$GS/_DONE" --project="$PROJECT"
  else
    printf '{"exportComplete":false,"startupExit":%s}\n' "$rc" | gcloud storage cp - "$GS/_DONE" --project="$PROJECT"
  fi
  gcloud compute instances delete "$VM" --zone="$ZONE" --project="$PROJECT" --quiet || shutdown -h now
}
trap finish EXIT

ts vmBooted; phase infra
printf '%s\n' "$PART_A_COMMIT" > "$OUT/part_a_commit.txt"; printf '%s\n' "$PART_B_COMMIT" > "$OUT/part_b_commit.txt"
( while sleep 180; do (flock -n 9 && export_numeric) 9>/data/export.lock || true; done ) & SYNC_PID=$!
INFRA_END=$(( T0 + INFRA_MAX_SEC ))
for i in $(seq 1 90); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
nvidia-smi > "$OUT/nvidia-smi-initial.txt"
driver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1); test "${driver%%.*}" -ge 580
nvidia-smi --query-gpu=name,memory.total --format=csv > "$OUT/gpu.txt"
grep -qi "L4" "$OUT/gpu.txt"
ts gpuReady
command -v docker >/dev/null || { curl -fsSL https://get.docker.com -o /data/install-docker.sh; sh /data/install-docker.sh; }
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -q; apt-get install -y -q nvidia-container-toolkit; nvidia-ctk runtime configure --runtime=docker; systemctl restart docker
fi
ts dockerReady
for f in part-a-source.tar part-b-source.tar part-c-source.tar interval_profile_eval.py; do
  until gcloud storage cp "$RUNS_GS/$f" /data/ --project="$PROJECT" >/dev/null 2>&1; do
    [ "$(date +%s)" -lt "$INFRA_END" ] || { echo "input $f never arrived"; exit 3; }; sleep 15; done; done
echo "${PART_A_ARCHIVE_SHA}  /data/part-a-source.tar" | sha256sum -c -
echo "${PART_B_ARCHIVE_SHA}  /data/part-b-source.tar" | sha256sum -c -
echo "${PART_C_ARCHIVE_SHA}  /data/part-c-source.tar" | sha256sum -c -
echo "${TOOL_SHA}  /data/interval_profile_eval.py" | sha256sum -c -
cp /data/interval_profile_eval.py /data/tools/ && cp /data/interval_profile_eval.py "$OUT/"
tar -xf /data/part-a-source.tar -C /data/src-a --strip-components=2
tar -xf /data/part-b-source.tar -C /data/src-b --strip-components=2
tar -xf /data/part-c-source.tar -C /data/src-c --strip-components=2
phase waiting_for_video
VGS="$RUNS_GS/IMG_4809_proxy_10fps.mp4"
until gcloud storage objects describe "$VGS" --project="$PROJECT" >/dev/null 2>&1; do
  [ "$(date +%s)" -lt "$INFRA_END" ] || { echo "video never arrived"; exit 3; }; sleep 20; done
gcloud storage cp "$VGS" /data/videos/IMG_4809_proxy_10fps.mp4 --project="$PROJECT"
echo "${VIDEO_SHA}  /data/videos/IMG_4809_proxy_10fps.mp4" | sha256sum -c -
ts inputsReady

( while sleep 5; do echo "$(date +%s),$(cat $OUT/STATUS 2>/dev/null),$(nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits | head -1)" >> "$OUT/gpu_samples.csv" 2>/dev/null; done ) & GPU_PID=$!

mkdir -p /data/prov && cat > /data/prov/git <<'SH'
#!/bin/sh
if [ "$#" -eq 2 ] && [ "$1" = rev-parse ] && [ "$2" = HEAD ]; then printf '%s\n' "$SCOUTX_GIT_COMMIT"; else echo 'provenance adapter: rev-parse HEAD only' >&2; exit 64; fi
SH
chmod 755 /data/prov/git
BASEPATH=/run/prov:/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
FLAGS=(-e SCOUTX_EXCHANGE_SPLIT=0 -e SCOUTX_RESUME_SPLIT=0 -e SCOUTX_OCR_CONSULTED_ONLY=1 -e SCOUTX_OCR_CACHE_PROVENANCE=0
       -e SCOUTX_APPEARANCE_ONLY_LIKELY=1 -e SCOUTX_DETOUR_SPLIT=0 -e PYTHONHASHSEED=0)

build() {  # $1 commit  $2 srcdir  $3 logdir
  ( cd "$2" && docker build --build-arg GIT_COMMIT="$1" -f Dockerfile.tracker-gpu -t "pp-gpu:$1" . > "$3/build.log" 2>&1 )
  test "$(docker image inspect "pp-gpu:$1" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$1"
}

# ---------------- Part B: release tip on the real GPU worker image ----------------
B_END=$(( $(date +%s) + PART_B_MAX_SEC )); bleft() { mn $(( B_END - $(date +%s) )) "$(left)"; }
mkdir -p "$OUT/part-b/full" "$OUT/part-b/intervals-gpu" "$OUT/part-b/intervals-cpu" "$OUT/part-b/repeat"
phase part_b_build
set +e
build "$PART_B_COMMIT" /data/src-b "$OUT/part-b"; rcb=$?
set -e
echo "$rcb" > "$OUT/part-b/build_exit.txt"
if [ "$rcb" -eq 0 ]; then
  RUNB=(docker run --rm --gpus all --ipc=host -e HOME=/tmp -e PATH=$BASEPATH "${FLAGS[@]}" -v /data/prov:/run/prov:ro -v /data/videos:/videos:ro -v /data/tools:/tools:ro)
  "${RUNB[@]}" "pp-gpu:$PART_B_COMMIT" python -m scoutx_tracker.envinfo --require-gpu --require-models > "$OUT/part-b/envinfo.json" 2>"$OUT/part-b/envinfo.err" || echo "envinfo exit $?"
  phase part_b_full_match
  t=$(( $(bleft) - 900 )); echo "full-match timeout ${t}s" | tee "$OUT/part-b/full/timeout.txt"
  set +e
  timeout --signal=INT --kill-after=60 "$t" "${RUNB[@]}" --name pp-b-full -v "$OUT/part-b/full:/out" "pp-gpu:$PART_B_COMMIT" \
    python bench/full_match_benchmark.py --video /videos/IMG_4809_proxy_10fps.mp4 --number 20 --kit orange --kit2 white \
      --out /out/full_match.json --work-dir /out/work --keep-work --reference bench/references/img4809_proxy_10fps.json \
      --ground-truth bench/results/5.1/gt_img4809_intervals.json --require-gpu --require-models > "$OUT/part-b/full/benchmark.log" 2>&1
  echo $? > "$OUT/part-b/full/exit.txt"; docker rm -f pp-b-full >/dev/null 2>&1
  set -e
  ( flock -w 300 9 && export_numeric ) 9>/data/export.lock || true
  # GPU labelled intervals (production-equivalent harness profile: torch fp16 batch 8), most informative first
  set +e
  for s in 225 1150 1295 1890 400 600 1500 1680 1800; do
    t=$(( $(bleft) - 120 )); [ "$t" -ge 300 ] || { echo "skip $s (left $t)" >> "$OUT/part-b/intervals-gpu/skipped.txt"; continue; }
    phase "part_b_interval_gpu_$s"
    timeout --signal=INT --kill-after=30 "$t" "${RUNB[@]}" --name pp-iv -e PP_PROFILE=gpu-fp16-b8 -v "$OUT/part-b/intervals-gpu:/out" "pp-gpu:$PART_B_COMMIT" \
      python /tools/interval_profile_eval.py --decoder default --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir "/out/i$s" --intervals "$s" \
      > "$OUT/part-b/intervals-gpu/i$s.log" 2>&1; echo $? > "$OUT/part-b/intervals-gpu/i$s.exit"; docker rm -f pp-iv >/dev/null 2>&1
  done
  # same-image CPU control (cpu-onnx, no GPU attached) and a GPU repeat, only with time left
  for s in 225 1150; do
    t=$(( $(bleft) - 60 )); [ "$t" -ge 600 ] || { echo "skip cpu $s (left $t)" >> "$OUT/part-b/intervals-cpu/skipped.txt"; continue; }
    phase "part_b_interval_cpu_$s"
    timeout --signal=INT --kill-after=30 "$t" docker run --rm --name pp-iv --ipc=host -e HOME=/tmp -e PATH=$BASEPATH "${FLAGS[@]}" -v /data/prov:/run/prov:ro \
      -v /data/videos:/videos:ro -v "$OUT/part-b/intervals-cpu:/out" "pp-gpu:$PART_B_COMMIT" \
      python bench/decoder_interval_eval.py --decoder default --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir "/out/i$s" --intervals "$s" \
      > "$OUT/part-b/intervals-cpu/i$s.log" 2>&1; echo $? > "$OUT/part-b/intervals-cpu/i$s.exit"; docker rm -f pp-iv >/dev/null 2>&1
  done
  t=$(( $(bleft) - 60 ))
  if [ "$t" -ge 300 ]; then
    phase part_b_repeat_225
    timeout --signal=INT --kill-after=30 "$t" "${RUNB[@]}" --name pp-iv -e PP_PROFILE=gpu-fp16-b8 -v "$OUT/part-b/repeat:/out" "pp-gpu:$PART_B_COMMIT" \
      python /tools/interval_profile_eval.py --decoder default --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out/i225 --intervals 225 \
      > "$OUT/part-b/repeat/i225.log" 2>&1; echo $? > "$OUT/part-b/repeat/i225.exit"; docker rm -f pp-iv >/dev/null 2>&1
  else echo "skip repeat (left $t)" > "$OUT/part-b/repeat/skipped.txt"; fi
  set -e
fi
docker image rm -f "pp-gpu:$PART_B_COMMIT" >/dev/null 2>&1 || true
phase part_b_export
( flock -w 300 9 && export_numeric ) 9>/data/export.lock || true

# ---------------- Part A: pinned FP32 comparison (51d41c9), only if enough lifetime remains ----------------
if [ "$(left)" -lt "$PART_A_MIN_START_SEC" ]; then
  echo "Part A skipped: only $(left)s left" | tee "$OUT/part_a_skipped.txt"; phase part_a_skipped; exit 0
fi
PART_A_RAN=1
A_END=$(( $(date +%s) + PART_A_MAX_SEC )); aleft() { mn $(( A_END - $(date +%s) )) "$(left)"; }
mkdir -p "$OUT/part-a"
phase part_a_build
build "$PART_A_COMMIT" /data/src-a "$OUT/part-a"
RUNA=(docker run --rm --gpus all --ipc=host -e HOME=/tmp -e PATH=$BASEPATH -v /data/prov:/run/prov:ro -v /data/videos:/videos:ro -v "$OUT/part-a:/out")
"${RUNA[@]}" "pp-gpu:$PART_A_COMMIT" python -m scoutx_tracker.envinfo --require-gpu --require-models > "$OUT/part-a/envinfo.json"
phase part_a_matrix
t=$(( $(aleft) - 120 )); echo "$t" > "$OUT/part-a/budget_sec.txt"
set +e
timeout --signal=INT --kill-after=60 "$t" "${RUNA[@]}" --name pp-a "pp-gpu:$PART_A_COMMIT" \
  python bench/fp32_comparison.py --execute --expected-commit "$PART_A_COMMIT" --video /videos/IMG_4809_proxy_10fps.mp4 \
    --out-dir /out/fp32 --budget-sec "$(( t - 60 ))" > "$OUT/part-a/matrix.log" 2>&1
echo $? > "$OUT/part-a/matrix_exit.txt"; docker rm -f pp-a >/dev/null 2>&1
set -e
docker image rm -f "pp-gpu:$PART_A_COMMIT" >/dev/null 2>&1 || true
phase part_a_export
( flock -w 300 9 && export_numeric ) 9>/data/export.lock || true

# ---------------- Part C: experimental teleport split (0bae8d7), separately approved ----------------
if [ "$(left)" -lt "$PART_C_MIN_START_SEC" ]; then
  echo "Part C skipped: only $(left)s left" | tee "$OUT/part_c_skipped.txt"; phase part_c_skipped; exit 0
fi
mkdir -p "$OUT/part-c"; printf '%s\n' "$PART_C_COMMIT" > "$OUT/part_c_commit.txt"
phase part_c_build
set +e
build "$PART_C_COMMIT" /data/src-c "$OUT/part-c"; rcc=$?
echo "$rcc" > "$OUT/part-c/build_exit.txt"
if [ "$rcc" -eq 0 ]; then
  for v in off on; do for s in 1150 225; do
    t=$(( $(left) - 60 )); [ "$t" -ge 300 ] || { echo "skip $v $s (left $t)" >> "$OUT/part-c/skipped.txt"; continue; }
    phase "part_c_${v}_$s"; mkdir -p "$OUT/part-c/$v"
    TS=0; [ "$v" = on ] && TS=1
    timeout --signal=INT --kill-after=30 "$t" docker run --rm --gpus all --ipc=host --name pp-c -e HOME=/tmp -e PATH=$BASEPATH "${FLAGS[@]}" \
      -e SCOUTX_TELEPORT_SPLIT=$TS -e PP_PROFILE=gpu-fp32-b8 -v /data/prov:/run/prov:ro -v /data/videos:/videos:ro -v /data/tools:/tools:ro \
      -v "$OUT/part-c/$v:/out" "pp-gpu:$PART_C_COMMIT" \
      python /tools/interval_profile_eval.py --decoder default --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir "/out/i$s" --intervals "$s" \
      > "$OUT/part-c/$v/i$s.log" 2>&1; echo $? > "$OUT/part-c/$v/i$s.exit"; docker rm -f pp-c >/dev/null 2>&1
  done; done
fi
set -e
phase exporting
exit 0
