export type ClockKind = 'currentTime' | 'videoFrame' | 'smooth';

export const CLOCK_LABELS: Record<ClockKind, string> = { currentTime: 'currentTime', videoFrame: 'rVFC', smooth: '平滑化' };

/** コメントを動かす基準の、動画の時刻（ms） */
export interface MediaClock {
  /** `time` は `requestAnimationFrame` の時刻 */
  now(time?: number): number;
  destroy(): void;
}

/** 補間した値がこれ以上 `currentTime` から離れたら、シークなどとみなして `currentTime` を使う */
const MAX_GAP_MS = 250;
/** 平滑化した時刻を `currentTime` との差に寄せる割合（1 回の呼び出しあたり） */
const SMOOTH_GAIN = 0.05;

export function createClock(kind: ClockKind, video: HTMLVideoElement): MediaClock {
  const current = () => video.currentTime * 1000;
  if (kind === 'currentTime') return { now: current, destroy() {} };
  if (kind === 'smooth') return createSmoothClock(video, current);

  // 最後に表示されたフレームのメディア時刻と表示時刻から、実時間 × 速度で補間する
  let mediaMs = Number.NaN;
  let displayAt = 0;
  let handle = 0;
  const onFrame = (_: number, m: VideoFrameCallbackMetadata) => {
    mediaMs = m.mediaTime * 1000;
    displayAt = m.expectedDisplayTime;
    handle = video.requestVideoFrameCallback(onFrame);
  };
  handle = video.requestVideoFrameCallback(onFrame);
  return {
    now(time = performance.now()) {
      const actual = current();
      if (Number.isNaN(mediaMs) || video.paused || video.seeking) return actual;
      const estimated = mediaMs + (time - displayAt) * video.playbackRate;
      return Math.abs(estimated - actual) > MAX_GAP_MS ? actual : estimated;
    },
    destroy() {
      video.cancelVideoFrameCallback(handle);
    },
  };
}

/** 実時間 × 速度で進め、`currentTime` との差を少しずつ詰める。`currentTime` の階段状の進みを均す */
function createSmoothClock(video: HTMLVideoElement, current: () => number): MediaClock {
  let estimated = Number.NaN;
  let last = 0;
  return {
    now(time = performance.now()) {
      const actual = current();
      if (Number.isNaN(estimated) || video.paused || video.seeking) {
        estimated = actual;
        last = time;
        return actual;
      }
      estimated += Math.max(0, time - last) * video.playbackRate;
      last = Math.max(last, time);
      const gap = actual - estimated;
      estimated = Math.abs(gap) > MAX_GAP_MS ? actual : estimated + gap * SMOOTH_GAIN;
      return estimated;
    },
    destroy() {},
  };
}
