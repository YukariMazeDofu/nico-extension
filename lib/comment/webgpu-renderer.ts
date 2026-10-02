import { CanvasCommentRenderer, type Sprite } from './canvas-renderer';

const SHADER = /* wgsl */ `
struct Sprite {
  rect: vec4f,
  opacity: f32,
}

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) opacity: f32,
}

@group(0) @binding(0) var<uniform> view: vec4f;
@group(0) @binding(1) var<storage, read> sprites: array<Sprite>;
@group(0) @binding(2) var samp: sampler;
@group(1) @binding(0) var tex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Out {
  let s = sprites[ii];
  let p = vec2f(f32(vi & 1u), f32(vi >> 1u));
  let xy = s.rect.xy + p * s.rect.zw;
  var o: Out;
  o.pos = vec4f(xy / view.xy * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  o.uv = p;
  o.opacity = s.opacity;
  return o;
}

@fragment fn fs(i: Out) -> @location(0) vec4f {
  return textureSample(tex, samp, i.uv) * i.opacity;
}
`;

// lib.dom に GPUBufferUsage / GPUTextureUsage の定数がない
const BUFFER_COPY_DST = 0x8;
const BUFFER_UNIFORM = 0x40;
const BUFFER_STORAGE = 0x80;
const TEXTURE_COPY_DST = 0x2;
const TEXTURE_BINDING = 0x4;
const TEXTURE_RENDER_ATTACHMENT = 0x10;

/** `Sprite` 1 件の大きさ（f32 × 8。WGSL の struct の配置に合わせる） */
const SPRITE_FLOATS = 8;

interface GpuTexture {
  texture: GPUTexture;
  bindGroup: GPUBindGroup;
}

/** コメント 1 件を 1 テクスチャにし、WebGPU で重ねる。位置は毎フレーム storage buffer にまとめて書く。 */
export class WebGpuCommentRenderer extends CanvasCommentRenderer<GpuTexture> {
  private readonly context: GPUCanvasContext;
  private readonly pipeline: GPURenderPipeline;
  private readonly view: GPUBuffer;
  private readonly sampler: GPUSampler;
  private sprites: GPUBuffer;
  private data = new Float32Array(0);
  private shared!: GPUBindGroup;

  static async create(root: HTMLElement): Promise<WebGpuCommentRenderer> {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error('WebGPU is not available');
    return new WebGpuCommentRenderer(root, await adapter.requestDevice());
  }

  private constructor(
    root: HTMLElement,
    private readonly device: GPUDevice,
  ) {
    super(root);
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.context.configure({ device, format, alphaMode: 'premultiplied' });
    const module = device.createShaderModule({ code: SHADER });
    const blend: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: blend, alpha: blend } }] },
      primitive: { topology: 'triangle-strip' },
    });
    this.view = device.createBuffer({ size: 16, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.sprites = this.allocate(64);
  }

  private allocate(capacity: number): GPUBuffer {
    this.data = new Float32Array(capacity * SPRITE_FLOATS);
    const buffer = this.device.createBuffer({ size: this.data.byteLength, usage: BUFFER_STORAGE | BUFFER_COPY_DST });
    this.shared = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.view } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: this.sampler },
      ],
    });
    return buffer;
  }

  protected upload(source: OffscreenCanvas): GpuTexture {
    const size = [source.width, source.height];
    const texture = this.device.createTexture({
      size,
      format: 'rgba8unorm',
      usage: TEXTURE_BINDING | TEXTURE_COPY_DST | TEXTURE_RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source }, { texture, premultipliedAlpha: true }, size);
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: texture.createView() }],
    });
    return { texture, bindGroup };
  }

  protected release(t: GpuTexture) {
    t.texture.destroy();
  }

  protected resize(width: number, height: number) {
    this.device.queue.writeBuffer(this.view, 0, new Float32Array([width, height, 0, 0]));
  }

  protected draw(sprites: readonly Sprite<GpuTexture>[]) {
    if (sprites.length * SPRITE_FLOATS > this.data.length) {
      this.sprites.destroy();
      this.sprites = this.allocate(2 ** Math.ceil(Math.log2(sprites.length)));
    }
    const d = this.data;
    sprites.forEach((s, i) => {
      const o = i * SPRITE_FLOATS;
      d[o] = s.x;
      d[o + 1] = s.y;
      d[o + 2] = s.width;
      d[o + 3] = s.height;
      d[o + 4] = s.opacity;
    });
    this.device.queue.writeBuffer(this.sprites, 0, this.data, 0, sprites.length * SPRITE_FLOATS);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.shared);
    sprites.forEach((s, i) => {
      pass.setBindGroup(1, s.texture.bindGroup);
      pass.draw(4, 1, 0, i);
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  protected dispose() {
    this.sprites.destroy();
    this.view.destroy();
    this.device.destroy();
  }
}
