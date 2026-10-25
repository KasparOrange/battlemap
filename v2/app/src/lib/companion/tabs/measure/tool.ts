/**
 * What a finger on the map does in the Measure tab (parity MS-01): a drag measures a line the
 * players see on the TV (`measure.set`, live, at most 30 a second); the line stays after the
 * finger lifts; a tap clears it. The ruler and the disc are dragged by the input layer in
 * every tab, before this tool is asked.
 */
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { LIVE_PER_SECOND, throttle } from '../../input/throttle.ts';
import { log } from '../../../log.ts';
import type { MeasureLine, Point } from '@battlemap/shared';

/**
 * The Measure tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function measureTool(ctx: GameContext): MapTool {
  return {
    tap() {
      if (ctx.state.live.measure) ctx.dispatch({ type: 'measure.set', line: null });
    },

    begin(from: Point, now: Point): ToolDrag {
      const send = throttle(1000 / LIVE_PER_SECOND, (line: MeasureLine | null) => ctx.dispatch({ type: 'measure.set', line }));
      send.push({ a: from, b: now });
      return {
        move(at) {
          send.push({ a: from, b: at });
        },
        end(at) {
          send.cancel();
          ctx.dispatch({ type: 'measure.set', line: { a: from, b: at } });
          log.info('companion', 'Measured', { squares: Math.round(Math.hypot(at.x - from.x, at.y - from.y) * 10) / 10 });
        },
        cancel() {
          send.cancel();
          ctx.dispatch({ type: 'measure.set', line: null });
        },
      };
    },
  };
}
