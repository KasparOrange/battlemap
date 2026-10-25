/**
 * `@battlemap/shared` — the protocol, the game model, the reducer and pure geometry. No DOM, no
 * Node: the app and the server import it alike.
 *
 * @see ../../docs/architecture.md and ../../docs/protocol.md
 */
export * from './model/basics.ts';
export * from './model/map.ts';
export * from './model/pieces.ts';
export * from './model/disc.ts';
export * from './model/effect.ts';
export * from './model/table.ts';
export * from './model/game.ts';
export * from './model/root.ts';
export * from './model/library.ts';
export * from './model/scene.ts';

export * from './protocol/commands.ts';
export * from './protocol/messages.ts';
export * from './protocol/parse.ts';

export * from './reducer/apply.ts';
export type { ApplyResult } from './reducer/result.ts';

export * from './geometry/base64.ts';
export * from './geometry/mask.ts';
export * from './geometry/cells.ts';
export * from './geometry/walls.ts';
export * from './geometry/rect.ts';
export * from './geometry/table.ts';
export * from './geometry/camera.ts';
export * from './geometry/raster-grid.ts';
export * from './geometry/ruler.ts';
export * from './geometry/disc.ts';

export * from './util/assert.ts';
export * from './util/ids.ts';
export * from './util/table-code.ts';

/** The server-only HTTP answers, generated from the Rust server (server-rs/src/wire.rs). */
export type * from './generated/server.ts';
