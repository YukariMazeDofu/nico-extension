/** 平滑化の重み（中心からの距離ごと） */
const KERNEL = [6, 5, 3, 1];

/**
 * `voltageZone.heatmap`（動画を等分した区間ごとの値）を、区間内のコメントの `vposMs` の分布で `bins` 区間に振り分ける。
 * 件数の少ない区間の揺れは、各区間に平均の件数を足して抑え、前後の区間と平滑化する。
 * `heatmap` の最大を 1 とした値（1 を超える分は 1）を返す。
 */
export function refineHeatmap(heatmap: number[], vposMs: number[], durationMs: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(Math.max(2, vposMs.length / bins));
  for (const v of vposMs) {
    const j = Math.min(bins - 1, Math.max(0, Math.floor((v / durationMs) * bins)));
    counts[j] = (counts[j] ?? 0) + 1;
  }
  const coarseOf = (j: number) => Math.min(heatmap.length - 1, Math.floor(((j + 0.5) / bins) * heatmap.length));
  const fine = heatmap.flatMap((value, b) => {
    const members = counts.filter((_, j) => coarseOf(j) === b);
    const mean = members.reduce((a, c) => a + c, 0) / members.length;
    return members.map((c) => (Math.max(value, 0) * c) / mean);
  });
  const smooth = fine.map((_, j) => {
    let sum = 0;
    let weight = 0;
    for (let d = 1 - KERNEL.length; d < KERNEL.length; d++) {
      const v = fine[j + d];
      const w = KERNEL[Math.abs(d)] ?? 0;
      if (v === undefined) continue;
      sum += v * w;
      weight += w;
    }
    return sum / weight;
  });
  const max = Math.max(...heatmap);
  return smooth.map((v) => (max > 0 ? Math.min(v / max, 1) : 0));
}
