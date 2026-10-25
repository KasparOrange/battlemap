# roadmap — where battlemap goes after parity

Everything planned, wished or proposed, ranked. Parity (`parity.md`) comes first and is not
repeated here; this is what v2 builds on top of it. Written 2026-10-25 from the v1 tracker,
`docs/action.md`, `feature-ideas.md`, `ai-art.md`, the effects demos (`docs/mockups/effects/`),
the tabletop board and past sessions (dates and session ids in **Source**).

**The intent every item is checked against:** the TV lies flat under real miniatures (one square =
one inch, 34 × 19 window); the DM controls everything from a tablet; HP, initiative and dice stay
on paper; the app makes the *map* amazing and gives the DM reveal and atmosphere tools. Konrad
(2026-10-24): cool effects "might be a really big part of what we're trying to do" — without
jeopardising the TV as the main platform.

**Tiers:** **Next** = right after parity, the next few weeks · **Soon** = the following months ·
**Later** = someday, stretch, or blocked on something. **⚠** = conflicts with the tabletop focus
(say why, keep it out unless Konrad decides otherwise). *Ahead* = a proposal of this inventory, not
yet discussed with Konrad.

## Next

| # | Item | Why | Source |
|---|---|---|---|
| N1 | **WebView gate test on the Xiaomi box**: map + fog + water shader + 3 sprite sheets + 1 Rive, frame and GPU time, memory (`dumpsys meminfo`), against the Flutter app | the rewrite only stands if the 2 GB / Mali-G310 box runs it; it also prices every effect below | 26-10-24 e9f7fa92, `v2/shell/probe/` (not run: devices at Juri's offline 26-10-25) |
| N2 | **Import v1's games and maps** — a bot-role script reads v1's `lib.listing` (full session JSON) and map files (shared library / `vpsUrl` / chunks) and writes them into v2 storage; v1 itself stays untouched | every game lives only on the box; switching apps must not lose "Juri's dungeon" or the three-map game | *Ahead* |
| N3 | **Shell basics on Google TV**: home-row entry (LEANBACK_LAUNCHER, banner, leanback feature, touchscreen not required), start into TV mode on boot with `/restore`, keep-awake settings applied by the installer, one fixed signing key | v1 was launchable only via Settings ▸ Apps; after a power cut the box sat on the home screen; Google TV slept after 4 h | `action` "direction: Android", `setup` "box unplugged", "box asleep" |
| N4 | **Table test of what v1 never tested at the table**, on v2: circle reveal + live preview, trim edges (find the value for Juri's maps), template disc vs the acrylic disc (20 ft = 4 in), DM layers, several maps, link import, Measure the TV with overscan, 1-inch base on every edge, big castle memory | most v1 features from 2026-10-10 say "needs a test at the table" | `action.md` sections |
| N5 | **Effects foundation**: one effect layer on the table with its own clock (render on demand, animate only while something plays), the effects library with manifest + licence (`v2/assets`), a measured cost grade per effect (A–E on the box), per-map on/off | everything visual below builds on it; Konrad's strongest wish | 26-10-24/25 (e9f7fa92, 5ce9f743), `docs/effects.md` |
| N6 | **Tap-to-cast spell effects**: the DM picks fireball / lightning / explosion / magic circle / smoke / healing glow and taps a square (or the template disc's middle); sprite sheets sized in squares (a 20 ft fireball = 4 sq radius, matches the disc), one-shot with ease-out, 12 fps "on twos" | the most drama per effort; sprite sheets grade B·C·A, no decoder limit; the minis stand in it | feature-ideas "location-triggered effects", tracker #9, 26-03-18 VPS f49f89ea, demos `sprite.html` |
| N7 | **Map life from the map's own data**: torch/brazier flicker at the .dd2vtt lights (v1 torch glow, better look), water shimmer shader on water areas (pool alone grade B), wind on painted trees/vegetation (B·A·A) — each off by default, per map | the map comes alive with zero DM effort; the data (lights, water/vegetation areas) is already in the files | feature-ideas, demos `shader.html` / `wind.html`, ai-art "paint the still, render what moves" |
| N8 | **Curtain**: one button holds the TV on black (or a "next scene…" plate) until released, with a fade; the remote's back still works | setting up a map or minis without spoilers; v1's fade lasts 3 s only | *Ahead* |
| N9 | **Several-maps gaps**: remove a map from a game, rename maps and sessions (v1 has `lib.renameSession`, no UI), DM layers travel with a shared-library map | real game-night friction (Juri's dungeon re-adds two layers every game) | `action` leftovers |
| N10 | **Select a token by tapping it on the map** (then hide, rename, jump from there) | open gap; the list is the only way today | `action` leftovers, archive 26-10-10 19:54 |
| N11 | **Remote fallback in the TV library**: resume a game and pick a map of the open game with D-pad + OK | v1's remote can only start a new game — breaks the fallback rule's spirit when the tablet dies mid-game | `action` leftovers, parity TV-14 |
| N12 | **Server ops**: relay + file server restart on their own and exit on SIGTERM, upload cleanup on a timer, CORS on every answer | v1's services stayed down after reboots; an old relay survived SIGTERM | `setup` "starting services", parity SV-07, RL-08 |

## Soon

| # | Item | Why | Source |
|---|---|---|---|
| S1 | **Ambient soundscapes** from the TV speakers: a base loop per scene (dungeon, forest, tavern, storm) + one-shot sounds (door slam, thunder, sword clash), volumes per layer on the tablet, fade between | Konrad: "animations and background music" belong to pen & paper; costs no GPU | feature-ideas, 26-04-02 VPS, `SessionSettings.ambientSound` |
| S2 | **Scene presets**: save "scene" = map + table window + lights/weather/time + soundscape + running ambient effects; one tap at the table recalls it (with the curtain, N8) | game-night pacing: the DM prepares, the table just flows | *Ahead* |
| S3 | **Weather and time of day**: GPU particles (rain, snow, embers, dust; ≤ 3,000 small = grade B), a day/night tint + colour temperature slider, a dim-the-table slider for dark rooms | the rest of the "atmosphere" tab v1 promised | feature-ideas, demos `particles.html` |
| S4 | **Reveal animations**: fog rolls back with wisps / burns away / dissolves when the DM reveals (instead of v1's 0.5 s fade); cloud fog's lopsided bumps fixed | the reveal is the table's most frequent dramatic moment | feature-ideas "animated fog edges", 26-04-03 VPS |
| S5 | **Light sources and walls**: light pools cast from the .dd2vtt lights, stopped by walls; the DM taps a light to switch it on/off; optional "lit = revealed" for a torch carried into a room | real dynamic lighting at map level — no per-character vision | plan "extension points" (light rendering, ray cast), *Ahead* — ⚠ only if it stays map-level: per-token line of sight is digital mode |
| S6 | **DM-only notes on the map**: pins/sticky notes ("trap here", "DC 15 lock") seen only on the tablet, saved per map, travelling with library maps | the DM's secrets at the exact spot; DM layers are pictures, not notes | feature-ideas "map annotations" |
| S7 | **Prepared reveal areas**: in prep the DM outlines named areas (polygon or squares: "the crypt", "behind the secret door"); at the table one tap reveals one, with S4's animation | picture maps have no walls, so Room reveal can't help there; prep beats painting live | *Ahead* |
| S8 | **Spotlight**: the DM taps a square → a soft light ring under that mini and the rest of the table dims a little; tap again to move it, no list, no names, no order | shows whose turn it is or where the moonlight falls without a digital initiative tracker | feature-ideas "miniature spotlight", *Ahead* "turn spotlight" |
| S9 | **Secret doors and traps**: doors/marks hidden from players until the DM marks them found, then shown with an effect (drawn doors appear; painted ones uncovered from a DM layer) | Juri's secret rooms were solved by hand per map | ai-art "editing a published map", *Ahead* |
| S10 | **Handouts**: a picture or letter shown on the TV in the mask margin or as a full-screen pause, or sent to player phones (S12) | clues and letters without printing; ⚠ full-screen handouts cover the minis' area — prefer the margin or the phones | *Ahead* |
| S11 | **Timer on the TV**: a countdown ring at the table edge, started from the tablet | timed puzzles, tension | feature-ideas |
| S12 | **Player view in a browser**: read-only, only what the TV shows (revealed areas, no DM marks), handouts arrive there; QR code on the TV; later remote players over call-lab | players at the far end, a player at home; Konrad named web participation via call-lab a main motive for the rewrite | 26-10-24 e9f7fa92, 26-09-06 b408acee, *Ahead* — ⚠ never a second control surface; remote players are a stretch of the at-the-table focus |
| S13 | **Offline / LAN play** (#39): the server (Rust, N13) runs in the TV box's shell, the tablet's shell or a mini PC, TV and tablet connect locally, no internet | game nights at a friend's place or on a hotspot; Konrad insisted on keeping it (26-09-05) | tracker #39, `action` "kept on purpose" |
| S14 | **Backups and export**: export a game (all its maps' state) or the whole library as one bundle (zip, WebP assets); a nightly copy on the server | the TV is the only copy of every game; storage changes in v2 | *Ahead* |
| S15 | **Photo import with perspective fix**: photograph a printed map page, the tablet straightens it, then grid detection + squares dialog | Juri's photographed dungeon page needed a hand-written warp script (grid drifting 51–52 px) | ai-art "on the table", *Ahead* |
| S16 | **PDF page picker** (and several pages as several maps of one game) | published adventures are multi-page PDFs; v1 renders page 1 only | parity UP-03 |
| S17 | **Prep mode**: build a game on the tablet without the TV (stage reveals, layers, notes, scenes, the TV view rendered locally), then "go live" | DMs prep at home, away from the table | *Ahead* |
| S18 | **Picture variants mid-game**: swap the map's picture for a variant on the same geometry (night, burning, flooded, after the battle) keeping fog, doors and tokens | "the inn is on fire" moment; the AI pipeline makes variants cheaply | ai-art "variants on the same geometry" |
| S19 | **AI map pipeline step 6**: 4K finals + tuning grid (≈ $1 at 1K), fold the doorway fix pass into `paint`, try the crypt, upload packed maps straight into the shared library; billing on the ko account | the pipeline works (judge 8/10) but is untuned and manual at the end | ai-art "Next — pick up here", `action` leftovers |
| S20 | **More shapes for drawing**: circles, rectangles, arrows, lines as permanent drawings | quicker than freehand for "the wall collapses here"; tracker #11 | tracker #11 |
| S21 | **Rive set pieces with states**: chests, traps, a portal, a boss in its pit (idle / attack / hurt), triggered from the tablet | the demo graded B·A·B; things that change state on cue — ⚠ never as a stand-in for a mini or a token with stats | demos `rive.html`, tabletop board proposal |
| S22 | **Tree sprites and the ambient set**: pine, birch, dead tree as 12 fps sheets (the first one: 0.74 MB, B·B·A), KTX2/Basis textures for memory grade A, key-colour rule (no green behind a green tree) | painted forests that move cheaply | 26-10-24 horizon cdf6700f |
| S23 | **Installable web companion** (PWA) for phones without the APK (an iPhone DM) | the web build is the fallback companion | 26-09-06, 26-03-20 VPS |
| S24 | **Session thumbnails with their fog** for the Continue card and the game list | tell game nights apart at a glance | feature-ideas |
| S25 | **Look at Atlas VTT with Juri** and pick 2–3 features (separate player view, fog, dice) | Juri's inspiration; cheap research before building S12 | 26-10-14 e5772cc3 |
| S26 | **Hardware decision after N1**: refurbished office mini PC (M720q ≈ €169, 8 GB, Chromium kiosk — recommended, not bought) vs Fire TV Cube (2 GB, ~1.5× CPU; study said skip) as the shell's second target | effects headroom; the box's 2 GB disappointed Konrad | 26-10-24 hardware study — note: the v2 brief names Fire TV as a target, the study said skip the Cube: decide |

## Later

| # | Item | Why | Source |
|---|---|---|---|
| L1 | **AI maps from the tablet**: describe a map in words → layout spec editable on the phone grid → 1K drafts → 4K final → library; style presets per campaign; repaint one room | the pipeline's UX end state; needs unattended judging (Gemini Flash) | ai-art "UX later" |
| L2 | **Published-map edit from the tablet**: mark labels, S/T marks and secret rooms on the phone → `mapgen edit` → clean map + DM layers | Juri's request, done by hand once (≈ $0.55) | ai-art "editing a published map" |
| L3 | **Generated art beyond maps**: NPC/creature reference sheets (versioned, "same character, add a scar"), items keyed off flat green, effect sprites painted on black and drawn additive | one consistent world; feeds N6 and token pictures | ai-art "beyond maps" |
| L4 | **Big generated maps in tiles** with overlap and blended seams | beyond the model's image size | ai-art "big maps" |
| L5 | **Content ecosystem**: maps as JSON records in git, zip bundles with WebP assets instead of base64 in `.dd2vtt`, UVTT only for import/export, adventure bundles, a marketplace much later | sharing and versioning maps across tables; nine open questions on the board | 26-10-22 e9f7fa92 proposal |
| L6 | **Voice at the table** through hark ("reveal the crypt", "play thunder", "curtain") | hands-free DM; hark exists in the fleet | tabletop board "Growing" |
| L7 | **horizon as the DM's prep canvas**, exporting an adventure bundle (maps, scenes, notes) | prep where Konrad already thinks | tabletop board "Growing" |
| L8 | **Several TVs as one table** (two boxes side by side, one window split across them) | bigger tables; the relay has one table slot today | *Ahead* |
| L9 | **Two companions** (co-DM or a second tablet with a subset of tabs) | a co-DM running sound and effects | *Ahead* |
| L10 | **Session journal**: an automatic log of the night (maps, rooms revealed when, effects, scenes) → a "previously on" recap | campaign memory without notes | *Ahead* |
| L11 | **Hero video loops** (portal, lava river): one hardware-decoded clip at a time, never the default water | grade A·B·A but 1–2 decoders on the box | demos `video.html` |
| L12 | **Bloom / glow** on lights and spells (tracker #10) | polish once N5–N7 run within budget | tracker #10 |
| L13 | **Mini tracking by camera** over the table to move tokens by themselves | tokens follow real minis without DM taps; needs hardware and vision — speculative | *Ahead* |
| L14 | **Digital mode** (dormant code, parity `D` items): initiative tracker with active-token glow, token sizes 2×2–4×4, token pictures, per-token line of sight, 3D dice on the TV, automated damage, condition durations, spell slots, stat blocks, combat log | the stretch goal "far down the roadmap" | feature-ideas "digital mode", CLAUDE.md vision — ⚠ HP, initiative and dice stay on paper |
| L15 | **Tokens linked to ledger characters** with live HP and conditions on the TV | proposed on the tabletop board | tabletop board step 6 — ⚠ HP on the TV is digital mode |

## Settled, rejected or contradictory — keep out unless Konrad reopens

| Item | Status |
|---|---|
| Narrative text overlay ("You enter the throne room…" on the TV) | Konrad said no (26-04-03, VPS 4ab557f0) but `feature-ideas.md` still lists it "next up" — ⚠ treat as rejected; handouts (S10) cover the need |
| N13 | **Server in Rust, one binary for the VPS and the TV box**: port `server/` (relay rooms, files + Store as, library, backups, link fetch, `/log`) to Rust (axum + tokio); the wire format defined once, the other side's types generated; built for x86_64 Linux (VPS) and aarch64 Android, embedded in the shell (JNI or a bundled executable) so the box itself hosts the table for LAN play (S13); the Bun server's 53 tests become the contract | Bun can't run on Android, a Kotlin rewrite would duplicate the server; a Rust relay costs a few MB on a 2 GB box; matches the stack (mwlog-rs, latrine) | Konrad 26-10-25 (orchestrator session) — wave 3 |
| GIF effects, video as the default water, Lottie on the table, animation frames drawn by an image model (they "boil") | rejected in the effects study (GIF A·C·C "never ship"; Lottie A·A·C rebuilds paths on the CPU — tablet UI only) |
| Shorebird OTA, APK self-update, remote deploy over the relay | obsolete: v2 updates by reload (parity UD-04/05) |
| Hive, objectbox, isar, SQLite/MongoDB as content source | v2 storage + JSON records (L5) |
| Midjourney (no API), FLUX self-hosted (no GPU then — Juri's RTX 4060 Ti exists now), Google AI Pro subscription | API pipeline on Nano Banana 2.1 chosen |
| Door swing for Dungeondraft maps | their doors are painted into the picture, a drawn leaf would double them — swing stays for maps with `draw_doors` |

## The ten that matter most

1. N1 gate test on the box — decides how much of everything else is affordable.
2. N2 import v1's games and maps — the switch must lose nothing.
3. N5 effects foundation — every visual feature depends on it.
4. N6 tap-to-cast spell effects — Konrad's top wish, biggest table moment.
5. N7 map life from the map's own data — atmosphere without DM effort.
6. N3 shell on the Google TV home row, boot restore, awake.
7. N8 + S2 curtain and scene presets — pacing at the table.
8. S1 ambient soundscapes — atmosphere at zero GPU cost.
9. N9 + N10 several-maps gaps and token tap — game-night friction.
10. S13 offline / LAN play — the game night that has no internet.
