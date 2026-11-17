#!/bin/bash
# Operator check: last controller event; renews the bounded runner and the upload watcher when they have expired.
cd "$(dirname "$0")"
tail -1 controller.out | cut -c1-100
o=$(python3 -c "import json; print(json.load(open('state.json'))['outcome'])")
if [ "$o" = searching ] && [ ! -f STOP ]; then
  pgrep -f "^bash upload_watch.sh" >/dev/null || { [ -f upload_done.txt ] || (setsid bash upload_watch.sh 150 >/dev/null 2>&1 &); echo "watcher renewed"; }
  pgrep -f "^bash slices.sh" >/dev/null || { (setsid bash slices.sh 8 >/dev/null 2>&1 &); echo "runner renewed"; }
fi
echo "outcome=$o $(date -u +%T)"
