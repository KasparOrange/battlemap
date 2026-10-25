# companion

Companion mode: the DM's screens on the tablet (landscape, the main device) and the phone. The
look follows `docs/design.md`; the kit is `../ui/`.

| Folder / file | What |
|---|---|
| `CompanionApp.svelte` | the root: installs the services, routes picker → connecting → library → game, turns the TV's `tv.status` / `tv.notice` into a pill or notices, runs `checkServerChoice()` once (a remembered LAN table server that doesn't answer → the internet server) |
| `library/TablePicker.svelte` + `picker-logic.ts` | the first screen: **Tables nearby** (TVs on this Wi-Fi hosting the game themselves — found by mDNS in the Android shell, else the TV's short code typed in) above **Online tables** (the server's list); every row says where its game runs (*On the TV* / *Online*) and shows the code the TV shows |
| `library/` | the library (the TV's games, Continue card, backups, the shared map library, game export / import) and the services seam (`services.ts`, implemented on the app's modules in `app-services.ts`) |
| `dialogs/` | getting a map in (`MapImport`: read → squares dialog → upload only once confirmed, so a cancelled import leaves nothing on the server), the grid editor, the calibration dialog |
| `game/` | the game screen (map + dock / bottom sheet), its context, the tab registry (`tabs.ts`: every `tabs/<id>/tab.ts`), undo |
| `tabs/` | one folder per tab: Tokens, Fog, Draw, Measure, Effects (looping previews of sprite-sheet effects on hover / focus and for the armed one — `preview.ts`), View, Game; `scenes/` belongs to the curtain + scene presets work |
| `input/` | gestures on the map: one finger = the tab's tool, two = the camera; throttling |
| `developer/` | logs and diagnostics: versions, connection, the page's last 500 log lines (the logger's `logRing`), Send diagnostics |
| `session-settings/` | a game's settings (tabs shown, walls debug) |

Tests: `bun test` next to the logic (`*.test.ts`); flows in `e2e/companion-*.e2e.ts`
(`companion-screens` takes the screenshots for a visual pass).
