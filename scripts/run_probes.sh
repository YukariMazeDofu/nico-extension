#!/bin/sh
# プローブを同時に流し、各プローブの出力を <outdir>/<name>.txt に保存する。拡張は .output/chrome-mv3 のビルドを使う。
# usage: [PLAYWRIGHT_BROWSERS_PATH=<dir>] sh scripts/run_probes.sh <outdir> [ext direct visited layout post list ng heatmap resume]
OUT=$1
shift
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd) || exit 1
cd "$(dirname "$0")/.." || exit 1
E=.output/chrome-mv3
PROBES=${*:-"ext direct visited layout post list ng heatmap resume"}

run() {
  name=$1
  shift
  uv run "$@" >"$OUT/$name.txt" 2>&1
  echo "exit $?" >>"$OUT/$name.txt"
}

for p in $PROBES; do
  case $p in
    ext) run ext scripts/ext_probe.py $E https://www.nicovideo.jp/ 20 sm46871555 --recover ;;
    direct) run direct scripts/direct_probe.py $E sm9 ;;
    visited) run visited scripts/visited_probe.py $E ;;
    layout) run layout scripts/layout_probe.py $E sm46871555 ;;
    post) run post scripts/post_probe.py $E sm27201969 ;;
    list) run list scripts/list_probe.py $E sm27201969 ;;
    ng) run ng scripts/ng_probe.py $E sm9 ;;
    heatmap) run heatmap scripts/heatmap_probe.py $E sm9 ;;
    resume) run resume scripts/resume_probe.py $E sm9 ;;
  esac &
done
wait
for f in "$OUT"/*.txt; do echo "== $f: $(tail -n 1 "$f")"; done
