#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
until grep -q "cand_default rc" /tmp/claude-0/-home-claude/b32eec01-4a17-5138-8211-afb12a28de6c/tasks/b2ro7j0y3.output 2>/dev/null; do sleep 15; done
ENV=$(cat /home/claude/work/dval/env.txt)
for part in "a 225 400 600 1150 1295" "b 1500 1680 1800 1890"; do
  set -- $part; p=$1; shift
  rm -rf /home/claude/work/dval/cand_reference_$p
  env $ENV SCOUTX_EXCHANGE_SPLIT=1 timeout 4000 python3 bench/decoder_interval_eval.py --decoder reference --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --out-dir /home/claude/work/dval/cand_reference_$p --intervals "$@" > /home/claude/work/dval/cand_reference_$p.log 2>&1
  echo "cand_reference_$p rc=$?" >> /home/claude/work/dval/chain1.status
done
echo done >> /home/claude/work/dval/chain1.status
