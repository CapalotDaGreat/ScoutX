#!/usr/bin/env bash
# Two-match shadow evaluation: one frozen tree, five configurations, identical input bytes, fresh mutable caches.
#   bench/shadow/run_shadow.sh FREEZE.json PROXY.mp4 OUTDIR ENVFILE
# Refuses to run unless the freeze record exists, its identity confirmation is an explicit owner "yes", and the proxy
# bytes and tree commit still match. Automatic mode only. Outputs stay in OUTDIR (private; nothing is published,
# nothing goes to Firestore/Storage, no notifications). Stage 1 runs once (control) and its chunk detections are
# hard-linked into every other configuration; OCR caches and tracklet rows are never copied (fresh per run).
set -euo pipefail
FREEZE="$1"; PROXY="$2"; OUT="$3"; ENVFILE="$4"
HERE="$(cd "$(dirname "$0")" && pwd)"
read -r GROUP COMMIT PSHA NUMBER KIT TREE < <(python3 - "$FREEZE" <<'PY'
import json, sys
f = json.load(open(sys.argv[1]))
i = f["identityConfirmation"]
assert i["answer"] == "yes" and i["confirmedBy"] == "owner", "no owner confirmation"
print(f["group"], f["tree"]["commit"], f["proxy"]["sha256"], i["shirtNumber"], i["kit"], f["tree"]["path"])
PY
)
[ "$(git -C "$TREE" rev-parse HEAD)" = "$COMMIT" ] || { echo "tree is not at the frozen commit"; exit 3; }
[ "$(sha256sum "$PROXY" | cut -d' ' -f1)" = "$PSHA" ] || { echo "proxy bytes differ from the freeze record"; exit 3; }
mkdir -p "$OUT"
ENV=$(cat "$ENVFILE")
cd "$TREE/workers/football-cv"
run() {  # name, extra env...
  local name="$1"; shift
  local X="$OUT/$name"
  [ -e "$X/rc.txt" ] && { echo "$name already ran (rc $(cat "$X/rc.txt")); keep it"; return; }
  mkdir -p "$X/work/stage1"
  if [ "$name" != control_all_off ]; then
    for c in "$OUT/control_all_off/work/stage1"/c_*; do cp -al "$c" "$X/work/stage1/"; done
    cp "$OUT/control_all_off/work/discovery.json" "$X/work/" 2>/dev/null || true
  fi
  [ "$(sha256sum "$PROXY" | cut -d' ' -f1)" = "$PSHA" ] || { echo "proxy changed during the matrix"; exit 3; }
  python3 -c "import json,sys;print(json.dumps(json.load(open('$FREEZE'))['flags']['configs']['$name']))" > "$X/flags.json"
  set +e
  env $ENV "$@" python3 bench/full_match_benchmark.py --video "$PROXY" --number "$NUMBER" --kit "$KIT" \
    --out "$X/out/full_match.json" --work-dir "$X/work" --keep-work --min-free-gb 0.5 > "$X/run.log" 2>&1
  echo $? > "$X/rc.txt"
  set -e
  ls "$X/work/stage1" | grep -E 'ocr_cache|trackrows' > "$X/fresh_caches.txt" || true
}
F() { python3 -c "import json;c=json.load(open('$FREEZE'))['flags']['configs']['$1'];print(' '.join(f'{k}={v}' for k,v in c.items()))"; }
run control_all_off $(F control_all_off)
run teleport_split $(F teleport_split)
run no_appearance_only_likely $(F no_appearance_only_likely)
run combined_number_reader $(F combined_number_reader)
run candidate_tdc_plus_interp_no_upgrade $(F candidate_tdc_plus_interp_no_upgrade)
echo "done: $GROUP $(for d in "$OUT"/*/rc.txt; do echo -n "$(basename "$(dirname "$d")")=$(cat "$d") "; done)"
