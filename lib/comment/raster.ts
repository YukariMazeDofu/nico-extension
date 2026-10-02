import { cssFont, type PlacedComment } from './layout';

const STROKE_WIDTH = 2.8;
const STROKE_OPACITY = 0.4;
const LIVE_OPACITY = 0.5;

/** 縁取りの色（`r g b`）。文字が黒なら白 */
const strokeRgb = (c: PlacedComment) => (c.spec.color.toUpperCase() === '#000000' ? '255 255 255' : '0 0 0');

export const commentOpacity = (c: PlacedComment) => (c.spec.live ? LIVE_OPACITY : 1);

export interface Raster {
  canvas: OffscreenCanvas;
  /** 配置の矩形の左上から見た、ビットマップの左上の位置（px） */
  offsetX: number;
  offsetY: number;
}

/** コメント 1 件を `scale` 倍の大きさでビットマップに描く。縁取りの分だけ配置の矩形より広い。 */
export function rasterize(c: PlacedComment, scale: number): Raster {
  const lineWidth = STROKE_WIDTH * 2 * scale;
  const pad = Math.ceil(lineWidth);
  const lineHeight = c.lineHeight * scale;
  const lines = c.spec.body.split('\n');
  const canvas = new OffscreenCanvas(Math.ceil(c.width * scale) + pad * 2, Math.ceil(c.height * scale) + pad * 2);
  const g = canvas.getContext('2d')!;
  g.font = cssFont(c.spec, c.fontSize * scale);
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = lineWidth;
  g.strokeStyle = `rgb(${strokeRgb(c)} / ${STROKE_OPACITY})`;
  g.fillStyle = c.spec.color;
  // CSS と同じく、フォントの ascent + descent を行の高さの中央に置く
  const m = g.measureText('あ');
  const baseline = (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  lines.forEach((line, i) => {
    const y = pad + i * lineHeight + baseline;
    g.strokeText(line, pad, y);
    g.fillText(line, pad, y);
  });
  return { canvas, offsetX: -pad, offsetY: -pad };
}
