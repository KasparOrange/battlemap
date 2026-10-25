/**
 * The effects registry: the library's catalogue and files, loaded only when needed.
 *
 * - `index.json` is fetched on first use, a manifest when its effect is first placed (both
 *   small, kept for the session).
 * - Textures (atlases, pictures, particle sprites, shader tiles) are loaded when an effect
 *   starts and counted per user: six torches share one torch texture. When the last user
 *   ends they stay cached until the byte budget needs the room, least recently used first
 *   ({@link RefCache}) — the TV keeps effects within its budget (64 MB by default).
 * - Composites acquire their parts; shader sources are fetched once.
 *
 * Generic over the texture type and with injected IO, so the logic runs under `bun test`;
 * `pixiTextureLoader` (in `pixi-assets.ts`) is the real loader.
 *
 * @see ../../../../docs/effects.md "Where things live"
 */
import type { Logger } from '../log.ts';
import { RefCache, type Loaded } from './cache.ts';
import { partIds, textureBytes, textureFiles, type EffectIndex, type EffectIndexEntry, type EffectManifest } from './manifest.ts';

/** IO and limits of a {@link EffectRegistry}. */
export interface RegistryOptions<T> {
  /** Where the library is served (`/app/effects/`), with a trailing slash. */
  baseUrl: string;
  /** Fetches and parses a JSON file. */
  fetchJson(url: string): Promise<unknown>;
  /** Fetches a text file (shader sources). */
  fetchText(url: string): Promise<string>;
  /** Loads one texture file. `repeat` asks for a repeating wrap (shader tiles). */
  loadTexture(url: string, repeat: boolean): Promise<T>;
  /** Frees one texture. */
  freeTexture(url: string, texture: T): void;
  /** Most texture bytes kept (in use + cached). Default 64 MB. */
  budgetBytes?: number;
  /** The logger (area `effects`). */
  log: Logger;
}

/** GLSL sources of a filter. */
export interface ShaderSources {
  /** Vertex shader. */
  vertex: string;
  /** Fragment shader. */
  fragment: string;
  /** Fragment file (for the program's name and the log). */
  name: string;
}

/** Everything an instance needs to draw an effect, held while it runs. */
export interface EffectBundle<T> {
  /** The manifest. */
  manifest: EffectManifest;
  /** Its textures by file name (`atlas-0.webp`). */
  textures: ReadonlyMap<string, T>;
  /** The shader technique's sources. */
  shader: ShaderSources | null;
  /** A texture effect's sprite filter (`motion.shader`). */
  motionShader: ShaderSources | null;
  /** A composite's parts by id (each acquired too). */
  parts: ReadonlyMap<string, EffectBundle<T>>;
}

/** Default byte budget of the effect textures. */
export const DEFAULT_EFFECTS_BUDGET = 64 * 1024 * 1024;

/**
 * Joins a library-relative path, resolving `..` (`fireball/../shaders/rain.frag` →
 * `shaders/rain.frag`).
 *
 * @param dir - a folder inside the library, with a trailing slash (or empty)
 * @param path - a path relative to it
 * @returns the normalised path
 */
export function joinPath(dir: string, path: string): string {
  const out: string[] = [];
  for (const part of (dir + path).split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

/** The catalogue, the manifests and the ref-counted textures of the effects library. */
export class EffectRegistry<T> {
  private indexPromise: Promise<EffectIndex> | null = null;
  private readonly manifests = new Map<string, Promise<EffectManifest>>();
  private readonly resolved = new Map<string, EffectManifest>();
  private readonly sources = new Map<string, Promise<string>>();
  private readonly textures: RefCache<T>;
  private readonly users = new Map<string, number>();
  private warnedOver = false;

  /** @param opts - IO and limits */
  constructor(private readonly opts: RegistryOptions<T>) {
    this.textures = new RefCache<T>({
      budgetBytes: opts.budgetBytes ?? DEFAULT_EFFECTS_BUDGET,
      load: (key) => this.loadTextureFile(key),
      free: (key, tex) => {
        opts.freeTexture(this.url(key), tex);
        opts.log.debug('effects', 'Texture freed', { file: key });
      },
    });
  }

  /**
   * The catalogue (fetched once).
   *
   * @returns `index.json`
   * @throws when it can't be fetched
   */
  index(): Promise<EffectIndex> {
    if (!this.indexPromise) {
      const t0 = performance.now();
      this.indexPromise = this.opts.fetchJson(this.url('index.json')).then(
        (j) => {
          const idx = j as EffectIndex;
          this.opts.log.info('effects', 'Catalogue loaded', { count: idx.effects.length, ms: Math.round(performance.now() - t0) });
          return idx;
        },
        (err: unknown) => {
          this.indexPromise = null;
          this.opts.log.error('effects', 'Catalogue failed', { error: String(err) });
          throw err;
        },
      );
    }
    return this.indexPromise;
  }

  /**
   * One catalogue row.
   *
   * @param id - the effect id
   * @returns the row, or undefined when the catalogue has no such effect
   */
  async entry(id: string): Promise<EffectIndexEntry | undefined> {
    return (await this.index()).effects.find((e) => e.id === id);
  }

  /**
   * One effect's manifest (fetched once).
   *
   * @param id - the effect id
   * @returns the manifest
   * @throws when the effect is unknown or its manifest can't be fetched
   */
  manifest(id: string): Promise<EffectManifest> {
    let p = this.manifests.get(id);
    if (!p) {
      p = (async () => {
        const row = await this.entry(id);
        if (!row) throw new Error(`Unknown effect "${id}"`);
        const m = (await this.opts.fetchJson(this.url(row.manifest))) as EffectManifest;
        this.resolved.set(id, m);
        return m;
      })();
      p.catch(() => this.manifests.delete(id));
      this.manifests.set(id, p);
    }
    return p;
  }

  /**
   * A manifest and its composite parts' manifests, recursively.
   *
   * @param id - the effect id
   * @returns the manifest and every part's by id
   */
  async manifestTree(id: string): Promise<{ manifest: EffectManifest; parts: Map<string, EffectManifest> }> {
    const manifest = await this.manifest(id);
    const parts = new Map<string, EffectManifest>();
    const walk = async (m: EffectManifest, depth: number): Promise<void> => {
      if (depth > 4) return;
      for (const pid of partIds(m)) {
        if (parts.has(pid)) continue;
        const pm = await this.manifest(pid);
        parts.set(pid, pm);
        await walk(pm, depth + 1);
      }
    };
    await walk(manifest, 0);
    return { manifest, parts };
  }

  /**
   * Takes an effect for drawing: loads its manifest, textures, shader sources and parts.
   * Every call must be paired with one {@link release}.
   *
   * @param id - the effect id
   * @param depth - nesting of composites (internal; parts deeper than 4 are ignored)
   * @returns the bundle
   * @throws when anything can't be loaded (nothing stays acquired then)
   */
  async acquire(id: string, depth = 0): Promise<EffectBundle<T>> {
    const t0 = performance.now();
    const manifest = await this.manifest(id);
    const files = textureFiles(manifest);
    const taken: string[] = [];
    const takenParts: string[] = [];
    try {
      const textures = new Map<string, T>();
      await Promise.all(
        files.map(async (f) => {
          const tex = await this.textures.acquire(f);
          taken.push(f);
          textures.set(f.slice(manifest.id.length + 1), tex);
        }),
      );
      const shader = manifest.shader ? await this.sourcesOf(joinPath(`${id}/`, manifest.shader.vertex), joinPath(`${id}/`, manifest.shader.fragment)) : null;
      const motionShader = manifest.motion?.shader ? await this.sourcesOf('shaders/filter.vert', joinPath('shaders/', manifest.motion.shader)) : null;
      const parts = new Map<string, EffectBundle<T>>();
      if (depth < 4) {
        for (const pid of partIds(manifest)) {
          parts.set(pid, await this.acquire(pid, depth + 1));
          takenParts.push(pid);
        }
      }
      this.users.set(id, (this.users.get(id) ?? 0) + 1);
      const ms = Math.round(performance.now() - t0);
      if (ms > 30) this.opts.log.info('effects', 'Effect loaded', { id, ms, files: files.length, bytes: this.textures.bytes });
      const over = this.textures.overBudget;
      if (over && !this.warnedOver) this.opts.log.warn('effects', 'Effects in use exceed the texture budget', { inUse: this.textures.bytesInUse, budget: this.opts.budgetBytes ?? DEFAULT_EFFECTS_BUDGET });
      this.warnedOver = over;
      return { manifest, textures, shader, motionShader, parts };
    } catch (err) {
      for (const f of taken) this.textures.release(f);
      for (const pid of takenParts) this.release(pid);
      throw err;
    }
  }

  /**
   * Gives an effect back (pairs with {@link acquire}). Its textures stay cached until the
   * budget needs the room.
   *
   * @param id - the effect id
   */
  release(id: string): void {
    const n = this.users.get(id) ?? 0;
    if (n <= 0) return;
    if (n === 1) this.users.delete(id);
    else this.users.set(id, n - 1);
    const m = this.resolved.get(id);
    if (!m) return;
    for (const f of textureFiles(m)) this.textures.release(f);
    for (const pid of partIds(m)) this.release(pid);
  }

  /** Frees every cached texture no running effect uses (a map left the table). */
  dropUnused(): void {
    this.textures.dropUnused();
  }

  /** Frees everything (the runtime ends). */
  destroy(): void {
    this.textures.clear();
    this.users.clear();
  }

  /** Texture bytes held (in use + cached). */
  get bytes(): number {
    return this.textures.bytes;
  }

  /** Texture bytes of running effects. */
  get bytesInUse(): number {
    return this.textures.bytesInUse;
  }

  /**
   * How many running instances use an effect (tests, the bench).
   *
   * @param id - the effect id
   * @returns the count
   */
  usersOf(id: string): number {
    return this.users.get(id) ?? 0;
  }

  /**
   * Whether a texture file is loaded (tests).
   *
   * @param path - library-relative path
   * @returns true when cached
   */
  hasTexture(path: string): boolean {
    return this.textures.has(path);
  }

  private url(path: string): string {
    return this.opts.baseUrl + path;
  }

  private async loadTextureFile(path: string): Promise<Loaded<T>> {
    const id = path.split('/')[0]!;
    const m = await this.manifest(id);
    const name = path.slice(id.length + 1);
    const repeat = Object.values(m.shader?.textures ?? {}).some((t) => t.file === name && t.wrap === 'repeat');
    const t0 = performance.now();
    try {
      const value = await this.opts.loadTexture(this.url(path), repeat);
      const bytes = textureBytes(m, path);
      this.opts.log.debug('effects', 'Texture loaded', { file: path, bytes, ms: Math.round(performance.now() - t0) });
      return { value, bytes };
    } catch (err) {
      this.opts.log.error('effects', 'Texture failed', { file: path, error: String(err) });
      throw err;
    }
  }

  private async sourcesOf(vertexPath: string, fragmentPath: string): Promise<ShaderSources> {
    const [vertex, fragment] = await Promise.all([this.source(vertexPath), this.source(fragmentPath)]);
    return { vertex, fragment, name: fragmentPath.split('/').pop()!.replace('.frag', '') };
  }

  private source(path: string): Promise<string> {
    let p = this.sources.get(path);
    if (!p) {
      p = this.opts.fetchText(this.url(path));
      p.catch(() => this.sources.delete(path));
      this.sources.set(path, p);
    }
    return p;
  }
}
