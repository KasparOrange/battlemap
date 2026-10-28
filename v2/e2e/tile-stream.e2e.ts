/**
 * Tile streaming of big maps on the TV (`docs/render.md` "Tile streaming for big maps"), against
 * the real Rust server and a bare WebSocket companion:
 *
 * - a synthetic 136 × 76-square map (7616 × 4256 px, 56 px per square, every square numbered)
 *   is cut by the server into 512 px tiles and shown on the TV as tiles, never decoded whole;
 * - the table window pans a screen at a time over the 4 × 4 screens; after every pan settles no
 *   tile under the screen is missing, and the map's textures stay near window + ring;
 * - a small map still takes the whole-picture path.
 *
 * `TV_SHOTS=<dir>` saves a screenshot after each pan. Prints one line with the measured MB.
 */
import { expect, test, type Page } from '@playwright/test';
import { BareCompanion, testMap, uploadTestPicture, type Ref } from './tv-companion.ts';

const SHOTS = process.env.TV_SHOTS ?? null;
const COLS = 136;
const ROWS = 76;
const PX = 56;

test.use({ viewport: { width: 1920, height: 1080 } });

/** What the test hook reports of the map. */
interface MapStats {
  mapBytes: number;
  pxPerSquare: number;
  stream: { total: number; loaded: number; inFlight: number; queued: number; visibleMissing: number; decoded: number; freed: number; bytes: number } | null;
}

async function mapStats(page: Page): Promise<MapStats | null> {
  return page.evaluate(() => {
    const r = (globalThis as unknown as { __battlemap?: { render(): { detail: { textures: { map: number }; mapPxPerSquare: number; mapStream: MapStats['stream'] } } | null } }).__battlemap?.render();
    if (!r) return null;
    return { mapBytes: r.detail.textures.map, pxPerSquare: r.detail.mapPxPerSquare, stream: r.detail.mapStream };
  });
}

/** Draws the 7616 × 4256 numbered-square map in the page and uploads it as a JPEG. */
async function uploadBigPicture(page: Page): Promise<Ref> {
  return page.evaluate(async ({ cols, rows, px }) => {
    const c = document.createElement('canvas');
    c.width = cols * px;
    c.height = rows * px;
    const g = c.getContext('2d')!;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // each screen of 34 × 19 its own hue, squares in a checker of two tones
        const screen = Math.floor(x / 34) + 4 * Math.floor(y / 19);
        g.fillStyle = `hsl(${screen * 22} 45% ${(x + y) % 2 ? 38 : 46}%)`;
        g.fillRect(x * px, y * px, px, px);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2;
    for (let x = 0; x <= cols; x++) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, rows * px); g.stroke(); }
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(cols * px, y * px); g.stroke(); }
    g.fillStyle = '#fff';
    g.font = '15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) g.fillText(`${x},${y}`, x * px + px / 2, y * px + px / 2);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85));
    const res = await fetch('/files?ext=jpg&format=asis', { method: 'POST', body: blob });
    const j = (await res.json()) as { hash: string; ext: string; bytes: number };
    return { hash: j.hash, ext: j.ext, bytes: j.bytes };
  }, { cols: COLS, rows: ROWS, px: PX });
}

/** Waits until the stream has nothing queued or loading and every visible tile is on the GPU. */
async function settled(page: Page): Promise<MapStats> {
  let last: MapStats | null = null;
  await expect.poll(async () => {
    last = await mapStats(page);
    const s = last?.stream;
    return !!s && s.visibleMissing === 0 && s.queued === 0 && s.inFlight === 0;
  }, { timeout: 20_000, intervals: [100] }).toBe(true);
  return last!;
}

test('a 136 × 76 map streams tiles around the window and stays near window + ring', async ({ page }) => {
  test.setTimeout(120_000);
  const table = `tv-tiles-${Date.now()}`;
  await page.goto(`/app/?mode=tv&table=${table}&debug=1&name=E2E%20TV`);
  await expect(page.getByTestId('tv-status')).toContainText('open');
  const c = new BareCompanion(table);
  await c.connect();

  const picture = await uploadBigPicture(page);
  // the server cuts it (made on the first ask; the TV asks the same)
  const cut = await page.evaluate(async (p) => (await fetch(`/api/tiles/${p.hash}.${p.ext}?level=0`)).json(), picture) as { cols: number; rows: number; width: number; tiles: unknown[] };
  expect([cut.cols, cut.rows, cut.width, cut.tiles.length]).toEqual([15, 9, 7616, 135]);

  const map = {
    ...testMap(picture, 'm1bigmap0001', 'Big valley'),
    grid: { x: 0, y: 0, cellW: PX, cellH: PX, cols: COLS, rows: ROWS, pictureW: COLS * PX, pictureH: ROWS * PX },
  };
  const gameId = `g${Date.now().toString(36)}`.slice(0, 12);
  c.send({ type: 'game.new', game: { id: gameId, name: 'Tiles test', createdAt: new Date().toISOString(), map } });
  await expect(page.getByTestId('tv-game')).toBeVisible();
  c.command({ type: 'fog.all', value: 'reveal' });
  c.command({ type: 'view.window', col: 0, row: 0 });

  const first = await settled(page);
  expect(first.stream).not.toBeNull();
  expect(first.pxPerSquare).toBeGreaterThan(50);
  let maxMb = first.mapBytes / 2 ** 20;
  const samples: string[] = [`start ${maxMb.toFixed(1)} MB (${first.stream!.loaded} tiles)`];

  // a serpentine over the 4 × 4 screens, one screen per pan
  const pans: [number, number][] = [[34, 0], [34, 0], [34, 0], [0, 19], [-34, 0], [-34, 0], [-34, 0], [0, 19], [34, 0], [34, 0], [0, 19], [-34, 0]];
  let i = 0;
  for (const [dx, dy] of pans) {
    c.command({ type: 'view.pan', dx, dy });
    const s = await settled(page);
    const mb = s.mapBytes / 2 ** 20;
    maxMb = Math.max(maxMb, mb);
    samples.push(`${dx},${dy}: ${mb.toFixed(1)} MB (${s.stream!.loaded} tiles, freed ${s.stream!.freed})`);
    expect(s.stream!.visibleMissing).toBe(0);
    expect(mb).toBeLessThan(64);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tiles-pan-${++i}.png` });
  }
  const end = (await mapStats(page))!;
  // never the whole set on the GPU, and tiles were freed on the way
  expect(end.stream!.loaded).toBeLessThan(end.stream!.total);
  expect(end.stream!.freed).toBeGreaterThan(0);
  console.log(`tile-stream: max ${maxMb.toFixed(1)} MB of map textures; ${samples.join(' · ')}`);
  c.close();
});

test('a small map is still decoded whole', async ({ page }) => {
  const table = `tv-small-${Date.now()}`;
  await page.goto(`/app/?mode=tv&table=${table}&debug=1&name=E2E%20TV`);
  await expect(page.getByTestId('tv-status')).toContainText('open');
  const c = new BareCompanion(table);
  await c.connect();
  const picture = await uploadTestPicture(page);
  const gameId = `g${Date.now().toString(36)}`.slice(0, 12);
  c.send({ type: 'game.new', game: { id: gameId, name: 'Small test', createdAt: new Date().toISOString(), map: testMap(picture) } });
  await expect(page.getByTestId('tv-game')).toBeVisible();
  await expect.poll(async () => (await mapStats(page))?.mapBytes ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const s = (await mapStats(page))!;
  expect(s.stream).toBeNull();
  c.close();
});
