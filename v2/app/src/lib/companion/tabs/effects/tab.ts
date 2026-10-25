/**
 * The Effects tab: cast spells, place lasting areas, give tokens auras, dress the map with
 * torches and fires, set the weather (docs/effects.md "The Effects tab", roadmap N6/N7).
 * Sits between Measure and the panels; a finger on the map does what the armed effect says.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import EffectsFooter from './EffectsFooter.svelte';
import EffectsPanel from './EffectsPanel.svelte';
import { effectsLocal } from './local.svelte.ts';
import { dropOverlay } from './overlay.ts';
import { effectsTool } from './tool.ts';

const tab: TabDef = {
  id: 'effects',
  label: 'Effects',
  title: 'Effects',
  icon: 'sparkle',
  group: 'modes',
  order: TAB_ORDER.measure + 5,
  panel: EffectsPanel,
  footer: EffectsFooter,
  hasFooter: () => (effectsLocal.aim !== null && effectsLocal.chosenId !== null) || effectsLocal.selectedId !== null,
  tool: effectsTool,
  onLeave: () => {
    effectsLocal.aim = null;
    effectsLocal.selectedId = null;
    dropOverlay();
  },
};

export default tab;
