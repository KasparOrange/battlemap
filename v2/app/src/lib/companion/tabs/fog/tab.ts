/**
 * The Fog tab: paints, fills and circles the fog (design.md "the tool tabs", parity §8).
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import FogFooter from './FogFooter.svelte';
import FogPanel from './FogPanel.svelte';
import { fogLocal } from './local.svelte.ts';
import { fogTool } from './tool.ts';

const tab: TabDef = {
  id: 'fog',
  label: 'Fog',
  title: 'Fog of war',
  icon: 'fog',
  group: 'modes',
  order: TAB_ORDER.fog,
  panel: FogPanel,
  footer: FogFooter,
  hasFooter: (ctx) => ctx.game.previewFirst,
  tool: fogTool,
  onLeave: () => {
    fogLocal.lastCircle = null;
  },
};

export default tab;
