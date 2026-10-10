import 'dart:math';
import 'dart:ui';

import 'package:flame/components.dart';
import 'package:flutter/painting.dart' show RadialGradient;

import '../../state/vtt_state.dart';

/// Renders animated light halos for map light sources.
///
/// Iterates over [UvttLight] entries in the loaded map and draws radial
/// gradient circles with a flickering opacity driven by a sine wave.
/// The glow uses [BlendMode.screen] for additive blending, producing a
/// natural warm halo on top of the map image.
///
/// Controlled by [SessionSettings.lightAnimations] -- when disabled,
/// [render] returns immediately.
///
/// See also:
/// - [UvttLight], the light source data from the parsed `.dd2vtt` file.
/// - [VttGame], which creates this component at priority 8.
class TorchGlowComponent extends PositionComponent {
  /// The shared VTT game state.
  final VttState state;

  /// Number of image pixels per grid square.
  final double pixelsPerGrid;

  /// Elapsed time used for flicker animation.
  double _time = 0;

  /// Creates a [TorchGlowComponent] for rendering light halos.
  ///
  /// [state] provides access to the loaded map and its light sources.
  /// [pixelsPerGrid] converts grid coordinates to pixel positions.
  /// [mapSize] sets the component bounds.
  TorchGlowComponent({
    required this.state,
    required this.pixelsPerGrid,
    required Vector2 mapSize,
  }) : super(size: mapSize, priority: 8);

  @override
  void update(double dt) {
    _time += dt;
  }

  @override
  void render(Canvas canvas) {
    if (!state.sessionSettings.lightAnimations) return;
    if (state.map == null) return;

    final lights = state.map!.lights;
    for (int i = 0; i < lights.length; i++) {
      final light = lights[i];
      final pos = Offset(
        light.position.x * pixelsPerGrid,
        light.position.y * pixelsPerGrid,
      );
      final radius = light.range * pixelsPerGrid;

      // Flicker opacity varies with time using a sine wave.
      // Each light gets a unique phase offset (i * 1.7) for variety.
      final flickerOpacity =
          (0.15 + sin(_time * 3.0 + i * 1.7) * 0.04) * light.intensity;

      final gradient = RadialGradient(
        colors: [
          light.color.withValues(alpha: flickerOpacity.clamp(0.0, 1.0)),
          light.color.withValues(alpha: 0),
        ],
        stops: const [0.0, 1.0],
      );

      final paint = Paint()
        ..shader =
            gradient.createShader(Rect.fromCircle(center: pos, radius: radius))
        ..blendMode = BlendMode.screen;

      canvas.drawCircle(pos, radius, paint);
    }
  }
}
