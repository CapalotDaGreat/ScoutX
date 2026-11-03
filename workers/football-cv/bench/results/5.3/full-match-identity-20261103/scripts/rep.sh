#!/bin/bash
# usage: rep.sh NAME FLAG [extra args]
cd /home/claude/work/b53/workers/football-cv
n=$1; fl=$2; shift 2
ENV=$(cat /home/claude/work/dval/env.txt)
rm -rf /home/claude/work/fmr/$n
env $ENV SCOUTX_EXCHANGE_SPLIT=$fl python3 bench/full_match_replay.py run --replay /home/claude/work/fmr/replay --out /home/claude/work/fmr/$n --dump-identity /home/claude/work/fmr/$n.identity.json "$@" > /home/claude/work/fmr/$n.log 2>&1
echo "$n rc=$?" >> /home/claude/work/fmr/status
