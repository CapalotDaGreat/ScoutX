#!/bin/bash
set -Eeuo pipefail
test ! -f /var/pitchproof-fp32-started || exit 0
touch /var/pitchproof-fp32-started
mkdir -p /data/out /data/export /data/videos /data/src /data/provenance
OUT=/data/out
exec > >(tee -a /var/log/pitchproof-fp32.log) 2>&1
PROJECT=scoutx-230b0
ZONE=europe-west3-a
VM=pitchproof-fp32-f-51d41c9
GS=gs://scoutx-230b0-benchmarks/results/fp32-20261101-f-51d41c9
COMMIT=51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
BOOT=$(date +%s)
shutdown -h +175 'approved PitchProof three-hour safeguard' || true
printf '%s\n' "$COMMIT" > "$OUT/approved_commit.txt"
stamp() { date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/$1.txt"; }
phase() { echo "$1" | tee "$OUT/STATUS"; gcloud storage cp "$OUT/STATUS" "$GS/STATUS" --project="$PROJECT" || true; }
export_numeric() {
  cp /var/log/pitchproof-fp32.log "$OUT/run.log" || true
  OUT="$OUT" python3 - <<'PY'
import os,pathlib,shutil,hashlib,json,datetime
src=pathlib.Path(os.environ['OUT']);dst=pathlib.Path('/data/export');items=[]
for p in src.rglob('*'):
 if not p.is_file() or p.suffix.lower() not in {'.json','.npz','.npy','.log','.txt','.sh'}:continue
 q=dst/p.relative_to(src);q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,q)
 items.append({'file':q.relative_to(dst).as_posix(),'bytes':q.stat().st_size,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
(dst/'export_manifest.json').write_text(json.dumps({'timestampUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':items,'mediaExcluded':True},indent=2))
PY
  gcloud storage rsync /data/export "$GS" --recursive --project="$PROJECT"
}
finish() {
  rc=$?
  trap - EXIT
  set +e
  test -z "${SYNC_PID:-}" || kill "$SYNC_PID" 2>/dev/null
  docker rm -f pitchproof-fp32-session >/dev/null 2>&1
  stamp finished
  echo "$rc" > "$OUT/startup_exit.txt"
  nvidia-smi > "$OUT/nvidia-smi-final.txt" 2>&1
  if ( flock -w 120 9 && export_numeric ) 9>/data/export.lock; then
    printf '{"exportComplete":true,"startupExit":%s}\n' "$rc" | gcloud storage cp - "$GS/_DONE" --project="$PROJECT"
  fi
  gcloud compute instances delete "$VM" --zone="$ZONE" --project="$PROJECT" --quiet || shutdown -h now
}
trap finish EXIT
stamp vmBooted
phase booting
( while sleep 120; do (flock -n 9 && export_numeric) 9>/data/export.lock || true; done ) &
SYNC_PID=$!
for i in $(seq 1 120); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
nvidia-smi > "$OUT/nvidia-smi-initial.txt"
driver=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
test "${driver%%.*}" -ge 580
stamp gpuReady
phase setup
command -v docker >/dev/null || { curl -fsSL https://get.docker.com -o /data/install-docker.sh; sh /data/install-docker.sh; }
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update
  apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi
gcloud storage cp gs://scoutx-230b0-benchmarks/runs/fp32-20261101-f-51d41c9/source.tar /data/source.tar --project="$PROJECT"
echo '308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f  /data/source.tar' | sha256sum -c -
tar -xf /data/source.tar -C /data/src --strip-components=2
phase waiting_for_video
VGS=gs://scoutx-230b0-benchmarks/videos/fp32-20261101-f-51d41c9/IMG_4809_proxy_10fps.mp4
for i in $(seq 1 40); do gcloud storage objects describe "$VGS" --project="$PROJECT" >/dev/null 2>&1 && break; sleep 30; done
gcloud storage cp "$VGS" /data/videos/IMG_4809_proxy_10fps.mp4 --project="$PROJECT"
echo 'b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c  /data/videos/IMG_4809_proxy_10fps.mp4' | sha256sum -c -
stamp inputsReady
cat > /data/provenance/git <<'SH'
#!/bin/sh
# Metadata-only adapter. No repository operations are implemented.
# The source archive and Docker build commit are verified before execution.
if [ "$#" -eq 2 ] && [ "$1" = rev-parse ] && [ "$2" = HEAD ]; then
  printf '%s\n' "$SCOUTX_GIT_COMMIT"
else
  echo 'Only verified build-commit provenance is supported by this adapter' >&2
  exit 64
fi
SH
chmod 755 /data/provenance/git
cp /data/provenance/git "$OUT/git-provenance-adapter.sh"
printf '{"approvedCommit":"%s","sourceArchiveSha256":"308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f","gitProvenance":"read-only adapter uses verified image SCOUTX_GIT_COMMIT; approved source unchanged"}\n' "$COMMIT" > "$OUT/source_provenance.json"
cd /data/src
phase building_pinned_image
docker build --build-arg GIT_COMMIT="$COMMIT" -f Dockerfile.tracker-gpu -t pitchproof-tracker-gpu:approved . > "$OUT/build.log" 2>&1
docker image inspect pitchproof-tracker-gpu:approved > "$OUT/image_inspect.json"
test "$(docker image inspect pitchproof-tracker-gpu:approved --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
RUN=(docker run --rm --gpus all --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp
     -e PATH=/run/provenance:/opt/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
     -v /data/provenance:/run/provenance:ro -v /data/videos:/videos:ro -v "$OUT:/out")
"${RUN[@]}" pitchproof-tracker-gpu:approved python -m scoutx_tracker.envinfo --require-gpu --require-models > "$OUT/envinfo.json"
"${RUN[@]}" pitchproof-tracker-gpu:approved gcc --version > "$OUT/gcc-version.txt"
"${RUN[@]}" pitchproof-tracker-gpu:approved python -c 'import subprocess,os; assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==os.environ["SCOUTX_GIT_COMMIT"]'
stamp matrixStarted
phase fp32_matrix
set +e
timeout --signal=INT --kill-after=60 5400 "${RUN[@]}" --name pitchproof-fp32-session pitchproof-tracker-gpu:approved python bench/fp32_comparison.py --execute --expected-commit "$COMMIT" --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out/fp32 --budget-sec 5400 > "$OUT/matrix.log" 2>&1
rc=$?
set -e
echo "$rc" > "$OUT/matrix_exit.txt"
stamp matrixFinished
phase exporting
exit "$rc"
