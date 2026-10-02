import { mountComments } from './comments';
import { AUTO_LEVEL, createPlayer } from './player';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const IDLE_MS = 2500;
const SEEK_STEP = 5;
const SEEK_STEP_LONG = 10;
const VOLUME_STEP = 0.05;
const WHEEL_STEP_PX = 50;
const OSD_MS = 800;

export interface PlayerUi {
  /** 処理したキーなら true */
  handleKey(e: KeyboardEvent): boolean;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

const formatTime = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export function mountPlayerUi(container: HTMLElement, videoId: string, log: (msg: string) => void): PlayerUi {
  const stage = el('div', 'stage');
  const video = el('video', '');
  const commentRoot = el('div', 'comments');
  const message = el('div', 'message');
  const osd = el('div', 'osd');
  const controls = el('div', 'controls');
  const seek = el('input', 'seek');
  seek.type = 'range';
  seek.min = '0';
  seek.step = 'any';
  seek.value = '0';
  const play = el('button', 'play', '▶');
  const mute = el('button', 'mute');
  const volume = el('input', 'volume');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = 'any';
  const time = el('span', 'time');
  const rate = el('select', 'rate');
  rate.title = '再生速度';
  for (const r of RATES) rate.append(new Option(`${r}x`, String(r)));
  const quality = el('select', 'quality');
  quality.title = '画質';
  const commentToggle = el('button', 'comment-toggle', '💬');
  const fullscreen = el('button', 'fullscreen', '⛶');
  fullscreen.title = '全画面 (F)';
  const bar = el('div', 'bar');
  bar.append(play, mute, volume, time, el('span', 'spacer'), commentToggle, rate, quality, fullscreen);
  controls.append(seek, bar);
  stage.append(video, commentRoot, message, osd, controls);
  container.append(stage);

  let seeking = false;

  const renderTime = () => {
    const position = seeking ? Number(seek.value) : video.currentTime;
    time.textContent = `${formatTime(position)} / ${formatTime(video.duration)}`;
    if (!seeking) seek.value = String(video.currentTime);
    const d = video.duration || 1;
    const buffered = [...Array(video.buffered.length).keys()]
      .map((i) => [video.buffered.start(i), video.buffered.end(i)] as const)
      .find(([s, e]) => s <= video.currentTime && video.currentTime <= e)?.[1];
    seek.style.setProperty('--played', `${(position / d) * 100}%`);
    seek.style.setProperty('--buffered', `${((buffered ?? 0) / d) * 100}%`);
  };
  const renderPlay = () => {
    play.textContent = video.paused ? '▶' : '❚❚';
    play.title = video.paused ? '再生 (Space)' : '一時停止 (Space)';
    stage.classList.toggle('paused', video.paused);
  };
  const renderVolume = () => {
    mute.textContent = video.muted || video.volume === 0 ? '🔇' : '🔊';
    mute.title = video.muted ? 'ミュート解除 (M)' : 'ミュート (M)';
    volume.value = String(video.muted ? 0 : video.volume);
  };
  const renderRate = () => {
    const v = String(video.playbackRate);
    if (![...rate.options].some((o) => o.value === v)) rate.append(new Option(`${v}x`, v));
    rate.value = v;
  };
  const renderQuality = () => {
    const playing = player.playingQuality;
    quality.replaceChildren(
      new Option(playing && player.selectedLevel === AUTO_LEVEL ? `自動 (${playing.label})` : '自動', String(AUTO_LEVEL)),
      ...player.qualities.map((q) => new Option(q.label, String(q.level))),
    );
    quality.value = String(player.selectedLevel);
  };

  const renderComments = () => {
    commentToggle.classList.toggle('off', !comments.visible);
    commentToggle.title = comments.visible ? 'コメントを隠す (C)' : 'コメントを表示 (C)';
  };

  const player = createPlayer(video, videoId, {
    log,
    onQualityChange: renderQuality,
    onError(msg) {
      message.textContent = msg;
    },
  });
  const comments = mountComments(commentRoot, video, player.context, { log, onVisibilityChange: renderComments });

  const togglePlay = () => (video.paused ? video.play().catch((e) => log(`play() rejected: ${e}`)) : video.pause());
  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen().catch((e) => log(`fullscreen: ${e}`));
  let osdTimer: ReturnType<typeof setTimeout> | undefined;
  const showOsd = (text: string) => {
    osd.textContent = text;
    osd.classList.add('visible');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => osd.classList.remove('visible'), OSD_MS);
  };
  const seekBy = (dt: number) => {
    video.currentTime = Math.min(Math.max(video.currentTime + dt, 0), video.duration || 0);
    showOsd(`${dt > 0 ? '+' : ''}${dt}秒 (${formatTime(video.currentTime)})`);
  };
  const setVolume = (v: number) => {
    video.volume = Math.min(Math.max(v, 0), 1);
    video.muted = false;
    showOsd(`音量 ${Math.round(video.volume * 100)}%`);
  };
  const toggleMute = () => {
    video.muted = !video.muted;
    showOsd(video.muted ? 'ミュート' : `音量 ${Math.round(video.volume * 100)}%`);
  };
  const stepRate = (dir: 1 | -1) => {
    const r = video.playbackRate;
    const next = dir > 0 ? RATES.find((x) => x > r) : RATES.findLast((x) => x < r);
    if (next) video.playbackRate = next;
    showOsd(`速度 ${video.playbackRate}x`);
  };
  const toggleComments = () => {
    comments.setVisible(!comments.visible);
    showOsd(comments.visible ? 'コメント表示' : 'コメント非表示');
  };

  let wheelDelta = 0;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const d = e.deltaY || e.deltaX;
    if (!d) return;
    if (Math.sign(d) !== Math.sign(wheelDelta)) wheelDelta = 0;
    wheelDelta += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? d : Math.sign(d) * WHEEL_STEP_PX;
    if (Math.abs(wheelDelta) < WHEEL_STEP_PX) return;
    const dir = wheelDelta < 0 ? 1 : -1;
    wheelDelta = 0;
    if (e.ctrlKey) stepRate(dir);
    else if (e.shiftKey) seekBy(dir * SEEK_STEP);
    else setVolume(video.volume + dir * VOLUME_STEP);
    wake();
  };

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    stage.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => !video.paused && stage.classList.add('idle'), IDLE_MS);
  };

  video.addEventListener('click', togglePlay);
  video.addEventListener('dblclick', toggleFullscreen);
  video.addEventListener('timeupdate', renderTime);
  video.addEventListener('durationchange', () => {
    seek.max = String(video.duration || 0);
    renderTime();
  });
  video.addEventListener('progress', renderTime);
  video.addEventListener('play', renderPlay);
  video.addEventListener('pause', renderPlay);
  video.addEventListener('volumechange', renderVolume);
  video.addEventListener('ratechange', renderRate);
  video.addEventListener('playing', () => {
    message.textContent = '';
    wake();
  });
  seek.addEventListener('input', () => {
    seeking = true;
    renderTime();
  });
  seek.addEventListener('change', () => {
    seeking = false;
    video.currentTime = Number(seek.value);
  });
  play.addEventListener('click', togglePlay);
  mute.addEventListener('click', toggleMute);
  volume.addEventListener('input', () => setVolume(Number(volume.value)));
  rate.addEventListener('change', () => (video.playbackRate = Number(rate.value)));
  quality.addEventListener('change', () => player.setQuality(Number(quality.value)));
  commentToggle.addEventListener('click', toggleComments);
  fullscreen.addEventListener('click', toggleFullscreen);
  stage.addEventListener('pointermove', wake);
  container.addEventListener('wheel', onWheel, { passive: false });

  renderPlay();
  renderVolume();
  renderRate();
  renderQuality();
  renderComments();
  renderTime();

  return {
    handleKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (k) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'ArrowLeft':
          seekBy(-SEEK_STEP);
          break;
        case 'ArrowRight':
          seekBy(SEEK_STEP);
          break;
        case 'j':
          seekBy(-SEEK_STEP_LONG);
          break;
        case 'l':
          seekBy(SEEK_STEP_LONG);
          break;
        case 'ArrowUp':
          setVolume(video.volume + VOLUME_STEP);
          break;
        case 'ArrowDown':
          setVolume(video.volume - VOLUME_STEP);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'c':
          toggleComments();
          break;
        case '<':
          stepRate(-1);
          break;
        case '>':
          stepRate(1);
          break;
        case 'Home':
          video.currentTime = 0;
          break;
        case 'End':
          video.currentTime = video.duration || 0;
          break;
        default:
          if (!/^[0-9]$/.test(k)) return false;
          video.currentTime = ((video.duration || 0) * Number(k)) / 10;
      }
      wake();
      return true;
    },
    destroy() {
      clearTimeout(idleTimer);
      clearTimeout(osdTimer);
      if (document.fullscreenElement) document.exitFullscreen();
      comments.destroy();
      player.destroy();
    },
  };
}
