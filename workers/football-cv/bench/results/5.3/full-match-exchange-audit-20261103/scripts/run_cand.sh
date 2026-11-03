#!/bin/bash
# Candidate full-match resolve: reuses the baseline's discovery and stage-1 chunks (copied, byte-identical) and its
# OCR cache (reads are deterministic per crop; new crops are read fresh). Only stage 2 differs (SCOUTX_EXCHANGE_SPLIT=1).
cd /home/claude/work/b53/workers/football-cv
W0=/home/claude/work/fm/work_x0; W1=/home/claude/work/fm/work_x1
if [ ! -d $W1 ]; then mkdir -p $W1 && cp -a $W0/discovery.json $W1/ && cp -a $W0/stage1 $W1/ && rm -rf $W1/stage1/*/tracklets_cache* ; fi
ENV=$(cat /home/claude/work/dval/env.txt)
env $ENV SCOUTX_EXCHANGE_SPLIT=1 python3 bench/full_match_exchange_audit.py --triggers /home/claude/work/fm/triggers_x1.json -- \
  --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --number 20 --kit orange --kit2 white \
  --out /home/claude/work/fm/x1/full_match.json --work-dir $W1 --keep-work \
  --reference bench/references/img4809_proxy_10fps.json --ground-truth bench/results/5.1/gt_img4809_intervals.json \
  >> /home/claude/work/fm/x1.log 2>&1
echo "x1 rc=$?" >> /home/claude/work/fm/status
