import 'package:flutter/material.dart';

import '../model/shared_map.dart';
import '../network/shared_library.dart';

/// Uploads a map from this device into the shared library and returns its
/// entry (`null` = cancelled or failed — the uploader shows why). Reports
/// upload progress 0..1 through `progress`.
typedef SharedMapUpload = Future<SharedMap?> Function(
    void Function(double? progress) progress);

/// Shows the shared map library on the VPS as a bottom sheet: every map with
/// its thumbnail and squares, a button per map labelled [openLabel] ("Add to
/// game" in a game, "Play" in the library) that closes the sheet and calls
/// [onOpen], a delete button per map (asks first), and "Upload from device"
/// ([onUpload]) to fill the library without opening the map.
///
/// Maps whose id is in [inGame] are marked "in this game" instead of
/// offering [openLabel].
///
/// See also:
/// * [SharedLibraryClient], which talks to the server.
/// * `docs/architecture.md` "shared map library".
Future<void> showSharedLibrarySheet(
  BuildContext context, {
  required SharedLibraryClient client,
  required String openLabel,
  required void Function(SharedMap map) onOpen,
  required SharedMapUpload onUpload,
  Set<String> inGame = const {},
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1A1A2E),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    // Own messenger + scaffold: snackbars show on the sheet, not under it
    builder: (context) => FractionallySizedBox(
      heightFactor: 0.85,
      child: ScaffoldMessenger(
        child: Scaffold(
          backgroundColor: Colors.transparent,
          body: _SharedLibrarySheet(
            client: client,
            openLabel: openLabel,
            onOpen: onOpen,
            onUpload: onUpload,
            inGame: inGame,
          ),
        ),
      ),
    ),
  );
}

class _SharedLibrarySheet extends StatefulWidget {
  final SharedLibraryClient client;
  final String openLabel;
  final void Function(SharedMap map) onOpen;
  final SharedMapUpload onUpload;
  final Set<String> inGame;

  const _SharedLibrarySheet({
    required this.client,
    required this.openLabel,
    required this.onOpen,
    required this.onUpload,
    required this.inGame,
  });

  @override
  State<_SharedLibrarySheet> createState() => _SharedLibrarySheetState();
}

class _SharedLibrarySheetState extends State<_SharedLibrarySheet> {
  /// The library's maps, `null` while loading the first time.
  List<SharedMap>? _maps;

  /// Why the list couldn't be loaded, or `null`.
  String? _error;

  /// Whether a reload is running (keeps the old list on screen).
  bool _refreshing = false;

  /// Upload progress 0..1 (`-1` = running, no figure yet), `null` = idle.
  double? _upload;

  /// Ids of maps being deleted (their rows show a spinner).
  final Set<String> _deleting = {};

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _refreshing = true;
      _error = null;
    });
    final maps = await widget.client.list();
    if (!mounted) return;
    setState(() {
      _refreshing = false;
      if (maps == null) {
        _error = "Can't reach the shared library — check the connection.";
      } else {
        _maps = maps;
      }
    });
  }

  Future<void> _uploadFromDevice() async {
    if (_upload != null) return; // one at a time
    setState(() => _upload = -1);
    final added = await widget.onUpload((p) {
      if (mounted) setState(() => _upload = p ?? -1);
    });
    if (!mounted) return;
    setState(() => _upload = null);
    if (added != null) {
      _snack('"${added.name}" is in the shared library');
      await _reload();
    }
  }

  Future<void> _delete(SharedMap map) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A3E),
        title: const Text('Remove from the shared library?',
            style: TextStyle(color: Colors.white)),
        content: Text(
          '"${map.name}" is removed from the server. Games that already use '
          'it keep their copy on the TV.',
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _deleting.add(map.id));
    final removed = await widget.client.delete(map.id);
    if (!mounted) return;
    setState(() => _deleting.remove(map.id));
    if (removed) {
      setState(() => _maps?.removeWhere((m) => m.id == map.id));
      _snack('"${map.name}" removed');
    } else {
      _snack("Couldn't remove \"${map.name}\"", error: true);
    }
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.redAccent : null,
      duration: const Duration(seconds: 2),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final maps = _maps;
    return SafeArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 8, 4),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Shared map library',
                    style: TextStyle(
                        color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
                  ),
                ),
                IconButton(
                  tooltip: 'Reload',
                  icon: const Icon(Icons.refresh, color: Colors.white54),
                  onPressed: _refreshing ? null : _reload,
                ),
                IconButton(
                  tooltip: 'Close',
                  icon: const Icon(Icons.close, color: Colors.white54),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Text(
              'Maps on the server, for every game. Everything uploaded from a '
              'device lands here too.',
              style: TextStyle(color: Colors.white38, fontSize: 12),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: ElevatedButton.icon(
              icon: const Icon(Icons.upload_file),
              label: Text(_upload == null ? 'Upload from device' : 'Uploading…'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.1),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _upload == null ? _uploadFromDevice : null,
            ),
          ),
          if (_upload != null || _refreshing)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: LinearProgressIndicator(
                value: _upload == null || _upload! < 0 ? null : _upload,
                backgroundColor: Colors.white12,
                color: Colors.greenAccent,
                minHeight: 3,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          Expanded(child: _buildList(maps)),
        ],
      ),
    );
  }

  Widget _buildList(List<SharedMap>? maps) {
    if (maps == null) {
      return Center(
        child: _error != null
            ? Text(_error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.redAccent, fontSize: 14))
            : const CircularProgressIndicator(),
      );
    }
    if (maps.isEmpty) {
      return const Center(
        child: Text(
          'No maps yet\nUpload a .dd2vtt, picture or PDF to fill it',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white24, fontSize: 14),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      itemCount: maps.length,
      itemBuilder: (context, i) => _buildRow(maps[i]),
    );
  }

  Widget _buildRow(SharedMap map) {
    final thumbUrl = map.thumbUrl;
    final inGame = widget.inGame.contains(map.id);
    final squares = map.isImage
        ? '${map.gridCols ?? '?'} × ${map.gridRows ?? '?'} squares · picture'
        : 'Dungeondraft map';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(8, 8, 4, 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: 64,
              height: 48,
              child: thumbUrl == null
                  ? const ColoredBox(
                      color: Colors.white10,
                      child: Icon(Icons.map, color: Colors.white38),
                    )
                  : Image.network(
                      widget.client.absolute(thumbUrl),
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const ColoredBox(
                        color: Colors.white10,
                        child: Icon(Icons.map, color: Colors.white38),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(map.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w500)),
                Text(
                  '$squares · ${(map.size / 1024 / 1024).toStringAsFixed(1)} MB',
                  style: const TextStyle(color: Colors.white30, fontSize: 11),
                ),
              ],
            ),
          ),
          if (inGame)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text('In this game',
                  style: TextStyle(color: Colors.white38, fontSize: 12)),
            )
          else
            TextButton.icon(
              icon: const Icon(Icons.play_circle_outline, color: Colors.greenAccent),
              label: Text(widget.openLabel,
                  style: const TextStyle(color: Colors.greenAccent)),
              onPressed: () {
                Navigator.pop(context);
                widget.onOpen(map);
              },
            ),
          _deleting.contains(map.id)
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                )
              : IconButton(
                  tooltip: 'Remove from the shared library',
                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                  onPressed: () => _delete(map),
                ),
        ],
      ),
    );
  }
}
