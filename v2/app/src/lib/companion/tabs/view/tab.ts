/**
 * The View tab: what the players see (table window, overview, TV following, turn, zoom) and
 * the DM-only picture layers (design.md "the tool tabs": View holds the DM layers). A panel —
 * a finger on the map keeps the Tokens behaviour.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import ViewPanel from './ViewPanel.svelte';

const tab: TabDef = {
  id: 'view',
  label: 'View',
  title: 'View',
  icon: 'view',
  group: 'panels',
  order: TAB_ORDER.view,
  panel: ViewPanel,
};

export default tab;
