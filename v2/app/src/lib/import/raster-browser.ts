/**
 * The browser's picture engine for the import worker: `createImageBitmap` decodes (scaled when
 * asked, high quality), an `OffscreenCanvas` reads rows and encodes copies. Falls back to a
 * canvas scale where `createImageBitmap` has no resize options (older Safari), and to JPEG
 * where the canvas can't write WebP (Safari).
 *
 * @see ./raster.ts for the interface
 */
import type { Encoded, EncodePurpose, RasterBackend, RasterImage, Size } from './raster.ts';

const RAW: ImageBitmapOptions = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };

/** A decoded picture held as an `ImageBitmap`. */
export class BitmapImage implements RasterImage {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;

  /** @param bitmap - the pixels (owned from now on: `close` closes it) */
  constructor(readonly bitmap: ImageBitmap) {}

  /** Width in pixels. */
  get width(): number {
    return this.bitmap.width;
  }

  /** Height in pixels. */
  get height(): number {
    return this.bitmap.height;
  }

  /** Straight RGBA of `count` rows from `y`, drawn through a strip canvas. */
  async readRows(y: number, count: number): Promise<Uint8ClampedArray> {
    if (!this.canvas || this.canvas.height !== count) {
      this.canvas = new OffscreenCanvas(this.width, count);
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!this.ctx) throw new Error('no 2d context');
    }
    const ctx = this.ctx!;
    ctx.clearRect(0, 0, this.width, count);
    ctx.drawImage(this.bitmap, 0, y, this.width, count, 0, 0, this.width, count);
    return ctx.getImageData(0, 0, this.width, count).data;
  }

  /** Frees the bitmap and the strip canvas. */
  close(): void {
    this.bitmap.close();
    this.canvas = null;
    this.ctx = null;
  }
}

/** `source` scaled to `size` as a new bitmap (high quality; canvas fallback). */
async function scaled(source: ImageBitmapSource & CanvasImageSource, size: Size): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { ...RAW, resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
  } catch {
    const full = source instanceof ImageBitmap ? source : await createImageBitmap(source, RAW);
    try {
      const canvas = new OffscreenCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, 0, 0, size.width, size.height);
      return canvas.transferToImageBitmap();
    } finally {
      if (full !== source) full.close();
    }
  }
}

/** Encodes a bitmap as `type`, returning null when the canvas wrote something else. */
async function encodeAs(bitmap: ImageBitmap, type: string, quality?: number): Promise<Blob | null> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type, quality });
  return blob.type === type ? blob : null;
}

/** The browser engine. */
export const browserBackend: RasterBackend = {
  async decode(blob: Blob, size?: Size): Promise<RasterImage> {
    const bitmap = size ? await scaled(blob as Blob & CanvasImageSource, size) : await createImageBitmap(blob, RAW);
    return new BitmapImage(bitmap);
  },

  async encode(image: RasterImage, size: Size, purpose: EncodePurpose): Promise<Encoded> {
    const source = (image as BitmapImage).bitmap;
    const same = size.width === source.width && size.height === source.height;
    const bitmap = same ? source : await scaled(source, size);
    try {
      let blob: Blob | null;
      let ext: Encoded['ext'];
      const quality = purpose === 'thumb' ? 0.85 : purpose === 'page' ? 0.95 : 0.9;
      blob = await encodeAs(bitmap, 'image/webp', quality);
      ext = 'webp';
      if (!blob && purpose === 'page') {
        blob = await encodeAs(bitmap, 'image/png');
        ext = 'png';
      } else if (!blob) {
        blob = await encodeAs(bitmap, 'image/jpeg', quality);
        ext = 'jpg';
      }
      if (!blob) throw new Error(`the canvas can't encode ${ext}`);
      return { blob, ext, width: bitmap.width, height: bitmap.height };
    } finally {
      if (!same) bitmap.close();
    }
  },
};
