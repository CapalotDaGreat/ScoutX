#!/bin/bash
# Operator / scheduled check. Does nothing unless the search is still approved, inside its window and limits,
# not stopped, and not owned by a running controller. Never resets counters or the window.
cd "$(dirname "$0")"
tail -1 controller.out | cut -c1-100
read -r o left win <<< "$(python3 - <<'PY'
import json, datetime as d
s = json.load(open('state.json')); e = json.load(open('envelope.json'))
end = d.datetime.fromisoformat(s['windowStart'].replace('Z', '+00:00')) + d.timedelta(hours=e['searchWindowHours'])
ok = e.get('approved') is True and s['attempts'] < e['maxAttempts'] and s['sessions'] < e['maxBillableSessions'] \
     and d.datetime.now(d.timezone.utc) < end and e['aggregateCeilingUsd'] - s['spentUsdEstimate'] >= e['perSessionCeilingUsd']
print(s['outcome'], 'inside' if ok else 'OUTSIDE', end.strftime('%Y-%m-%dT%H:%MZ'))
PY
)"
echo "outcome=$o envelope=$left windowEnd=$win now=$(date -u +%FT%H:%MZ)"
[ -f STOP ] && { echo "STOP flag present: nothing started"; exit 0; }
[ "$left" = inside ] || { echo "envelope over: nothing started"; exit 0; }
[ "$o" = searching ] || { echo "not searching ($o): nothing started"; exit 0; }
pgrep -f "^bash upload_watch.sh" >/dev/null || { [ -f upload_done.txt ] || (setsid bash upload_watch.sh 150 >/dev/null 2>&1 &); echo "watcher renewed"; }
pgrep -f "^bash slices.sh" >/dev/null || pgrep -f "gpu_search.py run" >/dev/null || { (setsid bash slices.sh 8 >/dev/null 2>&1 &); echo "runner renewed"; }
