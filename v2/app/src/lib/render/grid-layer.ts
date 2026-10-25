/**
 * battlemap's grid lines over a map without its own: one quad, one fragment shader that draws
 * lines of a fixed width in **screen px** at any zoom (the old app's 0.5-world-px lines were a
 * tenth of a pixel on the table) and fades them out when squares get smaller than a few px, so
 * a zoomed-out map shows no moiré. Each line is two-toned — a dark core with a faint light rim —
 * so it reads on a dark cave and a parchment map alike.
 */
import { Buffer, BufferUsage, Geometry, Mesh, Shader, type Container } from 'pixi.js';
import { SQUARE } from './camera.ts';

const vertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vSq;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uGrid; // x cols, y rows, z line width px, w opacity
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  vec2 sq = aPosition * uGrid.xy;
  gl_Position = vec4((mvp * vec3(sq * ${SQUARE.toFixed(1)}, 1.0)).xy, 0.0, 1.0);
  vSq = sq;
}
`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec2 vSq;
out vec4 finalColor;
uniform vec4 uGrid;
uniform vec4 uColor; // the core's rgb (straight); the rim is white
void main() {
  vec2 fw = max(fwidth(vSq), vec2(1e-5));
  vec2 f = fract(vSq);
  vec2 dpx = min(f, 1.0 - f) / fw;          // distance to the nearest line, px per axis
  float d = min(dpx.x, dpx.y);
  float hw = uGrid.z * 0.5;
  // Two tones, so the lines read on any map: a dark core, and a faint light rim of one px on
  // each side that shows on dark maps where the core alone would vanish.
  float core = 1.0 - smoothstep(hw - 0.5, hw + 0.5, d);
  float rim = (1.0 - smoothstep(hw + 0.5, hw + 1.5, d)) - core;
  float pxPerSq = 1.0 / max(fw.x, fw.y);
  float k = smoothstep(3.0, 8.0, pxPerSq) * uGrid.w;
  float ac = core * k;
  float ar = rim * k * 0.45 * (1.0 - ac);
  finalColor = vec4(uColor.rgb * ac + vec3(ar), ac + ar);
}
`;

/** The grid quad. */
export class GridLayer {
  /** The mesh (added to the scene's grid slot). */
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly grid = new Float32Array([1, 1, 1, 0.45]);
  private readonly color = new Float32Array([0, 0, 0, 1]);

  /**
   * @param parent - the container the quad goes into
   * @param linePx - line width in screen px (TV 1.5, DM 1)
   */
  constructor(parent: Container, linePx: number) {
    this.grid[2] = linePx;
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Buffer({ data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), usage: BufferUsage.VERTEX }), format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const shader = Shader.from({
      gl: { vertex, fragment, name: 'battlemap-grid' },
      resources: { gridUniforms: { uGrid: { value: this.grid, type: 'vec4<f32>' }, uColor: { value: this.color, type: 'vec4<f32>' } } },
    });
    this.mesh = new Mesh({ geometry, shader, label: 'grid' });
    this.mesh.visible = false;
    parent.addChild(this.mesh);
  }

  /**
   * Shows the grid over `cols × rows` squares, or hides it.
   *
   * @param on - whether the grid shows
   * @param cols - map width in squares
   * @param rows - map height in squares
   * @returns whether anything changed
   */
  set(on: boolean, cols: number, rows: number): boolean {
    if (this.mesh.visible === on && this.grid[0] === cols && this.grid[1] === rows) return false;
    this.mesh.visible = on;
    this.grid[0] = cols;
    this.grid[1] = rows;
    return true;
  }

  /** Frees the quad. */
  destroy(): void {
    this.mesh.destroy();
  }
}
