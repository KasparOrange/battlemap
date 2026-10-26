/**
 * The Secrets tab (roadmap S9, docs/features.md "Secret doors and traps"): traps, hidden marks
 * and secret doors the players don't see until the DM marks them found (a trap: springs it).
 *
 * A tab of its own, not a Fog section: placing secrets is its own finger action (tabs are modes —
 * a tap places or selects a secret and never toggles a door), and mid-game the list with its
 * Found / Spring buttons is one tap from the rail. The Fog tab stays about fog.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import SecretsOverlay from './SecretsOverlay.svelte';
import SecretsPanel from './SecretsPanel.svelte';
import { secretsLocal } from './local.svelte.ts';
import { secretsTool } from './tool.ts';

const tab: TabDef = {
  id: 'secrets',
  label: 'Secrets',
  title: 'Secrets and traps',
  icon: 'lock',
  group: 'modes',
  order: (TAB_ORDER.fog + TAB_ORDER.draw) / 2,
  panel: SecretsPanel,
  tool: secretsTool,
  overlay: SecretsOverlay,
  doors: false,
  onLeave: () => {
    secretsLocal.selected = null;
  },
};

export default tab;
