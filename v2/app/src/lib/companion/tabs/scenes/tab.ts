/**
 * The Scenes tab (roadmap S2): the game's scene presets — save what the table shows, switch
 * back with one tap (under the curtain by default). A panel: a finger on the map keeps the
 * Tokens behaviour. It sits in the panels group right after View, because a scene is "what the
 * players see" — and it is its own tab, not a section of Game, because the DM uses it mid-game
 * while Game holds the setup (docs/features.md "scene presets").
 *
 * The curtain button itself is not a tab: it sits in the map's corner on every tab
 * (`CurtainButton.svelte`, mounted by the game screen).
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import ScenesFooter from './ScenesFooter.svelte';
import ScenesPanel from './ScenesPanel.svelte';

const tab: TabDef = {
  id: 'scenes',
  label: 'Scenes',
  title: 'Scenes',
  icon: 'star',
  group: 'panels',
  order: TAB_ORDER.view + 5,
  panel: ScenesPanel,
  footer: ScenesFooter,
};

export default tab;
