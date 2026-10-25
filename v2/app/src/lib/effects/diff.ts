/**
 * What the runtime must change when the state changes — pure, so it is tested without Pixi.
 *
 * - {@link planPlaced}: the map's lasting effects (`MapPlay.effects`) against what runs now →
 *   which to start, which to move or re-parameterise, which to stop. Paused effects (`on:
 *   false`) count as absent; a changed catalogue entry means stop + start.
 * - {@link ShotTracker}: one-shots (`live.shots`) — each id plays once per screen, and shots
 *   already over when they arrive (a reconnecting TV gets last night's fireball in its snapshot)
 *   are skipped.
 *
 * @see ../../../../docs/architecture.md "effects runtime"
 */
import type { EffectAnchor, OneShot, PlacedEffect } from '@battlemap/shared';

/** What the runtime remembers about a running lasting effect. */
export interface RunningPlaced {
  /** The catalogue entry it plays. */
  effect: string;
  /** Signature of its anchor ({@link signature}). */
  anchorSig: string;
  /** Signature of its params. */
  paramsSig: string;
}

/** One change to a running effect. */
export interface PlacedChange {
  /** The effect as the state has it now. */
  placed: PlacedEffect;
  /** Its anchor moved. */
  anchor: boolean;
  /** Its params changed. */
  params: boolean;
}

/** The outcome of {@link planPlaced}. */
export interface PlacedPlan {
  /** Start these. */
  start: PlacedEffect[];
  /** Update these in place. */
  change: PlacedChange[];
  /** Stop these ids. */
  stop: string[];
}

/**
 * A stable text form of an anchor or params object (key order doesn't matter), used to tell
 * whether anything changed.
 *
 * @param value - an anchor or a params record
 * @returns the signature
 */
export function signature(value: EffectAnchor | Record<string, unknown>): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = (v as Record<string, unknown>)[k];
      return out;
    }
    return v;
  });
}

/**
 * Plans the lasting effects: compares the wanted list with what runs.
 *
 * @param running - what runs now, by placed id
 * @param wanted - the map's effects (`MapPlay.effects`); paused ones are ignored
 * @returns what to start, change and stop
 */
export function planPlaced(running: ReadonlyMap<string, RunningPlaced>, wanted: readonly PlacedEffect[]): PlacedPlan {
  const plan: PlacedPlan = { start: [], change: [], stop: [] };
  const seen = new Set<string>();
  for (const placed of wanted) {
    if (!placed.on || seen.has(placed.id)) continue;
    seen.add(placed.id);
    const now = running.get(placed.id);
    if (!now) {
      plan.start.push(placed);
      continue;
    }
    if (now.effect !== placed.effect) {
      plan.stop.push(placed.id);
      plan.start.push(placed);
      continue;
    }
    const anchor = now.anchorSig !== signature(placed.anchor);
    const params = now.paramsSig !== signature(placed.params);
    if (anchor || params) plan.change.push({ placed, anchor, params });
  }
  for (const id of running.keys()) if (!seen.has(id)) plan.stop.push(id);
  return plan;
}

/**
 * The record of a running lasting effect, for the next {@link planPlaced}.
 *
 * @param placed - the effect
 * @returns its record
 */
export function runningRecord(placed: PlacedEffect): RunningPlaced {
  return { effect: placed.effect, anchorSig: signature(placed.anchor), paramsSig: signature(placed.params) };
}

/** How a shot was judged by {@link ShotTracker.judge}. */
export type ShotVerdict = 'play' | 'seen' | 'stale';

/**
 * Remembers which one-shots this screen has handled, so each id plays once, and judges whether
 * a new one is still worth playing.
 */
export class ShotTracker {
  private readonly handled = new Set<string>();
  private readonly order: string[] = [];

  /**
   * @param keep - how many handled ids to remember (well above the state's `MAX_SHOTS`)
   * @param graceMs - how late a shot may arrive and still play from its start (clock skew,
   *   network), on top of its own length
   */
  constructor(
    private readonly keep = 64,
    private readonly graceMs = 1500,
  ) {}

  /**
   * Judges one shot and, unless it was seen before, remembers it as handled.
   *
   * @param shot - the shot from `live.shots`
   * @param now - this screen's clock, epoch ms
   * @param lengthMs - how long the effect plays
   * @returns `play` (new and in time), `seen` (handled before), `stale` (over already)
   */
  judge(shot: OneShot, now: number, lengthMs: number): ShotVerdict {
    if (this.handled.has(shot.id)) return 'seen';
    this.remember(shot.id);
    const age = now - shot.at;
    return age > lengthMs + this.graceMs ? 'stale' : 'play';
  }

  /**
   * Whether a shot id was handled.
   *
   * @param id - the shot id
   * @returns true when judged before
   */
  has(id: string): boolean {
    return this.handled.has(id);
  }

  /**
   * Marks an id as handled without judging it (a shot dropped because effects are off).
   *
   * @param id - the shot id
   */
  remember(id: string): void {
    if (this.handled.has(id)) return;
    this.handled.add(id);
    this.order.push(id);
    while (this.order.length > this.keep) this.handled.delete(this.order.shift()!);
  }
}
