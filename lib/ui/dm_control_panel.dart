import 'package:flutter/material.dart';

import '../model/aoe_template.dart';
import '../model/map_token.dart';
import '../model/session.dart';
import '../state/vtt_state.dart';
import 'session_settings_dialog.dart';

// ─── Medieval warm color palette ────────────────────────────────────

/// Dark parchment background for the panel shell.
const _kPanelBg = Color(0xFF1a1512);

/// Primary gold used for active icons, text, and accents.
const _kAccentGold = Color(0xFFd4a76a);

/// Dimmed gold for inactive icons and secondary text.
const _kAccentGoldDim = Color(0xFF8a7044);

/// Border color used for panel edges and dividers.
const _kBorderGold = Color(0xFF5a4a30);

/// Primary text color (gold tone).
const _kTextPrimary = Color(0xFFd4a76a);

/// Secondary / hint text color (dim gold).
const _kTextSecondary = Color(0xFF8a7044);

/// Surface color for cards and list items.
const _kSurface = Color(0xFF241e18);

/// Highlighted surface color for active / selected items.
const _kSurfaceActive = Color(0xFF3a3020);

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

  /// Sets the fog brush radius to `radius` grid cells (0, 1, or 2).
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
  /// `tvWidthInches` is the physical width of the TV screen in inches.
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

  /// Switches to distance measurement interaction mode.
  final VoidCallback onSetMeasureMode;

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

  /// Edits combat metadata on an existing token.
  ///
  /// `id` identifies the token. Named parameters `name`, `maxHp`,
  /// `currentHp`, and `conditions` are applied if non-null.
  final void Function(String id,
      {String? name,
      int? maxHp,
      int? currentHp,
      Set<String>? conditions}) onEditToken;

  // ── Undo / Redo ───────────────────────────────────────────────────

  /// Undoes the most recent action on the TV.
  final VoidCallback onUndo;

  /// Redoes the most recently undone action on the TV.
  final VoidCallback onRedo;

  // ── Shadow mode ───────────────────────────────────────────────────

  /// Toggles shadow (preview) mode for fog painting.
  final VoidCallback onToggleShadowMode;

  /// Commits pending shadow fog cells.
  final VoidCallback onCommitShadow;

  /// Discards pending shadow fog cells without committing.
  final VoidCallback onClearShadow;

  // ── Room reveal ───────────────────────────────────────────────────

  /// Switches to room-reveal interaction mode.
  final VoidCallback onSetRoomRevealMode;

  /// Reveals a connected room given a list of cell indices.
  final void Function(List<int> cells) onRoomReveal;

  // ── AoE templates ─────────────────────────────────────────────────

  /// Switches to AoE template interaction mode.
  final VoidCallback onSetAoeMode;

  /// Places an area-of-effect template on the map.
  final void Function(AoeTemplate template) onSetAoe;

  /// Removes the active area-of-effect template.
  final VoidCallback onClearAoe;

  // ── Ruler overlay ──────────────────────────────────────────────────

  /// Toggles the L-shaped ruler overlay visibility.
  final VoidCallback onToggleRuler;

  /// Rotates the ruler 90 degrees clockwise.
  final VoidCallback onRotateRuler;

  /// Sets the scale slider factor for fine-tune zoom adjustment.
  final void Function(double factor) onSetScaleFactor;

  /// Sends updated [SessionSettings] to the TV for the active session.
  ///
  /// Called when the DM saves changes in the session settings dialog.
  final void Function(SessionSettings settings) onUpdateSessionSettings;

  /// Triggers a global visual effect on the TV.
  ///
  /// `effect` is one of `'flash'`, `'shake'`, `'fade'`, `'pulse'`, or
  /// `'danger'`.
  final void Function(String effect) onTriggerEffect;

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
    required this.onSetMeasureMode,
    required this.onSetDrawColor,
    required this.onSetDrawWidth,
    required this.onClearDrawings,
    required this.onUndoStroke,
    required this.onClearTokens,
    required this.onEditToken,
    required this.onUndo,
    required this.onRedo,
    required this.onToggleShadowMode,
    required this.onCommitShadow,
    required this.onClearShadow,
    required this.onSetRoomRevealMode,
    required this.onRoomReveal,
    required this.onSetAoeMode,
    required this.onSetAoe,
    required this.onClearAoe,
    required this.onToggleRuler,
    required this.onRotateRuler,
    required this.onSetScaleFactor,
    required this.onUpdateSessionSettings,
    required this.onTriggerEffect,
  });
}

/// Collapsible DM control panel with a tabbed medieval-themed UI.
///
/// When collapsed, it displays as a golden shield icon (48x48). When
/// expanded, it shows a 220px-wide panel with 6 tabs: Combat, Fog,
/// Draw, Measure, Camera, and Settings.
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
  int _activeTab = 0;

  // AoE template state
  AoeShape _aoeShape = AoeShape.circle;
  int _aoeSizeFt = 20;

  /// Sends the current AoE template configuration to the TV via callback.
  ///
  /// Converts the size from feet to grid squares (5ft per square),
  /// placing the origin at map center (0, 0) as a default.
  void _sendCurrentAoe() {
    final radiusInSquares = _aoeSizeFt / 5.0;
    cb.onSetAoe(AoeTemplate(
      shape: _aoeShape,
      originX: 0,
      originY: 0,
      radius: radiusInSquares,
    ));
  }

  VttState get state => widget.state;
  DmCallbacks get cb => widget.callbacks;

  /// All possible tab definitions: icon, tooltip label, and tab ID.
  static const _allTabs = [
    (Icons.shield, 'Combat', 'combat'),
    (Icons.cloud, 'Fog', 'fog'),
    (Icons.brush, 'Draw', 'draw'),
    (Icons.straighten, 'Measure', 'measure'),
    (Icons.videocam, 'Camera', 'camera'),
    (Icons.tune, 'Settings', 'settings'),
  ];

  /// Returns the list of tabs visible given current [SessionSettings].
  ///
  /// Hides tabs when all their features are disabled:
  /// - Combat tab hidden when tokens + hpBars + conditions + aoeTemplates all off
  /// - Draw tab hidden when drawingTools off
  /// - Measure tab hidden when measureTool off
  /// - Fog, Camera, Settings are always shown
  List<(IconData, String, String)> get _visibleTabs {
    final s = state.sessionSettings;
    final hasCombat = s.tokens || s.hpBars || s.conditions || s.aoeTemplates;
    return [
      if (hasCombat) _allTabs[0], // Combat
      _allTabs[1],                // Fog (always)
      if (s.drawingTools) _allTabs[2], // Draw
      if (s.measureTool) _allTabs[3],  // Measure
      _allTabs[4],                // Camera (always)
      _allTabs[5],                // Settings (always)
    ];
  }

  @override
  Widget build(BuildContext context) {
    if (!_expanded) {
      return GestureDetector(
        onTap: () => setState(() => _expanded = true),
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: _kPanelBg,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _kBorderGold),
          ),
          child: const Icon(Icons.shield, color: _kAccentGold, size: 22),
        ),
      );
    }

    return Container(
      width: 220,
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height - 80,
      ),
      decoration: BoxDecoration(
        color: _kPanelBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _kBorderGold),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          _buildHeader(),
          // Tab bar
          _buildTabBar(),
          // Divider
          Container(height: 1, color: _kBorderGold),
          // Tab content
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(12),
              child: _buildTabContent(),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds the panel header with "DM" title, undo/redo buttons, and close button.
  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 4),
      child: Row(
        children: [
          const Icon(Icons.shield, color: _kAccentGold, size: 16),
          const SizedBox(width: 6),
          const Expanded(
            child: Text(
              'DM',
              style: TextStyle(
                color: _kTextPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.0,
              ),
            ),
          ),
          // Undo button
          GestureDetector(
            onTap: state.canUndo ? cb.onUndo : null,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(
                Icons.undo,
                color: state.canUndo ? _kAccentGold : _kAccentGoldDim,
                size: 18,
              ),
            ),
          ),
          // Redo button
          GestureDetector(
            onTap: state.canRedo ? cb.onRedo : null,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(
                Icons.redo,
                color: state.canRedo ? _kAccentGold : _kAccentGoldDim,
                size: 18,
              ),
            ),
          ),
          // Session settings gear button
          GestureDetector(
            onTap: () async {
              final updated = await showSessionSettingsDialog(
                context,
                initial: state.sessionSettings,
              );
              if (updated != null) {
                cb.onUpdateSessionSettings(updated);
              }
            },
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.settings, color: _kAccentGoldDim, size: 18),
            ),
          ),
          GestureDetector(
            onTap: () => setState(() => _expanded = false),
            child: const Padding(
              padding: EdgeInsets.all(8),
              child: Icon(Icons.close, color: _kAccentGoldDim, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  /// Builds the 6-icon horizontal tab bar.
  Widget _buildTabBar() {
    final tabs = _visibleTabs;
    // Clamp _activeTab to valid range
    if (_activeTab >= tabs.length) _activeTab = 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          for (int i = 0; i < tabs.length; i++)
            Expanded(
              child: GestureDetector(
                onTap: () {
                  setState(() => _activeTab = i);
                  // Auto-activate measure mode when switching to Measure tab
                  if (tabs[i].$3 == 'measure') cb.onSetMeasureMode();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    border: _activeTab == i
                        ? const Border(
                            bottom:
                                BorderSide(color: _kAccentGold, width: 2),
                          )
                        : null,
                  ),
                  child: Icon(
                    tabs[i].$1,
                    color: _activeTab == i ? _kAccentGold : _kAccentGoldDim,
                    size: 20,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Dispatches to the correct tab content builder based on the active
  /// visible tab's ID string.
  Widget _buildTabContent() {
    final tabs = _visibleTabs;
    if (_activeTab >= tabs.length) return const SizedBox.shrink();
    final tabId = tabs[_activeTab].$3;
    switch (tabId) {
      case 'combat':
        return _buildCombatTab();
      case 'fog':
        return _buildFogTab();
      case 'draw':
        return _buildDrawTab();
      case 'measure':
        return _buildMeasureTab();
      case 'camera':
        return _buildCameraTab();
      case 'settings':
        return _buildSettingsTab();
      default:
        return const SizedBox.shrink();
    }
  }

  // ─── Combat Tab ──────────────────────────────────────────

  /// Builds the Combat tab: token placement toggle, token list with
  /// HP controls, and a clear-all button.
  Widget _buildCombatTab() {
    final tokens = state.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.person_pin,
          label: 'Place Token',
          active: state.interactionMode == InteractionMode.token,
          onTap: cb.onSetTokenMode,
        ),
        const SizedBox(height: 8),
        if (tokens.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text(
              'Switch to token mode\nand tap the map',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: _kTextSecondary,
                fontSize: 12,
                fontStyle: FontStyle.italic,
              ),
            ),
          )
        else ...[
          for (final token in tokens) ...[
            _buildTokenRow(token),
            const SizedBox(height: 6),
          ],
        ],
        if (tokens.isNotEmpty) ...[
          const SizedBox(height: 4),
          _GoldButton(
            icon: Icons.delete_outline,
            label: 'Clear All Tokens',
            onTap: cb.onClearTokens,
          ),
        ],
        // ── AoE Templates ──────────────────────────────────────────
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 8),
        const _GoldLabel('AoE'),
        const SizedBox(height: 4),
        // Shape selector
        Row(
          children: [
            for (final entry in {
              AoeShape.circle: Icons.circle_outlined,
              AoeShape.cone: Icons.pie_chart_outline,
              AoeShape.line: Icons.horizontal_rule,
              AoeShape.square: Icons.crop_square,
            }.entries) ...[
              if (entry.key != AoeShape.circle) const SizedBox(width: 4),
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    setState(() => _aoeShape = entry.key);
                    _sendCurrentAoe();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: _aoeShape == entry.key
                          ? _kSurfaceActive
                          : _kSurface,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: _aoeShape == entry.key
                            ? _kAccentGold
                            : _kBorderGold,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        entry.value,
                        color: _aoeShape == entry.key
                            ? _kAccentGold
                            : _kAccentGoldDim,
                        size: 18,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 6),
        // Size selector (in feet: 10, 15, 20, 30, 60)
        const _GoldLabel('Size'),
        const SizedBox(height: 4),
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            for (final ft in [10, 15, 20, 30, 60])
              GestureDetector(
                onTap: () {
                  setState(() => _aoeSizeFt = ft);
                  _sendCurrentAoe();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 6),
                  decoration: BoxDecoration(
                    color: _aoeSizeFt == ft
                        ? _kSurfaceActive
                        : _kSurface,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: _aoeSizeFt == ft
                          ? _kAccentGold
                          : _kBorderGold,
                    ),
                  ),
                  child: Text(
                    '${ft}ft',
                    style: TextStyle(
                      color: _aoeSizeFt == ft
                          ? _kTextPrimary
                          : _kTextSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.my_location,
                label: 'AoE Mode',
                active: false,
                onTap: cb.onSetAoeMode,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.close,
                label: 'Clear',
                onTap: cb.onClearAoe,
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// Builds a single token row with colored dot, name, conditions,
  /// and HP increment/decrement controls.
  Widget _buildTokenRow(MapToken token) {
    final displayName =
        token.name.isNotEmpty ? token.name : token.label;
    return GestureDetector(
      onTap: () => _showTokenEditDialog(token),
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: _kBorderGold.withValues(alpha: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Name row
            Row(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: token.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    displayName,
                    style: const TextStyle(
                      color: _kTextPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // Condition dots
                if (token.conditions.isNotEmpty)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final cond in token.conditions.take(4))
                        Padding(
                          padding: const EdgeInsets.only(left: 3),
                          child: Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Color(
                                MapToken.conditionColors[cond] ?? 0xFFFFFFFF,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
              ],
            ),
            // HP row (only if maxHp > 0)
            if (token.maxHp > 0) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  // Minus button
                  _HpButton(
                    icon: Icons.remove,
                    onTap: () {
                      final newHp = (token.currentHp - 1).clamp(0, token.maxHp);
                      cb.onEditToken(token.id, currentHp: newHp);
                    },
                  ),
                  const SizedBox(width: 6),
                  // HP display
                  Expanded(
                    child: Center(
                      child: Text(
                        '${token.currentHp} / ${token.maxHp}',
                        style: TextStyle(
                          color: token.currentHp <= 0
                              ? Colors.redAccent
                              : _kTextPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  // Plus button
                  _HpButton(
                    icon: Icons.add,
                    onTap: () {
                      final newHp = (token.currentHp + 1).clamp(0, token.maxHp);
                      cb.onEditToken(token.id, currentHp: newHp);
                    },
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Shows a medieval-styled dialog for editing a token's combat metadata.
  ///
  /// Fields: name, maxHp, currentHp, condition toggles, and a delete button.
  /// On save, calls [DmCallbacks.onEditToken] with all changed values.
  void _showTokenEditDialog(MapToken token) {
    final nameCtrl = TextEditingController(text: token.name);
    final maxHpCtrl =
        TextEditingController(text: token.maxHp > 0 ? '${token.maxHp}' : '');
    final currentHpCtrl = TextEditingController(
        text: token.maxHp > 0 ? '${token.currentHp}' : '');
    final selectedConditions = Set<String>.from(token.conditions);

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: _kPanelBg,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: const BorderSide(color: _kBorderGold),
            ),
            title: Row(
              children: [
                Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: token.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Edit ${token.label}',
                  style: const TextStyle(
                    color: _kTextPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Name field
                  _goldTextField(nameCtrl, 'Name', 'e.g. Goblin Archer'),
                  const SizedBox(height: 12),
                  // HP fields
                  Row(
                    children: [
                      Expanded(
                        child: _goldTextField(
                          maxHpCtrl,
                          'Max HP',
                          '0',
                          isNumeric: true,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _goldTextField(
                          currentHpCtrl,
                          'Current HP',
                          '0',
                          isNumeric: true,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  // Conditions
                  const _GoldLabel('Conditions'),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final entry
                          in MapToken.conditionColors.entries)
                        GestureDetector(
                          onTap: () {
                            setDialogState(() {
                              if (selectedConditions.contains(entry.key)) {
                                selectedConditions.remove(entry.key);
                              } else {
                                selectedConditions.add(entry.key);
                              }
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: selectedConditions.contains(entry.key)
                                  ? Color(entry.value).withValues(alpha: 0.3)
                                  : _kSurface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: selectedConditions.contains(entry.key)
                                    ? Color(entry.value)
                                    : _kBorderGold,
                              ),
                            ),
                            child: Text(
                              entry.key,
                              style: TextStyle(
                                color: selectedConditions.contains(entry.key)
                                    ? Color(entry.value)
                                    : _kTextSecondary,
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            actions: [
              // Delete
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  // Remove the token by setting HP to trigger awareness
                  // We use the clear mechanism through the state
                  cb.onEditToken(token.id,
                      name: '', maxHp: 0, currentHp: 0, conditions: {});
                },
                child: const Text(
                  'Reset',
                  style: TextStyle(color: _kTextSecondary, fontSize: 13),
                ),
              ),
              const Spacer(),
              // Cancel
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: _kTextSecondary, fontSize: 13),
                ),
              ),
              // Save
              GestureDetector(
                onTap: () {
                  final maxHp = int.tryParse(maxHpCtrl.text) ?? 0;
                  final currentHp =
                      (int.tryParse(currentHpCtrl.text) ?? 0).clamp(0, maxHp > 0 ? maxHp : 9999);
                  cb.onEditToken(
                    token.id,
                    name: nameCtrl.text.trim(),
                    maxHp: maxHp,
                    currentHp: currentHp,
                    conditions: Set<String>.from(selectedConditions),
                  );
                  Navigator.pop(ctx);
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: _kAccentGold,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'Save',
                    style: TextStyle(
                      color: _kPanelBg,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    ).whenComplete(() {
      nameCtrl.dispose();
      maxHpCtrl.dispose();
      currentHpCtrl.dispose();
    });
  }

  /// Helper to build a gold-themed [TextField] for the edit dialog.
  Widget _goldTextField(
    TextEditingController controller,
    String label,
    String hint, {
    bool isNumeric = false,
  }) {
    return TextField(
      controller: controller,
      keyboardType:
          isNumeric ? const TextInputType.numberWithOptions() : TextInputType.text,
      style: const TextStyle(color: _kTextPrimary, fontSize: 14),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: const TextStyle(color: _kTextSecondary, fontSize: 12),
        hintStyle: TextStyle(color: _kTextSecondary.withValues(alpha: 0.5)),
        enabledBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: _kBorderGold),
        ),
        focusedBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: _kAccentGold),
        ),
        isDense: true,
        contentPadding: const EdgeInsets.only(bottom: 6),
      ),
    );
  }

  // ─── Fog Tab ─────────────────────────────────────────────

  /// Builds the Fog tab: shadow toggle, fog on/off, reveal/hide all,
  /// brush mode, brush size, and room reveal.
  Widget _buildFogTab() {
    final hasShadowCells =
        state.shadowRevealCells.isNotEmpty || state.shadowHideCells.isNotEmpty;
    final shadowCellCount =
        state.shadowRevealCells.length + state.shadowHideCells.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Shadow / Live toggle
        _GoldToggle(
          icon: state.shadowMode ? Icons.preview : Icons.flash_on,
          label: state.shadowMode ? 'Shadow' : 'Live',
          active: state.shadowMode,
          onTap: cb.onToggleShadowMode,
        ),
        // Shadow commit/clear controls (when cells are staged)
        if (state.shadowMode && hasShadowCells) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  '$shadowCellCount cells staged',
                  style: const TextStyle(
                    color: _kTextSecondary,
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
              // Apply (commit)
              GestureDetector(
                onTap: cb.onCommitShadow,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2E7D32).withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: const Color(0xFF4CAF50),
                    ),
                  ),
                  child: const Icon(Icons.check, color: Color(0xFF4CAF50), size: 16),
                ),
              ),
              const SizedBox(width: 6),
              // Clear
              GestureDetector(
                onTap: cb.onClearShadow,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFC62828).withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(
                      color: const Color(0xFFE53935),
                    ),
                  ),
                  child: const Icon(Icons.close, color: Color(0xFFE53935), size: 16),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        _GoldButton(
          icon: Icons.cloud,
          label: 'Fog Brush',
          active: state.interactionMode == InteractionMode.fogReveal,
          onTap: cb.onSetFogMode,
        ),
        const SizedBox(height: 8),
        _GoldToggle(
          icon: state.fogEnabled ? Icons.cloud : Icons.cloud_off,
          label: 'Fog',
          active: state.fogEnabled,
          onTap: cb.onToggleFog,
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.visibility,
                label: 'Reveal',
                onTap: cb.onRevealAll,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.visibility_off,
                label: 'Hide',
                onTap: cb.onHideAll,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _GoldToggle(
          icon: state.revealMode ? Icons.wb_sunny : Icons.dark_mode,
          label: state.revealMode ? 'Reveal' : 'Hide',
          active: state.revealMode,
          onTap: cb.onToggleRevealMode,
        ),
        const SizedBox(height: 8),
        // Brush size
        const _GoldLabel('Brush Size'),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final entry in {0: '1', 1: '3', 2: '5'}.entries) ...[
              if (entry.key > 0) const SizedBox(width: 4),
              Expanded(
                child: GestureDetector(
                  onTap: () => cb.onSetBrushRadius(entry.key),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: state.brushRadius == entry.key
                          ? _kSurfaceActive
                          : _kSurface,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: state.brushRadius == entry.key
                            ? _kAccentGold
                            : _kBorderGold,
                      ),
                    ),
                    child: Center(
                      child: Text(
                        entry.value,
                        style: TextStyle(
                          color: state.brushRadius == entry.key
                              ? _kTextPrimary
                              : _kTextSecondary,
                          fontSize: 13,
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
        const SizedBox(height: 8),
        // Room reveal mode button
        _GoldButton(
          icon: Icons.meeting_room,
          label: 'Room',
          active: false, // roomReveal mode may not be in InteractionMode yet
          onTap: cb.onSetRoomRevealMode,
        ),
      ],
    );
  }

  // ─── Draw Tab ────────────────────────────────────────────

  /// Builds the Draw tab: color palette, width presets, clear/undo buttons.
  Widget _buildDrawTab() {
    const colors = [
      Color(0xFFE53935), // red
      Color(0xFF43A047), // green
      Color(0xFF1E88E5), // blue
      Color(0xFFFDD835), // yellow
      Color(0xFFFF8F00), // orange
      Color(0xFFFFFFFF), // white
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.brush,
          label: 'Draw Mode',
          active: state.interactionMode == InteractionMode.draw,
          onTap: cb.onSetDrawMode,
        ),
        const SizedBox(height: 10),
        // Color dots
        const _GoldLabel('Color'),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final color in colors)
              Expanded(
                child: GestureDetector(
                  onTap: () => cb.onSetDrawColor(color),
                  child: Center(
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                        border: state.drawColor.toARGB32() == color.toARGB32()
                            ? Border.all(color: _kAccentGold, width: 2.5)
                            : Border.all(
                                color: _kBorderGold,
                                width: 1,
                              ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        // Width presets
        const _GoldLabel('Width'),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final entry in {2.0: 'S', 4.0: 'M', 8.0: 'L'}.entries) ...[
              if (entry.key != 2.0) const SizedBox(width: 4),
              Expanded(
                child: GestureDetector(
                  onTap: () => cb.onSetDrawWidth(entry.key),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: state.drawWidth == entry.key
                          ? _kSurfaceActive
                          : _kSurface,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: state.drawWidth == entry.key
                            ? _kAccentGold
                            : _kBorderGold,
                      ),
                    ),
                    child: Center(
                      child: Text(
                        entry.value,
                        style: TextStyle(
                          color: state.drawWidth == entry.key
                              ? _kTextPrimary
                              : _kTextSecondary,
                          fontSize: 13,
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
        const SizedBox(height: 10),
        // Clear / Undo
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.delete_outline,
                label: 'Clear',
                onTap: cb.onClearDrawings,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.undo,
                label: 'Undo',
                onTap: cb.onUndoStroke,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Measure Tab ─────────────────────────────────────────

  /// Builds the Measure tab: hint text for drag-to-measure.
  Widget _buildMeasureTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.straighten,
          label: 'Measure Mode',
          active: state.interactionMode == InteractionMode.measure,
          onTap: cb.onSetMeasureMode,
        ),
        const SizedBox(height: 16),
        const Center(
          child: Column(
            children: [
              Icon(Icons.straighten, color: _kAccentGoldDim, size: 32),
              SizedBox(height: 8),
              Text(
                'Drag on map to measure',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _kTextSecondary,
                  fontSize: 13,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ─── Camera Tab ──────────────────────────────────────────

  /// Builds the Camera tab: zoom in/out/fit and rotate CW/CCW/reset.
  Widget _buildCameraTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _GoldLabel('Zoom'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(icon: Icons.remove, label: '', onTap: cb.onZoomOut),
            ),
            const SizedBox(width: 4),
            Expanded(
              flex: 2,
              child: _GoldButton(
                  icon: Icons.fit_screen, label: 'Fit', onTap: cb.onZoomToFit),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _GoldButton(icon: Icons.add, label: '', onTap: cb.onZoomIn),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const _GoldLabel('Rotation'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                  icon: Icons.rotate_left, label: '', onTap: cb.onRotateCCW),
            ),
            const SizedBox(width: 4),
            Expanded(
              flex: 2,
              child: _GoldButton(
                icon: Icons.screen_rotation_alt,
                label: '0\u00B0',
                onTap: cb.onResetRotation,
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _GoldButton(
                  icon: Icons.rotate_right, label: '', onTap: cb.onRotateCW),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Settings Tab ────────────────────────────────────────

  /// Builds the Settings tab: load map, grid/walls toggles, calibrate button.
  Widget _buildSettingsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.folder_open,
          label: 'Load Map',
          onTap: cb.onLoadMap,
        ),
        const SizedBox(height: 10),
        _GoldToggle(
          icon: state.showGrid ? Icons.grid_on : Icons.grid_off,
          label: 'Grid',
          active: state.showGrid,
          onTap: cb.onToggleGrid,
        ),
        const SizedBox(height: 6),
        _GoldToggle(
          icon: Icons.line_style,
          label: 'Walls',
          active: state.showWalls,
          onTap: cb.onToggleWalls,
        ),
        const SizedBox(height: 10),
        const _GoldLabel('Calibrate'),
        const SizedBox(height: 4),
        _GoldButton(
          icon: Icons.straighten,
          label: state.calibratedBaseZoom != null
              ? '${state.tvWidthInches!.round()}" calibrated'
              : 'Set TV size',
          onTap: () => _showCalibrationDialog(context),
        ),
        const SizedBox(height: 12),
        const Divider(color: _kBorderGold, height: 1),
        const SizedBox(height: 10),
        const _GoldLabel('Ruler'),
        const SizedBox(height: 4),
        _GoldToggle(
          icon: Icons.square_foot,
          label: 'Ruler overlay',
          active: state.rulerVisible,
          onTap: cb.onToggleRuler,
        ),
        const SizedBox(height: 6),
        _GoldButton(
          icon: Icons.rotate_right,
          label: 'Rotate ruler',
          onTap: cb.onRotateRuler,
        ),
        const SizedBox(height: 10),
        const _GoldLabel('Scale'),
        const SizedBox(height: 4),
        Text(
          'Scale: ${state.scaleSliderFactor.toStringAsFixed(2)}x',
          style: const TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        const SizedBox(height: 2),
        SliderTheme(
          data: SliderThemeData(
            activeTrackColor: _kAccentGold,
            inactiveTrackColor: _kAccentGoldDim.withValues(alpha: 0.4),
            thumbColor: _kAccentGold,
            overlayColor: _kAccentGold.withValues(alpha: 0.2),
            trackHeight: 3,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
          ),
          child: Slider(
            value: state.scaleSliderFactor,
            min: 0.5,
            max: 2.0,
            onChanged: (v) => cb.onSetScaleFactor(v),
          ),
        ),
        const SizedBox(height: 12),
        const Divider(color: _kBorderGold, height: 1),
        const SizedBox(height: 10),
        const _GoldLabel('Effects'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.flash_on,
                label: 'Flash',
                onTap: () => cb.onTriggerEffect('flash'),
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _GoldButton(
                icon: Icons.vibration,
                label: 'Shake',
                onTap: () => cb.onTriggerEffect('shake'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.brightness_2,
                label: 'Fade',
                onTap: () => cb.onTriggerEffect('fade'),
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _GoldButton(
                icon: Icons.all_out,
                label: 'Pulse',
                onTap: () => cb.onTriggerEffect('pulse'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        _GoldButton(
          icon: Icons.warning,
          label: 'Danger',
          onTap: () => cb.onTriggerEffect('danger'),
        ),
      ],
    );
  }

  /// Shows a dialog for entering the physical TV width to calibrate
  /// grid scale (1 grid square = 1 inch on the physical table).
  void _showCalibrationDialog(BuildContext context) {
    final controller = TextEditingController(
      text: state.tvWidthInches?.toString() ?? '',
    );
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _kPanelBg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: _kBorderGold),
        ),
        title: const Text(
          'Calibrate Grid',
          style: TextStyle(color: _kTextPrimary),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Enter your TV screen width in inches\n'
              'so grid squares match 1" miniature bases.',
              style: TextStyle(
                color: _kTextSecondary.withValues(alpha: 0.8),
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 18,
                color: _kTextPrimary,
              ),
              decoration: InputDecoration(
                hintText: 'e.g. 43',
                suffixText: 'inches',
                suffixStyle: const TextStyle(color: _kTextSecondary),
                hintStyle: TextStyle(
                  color: _kTextSecondary.withValues(alpha: 0.4),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: _kBorderGold),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: _kAccentGold),
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
                    backgroundColor: _kSurface,
                    labelStyle:
                        const TextStyle(color: _kTextSecondary, fontSize: 12),
                    side: const BorderSide(color: _kBorderGold),
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
              child: const Text(
                'Reset',
                style: TextStyle(color: _kTextSecondary),
              ),
            ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text(
              'Cancel',
              style: TextStyle(color: _kTextSecondary),
            ),
          ),
          GestureDetector(
            onTap: () {
              final inches = double.tryParse(controller.text.trim());
              if (inches == null || inches <= 0) return;
              cb.onCalibrate(inches);
              Navigator.pop(ctx);
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: _kAccentGold,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'Calibrate',
                style: TextStyle(
                  color: _kPanelBg,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    ).whenComplete(controller.dispose);
  }
}

// ─── Shared themed widgets ──────────────────────────────────────────

/// Gold-bordered button with optional active highlight.
///
/// Used throughout the DM panel for action buttons. When [active] is
/// true, draws a gold border and lighter background.
class _GoldButton extends StatelessWidget {
  /// Icon displayed on the left side of the button.
  final IconData icon;

  /// Text label shown next to the icon.
  final String label;

  /// Callback invoked when the button is tapped.
  final VoidCallback onTap;

  /// Whether the button is in an active/highlighted state.
  final bool active;

  const _GoldButton({
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
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: active ? _kAccentGold : _kBorderGold,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment:
              label.isEmpty ? MainAxisAlignment.center : MainAxisAlignment.start,
          children: [
            Icon(icon,
                color: active ? _kAccentGold : _kAccentGoldDim, size: 16),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    color: active ? _kTextPrimary : _kTextSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Gold-themed toggle switch with a status dot indicator.
///
/// Displays an icon, label, and a colored dot on the right side
/// (gold when active, dim when inactive).
class _GoldToggle extends StatelessWidget {
  /// Icon displayed on the left.
  final IconData icon;

  /// Text label.
  final String label;

  /// Whether the toggle is in its "on" state.
  final bool active;

  /// Callback invoked when tapped.
  final VoidCallback onTap;

  const _GoldToggle({
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
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: active ? _kAccentGold : _kBorderGold,
          ),
        ),
        child: Row(
          children: [
            Icon(icon,
                color: active ? _kAccentGold : _kAccentGoldDim, size: 16),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: active ? _kTextPrimary : _kTextSecondary,
                fontSize: 12,
              ),
            ),
            const Spacer(),
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? _kAccentGold : _kBorderGold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Gold-colored section label used to separate groups within a tab.
class _GoldLabel extends StatelessWidget {
  /// The label text.
  final String text;

  const _GoldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: _kAccentGoldDim,
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
    );
  }
}

/// Small square button for HP increment/decrement in the Combat tab.
class _HpButton extends StatelessWidget {
  /// The icon to display (typically [Icons.add] or [Icons.remove]).
  final IconData icon;

  /// Callback invoked when tapped.
  final VoidCallback onTap;

  const _HpButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 28,
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: _kBorderGold),
        ),
        child: Icon(icon, color: _kAccentGoldDim, size: 16),
      ),
    );
  }
}
