#!/bin/bash
# Bounded watcher (exits after $1 minutes): uploads the pinned inputs once the controller reports vm_created.
end=$(( $(date +%s) + ${1:-115} * 60 )); cd "$(dirname "$0")"
while [ "$(date +%s)" -lt "$end" ]; do
  [ -f upload_done.txt ] && exit 0
  python3 -c "import json,sys; sys.exit(0 if json.load(open('state.json'))['outcome']=='vm_created' else 1)" 2>/dev/null && { bash upload_after_create.sh >> upload.out 2>&1; exit; }
  sleep 15
done
