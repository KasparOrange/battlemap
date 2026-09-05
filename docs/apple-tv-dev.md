# Apple TV as a development target (flutter-tvos)

Decided 2026-09-05. The **product** stays on the Xiaomi box (Google TV, sideloaded APK). The
Apple TV in the living room is only a **development convenience**: it already sits on the
screen for MyTube, so working on the battlemap should not mean swapping inputs and cables.
If the fork ever stalls, we lose a convenience, not the product.

## the fork

Google has never supported tvOS ([flutter/flutter #47928](https://github.com/flutter/flutter/issues/47928),
open since 2019). The community fork **[fluttertv/flutter-tvos](https://github.com/fluttertv/flutter-tvos)**
([fluttertv.dev](https://fluttertv.dev/)) is a real platform embedder plus a drop-in CLI on top
of the unmodified Flutter framework:

- tracks current Flutter (3.47.x as of Sep 2026), BSD-3, two maintainers, commits weekly
- tvOS Simulator **and** physical Apple TV, hot reload + DevTools over the wireless tunnel
  (the same pairing MyTube uses)
- Metal-only rendering (Impeller) — fragment shaders work
- Siri Remote → Flutter's standard `Focus`/`Shortcuts`/`Actions` (arrow keys + select)
- `Platform.isTvOS` via the `flutter_tvos` package
- plugins must have a `_tvos` federated implementation; the fork publishes ports under the
  `fluttertv.dev` pub publisher and ships a porter (`flutter-tvos plugin port`) for others.
  No WebKit, no clipboard, no haptics on tvOS.

## dependency audit (2026-09-05)

| package | on the TV side? | tvOS |
|---|---|---|
| `flame`, `hive`, `hive_flutter`, `uuid`, `flutter_phoenix`, `web_socket_channel` | yes | pure Dart — fine |
| `pdfrx` | **yes** (`tv_shell.dart`, `pdf_helper.dart`, `vtt_state.dart`) | **no tvOS binary** (native PDFium) — resolved by rasterizing on the phone (below); only the legacy `vtt.pdfUploaded` path still touches it on the TV |
| `file_picker` | phone only | irrelevant |
| `path_provider` | yes | `path_provider_tvos` |
| `package_info_plus` | yes | `package_info_plus_tvos` |
| `wakelock_plus` | yes | `wakelock_plus_tvos` |
| `web` | web build only | irrelevant |
| Shorebird, in-app APK update | Android only | irrelevant on a dev device |

Planned features: ambient soundscapes → `audioplayers_tvos` exists; water/fog shaders,
particles, glow → Metal/Impeller, fine; 3D dice, animations → Flame, fine.

**The one real gap is PDF rendering on the TV.** Fix: rasterize on the phone (below).

## rasterize PDFs on the phone — done 2026-09-06 (1.1.3+13)

`VttCompanionScreen._pickAndUploadMap`: pdfrx ≥ 2 ships PDFium as WASM inside the web build
(`assets/packages/pdfrx/assets/pdfium.wasm`, 5 MB, loaded on first PDF), so instead of
shipping the PDF to the TV and rendering it there:

1. companion picks the page → renders it to a PNG at map resolution (cap ~4096 px long edge)
2. uploads the PNG through the existing HTTP map transfer (`dev_server` `/upload/…`)
3. the TV receives an **image map**, the same path `.dd2vtt`/image maps already take
4. `pdfrx` can leave the TV side once the legacy `vtt.pdfUploaded` path is dropped (`tv_shell.dart`, `pdf_helper.dart` TV branches,
   the "image session resume mistakenly going through PDF render" class of bugs disappears)

Benefits on both platforms: no PDF engine on the box, faster session resume, one map type on
the TV. Only page 1 is rendered (page picker: open item). The TV keeps `vtt.pdfUploaded` for
older phone builds. Not yet verified in a real browser (the terminal-browser click test was
unreliable) — first real test is on the phone.

## where this runs

Only on the **Mac** — the fork needs macOS + Xcode. The VPS stays the primary dev machine for
the phone companion and the Xiaomi APK (`docs/setup.md` "development environments"); the Apple
TV is the at-home display for the TV side while iterating.

## setup — done 2026-09-05 (Mac)

The fork lives in `~/code/flutter-tvos` (1.10.0, pins Flutter 3.47.2 + the tvOS engine); the
`tvos/` host project is committed. What works, verified:

- **tvOS simulator** (`Apple TV 4K (3rd generation)`, tvOS 26.5): builds, runs, mode selector
  → TV mode via the select key (Siri Remote = arrow keys + Return in the Simulator window).
- **physical Apple TV** (`TV`, tvOS 26.6, paired over Wi-Fi): `--release` builds, installs,
  runs (Impeller/Metal) and logs into MwLog. Signing just worked (the fork put the `PN7996GFJ3`
  team from the dev certificate into `tvos/Runner.xcodeproj`).
  **Debug on the device does not attach**: the wireless lldb attach times out ("Dart VM Service
  was not found"), even with `FLUTTER_TVOS_LLDB_ATTACH_TIMEOUT_SECONDS=600`, and the debug
  engine never starts without it (the app sits on the launch screen). Untested suspects: the
  terminal's *Local Network* permission (System Settings ▸ Privacy & Security), first-time
  symbol download. Until that works: **hot reload on the simulator, `--release` on the TV** —
  which is what the fork's README recommends anyway.
- **storage on the real Apple TV**: Documents is read-only, so `main.dart` initialises Hive in
  the cache directory when `Platform.operatingSystem == 'tvos'` (found the hard way: the map
  library's `openBox` threw `PathAccessException`; the simulator allows the write).

```bash
export PATH="$PATH:$HOME/code/flutter-tvos/bin"      # put in ~/.zshrc
cd ~/code/battlemap
flutter-tvos devices                                  # simulator + "TV" when it is awake
. ~/.config/mwlog/battlemap.env
flutter-tvos run -d <id> --dart-define=MWLOG_AUTH=$MWLOG_USER:$MWLOG_PASS
```

`flutter-tvos` is a drop-in for `flutter` (`pub get`, `build tvos --simulator`, …); the plain
`flutter` it wraps is `~/code/flutter-tvos/flutter/bin/flutter` (use that for `analyze`/`test`,
the wrapper has no `analyze`). Bumping the fork: `flutter-tvos upgrade`.

### what the tvOS build forced on the dependencies

All in `pubspec.yaml`, all platforms — the VPS build needs **Flutter ≥ 3.47** now (pdfrx).

| change | why |
|---|---|
| `pdfrx` ^1.0 → **^2.6.1** (+ `pdfrxFlutterInitialize()` in `PdfHelper`) | 1.3.5 no longer compiles on Flutter 3.47; 2.x needs the explicit init before any `PdfDocument` call |
| `package_info_plus` ^8 → **^10** | `package_info_plus_tvos` needs platform-interface ≥ 4.1 |
| `file_picker` ^8 → **^12.2** (`FilePicker.pickFile` + `readAsBytes()`) | forced by package_info_plus 10; v12 removed `FilePicker.platform` and `PlatformFile.size` |
| `wakelock_plus` pinned **<1.8** | 1.8 declares `tvos:` itself but its pod depends on the iOS-only `Flutter` pod → `pod install` fails; the `wakelock_plus_tvos` port must be the only tvOS provider |
| + `flutter_tvos`, `path_provider_tvos`, `package_info_plus_tvos`, `wakelock_plus_tvos` | federated tvOS ports (SPM for the first two, CocoaPods for the other two; `brew install cocoapods`) |
| `analysis_options.yaml` excludes `build/ android/ web/` | written by `flutter-tvos pub get` |

`pdfrx` still has no tvOS PDFium binary: the Dart side compiles, but only the legacy
`vtt.pdfUploaded` path (old phone builds) and PDF-session resume would hit it — new uploads
arrive as PNG (next section).

## things to know on tvOS

- **storage is purgeable**: tvOS gives an app only Caches (+ 500 KB prefs); the map library
  and sessions on the Apple TV can vanish under storage pressure. Fine for development; the
  Xiaomi box keeps its documents directory.
- **pixel ratio differs** from the Xiaomi box — the calibration screen already covers it.
- **plain HTTP/WS keep working**: `dart:io` sockets bypass App Transport Security, so the relay
  (`ws://…:9090`) and map transfer (`http://…:4242`) need no Info.plist exception.
- **no TV-side input needed**: the TV shell is driven by the phone; the D-pad fallback maps
  to the Siri Remote's arrows/select automatically.
- **logging** goes to MwLog exactly as on Android (`docs/setup.md` "logs").
