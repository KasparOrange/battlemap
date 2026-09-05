/// Network configuration for the VPS WebSocket relay server.
///
/// Both the TV ([TvShell]) and the companion phone ([VttCompanionScreen])
/// connect to this relay as WebSocket clients. The relay forwards messages
/// between the paired table and companion roles.
///
/// The host can be overridden at build time for a local bench (relay and
/// dev server running on the same machine as the browser / simulator):
///
/// ```sh
/// flutter build web --dart-define=RELAY_HOST=localhost
/// ```
///
/// See also:
/// - [VttRelayClient], which uses these constants to establish connections.
/// - `docs/setup.md` "local bench" for the full local test loop.
class RelayConfig {
  /// IP address (or hostname) of the machine hosting the relay and the
  /// HTTP dev server. Defaults to the VPS; override with `RELAY_HOST`.
  static const String host =
      String.fromEnvironment('RELAY_HOST', defaultValue: '72.62.88.197');

  /// TCP port the relay listens on.
  static const int port = 9090;

  /// TCP port of the HTTP dev server (web build, uploads, APK).
  static const int httpPort = 4242;

  /// Full WebSocket URL derived from [host] and [port].
  static String get wsUrl => 'ws://$host:$port';

  /// Base HTTP URL of the dev server (no trailing slash).
  static String get httpBase => 'http://$host:$httpPort';
}
