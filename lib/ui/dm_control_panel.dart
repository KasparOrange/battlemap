import 'package:flutter/material.dart';

import '../state/vtt_state.dart';

/// Collapsible DM control panel overlaid on the VTT game canvas.
class DmControlPanel extends StatefulWidget {
  final VttState state;
  final VoidCallback onLoadMap;

  const DmControlPanel({
    super.key,
    required this.state,
    required this.onLoadMap,
  });

  @override
  State<DmControlPanel> createState() => _DmControlPanelState();
}

class _DmControlPanelState extends State<DmControlPanel> {
  bool _expanded = false;

  VttState get state => widget.state;

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
          // Header with collapse button
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
            onTap: widget.onLoadMap,
          ),

          const SizedBox(height: 8),

          // Fog section
          if (state.map != null) ...[
            _SectionLabel('Fog'),
            _PanelToggle(
              icon: state.fogEnabled ? Icons.cloud : Icons.cloud_off,
              label: 'Fog',
              active: state.fogEnabled,
              onTap: () => state.toggleFog(),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: _PanelButton(
                    icon: Icons.visibility,
                    label: 'Reveal',
                    onTap: () {
                      final m = state.map!;
                      final total = m.resolution.mapSize.dx.toInt() *
                          m.resolution.mapSize.dy.toInt();
                      state.revealAll(total);
                    },
                  ),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: _PanelButton(
                    icon: Icons.visibility_off,
                    label: 'Hide',
                    onTap: () => state.hideAll(),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // View section
            _SectionLabel('View'),
            _PanelToggle(
              icon: state.showGrid ? Icons.grid_on : Icons.grid_off,
              label: 'Grid',
              active: state.showGrid,
              onTap: () => state.toggleGrid(),
            ),
            const SizedBox(height: 4),
            _PanelToggle(
              icon: Icons.line_style,
              label: 'Walls',
              active: state.showWalls,
              onTap: () => state.toggleWalls(),
            ),
          ],
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
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
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
