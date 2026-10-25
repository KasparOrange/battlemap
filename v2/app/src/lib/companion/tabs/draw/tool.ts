/**
 * What a finger on the map does in the Draw tab (parity DR-01, DR-04): the pen streams a live
 * stroke (`draw.live`, at most 30 a second) and adds it on release (`draw.add`, one undo step);
 * a second finger drops the live stroke. A tap draws a dot. The eraser removes every stroke the
 * finger touches (`draw.remove`, each one an undo step).
 */
import { newId, type Stroke } from '@battlemap/shared';
import type { GameContext, MapTool, ToolDrag } from '../../game/tabs.ts';
import { GRAB_PX } from '../../../render/hit.ts';
import { LIVE_PER_SECOND, throttle } from '../../input/throttle.ts';
import { log } from '../../../log.ts';
import { drawLocal, mmToSquares } from './local.svelte.ts';
import { StrokeBuilder, strokesHit } from './stroke.ts';

/**
 * The Draw tool for a game screen.
 *
 * @param ctx - the game context
 * @returns the tool
 */
export function drawTool(ctx: GameContext): MapTool {
  const reach = () => Math.max(0.15, (GRAB_PX * 0.6) / (ctx.camera.get()?.zoom ?? 40));

  const erase = (at: { x: number; y: number }) => {
    for (const id of strokesHit(ctx.map.strokes, at, reach())) {
      if (ctx.dispatch({ type: 'draw.remove', id })) log.info('companion', 'Stroke erased', { id });
    }
  };

  const stroke = (b: StrokeBuilder, id: string): Stroke => ({ id, points: [...b.points], color: drawLocal.color, width: mmToSquares(drawLocal.widthMm) });

  return {
    tap(at) {
      if (drawLocal.pen === 'eraser') {
        erase(at);
        return;
      }
      const b = new StrokeBuilder(at);
      ctx.dispatch({ type: 'draw.add', stroke: stroke(b, newId()) });
    },

    begin(from, now): ToolDrag {
      if (drawLocal.pen === 'eraser') {
        erase(from);
        erase(now);
        return { move: erase, end: erase, cancel: () => {} };
      }
      const id = newId();
      const b = new StrokeBuilder(from);
      b.add(now);
      const live = throttle(1000 / LIVE_PER_SECOND, (s: Stroke | null) => ctx.dispatch({ type: 'draw.live', stroke: s }));
      live.push(stroke(b, id));
      return {
        move(at) {
          if (b.add(at)) live.push(stroke(b, id));
        },
        end(at) {
          b.add(at);
          live.cancel();
          ctx.dispatch({ type: 'draw.add', stroke: stroke(b, id) });
          ctx.dispatch({ type: 'draw.live', stroke: null });
          log.info('companion', 'Stroke drawn', { id, points: b.points.length / 2 });
        },
        cancel() {
          live.cancel();
          ctx.dispatch({ type: 'draw.live', stroke: null });
          log.info('companion', 'Stroke dropped (second finger)', { id });
        },
      };
    },
  };
}
