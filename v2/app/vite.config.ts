/**
 * Vite config of the app: three pages (the app, the kit gallery, the renderer bench), `$lib`,
 * a build id, and in development a proxy to the server so the browser sees one origin.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/** Where the dev server proxies `/ws`, `/log`, `/api`, `/files`, `/health`. */
const SERVER = process.env.BATTLEMAP_SERVER ?? 'http://localhost:5929';

/** The app's dev port (the launcher passes `--port` when it starts it). */
const DEV_PORT = 5884;

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

export default defineConfig({
  base: '/app/', // the shell serves the bundle under /app/, the server too (docs/shell.md)
  plugins: [svelte(), buildJson()],
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
