import { STAGE_HEIGHT, STAGE_WIDTH, type PlacedComment, xAt } from './layout';
import { commentOpacity, rasterize } from './raster';
import type { CommentRenderer } from './timeline';

/** 描画先の px での矩形 */
export interface Sprite<T> {
  texture: T;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

interface Entry<T> {
  texture: T;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** コメントを表示の開始時に 1 回だけビットマップにし、毎フレームは位置だけを決めて GPU で重ねる描画器の共通部分。 */
export abstract class CanvasCommentRenderer<T> implements CommentRenderer {
  protected readonly canvas: HTMLCanvasElement;
  /** 配置の座標系から canvas の px への倍率 */
  private scale = 1;
  /** 投稿者のレイヤーを上に重ねる。各レイヤーの中は表示した順 */
  private readonly layers: [Map<PlacedComment, Entry<T>>, Map<PlacedComment, Entry<T>>] = [new Map(), new Map()];
  private readonly visible: Sprite<T>[] = [];

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'comment-canvas';
    root.append(this.canvas);
  }

  protected abstract upload(source: OffscreenCanvas): T;
  protected abstract release(texture: T): void;
  protected abstract resize(width: number, height: number): void;
  protected abstract draw(sprites: readonly Sprite<T>[]): void;
  protected abstract dispose(): void;

  setScale(scale: number) {
    this.scale = scale * devicePixelRatio;
    const width = Math.round(STAGE_WIDTH * this.scale);
    const height = Math.round(STAGE_HEIGHT * this.scale);
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.resize(width, height);
  }

  show(c: PlacedComment) {
    const r = rasterize(c, this.scale);
    this.layers[c.layer].set(c, {
      texture: this.upload(r.canvas),
      offsetX: r.offsetX,
      offsetY: r.offsetY,
      width: r.canvas.width,
      height: r.canvas.height,
    });
  }

  hide(c: PlacedComment) {
    const layer = this.layers[c.layer];
    const e = layer.get(c);
    if (!e) return;
    this.release(e.texture);
    layer.delete(c);
  }

  sync() {}

  frame(nowMs: number) {
    const k = this.scale;
    const out = this.visible;
    out.length = 0;
    for (const layer of this.layers) {
      for (const [c, e] of layer) {
        if (nowMs < c.startMs || nowMs >= c.endMs) continue;
        out.push({
          texture: e.texture,
          x: xAt(c, nowMs) * k + e.offsetX,
          y: Math.round(c.y * k + e.offsetY),
          width: e.width,
          height: e.height,
          opacity: commentOpacity(c),
        });
      }
    }
    this.draw(out);
  }

  clear() {
    for (const layer of this.layers) {
      for (const e of layer.values()) this.release(e.texture);
      layer.clear();
    }
    this.draw([]);
  }

  destroy() {
    this.clear();
    this.dispose();
    this.canvas.remove();
  }
}
