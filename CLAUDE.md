# Battlemap - AI Assistant Guide

## Project Vision

A **Flutter app** that turns a TV (laid flat as a table surface) into a D&D digital battlemap. The same app runs in two modes:

- **Table Mode** — fullscreen on the TV, displays the grid, tokens, maps, and effects
- **Companion Mode** — runs on a phone, used to control the table: draw on the map, place tokens, trigger effects

Both modes are the **same Flutter APK**. The TV box runs the Table Mode APK installed via sideload. The phone runs the same APK in Companion Mode, connecting to the TV over local Wi-Fi.

**Web builds** (GitHub Pages) are used only for rapid testing during development — the production target is native Android APK.

## Hardware

The target TV device is the **Xiaomi TV Box S 3rd Gen** (~$60-70), chosen after comparing alternatives:

| Spec | Xiaomi Box S 3rd Gen | Google TV Streamer | Why it matters |
|------|---------------------|-------------------|----------------|
| CPU | Amlogic S905X5M, A55 x4 @ **2.5 GHz** | MediaTek MT8696, A55 x4 @ 2.0 GHz | Flutter UI thread performance |
| GPU | **Mali-G310 V2 (~42 GFLOPS)** | PowerVR GE9215 (~20 GFLOPS) | Glow effects, alpha blending, sprites |
| RAM | 2 GB | 4 GB | Manageable with smart texture management |
| Wi-Fi | **Wi-Fi 6** | Wi-Fi 5 | Phone-to-TV communication |
| Price | **~$60-70** | ~$100 | Budget friendly |

The Xiaomi's **2x GPU advantage** is critical for the visual effects we want (glow, bloom, sprite animations). The 2 GB RAM tradeoff is acceptable for a single-purpose app — just be mindful of texture atlas sizes and dispose unused assets.

The app is sideloaded as an APK onto the TV box via ADB. Version codes in `pubspec.yaml` handle upgrades (`adb install -r` replaces lower version codes automatically).

## Features Roadmap

### Core (MVP)
- Grid-based battlemap canvas with pinch-to-zoom and drag-to-pan
- Companion mode: draw on the map from the phone, see it on the TV
- Basic token placement and movement

### Planned
- **PDF map support** — load PDF battlemaps as background layers
- **Custom sprite animations** — animated tokens, spell effects, creature movements
- **Visual effects** — glow, fog of war, lighting, bloom effects on the canvas
- **Drawing tools** — freehand draw, shapes, area-of-effect markers from companion app

## Technology

| Tech | Purpose |
|------|---------|
| Flutter (Android APK) | Production build — sideloaded onto TV box and phone |
| Flutter Web | Development testing only — quick iteration via GitHub Pages |
| GitHub Actions | CI/CD — builds web for testing, can build APK for releases |

### Deployment

**Production (APK):**
- Build: `flutter build apk --release`
- Install on TV box: `adb install -r build/app/outputs/flutter-apk/app-release.apk`
- Update: bump `version` in `pubspec.yaml` (e.g. `1.0.0+1` → `1.0.1+2`), rebuild, reinstall with `adb install -r`
- The `+N` part is the **version code** — Android uses this integer to determine if an APK is an upgrade. Always increment it.

**Development (Web):**
- Auto-deploys to GitHub Pages on push to `main` for quick phone/browser testing
- Live URL: `https://kasparorange.github.io/battlemap/`
- Workflow: `.github/workflows/deploy.yml`

## Development Workflow

This project is developed **entirely from a phone** using Claude Code as a challenge to see if full app development is possible without a desktop.

The workflow:
1. **Describe features** conversationally to Claude Code
2. **Claude writes code**, commits, and pushes to `main`
3. **GitHub Actions** auto-builds and deploys to GitHub Pages
4. **Test on phone** by opening the GitHub Pages URL (web) or installing the APK
5. **Test on TV** by sideloading the APK onto the Xiaomi Box via ADB
6. **Report back** with feedback ("glow effect lags", "tokens too small", etc.)
7. **Iterate**

No IDE, no terminal, no desktop. Just chat and a browser.

## Code Conventions

- Keep it simple — this is a creative/game project, not enterprise software
- Prioritize **visual quality and performance** over architecture purity
- The GPU is the bottleneck on the target hardware — optimize draw calls and effects
- Test on actual target hardware (TV box via APK) regularly, not just phone
- Dispose textures and assets when not in use (2 GB RAM constraint)

## Progress Tracker

**IMPORTANT:** Update this tracker after every action — feature added, bug fixed, refactor done, etc. Keep it current so we always know where the project stands.

| # | Feature / Task | Status | Notes |
|---|---------------|--------|-------|
| 1 | Project scaffold (pubspec, main.dart, web/) | Done | Flutter web project created |
| 2 | Mode selector (Table / Companion) | Done | Landing screen with two mode buttons |
| 3 | GitHub Actions deploy workflow | Done | Auto-deploys to GitHub Pages on push to main |
| 4 | Grid-based battlemap canvas | Done | 24x16 grid, pinch-to-zoom, drag-to-pan via InteractiveViewer |
| 5 | Basic token placement & movement | Done | Tap to place, drag to move, long-press to remove, colored & numbered |
| 6 | Companion mode drawing | Done | Freehand drawing with color picker, brush size, draw/token mode toggle |
| 7 | PDF map support | Not started | Load PDF battlemaps as backgrounds |
| 8 | Custom sprite animations | Not started | Animated tokens, spell effects |
| 9 | Visual effects (glow, fog, bloom) | Not started | GPU-heavy features |
| 10 | Drawing tools (shapes, AoE) | Not started | Freehand, shapes from companion |

## Directory Structure
battlemap/
├── lib/
│   ├── main.dart            # App entry point & mode selector
│   ├── game_state.dart      # Shared state: tokens, drawings, grid config
│   ├── grid_painter.dart    # CustomPainter for grid, tokens, strokes
│   ├── table_screen.dart    # Table Mode — TV display with zoom/pan/tokens
│   └── companion_screen.dart # Companion Mode — phone drawing & token controls
├── web/
│   ├── index.html         # Flutter web shell
│   └── manifest.json      # PWA manifest (fullscreen, landscape)
├── .github/
│   └── workflows/
│       └── deploy.yml     # GitHub Pages auto-deploy
├── pubspec.yaml           # Flutter dependencies
└── CLAUDE.md              # This file
