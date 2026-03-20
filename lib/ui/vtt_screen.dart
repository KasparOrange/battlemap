import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';

import '../game/vtt_game.dart';
import '../state/vtt_state.dart';
import 'dm_control_panel.dart';

/// VTT Table Mode — fullscreen map display for physical table with miniatures.
class VttScreen extends StatefulWidget {
  const VttScreen({super.key});

  @override
  State<VttScreen> createState() => _VttScreenState();
}

class _VttScreenState extends State<VttScreen> {
  final VttState _state = VttState();
  late final VttGame _game;

  @override
  void initState() {
    super.initState();
    _game = VttGame(state: _state);
    _state.addListener(_onStateChanged);
  }

  @override
  void dispose() {
    _state.removeListener(_onStateChanged);
    _state.dispose();
    super.dispose();
  }

  void _onStateChanged() => setState(() {});

  Future<void> _pickMap() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['dd2vtt', 'uvtt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final bytes = result.files.first.bytes;
    if (bytes == null) return;

    try {
      _state.loadMap(bytes);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load map: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Game canvas
          GameWidget(game: _game),

          // Back button
          Positioned(
            top: 16,
            left: 16,
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white54),
              onPressed: () => Navigator.pop(context),
            ),
          ),

          // DM Control Panel
          Positioned(
            bottom: 16,
            right: 16,
            child: DmControlPanel(
              state: _state,
              onLoadMap: _pickMap,
            ),
          ),

          // Map info
          if (_state.map != null)
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_state.map!.resolution.mapSize.dx.toInt()}x'
                  '${_state.map!.resolution.mapSize.dy.toInt()} grid  •  '
                  '${_state.map!.resolution.pixelsPerGrid}ppg  •  '
                  '${_state.map!.portals.length} doors',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),

          // Empty state hint
          if (_state.map == null)
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.map, color: Colors.white12, size: 64),
                  const SizedBox(height: 16),
                  const Text(
                    'Tap the gear icon to load a .dd2vtt map',
                    style: TextStyle(color: Colors.white24, fontSize: 16),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
