/**
 * Tones — the accent colours a control can carry. A tone is a CSS custom property of
 * tokens.css; components set it as their `--sf-c` (the colour of the edge glow and the
 * latched wash), never as a fill of their own.
 */

/** The named accents of the kit. */
export type Tone = 'accent' | 'reveal' | 'hide' | 'ok' | 'warn' | 'danger';

const VARS: Record<Tone, string> = {
    accent: 'var(--accent)',
    reveal: 'var(--reveal)',
    hide: 'var(--hide)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    danger: 'var(--err)',
};

/**
 * The CSS value of a tone.
 * @param tone - a named tone (undefined = the gold accent)
 * @returns a `var(--…)` expression
 */
export function toneVar(tone: Tone | undefined): string {
    return VARS[tone ?? 'accent'];
}

/** The four control sizes (tokens.css): pins a control against its container's context. */
export type CtlSize = 'standalone' | 'toolbar' | 'row' | 'compact';
