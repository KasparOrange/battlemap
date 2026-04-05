import 'package:flutter/material.dart';

import '../model/session.dart';

// ─── Medieval warm color palette (shared with dm_control_panel) ──────

const _kPanelBg = Color(0xFF1a1512);
const _kAccentGold = Color(0xFFd4a76a);
const _kAccentGoldDim = Color(0xFF8a7044);
const _kBorderGold = Color(0xFF5a4a30);
const _kTextPrimary = Color(0xFFd4a76a);
const _kTextSecondary = Color(0xFF8a7044);
const _kSurface = Color(0xFF241e18);
const _kSurfaceActive = Color(0xFF3a3020);

/// Shows a modal dialog for configuring [SessionSettings].
///
/// Returns the updated [SessionSettings] on save, or `null` if cancelled.
/// If [initial] is provided, the dialog starts with those values;
/// otherwise it defaults to the Pen & Paper preset.
///
/// The dialog has two sections:
/// 1. **Template** -- "Pen & Paper" and "Digital" preset buttons.
/// 2. **Features** -- individual toggle switches grouped by category.
///
/// See also:
/// * [SessionSettings], the model class being edited.
/// * [VttCompanionScreen], which calls this before creating a new session.
/// * [DmControlPanel], which calls this from the settings gear button.
Future<SessionSettings?> showSessionSettingsDialog(
  BuildContext context, {
  SessionSettings? initial,
}) async {
  return showDialog<SessionSettings>(
    context: context,
    builder: (ctx) => _SessionSettingsDialog(initial: initial),
  );
}

/// Internal stateful dialog widget for session settings.
class _SessionSettingsDialog extends StatefulWidget {
  /// The initial settings values, or `null` for Pen & Paper defaults.
  final SessionSettings? initial;

  const _SessionSettingsDialog({this.initial});

  @override
  State<_SessionSettingsDialog> createState() => _SessionSettingsDialogState();
}

class _SessionSettingsDialogState extends State<_SessionSettingsDialog> {
  late SessionSettings _settings;
  String? _activeTemplate; // 'penAndPaper', 'digital', or null

  @override
  void initState() {
    super.initState();
    _settings = widget.initial?.copy() ?? SessionSettings.penAndPaper();
    _detectTemplate();
  }

  /// Checks if the current settings match a known template.
  void _detectTemplate() {
    final pp = SessionSettings.penAndPaper();
    final dg = SessionSettings.digital();
    if (_matchesTemplate(pp)) {
      _activeTemplate = 'penAndPaper';
    } else if (_matchesTemplate(dg)) {
      _activeTemplate = 'digital';
    } else {
      _activeTemplate = null;
    }
  }

  /// Returns true if [_settings] matches [template] on all fields.
  bool _matchesTemplate(SessionSettings template) {
    return _settings.fogOfWar == template.fogOfWar &&
        _settings.shadowMode == template.shadowMode &&
        _settings.drawingTools == template.drawingTools &&
        _settings.tokens == template.tokens &&
        _settings.measureTool == template.measureTool &&
        _settings.ruler == template.ruler &&
        _settings.doorToggles == template.doorToggles &&
        _settings.hpBars == template.hpBars &&
        _settings.conditions == template.conditions &&
        _settings.aoeTemplates == template.aoeTemplates &&
        _settings.initiativeTracker == template.initiativeTracker &&
        _settings.fogMode == template.fogMode &&
        _settings.fogAnimation == template.fogAnimation &&
        _settings.globalEffects == template.globalEffects;
  }

  void _applyPenAndPaper() {
    setState(() {
      _settings = SessionSettings.penAndPaper();
      _activeTemplate = 'penAndPaper';
    });
  }

  void _applyDigital() {
    setState(() {
      _settings = SessionSettings.digital();
      _activeTemplate = 'digital';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: _kPanelBg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: _kBorderGold, width: 1.5),
      ),
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 400,
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // ── Header ──────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 0),
              child: Row(
                children: [
                  const Icon(Icons.settings, color: _kAccentGold, size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Session Settings',
                      style: TextStyle(
                        color: _kTextPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: _kAccentGoldDim, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),

            const Divider(color: _kBorderGold, height: 16),

            // ── Scrollable content ──────────────────────────────
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Template buttons ──────────────────────────
                    _buildTemplateButtons(),
                    const SizedBox(height: 16),

                    // ── Map ───────────────────────────────────────
                    _buildSectionHeader('Map'),
                    _buildToggle('Fog of War', Icons.cloud, _settings.fogOfWar,
                        (v) => setState(() { _settings.fogOfWar = v; _detectTemplate(); })),
                    _buildToggle('Shadow Mode', Icons.preview, _settings.shadowMode,
                        (v) => setState(() { _settings.shadowMode = v; _detectTemplate(); })),
                    _buildToggle('Drawing Tools', Icons.brush, _settings.drawingTools,
                        (v) => setState(() { _settings.drawingTools = v; _detectTemplate(); })),
                    _buildToggle('Door Toggles', Icons.door_front_door, _settings.doorToggles,
                        (v) => setState(() { _settings.doorToggles = v; _detectTemplate(); })),

                    const SizedBox(height: 12),

                    // ── Tools ─────────────────────────────────────
                    _buildSectionHeader('Tools'),
                    _buildToggle('Tokens', Icons.person_pin, _settings.tokens,
                        (v) => setState(() { _settings.tokens = v; _detectTemplate(); })),
                    _buildToggle('Measure', Icons.straighten, _settings.measureTool,
                        (v) => setState(() { _settings.measureTool = v; _detectTemplate(); })),
                    _buildToggle('Ruler', Icons.square_foot, _settings.ruler,
                        (v) => setState(() { _settings.ruler = v; _detectTemplate(); })),

                    const SizedBox(height: 12),

                    // ── Combat ────────────────────────────────────
                    _buildSectionHeader('Combat'),
                    _buildToggle('HP Bars', Icons.favorite, _settings.hpBars,
                        (v) => setState(() { _settings.hpBars = v; _detectTemplate(); })),
                    _buildToggle('Conditions', Icons.whatshot, _settings.conditions,
                        (v) => setState(() { _settings.conditions = v; _detectTemplate(); })),
                    _buildToggle('AoE Templates', Icons.my_location, _settings.aoeTemplates,
                        (v) => setState(() { _settings.aoeTemplates = v; _detectTemplate(); })),

                    const SizedBox(height: 12),

                    // ── Map Rendering ──────────────────────────────
                    _buildSectionHeader('Map Rendering'),
                    _buildFogModeSelector(),
                    _buildToggle('Fog Animation', Icons.animation, _settings.fogAnimation,
                        (v) => setState(() { _settings.fogAnimation = v; })),

                    const SizedBox(height: 12),

                    // ── Atmosphere ────────────────────────────────
                    _buildSectionHeader('Atmosphere'),
                    _buildToggle('Light Animations', Icons.lightbulb, _settings.lightAnimations,
                        (v) => setState(() { _settings.lightAnimations = v; })),
                    _buildToggle('Global Effects', Icons.auto_awesome, _settings.globalEffects,
                        (v) => setState(() { _settings.globalEffects = v; })),
                    _buildFutureToggle('Ambient Sound', Icons.music_note),
                    _buildFutureToggle('Weather Effects', Icons.thunderstorm),

                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),

            // ── Footer buttons ──────────────────────────────────
            const Divider(color: _kBorderGold, height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: _kTextSecondary, fontSize: 14),
                    ),
                  ),
                  const SizedBox(width: 12),
                  GestureDetector(
                    onTap: () => Navigator.pop(context, _settings),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                      decoration: BoxDecoration(
                        color: _kAccentGold,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        'Save',
                        style: TextStyle(
                          color: _kPanelBg,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Builds a row of four fog mode radio buttons.
  Widget _buildFogModeSelector() {
    const modes = [
      ('standard', 'Standard'),
      ('soft', 'Soft'),
      ('cloud', 'Cloud'),
      ('atmospheric', 'Atmos'),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.cloud, color: _kAccentGoldDim, size: 18),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Fog Mode',
                  style: TextStyle(color: _kTextPrimary, fontSize: 14),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              for (int i = 0; i < modes.length; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() {
                      _settings.fogMode = modes[i].$1;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: _settings.fogMode == modes[i].$1
                            ? _kSurfaceActive
                            : _kSurface,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: _settings.fogMode == modes[i].$1
                              ? _kAccentGold
                              : _kBorderGold,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          modes[i].$2,
                          style: TextStyle(
                            color: _settings.fogMode == modes[i].$1
                                ? _kTextPrimary
                                : _kTextSecondary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  /// Builds the two big template preset buttons.
  Widget _buildTemplateButtons() {
    return Row(
      children: [
        Expanded(
          child: _buildTemplateButton(
            label: 'Pen & Paper',
            icon: Icons.edit_note,
            active: _activeTemplate == 'penAndPaper',
            onTap: _applyPenAndPaper,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _buildTemplateButton(
            label: 'Digital',
            icon: Icons.laptop,
            active: _activeTemplate == 'digital',
            onTap: _applyDigital,
          ),
        ),
      ],
    );
  }

  /// A single template preset button.
  Widget _buildTemplateButton({
    required String label,
    required IconData icon,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? _kAccentGold : _kBorderGold,
            width: active ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(icon, color: active ? _kAccentGold : _kAccentGoldDim, size: 28),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                color: active ? _kTextPrimary : _kTextSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Builds a section header label.
  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          color: _kAccentGoldDim,
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  /// Builds a toggle row with an icon, label, and switch.
  Widget _buildToggle(
    String label,
    IconData icon,
    bool value,
    ValueChanged<bool> onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icon, color: value ? _kAccentGold : _kAccentGoldDim, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: value ? _kTextPrimary : _kTextSecondary,
                fontSize: 14,
              ),
            ),
          ),
          SizedBox(
            height: 28,
            child: Switch(
              value: value,
              onChanged: onChanged,
              activeColor: _kAccentGold,
              activeTrackColor: _kAccentGold.withValues(alpha: 0.4),
              inactiveThumbColor: _kAccentGoldDim,
              inactiveTrackColor: _kBorderGold.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds a greyed-out "coming soon" toggle for future features.
  Widget _buildFutureToggle(String label, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icon, color: _kBorderGold.withValues(alpha: 0.5), size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: _kTextSecondary.withValues(alpha: 0.5),
                fontSize: 14,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: _kBorderGold.withValues(alpha: 0.3)),
            ),
            child: Text(
              'soon',
              style: TextStyle(
                color: _kTextSecondary.withValues(alpha: 0.4),
                fontSize: 10,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
