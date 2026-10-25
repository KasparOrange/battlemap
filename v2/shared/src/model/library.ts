/**
 * What libraries list: the TV's games (over the relay) and the server's shared maps (over
 * HTTP). Neither is part of the replicated state.
 */
import * as v from 'valibot';
import { Count, FileRef, Id, IsoTime, Name } from './basics.ts';
import { MapInfo } from './map.ts';

/** A game as a library row shows it. */
export const GameSummary = v.object({
  /** The game's id. */
  id: Id,
  /** Its name. */
  name: Name,
  /** When it was started. */
  createdAt: IsoTime,
  /** When it was last saved. */
  savedAt: IsoTime,
  /** Names of its maps, in order. */
  mapNames: v.array(Name),
  /** The map that was on the table. */
  activeMapName: Name,
  /** Its picture's thumbnail, if the server has one. */
  thumb: v.nullable(FileRef),
  /** Where it is stored: on this TV, only in the server's backup, or both. */
  where: v.picklist(['tv', 'server', 'both']),
});
/** A library row for a game; see the schema of the same name. */
export type GameSummary = v.InferOutput<typeof GameSummary>;

/** A map in the server's shared library (`GET /api/library`). */
export const LibraryEntry = v.object({
  /** The map, ready to join a game (`map.id` is the library id). */
  map: MapInfo,
  /** A small picture for the list (≤ 288 px), made at upload. */
  thumb: v.nullable(FileRef),
  /** When it was added. */
  addedAt: IsoTime,
  /** Bytes as uploaded, before conversion (null = not converted). */
  originalBytes: v.nullable(Count),
  /** What the conversion did ("lossless", "over 16383 px, stored as JPEG"), or null. */
  note: v.nullable(Name),
});
/** A shared library map; see the schema of the same name. */
export type LibraryEntry = v.InferOutput<typeof LibraryEntry>;
