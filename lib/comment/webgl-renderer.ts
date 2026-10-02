import { CanvasCommentRenderer, type Sprite } from './canvas-renderer';

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

/** コメント 1 件を 1 テクスチャにし、WebGL2 で 1 件につき 1 回の draw call で重ねる。 */
export class WebGlCommentRenderer extends CanvasCommentRenderer<WebGLTexture> {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uRect: WebGLUniformLocation;
  private readonly uView: WebGLUniformLocation;
  private readonly uOpacity: WebGLUniformLocation;

  constructor(root: HTMLElement) {
    super(root);
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) {
      this.canvas.remove();
      throw new Error('WebGL2 is not available');
    }
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

  protected upload(source: OffscreenCanvas) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return t;
  }

  protected release(texture: WebGLTexture) {
    this.gl.deleteTexture(texture);
  }

  protected resize(width: number, height: number) {
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.uView, width, height);
  }

  protected draw(sprites: readonly Sprite<WebGLTexture>[]) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const s of sprites) {
      gl.bindTexture(gl.TEXTURE_2D, s.texture);
      gl.uniform4f(this.uRect, s.x, s.y, s.width, s.height);
      gl.uniform1f(this.uOpacity, s.opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  protected dispose() {
    this.gl.deleteProgram(this.program);
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
