/**
 * The Fog tab: paints, fills and circles the fog (design.md "the tool tabs", parity §8), and
 * keeps the map's prepared reveal areas (roadmap S7, `areas/`): while one is drawn or edited the
 * finger edits it instead of the fog, the footer is Cancel · Save area, and the overlay shows
 * every area's outline.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import FogFooter from './FogFooter.svelte';
import FogPanel from './FogPanel.svelte';
import { fogLocal } from './local.svelte.ts';
import { fogTool } from './tool.ts';
import AreasOverlay from './areas/AreasOverlay.svelte';
import { areasLocal } from './areas/local.svelte.ts';
import { areaTool } from './areas/tool.ts';
import type { MapTool } from '../../game/tabs.ts';

const tab: TabDef = {
  id: 'fog',
  label: 'Fog',
  title: 'Fog of war',
  icon: 'fog',
  group: 'modes',
  order: TAB_ORDER.fog,
  panel: FogPanel,
  footer: FogFooter,
  hasFooter: (ctx) => ctx.game.previewFirst || areasLocal.draft !== null,
  tool: (ctx): MapTool => {
    // While an area is edited the finger edits it (and claims door taps), else it works the fog.
    const fog = fogTool(ctx);
    const area = areaTool(ctx);
    return {
      claims: (at) => area.claims!(at),
      tap: (at) => (areasLocal.draft ? area : fog).tap?.(at),
      begin: (from, now) => (areasLocal.draft ? area : fog).begin?.(from, now) ?? null,
    };
  },
  overlay: AreasOverlay,
  onLeave: () => {
    fogLocal.lastCircle = null;
    areasLocal.cancel(); // leaving the tab cancels an unsaved area
    areasLocal.selected = null;
  },
};

export default tab;
