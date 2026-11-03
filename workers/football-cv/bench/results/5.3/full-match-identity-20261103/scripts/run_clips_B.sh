#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
C=/home/claude/work/gen/clips
for spec in "IMG_4529_p01440 15 45" "IMG_4529_p00960 0 30" "IMG_5105_p00000 0 30" "IMG_5105_p00180 0 30"; do
  set -- $spec
  o=/home/claude/work/gen/out/$1_B; rm -rf $o
  env $ENV SCOUTX_EXCHANGE_SPLIT=0 SCOUTX_RESUME_SPLIT=1 timeout 1800 python3 bench/clip_eval.py --video $C/$1.mp4 --name c$1 --start $2 --end $3 --out-dir $o > $o.log 2>&1
  echo "$1 B rc=$?" >> /home/claude/work/fm/status
done
echo "clipsB done" >> /home/claude/work/fm/status
