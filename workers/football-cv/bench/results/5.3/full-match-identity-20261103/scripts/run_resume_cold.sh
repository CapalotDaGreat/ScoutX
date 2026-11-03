#!/bin/bash
# Candidate with a COLD OCR cache (real OCR), same discovery + stage-1 chunks as the baseline.
cd /home/claude/work/b53/workers/football-cv
W0=/home/claude/work/fm/work_x0; W=/home/claude/work/fm/work_x2c
rm -rf $W; mkdir -p $W/stage1 && cp -a $W0/discovery.json $W/ && for c in $W0/stage1/c_0000?; do cp -a $c $W/stage1/; done
ENV=$(cat /home/claude/work/dval/env.txt)
env $ENV SCOUTX_EXCHANGE_SPLIT=0 SCOUTX_RESUME_SPLIT=1 python3 bench/full_match_exchange_audit.py --triggers /home/claude/work/fm/triggers_x2c.json -- \
  --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --number 20 --kit orange --kit2 white \
  --out /home/claude/work/fm/x2c/full_match.json --work-dir $W --keep-work \
  --reference bench/references/img4809_proxy_10fps.json --ground-truth bench/results/5.1/gt_img4809_intervals.json \
  > /home/claude/work/fm/x2c.log 2>&1
echo "x2c rc=$?" >> /home/claude/work/fm/status
