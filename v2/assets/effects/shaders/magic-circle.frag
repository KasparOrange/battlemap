#version 300 es
// Magic circle — turns the rings of a circle texture at different speeds (inner, middle and outer
// bands each have their own) and lets the glow breathe. One texture fetch, no frames.
// Use: a PixiJS v8 Filter on the circle's Sprite (the sprite already turns as a whole if the
// manifest says motion.rotate; this adds counter-turning bands). Cost: Graphics A.
// Uniforms (battlemap): uTime · uBands = radii (0..1 of the circle) where bands split (x<y<z) ·
// uSpeeds = degrees per second for the 4 bands, inside → out · uPulse 0..1 · uPeriod s.
// Pixi: uInputClamp. Pick band radii in the circle's empty gaps, so no drawn line is cut.
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform float uTime;
uniform vec4 uBands;
uniform vec4 uSpeeds;
uniform float uPulse;
uniform float uPeriod;

void main(void) {
  vec2 local = vTextureCoord * uInputSize.xy;          // px inside the filter frame
  vec2 c = uOutputFrame.zw * 0.5;
  vec2 d = local - c;
  float r = length(d) / (min(uOutputFrame.z, uOutputFrame.w) * 0.5);
  float speed = r < uBands.x ? uSpeeds.x : (r < uBands.y ? uSpeeds.y : (r < uBands.z ? uSpeeds.z : uSpeeds.w));
  float a = radians(speed * mod(uTime, 3600.0));
  float ca = cos(a), sa = sin(a);
  vec2 rd = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
  vec2 uv = clamp((c + rd) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  float glow = 1.0 + uPulse * 0.5 * sin(6.2831 * uTime / max(uPeriod, 0.1));
  finalColor = texture(uTexture, uv) * glow;
}
