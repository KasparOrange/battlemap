# Sound library

The sounds the TV plays to the room (roadmap S1, `features.md` "Sound"): 13 ambient beds
(seamless loops) and 12 one-shots, 5.6 MB in all. Shipped in `v2/assets/sounds/`, served as
`/app/sounds/` (dev: the Vite plugin in `app/vite.config.ts`; build: copied to `dist/sounds/`,
so it travels in the shell's bundle like the effects library).

```
assets/sounds/
  index.json            the catalogue the app reads (SoundEntry, app/src/lib/sound/catalogue.ts)
  beds/<id>.ogg         ambient loops
  oneshots/<id>.ogg     one-shots
  tools/sources.toml    one table per sound: raw file, author, page, licence, effects ids
  tools/build.py        raw downloads → shipped files + index.json (not shipped)
  tools/probe_formats.ts which formats the browsers' Web Audio decodes, exactly
```

## Licences

Every shipped sound is **CC0** (public domain): Freesound (licence checked on each sound's own
page), OpenGameArt (CC0 packs and files), Kenney (RPG Audio). Fine for the table and for a paid
product; no credit required (the Sound tab still names the sources). Nothing non-commercial,
nothing "personal use only". `build.py` refuses any licence other than CC0 / CC-BY 3.0 / 4.0 and a
CC-BY sound without its credit line; a test checks the shipped index the same way. Two CC-BY 3.0
candidates were downloaded and left out (dklon's big explosion, InspectorJ's close thunder) —
CC0 ones did the job.

## Format

**Opus in Ogg, mono, 48 kHz, 64 kbit/s.** Chromium (the Android TV WebView, the tablet) and
WebKit both decode it with `decodeAudioData` at its exact length — no encoder priming at the
start, so a loop has no gap at its seam (`probe_formats.ts`: Ogg/Opus, WebM/Opus and AAC/M4A
all decode; AAC adds 256 samples). Mono because the TV lies flat with the players all round it:
stereo buys nothing there and doubles the decoded memory. 48 kbit/s was tried: libopus then
cuts the top band and rain lost 2 LU of loudness — 64 kbit/s keeps it full band.

## How a file is made (`build.py`)

Raw downloads live in `v2/assets-src/sounds/<source>/` (gitignored, one folder per source,
untrusted: only ffmpeg reads them; the script runs with `python3 -I`).

- **Beds:** the steadiest 63 s of the source (lowest spread of short-term loudness, a loud
  event penalised), its last 3 s crossfaded equal-power into its head, so the 60 s loop wraps
  on the source's own continuity. A sparse, peaky bed (drips, crackling fire, the market) is
  limited *before* it is looped (≤ 9 dB) so it isn't 10 LU under the rest; a limiter on the loop
  would carry its state across the seam. Target **-23 LUFS**, true peak ≤ -1 dBTP. The build
  prints each seam: the sample step at the wrap against the file's own 99th-percentile step
  (all ≤ 0.6) and the level of the last against the first 200 ms.
- **Rhythmic beds** (`beat = true`, the war drums): the phrase is found by autocorrelation of
  the energy envelope (9.07 s), the loop is the most phrases that still repeat well (two:
  18.14 s — the track drifts over a minute), the seam a 30 ms fade on the beat.
- **One-shots:** silence trimmed at both ends, 3 ms fade in, 60 ms fade out, **-16 LUFS** (a
  sound under 1.5 s by its loudest 400 ms), true peak ≤ -1 dBTP — the short transients (click,
  coins, slam) are peak-bound and sit a little lower.
- The encoder shifts loudness and peaks a little: the result is measured and the gain corrected.

Adding a sound: download into a new `assets-src/sounds/<source>/` folder, add a `[[sound]]`
table to `sources.toml` (licence from the sound's own page), run
`python3 -I v2/assets/sounds/tools/build.py <id>`, then `--table` for the catalogue below.

## Memory

A decoded mono 60 s bed is 11.5 MB (float32); three beds plus the one-shots stay under the
TV's 48 MB sound budget (`buffers.ts`). Sounds are decoded on first use, kept while they play,
and dropped least recently used past the budget or on the shell's memory warning.

## Catalogue

| Id | Kind | Name | Group | Length | Effects | Author | Licence |
|---|---|---|---|---|---|---|---|
| `dungeon-drips` | bed | Dungeon drips | places | 60.0 s | — | [Sclolex](https://freesound.org/s/177958/) | CC0-1.0 |
| `crypt` | bed | Crypt | places | 60.0 s | — | [TheMovieMacher](https://freesound.org/s/468235/) | CC0-1.0 |
| `tavern` | bed | Tavern crowd | places | 60.0 s | — | [o_ciz](https://freesound.org/s/475505/) | CC0-1.0 |
| `city` | bed | Market street | places | 60.0 s | — | [hobonski](https://freesound.org/s/703644/) | CC0-1.0 |
| `forest-day` | bed | Forest by day | nature | 60.0 s | — | [AbsynthFactory](https://freesound.org/s/643731/) | CC0-1.0 |
| `forest-night` | bed | Forest at night | nature | 60.0 s | — | [raoul_slayer](https://freesound.org/s/203598/) | CC0-1.0 |
| `cave-wind` | bed | Cave wind | nature | 60.0 s | — | [KolbyRFX](https://freesound.org/s/852822/) | CC0-1.0 |
| `campfire` | bed | Campfire | nature | 60.0 s | — | [Spandau](https://freesound.org/s/40699/) | CC0-1.0 |
| `ocean` | bed | Ocean waves | nature | 60.0 s | — | [Ninochka](https://freesound.org/s/440712/) | CC0-1.0 |
| `rain` | bed | Rain | weather | 60.0 s | — | [timothyd4y](https://freesound.org/s/527500/) | CC0-1.0 |
| `storm` | bed | Thunderstorm | weather | 60.0 s | — | [Fhmediahmo](https://freesound.org/s/866246/) | CC0-1.0 |
| `battle-drums` | bed | War drums | mood | 18.1 s | — | [BaDoink](https://freesound.org/s/527829/) | CC0-1.0 |
| `eerie-hum` | bed | Eerie hum | mood | 60.0 s | — | [kkenny101](https://freesound.org/s/865550/) | CC0-1.0 |
| `door-creak` | oneshot | Door creak | doors | 3.7 s | — | [Ryding](https://freesound.org/s/125957/) | CC0-1.0 |
| `door-slam` | oneshot | Door slam | doors | 1.3 s | — | [NachtmahrTV](https://freesound.org/s/571797/) | CC0-1.0 |
| `trap-click` | oneshot | Trap click | doors | 0.3 s | — | [Kenney](https://kenney.nl/assets/rpg-audio) | CC0-1.0 |
| `coin-jingle` | oneshot | Coins | doors | 0.7 s | — | [Kenney](https://kenney.nl/assets/rpg-audio) | CC0-1.0 |
| `sword-clash` | oneshot | Sword clash | combat | 2.1 s | impact-hit | [Christopherderp](https://freesound.org/s/364531/) | CC0-1.0 |
| `monster-roar` | oneshot | Monster roar | combat | 2.8 s | — | [NicknameLarry](https://freesound.org/s/489901/) | CC0-1.0 |
| `explosion` | oneshot | Explosion | combat | 1.3 s | explosion-arcane, eruption, shatter, ground-crack-impact | [tinyworlds](https://opengameart.org/content/explosion-0) | CC0-1.0 |
| `thunder` | oneshot | Thunder | weather | 4.2 s | thunderwave, call-lightning | [roboroo](https://freesound.org/s/436790/) | CC0-1.0 |
| `lightning` | oneshot | Lightning crack | weather | 5.1 s | lightning-bolt, lightning-strike, breath-lightning-line | [Terry93D](https://freesound.org/s/327986/) | CC0-1.0 |
| `fireball` | oneshot | Fireball | magic | 1.2 s | fireball, fire-bolt, burning-hands, breath-fire-cone, scorched-earth | [Julien_Matthey](https://freesound.org/s/346917/) | CC0-1.0 |
| `magic-chime` | oneshot | Magic chime | magic | 2.0 s | magic-missile, misty-step, dancing-lights, glint, ward-rune | [newagesoup](https://freesound.org/s/351408/) | CC0-1.0 |
| `heal` | oneshot | Heal | magic | 1.0 s | cure-wounds, sacred-flame | [colorsCrimsonTears](https://freesound.org/s/562292/) | CC0-1.0 |
