import { el } from './dom';
import { formatTime } from './format';
import { type HeatmapSource, mountSeekHeatmap } from './heatmap';

export interface SeekBar {
  readonly element: HTMLElement;
  /** `再生位置 / 長さ` の表示 */
  readonly timeLabel: HTMLElement;
  setHeatmap(source: HeatmapSource | null): void;
  /** 前回の再生位置（秒）の印を出す。null で消す */
  setResume(sec: number | null): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 前回の再生位置の印。白い縦棒と、その下に接する ▲ */
function resumeMarker(): HTMLButtonElement {
  const button = el('button', 'seek-resume');
  button.type = 'button';
  button.tabIndex = -1;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 10 25');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M1 24h8l-4-6z"/><path d="M4 0h2v18H4z"/>';
  button.append(svg);
  return button;
}

/**
 * シークバー。細い帯（`.seek-track`）、キャッシュ済みの範囲だけを見せる太い帯（`.seek-buffered`）、
 * 透明な `input[type=range]`、前回の再生位置の印を重ねる。再生済みの位置は `--played`、印の位置は `--resume`（0〜1）で渡す。
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
  const resume = resumeMarker();
  resume.hidden = true;
  element.append(track, buffered, input, resume);
  const timeLabel = el('span', 'time');
  let seeking = false;
  let resumeSec: number | null = null;

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
  const renderResume = () => {
    resume.hidden = resumeSec === null || !video.duration;
    if (resumeSec === null) return;
    element.style.setProperty('--resume', String(Math.min(resumeSec / (video.duration || 1), 1)));
    resume.title = `前回 ${formatTime(resumeSec)}`;
  };

  video.addEventListener('timeupdate', renderTime, { signal });
  video.addEventListener('progress', renderBuffered, { signal });
  video.addEventListener(
    'durationchange',
    () => {
      input.max = String(video.duration || 0);
      renderTime();
      renderBuffered();
      renderResume();
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
  resume.addEventListener('mousedown', (e) => e.preventDefault());
  resume.addEventListener('click', () => {
    if (resumeSec !== null) video.currentTime = resumeSec;
  });
  renderTime();
  renderBuffered();

  return {
    element,
    timeLabel,
    setHeatmap: mountSeekHeatmap(element, video, signal),
    setResume(sec) {
      resumeSec = sec;
      renderResume();
    },
  };
}
