/**
 * Test helper: lets `bun test` load `.svelte.ts` modules outside the Svelte compiler by making
 * the runes plain functions (`$state(v)` → `v`). Import it FIRST in a test file. Reactivity is
 * not needed by the tests — they read the values directly.
 */
const g = globalThis as Record<string, unknown>;
if (!g.$state) {
  const state = (v?: unknown) => v;
  (state as unknown as { raw: (v?: unknown) => unknown }).raw = (v?: unknown) => v;
  g.$state = state;
  const derived = (v?: unknown) => v;
  (derived as unknown as { by: (f: () => unknown) => unknown }).by = (f: () => unknown) => f();
  g.$derived = derived;
  g.$effect = () => {};
}
export {};
