#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
rm -rf /home/claude/work/dval/cand_reference_c
env $ENV SCOUTX_EXCHANGE_SPLIT=1 timeout 6000 python3 bench/decoder_interval_eval.py --decoder reference --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --out-dir /home/claude/work/dval/cand_reference_c --intervals 1295 1500 1680 1800 1890 > /home/claude/work/dval/cand_reference_c.log 2>&1
echo "cand_reference_c rc=$?" > /home/claude/work/dval/chain3.status
