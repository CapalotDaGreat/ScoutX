#!/bin/bash
# Bounded: back-to-back controller slices for at most $1 hours; stops when the controller leaves "searching".
end=$(( $(date +%s) + ${1:-6} * 3600 )); cd "$(dirname "$0")"
outcome() { python3 -c "import json; print(json.load(open('state.json'))['outcome'])"; }
while [ "$(date +%s)" -lt "$end" ]; do
  while pgrep -f "gpu_search.py run" >/dev/null; do sleep 20; done      # never a second controller
  [ "$(outcome)" = vm_created ] && { pgrep -f upload_watch.sh >/dev/null || bash upload_watch.sh 40; exit 0; }
  [ "$(outcome)" = searching ] || exit 0
  [ -f STOP ] && exit 0
  pgrep -f upload_watch.sh >/dev/null || (setsid bash upload_watch.sh 120 >/dev/null 2>&1 &)
  python3 gpu_search.py run --max-runtime-min 115 >> controller.out 2>&1
  sleep 5
done
