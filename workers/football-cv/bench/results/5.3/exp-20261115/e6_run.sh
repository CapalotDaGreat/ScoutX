#!/bin/bash
# E6: all three candidates together (teleport split, combined reader, D) on frozen 0bae8d7 (frz-tp), resolve over the
# saved Linux CPU stage 1 (hard-linked), discovery reused, FRESH OCR caches (no snapshot, no combined cache seeded).
cd /home/claude/work/frz-tp/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
X=/home/claude/work/exp1114/e6_all_fresh
env $ENV SCOUTX_TELEPORT_SPLIT=1 SCOUTX_APPEARANCE_ONLY_LIKELY=0 SCOUTX_OCR_VARIANT=combined python3 bench/full_match_benchmark.py \
  --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 \
  --number 20 --kit orange --kit2 white --out $X/out/full_match.json --work-dir $X/work --keep-work --min-free-gb 1 \
  --reference bench/references/img4809_proxy_10fps.json --ground-truth bench/results/5.1/gt_img4809_intervals.json \
  > $X/run.log 2>&1
echo "rc=$?" > $X/rc.txt
