/**
 * A ref-counted cache with a byte budget, for the effects' GPU textures. `acquire(key)` loads a
 * resource once (concurrent callers share the load) and counts the user; `release(key)` uncounts
 * it. A resource nobody uses stays cached (the next fireball is instant) until the cached total
 * passes the budget — then the least recently used unused ones are freed first. Resources in use
 * are never freed, even over the budget (that is logged by the caller via {@link overBudget}).
 *
 * Pure logic: what "load" and "free" mean is injected, so it runs under `bun test`.
 *
 * @see ./registry.ts for the textures it holds
 */

/** What the cache needs to know about one loaded resource. */
export interface Loaded<T> {
  /** The resource. */
  value: T;
  /** Its size in bytes (GPU memory). */
  bytes: number;
}

/** Options of a {@link RefCache}. */
export interface RefCacheOptions<T> {
  /** Loads a resource by key. */
  load(key: string): Promise<Loaded<T>>;
  /** Frees a resource (destroy the texture). */
  free(key: string, value: T): void;
  /** Most bytes kept, counting resources in use. */
  budgetBytes: number;
}

interface Entry<T> {
  refs: number;
  /** Set once loaded. */
  loaded: Loaded<T> | null;
  /** The running load. */
  pending: Promise<Loaded<T>> | null;
  /** Last time it was acquired or released (a counter, not a clock). */
  touched: number;
}

/** A ref-counted, byte-budgeted cache. */
export class RefCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private clock = 0;
  private total = 0;

  /** @param opts - load, free and budget */
  constructor(private readonly opts: RefCacheOptions<T>) {}

  /**
   * Takes a reference, loading the resource if needed.
   *
   * @param key - what to load
   * @returns the resource
   * @throws whatever the load throws (the reference is then not taken)
   */
  async acquire(key: string): Promise<T> {
    let e = this.entries.get(key);
    if (!e) {
      e = { refs: 0, loaded: null, pending: null, touched: 0 };
      this.entries.set(key, e);
    }
    e.refs++;
    e.touched = ++this.clock;
    if (e.loaded) return e.loaded.value;
    if (!e.pending) {
      const entry = e;
      entry.pending = this.opts.load(key).then(
        (loaded) => {
          entry.loaded = loaded;
          entry.pending = null;
          this.total += loaded.bytes;
          this.trim();
          return loaded;
        },
        (err: unknown) => {
          entry.pending = null;
          if (this.entries.get(key) === entry) this.entries.delete(key);
          throw err;
        },
      );
    }
    try {
      return (await e.pending!).value;
    } catch (err) {
      e.refs = Math.max(0, e.refs - 1);
      throw err;
    }
  }

  /**
   * Gives a reference back. The resource stays cached until the budget needs the room.
   *
   * @param key - what was acquired
   */
  release(key: string): void {
    const e = this.entries.get(key);
    if (!e || e.refs === 0) return;
    e.refs--;
    e.touched = ++this.clock;
    if (e.refs === 0) this.trim();
  }

  /** Frees unused resources, oldest first, until the total is within the budget. */
  trim(): void {
    if (this.total <= this.opts.budgetBytes) return;
    const idle = [...this.entries].filter(([, e]) => e.refs === 0 && e.loaded).sort((a, b) => a[1].touched - b[1].touched);
    for (const [key, e] of idle) {
      if (this.total <= this.opts.budgetBytes) break;
      this.evict(key, e);
    }
  }

  /** Frees every unused resource now (a map left the table, memory pressure). */
  dropUnused(): void {
    for (const [key, e] of [...this.entries]) if (e.refs === 0 && e.loaded) this.evict(key, e);
  }

  /** Frees everything, used or not (the runtime is destroyed). */
  clear(): void {
    for (const [key, e] of [...this.entries]) if (e.loaded) this.evict(key, e);
    this.entries.clear();
  }

  /** Bytes held now (in use + cached). */
  get bytes(): number {
    return this.total;
  }

  /** Bytes of resources in use. */
  get bytesInUse(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.refs > 0 && e.loaded) n += e.loaded.bytes;
    return n;
  }

  /** Whether resources in use alone exceed the budget. */
  get overBudget(): boolean {
    return this.bytesInUse > this.opts.budgetBytes;
  }

  /**
   * How many references a key holds (tests, the bench).
   *
   * @param key - the key
   * @returns the count, 0 when unknown
   */
  refs(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  /**
   * Whether a key is loaded and cached.
   *
   * @param key - the key
   * @returns true when held
   */
  has(key: string): boolean {
    return Boolean(this.entries.get(key)?.loaded);
  }

  private evict(key: string, e: Entry<T>): void {
    if (!e.loaded) return;
    this.total -= e.loaded.bytes;
    this.opts.free(key, e.loaded.value);
    e.loaded = null;
    if (e.refs === 0) this.entries.delete(key);
  }
}
