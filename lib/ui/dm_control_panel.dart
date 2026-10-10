import 'dart:math';

import 'package:flutter/material.dart';

import '../game/dm_overlay_images.dart';
import '../model/aoe_template.dart';
import '../model/dm_overlay.dart';
import '../model/map_token.dart';
import '../model/raster_grid.dart';
import '../model/session.dart';
import '../model/table_fit.dart';
import '../state/vtt_state.dart';
import 'grid_editor.dart';
import 'map_grid_dialog.dart';
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

/// Width of the tab rail in the side layout ([DmControlPanel.sideLayoutFor]).
const double _kRailWidth = 72;

/// Width of the unfolded tab content next to the rail in the side layout.
const double _kSideContentWidth = 320;

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

  /// Fits the entire map on screen (local mode; the TV has "Whole map",
  /// [onSetTvCameraMode]).
  final VoidCallback onZoomToFit;

  /// Rotates the TV camera 90 degrees clockwise.
  final VoidCallback onRotateCW;

  /// Rotates the TV camera 90 degrees counter-clockwise.
  final VoidCallback onRotateCCW;

  /// Resets the TV camera rotation to 0 degrees.
  final VoidCallback onResetRotation;

  /// Calibrates the TV so a square is one inch: `tvWidthInches` is the
  /// physical width of its picture (the TV keeps it, every game uses it).
  final void Function(double tvWidthInches) onCalibrate;

  /// Resets the TV calibration to the default (34 × 19 squares).
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

  /// Switches to circle-reveal interaction mode (tap reveals a circle of
  /// [VttState.revealRadius] squares, stopped by walls).
  final VoidCallback onSetCircleRevealMode;

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

  // ── Table view (networked mode only) ──────────────────────────────

  /// Shows (`true`) or hides the TV's calibration pattern — on while the
  /// Measure the TV dialog is open. `null` hides that dialog (local mode).
  final void Function(bool on)? onShowCalibration;

  /// Switches what the players see: the one-inch table or the whole map
  /// ([TvCameraMode]). `null` hides the switch (local mode).
  final void Function(TvCameraMode mode)? onSetTvCameraMode;

  /// Moves the TV's table window by `dx` × `dy` squares.
  final void Function(int dx, int dy)? onPanTable;

  /// Lays a new grid of `cols` × `rows` squares over the open picture or PDF
  /// map (Map squares, the grid editor) — placed by `grid`, or stretched
  /// over the whole picture when it is `null`. `null` hides the buttons.
  final void Function(int cols, int rows, RasterGrid? grid)? onSetMapGrid;

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

  /// Turns continuous "TV follows the tablet" (the phone camera) on or off.
  final void Function(bool linked)? onSetCameraLink;

  /// Sends the phone's current camera to the TV once ("Show my view on the TV").
  final VoidCallback? onSendView;

  /// Moves the phone camera to the TV's current view ("Jump to TV").
  final VoidCallback? onMatchTv;

  /// Fits the whole map into the phone screen ("Fit on tablet", phone camera only).
  final VoidCallback? onPhoneZoomToFit;

  // ── DM picture layers ─────────────────────────────────────────────

  /// Opens a picker for one or more pictures (or PDFs) to add as DM-only
  /// layers. The Layers tab is shown only when this is provided. Edits of
  /// existing layers go straight to [VttState] (its
  /// [VttState.onDmOverlaysChanged] hook forwards them).
  final VoidCallback? onAddDmOverlays;

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
    required this.onSetCircleRevealMode,
    required this.onSetAoeMode,
    required this.onSetAoe,
    required this.onClearAoe,
    required this.onToggleRuler,
    required this.onRotateRuler,
    this.onShowCalibration,
    this.onSetTvCameraMode,
    this.onPanTable,
    this.onSetMapGrid,
    required this.onUpdateSessionSettings,
    required this.onTriggerEffect,
    this.onSetCameraLink,
    this.onSendView,
    this.onMatchTv,
    this.onPhoneZoomToFit,
    this.onAddDmOverlays,
  });
}

/// DM control panel — a bottom sheet with a tab bar at the bottom edge.
///
/// Designed for one-handed phone use: the tab bar (Combat, Fog, Draw,
/// Measure, Layers, Camera, Settings) sits at the bottom within thumb reach, the
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

  /// The DM layer picture cache, for each layer's load status in the
  /// Layers tab (`null` = no status shown).
  final DmOverlayImages? dmOverlayImages;

  /// Progress `0.0`–`1.0` of a running layer upload, `null` when idle.
  final double? dmOverlayUploadProgress;

  /// What the running layer upload is doing ("Uploading 2 of 3…").
  final String? dmOverlayUploadLabel;

  /// The overview map with the players' window (Camera tab), built by the
  /// host ([TvOverviewMap]); `null` = none (local mode).
  final Widget? tvOverview;

  /// The TV's table layout as the host's game sees it
  /// ([VttGame.tvTableLayout]) — for the Camera tab's info line and arrows.
  final TableLayout? Function()? tvTableLayout;

  /// Creates a DM control panel bound to [state] and [callbacks].
  const DmControlPanel({
    super.key,
    required this.state,
    required this.callbacks,
    this.dmOverlayImages,
    this.dmOverlayUploadProgress,
    this.dmOverlayUploadLabel,
    this.tvOverview,
    this.tvTableLayout,
  });

  @override
  State<DmControlPanel> createState() => _DmControlPanelState();

  /// Whether the panel docks at the right edge instead of the bottom: a
  /// tablet in landscape (wider than tall, shortest side ≥ 600 dp). There a
  /// bottom sheet ate 40–65 % of the map's height; the side layout keeps a
  /// slim tab rail and unfolds the tab content beside it.
  ///
  /// Hosts lay the map out with the same test (a row instead of a column).
  static bool sideLayoutFor(Size size) =>
      size.width > size.height && size.shortestSide >= 600;
}

class _DmControlPanelState extends State<DmControlPanel> {
  bool _expanded = false;

  /// ID of the active tab. Being on a tab IS its mode ([_modeFor]): the
  /// Draw tab draws, the Tokens tab places and moves tokens; tabs without
  /// a mode of their own (Layers, Camera, Settings) use the Tokens mode.
  late String _tab;

  /// The Fog tab's tool (brush, room or circle), kept while on other tabs so the
  /// Fog tab comes back with the tool last picked there.
  InteractionMode _fogTool = InteractionMode.fogReveal;

  /// When the panel last asked the TV for a mode. Until the TV's echo is
  /// back (state broadcasts are throttled), an older mode in the state is
  /// not a reason to switch tabs ([_onStateChanged]).
  DateTime _modeRequestedAt = DateTime.fromMillisecondsSinceEpoch(0);

  /// Local preview of the draw width slider while dragging (sent on release).
  double? _widthPreview;

  /// Whether "link TV to phone" is on (panel-local UI state).
  bool _cameraLinked = false;

  /// Slider positions of DM layers whose opacity is being dragged (layer
  /// id → value); the map previews live, the TV gets the value on release.
  final Map<String, double> _opacityPreview = {};

  VttState get state => widget.state;
  DmCallbacks get cb => widget.callbacks;

  /// All possible tab definitions: icon, label, and tab ID.
  static const _allTabs = [
    (Icons.person_pin, 'Tokens', 'tokens'),
    (Icons.cloud, 'Fog', 'fog'),
    (Icons.brush, 'Draw', 'draw'),
    (Icons.straighten, 'Measure', 'measure'),
    (Icons.shield, 'Combat', 'combat'),
    (Icons.layers, 'Layers', 'layers'),
    (Icons.videocam, 'Camera', 'camera'),
    (Icons.tune, 'Settings', 'settings'),
  ];

  /// Returns the list of tabs visible given current [SessionSettings].
  ///
  /// - Tokens (the normal mode, leftmost), Fog, Camera, Settings are
  ///   always shown
  /// - Draw tab hidden when drawingTools off
  /// - Measure tab hidden when measureTool off
  /// - Combat tab (AoE templates, digital play) shown when aoeTemplates on
  /// - Layers tab (DM-only pictures) shown when the host provides
  ///   [DmCallbacks.onAddDmOverlays]
  List<(IconData, String, String)> get _visibleTabs {
    final s = state.sessionSettings;
    return [
      _allTabs[0],                     // Tokens (always)
      _allTabs[1],                     // Fog (always)
      if (s.drawingTools) _allTabs[2], // Draw
      if (s.measureTool) _allTabs[3],  // Measure
      if (s.aoeTemplates) _allTabs[4], // Combat
      if (cb.onAddDmOverlays != null) _allTabs[5], // Layers
      _allTabs[6],                     // Camera (always)
      _allTabs[7],                     // Settings (always)
    ];
  }

  /// Index of the active tab in [tabs]; falls back to the Tokens tab (and
  /// makes it active) when the active tab got hidden by the settings.
  int _activeIndex(List<(IconData, String, String)> tabs) {
    final i = tabs.indexWhere((t) => t.$3 == _tab);
    if (i >= 0) return i;
    _tab = 'tokens';
    return 0;
  }

  /// The interaction mode the tab [tabId] stands for. Tabs without a tool
  /// of their own fall back to the normal mode, [InteractionMode.token].
  InteractionMode _modeFor(String tabId) => switch (tabId) {
        'fog' => _fogTool,
        'draw' => InteractionMode.draw,
        'measure' => InteractionMode.measure,
        'combat' => InteractionMode.aoe,
        _ => InteractionMode.token,
      };

  /// The tab that owns [mode] (for following a mode set elsewhere), or
  /// `null` when that tab is hidden.
  String? _tabFor(InteractionMode mode) {
    final id = switch (mode) {
      InteractionMode.token => 'tokens',
      InteractionMode.fogReveal ||
      InteractionMode.roomReveal ||
      InteractionMode.circleReveal =>
        'fog',
      InteractionMode.draw => 'draw',
      InteractionMode.measure => 'measure',
      InteractionMode.aoe => 'combat',
    };
    return _visibleTabs.any((t) => t.$3 == id) ? id : null;
  }

  /// The Fog tab's tools: brush, room, circle.
  static const _fogTools = {
    InteractionMode.fogReveal,
    InteractionMode.roomReveal,
    InteractionMode.circleReveal,
  };

  /// Whether being on [tabId] fits [mode] (the Fog tab has three tools).
  bool _tabFits(String tabId, InteractionMode mode) => tabId == 'fog'
      ? _fogTools.contains(mode)
      : _modeFor(tabId) == mode;

  /// Asks the TV for [mode] through the matching callback.
  void _requestMode(InteractionMode mode) {
    if (_fogTools.contains(mode)) _fogTool = mode;
    if (state.interactionMode == mode) return;
    _modeRequestedAt = DateTime.now();
    switch (mode) {
      case InteractionMode.token:
        cb.onSetTokenMode();
      case InteractionMode.fogReveal:
        cb.onSetFogMode();
      case InteractionMode.roomReveal:
        cb.onSetRoomRevealMode();
      case InteractionMode.circleReveal:
        cb.onSetCircleRevealMode();
      case InteractionMode.draw:
        cb.onSetDrawMode();
      case InteractionMode.measure:
        cb.onSetMeasureMode();
      case InteractionMode.aoe:
        cb.onSetAoeMode();
    }
  }

  /// Follows a mode set elsewhere (the TV restored a game, another
  /// companion, the bench robot) by switching to the tab that owns it —
  /// unless the panel just asked for a mode and the TV's echo is still on
  /// its way.
  void _onStateChanged() {
    final mode = state.interactionMode;
    if (_tabFits(_tab, mode)) {
      if (_tab == 'fog') _fogTool = mode;
      return;
    }
    if (DateTime.now().difference(_modeRequestedAt) <
        const Duration(milliseconds: 1500)) {
      return;
    }
    final id = _tabFor(mode);
    if (id == null || !mounted) return;
    setState(() {
      _tab = id;
      if (id == 'fog') _fogTool = mode;
    });
  }

  @override
  void initState() {
    super.initState();
    final mode = state.interactionMode;
    _tab = _tabFor(mode) ?? 'tokens';
    if (_tab == 'fog') _fogTool = mode;
    state.addListener(_onStateChanged);
  }

  @override
  void didUpdateWidget(DmControlPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state != widget.state) {
      oldWidget.state.removeListener(_onStateChanged);
      widget.state.addListener(_onStateChanged);
    }
  }

  @override
  void dispose() {
    state.removeListener(_onStateChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (DmControlPanel.sideLayoutFor(MediaQuery.sizeOf(context))) {
      return _buildSide();
    }
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

  /// Side layout: the tab content (when expanded) unfolds to the left of a
  /// vertical tab rail; undo/redo sit at the rail's foot so they stay
  /// reachable while the panel is folded. The content grows on open and
  /// closes quicker than it opened.
  Widget _buildSide() {
    return Container(
      decoration: const BoxDecoration(
        color: _kPanelBg,
        border: Border(left: BorderSide(color: _kBorderGold)),
      ),
      child: SafeArea(
        left: false,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AnimatedSize(
              duration: const Duration(milliseconds: 220),
              reverseDuration: const Duration(milliseconds: 150),
              curve: Curves.easeOutCubic,
              alignment: Alignment.centerRight,
              child: _expanded
                  ? SizedBox(
                      width: _kSideContentWidth,
                      child: Column(
                        children: [
                          _buildHeader(side: true),
                          Container(height: 1, color: _kBorderGold),
                          Expanded(
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                              child: _buildTabContent(),
                            ),
                          ),
                        ],
                      ),
                    )
                  : const SizedBox(width: 0),
            ),
            if (_expanded) Container(width: 1, color: _kBorderGold),
            _buildRail(),
          ],
        ),
      ),
    );
  }

  /// The side layout's vertical tab rail, undo/redo at its foot.
  Widget _buildRail() {
    final tabs = _visibleTabs;
    return SizedBox(
      width: _kRailWidth,
      child: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  for (int i = 0; i < tabs.length; i++)
                    _buildTabButton(i, tabs, rail: true),
                ],
              ),
            ),
          ),
          Container(height: 1, color: _kBorderGold),
          _IconTarget(icon: Icons.undo, enabled: state.canUndo, onTap: cb.onUndo),
          _IconTarget(icon: Icons.redo, enabled: state.canRedo, onTap: cb.onRedo),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  /// Builds the header row: tab title, undo/redo, session settings gear,
  /// and a collapse chevron. In the [side] layout undo/redo live in the
  /// rail and the chevron points right (the content folds into the rail).
  Widget _buildHeader({bool side = false}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 2, 4, 2),
      child: Row(
        children: [
          const Icon(Icons.shield, color: _kAccentGold, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _visibleTabs[_activeIndex(_visibleTabs)].$2,
              style: const TextStyle(
                color: _kTextPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.0,
              ),
            ),
          ),
          if (!side) ...[
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
          ],
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
            icon: side ? Icons.chevron_right : Icons.expand_more,
            onTap: () => setState(() => _expanded = false),
          ),
        ],
      ),
    );
  }

  /// Builds the bottom tab bar. Tapping the active tab toggles the content.
  Widget _buildTabBar() {
    final tabs = _visibleTabs;
    return Row(
      children: [
        for (int i = 0; i < tabs.length; i++)
          Expanded(child: _buildTabButton(i, tabs)),
      ],
    );
  }

  /// One tab of the bottom bar or (with [rail]) of the side rail: icon over
  /// label, the active tab marked on the edge facing the content (top in
  /// the bar, left in the rail). Tapping the active tab folds or unfolds
  /// the content (the mode stays); another tab switches to it, unfolds and
  /// switches the map to that tab's mode ([_modeFor]).
  Widget _buildTabButton(int i, List<(IconData, String, String)> tabs,
      {bool rail = false}) {
    final active = _activeIndex(tabs) == i;
    final marked = active && _expanded;
    const mark = BorderSide(color: _kAccentGold, width: 2);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        if (active) {
          setState(() => _expanded = !_expanded);
          return;
        }
        setState(() {
          _tab = tabs[i].$3;
          _expanded = true;
        });
        _requestMode(_modeFor(_tab));
      },
      child: Container(
        height: rail ? 64 : 56,
        decoration: BoxDecoration(
          border: marked
              ? (rail ? const Border(left: mark) : const Border(top: mark))
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              tabs[i].$1,
              color: active ? _kAccentGold : _kAccentGoldDim,
              size: 22,
            ),
            const SizedBox(height: 2),
            Text(
              tabs[i].$2,
              style: TextStyle(
                color: active ? _kTextPrimary : _kTextSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Dispatches to the correct tab content builder based on the active
  /// visible tab's ID string.
  Widget _buildTabContent() {
    final tabs = _visibleTabs;
    final tabId = tabs[_activeIndex(tabs)].$3;
    switch (tabId) {
      case 'tokens':
        return _buildTokensTab();
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
      case 'layers':
        return _buildLayersTab();
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

  // ─── Tokens Tab ──────────────────────────────────────────

  /// Builds the Tokens tab, the normal mode (leftmost): being on it places
  /// and moves tokens on the map — markers that remember where the players'
  /// miniatures and the monsters stand. Lists the tokens (tap one to name
  /// or delete it) and clears them all.
  Widget _buildTokensTab() {
    final tokens = state.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Tap an empty square to place a token, drag a token to move it. '
          'Tap a door to open or close it.',
          style: TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        const SizedBox(height: 8),
        if (tokens.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'No tokens yet',
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
    );
  }

  // ─── Combat Tab ──────────────────────────────────────────

  /// Builds the Combat tab (digital play, AoE templates on): being on it
  /// places AoE templates; shape, size and clear.
  Widget _buildCombatTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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

    ModalRoute<dynamic>? route;
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          route ??= ModalRoute.of(ctx);
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
    ).whenComplete(
        () => _disposeAfterExit(route, [nameCtrl, maxHpCtrl, currentHpCtrl]));
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

  /// Builds the Fog tab: the tool (Brush | Room | Circle), what it does
  /// (Reveal | Hide), the brush size (brush only) or the circle's radius in
  /// squares (circle only), when players see changes
  /// (Instantly | Preview first, with apply/discard for staged squares),
  /// the fog layer switch, and reveal all / hide all.
  Widget _buildFogTab() {
    final hasShadowCells =
        state.shadowRevealCells.isNotEmpty || state.shadowHideCells.isNotEmpty;
    final shadowCellCount =
        state.shadowRevealCells.length + state.shadowHideCells.length;
    final mode = state.interactionMode;
    final tool = switch (mode) {
      InteractionMode.fogReveal => 0,
      InteractionMode.roomReveal => 1,
      InteractionMode.circleReveal => 2,
      _ => -1,
    };
    final radius = state.revealRadius;
    final verb = state.revealMode ? 'reveal' : 'hide';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _GoldLabel('Tool'),
        const SizedBox(height: 4),
        _Segmented(
          options: const [
            (Icons.brush, 'Brush'),
            (Icons.meeting_room, 'Room'),
            (Icons.radio_button_unchecked, 'Circle'),
          ],
          selected: tool,
          onSelect: (i) => _requestMode(const [
            InteractionMode.fogReveal,
            InteractionMode.roomReveal,
            InteractionMode.circleReveal,
          ][i]),
        ),
        const SizedBox(height: 4),
        Text(
          switch (tool) {
            0 => 'Drag over the map to $verb squares.',
            1 => 'Tap a room to $verb all of it.',
            2 => 'Tap the map to $verb $radius squares around it — '
                'walls and closed doors stop it.',
            _ => 'Pick a tool to paint the fog.',
          },
          style: const TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        const SizedBox(height: 8),
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
        if (tool == 2) ...[
          const SizedBox(height: 8),
          const _GoldLabel('Radius'),
          const SizedBox(height: 4),
          _RadiusStepper(
            radius: radius,
            onChanged: state.setRevealRadius,
          ),
        ],
        if (tool == 0 || tool == -1) ...[
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
        ],
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        // When players see fog changes: live, or staged in the shadow preview
        const _GoldLabel('Players see changes'),
        const SizedBox(height: 4),
        _Segmented(
          options: const [
            (Icons.flash_on, 'Instantly'),
            (Icons.preview, 'Preview first'),
          ],
          selected: state.shadowMode ? 1 : 0,
          onSelect: (i) {
            if ((i == 1) != state.shadowMode) cb.onToggleShadowMode();
          },
        ),
        // Apply/discard staged squares
        if (state.shadowMode) ...[
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  hasShadowCells
                      ? '$shadowCellCount squares waiting — show them?'
                      : 'Changes wait here until you apply them.',
                  style: const TextStyle(
                    color: _kTextSecondary,
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
              if (hasShadowCells) ...[
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
        const Text(
          'Drag on the map to draw. The players see it on the TV.',
          style: TextStyle(color: _kTextSecondary, fontSize: 12),
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

  /// Builds the Camera tab. Networked it starts with **Players see**: the
  /// one-inch table or the whole map ([DmCallbacks.onSetTvCameraMode]), a
  /// line on what the TV shows, the overview map with the players' window
  /// ([DmControlPanel.tvOverview]; tap or drag it to move the window) and
  /// arrows that move it by one square. Then **Tablet** (fit on tablet,
  /// jump to the TV's view), **TV** (TV follows the tablet, show my view on
  /// the TV — in the table view only its centre counts), free zoom and
  /// rotation. Without a TV link (local mode) only zoom and rotation of this
  /// screen remain.
  Widget _buildCameraTab() {
    final hasLink = cb.onSetCameraLink != null;
    final mode = state.tvCameraMode;
    final layout = widget.tvTableLayout?.call();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (cb.onSetTvCameraMode != null) ...[
          const _GoldLabel('Players see'),
          const SizedBox(height: 4),
          Row(
            children: [
              Expanded(
                child: _GoldButton(
                  icon: Icons.grid_on,
                  label: '1-inch table',
                  active: mode == TvCameraMode.table,
                  onTap: () => cb.onSetTvCameraMode!(TvCameraMode.table),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _GoldButton(
                  icon: Icons.map,
                  label: 'Whole map',
                  active: mode == TvCameraMode.fit,
                  onTap: () => cb.onSetTvCameraMode!(TvCameraMode.fit),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            _tvViewLine(mode, layout),
            style: const TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
          if (widget.tvOverview != null) ...[
            const SizedBox(height: 8),
            widget.tvOverview!,
          ],
          if (mode == TvCameraMode.table &&
              layout != null &&
              layout.pans &&
              cb.onPanTable != null) ...[
            const SizedBox(height: 8),
            _buildPanPad(layout),
          ],
          const SizedBox(height: 12),
          Container(height: 1, color: _kBorderGold),
          const SizedBox(height: 10),
        ],
        if (hasLink) ...[
          const _GoldLabel('Tablet'),
          const SizedBox(height: 4),
          const Text(
            'Pinch and drag with two fingers to move your view. The dashed frame is what the TV shows.',
            style: TextStyle(color: _kTextSecondary, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _GoldButton(
                  icon: Icons.fit_screen,
                  label: 'Fit on tablet',
                  onTap: cb.onPhoneZoomToFit ?? () {},
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _GoldButton(
                  icon: Icons.center_focus_strong,
                  label: 'Jump to TV',
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
            label: 'TV follows the tablet',
            active: _cameraLinked,
            onTap: () {
              setState(() => _cameraLinked = !_cameraLinked);
              cb.onSetCameraLink!(_cameraLinked);
            },
          ),
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.send_to_mobile,
            label: 'Show my view on the TV',
            onTap: cb.onSendView ?? () {},
          ),
          if (mode == TvCameraMode.table) ...[
            const SizedBox(height: 4),
            const Text(
              'On the 1-inch table the TV takes only the middle of your view.',
              style: TextStyle(color: _kTextSecondary, fontSize: 12),
            ),
          ],
          const SizedBox(height: 10),
        ],
        _GoldLabel(hasLink ? 'TV zoom (leaves the 1-inch table)' : 'Zoom'),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: _GoldButton(icon: Icons.remove, label: '', onTap: cb.onZoomOut),
            ),
            if (!hasLink) ...[
              const SizedBox(width: 6),
              Expanded(
                flex: 2,
                child: _GoldButton(
                  icon: Icons.fit_screen,
                  label: 'Fit map',
                  onTap: cb.onZoomToFit,
                ),
              ),
            ],
            const SizedBox(width: 6),
            Expanded(
              child: _GoldButton(icon: Icons.add, label: '', onTap: cb.onZoomIn),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _GoldLabel(hasLink ? 'TV rotation' : 'Rotation'),
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

  /// One line on what the players see for [mode] (and the table [layout]).
  String _tvViewLine(TvCameraMode mode, TableLayout? layout) {
    final map = state.map;
    final cols = map?.resolution.mapSize.dx.toInt() ?? 0;
    final rows = map?.resolution.mapSize.dy.toInt() ?? 0;
    switch (mode) {
      case TvCameraMode.table:
        if (layout == null) {
          return 'One square = one inch; the TV holds ${state.tableCols} × ${state.tableRows} squares.';
        }
        if (!layout.pans) {
          return 'The whole map ($cols × $rows squares) fits the table '
              '(${state.tableCols} × ${state.tableRows}), centred, one inch per square.';
        }
        return 'The TV shows ${min(layout.winCols, cols)} × ${min(layout.winRows, rows)} '
            'of the map\'s $cols × $rows squares. Tap or drag the box, the arrows, '
            'or the gold grip on the map to move it.';
      case TvCameraMode.fit:
        return 'The whole map is on the TV — squares are not one inch. '
            'Tap 1-inch table to play on it.';
      case TvCameraMode.free:
        return 'The TV is zoomed freely — squares are not one inch. '
            'Tap 1-inch table to go back.';
    }
  }

  /// Arrows that move the TV's table window by one square, only along the
  /// axes where the map is bigger than the window; an arrow at the map's
  /// edge is dimmed and does nothing.
  Widget _buildPanPad(TableLayout layout) {
    final cols = state.map?.resolution.mapSize.dx.toInt() ?? 0;
    final rows = state.map?.resolution.mapSize.dy.toInt() ?? 0;
    bool canMove(int dx, int dy) =>
        (dx < 0 && layout.col > 0) ||
        (dx > 0 && layout.col < cols - layout.winCols) ||
        (dy < 0 && layout.row > 0) ||
        (dy > 0 && layout.row < rows - layout.winRows);
    Widget arrow(IconData icon, int dx, int dy) => Expanded(
          child: _GoldButton(
            icon: icon,
            label: '',
            enabled: canMove(dx, dy),
            onTap: () => cb.onPanTable!(dx, dy),
          ),
        );
    return Row(
      children: [
        if (layout.pansX) arrow(Icons.arrow_back, -1, 0),
        if (layout.pansY) ...[
          if (layout.pansX) const SizedBox(width: 6),
          arrow(Icons.arrow_upward, 0, -1),
          const SizedBox(width: 6),
          arrow(Icons.arrow_downward, 0, 1),
        ],
        if (layout.pansX) ...[
          const SizedBox(width: 6),
          arrow(Icons.arrow_forward, 1, 0),
        ],
      ],
    );
  }

  // ─── Layers Tab ──────────────────────────────────────────

  /// Builds the Layers tab: DM-only pictures over the map (this device
  /// only, never on the TV).
  ///
  /// A master eye ([VttState.showDmOverlays]), "Add pictures"
  /// ([DmCallbacks.onAddDmOverlays]) with upload progress, and one card per
  /// layer, top layer first: eye, name + load status, move up/down, delete
  /// (with an undo snackbar), and an opacity slider.
  Widget _buildLayersTab() {
    final layers = state.dmOverlays;
    final uploading = widget.dmOverlayUploadProgress != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Pictures only you see, laid over the map — a DM version of the map, notes, secrets. The TV never shows them.',
          style: TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _GoldButton(
                icon: Icons.add_photo_alternate,
                label: uploading ? 'Uploading…' : 'Add pictures',
                onTap: uploading ? () {} : cb.onAddDmOverlays!,
              ),
            ),
            if (layers.isNotEmpty) ...[
              const SizedBox(width: 6),
              Expanded(
                child: _GoldToggle(
                  icon: state.showDmOverlays ? Icons.visibility : Icons.visibility_off,
                  label: 'Show layers',
                  active: state.showDmOverlays,
                  onTap: state.toggleShowDmOverlays,
                ),
              ),
            ],
          ],
        ),
        if (uploading) ...[
          const SizedBox(height: 8),
          LinearProgressIndicator(
            value: widget.dmOverlayUploadProgress,
            color: _kAccentGold,
            backgroundColor: _kAccentGoldDim.withValues(alpha: 0.3),
          ),
          if (widget.dmOverlayUploadLabel != null) ...[
            const SizedBox(height: 4),
            Text(widget.dmOverlayUploadLabel!,
                style: const TextStyle(color: _kTextSecondary, fontSize: 12)),
          ],
        ],
        const SizedBox(height: 10),
        if (layers.isEmpty)
          const Text(
            'No layers yet. PNG, JPG, WebP or PDF (page 1); pick several at once.',
            style: TextStyle(color: _kTextSecondary, fontSize: _kText),
          )
        else ...[
          _GoldLabel('Layers (${layers.length}) — top first'),
          const SizedBox(height: 4),
          for (int i = layers.length - 1; i >= 0; i--)
            _buildLayerCard(layers[i], isTop: i == layers.length - 1, isBottom: i == 0),
        ],
      ],
    );
  }

  /// One layer card in the Layers tab (see [_buildLayersTab]).
  Widget _buildLayerCard(DmOverlay layer, {required bool isTop, required bool isBottom}) {
    final opacity = _opacityPreview[layer.id] ?? layer.opacity;
    final status = widget.dmOverlayImages?.statusOf(layer.id);
    final statusText = !layer.visible || !state.showDmOverlays
        ? null
        : switch (status) {
            DmOverlayImageStatus.loading => 'Loading…',
            DmOverlayImageStatus.failed => "Couldn't load — hide and show to retry",
            _ => null,
          };
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.fromLTRB(0, 2, 4, 2),
      decoration: BoxDecoration(
        color: layer.visible ? _kSurfaceActive : _kSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: layer.visible ? _kAccentGoldDim : _kBorderGold),
      ),
      child: Column(
        children: [
          Row(
            children: [
              _IconTarget(
                icon: layer.visible ? Icons.visibility : Icons.visibility_off,
                onTap: () => state.setDmOverlayVisible(layer.id, !layer.visible),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      layer.name,
                      style: TextStyle(
                        color: layer.visible ? _kTextPrimary : _kTextSecondary,
                        fontSize: _kText,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (statusText != null)
                      Text(
                        statusText,
                        style: TextStyle(
                          color: status == DmOverlayImageStatus.failed
                              ? Colors.redAccent
                              : _kTextSecondary,
                          fontSize: 12,
                        ),
                      ),
                  ],
                ),
              ),
              _IconTarget(
                icon: Icons.arrow_upward,
                enabled: !isTop,
                onTap: () => state.moveDmOverlay(layer.id, 1),
              ),
              _IconTarget(
                icon: Icons.arrow_downward,
                enabled: !isBottom,
                onTap: () => state.moveDmOverlay(layer.id, -1),
              ),
              _IconTarget(
                icon: Icons.delete_outline,
                onTap: () => _removeLayer(layer),
              ),
            ],
          ),
          if (layer.visible)
            Row(
              children: [
                const SizedBox(width: 12),
                const Icon(Icons.opacity, color: _kAccentGoldDim, size: 18),
                Expanded(
                  child: _goldSlider(
                    value: opacity,
                    min: 0,
                    max: 1,
                    onChanged: (v) {
                      setState(() => _opacityPreview[layer.id] = v);
                      state.setDmOverlayOpacity(layer.id, v, forward: false);
                    },
                    onChangeEnd: (v) {
                      setState(() => _opacityPreview.remove(layer.id));
                      state.setDmOverlayOpacity(layer.id, v);
                    },
                  ),
                ),
                SizedBox(
                  width: 40,
                  child: Text(
                    '${(opacity * 100).round()}%',
                    style: const TextStyle(color: _kTextSecondary, fontSize: 12),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  /// Removes [layer] and offers to put it back.
  void _removeLayer(DmOverlay layer) {
    final removed = state.removeDmOverlay(layer.id);
    if (removed == null) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(SnackBar(
      content: Text('Removed "${layer.name}"'),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 4),
      action: SnackBarAction(
        label: 'Undo',
        onPressed: () => state.insertDmOverlay(removed.index, removed.overlay),
      ),
    ));
  }

  // ─── Settings Tab ────────────────────────────────────────

  /// Builds the Settings tab: load map; **Table scale** (one inch per
  /// square, the TV's squares, Measure the TV); **Grid** (draw battlemap's
  /// grid — remembered per map —, Map squares for picture/PDF maps, walls);
  /// effects.
  Widget _buildSettingsTab() {
    final map = state.map;
    final raster = state.rasterImageSize != null && map != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GoldButton(
          icon: Icons.folder_open,
          label: 'Load Map',
          onTap: cb.onLoadMap,
        ),
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        const _GoldLabel('Table scale'),
        const SizedBox(height: 4),
        Text(
          'One square = one inch on the TV. It holds ${state.tableCols} × ${state.tableRows} '
          'squares (picture ${state.tvWidthInches.toStringAsFixed(1)} in wide), centred.',
          style: const TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        if (cb.onShowCalibration != null) ...[
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.straighten,
            label: 'Measure the TV…',
            onTap: () => _showCalibrationDialog(context),
          ),
        ],
        const SizedBox(height: 12),
        Container(height: 1, color: _kBorderGold),
        const SizedBox(height: 10),
        const _GoldLabel('Grid'),
        const SizedBox(height: 4),
        _GoldToggle(
          icon: state.showGrid ? Icons.grid_on : Icons.grid_off,
          label: 'Draw a grid over the map',
          active: state.showGrid,
          onTap: cb.onToggleGrid,
        ),
        const SizedBox(height: 4),
        const Text(
          'Off when the picture has its own grid lines — remembered for this map.',
          style: TextStyle(color: _kTextSecondary, fontSize: 12),
        ),
        if (raster && cb.onSetMapGrid != null) ...[
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.grid_on,
            label: 'Fit the grid on the picture',
            onTap: () => _fitGrid(context),
          ),
          const SizedBox(height: 6),
          _GoldButton(
            icon: Icons.grid_4x4,
            label: 'Map squares: ${map.resolution.mapSize.dx.toInt()} × '
                '${map.resolution.mapSize.dy.toInt()} — change',
            onTap: () => _changeMapGrid(context),
          ),
        ],
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

  /// Re-grids the open picture/PDF map ([DmCallbacks.onSetMapGrid]) after
  /// asking for the new square count ([showMapGridDialog]).
  Future<void> _changeMapGrid(BuildContext context) async {
    final map = state.map;
    if (map == null) return;
    final choice = await showMapGridDialog(
      context,
      title: 'Map squares',
      imageSize: state.rasterImageSize,
      initialCols: map.resolution.mapSize.dx.toInt(),
      initialRows: map.resolution.mapSize.dy.toInt(),
      askOwnGrid: false,
      tableCols: state.tableCols,
      tableRows: state.tableRows,
      warning: 'The fog of this game is cleared (its squares change). '
          'Drawings, layers and tokens stay; the map keeps the new grid.',
      confirmLabel: 'Apply',
      pictureBytes: map.imageBytes,
      initialGrid: state.rasterGrid,
      editorNote: _fineNote,
      editorCountsNote: _countsNote,
    );
    if (choice == null) return;
    cb.onSetMapGrid?.call(choice.cols, choice.rows, choice.grid);
  }

  static const _fineNote = 'Same counts: the fog of this game stays, only better aligned.';
  static const _countsNote = 'The counts change: the fog of this game is cleared. '
      'Drawings, layers and tokens stay.';

  /// Opens the grid editor ([showGridEditor]) on the open picture/PDF map
  /// and re-grids it with what the DM applies ([DmCallbacks.onSetMapGrid]).
  Future<void> _fitGrid(BuildContext context) async {
    final map = state.map;
    final size = state.rasterImageSize;
    if (map == null || size == null) return;
    final start = state.rasterGrid ??
        RasterGrid.whole(map.resolution.mapSize.dx.toInt(),
            map.resolution.mapSize.dy.toInt(), size);
    final g = await showGridEditor(
      context,
      pictureBytes: map.imageBytes,
      initial: start,
      tableCols: state.tableCols,
      tableRows: state.tableRows,
      note: _fineNote,
      countsNote: _countsNote,
    );
    if (g == null || g.closeTo(start)) return;
    cb.onSetMapGrid?.call(g.cols, g.rows, g.isWhole ? null : g);
  }

  /// "Measure the TV": calibrates one square = one inch.
  ///
  /// While open, the TV shows its calibration pattern
  /// ([DmCallbacks.onShowCalibration]): every one-inch square of its window
  /// and a 10-inch bar. The DM measures the bar (cm or inches) and applies —
  /// the picture width becomes `width × measured / 10` — or types the
  /// picture's width directly, or nudges the squares a quarter percent
  /// bigger/smaller. Each change goes to the TV at once and the dialog stays
  /// open, so the DM can measure again; the info line follows the TV.
  void _showCalibrationDialog(BuildContext context) {
    cb.onShowCalibration?.call(true);
    final measured = TextEditingController();
    final width = TextEditingController();
    var metric = true;
    String? error;
    ModalRoute<dynamic>? route;
    showDialog(
      context: context,
      builder: (ctx) {
        route ??= ModalRoute.of(ctx);
        return StatefulBuilder(builder: (ctx, setDialog) {
          final bar = min(TableGrid.measuringBarInches, state.tableCols);
          final unit = metric ? 'cm' : 'in';
          double? read(TextEditingController c) {
            final v = double.tryParse(c.text.trim().replaceAll(',', '.'));
            if (v == null || v <= 0) return null;
            return metric ? v / 2.54 : v;
          }

          void apply() {
            final len = read(measured);
            final w = read(width);
            if (len != null) {
              final ratio = len / bar;
              if (ratio < 0.5 || ratio > 2) {
                setDialog(() => error = 'That is far from $bar in — measure the bar again.');
                return;
              }
              cb.onCalibrate(state.tvWidthInches * ratio);
            } else if (w != null) {
              cb.onCalibrate(w);
            } else {
              setDialog(() => error = 'Enter what the bar measures (or the picture width).');
              return;
            }
            measured.clear();
            width.clear();
            setDialog(() => error = null);
          }

          return AlertDialog(
            backgroundColor: _kPanelBg,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: const BorderSide(color: _kBorderGold),
            ),
            title: const Text('Measure the TV', style: TextStyle(color: _kTextPrimary)),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'The TV shows its one-inch squares and a $bar-inch bar. '
                    'Measure the bar with a ruler and type what you get.',
                    style: TextStyle(color: _kTextSecondary.withValues(alpha: 0.9), fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  ListenableBuilder(
                    listenable: state,
                    builder: (_, _) => Text(
                      'Now: ${state.tableCols} × ${state.tableRows} squares · picture '
                      '${state.tvWidthInches.toStringAsFixed(2)} in '
                      '(${(state.tvWidthInches * 2.54).toStringAsFixed(1)} cm) wide',
                      style: const TextStyle(color: _kTextPrimary, fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 6,
                    children: [
                      for (final m in [true, false])
                        ChoiceChip(
                          label: Text(m ? 'cm' : 'inches'),
                          selected: metric == m,
                          onSelected: (_) => setDialog(() => metric = m),
                          backgroundColor: _kSurface,
                          selectedColor: _kSurfaceActive,
                          labelStyle: const TextStyle(color: _kTextPrimary, fontSize: 12),
                          side: const BorderSide(color: _kBorderGold),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  _calibrationField(measured, 'The bar measures',
                      metric ? (bar * 2.54).toStringAsFixed(1) : '$bar', unit),
                  const SizedBox(height: 8),
                  _calibrationField(width, 'or: the picture is this wide',
                      metric ? '87.6' : '34.5', unit),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: const TextStyle(color: Colors.orangeAccent, fontSize: 13)),
                  ],
                  const SizedBox(height: 12),
                  const _GoldLabel('Fine tune'),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: _GoldButton(
                          icon: Icons.zoom_out,
                          label: 'Smaller',
                          onTap: () => cb.onCalibrate(state.tvWidthInches * 1.0025),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _GoldButton(
                          icon: Icons.zoom_in,
                          label: 'Bigger',
                          onTap: () => cb.onCalibrate(state.tvWidthInches / 1.0025),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: cb.onResetCalibration,
                child: const Text('Reset to 34 × 19', style: TextStyle(color: _kTextSecondary)),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Done', style: TextStyle(color: _kTextSecondary)),
              ),
              GestureDetector(
                onTap: apply,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  decoration: BoxDecoration(
                    color: _kAccentGold,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'Apply',
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
        });
      },
    ).whenComplete(() {
      cb.onShowCalibration?.call(false);
      _disposeAfterExit(route, [measured, width]);
    });
  }

  /// A number field of the calibration dialog with a [unit] suffix.
  static Widget _calibrationField(
      TextEditingController c, String label, String hint, String unit) {
    return TextField(
      controller: c,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      style: const TextStyle(fontFamily: 'monospace', fontSize: 18, color: _kTextPrimary),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: _kTextSecondary),
        hintText: hint,
        suffixText: unit,
        suffixStyle: const TextStyle(color: _kTextSecondary),
        hintStyle: TextStyle(color: _kTextSecondary.withValues(alpha: 0.4)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: _kBorderGold),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: _kAccentGold),
        ),
      ),
    );
  }
}

/// Disposes [controllers] once [route]'s exit animation has finished.
///
/// `showDialog(...).whenComplete` fires when the dialog is *popped*, while its
/// closing animation still builds the text fields — disposing their
/// controllers there threw and turned the companion into an error screen
/// (found 2026-10-10: Save in the token editor, Cancel in calibration).
/// [TransitionRoute.completed] completes only after the animation is done.
void _disposeAfterExit(ModalRoute<dynamic>? route, List<ChangeNotifier> controllers) {
  void disposeAll() {
    for (final c in controllers) {
      c.dispose();
    }
  }

  if (route is TransitionRoute<dynamic>) {
    (route as TransitionRoute<dynamic>).completed.whenComplete(disposeAll);
  } else {
    disposeAll();
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

  /// Whether tapping does anything; a disabled button is dimmed.
  final bool enabled;

  const _GoldButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final button = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: enabled ? onTap : null,
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
    return enabled ? button : Opacity(opacity: 0.35, child: button);
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
                  Flexible(
                    child: Text(
                      options[i].$2,
                      style: TextStyle(
                        color: selected == i ? _kTextPrimary : _kTextSecondary,
                        fontSize: _kText,
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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

/// The circle reveal's radius: − [n squares] +, 1–30 squares.
class _RadiusStepper extends StatelessWidget {
  /// Current radius in squares.
  final int radius;

  /// Called with the new radius (the state clamps it).
  final ValueChanged<int> onChanged;

  const _RadiusStepper({required this.radius, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    Widget step(IconData icon, int delta) => SizedBox(
          width: 56,
          child: _Chip(
            active: false,
            onTap: () => onChanged(radius + delta),
            child: Icon(icon, color: _kAccentGold, size: _kIcon),
          ),
        );
    return Row(
      children: [
        step(Icons.remove, -1),
        Expanded(
          child: Text(
            radius == 1 ? '1 square' : '$radius squares',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: _kTextPrimary,
              fontSize: _kText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        step(Icons.add, 1),
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
