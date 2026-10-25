/**
 * fetch-test-maps — downloads the realistic test-map set into the repo's `test_assets/maps/`
 * (gitignored; parity QA-04, the port of the old `tools/fetch_test_maps.py`, same files, same
 * names, so both apps test against one set). The maps are other people's work (public GitHub
 * repos without a licence, Dyson Logos' blog maps), fetched for local testing, never committed.
 * Two picture maps are cut out of `.dd2vtt` files, so the picture path gets full-colour maps with
 * a known grid.
 *
 *   bun tools/fetch-test-maps.ts                  # download what is missing
 *   bun tools/fetch-test-maps.ts --push <serial>  # also adb push them to the device's Download/
 *
 * The walls of the vampire lair and the castle are already extracted into
 * `shared/test/maps/*.json` for the wall tests, so `bun test` never needs this.
 *
 * @see ../../docs/test-session.md for what each map tests
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ args: Bun.argv.slice(2), options: { push: { type: 'string' } } });

const REPO = join(import.meta.dirname, '..', '..');
const OUT = join(REPO, 'test_assets', 'maps');
const RAW = 'https://raw.githubusercontent.com';
const LFS = 'https://media.githubusercontent.com/media';

/** File name (carries the grid size) → where it comes from. */
const MAPS: readonly [string, string][] = [
  ['01-eldrica-house-10x8.dd2vtt', `${RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/dom_eldrica.dd2vtt`],
  ['02-small-home-16x18.uvtt', `${RAW}/mixtli/dungeon-lab/main/data/maps/Small-Home-16x18-L01-nogrid-lights.uvtt`],
  ['03-przerzut-16x16.dd2vtt', `${RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/przerzut.dd2vtt`],
  ['04-vampire-lair-19x14.dd2vtt', `${RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/vampiry.dd2vtt`],
  ['05-tower-ground-11x11.dd2vtt', `${RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/tower_floor_0.dd2vtt`],
  ['06-tower-upper-11x11.dd2vtt', `${RAW}/MasterCoookie/DND_Dreams/master/D%26D/Mapy/tower_floor_1.dd2vtt`],
  ['07-STRESS-castle-114x64-30MB.dd2vtt', `${LFS}/guebertn/DNDMaps/main/champ/map.dd2vtt`],
  ['09-dyson-twelve-goats-tavern-6000px.png', 'https://dysonlogos.blog/wp-content/uploads/2019/05/twelve-goats-tavern-grid.png'],
];

/** Picture maps cut out of a downloaded `.dd2vtt`: source → target name without extension. */
const EXTRACT: readonly [string, string][] = [
  ['04-vampire-lair-19x14.dd2vtt', '08a-vampire-lair-image-19x14'],
  ['02-small-home-16x18.uvtt', '08b-small-home-image-16x18'],
];

/** Fetches `url` into `OUT/name` unless it is there already. */
async function download(name: string, url: string, i: number): Promise<void> {
  const target = join(OUT, name);
  const tag = `[${i + 1}/${MAPS.length}]`;
  if (existsSync(target) && statSync(target).size > 1024) {
    process.stdout.write(`${tag} have ${name}\n`);
    return;
  }
  process.stdout.write(`${tag} get  ${name}\n`);
  const r = await fetch(url, { headers: { 'user-agent': 'battlemap-test-maps' }, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  writeFileSync(target, new Uint8Array(await r.arrayBuffer()));
}

/** Writes the embedded picture of a `.dd2vtt` as a plain image file. */
function extractImage(source: string, stem: string): void {
  const data = JSON.parse(readFileSync(join(OUT, source), 'utf8')) as { image: string };
  const raw = Buffer.from(data.image, 'base64');
  const ext = raw[0] === 0x89 && raw.subarray(1, 4).toString() === 'PNG' ? 'png' : raw.subarray(8, 12).toString() === 'WEBP' ? 'webp' : 'jpg';
  writeFileSync(join(OUT, `${stem}.${ext}`), raw);
  process.stdout.write(`cut  ${stem}.${ext}\n`);
}

mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const [i, [name, url]] of MAPS.entries()) {
  try {
    await download(name, url, i);
  } catch (e) {
    failed++;
    process.stderr.write(`failed ${name}: ${e instanceof Error ? e.message : String(e)}\n`);
  }
}
for (const [source, stem] of EXTRACT) if (existsSync(join(OUT, source))) extractImage(source, stem);

if (args.push) {
  const files = readdirSync(OUT).map((f) => join(OUT, f));
  for (const f of files) {
    const p = Bun.spawnSync(['adb', '-s', args.push, 'push', f, '/sdcard/Download/']);
    if (p.exitCode !== 0) throw new Error(`adb push ${f}: ${p.stderr.toString()}`);
  }
  process.stdout.write(`pushed ${files.length} files to ${args.push}:/sdcard/Download/\n`);
}
process.exit(failed ? 1 : 0);
