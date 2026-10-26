/**
 * The Moments tab (roadmap S6, S8, S10, S11): the spotlight, the timer on the TV, handouts and the
 * DM's notes on the map. A **mode** right after Measure: a tap on the map puts the spotlight on a
 * mini or a square — the spotlight is the thing a DM does most mid-game, so the tab that holds it
 * is one tap from the rail, and its panel opens on the spotlight and the timer.
 *
 * One tab, not four: all four are short moments at the table, each a few controls; four tabs
 * would crowd the rail and the phone's tab bar. Not sections of other tabs: the spotlight
 * needs its own finger on the map (Tokens' taps place and select tokens), and View / Game are
 * setup. What must reach the DM from every tab sits outside the panel: a long press on the map
 * pins a note in any tab but Draw and Fog, and while the timer runs or a handout shows a chip at
 * the map's top edge pauses or takes it off (`MomentsChips.svelte`, mounted by the game screen).
 *
 * @see ../../../../../../docs/features.md "table moments"
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import MomentsPanel from './MomentsPanel.svelte';
import { momentsTool } from './tool.ts';

const tab: TabDef = {
  id: 'moments',
  label: 'Moments',
  title: 'Table moments',
  icon: 'candle',
  group: 'modes',
  order: TAB_ORDER.measure + 5,
  panel: MomentsPanel,
  tool: momentsTool,
};

export default tab;
