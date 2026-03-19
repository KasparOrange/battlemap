import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/material.dart';

import '../game/vtt_game.dart';
import '../state/vtt_state.dart';

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

          // Controls
          Positioned(
            bottom: 16,
            right: 16,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Load map
                _ControlButton(
                  icon: Icons.folder_open,
                  label: 'Load Map',
                  onTap: _pickMap,
                ),
                const SizedBox(width: 8),
                // Toggle grid
                if (_state.map != null) ...[
                  _ControlButton(
                    icon: _state.showGrid ? Icons.grid_on : Icons.grid_off,
                    label: 'Grid',
                    onTap: () => _state.toggleGrid(),
                    active: _state.showGrid,
                  ),
                  const SizedBox(width: 8),
                  _ControlButton(
                    icon: _state.fogEnabled ? Icons.cloud : Icons.cloud_off,
                    label: 'Fog',
                    onTap: () => _state.toggleFog(),
                    active: _state.fogEnabled,
                  ),
                  const SizedBox(width: 8),
                  _ControlButton(
                    icon: Icons.visibility,
                    label: 'Reveal All',
                    onTap: () {
                      final m = _state.map!;
                      final total = m.resolution.mapSize.dx.toInt() *
                          m.resolution.mapSize.dy.toInt();
                      _state.revealAll(total);
                    },
                  ),
                  const SizedBox(width: 8),
                  _ControlButton(
                    icon: Icons.visibility_off,
                    label: 'Hide All',
                    onTap: () => _state.hideAll(),
                  ),
                ],
              ],
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
                  '${_state.map!.resolution.pixelsPerGrid}ppg',
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
            const Center(
              child: Text(
                'Tap "Load Map" to open a .dd2vtt file',
                style: TextStyle(color: Colors.white24, fontSize: 16),
              ),
            ),
        ],
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: active ? Colors.white.withValues(alpha: 0.15) : Colors.black54,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white70, size: 18),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}
