import { RENDERER_KINDS, RENDERERS, type RendererKind } from '@/lib/comment/renderers';
import { CLOCK_LABELS, type ClockKind } from './clock';
import type { CommentView, FrameSample } from './comments';

const STRESS_LEVELS = [1, 3, 10];
const WARMUP_MS = 1000;
const MEASURE_MS = 10000;
const LIVE_WINDOW = 120;

export interface BenchResult {
  renderer: RendererKind;
  stress: number;
  clock: ClockKind;
  rate: number;
  fps: number;
  /** フレーム間隔（ms） */
  interval: { p50: number; p95: number; p99: number };
  /** 間隔が中央値の 1.5 倍を超えたフレーム */
  dropped: number;
  /** 出し入れと描画の時間（ms / フレーム） */
  script: { avg: number; p95: number };
  shown: { avg: number; max: number };
  /** 前のフレームからの動画の時刻の進みと、実時間 × 速度との差（ms） */
  clockError: { p95: number; max: number };
  /** 50ms を超えた long animation frame */
  longFrames: { count: number; blockingMs: number };
}

export interface BenchPanel {
  readonly element: HTMLElement;
  toggle(): void;
  onFrame(sample: FrameSample): void;
  /** 3 方式を順に同じ位置から計測する */
  run(): Promise<BenchResult[]>;
  destroy(): void;
}

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))]!;
};
const round = (x: number, d = 1) => Number(x.toFixed(d));

function summarize(samples: FrameSample[], rate: number): Omit<BenchResult, 'renderer' | 'stress' | 'clock' | 'longFrames'> {
  const intervals: number[] = [];
  const clock: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    intervals.push(b.time - a.time);
    clock.push(Math.abs(b.mediaMs - a.mediaMs - (b.time - a.time) * rate));
  }
  const median = percentile(intervals, 50);
  const span = samples.length > 1 ? samples.at(-1)!.time - samples[0]!.time : 0;
  const script = samples.map((s) => s.scriptMs);
  const shown = samples.map((s) => s.shown);
  return {
    rate,
    fps: span ? round(((samples.length - 1) * 1000) / span) : 0,
    interval: { p50: round(median), p95: round(percentile(intervals, 95)), p99: round(percentile(intervals, 99)) },
    dropped: intervals.filter((x) => x > median * 1.5).length,
    script: { avg: round(script.reduce((a, b) => a + b, 0) / (script.length || 1), 2), p95: round(percentile(script, 95), 2) },
    shown: { avg: round(shown.reduce((a, b) => a + b, 0) / (shown.length || 1)), max: Math.max(0, ...shown) },
    clockError: { p95: round(percentile(clock, 95)), max: round(Math.max(0, ...clock)) },
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

/** 描画方式の切り替えと計測のパネル。 */
export function createBenchPanel(video: HTMLVideoElement, comments: CommentView, log: (msg: string) => void): BenchPanel {
  const element = el('div', 'bench');
  element.hidden = true;
  const renderer = el('select', 'bench-renderer');
  for (const k of RENDERER_KINDS) renderer.append(new Option(RENDERERS[k].label, k));
  const stress = el('select', 'bench-stress');
  for (const n of STRESS_LEVELS) stress.append(new Option(`×${n}`, String(n)));
  const clock = el('select', 'bench-clock');
  for (const [k, label] of Object.entries(CLOCK_LABELS)) clock.append(new Option(label, k));
  const runButton = el('button', 'bench-run', '計測');
  const live = el('div', 'bench-live');
  const table = el('table', 'bench-results');
  const head = el('div', 'bench-head');
  head.append(renderer, stress, clock, runButton);
  element.append(head, live, table);

  const recent: FrameSample[] = [];
  let recording: FrameSample[] | undefined;
  let running = false;
  let liveTimer: ReturnType<typeof setInterval> | undefined;

  const longFrames: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => longFrames.push(...list.getEntries()));
  try {
    observer.observe({ type: 'long-animation-frame' });
  } catch {
    // long-animation-frame に未対応
  }

  const renderSelects = () => {
    renderer.value = comments.renderer;
    stress.value = String(comments.stress);
    clock.value = comments.clock;
  };
  const renderLive = () => {
    const s = summarize(recent, video.playbackRate);
    live.textContent =
      `${RENDERERS[comments.renderer].label}  ${s.fps} fps  間隔 p95 ${s.interval.p95}ms  ` +
      `処理 ${s.script.avg}ms (p95 ${s.script.p95})  表示 ${s.shown.avg} 件  時刻誤差 p95 ${s.clockError.p95}ms`;
  };
  const renderResults = (results: BenchResult[]) => {
    const row = (cells: (string | number)[], tag: 'th' | 'td') => {
      const tr = el('tr', '');
      for (const c of cells) tr.append(el(tag, '', String(c)));
      return tr;
    };
    table.replaceChildren(
      row(['方式', '条件', 'fps', '間隔 p50/p95/p99', '落ち', '処理 avg/p95', '表示 avg/max', '時刻誤差 p95', 'LoAF'], 'th'),
      ...results.map((r) =>
        row(
          [
            RENDERERS[r.renderer].label,
            `×${r.stress} ${CLOCK_LABELS[r.clock]} ${r.rate}x`,
            r.fps,
            `${r.interval.p50}/${r.interval.p95}/${r.interval.p99}`,
            r.dropped,
            `${r.script.avg}/${r.script.p95}`,
            `${r.shown.avg}/${r.shown.max}`,
            r.clockError.p95,
            `${r.longFrames.count} (${r.longFrames.blockingMs}ms)`,
          ],
          'td',
        ),
      ),
    );
  };

  const wait = (ms: number) => new Promise((f) => setTimeout(f, ms));
  const seekTo = (t: number) =>
    new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      video.currentTime = t;
    });

  const measure = async (kind: RendererKind, start: number): Promise<BenchResult> => {
    await comments.setRenderer(kind);
    await seekTo(start);
    await video.play();
    await wait(WARMUP_MS);
    longFrames.length = 0;
    recording = [];
    await wait(MEASURE_MS);
    const samples = recording;
    recording = undefined;
    const blocking = longFrames.reduce((a, e) => a + ((e as PerformanceEntry & { blockingDuration?: number }).blockingDuration ?? 0), 0);
    return {
      renderer: comments.renderer,
      stress: comments.stress,
      clock: comments.clock,
      ...summarize(samples, video.playbackRate),
      longFrames: { count: longFrames.length, blockingMs: Math.round(blocking) },
    };
  };

  const run = async () => {
    if (running) return [];
    running = true;
    runButton.disabled = true;
    const original = comments.renderer;
    const start = video.currentTime;
    const results: BenchResult[] = [];
    try {
      for (const kind of RENDERER_KINDS) {
        live.textContent = `${RENDERERS[kind].label} を計測中…`;
        results.push(await measure(kind, start));
        renderResults(results);
      }
      log(`bench ${JSON.stringify(results)}`);
    } finally {
      await comments.setRenderer(original);
      renderSelects();
      running = false;
      runButton.disabled = false;
    }
    return results;
  };

  renderer.addEventListener('change', () => comments.setRenderer(renderer.value as RendererKind).then(renderSelects));
  stress.addEventListener('change', () => comments.setStress(Number(stress.value)));
  clock.addEventListener('change', () => comments.setClock(clock.value as ClockKind));
  runButton.addEventListener('click', () => run());

  return {
    element,
    toggle() {
      element.hidden = !element.hidden;
      clearInterval(liveTimer);
      if (!element.hidden) {
        renderSelects();
        liveTimer = setInterval(() => running || renderLive(), 500);
      }
    },
    onFrame(sample) {
      recent.push(sample);
      if (recent.length > LIVE_WINDOW) recent.shift();
      recording?.push(sample);
    },
    run,
    destroy() {
      clearInterval(liveTimer);
      observer.disconnect();
    },
  };
}
