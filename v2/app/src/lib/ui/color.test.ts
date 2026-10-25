/// <reference types="bun" />
/**
 * The ColorPicker's colour maths.
 */
import { expect, test } from 'bun:test';
import { hexToHsl, hexToRgb, hslToHex, rgbToHex, sameColor } from './color';

test('hex ↔ rgb ↔ hsl', () => {
    expect(hexToRgb('#e53935')).toEqual([229, 57, 53]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('nope')).toBeNull();
    expect(rgbToHex(229, 57, 53)).toBe('#e53935');
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00ff00');
    for (const c of ['#e53935', '#1e88e5', '#fdd835', '#5fd0c8']) {
        const back = hexToRgb(hslToHex(hexToHsl(c)))!;
        const orig = hexToRgb(c)!;
        back.forEach((v, i) => expect(Math.abs(v - orig[i]!)).toBeLessThanOrEqual(3));
    }
    expect(sameColor('#FFFFFF', '#fff')).toBe(true);
    expect(sameColor('#fff', '#ffe')).toBe(false);
});
