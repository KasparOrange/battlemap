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

// ─── Sizing (thumb-friendly: ≥ 44 px targets) ───────────────────────

/// Minimum height of every tappable control.
const double _kTarget = 44;

/// Body text size.
const double _kText = 14;

/// Icon size inside buttons.
const double _kIcon = 20;

/// Bundle of callbacks for every action the DM control panel can trigger.
///
/// Each screen that hosts a [DmControlPanel] provides its own
/// implementations. In networked mode ([VttCompanionScreen]), callbacks
/// send commands through the [VttRelayClient]. In local mode, callbacks
/// act directly on [VttState] and [VttGame].
///
/// The camera-link callbacks ([onSetCameraLink], [onSendView],
/// [onMatchTv]) are optional; the Camera tab shows the TV-link controls
/// only when they are provided (networked mode).
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

  /// Zooms the TV camera in by one step.
  final VoidCallback onZoomIn;

  /// Zooms the TV camera out by one step.
  final VoidCallback onZoomOut;

  /// Resets the TV camera zoom so the entire map fits on screen.
  final VoidCallback onZoomToFit;

  /// Rotates the TV camera 90 degrees clockwise.
  final VoidCallback onRotateCW;

  /// Rotates the TV camera 90 degrees counter-clockwise.
  final VoidCallback onRotateCCW;

  /// Resets the TV camera rotation to 0 degrees.
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

  /// Sets the drawing stroke width in world pixels.
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

  /// Removes a single token by id (token edit dialog "Delete").
  ///
  /// Optional for backwards compatibility; the Delete button is hidden
  /// when `null`.
  final void Function(String id)? onRemoveToken;

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

  /// Places or updates the area-of-effect template on the map.
  final void Function(AoeTemplate template) onSetAoe;

  /// Removes the active area-of-effect template.
  final VoidCallback onClearAoe;

  // ── Ruler overlay ──────────────────────────────────────────────────

  /// Toggles the L-shaped ruler overlay visibility.
  final VoidCallback onToggleRuler;

  /// Rotates the ruler 90 degrees clockwise.
  final VoidCallback onRotateRuler;

  /// Sets the scale slider factor for fine-tune zoom adjustment.
  ///
  /// Called once on slider release (the panel previews the value locally
  /// while dragging).
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

  // ── Camera link (networked mode only) ─────────────────────────────

  /// Turns continuous "TV follows the phone camera" on or off.
  final void Function(bool linked)? onSetCameraLink;

  /// Sends the phone's current camera to the TV once.
  final VoidCallback? onSendView;

  /// Moves the phone camera to the TV's current view.
  final VoidCallback? onMatchTv;

  /// Fits the whole map into the phone screen (phone camera only).
  final VoidCallback? onPhoneZoomToFit;

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
    this.onRemoveToken,
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
    this.onSetCameraLink,
    this.onSendView,
    this.onMatchTv,
    this.onPhoneZoomToFit,
  });
}

/// DM control panel — a bottom sheet with a tab bar at the bottom edge.
///
/// Designed for one-handed phone use: the tab bar (Combat, Fog, Draw,
/// Measure, Camera, Settings) sits at the bottom within thumb reach, the
/// active tab's content opens above it, and tapping the active tab again
/// collapses the content so only the tab bar remains. All targets are at
/// least 44 px high with 14 px text and 20 px icons.
///
/// The host lays it out below the map (a `Column`), not floating over it.
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

  /// Local preview of the scale slider while dragging (sent on release).
  double? _scalePreview;

  /// Local preview of the draw width slider while dragging (sent on release).
  double? _widthPreview;

  /// Whether "link TV to phone" is on (panel-local UI state).
  bool _cameraLinked = false;

  VttState get state => widget.state;
  DmCallbacks get cb => widget.callbacks;

  /// All possible tab definitions: icon, label, and tab ID.
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
    final maxContent = MediaQuery.of(context).size.height * 0.45;
    return Container(
      decoration: const BoxDecoration(
        color: _kPanelBg,
        border: Border(top: BorderSide(color: _kBorderGold)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_expanded) ...[
              _buildHeader(),
              Container(height: 1, color: _kBorderGold),
              ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxContent),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: _buildTabContent(),
                ),
              ),
              Container(height: 1, color: _kBorderGold),
            ],
            _buildTabBar(),
          ],
        ),
      ),
    );
  }

  /// Builds the header row: "DM" title, undo/redo, session settings gear,
  /// and a collapse chevron.
  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 2, 4, 2),
      child: Row(
        children: [
          const Icon(Icons.shield, color: _kAccentGold, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _visibleTabs.length > _activeTab ? _visibleTabs[_activeTab].$2 : 'DM',
              style: const TextStyle(
                color: _kTextPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.0,
              ),
            ),
          ),
          _IconTarget(
            icon: Icons.undo,
            enabled: state.canUndo,
            onTap: cb.onUndo,
          ),
          _IconTarget(
            icon: Icons.redo,
            enabled: state.canRedo,
            onTap: cb.onRedo,
          ),
          _IconTarget(
            icon: Icons.settings,
            onTap: () async {
              final updated = await showSessionSettingsDialog(
                context,
                initial: state.sessionSettings,
              );
              if (updated != null) {
                cb.onUpdateSessionSettings(updated);
              }
            },
          ),
          _IconTarget(
            icon: Icons.expand_more,
            onTap: () => setState(() => _expanded = false),
          ),
        ],
      ),
    );
  }

  /// Builds the bottom tab bar. Tapping the active tab toggles the content.
  Widget _buildTabBar() {
    final tabs = _visibleTabs;
    // Clamp _activeTab to valid range
    if (_activeTab >= tabs.length) _activeTab = 0;
    return Row(
      children: [
        for (int i = 0; i < tabs.length; i++)
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                setState(() {
                  if (_activeTab == i) {
                    _expanded = !_expanded;
                  } else {
                    _activeTab = i;
                    _expanded = true;
                  }
                });
                // Auto-activate measure mode when opening the Measure tab
                if (tabs[i].$3 == 'measure' && _expanded) cb.onSetMeasureMode();
              },
              child: Container(
                height: 56,
                decoration: BoxDecoration(
                  border: _activeTab == i && _expanded
                      ? const Border(
                          top: BorderSide(color: _kAccentGold, width: 2),
                        )
                      : null,
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      tabs[i].$1,
                      color: _activeTab == i ? _kAccentGold : _kAccentGoldDim,
                      size: 22,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      tabs[i].$2,
                      style: TextStyle(
                        color: _activeTab == i ? _kTextPrimary : _kTextSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
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

  /// Applies a new shape/size to the AoE tool and, if a template is on the
  /// map, updates it in place (origin and angle are kept).
  void _setAoeTool(AoeShape shape, double radius) {
    state.setAoeTool(shape, radius);
    final current = state.activeAoe;
    if (current != null) {
      cb.onSetAoe(AoeTemplate(
        shape: shape,
        originX: current.originX,
        originY: current.originY,
        radius: radius,
        angle: current.angle,
      ));
    }
  }

  /// Builds the Combat tab: token placement toggle, token list with
  /// HP controls, a clear-all button, and the AoE template controls.
  Widget _buildCombatTab() {
    final tokens = state.tokens;
    final s = state.sessionSettings;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (s.tokens) ...[
          _GoldButton(
            icon: Icons.person_pin,
            label: 'Place Token',
            active: state.interactionMode == InteractionMode.token,
            onTap: cb.onSetTokenMode,
          ),
          const SizedBox(height: 8),
          if (tokens.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Switch to token mode and tap the map',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _kTextSecondary,
                  fontSize: _kText,
                  fontStyle: FontStyle.italic,
                ),
              ),
            )
          else ...[
            for (final token in tokens) ...[
              _buildTokenRow(token),
              const SizedBox(height: 6),
            ],
            const SizedBox(height: 4),
            _GoldButton(
              icon: Icons.delete_outline,
              label: 'Clear All Tokens',
              onTap: cb.onClearTokens,
            ),
          ],
        ],
        if (s.aoeTemplates) ...[
          if (s.tokens) ...[
            const SizedBox(height: 12),
            Container(height: 1, color: _kBorderGold),
            const SizedBox(height: 10),
          ],
          _GoldButton(
            icon: Icons.my_location,
            label: 'AoE Mode',
            active: state.interactionMode == InteractionMode.aoe,
            onTap: cb.onSetAoeMode,
          ),
          const SizedBox(height: 4),
          const Text(
            'Tap the map to place. Drag to aim a cone or line, or to move a circle or square.',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
          const SizedBox(height: 8),
          const _GoldLabel('Shape'),
          const SizedBox(height: 4),
          Row(
            children: [
              for (final entry in {
                AoeShape.circle: Icons.circle_outlined,
                AoeShape.cone: Icons.pie_chart_outline,
                AoeShape.line: Icons.horizontal_rule,
                AoeShape.square: Icons.crop_square,
              }.entries) ...[
                if (entry.key != AoeShape.circle) const SizedBox(width: 6),
                Expanded(
                  child: _Chip(
                    active: state.aoeShape == entry.key,
                    onTap: () => _setAoeTool(entry.key, state.aoeRadius),
                    child: Icon(
                      entry.value,
                      color: state.aoeShape == entry.key ? _kAccentGold : _kAccentGoldDim,
                      size: _kIcon,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          const _GoldLabel('Size'),
          const SizedBox(height: 4),
          Row(
            children: [
              for (final ft in [10, 15, 20, 30, 60]) ...[
                if (ft != 10) const SizedBox(width: 6),
                Expanded(
                  child: _Chip(
                    active: (state.aoeRadius * 5).round() == ft,
                    onTap: () => _setAoeTool(state.aoeShape, ft / 5.0),
                    child: Text(
                      '$ft',
                      style: TextStyle(
                        color: (state.aoeRadius * 5).round() == ft
                            ? _kTextPrimary
                            : _kTextSecondary,
                        fontSize: _kText,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          _GoldButton(
            icon: Icons.close,
            label: 'Clear AoE',
            onTap: cb.onClearAoe,
          ),
        ],
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
        padding: const EdgeInsets.all(10),
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
                  width: 14,
                  height: 14,
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
                      fontSize: _kText,
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
                const SizedBox(width: 6),
                const Icon(Icons.edit, color: _kAccentGoldDim, size: 16),
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
                          fontSize: _kText,
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
  /// Fields: name, maxHp, currentHp, condition toggles, and a delete button
  /// (shown when [DmCallbacks.onRemoveToken] is provided).
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
                                horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: selectedConditions.contains(entry.key)
                                  ? Color(entry.value).withValues(alpha: 0.3)
                                  : _kSurface,
                              borderRadius: BorderRadius.circular(16),
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
                                fontSize: 13,
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
              if (cb.onRemoveToken != null)
                TextButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    cb.onRemoveToken!(token.id);
                  },
                  child: const Text(
                    'Delete',
                    style: TextStyle(color: Colors.redAccent, fontSize: _kText),
                  ),
                ),
              const Spacer(),
              // Cancel
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text(
                  'Cancel',
                  style: TextStyle(color: _kTextSecondary, fontSize: _kText),
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
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  decoration: BoxDecoration(
                    color: _kAccentGold,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'Save',
                    style: TextStyle(
                      color: _kPanelBg,
                      fontSize: _kText,
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
      style: const TextStyle(color: _kTextPrimary, fontSize: _kText),
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

  /// Builds the Fog tab: brush mode (Reveal|Hide), brush size, room reveal,
  /// shadow toggle with commit/discard, fog on/off, reveal all / hide all.
  Widget _buildFogTab() {
    final hasShadowCells =
        state.shadowRevealCells.isNotEmpty || state.shadowHideCells.isNotEmpty;
    final shadowCellCount =
        state.shadowRevealCells.length + state.shadowHideCells.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.cloud,
          label: 'Fog Brush',
          active: state.interactionMode == InteractionMode.fogReveal,
          onTap: cb.onSetFogMode,
        ),
        const SizedBox(height: 8),
        const _GoldLabel('Brush paints'),
        const SizedBox(height: 4),
        _Segmented(
          options: const [
            (Icons.wb_sunny, 'Reveal'),
            (Icons.dark_mode, 'Hide'),
          ],
          selected: state.revealMode ? 0 : 1,
          onSelect: (i) {
            if ((i == 0) != state.revealMode) cb.onToggleRevealMode();
          },
        ),
        const SizedBox(height: 8),
        const _GoldLabel('Brush size'),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final entry in {0: '1', 1: '3', 2: '5'}.entries) ...[
              if (entry.key > 0) const SizedBox(width: 6),
              Expanded(
                child: _Chip(
                  active: state.brushRadius == entry.key,
                  onTap: () => cb.onSetBrushRadius(entry.key),
                  child: Text(
                    entry.value,
                    style: TextStyle(
                      color: state.brushRadius == entry.key
                          ? _kTextPrimary
                          : _kTextSecondary,
                      fontSize: _kText,
                      fontWeight: FontWeight.w600,
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
          label: 'Room (tap a room to fill)',
          active: state.interactionMode == InteractionMode.roomReveal,
          onTap: cb.onSetRoomRevealMode,
        ),
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        // Shadow / Live toggle
        _GoldToggle(
          icon: state.shadowMode ? Icons.preview : Icons.flash_on,
          label: state.shadowMode ? 'Shadow mode (preview first)' : 'Live mode',
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
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
              _ActionSquare(
                icon: Icons.check,
                color: const Color(0xFF4CAF50),
                onTap: cb.onCommitShadow,
              ),
              const SizedBox(width: 6),
              _ActionSquare(
                icon: Icons.close,
                color: const Color(0xFFE53935),
                onTap: cb.onClearShadow,
              ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        _GoldToggle(
          icon: state.fogEnabled ? Icons.cloud : Icons.cloud_off,
          label: 'Fog layer',
          active: state.fogEnabled,
          onTap: cb.onToggleFog,
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.visibility,
                label: 'Reveal all',
                onTap: cb.onRevealAll,
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.visibility_off,
                label: 'Hide all',
                onTap: cb.onHideAll,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Draw Tab ────────────────────────────────────────────

  /// Builds the Draw tab: color palette, width presets + slider, clear/undo.
  Widget _buildDrawTab() {
    const colors = [
      Color(0xFFE53935), // red
      Color(0xFF43A047), // green
      Color(0xFF1E88E5), // blue
      Color(0xFFFDD835), // yellow
      Color(0xFFFF8F00), // orange
      Color(0xFFFFFFFF), // white
    ];
    final width = _widthPreview ?? state.drawWidth;
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
                  behavior: HitTestBehavior.opaque,
                  onTap: () => cb.onSetDrawColor(color),
                  child: SizedBox(
                    height: _kTarget,
                    child: Center(
                      child: Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: state.drawColor.toARGB32() == color.toARGB32()
                              ? Border.all(color: _kAccentGold, width: 3)
                              : Border.all(
                                  color: _kBorderGold,
                                  width: 1,
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        // Width presets + slider
        _GoldLabel('Width  ${width.round()} px'),
        const SizedBox(height: 4),
        Row(
          children: [
            for (final entry in {2.0: 'S', 4.0: 'M', 8.0: 'L', 14.0: 'XL'}.entries) ...[
              if (entry.key != 2.0) const SizedBox(width: 6),
              Expanded(
                child: _Chip(
                  active: state.drawWidth == entry.key,
                  onTap: () {
                    setState(() => _widthPreview = null);
                    cb.onSetDrawWidth(entry.key);
                  },
                  child: Text(
                    entry.value,
                    style: TextStyle(
                      color: state.drawWidth == entry.key
                          ? _kTextPrimary
                          : _kTextSecondary,
                      fontSize: _kText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        _goldSlider(
          value: width.clamp(1.0, 20.0),
          min: 1,
          max: 20,
          divisions: 19,
          onChanged: (v) => setState(() => _widthPreview = v),
          onChangeEnd: (v) {
            setState(() => _widthPreview = null);
            cb.onSetDrawWidth(v.roundToDouble());
          },
        ),
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
                label: 'Undo stroke',
                onTap: cb.onUndoStroke,
              ),
            ),
          ],
        ),
      ],
    );
  }

  // ─── Measure Tab ─────────────────────────────────────────

  /// Builds the Measure tab: measure mode + the physical ruler controls.
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
        const SizedBox(height: 4),
        const Text(
          'Drag on the map to measure. Tap to clear. The players see the line on the TV.',
          style: TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        const _GoldLabel('Ruler'),
        const SizedBox(height: 4),
        _GoldToggle(
          icon: Icons.square_foot,
          label: 'Ruler on the map',
          active: state.rulerVisible,
          onTap: cb.onToggleRuler,
        ),
        if (state.rulerVisible) ...[
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.rotate_right,
            label: 'Rotate ruler',
            onTap: cb.onRotateRuler,
          ),
          const SizedBox(height: 4),
          const Text(
            'Drag the ruler on the map to move it (in any mode).',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
        ],
      ],
    );
  }

  // ─── Camera Tab ──────────────────────────────────────────

  /// Builds the Camera tab: phone fit, TV zoom/rotate, and the TV link
  /// controls (link, send view, match TV) when provided by the host.
  Widget _buildCameraTab() {
    final hasLink = cb.onSetCameraLink != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (hasLink) ...[
          const _GoldLabel('Phone'),
          const SizedBox(height: 4),
          const Text(
            'Pinch and drag with two fingers to move the phone view. The dashed frame is what the TV shows.',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _GoldButton(
                  icon: Icons.fit_screen,
                  label: 'Fit map',
                  onTap: cb.onPhoneZoomToFit ?? () {},
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _GoldButton(
                  icon: Icons.center_focus_strong,
                  label: 'Match TV',
                  onTap: cb.onMatchTv ?? () {},
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(height: 1, color: _kBorderGold),
          const SizedBox(height: 10),
          const _GoldLabel('TV'),
          const SizedBox(height: 4),
          _GoldToggle(
            icon: Icons.link,
            label: 'TV follows the phone',
            active: _cameraLinked,
            onTap: () {
              setState(() => _cameraLinked = !_cameraLinked);
              cb.onSetCameraLink!(_cameraLinked);
            },
          ),
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.send_to_mobile,
            label: 'Send this view to the TV',
            onTap: cb.onSendView ?? () {},
          ),
          const SizedBox(height: 10),
        ],
        const _GoldLabel('Zoom'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(icon: Icons.remove, label: '', onTap: cb.onZoomOut),
            ),
            const SizedBox(width: 6),
            Expanded(
              flex: 2,
              child: _GoldButton(
                  icon: Icons.fit_screen, label: 'Fit', onTap: cb.onZoomToFit),
            ),
            const SizedBox(width: 6),
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
            const SizedBox(width: 6),
            Expanded(
              flex: 2,
              child: _GoldButton(
                icon: Icons.screen_rotation_alt,
                label: '0°',
                onTap: cb.onResetRotation,
              ),
            ),
            const SizedBox(width: 6),
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

  /// Builds the Settings tab: load map, grid/walls toggles, calibrate,
  /// scale slider (calibrated only), effects.
  Widget _buildSettingsTab() {
    final calibrated = state.calibratedBaseZoom != null;
    final scale = _scalePreview ?? state.scaleSliderFactor;
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
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        const _GoldLabel('Physical scale'),
        const SizedBox(height: 4),
        _GoldButton(
          icon: Icons.straighten,
          label: calibrated
              ? '${state.tvWidthInches!.round()}" TV — calibrated'
              : 'Set TV size (calibrate)',
          active: calibrated,
          onTap: () => _showCalibrationDialog(context),
        ),
        const SizedBox(height: 6),
        if (calibrated) ...[
          _GoldLabel('Scale  ${scale.toStringAsFixed(2)}×'),
          _goldSlider(
            value: scale,
            min: 0.5,
            max: 2.0,
            onChanged: (v) => setState(() => _scalePreview = v),
            onChangeEnd: (v) {
              setState(() => _scalePreview = null);
              cb.onSetScaleFactor(v);
            },
          ),
        ] else
          const Text(
            'Calibrate the TV size first, then fine-tune the grid scale here.',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
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
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.vibration,
                label: 'Shake',
                onTap: () => cb.onTriggerEffect('shake'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.brightness_2,
                label: 'Fade',
                onTap: () => cb.onTriggerEffect('fade'),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(
                icon: Icons.all_out,
                label: 'Pulse',
                onTap: () => cb.onTriggerEffect('pulse'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        _GoldButton(
          icon: Icons.warning,
          label: 'Danger',
          onTap: () => cb.onTriggerEffect('danger'),
        ),
      ],
    );
  }

  /// Gold-themed slider with a large thumb.
  Widget _goldSlider({
    required double value,
    required double min,
    required double max,
    int? divisions,
    required ValueChanged<double> onChanged,
    required ValueChanged<double> onChangeEnd,
  }) {
    return SliderTheme(
      data: SliderThemeData(
        activeTrackColor: _kAccentGold,
        inactiveTrackColor: _kAccentGoldDim.withValues(alpha: 0.4),
        thumbColor: _kAccentGold,
        overlayColor: _kAccentGold.withValues(alpha: 0.2),
        trackHeight: 4,
        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 12),
      ),
      child: Slider(
        value: value,
        min: min,
        max: max,
        divisions: divisions,
        onChanged: onChanged,
        onChangeEnd: onChangeEnd,
      ),
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
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              decoration: BoxDecoration(
                color: _kAccentGold,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'Calibrate',
                style: TextStyle(
                  color: _kPanelBg,
                  fontSize: _kText,
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

/// Gold-bordered button with optional active highlight (≥ 44 px high).
///
/// Used throughout the DM panel for action buttons. When [active] is
/// true, draws a gold border and lighter background.
class _GoldButton extends StatelessWidget {
  /// Icon displayed on the left side of the button.
  final IconData icon;

  /// Text label shown next to the icon (empty = icon only, centered).
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
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: _kTarget),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(8),
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
                color: active ? _kAccentGold : _kAccentGoldDim, size: _kIcon),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    color: active ? _kTextPrimary : _kTextSecondary,
                    fontSize: _kText,
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

/// Gold-themed toggle switch with a status dot indicator (≥ 44 px high).
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
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: _kTarget),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active ? _kAccentGold : _kBorderGold,
          ),
        ),
        child: Row(
          children: [
            Icon(icon,
                color: active ? _kAccentGold : _kAccentGoldDim, size: _kIcon),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: active ? _kTextPrimary : _kTextSecondary,
                  fontSize: _kText,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Container(
              width: 10,
              height: 10,
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

/// Two-or-more-way segmented choice (e.g. brush Reveal | Hide).
class _Segmented extends StatelessWidget {
  /// Icon + label per option.
  final List<(IconData, String)> options;

  /// Index of the selected option.
  final int selected;

  /// Called with the tapped index.
  final ValueChanged<int> onSelect;

  const _Segmented({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (int i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _Chip(
              active: selected == i,
              onTap: () => onSelect(i),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(options[i].$1,
                      color: selected == i ? _kAccentGold : _kAccentGoldDim,
                      size: _kIcon),
                  const SizedBox(width: 6),
                  Text(
                    options[i].$2,
                    style: TextStyle(
                      color: selected == i ? _kTextPrimary : _kTextSecondary,
                      fontSize: _kText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Selectable chip (≥ 44 px) used for presets: brush size, width, AoE.
class _Chip extends StatelessWidget {
  /// Whether this chip is the selected one.
  final bool active;

  /// Called when tapped.
  final VoidCallback onTap;

  /// Chip content (text or icon), centered.
  final Widget child;

  const _Chip({required this.active, required this.onTap, required this.child});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: _kTarget),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        decoration: BoxDecoration(
          color: active ? _kSurfaceActive : _kSurface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: active ? _kAccentGold : _kBorderGold),
        ),
        child: Center(child: child),
      ),
    );
  }
}

/// Square colored action button (shadow commit / discard).
class _ActionSquare extends StatelessWidget {
  /// Icon to show.
  final IconData icon;

  /// Accent color (border, icon, tinted background).
  final Color color;

  /// Called when tapped.
  final VoidCallback onTap;

  const _ActionSquare({required this.icon, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: _kTarget,
        height: _kTarget,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.25),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color),
        ),
        child: Icon(icon, color: color, size: _kIcon),
      ),
    );
  }
}

/// 44 px icon-only target for the header (undo, redo, settings, collapse).
class _IconTarget extends StatelessWidget {
  /// Icon to show.
  final IconData icon;

  /// Dimmed and inert when `false`.
  final bool enabled;

  /// Called when tapped (and [enabled]).
  final VoidCallback onTap;

  const _IconTarget({required this.icon, required this.onTap, this.enabled = true});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
      child: SizedBox(
        width: _kTarget,
        height: _kTarget,
        child: Icon(
          icon,
          color: enabled ? _kAccentGold : _kAccentGoldDim.withValues(alpha: 0.5),
          size: 22,
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
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.5,
      ),
    );
  }
}

/// Square button for HP increment/decrement in the Combat tab.
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
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: 48,
        height: 40,
        decoration: BoxDecoration(
          color: _kSurface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: _kBorderGold),
        ),
        child: Icon(icon, color: _kAccentGoldDim, size: _kIcon),
      ),
    );
  }
}
