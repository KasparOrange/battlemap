import 'dart:async';

import '../game/vtt_game.dart';
import '../state/vtt_state.dart';

/// Stub VTT server for web builds.
class VttServer {
  final VttState state;
  final VttGame game;
  final int port;

  int get clientCount => 0;
  String? get localIp => null;
  bool get isRunning => false;

  Stream<int> get clientCountStream => const Stream.empty();

  VttServer({required this.state, required this.game, this.port = 8080});

  Future<void> start() async {}
  Future<void> stop() async {}
  void dispose() {}
}
