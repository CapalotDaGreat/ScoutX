#!/bin/bash
cd /home/claude/work/b53/workers/football-cv
ENV=$(cat /home/claude/work/dval/env.txt)
C=/home/claude/work/gen/clips
: > /home/claude/work/gen/chain4.status
for spec in "IMG_4529_p00960 0 30 1" "IMG_5105_p00000 0 30" "IMG_5105_p00180 0 30"; do
  set -- $spec
  fls="0 1"; [ -n "$4" ] && fls=$4
  for fl in $fls; do
    o=/home/claude/work/gen/out/$1_x$fl; rm -rf $o
    env $ENV SCOUTX_EXCHANGE_SPLIT=$fl timeout 1800 python3 bench/clip_eval.py --video $C/$1.mp4 --name c$1 --start $2 --end $3 --out-dir $o > $o.log 2>&1
    echo "$1 x$fl rc=$?" >> /home/claude/work/gen/chain4.status
  done
done
echo done >> /home/claude/work/gen/chain4.status
