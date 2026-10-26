/**
 * One v1 map file → an uploaded v2 map. Runs the companion's own import pipeline
 * (`app/src/lib/import`: `.dd2vtt` parse, walls/doors/lights in squares, table copy ≤ 72 px per
 * square, 288 px thumbnail) with sharp as the picture engine instead of the browser, so an
 * imported map is exactly what the tablet would have made from the same file. Only the squares
 * of a picture map come from v1 (its `rasterGrid` or its counts), never from detection: v1's fog
 * cells are numbered on v1's squares.
 */
import { gridForPicture, wholeGrid, type FileRef, type RasterGrid } from '../../shared/src/index.ts';
import { ImportError } from '../../app/src/lib/import/errors.ts';
import { runImport, type ImportDeps } from '../../app/src/lib/import/pipeline.ts';
import { preparePicture, prepareUvtt, remakeTableCopy } from '../../app/src/lib/import/prepare.ts';
import { sharpBackend } from '../../app/src/lib/import/test/sharp-backend.ts';
import type { Logger } from '../../app/src/lib/log.ts';
import type { ConvertedMap } from './convert.ts';
import type { V1RasterGrid } from './v1.ts';
import type { V2Server } from './v2-server.ts';

/** What a v1 map is, as far as converting its file goes. */
export interface V1MapSpec {
  /** The v2 map id to give it (the shared library id when it has one, else v1's map id). */
  id: string;
  /** Its name. */
  name: string;
  /** `.dd2vtt`/`.uvtt` or a picture (a PDF arrives rendered by the TV, as a picture). */
  kind: 'uvtt' | 'picture';
  /** Picture maps: v1's squares across. */
  cols: number;
  /** Picture maps: v1's squares down. */
  rows: number;
  /** Picture maps: where v1's squares lie on the picture, if set by hand or detected. */
  rasterGrid: V1RasterGrid | null;
  /** Whether battlemap draws grid lines (v1: null = yes). */
  drawGrid: boolean;
  /** The shared library entry this map is (v2 `libraryId`), or null. */
  libraryId: string | null;
}

/** A converted map with its thumbnail (for the shared library). */
export interface PreparedMap extends ConvertedMap {
  /** The 288 px thumbnail on the server, or null. */
  thumb: FileRef | null;
}

/**
 * v1's picture grid in v2's shape, fitted to the picture actually received (v1 does the same,
 * `RasterGrid.forPicture`). Null when it is unusable.
 *
 * @param g - v1's grid
 * @param width - the picture's width
 * @param height - its height
 * @returns the grid, or null
 */
export function v1RasterGrid(g: V1RasterGrid | null | undefined, width: number, height: number): RasterGrid | null {
  if (!g) return null;
  const ok = [g.x, g.y, g.w, g.h, g.pw, g.ph].every((n) => typeof n === 'number' && Number.isFinite(n))
    && g.w > 0 && g.h > 0 && g.pw > 0 && g.ph > 0 && Number.isInteger(g.cols) && Number.isInteger(g.rows) && g.cols >= 1 && g.rows >= 1;
  if (!ok) return null;
  return gridForPicture({ x: g.x, y: g.y, cellW: g.w, cellH: g.h, cols: g.cols, rows: g.rows, pictureW: g.pw, pictureH: g.ph }, width, height);
}

/** The file extension a picture's first bytes say. */
function pictureExt(head: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpg';
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && head[8] === 0x57 && head[9] === 0x45) return 'webp';
  return null;
}

/**
 * Converts one v1 map file and uploads its files to the v2 server.
 *
 * @param bytes - the map file (`.dd2vtt` JSON, or a PNG/JPEG/WebP picture)
 * @param spec - what v1 knows about the map
 * @param server - the v2 server
 * @param log - the logger
 * @returns the map (with v1's pixels per square) and its thumbnail
 * @throws ImportError (picture damaged, unsupported, upload failed) or Error when sharp is missing
 */
export async function prepareMap(bytes: Uint8Array, spec: V1MapSpec, server: V2Server, log: Logger): Promise<PreparedMap> {
  const backend = sharpBackend();
  if (!backend) throw new Error('sharp is not installed — run `bun install` in v2/server');
  let fileName: string;
  if (spec.kind === 'uvtt') fileName = 'map.dd2vtt';
  else {
    const ext = pictureExt(bytes.subarray(0, 16));
    if (!ext) throw new ImportError('unsupported', 'not a PNG, JPEG or WebP picture');
    fileName = `map.${ext}`;
  }
  const deps: ImportDeps = {
    upload: async (blob, opts) => (await server.uploadFile(blob, opts.ext)) as Awaited<ReturnType<ImportDeps['upload']>>,
    work: async <T>(job: Parameters<ImportDeps['work']>[0], onStep: Parameters<ImportDeps['work']>[1]): Promise<T> => {
      switch (job.op) {
        case 'uvtt':
          return (await prepareUvtt(job.file, backend, onStep)) as T;
        case 'picture':
          return (await preparePicture(job.file, job.name, backend, onStep)) as T;
        case 'tableCopy':
          return (await remakeTableCopy(job.picture, job.grid, backend)) as T;
        default:
          throw new ImportError('internal', `the v1 import does not run "${job.op}" jobs`);
      }
    },
    renderPdf: () => Promise.reject(new ImportError('pdf', 'a PDF map comes rendered from the v1 TV')),
    log,
    now: () => performance.now(),
  };
  const file = new File([bytes as Uint8Array<ArrayBuffer>], fileName);
  const read = await runImport(file, undefined, deps);
  let grid = read.draft.grid;
  if (spec.kind === 'picture') {
    const { pictureW, pictureH } = read.draft.grid;
    grid = v1RasterGrid(spec.rasterGrid, pictureW, pictureH) ?? wholeGrid(Math.max(1, spec.cols), Math.max(1, spec.rows), pictureW, pictureH);
  }
  const { map, thumb } = await read.upload({ grid, drawGrid: spec.drawGrid, format: 'asis' });
  const info = { ...map, id: spec.id, name: spec.name.slice(0, 200) || map.name, libraryId: spec.libraryId };
  // v1's world pixels per square: a .dd2vtt's pixels_per_grid, a picture's rounded square width
  const ppg = spec.kind === 'uvtt' ? grid.cellW : Math.max(1, Math.round(grid.cellW));
  log.info('import-v1', 'Map converted', { id: spec.id, name: info.name, kind: info.kind, squares: `${grid.cols}x${grid.rows}`, doors: info.doorCount, ppg, picture: info.picture.bytes, tableCopy: info.tableCopy?.bytes ?? null });
  return { info, ppg, thumb };
}
