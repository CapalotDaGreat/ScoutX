#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
rm -rf /home/claude/work/dval/resume_default
env $ENV SCOUTX_EXCHANGE_SPLIT=0 SCOUTX_RESUME_SPLIT=1 timeout 3000 python3 bench/decoder_interval_eval.py --decoder default --video /home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4 --out-dir /home/claude/work/dval/resume_default --intervals 225 1800 > /home/claude/work/dval/resume_default.log 2>&1
echo "resume_default rc=$?" >> /home/claude/work/fm/status
