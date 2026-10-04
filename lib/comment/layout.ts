import type { CommentFont, CommentLoc, CommentSize, CommentSpec } from './spec';

/** 配置の座標系。描画時に実際の大きさへ縮める。 */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** 基準の枠（高さ × 4/3）。座標系の横の中央に置く */
const BASE_WIDTH = (STAGE_HEIGHT * 4) / 3;
const BASE_LEFT = (STAGE_WIDTH - BASE_WIDTH) / 2;
const BASE_RIGHT = BASE_LEFT + BASE_WIDTH;
/** 文字の大きさ = `STAGE_HEIGHT` / 値 */
const CHARACTER_COUNT: Record<CommentSize, number> = { big: 7.8, medium: 11.3, small: 16.6 };
/** 行の高さの値（通常 / 改行で縮小） */
const LINE_COUNT: Record<CommentSize, { default: number; resized: number }> = {
  big: { default: 8.4, resized: 16 },
  medium: { default: 13.1, resized: 25.4 },
  small: { default: 21, resized: 38 },
};
const LINE_BREAK_COUNT: Record<CommentSize, number> = { big: 3, medium: 5, small: 7 };
/** フォントサイズ = 文字の大きさ × 値 */
const FONT_SIZE_RATIO = 0.8;

/** 流れるコメントが基準の枠の右端にある時刻の、`vposMs` からの前倒し */
const NAKA_LEAD_MS = 1000;
/** 流れるコメントを基準の枠の外で描く前後の時間 */
const NAKA_MARGIN_MS = 1000;
const PRUNE_MARGIN_MS = 5000;

export const FONTS: Record<CommentFont, { family: string; weight: number }> = {
  defont: { family: 'Arial, "ＭＳ Ｐゴシック", "MS PGothic", MSPGothic, "Hiragino Sans", sans-serif', weight: 600 },
  gothic: { family: '"游ゴシック体", "游ゴシック", "Yu Gothic", YuGothic, SimSun, Arial, sans-serif', weight: 400 },
  mincho: { family: '"游明朝体", "游明朝", "Yu Mincho", YuMincho, SimSun, Arial, serif', weight: 400 },
};

export interface PlacedComment {
  spec: CommentSpec;
  /** 0: 一般（main / easy）、1: 投稿者。レイヤーごとに当たり判定を分ける */
  layer: 0 | 1;
  /** 文字の大きさ。フォントサイズはこの `FONT_SIZE_RATIO` 倍 */
  characterSize: number;
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
  y: number;
  startMs: number;
  endMs: number;
  /** `startMs` での左端の x */
  x0: number;
  /** 左向きの速さ（px/ms）。固定コメントは 0 */
  speed: number;
}

export const xAt = (c: PlacedComment, ms: number) => c.x0 - (ms - c.startMs) * c.speed;

export type MeasureText = (text: string, font: string) => number;

export const cssFont = (spec: CommentSpec, size: number) => {
  const f = FONTS[spec.font];
  return `${f.weight} ${size}px ${f.family}`;
};

function measure(spec: CommentSpec, measureText: MeasureText) {
  const lines = spec.body.split('\n');
  const count = LINE_COUNT[spec.size];
  let characterSize = STAGE_HEIGHT / CHARACTER_COUNT[spec.size];
  let lineHeight = (STAGE_HEIGHT - characterSize) / (count.default - 1);
  if (!spec.ender && lines.length >= LINE_BREAK_COUNT[spec.size]) {
    const resized = (STAGE_HEIGHT - (characterSize * count.default) / count.resized) / (count.resized - 1);
    characterSize *= resized / lineHeight;
    lineHeight = resized;
  }
  const font = cssFont(spec, characterSize * FONT_SIZE_RATIO);
  let width = Math.max(...lines.map((l) => measureText(l, font)));
  if (spec.loc !== 'naka' && !spec.ender) {
    const limit = spec.full ? STAGE_WIDTH : BASE_WIDTH;
    if (width > limit) {
      const k = limit / width;
      characterSize *= k;
      lineHeight *= k;
      width = limit;
    }
  }
  return {
    characterSize,
    fontSize: characterSize * FONT_SIZE_RATIO,
    lineHeight,
    width,
    height: lineHeight * (lines.length - 1) + characterSize,
  };
}

function timing(spec: CommentSpec, width: number) {
  if (spec.loc !== 'naka') {
    return { startMs: spec.vposMs, endMs: spec.vposMs + spec.durationMs, x0: (STAGE_WIDTH - width) / 2, speed: 0 };
  }
  const speed = (BASE_WIDTH + width) / (spec.durationMs + NAKA_LEAD_MS);
  return {
    startMs: spec.vposMs - NAKA_LEAD_MS - NAKA_MARGIN_MS,
    endMs: spec.vposMs + spec.durationMs + NAKA_MARGIN_MS,
    x0: BASE_RIGHT + speed * NAKA_MARGIN_MS,
    speed,
  };
}

function nakaConflicts(a: PlacedComment, b: PlacedComment): boolean {
  // 基準の枠に掛かっている時間
  const window = (c: PlacedComment): [number, number] => [
    c.startMs + (c.x0 - BASE_RIGHT) / c.speed,
    c.startMs + (c.x0 + c.width - BASE_LEFT) / c.speed,
  ];
  const [aIn, aOut] = window(a);
  const [bIn, bOut] = window(b);
  const t1 = Math.max(aIn, bIn);
  const t2 = Math.min(aOut, bOut);
  if (t1 > t2) return false;
  // 位置の差は時刻に対して線形。区間の両端で前後関係が同じなら、区間内でも重ならない
  const behind = (p: PlacedComment, q: PlacedComment, t: number) => xAt(p, t) - (xAt(q, t) + q.width) >= 0;
  return !((behind(b, a, t1) && behind(b, a, t2)) || (behind(a, b, t1) && behind(a, b, t2)));
}

const fixedConflicts = (a: PlacedComment, b: PlacedComment) => a.startMs < b.endMs && b.startMs < a.endMs;

/** id から [0, 1) の値を決める。同じ id には常に同じ値を返す。 */
function stableRandom(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** 上（shita は下）から順に、衝突する既存コメントを避けた位置を探す。収まらなければランダムな位置に置く。 */
function findOffset(c: PlacedComment, others: PlacedComment[], offsetOf: (o: PlacedComment) => number): number {
  const blocking = others.map((o) => ({ top: offsetOf(o), bottom: offsetOf(o) + o.height })).sort((p, q) => p.top - q.top);
  let offset = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (const b of blocking) {
      if (b.top < offset + c.height && offset < b.bottom) {
        offset = b.bottom;
        changed = true;
      }
    }
  }
  return offset + c.height <= STAGE_HEIGHT ? offset : stableRandom(c.spec.id) * (STAGE_HEIGHT - c.height);
}

/** コメントを座標系に配置し、表示開始の早い順に返す。 */
export function layoutComments(specs: CommentSpec[], measureText: MeasureText): PlacedComment[] {
  const placed: PlacedComment[] = [];
  const active = new Map<string, PlacedComment[]>();
  const sorted = [...specs].sort((a, b) => a.vposMs - b.vposMs);
  for (const spec of sorted) {
    const size = measure(spec, measureText);
    const c: PlacedComment = { spec, layer: spec.fork === 'owner' ? 1 : 0, ...size, ...timing(spec, size.width), y: 0 };
    const key = `${c.layer}:${spec.loc}`;
    const list = (active.get(key) ?? []).filter((o) => o.endMs >= spec.vposMs - PRUNE_MARGIN_MS);
    active.set(key, list);
    if (c.height >= STAGE_HEIGHT) {
      c.y = (STAGE_HEIGHT - c.height) / 2;
    } else if (spec.loc === 'naka') {
      c.y = findOffset(c, list.filter((o) => nakaConflicts(o, c)), (o) => o.y);
    } else {
      const conflicts = list.filter((o) => fixedConflicts(o, c));
      c.y = spec.loc === 'ue' ? findOffset(c, conflicts, (o) => o.y) : STAGE_HEIGHT - c.height - findOffset(c, conflicts, (o) => STAGE_HEIGHT - o.y - o.height);
    }
    list.push(c);
    placed.push(c);
  }
  return placed.sort((a, b) => a.startMs - b.startMs);
}
