#!/bin/bash
# Resumable chunked upload of the reference proxy from the owner's computer (runs on the linked device).
# Usage: device_upload_chunks.sh SESSION_URI_FILE  - stateless: asks GCS for the committed offset, then
# uploads 64 MiB chunks for at most ~150 s, then exits (re-run until it prints DONE).
set -u
URI=$(cat "$1")
F="$HOME/mnt/Mobile Devices/IMG_4809_proxy_10fps.mp4"
TOTAL=$(stat -c%s "$F"); CH=$((64*1024*1024)); START=$(date +%s)
off() {
  h=$(curl -s -o /dev/null -D - -X PUT -H "Content-Length: 0" -H "Content-Range: bytes */$TOTAL" "$URI")
  code=$(echo "$h" | head -1 | awk '{print $2}')
  [ "$code" = 200 ] || [ "$code" = 201 ] && { echo DONE; return; }
  r=$(echo "$h" | tr -d '\r' | awk -F'bytes=0-' '/^[Rr]ange:/{print $2}')
  [ -z "$r" ] && echo 0 || echo $((r+1))
}
while [ $(( $(date +%s) - START )) -lt 150 ]; do
  o=$(off); [ "$o" = DONE ] && { echo DONE; exit 0; }
  n=$(( TOTAL - o < CH ? TOTAL - o : CH )); e=$(( o + n - 1 ))
  t0=$(date +%s.%N)
  code=$(dd if="$F" bs=1M iflag=skip_bytes,count_bytes skip=$o count=$n status=none | \
    curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Content-Length: $n" -H "Content-Range: bytes $o-$e/$TOTAL" --data-binary @- "$URI")
  echo "chunk $o-$e http=$code $(python3 -c "print(round($n/1048576/($(date +%s.%N)-$t0),1))") MiB/s"
  [ "$code" = 200 ] || [ "$code" = 201 ] && { echo DONE; exit 0; }
done
echo "PARTIAL offset=$(off)"
