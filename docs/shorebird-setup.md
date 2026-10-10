# shorebird setup

shorebird enables over-the-air (OTA) code push for the TV app. instead of downloading and reinstalling a full APK, dart code patches are applied silently on app launch.

## install shorebird CLI

```bash
curl --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/shorebirdtech/install/main/install.sh -sSf | bash
```

this installs to `~/.shorebird/bin/shorebird`. add to PATH:

```bash
export PATH="$HOME/.shorebird/bin:$PATH"
```

## login (requires browser)

```bash
shorebird login
```

this opens a browser for OAuth. on a headless VPS, use:

```bash
shorebird login --device-code
```

follow the URL and code to complete login from your phone.

## initialize project

```bash
cd /home/kaspar/battlemap
shorebird init
```

this creates `shorebird.yaml` with your app ID.

## workflow

### first release (creates the base APK)

```bash
shorebird release android
```

install this APK on the TV. this is the "base" that future patches are applied to.

### push a code update (no reinstall needed)

after making code changes:

```bash
shorebird patch android
```

the TV app checks for patches on next launch and applies them automatically. no user interaction.

### check patch status

```bash
shorebird patches list --release-version 1.0.12+13
```

## limitations

- shorebird patches dart code only (not native/kotlin/assets)
- first release still requires manual APK install
- patches are applied on next cold start (not hot)
- free tier: 5,000 patch installs/month

## integration with current update system

once shorebird is set up, the in-app update button can be simplified:
- for dart-only changes: shorebird patches automatically (no button needed)
- for native changes (new permissions, kotlin code): still need APK download + install flow

the existing `update_service.dart` can check if a shorebird patch is pending and show status.
