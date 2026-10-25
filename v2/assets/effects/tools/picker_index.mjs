#!/usr/bin/env bun
/**
 * Writes `assets/effects/picker.json` — the compact catalogue the companion's Effects tab
 * browses (docs/effects.md "The Effects tab"). It reads every `<id>/effect.json` and keeps what
 * the picker needs without loading 150 manifests: name, group, D&D tags, the thumbnail, whether
 * it plays once, its size in squares, tint and the spell shape it takes on the grid.
 *
 * The D&D shapes and sizes below are battlemap's curation (spell texts, PHB 2014/2024): a
 * Fireball is a 20 ft radius sphere, Burning Hands a 15 ft cone, Lightning Bolt a 100 ft line.
 * Effects not listed get a circle as wide as their art.
 *
 * Run: `bun v2/assets/effects/tools/picker_index.mjs` (after `build.py`, whenever effects change).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The spell shapes: `shape` (circle = radius, cone = length, line = length, cube = side, all in
 * feet) and `shapes` the DM may switch between. Width of lines: `width` feet (default 5).
 */
const SHAPES = {
  fireball: { shape: 'circle', feet: 20 },
  'burning-hands': { shape: 'cone', feet: 15 },
  'breath-fire-cone': { shape: 'cone', feet: 30 },
  'breath-lightning-line': { shape: 'line', feet: 30 },
  'cone-of-cold': { shape: 'cone', feet: 60 },
  thunderwave: { shape: 'cube', feet: 15 },
  shatter: { shape: 'circle', feet: 10 },
  darkness: { shape: 'circle', feet: 15 },
  'fog-cloud': { shape: 'circle', feet: 20 },
  cloudkill: { shape: 'circle', feet: 20 },
  'black-tentacles': { shape: 'cube', feet: 20 },
  'plant-growth': { shape: 'circle', feet: 20 },
  'call-lightning': { shape: 'circle', feet: 5 },
  'ice-spikes': { shape: 'circle', feet: 10 },
  'wall-of-fire-line': { shape: 'line', feet: 60 },
  'wall-of-fire-ring': { shape: 'circle', feet: 10 },
  'wall-of-force': { shape: 'circle', feet: 10 },
  eruption: { shape: 'cube', feet: 20 },
  'lightning-bolt': { shape: 'line', feet: 100 },
  'fire-bolt': { shape: 'line', feet: 30, beam: true },
  'ray-of-frost': { shape: 'line', feet: 30, beam: true },
  'eldritch-blast': { shape: 'line', feet: 30, beam: true },
  'magic-missile': { shape: 'line', feet: 30, beam: true },
  'gust-of-wind': { shape: 'line', feet: 60, width: 10 },
  'scorched-earth': { shape: 'circle', feet: 15 },
  web: { shape: 'cube', feet: 20 },
  vines: { shape: 'cube', feet: 20 },
  'spike-growth': { shape: 'circle', feet: 20 },
  'hunger-of-hadar': { shape: 'circle', feet: 20 },
  'moonlight-pool': { shape: 'circle', feet: 5 },
  'holy-light': { shape: 'circle', feet: 10 },
  'smoke-cloud': { shape: 'circle', feet: 10 },
  'poison-cloud': { shape: 'circle', feet: 10 },
  'frost-patch': { shape: 'circle', feet: 10 },
  'acid-pool': { shape: 'circle', feet: 5 },
  'explosion-smoky': { shape: 'circle', feet: 10 },
  'explosion-fiery': { shape: 'circle', feet: 5 },
  'dust-burst': { shape: 'circle', feet: 10 },
  'ground-crack-impact': { shape: 'circle', feet: 5 },
  'water-pool': { shape: 'cube', feet: 20 },
  'lava-pool': { shape: 'cube', feet: 20 },
  'spirit-guardians': { shape: 'circle', feet: 15 },
};

/** Map-loop effects that cover an area rather than sitting at a spot. */
const AREA_LOOPS = new Set(['water-pool', 'lava-pool', 'fog-patch', 'lava-cracks', 'web-corner', 'fireflies', 'fireflies-cc0', 'sparkle-area', 'flames-patch']);

/** The weather the Effects tab offers as switches, in order, with the param that is "intensity". */
const WEATHER = {
  rain: { param: 'uDensity', order: 1 },
  'rain-storm': { param: 'uDensity', order: 2 },
  snow: { param: 'uDensity', order: 3 },
  blizzard: { param: 'uDensity', order: 4 },
  mist: { param: 'uDensity', order: 5 },
  'fog-thick': { param: 'uDensity', order: 6 },
  embers: { param: 'intensity', order: 7 },
  night: { param: 'uDarkness', order: 8 },
  'lightning-storm': { param: 'uStrength', order: 9 },
  underwater: { param: 'uStrength', order: 10 },
  sandstorm: { param: 'uDensity', order: 11 },
  'ash-fall': { param: 'intensity', order: 12 },
  'falling-leaves': { param: 'intensity', order: 13 },
  'dust-motes': { param: 'intensity', order: 14 },
  'cloud-shadows': { param: 'opacity', order: 15 },
  'heat-haze': { param: 'opacity', order: 16 },
  'bad-omen': { param: 'opacity', order: 17 },
  'wind-streams': { param: 'opacity', order: 18 },
};

/** Whether a manifest plays once (as `app/src/lib/effects/manifest.ts` `isOneShot`). */
function oneShot(m, all) {
  switch (m.technique) {
    case 'sheet': return !m.sheet?.loop;
    case 'texture': return Boolean(m.motion?.once);
    case 'particles': return Boolean(m.particles?.burst) && !m.particles?.rate;
    case 'composite': return (m.parts ?? []).every((p) => (all.get(p.id) ? oneShot(all.get(p.id), all) : false));
    default: return false;
  }
}

/** How long a one-shot plays, seconds (0 for loops). */
function seconds(m) {
  if (m.technique === 'sheet' && m.sheet?.fps && m.sheet.frames?.length) return +(m.sheet.frames.length / m.sheet.fps).toFixed(2);
  if (m.technique === 'texture') return m.motion?.once ?? 0;
  if (m.technique === 'particles') return m.particles?.life?.[1] ?? 0;
  return 0;
}

const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'));
const manifests = new Map(index.effects.map((e) => [e.id, JSON.parse(readFileSync(join(ROOT, e.manifest), 'utf8'))]));

const out = [];
for (const e of index.effects) {
  const m = manifests.get(e.id);
  const once = oneShot(m, manifests);
  const size = m.size ? { w: +m.size.w.toFixed(2), h: +m.size.h.toFixed(2) } : null;
  const squares = m.squares ?? (size ? Math.max(size.w, size.h) : 1);
  let group;
  if (m.category === 'global') group = 'weather';
  else if (m.category === 'aura') group = 'aura';
  else if (once) group = 'cast';
  else if (m.category === 'regional' || AREA_LOOPS.has(e.id)) group = 'area';
  else group = 'life';
  const fit = SHAPES[e.id] ?? (group === 'cast' || group === 'area' ? { shape: 'circle', feet: Math.max(5, Math.round((squares * 5) / 2 / 5) * 5) } : null);
  const strip = existsSync(join(ROOT, e.id, 'strip.webp')) ? `${e.id}/strip.webp` : null;
  out.push({
    id: e.id,
    name: e.name,
    category: m.category,
    group,
    technique: m.technique,
    once,
    seconds: once ? seconds(m) : 0,
    tags: e.tags ?? [],
    damage: e.damage ?? [],
    spells: e.spells ?? [],
    thumb: e.thumb,
    strip,
    squares: +squares.toFixed(2),
    size,
    tint: Boolean(m.tint),
    layer: m.layer ?? 'air',
    beam: Boolean(m.beam),
    shape: fit?.shape ?? null,
    feet: fit?.feet ?? null,
    width: fit?.width ?? null,
    weather: WEATHER[e.id] ?? null,
    gpuBytes: e.gpuBytes ?? 0,
    commercial: Boolean(e.commercial),
  });
}

writeFileSync(join(ROOT, 'picker.json'), JSON.stringify({ version: 1, count: out.length, effects: out }) + '\n');
const by = {};
for (const e of out) by[e.group] = (by[e.group] ?? 0) + 1;
console.log(`picker.json: ${out.length} effects`, by);
