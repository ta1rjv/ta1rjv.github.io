// GLSL sources as template strings. Written in GLSL ES 1.00 style;
// three.js converts them for WebGL2 automatically.

// ---------------------------------------------------------------------------
// Fullscreen background: black hole (raymarched, Schwarzschild approximation),
// event-horizon door and volumetric-looking nebula.
// ---------------------------------------------------------------------------
export const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform vec2  uMouse;
uniform float uTime;
uniform float uP;
uniform float uDist;
uniform float uAz;
uniform float uEl;
uniform float uShift;
uniform float uFade;
uniform float uDoor;
uniform float uFlash;
uniform float uNebAmt;
uniform float uFlight;
uniform float uGap;
uniform int   uSteps;
uniform int   uOct;
uniform int   uLayers;

#define RIN  3.0
#define ROUT 9.5

float hash31(vec3 p) {
  p = 50.0 * fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uOct) break;
    s += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

// One layer of procedural point stars on a direction vector.
vec3 starLayer(vec3 d, float scale, float density, float size, float seed) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 f = fract(p);
  float h = hash31(id + seed);
  if (h > density) return vec3(0.0);
  vec3 o = vec3(hash31(id + seed + 7.1), hash31(id + seed + 13.7), hash31(id + seed + 21.3));
  float dd = length(f - (0.2 + 0.6 * o));
  float m = smoothstep(size, 0.0, dd);
  float b = hash31(id + seed + 31.7);
  vec3 c = mix(vec3(1.0, 0.62, 0.35), vec3(0.55, 0.72, 1.0), hash31(id + seed + 41.1));
  c = mix(c, vec3(1.0), 0.4);
  return c * m * m * (0.4 + 3.0 * b * b);
}

vec3 sky(vec3 d) {
  vec3 c = starLayer(d, 38.0, 0.22, 0.16, 0.0);
  c += starLayer(d, 75.0, 0.18, 0.15, 3.0) * 0.8;
  c += starLayer(d, 140.0, 0.12, 0.2, 9.0) * 0.6;
  float band = dot(d, normalize(vec3(0.35, 0.8, 0.5)));
  float bw = exp(-band * band * 18.0);
  float cl = fbm(d * 6.0 + 3.0);
  c += vec3(0.55, 0.40, 0.33) * bw * cl * cl * 0.35 + vec3(0.10, 0.15, 0.30) * bw * 0.05;
  return c;
}

vec3 diskColor(float t) {
  vec3 c0 = vec3(0.90, 0.12, 0.02);
  vec3 c1 = vec3(1.00, 0.45, 0.08);
  vec3 c2 = vec3(1.00, 0.78, 0.42);
  vec3 c3 = vec3(1.00, 0.95, 0.85);
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.35, t));
  c = mix(c, c2, smoothstep(0.3, 0.7, t));
  c = mix(c, c3, smoothstep(0.65, 1.2, t));
  return c;
}

// Rs = 1. Light bends as a = -1.5 * h^2 * r / |r|^5 (photon sphere at 1.5 Rs).
vec3 blackHole(vec2 uv) {
  vec3 ro = uDist * vec3(cos(uEl) * sin(uAz), sin(uEl), cos(uEl) * cos(uAz));
  vec3 fwd = normalize(-ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(uv.x * right + uv.y * up + fwd * 1.6);

  vec3 pos = ro;
  vec3 vel = rd;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float b = sqrt(h2);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  bool absorbed = false;
  bool escaped = false;

  for (int i = 0; i < 160; i++) {
    if (i >= uSteps) break;
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) { absorbed = true; break; }
    if (r > 45.0 && dot(pos, vel) > 0.0) { escaped = true; break; }
    float dt = clamp(0.1 * r, 0.02, 1.5);
    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vel = normalize(vel + acc * dt);
    vec3 np = pos + vel * dt;

    if (pos.y * np.y < 0.0 && trans > 0.01) {
      float tt = pos.y / (pos.y - np.y);
      vec3 hp = mix(pos, np, tt);
      float rr = length(hp.xz);
      if (rr > RIN && rr < ROUT) {
        float T = pow(RIN / rr, 0.75);
        float om = pow(RIN / rr, 1.5);
        float ang = atan(hp.z, hp.x) - uTime * 0.45 * om;
        vec2 q = rr * vec2(cos(ang), sin(ang));
        float n = fbm(vec3(q * 1.1, rr * 0.35));
        float rings = 0.55 + 0.45 * sin(rr * 14.0 + n * 5.0);
        float dens = smoothstep(RIN, RIN + 0.5, rr) * (1.0 - smoothstep(ROUT - 3.0, ROUT, rr));
        dens *= (0.25 + 1.1 * n) * (0.6 + 0.7 * rings);
        // Doppler beaming plus gravitational redshift.
        float vm = 1.0 * sqrt(0.5 / rr);
        vec3 vo = vec3(-hp.z, 0.0, hp.x) / rr * vm;
        float gr = sqrt(max(1.0 - 1.0 / rr, 0.05));
        float g = gr / (1.0 + dot(vel, vo));
        float I = pow(T, 3.0) * 1.7 * pow(g, 2.2) * dens;
        col += trans * diskColor(T * g * 0.65) * I;
        trans *= 1.0 - clamp(dens * 0.8, 0.0, 0.97);
      }
    }
    pos = np;
  }

  if (!absorbed && !escaped && length(pos) < 2.5) absorbed = true;

  if (!absorbed) {
    // Photon ring: rays grazing the critical impact parameter (about 2.598 Rs).
    if (b >= 2.598) {
      col += trans * vec3(1.0, 0.75, 0.5) * 1.0 * exp(-(b - 2.598) * 55.0);
    }
    col += trans * sky(normalize(vel)) * 0.9;
  }
  return col;
}

vec3 nebula(vec2 uv) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    if (k >= uLayers) break;
    float fk = float(k);
    float sc = 1.1 + fk * 0.9;
    vec3 p = vec3(uv * sc + vec2(fk * 3.7, fk * 1.9), uFlight * (0.6 + 0.5 * fk) + uTime * 0.02);
    vec2 q = vec2(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)));
    float f = fbm(p + 2.2 * vec3(q, 0.5));
    vec3 c = mix(vec3(0.02, 0.03, 0.14), vec3(0.42, 0.10, 0.78), smoothstep(0.25, 0.75, f));
    c = mix(c, vec3(0.08, 0.72, 1.0), smoothstep(0.35, 0.95, q.x) * 0.75);
    c = mix(c, vec3(1.0, 0.42, 0.22), smoothstep(0.55, 1.0, q.y * f * 1.6) * 0.55);
    float dens = smoothstep(0.25, 0.95, f);
    acc += c * dens * (1.15 - 0.45 * fk);
  }
  float lum = dot(acc, vec3(0.299, 0.587, 0.114));
  acc = mix(vec3(lum), acc, 0.6) * 0.5;
  acc += starLayer(vec3(uv * 0.7, 0.5), 40.0, 0.2, 0.15, 5.0) * 0.5;
  return acc;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= uRes.x / uRes.y;
  uv -= uMouse * 0.03;

  vec3 col = vec3(0.0);

  if (uP < 0.41) {
    vec2 b = uv;
    b.x -= uShift;
    col = blackHole(b) * uFade;
  }

  // Slowly converging faint white stars while inside the horizon (screen stays black).
  if (uGap > 0.001) {
    vec3 gc = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      float ph = fract(uTime * 0.07 + 0.5 * float(i));
      float zoom = mix(0.5, 2.2, ph);
      gc += starLayer(vec3(uv * zoom, float(i) * 4.3), 16.0, 0.4, 0.26, 11.0 + float(i)) * sin(3.14159 * ph);
    }
    // Very faint white points only; the gap itself stays black.
    float gl = dot(gc, vec3(0.3333));
    col += vec3(gl) * 1.1 * uGap;
  }

  if (uP > 0.39) {
    float w = max(uDoor * 0.75, 0.015);
    float h = 0.30 + uDoor * 1.1;
    float dd = length(vec2(uv.x / w, uv.y / h));
    float edge = 1.0 - dd;
    float mask = smoothstep(0.0, 0.05, edge);
    vec3 neb = nebula(uv) * uNebAmt;
    vec3 light = vec3(1.0, 0.82, 0.58);
    float openness = 1.0 - smoothstep(0.6, 2.8, uDoor);
    float rimK = 1.0 - smoothstep(3.0, 4.4, uDoor);
    // Nebula seen through the door with a soft warm glow hugging the rim.
    vec3 inner = neb + light * exp(-max(edge, 0.0) * 7.0) * openness * 0.55;
    col = mix(col, inner, mask);
    // Bright expanding rim.
    col += light * exp(-abs(edge) * 16.0) * rimK * 1.3;
    col += light * uFlash * exp(-length(uv) * 3.0) * 1.0;
  }

  // Soft shoulder so nothing can clip to a flat white wash.
  col *= 1.25;
  col = col / (1.0 + 0.5 * col);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Post pass: chromatic aberration, radial star-streak blur, vignette.
// ---------------------------------------------------------------------------
export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uCA;
uniform float uStreak;
uniform float uVig;
varying vec2 vUv;

void main() {
  vec2 c = vUv - 0.5;
  vec3 col = vec3(0.0);
  if (uStreak > 0.002) {
    const int N = 12;
    for (int i = 0; i < N; i++) {
      float s = float(i) / float(N - 1);
      float sc = 1.0 - uStreak * s;
      col.r += texture2D(tDiffuse, 0.5 + c * sc * (1.0 + uCA)).r;
      col.g += texture2D(tDiffuse, 0.5 + c * sc).g;
      col.b += texture2D(tDiffuse, 0.5 + c * sc * (1.0 - uCA)).b;
    }
    col /= float(N);
  } else {
    col.r = texture2D(tDiffuse, 0.5 + c * (1.0 + uCA)).r;
    col.g = texture2D(tDiffuse, 0.5 + c).g;
    col.b = texture2D(tDiffuse, 0.5 + c * (1.0 - uCA)).b;
  }
  col *= 1.0 - uVig * smoothstep(0.35, 0.95, length(c) * 1.25);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// 3D star field (Points) with size attenuation.
// ---------------------------------------------------------------------------
export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aTw;
uniform float uPR;
uniform float uVis;
uniform float uTime;
uniform float uScale;
varying vec3 vC;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = -mv.z;
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale * uPR / max(dist, 0.5);
  gl_PointSize = clamp(s, 2.0 * uPR, 30.0 * uPR);
  vA = uVis * smoothstep(0.5, 6.0, dist) * (1.0 - smoothstep(300.0, 520.0, dist))
     * (0.78 + 0.22 * sin(uTime * aTw + aTw * 10.0));
  vC = aColor;
}
`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vC * 2.2, a * vA);
}
`;

// Motion streaks: a head vertex at the star and a tail displaced along -z (view axis)
// by a length proportional to scroll velocity.
export const STREAK_VERT = /* glsl */ `
attribute float aEnd;
attribute vec3 aColor;
uniform float uVis;
uniform float uStreakLen;
varying vec3 vC;
varying float vA;
void main() {
  vec3 p = position;
  p.z -= aEnd * uStreakLen;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  gl_Position = projectionMatrix * mv;
  vA = uVis * smoothstep(0.5, 6.0, dist) * (1.0 - smoothstep(300.0, 520.0, dist)) * (1.0 - aEnd) * 0.9;
  vC = aColor;
}
`;

export const STREAK_FRAG = /* glsl */ `
varying vec3 vC;
varying float vA;
void main() {
  gl_FragColor = vec4(vC * 2.0, vA);
}
`;
