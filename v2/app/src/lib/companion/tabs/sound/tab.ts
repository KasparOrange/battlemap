/**
 * The Sound tab (roadmap S1): the TV's soundscape — ambient beds, one-shot pads, volumes.
 * A panel (no map tool): the map keeps the Tokens behaviour while it is open.
 *
 * @see ./SoundPanel.svelte
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import SoundFooter from './SoundFooter.svelte';
import SoundPanel from './SoundPanel.svelte';

const tab: TabDef = {
  id: 'sound',
  label: 'Sound',
  title: 'Sound',
  icon: 'sound',
  group: 'panels',
  order: TAB_ORDER.view + 7,
  panel: SoundPanel,
  footer: SoundFooter,
};

export default tab;
