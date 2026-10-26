/**
 * The sound engine: one Web Audio graph that plays a soundscape and one-shots.
 *
 * ```
 * bed source (loop) → bed gain ─┐
 * bed source (loop) → bed gain ─┼→ beds bus → duck ─┐
 * bed source (loop) → bed gain ─┘                   ├→ master → ceiling → speakers
 * one-shot → voice gain ─────────→ shots bus ───────┘
 * ```
 *
 * - **Beds** loop seamlessly (the files are cut and crossfaded into exact loops, `docs/sounds.md`),
 *   start at a random point so a scene never sounds the same twice, fade in and out on the
 *   mixer's clock (`mix.ts`); a scene switch fades the old beds out while the new fade in.
 * - **One-shots** have a voice limit (`voices.ts`); a ducking one-shot pulls the beds down
 *   about 6 dB while it sounds.
 * - **Lazy and capped:** a sound is fetched and decoded when it first plays and kept within
 *   the byte budget (`buffers.ts`); the shell's memory warnings drop what isn't playing.
 * - `ceiling` caps everything (the tablet's preview runs at 0.3 — headphones-friendly).
 *
 * The browser may start the context suspended (autoplay rules); {@link SoundEngine.unlock} resumes
 * it, and TV mode calls it on every key until it runs (the Android shell allows audio without a
 * gesture: `mediaPlaybackRequiresUserGesture = false`).
 *
 * @see ../../../../docs/features.md "Sound"
 */
import type { Soundscape } from '@battlemap/shared';
import type { Logger } from '../log.ts';
import { DEFAULT_SOUND_BUDGET, SoundBuffers } from './buffers.ts';
import type { SoundCatalogue, SoundEntry } from './catalogue.ts';
import { DUCK_ATTACK, DUCK_RELEASE, duckGain, FADE, planMix, soundSignature, volumeGain } from './mix.ts';
import { admitVoice, MAX_VOICES } from './voices.ts';

/** Options of a {@link SoundEngine}. */
export interface SoundEngineOptions {
  /** The logger (area `sound`). */
  log: Logger;
  /** The catalogue (fetched on first use). */
  catalogue: () => Promise<SoundCatalogue>;
  /** Caps every sound (1 = full; the tablet's preview uses 0.3). */
  ceiling?: number;
  /** Decoded-bytes budget. */
  budgetBytes?: number;
  /** Most one-shots at once. */
  maxVoices?: number;
  /** Makes the context (tests can pass their own). */
  createContext?: () => AudioContext;
  /** Picks a bed's start point, 0–1 of its length (tests pass a fixed one). */
  random?: () => number;
}

/** A bed in the graph. */
interface BedNode {
  sound: string;
  /** The gain it heads to (0 while it fades out). */
  target: number;
  /** Fading out: released when the fade is over. */
  leaving: boolean;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  /** Bumped on every start / stop, so a late decode doesn't start a bed that left again. */
  generation: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

/** A one-shot in the graph. */
interface Voice {
  id: string;
  sound: string;
  startedAt: number;
  ducks: boolean;
  gain: GainNode;
  source: AudioBufferSourceNode;
}

/** The graph as the test hook reports it (`window.__battlemapSound.graph()`). */
export interface SoundGraph {
  /** The context's state (`running`, `suspended`, `closed`) or `none` before the first sound. */
  context: string;
  /** The soundscape's signature as last applied. */
  applied: string;
  /** The master gain heading to (volume² × ceiling). */
  master: number;
  /** The one-shot bus gain. */
  shots: number;
  /** The beds' ducking gain heading to. */
  duck: number;
  /** Beds in the graph, fading ones included. */
  beds: { sound: string; target: number; gain: number; leaving: boolean; playing: boolean; loop: boolean; loopEnd: number }[];
  /** One-shots sounding now. */
  voices: { sound: string; ducks: boolean }[];
  /** One-shots played since start. */
  played: number;
  /** Decoded bytes held. */
  bytes: number;
  /** Sounds held, with their pins. */
  held: Record<string, number>;
}

/** Plays soundscapes and one-shots through Web Audio. */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedsBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private shotsBus: GainNode | null = null;
  private readonly beds = new Map<string, BedNode>();
  private voices: Voice[] = [];
  private buffers: SoundBuffers<AudioBuffer>;
  private current: Soundscape | null = null;
  private targets = { master: 0, shots: 0, duck: 1 };
  private played = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private catalogue: SoundCatalogue | null = null;
  private destroyed = false;
  private readonly ceiling: number;
  private readonly log: Logger;

  /** @param opts - logger, catalogue, ceiling, budget */
  constructor(private readonly opts: SoundEngineOptions) {
    this.ceiling = opts.ceiling ?? 1;
    this.log = opts.log;
    this.buffers = new SoundBuffers<AudioBuffer>({
      budgetBytes: opts.budgetBytes ?? DEFAULT_SOUND_BUDGET,
      load: (id) => this.decode(id),
      bytes: (b) => b.length * b.numberOfChannels * 4,
      onEvict: (id, bytes) => this.log.debug('sound', 'Sound dropped from memory', { id, kb: Math.round(bytes / 1024) }),
    });
  }

  /**
   * The context, made on first use with the bus nodes.
   *
   * @returns the context and its nodes
   */
  private graph(): { ctx: AudioContext; master: GainNode; bedsBus: GainNode; duck: GainNode; shotsBus: GainNode } {
    if (!this.ctx) {
      const ctx = this.opts.createContext ? this.opts.createContext() : new AudioContext({ latencyHint: 'playback' });
      const master = ctx.createGain();
      const ceiling = ctx.createGain();
      const bedsBus = ctx.createGain();
      const duck = ctx.createGain();
      const shotsBus = ctx.createGain();
      master.gain.value = this.targets.master;
      ceiling.gain.value = this.ceiling;
      shotsBus.gain.value = this.targets.shots;
      bedsBus.connect(duck).connect(master);
      shotsBus.connect(master);
      master.connect(ceiling).connect(ctx.destination);
      ctx.addEventListener('statechange', () => this.log.info('sound', 'Audio context state', { state: ctx.state }));
      this.log.info('sound', 'Audio context made', { state: ctx.state, rate: ctx.sampleRate, ceiling: this.ceiling });
      Object.assign(this, { ctx, master, bedsBus, duck, shotsBus });
    }
    return { ctx: this.ctx!, master: this.master!, bedsBus: this.bedsBus!, duck: this.duck!, shotsBus: this.shotsBus! };
  }

  /**
   * Resumes a suspended context (autoplay rules). Safe to call often.
   *
   * @returns once it runs (or failed — logged)
   */
  async unlock(): Promise<void> {
    if (!this.ctx || this.ctx.state !== 'suspended') return;
    try {
      await this.ctx.resume();
      this.log.info('sound', 'Audio unlocked', { state: this.ctx.state });
    } catch (e) {
      this.log.warn('sound', 'Audio could not start', { error: String(e) });
    }
  }

  /**
   * Whether the context waits for a gesture (sound is wanted but the browser holds it).
   *
   * @returns true while suspended
   */
  locked(): boolean {
    return this.ctx?.state === 'suspended';
  }

  /**
   * Plays a soundscape: crossfades from the beds playing to the new mix, ramps the master and
   * one-shot volumes; off fades everything out ("Stop all").
   *
   * @param s - the soundscape, or null (no game: silence)
   */
  apply(s: Soundscape | null): void {
    if (this.destroyed) return;
    const next: Soundscape = s ?? { on: false, master: this.current?.master ?? 0, shots: this.current?.shots ?? 0, beds: [], fxSounds: false };
    const sig = soundSignature(next);
    if (sig === soundSignature(this.current)) return;
    const wasOn = this.current?.on ?? false;
    this.current = next;
    if (!next.on && this.beds.size === 0 && this.voices.length === 0) return; // silent and nothing plays: no context needed
    const g = this.graph();
    this.rampParam(g.master.gain, (this.targets.master = volumeGain(next.master)), FADE.change);
    this.rampParam(g.shotsBus.gain, (this.targets.shots = volumeGain(next.shots)), FADE.change);
    const playing = new Map([...this.beds].filter(([, b]) => !b.leaving).map(([id, b]) => [id, b.target]));
    const plan = planMix(playing, next, wasOn);
    for (const c of plan.stop) this.stopBed(c.sound, c.fade);
    for (const c of plan.ramp) {
      const bed = this.beds.get(c.sound)!;
      bed.target = c.gain;
      this.rampParam(bed.gain.gain, c.gain, c.fade);
    }
    for (const c of plan.start) this.startBed(c.sound, c.gain, c.fade);
    if (!next.on) this.stopVoices(FADE.stopAll);
    this.log.info('sound', 'Soundscape', { mix: sig, start: plan.start.map((c) => c.sound), stop: plan.stop.map((c) => c.sound), ramp: plan.ramp.length });
  }

  /**
   * Plays a one-shot (skipped while the soundscape is off, or right after the same sound).
   *
   * @param soundId - the library id
   * @param volume - its own volume, 0–1
   * @param id - the shot's id (for the log)
   * @returns once it started (or was skipped)
   */
  async playShot(soundId: string, volume = 1, id = soundId): Promise<void> {
    if (this.destroyed || !this.current?.on) return;
    const entry = (await this.entries()).get(soundId);
    if (!entry || entry.kind !== 'oneshot') {
      this.log.warn('sound', 'Unknown one-shot', { sound: soundId });
      return;
    }
    const g = this.graph();
    const now = g.ctx.currentTime * 1000;
    const admit = admitVoice(this.voices, soundId, now, this.opts.maxVoices ?? MAX_VOICES);
    if (admit.skip) return;
    for (const v of admit.steal) this.stopVoice(v, FADE.steal);
    let buffer: AudioBuffer;
    try {
      buffer = await this.buffers.acquire(soundId);
    } catch (e) {
      this.log.warn('sound', 'One-shot failed to load', { sound: soundId, error: String(e) });
      return;
    }
    if (this.destroyed || !this.current?.on) {
      this.buffers.release(soundId);
      return;
    }
    const gain = g.ctx.createGain();
    gain.gain.value = volumeGain(volume);
    const source = g.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(g.shotsBus);
    const voice: Voice = { id: `${id}:${this.played}`, sound: soundId, startedAt: g.ctx.currentTime * 1000, ducks: entry.duck !== false, gain, source };
    source.onended = () => this.endVoice(voice);
    this.voices.push(voice);
    this.played++;
    source.start();
    this.updateDuck();
    this.log.info('sound', 'One-shot', { sound: soundId, id, voices: this.voices.length });
  }

  /**
   * Drops decoded sounds that aren't playing (the shell's memory warning).
   *
   * @param level - the warning's level (for the log)
   */
  trim(level: number): void {
    const before = this.buffers.bytes();
    this.buffers.trim(0);
    this.log.info('sound', 'Sounds dropped for memory', { level, kbBefore: Math.round(before / 1024), kbAfter: Math.round(this.buffers.bytes() / 1024) });
  }

  /**
   * The graph for the test hook.
   *
   * @returns a plain snapshot
   */
  snapshot(): SoundGraph {
    return {
      context: this.ctx?.state ?? 'none',
      applied: soundSignature(this.current),
      master: this.targets.master * this.ceiling,
      shots: this.targets.shots,
      duck: this.targets.duck,
      beds: [...this.beds.values()].map((b) => ({
        sound: b.sound,
        target: b.target,
        gain: b.gain.gain.value,
        leaving: b.leaving,
        playing: b.source !== null,
        loop: b.source?.loop ?? false,
        loopEnd: b.source?.loopEnd ?? 0,
      })),
      voices: this.voices.map((v) => ({ sound: v.sound, ducks: v.ducks })),
      played: this.played,
      bytes: this.buffers.bytes(),
      held: this.buffers.held(),
    };
  }

  /** Stops everything and closes the context. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const b of this.beds.values()) {
      if (b.stopTimer) clearTimeout(b.stopTimer);
      try {
        b.source?.stop();
      } catch {
        /* never started */
      }
    }
    this.beds.clear();
    for (const v of this.voices) {
      try {
        v.source.stop();
      } catch {
        /* over */
      }
    }
    this.voices = [];
    if (this.duckTimer) clearTimeout(this.duckTimer);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  // ── beds ────────────────────────────────────────────────────────────────────────────────

  /** Adds a bed to the graph at silence and fades it in once its sound is decoded. */
  private startBed(sound: string, target: number, fade: number): void {
    const g = this.graph();
    let bed = this.beds.get(sound);
    if (bed) {
      // it was fading out: turn it round
      if (bed.stopTimer) clearTimeout(bed.stopTimer);
      bed.stopTimer = null;
      bed.leaving = false;
      bed.target = target;
      bed.generation++;
      if (bed.source) {
        this.rampParam(bed.gain.gain, target, fade);
        return;
      }
    } else {
      const gain = g.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(g.bedsBus);
      bed = { sound, target, leaving: false, gain, source: null, generation: 0, stopTimer: null };
      this.beds.set(sound, bed);
    }
    const generation = bed.generation;
    const started = performance.now();
    void this.bedBuffer(sound).then((loaded) => {
      const b = this.beds.get(sound);
      if (!loaded) return;
      if (this.destroyed || !b || b.generation !== generation || b.leaving || b.source) {
        this.buffers.release(sound);
        return;
      }
      const { buffer, entry } = loaded;
      const source = g.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // the exact loop: the file's own samples (a decoder that pads the end can't add a gap)
      const loopEnd = Math.min(buffer.duration, entry.samples > 0 && entry.rate > 0 ? entry.samples / entry.rate : buffer.duration);
      source.loopStart = 0;
      source.loopEnd = loopEnd;
      source.connect(b.gain);
      const offset = (this.opts.random ?? Math.random)() * loopEnd;
      source.start(0, offset);
      b.source = source;
      b.gain.gain.value = 0;
      this.rampParam(b.gain.gain, b.target, fade);
      this.log.info('sound', 'Bed started', { sound, ms: Math.round(performance.now() - started), offset: Math.round(offset * 10) / 10, loopS: Math.round(loopEnd * 100) / 100 });
    });
  }

  /** Fetches a bed's catalogue entry and decoded sound; null (logged) when it can't. */
  private async bedBuffer(sound: string): Promise<{ buffer: AudioBuffer; entry: SoundEntry } | null> {
    try {
      const entry = (await this.entries()).get(sound);
      if (!entry || entry.kind !== 'bed') throw new Error('not a bed in the library');
      const buffer = await this.buffers.acquire(sound);
      return { buffer, entry };
    } catch (e) {
      this.log.warn('sound', 'Bed failed to load', { sound, error: String(e) });
      const b = this.beds.get(sound);
      if (b && !b.source) {
        b.gain.disconnect();
        this.beds.delete(sound);
      }
      return null;
    }
  }

  /** Fades a bed out and releases it when the fade is over. */
  private stopBed(sound: string, fade: number): void {
    const bed = this.beds.get(sound);
    if (!bed || bed.leaving) return;
    bed.leaving = true;
    bed.target = 0;
    bed.generation++;
    if (!bed.source) {
      // still loading: drop it now (the load sees the new generation and lets go)
      bed.gain.disconnect();
      this.beds.delete(sound);
      return;
    }
    this.rampParam(bed.gain.gain, 0, fade);
    bed.stopTimer = setTimeout(() => {
      if (this.beds.get(sound) !== bed || !bed.leaving) return;
      try {
        bed.source?.stop();
      } catch {
        /* over */
      }
      bed.source?.disconnect();
      bed.gain.disconnect();
      this.beds.delete(sound);
      this.buffers.release(sound);
      this.log.debug('sound', 'Bed released', { sound });
    }, fade * 1000 + 100);
  }

  // ── one-shots ───────────────────────────────────────────────────────────────────────────

  /** A voice ended by itself (or was stopped): out of the list, its sound unpinned. */
  private endVoice(voice: Voice): void {
    const at = this.voices.indexOf(voice);
    if (at < 0) return;
    this.voices.splice(at, 1);
    voice.source.disconnect();
    voice.gain.disconnect();
    this.buffers.release(voice.sound);
    this.updateDuck();
  }

  /** Cuts one voice with a short fade. */
  private stopVoice(id: string, fade: number): void {
    const voice = this.voices.find((v) => v.id === id);
    if (!voice || !this.ctx) return;
    this.rampParam(voice.gain.gain, 0, fade);
    try {
      voice.source.stop(this.ctx.currentTime + fade + 0.01);
    } catch {
      this.endVoice(voice);
    }
  }

  /** Fades every voice out ("Stop all"). */
  private stopVoices(fade: number): void {
    for (const v of [...this.voices]) this.stopVoice(v.id, fade);
  }

  /** Ducks the beds while a ducking voice sounds; lets them back up after the last one. */
  private updateDuck(): void {
    if (!this.duck) return;
    const ducking = this.voices.filter((v) => v.ducks).length;
    const target = duckGain(ducking);
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = null;
    if (target < 1) {
      if (this.targets.duck !== target) this.rampParam(this.duck.gain, (this.targets.duck = target), DUCK_ATTACK);
    } else if (this.targets.duck !== 1) {
      this.targets.duck = 1;
      this.rampParam(this.duck.gain, 1, DUCK_RELEASE);
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────────────────────────

  /** The catalogue (fetched once). */
  private async entries(): Promise<SoundCatalogue> {
    if (!this.catalogue) this.catalogue = await this.opts.catalogue();
    return this.catalogue;
  }

  /** Fetches and decodes one sound. */
  private async decode(id: string): Promise<AudioBuffer> {
    const catalogue = await this.entries();
    const entry = catalogue.get(id);
    if (!entry) throw new Error(`no sound "${id}" in the library`);
    const t0 = performance.now();
    const res = await fetch(catalogue.url(entry));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = await res.arrayBuffer();
    const t1 = performance.now();
    const buffer = await this.graph().ctx.decodeAudioData(bytes);
    this.log.info('sound', 'Sound decoded', {
      id,
      kb: Math.round(bytes.byteLength / 1024),
      pcmKb: Math.round((buffer.length * buffer.numberOfChannels * 4) / 1024),
      fetchMs: Math.round(t1 - t0),
      decodeMs: Math.round(performance.now() - t1),
      heldKb: Math.round(this.buffers.bytes() / 1024),
    });
    return buffer;
  }

  /** Ramps an audio parameter from where it is now to `value` over `seconds`. */
  private rampParam(param: AudioParam, value: number, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const from = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.linearRampToValueAtTime(value, t + Math.max(0.01, seconds));
  }
}
