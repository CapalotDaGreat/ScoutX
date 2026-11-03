"""Full-match exchange-trigger audit: every exchange trigger, and how the target's identity path changes around it.

    python audit.py TRIGGERS_X0 TRIGGERS_X1 TIMELINE_X0 TIMELINE_X1 OUT.json

Per unique trigger (frame, track): the two players' rows, whether it duplicates a steal (then the candidate adds
nothing), and the baseline vs candidate target path within +-5 s: claim states, whether the claim sits on either
involved player's box just before/after the trigger, and every frame whose claim differs (presence, state or box).
Also lists claim differences that are NOT within 5 s of any trigger (should be none if the candidate only acts
through exchange cuts).
"""
import json, sys
import numpy as np

sys.path.insert(0, '/home/claude/work/b53/workers/football-cv/bench')
from pp_bench import iou  # noqa: E402

tx0, tx1, tl0p, tl1p, outp = sys.argv[1:6]
T0, T1 = json.load(open(tx0)), json.load(open(tx1))
tl0, tl1 = dict(np.load(tl0p)), dict(np.load(tl1p))
assert np.allclose(tl0['times'], tl1['times'])
times = tl0['times']
gt = json.load(open('/home/claude/work/b53/workers/football-cv/bench/results/5.1/gt_img4809_intervals.json'))
CLAIM = ('CONFIRMED_VISIBLE', 'LIKELY_VISIBLE')


def uniq(T, key):
    seen = {}
    for c in T['calls']:
        for e in c[key]:
            k = (e['row']['frame'], e['row']['track'])
            seen.setdefault(k, {**e, 'calls': []})['calls'].append(c['call'])
    return seen


ex0, ex1 = uniq(T0, 'exchanges'), uniq(T1, 'exchanges')
st0, st1 = uniq(T0, 'steals'), uniq(T1, 'steals')


def idx(t):
    return int(np.argmin(np.abs(times - t)))


def claim(tl, i):
    return (str(tl['states'][i]), str(tl['evidence'][i]), [round(float(v), 1) for v in tl['boxes'][i]]) \
        if tl['present'][i] and str(tl['states'][i]) in CLAIM else None


def differs(i):
    a, b = claim(tl0, i), claim(tl1, i)
    if (a is None) != (b is None):
        return True
    if a is None:
        return False
    return a[0] != b[0] or iou(a[2], b[2]) < 0.5


labelled = [(s, e) for s, e in gt['intervals']]
diff_frames = [i for i in range(len(times)) if differs(i)]
covered = set()
items = []
for (f, tr), e in sorted(ex0.items(), key=lambda kv: kv[1]['row']['t']):
    t = e['row']['t']
    lo, hi = idx(t - 5), idx(t + 5)
    covered |= set(range(lo, hi + 1))
    near = []
    for i in range(idx(t - 1), idx(t + 3) + 1):
        for tag, tl in (('base', tl0), ('cand', tl1)):
            c = claim(tl, i)
            if c:
                near.append({'t': round(float(times[i]), 1), 'run': tag, 'state': c[0][:4], 'evidence': c[1],
                             'onTriggerRow': round(iou(c[2], e['row']['box']), 2), 'onOtherRow': round(iou(c[2], e['other']['box']), 2)})
    d = [i for i in diff_frames if lo <= i <= hi]
    items.append({'t': t, 'frame': f, 'track': tr, 'row': e['row'], 'other': e['other'], 'alsoSteal': e['alsoSteal'],
                  'appliedInCandidate': (f, tr) in ex1, 'inLabelledInterval': any(s <= t < e2 for s, e2 in labelled),
                  'targetClaimsWithin5s': {'base': sum(claim(tl0, i) is not None for i in range(lo, hi + 1)),
                                           'cand': sum(claim(tl1, i) is not None for i in range(lo, hi + 1))},
                  'claimsNearTrigger': near,
                  'changedClaimFrames': [{'t': round(float(times[i]), 1), 'base': claim(tl0, i), 'cand': claim(tl1, i)} for i in d]})
outside = [{'t': round(float(times[i]), 1), 'base': claim(tl0, i), 'cand': claim(tl1, i)} for i in diff_frames if i not in covered]
res = {'exchangeTriggersShadowBaseline': len(ex0), 'exchangeTriggersCandidate': len(ex1),
       'sameTriggerSet': sorted(ex0) == sorted(ex1), 'newExchangesNotSteals': sum(not e['alsoSteal'] for e in ex0.values()),
       'steals': {'base': len(st0), 'cand': len(st1)},
       'claimFramesDiffering': len(diff_frames), 'differingOutside5sOfAnyTrigger': outside,
       'claims': {'base': int(sum(claim(tl0, i) is not None for i in range(len(times)))),
                  'cand': int(sum(claim(tl1, i) is not None for i in range(len(times)))),
                  'baseConfirmed': int((tl0['states'].astype(str) == 'CONFIRMED_VISIBLE').sum()),
                  'candConfirmed': int((tl1['states'].astype(str) == 'CONFIRMED_VISIBLE').sum())},
       'triggers': items}
json.dump(res, open(outp, 'w'), indent=1)
print(json.dumps({k: v for k, v in res.items() if k != 'triggers'}, indent=1)[:3000])
for it in items:
    if it['targetClaimsWithin5s']['base'] or it['targetClaimsWithin5s']['cand'] or it['changedClaimFrames']:
        print(it['t'], it['track'], 'steal' if it['alsoSteal'] else 'new', 'labelled' if it['inLabelledInterval'] else '',
              it['targetClaimsWithin5s'], 'changed', len(it['changedClaimFrames']))
