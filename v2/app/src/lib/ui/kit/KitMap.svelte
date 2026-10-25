<!--
  KitMap — a hand-drawn stand-in for a battle map, used only by the kit gallery's
  compositions (a dungeon of 44 × 28 squares: rooms, a cave, water, doors, torches, the DM's
  view of the fog, tokens and the players' window). Plain SVG, no assets.

  Props:
  - fog: boolean — draw the DM's view of the fog (default true)
  - tokens: boolean — draw a few token markers (default true)
  - frame: boolean — the players' window, dashed gold (default true)
  - grid: boolean — battlemap's grid lines over everything (default true)
  - tv: boolean — the TV's view: fog fully dark, no DM marks, no frame
-->
<script lang="ts">
    interface Props {
        /** The DM's view of the fog. */
        fog?: boolean;
        /** Token markers. */
        tokens?: boolean;
        /** The players' window. */
        frame?: boolean;
        /** Grid lines. */
        grid?: boolean;
        /** The TV's view: fog opaque, no frame. */
        tv?: boolean;
    }

    let { fog = true, tokens = true, frame = true, grid = true, tv = false }: Props = $props();

    const C = 32;
    const W = 44 * C;
    const H = 28 * C;
    const uid = Math.random().toString(36).slice(2, 8);

    /** rooms in squares: x, y, w, h */
    const rooms = [
        { x: 3, y: 3, w: 10, h: 8 },
        { x: 17, y: 2, w: 12, h: 9 },
        { x: 33, y: 4, w: 8, h: 7 },
        { x: 4, y: 16, w: 9, h: 9 },
        { x: 18, y: 15, w: 11, h: 10 },
    ];
    const corridors = [
        { x: 13, y: 6, w: 4, h: 2 },
        { x: 29, y: 6, w: 4, h: 2 },
        { x: 7, y: 11, w: 2, h: 5 },
        { x: 13, y: 19, w: 5, h: 2 },
        { x: 22, y: 11, w: 2, h: 4 },
    ];
    const doors = [
        { x: 13, y: 6.5, w: 0.35, h: 1, v: true },
        { x: 16.65, y: 6.5, w: 0.35, h: 1, v: true },
        { x: 7.5, y: 11, w: 1, h: 0.35, v: false },
        { x: 22.5, y: 14.65, w: 1, h: 0.35, v: false },
        { x: 32.65, y: 6.5, w: 0.35, h: 1, v: true },
    ];
    const pillars = [
        [20, 5],
        [26, 5],
        [20, 9],
        [26, 9],
        [21, 18],
        [26, 18],
        [21, 22],
        [26, 22],
    ];
    const torches = [
        [3.4, 3.4],
        [12.6, 3.4],
        [17.4, 2.4],
        [28.6, 2.4],
        [18.4, 15.4],
        [28.6, 15.4],
        [33.4, 4.4],
    ];
    const marks = [
        { x: 9.5, y: 7.5, c: 'var(--mark-1)', n: '1' },
        { x: 10.5, y: 8.5, c: 'var(--mark-3)', n: '2' },
        { x: 8.5, y: 8.5, c: 'var(--mark-4)', n: '3' },
        { x: 14.5, y: 6.5, c: 'var(--mark-5)', n: '4' },
        { x: 23.5, y: 6.5, c: 'var(--mark-2)', n: 'G' },
    ];
</script>

<svg class="kit-map" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
        <pattern id="stone-{uid}" width={C} height={C} patternUnits="userSpaceOnUse">
            <rect width={C} height={C} fill="#6a5d49" />
            <rect x="1" y="1" width={C / 2 - 2} height={C / 2 - 2} rx="2" fill="#71634e" />
            <rect x={C / 2 + 1} y={C / 2 + 1} width={C / 2 - 2} height={C / 2 - 2} rx="2" fill="#645744" />
            <path d="M0 {C / 2}H{C}M{C / 2} 0V{C}" stroke="#4d4335" stroke-width="1.2" opacity="0.6" />
        </pattern>
        <pattern id="rock-{uid}" width="96" height="96" patternUnits="userSpaceOnUse">
            <rect width="96" height="96" fill="#211d18" />
            <circle cx="20" cy="24" r="14" fill="#1b1814" />
            <circle cx="70" cy="60" r="20" fill="#1d1a15" />
            <circle cx="64" cy="14" r="7" fill="#262119" />
            <circle cx="16" cy="76" r="9" fill="#25201a" />
        </pattern>
        <pattern id="grid-{uid}" width={C} height={C} patternUnits="userSpaceOnUse">
            <path d="M{C} 0V{C}H0" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1" />
        </pattern>
        <radialGradient id="torch-{uid}">
            <stop offset="0" stop-color="#ffcf7a" stop-opacity="0.55" />
            <stop offset="1" stop-color="#ffcf7a" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="water-{uid}" cx="0.45" cy="0.4">
            <stop offset="0" stop-color="#3d7a8c" />
            <stop offset="1" stop-color="#244a58" />
        </radialGradient>
    </defs>

    <rect width={W} height={H} fill="url(#rock-{uid})" />

    <!-- the cave -->
    <path
        d="M{34 * C} {14 * C} C {38 * C} {13 * C}, {42 * C} {15 * C}, {41.5 * C} {19 * C} S {39 * C} {26 * C}, {35 * C} {25.5 * C} S {30.5 * C} {21 * C}, {31 * C} {18 * C} S {32 * C} {14.5 * C}, {34 * C} {14 * C} Z"
        fill="#5a4f3e"
        stroke="#2b241c"
        stroke-width="6"
    />
    <ellipse cx={37 * C} cy={20 * C} rx={3 * C} ry={2.2 * C} fill="url(#water-{uid})" stroke="#1e3a45" stroke-width="3" />
    <path d="M{29 * C} {20 * C}H{31.4 * C}" stroke="#5a4f3e" stroke-width={2 * C} />

    {#each [...rooms, ...corridors] as r, i (i)}
        <rect x={r.x * C} y={r.y * C} width={r.w * C} height={r.h * C} fill="url(#stone-{uid})" />
    {/each}
    {#each rooms as r, i (i)}
        <rect x={r.x * C} y={r.y * C} width={r.w * C} height={r.h * C} fill="none" stroke="#2b241c" stroke-width="7" />
    {/each}
    {#each corridors as r, i (i)}
        <rect x={r.x * C} y={r.y * C} width={r.w * C} height={r.h * C} fill="url(#stone-{uid})" />
    {/each}

    {#each pillars as [x, y], i (i)}
        <circle cx={(x ?? 0) * C} cy={(y ?? 0) * C} r={C * 0.42} fill="#3a3229" stroke="#2a231b" stroke-width="3" />
        <circle cx={(x ?? 0) * C - 4} cy={(y ?? 0) * C - 4} r={C * 0.16} fill="#4a4134" />
    {/each}

    <!-- a rug and a table -->
    <rect x={5 * C} y={18 * C} width={5 * C} height={5 * C} rx="6" fill="#6e2f2a" stroke="#4d1f1b" stroke-width="4" />
    <rect x={5.6 * C} y={18.6 * C} width={3.8 * C} height={3.8 * C} rx="4" fill="none" stroke="#b48a4a" stroke-width="2" opacity="0.7" />
    <rect x={35 * C} y={6 * C} width={4 * C} height={2 * C} rx="5" fill="#6b4a2b" stroke="#3e2a17" stroke-width="3" />

    {#each torches as [x, y], i (i)}
        <circle cx={(x ?? 0) * C} cy={(y ?? 0) * C} r={C * 2.2} fill="url(#torch-{uid})" />
        <circle cx={(x ?? 0) * C} cy={(y ?? 0) * C} r="5" fill="#ffb347" />
    {/each}

    {#each doors as d, i (i)}
        <rect x={d.x * C} y={d.y * C} width={d.w * C} height={d.h * C} fill="#9a7442" stroke="#3e2a17" stroke-width="2" />
    {/each}

    {#if grid}<rect width={W} height={H} fill="url(#grid-{uid})" />{/if}

    {#if fog}
        <!-- unrevealed: the right half and the lower rooms -->
        <path
            d="M{30 * C} 0H{W}V{H}H0V{14 * C}H{14 * C}V{12 * C}H{30 * C}Z"
            fill={tv ? '#0b0a08' : 'rgba(8, 7, 6, 0.6)'}
        />
        {#if !tv}
            <path
                d="M{30 * C} 0H{W}V{H}H0V{14 * C}H{14 * C}V{12 * C}H{30 * C}Z"
                fill="none"
                stroke="rgba(108, 180, 230, 0.55)"
                stroke-width="2"
                stroke-dasharray="6 6"
            />
        {/if}
    {/if}

    {#if tokens}
        {#each marks as m (m.n)}
            <circle cx={m.x * C} cy={m.y * C} r={C * 0.44} style:fill={m.c} stroke="#f6efe2" stroke-width="2.5" />
            <text x={m.x * C} y={m.y * C + 5} text-anchor="middle" class="kit-map-n">{m.n}</text>
        {/each}
    {/if}

    {#if frame && !tv}
        <rect
            x={2 * C}
            y={1 * C}
            width={34 * C}
            height={19 * C}
            fill="none"
            stroke="var(--accent)"
            stroke-width="3"
            stroke-dasharray="14 9"
            rx="4"
        />
        <rect x={34.4 * C} y={19.4 * C} width={C * 1.2} height={C * 1.2} rx="6" fill="var(--accent)" />
        <path
            d="M{34.75 * C} {20 * C}h{C * 0.5}M{35 * C} {19.75 * C}v{C * 0.5}"
            stroke="var(--accent-ink)"
            stroke-width="3"
            stroke-linecap="round"
        />
    {/if}
</svg>

<style>
    .kit-map {
        display: block;
        width: 100%;
        height: 100%;
    }

    .kit-map-n {
        font: 700 15px var(--font-value);
        fill: #15110c;
    }
</style>
