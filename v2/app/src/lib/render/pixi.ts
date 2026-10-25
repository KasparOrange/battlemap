/**
 * PixiJS bootstrap: one WebGL2 application per screen, never auto-ticking — frames come only
 * from the `RenderScheduler`. The backing store is capped (the TV renders at most 1080 lines
 * and lets the compositor scale to 4K), resizes follow the host element, and the GPU facts are
 * logged once so a run on the box tells us what it is running on.
 *
 * The scene itself (map, fog, tokens, view profiles, layers) is the renderer package's work;
 * this file only gives it a canvas and a loop.
 *
 * @see ../../../../docs/architecture.md "rendering"
 */
import { Application, Container } from 'pixi.js';
import type { Logger } from '../log.ts';
import { RenderScheduler } from './scheduler.ts';

/** Options of {@link createRenderer}. */
export interface RendererOptions {
  /** The logger (area `render`). */
  log: Logger;
  /** Most backing-store lines (TV: 1080). Default: no cap. */
  maxRenderHeight?: number;
  /** Highest resolution multiplier (companion: 2). Default 2. */
  maxResolution?: number;
  /** Clear colour (default black). */
  background?: number;
}

/** A running renderer. */
export interface TableRenderer {
  /** The Pixi application (`app.stage` is the scene root). */
  readonly app: Application;
  /** Asks for frames. */
  readonly scheduler: RenderScheduler;
  /** The world container (camera transforms go here); screen-space layers sit beside it. */
  readonly world: Container;
  /** Stops observing, frees the GPU. */
  destroy(): void;
}

/**
 * The resolution multiplier for a host element: the device pixel ratio, capped by
 * `maxResolution` and so the backing store stays within `maxRenderHeight` lines.
 *
 * @param cssHeight - the host's height in CSS px
 * @param dpr - the device pixel ratio
 * @param opts - the caps
 * @returns the multiplier
 */
export function resolutionFor(cssHeight: number, dpr: number, opts: { maxRenderHeight?: number; maxResolution?: number }): number {
  let r = Math.min(dpr, opts.maxResolution ?? 2);
  if (opts.maxRenderHeight && cssHeight > 0) r = Math.min(r, opts.maxRenderHeight / cssHeight);
  return Math.max(0.25, r);
}

/**
 * Creates the renderer inside a host element (the canvas fills it).
 *
 * @param host - the element to fill
 * @param opts - logger and caps
 * @returns the renderer
 * @throws Error when WebGL can't be started (the caller shows it and logs it)
 */
export async function createRenderer(host: HTMLElement, opts: RendererOptions): Promise<TableRenderer> {
  const t0 = performance.now();
  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const resolution = resolutionFor(height, globalThis.devicePixelRatio || 1, opts);
  const app = new Application();
  await app.init({
    preference: 'webgl',
    autoStart: false,
    sharedTicker: false,
    antialias: false,
    autoDensity: true,
    resolution,
    width,
    height,
    background: opts.background ?? 0x000000,
    powerPreference: 'high-performance',
  });
  app.ticker.stop();
  const canvas = app.canvas;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  host.appendChild(canvas);

  const world = new Container({ label: 'world' });
  app.stage.addChild(world);
  const scheduler = new RenderScheduler(() => app.render());

  const observer = new ResizeObserver(() => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    app.renderer.resolution = resolutionFor(h, globalThis.devicePixelRatio || 1, opts);
    app.renderer.resize(w, h);
    scheduler.invalidate();
  });
  observer.observe(host);

  opts.log.info('render', 'Renderer ready', { ms: Math.round(performance.now() - t0), width, height, resolution, ...gpuFacts(app) });
  scheduler.invalidate();

  return {
    app,
    scheduler,
    world,
    destroy() {
      observer.disconnect();
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
      opts.log.info('render', 'Renderer destroyed');
    },
  };
}

/** What the GPU says about itself (for the log). */
function gpuFacts(app: Application): Record<string, unknown> {
  const facts: Record<string, unknown> = { rendererType: app.renderer.name };
  const gl = (app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
  if (!gl) return facts;
  facts.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  facts.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info) {
    facts.gpu = gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string;
    facts.gpuVendor = gl.getParameter(info.UNMASKED_VENDOR_WEBGL) as string;
  }
  return facts;
}
