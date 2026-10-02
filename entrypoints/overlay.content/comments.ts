import {
  layoutComments,
  type MeasureText,
  type PlacedComment,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  stableRandom,
} from '@/lib/comment/layout';
import { RENDERERS, type RendererKind } from '@/lib/comment/renderers';
import { type CommentSpec, toSpec } from '@/lib/comment/spec';
import { type CommentRenderer, CommentTimeline } from '@/lib/comment/timeline';
import { fetchCommentThreads } from '@/lib/nico/comment';
import type { WatchContext } from '@/lib/nico/session';
import { commentSettings } from '@/lib/settings';
import { type ClockKind, createClock, type MediaClock } from './clock';

const SYNC_INTERVAL_MS = 1000;
/** 負荷試験で複製したコメントをずらす幅 */
const STRESS_SPREAD_MS = 4000;

/** 1 フレーム分の記録 */
export interface FrameSample {
  /** `requestAnimationFrame` の時刻 */
  time: number;
  mediaMs: number;
  /** 出し入れと描画にかかった時間 */
  scriptMs: number;
  shown: number;
}

export interface CommentHooks {
  log(msg: string): void;
  onVisibilityChange(): void;
  onFrame?(sample: FrameSample): void;
}

export interface CommentView {
  readonly visible: boolean;
  readonly renderer: RendererKind;
  readonly stress: number;
  readonly clock: ClockKind;
  setVisible(visible: boolean): void;
  setRenderer(kind: RendererKind): Promise<void>;
  /** 各コメントを `n` 倍に複製して配置し直す（負荷試験用。保存しない） */
  setStress(n: number): void;
  /** コメントを動かす基準の時刻の取り方（比較用。保存しない） */
  setClock(kind: ClockKind): void;
  destroy(): void;
}

function createMeasureText(): MeasureText {
  const g = document.createElement('canvas').getContext('2d')!;
  let current = '';
  return (text, font) => {
    if (font !== current) g.font = current = font;
    return g.measureText(text).width;
  };
}

function multiply(specs: CommentSpec[], n: number): CommentSpec[] {
  const out = [...specs];
  for (let k = 1; k < n; k++) {
    for (const s of specs) {
      const id = `${s.id}#${k}`;
      out.push({ ...s, id, vposMs: Math.max(0, s.vposMs + (stableRandom(id) - 0.5) * STRESS_SPREAD_MS) });
    }
  }
  return out;
}

/** `root` を動画の表示域（16:9）に合わせ、その上にコメントを流す。 */
export function mountComments(
  root: HTMLElement,
  video: HTMLVideoElement,
  context: Promise<WatchContext>,
  hooks: CommentHooks,
): CommentView {
  const { log } = hooks;
  let kind: RendererKind = 'css';
  let renderer: CommentRenderer | undefined;
  let specs: CommentSpec[] = [];
  let placed: PlacedComment[] = [];
  let stress = 1;
  let clockKind: ClockKind = 'currentTime';
  let clock: MediaClock = createClock(clockKind, video);
  let timeline: CommentTimeline | undefined;
  let scale = 1;
  let visible = true;
  let playing = false;
  let destroyed = false;
  let raf = 0;
  let lastSyncAt = 0;

  const now = (time?: number) => clock.now(time);
  const isPlaying = () => !video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const sync = () => {
    lastSyncAt = performance.now();
    renderer?.sync(now(), video.playbackRate, playing);
  };
  const tick = (time: number) => {
    raf = 0;
    if (!timeline || !visible) return;
    const started = performance.now();
    const mediaMs = now(time);
    timeline.update(mediaMs);
    if (started - lastSyncAt > SYNC_INTERVAL_MS) sync();
    hooks.onFrame?.({ time, mediaMs, scriptMs: performance.now() - started, shown: timeline.size });
    if (playing) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const reseek = () => {
    if (!timeline || !visible) return;
    sync();
    timeline.seek(now());
    kick();
  };
  const setPlaying = (p: boolean) => {
    playing = p;
    sync();
    if (p) kick();
  };
  const rebuild = () => {
    timeline?.clear();
    timeline = renderer && placed.length ? new CommentTimeline(placed, renderer) : undefined;
    playing = isPlaying();
    reseek();
  };
  const place = () => {
    const started = performance.now();
    placed = layoutComments(multiply(specs, stress), createMeasureText());
    log(`placed ${placed.length} comments in ${(performance.now() - started).toFixed(0)}ms`);
    rebuild();
  };
  const useRenderer = async (k: RendererKind) => {
    let next: CommentRenderer;
    try {
      next = await RENDERERS[k].create(root);
    } catch (e) {
      log(`renderer ${k} failed: ${e}`);
      if (k === 'css') throw e;
      return useRenderer('css');
    }
    timeline?.clear();
    renderer?.destroy();
    if (destroyed) return next.destroy();
    renderer = next;
    kind = k;
    renderer.setScale(scale);
    log(`renderer: ${k}`);
    rebuild();
  };

  const resize = new ResizeObserver(() => {
    const stage = root.parentElement;
    if (!stage) return;
    const width = Math.min(stage.clientWidth, (stage.clientHeight * STAGE_WIDTH) / STAGE_HEIGHT);
    const height = (width * STAGE_HEIGHT) / STAGE_WIDTH;
    Object.assign(root.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${(stage.clientWidth - width) / 2}px`,
      top: `${(stage.clientHeight - height) / 2}px`,
    });
    scale = width / STAGE_WIDTH;
    renderer?.setScale(scale);
    reseek();
  });
  if (root.parentElement) resize.observe(root.parentElement);

  video.addEventListener('playing', () => setPlaying(true));
  video.addEventListener('pause', () => setPlaying(false));
  video.addEventListener('waiting', () => setPlaying(false));
  video.addEventListener('seeking', () => setPlaying(false));
  video.addEventListener('seeked', () => {
    playing = isPlaying();
    reseek();
  });
  video.addEventListener('ratechange', sync);

  const applyVisible = (v: boolean) => {
    visible = v;
    root.hidden = !v;
    if (v) {
      reseek();
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      timeline?.clear();
    }
    hooks.onVisibilityChange();
  };

  (async () => {
    const settings = await commentSettings.getValue();
    applyVisible(settings.visible);
    await useRenderer(settings.renderer ?? 'css');
    const threads = await fetchCommentThreads(await context);
    if (destroyed) return;
    specs = threads.flatMap((t) => t.comments.map((c) => toSpec(c, t.fork))).filter((s): s is CommentSpec => !!s);
    log(`comments: ${threads.map((t) => `${t.fork}=${t.comments.length}`).join(' ')}`);
    place();
  })().catch((e) => log(`comments failed: ${e}`));

  const save = () => commentSettings.setValue({ visible, renderer: kind });

  return {
    get visible() {
      return visible;
    },
    get renderer() {
      return kind;
    },
    get stress() {
      return stress;
    },
    setVisible(v) {
      applyVisible(v);
      save();
    },
    async setRenderer(k) {
      await useRenderer(k);
      save();
    },
    setStress(n) {
      stress = n;
      if (specs.length) place();
    },
    get clock() {
      return clockKind;
    },
    setClock(k) {
      clock.destroy();
      clockKind = k;
      clock = createClock(k, video);
      reseek();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      clock.destroy();
      timeline?.clear();
      renderer?.destroy();
    },
  };
}
