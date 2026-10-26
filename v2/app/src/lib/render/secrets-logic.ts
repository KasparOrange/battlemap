/**
 * What the secrets layer draws per view (roadmap S9, docs/features.md "Secret doors and traps") —
 * pure, no Pixi, tested in `secrets-logic.test.ts`.
 *
 * - **Players' view (TV):** only found secrets — a found secret door as a closed wooden leaf
 *   (a door battlemap draws on its square, or one of the map's own doors when the map doesn't
 *   draw its doors anyway), a found mark as a small gold sigil, a sprung trap as a red warning
 *   glyph. Unfound secrets give nothing away.
 * - **DM's view:** every secret as its kind's glyph on its square (a map door's: at the doorway's
 *   middle) — hollow while hidden from the players, filled once found.
 */
import type { MapGeometry, MapPlay, Secret, SecretKind } from '@battlemap/shared';

/** A door leaf to draw: hinge and free end, in squares. */
export interface LeafLine {
  /** Hinge x. */
  ax: number;
  /** Hinge y. */
  ay: number;
  /** Free end x. */
  bx: number;
  /** Free end y. */
  by: number;
}

/** One thing the secrets layer draws. */
export interface SecretMark {
  /** The secret. */
  id: string;
  /** Door, mark or trap. */
  kind: SecretKind;
  /** Centre x of its glyph, squares. */
  x: number;
  /** Centre y of its glyph, squares. */
  y: number;
  /** Found (door, mark) or sprung (trap). */
  found: boolean;
  /** A found door on the players' view: the leaf (no glyph then). */
  leaf: LeafLine | null;
}

/**
 * The leaf of a door battlemap draws on a square: through the square's middle, across (left to
 * right) or down (top to bottom), one square long.
 *
 * @param s - the secret
 * @returns the leaf in squares
 */
export function squareLeaf(s: Pick<Secret, 'col' | 'row' | 'vertical'>): LeafLine {
  return s.vertical
    ? { ax: s.col + 0.5, ay: s.row, bx: s.col + 0.5, by: s.row + 1 }
    : { ax: s.col, ay: s.row + 0.5, bx: s.col + 1, by: s.row + 0.5 };
}

/**
 * What to draw for a map's secrets on one view.
 *
 * @param map - the map's play state (null: nothing)
 * @param dm - the DM's view (every secret) or the players' (found ones only)
 * @param geometry - the map's walls and doors (null while loading or for picture maps)
 * @returns the marks, in the map's order
 */
export function secretMarks(map: Pick<MapPlay, 'secrets' | 'info'> | null, dm: boolean, geometry: MapGeometry | null): SecretMark[] {
  const out: SecretMark[] = [];
  for (const s of map?.secrets ?? []) {
    if (!dm && !s.found) continue;
    const door = s.kind === 'door' && s.door !== null ? (geometry?.doors[s.door] ?? null) : null;
    if (s.kind === 'door' && s.door !== null && !door && !dm) continue; // geometry not there yet
    const x = door ? (door.a.x + door.b.x) / 2 : s.col + 0.5;
    const y = door ? (door.a.y + door.b.y) / 2 : s.row + 0.5;
    let leaf: LeafLine | null = null;
    if (!dm && s.kind === 'door') {
      if (door) {
        if (map!.info.drawDoors) continue; // the doors layer draws its leaf, no longer hidden
        leaf = { ax: door.a.x, ay: door.a.y, bx: door.b.x, by: door.b.y };
      } else leaf = squareLeaf(s);
    }
    out.push({ id: s.id, kind: s.kind, x, y, found: s.found, leaf });
  }
  return out;
}
