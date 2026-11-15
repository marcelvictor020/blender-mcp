// Geometry builders for the anime character system: parametric grids, lofts, thick shells, tapered strands,
// proximity skin weights and smoothed "outline normals" (so inverted-hull outlines stay closed across hard edges).
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Make the triangle winding point outward (positive signed volume about the centroid). */
export function orient(geo) {
  const p = geo.attributes.position, idx = geo.index;
  const c = new THREE.Vector3(); for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i)); c.divideScalar(p.count);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(p, idx.getX(i)).sub(c); b.fromBufferAttribute(p, idx.getX(i + 1)).sub(c); d.fromBufferAttribute(p, idx.getX(i + 2)).sub(c);
    vol += a.dot(b.cross(d));
  }
  if (vol < 0) { const arr = idx.array; for (let i = 0; i < arr.length; i += 3) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; } idx.needsUpdate = true; }
  return geo;
}

/** Smoothed normals keyed by quantised position -> attribute `oN` (used by the outline hull). */
export function addOutlineNormals(geo, q = 1e4) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, map = new Map();
  const key = i => `${Math.round(p.getX(i) * q)},${Math.round(p.getY(i) * q)},${Math.round(p.getZ(i) * q)}`;
  for (let i = 0; i < p.count; i++) { const k = key(i); const v = map.get(k) || [0, 0, 0]; v[0] += n.getX(i); v[1] += n.getY(i); v[2] += n.getZ(i); map.set(k, v); }
  const on = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = map.get(key(i)); const l = Math.hypot(v[0], v[1], v[2]) || 1; on[i * 3] = v[0] / l; on[i * 3 + 1] = v[1] / l; on[i * 3 + 2] = v[2] / l; }
  geo.setAttribute('oN', new THREE.BufferAttribute(on, 3));
  return geo;
}

/**
 * Parametric grid. fn(u, v) -> [x,y,z]. nu x nv cells. closedU wraps u (no seam).
 * capStart/capEnd: add a pole vertex (position = given [x,y,z] or ring centroid) closing v=0 / v=1.
 */
export function grid(fn, nu, nv, { closedU = false, capStart = false, capEnd = false } = {}) {
  const cols = closedU ? nu : nu + 1;
  const pos = [], uv = [], index = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const u = i / nu, v = j / nv; pos.push(...fn(u, v)); uv.push(u, v); }
  const id = (i, j) => j * cols + (closedU ? i % nu : i);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    index.push(a, b, d, b, c, d);
  }
  const pole = (cap, j) => {
    let pp = cap;
    if (cap === true) { pp = [0, 0, 0]; for (let i = 0; i < cols; i++) for (let k = 0; k < 3; k++) pp[k] += pos[id(i, j) * 3 + k] / cols; }
    const k = pos.length / 3; pos.push(...pp); uv.push(0.5, j / nv);
    for (let i = 0; i < nu; i++) j === 0 ? index.push(k, id(i + 1, 0), id(i, 0)) : index.push(k, id(i, j), id(i + 1, j));
  };
  if (capStart) pole(capStart, 0);
  if (capEnd) pole(capEnd, nv);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  orient(g); g.computeVertexNormals();
  return g;
}

/* ---------------- ring profiles (lofts) ---------------- */
// ring: { y, w, df, db, cx, cz, p, pb }  (half-width, front depth, back depth, superellipse exponents)
const RK = ['y', 'w', 'df', 'db', 'cx', 'cz', 'p', 'pb'];
function normRing(r) { return { y: r.y, w: r.w, df: r.df ?? r.d ?? r.w, db: r.db ?? r.d ?? r.w, cx: r.cx ?? 0, cz: r.cz ?? 0, p: r.p ?? 2, pb: r.pb ?? r.p ?? 2 }; }
/** Catmull-Rom interpolation of ring parameters at parameter s in [0, rings.length-1]. */
export function ringAt(rings, s) {
  const R = rings.map(normRing), n = R.length;
  const i = clamp(Math.floor(s), 0, n - 2), t = s - i;
  const P = k => R[clamp(k, 0, n - 1)];
  const out = {};
  for (const key of RK) {
    const p0 = P(i - 1)[key], p1 = P(i)[key], p2 = P(i + 1)[key], p3 = P(i + 2)[key];
    const t2 = t * t, t3 = t2 * t;
    out[key] = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  return out;
}
/** ring point for angle a (0 = +z front, PI/2 = +x). offset pushes outward along the 2D section normal. */
export function ringPoint(r, a, offset = 0) {
  const s = Math.sin(a), c = Math.cos(a);
  const x = r.cx + r.w * spow(s, 2 / r.p);
  const z = r.cz + (c >= 0 ? r.df * spow(c, 2 / r.p) : r.db * spow(c, 2 / r.pb));
  if (!offset) return [x, r.y, z];
  // section normal ~ gradient of superellipse; approximate with scaled radial direction
  const nx = (x - r.cx) / Math.max(r.w, 1e-4) ** 2, nz = (z - r.cz) / Math.max(c >= 0 ? r.df : r.db, 1e-4) ** 2;
  const l = Math.hypot(nx, nz) || 1;
  return [x + nx / l * offset, r.y, z + nz / l * offset];
}
/** Find interpolated ring at height y for a monotonic (top->bottom or bottom->top) ring list. */
export function ringAtY(rings, y) {
  const R = rings.map(normRing);
  const asc = R[R.length - 1].y > R[0].y;
  let i = 0;
  for (; i < R.length - 2; i++) { const a = R[i].y, b = R[i + 1].y; if (asc ? y <= b : y >= b) break; }
  const a = R[i].y, b = R[i + 1].y;
  let s = i + clamp((y - a) / (b - a || 1e-6), 0, 1);
  // refine because Catmull-Rom y is not exactly linear
  for (let k = 0; k < 4; k++) { const r = ringAt(rings, s); const r2 = ringAt(rings, s + 1e-3); const dy = (r2.y - r.y) / 1e-3 || 1e-6; s = clamp(s + (y - r.y) / dy, 0, R.length - 1); }
  return ringAt(rings, s);
}

/** Loft through rings (closed around, caps at both ends). nr = radial segments, sub = subdivisions per ring span. */
export function loft(rings, { nr = 24, sub = 3, capStart = true, capEnd = true, offset = 0, a0 = 0, a1 = TAU } = {}) {
  const nv = (rings.length - 1) * sub;
  const closed = a1 - a0 >= TAU - 1e-6;
  return grid((u, v) => ringPoint(ringAt(rings, v * (rings.length - 1)), a0 + u * (a1 - a0), offset), nr, nv,
    { closedU: closed, capStart: capStart && closed, capEnd: capEnd && closed });
}

/**
 * Thick shell from an outer surface fn(u,v)->[x,y,z]. Inner surface = outer - n * thick. Rims at the borders get their
 * own vertices (hard edge). closedU: u wraps. Result is a closed solid (good for inverted-hull outlines).
 */
export function shell(fn, nu, nv, thick, { closedU = false, inward = null, rimV0 = true, rimV1 = true } = {}) {
  const cols = closedU ? nu : nu + 1, e = 1e-3;
  const P = [], N = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const u = i / nu, v = j / nv;
    const p = new THREE.Vector3(...fn(u, v));
    const du = new THREE.Vector3(...fn(u + e, v)).sub(new THREE.Vector3(...fn(u - e, v)));
    const dv = new THREE.Vector3(...fn(u, Math.min(v + e, 1))).sub(new THREE.Vector3(...fn(u, Math.max(v - e, 0))));
    const n = du.cross(dv).normalize();
    if (inward) { if (n.dot(inward(p)) > 0) n.negate(); }
    P.push(p); N.push(n);
  }
  // make normals consistently face away from the centroid if no inward fn
  if (!inward) {
    const c = new THREE.Vector3(); P.forEach(p => c.add(p)); c.divideScalar(P.length);
    let s = 0; P.forEach((p, k) => { s += N[k].dot(p.clone().sub(c)); });
    if (s < 0) N.forEach(n => n.negate());
  }
  const pos = [], uv = [], index = [];
  const push = (p, u, v) => { pos.push(p.x, p.y, p.z); uv.push(u, v); return pos.length / 3 - 1; };
  const outer = [], inner = [];
  for (let k = 0; k < P.length; k++) { const i = k % cols, j = Math.floor(k / cols); outer.push(push(P[k], i / nu, j / nv)); }
  for (let k = 0; k < P.length; k++) { const i = k % cols, j = Math.floor(k / cols); inner.push(push(P[k].clone().addScaledVector(N[k], -thick), i / nu, j / nv)); }
  const id = (i, j) => j * cols + (closedU ? i % nu : i);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    index.push(outer[a], outer[b], outer[d], outer[b], outer[c], outer[d]);
    index.push(inner[a], inner[d], inner[b], inner[b], inner[d], inner[c]);
  }
  // rims (duplicated verts for a crisp edge)
  const rim = (list) => { // list of [k] grid indices along the border in order
    for (let m = 0; m < list.length - 1; m++) {
      const k0 = list[m], k1 = list[m + 1];
      const a = push(P[k0], 0, 0), b = push(P[k1], 0, 0);
      const c = push(P[k1].clone().addScaledVector(N[k1], -thick), 0, 0), d = push(P[k0].clone().addScaledVector(N[k0], -thick), 0, 0);
      index.push(a, b, d, b, c, d);
    }
  };
  const row = j => { const l = []; for (let i = 0; i <= nu; i++) l.push(id(i, j)); return l; };
  const col = i => { const l = []; for (let j = 0; j <= nv; j++) l.push(id(i, j)); return l; };
  if (rimV0) rim(row(0)); if (rimV1) rim(row(nv));
  if (!closedU) { rim(col(0)); rim(col(nu)); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  orient(g); g.computeVertexNormals();
  return g;
}

/**
 * Tapered strand along a curve (hair clumps, lashes, tails). pts: Vector3[], out(p,t)->Vector3 'up' hint.
 * width(t), thick(t): half sizes. Section is a lens (sharp side edges) arched by `arch`.
 */
export function strand(pts, { width, thick, out, seg = 14, ns = 8, arch = 0.35, twist = 0, attrs = {} }) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const pos = [], tt = [], index = [];
  const frames = [];
  let prevS = null;
  for (let k = 0; k <= seg; k++) {
    const t = k / seg, p = curve.getPoint(t), T = curve.getTangent(t).normalize();
    let O = out(p, t).clone(); O.addScaledVector(T, -O.dot(T)).normalize();
    let S = new THREE.Vector3().crossVectors(T, O).normalize();
    if (prevS && S.dot(prevS) < 0) { S.negate(); O.negate(); }
    prevS = S;
    if (twist) { const ang = twist * t; const c = Math.cos(ang), s = Math.sin(ang); const S2 = S.clone().multiplyScalar(c).addScaledVector(O, s); O = O.clone().multiplyScalar(c).addScaledVector(S, -s); S = S2; }
    frames.push({ p, S, O, t });
  }
  for (const f of frames) {
    const w = width(f.t), h = thick(f.t);
    for (let i = 0; i < ns; i++) {
      const a = i / ns * TAU, x = Math.cos(a), y = Math.sin(a);
      const yy = y * h + arch * h * (1 - x * x);          // arched lens: convex outward
      const xx = spow(x, 0.85) * w;
      const q = f.p.clone().addScaledVector(f.S, xx).addScaledVector(f.O, yy);
      pos.push(q.x, q.y, q.z); tt.push(f.t);
    }
  }
  for (let k = 0; k < seg; k++) for (let i = 0; i < ns; i++) {
    const a = k * ns + i, b = k * ns + (i + 1) % ns, c = (k + 1) * ns + (i + 1) % ns, d = (k + 1) * ns + i;
    index.push(a, b, d, b, c, d);
  }
  // root cap
  const r0 = pos.length / 3; const p0 = frames[0].p; pos.push(p0.x, p0.y, p0.z); tt.push(0);
  for (let i = 0; i < ns; i++) index.push(r0, (i + 1) % ns, i);
  // tip cap (in case the tip width is not zero)
  const r1 = pos.length / 3; const p1 = frames[seg].p; pos.push(p1.x, p1.y, p1.z); tt.push(1);
  for (let i = 0; i < ns; i++) index.push(r1, seg * ns + i, seg * ns + (i + 1) % ns);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(v), 1));
  g.setIndex(index);
  orient(g); g.computeVertexNormals();
  g.userData.curve = curve;
  return g;
}

/** Merge indexed geometries that share the same attribute set. */
export function merge(geos) {
  const names = Object.keys(geos[0].attributes);
  const out = new THREE.BufferGeometry();
  let total = 0; geos.forEach(g => total += g.attributes.position.count);
  for (const n of names) {
    const sz = geos[0].attributes[n].itemSize, arr = new Float32Array(total * sz);
    let o = 0; for (const g of geos) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, sz));
  }
  const idx = []; let base = 0;
  for (const g of geos) { for (const i of g.index.array) idx.push(i + base); base += g.attributes.position.count; }
  out.setIndex(idx);
  return out;
}

/* ---------------- proximity skinning ---------------- */
function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1e-9), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}
/**
 * Proximity skin weights. bones: [{ index, a: Vector3, b: Vector3, bias? }] in the geometry's space.
 * w ~ 1/d^k on the nearest 4. `fixed(p)` may return explicit [[index, w], ...] to override.
 */
export function autoSkin(geo, bones, { k = 6, fixed = null } = {}) {
  const p = geo.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    let list = fixed && fixed(v);
    if (!list) {
      list = bones.map(b => [b.index, 1 / Math.pow(Math.max(segDist(v, b.a, b.b) * (b.bias ?? 1), 1e-3), k)]);
      list.sort((x, y) => y[1] - x[1]); list = list.slice(0, 4);
    }
    const s = list.reduce((a, x) => a + x[1], 0) || 1;
    for (let m = 0; m < 4; m++) { si[i * 4 + m] = list[m] ? list[m][0] : 0; sw[i * 4 + m] = list[m] ? list[m][1] / s : 0; }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}
