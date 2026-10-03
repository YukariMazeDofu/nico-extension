import { isNgScoreHidden } from '@/lib/comment/ng';
import { layoutComments, type MeasureText, STAGE_HEIGHT, STAGE_WIDTH } from '@/lib/comment/layout';
import { type CommentSpec, toSpec } from '@/lib/comment/spec';
import { CommentTimeline } from '@/lib/comment/timeline';
import { WebGlCommentRenderer } from '@/lib/comment/webgl-renderer';
import { fetchCommentThreads, type NvThread } from '@/lib/nico/comment';
import type { WatchContext } from '@/lib/nico/session';
import { commentSettings, type NgScoreLevel, ngScoreSetting } from '@/lib/settings';
import { createMediaClock } from './clock';

export interface CommentHooks {
  log(msg: string): void;
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

/** `root` を動画の表示域（16:9）に合わせ、その上にコメントを流す。 */
export function mountComments(
  root: HTMLElement,
  video: HTMLVideoElement,
  context: Promise<WatchContext>,
  hooks: CommentHooks,
): CommentView {
  const { log } = hooks;
  let renderer: WebGlCommentRenderer | undefined;
  try {
    renderer = new WebGlCommentRenderer(root);
  } catch (e) {
    log(`comment renderer failed: ${e}`);
  }
  const now = createMediaClock(video);
  let timeline: CommentTimeline | undefined;
  let threads: NvThread[] = [];
  let ngLevel: NgScoreLevel = 'middle';
  let ngDisabled = false;
  let visible = true;
  let playing = false;
  let destroyed = false;
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
    const width = Math.min(stage.clientWidth, (stage.clientHeight * STAGE_WIDTH) / STAGE_HEIGHT);
    const height = (width * STAGE_HEIGHT) / STAGE_WIDTH;
    Object.assign(root.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${(stage.clientWidth - width) / 2}px`,
      top: `${(stage.clientHeight - height) / 2}px`,
    });
    renderer?.setScale(width / STAGE_WIDTH);
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
    log(
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
    if (destroyed) return;
    threads = fetched.threads;
    hooks.onHeatmap(fetched.heatmap, fetched.threads);
    ngDisabled = ctx.data.ngScoreDisabled;
    apply();
  };

  const unwatchNg = ngScoreSetting.watch((level) => {
    ngLevel = level;
    if (!destroyed && threads.length) apply();
  });

  (async () => {
    applyVisible((await commentSettings.getValue()).visible);
    ngLevel = await ngScoreSetting.getValue();
    await load();
  })().catch((e) => log(`comments failed: ${e}`));

  return {
    get visible() {
      return visible;
    },
    setVisible(v) {
      commentSettings.setValue({ visible: v });
      applyVisible(v);
    },
    reload: load,
    destroy() {
      destroyed = true;
      unwatchNg();
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer?.destroy();
    },
  };
}
