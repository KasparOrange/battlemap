/**
 * One-shot bookkeeping as plain logic (tested under `bun test`): which shots from the state are
 * new ({@link ShotGate}), and which playing voices make room for a new one ({@link admitVoice}).
 *
 * @see ../../../../docs/features.md "Sound"
 */

/** Most one-shots that sound at once on the TV. */
export const MAX_VOICES = 6;

/** A second tap of the same sound this close after the first is dropped (a double tap). */
export const REPEAT_MS = 90;

/** A shot older than this when it arrives is skipped (clock skew between tablet and TV included). */
export const STALE_MS = 8000;

/** A playing one-shot, as {@link admitVoice} sees it. */
export interface VoiceInfo {
  /** The voice's own id. */
  id: string;
  /** Its sound. */
  sound: string;
  /** When it started (ms, any clock as long as `now` uses the same). */
  startedAt: number;
}

/** What to do with a new one-shot. */
export interface Admission {
  /** Don't play it (the same sound started a moment ago). */
  skip: boolean;
  /** Voices to cut (oldest first) so it fits under {@link MAX_VOICES}. */
  steal: string[];
}

/**
 * Whether a new one-shot plays, and which voices it cuts.
 *
 * @param voices - the voices playing now
 * @param sound - the new shot's sound
 * @param now - the clock
 * @param max - the voice limit
 * @returns skip, or the voices to steal (the oldest)
 */
export function admitVoice(voices: readonly VoiceInfo[], sound: string, now: number, max = MAX_VOICES): Admission {
  if (voices.some((v) => v.sound === sound && now - v.startedAt < REPEAT_MS)) return { skip: true, steal: [] };
  const over = voices.length + 1 - max;
  if (over <= 0) return { skip: false, steal: [] };
  const oldest = [...voices].sort((a, b) => a.startedAt - b.startedAt).slice(0, over);
  return { skip: false, steal: oldest.map((v) => v.id) };
}

/** How a shot was judged by {@link ShotGate.judge}. */
export type ShotJudgement = 'play' | 'seen' | 'stale';

/**
 * Remembers which shots this screen has handled. The first state it sees only seeds it — a TV
 * that reloads must not replay the last door slams — and every later new id plays unless it is
 * long over ({@link STALE_MS}).
 */
export class ShotGate {
  private readonly handled = new Set<string>();
  private readonly order: string[] = [];
  private seeded = false;

  /**
   * @param keep - how many ids to remember (well above the state's last 8)
   * @param staleMs - how old a shot may be and still play
   */
  constructor(
    private readonly keep = 64,
    private readonly staleMs = STALE_MS,
  ) {}

  /**
   * Judges the shots of one state; the first call only seeds.
   *
   * @param shots - the state's shots (`live.sounds` or `live.shots`), oldest first
   * @param now - this screen's clock, epoch ms
   * @returns the shots to play now, in order
   */
  take<S extends { id: string; at: number }>(shots: readonly S[], now: number): S[] {
    if (!this.seeded) {
      this.seeded = true;
      for (const s of shots) this.remember(s.id);
      return [];
    }
    return shots.filter((s) => this.judge(s, now) === 'play');
  }

  /**
   * Judges one shot and remembers it.
   *
   * @param shot - id and trigger time
   * @param now - this screen's clock, epoch ms
   * @returns `play`, `seen` (handled before) or `stale` (too old)
   */
  judge(shot: { id: string; at: number }, now: number): ShotJudgement {
    if (this.handled.has(shot.id)) return 'seen';
    this.remember(shot.id);
    return now - shot.at > this.staleMs ? 'stale' : 'play';
  }

  /**
   * Marks an id as handled.
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
