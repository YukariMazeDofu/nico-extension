import { isNgScoreHidden } from '@/lib/comment/ng';
import { layoutComments, type MeasureText, STAGE_HEIGHT, STAGE_WIDTH } from '@/lib/comment/layout';
import { type CommentSpec, toSpec } from '@/lib/comment/spec';
import { CommentTimeline } from '@/lib/comment/timeline';
import { WebGlCommentRenderer } from '@/lib/comment/webgl-renderer';
import { log } from '@/lib/log';
import { fetchCommentThreads, type NvThread } from '@/lib/nico/comment';
import type { WatchContext } from '@/lib/nico/session';
import { bindSetting, commentSettings, type NgScoreLevel, ngScoreSetting } from '@/lib/settings';
import { createMediaClock } from './clock';

export interface CommentHooks {
  onVisibilityChange(): void;
  /** 表示するコメントが決まった（取り直したときと共有 NG レベルを変えたときも呼ぶ）。`ngHidden` は共有 NG レベルで隠した件数 */
  onLoaded(threads: NvThread[], ngHidden: number): void;
  /** コメントを取得した（取り直したときも呼ぶ）。`heatmap` は盛り上がりの値、`threads` は共有 NG レベルで隠す前のもの */
  onHeatmap(heatmap: number[] | null, threads: NvThread[]): void;
}

export interface CommentView {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
  /** コメントを取り直して並べ直す */
  reload(): Promise<void>;
}

function createMeasureText(): MeasureText {
  const g = new OffscreenCanvas(1, 1).getContext('2d')!;
  let current = '';
  return (text, font) => {
    if (font !== current) g.font = current = font;
    return g.measureText(text).width;
  };
}

/** `root`（動画の枠に重ねた要素）にコメントを流す。配置の座標系は、動画の枠を内側に含む最小の 16:9 に当てる。 */
export function mountComments(
  root: HTMLElement,
  video: HTMLVideoElement,
  context: Promise<WatchContext>,
  hooks: CommentHooks,
  signal: AbortSignal,
): CommentView {
  let renderer: WebGlCommentRenderer | undefined;
  try {
    renderer = new WebGlCommentRenderer(root);
  } catch (e) {
    log.error(`comment renderer failed: ${e}`);
  }
  const now = createMediaClock(video);
  let timeline: CommentTimeline | undefined;
  let threads: NvThread[] = [];
  let ngLevel: NgScoreLevel = 'middle';
  let ngDisabled = false;
  let visible = true;
  let playing = false;
  let raf = 0;

  const isPlaying = () => !video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  const tick = (time: number) => {
    raf = 0;
    if (!timeline || !visible) return;
    timeline.update(now(time));
    if (playing) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const reseek = () => {
    if (!timeline || !visible) return;
    timeline.seek(now());
    kick();
  };
  const setPlaying = (p: boolean) => {
    playing = p;
    kick();
  };

  const resize = new ResizeObserver(() => {
    const stage = root.parentElement;
    if (!stage) return;
    const { clientWidth: width, clientHeight: height } = stage;
    const stageWidth = Math.max(width, (height * STAGE_WIDTH) / STAGE_HEIGHT);
    const stageHeight = (stageWidth * STAGE_HEIGHT) / STAGE_WIDTH;
    renderer?.setView({
      width,
      height,
      scale: stageWidth / STAGE_WIDTH,
      x: (width - stageWidth) / 2,
      y: (height - stageHeight) / 2,
    });
    reseek();
  });
  if (root.parentElement) resize.observe(root.parentElement);
  signal.addEventListener(
    'abort',
    () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer?.destroy();
    },
    { once: true },
  );

  const on = (type: keyof HTMLMediaElementEventMap, listener: () => void) => video.addEventListener(type, listener, { signal });
  on('playing', () => setPlaying(true));
  on('pause', () => setPlaying(false));
  on('waiting', () => setPlaying(false));
  on('seeking', () => setPlaying(false));
  on('seeked', () => {
    playing = isPlaying();
    reseek();
  });

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

  const apply = () => {
    const level = ngDisabled ? 'none' : ngLevel;
    const shown = threads.map((t) => ({ ...t, comments: t.comments.filter((c) => !isNgScoreHidden(c, level)) }));
    const total = (ts: NvThread[]) => ts.reduce((n, t) => n + t.comments.length, 0);
    const ngHidden = total(threads) - total(shown);
    hooks.onLoaded(shown, ngHidden);
    if (!renderer) return;
    const specs = shown.flatMap((t) => t.comments.map((c) => toSpec(c, t.fork))).filter((s): s is CommentSpec => !!s);
    const started = performance.now();
    const placed = layoutComments(specs, createMeasureText());
    log.info(
      `comments: ${threads.map((t) => `${t.fork}=${t.comments.length}`).join(' ')}, ng(${level}) hidden ${ngHidden}, ` +
        `placed ${placed.length} in ${(performance.now() - started).toFixed(0)}ms`,
    );
    timeline?.clear();
    timeline = new CommentTimeline(placed, renderer);
    playing = isPlaying();
    reseek();
  };

  const load = async () => {
    const ctx = await context;
    const fetched = await fetchCommentThreads(ctx);
    if (signal.aborted) return;
    threads = fetched.threads;
    hooks.onHeatmap(fetched.heatmap, fetched.threads);
    ngDisabled = ctx.data.ngScoreDisabled;
    apply();
  };

  Promise.all([
    bindSetting(commentSettings, (v) => v.visible !== visible && applyVisible(v.visible), signal),
    bindSetting(
      ngScoreSetting,
      (level) => {
        if (level === ngLevel) return;
        ngLevel = level;
        if (threads.length) apply();
      },
      signal,
    ),
  ])
    .then(load)
    .catch((e) => log.error(`comments failed: ${e}`));

  return {
    get visible() {
      return visible;
    },
    setVisible(v) {
      commentSettings.setValue({ visible: v });
      applyVisible(v);
    },
    reload: load,
  };
}
