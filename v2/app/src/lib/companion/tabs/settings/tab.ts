/**
 * The Game tab (folder `settings`): this game's maps, this map's squares, the table's
 * calibration, the game's and this tablet's settings, leaving the game. A panel — a finger on
 * the map keeps the Tokens behaviour.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import SettingsPanel from './SettingsPanel.svelte';

const tab: TabDef = {
  id: 'settings',
  label: 'Game',
  title: 'This game',
  icon: 'game',
  group: 'panels',
  order: TAB_ORDER.settings,
  panel: SettingsPanel,
};

export default tab;
