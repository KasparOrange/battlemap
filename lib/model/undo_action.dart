import '../model/draw_stroke.dart';
import '../model/map_token.dart';

/// Base class for all undoable actions in the VTT state.
///
/// Each subclass captures the minimum information needed to reverse
/// (undo) or re-apply (redo) a single user action. Actions are stored
/// on [VttState._undoStack] and [VttState._redoStack].
///
/// See also:
/// * [VttState.undo], which pops and reverses the most recent action.
/// * [VttState.redo], which re-applies the most recently undone action.
sealed class UndoAction {}

/// Records a fog-of-war cell change (reveal or hide).
///
/// [cellsChanged] contains the cell indices that were actually modified.
/// [wasReveal] indicates whether the cells were revealed (`true`) or
/// hidden (`false`) by the original action. Undoing a reveal removes
/// the cells; undoing a hide adds them back.
class FogAction extends UndoAction {
  /// The set of cell indices that changed state.
  final Set<int> cellsChanged;

  /// Whether the original action revealed (`true`) or hid (`false`) cells.
  final bool wasReveal;

  /// Creates a [FogAction] recording the [cellsChanged] and direction.
  FogAction(this.cellsChanged, this.wasReveal);
}

/// Records a portal (door/gate) toggle.
///
/// [index] is the portal's position in [UvttMap.portals].
/// [wasOpen] is the portal's state *before* the toggle occurred.
/// Undoing restores the portal to [wasOpen]; redoing toggles it again.
class PortalAction extends UndoAction {
  /// Index into [UvttMap.portals].
  final int index;

  /// Whether the portal was open before the toggle.
  final bool wasOpen;

  /// Creates a [PortalAction] for portal [index] with prior state [wasOpen].
  PortalAction(this.index, this.wasOpen);
}

/// Records the addition of a token to the map.
///
/// Undoing removes the [token]; redoing adds it back.
class TokenAddAction extends UndoAction {
  /// The token that was added.
  final MapToken token;

  /// Creates a [TokenAddAction] for the given [token].
  TokenAddAction(this.token);
}

/// Records the removal of a token from the map.
///
/// Undoing restores the [token]; redoing removes it again.
class TokenRemoveAction extends UndoAction {
  /// The token that was removed.
  final MapToken token;

  /// Creates a [TokenRemoveAction] for the given [token].
  TokenRemoveAction(this.token);
}

/// Records a token move from one grid cell to another.
///
/// [id] identifies the token. [fromX]/[fromY] are the original position,
/// [toX]/[toY] are the new position. Undoing moves the token back to
/// ([fromX], [fromY]).
class TokenMoveAction extends UndoAction {
  /// The [MapToken.id] of the moved token.
  final String id;

  /// Original horizontal grid coordinate before the move.
  final int fromX;

  /// Original vertical grid coordinate before the move.
  final int fromY;

  /// New horizontal grid coordinate after the move.
  final int toX;

  /// New vertical grid coordinate after the move.
  final int toY;

  /// Creates a [TokenMoveAction] recording the move.
  TokenMoveAction(this.id, this.fromX, this.fromY, this.toX, this.toY);
}

/// Records the addition of a freehand drawing stroke.
///
/// Undoing removes the [stroke]; redoing adds it back.
class StrokeAddAction extends UndoAction {
  /// The stroke that was added.
  final DrawStroke stroke;

  /// Creates a [StrokeAddAction] for the given [stroke].
  StrokeAddAction(this.stroke);
}

/// Records the clearing of all drawing strokes.
///
/// [strokes] is a snapshot of all strokes that existed before clearing.
/// Undoing restores them all; redoing clears them again.
class StrokeClearAction extends UndoAction {
  /// All strokes that were present before the clear operation.
  final List<DrawStroke> strokes;

  /// Creates a [StrokeClearAction] with the saved [strokes].
  StrokeClearAction(this.strokes);
}

/// Records a shadow-mode commit that merged shadow cells into the fog state.
///
/// [revealed] contains cells that were added to [VttState.revealedCells],
/// and [hidden] contains cells that were removed. Undoing reverses both:
/// removes [revealed] and restores [hidden].
///
/// See also:
/// * [VttState.commitShadow], which creates this action.
/// * [VttState.shadowMode], the flag that enables shadow painting.
class ShadowCommitAction extends UndoAction {
  /// Cells that were newly revealed by the commit.
  final Set<int> revealed;

  /// Cells that were newly hidden by the commit.
  final Set<int> hidden;

  /// Creates a [ShadowCommitAction] with the committed cell changes.
  ShadowCommitAction(this.revealed, this.hidden);
}
