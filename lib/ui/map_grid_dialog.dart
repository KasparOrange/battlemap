import 'package:flutter/material.dart';

/// What the DM chose in [showMapGridDialog].
typedef MapGridChoice = ({int cols, int rows, bool hasOwnGrid});

/// Asks how many squares a picture or PDF map has — the grid that makes
/// one square one inch on the table.
///
/// Used when uploading a raster map (it carries no grid data, unlike a
/// `.dd2vtt`) and in a game to re-grid one counted wrong (Map tab ▸ Map
/// squares). With the picture's pixel size ([imageSize]) known:
/// - **rows follow the columns** so squares stay square (until the DM types
///   rows by hand), and a warning appears when the counts give squares more
///   than 3 % off square;
/// - a line says what that means on the table: the map's size in inches
///   and whether it fits the TV's [tableCols] × [tableRows] window or the TV
///   pans across it.
///
/// [askOwnGrid] adds "the picture has its own grid lines" (battlemap then
/// draws none, remembered for the map); [warning] is shown above the
/// buttons (e.g. that re-gridding clears the fog). Returns `null` on
/// cancel.
///
/// See also:
/// - [VttState.regridRaster], the in-game re-grid.
/// - `vtt.imageUploaded` / `vtt.setMapGrid` in `docs/relay-protocol.md`.
Future<MapGridChoice?> showMapGridDialog(
  BuildContext context, {
  required String title,
  Size? imageSize,
  int initialCols = 20,
  int? initialRows,
  bool askOwnGrid = true,
  bool initialOwnGrid = true,
  int tableCols = 34,
  int tableRows = 19,
  String? warning,
  String confirmLabel = 'OK',
}) {
  return showDialog<MapGridChoice>(
    context: context,
    builder: (ctx) => _MapGridDialog(
      title: title,
      imageSize: imageSize,
      initialCols: initialCols,
      initialRows: initialRows,
      askOwnGrid: askOwnGrid,
      initialOwnGrid: initialOwnGrid,
      tableCols: tableCols,
      tableRows: tableRows,
      warning: warning,
      confirmLabel: confirmLabel,
    ),
  );
}

/// Rows that keep squares square for [cols] columns over [imageSize], or
/// `null` without a usable size.
int? squareRowsFor(int cols, Size? imageSize) {
  if (imageSize == null || imageSize.width <= 0 || cols <= 0) return null;
  final cell = imageSize.width / cols;
  return (imageSize.height / cell).round().clamp(1, 400);
}

class _MapGridDialog extends StatefulWidget {
  final String title;
  final Size? imageSize;
  final int initialCols;
  final int? initialRows;
  final bool askOwnGrid;
  final bool initialOwnGrid;
  final int tableCols;
  final int tableRows;
  final String? warning;
  final String confirmLabel;

  const _MapGridDialog({
    required this.title,
    required this.imageSize,
    required this.initialCols,
    required this.initialRows,
    required this.askOwnGrid,
    required this.initialOwnGrid,
    required this.tableCols,
    required this.tableRows,
    required this.warning,
    required this.confirmLabel,
  });

  @override
  State<_MapGridDialog> createState() => _MapGridDialogState();
}

class _MapGridDialogState extends State<_MapGridDialog> {
  late final TextEditingController _cols;
  late final TextEditingController _rows;
  late bool _ownGrid;

  /// Whether the DM typed the rows; until then they follow the columns.
  bool _rowsByHand = false;

  @override
  void initState() {
    super.initState();
    _cols = TextEditingController(text: '${widget.initialCols}');
    final rows = widget.initialRows ??
        squareRowsFor(widget.initialCols, widget.imageSize) ?? 15;
    _rows = TextEditingController(text: '$rows');
    _rowsByHand = widget.initialRows != null &&
        widget.initialRows != squareRowsFor(widget.initialCols, widget.imageSize);
    _ownGrid = widget.initialOwnGrid;
  }

  @override
  void dispose() {
    _cols.dispose();
    _rows.dispose();
    super.dispose();
  }

  int get _colCount => (int.tryParse(_cols.text.trim()) ?? 0).clamp(0, 400);
  int get _rowCount => (int.tryParse(_rows.text.trim()) ?? 0).clamp(0, 400);

  void _setCols(int cols) {
    final c = cols.clamp(1, 400);
    _cols.text = '$c';
    _colsChanged();
  }

  void _colsChanged() {
    if (!_rowsByHand) {
      final r = squareRowsFor(_colCount, widget.imageSize);
      if (r != null) _rows.text = '$r';
    }
    setState(() {});
  }

  /// The table line and the squareness warning for the current counts.
  (String, String?) _describe() {
    final cols = _colCount;
    final rows = _rowCount;
    if (cols <= 0 || rows <= 0) return ('Enter both counts.', null);
    final fits = cols <= widget.tableCols && rows <= widget.tableRows;
    final fitsTurned = cols <= widget.tableRows && rows <= widget.tableCols;
    final table = fits
        ? 'On the table: $cols × $rows in — fits the TV (${widget.tableCols} × ${widget.tableRows}), centred.'
        : fitsTurned
            ? 'On the table: $cols × $rows in — fits the TV turned 90°, otherwise the TV pans.'
            : 'On the table: $cols × $rows in — bigger than the TV (${widget.tableCols} × ${widget.tableRows}): '
                'the TV shows part of it, you move it from the tablet.';
    String? warn;
    final size = widget.imageSize;
    if (size != null) {
      final w = size.width / cols;
      final h = size.height / rows;
      final off = (h / w - 1) * 100;
      if (off.abs() > 3) {
        warn = 'Squares come out ${off.abs().round()} % ${off > 0 ? 'taller' : 'wider'} than '
            '${off > 0 ? 'wide' : 'tall'} — check the counts.';
      }
    }
    return (table, warn);
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.imageSize;
    final (table, warn) = _describe();
    final cell = size != null && _colCount > 0 ? size.width / _colCount : null;
    return AlertDialog(
      backgroundColor: const Color(0xFF1A1A2E),
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              size != null
                  ? 'Picture ${size.width.round()} × ${size.height.round()} px. '
                      'Count the squares along the top edge; the rows follow.'
                  : 'How many squares does the map have?',
              style: const TextStyle(color: Colors.white54, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                IconButton(
                  tooltip: 'One column less',
                  icon: const Icon(Icons.remove, color: Colors.white70),
                  onPressed: () => _setCols(_colCount - 1),
                ),
                Expanded(
                  child: TextField(
                    controller: _cols,
                    keyboardType: TextInputType.number,
                    style: const TextStyle(color: Colors.white, fontSize: 18),
                    decoration: _field('Columns'),
                    onChanged: (_) => _colsChanged(),
                  ),
                ),
                IconButton(
                  tooltip: 'One column more',
                  icon: const Icon(Icons.add, color: Colors.white70),
                  onPressed: () => _setCols(_colCount + 1),
                ),
                const SizedBox(width: 8),
                const Text('×', style: TextStyle(color: Colors.white38, fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _rows,
                    keyboardType: TextInputType.number,
                    style: const TextStyle(color: Colors.white, fontSize: 18),
                    decoration: _field(_rowsByHand || size == null ? 'Rows' : 'Rows (auto)'),
                    onChanged: (_) => setState(() => _rowsByHand = true),
                  ),
                ),
              ],
            ),
            if (cell != null) ...[
              const SizedBox(height: 6),
              Text('One square = ${cell.toStringAsFixed(cell < 20 ? 1 : 0)} px of the picture',
                  style: const TextStyle(color: Colors.white38, fontSize: 12)),
            ],
            const SizedBox(height: 10),
            Text(table, style: const TextStyle(color: Colors.white70, fontSize: 13)),
            if (warn != null) ...[
              const SizedBox(height: 6),
              Text(warn, style: const TextStyle(color: Colors.orangeAccent, fontSize: 13)),
            ],
            if (widget.askOwnGrid) ...[
              const SizedBox(height: 8),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _ownGrid,
                onChanged: (v) => setState(() => _ownGrid = v ?? true),
                title: const Text('The picture has its own grid lines',
                    style: TextStyle(fontSize: 14)),
                subtitle: const Text('Then battlemap draws no grid over it.',
                    style: TextStyle(color: Colors.white38, fontSize: 12)),
              ),
            ],
            if (widget.warning != null) ...[
              const SizedBox(height: 8),
              Text(widget.warning!,
                  style: const TextStyle(color: Colors.orangeAccent, fontSize: 13)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _colCount > 0 && _rowCount > 0
              ? () => Navigator.pop<MapGridChoice>(
                  context, (cols: _colCount, rows: _rowCount, hasOwnGrid: _ownGrid))
              : null,
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }

  static InputDecoration _field(String label) => InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white38),
        enabledBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: Colors.white24),
        ),
        focusedBorder: const UnderlineInputBorder(
          borderSide: BorderSide(color: Colors.greenAccent),
        ),
      );
}
