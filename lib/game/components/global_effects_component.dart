import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';

import '../../state/vtt_state.dart';
import '../vtt_game.dart';

/// Renders full-screen dramatic effects triggered by the DM.
///
/// Supports five effect types:
/// - `'flash'` -- a white flash that fades out over 0.3 seconds.
/// - `'shake'` -- rapid camera vibration for 0.6 seconds.
/// - `'fade'` -- fade to black, hold, then fade back over 3 seconds.
/// - `'pulse'` -- an expanding golden ring from the center (1.5 seconds).
/// - `'danger'` -- a red flash that fades out over 0.4 seconds.
///
/// This component sits at priority 30 (above everything) so its
/// overlays cover the entire game canvas. Shake modifies the camera
/// position directly and restores it when complete.
///
/// Controlled by [SessionSettings.globalEffects] -- when disabled,
/// [triggerEffect] does nothing.
///
/// See also:
/// - [VttGame.triggerEffect], the public API that delegates here.
/// - [DmCallbacks.onTriggerEffect], the DM panel callback.
class GlobalEffectsComponent extends PositionComponent {
  /// The shared VTT game state.
  final VttState state;

  /// Reference to the parent game for camera manipulation (shake).
  final VttGame game;

  /// The currently playing effect name, or `null` if idle.
  String? _activeEffect;

  /// Elapsed time into the current effect.
  double _effectTime = 0;

  /// Total duration of the current effect in seconds.
  double _effectDuration = 0;

  /// Camera position saved before a shake effect, restored on completion.
  Vector2? _savedCameraPos;

  /// Creates a [GlobalEffectsComponent] for rendering dramatic overlays.
  ///
  /// [state] provides access to session settings.
  /// [game] is needed for camera manipulation during shake effects.
  /// [mapSize] sets the component bounds to cover the entire map.
  GlobalEffectsComponent({
    required this.state,
    required this.game,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 30);

  /// Starts playing the named [effect].
  ///
  /// If [SessionSettings.globalEffects] is disabled, this is a no-op.
  /// Any currently playing effect is replaced.
  ///
  /// Supported effects: `'flash'`, `'shake'`, `'fade'`, `'pulse'`, `'danger'`.
  void triggerEffect(String effect) {
    if (!state.sessionSettings.globalEffects) return;
    _activeEffect = effect;
    _effectTime = 0;
    _effectDuration = switch (effect) {
      'flash' => 0.3,
      'shake' => 0.6,
      'fade' => 3.0,
      'pulse' => 1.5,
      'danger' => 0.4,
      _ => 0.5,
    };
    if (effect == 'shake') {
      _savedCameraPos = game.camera.viewfinder.position.clone();
    }
  }

  @override
  void update(double dt) {
    if (_activeEffect == null) return;
    _effectTime += dt;

    // Apply camera shake offset
    if (_activeEffect == 'shake' && _savedCameraPos != null) {
      final offset = sin(_effectTime * 40) * 5;
      game.camera.viewfinder.position =
          _savedCameraPos! + Vector2(offset, offset * 0.7);
    }

    // Effect complete -- clean up
    if (_effectTime >= _effectDuration) {
      if (_activeEffect == 'shake' && _savedCameraPos != null) {
        game.camera.viewfinder.position = _savedCameraPos!;
        _savedCameraPos = null;
      }
      _activeEffect = null;
    }
  }

  @override
  void render(Canvas canvas) {
    if (_activeEffect == null) return;
    final t = (_effectTime / _effectDuration).clamp(0.0, 1.0);
    final rect = size.toRect();

    switch (_activeEffect) {
      case 'flash':
        // White flash that fades out
        final opacity = (1.0 - t) * 0.8;
        canvas.drawRect(
          rect,
          Paint()..color = Color.fromRGBO(255, 255, 255, opacity),
        );

      case 'danger':
        // Red flash that fades out
        final opacity = (1.0 - t) * 0.4;
        canvas.drawRect(
          rect,
          Paint()..color = Color.fromRGBO(200, 0, 0, opacity),
        );

      case 'fade':
        // Fade to black (0-0.33: fade in, 0.33-0.66: hold, 0.66-1.0: fade out)
        double opacity;
        if (t < 0.33) {
          opacity = t / 0.33;
        } else if (t < 0.66) {
          opacity = 1.0;
        } else {
          opacity = 1.0 - (t - 0.66) / 0.34;
        }
        canvas.drawRect(
          rect,
          Paint()..color = Color.fromRGBO(0, 0, 0, opacity.clamp(0.0, 1.0)),
        );

      case 'pulse':
        // Golden ring expanding from center
        final radius = t * size.x * 0.6;
        final opacity = (1.0 - t) * 0.5;
        canvas.drawCircle(
          Offset(size.x / 2, size.y / 2),
          radius,
          Paint()
            ..color = Color.fromRGBO(212, 167, 106, opacity)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 8.0 * (1.0 - t) + 2.0,
        );

      case 'shake':
        // Shake is camera-only, no overlay rendering needed
        break;
    }
  }
}
