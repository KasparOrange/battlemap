/**
 * The fog layer: one quad over the map drawn by one fragment shader that reads a texture of
 * one RGBA texel per square (`fog-texels.ts`). It does the fog styles (standard 4 px soft edge,
 * soft 16 px, cloud with drifting bumps, atmospheric by distance), "trim revealed edges" (each
 * fogged square grows by the inset — the old `fogRevealRects` rule, map border never trimmed),
 * the reveal fade (G channel, stepped by `FogFade` under a render lease) and, on the DM's view,
 * 70 % fog with the preview's staged squares tinted blue (reveal) or red (hide).
 *
 * Only changed rows are uploaded (`changedRows` → `source.update(start, end)`).
 */
import { Buffer, BufferUsage, Geometry, Mesh, Shader, Texture, BufferImageSource, type Container } from 'pixi.js';
import type { FogState, GameSettings } from '@battlemap/shared';
import { SQUARE } from './camera.ts';
import { changedRows, FogFade, writeFogTexels } from './fog-texels.ts';
import type { RenderScheduler } from './scheduler.ts';

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vSq;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec2 uSize;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  vec2 world = aPosition * uSize * ${SQUARE.toFixed(1)};
  gl_Position = vec4((mvp * vec3(world, 1.0)).xy, 0.0, 1.0);
  vSq = aPosition * uSize;
}
`;

const fragment = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vSq;
out vec4 finalColor;
uniform sampler2D uFog;
uniform vec2 uSize;
uniform vec4 uLook;  // x inset (squares), y edge blur (px), z fog opacity, w deepest atmospheric fog
uniform vec4 uMode;  // x style (0 standard, 1 soft, 2 cloud, 3 atmospheric), y time (s), z DM tints on

ivec2 clampCell(ivec2 c) { return clamp(c, ivec2(0), ivec2(uSize) - 1); }

bool inMap(ivec2 c) { return c.x >= 0 && c.y >= 0 && c.x < int(uSize.x) && c.y < int(uSize.y); }

float boxSdf(vec2 p, vec2 lo, vec2 hi) {
  vec2 c = (lo + hi) * 0.5;
  vec2 d = abs(p - c) - (hi - lo) * 0.5;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float level(ivec2 c) { return texelFetch(uFog, clampCell(c), 0).a * 255.0 / 63.0; }

float atmos(float lv, float deep) {
  if (lv <= 1.0) return lv * 0.35;
  if (lv <= 2.0) return mix(0.35, 0.55, lv - 1.0);
  if (lv <= 3.0) return mix(0.55, 0.75, lv - 2.0);
  return mix(0.75, deep, clamp(lv - 3.0, 0.0, 1.0));
}

void main() {
  vec2 p = vSq;
  ivec2 c = clampCell(ivec2(floor(p)));
  vec4 here = texelFetch(uFog, c, 0);
  int bits = int(here.b * 255.0 + 0.5);
  vec2 fw = fwidth(p);
  float sqPerPx = max(max(fw.x, fw.y), 1e-5);
  bool revealed = here.r > 0.5;
  float a;
  if (uMode.x > 2.5) {
    vec2 q = p - 0.5;
    ivec2 b = ivec2(floor(q));
    vec2 f = q - vec2(b);
    float l = mix(mix(level(b), level(b + ivec2(1, 0)), f.x), mix(level(b + ivec2(0, 1)), level(b + ivec2(1, 1)), f.x), f.y);
    a = atmos(l, uLook.w);
  } else {
    float inset = uLook.x;
    float w = clamp(uLook.y * sqPerPx, sqPerPx, 0.9);
    float bump = 0.0;
    if (uMode.x > 1.5) {
      float t = uMode.y;
      bump = 0.16 * (0.5 + 0.5 * sin(p.x * 4.7 + t * 0.5 + sin(p.y * 3.1)) * sin(p.y * 5.3 - t * 0.4 + sin(p.x * 2.3)));
    }
    if (revealed && (bits & 4) == 0) {
      a = 0.0;
    } else {
      float sd = 1e3;
      if (!revealed) sd = boxSdf(p, vec2(c) - inset, vec2(c) + 1.0 + inset);
      if (sd - bump > -0.5 * w) {
        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            ivec2 n = c + ivec2(dx, dy);
            if (!inMap(n) || texelFetch(uFog, n, 0).r > 0.5) continue;
            sd = min(sd, boxSdf(p, vec2(n) - inset, vec2(n) + 1.0 + inset));
          }
        }
      }
      a = 1.0 - smoothstep(-0.5 * w, 0.5 * w, sd - bump);
    }
  }
  a = max(a, revealed ? here.g : 0.0) * uLook.z;
  vec4 col = vec4(0.0, 0.0, 0.0, a);
  if (uMode.z > 0.5) {
    int staged = bits & 3;
    if (staged == 1) col = vec4(0.482, 0.408, 0.933, 1.0) * 0.30 + col * 0.70;
    else if (staged == 2) col = vec4(0.898, 0.224, 0.208, 1.0) * 0.20 + col * 0.80;
  }
  finalColor = col;
}
`;

/** Edge blur per fog style, in screen px. */
const BLUR_PX: Record<GameSettings['fogStyle'], number> = { standard: 4, soft: 16, cloud: 0, atmospheric: 0 };

const STYLE_INDEX: Record<GameSettings['fogStyle'], number> = { standard: 0, soft: 1, cloud: 2, atmospheric: 3 };

/** What the fog layer draws for one profile. */
export interface FogLook {
  /** Fog opacity: 1 on the TV, 0.7 on the DM's view. */
  opacity: number;
  /** Deepest atmospheric fog: 1 on the TV, 0.9 on the DM's view. */
  deep: number;
  /** Whether staged squares are tinted (DM only). */
  tints: boolean;
}

/** The fog quad and its texture for the map on the table. */
export class FogLayer {
  /** The mesh (added to the scene's fog slot). */
  readonly mesh: Mesh<Geometry, Shader>;
  private texture: Texture | null = null;
  private source: BufferImageSource | null = null;
  private texels: Uint8Array = new Uint8Array(0);
  private scratch: Uint8Array = new Uint8Array(0);
  private dist: Uint8Array = new Uint8Array(0);
  private cols = 0;
  private rows = 0;
  private fog: FogState | null = null;
  private readonly fade = new FogFade();
  private releaseFade: (() => void) | null = null;
  private releaseDrift: (() => void) | null = null;
  private readonly uniforms: { uSize: Float32Array; uLook: Float32Array; uMode: Float32Array };
  private style: GameSettings['fogStyle'] = 'standard';
  private fadeOn = true;
  private readonly stopTicker: () => void;

  /**
   * @param parent - the container the quad goes into
   * @param look - the profile's look
   * @param scheduler - for the fade and cloud-drift leases
   */
  constructor(parent: Container, look: FogLook, private readonly scheduler: RenderScheduler) {
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Buffer({ data: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), usage: BufferUsage.VERTEX }), format: 'float32x2' } },
      indexBuffer: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    const uniforms = {
      uSize: new Float32Array([1, 1]),
      uLook: new Float32Array([0, 4, look.opacity, look.deep]),
      uMode: new Float32Array([0, 0, look.tints ? 1 : 0, 0]),
    };
    this.source = this.makeSource(1, 1);
    this.texture = new Texture({ source: this.source });
    const shader = Shader.from({
      gl: { vertex, fragment, name: 'battlemap-fog' },
      resources: {
        fogUniforms: {
          uSize: { value: uniforms.uSize, type: 'vec2<f32>' },
          uLook: { value: uniforms.uLook, type: 'vec4<f32>' },
          uMode: { value: uniforms.uMode, type: 'vec4<f32>' },
        },
        uFog: this.source,
      },
    });
    this.uniforms = uniforms;
    this.mesh = new Mesh({ geometry, shader, label: 'fog' });
    this.mesh.visible = false;
    parent.addChild(this.mesh);
    this.stopTicker = scheduler.onFrame((now) => this.tick(now));
  }

  /** Texture bytes held. */
  get bytes(): number {
    return this.texels.length;
  }

  /**
   * Shows a map's fog (or hides the layer for null / fog off).
   *
   * @param fog - the map's fog, or null
   * @param cols - map width in squares
   * @param rows - map height in squares
   * @param settings - the game's settings (style, trim, fade)
   * @param fresh - a new map or a snapshot: no fade for what is already revealed
   * @returns whether anything changed on screen
   */
  set(fog: FogState | null, cols: number, rows: number, settings: GameSettings, fresh: boolean): boolean {
    let changed = false;
    if (this.style !== settings.fogStyle || this.uniforms.uLook[0] !== settings.fogEdgeInset / 100 || this.fadeOn !== settings.fogFade) {
      this.style = settings.fogStyle;
      this.fadeOn = settings.fogFade;
      this.uniforms.uLook[0] = Math.min(45, Math.max(0, settings.fogEdgeInset)) / 100;
      this.uniforms.uLook[1] = BLUR_PX[settings.fogStyle];
      this.uniforms.uMode[0] = STYLE_INDEX[settings.fogStyle];
      this.updateDrift();
      changed = true;
    }
    const visible = !!fog && fog.on;
    if (this.mesh.visible !== visible) {
      this.mesh.visible = visible;
      changed = true;
    }
    if (!fog) {
      this.fog = null;
      return changed;
    }
    if (cols !== this.cols || rows !== this.rows) this.resize(cols, rows);
    if (fog === this.fog && !fresh) return changed;
    // Build the new texels next to the current ones, fade what turned revealed, upload the rows.
    this.scratch.set(this.texels);
    writeFogTexels(fog, cols, rows, this.scratch, this.dist);
    const now = performance.now();
    if (fresh || !this.fadeOn) {
      for (let i = 1; i < this.scratch.length; i += 4) this.scratch[i] = 0;
      this.fade.clear();
    } else if (this.fade.start(this.texels, this.scratch, now) > 0 && !this.releaseFade) {
      this.releaseFade = this.scheduler.hold('fog-fade');
    }
    const rowsChanged = changedRows(this.texels, this.scratch, cols);
    this.fog = fog;
    if (!rowsChanged) return changed;
    this.texels.set(this.scratch.subarray(rowsChanged.first * cols * 4, (rowsChanged.last + 1) * cols * 4), rowsChanged.first * cols * 4);
    this.source!.update(rowsChanged.first * cols, (rowsChanged.last + 1) * cols);
    return true;
  }

  /** Steps the fade and the cloud drift (before each frame). */
  private tick(now: number): void {
    if (this.uniforms.uMode[0] === 2) this.uniforms.uMode[1] = now / 1000;
    if (this.fade.active === 0) return;
    const rows = this.fade.step(this.texels, this.cols, now);
    if (rows) this.source!.update(rows.first * this.cols, (rows.last + 1) * this.cols);
    if (this.fade.active === 0 && this.releaseFade) {
      this.releaseFade();
      this.releaseFade = null;
    }
  }

  /** Cloud fog drifts slowly: a 20 fps lease while the style is cloud and the layer shows. */
  private updateDrift(): void {
    const want = this.style === 'cloud';
    if (want && !this.releaseDrift) this.releaseDrift = this.scheduler.hold('fog-cloud', 20);
    if (!want && this.releaseDrift) {
      this.releaseDrift();
      this.releaseDrift = null;
    }
  }

  private resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.texels = new Uint8Array(cols * rows * 4);
    this.scratch = new Uint8Array(cols * rows * 4);
    this.dist = new Uint8Array(cols * rows);
    this.uniforms.uSize[0] = cols;
    this.uniforms.uSize[1] = rows;
    const old = this.source;
    this.source = this.makeSource(cols, rows);
    this.texture?.destroy(false);
    this.texture = new Texture({ source: this.source });
    this.mesh.shader!.resources.uFog = this.source;
    old?.destroy();
    this.fade.clear();
    this.fog = null;
  }

  private makeSource(cols: number, rows: number): BufferImageSource {
    if (this.texels.length !== cols * rows * 4) this.texels = new Uint8Array(cols * rows * 4);
    return new BufferImageSource({
      resource: this.texels,
      width: cols,
      height: rows,
      format: 'rgba8unorm',
      alphaMode: 'no-premultiply-alpha',
      scaleMode: 'nearest',
      autoGenerateMipmaps: false,
      label: 'fog',
    });
  }

  /** Frees the texture and the leases. */
  destroy(): void {
    this.stopTicker();
    this.releaseFade?.();
    this.releaseDrift?.();
    this.mesh.destroy();
    this.texture?.destroy(true);
    this.texture = null;
    this.source = null;
  }
}
