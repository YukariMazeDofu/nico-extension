import { type PlacedComment, STAGE_HEIGHT, STAGE_WIDTH, xAt } from './layout';
import { commentOpacity, rasterize } from './raster';
import type { CommentRenderer } from './timeline';

const VERTEX = `#version 300 es
uniform vec4 u_rect;
uniform vec2 u_view;
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  v_uv = p;
  vec2 xy = u_rect.xy + p * u_rect.zw;
  gl_Position = vec4(xy / u_view * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main() {
  color = texture(u_tex, v_uv) * u_opacity;
}`;

interface Entry {
  texture: WebGLTexture;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/**
 * コメントを表示の開始時に 1 回だけビットマップにしてテクスチャに載せ、毎フレームは位置だけを決めて WebGL2 で重ねる。
 * コメント 1 件につき 1 テクスチャ・1 draw call。
 */
export class WebGlCommentRenderer implements CommentRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uRect: WebGLUniformLocation;
  private readonly uView: WebGLUniformLocation;
  private readonly uOpacity: WebGLUniformLocation;
  /** 配置の座標系から canvas の px への倍率 */
  private scale = 1;
  /** 投稿者のレイヤーを上に重ねる。各レイヤーの中は表示した順 */
  private readonly layers: [Map<PlacedComment, Entry>, Map<PlacedComment, Entry>] = [new Map(), new Map()];

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'comment-canvas';
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) throw new Error('WebGL2 is not available');
    root.append(this.canvas);
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    const uniform = (name: string) => gl.getUniformLocation(this.program, name)!;
    this.uRect = uniform('u_rect');
    this.uView = uniform('u_view');
    this.uOpacity = uniform('u_opacity');
    gl.useProgram(this.program);
    gl.uniform1i(uniform('u_tex'), 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  setScale(scale: number) {
    this.scale = scale * devicePixelRatio;
    const width = Math.round(STAGE_WIDTH * this.scale);
    const height = Math.round(STAGE_HEIGHT * this.scale);
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.uView, width, height);
  }

  show(c: PlacedComment) {
    const gl = this.gl;
    const r = rasterize(c, this.scale);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, r.canvas);
    this.layers[c.layer].set(c, { texture, offsetX: r.offsetX, offsetY: r.offsetY, width: r.canvas.width, height: r.canvas.height });
  }

  hide(c: PlacedComment) {
    const layer = this.layers[c.layer];
    const e = layer.get(c);
    if (!e) return;
    this.gl.deleteTexture(e.texture);
    layer.delete(c);
  }

  frame(nowMs: number) {
    const gl = this.gl;
    const k = this.scale;
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const layer of this.layers) {
      for (const [c, e] of layer) {
        if (nowMs < c.startMs || nowMs >= c.endMs) continue;
        gl.bindTexture(gl.TEXTURE_2D, e.texture);
        gl.uniform4f(this.uRect, xAt(c, nowMs) * k + e.offsetX, Math.round(c.y * k + e.offsetY), e.width, e.height);
        gl.uniform1f(this.uOpacity, commentOpacity(c));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
  }

  clear() {
    for (const layer of this.layers) {
      for (const e of layer.values()) this.gl.deleteTexture(e.texture);
      layer.clear();
    }
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.clear();
    this.gl.deleteProgram(this.program);
    this.canvas.remove();
  }
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    gl.attachShader(program, s);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
  return program;
}
