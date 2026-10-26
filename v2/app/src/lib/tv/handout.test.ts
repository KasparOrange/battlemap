/// <reference types="bun" />
/**
 * The TV's handout card: turned upright for its side, pushed against that side at the edge,
 * centred full screen; side cards sized along the screen's short axis; letters sized by length.
 */
import { describe, expect, test } from 'bun:test';
import { handoutPlacement, letterSize } from './handout.ts';

describe('handout placement', () => {
  test('edge cards turn for their side and push toward it', () => {
    expect(handoutPlacement('edge', 'bottom').transform).toBe('translate(-50%, -50%) rotate(0deg) translateY(calc(50vh - 50% - 1.2rem))');
    expect(handoutPlacement('edge', 'top').transform).toContain('rotate(180deg) translateY(calc(50vh');
    expect(handoutPlacement('edge', 'left').transform).toContain('rotate(90deg) translateY(calc(50vw');
    expect(handoutPlacement('edge', 'right').transform).toContain('rotate(-90deg) translateY(calc(50vw');
  });

  test('a side card is sized along the short axis; full screen is centred and bigger', () => {
    expect(handoutPlacement('edge', 'left')).toMatchObject({ maxWidth: '62vh', maxHeight: '26vw' });
    expect(handoutPlacement('edge', 'bottom')).toMatchObject({ maxWidth: '40vw', maxHeight: '36vh' });
    expect(handoutPlacement('full', 'top')).toEqual({ transform: 'translate(-50%, -50%) rotate(180deg)', maxWidth: '80vw', maxHeight: '86vh' });
    expect(handoutPlacement('full', 'right').maxWidth).toBe('88vh');
  });

  test('letters: shorter is bigger, full screen bigger than the edge', () => {
    const short = letterSize('Run.', 'edge');
    const long = letterSize('x'.repeat(1500), 'edge');
    expect(short).toBeGreaterThan(long);
    expect(letterSize('Run.', 'full')).toBeGreaterThan(short);
  });
});
