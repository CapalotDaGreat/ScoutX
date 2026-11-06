#!/bin/bash
# Local dry run of startup.sh (CPU-only). Proves export, manifest and cleanup paths.
set -Eeuo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL="${SCOUTX_LOCAL:-/c/ZLI/M335/ScoutX/.local/gpu-session-20261106}"
DRY="$LOCAL/dry-run"
mkdir -p "$DRY/work/videos" "$DRY/work/out"
PART_A="$LOCAL/archives/part-a-51d41c9-workers-football-cv.tar"
PART_B="$(ls "$LOCAL"/archives/part-b-*-workers-football-cv.tar | head -1)"
PART_A_SHA="$(sha256sum "$PART_A" | awk '{print $1}')"
PART_B_SHA="$(sha256sum "$PART_B" | awk '{print $1}')"
test "$PART_A_SHA" = "308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f"
TIP="$(git -C "$HERE/../../../../.." rev-parse HEAD)"
TINY="$DRY/work/videos/tiny.mp4"
if [ ! -f "$TINY" ]; then
  ffmpeg -y -v error -f lavfi -i testsrc=size=320x180:rate=10:duration=1 -pix_fmt yuv420p "$TINY"
fi
cp -f "$PART_A" "$DRY/work/part-a-source.tar"
cp -f "$PART_B" "$DRY/work/part-b-source.tar"
cp -f "$HERE/startup.sh" "$DRY/work/startup.sh"
sed -i 's/\r$//' "$DRY/work/startup.sh" || true

docker rm -f pitchproof-gpu-dry >/dev/null 2>&1 || true
docker run --rm --name pitchproof-gpu-dry \
  -e SCOUTX_DRY_RUN=1 \
  -e PART_A_COMMIT=51d41c9f5f333c7e93a606b7181ba8cb1cee8eac \
  -e PART_A_ARCHIVE_SHA="$PART_A_SHA" \
  -e PART_B_COMMIT="$TIP" \
  -e PART_B_ARCHIVE_SHA="$PART_B_SHA" \
  -v "$DRY/work:/data" \
  ubuntu:24.04 \
  bash -lc 'apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 ca-certificates >/dev/null && bash /data/startup.sh'

test -f "$DRY/work/out/_DONE"
test -f "$DRY/work/export/export_manifest.json"
echo "dry_run_ok"
cat "$DRY/work/out/_DONE"
python3 - <<PY
import json, pathlib
m=json.loads(pathlib.Path(r"$DRY/work/export/export_manifest.json").read_text())
print("files", len(m["files"]))
assert m["mediaExcluded"] is True
PY
