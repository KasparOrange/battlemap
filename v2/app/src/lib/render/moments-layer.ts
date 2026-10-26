/**
 * Table moments on the table view (roadmap S6, S8, S11; `docs/features.md` "table moments"):
 *
 * - **Spotlight** (world, both views, between the doors and `fx.air`): a soft warm light ring
 *   under one mini and the rest of the table a little dimmer — one sprite (the ring and its soft
 *   falloff, from a small generated texture) and one graphics of four rects (the dim around it).
 *   It glides when moved and fades in and out (a lease only while it does); static = no frames.
 * - **DM notes** (world, DM view only, above the DM layers): a gold pin and a pill with the
 *   note's first line, the same size on screen at any zoom and upright whatever the camera's
 *   turn. The TV never builds them.
 * - **Countdown** (screen, TV only, above `fx.screen` and below the curtain): a ring at the middle
 *   of each long edge, each turned upright for its side, with the time in big digits. While it
 *   runs the layer draws one frame per second (a timer at the next whole second, no lease); in
 *   the last ten seconds the rings pulse gently (a 30 fps lease); when it runs out the chosen end
 *   effect plays once (glow: the rings flare; flash: the table flashes warm white).
 *
 * The maths are in `moments-logic.ts` (pure, tested).
 */
import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { timerLeft, type DmNote, type Game, type MapPlay, type Point, type Timer } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { SQUARE, type Size } from './camera.ts';
import { FONT_NAME, FONT_TEXT, GLYPH_PX, installFonts } from './fonts.ts';
import { END_EFFECT_MS, endEffectDue, noteLabel, ringPlaces, spotlightCenter, timerFace, type TimerFace } from './moments-logic.ts';
import type { RenderScheduler } from './scheduler.ts';

/** Half the side of the spotlight's soft square, in squares (the ring sits well inside it). */
const SPOT_HALF = 1.7;
/** The ring's radius in squares (a one-inch base is 0.5). */
const RING_SQ = 0.66;
/** Spotlight texture size, px. */
const SPOT_PX = 256;
/** How long the spotlight glides to a new square, ms. */
const GLIDE_MS = 260;
/** How far the world reaches around the map for the dim, in squares (it must cover the screen). */
const DIM_REACH = 400;
/** The DM's own view dims at this share of the players' dim (the DM must still read the map). */
const DM_DIM_SHARE = 0.45;
/** Note pin and text size on the DM's screen, CSS px. */
const NOTE_PX = { pin: 9, text: 13, padX: 7, padY: 4 };
/** Frames per second of the last ten seconds' pulse. */
const PULSE_FPS = 30;

/** What the layer needs from its scene. */
export interface MomentsHost {
  /** The DM's view (notes, a softer dim) or the TV's (the countdown). */
  dm: boolean;
  /** The world container (spotlight and notes go in at the right places). */
  world: Container;
  /** The world child the spotlight goes under (`fx.air`). */
  spotBelow: Container;
  /** The world child the notes go under (`tools`). */
  notesBelow: Container;
  /** The stage (the countdown goes on it). */
  stage: Container;
  /** The stage child the countdown goes right above (`fx.screen`). */
  timerAbove: Container;
  /** The loop. */
  scheduler: RenderScheduler;
  /** The logger. */
  log: Logger;
  /** The host size, CSS px. */
  viewport: () => Size;
  /** The server's clock, epoch ms (the countdown is stamped with it). */
  now: () => number;
  /** A frame clock, ms (default `performance.now`) for glides and pulses. */
  frameNow?: () => number;
}

/** One note on the DM's map. */
interface NoteView {
  note: DmNote;
  root: Container;
  pin: Graphics;
  pill: Graphics;
  text: BitmapText;
}

/** One countdown ring. */
interface Ring {
  root: Container;
  disc: Graphics;
  arc: Graphics;
  digits: BitmapText;
}

/** The moments layer of one screen. */
export class MomentsLayer {
  private readonly spot = new Container({ label: 'spotlight' });
  private readonly spotSprite: Sprite;
  private readonly spotDim = new Graphics({ label: 'spotlight-dim' });
  private spotTexture: Texture | null = null;
  private spotTextureDim = -1;
  private spotAt: Point | null = null;
  private spotFrom: Point | null = null;
  private spotTo: Point | null = null;
  private spotDimValue = 0;
  private spotAlpha = 0;
  private spotGoal = 0;
  private spotT0 = 0;
  private spotLease: (() => void) | null = null;
  private mapSize = { cols: 1, rows: 1 };

  private readonly notes: Container | null;
  private readonly noteViews = new Map<string, NoteView>();
  private noteList: readonly DmNote[] | null = null;
  private zoom = SQUARE;
  private rotation = 0;

  private readonly timerBox: Container | null;
  private readonly rings: Ring[] = [];
  private readonly flash: Graphics | null;
  private timer: Timer | null = null;
  private face: TimerFace | null = null;
  private ringKey = '';
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseLease: (() => void) | null = null;
  private endLease: (() => void) | null = null;
  private endStart = 0;
  private endPlayedFor: string | null = null;
  private covered = false;

  private readonly frameNow: () => number;
  private readonly stopTicker: () => void;

  /** @param host - the scene's side */
  constructor(private readonly host: MomentsHost) {
    this.frameNow = host.frameNow ?? (() => performance.now());
    const world = host.world;
    world.addChildAt(this.spot, world.getChildIndex(host.spotBelow));
    this.spotSprite = new Sprite({ texture: Texture.EMPTY, anchor: 0.5 });
    this.spot.addChild(this.spotDim, this.spotSprite);
    this.spot.visible = false;
    this.spot.eventMode = 'none';

    if (host.dm) {
      this.notes = new Container({ label: 'notes' });
      this.notes.eventMode = 'none';
      world.addChildAt(this.notes, world.getChildIndex(host.notesBelow));
      this.timerBox = null;
      this.flash = null;
    } else {
      this.notes = null;
      this.timerBox = new Container({ label: 'timer' });
      this.timerBox.eventMode = 'none';
      this.timerBox.visible = false;
      this.flash = new Graphics({ label: 'timer-flash' });
      this.flash.visible = false;
      this.timerBox.addChild(this.flash);
      host.stage.addChildAt(this.timerBox, host.stage.getChildIndex(host.timerAbove) + 1);
    }
    this.stopTicker = host.scheduler.onFrame((t) => this.tick(t));
  }

  /**
   * Draws the moments of a state.
   *
   * @param game - the open game, or null
   * @param map - the map on the table, or null
   * @param newMap - another map (or game) came on the table: the spotlight jumps, no glide
   * @returns whether something on screen changed (the scene asks for a frame)
   */
  set(game: Game | null, map: MapPlay | null, newMap: boolean): boolean {
    let changed = this.setSpotlight(map, newMap);
    if (this.notes) changed = this.setNotes(map?.notes ?? null) || changed;
    if (this.timerBox) changed = this.setTimer(game?.timer ?? null) || changed;
    return changed;
  }

  /**
   * The camera's turn and zoom: notes stay the same size on screen and upright.
   *
   * @param rotation - the world's rotation, radians
   * @param zoom - screen px per square
   */
  setCamera(rotation: number, zoom: number): void {
    if (rotation === this.rotation && zoom === this.zoom) return;
    this.rotation = rotation;
    this.zoom = zoom;
    for (const v of this.noteViews.values()) this.placeNote(v);
  }

  /**
   * The curtain is fully down (the TV): the countdown under it needs no drawing.
   *
   * @param covered - whether the curtain covers the screen
   */
  setCovered(covered: boolean): void {
    this.covered = covered;
    if (this.timerBox) this.timerBox.visible = !covered && this.timer !== null;
  }

  // ── spotlight ────────────────────────────────────────────────────────────────────────────

  private setSpotlight(map: MapPlay | null, newMap: boolean): boolean {
    const spot = map?.spotlight ?? null;
    const at = map ? spotlightCenter(spot, map, this.host.dm) : null;
    const dim = spot ? spot.dim * (this.host.dm ? DM_DIM_SHARE : 1) : this.spotDimValue;
    if (map) this.mapSize = { cols: map.info.grid.cols, rows: map.info.grid.rows };
    const goal = at ? 1 : 0;
    if (!at && this.spotGoal === 0 && !this.spotLease) {
      this.spot.visible = false;
      return false;
    }
    const same = samePoint(at, this.spotTo) && dim === this.spotDimValue && goal === this.spotGoal;
    if (same && !newMap) return false;
    const now = this.frameNow();
    if (at) {
      if (!this.spotAt || newMap || this.spotGoal === 0) {
        this.spotAt = at;
        this.spotFrom = at;
      } else {
        this.spotFrom = this.spotAt;
      }
      this.spotTo = at;
    }
    if (goal !== this.spotGoal) this.host.log.info('render', goal ? 'Spotlight on' : 'Spotlight off', { profile: this.host.dm ? 'dm' : 'players', ...(at ? { x: at.x, y: at.y } : {}) });
    this.spotGoal = goal;
    this.spotDimValue = dim;
    this.spotT0 = now;
    if (at) this.drawSpotTexture(dim);
    if (newMap) {
      // another map: no glide, no fade — the light is simply there (or not)
      this.spotLease?.();
      this.spotLease = null;
      this.spotFrom = this.spotTo;
      this.layoutSpot(1);
      this.spotAlpha = goal;
      this.spot.alpha = goal;
      this.spot.visible = goal > 0;
      return true;
    }
    this.layoutSpot(0);
    this.animateSpot();
    return true;
  }

  /** Redraws the ring texture for a dim level (three levels in practice; drawn once each change). */
  private drawSpotTexture(dim: number): void {
    if (dim === this.spotTextureDim && this.spotTexture) return;
    this.spotTextureDim = dim;
    const c = document.createElement('canvas');
    c.width = c.height = SPOT_PX;
    const g = c.getContext('2d')!;
    const h = SPOT_PX / 2;
    const px = h / SPOT_HALF; // texture px per square
    const ring = RING_SQ * px;
    // the dim: clear inside the light, rising to the dim at the square's edge (and in its corners)
    const shade = g.createRadialGradient(h, h, ring * 0.9, h, h, h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.55, `rgba(0,0,0,${(dim * 0.7).toFixed(3)})`);
    shade.addColorStop(1, `rgba(0,0,0,${dim.toFixed(3)})`);
    g.fillStyle = shade;
    g.fillRect(0, 0, SPOT_PX, SPOT_PX);
    // a warm pool of light under the mini
    const pool = g.createRadialGradient(h, h, 0, h, h, ring * 1.25);
    pool.addColorStop(0, 'rgba(255,214,140,0.30)');
    pool.addColorStop(0.7, 'rgba(255,196,110,0.16)');
    pool.addColorStop(1, 'rgba(255,190,100,0)');
    g.fillStyle = pool;
    g.beginPath();
    g.arc(h, h, ring * 1.25, 0, Math.PI * 2);
    g.fill();
    // the ring: a soft gold band with a bright core
    g.lineWidth = px * 0.16;
    g.strokeStyle = 'rgba(255,200,110,0.35)';
    g.beginPath();
    g.arc(h, h, ring, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = px * 0.05;
    g.strokeStyle = 'rgba(255,236,190,0.95)';
    g.beginPath();
    g.arc(h, h, ring, 0, Math.PI * 2);
    g.stroke();
    const old = this.spotTexture;
    this.spotTexture = Texture.from(c);
    this.spotSprite.texture = this.spotTexture;
    this.spotSprite.width = this.spotSprite.height = SPOT_HALF * 2 * SQUARE;
    old?.destroy(true);
  }

  /** Puts the sprite and the dim rects at the spotlight's place (`k` = glide progress 0–1). */
  private layoutSpot(k: number): void {
    const from = this.spotFrom;
    const to = this.spotTo;
    if (!from || !to) return;
    const e = 1 - (1 - k) ** 3;
    const x = (from.x + (to.x - from.x) * e) * SQUARE;
    const y = (from.y + (to.y - from.y) * e) * SQUARE;
    this.spotAt = { x: x / SQUARE, y: y / SQUARE };
    this.spotSprite.position.set(x, y);
    const half = SPOT_HALF * SQUARE;
    const reach = DIM_REACH * SQUARE;
    const x0 = -reach;
    const y0 = -reach;
    const x1 = this.mapSize.cols * SQUARE + reach;
    const y1 = this.mapSize.rows * SQUARE + reach;
    const a = { x0: x - half, y0: y - half, x1: x + half, y1: y + half };
    this.spotDim.clear()
      .rect(x0, y0, x1 - x0, a.y0 - y0)
      .rect(x0, a.y1, x1 - x0, y1 - a.y1)
      .rect(x0, a.y0, a.x0 - x0, a.y1 - a.y0)
      .rect(a.x1, a.y0, x1 - a.x1, a.y1 - a.y0)
      .fill({ color: 0x000000, alpha: this.spotDimValue });
  }

  /** Starts the glide / fade lease when something moves. */
  private animateSpot(): void {
    if (!this.spotLease) this.spotLease = this.host.scheduler.hold('spotlight');
  }

  /** One frame of the spotlight's glide and fade. */
  private stepSpot(now: number): void {
    const k = Math.min(1, (now - this.spotT0) / GLIDE_MS);
    this.layoutSpot(k);
    const fade = this.spotGoal === 1 ? Math.max(this.spotAlpha, k) : Math.min(this.spotAlpha, 1 - k);
    this.spotAlpha = k >= 1 ? this.spotGoal : fade;
    this.spot.alpha = this.spotAlpha;
    this.spot.visible = this.spotAlpha > 0;
    if (k >= 1 && this.spotLease) {
      this.spotLease();
      this.spotLease = null;
      if (this.spotGoal === 0) this.spotTo = null;
    }
  }

  // ── DM notes ─────────────────────────────────────────────────────────────────────────────

  private setNotes(list: readonly DmNote[] | null): boolean {
    if (list === this.noteList) return false;
    this.noteList = list;
    const keep = new Set<string>();
    for (const n of list ?? []) {
      keep.add(n.id);
      let v = this.noteViews.get(n.id);
      if (!v) {
        v = this.createNote(n);
        this.noteViews.set(n.id, v);
      }
      if (v.note !== n) {
        const textChanged = v.note.text !== n.text;
        v.note = n;
        if (textChanged) this.writeNote(v);
      }
      this.placeNote(v);
    }
    for (const [id, v] of this.noteViews) {
      if (keep.has(id)) continue;
      v.root.destroy({ children: true });
      this.noteViews.delete(id);
    }
    return true;
  }

  private createNote(n: DmNote): NoteView {
    installFonts();
    const root = new Container({ label: `note ${n.id}` });
    const pill = new Graphics();
    const text = new BitmapText({ text: '', style: { fontFamily: FONT_NAME, fontSize: GLYPH_PX }, anchor: { x: 0, y: 0.5 } });
    text.tint = 0x1a1306;
    const pin = new Graphics()
      .circle(0, 0, NOTE_PX.pin + 2).fill({ color: 0x0e0c0a, alpha: 0.85 })
      .circle(0, 0, NOTE_PX.pin).fill(0xe3b45e)
      .circle(0, 0, NOTE_PX.pin * 0.38).fill(0x1a1306);
    root.addChild(pill, text, pin);
    this.notes!.addChild(root);
    const v: NoteView = { note: n, root, pin, pill, text };
    this.writeNote(v);
    return v;
  }

  /** Sets a note's text and its pill (in screen px; the root is scaled to the zoom). */
  private writeNote(v: NoteView): void {
    v.text.text = noteLabel(v.note.text);
    v.text.scale.set(NOTE_PX.text / GLYPH_PX);
    const w = v.text.width + NOTE_PX.padX * 2;
    const h = NOTE_PX.text + NOTE_PX.padY * 2;
    const x0 = NOTE_PX.pin + 4;
    v.text.position.set(x0 + NOTE_PX.padX, 0);
    v.pill.clear().roundRect(x0, -h / 2, w, h, 4.5).fill({ color: 0xe3b45e, alpha: 0.92 }).stroke({ color: 0x0e0c0a, alpha: 0.6, width: 1 });
  }

  /** Puts a note at its square, at screen size and upright. */
  private placeNote(v: NoteView): void {
    v.root.position.set(v.note.x * SQUARE, v.note.y * SQUARE);
    v.root.scale.set(SQUARE / Math.max(1e-3, this.zoom));
    v.root.rotation = -this.rotation;
  }

  // ── countdown (TV) ──────────────────────────────────────────────────────────────────────

  private setTimer(t: Timer | null): boolean {
    const box = this.timerBox!;
    if (t === this.timer) return false;
    const was = this.timer;
    this.timer = t;
    if (!!was !== !!t) this.host.log.info('render', t ? 'Timer shown' : 'Timer hidden', t ? { durationMs: t.durationMs } : {});
    box.visible = !!t && !this.covered;
    if (!t) {
      this.stopTimerClock();
      this.face = null;
      return true;
    }
    if (this.rings.length === 0) this.makeRings();
    this.refreshTimer();
    return true;
  }

  private makeRings(): void {
    installFonts();
    for (let i = 0; i < 2; i++) {
      const root = new Container({ label: `timer-ring ${i}` });
      const disc = new Graphics();
      const arc = new Graphics();
      const digits = new BitmapText({ text: '', style: { fontFamily: FONT_TEXT, fontSize: GLYPH_PX }, anchor: 0.5 });
      root.addChild(disc, arc, digits);
      this.timerBox!.addChild(root);
      this.rings.push({ root, disc, arc, digits });
    }
  }

  /** Works out the face now, draws it, and plans the next change. */
  private refreshTimer(): void {
    const t = this.timer;
    if (!t) return;
    const face = timerFace(t, this.host.now());
    this.face = face;
    this.drawRings(face, 0);
    if (face.phase === 'done' && endEffectDue(face) && t.endEffect !== 'none') {
      const key = `${t.startedAt}:${t.remainingMs}`;
      if (this.endPlayedFor !== key) {
        this.endPlayedFor = key;
        this.endStart = this.frameNow() - (face.sinceEndMs ?? 0);
        this.endLease ??= this.host.scheduler.hold('timer-end');
        this.host.log.info('render', 'Timer ran out', { effect: t.endEffect });
      }
    }
    if (face.pulse && !this.pulseLease) this.pulseLease = this.host.scheduler.hold('timer-pulse', PULSE_FPS);
    if (!face.pulse && this.pulseLease) {
      this.pulseLease();
      this.pulseLease = null;
    }
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
    // a running timer that is about to end gets its last tick at the end itself
    if (face.nextChangeMs !== null) {
      this.tickTimer = setTimeout(() => {
        this.tickTimer = null;
        this.refreshTimer();
        this.host.scheduler.invalidate();
      }, face.nextChangeMs + 8);
    }
  }

  private stopTimerClock(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.pulseLease?.();
    this.pulseLease = null;
    this.endLease?.();
    this.endLease = null;
    if (this.flash) this.flash.visible = false;
  }

  /**
   * Draws both rings for a face.
   *
   * @param face - what to show
   * @param pulse - 0–1, the pulse's swell (last seconds) or the end glow
   */
  private drawRings(face: TimerFace, pulse: number): void {
    const view = this.host.viewport();
    const places = ringPlaces(view);
    const key = `${view.width}x${view.height}`;
    const gold = 0xe3b45e;
    const done = face.phase === 'done';
    const paused = face.phase === 'paused' || face.phase === 'ready';
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i]!;
      const p = places[i]!;
      const r = p.r;
      if (key !== this.ringKey) {
        ring.disc.clear()
          .circle(0, 0, r).fill({ color: 0x0e0c0a, alpha: 0.82 })
          .circle(0, 0, r * 0.84).stroke({ color: 0xf0e8dc, alpha: 0.14, width: r * 0.12 });
        ring.digits.scale.set((r * 0.62) / GLYPH_PX);
      }
      ring.root.position.set(p.x, p.y);
      ring.root.rotation = p.rotation;
      ring.root.scale.set(1 + 0.06 * pulse);
      const start = -Math.PI / 2;
      const sweep = Math.PI * 2 * face.fraction;
      ring.arc.clear();
      if (sweep > 0.001) {
        ring.arc.arc(0, 0, r * 0.84, start, start + sweep).stroke({ color: gold, alpha: paused ? 0.6 : 1, width: r * 0.12, cap: 'round' });
      }
      if (done && pulse > 0) ring.arc.circle(0, 0, r * 0.84).stroke({ color: gold, alpha: pulse, width: r * (0.12 + 0.2 * pulse) });
      ring.digits.text = face.text;
      ring.digits.tint = done ? gold : 0xf0e8dc;
      ring.digits.alpha = paused ? 0.7 : 1;
    }
    this.ringKey = key;
  }

  /** One frame of the countdown's pulse or end effect. */
  private stepTimer(now: number): void {
    const face = this.face;
    const t = this.timer;
    if (!face || !t) return;
    let swell = 0;
    if (this.pulseLease) {
      // one gentle swell per second, peaking half-way between two numbers
      const left = timerLeft(t, this.host.now());
      swell = 0.5 - 0.5 * Math.cos(((left % 1000) / 1000) * Math.PI * 2);
    }
    if (this.endLease) {
      const k = Math.min(1, (now - this.endStart) / END_EFFECT_MS);
      const glow = Math.sin(k * Math.PI) * (1 - k * 0.3);
      swell = t.endEffect === 'glow' ? glow : swell;
      if (this.flash) {
        const flash = t.endEffect === 'flash';
        this.flash.visible = flash && k < 1;
        if (flash) {
          const v = this.host.viewport();
          this.flash.clear().rect(0, 0, v.width, v.height).fill({ color: 0xfff1d6, alpha: 0.55 * (1 - k) ** 2 });
        }
      }
      if (k >= 1) {
        this.endLease();
        this.endLease = null;
        if (this.flash) this.flash.visible = false;
      }
    }
    this.drawRings(face, swell);
  }

  // ── the frame ────────────────────────────────────────────────────────────────────────────

  private tick(now: number): void {
    if (this.spotLease) this.stepSpot(now);
    if (this.timerBox && this.timer) {
      const v = this.host.viewport();
      if (`${v.width}x${v.height}` !== this.ringKey && this.face) this.drawRings(this.face, 0);
      if (this.pulseLease || this.endLease) this.stepTimer(now);
    }
  }

  /** Frees everything. */
  destroy(): void {
    this.stopTicker();
    this.stopTimerClock();
    this.spotLease?.();
    this.spotLease = null;
    this.spot.destroy({ children: true });
    this.spotTexture?.destroy(true);
    this.notes?.destroy({ children: true });
    this.timerBox?.destroy({ children: true });
    this.noteViews.clear();
  }
}

/** Whether two points (or nulls) are the same. */
function samePoint(a: Point | null, b: Point | null): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y);
}
