import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../model/shared_map.dart';
import '../network/shared_library.dart';
import 'notice.dart';

/// Where a shared-library upload comes from and what it is stored as.
class MapUploadSource {
  /// The link to fetch the map from, or `null` = pick a file on this device.
  final String? link;

  /// What the server stores the map as ([SharedLibraryClient.upload]).
  final StoreFormat storeAs;

  /// Creates a source; [link] `null` means "pick from the device".
  const MapUploadSource({this.link, this.storeAs = StoreFormat.original});
}

/// Uploads a map into the shared library — picked on this device, or
/// fetched from [MapUploadSource.link] — and returns its entry (`null` =
/// cancelled or failed — the uploader shows why). Reports progress 0..1
/// through `progress` (`null` = running, no figure).
typedef SharedMapUpload = Future<SharedMap?> Function(
    MapUploadSource source, void Function(double? progress) progress);

/// The sheet's "Store as" choice, kept on this device (Hive box
/// `libraryUpload`); [StoreFormat.original] when never set or unreadable.
Future<StoreFormat> loadStoreFormat() async {
  try {
    final box = await Hive.openBox<String>('libraryUpload');
    return StoreFormat.byName(box.get('storeAs'));
  } catch (e) {
    debugPrint('loadStoreFormat failed: $e');
    return StoreFormat.original;
  }
}

/// Stores the sheet's "Store as" choice. Errors are logged, never thrown.
Future<void> saveStoreFormat(StoreFormat format) async {
  try {
    final box = await Hive.openBox<String>('libraryUpload');
    await box.put('storeAs', format.name);
  } catch (e) {
    debugPrint('saveStoreFormat failed: $e');
  }
}

/// Shows the shared map library on the VPS as a bottom sheet: every map with
/// its thumbnail and squares, a button per map labelled [openLabel] ("Add to
/// game" in a game, "Play" in the library) that closes the sheet and calls
/// [onOpen], a delete button per map (asks first), and two ways to fill the
/// library without opening the map ([onUpload]): "Upload from device" and a
/// link field (typed, or the paste button: clipboard in and fetched at
/// once). "Store as" picks what the server stores the map as
/// ([StoreFormat], WebP marked recommended), starting at [storeAs];
/// every change goes to [onStoreAsChanged] (the companion stores it,
/// [saveStoreFormat]).
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
  StoreFormat storeAs = StoreFormat.original,
  ValueChanged<StoreFormat>? onStoreAsChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF1A1A2E),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    // Notices float above every route (NoticeHost), the sheet included.
    builder: (context) => FractionallySizedBox(
      heightFactor: 0.85,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: _SharedLibrarySheet(
          client: client,
          openLabel: openLabel,
          onOpen: onOpen,
          onUpload: onUpload,
          inGame: inGame,
          storeAs: storeAs,
          onStoreAsChanged: onStoreAsChanged,
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
  final StoreFormat storeAs;
  final ValueChanged<StoreFormat>? onStoreAsChanged;

  const _SharedLibrarySheet({
    required this.client,
    required this.openLabel,
    required this.onOpen,
    required this.onUpload,
    required this.inGame,
    required this.storeAs,
    this.onStoreAsChanged,
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

  /// The link field.
  final TextEditingController _link = TextEditingController();

  /// Whether the running upload came from the link field.
  bool _fromLink = false;

  /// What uploads are stored as.
  late StoreFormat _storeAs = widget.storeAs;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _link.dispose();
    super.dispose();
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

  /// Uploads from the device, or from [link] when given.
  Future<void> _startUpload(String? link) async {
    if (_upload != null) return; // one at a time
    setState(() {
      _upload = -1;
      _fromLink = link != null;
    });
    final added = await widget.onUpload(
        MapUploadSource(link: link, storeAs: _storeAs), (p) {
      if (mounted) setState(() => _upload = p ?? -1);
    });
    if (!mounted) return;
    setState(() => _upload = null);
    if (added != null) {
      if (link != null) _link.clear();
      _snack('"${added.name}" is in the shared library${_converted(added)}');
      await _reload();
    }
  }

  /// " as WebP, 1.6 → 0.3 MB" for a converted map, else "".
  static String _converted(SharedMap map) {
    final before = map.originalSize;
    if (before == null) return '';
    final ext = map.url.split('.').last.toUpperCase();
    final format = const {'WEBP': 'WebP', 'JPG': 'JPEG'}[ext] ?? ext;
    String mb(int b) => (b / 1024 / 1024).toStringAsFixed(1);
    final note = map.convertNote == null ? '' : ' (${map.convertNote})';
    return ' as $format, ${mb(before)} → ${mb(map.size)} MB$note';
  }

  /// Fetches the link in the field.
  void _fetchLink() {
    final link = _link.text.trim();
    if (link.isEmpty) {
      _snack('Type or paste a link first', error: true);
      return;
    }
    _startUpload(link);
  }

  /// The paste button: the clipboard into the field, fetched at once.
  Future<void> _pasteLink() async {
    final text = (await Clipboard.getData(Clipboard.kTextPlain))?.text?.trim();
    if (!mounted) return;
    if (text == null || text.isEmpty) {
      _snack('Nothing to paste — long-press the field and paste there',
          error: true);
      return;
    }
    _link.text = text;
    _fetchLink();
  }

  void _setStoreAs(StoreFormat f) {
    setState(() => _storeAs = f);
    widget.onStoreAsChanged?.call(f);
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
    Notice.show(context, msg, kind: error ? NoticeKind.error : NoticeKind.info);
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
              label: Text(_upload != null && !_fromLink ? 'Uploading…' : 'Upload from device'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white.withValues(alpha: 0.1),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _upload == null ? () => _startUpload(null) : null,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 8, 4),
            child: _buildLinkRow(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: _buildStoreAs(),
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

  /// The link field with its paste and fetch buttons.
  Widget _buildLinkRow() {
    final busy = _upload != null;
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _link,
            enabled: !busy,
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.go,
            onSubmitted: (_) => _fetchLink(),
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Or a link: picture, PDF, .dd2vtt, page, Drive, Dropbox',
              hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
              prefixIcon: const Icon(Icons.link, color: Colors.white38, size: 20),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.06),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ),
        IconButton(
          tooltip: 'Paste link and fetch',
          icon: const Icon(Icons.content_paste, color: Colors.white70),
          onPressed: busy ? null : _pasteLink,
        ),
        busy && _fromLink
            ? const Padding(
                padding: EdgeInsets.all(12),
                child: SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
              )
            : IconButton(
                tooltip: 'Fetch the link',
                icon: const Icon(Icons.arrow_forward, color: Colors.greenAccent),
                onPressed: busy ? null : _fetchLink,
              ),
      ],
    );
  }

  /// "Store as" chips (WebP marked recommended) and the choice's hint.
  Widget _buildStoreAs() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            const Text('Store as',
                style: TextStyle(color: Colors.white54, fontSize: 12)),
            for (final f in [StoreFormat.webp, StoreFormat.jpeg, StoreFormat.png,
              StoreFormat.original])
              ChoiceChip(
                label: Text(f == StoreFormat.recommended
                    ? '${f.label} · recommended'
                    : f.label),
                selected: _storeAs == f,
                onSelected: _upload == null ? (_) => _setStoreAs(f) : null,
                visualDensity: VisualDensity.compact,
                labelStyle: TextStyle(
                  fontSize: 12,
                  color: _storeAs == f ? Colors.black : Colors.white70,
                ),
                selectedColor: f == StoreFormat.recommended
                    ? Colors.greenAccent
                    : Colors.white70,
                backgroundColor: Colors.white.withValues(alpha: 0.06),
                side: BorderSide(
                  color: f == StoreFormat.recommended
                      ? Colors.greenAccent.withValues(alpha: 0.6)
                      : Colors.white24,
                ),
                showCheckmark: false,
              ),
          ],
        ),
        const SizedBox(height: 2),
        Text(_storeAs.hint,
            style: const TextStyle(color: Colors.white38, fontSize: 11)),
      ],
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
