/**
 * The Tokens tab — the leftmost, default tab: place, move, list, name, hide and delete the
 * position markers of players and monsters; taps on doors toggle them (parity §7).
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import { tokensLocal } from './local.svelte.ts';
import TokensPanel from './TokensPanel.svelte';
import { tokensTool } from './tool.ts';

const tab: TabDef = {
  id: 'tokens',
  label: 'Tokens',
  title: 'Tokens',
  icon: 'token',
  group: 'modes',
  order: TAB_ORDER.tokens,
  panel: TokensPanel,
  tool: tokensTool,
  onLeave: () => {
    tokensLocal.armed = null; // DP-09: leaving the tab cancels an armed placement
  },
};

export default tab;
