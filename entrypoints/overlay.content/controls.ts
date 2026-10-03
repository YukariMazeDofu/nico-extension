import type { WatchContext } from '@/lib/nico/session';
import { layoutSettings } from '@/lib/settings';
import { mountCommentList } from './comment-list';
import { mountComments } from './comments';
import { mountSeekHeatmap } from './heatmap';
import { type IconName, icon } from './icons';
import { renderHeader, renderPanel } from './info';
import { AUTO_LEVEL, createPlayer } from './player';
import { mountCommentForm } from './post';
import { mountSettingsPanel } from './settings-panel';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const IDLE_MS = 2500;
const SEEK_STEP = 5;
const SEEK_STEP_LONG = 10;
const VOLUME_STEP = 0.05;
const WHEEL_STEP_PX = 50;
const OSD_MS = 1500;
const PANEL_MIN = 320;
const PANEL_MAX = 480;
const NARROW_MAX = 900;
const NARROW_PANEL_VH = 0.3;

type PanelTab = 'details' | 'comments' | 'settings';

export interface PlayerUi {
  /** 処理したキーなら true */
  handleKey(e: KeyboardEvent): boolean;
  readonly context: Promise<WatchContext>;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

function iconButton(className: string, name: IconName): HTMLButtonElement {
  const b = el('button', `cbtn ${className}`);
  b.type = 'button';
  b.append(icon(name));
  return b;
}

const setIcon = (b: HTMLButtonElement, name: IconName) => b.replaceChildren(icon(name));

const formatTime = (s: number) => {
  if (!Number.isFinite(s)) return '0:00';
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export interface PlayerUiOptions {
  log(msg: string): void;
  /** 上段の右端に置くボタン */
  actions: HTMLElement[];
}

export function mountPlayerUi(container: HTMLElement, videoId: string, { log, actions }: PlayerUiOptions): PlayerUi {
  const header = el('header', 'info');
  const headerBody = el('div', 'info-body', '読み込み中…');
  const headerActions = el('div', 'actions');
  headerActions.append(...actions);
  header.append(headerBody, headerActions);
  const panel = el('aside', 'panel');
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const details = el('div', 'tabpanel details');
  const tabButtons = {} as Record<PanelTab, HTMLButtonElement>;
  for (const [tab, label] of [
    ['details', '動画の詳細'],
    ['comments', 'コメント'],
    ['settings', '設定'],
  ] as const) {
    const b = el('button', 'tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => selectTab(tab));
    tabButtons[tab] = b;
    tabs.append(b);
  }
  const playerBox = el('div', 'player');
  const stage = el('div', 'stage');
  const video = el('video', '');
  const commentRoot = el('div', 'comments');
  const message = el('div', 'message');
  const osd = el('div', 'osd');
  const controls = el('div', 'controls');
  const seekBar = el('div', 'seek');
  const seekTrack = el('div', 'seek-track');
  const seekBuffered = el('div', 'seek-buffered');
  const seek = el('input', 'seek-input');
  seekBar.append(seekTrack, seekBuffered, seek);
  seek.type = 'range';
  seek.min = '0';
  seek.step = 'any';
  seek.value = '0';
  const play = iconButton('play', 'play');
  const mute = iconButton('mute', 'volume');
  const volume = el('input', 'volume');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = 'any';
  const time = el('span', 'time');
  const rate = el('select', 'cbtn rate');
  rate.title = '再生速度';
  for (const r of RATES) rate.append(new Option(`${r}x`, String(r)));
  const quality = el('select', 'cbtn quality');
  quality.title = '画質';
  const commentToggle = iconButton('comment-toggle', 'comment');
  const pin = iconButton('pin', 'dock');
  const fullscreen = iconButton('fullscreen', 'fullscreen');
  fullscreen.title = '全画面 (F)';
  const bar = el('div', 'bar');
  bar.append(play, mute, volume, time, el('span', 'spacer'), commentToggle, rate, quality, pin, fullscreen);
  controls.append(seekBar, bar);
  stage.append(video, commentRoot, message, osd);
  playerBox.append(stage, controls);
  const layout = el('div', 'window');
  layout.append(header, playerBox, panel);
  container.append(layout);

  let seeking = false;

  const renderTime = () => {
    const position = seeking ? Number(seek.value) : video.currentTime;
    time.textContent = `${formatTime(position)} / ${formatTime(video.duration)}`;
    if (!seeking) seek.value = String(video.currentTime);
    const d = video.duration || 1;
    const pct = (t: number) => `${((t / d) * 100).toFixed(3)}%`;
    const ranges = [...Array(video.buffered.length).keys()].map(
      (i) => `transparent ${pct(video.buffered.start(i))}, #000 ${pct(video.buffered.start(i))} ${pct(video.buffered.end(i))}, transparent ${pct(video.buffered.end(i))}`,
    );
    seekBar.style.setProperty('--played', pct(position));
    seekBuffered.style.maskImage = `linear-gradient(to right, transparent 0%, ${[...ranges, 'transparent 100%'].join(', ')})`;
  };
  const renderPlay = () => {
    setIcon(play, video.paused ? 'play' : 'pause');
    play.title = video.paused ? '再生 (Space)' : '一時停止 (Space)';
    stage.classList.toggle('paused', video.paused);
  };
  const renderVolume = () => {
    setIcon(mute, video.muted || video.volume === 0 ? 'muted' : 'volume');
    mute.title = video.muted ? 'ミュート解除 (M)' : 'ミュート (M)';
    volume.value = String(video.muted ? 0 : video.volume);
    volume.style.setProperty('--level', `${(video.muted ? 0 : video.volume) * 100}%`);
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

  /** 動画の枠を動画の縦横比に合わせ、横に余った幅はパネルに回す。それでも余る分は左右の余白にする。 */
  const fitLayout = () => {
    if (document.fullscreenElement) return;
    const cs = getComputedStyle(layout);
    const colGap = parseFloat(cs.columnGap) || 0;
    const rowGap = parseFloat(cs.rowGap) || 0;
    const width = layout.clientWidth;
    const height = layout.clientHeight - header.offsetHeight - rowGap;
    const controlsHeight = pinned ? controls.offsetHeight : 0;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    const narrow = window.innerWidth <= NARROW_MAX;
    layout.classList.toggle('narrow', narrow);
    let videoWidth: number;
    if (narrow) {
      const available = height - window.innerHeight * NARROW_PANEL_VH - rowGap - controlsHeight;
      videoWidth = Math.min(width, available * aspect);
      layout.style.gridTemplateColumns = '';
    } else {
      videoWidth = Math.min(width - PANEL_MIN - colGap, (height - controlsHeight) * aspect);
      const panelWidth = Math.min(PANEL_MAX, Math.max(PANEL_MIN, width - videoWidth - colGap));
      layout.style.gridTemplateColumns = `${videoWidth}px ${panelWidth}px`;
    }
    videoWidth = Math.max(0, videoWidth);
    playerBox.style.width = narrow ? `${videoWidth}px` : '';
    playerBox.style.height = `${videoWidth / aspect + controlsHeight}px`;
  };
  const fitObserver = new ResizeObserver(fitLayout);
  fitObserver.observe(layout);
  fitObserver.observe(header);
  fitObserver.observe(controls);
  video.addEventListener('resize', fitLayout);
  document.addEventListener('fullscreenchange', fitLayout);

  let pinned = true;
  const renderPin = () => {
    playerBox.classList.toggle('pinned', pinned);
    pin.classList.toggle('off', !pinned);
    pin.title = pinned ? 'コントロールを動画に重ねる (H)' : 'コントロールを動画の下に置く (H)';
    fitLayout();
  };
  const togglePin = () => {
    pinned = !pinned;
    renderPin();
    layoutSettings.setValue({ controlsPinned: pinned });
    showOsd(pinned ? 'コントロールを常に表示' : 'コントロールを自動で隠す');
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
  const commentList = mountCommentList(video, player.context, {
    log,
    notify: (msg) => showOsd(msg),
    onCount(count) {
      tabButtons.comments.textContent = 'コメント';
      tabButtons.comments.append(el('span', 'tab-count', count.toLocaleString('ja-JP')));
    },
  });
  commentList.element.classList.add('tabpanel');
  tabs.append(commentList.followToggle);
  const settingsPanel = mountSettingsPanel(player.context);
  settingsPanel.element.classList.add('tabpanel');
  panel.append(tabs, commentList.element, details, settingsPanel.element);
  const selectTab = (tab: PanelTab) => {
    for (const [t, b] of Object.entries(tabButtons)) b.setAttribute('aria-selected', String(t === tab));
    commentList.element.hidden = tab !== 'comments';
    details.hidden = tab !== 'details';
    settingsPanel.element.hidden = tab !== 'settings';
    commentList.followToggle.hidden = tab !== 'comments';
    commentList.setActive(tab === 'comments');
  };
  selectTab('details');
  const heatmap = mountSeekHeatmap(seekBar, video);
  const comments = mountComments(commentRoot, video, player.context, {
    log,
    onVisibilityChange: renderComments,
    onLoaded(threads, ngHidden) {
      commentList.setThreads(threads);
      tabButtons.comments.title = `共有 NG レベルで ${ngHidden.toLocaleString('ja-JP')} 件を隠しています`;
    },
    onHeatmap: (values, threads) =>
      heatmap.set(
        values && {
          heatmap: values,
          vposMs: threads.filter((t) => t.fork !== 'owner').flatMap((t) => t.comments.map((c) => c.vposMs)),
        },
      ),
  });
  const commentForm = mountCommentForm(video, player.context, {
    log,
    notify: (msg) => showOsd(msg),
    onPosted: () => comments.reload().catch((e) => log(`comments reload failed: ${e}`)),
  });
  controls.append(commentForm.element);
  player.context.then(
    (ctx) => {
      renderHeader(headerBody, ctx.data);
      renderPanel(details, ctx.data.info);
    },
    () => (headerBody.textContent = ''),
  );
  layoutSettings.getValue().then((v) => {
    pinned = v.controlsPinned;
    renderPin();
  });

  const togglePlay = () => (video.paused ? video.play().catch((e) => log(`play() rejected: ${e}`)) : video.pause());
  const toggleFullscreen = () =>
    document.fullscreenElement ? document.exitFullscreen() : playerBox.requestFullscreen().catch((e) => log(`fullscreen: ${e}`));
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
    // 右パネルのホイールはスクロールに使う。Ctrl+ホイールはページの拡大を止める
    if (panel.contains(e.target as Node)) {
      if (e.ctrlKey) e.preventDefault();
      return;
    }
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
    playerBox.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => !video.paused && !controls.matches(':focus-within') && playerBox.classList.add('idle'), IDLE_MS);
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
  pin.addEventListener('click', togglePin);
  playerBox.addEventListener('pointermove', wake);
  container.addEventListener('wheel', onWheel, { passive: false });

  renderPlay();
  renderVolume();
  renderRate();
  renderQuality();
  renderComments();
  renderPin();
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
        case 'h':
          togglePin();
          break;
        case 'Enter':
          commentForm.focus();
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
    context: player.context,
    destroy() {
      clearTimeout(idleTimer);
      clearTimeout(osdTimer);
      fitObserver.disconnect();
      document.removeEventListener('fullscreenchange', fitLayout);
      if (document.fullscreenElement) document.exitFullscreen();
      comments.destroy();
      heatmap.destroy();
      settingsPanel.destroy();
      player.destroy();
    },
  };
}
