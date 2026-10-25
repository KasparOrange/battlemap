/**
 * The Draw tab: freehand ink on the map, seen on the TV (parity §9). Door taps are off here —
 * a tap draws a dot.
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import DrawPanel from './DrawPanel.svelte';
import { drawTool } from './tool.ts';

const tab: TabDef = {
  id: 'draw',
  label: 'Draw',
  title: 'Draw',
  icon: 'draw',
  group: 'modes',
  order: TAB_ORDER.draw,
  panel: DrawPanel,
  tool: drawTool,
  doors: false,
};

export default tab;
