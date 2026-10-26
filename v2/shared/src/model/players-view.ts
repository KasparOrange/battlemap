/**
 * The players' view (roadmap S12): the state a players' page (a phone, a second screen) gets —
 * exactly what the TV shows, and nothing the DM keeps to themselves. The TV makes it with
 * {@link playersView} and sends it in `players.state`; the server delivers `players.*` messages
 * only to `players` clients and lets those send nothing but `players.request`, so the full
 * state never reaches a player's device.
 *
 * Taken out: every map but the one on the table; on that map the DM layers, hidden and unplaced
 * tokens, the fog preview, DM notes, reveal areas and unfound secrets (`playersState`); handouts
 * other than the one the TV shows; scene presets; undo history. Kept: the map, revealed fog,
 * open doors, placed tokens, drawings, ruler, disc, effects, spotlight, timer, the handout on
 * show, the curtain, the table's calibration and viewport.
 *
 * A secret door that is one of the map's own doors and not found yet stays in as a bare
 * placeholder (only its door index, `found: false`, no name, note or square): without it the
 * players' page would draw that door like any other (`hiddenDoors`).
 *
 * Known limit: the map's own files (picture, geometry with every door) are what the TV loads
 * too; a player who downloads the geometry file by hand could find a secret door's line.
 *
 * @see ./secrets.ts playersState
 * @see ./moments.ts withoutDmNotes
 */
import type { MapPlay } from './game.ts';
import { withoutDmNotes } from './moments.ts';
import type { RootState } from './root.ts';
import { playersState, secretsOf, type Secret } from './secrets.ts';

/**
 * The map's unfound secret doors that are geometry doors, stripped to their door index — what
 * the players' page needs to leave those doors undrawn, and nothing more.
 *
 * @param map - the map's full play state (the DM's)
 * @returns placeholders, `found: false`
 */
function hiddenDoorPlaceholders(map: MapPlay): Secret[] {
  return secretsOf(map)
    .filter((s) => s.kind === 'door' && !s.found && s.door !== null)
    .map((s) => ({ id: s.id, kind: 'door', name: '', note: '', col: 0, row: 0, door: s.door, vertical: false, effect: null, found: false }));
}

/**
 * One map as the players may see it.
 *
 * @param map - the map on the table, already without areas and unfound secrets (`playersState`)
 * @param full - the same map in the DM's state (for its unfound secret doors)
 * @returns the players' copy
 */
function playersMap(map: MapPlay, full: MapPlay): MapPlay {
  const doors = hiddenDoorPlaceholders(full);
  return {
    ...map,
    ...(doors.length > 0 ? { secrets: [...(map.secrets ?? []), ...doors] } : {}),
    layers: [],
    tokens: map.tokens.filter((t) => t.placed && !t.hidden),
    fog: { ...map.fog, staged: null, live: null },
    notes: [],
  };
}

/**
 * The state for a players' page: what the TV shows, without anything DM-only.
 *
 * @param root - the TV's full state
 * @returns a new state that is safe to hand to players
 */
export function playersView(root: RootState): RootState {
  const safe = withoutDmNotes(playersState(root));
  const game = safe.game;
  const history = { undo: [], redo: [] };
  if (!game) return { ...safe, history };
  const active = game.maps[game.activeMapId];
  if (!active) return { ...safe, game: null, history };
  const shown = game.handoutShown ?? null;
  return {
    ...safe,
    history,
    game: {
      ...game,
      mapOrder: [game.activeMapId],
      maps: { [game.activeMapId]: playersMap(active, root.game!.maps[game.activeMapId] ?? active) },
      handouts: shown ? (game.handouts ?? []).filter((h) => h.id === shown.id) : [],
      scenes: [],
    },
  };
}
