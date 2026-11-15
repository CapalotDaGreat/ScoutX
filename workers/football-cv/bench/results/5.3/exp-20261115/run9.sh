#!/bin/bash
# Priority queue after the 1,151 s CONFIRMED wrong-player finding. Same stage 1 and the same OCR cache snapshot.
X=/home/claude/work/exp1114; E=$X/e3; ENV=$(cat /home/claude/work/dval/env.txt)
REL=/home/claude/work/ana/workers/football-cv
GT=$REL/bench/results/5.1/gt_img4809_intervals.json; TB=$REL/bench/references/gt_time_basis_corrections.json
run() { name=$1; script=$2; src=$3; taps=$4; extra=$5; extracache=$6
  W=$E/$name/work; mkdir -p $W; cp -al $X/e0_base/work/stage1 $W/stage1
  for c in $W/stage1/c_*; do for f in checkpoint.json meta.json; do cp --remove-destination $X/e0_base/work/stage1/$(basename $c)/$f $c/$f; done; done
  rm -f $W/stage1/ocr_cache*.json $W/stage1/trackrows_*.npy; cp $E/cache_snapshot.json $W/stage1/ocr_cache.json
  [ -n "$extracache" ] && cp $extracache $W/stage1/ocr_cache.combined.json
  (cd $src && env $ENV $extra python3 $script --source $src --stage1 $W/stage1 --discovery $X/e0_base/work/discovery.json --out $E/$name/out \
     --ground-truth $GT --time-basis $TB --tap-intervals "$taps" > $E/$name/run.log 2>&1); echo "$name rc=$? env=[$extra]" >> $E/status
}
E2C=/home/claude/work/frz-e2c/workers/football-cv
TP=/home/claude/work/frz-tp/workers/football-cv
for v in all_0: all_t4:0,3,4,8 all_loo_wo4:0,3,8 all_loo_wo8:0,3,4 all_loo_wo0:3,4,8 all_loo_wo3:0,4,8; do
  run ${v%%:*} $TP/bench/anchor_replay.py $TP "${v#*:}" "SCOUTX_TELEPORT_SPLIT=1 SCOUTX_APPEARANCE_ONLY_LIKELY=0 SCOUTX_OCR_VARIANT=combined" $X/e2b/ocr_cache.combined.json
done
echo done9 >> $E/status
