/**
 * The fluent clock — the one source of motion timing for the kit
 * (stack/claude/ui-fluent-expansion.md rule 4, the same numbers as the tafel demo's
 * fluent-motion.ts and bridge's fluent.ts).
 *
 * A control's own surface grows into its plane; the duration follows the pixels revealed,
 * and closing is deliberately quicker than opening — that asymmetry is the signature.
 * Every expandable in the kit (Menu, Numpad plane, Section, Sheet) takes its numbers from
 * here instead of carrying its own.
 */

/**
 * Opening duration for a reveal of the given size.
 * @param px - pixels being uncovered (height, or distance for a glide)
 * @returns milliseconds, capped at 440
 */
export const openMs = (px: number): number => Math.min(440, 200 + Math.abs(px) * 0.6);

/**
 * Closing duration — quicker than {@link openMs} for the same size.
 * @param px - pixels being covered again
 * @returns milliseconds, capped at 310
 */
export const closeMs = (px: number): number => Math.min(310, 140 + Math.abs(px) * 0.45);

/** easeOutBack — the opening bloom (slight overshoot), CSS dialect. */
export const EASE_OPEN = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/** easeOutCubic — the closing glide, CSS dialect. */
export const EASE_CLOSE = 'cubic-bezier(0.33, 1, 0.68, 1)';

/** The gliding highlight's curve (~1 % overshoot, rule 14), CSS dialect. */
export const EASE_GLIDE = 'cubic-bezier(0.3, 1.12, 0.5, 1)';

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Whether motion is switched off (`prefers-reduced-motion`, fluent rule 13).
 * The geometry still lands — callers use a duration of 0 instead of skipping the change.
 * @returns true when the user asked for reduced motion
 */
export const still = (): boolean => reduce?.matches ?? false;

const easeOutBack = (t: number): number => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Svelte transition: the element's measured height on the fluent clock (rule 3 — never
 * `grid-template-rows 0fr→1fr`). Opens with the bloom, closes quicker. Put it on a wrapper
 * without padding or margin; `overflow: clip` so a focused field inside never scrolls it.
 *
 * @example `<div in:grow out:grow>…</div>`
 * @param node - the wrapper being shown or hidden
 * @param _params - unused (Svelte transition signature)
 * @param options - Svelte passes `direction` ('in' | 'out' | 'both')
 * @returns a Svelte transition config
 */
export function grow(node: HTMLElement, _params?: unknown, options?: { direction?: 'in' | 'out' | 'both' }) {
    const h = node.offsetHeight;
    const out = options?.direction === 'out';

    return {
        duration: still() ? 0 : out ? closeMs(h) : openMs(h),
        easing: out ? easeOutCubic : easeOutBack,
        css: (t: number) => `height: ${t * h}px; opacity: ${Math.min(1, t * 1.4)}; overflow: clip`,
    };
}

/**
 * Svelte transition: a quick fade for chrome that appears and disappears (notices,
 * tooltips) — on the fluent clock's small end.
 * @param _node - the element (unused)
 * @param params - `ms` overrides the duration, `y` adds a rise in px
 * @returns a Svelte transition config
 */
export function rise(_node: HTMLElement, params?: { ms?: number; y?: number }) {
    const y = params?.y ?? 6;

    return {
        duration: still() ? 0 : (params?.ms ?? 200),
        easing: easeOutCubic,
        css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * y}px)`,
    };
}
