// Spray, mist and bubble particles. CPU integrated (gravity, drag, water
// impact) and drawn as soft lit sprites in a single draw call.
import * as THREE from 'three';
import { softSprite } from '../util/textures.js';

const VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute float aType;
uniform float uScale;
varying float vAlpha; varying float vType;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha; vType = aType;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uUnder;
varying float vAlpha; varying float vType;
void main(){
  float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
  if (a < 0.004) discard;
  vec3 col = uSun * 0.85 + uAmb * 0.6;
  if (vType > 1.5) { // bubble: bright rim
    vec2 c = gl_PointCoord - 0.5; float r = length(c);
    a = smoothstep(0.5, 0.38, r) * (0.35 + smoothstep(0.25, 0.42, r)) * vAlpha;
    col = uUnder * 0.6 + vec3(0.7, 0.95, 1.0) * 0.6;
  }
  gl_FragColor = vec4(col, a);
}`;

export class Spray {
  constructor(max = 5000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.type = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.alive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aType', new THREE.BufferAttribute(this.type, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = {
      uTex: { value: softSprite() },
      uScale: { value: 600 },
      uSun: { value: new THREE.Color(1, 1, 1) },
      uAmb: { value: new THREE.Color(0.5, 0.6, 0.7) },
      uUnder: { value: new THREE.Color(0.1, 0.4, 0.45) },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geo = g;
  }

  // type 0 spray droplet cluster, 1 mist, 2 bubble
  emit(x, y, z, vx, vy, vz, life, size, type = 0, jitter = 0.5) {
    if (this.alive >= this.max) return;
    const i = this.alive++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx + (Math.random() - 0.5) * jitter * 2;
    this.vel[i * 3 + 1] = vy + (Math.random() - 0.5) * jitter;
    this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * jitter * 2;
    this.life[i] = 0;
    this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
    this.size0[i] = size * (0.6 + Math.random() * 0.8);
    this.type[i] = type;
  }

  update(dt, waterHeight) {
    let n = this.alive;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      const t = this.type[i];
      const i3 = i * 3;
      let dead = this.life[i] > this.maxLife[i];
      if (!dead) {
        if (t < 0.5) { // droplets: ballistic with drag
          this.vel[i3 + 1] -= 9.81 * dt;
          const k = Math.exp(-dt * 0.9);
          this.vel[i3] *= k; this.vel[i3 + 2] *= k;
        } else if (t < 1.5) { // mist: floats, slows fast, rises a little
          const k = Math.exp(-dt * 2.2);
          this.vel[i3] *= k; this.vel[i3 + 2] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k + dt * 0.4;
        } else { // bubble: buoyant
          this.vel[i3 + 1] += dt * 3.0;
          const k = Math.exp(-dt * 3.0);
          this.vel[i3] *= k; this.vel[i3 + 2] *= k; this.vel[i3 + 1] *= Math.exp(-dt * 0.8);
        }
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (t < 0.5 && this.vel[i3 + 1] < 0 && this.life[i] > 0.1) {
          const wh = waterHeight(this.pos[i3], this.pos[i3 + 2]);
          if (this.pos[i3 + 1] < wh) dead = true;
        }
        if (t > 1.5) {
          const wh = waterHeight(this.pos[i3], this.pos[i3 + 2]);
          if (this.pos[i3 + 1] > wh - 0.05) dead = true;
        }
      }
      if (dead) {
        n--;
        if (i !== n) {
          // swap with last
          this.pos[i3] = this.pos[n * 3]; this.pos[i3 + 1] = this.pos[n * 3 + 1]; this.pos[i3 + 2] = this.pos[n * 3 + 2];
          this.vel[i3] = this.vel[n * 3]; this.vel[i3 + 1] = this.vel[n * 3 + 1]; this.vel[i3 + 2] = this.vel[n * 3 + 2];
          this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.size0[i] = this.size0[n]; this.type[i] = this.type[n];
          i--;
        }
        continue;
      }
      const f = this.life[i] / this.maxLife[i];
      const tt = this.type[i];
      if (tt < 0.5) { this.size[i] = this.size0[i] * (0.6 + f * 1.4); this.alpha[i] = (1 - f) * 0.55; }
      else if (tt < 1.5) { this.size[i] = this.size0[i] * (1 + f * 3); this.alpha[i] = Math.sin(Math.PI * Math.min(1, f * 1.4)) * 0.22; }
      else { this.size[i] = this.size0[i]; this.alpha[i] = (1 - f) * 0.8; }
    }
    this.alive = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aType']) {
      const a = this.geo.attributes[k];
      a.needsUpdate = true;
      a.clearUpdateRanges?.();
      a.addUpdateRange?.(0, n * a.itemSize);
    }
  }
}
