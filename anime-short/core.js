// Shared engine for the anime-style short: renderer, post, and painterly building blocks.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE, mergeGeometries };

/* ------------------------------------------------------------------ */
/* Deterministic randomness                                            */
/* ------------------------------------------------------------------ */
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const col = (c) => new THREE.Color(c);

/* ------------------------------------------------------------------ */
/* GLSL helpers                                                        */
/* ------------------------------------------------------------------ */
export const NOISE_GLSL = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float vnoise3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
  float e=hash13(i+vec3(0,0,1)), f1=hash13(i+vec3(1,0,1)), g=hash13(i+vec3(0,1,1)), h=hash13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y), mix(mix(e,f1,u.x),mix(g,h,u.x),u.y), u.z); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(17.1,9.2,3.7); a*=.5; } return s; }
`;

/* Shared uniforms that every custom material can reference. */
export const shared = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
  uDapple: { value: 0 },          // 0..1 strength of leaf-shadow dapple on toon surfaces
  uDappleScale: { value: 0.6 },   // world-space frequency of dapple pattern
  uDappleSpeed: { value: 0.15 },
  uDappleCover: { value: 0.5 },   // fraction of surface in shadow
  uFogColor: { value: new THREE.Color('#9cc3e0') },
  uFogNear: { value: 40 },
  uFogFar: { value: 400 },
  uFogMax: { value: 0.0 },
};

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */
const texCache = new Map();
export function canvasTexture(key, w, h, draw, { srgb = true, repeat = false, mips = true } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = mips;
  texCache.set(key, t);
  return t;
}

function leafPath(g, len, wid) {
  g.beginPath();
  g.moveTo(0, -len / 2);
  g.quadraticCurveTo(wid, -len * 0.1, 0, len / 2);
  g.quadraticCurveTo(-wid, -len * 0.1, 0, -len / 2);
  g.closePath();
}

/**
 * Leaf cluster alpha texture. R channel = brightness variation (0.55..1), A = coverage.
 * kind: 'small' (dense clump of small leaves), 'broad' (fewer large leaves w/ midrib), 'round', 'needle'
 */
export function leafTexture(kind = 'small', seed = 1) {
  return canvasTexture('leaf_' + kind + seed, 256, 256, (g, w, h) => {
    const r = rng(seed * 31 + kind.length);
    g.clearRect(0, 0, w, h);
    const cfg = {
      small: { n: 70, len: [22, 38], wid: [9, 15], rad: 0.40 },
      broad: { n: 16, len: [60, 95], wid: [26, 40], rad: 0.33 },
      round: { n: 26, len: [40, 60], wid: [26, 36], rad: 0.36 },
      needle: { n: 90, len: [30, 50], wid: [3, 6], rad: 0.40 },
    }[kind];
    // draw back-to-front: darker leaves first (inner), brighter on top
    const leaves = [];
    for (let i = 0; i < cfg.n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * cfg.rad * w;
      leaves.push({ x: w / 2 + Math.cos(a) * d, y: h / 2 + Math.sin(a) * d, rot: a + Math.PI / 2 + (r() - 0.5) * 1.4,
        len: lerp(cfg.len[0], cfg.len[1], r()), wid: lerp(cfg.wid[0], cfg.wid[1], r()), v: r() });
    }
    leaves.sort((A, B) => A.v - B.v);
    for (const L of leaves) {
      g.save(); g.translate(L.x, L.y); g.rotate(L.rot);
      const v = Math.round(lerp(140, 255, L.v));
      leafPath(g, L.len, L.wid);
      g.fillStyle = `rgb(${v},${v},${v})`; g.fill();
      // darker rim to separate overlapping leaves (painted outline feel)
      g.lineWidth = kind === 'broad' ? 2.5 : 1.5; g.strokeStyle = `rgba(60,60,60,0.9)`; g.stroke();
      if (kind === 'broad' || kind === 'round') {
        g.beginPath(); g.moveTo(0, -L.len * 0.42); g.lineTo(0, L.len * 0.42);
        g.strokeStyle = `rgba(90,90,90,0.6)`; g.lineWidth = 1.5; g.stroke();
        // highlight half
        leafPath(g, L.len * 0.9, L.wid * 0.45); g.save(); g.translate(L.wid * 0.12, 0);
        g.fillStyle = `rgba(255,255,255,${0.18 * L.v})`; g.fill(); g.restore();
      }
      g.restore();
    }
  }, { srgb: false });
}

/** Chain-link fence diamond pattern (alpha). cells = diamonds across the texture. */
export function chainLinkTexture(cells = 8, wire = 2.2) {
  return canvasTexture('chain' + cells + '_' + wire, 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = wire; g.lineCap = 'round';
    const s = w / cells;
    for (let i = -cells; i <= cells * 2; i++) {
      // zig-zag wires
      g.beginPath();
      for (let j = 0; j <= cells * 2; j++) {
        const x = i * s + (j % 2) * s * 0.5, y = j * s * 0.5;
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.beginPath();
      for (let j = 0; j <= cells * 2; j++) {
        const x = i * s + s * 0.5 - (j % 2) * s * 0.5, y = j * s * 0.5;
        if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }, { srgb: false, repeat: true });
}

/** Soft round sprite for motes/glows. */
export function softDotTexture() {
  return canvasTexture('softdot', 64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { srgb: false });
}

/** Butterfly silhouette (single wing pair, symmetric) */
export function butterflyTexture() {
  return canvasTexture('butterfly', 64, 64, (g, w, h) => {
    g.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      g.save(); g.translate(w / 2, h / 2); g.scale(s, 1);
      g.beginPath(); g.ellipse(13, -9, 14, 11, -0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(10, 10, 9, 8, 0.6, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }, { srgb: false });
}

/** Generic painted panel texture helper: draw callback gets (g,w,h,r). */
export function paintTexture(key, w, h, draw, opts) {
  return canvasTexture(key, w, h, (g, W, H) => draw(g, W, H, rng(key.length * 97 + w)), opts);
}

/* ------------------------------------------------------------------ */
/* Toon material (with dappled leaf shadows + painted shadow tint)     */
/* ------------------------------------------------------------------ */
let _grad3;
export function toonGradient(steps = [0.0, 0.55, 1.0]) {
  if (_grad3 && steps.length === 3) return _grad3;
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255); data[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  if (steps.length === 3) _grad3 = t;
  return t;
}

/**
 * Anime toon material. opts: color, map, emissive, dapple (bool, default true), steps, side, transparent, alphaTest, fog(bool)
 */
export function toon(opts = {}) {
  const { color = '#ffffff', map = null, dapple = true, steps, fog = true, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), map, gradientMap: toonGradient(steps), ...rest });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 _wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        vWPos = (modelMatrix * _wp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uTime, uDapple, uDappleScale, uDappleSpeed, uDappleCover, uFogNear, uFogFar, uFogMax;
        uniform vec3 uSunDir, uFogColor;
        ${NOISE_GLSL}
        float dappleMask(vec3 p){
          vec3 L = normalize(uSunDir);
          vec3 t1 = normalize(cross(L, abs(L.y) > 0.9 ? vec3(1,0,0) : vec3(0,1,0)));
          vec3 t2 = cross(L, t1);
          vec2 q = vec2(dot(p, t1), dot(p, t2)) * uDappleScale;
          q += vec2(sin(uTime*0.7 + q.y*0.3), cos(uTime*0.5 + q.x*0.3)) * uDappleSpeed;
          float n = fbm(q) + 0.18 * vnoise(q * 6.0);
          return smoothstep(uDappleCover - 0.03, uDappleCover + 0.03, n);
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        ${dapple ? 'reflectedLight.directDiffuse *= mix(1.0, dappleMask(vWPos), uDapple);' : ''}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        ${fog ? `float _fd = smoothstep(uFogNear, uFogFar, distance(vWPos, cameraPosition)) * uFogMax;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, _fd);` : ''}`);
  };
  m.customProgramCacheKey = () => 'toon' + (dapple ? 'd' : '') + (fog ? 'f' : '');
  return m;
}

/** Flat unlit color/texture material with optional fog. */
export function flat(opts = {}) {
  const { color = '#fff', ...rest } = opts;
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), ...rest });
}

/* ------------------------------------------------------------------ */
/* Sky                                                                  */
/* ------------------------------------------------------------------ */
export function makeSky({ zenith = '#1d7fc4', mid = '#3d9ad6', horizon = '#a8d2ec', haze = 0.25, horizonY = 0.0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { cZ: { value: col(zenith) }, cM: { value: col(mid) }, cH: { value: col(horizon) }, uHaze: { value: haze }, uHY: { value: horizonY } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 cZ, cM, cH; uniform float uHaze, uHY;
      void main(){ float y = clamp(vDir.y - uHY, 0., 1.);
        vec3 c = mix(cH, cM, smoothstep(0., 0.35 + uHaze*0.2, y));
        c = mix(c, cZ, smoothstep(0.3, 1.0, y));
        gl_FragColor = vec4(c, 1.); }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
  return m;
}

/* ------------------------------------------------------------------ */
/* Painted cumulus clouds (2D shader billboards)                        */
/* ------------------------------------------------------------------ */
/**
 * makeCloud({ w, h, seed, kind:'cumulus'|'stratus'|'wisp', light, mid, shadow, lightDir:[x,y] (2D, toward light), puffs })
 * Returns a plane mesh (w x h world units) facing +Z. Position/rotate it yourself or set .billboard = true.
 */
export function makeCloud(o = {}) {
  const { w = 100, h = 60, seed = 1, kind = 'cumulus', light = '#ffffff', mid = '#e3e8f0', shadow = '#9fb0c8',
    lightDir = [0.3, 0.9], puffs = null, opacity = 1, edge = 0.06, detail = 1.0, billboard = false } = o;
  const r = rng(seed);
  const blobs = [];
  const A = w / h;
  if (puffs) puffs.forEach(p => blobs.push(new THREE.Vector3(...p)));
  else if (kind === 'cumulus') {
    // dome of lobes over a flat base. x in plane-width units (-0.5..0.5), y & radius in plane-height units
    const n = 30;
    for (let i = 0; i < n; i++) {
      const x = lerp(-0.36, 0.36, r());
      const xn = x / 0.4;
      const top = -0.12 + 0.48 * Math.max(0, 1 - xn * xn) * lerp(0.75, 1.0, r());
      const y = lerp(-0.18, top, Math.pow(r(), 0.7));
      const rad = lerp(0.07, 0.15, r()) * lerp(0.7, 1.0, 1 - Math.abs(xn));
      blobs.push(new THREE.Vector3(x, y, rad));
    }
  } else if (kind === 'stratus') {
    for (let i = 0; i < 26; i++) blobs.push(new THREE.Vector3(lerp(-0.4, 0.4, r()), lerp(-0.1, 0.1, r()), lerp(0.08, 0.18, r())));
  } else { // wisp
    for (let i = 0; i < 20; i++) blobs.push(new THREE.Vector3(lerp(-0.42, 0.42, r()), lerp(-0.06, 0.06, r()), lerp(0.05, 0.12, r())));
  }
  while (blobs.length < 32) blobs.push(new THREE.Vector3(9, 9, 0.0001));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uBlobs: { value: blobs.slice(0, 32) }, uSeed: { value: seed * 1.37 }, uAspect: { value: A },
      cL: { value: col(light) }, cM: { value: col(mid) }, cS: { value: col(shadow) }, uLD: { value: new THREE.Vector2(...lightDir).normalize() },
      uOpacity: { value: opacity }, uEdge: { value: edge }, uKind: { value: kind === 'cumulus' ? 0 : kind === 'stratus' ? 1 : 2 },
      uDetail: { value: detail }, uTime: shared.uTime,
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uBlobs[32]; uniform float uSeed, uAspect, uOpacity, uEdge, uDetail, uTime; uniform int uKind;
      uniform vec3 cL, cM, cS; uniform vec2 uLD;
      ${NOISE_GLSL}
      float dens(vec2 p){
        vec2 q = p * vec2(uAspect, 1.0);
        float d = -1.0;
        for(int i=0;i<32;i++){ vec3 b = uBlobs[i]; vec2 bp = b.xy * vec2(uAspect,1.0);
          float k = 1. - length(q - bp)/b.z; d = max(d, k); }
        float n = fbm(q*4.0*uDetail + uSeed + vec2(uTime*0.004, 0.)) - 0.5;
        float n2 = vnoise(q*18.*uDetail + uSeed*3.) - 0.5;
        d += n*0.55 + n2*0.12;
        if (uKind == 0) d -= smoothstep(-0.12, -0.24, p.y) * 1.2; // flat base
        float e = smoothstep(0.5, 0.40, abs(p.x)) * smoothstep(0.5, 0.40, abs(p.y));
        return d - (1.0 - e) * 1.5;
      }
      void main(){
        vec2 p = vUv - 0.5;
        float d = dens(p);
        float a = smoothstep(0.0, uEdge, d);
        if (a < 0.01) discard;
        float e = 0.012;
        vec2 g = vec2(dens(p + vec2(e,0.)) - dens(p - vec2(e,0.)), dens(p + vec2(0.,e)) - dens(p - vec2(0.,e))) / (2.0*e);
        vec3 N = normalize(vec3(-g * 0.10, 1.0));
        vec3 L = normalize(vec3(uLD, 0.55));
        float lit = dot(N, L) * 0.5 + 0.5;
        lit += clamp(d, 0., 1.) * 0.10;                              // dense core slightly brighter (scattering)
        lit -= smoothstep(0.1, -0.25, p.y) * (uKind==0 ? 0.28 : 0.1); // bottoms darker
        vec3 c = mix(cS, cM, smoothstep(0.42, 0.52, lit));
        c = mix(c, cL, smoothstep(0.62, 0.72, lit));
        gl_FragColor = vec4(c, a * uOpacity);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  if (billboard) m.onBeforeRender = (r2, s, cam) => m.quaternion.copy(cam.quaternion);
  m.renderOrder = -5;
  return m;
}

/* ------------------------------------------------------------------ */
/* Painterly foliage (billboard leaf cards lit with spherical normals)  */
/* ------------------------------------------------------------------ */
/**
 * makeFoliage({ clumps: [[x,y,z,r], ...], density (cards per unit^2 of clump surface), cardSize, kind, seed,
 *   dark, mid, light, highlight, rimColor, wind, fog (0..1 aerial perspective), shell (0..1 how close to surface cards sit) })
 * Returns an InstancedMesh. Cards billboard toward the camera.
 */
export function makeFoliage(o = {}) {
  const { clumps = [[0, 0, 0, 1]], density = 8, cardSize = 0.6, kind = 'small', seed = 1,
    dark = '#1f4a3a', mid = '#3d7f3e', light = '#8cc252', highlight = '#d3ea7a', wind = 0.03, fog = 0,
    fogColor = null, shell = 0.75, texSeed = 1, maxCards = 20000, sizeJitter = 0.5, ambient = 0.0, terminator = 0.0,
    rimStrength = 0.0, lightWrap = 0.35, flatten = 1.0 } = o;
  const r = rng(seed);
  const items = [];
  for (const c of clumps) {
    const [cx, cy, cz, cr] = c;
    const area = 4 * Math.PI * cr * cr;
    const n = Math.max(6, Math.round(area * density / (cardSize * cardSize)));
    for (let i = 0; i < n; i++) {
      // random point on/within sphere surface shell
      let x, y, z, l;
      do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
      l = Math.sqrt(l); x /= l; y /= l; z /= l;
      const d = lerp(shell, 1.0, Math.sqrt(r())) * cr;
      items.push([cx + x * d, cy + y * d * flatten, cz + z * d, cx, cy, cz, cr, r(), lerp(1 - sizeJitter, 1 + sizeJitter * 0.5, r())]);
    }
  }
  const count = Math.min(items.length, maxCards);
  const geo = new THREE.PlaneGeometry(1, 1);
  const aC = new Float32Array(count * 4), aP = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const it = items[i];
    aP.set([it[0], it[1], it[2], it[8] * cardSize], i * 4);
    aC.set([it[3], it[4], it[5], it[6]], i * 4);
    aC[i * 4 + 3] = it[6] + it[7] * 0.0001 * 0; // radius
  }
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
  ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4));
  const rnd = new Float32Array(count); for (let i = 0; i < count; i++) rnd[i] = items[i][7];
  ig.setAttribute('aR', new THREE.InstancedBufferAttribute(rnd, 1));
  ig.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tLeaf: { value: leafTexture(kind, texSeed) }, cD: { value: col(dark) }, cM: { value: col(mid) }, cL: { value: col(light) }, cH: { value: col(highlight) },
      uWind: { value: wind }, uFog: { value: fog }, cFog: { value: fogColor ? col(fogColor) : shared.uFogColor.value },
      uAmb: { value: ambient }, uTerm: { value: terminator }, uRim: { value: rimStrength }, uWrap: { value: lightWrap },
      uTime: shared.uTime, uSunDir: shared.uSunDir,
    },
    vertexShader: `attribute vec4 aP; attribute vec4 aC; attribute float aR; uniform float uTime, uWind;
      varying vec2 vUv; varying vec3 vN; varying float vR, vDepth, vAO;
      void main(){
        vUv = uv;
        vec3 center = aP.xyz;
        float sway = sin(uTime*1.3 + aR*6.28 + center.x*0.4) + 0.5*sin(uTime*2.1 + center.z*0.7);
        center += vec3(sway, 0.3*sway, 0.6*sway) * uWind * aP.w;
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        float ang = aR * 6.2831;
        vec2 cs = vec2(cos(ang), sin(ang));
        vec2 off = mat2(cs.x, cs.y, -cs.y, cs.x) * position.xy * aP.w;
        mv.xy += off;
        gl_Position = projectionMatrix * mv;
        vec3 n = normalize(center - aC.xyz);
        // add a bit of card-local curvature in view space -> world
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vN = normalize(n + (camR*off.x + camU*off.y) / max(aP.w,0.001) * 0.6);
        vN = normalize((modelMatrix * vec4(vN,0.)).xyz);
        vR = aR;
        vAO = clamp(length(center - aC.xyz) / aC.w, 0., 1.);
        vDepth = -mv.z;
      }`,
    fragmentShader: `uniform sampler2D tLeaf; uniform vec3 cD, cM, cL, cH, cFog, uSunDir; uniform float uFog, uAmb, uTerm, uRim, uWrap;
      varying vec2 vUv; varying vec3 vN; varying float vR, vDepth, vAO;
      void main(){
        vec4 t = texture2D(tLeaf, vUv);
        if (t.a < 0.5) discard;
        float ndl = dot(normalize(vN), normalize(uSunDir));
        float l = (ndl + uWrap) / (1. + uWrap);
        l = l * (0.55 + 0.45 * t.r) + (vR - 0.5) * 0.18 + uTerm;
        l *= mix(0.55, 1.0, smoothstep(0.55, 1.0, vAO));
        vec3 c = mix(cD, cM, smoothstep(0.18, 0.26, l));
        c = mix(c, cL, smoothstep(0.48, 0.56, l));
        c = mix(c, cH, smoothstep(0.80, 0.86, l) * 0.85);
        c *= mix(0.72, 1.0, t.r) ;
        c += uAmb;
        c = mix(c, cFog, uFog);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(ig, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Convenience: build a tree = trunk + foliage clumps scattered in an ellipsoid canopy. */
export function makeTree(o = {}) {
  const { x = 0, y = 0, z = 0, height = 8, canopy = [4, 3.5, 4], clumpCount = 9, clumpR = [1.4, 2.2], seed = 1,
    trunkColor = '#4a3a2e', trunkR = 0.25, foliage = {} } = o;
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR, height * 0.75, 8), toon({ color: trunkColor }));
  trunk.position.set(x, y + height * 0.375, z); g.add(trunk);
  const clumps = [];
  const cy = y + height - canopy[1] * 0.6;
  for (let i = 0; i < clumpCount; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    clumps.push([x + Math.cos(a) * d * canopy[0] * 0.6, cy + (r() - 0.35) * canopy[1] * 0.9, z + Math.sin(a) * d * canopy[2] * 0.6, lerp(clumpR[0], clumpR[1], r())]);
  }
  g.add(makeFoliage({ clumps, seed: seed + 7, ...foliage }));
  return g;
}

/* ------------------------------------------------------------------ */
/* Grass                                                                */
/* ------------------------------------------------------------------ */
/**
 * makeGrass({ x0,x1,z0,z1, y, count, h:[min,max], w, base, tip, dark, seed, wind, patch (scale of colour patches), bend })
 * Instanced tapered blades with painted gradient + large-scale colour patches + wind.
 */
export function makeGrass(o = {}) {
  const { x0 = -10, x1 = 10, z0 = -10, z1 = 10, y = 0, count = 20000, h = [0.5, 1.0], w = 0.08, seed = 3,
    base = '#3f7d2b', tip = '#a6d45a', dark = '#2d5e24', light = '#c8e67a', wind = 0.25, patch = 0.08,
    bend = 0.25, fog = 0, fogColor = null, heightFn = null, lean = [0, 0], shadowSide = 0.0 } = o;
  const r = rng(seed);
  // blade: 3 segments, 7 verts
  const segs = 4; const pos = []; const uvs = []; const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; const ww = (1 - Math.pow(t, 1.5)) * 0.5;
    if (i < segs) { pos.push(-ww, t, 0, ww, t, 0); uvs.push(0, t, 1, t); }
    else { pos.push(0, 1, 0); uvs.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const lastA = (segs - 1) * 2; idx.push(lastA, lastA + 1, segs * 2);
  const ig = new THREE.InstancedBufferGeometry();
  ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const aO = new Float32Array(count * 4), aS = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const px = lerp(x0, x1, r()), pz = lerp(z0, z1, r());
    const py = heightFn ? heightFn(px, pz) : y;
    aO.set([px, py, pz, r() * Math.PI * 2], i * 4);
    aS.set([lerp(h[0], h[1], r()), w * lerp(0.6, 1.3, r()), r(), r()], i * 4);
  }
  ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4));
  ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  ig.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { cB: { value: col(base) }, cT: { value: col(tip) }, cD: { value: col(dark) }, cLi: { value: col(light) },
      uWind: { value: wind }, uPatch: { value: patch }, uBend: { value: bend }, uFog: { value: fog }, cFog: { value: fogColor ? col(fogColor) : shared.uFogColor.value },
      uLean: { value: new THREE.Vector2(...lean) }, uDapple: shared.uDapple, uDappleScale: shared.uDappleScale, uDappleCover: shared.uDappleCover, uDappleSpeed: shared.uDappleSpeed,
      uTime: shared.uTime, uSunDir: shared.uSunDir, uShadowSide: { value: shadowSide } },
    vertexShader: `attribute vec4 aO; attribute vec4 aS; uniform float uTime, uWind, uBend, uPatch; uniform vec2 uLean;
      varying float vT, vP, vR, vSide; varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        float t = position.y; vT = t;
        float c = cos(aO.w), s = sin(aO.w);
        vec3 p = vec3(position.x * aS.y, t * aS.x, 0.);
        p = vec3(p.x*c, p.y, p.x*s);
        float wn = vnoise(aO.xz*0.15 + vec2(uTime*0.35, uTime*0.12));
        float sway = (wn - 0.4) * uWind + sin(uTime*2.3 + aO.x*0.8 + aO.z*0.5) * uWind * 0.25;
        vec2 dir = vec2(1.0, 0.35) * sway + uLean + vec2(aS.z-0.5, aS.w-0.5) * uBend;
        p.xz += dir * t * t * aS.x;
        p.y -= length(dir) * t * t * aS.x * 0.3;
        vec3 w = aO.xyz + p;
        vW = w;
        vP = fbm(aO.xz * uPatch);
        vR = aS.z;
        vSide = position.x;
        vec4 mv = modelViewMatrix * vec4(w, 1.);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 cB, cT, cD, cLi, cFog, uSunDir; uniform float uFog, uDapple, uDappleScale, uDappleCover, uDappleSpeed, uTime, uShadowSide;
      varying float vT, vP, vR, vSide; varying vec3 vW;
      ${NOISE_GLSL}
      float dappleMask(vec3 p){
        vec3 L = normalize(uSunDir);
        vec3 t1 = normalize(cross(L, abs(L.y) > 0.9 ? vec3(1,0,0) : vec3(0,1,0)));
        vec3 t2 = cross(L, t1);
        vec2 q = vec2(dot(p, t1), dot(p, t2)) * uDappleScale;
        q += vec2(sin(uTime*0.7 + q.y*0.3), cos(uTime*0.5 + q.x*0.3)) * uDappleSpeed;
        float n = fbm(q) + 0.18 * vnoise(q * 6.0);
        return smoothstep(uDappleCover - 0.03, uDappleCover + 0.03, n);
      }
      void main(){
        vec3 c = mix(cB, cT, smoothstep(0.0, 1.0, vT));
        float pz = smoothstep(0.35, 0.65, vP);
        c = mix(c * 0.62 + cD * 0.38, c, pz);
        c = mix(c, cLi, smoothstep(0.75, 1.0, vT) * pz * (0.35 + vR*0.4));
        c *= 0.88 + vR * 0.22;
        c *= mix(1.0, 0.8, uShadowSide * step(0.0, vSide));
        float dm = mix(1.0, mix(0.55, 1.0, dappleMask(vW)), uDapple);
        c *= dm;
        c = mix(c, cFog, uFog);
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false;
  return m;
}

/* ------------------------------------------------------------------ */
/* Wires, poles, misc props                                             */
/* ------------------------------------------------------------------ */
export function makeWire(a, b, { sag = 0.6, radius = 0.025, color = '#1b1b22', segments = 40 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; const p = A.clone().lerp(B, t); p.y -= sag * 4 * t * (1 - t); pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 5, false), new THREE.MeshBasicMaterial({ color: col(color) }));
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
}
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m;
}

/** Floating dust motes / pollen (additive points) */
export function makeMotes({ count = 60, box: B = [[-5, 0, -5], [5, 5, 5]], size = 0.05, color = '#fff6d8', opacity = 0.7, seed = 9, speed = 0.15 } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([lerp(B[0][0], B[1][0], r()), lerp(B[0][1], B[1][1], r()), lerp(B[0][2], B[1][2], r())], i * 3); ph[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSize: { value: size }, uCol: { value: col(color) }, uOp: { value: opacity }, uSpeed: { value: speed }, tDot: { value: softDotTexture() } },
    vertexShader: `attribute float aPh; uniform float uTime, uSize, uSpeed; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime*0.5*uSpeed*6.+aPh)*0.3, sin(uTime*0.3+aPh*1.7)*0.2 + uTime*uSpeed*0.3, cos(uTime*0.4+aPh)*0.3);
        vec4 mv = modelViewMatrix * vec4(p,1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * 800.0 / -mv.z; vA = 0.5 + 0.5*sin(uTime*1.5 + aPh*3.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uOp; uniform sampler2D tDot; varying float vA;
      void main(){ float a = texture2D(tDot, gl_PointCoord).a; gl_FragColor = vec4(uCol * 1.5, a * uOp * (0.4 + 0.6*vA)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; return p;
}

/** Small glowing butterflies that flutter in a box. */
export function makeButterflies({ count = 12, box: B = [[-3, 0, -3], [3, 3, 3]], size = 0.12, color = '#ffd34d', seed = 5, speed = 1, glow = 1.6 } = {}) {
  const r = rng(seed);
  const geo = new THREE.PlaneGeometry(1, 1);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
  const aB = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) aB.set([lerp(B[0][0], B[1][0], r()), lerp(B[0][1], B[1][1], r()), lerp(B[0][2], B[1][2], r()), r() * 100], i * 4);
  ig.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4)); ig.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSize: { value: size }, uCol: { value: col(color) }, uSpeed: { value: speed }, uGlow: { value: glow }, tB: { value: butterflyTexture() } },
    vertexShader: `attribute vec4 aB; uniform float uTime, uSize, uSpeed; varying vec2 vUv;
      void main(){ vUv = uv; float ph = aB.w; float t = uTime*uSpeed;
        vec3 c = aB.xyz + vec3(sin(t*0.6+ph)*0.5 + sin(t*1.7+ph*2.)*0.15, sin(t*0.9+ph*1.3)*0.3 + sin(t*3.1+ph)*0.08, cos(t*0.5+ph)*0.4);
        float flap = 0.25 + 0.75*abs(sin(t*14.0 + ph*5.0));
        vec4 mv = modelViewMatrix * vec4(c,1.);
        mv.xy += vec2(position.x * flap, position.y) * uSize;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tB; uniform vec3 uCol; uniform float uGlow; varying vec2 vUv;
      void main(){ float a = texture2D(tB, vUv).a; if(a<0.4) discard; gl_FragColor = vec4(uCol*uGlow, 1.); }`,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
}

/** Simple directional light rig with toon-friendly ambient. Returns {sun, hemi, amb}. */
export function lightRig(scene, { sunDir = [0.5, 0.7, 0.3], sunColor = '#fff2dc', sunIntensity = 2.6, sky = '#9ec9ff', ground = '#5a6b4a', hemiIntensity = 0.9, ambient = '#3b4a78', ambientIntensity = 0.35, shadows = false, shadowBox = 30, shadowRes = 2048, target = [0, 0, 0] } = {}) {
  const d = new THREE.Vector3(...sunDir).normalize();
  shared.uSunDir.value.copy(d);
  const sun = new THREE.DirectionalLight(col(sunColor), sunIntensity);
  sun.position.copy(d.clone().multiplyScalar(100).add(new THREE.Vector3(...target)));
  sun.target.position.set(...target);
  scene.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true; sun.shadow.mapSize.set(shadowRes, shadowRes);
    const c = sun.shadow.camera; c.left = c.bottom = -shadowBox; c.right = c.top = shadowBox; c.near = 1; c.far = 300;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  }
  const hemi = new THREE.HemisphereLight(col(sky), col(ground), hemiIntensity); scene.add(hemi);
  const amb = new THREE.AmbientLight(col(ambient), ambientIntensity); scene.add(amb);
  return { sun, hemi, amb };
}

/* ------------------------------------------------------------------ */
/* Post-processing                                                      */
/* ------------------------------------------------------------------ */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 }, uContrast: { value: 1.0 }, uSat: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uVignette: { value: 0.25 }, uGrain: { value: 0.035 }, uCA: { value: 0.0015 },
    uLeak: { value: 0.0 }, uLeakPos: { value: new THREE.Vector2(0.95, 0.95) }, uSoft: { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uExposure, uContrast, uSat, uVignette, uGrain, uCA, uLeak, uSoft; uniform vec2 uRes, uLeakPos;
    uniform vec3 uLift, uGamma, uGain; varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 toSRGB(vec3 c){ c = max(c, 0.); return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - 0.055, step(0.0031308, c)); }
    vec3 rainbow(float x){ return clamp(abs(mod(x*6.0+vec3(0.,4.,2.),6.0)-3.0)-1.0, 0., 1.); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + d*uCA).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - d*uCA).b;
      if (uSoft > 0.) { vec2 px = 1.0/uRes; vec3 b = (texture2D(tDiffuse, uv+px*vec2(1.5,0.)).rgb + texture2D(tDiffuse, uv-px*vec2(1.5,0.)).rgb + texture2D(tDiffuse, uv+px*vec2(0.,1.5)).rgb + texture2D(tDiffuse, uv-px*vec2(0.,1.5)).rgb)*0.25; c = mix(c, b, uSoft); }
      c *= uExposure;
      c = toSRGB(c);
      c = c * uGain + uLift * (1.0 - c);
      c = pow(max(c, 0.), 1.0 / uGamma);
      c = (c - 0.5) * uContrast + 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      // rainbow lens leak
      if (uLeak > 0.) { vec2 lp = uv - uLeakPos; float r = length(lp*vec2(uRes.x/uRes.y,1.)); float ring = smoothstep(0.55,0.35,abs(r-0.55)) ; c += rainbow(r*1.4+0.1) * ring * uLeak * 0.35; }
      float v = smoothstep(0.85, 0.2, length(d*vec2(1.0, 0.8)));
      c *= mix(1.0 - uVignette, 1.0, v);
      c += (h(uv*uRes + fract(uTime)*137.) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
    }`,
};

export const DEFAULT_POST = {
  bloom: 0.35, bloomRadius: 0.5, bloomThreshold: 0.85,
  exposure: 1.0, contrast: 1.05, saturation: 1.08,
  lift: [0.0, 0.0, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1],
  vignette: 0.22, grain: 0.03, ca: 0.0012, leak: 0, leakPos: [0.95, 0.95], soft: 0.15,
};

export class Engine {
  constructor(canvas, w, h) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.5, 0.85);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(this.final);
    this.setSize(w, h);
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.final.uniforms.uRes.value.set(w, h);
  }
  applyPost(p) {
    const P = { ...DEFAULT_POST, ...(p || {}) };
    this.bloom.strength = P.bloom; this.bloom.radius = P.bloomRadius; this.bloom.threshold = P.bloomThreshold;
    const u = this.final.uniforms;
    u.uExposure.value = P.exposure; u.uContrast.value = P.contrast; u.uSat.value = P.saturation;
    u.uLift.value.set(...P.lift); u.uGamma.value.set(...P.gamma); u.uGain.value.set(...P.gain);
    u.uVignette.value = P.vignette; u.uGrain.value = P.grain; u.uCA.value = P.ca; u.uLeak.value = P.leak; u.uLeakPos.value.set(...P.leakPos);
    u.uSoft.value = P.soft;
  }
  render(scene, camera, time) {
    camera.aspect = this.w / this.h; camera.updateProjectionMatrix();
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    this.final.uniforms.uTime.value = time;
    this.composer.render();
  }
}
