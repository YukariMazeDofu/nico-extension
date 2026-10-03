#!/bin/sh
# run_probes.sh の 2 回分の出力を、時刻・動画 ID・タイトル・処理時間を伏せて比べる。
# usage: sh scripts/cmp_probes.sh <dirA> <dirB>
norm() {
  grep -vE "^(resp|req |console|/home|  )|\[nico-ext\] (hls|watch event|comments)|DeprecationWarning" "$1" |
    sed -E "s/'t': [0-9.]+/'t': N/g; s/(sm|so|nm)[0-9]+/ID/g; s/'title': '[^']*'/'title': T/g; s/scrollTop': [0-9]+/scrollTop': N/g; s/'current': '[0-9:]+'/'current': C/g; s/in [0-9]+ms/in Nms/g; s/\([0-9]:[0-9]{2}\)/(T)/g"
}
TMP=${TMPDIR:-/tmp}
for f in "$1"/*.txt; do
  b=$(basename "$f")
  echo "=== $b"
  norm "$f" >"$TMP/cmp_a.$$"
  norm "$2/$b" >"$TMP/cmp_b.$$"
  diff "$TMP/cmp_a.$$" "$TMP/cmp_b.$$" | cut -c1-300
done
echo "=== ハートビートとコメントの取得"
for d in "$1" "$2"; do
  echo "-- $d"
  grep -ho "watch event [a-z]* [a-z]*" "$d"/*.txt | sort | uniq -c
  grep -ho "comments: owner[^,]*,[^,]*" "$d"/*.txt | sort | uniq -c
done
rm -f "$TMP/cmp_a.$$" "$TMP/cmp_b.$$"
