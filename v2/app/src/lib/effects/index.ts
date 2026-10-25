/**
 * The effects runtime's public face (package 7). The renderer creates it on its slots and feeds
 * it the map's effects and the live shots; the companion reads the catalogue for its picker and
 * uses the region helpers to build spell shapes; the bench page picks up the scenes.
 *
 * @see ../../../../docs/architecture.md "effects runtime", ./README.md
 */
export { createEffectsRuntime, type EffectSlots, type EffectsRuntime, type EffectsRuntimeOptions, type EffectsStats } from './runtime.ts';
export { effectsBenchScenes, type EffectsBenchScene, type BenchMapSize } from './bench.ts';
export { circleRegion, coneRegion, cubeRegion, lineRegion, type Pt, type RegionShape } from './anchors.ts';
export type { EffectsQuality, CostEstimate } from './budget.ts';
export type { EffectIndex, EffectIndexEntry, EffectManifest, EffectCategory, EffectTechnique } from './manifest.ts';
export { EffectRegistry, DEFAULT_EFFECTS_BUDGET } from './registry.ts';
