/**
 * Fixtures for the storage and api tests: file refs, maps and games. Not used by the app.
 */
import { newGame, type FileRef, type Game, type MapInfo } from '@battlemap/shared';

/**
 * A ref for some bytes (a fake hash that is unique per seed).
 *
 * @param seed - makes the hash
 * @param bytes - the size
 * @param ext - the kind
 * @returns the ref
 */
export function refFor(seed: string, bytes: number, ext: FileRef['ext'] = 'png'): FileRef {
  const hash = [...seed].map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(16, '0').slice(0, 64);
  return { hash, ext, bytes };
}

/**
 * A 4 × 3 map using `picture`.
 *
 * @param id - the map id
 * @param picture - its picture
 * @param geometry - its geometry file, if any
 * @returns the map
 */
export function mapWith(id: string, picture: FileRef, geometry: FileRef | null = null): MapInfo {
  return {
    id, name: `Map ${id}`, kind: geometry ? 'uvtt' : 'picture', picture, tableCopy: null, geometry,
    grid: { x: 0, y: 0, cellW: 10, cellH: 10, cols: 4, rows: 3, pictureW: 40, pictureH: 30 },
    drawGrid: true, doorCount: 0, drawDoors: false, libraryId: null,
  };
}

/**
 * A small game on one map.
 *
 * @param id - the game id
 * @param picture - the map's picture
 * @returns the game
 */
export function gameWith(id: string, picture = refFor('pic' + id, 5)): Game {
  return newGame({ id, name: `Game ${id}`, createdAt: '2026-10-25T10:00:00.000Z', map: mapWith('m-' + id, picture) });
}
