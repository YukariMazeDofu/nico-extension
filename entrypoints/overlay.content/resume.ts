import { readResume, removeResume, writeResume } from '@/lib/resume';

const WRITE_INTERVAL_MS = 5000;
/** 再生していた時間の合計がこれに満たないうちは書かない */
const MIN_WATCHED_MS = 3000;
/** `timeupdate` の間隔がこれを超えた分は再生していた時間に数えない */
const MAX_TICK_MS = 1000;

/**
 * 前回の再生位置を `showMarker` に渡し、今回の位置を書く。
 * 再生中は 5 秒おき・一時停止・閉じる（`signal` の abort）・`pagehide` で書き、`ended` で消す。
 * 書く位置は最後の `timeupdate`・`seeked` の `currentTime`。abort のときの動画は、hls.js が外したあとで `currentTime` が 0。
 */
export function mountResume(video: HTMLVideoElement, videoId: string, showMarker: (sec: number) => void, signal: AbortSignal) {
  let watchedMs = 0;
  let lastTick: number | undefined;
  let lastWrite = 0;
  let ended = false;
  let position = 0;

  const write = () => {
    if (ended || watchedMs < MIN_WATCHED_MS) return;
    lastWrite = performance.now();
    writeResume(videoId, position);
  };

  readResume(videoId).then((entry) => entry && !signal.aborted && showMarker(entry.sec));

  const on = (type: keyof HTMLMediaElementEventMap, listener: () => void) => video.addEventListener(type, listener, { signal });
  on('seeked', () => (position = video.currentTime));
  on('timeupdate', () => {
    const now = performance.now();
    position = video.currentTime;
    if (video.paused) return;
    if (lastTick !== undefined) watchedMs += Math.min(now - lastTick, MAX_TICK_MS);
    lastTick = now;
    if (now - lastWrite >= WRITE_INTERVAL_MS) write();
  });
  on('play', () => {
    ended = false;
    lastTick = undefined;
  });
  on('pause', write);
  on('ended', () => {
    ended = true;
    removeResume(videoId);
  });
  window.addEventListener('pagehide', write, { signal });
  signal.addEventListener('abort', write, { once: true });
}
