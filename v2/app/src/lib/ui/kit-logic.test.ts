/// <reference types="bun" />
/**
 * Tests of the kit's plain logic: D-pad geometry, plane placement, one plane at a time, the
 * notice show times (the old app's table) and the fluent clock. Run: `bun test` in app/.
 */
import { describe, expect, test } from 'bun:test';
import { pickInDirection } from './spatial';
import { placePlane, claimPlane } from './plane';
import { noticeMs } from './notice-rules';
import { openMs, closeMs } from './fluent';

const r = (x: number, y: number, w = 100, h = 50) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON() {} }) as DOMRect;

describe('pickInDirection', () => {
    // a 3 × 2 grid of tiles, 100 × 50, 20 px apart
    const tiles = [0, 1, 2].flatMap((c) => [0, 1].map((row) => ({ item: `${c},${row}`, rect: r(c * 120, row * 70) })));
    const from = (id: string) => tiles.find((t) => t.item === id)!.rect;
    const others = (id: string) => tiles.filter((t) => t.item !== id);

    test('right goes to the neighbour in the same row', () => {
        expect(pickInDirection(from('0,0'), others('0,0'), 'right')).toBe('1,0');
    });
    test('down goes to the tile below, not diagonally', () => {
        expect(pickInDirection(from('1,0'), others('1,0'), 'down')).toBe('1,1');
    });
    test('left from the first column finds nothing', () => {
        expect(pickInDirection(from('0,1'), others('0,1'), 'left')).toBeNull();
    });
    test('up from the bottom row stays in the column', () => {
        expect(pickInDirection(from('2,1'), others('2,1'), 'up')).toBe('2,0');
    });
    test('a same-row candidate beats a nearer diagonal one', () => {
        const far = { item: 'far', rect: r(400, 0) };
        const diag = { item: 'diag', rect: r(130, 200) };
        expect(pickInDirection(r(0, 0), [far, diag], 'right')).toBe('far');
    });
});

describe('placePlane', () => {
    const vp = { w: 1000, h: 800 };
    test('opens below with room, joined to the bottom edge', () => {
        const p = placePlane(r(100, 100, 120, 44), 240, 200, 9, vp);
        expect(p.joint).toBe('down');
        expect(p.top).toBe(143);
        expect(p.left).toBe(100);
        expect(p.minWidth).toBe(120);
    });
    test('opens above near the bottom of the screen', () => {
        const p = placePlane(r(100, 700, 120, 44), 240, 300, 9, vp);
        expect(p.joint).toBe('up');
        expect(p.bottom).toBe(99); // overlaps the activator's top by 1 px
    });
    test('lines up with the end edge near the right side', () => {
        const p = placePlane(r(900, 100, 80, 44), 240, 200, 9, vp);
        expect(p.align).toBe('end');
        expect(p.left).toBe(980 - 240);
        expect(p.jointX).toBe(900 - p.left);
    });
    test('one plane at a time', () => {
        let closedA = 0;
        claimPlane(() => closedA++);
        claimPlane(() => {});
        expect(closedA).toBe(1);
    });
});

describe('noticeMs — the old app table', () => {
    test('base times by kind', () => {
        expect(noticeMs('info', 'Map saved', false)).toBe(3000);
        expect(noticeMs('warning', 'Slow', false)).toBe(4000);
        expect(noticeMs('error', 'Failed', false)).toBe(5000);
    });
    test('a button gives at least 6 s', () => {
        expect(noticeMs('info', 'Map deleted', true)).toBe(6000);
    });
    test('+1 s per 40 characters, capped at 10 s', () => {
        expect(noticeMs('info', 'x'.repeat(85), false)).toBe(5000);
        expect(noticeMs('error', 'x'.repeat(400), true)).toBe(10000);
    });
});

describe('fluent clock', () => {
    test('closing is quicker than opening, both capped', () => {
        expect(closeMs(200)).toBeLessThan(openMs(200));
        expect(openMs(5000)).toBe(440);
        expect(closeMs(5000)).toBe(310);
    });
});
