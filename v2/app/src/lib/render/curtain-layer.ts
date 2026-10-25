/**
 * The curtain on the TV (roadmap N8; `docs/features.md` "the curtain"): the topmost screen-space
 * layer of the players' view. While the game's curtain is down it covers everything — plain
 * black, or the calm "next scene…" plate: a small gold eyebrow, the game's name in the story
 * face, the DM's line under it, and a slow ambient (a candle glow that breathes, a few embers
 * drifting up) at 15 frames a second.
 *
 * The timing lives in `curtain-clock.ts` (pure, tested): the scene asks {@link CurtainLayer.want}
 * on every state and keeps its old state while the curtain falls; once it is fully down the
 * world under it is switched off (no fill cost while the plate shows) and the newest state is
 * drawn behind it; the lift waits until the map behind is ready, then fades in one go.
 *
 * Only the TV has one — the DM's view shows the curtain as a badge on the tablet instead.
 */
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Curtain } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import type { RenderScheduler } from './scheduler.ts';
import { CurtainClock, type CurtainFrame } from './curtain-clock.ts';

/** Embers drifting on the plate. */
const EMBERS = 26;
/** Frames per second of the plate's ambient (slow drift needs few). */
const AMBIENT_FPS = 15;

/** What the curtain layer needs from its scene. */
export interface CurtainHost {
  /** The scene's loop. */
  scheduler: RenderScheduler;
  /** The logger. */
  log: Logger;
  /** The host's size in CSS px. */
  viewport: () => { width: number; height: number };
  /** Whether the map behind is ready to be seen (its picture shown, or no map). */
  mapReady: () => boolean;
  /** Switches the world (and the other screen layers) off while the curtain is fully down. */
  setCovered: (covered: boolean) => void;
  /** The fall is over: the scene draws the state it held back. */
  release: () => void;
  /** The clock, ms (default `performance.now`). */
  now?: () => number;
}

/** One ember of the ambient. */
interface Ember {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
  sway: number;
  phase: number;
  size: number;
}

/** The TV's curtain. */
export class CurtainLayer {
  /** The layer's container (on the stage, above everything). */
  readonly container = new Container({ label: 'curtain' });
  private readonly clock = new CurtainClock();
  private readonly black = new Graphics({ label: 'curtain-black' });
  private readonly plate = new Container({ label: 'curtain-plate' });
  private readonly glow: Sprite;
  private readonly eyebrow: Text;
  private readonly title: Text;
  private readonly line: Text;
  private readonly rule = new Graphics({ label: 'curtain-rule' });
  private readonly embers: Ember[] = [];
  private readonly glowTexture: Texture;
  private readonly now: () => number;
  private curtain: Curtain | null = null;
  private gameName = '';
  private sizeKey = '';
  private textKey = '';
  private fadeLease: (() => void) | null = null;
  private ambientLease: (() => void) | null = null;
  private covered = false;
  private wasHolding = false;
  private readonly stopTicker: () => void;

  /**
   * @param parent - the stage (the curtain goes on top of it)
   * @param host - the scene's side (loop, sizes, readiness, cover and release)
   */
  constructor(parent: Container, private readonly host: CurtainHost) {
    this.now = host.now ?? (() => performance.now());
    const ink = token('--t', '#f0e8dc');
    const muted = token('--t2', '#c4b8a4');
    const gold = token('--accent', '#e3b45e');
    this.glowTexture = glowTexture(gold);
    this.glow = new Sprite({ texture: this.glowTexture, anchor: 0.5, alpha: 0.25 });
    this.eyebrow = new Text({ text: 'NEXT SCENE', anchor: { x: 0.5, y: 1 }, style: { fontFamily: 'Space Grotesk, Outfit, system-ui, sans-serif', fontWeight: '600', fill: gold, letterSpacing: 6, fontSize: 24 } });
    this.title = new Text({ text: '', anchor: 0.5, style: { fontFamily: 'Fraunces, Georgia, serif', fontWeight: '600', fill: ink, fontSize: 80, align: 'center' } });
    this.line = new Text({ text: '', anchor: { x: 0.5, y: 0 }, style: { fontFamily: 'Outfit, system-ui, sans-serif', fill: muted, fontSize: 36, align: 'center', wordWrap: true, wordWrapWidth: 1200 } });
    this.plate.addChild(this.glow);
    for (let i = 0; i < EMBERS; i++) {
      const sprite = new Sprite({ texture: this.glowTexture, anchor: 0.5 });
      this.plate.addChild(sprite);
      this.embers.push({ sprite, x: 0, y: 0, speed: 0, sway: 0, phase: 0, size: 0 });
    }
    this.plate.addChild(this.eyebrow, this.title, this.rule, this.line);
    this.container.addChild(this.black, this.plate);
    this.container.visible = false;
    this.container.eventMode = 'none';
    parent.addChild(this.container);
    this.stopTicker = host.scheduler.onFrame((now) => this.tick(now));
    this.seedEmbers();
  }

  /**
   * The state's curtain and the game's name. Called by the scene before it draws a state.
   *
   * @param curtain - the open game's curtain, or null without a game
   * @param gameName - the game's name (the plate's title)
   * @param snap - jump without a fade (another game opened, the first state)
   * @returns whether the scene must keep drawing its old state (the curtain is falling)
   */
  want(curtain: Curtain | null, gameName: string, snap: boolean): boolean {
    const before = this.curtain;
    this.curtain = curtain;
    this.gameName = gameName;
    const down = !!curtain?.down;
    if ((before?.down ?? false) !== down || snap) this.host.log.info('render', down ? 'Curtain down' : 'Curtain up', { plate: !!curtain?.plate, snap });
    const hold = this.clock.want(down, this.now(), snap);
    if (hold) this.wasHolding = true;
    this.host.scheduler.invalidate(); // the ticker steps the clock before the next frame
    return hold;
  }

  /** The current phase (for the bench and tests). */
  get phase(): string {
    return this.clock.current;
  }

  /** Before each frame: step the fade, the ambient, the size. */
  private tick(now: number): void {
    if (!this.container.visible && this.clock.current === 'up') return;
    this.layout();
    const frame = this.clock.step(now, this.host.mapReady());
    this.sync(frame);
    if (this.plate.visible) this.stepEmbers(now);
  }

  /** Puts a frame of the clock on screen: opacity, leases, cover, release of a held state. */
  private sync(frame: CurtainFrame): void {
    const shown = frame.alpha > 0;
    this.container.visible = shown;
    this.container.alpha = frame.alpha;
    this.plate.visible = shown && !!this.curtain?.plate;
    const covered = frame.phase === 'down';
    if (covered !== this.covered) {
      this.covered = covered;
      this.host.setCovered(covered);
    }
    if (frame.animating && !this.fadeLease) this.fadeLease = this.host.scheduler.hold('curtain-fade');
    if (!frame.animating && this.fadeLease) {
      this.fadeLease();
      this.fadeLease = null;
      this.host.scheduler.invalidate();
    }
    const ambient = this.plate.visible;
    if (ambient && !this.ambientLease) this.ambientLease = this.host.scheduler.hold('curtain-ambient', AMBIENT_FPS);
    if (!ambient && this.ambientLease) {
      this.ambientLease();
      this.ambientLease = null;
    }
    if (this.wasHolding && !frame.hold) {
      this.wasHolding = false;
      this.host.release();
    }
  }

  /** Sizes the black and the plate to the host, and sets the plate's text when it changed. */
  private layout(): void {
    const { width, height } = this.host.viewport();
    const sizeKey = `${width}x${height}`;
    const text = this.curtain?.text ?? '';
    const textKey = `${sizeKey}|${this.gameName}|${text}`;
    if (sizeKey !== this.sizeKey) {
      this.sizeKey = sizeKey;
      this.black.clear().rect(0, 0, width, height).fill(token('--bg', '#0e0c0a'));
      this.seedEmbers();
    }
    if (textKey === this.textKey) return;
    this.textKey = textKey;
    const u = width / 64; // the TV's rem (design.md "the TV")
    const cx = width / 2;
    const cy = height / 2;
    this.title.text = this.gameName || 'battlemap';
    this.title.style.fontSize = Math.round(u * 2.6);
    this.title.style.wordWrap = true;
    this.title.style.wordWrapWidth = width * 0.8;
    this.title.position.set(cx, cy - u * 0.4);
    this.eyebrow.style.fontSize = Math.round(u * 0.62);
    this.eyebrow.style.letterSpacing = Math.round(u * 0.22);
    this.eyebrow.position.set(cx, this.title.y - this.title.height / 2 - u * 0.7);
    const ruleY = this.title.y + this.title.height / 2 + u * 0.7;
    this.rule.clear().rect(cx - u * 1.6, ruleY, u * 3.2, Math.max(1, u * 0.06)).fill({ color: token('--accent', '#e3b45e'), alpha: 0.7 });
    this.line.text = text;
    this.line.visible = text.length > 0;
    this.line.style.fontSize = Math.round(u * 1.05);
    this.line.style.wordWrapWidth = width * 0.7;
    this.line.position.set(cx, ruleY + u * 0.8);
    this.glow.position.set(cx, cy);
    this.glow.width = this.glow.height = Math.max(width, height) * 0.9;
  }

  /** Scatters the embers over the lower part of the screen. */
  private seedEmbers(): void {
    const { width, height } = this.host.viewport();
    const u = width / 64;
    this.embers.forEach((e, i) => {
      const r = rand(i);
      e.x = width * (0.15 + 0.7 * r());
      e.y = height * (0.3 + 0.75 * r());
      e.speed = u * (0.25 + 0.45 * r()); // per second: a slow rise
      e.sway = u * (0.2 + 0.5 * r());
      e.phase = r() * Math.PI * 2;
      e.size = u * (0.25 + 0.5 * r());
      e.sprite.width = e.sprite.height = e.size;
    });
  }

  /** Moves the embers and breathes the glow (no allocations). */
  private stepEmbers(now: number): void {
    const { height } = this.host.viewport();
    const s = now / 1000;
    this.glow.alpha = 0.2 + 0.07 * Math.sin(s * 0.8) + 0.03 * Math.sin(s * 2.3);
    for (const e of this.embers) {
      const y = e.y - ((s * e.speed) % (height * 1.1));
      const yy = y < -e.size ? y + height * 1.1 : y;
      e.sprite.x = e.x + Math.sin(s * 0.6 + e.phase) * e.sway;
      e.sprite.y = yy;
      // fade in from the bottom, out towards the top, with a flicker
      const v = Math.min(1, Math.max(0, yy / height));
      e.sprite.alpha = Math.sin(v * Math.PI) * (0.55 + 0.25 * Math.sin(s * 3 + e.phase * 3));
    }
  }

  /** Frees the layer. */
  destroy(): void {
    this.stopTicker();
    this.fadeLease?.();
    this.ambientLease?.();
    this.container.destroy({ children: true });
    this.glowTexture.destroy(true);
  }
}

/**
 * A design token's value from the page (the renderer draws, it doesn't style), with a fallback
 * outside a browser.
 *
 * @param name - the custom property
 * @param fallback - its value when there is no document
 * @returns the colour text
 */
function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** A soft round glow in the accent colour (64 px), shared by the glow and the embers. */
function glowTexture(color: string): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, `${color}88`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return Texture.from(c);
}

/** A small seeded random source (mulberry32: the same embers on every TV). */
function rand(seed: number): () => number {
  let a = (seed + 1) * 0x9e3779b1 | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
