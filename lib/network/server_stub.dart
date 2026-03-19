import 'dart:async';

import '../game_state.dart';

/// Stub server for web builds where dart:io is unavailable.
class BattlemapServer {
  final GameState gameState;
  final int port;

  int get clientCount => 0;
  String? get localIp => null;
  bool get isRunning => false;

  Stream<int> get clientCountStream => const Stream.empty();

  BattlemapServer({required this.gameState, this.port = 8080});

  Future<void> start() async {}
  Future<void> stop() async {}
  void dispose() {}
}
