/// Network configuration for the VPS WebSocket relay server.
///
/// Both the TV ([TvShell]) and the companion phone ([VttCompanionScreen])
/// connect to this relay as WebSocket clients. The relay forwards messages
/// between the paired table and companion roles.
///
/// See also:
/// - [VttRelayClient], which uses these constants to establish connections.
class RelayConfig {
  /// IP address of the VPS hosting the WebSocket relay.
  static const String host = '72.62.88.197';

  /// TCP port the relay listens on.
  static const int port = 9090;

  /// Full WebSocket URL derived from [host] and [port].
  static String get wsUrl => 'ws://$host:$port';
}
