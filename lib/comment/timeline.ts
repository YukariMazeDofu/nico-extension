import type { PlacedComment } from './layout';

/** 描画方式ごとの実装。座標は配置の座標系で渡す。 */
export interface CommentRenderer {
  /** 配置の座標系から描画先の px への倍率 */
  setScale(scale: number): void;
  show(c: PlacedComment, nowMs: number): void;
  hide(c: PlacedComment): void;
  /** 表示中のコメントを動画の時刻と再生状態に合わせる */
  sync(nowMs: number, rate: number, playing: boolean): void;
  clear(): void;
}

const LOOKAHEAD_MS = 500;

/** 動画の時刻に応じて、表示するコメントを描画器に出し入れする。 */
export class CommentTimeline {
  private next = 0;
  private readonly shown = new Set<PlacedComment>();

  /** `comments` は `startMs` の昇順 */
  constructor(
    private readonly comments: PlacedComment[],
    private readonly renderer: CommentRenderer,
  ) {}

  update(nowMs: number) {
    for (let c; (c = this.comments[this.next]) && c.startMs <= nowMs + LOOKAHEAD_MS; this.next++) {
      if (c.endMs > nowMs) this.show(c, nowMs);
    }
    for (const c of this.shown) {
      if (c.endMs <= nowMs) {
        this.renderer.hide(c);
        this.shown.delete(c);
      }
    }
  }

  /** 表示中のコメントを捨てて、`nowMs` の時点から並べ直す。 */
  seek(nowMs: number) {
    this.clear();
    let lo = 0;
    let hi = this.comments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.comments[mid]!.startMs <= nowMs + LOOKAHEAD_MS) lo = mid + 1;
      else hi = mid;
    }
    this.next = lo;
    for (const c of this.comments.slice(0, lo)) {
      if (c.endMs > nowMs) this.show(c, nowMs);
    }
  }

  clear() {
    this.renderer.clear();
    this.shown.clear();
    this.next = 0;
  }

  private show(c: PlacedComment, nowMs: number) {
    this.renderer.show(c, nowMs);
    this.shown.add(c);
  }
}
