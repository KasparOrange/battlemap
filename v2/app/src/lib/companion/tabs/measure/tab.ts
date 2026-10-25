/**
 * The Measure tab: a finger on the map measures; the panel holds the ruler and the template
 * disc (design.md "the tool tabs", parity §10).
 */
import { TAB_ORDER, type TabDef } from '../../game/tabs.ts';
import MeasurePanel from './MeasurePanel.svelte';
import { measureTool } from './tool.ts';

const tab: TabDef = {
  id: 'measure',
  label: 'Measure',
  title: 'Measure',
  icon: 'measure',
  group: 'modes',
  order: TAB_ORDER.measure,
  panel: MeasurePanel,
  tool: measureTool,
  onLeave: (ctx) => {
    if (ctx.state.live.measure) ctx.dispatch({ type: 'measure.set', line: null });
  },
};

export default tab;
