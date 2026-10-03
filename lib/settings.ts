export interface PlayerSettings {
  volume: number;
  muted: boolean;
  playbackRate: number;
  /** 'auto' か、選ぶ画質の高さの上限（px） */
  quality: 'auto' | number;
}

export const playerSettings = storage.defineItem<PlayerSettings>('local:player', {
  fallback: { volume: 1, muted: false, playbackRate: 1, quality: 'auto' },
});

export interface CommentSettings {
  visible: boolean;
}

export const commentSettings = storage.defineItem<CommentSettings>('local:comments', {
  fallback: { visible: true },
});

/** 共有 NG レベル（無・弱・中・強） */
export type NgScoreLevel = 'none' | 'low' | 'middle' | 'high';

export const ngScoreSetting = storage.defineItem<NgScoreLevel>('local:ngScore', { fallback: 'middle' });

/** シークバーに盛り上がり（`voltageZone`）の帯を出す */
export const seekHeatmapSetting = storage.defineItem<boolean>('local:seekHeatmap', { fallback: true });

/** 盛り上がりの値を何乗して色に当てるか。1 より大きいほど、多い区間だけが赤寄りになる */
export const seekHeatmapGammaSetting = storage.defineItem<number>('local:seekHeatmapGamma', { fallback: 2 });

export interface CommentListSettings {
  /** 再生位置に合わせて一覧をスクロールする */
  follow: boolean;
}

export const commentListSettings = storage.defineItem<CommentListSettings>('local:commentList', {
  fallback: { follow: true },
});

export interface LayoutSettings {
  /** true なら動画の下にコントロールを常に表示し、false なら動画に重ねて操作がないと隠す */
  controlsPinned: boolean;
}

export const layoutSettings = storage.defineItem<LayoutSettings>('local:layout', {
  fallback: { controlsPinned: true },
});

/** 'auto' は OS の設定（`prefers-color-scheme`）に合わせる */
export type Theme = 'auto' | 'light' | 'dark';

export const themeSetting = storage.defineItem<Theme>('local:theme', { fallback: 'auto' });

export interface Setting<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  watch(cb: (value: T) => void): () => void;
}

/** 保存された値と、ほかのタブでの変更を `apply` に渡す。`signal` の abort で追従をやめる。初めの値を渡し終えたら resolve する。 */
export function bindSetting<T>(setting: Setting<T>, apply: (value: T) => void, signal: AbortSignal): Promise<void> {
  signal.addEventListener('abort', setting.watch(apply), { once: true });
  return setting.getValue().then((v) => {
    if (!signal.aborted) apply(v);
  });
}
