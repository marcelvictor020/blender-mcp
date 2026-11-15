// Post FX for the KAGERŌ opening — one extra ShaderPass appended after the engine's own passes (bloom + final grade).
// It works in display space (after the engine's sRGB encode) so 2D cards keep their exact palette.
//
// Per-segment spec (timeline `fx:` field, and/or a segment instance's `fx(t)` method):
//   { grade: 'golden'|'dusk'|'night'|'blood'|'none', gradeMix: 0..1,
//     ca, glitch, glitchSeed, invert, bw, flash, flashColor:'#fff', fade, shake,
//     speed, speedCenter:[x,y], speedColor:'#fff', speedInner, grain, vignette, crt, power, haze, blood,
//     keys:    { param: [[t, v], [t, v], ...] }      // piecewise-linear keyframes in segment-local seconds (hold ends)
//     impacts: [{ t, kind:'invert'|'bw'|'flash'|'black', len }]   // single-frame hits (len default 1/24 s)
//     glitchHits: [{ t, amt, len }]                  // glitch bursts (decaying)
//     shakeHits:  [{ t, amt, len }] }                // camera-shake bursts (decaying)
//   or a function (lt, dur) => spec.
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const FRAME = 1 / 24;
export const BPM = 160, BEAT = 60 / BPM, BAR = BEAT * 4;

// Grades are display-space lift/gamma/gain + saturation/contrast (+ optional red duotone for 'blood').
export const GRADES = {
  none:   { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], sat: 1, contrast: 1, blood: 0 },
  golden: { lift: [0.03, 0.012, -0.01], gamma: [1.04, 1.0, 0.92], gain: [1.08, 1.0, 0.84], sat: 1.15, contrast: 1.06, blood: 0 },
  dusk:   { lift: [0.04, 0.0, 0.08], gamma: [1.0, 0.94, 1.04], gain: [1.02, 0.86, 0.96], sat: 1.05, contrast: 1.08, blood: 0 },
  night:  { lift: [0.0, 0.02, 0.07], gamma: [0.9, 0.95, 1.08], gain: [0.72, 0.84, 1.05], sat: 0.85, contrast: 1.12, blood: 0 },
  blood:  { lift: [0.06, 0.0, 0.0], gamma: [1.1, 0.85, 0.85], gain: [1.12, 0.55, 0.5], sat: 1.25, contrast: 1.2, blood: 0.55 },
};

export const FX_DEFAULTS = {
  grade: 'none', gradeMix: 1, ca: 0, glitch: 0, glitchSeed: 0, invert: 0, bw: 0, flash: 0, flashColor: '#ffffff', fade: 0,
  shake: 0, speed: 0, speedCenter: [0.5, 0.5], speedColor: '#ffffff', speedInner: 0.28, grain: 0.0, vignette: 0,
  crt: 0, power: 0, haze: 0, blood: null,
};

/* ---------- keyframe helpers ---------- */
export function keyed(keys, t) {
  if (!keys || !keys.length) return undefined;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t < keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const f = (t - t0) / Math.max(1e-6, t1 - t0);
      return Array.isArray(v0) ? v0.map((x, k) => x + (v1[k] - x) * f) : v0 + (v1 - v0) * f;
    }
  }
  return keys[keys.length - 1][1];
}
/** local times of a beat grid inside a segment: every `step` beats, offset `off` beats (global grid). */
export function beatTimes(segStart, dur, step = 1, off = 0) {
  const out = []; const s = step * BEAT;
  let g = Math.ceil((segStart - off * BEAT - 1e-6) / s) * s + off * BEAT;
  for (; g < segStart + dur - 1e-6; g += s) out.push(+(g - segStart).toFixed(4));
  return out;
}
/** snare hits (beats 2 & 4 of each bar) in segment-local time */
export const snares = (segStart, dur) => beatTimes(segStart, dur, 2, 1);
const decay = (t, t0, len) => (t < t0 || t > t0 + len) ? 0 : 1 - (t - t0) / len;

/** merge base spec(s) + keys + pulses into a flat parameter object */
export function resolveFx(specs, lt, dur) {
  const P = { ...FX_DEFAULTS };
  for (let s of specs) {
    if (!s) continue;
    if (typeof s === 'function') s = s(lt, dur);
    if (!s) continue;
    for (const k in s) if (k !== 'keys' && k !== 'impacts' && k !== 'glitchHits' && k !== 'shakeHits' && s[k] !== undefined) P[k] = s[k];
    if (s.keys) for (const k in s.keys) { const v = keyed(s.keys[k], lt); if (v !== undefined) P[k] = v; }
    if (s.impacts) for (const im of s.impacts) {
      const len = im.len ?? FRAME * 1.01;
      if (lt >= im.t && lt < im.t + len) {
        const kind = im.kind || 'invert';
        if (kind === 'invert') P.invert = 1; else if (kind === 'bw') P.bw = 1; else if (kind === 'black') P.fade = 1;
        else if (kind === 'flash') { P.flash = Math.max(P.flash, im.amt ?? 1); if (im.color) P.flashColor = im.color; }
      }
    }
    if (s.glitchHits) for (const g of s.glitchHits) { const d = decay(lt, g.t, g.len ?? 0.18); if (d > 0) { P.glitch = Math.max(P.glitch, (g.amt ?? 1) * d); P.ca = Math.max(P.ca, 0.012 * d * (g.amt ?? 1)); P.glitchSeed = Math.floor(lt * 24) + g.t * 13; } }
    if (s.shakeHits) for (const g of s.shakeHits) { const d = decay(lt, g.t, g.len ?? 0.3); if (d > 0) P.shake = Math.max(P.shake, (g.amt ?? 1) * d * d); }
  }
  if (P.glitch > 0 && !P.glitchSeed) P.glitchSeed = Math.floor(lt * 24);
  return P;
}

/* ---------- the shader ---------- */
const FxShader = {
  uniforms: {
    tDiffuse: { value: null }, tOverlay: { value: null }, uOverlay: { value: 0 },
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uContrast: { value: 1 }, uGradeMix: { value: 0 }, uBlood: { value: 0 },
    uCA: { value: 0 }, uGlitch: { value: 0 }, uSeed: { value: 0 }, uInvert: { value: 0 }, uBW: { value: 0 },
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 }, uShake: { value: new THREE.Vector2() },
    uSpeed: { value: 0 }, uSpeedC: { value: new THREE.Vector2(0.5, 0.5) }, uSpeedCol: { value: new THREE.Color(1, 1, 1) }, uSpeedIn: { value: 0.28 },
    uGrain: { value: 0 }, uVignette: { value: 0 }, uCRT: { value: 0 }, uPower: { value: 0 }, uHaze: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tOverlay; uniform float uOverlay, uTime, uSat, uContrast, uGradeMix, uBlood, uCA, uGlitch, uSeed, uInvert, uBW,
      uFlash, uFade, uSpeed, uSpeedIn, uGrain, uVignette, uCRT, uPower, uHaze;
    uniform vec2 uRes, uShake, uSpeedC; uniform vec3 uLift, uGamma, uGain, uFlashCol, uSpeedCol; varying vec2 vUv;
    float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
    float h2(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec4 src(vec2 uv){
      vec4 c = texture2D(tDiffuse, uv);
      if (uOverlay > 0.5) { vec4 o = texture2D(tOverlay, uv); c.rgb = c.rgb * (1.0 - o.a) + o.rgb; }
      return c;
    }
    void main(){
      vec2 sv = vUv, uv = vUv;
      float asp = uRes.x / uRes.y;
      // CRT curvature
      if (uCRT > 0.0) { vec2 cc = uv * 2.0 - 1.0; vec2 off = cc.yx * cc.yx * 0.06 * uCRT; cc += cc * off; uv = cc * 0.5 + 0.5; }
      // power-off: squeeze to a line, then to a dot
      float py = 1.0, px = 1.0;
      if (uPower > 0.0) { py = mix(1.0, 0.004, smoothstep(0.0, 0.45, uPower)); px = mix(1.0, 0.0, smoothstep(0.45, 0.9, uPower)); uv = (uv - 0.5) / vec2(max(px, 1e-3), py) + 0.5; }
      uv += uShake;
      // heat haze shimmer
      if (uHaze > 0.0) uv += vec2(sin(uv.y * 60.0 + uTime * 9.0) * 0.0018, sin(uv.x * 40.0 + uTime * 7.0) * 0.0012) * uHaze;
      // horizontal glitch slices
      float gl = 0.0;
      if (uGlitch > 0.0) {
        float rows = 18.0 + floor(h1(uSeed) * 30.0);
        float band = floor(uv.y * rows);
        float r = h2(vec2(band, uSeed));
        if (r < uGlitch * 0.55) { gl = 1.0; uv.x += (h2(vec2(band * 3.1, uSeed + 7.0)) - 0.5) * 0.22 * uGlitch; }
        float fine = floor(uv.y * 180.0);
        uv.x += (h2(vec2(fine, uSeed * 1.7)) - 0.5) * 0.008 * uGlitch;
      }
      vec2 d = (uv - 0.5);
      float ca = uCA + gl * 0.018 * uGlitch;
      vec2 cao = d * uCA + vec2(gl * 0.018 * uGlitch, 0.0);
      vec3 c;
      c.r = src(uv + cao).r; c.g = src(uv).g; c.b = src(uv - cao).b;
      // grade
      vec3 g = c * uGain + uLift * (1.0 - c);
      g = pow(max(g, 0.0), 1.0 / uGamma);
      g = (g - 0.5) * uContrast + 0.5;
      float l = dot(g, vec3(0.299, 0.587, 0.114));
      g = mix(vec3(l), g, uSat);
      c = mix(c, g, uGradeMix);
      if (uBlood > 0.0) {
        float L = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 duo = mix(vec3(0.05, 0.0, 0.01), vec3(0.62, 0.03, 0.05), smoothstep(0.0, 0.45, L));
        duo = mix(duo, vec3(1.0, 0.78, 0.62), smoothstep(0.62, 1.0, L));
        c = mix(c, duo, uBlood);
      }
      // radial speed lines
      if (uSpeed > 0.0) {
        vec2 p = (sv - uSpeedC) * vec2(asp, 1.0);
        float a = atan(p.y, p.x) / 6.28318 + 0.5, rr = length(p);
        float k = 220.0; float id = floor(a * k);
        float n = h2(vec2(id, floor(uTime * 24.0)));
        float w = fract(a * k);
        float line = step(0.62, n) * smoothstep(0.5, 0.15, abs(w - 0.5) * (1.0 + n));
        line *= smoothstep(uSpeedIn * (0.7 + 0.6 * h2(vec2(id, 3.0))), uSpeedIn * 1.9 + 0.2, rr);
        c = mix(c, uSpeedCol, clamp(line * uSpeed, 0.0, 1.0));
      }
      // impact frames
      if (uBW > 0.0) { float L = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(c, vec3(step(0.42, L)), uBW); }
      c = mix(c, 1.0 - c, uInvert);
      c = mix(c, uFlashCol, clamp(uFlash, 0.0, 1.0));
      // CRT scanlines / mask / edge
      if (uCRT > 0.0) {
        float sl = 0.5 + 0.5 * sin(sv.y * uRes.y * 3.14159 * 0.5);
        c *= 1.0 - uCRT * 0.22 * sl;
        float m = mod(floor(sv.x * uRes.x), 3.0);
        vec3 mask = vec3(m < 0.5 ? 1.08 : 0.96, m > 0.5 && m < 1.5 ? 1.08 : 0.96, m > 1.5 ? 1.08 : 0.96);
        c *= mix(vec3(1.0), mask, uCRT * 0.6);
        vec2 e = smoothstep(vec2(0.0), vec2(0.012), uv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - uv);
        c *= e.x * e.y;
        vec2 cc = sv * 2.0 - 1.0; c *= 1.0 - uCRT * 0.35 * pow(dot(cc * vec2(0.8, 1.0), cc * vec2(0.8, 1.0)) * 0.5, 1.5);
      }
      if (uPower > 0.0) {
        vec2 q = (sv - 0.5);
        float inside = step(abs(q.y), py * 0.5) * step(abs(q.x), px * 0.5);
        c = mix(c, vec3(1.0), smoothstep(0.1, 0.45, uPower) * 0.85);
        c *= inside;
        float dot0 = smoothstep(0.02, 0.0, length(q * vec2(asp, 1.0))) * smoothstep(0.86, 0.9, uPower) * (1.0 - smoothstep(0.92, 1.0, uPower));
        c += vec3(dot0);
      }
      if (uVignette > 0.0) { float v = smoothstep(0.85, 0.2, length((sv - 0.5) * vec2(1.0, 0.8))); c *= mix(1.0 - uVignette, 1.0, v); }
      c += (h2(sv * uRes + fract(uTime) * 137.0) - 0.5) * uGrain;
      c *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createFx(engine) {
  const pass = new ShaderPass(FxShader);
  engine.composer.addPass(pass);
  const u = pass.uniforms;
  u.uRes.value.set(engine.w, engine.h);
  const tmp = new THREE.Color();
  return {
    pass,
    apply(P, time, overlayTex) {
      const G = GRADES[P.grade] || GRADES.none;
      u.uLift.value.set(...G.lift); u.uGamma.value.set(...G.gamma); u.uGain.value.set(...G.gain);
      u.uSat.value = G.sat; u.uContrast.value = G.contrast; u.uGradeMix.value = P.grade === 'none' ? 0 : P.gradeMix;
      u.uBlood.value = (P.blood ?? G.blood) * (P.grade === 'blood' ? P.gradeMix : 1);
      u.uCA.value = P.ca; u.uGlitch.value = P.glitch; u.uSeed.value = P.glitchSeed % 1000;
      u.uInvert.value = P.invert; u.uBW.value = P.bw; u.uFlash.value = P.flash; u.uFlashCol.value.set(P.flashColor); u.uFade.value = P.fade;
      const sk = P.shake * 0.012;
      u.uShake.value.set(sk * (Math.sin(time * 91.7) + Math.sin(time * 53.1) * 0.5), sk * (Math.cos(time * 77.3) + Math.sin(time * 41.9) * 0.5));
      u.uSpeed.value = P.speed; u.uSpeedC.value.set(...P.speedCenter); u.uSpeedCol.value.copy(tmp.set(P.speedColor)); u.uSpeedIn.value = P.speedInner;
      u.uGrain.value = P.grain; u.uVignette.value = P.vignette; u.uCRT.value = P.crt; u.uPower.value = P.power; u.uHaze.value = P.haze;
      u.uTime.value = time;
      u.tOverlay.value = overlayTex || null; u.uOverlay.value = overlayTex ? 1 : 0;
    },
  };
}
