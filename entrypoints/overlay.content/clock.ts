/** `currentTime` からこれ以上離れたら `currentTime` に合わせ直す */
const MAX_GAP_MS = 250;
/** `currentTime` との差を詰める割合（1 回の呼び出しあたり） */
const GAIN = 0.05;

/**
 * コメントを動かす基準の、動画の時刻（ms）。実時間 × 速度で進め、`currentTime` との差を少しずつ詰める。
 * `currentTime` は速度を変えると階段状に進む。
 */
export function createMediaClock(video: HTMLVideoElement): (time?: number) => number {
  let estimated = Number.NaN;
  let last = 0;
  return (time = performance.now()) => {
    const actual = video.currentTime * 1000;
    if (Number.isNaN(estimated) || video.paused || video.seeking) {
      estimated = actual;
      last = time;
      return actual;
    }
    estimated += Math.max(0, time - last) * video.playbackRate;
    last = Math.max(last, time);
    const gap = actual - estimated;
    estimated = Math.abs(gap) > MAX_GAP_MS ? actual : estimated + gap * GAIN;
    return estimated;
  };
}
