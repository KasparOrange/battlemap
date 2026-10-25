/**
 * The registry's real IO: JSON and text by `fetch`, textures through Pixi's `Assets` (it
 * decodes WebP off the main thread with `createImageBitmap` and premultiplies alpha the way
 * Pixi's blend modes expect), freed with `Assets.unload` (the GPU copy goes too).
 *
 * @see ./registry.ts
 */
import { Assets, type Texture } from 'pixi.js';
import type { RegistryOptions } from './registry.ts';

/**
 * The fetch/load/free functions of a {@link RegistryOptions} for the browser.
 *
 * @returns the IO part of the registry's options
 */
export function pixiTextureIO(): Pick<RegistryOptions<Texture>, 'fetchJson' | 'fetchText' | 'loadTexture' | 'freeTexture'> {
  return {
    async fetchJson(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return (await res.json()) as unknown;
    },
    async fetchText(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res.text();
    },
    async loadTexture(url, repeat) {
      const tex = await Assets.load<Texture>({ src: url, data: { alphaMode: 'premultiply-alpha-on-upload' } });
      if (repeat) {
        tex.source.style.addressMode = 'repeat';
        tex.source.style.update();
      }
      return tex;
    },
    freeTexture(url) {
      void Assets.unload(url);
    },
  };
}
