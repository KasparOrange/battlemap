/**
 * What the DM prepares to show later (roadmap S7, S9): **reveal areas** — named sets of squares
 * ("the crypt", "behind the secret door") that one tap reveals or hides — and **secrets** — secret
 * doors, hidden marks and traps the players don't see until the DM marks them found (a trap:
 * sprung). Both live per map (`MapPlay.areas`, `MapPlay.secrets`), optional on the wire so maps
 * stored before them read as none.
 *
 * The TV holds them (it is the authority) but the players' view draws only found secrets, and
 * never a note; {@link playersState} is the state with every unfound secret, every note and the
 * areas taken out — what any player-facing copy (a player view, a thumbnail) is built from.
 *
 * @see ../../../docs/features.md "Prepared reveal areas", "Secret doors and traps"
 */
import * as v from 'valibot';
import { Count, Id, Int, Mask, Name } from './basics.ts';
import type { MapPlay } from './game.ts';
import type { RootState } from './root.ts';

/** Most reveal areas one map keeps. */
export const MAX_AREAS = 64;

/** Most secrets one map keeps. */
export const MAX_SECRETS = 128;

/** Longest DM note on a secret. */
export const MAX_SECRET_NOTE = 500;

/**
 * A prepared reveal area: a name and its squares. Drawn in prep (an outline turned into squares,
 * or painted square by square); `area.reveal` reveals or hides all of it in one tap. Whether it
 * is revealed is not stored — it is read from the fog (all, some or none of its squares).
 */
export const RevealArea = v.object({
  /** Made by the companion that drew it. */
  id: Id,
  /** "The crypt" (may be empty: the list says "Area 3"). */
  name: Name,
  /** Its squares, a fog-sized bit mask of the map. */
  cells: Mask,
});
/** A reveal area; see the schema of the same name. */
export type RevealArea = v.InferOutput<typeof RevealArea>;

/** A secret door, a hidden mark (a lever, loot, a clue) or a trap. */
export const SecretKind = v.picklist(['door', 'mark', 'trap']);
/** The kind of a secret; see the schema of the same name. */
export type SecretKind = v.InferOutput<typeof SecretKind>;

/**
 * A secret on a map. Until it is `found` (a trap: sprung) the players' view draws nothing of it;
 * a found secret door shows its door leaf, a found mark or a sprung trap its mark. The DM sees
 * every secret, with its note.
 */
export const Secret = v.object({
  /** Made by the companion that placed it. */
  id: Id,
  /** Door, mark or trap. */
  kind: SecretKind,
  /** "Lever behind the tapestry" (may be empty: the list says "Secret door 2"). */
  name: Name,
  /** The DM's note ("DC 15 to spot, 2d6 piercing") — never shown to the players. */
  note: v.pipe(v.string(), v.maxLength(MAX_SECRET_NOTE)),
  /** Column of its square. */
  col: Int,
  /** Row of its square. */
  row: Int,
  /**
   * A secret door that is one of the map's own doors (`.dd2vtt`): its index in the geometry.
   * Null for a door battlemap draws on the square (picture maps) and for marks and traps.
   */
  door: v.nullable(Count),
  /** A drawn door's leaf runs top to bottom (true) or left to right (false). */
  vertical: v.boolean(),
  /** The effect catalogue entry that plays when it is found or sprung (an `assets/` id), or null. */
  effect: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  /** Found (door, mark) or sprung (trap): the players see it. */
  found: v.boolean(),
});
/** A secret; see the schema of the same name. */
export type Secret = v.InferOutput<typeof Secret>;

/**
 * A map's reveal areas (none for maps stored before they existed).
 *
 * @param map - the map's play state
 * @returns its areas
 */
export function areasOf(map: MapPlay): RevealArea[] {
  return map.areas ?? [];
}

/**
 * A map's secrets (none for maps stored before they existed).
 *
 * @param map - the map's play state
 * @returns its secrets
 */
export function secretsOf(map: MapPlay): Secret[] {
  return map.secrets ?? [];
}

/**
 * What the players may know of a map's secrets: the found ones, without their notes.
 *
 * @param map - the map's play state
 * @returns the found secrets, notes emptied
 */
export function foundSecrets(map: MapPlay): Secret[] {
  return secretsOf(map).filter((s) => s.found).map((s) => (s.note ? { ...s, note: '' } : s));
}

/**
 * The door indices of a map that are secret doors not found yet — the players' view draws no
 * leaf for them, whatever their open state.
 *
 * @param map - the map's play state
 * @returns the hidden door indices
 */
export function hiddenDoors(map: MapPlay): Set<number> {
  const out = new Set<number>();
  for (const s of secretsOf(map)) if (s.kind === 'door' && !s.found && s.door !== null) out.add(s.door);
  return out;
}

/**
 * The state as the players may know it: every map's unfound secrets and all notes taken out, the
 * DM's reveal areas emptied. Unchanged maps keep their objects.
 *
 * @param root - the full state (the TV's, the companion's)
 * @returns the players' copy
 */
export function playersState(root: RootState): RootState {
  const game = root.game;
  if (!game) return root;
  let changed = false;
  const maps: Record<string, MapPlay> = {};
  for (const [id, map] of Object.entries(game.maps)) {
    const all = secretsOf(map);
    const found = foundSecrets(map);
    const strip = areasOf(map).length > 0 || found.length !== all.length || found.some((s, i) => s !== all[i]);
    if (!strip) {
      maps[id] = map;
      continue;
    }
    changed = true;
    maps[id] = { ...map, areas: [], secrets: found };
  }
  return changed ? { ...root, game: { ...game, maps } } : root;
}
