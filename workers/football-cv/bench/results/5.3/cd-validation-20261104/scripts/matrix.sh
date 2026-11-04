#!/bin/bash
# Four-way C/D matrix on the whole-match replay (cold and warm), A/B pinned off.
B=/home/claude/work/fm/work_x0/report/timeline.npz
W=/home/claude/work/fm/work_x0/stage1/ocr_cache.json
for cfg in "base:SCOUTX_OCR_CONSULTED_ONLY=0 SCOUTX_APPEARANCE_ONLY_LIKELY=1" "C:SCOUTX_OCR_CONSULTED_ONLY=1 SCOUTX_APPEARANCE_ONLY_LIKELY=1" "D:SCOUTX_OCR_CONSULTED_ONLY=0 SCOUTX_APPEARANCE_ONLY_LIKELY=0" "CD:SCOUTX_OCR_CONSULTED_ONLY=1 SCOUTX_APPEARANCE_ONLY_LIKELY=0"; do
  n=${cfg%%:*}; ev="SCOUTX_EXCHANGE_SPLIT=0 SCOUTX_RESUME_SPLIT=0 ${cfg#*:}"
  /home/claude/work/fmr/rep2.sh m_${n}_cold "$ev" --compare $B
  /home/claude/work/fmr/rep2.sh m_${n}_warm "$ev" --warm-cache $W --compare $B
done
echo "matrix done" >> /home/claude/work/fmr/status
