import type { CommentFork, NvComment } from '@/lib/nico/comment';

export type CommentLoc = 'naka' | 'ue' | 'shita';
export type CommentSize = 'big' | 'medium' | 'small';
export type CommentFont = 'defont' | 'mincho' | 'gothic';

export interface CommentSpec {
  id: string;
  fork: CommentFork;
  vposMs: number;
  body: string;
  loc: CommentLoc;
  size: CommentSize;
  font: CommentFont;
  color: string;
  durationMs: number;
  /** `_live`: 半透明 */
  live: boolean;
  /** `full`: 固定コメントの縮小幅を全幅にする */
  full: boolean;
  /** `ender`: 改行による縮小と幅の縮小をしない */
  ender: boolean;
}

const WHITE = '#FFFFFF';

const COLORS: Record<string, string> = {
  white: WHITE,
  red: '#FF0000',
  pink: '#FF8080',
  orange: '#FFC000',
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  blue: '#0000FF',
  purple: '#C000FF',
  black: '#000000',
  white2: '#CCCC99',
  niconicowhite: '#CCCC99',
  red2: '#CC0033',
  truered: '#CC0033',
  pink2: '#FF33CC',
  orange2: '#FF6600',
  passionorange: '#FF6600',
  yellow2: '#999900',
  madyellow: '#999900',
  green2: '#00CC66',
  elementalgreen: '#00CC66',
  cyan2: '#00CCCC',
  blue2: '#3399FF',
  marinblue: '#3399FF',
  purple2: '#6633CC',
  nobleviolet: '#6633CC',
  black2: '#666666',
};

const DEFAULT_DURATION_MS = 3000;
const MAX_DURATION_MS = 120_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DURATION = /^[@＠](\d+(?:\.\d+)?)$/;
const NICOSCRIPT = /^[@＠]/;

/** コメントのコマンドを解釈する。表示しないコメント（`invisible`、投稿者のニコスクリプト）は undefined。 */
export function toSpec(c: NvComment, fork: CommentFork): CommentSpec | undefined {
  if (fork === 'owner' && NICOSCRIPT.test(c.body)) return undefined;
  const spec: CommentSpec = {
    id: c.id,
    fork,
    vposMs: c.vposMs,
    body: c.body,
    loc: 'naka',
    size: 'medium',
    font: 'defont',
    color: WHITE,
    durationMs: DEFAULT_DURATION_MS,
    live: false,
    full: false,
    ender: false,
  };
  const seen = new Set<string>();
  const once = (kind: string) => !seen.has(kind) && !!seen.add(kind);
  for (const raw of c.commands) {
    const cmd = raw.toLowerCase();
    if (cmd === 'invisible') return undefined;
    if ((cmd === 'ue' || cmd === 'shita' || cmd === 'naka') && once('loc')) spec.loc = cmd;
    else if ((cmd === 'big' || cmd === 'medium' || cmd === 'small') && once('size')) spec.size = cmd;
    else if ((cmd === 'defont' || cmd === 'mincho' || cmd === 'gothic') && once('font')) spec.font = cmd;
    else if ((COLORS[cmd] || HEX_COLOR.test(cmd)) && once('color')) spec.color = COLORS[cmd] ?? cmd;
    else if (cmd === '_live') spec.live = true;
    else if (cmd === 'full') spec.full = true;
    else if (cmd === 'ender') spec.ender = true;
    else {
      const d = DURATION.exec(cmd);
      if (d && once('duration')) spec.durationMs = Math.min(Number(d[1]) * 1000, MAX_DURATION_MS);
    }
  }
  return spec;
}
