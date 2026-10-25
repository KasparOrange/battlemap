/**
 * Vite config of the app: three pages (the app, the kit gallery, the renderer bench), `$lib`,
 * a build id, and in development a proxy to the server so the browser sees one origin.
 */
import { execSync } from 'node:child_process';
import { cpSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/** Where the dev server proxies `/ws`, `/log`, `/api`, `/files`, `/health`. */
const SERVER = process.env.BATTLEMAP_SERVER ?? 'http://localhost:5929';

/** The app's dev port (`BATTLEMAP_APP_PORT` overrides it, e.g. for parallel test runs). */
const DEV_PORT = Number(process.env.BATTLEMAP_APP_PORT ?? 5884);

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** `2026-10-25.ab12cd3` — the day and the commit; `-dirty` when the tree has changes. */
function buildId(): string {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain -- .', { encoding: 'utf8' }).trim() ? '-dirty' : '';
    return `${day}.${hash}${dirty}`;
  } catch {
    return `${day}.nogit`;
  }
}

const BUILD = buildId();

/** Writes `build.json` next to the pages, read by the server to tell clients its build. */
function buildJson(): Plugin {
  return {
    name: 'battlemap-build-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build: BUILD }) + '\n' });
    },
  };
}

/** The effects library (`v2/assets/effects/`), served and shipped as `/app/effects/`. */
const EFFECTS_DIR = here('../assets/effects');

/** What of the effects library stays out of the app: build tools and the people's preview. */
const effectsShipped = (rel: string) => !/^(tools)(\/|$)/.test(rel) && rel !== 'preview.html';

/**
 * Makes the effects library reachable by the app (package 7, docs/effects.md): in development
 * `/app/effects/*` is read straight from `assets/effects/`; a build copies it to
 * `dist/effects/` without `tools/` and `preview.html`.
 */
function effectsLibrary(): Plugin {
  const types: Record<string, string> = { '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.frag': 'text/plain', '.vert': 'text/plain' };
  return {
    name: 'battlemap-effects-library',
    configureServer(server) {
      server.middlewares.use('/app/effects/', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0]!)).replace(/^[/\\]+/, '');
        if (rel.startsWith('..') || !effectsShipped(rel)) return next();
        const file = join(EFFECTS_DIR, rel);
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = join(options.dir ?? here('dist'), 'effects');
      cpSync(EFFECTS_DIR, out, { recursive: true, filter: (src) => effectsShipped(src.slice(EFFECTS_DIR.length).replace(/^[/\\]+/, '')) });
    },
  };
}

export default defineConfig({
  base: '/app/', // the shell serves the bundle under /app/, the server too (docs/shell.md)
  plugins: [svelte(), buildJson(), effectsLibrary()],
  resolve: { alias: { $lib: here('./src/lib') } },
  define: { __BUILD__: JSON.stringify(BUILD) },
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
    proxy: {
      '/ws': { target: SERVER, ws: true },
      '/log': SERVER,
      '/api': SERVER,
      '/files': SERVER,
      '/health': SERVER,
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: here('index.html'), kit: here('kit.html'), bench: here('bench.html') },
    },
  },
});
