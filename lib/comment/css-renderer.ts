import { cssFont, type PlacedComment, xAt } from './layout';
import type { CommentRenderer } from './timeline';

const STROKE_WIDTH = 2.8;
const STROKE_OPACITY = 0.4;
const LIVE_OPACITY = 0.5;
const DRIFT_TOLERANCE_MS = 50;

/** コメント 1 件を 1 要素にし、transform と opacity の Web Animation で動かす（合成スレッドで進む）。 */
export class CssCommentRenderer implements CommentRenderer {
  private scale = 1;
  private rate = 1;
  private playing = false;
  private readonly items = new Map<PlacedComment, Animation>();
  private readonly layers: [HTMLElement, HTMLElement];

  constructor(root: HTMLElement) {
    const layer = () => {
      const el = document.createElement('div');
      el.className = 'comment-layer';
      root.append(el);
      return el;
    };
    this.layers = [layer(), layer()];
  }

  setScale(scale: number) {
    this.scale = scale;
  }

  show(c: PlacedComment, nowMs: number) {
    const k = this.scale;
    const el = document.createElement('div');
    el.className = 'comment';
    el.textContent = c.spec.body;
    const stroke = c.spec.color.toUpperCase() === '#000000' ? '255 255 255' : '0 0 0';
    Object.assign(el.style, {
      top: `${c.y * k}px`,
      font: cssFont(c.spec, c.fontSize * k),
      lineHeight: `${c.lineHeight * k}px`,
      color: c.spec.color,
      webkitTextStroke: `${STROKE_WIDTH * 2 * k}px rgb(${stroke} / ${STROKE_OPACITY})`,
    });
    this.layers[c.layer].append(el);
    const opacity = c.spec.live ? LIVE_OPACITY : 1;
    const anim = el.animate(
      [
        { transform: `translateX(${c.x0 * k}px)`, opacity },
        { transform: `translateX(${xAt(c, c.endMs) * k}px)`, opacity },
      ],
      { duration: c.endMs - c.startMs, easing: 'linear', fill: 'none' },
    );
    this.items.set(c, anim);
    this.align(c, anim, nowMs, true);
  }

  hide(c: PlacedComment) {
    const anim = this.items.get(c);
    if (!anim) return;
    anim.cancel();
    (anim.effect as KeyframeEffect).target?.remove();
    this.items.delete(c);
  }

  sync(nowMs: number, rate: number, playing: boolean) {
    this.rate = rate;
    this.playing = playing;
    for (const [c, anim] of this.items) this.align(c, anim, nowMs, false);
  }

  clear() {
    for (const c of [...this.items.keys()]) this.hide(c);
  }

  private align(c: PlacedComment, anim: Animation, nowMs: number, force: boolean) {
    const target = nowMs - c.startMs;
    if (anim.playbackRate !== this.rate) anim.playbackRate = this.rate;
    // 動作中に play() を呼ぶと合成スレッドで開始し直して数フレーム遅れる。終了済みに play() すると先頭に戻る
    const run = this.playing && target < c.endMs - c.startMs;
    if (run && anim.playState !== 'running') anim.play();
    else if (!run && anim.playState !== 'paused') anim.pause();
    if (force || Math.abs(Number(anim.currentTime ?? 0) - target) > DRIFT_TOLERANCE_MS) anim.currentTime = target;
  }
}
