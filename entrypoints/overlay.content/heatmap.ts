import { refineHeatmap } from '@/lib/comment/heatmap';
import { seekHeatmapGammaSetting, seekHeatmapSetting } from '@/lib/settings';

const BINS = 200;
/** 盛り上がりの低い側から高い側への色（OKLCH）。青・水色・緑・黄・橙・赤の順 */
const RAINBOW = [
  { l: 0.47, c: 0.17, h: 262 },
  { l: 0.62, c: 0.12, h: 215 },
  { l: 0.65, c: 0.17, h: 145 },
  { l: 0.77, c: 0.16, h: 100 },
  { l: 0.64, c: 0.18, h: 55 },
  { l: 0.54, c: 0.21, h: 27 },
];
function rainbow(t: number): string {
  const x = Math.min(Math.max(t, 0), 1) * (RAINBOW.length - 1);
  const i = Math.min(Math.floor(x), RAINBOW.length - 2);
  const a = RAINBOW[i]!;
  const b = RAINBOW[i + 1]!;
  const f = x - i;
  const mix = (p: number, q: number) => p + (q - p) * f;
  return `oklch(${mix(a.l, b.l).toFixed(3)} ${mix(a.c, b.c).toFixed(3)} ${mix(a.h, b.h).toFixed(1)})`;
}

function heatGradient(values: number[], gamma: number): string {
  const stops = values.map((t, j) => `${rainbow(t ** gamma)} ${(((j + 0.5) / values.length) * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export interface HeatmapSource {
  /** `voltageZone.heatmap` */
  heatmap: number[];
  vposMs: number[];
}

/** シークバーの帯を盛り上がりの色（`--heat`）にし、`heat` クラスを付ける。表示と強調の設定に追従する。 */
export function mountSeekHeatmap(
  track: HTMLElement,
  video: HTMLVideoElement,
): { set(source: HeatmapSource | null): void; destroy(): void } {
  let source: HeatmapSource | null = null;
  let values: number[] | null = null;
  let visible = true;
  let gamma = 2;
  const paint = () => {
    if (values && visible) {
      track.style.setProperty('--heat', heatGradient(values, gamma));
      track.classList.add('heat');
    } else {
      track.style.removeProperty('--heat');
      track.classList.remove('heat');
    }
  };
  const refine = () => {
    values =
      source && video.duration > 0 ? refineHeatmap(source.heatmap, source.vposMs, video.duration * 1000, BINS) : null;
    paint();
  };
  const applyVisible = (v: boolean) => {
    visible = v;
    paint();
  };
  const applyGamma = (g: number) => {
    gamma = g;
    paint();
  };
  seekHeatmapSetting.getValue().then(applyVisible);
  seekHeatmapGammaSetting.getValue().then(applyGamma);
  const unwatch = [seekHeatmapSetting.watch(applyVisible), seekHeatmapGammaSetting.watch(applyGamma)];
  video.addEventListener('durationchange', refine);
  return {
    set(s) {
      source = s;
      refine();
    },
    destroy() {
      for (const u of unwatch) u();
      video.removeEventListener('durationchange', refine);
    },
  };
}
