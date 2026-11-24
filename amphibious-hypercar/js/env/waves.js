// Gerstner wave model shared by the GPU ocean shader and the CPU physics.
// The exact same parameters feed both so buoyancy matches what you see.
import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

export const NW = 8;
const G = 9.81;

// lambda (m), amplitude at sea state 1 (m), heading offset (rad), crest sharpness
const SPECTRUM = [
  [52.0, 0.42, -0.25, 0.20],
  [33.5, 0.28, 0.38, 0.17],
  [21.0, 0.17, -0.58, 0.14],
  [13.4, 0.105, 0.16, 0.11],
  [8.6, 0.062, 0.72, 0.09],
  [5.5, 0.038, -0.32, 0.07],
  [3.6, 0.022, 0.48, 0.06],
  [2.3, 0.013, -0.78, 0.05],
];

export class WaveModel {
  constructor() {
    const rnd = mulberry32(42);
    this.mainHeading = -Math.PI / 2 + 0.25; // swell rolls toward the coast (-z), slightly from SW
    this.waves = SPECTRUM.map(([lambda, amp, off, sharp]) => {
      const k = (2 * Math.PI) / lambda;
      return { lambda, baseAmp: amp, off, sharp, k, omega: Math.sqrt(G * k), phase: rnd() * Math.PI * 2, dx: 0, dz: 0, amp: 0, qa: 0 };
    });
    this.uA = Array.from({ length: NW }, () => new THREE.Vector4());
    this.uB = Array.from({ length: NW }, () => new THREE.Vector4());
    this.setSeaState(0.42);
  }

  setSeaState(s) {
    this.seaState = s;
    const ampScale = 0.12 + 1.4 * s;
    const sharpScale = 0.45 + 0.75 * s;
    this.waves.forEach((w, i) => {
      const h = this.mainHeading + w.off;
      w.dx = Math.cos(h); w.dz = Math.sin(h);
      w.amp = w.baseAmp * ampScale;
      // horizontal excursion: Q*A, with sum(Q k A) kept < 1 to avoid loops
      w.qa = (w.sharp * sharpScale) / w.k;
      this.uA[i].set(w.dx, w.dz, w.k, w.amp);
      this.uB[i].set(w.omega, w.phase, w.qa, w.lambda);
    });
  }

  // Displacement of an undisplaced surface point. atten scales all waves.
  displace(x0, z0, t, atten, out) {
    let dx = 0, dy = 0, dz = 0;
    for (const w of this.waves) {
      const th = w.k * (w.dx * x0 + w.dz * z0) - w.omega * t + w.phase;
      const c = Math.cos(th), s = Math.sin(th);
      const qa = w.qa * atten * Math.min(1, w.amp * w.k * 4);
      dx += w.dx * qa * c;
      dz += w.dz * qa * c;
      dy += w.amp * atten * s;
    }
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  // Surface height at a world (x,z) – inverts the horizontal displacement.
  heightAt(x, z, t, atten = 1) {
    const d = _d;
    let x0 = x, z0 = z;
    for (let i = 0; i < 3; i++) {
      this.displace(x0, z0, t, atten, d);
      x0 = x - d.x; z0 = z - d.z;
    }
    this.displace(x0, z0, t, atten, d);
    return d.y;
  }

  // Height, normal and orbital water velocity at a world point.
  sample(x, z, t, atten, out) {
    const d = _d;
    let x0 = x, z0 = z;
    for (let i = 0; i < 3; i++) {
      this.displace(x0, z0, t, atten, d);
      x0 = x - d.x; z0 = z - d.z;
    }
    let h = 0, sx = 0, sz = 0, vx = 0, vy = 0, vz = 0;
    for (const w of this.waves) {
      const th = w.k * (w.dx * x0 + w.dz * z0) - w.omega * t + w.phase;
      const c = Math.cos(th), s = Math.sin(th);
      const a = w.amp * atten;
      h += a * s;
      sx += w.dx * w.k * a * c; // dh/dx
      sz += w.dz * w.k * a * c;
      const qa = w.qa * atten * Math.min(1, w.amp * w.k * 4);
      vx += w.dx * qa * w.omega * s;
      vz += w.dz * qa * w.omega * s;
      vy += -a * w.omega * c;
    }
    out.height = h;
    out.nx = -sx; out.ny = 1; out.nz = -sz;
    const l = Math.hypot(out.nx, 1, out.nz);
    out.nx /= l; out.ny /= l; out.nz /= l;
    out.vx = vx; out.vy = vy; out.vz = vz;
    return out;
  }
}
const _d = { x: 0, y: 0, z: 0 };

// GLSL implementation; mirrors WaveModel.displace and derivatives.
export const WAVE_GLSL = /* glsl */ `
#define NW ${NW}
uniform vec4 uWaveA[NW]; // dir.x, dir.z, k, amplitude
uniform vec4 uWaveB[NW]; // omega, phase, Q*A, lambda
uniform float uTime;

// distFade: distance from camera, spacing: vertex/pixel footprint in metres
vec3 gerstnerDisplace(vec2 p, float atten, float footprint) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < NW; i++) {
    vec4 a = uWaveA[i]; vec4 b = uWaveB[i];
    float fade = 1.0 - smoothstep(b.w * 0.25, b.w * 0.5, footprint);
    float th = a.z * dot(a.xy, p) - b.x * uTime + b.y;
    float c = cos(th), s = sin(th);
    float qa = b.z * atten * min(1.0, a.w * a.z * 4.0) * fade;
    d.x += a.x * qa * c;
    d.z += a.y * qa * c;
    d.y += a.w * atten * s * fade;
  }
  return d;
}

// Returns normal; jac receives the horizontal Jacobian (crest compression).
vec3 gerstnerNormal(vec2 p, float atten, float footprint, out float jac, out float crest) {
  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  crest = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 a = uWaveA[i]; vec4 b = uWaveB[i];
    float fade = 1.0 - smoothstep(b.w * 0.5, b.w * 1.5, footprint);
    float th = a.z * dot(a.xy, p) - b.x * uTime + b.y;
    float c = cos(th), s = sin(th);
    float A = a.w * atten * fade;
    float QA = b.z * atten * min(1.0, a.w * a.z * 4.0) * fade;
    float kA = a.z * A, kQA = a.z * QA;
    dPdx.x -= a.x * a.x * kQA * s;
    dPdx.y += a.x * kA * c;
    dPdx.z -= a.x * a.y * kQA * s;
    dPdz.x -= a.x * a.y * kQA * s;
    dPdz.y += a.y * kA * c;
    dPdz.z -= a.y * a.y * kQA * s;
    crest += s * A;
  }
  jac = dPdx.x * dPdz.z - dPdx.z * dPdz.x;
  return normalize(cross(dPdz, dPdx));
}
`;
