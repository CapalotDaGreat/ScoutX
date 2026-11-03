#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
env $ENV SCOUTX_EXCHANGE_SPLIT=0 python3 bench/full_match_exchange_audit.py --triggers /home/claude/work/fm/triggers_x0.json -- \
  --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --number 20 --kit orange --kit2 white \
  --out /home/claude/work/fm/x0/full_match.json --work-dir /home/claude/work/fm/work_x0 --keep-work \
  --reference bench/references/img4809_proxy_10fps.json --ground-truth bench/results/5.1/gt_img4809_intervals.json \
  >> /home/claude/work/fm/x0.log 2>&1
echo "x0 rc=$?" >> /home/claude/work/fm/status
