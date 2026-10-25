/**
 * The small building blocks every other model file uses: numbers, ids, points, colours, file
 * references and fog masks. Each is a valibot schema (for checking what arrives over the wire)
 * with a TypeScript type of the same name (for the code).
 *
 * @see ../../../docs/protocol.md "conventions"
 */
import * as v from 'valibot';

/** A finite number (no NaN, no Infinity). */
export const Num = v.pipe(v.number(), v.finite());

/** A whole number. */
export const Int = v.pipe(v.number(), v.integer());

/** A whole number ≥ 0. */
export const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

/** A number ≥ 0 that may have a fraction. */
export const NonNegative = v.pipe(v.number(), v.finite(), v.minValue(0));

/** A number > 0 that may have a fraction. */
export const Positive = v.pipe(v.number(), v.finite(), v.gtValue(0));

/** An id: 1–64 characters, made by whoever creates the thing (see `newId`). */
export const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));
/** An id string; see the schema of the same name. */
export type Id = v.InferOutput<typeof Id>;

/** A short human text — a name or a label, at most 200 characters. */
export const Name = v.pipe(v.string(), v.maxLength(200));

/** A point in map squares: x to the right, y down, (0, 0) the map's top-left corner. */
export const Point = v.object({
  /** Squares from the map's left edge. */
  x: Num,
  /** Squares from the map's top edge. */
  y: Num,
});
/** A point in map squares; see the schema of the same name. */
export type Point = v.InferOutput<typeof Point>;

/** A colour as `#rrggbb`. */
export const Color = v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/));
/** A `#rrggbb` colour string; see the schema of the same name. */
export type Color = v.InferOutput<typeof Color>;

/** File kinds the server stores. */
export const FileExt = v.picklist(['png', 'jpg', 'webp', 'json', 'pdf']);
/** One of the stored file kinds; see the schema of the same name. */
export type FileExt = v.InferOutput<typeof FileExt>;

/**
 * A file on the server, by content: fetched from `<server>/files/<hash>.<ext>` and never
 * changes, so every device caches it forever.
 */
export const FileRef = v.object({
  /** Hex digest of the content (the server's hash, 16–64 lowercase hex characters). */
  hash: v.pipe(v.string(), v.regex(/^[0-9a-f]{16,64}$/)),
  /** The file's kind, also its extension in the URL. */
  ext: FileExt,
  /** Size in bytes (for progress bars and budgets). */
  bytes: Count,
});
/** A content-addressed file reference; see the schema of the same name. */
export type FileRef = v.InferOutput<typeof FileRef>;

/**
 * A fog mask: one bit per square of a map, row-major, least significant bit first, as base64.
 * Immutable like every other part of the state — a changed mask is a new string, so "did the
 * fog change?" is a string comparison. Read and write it with `geometry/mask.ts`.
 */
export const Mask = v.string();
/** A base64 bit mask; see the schema of the same name. */
export type Mask = v.InferOutput<typeof Mask>;

/** A square of a map as its cell index, `row * cols + col`. */
export const Cell = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000));

/** An ISO 8601 timestamp text (`2026-10-25T18:01:04.000Z`). */
export const IsoTime = v.pipe(v.string(), v.minLength(10), v.maxLength(40));
