import json, sys
for n in sys.argv[1:]:
    try: d = json.load(open(f'{n}/out/anchor_replay.json'))
    except Exception: print(n, 'missing'); continue
    out = [f"{n:15s}"]
    for k in ('allIntervals', 'untappedIntervals'):
        s = d['scores'].get(k)
        if not s: out.append(f"{k[:5]} -"); continue
        s = s.get('correctedBasis') or s.get('storedBasis'); o = s['outcomes']; t = o['targetVisibleLabelledFrames']; a = o['allLabelledFrames']
        out.append(f"{k[:5]} {t.get('correctClaim',0)}/{t.get('abstained',0)}/{t.get('unmatchedClaim',0)} wrongP {a.get('wrongPlayerClaim',0)} wrongSec {s['accuracy']['wrongIdentitySec']} confWrong {s['accuracy']['confirmedWrongIdentitySec']}")
    c = d['coverage']; out.append(f"conf {c['confirmedVisibleSec']} likely {c['likelyVisibleSec']}")
    print(' | '.join(out))
