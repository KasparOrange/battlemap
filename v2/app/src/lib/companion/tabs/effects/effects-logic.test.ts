/**
 * The Effects tab's logic: shapes → squares, snapping, the browser's filters, favourites and
 * recent, and the commands it builds.
 */
import { describe, expect, test } from 'bun:test';
import { check, OneShot, PlacedEffect } from '@battlemap/shared';
import { browse, damageIn, matches, parseCatalog, sizeWords, type PickerEffect } from './catalog.ts';
import { areaFor, auraFor, columnName, effectAt, isWeather, moved, screenShot, shotFor, spotFor, weatherFor, weatherParam, whereWords } from './commands.ts';
import { pushRecent, quickStrip, readIds, toggleFavourite } from './prefs.ts';
import { aimAt, aimContains, angleTo, coveredSquares, feetToSquares, shapesFor, snapOrigin, type Aim } from './shapes.ts';

function fx(over: Partial<PickerEffect>): PickerEffect {
  return {
    id: 'x', name: 'X', category: 'regional', group: 'cast', technique: 'sheet', once: true, seconds: 2, tags: [], damage: [], spells: [],
    thumb: 'x/thumb.webp', strip: null, squares: 4, size: { w: 4, h: 4 }, tint: false, layer: 'air', beam: false, shape: 'circle', feet: 10,
    width: null, weather: null, gpuBytes: 0, commercial: true, ...over,
  };
}

const fireball = fx({ id: 'fireball', name: 'Fireball', damage: ['fire'], spells: ['Fireball', 'Meteor Swarm'], tags: ['explosion'], feet: 20 });
const cloudkill = fx({ id: 'cloudkill', name: 'Cloudkill', group: 'area', once: false, damage: ['poison'], feet: 20 });
const torch = fx({ id: 'wall-torch', name: 'Torch (flame + light)', group: 'life', once: false, shape: null, feet: null, category: 'map-loop' });
const rain = fx({ id: 'rain', name: 'Rain', group: 'weather', category: 'global', technique: 'shader', once: false, weather: { param: 'uDensity', base: 0.55, order: 1 } });
const all = [fireball, cloudkill, torch, rain];

const circle = (feet: number, x = 10, y = 10): Aim => ({ shape: 'circle', origin: { x, y }, angle: 0, feet, widthFeet: 5 });

describe('shapes on the grid', () => {
  test('feet become squares', () => {
    expect(feetToSquares(20)).toBe(4);
    expect(feetToSquares(15)).toBe(3);
  });

  test('a 20 ft radius sphere covers the squares whose centre is inside', () => {
    const sq = coveredSquares(circle(20), 40, 40);
    // squares with centres within 4 of a grid corner: a symmetric disc of 52 squares
    expect(sq.length).toBe(52);
    expect(sq).toContainEqual([9, 9]);
    expect(sq).toContainEqual([6, 9]);
    expect(sq).not.toContainEqual([5, 9]);
  });

  test('a 10 ft cube covers exactly 2 × 2 squares, a 15 ft one 3 × 3', () => {
    const cube = (feet: number, at = { x: 5.3, y: 5.4 }): Aim => ({ shape: 'cube', origin: snapOrigin('cube', at, feet), angle: 0, feet, widthFeet: 5 });
    expect(coveredSquares(cube(10), 20, 20).length).toBe(4);
    expect(coveredSquares(cube(15), 20, 20).length).toBe(9);
    expect(coveredSquares(cube(15), 20, 20)).toContainEqual([5, 5]);
  });

  test('a 15 ft cone to the right covers squares in front of its apex only', () => {
    const cone: Aim = { shape: 'cone', origin: { x: 5, y: 5.5 }, angle: 0, feet: 15, widthFeet: 5 };
    const sq = coveredSquares(cone, 20, 20);
    // row 5: three squares; rows 4 and 6: the far square only (centres inside the 53° cone)
    expect(sq.length).toBe(5);
    expect(sq.every(([c]) => c >= 5 && c <= 7)).toBe(true);
    expect(sq).toContainEqual([7, 5]);
  });

  test('a 100 ft line 5 ft wide covers 20 squares along a row', () => {
    const line: Aim = { shape: 'line', origin: { x: 0, y: 3.5 }, angle: 0, feet: 100, widthFeet: 5 };
    const sq = coveredSquares(line, 40, 10);
    expect(sq.length).toBe(20);
    expect(sq.every(([, r]) => r === 3)).toBe(true);
  });

  test('coverage is clipped to the map', () => {
    expect(coveredSquares(circle(20, 0, 0), 10, 10).length).toBe(13);
  });

  test('snapping: circles on grid corners, odd cubes on square middles, cones on half squares', () => {
    expect(snapOrigin('circle', { x: 3.4, y: 7.6 }, 20)).toEqual({ x: 3, y: 8 });
    expect(snapOrigin('cube', { x: 3.4, y: 7.6 }, 15)).toEqual({ x: 3.5, y: 7.5 });
    expect(snapOrigin('cube', { x: 3.4, y: 7.6 }, 10)).toEqual({ x: 3, y: 8 });
    expect(snapOrigin('cone', { x: 3.3, y: 7.8 }, 15)).toEqual({ x: 3.5, y: 8 });
  });

  test('directions snap to 15° near a step', () => {
    expect(angleTo({ x: 0, y: 0 }, { x: 10, y: 0.3 })).toBe(0);
    expect(angleTo({ x: 0, y: 0 }, { x: 0, y: 5 })).toBe(90);
    expect(angleTo({ x: 0, y: 0 }, { x: 10, y: 10 })).toBe(45);
    const free = angleTo({ x: 0, y: 0 }, { x: 10, y: 4 });
    expect(free).toBeGreaterThan(21);
    expect(free).toBeLessThan(22);
  });

  test('a first cone points at the map middle; later ones keep the last direction', () => {
    expect(aimAt('cone', 15, 5, { x: 2, y: 10 }, null, { x: 20, y: 10 }).angle).toBe(0);
    expect(aimAt('cone', 15, 5, { x: 2, y: 10 }, 90, { x: 20, y: 10 }).angle).toBe(90);
  });

  test('a tap on the rim of an aimed circle still counts as inside', () => {
    expect(aimContains(circle(20), { x: 14.1, y: 10 })).toBe(true);
    expect(aimContains(circle(20), { x: 14.5, y: 10 })).toBe(false);
  });

  test('shape choices keep cones and lines what they are', () => {
    expect(shapesFor('cone')).toEqual(['cone']);
    expect(shapesFor('line')).toEqual(['line']);
    expect(shapesFor('circle')).toEqual(['circle', 'cube']);
    expect(shapesFor(null)).toEqual(['circle', 'cube']);
  });
});

describe('the browser', () => {
  test('search finds by spell, damage and words, across groups, never weather', () => {
    expect(matches(fireball, 'meteor')).toBe(true);
    expect(matches(fireball, 'FIRE')).toBe(true);
    expect(matches(fireball, 'fire expl')).toBe(true);
    expect(matches(fireball, 'cold')).toBe(false);
    expect(browse(all, { group: 'life', query: 'cloud', damage: null }).map((e) => e.id)).toEqual(['cloudkill']);
    expect(browse(all, { group: 'cast', query: 'rain', damage: null })).toEqual([]);
  });

  test('without a search the group shows; a damage chip narrows', () => {
    expect(browse(all, { group: 'cast', query: '', damage: null }).map((e) => e.id)).toEqual(['fireball']);
    expect(browse(all, { group: 'area', query: '', damage: 'fire' })).toEqual([]);
    expect(damageIn(all)).toEqual(['fire', 'poison']);
  });

  test('size words', () => {
    expect(sizeWords(fireball)).toBe('20 ft · once');
    expect(sizeWords(torch)).toBe('4 sq');
  });

  test('a broken picker file is refused', () => {
    expect(() => parseCatalog({})).toThrow();
    expect(parseCatalog({ version: 1, effects: [fireball, { nope: 1 }] }).effects.length).toBe(1);
  });
});

describe('favourites and recent', () => {
  test('a star toggles; new ones go last', () => {
    expect(toggleFavourite([], 'a')).toEqual(['a']);
    expect(toggleFavourite(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleFavourite(['a'], 'b')).toEqual(['a', 'b']);
  });

  test('recent: newest first, no duplicates, capped', () => {
    let r: string[] = [];
    for (const id of ['a', 'b', 'c', 'a']) r = pushRecent(r, id, 3);
    expect(r).toEqual(['a', 'c', 'b']);
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });

  test('the quick strip: favourites, then recent not starred, known ids only', () => {
    const strip = quickStrip(['fireball', 'gone'], ['cloudkill', 'fireball'], (id) => id !== 'gone');
    expect(strip).toEqual([{ id: 'fireball', from: 'favourite' }, { id: 'cloudkill', from: 'recent' }]);
  });

  test('stored lists are read defensively', () => {
    expect(readIds('nope', 5)).toEqual([]);
    expect(readIds(['a', 3, 'a', '', 'b'], 5)).toEqual(['a', 'b']);
  });
});

describe('commands', () => {
  test('a fireball cast is a valid one-shot over a 32-gon of radius 4', () => {
    const shot = shotFor(fireball, circle(20), 'shot1', 1000, null);
    expect(check(OneShot, shot).ok).toBe(true);
    expect(shot.anchor.kind).toBe('region');
    expect(shot.params).toEqual({ shape: 'circle' });
    if (shot.anchor.kind === 'region') expect(shot.anchor.points.length).toBe(32);
  });

  test('a tint travels as color; particle effects get a point and a size', () => {
    const burst = fx({ id: 'hit-sparks', technique: 'particles' });
    const shot = shotFor(burst, circle(10, 3, 4), 's2', 1, '#ff0000');
    expect(shot.anchor).toEqual({ kind: 'point', x: 3, y: 4 });
    expect(shot.params).toEqual({ size: 4, color: '#ff0000' });
  });

  test('areas, spots, auras and weather are valid placed effects', () => {
    for (const p of [areaFor(cloudkill, circle(20), 'a1', null), spotFor(torch, { x: 2.5, y: 3.5 }, 't1', 1, null), auraFor(fireball, 'tok1', 'u1', 3, null), weatherFor(rain, 100)]) {
      expect(check(PlacedEffect, p).ok).toBe(true);
    }
    expect(isWeather(weatherFor(rain, 100))).toBe(true);
    expect(isWeather(areaFor(cloudkill, circle(20), 'a1', null))).toBe(false);
  });

  test('weather intensity scales the knob and stops at its cap', () => {
    expect(weatherParam(rain, 100)).toEqual({ uDensity: 0.55 });
    expect(weatherParam(rain, 50)).toEqual({ uDensity: 0.275 });
    expect(weatherParam(rain, 400)).toEqual({ uDensity: 1.6 });
  });

  test('flash, shake and fade use the built-in screen effects', () => {
    expect(screenShot('flash', 'f', 1).effect).toBe('screen-flash');
    expect(screenShot('shake', 's', 1).effect).toBe('screen-shake');
    expect(screenShot('fade', 'd', 1).params.color).toBe('#000000');
  });

  test('the effect under a finger: newest first; spots, areas and auras', () => {
    const area = areaFor(cloudkill, circle(20), 'a1', null);
    const spot = spotFor(torch, { x: 10.5, y: 10.5 }, 't1', 1, null);
    const tok = { id: 'tok1', label: '1', name: 'Thorin', color: '#ff0000', col: 2, row: 2, placed: true, hidden: false } as never;
    const aura = auraFor(fireball, 'tok1', 'u1', 3, null);
    expect(effectAt([area, spot], [], { x: 10.6, y: 10.4 })?.id).toBe('t1');
    expect(effectAt([area, spot], [], { x: 8, y: 10 })?.id).toBe('a1');
    expect(effectAt([area, spot], [], { x: 30, y: 30 })).toBeNull();
    expect(effectAt([aura], [tok], { x: 2.5, y: 2.2 })?.id).toBe('u1');
    expect(whereWords(aura, [tok])).toBe('On Thorin');
    expect(whereWords(spot, [])).toBe('At K11');
  });

  test('moving an area shifts every point', () => {
    const spot = spotFor(torch, { x: 1, y: 1 }, 't1', 1, null);
    expect(moved(spot, 2, 3).anchor).toEqual({ kind: 'point', x: 3, y: 4 });
    expect(columnName(0)).toBe('A');
    expect(columnName(26)).toBe('AA');
  });
});
