import { CssCommentRenderer } from './css-renderer';
import type { CommentRenderer } from './timeline';
import { WebGlCommentRenderer } from './webgl-renderer';
import { WebGpuCommentRenderer } from './webgpu-renderer';

export type RendererKind = 'css' | 'webgl' | 'webgpu';

export const RENDERERS: Record<RendererKind, { label: string; create(root: HTMLElement): Promise<CommentRenderer> }> = {
  css: { label: 'CSS', create: async (root) => new CssCommentRenderer(root) },
  webgl: { label: 'WebGL', create: async (root) => new WebGlCommentRenderer(root) },
  webgpu: { label: 'WebGPU', create: (root) => WebGpuCommentRenderer.create(root) },
};

export const RENDERER_KINDS = Object.keys(RENDERERS) as RendererKind[];
