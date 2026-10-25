/**
 * What the importer needs from a picture engine, as an interface: decode (optionally scaled),
 * read rows of pixels, encode a scaled copy. The worker uses the browser's engine
 * (`raster-browser.ts`: `createImageBitmap` + `OffscreenCanvas`); tests use sharp. Keeping it
 * behind this seam lets `prepare.ts` — every decision about sizes, detection and copies — run
 * under `bun test` on the real test maps.
 */

/** A width and a height in pixels. */
export interface Size {
  /** Width. */
  width: number;
  /** Height. */
  height: number;
}

/** A decoded picture. */
export interface RasterImage {
  /** Width in pixels (after EXIF rotation). */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /**
   * Straight RGBA of `count` rows from row `y` (`width × count × 4` bytes). Callers keep
   * `width × count` within `MAX_CANVAS_PIXELS / 4`.
   *
   * @param y - first row
   * @param count - rows
   * @returns the pixels
   */
  readRows(y: number, count: number): Promise<Uint8Array | Uint8ClampedArray>;
  /** Frees the pixels. */
  close(): void;
}

/** What an encoded copy is for: the table copy, the thumbnail, or a lossless original (a PDF page). */
export type EncodePurpose = 'table' | 'thumb' | 'lossless';

/** An encoded picture. */
export interface Encoded {
  /** The file. */
  blob: Blob;
  /** Its kind. */
  ext: 'webp' | 'jpg' | 'png';
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/** A picture engine. */
export interface RasterBackend {
  /**
   * Decodes a picture file, at its own size or scaled to `size` (high quality).
   *
   * @param blob - PNG, JPEG or WebP bytes
   * @param size - the size to decode to, or undefined for full size
   * @returns the picture
   * @throws when the bytes can't be decoded
   */
  decode(blob: Blob, size?: Size): Promise<RasterImage>;
  /**
   * Encodes `image` scaled to `size`: WebP (lossy, quality 0.9) for `table` and `thumb` where
   * the engine can, else JPEG; PNG for `lossless`.
   *
   * @param image - the picture
   * @param size - the copy's size
   * @param purpose - what it is for
   * @returns the file
   */
  encode(image: RasterImage, size: Size, purpose: EncodePurpose): Promise<Encoded>;
}
