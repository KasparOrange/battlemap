import 'package:flame/components.dart';

import '../../state/vtt_state.dart';
import 'token_component.dart';

/// Container for token components. Diffs against VttState to efficiently
/// add, remove, and update individual token components.
class TokenLayer extends Component {
  final VttState state;
  final double cellSize;

  TokenLayer({
    required this.state,
    required this.cellSize,
  }) : super(priority: 4);

  /// Sync token components to match current VttState.tokens.
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
        ));
      }
    }
  }
}
