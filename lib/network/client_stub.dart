import 'dart:async';
import 'dart:typed_data';

import '../game_state.dart';

enum ClientConnectionState { disconnected, connecting, connected }

/// Stub client for web builds where dart:io is unavailable.
class BattlemapClient {
  final GameState gameState;
  final String host;
  final int port;

  ClientConnectionState get state => ClientConnectionState.disconnected;
  Stream<ClientConnectionState> get connectionStream => const Stream.empty();

  BattlemapClient({
    required this.gameState,
    required this.host,
    this.port = 8080,
  });

  Future<void> connect() async {}
  void addToken(int gridX, int gridY) {}
  void moveToken(String id, int gridX, int gridY) {}
  void removeToken(String id) {}
  void addStroke(DrawStroke stroke) {}
  void clearDrawings() {}
  void sendStrokeUpdate(DrawStroke stroke) {}
  void sendStrokeEnd() {}
  void sendPdf(Uint8List bytes) {}
  void sendClearPdf() {}
  Future<void> disconnect() async {}
  void dispose() {}
}
