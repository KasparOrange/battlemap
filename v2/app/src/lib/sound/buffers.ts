/**
 * Decoded sounds, memory-capped. A decoded sound is raw PCM (4 bytes per sample and channel — a
 * 50 s mono bed at 48 kHz is ~9.6 MB), so the 2 GB box keeps at most {@link DEFAULT_SOUND_BUDGET}
 * of them: sounds in use are pinned, the rest stay cached until the room is needed, least
 * recently used first. Loading the same sound twice at once shares one decode.
 *
 * Generic over the buffer type with injected IO, so the logic runs under `bun test`.
 */

/** Default decoded-bytes budget (in use + cached). */
export const DEFAULT_SOUND_BUDGET = 48 * 1024 * 1024;

/** IO and limits of a {@link SoundBuffers}. */
export interface SoundBuffersOptions<B> {
  /** Fetches and decodes one sound. */
  load(id: string): Promise<B>;
  /** Decoded bytes of one buffer. */
  bytes(buffer: B): number;
  /** Most bytes kept. */
  budgetBytes?: number;
  /** Told when a cached buffer is dropped for room (for the log). */
  onEvict?(id: string, bytes: number): void;
}

interface Slot<B> {
  buffer: B;
  bytes: number;
  pins: number;
  used: number;
}

/** The cache of decoded sounds. */
export class SoundBuffers<B> {
  private readonly slots = new Map<string, Slot<B>>();
  private readonly loading = new Map<string, Promise<B>>();
  private clock = 0;
  private readonly budget: number;

  /** @param opts - loader, size function, budget */
  constructor(private readonly opts: SoundBuffersOptions<B>) {
    this.budget = opts.budgetBytes ?? DEFAULT_SOUND_BUDGET;
  }

  /**
   * A sound's buffer, pinned until {@link release} — loaded when it isn't cached.
   *
   * @param id - the sound id
   * @returns the buffer
   * @throws whatever the loader throws
   */
  async acquire(id: string): Promise<B> {
    const have = this.slots.get(id);
    if (have) {
      have.pins++;
      have.used = ++this.clock;
      return have.buffer;
    }
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.opts.load(id);
      this.loading.set(id, pending);
      pending.then(
        () => this.loading.delete(id),
        () => this.loading.delete(id),
      );
    }
    const buffer = await pending;
    const slot = this.slots.get(id);
    if (slot) {
      slot.pins++;
      slot.used = ++this.clock;
      return slot.buffer;
    }
    this.slots.set(id, { buffer, bytes: this.opts.bytes(buffer), pins: 1, used: ++this.clock });
    this.trim();
    return buffer;
  }

  /**
   * Unpins a sound (it stays cached while the budget allows).
   *
   * @param id - the sound id
   */
  release(id: string): void {
    const slot = this.slots.get(id);
    if (!slot || slot.pins === 0) return;
    slot.pins--;
    this.trim();
  }

  /**
   * Drops cached sounds until the bytes fit `budget` (pinned ones stay).
   *
   * @param budget - the bytes to fit (default: the budget; 0 drops every unpinned sound)
   */
  trim(budget = this.budget): void {
    let total = this.bytes();
    if (total <= budget) return;
    const idle = [...this.slots].filter(([, s]) => s.pins === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [id, slot] of idle) {
      if (total <= budget) break;
      this.slots.delete(id);
      total -= slot.bytes;
      this.opts.onEvict?.(id, slot.bytes);
    }
  }

  /**
   * Decoded bytes held (in use and cached).
   *
   * @returns bytes
   */
  bytes(): number {
    let n = 0;
    for (const s of this.slots.values()) n += s.bytes;
    return n;
  }

  /**
   * Whether a sound is decoded and held.
   *
   * @param id - the sound id
   * @returns true when cached
   */
  has(id: string): boolean {
    return this.slots.has(id);
  }

  /**
   * The ids held, with their pins (for the test hook).
   *
   * @returns id → pins
   */
  held(): Record<string, number> {
    return Object.fromEntries([...this.slots].map(([id, s]) => [id, s.pins]));
  }
}
