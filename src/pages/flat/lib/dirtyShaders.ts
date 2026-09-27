/** Dirty VFX fragment shader — one layer, hard competition (eat). */
export const DIRTY_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_beat;
uniform float u_energy;
uniform vec2 u_resolution;

// effect enable masks 0/1
uniform float u_enPlasma;
uniform float u_enWave;
uniform float u_enShock;
uniform float u_enLightning;
uniform float u_enParticles;
uniform float u_enSpikes;
uniform float u_enGlitch;
uniform float u_enFlash;

out vec4 outColor;

#define PI 3.14159265359

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += noise(p) * amplitude;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

float ring(vec2 p, float radius, float width) {
  return step(abs(length(p) - radius), width);
}

// Hard eat: higher strength owns the pixel completely
void eat(inout float best, inout vec3 col, float strength, vec3 style) {
  if (strength > best) {
    best = strength;
    col = style;
  }
}

vec3 stylePlasma(vec2 p, float time) {
  float n = fbm(p * 3.0 + vec2(time * 0.15, -time * 0.1));
  float plasma = sin(p.x * 6.0 + n * 7.0 + time);
  plasma += cos(p.y * 8.0 - n * 5.0 - time * 0.5);
  plasma = 0.5 + 0.5 * sin(plasma * 2.0 + u_bass * 0.8);
  // black → violet → electric blue (screenshot Dirty VFX)
  vec3 colorA = vec3(0.02, 0.01, 0.06);
  vec3 colorB = vec3(0.35, 0.02, 0.55);
  vec3 colorC = vec3(0.0, 0.55, 1.0);
  vec3 color = mix(colorA, colorB, plasma);
  return mix(color, colorC, pow(plasma, 4.0 + u_energy));
}

float fieldPlasma(vec2 p, float time) {
  float n = fbm(p * 2.5 + time * 0.08);
  // always present substrate
  return (0.35 + n * 0.2 + u_energy * 0.12) * u_enPlasma;
}

float fieldWaves(vec2 p, float time, out vec3 style) {
  style = vec3(0.0);
  float best = 0.0;
  for (float i = 0.0; i < 7.0; i++) {
    float baseY = (i - 3.0) * 0.15;
    float wave = sin(p.x * (5.0 + i * 1.4) + time * (1.2 + i * 0.2));
    wave += sin(p.x * 13.0 - time * 2.0) * 0.25;
    float amplitude = (0.025 + i * 0.006) * (1.0 + u_bass * 4.0);
    float y = baseY + wave * amplitude;
    float d = abs(p.y - y);
    float width = 0.008 + u_bass * 0.012 + u_mid * 0.006;
    // soft falloff → hard occupancy band
    float s = (1.0 - smoothstep(0.0, width * 2.2, d)) * (0.55 + u_bass * 0.55);
    if (s > best) {
      best = s;
      style = vec3(0.05, 0.25, 1.0);
    }
  }
  return best * u_enWave;
}

float fieldShockwave(vec2 p, out vec3 style) {
  // expanding front eats everything on its ring; radius driven by beat pulse
  float radius = 0.08 + u_beat * 0.55 + u_bass * 0.12;
  float width = 0.01 + u_beat * 0.05;
  float wave = ring(p, radius, width);
  float second = ring(p, radius * 0.65, width * 0.7);
  float s = max(wave, second * 0.85) * (0.4 + u_beat * 2.2);
  style = mix(vec3(0.05, 0.4, 1.0), vec3(1.0, 0.03, 0.5), second);
  // fill disk behind front at lower strength — still eats plasma
  float disk = step(length(p), radius) * (0.22 + u_beat * 0.35) * (1.0 - length(p) / max(radius, 0.001));
  s = max(s, disk);
  style = s == disk && disk > wave ? vec3(0.02, 0.15, 0.45) : style;
  return s * u_enShock;
}

float lightningLine(vec2 p, float seed) {
  float y = p.y;
  float randomOffset = noise(vec2(seed, floor(y * 20.0)));
  float x = sin(y * 12.0 + seed) * 0.08;
  x += (randomOffset - 0.5) * 0.18;
  float d = abs(p.x - x);
  float core = step(d, 0.008 + u_beat * 0.018);
  // thicker eat envelope so bolt carves territory
  float carve = (1.0 - smoothstep(0.0, 0.04 + u_beat * 0.03, d)) * 0.85;
  return max(core, carve);
}

float fieldLightning(vec2 p, float time, out vec3 style) {
  float flash = step(0.35, u_beat);
  float seed = floor(time * 5.0);
  float bolt = lightningLine(p, seed);
  bolt = max(bolt, lightningLine(p + vec2(0.25, 0.0), seed + 10.0) * 0.75);
  bolt = max(bolt, lightningLine(p - vec2(0.28, 0.1), seed + 30.0) * 0.75);
  float s = bolt * flash * (0.7 + u_beat * 2.5);
  style = vec3(0.3, 0.65, 1.0);
  return s * u_enLightning;
}

float fieldParticles(vec2 p, float time, out vec3 style) {
  float best = 0.0;
  style = vec3(0.0);
  for (float i = 0.0; i < 80.0; i++) {
    float id = i + 1.0;
    float angle = hash(id * 2.31) * PI * 2.0;
    float speed = 0.1 + hash(id * 5.17) * 0.8;
    float life = fract(time * 0.45 + hash(id * 7.3));
    float radius = life * speed * (0.25 + u_beat * 1.5 + u_high * 0.4);
    vec2 pp = vec2(cos(angle), sin(angle)) * radius;
    pp.y -= life * life * 0.15;
    float d = length(p - pp);
    float size = 0.004 + hash(id * 9.2) * 0.012;
    // particles expand a small claim disk that eats neighbors
    float claim = (1.0 - smoothstep(0.0, size * (2.5 + u_beat * 3.0), d)) * (1.0 - life);
    claim *= 0.45 + u_beat * 0.8 + u_high * 0.3;
    if (claim > best) {
      best = claim;
      style = mix(vec3(0.1, 0.6, 1.0), vec3(1.0, 0.02, 0.35), hash(id * 3.4));
    }
  }
  return best * u_enParticles;
}

float fieldSpikes(vec2 p, float time, out vec3 style) {
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float spikes = abs(sin(angle * 18.0 + time * 3.0));
  float mask = step(0.9, spikes) * step(0.1, radius) * step(radius, 0.85);
  // spike wedges grow with mid/high and eat strip territory
  float s = mask * (0.35 + u_mid * 0.5 + u_beat * 0.6);
  style = vec3(0.5, 0.02, 0.8);
  return s * u_enSpikes;
}

float fieldGlitch(vec2 uv, float time, out vec3 style) {
  vec2 grid = floor(uv * 45.0);
  float random = hash21(grid + floor(time * 8.0));
  float tear = step(0.93 - u_high * 0.05, random);
  float red = noise(uv * 15.0 + time);
  float green = noise(uv * 15.0 + time + 5.0);
  float blue = noise(uv * 15.0 + time + 10.0);
  style = vec3(red, green, blue);
  // glitch blocks violently overwrite on beat/high
  float s = tear * (0.3 + u_beat * 2.0 + u_high * 0.5);
  return s * u_enGlitch;
}

float fieldFlash(out vec3 style) {
  float flash = step(0.75, u_beat);
  style = vec3(1.0, 0.4, 0.8);
  return flash * (0.95 + u_beat) * u_enFlash;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // dirty low-res grid
  uv = floor(uv * 180.0) / 180.0;

  vec2 p = uv - 0.5;
  p.x *= u_resolution.x / u_resolution.y;

  float time = mod(u_time, 8.0);

  vec3 style;
  float best = -1.0;
  vec3 color = vec3(0.0);

  // order doesn't matter for hard-max; plasma is weak substrate
  float sPlasma = fieldPlasma(p, time);
  style = stylePlasma(p, time);
  eat(best, color, sPlasma, style);

  float sWave = fieldWaves(p, time, style);
  eat(best, color, sWave, style);

  float sPart = fieldParticles(p, time, style);
  eat(best, color, sPart, style);

  float sShock = fieldShockwave(p, style);
  eat(best, color, sShock, style);

  float sBolt = fieldLightning(p, time, style);
  eat(best, color, sBolt, style);

  float sSpike = fieldSpikes(p, time, style);
  eat(best, color, sSpike, style);

  float sGlitch = fieldGlitch(uv, time, style);
  eat(best, color, sGlitch, style);

  float sFlash = fieldFlash(style);
  eat(best, color, sFlash, style);

  // grain (subtle, doesn't change ownership)
  float grain = hash21(floor(uv * 180.0) + floor(time * 20.0));
  color += (grain - 0.5) * 0.08;

  // scanlines
  float scanline = step(0.5, fract(uv.y * 100.0));
  color *= 0.75 + scanline * 0.25;

  // hard quantization
  color = floor(max(color, 0.0) * 9.0) / 9.0;

  outColor = vec4(color, 1.0);
}
`;

export const DIRTY_VERT = /* glsl */ `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
