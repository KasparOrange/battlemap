/**
 * Geometry and bookkeeping for anchored planes (menus, the stepper's numpad) — the part of
 * {@link Plane} that is plain arithmetic, kept out of the component so it stays readable.
 *
 * A plane is the activator's own surface grown out (fluent rule 1): it opens below the
 * activator when there is room, else above; it lines up with the activator's start edge, or
 * its end edge when that keeps it on screen; the joined corners are squared so activator
 * and plane read as one surface.
 */

/** Where a plane sits relative to its activator. */
export interface PlanePlacement {
    /** The plane grows down from the activator's bottom edge, or up from its top edge. */
    joint: 'down' | 'up';
    /** Which activator edge the plane lines up with. */
    align: 'start' | 'end';
    /** Fixed-position left edge in px. */
    left: number;
    /** Fixed-position top edge in px (joint down) — undefined for joint up. */
    top?: number;
    /** Fixed-position bottom edge in px (joint up) — undefined for joint down. */
    bottom?: number;
    /** The plane's minimum width in px (at least the activator's). */
    minWidth: number;
    /** The tallest the plane may grow before its content scrolls, in px. */
    maxHeight: number;
    /** The activator's offset from the plane's left edge, in px (for the joint cover). */
    jointX: number;
    /** The activator's width, in px. */
    jointW: number;
}

/**
 * Works out where a plane goes.
 * @param anchor - the activator's rect (getBoundingClientRect)
 * @param planeW - the plane's natural width in px
 * @param planeH - the plane's natural height in px
 * @param margin - the free edge to keep to the viewport, in px (THE GAP)
 * @param viewport - the viewport size (defaults to the window)
 * @returns the placement to apply
 */
export function placePlane(
    anchor: DOMRect,
    planeW: number,
    planeH: number,
    margin: number,
    viewport = { w: window.innerWidth, h: window.innerHeight },
): PlanePlacement {
    const width = Math.max(planeW, anchor.width);
    const below = viewport.h - anchor.bottom - margin;
    const above = anchor.top - margin;
    const joint = planeH <= below || below >= above ? 'down' : 'up';
    const fitsStart = anchor.left + width <= viewport.w - margin;
    const align = fitsStart ? 'start' : 'end';
    let left = align === 'start' ? anchor.left : anchor.right - width;

    left = Math.max(margin, Math.min(left, viewport.w - margin - width));

    // overlap the activator by one hairline so the seam disappears under the joint cover
    const overlap = 1;

    return {
        joint,
        align,
        left,
        top: joint === 'down' ? anchor.bottom - overlap : undefined,
        bottom: joint === 'up' ? viewport.h - anchor.top - overlap : undefined,
        minWidth: anchor.width,
        maxHeight: Math.max(120, joint === 'down' ? below : above),
        jointX: anchor.left - left,
        jointW: anchor.width,
    };
}

let closeCurrent: (() => void) | null = null;

/**
 * One plane at a time (fluent rule 5): registers a plane as the open one and closes the plane
 * that was open before.
 * @param close - closes the plane being opened, should another one open later
 * @returns a function to call when this plane has closed (clears the registration)
 */
export function claimPlane(close: () => void): () => void {
    if (closeCurrent && closeCurrent !== close) closeCurrent();

    closeCurrent = close;

    return () => {
        if (closeCurrent === close) closeCurrent = null;
    };
}

/**
 * Svelte action: moves the node out to a host where `position: fixed` means the viewport —
 * the open modal dialog it sits in (the top layer), else the nearest themed wrapper, else
 * <body>. A sheet that slides with a transform would otherwise trap a fixed child.
 * @param node - the element to move
 * @param from - an element at the node's logical place (the activator) to find the host from
 * @returns the action's destroy hook (puts nothing back — the node is removed with its owner)
 */
export function portal(node: HTMLElement, from?: HTMLElement | null) {
    const start = from ?? node.parentElement;
    const host = start?.closest('dialog[open]') ?? start?.closest('[data-theme]') ?? document.body;

    host.appendChild(node);

    return {
        destroy() {
            node.remove();
        },
    };
}
