import 'package:flutter/material.dart';

import '../state/vtt_state.dart';

/// Bundle of callbacks for every action the DM control panel can trigger.
///
/// Each screen that hosts a [DmControlPanel] provides its own
/// implementations. In networked mode ([VttCompanionScreen]), callbacks
/// send commands through the [VttRelayClient]. In local mode, callbacks
/// act directly on [VttState] and [VttGame].
///
/// See also:
/// - [DmControlPanel], the widget that invokes these callbacks.
class DmCallbacks {
  /// Opens a file picker to load a `.dd2vtt` / `.uvtt` map file.
  final VoidCallback onLoadMap;

  /// Toggles the fog-of-war layer on or off.
  final VoidCallback onToggleFog;

  /// Reveals all fog cells on the current map at once.
  final VoidCallback onRevealAll;

  /// Hides all fog cells on the current map at once.
  final VoidCallback onHideAll;

  /// Toggles the grid overlay visibility.
  final VoidCallback onToggleGrid;

  /// Toggles the wall debug overlay visibility.
  final VoidCallback onToggleWalls;

  /// Toggles the fog brush between reveal and hide mode.
  final VoidCallback onToggleRevealMode;

  /// Sets the fog brush radius to [radius] grid cells (0, 1, or 2).
  final void Function(int radius) onSetBrushRadius;

  /// Zooms the camera in by one step.
  final VoidCallback onZoomIn;

  /// Zooms the camera out by one step.
  final VoidCallback onZoomOut;

  /// Resets the camera zoom so the entire map fits on screen.
  final VoidCallback onZoomToFit;

  /// Rotates the camera 90 degrees clockwise.
  final VoidCallback onRotateCW;

  /// Rotates the camera 90 degrees counter-clockwise.
  final VoidCallback onRotateCCW;

  /// Resets the camera rotation to 0 degrees.
  final VoidCallback onResetRotation;

  /// Calibrates the grid so squares match 1-inch miniature bases.
  ///
  /// [tvWidthInches] is the physical width of the TV screen in inches.
  final void Function(double tvWidthInches) onCalibrate;

  /// Resets calibration to the default zoom behaviour.
  final VoidCallback onResetCalibration;

  // Interaction mode

  /// Switches to fog reveal/hide interaction mode.
  final VoidCallback onSetFogMode;

  /// Switches to freehand drawing interaction mode.
  final VoidCallback onSetDrawMode;

  /// Switches to token placement interaction mode.
  final VoidCallback onSetTokenMode;

  // Drawing

  /// Sets the drawing stroke color to the given [Color].
  final void Function(Color) onSetDrawColor;

  /// Sets the drawing stroke width in logical pixels.
  final void Function(double) onSetDrawWidth;

  /// Clears all drawing strokes from the map.
  final VoidCallback onClearDrawings;

  /// Undoes the most recent drawing stroke.
  final VoidCallback onUndoStroke;

  // Tokens

  /// Removes all tokens from the map.
  final VoidCallback onClearTokens;

  /// Creates a [DmCallbacks] with all required action handlers.
  const DmCallbacks({
    required this.onLoadMap,
    required this.onToggleFog,
    required this.onRevealAll,
    required this.onHideAll,
    required this.onToggleGrid,
    required this.onToggleWalls,
    required this.onToggleRevealMode,
    required this.onSetBrushRadius,
    required this.onZoomIn,
    required this.onZoomOut,
    required this.onZoomToFit,
    required this.onRotateCW,
    required this.onRotateCCW,
    required this.onResetRotation,
    required this.onCalibrate,
    required this.onResetCalibration,
    required this.onSetFogMode,
    required this.onSetDrawMode,
    required this.onSetTokenMode,
    required this.onSetDrawColor,
    required this.onSetDrawWidth,
    required this.onClearDrawings,
    required this.onUndoStroke,
    required this.onClearTokens,
  });
}

/// Collapsible DM control panel overlaid on the VTT game canvas.
///
/// When collapsed, it displays as a small gear icon. When expanded, it
/// shows context-sensitive sections (fog, draw, token, camera, calibration)
/// depending on the current [InteractionMode] in [state].
///
/// All user actions are routed through [callbacks], which may either act
/// locally or send commands over the network depending on the hosting
/// screen.
///
/// See also:
/// - [DmCallbacks], the callback bundle wiring panel buttons to actions.
/// - [VttCompanionScreen], the primary host for this panel.
class DmControlPanel extends StatefulWidget {
  /// The current VTT game state used to render toggle states and labels.
  final VttState state;

  /// Action handlers invoked when the DM taps panel controls.
  final DmCallbacks callbacks;

  /// Creates a DM control panel bound to [state] and [callbacks].
  const DmControlPanel({
    super.key,
    required this.state,
    required this.callbacks,
  });

  @override
  State<DmControlPanel> createState() => _DmControlPanelState();
}

class _DmControlPanelState extends State<DmControlPanel> {
  bool _expanded = false;

  VttState get state => widget.state;
  DmCallbacks get cb => widget.callbacks;

  @override
  Widget build(BuildContext context) {
    if (!_expanded) {
      return GestureDetector(
        onTap: () => setState(() => _expanded = true),
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: const Icon(Icons.settings, color: Colors.white70, size: 22),
        ),
      );
    }

    return Container(
      width: 200,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header
          GestureDetector(
            onTap: () => setState(() => _expanded = false),
            child: Row(
              children: [
                const Icon(Icons.settings, color: Colors.white70, size: 18),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'DM Controls',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Icon(Icons.close, color: Colors.white38, size: 18),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Map section
          _SectionLabel('Map'),
          _PanelButton(
            icon: Icons.folder_open,
            label: 'Load Map',
            onTap: cb.onLoadMap,
          ),

          const SizedBox(height: 8),

          if (state.map != null) ...[
            // Mode section
            _SectionLabel('Mode'),
            Row(
              children: [
                for (final entry in [
                  (InteractionMode.fogReveal, Icons.cloud, 'Fog'),
                  (InteractionMode.draw, Icons.brush, 'Draw'),
                  (InteractionMode.token, Icons.person_pin, 'Token'),
                ]) ...[
                  if (entry != (InteractionMode.fogReveal, Icons.cloud, 'Fog'))
                    const SizedBox(width: 4),
                  Expanded(
                    child: _ModeButton(
                      icon: entry.$2,
                      label: entry.$3,
                      active: state.interactionMode == entry.$1,
                      onTap: () {
                        switch (entry.$1) {
                          case InteractionMode.fogReveal:
                            cb.onSetFogMode();
                          case InteractionMode.draw:
                            cb.onSetDrawMode();
                          case InteractionMode.token:
                            cb.onSetTokenMode();
                        }
                      },
                    ),
                  ),
                ],
              ],
            ),

            const SizedBox(height: 8),

            // Fog section (visible only in fogReveal mode)
            if (state.interactionMode == InteractionMode.fogReveal) ...[
              _SectionLabel('Fog'),
              _PanelToggle(
                icon: state.fogEnabled ? Icons.cloud : Icons.cloud_off,
                label: 'Fog',
                active: state.fogEnabled,
                onTap: cb.onToggleFog,
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Expanded(
                    child: _PanelButton(
                      icon: Icons.visibility,
                      label: 'Reveal',
                      onTap: cb.onRevealAll,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: _PanelButton(
                      icon: Icons.visibility_off,
                      label: 'Hide',
                      onTap: cb.onHideAll,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // Brush controls
              _PanelToggle(
                icon: state.revealMode ? Icons.wb_sunny : Icons.dark_mode,
                label: state.revealMode ? 'Reveal' : 'Hide',
                active: state.revealMode,
                onTap: cb.onToggleRevealMode,
              ),
              const SizedBox(height: 4),
              // Brush size
              Row(
                children: [
                  const Icon(Icons.brush, color: Colors.white30, size: 14),
                  const SizedBox(width: 4),
                  for (final entry in {0: '1', 1: '3', 2: '5'}.entries) ...[
                    if (entry.key > 0) const SizedBox(width: 2),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => cb.onSetBrushRadius(entry.key),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          decoration: BoxDecoration(
                            color: state.brushRadius == entry.key
                                ? Colors.white.withValues(alpha: 0.15)
                                : Colors.white.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Center(
                            child: Text(
                              entry.value,
                              style: TextStyle(
                                color: state.brushRadius == entry.key
                                    ? Colors.white70
                                    : Colors.white30,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Draw section (visible only in draw mode)
            if (state.interactionMode == InteractionMode.draw) ...[
              _SectionLabel('Draw'),
              // Color dots
              Row(
                children: [
                  for (final color in const [
                    Color(0xFFE53935), // red
                    Color(0xFF43A047), // green
                    Color(0xFF1E88E5), // blue
                    Color(0xFFFDD835), // yellow
                    Color(0xFFFF8F00), // orange
                    Color(0xFFFFFFFF), // white
                  ]) ...[
                    Expanded(
                      child: GestureDetector(
                        onTap: () => cb.onSetDrawColor(color),
                        child: Center(
                          child: Container(
                            width: 20,
                            height: 20,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: state.drawColor.toARGB32() == color.toARGB32()
                                  ? Border.all(color: Colors.white, width: 2)
                                  : Border.all(color: Colors.white24, width: 1),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              // Width presets
              Row(
                children: [
                  const Icon(Icons.line_weight, color: Colors.white30, size: 14),
                  const SizedBox(width: 4),
                  for (final entry in {2.0: 'S', 4.0: 'M', 8.0: 'L'}.entries) ...[
                    if (entry.key != 2.0) const SizedBox(width: 2),
                    Expanded(
                      child: GestureDetector(
                        onTap: () => cb.onSetDrawWidth(entry.key),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          decoration: BoxDecoration(
                            color: state.drawWidth == entry.key
                                ? Colors.white.withValues(alpha: 0.15)
                                : Colors.white.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Center(
                            child: Text(
                              entry.value,
                              style: TextStyle(
                                color: state.drawWidth == entry.key
                                    ? Colors.white70
                                    : Colors.white30,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              // Clear / Undo
              Row(
                children: [
                  Expanded(
                    child: _PanelButton(
                      icon: Icons.delete_outline,
                      label: 'Clear',
                      onTap: cb.onClearDrawings,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: _PanelButton(
                      icon: Icons.undo,
                      label: 'Undo',
                      onTap: cb.onUndoStroke,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
            ],

            // Token section (visible only in token mode)
            if (state.interactionMode == InteractionMode.token) ...[
              _SectionLabel('Tokens'),
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  'Tap map to place',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 11,
                  ),
                ),
              ),
              _PanelButton(
                icon: Icons.delete_outline,
                label: 'Clear All',
                onTap: cb.onClearTokens,
              ),
              const SizedBox(height: 8),
            ],

            // Calibration
            _SectionLabel('Calibrate'),
            _PanelButton(
              icon: Icons.straighten,
              label: state.calibratedBaseZoom != null
                  ? '${state.tvWidthInches!.round()}" calibrated'
                  : 'Set TV size',
              onTap: () => _showCalibrationDialog(context),
            ),

            const SizedBox(height: 8),

            // View section
            _SectionLabel('View'),
            _PanelToggle(
              icon: state.showGrid ? Icons.grid_on : Icons.grid_off,
              label: 'Grid',
              active: state.showGrid,
              onTap: cb.onToggleGrid,
            ),
            const SizedBox(height: 4),
            _PanelToggle(
              icon: Icons.line_style,
              label: 'Walls',
              active: state.showWalls,
              onTap: cb.onToggleWalls,
            ),

            const SizedBox(height: 8),

            // Camera section
            _SectionLabel('Camera'),
            Row(
              children: [
                Expanded(
                  child: _PanelButton(icon: Icons.remove, label: '', onTap: cb.onZoomOut),
                ),
                const SizedBox(width: 4),
                Expanded(
                  flex: 2,
                  child: _PanelButton(icon: Icons.fit_screen, label: 'Fit', onTap: cb.onZoomToFit),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: _PanelButton(icon: Icons.add, label: '', onTap: cb.onZoomIn),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: _PanelButton(icon: Icons.rotate_left, label: '', onTap: cb.onRotateCCW),
                ),
                const SizedBox(width: 4),
                Expanded(
                  flex: 2,
                  child: _PanelButton(
                    icon: Icons.screen_rotation_alt,
                    label: '0\u00B0',
                    onTap: cb.onResetRotation,
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: _PanelButton(icon: Icons.rotate_right, label: '', onTap: cb.onRotateCW),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  void _showCalibrationDialog(BuildContext context) {
    final controller = TextEditingController(
      text: state.tvWidthInches?.toString() ?? '',
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A1A2E),
        title: const Text('Calibrate Grid'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Enter your TV screen width in inches\n'
              'so grid squares match 1" miniature bases.',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.6),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(fontFamily: 'monospace', fontSize: 18),
              decoration: InputDecoration(
                hintText: 'e.g. 43',
                suffixText: 'inches',
                hintStyle: TextStyle(
                  color: Colors.white.withValues(alpha: 0.3),
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              autofocus: true,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 6,
              children: [
                for (final size in [32, 43, 50, 55, 65])
                  ActionChip(
                    label: Text('$size"'),
                    onPressed: () => controller.text = '$size',
                    backgroundColor: Colors.white.withValues(alpha: 0.1),
                    labelStyle: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
              ],
            ),
          ],
        ),
        actions: [
          if (state.calibratedBaseZoom != null)
            TextButton(
              onPressed: () {
                cb.onResetCalibration();
                Navigator.pop(ctx);
              },
              child: const Text('Reset'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final inches = double.tryParse(controller.text.trim());
              if (inches == null || inches <= 0) return;
              cb.onCalibrate(inches);
              Navigator.pop(ctx);
            },
            child: const Text('Calibrate'),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white38,
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _PanelButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _PanelButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white54, size: 16),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
            ],
          ],
        ),
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _ModeButton({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        decoration: BoxDecoration(
          color: active
              ? Colors.white.withValues(alpha: 0.2)
              : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(6),
          border: active
              ? Border.all(color: Colors.white.withValues(alpha: 0.3))
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: active ? Colors.white : Colors.white38, size: 16),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: active ? Colors.white : Colors.white38,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PanelToggle extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _PanelToggle({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          color: active
              ? Colors.white.withValues(alpha: 0.15)
              : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          children: [
            Icon(icon, color: active ? Colors.white70 : Colors.white30, size: 16),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: active ? Colors.white70 : Colors.white30,
                fontSize: 12,
              ),
            ),
            const Spacer(),
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? Colors.greenAccent : Colors.white12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
