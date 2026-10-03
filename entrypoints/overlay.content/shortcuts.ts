const SEEK_STEP = 5;
const SEEK_STEP_LONG = 10;
const VOLUME_STEP = 0.05;
const WHEEL_STEP_PX = 50;

export interface PlayerActions {
  togglePlay(): void;
  seekBy(seconds: number): void;
  seekTo(seconds: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  stepRate(dir: 1 | -1): void;
  toggleComments(): void;
  togglePin(): void;
  toggleFullscreen(): void;
  focusCommentForm(): void;
}

export interface Shortcut {
  /** `KeyboardEvent.key`。1 文字のキーは小文字 */
  keys: string[];
  /** 表示用のキー名 */
  label: string;
  description: string;
  run(key: string): void;
}

const DIGITS = [...'0123456789'];

/** オーバーレイのキーボードショートカット。Esc（閉じる）は含まない。 */
export function playerShortcuts(video: HTMLVideoElement, a: PlayerActions): Shortcut[] {
  return [
    { keys: [' ', 'k'], label: 'Space / K', description: '再生・一時停止', run: a.togglePlay },
    {
      keys: ['ArrowLeft', 'ArrowRight'],
      label: '← / →',
      description: `${SEEK_STEP} 秒戻る・進む`,
      run: (k) => a.seekBy(k === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP),
    },
    {
      keys: ['j', 'l'],
      label: 'J / L',
      description: `${SEEK_STEP_LONG} 秒戻る・進む`,
      run: (k) => a.seekBy(k === 'l' ? SEEK_STEP_LONG : -SEEK_STEP_LONG),
    },
    {
      keys: ['ArrowUp', 'ArrowDown'],
      label: '↑ / ↓',
      description: `音量 ±${VOLUME_STEP * 100}%`,
      run: (k) => a.setVolume(video.volume + (k === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)),
    },
    { keys: ['m'], label: 'M', description: 'ミュート', run: a.toggleMute },
    { keys: ['c'], label: 'C', description: 'コメントの表示・非表示', run: a.toggleComments },
    { keys: ['h'], label: 'H', description: 'コントロールを動画に重ねる・動画の下に置く', run: a.togglePin },
    { keys: ['f'], label: 'F', description: '全画面', run: a.toggleFullscreen },
    {
      keys: ['<', '>'],
      label: '< / >',
      description: '再生速度を 1 段階下げる・上げる',
      run: (k) => a.stepRate(k === '>' ? 1 : -1),
    },
    {
      keys: DIGITS,
      label: '0〜9',
      description: '動画の 0〜90% の位置へ',
      run: (k) => a.seekTo(((video.duration || 0) * Number(k)) / 10),
    },
    {
      keys: ['Home', 'End'],
      label: 'Home / End',
      description: '先頭・末尾へ',
      run: (k) => a.seekTo(k === 'End' ? video.duration || 0 : 0),
    },
    { keys: ['Enter'], label: 'Enter', description: 'コメントの入力欄に移る', run: a.focusCommentForm },
  ];
}

/** キーに当たるショートカットを実行し、実行したら true を返す。Ctrl・Meta・Alt 付きのキーは扱わない。 */
export function shortcutHandler(shortcuts: Shortcut[]): (e: KeyboardEvent) => boolean {
  const byKey = new Map(shortcuts.flatMap((s) => s.keys.map((k) => [k, s] as const)));
  return (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const s = byKey.get(key);
    s?.run(key);
    return !!s;
  };
}

/**
 * ホイールの操作。50px ぶんの移動で 1 段階、上に回すと増やす。
 * 修飾キーなしは音量 ±5%、Shift は 5 秒進む・戻る、Ctrl は再生速度。
 */
export function wheelHandler(video: HTMLVideoElement, a: PlayerActions): (e: WheelEvent) => boolean {
  let delta = 0;
  return (e) => {
    const d = e.deltaY || e.deltaX;
    if (!d) return false;
    if (Math.sign(d) !== Math.sign(delta)) delta = 0;
    delta += e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? d : Math.sign(d) * WHEEL_STEP_PX;
    if (Math.abs(delta) < WHEEL_STEP_PX) return false;
    const dir = delta < 0 ? 1 : -1;
    delta = 0;
    if (e.ctrlKey) a.stepRate(dir);
    else if (e.shiftKey) a.seekBy(dir * SEEK_STEP);
    else a.setVolume(video.volume + dir * VOLUME_STEP);
    return true;
  };
}
