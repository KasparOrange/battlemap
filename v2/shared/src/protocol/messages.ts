/**
 * Every message on the wire. Three layers:
 *
 * - **client ↔ server**: `hello`/`welcome`, `ping`/`pong`, who joined and left — the server's
 *   own small part (`server/src/relay/`);
 * - **companion → TV** and **TV → companion**: peer messages the server only routes (it stamps
 *   `from`, honours `to`, and never looks inside);
 * - inside `sync.cmd` / `sync.applied`: the reducer's commands (`commands.ts`).
 *
 * The catalogue with examples and the old protocol's names: `docs/protocol.md`.
 */
import * as v from 'valibot';
import { Count, Id, Name, Num } from '../model/basics.ts';
import { GameSettings } from '../model/game.ts';
import { GameSummary } from '../model/library.ts';
import { MapInfo } from '../model/map.ts';
import { RootState } from '../model/root.ts';
import { Command } from './commands.ts';

/** The protocol's version; a client with another one is refused in `server.error`. */
export const PROTOCOL_VERSION = 1;

/** Who is talking: the table or a DM device. */
export const Role = v.picklist(['tv', 'companion']);
/** A role; see the schema of the same name. */
export type Role = v.InferOutput<typeof Role>;

/** Someone in a room. */
export const Peer = v.object({
  /** Their client id (per page load). */
  client: Id,
  /** TV or companion. */
  role: Role,
  /** A human name ("Tab A11+", "Living-room TV"). */
  name: Name,
});
/** Someone in a room; see the schema of the same name. */
export type Peer = v.InferOutput<typeof Peer>;

/** Fields every peer message may carry; the server sets `from`. */
const envelope = {
  /** Sender's clock when it was sent (epoch ms) — receivers log messages older than 1.5 s. */
  sent: v.optional(Num),
  /** The sender's client id, stamped by the server. */
  from: v.optional(Id),
  /** One recipient (TV → one companion); missing = the default route. */
  to: v.optional(Id),
};

// ── client ↔ server ─────────────────────────────────────────────────────────────────────────

/** First message on a new socket: who I am and which room (table) I join. */
export const Hello = v.object({
  type: v.literal('hello'),
  /** `PROTOCOL_VERSION` of the client. */
  protocol: v.pipe(v.number(), v.integer()),
  /** TV or companion. */
  role: Role,
  /** The table's id. */
  room: Id,
  /** This page's client id: new on every page load, kept across its reconnects (rv#38). */
  client: Id,
  /** A human name for this device. */
  name: Name,
  /** The app build the client runs. */
  build: v.pipe(v.string(), v.maxLength(80)),
});
/** The hello message; see the schema of the same name. */
export type Hello = v.InferOutput<typeof Hello>;

/** Heartbeat from a client; the server answers with `pong`. */
export const Ping = v.object({
  type: v.literal('ping'),
  /** The client's clock (echoed). */
  t: Num,
});

/** The server's answer to `hello`: you're in. */
export const Welcome = v.object({
  type: v.literal('welcome'),
  /** Your client id. */
  client: Id,
  /** Your room. */
  room: Id,
  /** Your role. */
  role: Role,
  /** Everyone else in the room. */
  peers: v.array(Peer),
  /** The app build the server serves (null when it serves none) — reload when it differs. */
  build: v.nullable(v.string()),
  /** The server's clock (epoch ms). */
  serverTime: Num,
});
/** The welcome message; see the schema of the same name. */
export type Welcome = v.InferOutput<typeof Welcome>;

/** Answer to `ping`. */
export const Pong = v.object({
  type: v.literal('pong'),
  /** The ping's `t`. */
  t: Num,
  /** The server's clock. */
  serverTime: Num,
});

/** Someone joined the room. */
export const PeerJoined = v.object({ type: v.literal('peer.joined'), peer: Peer });

/** Someone left the room. */
export const PeerLeft = v.object({
  type: v.literal('peer.left'),
  /** Their client id. */
  client: Id,
  /** Their role. */
  role: Role,
});

/** Another TV took this room's TV slot; the old one stops reconnecting until asked to. */
export const Replaced = v.object({
  type: v.literal('replaced'),
  /** The new TV's name. */
  by: Name,
});

/** A message could not be delivered (no TV in the room, an unknown `to`). */
export const Undelivered = v.object({
  type: v.literal('relay.undelivered'),
  /** The type of the message that wasn't delivered. */
  msgType: v.string(),
  /** Its `seq` if it was a `sync.cmd`. */
  seq: v.optional(Count),
  /** Why: `no-tv`, `no-such-client`. */
  reason: v.string(),
});

/** The server now serves a newer app build. */
export const ServerBuild = v.object({ type: v.literal('server.build'), build: v.string() });

/** The server refuses this socket (bad hello, protocol mismatch); it closes after this. */
export const ServerError = v.object({ type: v.literal('server.error'), reason: v.string() });

// ── companion → TV ──────────────────────────────────────────────────────────────────────────

/** A command for the reducer, numbered per sender. */
export const SyncCmd = v.object({
  type: v.literal('sync.cmd'),
  ...envelope,
  /** The sender's running number (starts at 1 per client, kept across reconnects). */
  seq: Count,
  /** The command. */
  cmd: Command,
  /**
   * The map the sender saw on the table when it sent a map-scoped command (rv#28); the TV refuses
   * the command when another map is there by then (`staleMapReason`). Optional.
   */
  onMap: v.optional(Id),
});

/** Please send me a snapshot. */
export const SyncRequest = v.object({ type: v.literal('sync.request'), ...envelope });

/** Please send me the list of games. */
export const LibList = v.object({ type: v.literal('lib.list'), ...envelope });

/** Open a game (from the TV, or from the server's backup). */
export const GameOpen = v.object({ type: v.literal('game.open'), ...envelope, gameId: Id });

/** Start a new game on a map. */
export const GameNew = v.object({
  type: v.literal('game.new'),
  ...envelope,
  /** The game to start. */
  game: v.object({
    /** A new id. */
    id: Id,
    /** Its name. */
    name: Name,
    /** Now, ISO. */
    createdAt: v.string(),
    /** The first map. */
    map: MapInfo,
    /** More maps of the game after the first (several pages of one PDF), not on the table yet. */
    moreMaps: v.optional(v.pipe(v.array(MapInfo), v.maxLength(59))),
    /** Settings (defaults where missing). */
    settings: v.optional(v.partial(GameSettings)),
  }),
});

/** Close the open game (saved first) and show the library. */
export const GameClose = v.object({ type: v.literal('game.close'), ...envelope });

/** Delete a stored game (on the TV and its backup). */
export const GameDelete = v.object({ type: v.literal('game.delete'), ...envelope, gameId: Id });

/** Rename a stored game that isn't open (`game.rename` renames the open one). */
export const GameRenameStored = v.object({ type: v.literal('game.renameStored'), ...envelope, gameId: Id, name: Name });

/** Tell me how you are (view, game, build, memory). */
export const DiagStatus = v.object({ type: v.literal('diag.status'), ...envelope });

/** Save now and get ready to be updated. */
export const DeployPrepare = v.object({ type: v.literal('deploy.prepare'), ...envelope });

/** Save and reload the app (a new build is there). */
export const TvReload = v.object({ type: v.literal('tv.reload'), ...envelope });

/** Any message for the TV. */
export const ToTv = v.variant('type', [
  SyncCmd, SyncRequest, LibList, GameOpen, GameNew, GameClose, GameDelete, GameRenameStored,
  DiagStatus, DeployPrepare, TvReload,
]);
/** Any message for the TV; see the schema of the same name. */
export type ToTv = v.InferOutput<typeof ToTv>;

// ── TV → companion ──────────────────────────────────────────────────────────────────────────

/** The whole state, for a companion that joins, missed a revision, or sees a new epoch. */
export const SyncSnapshot = v.object({
  type: v.literal('sync.snapshot'),
  ...envelope,
  /** Changes whenever the TV opens another game or restarts. */
  epoch: Id,
  /** The revision this state is at. */
  rev: Count,
  /** The state. */
  state: RootState,
  /** Per client: the last command `seq` applied. */
  acks: v.record(Id, Count),
});

/** A command the TV applied — the patch every companion applies too. */
export const SyncApplied = v.object({
  type: v.literal('sync.applied'),
  ...envelope,
  /** The TV's epoch. */
  epoch: Id,
  /** The revision after this command (previous + 1). */
  rev: Count,
  /** Who sent the command. */
  by: Id,
  /** Its `seq` from that sender. */
  seq: Count,
  /** The command. */
  cmd: Command,
});

/** The TV did not apply a command (to its sender only). */
export const SyncRejected = v.object({
  type: v.literal('sync.rejected'),
  ...envelope,
  /** The command's `seq`. */
  seq: Count,
  /** Why, in words for a notice. */
  reason: v.string(),
});

/** The TV's games. */
export const LibListing = v.object({ type: v.literal('lib.listing'), ...envelope, games: v.array(GameSummary) });

/** What the TV is busy with (loading a map, restoring a game), or null when idle. */
export const TvStatus = v.object({
  type: v.literal('tv.status'),
  ...envelope,
  /** What it is doing, in words ("Loading the tower…"), or null. */
  busy: v.nullable(v.string()),
  /** How far, 0–1, or null when unknown. */
  progress: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
});

/** Something the DM should read (an error on the TV, a request that failed). */
export const TvNotice = v.object({
  type: v.literal('tv.notice'),
  ...envelope,
  /** How bad. */
  level: v.picklist(['info', 'warn', 'error']),
  /** The text. */
  text: v.string(),
});

/** The answer to `diag.status`. */
export const DiagReport = v.object({
  type: v.literal('diag.report'),
  ...envelope,
  /** The TV's app build. */
  build: v.string(),
  /** Its epoch. */
  epoch: Id,
  /** Its revision. */
  rev: Count,
  /** The open game, or null. */
  gameId: v.nullable(Id),
  /** The map on the table, or null. */
  activeMapId: v.nullable(Id),
  /** Whole squares on the table (`34x19`), or null without a viewport. */
  table: v.nullable(v.string()),
  /** Seconds since the app started. */
  uptimeS: v.number(),
  /** JS heap in MB where the browser tells, else null. */
  heapMb: v.nullable(v.number()),
});

/** The TV saved and is ready to be updated. */
export const DeployReady = v.object({ type: v.literal('deploy.ready'), ...envelope, gameId: v.nullable(Id) });

/** Any message for a companion. */
export const ToCompanion = v.variant('type', [
  SyncSnapshot, SyncApplied, SyncRejected, LibListing, TvStatus, TvNotice, DiagReport, DeployReady,
]);
/** Any message for a companion; see the schema of the same name. */
export type ToCompanion = v.InferOutput<typeof ToCompanion>;

/** Any message the server sends of its own. */
export const ServerMessage = v.variant('type', [Welcome, Pong, PeerJoined, PeerLeft, Replaced, Undelivered, ServerBuild, ServerError]);
/** Any server message; see the schema of the same name. */
export type ServerMessage = v.InferOutput<typeof ServerMessage>;

/** What a client may send the server that the server handles itself. */
export const ClientControl = v.variant('type', [Hello, Ping]);
/** A client control message; see the schema of the same name. */
export type ClientControl = v.InferOutput<typeof ClientControl>;

/**
 * The part of a peer message the server reads to route it: its type, an optional `to`, and the
 * `seq` of a `sync.cmd` (for `relay.undelivered`). Everything else passes through untouched.
 */
export const RoutingEnvelope = v.looseObject({
  type: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  to: v.optional(Id),
  seq: v.optional(Count),
});
/** A routable message; see the schema of the same name. */
export type RoutingEnvelope = v.InferOutput<typeof RoutingEnvelope>;
