import 'dart:async';
import 'dart:typed_data';

import '../state/vtt_state.dart';

enum VttConnectionState { disconnected, connecting, connected }

/// Stub VTT client for web builds.
class VttClient {
  final VttState state;
  final String host;
  final int port;

  void Function(double x, double y, double zoom, double angle)? onCameraSync;

  VttConnectionState get connectionState => VttConnectionState.disconnected;
  Stream<VttConnectionState> get connectionStream => const Stream.empty();

  VttClient({required this.state, required this.host, this.port = 8080});

  Future<void> connect() async {}
  void sendLoadMap(Uint8List bytes) {}
  void sendClearMap() {}
  void sendToggleReveal(int index) {}
  void sendBrushReveal(List<int> indices) {}
  void sendRevealAll() {}
  void sendHideAll() {}
  void sendTogglePortal(int index) {}
  void sendToggleGrid() {}
  void sendToggleFog() {}
  void sendToggleWalls() {}
  void sendSetBrushRadius(int radius) {}
  void sendToggleRevealMode() {}
  void sendZoomIn() {}
  void sendZoomOut() {}
  void sendZoomToFit() {}
  void sendRotateCW() {}
  void sendRotateCCW() {}
  void sendResetRotation() {}
  void sendCalibrate(double tvWidthInches) {}
  void sendResetCalibration() {}
  void dispose() {}
}
