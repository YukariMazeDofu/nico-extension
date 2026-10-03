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
