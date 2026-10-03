import type { NvComment } from '@/lib/nico/comment';
import type { NgScoreLevel } from '@/lib/settings';

/** `score` がこの値以下のコメントを隠す。`none` は隠さない */
const NG_SCORE_THRESHOLDS: Record<NgScoreLevel, number | undefined> = {
  none: undefined,
  low: -10000,
  middle: -4800,
  high: -1000,
};

export function isNgScoreHidden(c: NvComment, level: NgScoreLevel): boolean {
  const threshold = NG_SCORE_THRESHOLDS[level];
  return threshold !== undefined && c.score <= threshold;
}
