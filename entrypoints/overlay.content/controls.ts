import { log } from '@/lib/log';
import type { WatchContext } from '@/lib/nico/session';
import { bindSetting, layoutSettings } from '@/lib/settings';
import { mountCommentList } from './comment-list';
import { mountComments } from './comments';
import { el, iconButton, setIcon } from './dom';
import { mountFit } from './fit';
import { formatCount, formatTime } from './format';
import { renderHeader, renderPanel } from './info';
import { mountLikeBox } from './like';
import { mountPanel } from './panel';
import { AUTO_LEVEL, createPlayer } from './player';
import { mountCommentForm } from './post';
import { mountResume } from './resume';
import { mountSeekBar } from './seekbar';
import { mountSettingsPanel } from './settings-panel';
import { type PlayerActions, playerShortcuts, shortcutHandler, wheelHandler } from './shortcuts';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const IDLE_MS = 2500;
const OSD_MS = 1500;

export interface PlayerUi {
  /** 処理したキーなら true */
  handleKey(e: KeyboardEvent): boolean;
  readonly context: Promise<WatchContext>;
}

export interface PlayerUiOptions {
  /** 上段の右端に置くボタン */
  actions: HTMLElement[];
  /** abort でプレイヤーを止め、登録したものをすべて外す */
  signal: AbortSignal;
}

/** 上段・動画とコントロール・右パネルを `container` に組み立てる。 */
export function mountPlayerUi(container: HTMLElement, videoId: string, { actions, signal }: PlayerUiOptions): PlayerUi {
  const header = el('header', 'info');
  const headerBody = el('div', 'info-body', '読み込み中…');
  const headerActions = el('div', 'actions');
  headerActions.append(...actions);
  header.append(headerBody, headerActions);
  const playerBox = el('div', 'player');
  const stage = el('div', 'stage');
  const video = el('video');
  const commentRoot = el('div', 'comments');
  const message = el('div', 'message');
  const osd = el('div', 'osd');
  const controls = el('div', 'controls');
  const seekBar = mountSeekBar(video, signal);
  const play = iconButton('cbtn play', 'play');
  const mute = iconButton('cbtn mute', 'volume');
  const volume = el('input', 'volume');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = 'any';
  const rate = el('select', 'cbtn rate');
  rate.title = '再生速度';
  for (const r of RATES) rate.append(new Option(`${r}x`, String(r)));
  const quality = el('select', 'cbtn quality');
  quality.title = '画質';
  const commentToggle = iconButton('cbtn comment-toggle', 'comment');
  const pin = iconButton('cbtn pin', 'dock');
  const fullscreen = iconButton('cbtn fullscreen', 'fullscreen');
  fullscreen.title = '全画面 (F)';
  const bar = el('div', 'bar');
  bar.append(play, mute, volume, seekBar.timeLabel, el('span', 'spacer'), commentToggle, rate, quality, pin, fullscreen);
  controls.append(seekBar.element, bar);
  stage.append(video, commentRoot, message, osd);
  playerBox.append(stage, controls);

  let osdTimer: ReturnType<typeof setTimeout> | undefined;
  const showOsd = (text: string) => {
    osd.textContent = text;
    osd.classList.add('visible');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => osd.classList.remove('visible'), OSD_MS);
  };

  const player = createPlayer(
    video,
    videoId,
    {
      onQualityChange: () => renderQuality(),
      onError(msg) {
        message.textContent = msg;
      },
    },
    signal,
  );
  mountResume(video, videoId, seekBar.setResume, signal);
  const commentList = mountCommentList(
    video,
    player.context,
    {
      notify: showOsd,
      onCount: (count) => panel.tabButton('comments').replaceChildren('コメント', el('span', 'tab-count', formatCount(count))),
    },
    signal,
  );
  const details = el('div', 'details');
  const panel = mountPanel(
    [
      { id: 'details', label: '動画の詳細', element: details },
      {
        id: 'comments',
        label: 'コメント',
        element: commentList.element,
        tool: commentList.followToggle,
        onSelect: commentList.setActive,
      },
      { id: 'settings', label: '設定', element: mountSettingsPanel(player.context, () => seekBar.setResume(null), signal) },
    ],
    mountLikeBox(player.context, { notify: showOsd }),
  );
  const comments = mountComments(
    commentRoot,
    video,
    player.context,
    {
      onVisibilityChange: () => renderComments(),
      onLoaded(threads, ngHidden) {
        commentList.setThreads(threads);
        panel.tabButton('comments').title = `共有 NG レベルで ${formatCount(ngHidden)} 件を隠しています`;
      },
      onHeatmap: (values, threads) =>
        seekBar.setHeatmap(
          values && {
            heatmap: values,
            vposMs: threads.filter((t) => t.fork !== 'owner').flatMap((t) => t.comments.map((c) => c.vposMs)),
          },
        ),
    },
    signal,
  );
  const commentForm = mountCommentForm(video, player.context, {
    notify: showOsd,
    onPosted: () => comments.reload().catch((e) => log(`comments reload failed: ${e}`)),
  });
  controls.append(commentForm.element);
  const layout = el('div', 'window');
  layout.append(header, playerBox, panel.element);
  container.append(layout);
  player.context.then(
    (ctx) => {
      renderHeader(headerBody, ctx.data);
      renderPanel(details, ctx.data.info);
    },
    () => (headerBody.textContent = ''),
  );

  let pinned = true;
  const fit = mountFit({ layout, header, player: playerBox, controls, video }, () => pinned, signal);

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
  const renderComments = () => {
    commentToggle.classList.toggle('off', !comments.visible);
    commentToggle.title = comments.visible ? 'コメントを隠す (C)' : 'コメントを表示 (C)';
  };
  const applyPinned = (p: boolean) => {
    pinned = p;
    playerBox.classList.toggle('pinned', pinned);
    pin.classList.toggle('off', !pinned);
    pin.title = pinned ? 'コントロールを動画に重ねる (H)' : 'コントロールを動画の下に置く (H)';
    fit();
  };
  bindSetting(layoutSettings, (v) => applyPinned(v.controlsPinned), signal);

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    playerBox.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => !video.paused && !controls.matches(':focus-within') && playerBox.classList.add('idle'), IDLE_MS);
  };

  const act: PlayerActions = {
    togglePlay: () => (video.paused ? video.play().catch((e) => log(`play() rejected: ${e}`)) : video.pause()),
    seekBy(dt) {
      video.currentTime = Math.min(Math.max(video.currentTime + dt, 0), video.duration || 0);
      showOsd(`${dt > 0 ? '+' : ''}${dt}秒 (${formatTime(video.currentTime)})`);
    },
    seekTo(t) {
      video.currentTime = t;
    },
    setVolume(v) {
      video.volume = Math.min(Math.max(v, 0), 1);
      video.muted = false;
      showOsd(`音量 ${Math.round(video.volume * 100)}%`);
    },
    toggleMute() {
      video.muted = !video.muted;
      showOsd(video.muted ? 'ミュート' : `音量 ${Math.round(video.volume * 100)}%`);
    },
    stepRate(dir) {
      const r = video.playbackRate;
      const next = dir > 0 ? RATES.find((x) => x > r) : RATES.findLast((x) => x < r);
      if (next) video.playbackRate = next;
      showOsd(`速度 ${video.playbackRate}x`);
    },
    toggleComments() {
      comments.setVisible(!comments.visible);
      showOsd(comments.visible ? 'コメント表示' : 'コメント非表示');
    },
    togglePin() {
      applyPinned(!pinned);
      layoutSettings.setValue({ controlsPinned: pinned });
      showOsd(pinned ? 'コントロールを常に表示' : 'コントロールを自動で隠す');
    },
    toggleFullscreen: () =>
      document.fullscreenElement ? document.exitFullscreen() : playerBox.requestFullscreen().catch((e) => log(`fullscreen: ${e}`)),
    focusCommentForm: () => commentForm.focus(),
  };
  const handleKey = shortcutHandler(playerShortcuts(video, act));
  const handleWheel = wheelHandler(video, act);

  // 右パネルのホイールはスクロールに使う。Ctrl+ホイールはページの拡大を止める
  container.addEventListener(
    'wheel',
    (e) => {
      if (panel.element.contains(e.target as Node)) {
        if (e.ctrlKey) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (handleWheel(e)) wake();
    },
    { passive: false },
  );
  video.addEventListener('click', act.togglePlay, { signal });
  video.addEventListener('dblclick', act.toggleFullscreen, { signal });
  video.addEventListener('play', renderPlay, { signal });
  video.addEventListener('pause', renderPlay, { signal });
  video.addEventListener('volumechange', renderVolume, { signal });
  video.addEventListener('ratechange', renderRate, { signal });
  video.addEventListener(
    'playing',
    () => {
      message.textContent = '';
      wake();
    },
    { signal },
  );
  play.addEventListener('click', act.togglePlay);
  mute.addEventListener('click', act.toggleMute);
  volume.addEventListener('input', () => act.setVolume(Number(volume.value)));
  rate.addEventListener('change', () => (video.playbackRate = Number(rate.value)));
  quality.addEventListener('change', () => player.setQuality(Number(quality.value)));
  commentToggle.addEventListener('click', act.toggleComments);
  fullscreen.addEventListener('click', act.toggleFullscreen);
  pin.addEventListener('click', act.togglePin);
  playerBox.addEventListener('pointermove', wake);
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(idleTimer);
      clearTimeout(osdTimer);
      if (document.fullscreenElement) document.exitFullscreen();
    },
    { once: true },
  );

  renderPlay();
  renderVolume();
  renderRate();
  renderQuality();
  renderComments();
  applyPinned(pinned);

  return {
    handleKey(e) {
      if (!handleKey(e)) return false;
      wake();
      return true;
    },
    context: player.context,
  };
}
