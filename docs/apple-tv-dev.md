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
| `pdfrx` | **yes** (`tv_shell.dart`, `pdf_helper.dart`, `vtt_state.dart`) | **blocked** — ships a native PDFium binary per platform, none for tvOS |
| `file_picker` | phone only | irrelevant |
| `path_provider` | yes | `path_provider_tvos` |
| `package_info_plus` | yes | `package_info_plus_tvos` |
| `wakelock_plus` | yes | `wakelock_plus_tvos` |
| `web` | web build only | irrelevant |
| Shorebird, in-app APK update | Android only | irrelevant on a dev device |

Planned features: ambient soundscapes → `audioplayers_tvos` exists; water/fog shaders,
particles, glow → Metal/Impeller, fine; 3D dice, animations → Flame, fine.

**The one real gap is PDF rendering on the TV.** Fix: rasterize on the phone (below).

## plan: rasterize PDFs on the phone

The companion already renders PDFs for its own preview (`pdfrx`, web build). Instead of
shipping the PDF to the TV and rendering it there:

1. companion picks the page → renders it to a PNG at map resolution (cap ~4096 px long edge)
2. uploads the PNG through the existing HTTP map transfer (`dev_server` `/upload/…`)
3. the TV receives an **image map**, the same path `.dd2vtt`/image maps already take
4. `pdfrx` leaves the TV side entirely (`tv_shell.dart`, `pdf_helper.dart` TV branches,
   the "image session resume mistakenly going through PDF render" class of bugs disappears)

Benefits on both platforms: no PDF engine on the box, faster session resume, one map type on
the TV. Roadmap #34 ("PDF in VTT mode") becomes a phone-side feature. Estimated: a day.

## where this runs

Only on the **Mac** — the fork needs macOS + Xcode. The VPS stays the primary dev machine for
the phone companion and the Xiaomi APK (`docs/setup.md` "development environments"); the Apple
TV is the at-home display for the TV side while iterating.

## setup (once, on the Mac)

```bash
git clone https://github.com/fluttertv/flutter-tvos.git ~/code/flutter-tvos
export PATH="$PATH:$HOME/code/flutter-tvos/bin"
flutter-tvos precache && flutter-tvos doctor

# in the battlemap checkout
flutter-tvos create --platforms=tvos .          # adds tvos/ host project (commit it)
# pubspec: add path_provider_tvos, package_info_plus_tvos, wakelock_plus_tvos
#          (audioplayers_tvos when soundscapes land)
. ~/.config/mwlog/battlemap.env
flutter-tvos run -d <apple-tv-or-simulator> --dart-define=MWLOG_AUTH=$MWLOG_USER:$MWLOG_PASS
```

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
