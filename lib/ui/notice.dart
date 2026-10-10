import 'dart:math' as math;

import 'package:flutter/material.dart';

// The DM panel's warm palette (dm_control_panel.dart / grid_editor.dart).
const _surface = Color(0xFF241e18);
const _gold = Color(0xFFd4a76a);
const _goldDim = Color(0xFF8a7044);
const _border = Color(0xFF5a4a30);

/// What a [Notice] is about — picks its icon, accent colour and how long
/// it stays.
enum NoticeKind {
  /// A plain confirmation ("Map deleted", "Loading session…").
  info,

  /// Something worth a second look ("The TV hasn't sent its view yet").
  warning,

  /// Something failed ("Upload failed").
  error,
}

/// The app's one floating message: a card centred near the bottom of the
/// screen with an optional button ("Undo", "Reconnect"), a close ×, and a
/// thin bar along its bottom edge that runs down until the card leaves on
/// its own. It replaces the Material [SnackBar], whose action-carrying
/// variants stay open until tapped (Flutter's `persist` default) and which
/// queue up behind each other.
///
/// A new notice replaces the one on screen at once; holding a finger on
/// the card pauses its countdown. Every notice closes by itself — there is
/// no sticky variant.
///
/// Needs a [NoticeHost] above the [Navigator] (installed in
/// `MaterialApp.builder`), so dialogs, sheets and full-screen routes show
/// it too.
///
/// See also:
/// - [Notice.show], the call sites' entry point.
/// - [NoticeHost], which draws the card.
class Notice {
  Notice._();

  /// Shows [message] as a floating notice, replacing the current one.
  ///
  /// [kind] sets icon and colour. With [actionLabel] and [onAction] the
  /// card gets a button that runs [onAction] and closes the notice.
  /// [duration] overrides the automatic time on screen ([autoDuration]).
  ///
  /// Returns the notice's id for [dismiss], or `null` when no
  /// [NoticeHost] is mounted (nothing is shown then).
  static int? show(
    BuildContext context,
    String message, {
    NoticeKind kind = NoticeKind.info,
    String? actionLabel,
    VoidCallback? onAction,
    Duration? duration,
  }) {
    final host = NoticeHost._find(context);
    if (host == null) {
      debugPrint('Notice without a NoticeHost: $message');
      return null;
    }
    return host.show(NoticeData(
      message: message,
      kind: kind,
      actionLabel: onAction == null ? null : actionLabel,
      onAction: actionLabel == null ? null : onAction,
      duration: duration ??
          autoDuration(message, kind: kind, hasAction: actionLabel != null && onAction != null),
    ));
  }

  /// Closes the notice with [id] if it is still on screen; with `null`
  /// closes whatever is showing.
  static void dismiss(BuildContext context, [int? id]) =>
      NoticeHost._find(context)?.dismiss(id);

  /// How long a notice stays: 3 s for info, 4 s for warnings, 5 s for
  /// errors, at least 6 s with a button, plus a second per 40 characters
  /// beyond the first 40 — capped at 10 s.
  static Duration autoDuration(String message,
      {required NoticeKind kind, required bool hasAction}) {
    var ms = switch (kind) {
      NoticeKind.info => 3000,
      NoticeKind.warning => 4000,
      NoticeKind.error => 5000,
    };
    if (hasAction) ms = math.max(ms, 6000);
    ms += math.max(0, message.length - 40) * 25;
    return Duration(milliseconds: math.min(ms, 10000));
  }
}

/// One notice's content, as handed to [NoticeHost.show].
@immutable
class NoticeData {
  /// The text on the card.
  final String message;

  /// Icon and accent colour.
  final NoticeKind kind;

  /// The button's label, or `null` for no button.
  final String? actionLabel;

  /// What the button does (the notice closes afterwards).
  final VoidCallback? onAction;

  /// Time on screen until it closes by itself.
  final Duration duration;

  /// Creates a notice; see [Notice.show].
  const NoticeData({
    required this.message,
    required this.duration,
    this.kind = NoticeKind.info,
    this.actionLabel,
    this.onAction,
  });
}

/// Hosts [Notice]s over everything below it: wrap the app's [Navigator]
/// with it (`MaterialApp(builder: (_, child) => NoticeHost(child: child!))`).
///
/// [bottom] is the gap between the card and the bottom edge (above the
/// system's safe area).
class NoticeHost extends StatefulWidget {
  /// The app below the notices.
  final Widget child;

  /// Distance from the bottom edge, in logical pixels.
  final double bottom;

  /// Creates the host.
  const NoticeHost({super.key, required this.child, this.bottom = 28});

  /// The most recently mounted host — the fallback for contexts outside
  /// its subtree (an overlay entry, a context from before the builder).
  static NoticeHostState? _last;

  static NoticeHostState? _find(BuildContext context) =>
      context.findAncestorStateOfType<NoticeHostState>() ?? _last;

  @override
  State<NoticeHost> createState() => NoticeHostState();
}

/// State of [NoticeHost]: the notice on screen, if any.
class NoticeHostState extends State<NoticeHost> {
  int _nextId = 0;
  int? _id;
  NoticeData? _data;

  /// Id of the notice on screen, or `null` (for tests).
  int? get currentId => _id;

  @override
  void initState() {
    super.initState();
    NoticeHost._last = this;
  }

  @override
  void dispose() {
    if (NoticeHost._last == this) NoticeHost._last = null;
    super.dispose();
  }

  /// Puts [data] on screen in place of the current notice; returns its id.
  int show(NoticeData data) {
    final id = ++_nextId;
    setState(() {
      _id = id;
      _data = data;
    });
    return id;
  }

  /// Closes the notice [id] (or the current one when `null`).
  void dismiss([int? id]) {
    if (_id == null || (id != null && id != _id)) return;
    setState(() {
      _id = null;
      _data = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final id = _id;
    final pad = MediaQuery.paddingOf(context);
    return Stack(
      children: [
        widget.child,
        Positioned(
          left: 16,
          right: 16,
          bottom: pad.bottom + widget.bottom,
          child: Center(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              reverseDuration: const Duration(milliseconds: 160),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween(begin: const Offset(0, 0.35), end: Offset.zero)
                      .animate(anim),
                  child: child,
                ),
              ),
              child: data == null || id == null
                  ? const SizedBox.shrink()
                  : _NoticeCard(
                      key: ValueKey(id),
                      data: data,
                      onClose: () => dismiss(id),
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The card itself: icon, message, optional button, ×, countdown bar.
class _NoticeCard extends StatefulWidget {
  final NoticeData data;
  final VoidCallback onClose;

  const _NoticeCard({super.key, required this.data, required this.onClose});

  @override
  State<_NoticeCard> createState() => _NoticeCardState();
}

class _NoticeCardState extends State<_NoticeCard> with SingleTickerProviderStateMixin {
  /// Runs from 1 (just shown) to 0 (closes).
  late final AnimationController _left = AnimationController(
    vsync: this,
    duration: widget.data.duration,
    value: 1,
  );

  @override
  void initState() {
    super.initState();
    _left.addStatusListener((s) {
      if (s == AnimationStatus.dismissed) widget.onClose();
    });
    _left.reverse();
  }

  @override
  void dispose() {
    _left.dispose();
    super.dispose();
  }

  void _pause() => _left.stop();

  void _resume() {
    if (mounted && _left.value > 0) _left.reverse();
  }

  Color get _accent => switch (widget.data.kind) {
        NoticeKind.info => _gold,
        NoticeKind.warning => Colors.orangeAccent,
        NoticeKind.error => const Color(0xFFFF6B5E),
      };

  IconData get _icon => switch (widget.data.kind) {
        NoticeKind.info => Icons.info_outline,
        NoticeKind.warning => Icons.warning_amber_rounded,
        NoticeKind.error => Icons.error_outline,
      };

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final accent = _accent;
    return Listener(
      onPointerDown: (_) => _pause(),
      onPointerUp: (_) => _resume(),
      onPointerCancel: (_) => _resume(),
      child: Semantics(
        liveRegion: true,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 280, maxWidth: 560),
          child: Material(
            color: _surface,
            elevation: 10,
            shadowColor: Colors.black,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                  color: d.kind == NoticeKind.info ? _border : accent.withValues(alpha: 0.6)),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 4, 6),
                  child: Row(
                    children: [
                      Icon(_icon, color: accent, size: 20),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            d.message,
                            style: const TextStyle(
                                color: Color(0xFFEDE3D3), fontSize: 14, height: 1.3),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (d.actionLabel != null)
                        TextButton(
                          onPressed: () {
                            d.onAction?.call();
                            widget.onClose();
                          },
                          style: TextButton.styleFrom(
                            foregroundColor: accent,
                            minimumSize: const Size(64, 44),
                            textStyle: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14, letterSpacing: 0.3),
                          ),
                          child: Text(d.actionLabel!),
                        ),
                      IconButton(
                        onPressed: widget.onClose,
                        // No tooltip: the host sits above the Navigator's Overlay.
                        icon: const Icon(Icons.close, size: 18),
                        color: _goldDim,
                        constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                      ),
                    ],
                  ),
                ),
                // The countdown: a hairline that shrinks towards the middle.
                SizedBox(
                  height: 3,
                  child: AnimatedBuilder(
                    animation: _left,
                    builder: (_, __) => Align(
                      alignment: Alignment.center,
                      child: FractionallySizedBox(
                        widthFactor: _left.value,
                        child: Container(color: accent.withValues(alpha: 0.75)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
