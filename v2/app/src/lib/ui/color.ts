/**
 * Colour maths for the kit's {@link ColorPicker}: `#rrggbb` ↔ hue / saturation / lightness.
 * Pure, tested in `color.test.ts`.
 */

/** A colour as hue (0–360), saturation and lightness (0–100). */
export interface Hsl {
    /** Hue in degrees, 0–360. */
    h: number;
    /** Saturation in percent. */
    s: number;
    /** Lightness in percent. */
    l: number;
}

/**
 * Parses `#rrggbb` (or `#rgb`).
 * @param hex - the colour
 * @returns red, green, blue 0–255, or null when it isn't a hex colour
 */
export function hexToRgb(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    let s = m[1]!;
    if (s.length === 3) s = s.replace(/./g, (c) => c + c);
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Writes `#rrggbb`.
 * @param r - red 0–255
 * @param g - green 0–255
 * @param b - blue 0–255
 * @returns the hex colour, lower case
 */
export function rgbToHex(r: number, g: number, b: number): string {
    const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * A hex colour as HSL.
 * @param hex - `#rrggbb`
 * @returns the HSL values (grey for an unreadable colour)
 */
export function hexToHsl(hex: string): Hsl {
    const rgb = hexToRgb(hex) ?? [128, 128, 128];
    const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * HSL as a hex colour.
 * @param hsl - hue, saturation, lightness
 * @returns `#rrggbb`
 */
export function hslToHex({ h, s, l }: Hsl): string {
    const sat = Math.min(100, Math.max(0, s)) / 100;
    const lig = Math.min(100, Math.max(0, l)) / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat;
    const hh = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    const [r, g, b] =
        hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
    const m = lig - c / 2;
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Whether two colours are the same (case and short form ignored).
 * @param a - one colour
 * @param b - the other
 * @returns true when equal
 */
export function sameColor(a: string, b: string): boolean {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return !!x && !!y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
}
