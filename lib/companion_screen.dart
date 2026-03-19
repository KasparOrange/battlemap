import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flame/game.dart' hide Route, Matrix4, Vector2, Vector3, Vector4;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'game_state.dart';
import 'game/battlemap_game.dart';
import 'pdf_helper.dart';

// Conditional import for networking
import 'network/client_stub.dart' if (dart.library.io) 'network/client.dart';

/// Companion Mode — phone controller for drawing on the battlemap.
/// In networked mode (APK), sends commands to the TV server.
/// In local mode (web), modifies GameState directly.
class CompanionScreen extends StatefulWidget {
  final GameState gameState;
  final String? serverHost;
  final int serverPort;

  const CompanionScreen({
    super.key,
    required this.gameState,
    this.serverHost,
    this.serverPort = 8080,
  });

  @override
  State<CompanionScreen> createState() => _CompanionScreenState();
}

class _CompanionScreenState extends State<CompanionScreen> {
  final TransformationController _transformController =
      TransformationController();

  late final BattlemapGame _game;

  // Drawing state
  Color _brushColor = const Color(0xFFE53935);
  double _brushWidth = 3.0;
  bool _isDrawing = true;

  // PDF
  final PdfHelper _pdfHelper = PdfHelper();

  // Networking
  BattlemapClient? _client;
  ClientConnectionState _connectionState = ClientConnectionState.disconnected;
  StreamSubscription<ClientConnectionState>? _connectionSub;

  bool get _isNetworked => widget.serverHost != null && !kIsWeb;

  static const List<Color> brushColors = [
    Color(0xFFE53935),
    Color(0xFF43A047),
    Color(0xFF1E88E5),
    Color(0xFFFDD835),
    Color(0xFFFF8F00),
    Color(0xFFFFFFFF),
  ];

  GameState get game => widget.gameState;

  @override
  void initState() {
    super.initState();
    _game = BattlemapGame(gameState: game, mode: BattlemapMode.companion);
    // Listen for state changes that affect the toolbar UI (token count, PDF state)
    game.addListener(_onGameChanged);
    if (_isNetworked) _connectToServer();
  }

  @override
  void dispose() {
    game.removeListener(_onGameChanged);
    _pdfHelper.dispose();
    _transformController.dispose();
    _connectionSub?.cancel();
    _client?.dispose();
    super.dispose();
  }

  void _onGameChanged() => setState(() {});

  Future<void> _connectToServer() async {
    _client = BattlemapClient(
      gameState: game,
      host: widget.serverHost!,
      port: widget.serverPort,
    );
    _connectionSub = _client!.connectionStream.listen((state) {
      setState(() => _connectionState = state);
    });
    await _client!.connect();
  }

  // --- Command dispatch (network or local) ---

  void _addToken(int gridX, int gridY) {
    if (_isNetworked) {
      _client?.addToken(gridX, gridY);
    } else {
      game.addToken(gridX, gridY);
    }
  }

  void _addStroke(DrawStroke stroke) {
    if (_isNetworked) {
      _client?.addStroke(stroke);
    } else {
      game.addStroke(stroke);
    }
  }

  void _clearDrawings() {
    if (_isNetworked) {
      _client?.clearDrawings();
    } else {
      game.clearDrawings();
    }
  }

  Future<void> _pickPdf() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final bytes = result.files.first.bytes;
    if (bytes == null) return;

    // Reject files over 50MB
    if (bytes.length > 50 * 1024 * 1024) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('PDF too large (max 50MB)')),
        );
      }
      return;
    }

    if (_isNetworked) {
      _client?.sendPdf(bytes);
    }
    await _pdfHelper.loadPdf(bytes, game);
  }

  // --- Gesture handlers ---

  Offset _toScene(Offset screenPos) {
    final inverse = Matrix4.inverted(_transformController.value);
    return MatrixUtils.transformPoint(inverse, screenPos);
  }

  void _onPanStart(DragStartDetails details) {
    if (!_isDrawing) return;
    final scenePos = _toScene(details.localPosition);
    _game.handleDragStartAtScene(scenePos);
  }

  void _onPanUpdate(DragUpdateDetails details) {
    if (!_isDrawing) return;
    final scenePos = _toScene(details.localPosition);
    _game.handleDragUpdateAtScene(scenePos);
    // Send live stroke preview to TV
    if (_isNetworked) {
      _client?.sendStrokeUpdate(DrawStroke(
        points: List.from(_game.localStrokePoints ?? []),
        color: _brushColor,
        width: _brushWidth,
      ));
    }
  }

  void _onPanEnd(DragEndDetails details) {
    if (!_isDrawing) return;
    final completedStroke = _game.handleDragEndAtScene();
    if (completedStroke != null) {
      _addStroke(completedStroke);
    }
    if (_isNetworked) _client?.sendStrokeEnd();
  }

  void _onTapUp(TapUpDetails details) {
    if (_isDrawing) return;
    final scenePos = _toScene(details.localPosition);
    _game.handleTapAtScene(scenePos);
  }

  @override
  Widget build(BuildContext context) {
    // Sync brush state to game
    _game.brushColor = _brushColor;
    _game.brushWidth = _brushWidth;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isDrawing ? 'Draw Mode' : 'Token Mode'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.picture_as_pdf),
            tooltip: 'Load PDF map',
            onPressed: _pickPdf,
          ),
          if (game.hasPdf)
            IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Remove PDF',
              onPressed: () {
                if (_isNetworked) _client?.sendClearPdf();
                _pdfHelper.clear(game);
              },
            ),
          if (_isDrawing)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Clear drawings',
              onPressed: _clearDrawings,
            ),
        ],
      ),
      body: Column(
        children: [
          // Connection banner (networked mode only)
          if (_isNetworked) _buildConnectionBanner(),
          // Toolbar
          _buildToolbar(),
          // Canvas
          Expanded(
            child: InteractiveViewer(
              transformationController: _transformController,
              minScale: 0.5,
              maxScale: 3.0,
              constrained: false,
              panEnabled: !_isDrawing,
              scaleEnabled: !_isDrawing,
              child: GestureDetector(
                onPanStart: _isDrawing ? _onPanStart : null,
                onPanUpdate: _isDrawing ? _onPanUpdate : null,
                onPanEnd: _isDrawing ? _onPanEnd : null,
                onTapUp: !_isDrawing ? _onTapUp : null,
                child: SizedBox(
                  width: game.gridWidth,
                  height: game.gridHeight,
                  child: GameWidget(game: _game),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConnectionBanner() {
    Color bgColor;
    String text;
    IconData icon;

    switch (_connectionState) {
      case ClientConnectionState.connected:
        bgColor = Colors.green.shade800;
        text = 'Connected to ${widget.serverHost}';
        icon = Icons.wifi;
      case ClientConnectionState.connecting:
        bgColor = Colors.orange.shade800;
        text = 'Connecting to ${widget.serverHost}...';
        icon = Icons.wifi_find;
      case ClientConnectionState.disconnected:
        bgColor = Colors.red.shade800;
        text = 'Disconnected — reconnecting...';
        icon = Icons.wifi_off;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: bgColor,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: Colors.black26,
      child: Row(
        children: [
          ToggleButtons(
            isSelected: [_isDrawing, !_isDrawing],
            onPressed: (i) => setState(() => _isDrawing = i == 0),
            borderRadius: BorderRadius.circular(8),
            selectedColor: Colors.white,
            fillColor: Colors.white.withValues(alpha: 0.15),
            constraints: const BoxConstraints(minHeight: 36, minWidth: 44),
            children: const [
              Icon(Icons.brush, size: 20),
              Icon(Icons.person_pin, size: 20),
            ],
          ),
          const SizedBox(width: 16),
          if (_isDrawing) ...[
            for (final color in brushColors)
              GestureDetector(
                onTap: () => setState(() => _brushColor = color),
                child: Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _brushColor == color
                          ? Colors.white
                          : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 8),
            SizedBox(
              width: 100,
              child: Slider(
                value: _brushWidth,
                min: 1,
                max: 10,
                onChanged: (v) => setState(() => _brushWidth = v),
              ),
            ),
          ],
          if (!_isDrawing)
            Text(
              '${game.tokens.length} tokens placed',
              style: const TextStyle(color: Colors.white54, fontSize: 13),
            ),
          if (game.hasPdf && game.pdfPageCount > 1) ...[
            const Spacer(),
            IconButton(
              icon: const Icon(Icons.chevron_left, size: 20),
              onPressed: game.pdfPageIndex > 0
                  ? () => _pdfHelper.setPage(game.pdfPageIndex - 1, game)
                  : null,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
            Text(
              '${game.pdfPageIndex + 1}/${game.pdfPageCount}',
              style: const TextStyle(color: Colors.white54, fontSize: 13),
            ),
            IconButton(
              icon: const Icon(Icons.chevron_right, size: 20),
              onPressed: game.pdfPageIndex < game.pdfPageCount - 1
                  ? () => _pdfHelper.setPage(game.pdfPageIndex + 1, game)
                  : null,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
          ],
        ],
      ),
    );
  }
}
