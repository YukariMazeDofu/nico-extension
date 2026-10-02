import { layoutComments, type MeasureText, STAGE_HEIGHT, STAGE_WIDTH } from '@/lib/comment/layout';
import { type CommentSpec, toSpec } from '@/lib/comment/spec';
import { CommentTimeline } from '@/lib/comment/timeline';
import { WebGlCommentRenderer } from '@/lib/comment/webgl-renderer';
import { fetchCommentThreads } from '@/lib/nico/comment';
import type { WatchContext } from '@/lib/nico/session';
import { commentSettings } from '@/lib/settings';
import { createMediaClock } from './clock';

export interface CommentHooks {
  log(msg: string): void;
  onVisibilityChange(): void;
}

export interface CommentView {
  readonly visible: boolean;
  setVisible(visible: boolean): void;
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

  (async () => {
    applyVisible((await commentSettings.getValue()).visible);
    if (!renderer) return;
    const threads = await fetchCommentThreads(await context);
    if (destroyed) return;
    const specs = threads.flatMap((t) => t.comments.map((c) => toSpec(c, t.fork))).filter((s): s is CommentSpec => !!s);
    const started = performance.now();
    const placed = layoutComments(specs, createMeasureText());
    log(
      `comments: ${threads.map((t) => `${t.fork}=${t.comments.length}`).join(' ')}, ` +
        `placed ${placed.length} in ${(performance.now() - started).toFixed(0)}ms`,
    );
    timeline = new CommentTimeline(placed, renderer);
    playing = isPlaying();
    reseek();
  })().catch((e) => log(`comments failed: ${e}`));

  return {
    get visible() {
      return visible;
    },
    setVisible(v) {
      commentSettings.setValue({ visible: v });
      applyVisible(v);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      renderer?.destroy();
    },
  };
}
