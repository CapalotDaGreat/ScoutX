#!/bin/bash
# Runs the worker suite with the exchange flag off and on; verbose log + junit xml + provenance.
cd /home/claude/work/b53/workers/football-cv
E=bench/results/5.3/wrong-player-20261102/validation/tests
C=$(git rev-parse HEAD)
for fl in 0 1; do
  CMD="env SCOUTX_WEIGHTS_DIR=/home/claude/work/det SCOUTX_EXCHANGE_SPLIT=$fl python3 -m pytest -v -rA -p no:cacheprovider --junitxml=$E/junit_x$fl.xml"
  S=$(date -u +%FT%TZ)
  $CMD > $E/suite_x${fl}_verbose.log 2>&1; rc=$?
  python3 - "$fl" "$rc" "$S" "$C" "$CMD" <<'PY'
import json,sys,platform,subprocess,datetime
fl,rc,s,c,cmd=sys.argv[1:]
import importlib.metadata as m
pk={p:m.version(p) for p in ("torch","numpy","opencv-python-headless","onnxruntime","pytest","easyocr","python-doctr","scipy")}
E="bench/results/5.3/wrong-player-20261102/validation/tests"
log=open(f"{E}/suite_x{fl}_verbose.log").read().strip().splitlines()[-1]
json.dump({"flag":{"SCOUTX_EXCHANGE_SPLIT":fl},"command":cmd,"cwd":"workers/football-cv","gitCommit":c,
  "startedUtc":s,"finishedUtc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"exitCode":int(rc),"summaryLine":log,
  "environment":{"platform":platform.platform(),"python":platform.python_version(),"packages":pk,"device":"CPU only (no CUDA device)",
                 "otherScoutxEnv":"none set in the shell besides SCOUTX_WEIGHTS_DIR and SCOUTX_EXCHANGE_SPLIT"}},
  open(f"{E}/suite_x{fl}_provenance.json","w"),indent=1)
PY
done
