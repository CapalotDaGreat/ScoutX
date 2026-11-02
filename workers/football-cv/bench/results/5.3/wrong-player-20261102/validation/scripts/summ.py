import json, sys
from collections import Counter
d=json.load(open(sys.argv[1])); basis=sys.argv[2] if len(sys.argv)>2 else 'verified'
tot={}
for k,it in d['intervals'].items():
    if 'missing' in it: print(k,'missing',it['missing']); continue
    row=[]
    for n,r in it['runs'].items():
        s=r[basis]; t=s['targetLabelled']; a=s['allLabelled']
        nc=Counter((c[2],c[3]) for c in s['nonCorrectClaims'])
        wc=nc[('wrongPlayerClaim','CONFIRMED_VISIBLE')]
        v=dict(corr=t.get('correctClaim',0),cc=s['correctConfirmed'],cl=s['correctLikely'],wrong=a.get('wrongPlayerClaim',0),wconf=wc,unm=a.get('unmatchedClaim',0),q=a.get('indeterminateLabelClaim',0),abst=t.get('abstained',0),den=t['denominator'])
        row.append(f"{n}: "+" ".join(f"{x}={y}" for x,y in v.items()))
        T=tot.setdefault(n,Counter()); T.update(v)
    print(k,' | '.join(row))
print('TOTAL', {n:dict(c) for n,c in tot.items()})
