import { el } from './dom';
import { formatTime } from './format';
import { type HeatmapSource, mountSeekHeatmap } from './heatmap';

export interface SeekBar {
  readonly element: HTMLElement;
  /** `再生位置 / 長さ` の表示 */
  readonly timeLabel: HTMLElement;
  setHeatmap(source: HeatmapSource | null): void;
}

/**
 * シークバー。細い帯（`.seek-track`）、キャッシュ済みの範囲だけを見せる太い帯（`.seek-buffered`）、
 * 透明な `input[type=range]` を重ねる。再生済みの位置は `--played` で渡す。
 */
export function mountSeekBar(video: HTMLVideoElement, signal: AbortSignal): SeekBar {
  const element = el('div', 'seek');
  const track = el('div', 'seek-track');
  const buffered = el('div', 'seek-buffered');
  const input = el('input', 'seek-input');
  input.type = 'range';
  input.min = '0';
  input.step = 'any';
  input.value = '0';
  element.append(track, buffered, input);
  const timeLabel = el('span', 'time');
  let seeking = false;

  const pct = (t: number) => `${((t / (video.duration || 1)) * 100).toFixed(3)}%`;
  const renderTime = () => {
    const position = seeking ? Number(input.value) : video.currentTime;
    timeLabel.textContent = `${formatTime(position)} / ${formatTime(video.duration)}`;
    if (!seeking) input.value = String(video.currentTime);
    element.style.setProperty('--played', pct(position));
  };
  const renderBuffered = () => {
    const b = video.buffered;
    const ranges = [...Array(b.length).keys()].map(
      (i) => `transparent ${pct(b.start(i))}, #000 ${pct(b.start(i))} ${pct(b.end(i))}, transparent ${pct(b.end(i))}`,
    );
    buffered.style.maskImage = `linear-gradient(to right, transparent 0%, ${[...ranges, 'transparent 100%'].join(', ')})`;
  };

  video.addEventListener('timeupdate', renderTime, { signal });
  video.addEventListener('progress', renderBuffered, { signal });
  video.addEventListener(
    'durationchange',
    () => {
      input.max = String(video.duration || 0);
      renderTime();
      renderBuffered();
    },
    { signal },
  );
  input.addEventListener('input', () => {
    seeking = true;
    renderTime();
  });
  input.addEventListener('change', () => {
    seeking = false;
    video.currentTime = Number(input.value);
  });
  renderTime();
  renderBuffered();

  return { element, timeLabel, setHeatmap: mountSeekHeatmap(element, video, signal) };
}
