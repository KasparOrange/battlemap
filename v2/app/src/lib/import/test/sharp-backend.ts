/// <reference types="bun" />
/**
 * Test-only picture engine on sharp (installed for the server), so `prepare.ts` runs under
 * `bun test` on real pictures. `sharpBackend()` returns null when sharp isn't installed — the
 * tests that need it are skipped then.
 */
import { createRequire } from 'node:module';
import type { Encoded, RasterBackend, RasterImage, Size } from '../raster.ts';

/** The bits of sharp's API used here. */
interface SharpChain {
  rotate(): SharpChain;
  resize(w: number, h: number, o: { fit: 'fill'; kernel?: string }): SharpChain;
  ensureAlpha(): SharpChain;
  raw(): SharpChain;
  webp(o: { quality: number }): SharpChain;
  jpeg(o: { quality: number }): SharpChain;
  png(): SharpChain;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>;
}
type Sharp = (input: Uint8Array, o?: { raw?: { width: number; height: number; channels: 4 }; limitInputPixels?: number | false }) => SharpChain;

/** A decoded picture with all its pixels in memory. */
class SharpImage implements RasterImage {
  constructor(readonly width: number, readonly height: number, readonly data: Uint8Array) {}
  async readRows(y: number, count: number): Promise<Uint8Array> {
    return this.data.subarray(y * this.width * 4, (y + count) * this.width * 4);
  }
  close(): void {}
}

/**
 * The sharp engine, or null when sharp can't be loaded.
 *
 * @returns the backend
 */
export function sharpBackend(): RasterBackend | null {
  let sharp: Sharp;
  try {
    const req = createRequire(new URL('../../../../../server/package.json', import.meta.url).pathname);
    sharp = req('sharp') as Sharp;
  } catch {
    return null;
  }
  return {
    async decode(blob: Blob, size?: Size): Promise<RasterImage> {
      let chain = sharp(new Uint8Array(await blob.arrayBuffer()), { limitInputPixels: false }).rotate();
      if (size) chain = chain.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' });
      const { data, info } = await chain.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return new SharpImage(info.width, info.height, data);
    },
    async encode(image: RasterImage, size: Size, purpose): Promise<Encoded> {
      const img = image as SharpImage;
      let chain = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 }, limitInputPixels: false });
      if (size.width !== img.width || size.height !== img.height) chain = chain.resize(size.width, size.height, { fit: 'fill' });
      const ext = purpose === 'page' ? 'png' : 'webp';
      chain = ext === 'png' ? chain.png() : chain.webp({ quality: 90 });
      const { data, info } = await chain.toBuffer({ resolveWithObject: true });
      return { blob: new Blob([data as Uint8Array<ArrayBuffer>]), ext, width: info.width, height: info.height };
    },
  };
}
