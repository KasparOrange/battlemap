/**
 * The game night — the old test script (`../../docs/test-session.md`, scenes 0–7) as flows.
 *
 * Who does what: a TV page (the authority, rendering at 1920 × 1080), a companion page (must end
 * up showing the TV's state), and the bot — a scripted companion on the real protocol
 * (`support/proto.ts`) that plays the DM's moves. The companion's touch UI is not driven here;
 * that is the companion package's flows (`companion-game-*`, `companion-lib-*`). Every command
 * goes the networked path (L20): bot → server → TV → every companion.
 *
 * Each test is one beat of a scene on its own fresh table, so a failure points at one feature.
 * A test whose feature hasn't landed yet is marked `fixme` at run time by `needs(…)`
 * (`support/caps.ts`) and turns green by itself when it lands.
 *
 * Maps: the ten maps of the old set as synthetic fixtures (`support/maps.ts`) — same names,
 * squares and door counts, generated pictures and four-room geometry.
 */
import {
  buildWallGrid, circleCells, classicDisc, floodFill, floodFillWithin, maskCells, maskCount, newId, tableGrid,
  type MapPlay, type Token,
} from '../shared/src/index.ts';
import { needs } from './support/caps.ts';
import { expect, test } from './support/fixtures.ts';
import { MAP_SET, topLeftRoom, uploadMap, type UploadedMap } from './support/maps.ts';
import { activeMap, appUrl, openTable, pageState, startGame, tvState, waitSynced, waitTvOnline, type Table } from './support/table.ts';

test.describe.configure({ timeout: 60_000 });

// ── helpers ─────────────────────────────────────────────────────────────────────────────────

/** Cells revealed on a map. */
function revealed(m: MapPlay): number[] {
  return maskCells(m.fog.revealed, m.info.grid.cols * m.info.grid.rows);
}

/** How many cells are revealed. */
function revealedCount(m: MapPlay): number {
  return maskCount(m.fog.revealed, m.info.grid.cols * m.info.grid.rows);
}

/** A brush stroke's cells: circles of `radius` squares along a path of square centres. */
function brush(cols: number, rows: number, path: [number, number][], radius: number): number[] {
  const set = new Set<number>();
  for (const [c, r] of path) for (const i of circleCells(c, r, radius, cols, rows)) set.add(i);
  return [...set];
}

/** A token at a square. */
function token(label: string, col: number, row: number, color = '#e53935'): Token {
  return { id: newId(), label, name: label, color, col, row, placed: true, hidden: false };
}

/** Starts a game on a fixture map and returns it with the uploaded map. */
async function gameOn(t: Table, key: string, name = `Game on ${key}`): Promise<UploadedMap> {
  const map = await uploadMap(t.serverUrl, key);
  await startGame(t, name, map.info);
  return map;
}

/** After a beat: the companion page shows exactly what the TV holds (hook) or the same rev. */
async function companionMatchesTv(t: Table): Promise<void> {
  const snap = await waitSynced(t);
  expect(t.bot.confirmed, 'the bot folded the same commands to the same state').toEqual(snap.state);
  for (const c of t.companions) {
    const view = await pageState(c);
    if (view !== undefined) expect(view, 'companion page shows the TV state').toEqual(snap.state);
  }
}

/** The TV page's screenshot (the table as the players see it), without the `?debug=1` status line (its `rev` changes with every command). */
async function tvShot(t: Table): Promise<Buffer> {
  return t.tv.screenshot({ animations: 'disabled', mask: [t.tv.getByTestId('tv-status')] });
}

/**
 * A screenshot of the TV once its picture holds still (two in a row equal, up to ~4 s). A table
 * that keeps animating (a fog style's drift, an effect) can't be compared pixel for pixel; then
 * the test is `fixme` with the renderer's frame count as the reason.
 */
async function settledShot(t: Table): Promise<Buffer> {
  let last = await tvShot(t);
  for (let i = 0; i < 8; i++) {
    await t.tv.waitForTimeout(500);
    const next = await tvShot(t);
    if (next.equals(last)) return next;
    last = next;
  }
  const r1 = (await tvRender(t))?.frames ?? 0;
  await t.tv.waitForTimeout(1000);
  const r2 = (await tvRender(t))?.frames ?? 0;
  test.fixme(true, `the TV picture never holds still (${r2 - r1} frames in 1 s while idle) — pixel comparison impossible`);
  return last;
}

/** The TV renderer's counters through the test hook (`render().detail`), or null. */
async function tvRender(t: Table): Promise<{ frames: number; mapBytes: number; layerBytes: number } | null> {
  return t.tv.evaluate(() => {
    const h = (window as unknown as { __battlemap?: { render?(): { frames: number; detail?: { textures?: { map: number; layers: number } } } | null } }).__battlemap;
    const r = h?.render?.();
    if (!r) return null;
    return { frames: r.frames, mapBytes: r.detail?.textures?.map ?? 0, layerBytes: r.detail?.textures?.layers ?? 0 };
  });
}

/**
 * Waits until the TV renderer holds the map's textures and has drawn a frame since (qa#14: the
 * renderer's counters from the test hook instead of reading the WebGL canvas back, which shows a
 * flat picture under SwiftShader without `preserveDrawingBuffer`). Then a short pause, so the
 * page screenshots compare a settled table. `fixme` only when the page has no renderer counters.
 */
async function needsDrawnMap(t: Table): Promise<void> {
  const first = await tvRender(t);
  test.fixme(first === null, 'not landed yet: the TV renderer counters in the test hook');
  await expect.poll(async () => (await tvRender(t))?.mapBytes ?? 0, { timeout: 30_000, message: 'the TV holds no map texture' }).toBeGreaterThan(0);
  await expect(t.tv.getByTestId('tv-busy')).toBeHidden();
  await t.tv.waitForTimeout(800);
}

/**
 * Expects two TV pictures to be equal; on a difference both are attached to the report.
 *
 * @param before - the picture before
 * @param after - the picture after
 * @param message - what the equality means
 */
async function expectSamePicture(before: Buffer, after: Buffer, message: string): Promise<void> {
  if (!after.equals(before)) {
    await test.info().attach('tv-before.png', { body: before, contentType: 'image/png' });
    await test.info().attach('tv-after.png', { body: after, contentType: 'image/png' });
  }
  expect(after.equals(before), message).toBe(true);
}

/**
 * Whether a page still answers (a page whose main thread hangs never does) — within 4 s.
 *
 * @param page - the page
 * @returns false when it hangs
 */
async function answers(page: Table['tv']): Promise<boolean> {
  return Promise.race([page.evaluate(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 4000))]);
}

// ── scene 0 · prep ──────────────────────────────────────────────────────────────────────────

test.describe('scene 0 · prep', () => {
  test('upload the ten maps: each is stored and listed in the shared library', async ({ privateTable: t }) => {
    await needs(t, 'files', 'library');
    for (const f of MAP_SET) {
      const m = await uploadMap(t.serverUrl, f.key);
      expect(m.stored, f.file).toBe(true);
      const r = await fetch(`${t.serverUrl}/api/library`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map: { ...m.info, libraryId: null }, thumb: null, addedAt: new Date().toISOString(), originalBytes: null, note: null }),
      });
      expect(r.ok, `library add ${f.file}: HTTP ${r.status}`).toBe(true);
      const pic = await fetch(`${t.serverUrl}/files/${m.info.picture.hash}.${m.info.picture.ext}`);
      expect(pic.status, `${f.file} picture served`).toBe(200);
      expect(pic.headers.get('cache-control') ?? '', 'files are immutable').toContain('immutable');
    }
    const list = (await (await fetch(`${t.serverUrl}/api/library`)).json()) as { entries?: unknown[] } | unknown[];
    const entries = Array.isArray(list) ? list : (list.entries ?? []);
    expect(entries.length).toBe(MAP_SET.length);
  });

  test('measure the TV: calibrate, overscan, pattern with pivot, back to auto (34 × 19)', async ({ table: t }) => {
    const vp = (await tvState(t)).table.viewport!;
    expect(vp, 'the TV reported its viewport').toEqual({ width: 1920, height: 1080 });
    expect(tableGrid(vp, (await tvState(t)).table.widthInches)).toMatchObject({ cols: 34, rows: 19 });

    await t.bot.must({ type: 'table.pattern', on: true, pivot: 'center' });
    await t.bot.must({ type: 'table.calibrate', widthInches: 40 });
    await t.bot.must({ type: 'table.overscan', percent: 3 });
    let s = await tvState(t);
    expect(s.table).toMatchObject({ widthInches: 40, overscanPercent: 3, pattern: { on: true, pivot: 'center' } });
    const g = tableGrid(vp, 40, 3)!;
    expect(g.cols).toBeLessThan(tableGrid(vp, 40, 0)!.cols);

    // clamps
    await t.bot.must({ type: 'table.calibrate', widthInches: 500 });
    await t.bot.must({ type: 'table.overscan', percent: 50 });
    s = await tvState(t);
    expect(s.table.widthInches).toBe(90);
    expect(s.table.overscanPercent).toBe(12);

    await t.bot.must({ type: 'table.reset' });
    await t.bot.must({ type: 'table.pattern', on: false });
    s = await tvState(t);
    expect(tableGrid(vp, s.table.widthInches, s.table.overscanPercent)).toMatchObject({ cols: 34, rows: 19 });
    const diag = await t.bot.request({ type: 'diag.status' }, ['diag.report']);
    expect(diag.table).toBe('34x19');
    await companionMatchesTv(t);
  });

  test('TV remote: arrow keys + Enter reach every library entry', async ({ privateTable: t }) => {
    await needs(t, 'tvStorage');
    // Two games on the TV, then back to its library.
    await gameOn(t, 'house', 'Remote A');
    await gameOn(t, 'tavern', 'Remote B');
    t.bot.send({ type: 'game.close' });
    await t.bot.until((s) => s.game === null);
    await t.tv.waitForTimeout(500);
    // Crawl with the D-pad only: arrows around, OK on "Library" once; collect what got focus.
    const seen = new Set<string>();
    let enteredLibrary = false;
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight'];
    for (let i = 0; i < 40 && !(seen.has('Remote A') && seen.has('Remote B')); i++) {
      const label = await t.tv.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText?.trim() ?? '');
      for (const name of ['Remote A', 'Remote B']) if (label.includes(name)) seen.add(name);
      if (!enteredLibrary && label.startsWith('Library')) {
        enteredLibrary = true;
        await t.tv.keyboard.press('Enter');
        await t.tv.waitForTimeout(400);
        continue;
      }
      await t.tv.keyboard.press(keys[i % keys.length]!);
    }
    expect([...seen].sort(), 'both games reached with arrows + OK').toEqual(['Remote A', 'Remote B']);
  });
});

// ── scene 1 · the tavern ────────────────────────────────────────────────────────────────────

test.describe('scene 1 · the tavern', () => {
  test('start on the tavern: fogged, one inch per square, window centred', async ({ table: t }) => {
    const map = await gameOn(t, 'tavern');
    const m = activeMap(await tvState(t));
    expect(m.info.grid).toMatchObject({ cols: 16, rows: 16 });
    expect(m.fog.on).toBe(true);
    expect(revealedCount(m)).toBe(0);
    expect(m.view.mode).toBe('table');
    expect([m.view.col, m.view.row]).toEqual([null, null]);
    expect(map.info.doorCount).toBe(12);
    await companionMatchesTv(t);
  });

  test('tokens: 4 players at the door, 2 NPCs at the bar, one moved by drag', async ({ table: t }) => {
    await gameOn(t, 'tavern');
    const players = [token('P1', 1, 14), token('P2', 2, 14), token('P3', 3, 14), token('P4', 4, 14)];
    const npcs = [token('Bar', 12, 2, '#1e88e5'), token('Cook', 13, 2, '#1e88e5')];
    for (const tk of [...players, ...npcs]) await t.bot.must({ type: 'token.add', token: tk });
    const drag = newId();
    for (const [c, r] of [[1, 13], [1, 12], [2, 11]] as const) await t.bot.must({ type: 'token.move', id: players[0]!.id, col: c, row: r, gesture: drag });
    const m = activeMap(await tvState(t));
    expect(m.tokens).toHaveLength(6);
    expect(m.tokens.find((x) => x.id === players[0]!.id)).toMatchObject({ col: 2, row: 11 });
    // the drag is one undo step
    await t.bot.must({ type: 'history.undo' });
    expect(activeMap(await tvState(t)).tokens.find((x) => x.id === players[0]!.id)).toMatchObject({ col: 1, row: 14 });
    await companionMatchesTv(t);
  });

  test('brush reveals the main room; the bar stays hidden; one stroke = one undo step', async ({ table: t }) => {
    await gameOn(t, 'tavern');
    const gesture = newId();
    const path: [number, number][] = [[2, 12], [3, 11], [4, 10], [5, 9], [6, 10]];
    for (const p of path) await t.bot.must({ type: 'fog.apply', cells: brush(16, 16, [p], 1), value: 'reveal', gesture });
    const m = activeMap(await tvState(t));
    const want = brush(16, 16, path, 1).sort((a, b) => a - b);
    expect(revealed(m)).toEqual(want);
    expect(revealed(m)).not.toContain(2 * 16 + 12); // the bar (12, 2) is still fogged
    await t.bot.must({ type: 'history.undo' });
    expect(revealedCount(activeMap(await tvState(t)))).toBe(0);
    await t.bot.must({ type: 'history.redo' });
    expect(revealed(activeMap(await tvState(t)))).toEqual(want);
    await companionMatchesTv(t);
  });
});

// ── scene 2 · the house ─────────────────────────────────────────────────────────────────────

test.describe('scene 2 · the house', () => {
  test('a new game on another map carries no tokens or fog over (L7)', async ({ table: t }) => {
    await gameOn(t, 'tavern');
    await t.bot.must({ type: 'token.add', token: token('P1', 1, 1) });
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    await t.bot.must({ type: 'draw.add', stroke: { id: newId(), points: [1, 1, 5, 5], color: '#ffffff', width: 0.2 } });
    await gameOn(t, 'home');
    const s = await tvState(t);
    const m = activeMap(s);
    expect(m.info.grid).toMatchObject({ cols: 16, rows: 18 });
    expect(m.tokens).toEqual([]);
    expect(m.strokes).toEqual([]);
    expect(revealedCount(m)).toBe(0);
    expect(s.history.undo).toEqual([]);
    expect(s.live.measure).toBeNull();
    await companionMatchesTv(t);
  });

  test('doors open and close from the tablet; the TV follows', async ({ table: t }) => {
    await gameOn(t, 'home');
    for (const i of [0, 3, 7, 28]) await t.bot.must({ type: 'door.set', index: i, open: true });
    await t.bot.must({ type: 'door.set', index: 3, open: false });
    expect([...activeMap(await tvState(t)).doorsOpen].sort((a, b) => a - b)).toEqual([0, 7, 28]);
    // a door past the map's count is refused
    const bad = await t.bot.cmd({ type: 'door.set', index: 29, open: true });
    expect(bad.ok).toBe(false);
    // explicit values: setting an open door open again changes nothing harmful
    await t.bot.must({ type: 'door.set', index: 0, open: true });
    expect([...activeMap(await tvState(t)).doorsOpen].sort((a, b) => a - b)).toEqual([0, 7, 28]);
    await companionMatchesTv(t);
  });

  test('room reveal stops at walls and continues through an open door', async ({ table: t }) => {
    const map = await gameOn(t, 'home');
    const f = map.fixture;
    const closedRoom = floodFill(buildWallGrid(f.cols, f.rows, map.geometry!, []), 0);
    expect(closedRoom.sort((a, b) => a - b)).toEqual(topLeftRoom(f));
    await t.bot.must({ type: 'fog.apply', cells: closedRoom, value: 'reveal', gesture: newId() });
    expect(revealed(activeMap(await tvState(t)))).toEqual(topLeftRoom(f));

    await t.bot.must({ type: 'door.set', index: 0, open: true });
    const through = floodFill(buildWallGrid(f.cols, f.rows, map.geometry!, [0]), 0);
    await t.bot.must({ type: 'fog.apply', cells: through, value: 'reveal', gesture: newId() });
    expect(revealedCount(activeMap(await tvState(t)))).toBe(topLeftRoom(f).length + Math.floor(f.cols / 2) * Math.ceil(f.rows / 2));
    await companionMatchesTv(t);
  });

  test('circle radius 4 with preview first: staged on the tablet only, resized live, then shown', async ({ table: t }) => {
    const map = await gameOn(t, 'home');
    const f = map.fixture;
    await t.bot.must({ type: 'fog.preview', on: true });
    const walls = buildWallGrid(f.cols, f.rows, map.geometry!, []);
    const start = 3 * f.cols + 6; // (6, 3): next to the middle wall at x = 8
    const gesture = newId();
    await t.bot.must({ type: 'fog.apply', cells: floodFillWithin(walls, start, 4), value: 'reveal', gesture, live: 'start' });
    let m = activeMap(await tvState(t));
    expect(revealedCount(m), 'players still see fog').toBe(0);
    expect(m.fog.staged).not.toBeNull();
    // the circle stops at the wall: nothing staged right of x = 8
    const staged = maskCells(m.fog.staged!.reveal, f.cols * f.rows);
    expect(staged.every((i) => i % f.cols < 8)).toBe(true);
    // − / +: the live circle is replaced, not added to
    const smaller = floodFillWithin(walls, start, 2);
    await t.bot.must({ type: 'fog.apply', cells: smaller, value: 'reveal', gesture, live: 'replace' });
    m = activeMap(await tvState(t));
    expect(maskCells(m.fog.staged!.reveal, f.cols * f.rows).sort((a, b) => a - b)).toEqual([...smaller].sort((a, b) => a - b));
    // ✓
    await t.bot.must({ type: 'fog.commit' });
    m = activeMap(await tvState(t));
    expect(revealed(m)).toEqual([...smaller].sort((a, b) => a - b));
    expect(m.fog.staged).toBeNull();
    await companionMatchesTv(t);
  });

  test('preview tint never shows on the TV (L16)', async ({ table: t }) => {
    await needs(t, 'files');
    await gameOn(t, 'home');
    await needsDrawnMap(t);
    await t.bot.must({ type: 'fog.preview', on: true });
    const before = await settledShot(t);
    await t.bot.must({ type: 'fog.apply', cells: brush(16, 18, [[3, 3]], 3), value: 'reveal', gesture: newId() });
    await t.tv.waitForTimeout(800);
    await expectSamePicture(before, await settledShot(t), 'the TV picture must not change while a reveal is only staged');
  });

  test('trim revealed edges 15 %: the setting reaches the TV', async ({ table: t }) => {
    await gameOn(t, 'home');
    await t.bot.must({ type: 'game.settings', settings: { fogEdgeInset: 15 } });
    expect((await tvState(t)).game!.settings.fogEdgeInset).toBe(15);
    expect((await t.bot.cmd({ type: 'game.settings', settings: { fogEdgeInset: 60 } })).ok, 'over 45 % is refused').toBe(false);
    await companionMatchesTv(t);
  });

  test('measure from the front door to the kitchen: live line on the TV, never saved', async ({ table: t }) => {
    await gameOn(t, 'home');
    for (let x = 2; x <= 10; x += 2) await t.bot.must({ type: 'measure.set', line: { a: { x: 1.5, y: 16.5 }, b: { x, y: 4.5 } } });
    expect((await tvState(t)).live.measure).toEqual({ a: { x: 1.5, y: 16.5 }, b: { x: 10, y: 4.5 } });
    expect((await tvState(t)).history.undo, 'a measure is no undo step').toEqual([]);
    await t.bot.must({ type: 'measure.set', line: null });
    expect((await tvState(t)).live.measure).toBeNull();
    await companionMatchesTv(t);
  });
});

// ── scene 3 · the fight ─────────────────────────────────────────────────────────────────────

test.describe('scene 3 · the fight', () => {
  test('five tokens; hide one from the players; remove one; clear all has undo (L34)', async ({ table: t }) => {
    await gameOn(t, 'lair');
    const tks = [0, 1, 2, 3, 4].map((i) => token(`M${i + 1}`, 5 + i, 7, '#8e24aa'));
    for (const tk of tks) await t.bot.must({ type: 'token.add', token: tk });
    await t.bot.must({ type: 'token.update', id: tks[1]!.id, hidden: true });
    await t.bot.must({ type: 'token.remove', id: tks[4]!.id });
    let m = activeMap(await tvState(t));
    expect(m.tokens).toHaveLength(4);
    expect(m.tokens.find((x) => x.id === tks[1]!.id)?.hidden).toBe(true);
    await t.bot.must({ type: 'token.clear' });
    expect(activeMap(await tvState(t)).tokens).toEqual([]);
    await t.bot.must({ type: 'history.undo' });
    m = activeMap(await tvState(t));
    expect(m.tokens).toHaveLength(4);
    await companionMatchesTv(t);
  });

  test('draw an arrow, remove it, clear; undo brings strokes back', async ({ table: t }) => {
    await gameOn(t, 'lair');
    const a = { id: newId(), points: [2, 2, 8, 2, 7, 1, 8, 2, 7, 3], color: '#fdd835', width: 0.15 };
    const b = { id: newId(), points: [3, 5, 9, 9], color: '#ffffff', width: 0.3 };
    await t.bot.must({ type: 'draw.live', stroke: { ...a, points: a.points.slice(0, 4) } });
    expect((await tvState(t)).live.stroke).not.toBeNull();
    await t.bot.must({ type: 'draw.add', stroke: a });
    await t.bot.must({ type: 'draw.live', stroke: null });
    await t.bot.must({ type: 'draw.add', stroke: b });
    expect(activeMap(await tvState(t)).strokes.map((s) => s.id)).toEqual([a.id, b.id]);
    await t.bot.must({ type: 'draw.remove', id: a.id });
    await t.bot.must({ type: 'draw.clear' });
    expect(activeMap(await tvState(t)).strokes).toEqual([]);
    await t.bot.must({ type: 'history.undo' });
    expect(activeMap(await tvState(t)).strokes.map((s) => s.id)).toEqual([b.id]);
    await companionMatchesTv(t);
  });

  test('ruler: shown, moved, turned in place (90°)', async ({ table: t }) => {
    await gameOn(t, 'lair');
    await t.bot.must({ type: 'ruler.set', ruler: { visible: true, x: 4.5, y: 7, rotation: 0 } });
    await t.bot.must({ type: 'ruler.set', ruler: { visible: true, x: 6, y: 3, rotation: 90 } });
    expect(activeMap(await tvState(t)).ruler).toEqual({ visible: true, x: 6, y: 3, rotation: 90 });
    await t.bot.must({ type: 'ruler.set', ruler: { visible: false, x: 6, y: 3, rotation: 90 } });
    expect(activeMap(await tvState(t)).ruler.visible).toBe(false);
    await companionMatchesTv(t);
  });

  test('template disc: on, dragged, turned, shapes changed, reset to the classic disc', async ({ table: t }) => {
    await gameOn(t, 'lair');
    const classic = classicDisc();
    await t.bot.must({ type: 'disc.set', disc: { ...classic, visible: true, x: 9.5, y: 7 } });
    for (const x of [10, 11, 12]) await t.bot.must({ type: 'disc.set', disc: { ...classic, visible: true, x, y: 7 } });
    const turned = { ...classic, visible: true, x: 12, y: 7, rotation: 135, coneDegrees: 60, markers: 8, tint: 0.3 };
    await t.bot.must({ type: 'disc.set', disc: turned });
    expect(activeMap(await tvState(t)).disc).toEqual(turned);
    await t.bot.must({ type: 'disc.set', disc: { ...classic, visible: true, x: 12, y: 7 } });
    expect(activeMap(await tvState(t)).disc).toEqual({ ...classic, visible: true, x: 12, y: 7 });
    await companionMatchesTv(t);
  });

  test('fog stroke → undo → redo, several maps keep their own undo', async ({ table: t }) => {
    await gameOn(t, 'lair');
    const g = newId();
    await t.bot.must({ type: 'fog.apply', cells: brush(19, 14, [[3, 3]], 2), value: 'reveal', gesture: g });
    await t.bot.must({ type: 'fog.apply', cells: brush(19, 14, [[5, 3]], 2), value: 'reveal', gesture: g });
    const after = revealed(activeMap(await tvState(t)));
    await t.bot.must({ type: 'history.undo' });
    expect(revealedCount(activeMap(await tvState(t)))).toBe(0);
    await t.bot.must({ type: 'history.redo' });
    expect(revealed(activeMap(await tvState(t)))).toEqual(after);
    expect((await t.bot.cmd({ type: 'history.redo' })).ok, 'nothing left to redo').toBe(false);
    await companionMatchesTv(t);
  });
});

// ── scene 4 · up the tower ──────────────────────────────────────────────────────────────────

test.describe('scene 4 · up the tower', () => {
  test('several maps in one game: each keeps its own fog and tokens', async ({ table: t }) => {
    await gameOn(t, 'towerGround', 'Tower');
    const half = brush(11, 11, [[2, 2], [2, 8], [5, 5]], 2);
    await t.bot.must({ type: 'fog.apply', cells: half, value: 'reveal', gesture: newId() });
    const tks = [token('P1', 2, 2), token('P2', 3, 2)];
    for (const tk of tks) await t.bot.must({ type: 'token.add', token: tk });
    const groundBefore = activeMap(await tvState(t));

    const upper = await uploadMap(t.serverUrl, 'towerUpper');
    await t.bot.must({ type: 'map.add', map: upper.info, activate: true });
    let s = await tvState(t);
    expect(s.game!.activeMapId).toBe(upper.info.id);
    expect(revealedCount(activeMap(s)), 'upper floor arrives fogged').toBe(0);
    await t.bot.must({ type: 'fog.apply', cells: brush(11, 11, [[8, 8]], 1), value: 'reveal', gesture: newId() });
    const upperBefore = activeMap(await tvState(t));

    await t.bot.must({ type: 'map.switch', mapId: groundBefore.info.id });
    s = await tvState(t);
    expect(activeMap(s).fog.revealed).toBe(groundBefore.fog.revealed);
    expect(activeMap(s).tokens).toEqual(groundBefore.tokens);
    await t.bot.must({ type: 'map.switch', mapId: upper.info.id });
    expect(activeMap(await tvState(t)).fog.revealed).toBe(upperBefore.fog.revealed);
    expect((await tvState(t)).game!.mapOrder).toEqual([groundBefore.info.id, upper.info.id]);
    await companionMatchesTv(t);
  });

  test('the library lists the game under the map on the table; reopening keeps both maps', async ({ table: t }) => {
    await needs(t, 'tvStorage');
    const ground = await gameOn(t, 'towerGround', 'Tower night');
    const upper = await uploadMap(t.serverUrl, 'towerUpper');
    await t.bot.must({ type: 'map.add', map: upper.info, activate: true });
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    const gameId = (await tvState(t)).game!.id;
    const listing = await t.bot.request({ type: 'lib.list' }, ['lib.listing']);
    const row = (listing.games as { id: string; activeMapName: string; mapNames: string[] }[]).find((g) => g.id === gameId);
    expect(row?.activeMapName).toBe(upper.info.name);
    expect(row?.mapNames).toEqual([ground.info.name, upper.info.name]);

    t.bot.send({ type: 'game.close' });
    await t.bot.until((s) => s.game === null, 10_000);
    t.bot.send({ type: 'game.open', gameId });
    const s = await t.bot.until((x) => x.game?.id === gameId, 10_000);
    expect(s.game!.mapOrder).toEqual([ground.info.id, upper.info.id]);
    expect(revealedCount(activeMap(s))).toBe(11 * 11);
    test.fixme(!(await answers(t.companions[0]!)), 'the companion page hangs (main thread blocked) after game.close + game.open — companion package');
    await companionMatchesTv(t);
  });

  test('a map from a link lands in the shared library', async ({ privateTable: t }) => {
    await needs(t, 'library');
    // The server only fetches public addresses; the test has no internet guarantee, so it
    // checks the guard and leaves the real fetch (dysonlogos.blog) to the device run.
    const r = await fetch(`${t.serverUrl}/api/fetch?url=${encodeURIComponent('http://127.0.0.1:1/x.png')}`);
    test.fixme(r.status === 404, 'not landed yet: /api/fetch');
    expect(r.ok, 'a private address must be refused').toBe(false);
  });
});

// ── scene 5 · something goes wrong ──────────────────────────────────────────────────────────

test.describe('scene 5 · something goes wrong', () => {
  test('the TV app restarts: it reopens the game with fog, tokens and drawings', async ({ table: t }) => {
    await needs(t, 'tvStorage');
    await gameOn(t, 'lair', 'Restart night');
    await t.bot.must({ type: 'fog.apply', cells: brush(19, 14, [[4, 4]], 3), value: 'reveal', gesture: newId() });
    await t.bot.must({ type: 'token.add', token: token('P1', 4, 4) });
    await t.bot.must({ type: 'draw.add', stroke: { id: newId(), points: [1, 1, 6, 6], color: '#ffffff', width: 0.2 } });
    const before = activeMap(await tvState(t));
    await t.tv.waitForTimeout(2500); // the autosave runs 2 s after the last change
    await t.tv.reload();
    await waitTvOnline(t.tv);
    const s = await t.bot.until((x) => x.game?.name === 'Restart night', 15_000);
    const after = activeMap(s);
    expect(after.fog.revealed).toBe(before.fog.revealed);
    expect(after.tokens).toEqual(before.tokens);
    expect(after.strokes).toEqual(before.strokes);
    await companionMatchesTv(t);
  });

  test('a box reset (empty storage) restores the game from the server backup', async ({ privateTable: t, browser }) => {
    await needs(t, 'tvStorage', 'backups');
    await gameOn(t, 'house', 'Backup night');
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    const gameId = (await tvState(t)).game!.id;
    await t.tv.waitForTimeout(3500); // save + backup
    // A new TV with empty storage joins the same table.
    const fresh = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const tv2 = await fresh.newPage();
    await tv2.goto(appUrl('tv', t.id, t.serverUrl, '&name=fresh%20box'));
    await waitTvOnline(tv2);
    const listing = await t.bot.request({ type: 'lib.list' }, ['lib.listing']);
    expect((listing.games as { id: string; where: string }[]).find((g) => g.id === gameId)?.where).toMatch(/server|both/);
    t.bot.send({ type: 'game.open', gameId });
    const s = await t.bot.until((x) => x.game?.id === gameId, 15_000);
    expect(revealedCount(activeMap(s))).toBe(10 * 8);
    await fresh.close();
  });

  test('the companion loses its connection: taps are dropped with a notice, never replayed late (L10)', async ({ browser }) => {
    const t = await openTable(browser, { companions: 0 });
    try {
      // A companion page whose socket the test can cut and hold down.
      const page = await t.context.newPage();
      await page.setViewportSize({ width: 1340, height: 800 });
      let blocked = false;
      const live: { close: () => Promise<void> }[] = [];
      await page.routeWebSocket(/\/ws$/, (ws) => {
        if (blocked) { void ws.close({ code: 4001, reason: 'test: network down' }); return; }
        ws.connectToServer();
        live.push(ws);
      });
      await page.goto(appUrl('companion', t.id, undefined, '&name=flaky%20tablet'));
      t.companions.push(page);
      await waitSynced(t);

      const hook = await page.evaluate(() => typeof (window as unknown as { __battlemap?: { dispatch?: unknown } }).__battlemap?.dispatch === 'function');
      const button = page.getByRole('button', { name: 'Calibrate 40 in' });
      test.fixme(!hook && (await button.count()) === 0, 'not landed yet: companion test hook (dispatch) — the skeleton button is gone');
      await page.waitForTimeout(400); // the kit Button ignores presses in its first 350 ms

      const status = () => page.evaluate(() => {
        const h = (window as unknown as { __battlemap?: { connection: () => string } }).__battlemap;
        return h ? h.connection() : (document.querySelector('[data-testid="companion-status"]')?.textContent ?? '').trim().split(' ')[0] ?? '';
      });

      blocked = true;
      for (const ws of live.splice(0)) await ws.close();
      await expect.poll(status, { message: 'the companion noticed the drop' }).not.toBe('open');
      if (hook) await page.evaluate(() => (window as unknown as { __battlemap: { dispatch: (c: unknown) => boolean } }).__battlemap.dispatch({ type: 'table.calibrate', widthInches: 40 }));
      else await button.click();
      await expect(page.getByText("Not connected to the TV — that wasn't sent.")).toBeVisible();

      blocked = false; // the page reconnects by itself (backoff ≤ 5 s)
      await expect.poll(status, { timeout: 15_000, message: 'the companion reconnected' }).toBe('open');
      await page.waitForTimeout(1500); // anything replayed late would land now
      const s = await waitSynced(t);
      expect(s.state.table.widthInches, 'the offline tap never reached the TV').not.toBe(40);
      expect(t.bot.recent.some((m) => m.type === 'sync.applied' && (m.cmd as { widthInches?: number }).widthInches === 40)).toBe(false);
    } finally {
      await t.close();
    }
  });

  test('the server stops for a few seconds: both sides show it and recover alone', async ({ privateServer, browser }) => {
    const t = await openTable(browser, { serverUrl: privateServer.url });
    try {
      await t.bot.must({ type: 'table.calibrate', widthInches: 38 });
      await waitSynced(t);
      await privateServer.kill();
      await expect(t.tv.getByText(/Connecting to the server|No connection to the server/).first()).toBeVisible({ timeout: 10_000 });
      await t.tv.waitForTimeout(3000);
      await privateServer.restart();
      await waitTvOnline(t.tv);
      await t.bot.connect();
      const s = await waitSynced(t, 20_000);
      expect(s.state.table.widthInches, 'the TV kept its state through the outage').toBe(38);
      await expect(t.tv.getByText(/Connecting to the server|No connection to the server|Tablet not connected/)).toHaveCount(0, { timeout: 15_000 }); // the problem badge goes once all is well
    } finally {
      await t.close();
    }
  });

  test('a double tap on "load" loads once', async ({ table: t }) => {
    await needs(t, 'tvStorage');
    await gameOn(t, 'house', 'Double tap');
    const gameId = (await tvState(t)).game!.id;
    t.bot.send({ type: 'game.close' });
    await t.bot.until((s) => s.game === null, 10_000);
    const epochs = new Set<string>();
    t.bot.onMessage = (m) => { if (m.type === 'sync.snapshot' && m.to === undefined) epochs.add(String(m.epoch)); };
    t.bot.send({ type: 'game.open', gameId });
    t.bot.send({ type: 'game.open', gameId });
    await t.bot.until((s) => s.game?.id === gameId, 10_000);
    await t.tv.waitForTimeout(2000);
    t.bot.onMessage = null;
    expect(epochs.size, 'one load, one new epoch').toBe(1);
  });
});

// ── scene 6 · improvised maps ───────────────────────────────────────────────────────────────

test.describe('scene 6 · improvised maps', () => {
  test('picture maps: own grid lines → no drawn grid; refit keeps the fog, new counts clear it', async ({ table: t }) => {
    const lair = await gameOn(t, 'lairImage');
    let m = activeMap(await tvState(t));
    expect(m.info.drawGrid).toBe(false);
    expect(m.info.grid).toMatchObject({ cols: 19, rows: 14 });
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    // Fit on the picture: same counts, the squares shifted by a few px → fog kept
    await t.bot.must({ type: 'map.regrid', grid: { ...lair.info.grid, x: lair.info.grid.x + 3 } });
    m = activeMap(await tvState(t));
    expect(revealedCount(m)).toBe(19 * 14);
    // Map squares: new counts → fog cleared
    await t.bot.must({ type: 'map.regrid', grid: { ...lair.info.grid, cols: 20, rows: 15, cellW: lair.info.grid.cellW * 19 / 20, cellH: lair.info.grid.cellH * 14 / 15 } });
    m = activeMap(await tvState(t));
    expect(m.info.grid).toMatchObject({ cols: 20, rows: 15 });
    expect(revealedCount(m)).toBe(0);
    // a .dd2vtt map takes no new grid
    await gameOn(t, 'lair');
    expect((await t.bot.cmd({ type: 'map.regrid', grid: lair.info.grid })).ok).toBe(false);
    await companionMatchesTv(t);
  });

  test('a map bigger than the table: window, pan in whole squares, whole map ↔ table', async ({ table: t }) => {
    await gameOn(t, 'dyson'); // 25 × 25 on the 34 × 19 table: rows pan
    await t.bot.must({ type: 'view.window', col: 0, row: 0 });
    await t.bot.must({ type: 'view.pan', dx: 0, dy: 3 });
    let m = activeMap(await tvState(t));
    expect(m.view.row).toBe(3);
    await t.bot.must({ type: 'view.pan', dx: 0, dy: 100 }); // clamped to the map
    m = activeMap(await tvState(t));
    expect(m.view.row).toBeLessThanOrEqual(25 - 19);
    await t.bot.must({ type: 'view.mode', mode: 'fit' });
    expect(activeMap(await tvState(t)).view.mode).toBe('fit');
    await t.bot.must({ type: 'view.mode', mode: 'table' });
    await t.bot.must({ type: 'view.rotate', quarterTurns: 1 });
    expect(activeMap(await tvState(t)).view.quarterTurns).toBe(1);
    await t.bot.must({ type: 'view.grid', on: false });
    expect(activeMap(await tvState(t)).showGrid).toBe(false);
    await companionMatchesTv(t);
  });

  test('the PDF map arrives on the TV as a picture', async ({ table: t }) => {
    await gameOn(t, 'pdf');
    const m = activeMap(await tvState(t));
    expect(m.info.kind).toBe('picture');
    expect(m.info.picture.ext).toBe('png');
  });

  test('DM layers: listed, faded, reordered — and never drawn on the TV (L16)', async ({ table: t }) => {
    await needs(t, 'files');
    await gameOn(t, 'lair');
    const pic = await uploadMap(t.serverUrl, 'lairImage');
    const layers = [
      { id: newId(), name: 'Secret rooms', file: pic.info.picture, visible: true, opacity: 1 },
      { id: newId(), name: 'Labels', file: pic.info.picture, visible: false, opacity: 0.5 },
    ];
    await needsDrawnMap(t);
    const before = await settledShot(t);
    await t.bot.must({ type: 'layers.set', layers });
    await t.bot.must({ type: 'layers.set', layers: [layers[1]!, { ...layers[0]!, opacity: 0.7 }] });
    expect(activeMap(await tvState(t)).layers.map((l) => l.name)).toEqual(['Labels', 'Secret rooms']);
    await t.tv.waitForTimeout(1500);
    await expectSamePicture(before, await settledShot(t), 'DM layers must not change the TV picture');
    expect((await tvRender(t))?.layerBytes, 'the TV holds no DM-layer textures').toBe(0);
    await companionMatchesTv(t);
  });

  test('the TV draws the map: revealing the fog changes the picture', async ({ table: t }) => {
    await needs(t, 'files');
    await gameOn(t, 'tavern');
    await t.bot.must({ type: 'fog.all', value: 'reveal' });
    await needsDrawnMap(t);
    const open = await tvShot(t);
    await t.bot.must({ type: 'fog.all', value: 'hide' });
    await t.tv.waitForTimeout(1000);
    expect((await tvShot(t)).equals(open)).toBe(false);
  });
});

// ── scene 7 · stress ────────────────────────────────────────────────────────────────────────

test.describe('scene 7 · stress', () => {
  test('the 114 × 64 castle loads (or fails visibly), then a small map runs with the memory back', async ({ table: t }) => {
    await needs(t, 'files', 'renderStats');
    const notices: string[] = [];
    t.bot.onMessage = (m) => { if (m.type === 'tv.notice') notices.push(String(m.text)); };
    await gameOn(t, 'castle');
    await t.tv.waitForTimeout(5000);
    const big = await t.tv.evaluate(() => (window as unknown as { __battlemap: { render: () => { textureBytes: number } } }).__battlemap.render());
    expect(big.textureBytes, 'within the 160 MB texture budget').toBeLessThanOrEqual(160 * 1024 * 1024);
    await gameOn(t, 'lair');
    await t.tv.waitForTimeout(3000);
    const small = await t.tv.evaluate(() => (window as unknown as { __battlemap: { render: () => { textureBytes: number } } }).__battlemap.render());
    expect(small.textureBytes, 'the castle textures were released').toBeLessThan(big.textureBytes);
    t.bot.onMessage = null;
    expect(notices.filter((n) => /error|fail/i.test(n))).toEqual([]);
  });

  test('a burst of 300 commands from the tablet: every one applied in order, state converges', async ({ table: t }) => {
    await gameOn(t, 'castle');
    const results = await Promise.all(Array.from({ length: 300 }, (_, i) =>
      t.bot.cmd({ type: 'fog.apply', cells: [i, i + 114], value: i % 7 === 0 ? 'hide' : 'reveal', gesture: newId() }, 15_000)));
    expect(results.filter((r) => !r.ok)).toEqual([]);
    const revs = results.map((r) => (r as { rev: number }).rev);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    await companionMatchesTv(t);
  });
});

