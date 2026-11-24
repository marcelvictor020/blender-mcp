// Mediterranean coastline: cliffs, a marina cove, sea bed, winding coastal road.
// Provides both the render mesh and analytic/baked queries for physics.
import * as THREE from 'three';
import { Simplex2, curve1D, smoothstep, clamp, lerp } from '../util/noise.js';
import { roadTextures } from '../util/textures.js';

const N1 = new Simplex2(2024);
const N2 = new Simplex2(77);
const N3 = new Simplex2(5150);

// Sea lies toward +z. shoreZ(x) gives the z of the waterline.
const shoreZ = curve1D([
  [-3200, 150], [-1500, 120], [-1100, 160], [-850, 90], [-650, 62], [-540, 30], [-470, -10], [-410, -22],
  [-350, -2], [-290, 28], [-220, 34], [-165, 8], [-135, -28], [-115, -38], [155, -38], [185, -18],
  [228, 36], [268, 92], [330, 122], [430, 100], [560, 152], [700, 118], [850, 172], [1000, 140],
  [1300, 200], [3200, 180],
]);
const cliffH = curve1D([
  [-3200, 95], [-1500, 88], [-1000, 78], [-720, 64], [-560, 44], [-490, 10], [-390, 8], [-330, 34],
  [-230, 30], [-160, 12], [-120, 3.2], [150, 3.2], [205, 15], [265, 44], [400, 54], [620, 62],
  [900, 74], [1500, 86], [3200, 92],
]);
const cliffW = curve1D([
  [-3200, 34], [-720, 22], [-560, 28], [-490, 120], [-390, 120], [-330, 24], [-170, 40], [-120, 70],
  [150, 70], [205, 30], [265, 14], [620, 18], [3200, 26],
]);

export const SEA_LEVEL = 0;
export const QUAY = { x0: -132, x1: 162, z0: -104, z1: -38, y: 1.4 };
export const SLIPWAY = { x0: -80, x1: -60, zTop: -38, zBot: -4, yTop: 1.4, yBot: -2.7 };
export const PLINTH = { x: 34, z: -64, r: 5.4, h: 0.16 };

// Breakwater spine (used for wave shelter + rock placement)
export const BREAKWATER = [
  [292, 96], [250, 132], [195, 158], [130, 172], [60, 178], [-10, 176], [-48, 168],
];

function cliffiness(x) {
  return smoothstep(14, 36, cliffH(x));
}

// Natural terrain before roads/structures are carved in.
export function naturalHeight(x, z) {
  const sz = shoreZ(x);
  const quayZone = smoothstep(-150, -110, x) * (1 - smoothstep(150, 190, x));
  const jag = (N1.fbm(x * 0.012, 3.1, 3) * 16 + N1.noise(x * 0.05, 1.7) * 4) * (1 - quayZone);
  const s = sz + jag - z; // + inland
  const ch = cliffH(x), cw = cliffW(x);
  const cl = cliffiness(x);
  if (s >= 0) {
    const t = clamp(s / cw, 0, 1);
    const cliffProfile = 1 - Math.pow(1 - t, 3.2);
    const beachProfile = t * t * (3 - 2 * t);
    let h = ch * lerp(beachProfile, cliffProfile, cl);
    // rock buttresses and gullies on the cliff face
    const face = smoothstep(0, 4, s) * (1 - smoothstep(cw * 0.6, cw * 1.4, s));
    h += cl * face * ch * 0.22 * (N2.ridged(x * 0.025, z * 0.025, 5) - 0.45) + cl * face * 3.0 * N3.noise(x * 0.12, z * 0.12);
    // inland hills rising behind the coast
    const inland = Math.max(0, s - cw * 0.8);
    const hillAmp = 38 + 60 * (N1.fbm(x * 0.0011 + 4, z * 0.0011, 3) * 0.5 + 0.5);
    h += smoothstep(0, 520, inland) * hillAmp;
    h += smoothstep(0, 200, inland) * N3.fbm(x * 0.004, z * 0.004, 4) * 14;
    // distant mountain ridge for the horizon
    h += smoothstep(-1400, -3200, z) * (90 + 260 * N2.fbm(x * 0.0006 + 2.0, z * 0.0006, 4) + 120 * N2.ridged(x * 0.0009, z * 0.0009, 3));
    h += N1.fbm(x * 0.03, z * 0.03, 3) * 1.6 * smoothstep(0, 10, s);
    return h;
  }
  const d = -s;
  let depth = 2.4 * (1 - Math.exp(-d / 7)) + 19 * (1 - Math.exp(-d / 160)) + 45 * (1 - Math.exp(-d / 800));
  // rocky reef beneath the cliffs, sand + seagrass mounds elsewhere
  const reef = cl * Math.exp(-d / 45) * (N2.ridged(x * 0.04, z * 0.04, 4) - 0.35) * 7;
  const dunes = N3.fbm(x * 0.02, z * 0.02, 3) * 0.9 * smoothstep(0, 10, d);
  return -depth + reef + dunes;
}

// ---------------------------------------------------------------- road network
const ROAD_XZ = [
  [1000, -336], [880, -282], [770, -214], [660, -160], [560, -112], [455, -80], [362, -76],
  [292, -100], [244, -142], [190, -174], [124, -184], [76, -166], [56, -136], [68, -112], [56, -95],
  [22, -86], [-30, -84], [-96, -86], [-148, -98], [-198, -120], [-260, -138], [-330, -130],
  [-404, -116], [-480, -122], [-566, -104], [-676, -76], [-796, -66], [-940, -92], [-1100, -74],
];
export const ROAD_HALF = 4.5;

class RoadNetwork {
  constructor() {
    const pts = ROAD_XZ.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const len = curve.getLength();
    const n = Math.ceil(len / 1.5);
    this.n = n + 1;
    this.px = new Float32Array(this.n); this.pz = new Float32Array(this.n); this.py = new Float32Array(this.n);
    this.tx = new Float32Array(this.n); this.tz = new Float32Array(this.n);
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n);
      const t = curve.getTangentAt(i / n);
      this.px[i] = p.x; this.pz[i] = p.z;
      const l = Math.hypot(t.x, t.z);
      this.tx[i] = t.x / l; this.tz[i] = t.z / l;
    }
    // heights: follow smoothed natural ground, pinned to quay level, grade-limited
    const raw = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const x = this.px[i], z = this.pz[i];
      let h = naturalHeight(x, z);
      h = Math.max(h, 1.6);
      raw[i] = h;
    }
    const sm = new Float32Array(this.n);
    const W = 26;
    for (let i = 0; i < this.n; i++) {
      let s = 0, c = 0;
      for (let k = -W; k <= W; k++) {
        const j = clamp(i + k, 0, this.n - 1);
        const w = 1 - Math.abs(k) / (W + 1);
        s += raw[j] * w; c += w;
      }
      sm[i] = s / c;
    }
    const onQuay = (i) => this.px[i] > QUAY.x0 + 6 && this.px[i] < QUAY.x1 - 70 && this.pz[i] > QUAY.z0 && this.pz[i] < QUAY.z1;
    for (let i = 0; i < this.n; i++) if (onQuay(i)) sm[i] = QUAY.y + 0.02;
    // grade limit (~11%) by relaxation, keeping quay pins
    const maxStep = 1.5 * 0.11;
    for (let it = 0; it < 200; it++) {
      for (let i = 1; i < this.n; i++) {
        if (onQuay(i)) continue;
        if (sm[i] - sm[i - 1] > maxStep) sm[i] = sm[i - 1] + maxStep;
        if (sm[i - 1] - sm[i] > maxStep) sm[i] = sm[i - 1] - maxStep;
      }
      for (let i = this.n - 2; i >= 0; i--) {
        if (onQuay(i)) continue;
        if (sm[i] - sm[i + 1] > maxStep) sm[i] = sm[i + 1] + maxStep;
        if (sm[i + 1] - sm[i] > maxStep) sm[i] = sm[i + 1] - maxStep;
      }
    }
    // final light smoothing so vertical curves are gentle
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 1; i < this.n - 1; i++) if (!onQuay(i)) sm[i] = (sm[i - 1] + sm[i] * 2 + sm[i + 1]) / 4;
    }
    this.py.set(sm);
    this.length = len;
    // spatial hash
    this.cell = 20;
    this.grid = new Map();
    for (let i = 0; i < this.n - 1; i++) {
      const x0 = Math.min(this.px[i], this.px[i + 1]) - 24, x1 = Math.max(this.px[i], this.px[i + 1]) + 24;
      const z0 = Math.min(this.pz[i], this.pz[i + 1]) - 24, z1 = Math.max(this.pz[i], this.pz[i + 1]) + 24;
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
        for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
          const key = cx * 100003 + cz;
          let arr = this.grid.get(key);
          if (!arr) { arr = []; this.grid.set(key, arr); }
          arr.push(i);
        }
      }
    }
  }

  // nearest point on the road centreline: returns {d, y, i, t, side}
  nearest(x, z, out = {}) {
    const key = Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
    const arr = this.grid.get(key);
    out.d = 1e9; out.y = 0; out.i = -1;
    if (!arr) return out;
    for (const i of arr) {
      const ax = this.px[i], az = this.pz[i], bx = this.px[i + 1], bz = this.pz[i + 1];
      const vx = bx - ax, vz = bz - az;
      const l2 = vx * vx + vz * vz;
      let t = ((x - ax) * vx + (z - az) * vz) / l2;
      t = clamp(t, 0, 1);
      const cx = ax + vx * t, cz = az + vz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < out.d) {
        out.d = d; out.i = i; out.t = t;
        out.y = this.py[i] + (this.py[i + 1] - this.py[i]) * t;
        out.side = Math.sign(vx * (z - az) - vz * (x - ax));
      }
    }
    return out;
  }
}

export const road = new RoadNetwork();

// ---------------------------------------------------------------- composed height
const _rn = {};
function slipwayHeight(x, z) {
  const S = SLIPWAY;
  if (x < S.x0 || x > S.x1 || z < S.zTop - 0.5 || z > S.zBot) return null;
  const t = clamp((z - S.zTop) / (S.zBot - S.zTop), 0, 1);
  return lerp(S.yTop, S.yBot, t);
}

function inQuay(x, z) {
  return x > QUAY.x0 && x < QUAY.x1 && z > QUAY.z0 && z < QUAY.z1;
}

// Height used to build the terrain mesh (roads/quay carved in, slightly below their surfaces)
export function meshHeight(x, z) {
  let h = naturalHeight(x, z);
  // quay flattening with a soft landward blend
  const qx = Math.max(QUAY.x0 - x, 0, x - QUAY.x1);
  const qz = Math.max(QUAY.z0 - z, 0, z - QUAY.z1);
  const qd = Math.hypot(qx, z > QUAY.z1 ? 0 : qz);
  if (z < QUAY.z1 + 0.01) {
    const w = 1 - smoothstep(0, 34, qd);
    h = lerp(h, QUAY.y - 0.25, w);
  }
  road.nearest(x, z, _rn);
  if (_rn.d < 30) {
    const w = 1 - smoothstep(ROAD_HALF + 1.0, ROAD_HALF + 16, _rn.d);
    h = lerp(h, _rn.y - 0.12, w);
  }
  return h;
}

// ---------------------------------------------------------------- grid helpers
function axis(min, max, cMin, cMax, step, growth) {
  const out = [];
  for (let v = cMin; v <= cMax + 1e-6; v += step) out.push(v);
  let s = step, v = cMin;
  const left = [];
  while (v > min) { s *= growth; v -= s; left.push(Math.max(v, min)); }
  s = step; v = out[out.length - 1];
  const right = [];
  while (v < max) { s *= growth; v += s; right.push(Math.min(v, max)); }
  return Float32Array.from([...left.reverse(), ...out, ...right]);
}

function findCell(arr, v) {
  let lo = 0, hi = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[hi]) return hi - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= v) lo = m; else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------- terrain object
export class Terrain {
  constructor() {
    this.xs = axis(-3400, 3400, -1050, 1100, 3.0, 1.11);
    this.zs = axis(-3800, 720, -420, 250, 3.0, 1.11);
    const nx = this.xs.length, nz = this.zs.length;
    this.nx = nx; this.nz = nz;
    this.heights = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      this.heights[j * nx + i] = meshHeight(this.xs[i], this.zs[j]);
    }
    this.mesh = this._buildMesh();
    this.roadMesh = this._buildRoad();
    this._bakeWaterData();
  }

  // bilinear sample of the mesh grid
  gridHeight(x, z) {
    const i = findCell(this.xs, x), j = findCell(this.zs, z);
    const x0 = this.xs[i], x1 = this.xs[i + 1], z0 = this.zs[j], z1 = this.zs[j + 1];
    const tx = clamp((x - x0) / (x1 - x0), 0, 1), tz = clamp((z - z0) / (z1 - z0), 0, 1);
    const H = this.heights, nx = this.nx;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    // match the triangulation (diagonal a-d)
    if (tx > tz) return a + (b - a) * tx + (d - b) * tz;
    return a + (d - c) * tx + (c - a) * tz;
  }

  // drivable ground height (road/quay/slipway/plinth aware)
  groundHeight(x, z) {
    const sw = slipwayHeight(x, z);
    if (sw !== null) return sw;
    if (inQuay(x, z)) {
      const pd = Math.hypot(x - PLINTH.x, z - PLINTH.z);
      if (pd < PLINTH.r) return QUAY.y + PLINTH.h * smoothstep(PLINTH.r, PLINTH.r - 0.6, pd);
      return QUAY.y;
    }
    road.nearest(x, z, _rn);
    if (_rn.d < ROAD_HALF + 0.3) return _rn.y + 0.02;
    if (_rn.d < ROAD_HALF + 1.2) return lerp(_rn.y + 0.02, this.gridHeight(x, z), (_rn.d - ROAD_HALF - 0.3) / 0.9);
    return this.gridHeight(x, z);
  }

  groundNormal(x, z, out) {
    const e = 0.45;
    const hx = this.groundHeight(x + e, z) - this.groundHeight(x - e, z);
    const hz = this.groundHeight(x, z + e) - this.groundHeight(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }

  // ---------------------------------------------------------------- rendering
  _buildMesh() {
    const { xs, zs, nx, nz, heights } = this;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = xs[i]; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = zs[j];
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let p = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = d;
      idx[p++] = a; idx[p++] = d; idx[p++] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uCaustics: { value: 1 },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uCaustics;
${TERRAIN_GLSL}`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
vec3 tN = normalize(vWNrm);
float tRough;
vec3 tAlb = terrainAlbedo(vWPos, tN, tRough);
vec4 diffuseColor = vec4(tAlb, opacity);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 b = terrainBump(vWPos, tN); normal = normalize(normal + (viewMatrix * vec4(b, 0.0)).xyz); }`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
if (vWPos.y < 0.3) {
  float depth = max(0.0, -vWPos.y);
  float cs = caustics(vWPos.xz, uTime) * smoothstep(0.0, 0.6, depth) * exp(-depth * 0.09) * uCaustics;
  float sunUp = clamp(uSunDir.y * 2.0, 0.0, 1.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * cs * 2.2 * sunUp;
}`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    return mesh;
  }

  _buildRoad() {
    const n = road.n;
    const across = [-1, -0.5, 0, 0.5, 1];
    const cols = across.length;
    const pos = new Float32Array(n * cols * 3);
    const uv = new Float32Array(n * cols * 2);
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) v += Math.hypot(road.px[i] - road.px[i - 1], road.pz[i] - road.pz[i - 1]);
      const nxv = -road.tz[i], nzv = road.tx[i];
      for (let c = 0; c < cols; c++) {
        const a = across[c];
        const k = i * cols + c;
        const off = a * ROAD_HALF;
        pos[k * 3] = road.px[i] + nxv * off;
        pos[k * 3 + 1] = road.py[i] + 0.02 - (Math.abs(a) > 0.99 ? 0.015 : 0) + (1 - a * a) * 0.03;
        pos[k * 3 + 2] = road.pz[i] + nzv * off;
        uv[k * 2] = (a + 1) / 2;
        uv[k * 2 + 1] = v / 16;
      }
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // flip if normals point down
    const nrm = geo.attributes.normal;
    if (nrm.getY(2) < 0) {
      const ix = geo.index.array;
      for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
      geo.computeVertexNormals();
    }
    const tex = roadTextures();
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'road';
    return mesh;
  }

  // RG float texture: R = sea-bed height, G = wave attenuation (depth + breakwater shelter)
  _bakeWaterData() {
    const x0 = -1600, z0 = -320, W = 840, H = 420, cell = 4;
    const data = new Float32Array(W * H * 4);
    this.water = { x0, z0, W, H, cell, data };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      let h = naturalHeight(x, z);
      if (inQuay(x, z)) h = Math.max(h, QUAY.y);
      const depth = Math.max(0, -h);
      let att = 0.22 + 0.78 * smoothstep(0.2, 11, depth);
      att *= 1 - 0.82 * this.shelter(x, z);
      const k = (j * W + i) * 4;
      data[k] = h; data[k + 1] = att; data[k + 2] = 0; data[k + 3] = 1;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.waterTex = tex;
    this.waterTexBounds = new THREE.Vector4(x0, z0, W * cell, H * cell);
  }

  shelter(x, z) {
    // distance-weighted shadow behind the breakwater and the eastern headland
    let zb = -1e9;
    for (let i = 0; i < BREAKWATER.length - 1; i++) {
      const [ax, az] = BREAKWATER[i], [bx, bz] = BREAKWATER[i + 1];
      const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
      if (x >= lo && x <= hi) zb = Math.max(zb, az + (bz - az) * (x - ax) / (bx - ax));
    }
    if (zb < -1e8) {
      // beyond the breakwater tip: shelter fades west of the entrance
      if (x < -48) zb = 168 - (-48 - x) * 1.8;
      else zb = 96 + (x - 292) * -2;
    }
    const behind = smoothstep(0, 70, zb - z);
    const east = smoothstep(-140, -30, x) * (1 - smoothstep(300, 340, x));
    return clamp(behind * east, 0, 1);
  }

  waterInfo(x, z) {
    // bilinear lookup into baked water data: [seabed, attenuation]
    const w = this.water;
    const fx = (x - w.x0) / w.cell, fz = (z - w.z0) / w.cell;
    if (fx < 0 || fz < 0 || fx >= w.W - 1 || fz >= w.H - 1) return _wi.set(-60, 1);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const d = w.data, W = w.W;
    const k00 = (j * W + i) * 4, k10 = k00 + 4, k01 = k00 + W * 4, k11 = k01 + 4;
    const bl = (o) => lerp(lerp(d[k00 + o], d[k10 + o], tx), lerp(d[k01 + o], d[k11 + o], tx), tz);
    return _wi.set(bl(0), bl(1));
  }
}
const _wi = new THREE.Vector2();

const TERRAIN_GLSL = /* glsl */ `
float th21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
float tvnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(th21(i), th21(i+vec2(1,0)), u.x), mix(th21(i+vec2(0,1)), th21(i+vec2(1,1)), u.x), u.y);
}
float tfbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*tvnoise(p); p*=2.03; a*=0.5;} return s; }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }

vec3 terrainAlbedo(vec3 wp, vec3 n, out float rough){
  float slope = 1.0 - n.y;
  float h = wp.y;
  float big = tfbm(wp.xz * 0.006 + 11.0);
  float n1 = tfbm(wp.xz * 0.045);
  float n2 = tfbm(wp.xz * 0.21 + 7.0);
  float n3 = tfbm(wp.xz * 1.7);
  // pale limestone with vertical weathering streaks and faint bedding
  float streak = tfbm(vec2(wp.x * 0.35 + wp.z * 0.35, wp.y * 0.04));
  float bed = sin(h * 1.1 + n1 * 3.0) * 0.5 + 0.5;
  vec3 rockA = lin(vec3(0.66, 0.61, 0.53));
  vec3 rockB = lin(vec3(0.42, 0.38, 0.33));
  vec3 rockC = lin(vec3(0.64, 0.50, 0.36));
  vec3 rock = mix(rockB, rockA, smoothstep(0.25, 0.75, streak * 0.8 + n2 * 0.35 + bed * 0.12));
  rock = mix(rock, rockC, smoothstep(0.55, 0.8, n1) * 0.45);
  rock *= 0.82 + 0.28 * n3;
  // macchia (dense dark evergreen) vs garrigue (dry, sparse) mosaic
  vec3 macchia = lin(vec3(0.20, 0.25, 0.13));
  vec3 macchiaL = lin(vec3(0.30, 0.34, 0.18));
  vec3 garrigue = lin(vec3(0.50, 0.47, 0.32));
  vec3 soil = lin(vec3(0.55, 0.43, 0.30));
  float dense = smoothstep(0.38, 0.62, big + (n1 - 0.5) * 0.35);
  float clumps = smoothstep(0.4, 0.6, n2 + (n3 - 0.5) * 0.3) * 0.6;
  vec3 veg = mix(garrigue, mix(macchiaL, macchia, n3), max(dense, clumps * 0.75));
  veg = mix(veg, soil, smoothstep(0.66, 0.8, n3) * (1.0 - dense) * 0.5);
  veg *= 0.88 + 0.22 * n3;
  // beach sand, wet sand, sea bed
  vec3 sand = lin(vec3(0.84, 0.77, 0.62)) * (0.93 + 0.1 * n3);
  vec3 wet = lin(vec3(0.60, 0.54, 0.43));
  vec3 seabed = lin(vec3(0.78, 0.73, 0.60)) * (0.88 + 0.16 * n2);
  vec3 seagrass = lin(vec3(0.10, 0.15, 0.08));
  float grassMask = smoothstep(0.52, 0.6, tfbm(wp.xz * 0.06 + 3.0)) * smoothstep(-3.0, -6.0, h);
  seabed = mix(seabed, seagrass, grassMask * 0.85);
  seabed = mix(seabed, rockB * 0.85, smoothstep(0.28, 0.5, slope));

  float rockMask = smoothstep(0.30, 0.50, slope + (n2 - 0.5) * 0.22);
  rockMask = max(rockMask, smoothstep(0.62, 0.72, n1) * smoothstep(0.18, 0.3, slope));
  vec3 land = mix(veg, rock, rockMask);
  float beach = (1.0 - smoothstep(1.4, 2.8, h + n1 * 1.2)) * (1.0 - smoothstep(0.22, 0.4, slope));
  land = mix(land, sand, beach);
  vec3 col = land;
  rough = mix(mix(0.93, 0.8, rockMask), 0.95, beach);
  if (h < 0.35) {
    float wetM = smoothstep(0.35, -0.05, h);
    col = mix(col, wet, wetM * (1.0 - rockMask * 0.5));
    rough = mix(rough, 0.35, wetM);
  }
  if (h < -0.2) { col = mix(col, seabed, smoothstep(-0.2, -1.2, h)); rough = 0.9; }
  return col;
}

vec3 terrainBump(vec3 wp, vec3 n){
  float slope = 1.0 - n.y;
  float e = 0.35;
  vec2 p = wp.xz * 0.6 + vec2(wp.y * 0.3);
  float a = tfbm(p), bx = tfbm(p + vec2(e, 0.0)), bz = tfbm(p + vec2(0.0, e));
  float s = mix(0.25, 1.1, smoothstep(0.2, 0.6, slope));
  return vec3(-(bx - a), 0.0, -(bz - a)) * s * 2.2;
}

float causticLayer(vec2 p, float t){
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float caustics(vec2 xz, float t){
  vec2 p = mod(xz * 0.42, 6.28318) - 250.0;
  vec2 q = mod(xz * 0.31 + 1.7, 6.28318) - 250.0;
  return clamp(causticLayer(p, t * 0.55) * 0.65 + causticLayer(q, t * 0.43 + 3.0) * 0.45, 0.0, 2.5);
}
`;
