#!/bin/bash
# usage: rep2.sh NAME "ENV VARS" [extra args]
cd /home/claude/work/b53/workers/football-cv
n=$1; ev=$2; shift 2
ENV=$(cat /home/claude/work/dval/env.txt)
rm -rf /home/claude/work/fmr/$n
env $ENV $ev python3 bench/full_match_replay.py run --replay /home/claude/work/fmr/replay_all --out /home/claude/work/fmr/$n --dump-identity /home/claude/work/fmr/$n.identity.json "$@" > /home/claude/work/fmr/$n.log 2>&1
echo "$n rc=$?" >> /home/claude/work/fmr/status
python3 -c "import json;r=json.load(open('/home/claude/work/fmr/$n/replay_run.json'));print('$n',r['timelineSha256'][:12],r.get('matches'),r['ocr'])"
cp /home/claude/work/fmr/$n/report/timeline.npz /home/claude/work/fmr/$n.timeline.npz; cp /home/claude/work/fmr/$n/replay_run.json /home/claude/work/fmr/$n.replay_run.json; rm -rf /home/claude/work/fmr/$n
