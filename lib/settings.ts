import type { RendererKind } from './comment/renderers';

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
  renderer?: RendererKind;
}

export const commentSettings = storage.defineItem<CommentSettings>('local:comments', {
  fallback: { visible: true, renderer: 'css' },
});
