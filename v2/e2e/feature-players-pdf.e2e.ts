/**
 * W5-4 features end to end:
 * - **players' view (S12)**: a `?mode=players` page on a table shows what the TV shows (the fog
 *   over unrevealed squares, the map where revealed — compared with the TV's own picture) and
 *   never receives DM state: no `sync.*` frame, no hidden token, no DM layer, no other map
 *   reaches its socket; it can't send commands;
 * - **PDF page picker (S16)**: a 3-page PDF shows three thumbnails; picking pages 1 and 3 makes a
 *   game with those two maps.
 */
import { expect, test, type Page } from '@playwright/test';
import type { RootState } from '../shared/src/index.ts';
import { uploadMap } from './support/maps.ts';
import { activeMap, openTable, startGame, tvState } from './support/table.ts';

/** Mean luminance (0–255) of a rect of a PNG screenshot, given as fractions of the picture. */
async function luma(page: Page, png: Buffer, f: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate(async ({ b64, f }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const rect = { x: Math.round(img.width * f.x), y: Math.round(img.height * f.y), w: Math.max(1, Math.round(img.width * f.w)), h: Math.max(1, Math.round(img.height * f.h)) };
    const c = document.createElement('canvas');
    c.width = rect.w;
    c.height = rect.h;
    const g = c.getContext('2d')!;
    g.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const d = g.getImageData(0, 0, rect.w, rect.h).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, { b64: png.toString('base64'), f });
}

/** The middle of the table, where the small test map lies on a 34 × 19 window. */
const MIDDLE = { x: 0.42, y: 0.38, w: 0.16, h: 0.24 };

/** The players' page's state (its `?debug=1` hook). */
function playersState(page: Page): Promise<RootState | null> {
  return page.evaluate(() => (window as unknown as { __battlemapPlayers?: { state(): RootState | null } }).__battlemapPlayers?.state() ?? null);
}

test('the players\' view shows what the TV shows and never gets DM state', async ({ browser }) => {
  test.setTimeout(180_000);
  const t = await openTable(browser, { companions: 0 });
  try {
    const house = await uploadMap(t.serverUrl, 'house');
    const other = await uploadMap(t.serverUrl, 'house');
    await startGame(t, 'Players test', house.info);
    await t.bot.must({ type: 'map.add', map: { ...other.info, name: 'The next dungeon' }, activate: false });
    await t.bot.must({ type: 'token.add', token: { id: 'tpc', label: 'A', name: 'Aria the bold', color: '#e53935', col: 1, row: 1, placed: true, hidden: false } });
    await t.bot.must({ type: 'token.add', token: { id: 'togre', label: 'O', name: 'Ogre in wait', color: '#333333', col: 5, row: 5, placed: true, hidden: true } });
    await t.bot.must({ type: 'layers.set', layers: [{ id: 'l1', name: 'Secret notes layer', file: house.info.picture, visible: true, opacity: 0.6 }] });

    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const players = await ctx.newPage();
    const frames: string[] = [];
    players.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
    await players.goto(`/app/?mode=players&table=${t.id}&debug=1`);
    await expect.poll(async () => (await playersState(players))?.game?.name ?? null, { timeout: 30_000 }).toBe('Players test');
    await expect(players.getByTestId('players-state')).toHaveCount(0);

    // what arrived is the players' copy
    let s = (await playersState(players))!;
    expect(s.game!.mapOrder).toEqual([house.info.id]);
    expect(activeMap(s).tokens.map((x) => x.id)).toEqual(['tpc']);
    expect(activeMap(s).layers).toEqual([]);

    // all fog: the middle is as dark on the players' page as on the TV
    await players.waitForTimeout(1500);
    const hiddenP = await luma(players, await players.getByTestId('players-table').screenshot(), MIDDLE);
    const hiddenTv = await luma(t.tv, await t.tv.screenshot(), MIDDLE);

    // reveal everything: the map shows on both
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    await expect.poll(async () => (await playersState(players))?.game?.maps[house.info.id]?.fog.revealed ?? null, { timeout: 10_000 })
      .toEqual(activeMap(await tvState(t)).fog.revealed);
    await players.waitForTimeout(2500); // the reveal fades in
    const shownP = await luma(players, await players.getByTestId('players-table').screenshot(), MIDDLE);
    const shownTv = await luma(t.tv, await t.tv.screenshot(), MIDDLE);
    test.info().annotations.push({ type: 'luma', description: JSON.stringify({ hiddenP, hiddenTv, shownP, shownTv }) });
    expect(shownP - hiddenP).toBeGreaterThan(10);
    expect(Math.abs(hiddenP - hiddenTv)).toBeLessThan(20);
    expect(Math.abs(shownP - shownTv)).toBeLessThan(25);
    await players.getByTestId('players-table').screenshot({ path: test.info().outputPath('players.png') });

    // a player can't send commands: the TV's revision stays put
    const rev = (await t.bot.snapshot()).rev;
    await players.evaluate(() => {
      const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/ws`);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', protocol: 1, role: 'players', room: new URL(location.href).searchParams.get('table'), client: 'p-sneaky', name: 'x', build: 'x' }));
      ws.onmessage = (e) => {
        if (JSON.parse(String(e.data)).type === 'welcome') ws.send(JSON.stringify({ type: 'sync.cmd', seq: 1, cmd: { type: 'fog.all', value: 'hide' } }));
      };
    });
    await players.waitForTimeout(1500);
    expect((await t.bot.snapshot()).rev).toBe(rev);
    s = (await playersState(players))!;
    expect(activeMap(s).fog.revealed).toEqual(activeMap(await tvState(t)).fog.revealed);

    // nothing DM-only ever reached the players' socket
    const all = frames.join('\n');
    expect(frames.some((f) => f.includes('"players.state"'))).toBe(true);
    for (const never of ['"sync.snapshot"', '"sync.applied"', 'Ogre in wait', 'Secret notes layer', 'The next dungeon']) expect(all).not.toContain(never);
    await ctx.close();
  } finally {
    await t.close();
  }
});

/** A tiny 3-page PDF (600 × 450 pt pages in three colours with a 20 × 15 grid). */
function threePagePdf(): Buffer {
  const colours = ['0.36 0.31 0.25', '0.25 0.36 0.31', '0.31 0.25 0.36'];
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push(`<< /Type /Pages /Kids [${colours.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${colours.length} >>`);
  for (const c of colours) {
    let grid = '0.1 0.1 0.1 RG 1 w ';
    for (let x = 0; x <= 600; x += 30) grid += `${x} 0 m ${x} 450 l S `;
    for (let y = 0; y <= 450; y += 30) grid += `0 ${y} m 600 ${y} l S `;
    const stream = `${c} rg 0 0 600 450 re f ${grid}`;
    const contentNo = objs.length + 2;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 450] /Contents ${contentNo} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

test('a 3-page PDF: pick pages 1 and 3, the game gets those two maps', async ({ browser }) => {
  test.setTimeout(240_000);
  const t = await openTable(browser, { companions: 1 });
  try {
    const page = t.companions[0]!;
    await expect(page.getByTestId('library')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('upload-input').setInputFiles({ name: 'crypt_20x15.pdf', mimeType: 'application/pdf', buffer: threePagePdf() });
    await expect(page.getByText('Which pages are maps?')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('button[data-page]')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Page 3' }).click();
    await page.screenshot({ path: test.info().outputPath('pdf-picker.png') });
    await page.getByRole('button', { name: 'Import 2 pages as 2 maps' }).click();

    const first = page.getByRole('button', { name: 'Upload, next page (2 of 2)' });
    await expect(first).toBeEnabled({ timeout: 90_000 });
    await first.click();
    const last = page.getByRole('button', { name: 'Upload and play' });
    await expect(last).toBeEnabled({ timeout: 90_000 });
    await last.click();

    await expect.poll(async () => (await tvState(t)).game?.mapOrder.length ?? 0, { timeout: 45_000 }).toBe(2);
    const game = (await tvState(t)).game!;
    const names = game.mapOrder.map((id) => game.maps[id]!.info.name);
    expect(names).toEqual(['Crypt — page 1', 'Crypt — page 3']); // the file's name, tidied (counts out)
    expect(game.activeMapId).toBe(game.mapOrder[0]);
    expect(game.maps[game.mapOrder[0]!]!.info.grid.cols).toBe(20);
  } finally {
    await t.close();
  }
});
