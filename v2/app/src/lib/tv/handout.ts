/**
 * Where and how big the TV draws a handout (`TvHandout.svelte`, `docs/features.md` "table
 * moments"). The TV lies flat: a handout reads upright for the players at one side of the table,
 * so the card turns ({@link sideTurn}) and, at the edge, sits against that side. Pure, tested.
 */
import { sideTurn, type HandoutShown, type TableSide } from '@battlemap/shared';

/** The card's CSS placement (relative to a box that fills the screen, its origin the centre). */
export interface HandoutPlacement {
  /** The CSS transform from the screen's centre. */
  transform: string;
  /** Most width of the card before it turns (CSS length). */
  maxWidth: string;
  /** Most height of the card before it turns (CSS length). */
  maxHeight: string;
}

/** The gap between an edge card and the screen's edge. */
const EDGE_GAP = '1.2rem';

/**
 * The card's placement for a shown handout. Edge cards push from the centre toward their side
 * (`translateY` after the turn points at that side); a side card (left, right) runs along the
 * screen's short axis, so its width is measured in `vh`.
 *
 * @param place - at the table's edge or full screen
 * @param side - the side it reads upright for
 * @returns the placement
 */
export function handoutPlacement(place: HandoutShown['place'], side: TableSide): HandoutPlacement {
  const turn = sideTurn(side);
  const across = side === 'left' || side === 'right';
  if (place === 'full') {
    return {
      transform: `translate(-50%, -50%) rotate(${turn}deg)`,
      maxWidth: across ? '88vh' : '80vw',
      maxHeight: across ? '80vw' : '86vh',
    };
  }
  const reach = across ? '50vw' : '50vh';
  return {
    transform: `translate(-50%, -50%) rotate(${turn}deg) translateY(calc(${reach} - 50% - ${EDGE_GAP}))`,
    maxWidth: across ? '62vh' : '40vw',
    maxHeight: across ? '26vw' : '36vh',
  };
}

/**
 * How big the TV prints a letter (rem of the TV's 1/64-screen root): short letters big, long ones
 * smaller so they still fit the card.
 *
 * @param text - the letter
 * @param place - at the table's edge (a smaller card) or full screen
 * @returns rem
 */
export function letterSize(text: string, place: HandoutShown['place']): number {
  const n = text.length;
  const base = n <= 160 ? 0.9 : n <= 400 ? 0.72 : n <= 900 ? 0.56 : 0.44;
  return place === 'full' ? Math.round(base * 1.3 * 100) / 100 : base;
}
