import 'package:flame/components.dart';

import '../../state/vtt_state.dart';
import 'token_component.dart';

/// Container for token components. Diffs against VttState to efficiently
/// add, remove, and update individual token components.
///
/// When [sync] is called, it compares the current Flame children against
/// [VttState.tokens] and performs the minimal set of operations:
/// - Removes components whose tokens no longer exist in state.
/// - Updates existing components whose tokens have changed position,
///   name, HP, conditions, or appearance.
/// - Creates new components for tokens that appeared since the last sync.
///
/// See also:
/// - [TokenComponent], the Flame component for a single token.
/// - [VttState.tokens], the source of truth for token data.
class TokenLayer extends Component {
  /// The shared VTT state containing the authoritative token list.
  final VttState state;

  /// Size of one grid cell in world pixels (used to position tokens).
  final double cellSize;

  /// Creates a [TokenLayer] with the given [state] and [cellSize].
  ///
  /// The layer is rendered at priority 4 (above strokes, below walls).
  TokenLayer({
    required this.state,
    required this.cellSize,
  }) : super(priority: 4);

  /// Synchronizes token components to match current [VttState.tokens].
  ///
  /// Performs a diff between the Flame component children and the state's
  /// token list, then adds, removes, or updates components as needed.
  /// Each [TokenComponent] receives the full set of fields from its
  /// corresponding [MapToken]: label, color, position, name, HP, and
  /// conditions.
  void sync() {
    final stateTokens = state.tokens;
    final stateIds = stateTokens.map((t) => t.id).toSet();

    // Build map of current children by token ID
    final childMap = <String, TokenComponent>{};
    for (final child in children.whereType<TokenComponent>()) {
      childMap[child.tokenId] = child;
    }

    // Remove tokens that no longer exist in state
    for (final entry in childMap.entries) {
      if (!stateIds.contains(entry.key)) {
        entry.value.removeFromParent();
      }
    }

    // Add or update tokens from state
    for (final token in stateTokens) {
      final existing = childMap[token.id];
      if (existing != null) {
        existing.updateFrom(token);
      } else {
        add(TokenComponent(
          tokenId: token.id,
          label: token.label,
          color: token.color,
          gridX: token.gridX,
          gridY: token.gridY,
          cellSize: cellSize,
          name: token.name,
          maxHp: token.maxHp,
          currentHp: token.currentHp,
          conditions: List.of(token.conditions),
        ));
      }
    }
  }
}
