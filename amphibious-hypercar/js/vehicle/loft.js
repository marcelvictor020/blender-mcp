// Parametric lofted body surfaces. A body is defined by longitudinal curves
// (width, heights, fender rise ...) and superellipse sections. Every panel
// (door, hood, sponson ...) is cut from the same analytic surface so the
// seams line up exactly and normals are continuous.
import * as THREE from 'three';
import { curve1D } from '../util/noise.js';

const HALF_PI = Math.PI / 2;

export class BodyShape {
  // p: { z0, z1, hw, yb, ys, yt, fender, tumble, scoop, nt, nb }
  constructor(p) {
    this.p = p;
    this.z0 = p.z0; this.z1 = p.z1;
    const c = (v, d) => (Array.isArray(v) ? curve1D(v) : () => (v === undefined ? d : v));
    this.hw = c(p.hw); this.yb = c(p.yb); this.ys = c(p.ys); this.yt = c(p.yt);
    this.fender = c(p.fender, 0); this.tumble = c(p.tumble, 0.06); this.scoop = c(p.scoop, 0);
    this.nt = c(p.nt, 2.6); this.nb = c(p.nb, 4.5);
    this.crease = c(p.crease, 0);
  }

  zOf(u) { return this.z0 + (this.z1 - this.z0) * u; }
  uOf(z) { return (z - this.z0) / (this.z1 - this.z0); }

  // +x half of the body. v: 0 bottom centre -> 1 top centre
  point(u, v, out) {
    const hw = this.hw(u), yb = this.yb(u), ys = this.ys(u), yt = this.yt(u);
    const th = -HALF_PI + v * Math.PI;
    let x, y;
    if (th < 0) {
      const nb = this.nb(u);
      const c = Math.cos(th), s = -Math.sin(th);
      x = hw * Math.pow(Math.max(c, 0), 2 / nb);
      y = ys - (ys - yb) * Math.pow(s, 2 / nb);
    } else {
      const nt = this.nt(u);
      const c = Math.cos(th), s = Math.sin(th);
      const sp = Math.pow(s, 2 / nt);
      x = hw * Math.pow(Math.max(c, 0), 2 / nt) * (1 - this.tumble(u) * sp);
      const q = x / Math.max(hw, 1e-3);
      const fr = this.fender(u) * Math.exp(-Math.pow((q - 0.74) / 0.24, 2)) * Math.min(1, sp * 1.4);
      y = ys + (yt - ys) * sp + fr;
      // sharp shoulder crease (character line)
      y += this.crease(u) * Math.exp(-Math.pow(th / 0.08, 2)) * 0.0;
    }
    const sc = this.scoop(u);
    if (sc) x -= sc * Math.exp(-Math.pow((th + 0.12) / 0.3, 2));
    out.set(x, y, this.zOf(u));
    return out;
  }

  // outward unit normal (+x half)
  normal(u, v, out) {
    const e = 1e-4;
    const ua = Math.max(0, u - e), ub = Math.min(1, u + e);
    const va = Math.max(0, v - e), vb = Math.min(1, v + e);
    this.point(ua, v, _a); this.point(ub, v, _b);
    const du = _b.sub(_a);
    this.point(u, va, _c); this.point(u, vb, _d);
    const dv = _d.sub(_c);
    out.crossVectors(dv, du);
    if (out.lengthSq() < 1e-14) {
      // degenerate at the very centreline ends
      out.set(0, v > 0.5 ? 1 : -1, 0);
    }
    out.normalize();
    if (v >= 1 - 1e-6 || v <= 1e-6) out.x = 0, out.normalize();
    return out;
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

// Wraps a half-body shape so v in [0,2] runs over both halves continuously
// (v<=1: +x side, v>1: mirrored). Used for panels that span the centreline.
export class FullShape {
  constructor(shape) { this.s = shape; }
  zOf(u) { return this.s.zOf(u); }
  point(u, v, out) {
    if (v <= 1) return this.s.point(u, v, out);
    this.s.point(u, 2 - v, out); out.x = -out.x; return out;
  }
  normal(u, v, out) {
    if (v <= 1) return this.s.normal(u, v, out);
    this.s.normal(u, 2 - v, out); out.x = -out.x; return out;
  }
}

// Fan caps closing the open nose/tail sections of a half shell.
export function buildCap(shape, u, side, mat, builder, n = 40) {
  const pts = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= n; j++) { shape.point(u, j / n, p); pts.push(new THREE.Vector3(p.x * side, p.y, p.z)); }
  const c = new THREE.Vector3();
  pts.forEach((q) => c.add(q)); c.multiplyScalar(1 / pts.length); c.x = 0;
  const nz = u > 0.5 ? 1 : -1;
  const nrm = new THREE.Vector3(0, 0, nz);
  const ci = builder.vertex(c, nrm, 0.5, 0.5);
  const ids = pts.map((q) => builder.vertex(q, nrm, q.x, q.y));
  for (let j = 0; j < n; j++) {
    const flip = (nz > 0) !== (side > 0);
    if (flip) builder.tri(mat, ci, ids[j], ids[j + 1]); else builder.tri(mat, ci, ids[j + 1], ids[j]);
  }
}

// Sample positions so that every panel boundary lies exactly on a grid line.
export function breakpoints(n, cuts) {
  const set = new Set();
  for (let i = 0; i <= n; i++) set.add(+(i / n).toFixed(6));
  for (const c of cuts) set.add(+c.toFixed(6));
  return Float32Array.from([...set].sort((a, b) => a - b));
}

// Geometry accumulator with material groups.
export class GeoBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = [];
    this.groups = new Map(); // matIndex -> [indices]
  }
  vertex(p, n, u, v) {
    this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(m, a, b, c) {
    let g = this.groups.get(m);
    if (!g) { g = []; this.groups.set(m, g); }
    g.push(a, b, c);
  }
  quad(m, a, b, c, d, flip) {
    // a(i,j) b(i,j+1) c(i+1,j) d(i+1,j+1)
    if (!flip) { this.tri(m, a, b, c); this.tri(m, b, d, c); }
    else { this.tri(m, a, c, b); this.tri(m, b, c, d); }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const keys = [...this.groups.keys()].sort((a, b) => a - b);
    const idx = [];
    for (const k of keys) {
      const arr = this.groups.get(k);
      g.addGroup(idx.length, arr.length, k);
      for (const i of arr) idx.push(i);
    }
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3();

function uvOf(shape, u, v, p) {
  // metres along the car and roughly along the section
  return [p.z, v * 1.7];
}

// Main shell: all grid quads accepted by include(u,v); side = +1 / -1
export function buildShell(shape, us, vs, side, include, matOf, builder = new GeoBuilder()) {
  const map = new Map();
  const flip = side < 0;
  const vid = (i, j) => {
    const key = i * 4096 + j;
    let id = map.get(key);
    if (id !== undefined) return id;
    shape.point(us[i], vs[j], _p); shape.normal(us[i], vs[j], _n);
    _p.x *= side; _n.x *= side;
    const [tu, tv] = uvOf(shape, us[i], vs[j], _p);
    id = builder.vertex(_p, _n, tu, tv);
    map.set(key, id);
    return id;
  };
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < vs.length - 1; j++) {
      const uc = (us[i] + us[i + 1]) / 2, vc = (vs[j] + vs[j + 1]) / 2;
      if (!include(uc, vc)) continue;
      const m = matOf(uc, vc);
      builder.quad(m, vid(i, j), vid(i, j + 1), vid(i + 1, j), vid(i + 1, j + 1), flip);
    }
  }
  return builder;
}

function linspace(a, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + (b - a) * (i / n));
  return out;
}

// A thick panel cut from the surface over [u0,u1]x[v0,v1].
// mats: { outer, inner, edge }, thickness may be a number or fn(u,v)
export function buildPanel(shape, rect, side, opts = {}) {
  const { nu = 16, nv = 10, thickness = 0.03, gapU = 0.0009, gapV = 0.0028, mats = { outer: 0, inner: 1, edge: 2 }, innerUV, innerPlane, outerMatOf } = opts;
  const u0 = rect.u0 + gapU, u1 = rect.u1 - gapU, v0 = rect.v0 + gapV, v1 = rect.v1 - gapV;
  const us = linspace(u0, u1, nu), vs = linspace(v0, v1, nv);
  const b = opts.builder || new GeoBuilder();
  const flip = side < 0;
  const thk = typeof thickness === 'function' ? thickness : () => thickness;
  const outer = [], inner = [];
  const P = [], Nn = [];
  for (let i = 0; i <= nu; i++) {
    P.push([]); Nn.push([]);
    for (let j = 0; j <= nv; j++) {
      const p = new THREE.Vector3(), n = new THREE.Vector3();
      shape.point(us[i], vs[j], p); shape.normal(us[i], vs[j], n);
      p.x *= side; n.x *= side;
      P[i].push(p); Nn[i].push(n);
    }
  }
  // inner surface: offset along the normal, or projected onto a flat plane
  const Q = [];
  const innerPoint = (i, j, out) => {
    const p = P[i][j], n = Nn[i][j];
    if (innerPlane) {
      // plane: normal (side*nx, ny, 0), passes through c along that normal
      const nx = innerPlane.nx * side, ny = innerPlane.ny;
      const d = p.x * nx + p.y * ny - innerPlane.c;
      const taper = innerPlane.taper ? innerPlane.taper(us[i]) : 1;
      return out.set(p.x - nx * d * taper, p.y - ny * d * taper, p.z);
    }
    return out.copy(p).addScaledVector(n, -thk(us[i], vs[j]));
  };
  for (let i = 0; i <= nu; i++) {
    outer.push([]); inner.push([]); Q.push([]);
    for (let j = 0; j <= nv; j++) {
      const p = P[i][j], n = Nn[i][j];
      outer[i].push(b.vertex(p, n, p.z, vs[j] * 1.7));
      const q = innerPoint(i, j, new THREE.Vector3());
      Q[i].push(q);
      if (innerPlane) _n.set(-innerPlane.nx * side, -innerPlane.ny, 0); else _n.copy(n).negate();
      const iu = innerUV ? innerUV(us[i], vs[j], q) : [p.z, vs[j] * 1.7];
      inner[i].push(b.vertex(q, _n, iu[0], iu[1]));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const om = outerMatOf ? outerMatOf((us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2) : mats.outer;
    b.quad(om, outer[i][j], outer[i][j + 1], outer[i + 1][j], outer[i + 1][j + 1], flip);
    b.quad(mats.inner, inner[i][j], inner[i][j + 1], inner[i + 1][j], inner[i + 1][j + 1], !flip);
  }
  // edge strips (4 sides), normals = outward in-plane
  const edge = (list, normalFn, reverse) => {
    for (let k = 0; k < list.length - 1; k++) {
      const [i0, j0] = list[k], [i1, j1] = list[k + 1];
      const pa = P[i0][j0], pb = P[i1][j1];
      const en = normalFn(i0, j0);
      const a = b.vertex(pa, en, 0, 0);
      const c = b.vertex(pb, en, 1, 0);
      const qa = Q[i0][j0], qb = Q[i1][j1];
      const a2 = b.vertex(qa, en, 0, 1);
      const c2 = b.vertex(qb, en, 1, 1);
      if (reverse !== flip) { b.tri(mats.edge, a, c, a2); b.tri(mats.edge, c, c2, a2); }
      else { b.tri(mats.edge, a, a2, c); b.tri(mats.edge, c, a2, c2); }
    }
  };
  const tangentU = (i, j, sign) => {
    const i2 = Math.min(nu, Math.max(0, i + sign));
    const d = new THREE.Vector3().subVectors(P[i2][j], P[i][j]);
    if (i2 === i) d.subVectors(P[i][j], P[Math.max(0, i - sign)][j]);
    return d.normalize().multiplyScalar(sign >= 0 ? 1 : 1);
  };
  const tangentV = (i, j, sign) => {
    const j2 = Math.min(nv, Math.max(0, j + sign));
    const d = new THREE.Vector3().subVectors(P[i][j2], P[i][j]);
    if (j2 === j) d.subVectors(P[i][j], P[i][Math.max(0, j - sign)]);
    return d.normalize();
  };
  // bottom (v0) edge: outward = -dv
  edge(us.map((_, i) => [i, 0]), (i, j) => tangentV(i, j, 1).negate(), false);
  // top (v1) edge: outward = +dv
  edge(us.map((_, i) => [i, nv]), (i, j) => tangentV(i, j, -1).negate(), true);
  // rear (u0) edge: outward = -du
  edge(vs.map((_, j) => [0, j]), (i, j) => tangentU(i, j, 1).negate(), true);
  // front (u1) edge
  edge(vs.map((_, j) => [nu, j]), (i, j) => tangentU(i, j, -1).negate(), false);
  return b;
}

// Recess walls around an opening (door jamb, sponson bay ...) going inward.
export function buildJamb(shape, rect, side, depth, mat, builder, opts = {}) {
  const { nu = 16, nv = 10, back = false, backMat = mat } = opts;
  const b = builder || new GeoBuilder();
  const flip = side < 0;
  const us = linspace(rect.u0, rect.u1, nu), vs = linspace(rect.v0, rect.v1, nv);
  const pt = (u, v) => {
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    shape.point(u, v, p); shape.normal(u, v, n);
    p.x *= side; n.x *= side;
    return [p, n];
  };
  const strip = (list, inward) => {
    for (let k = 0; k < list.length - 1; k++) {
      const [pa, na] = pt(list[k][0], list[k][1]);
      const [pb, nb] = pt(list[k + 1][0], list[k + 1][1]);
      const qa = pa.clone().addScaledVector(na, -depth), qb = pb.clone().addScaledVector(nb, -depth);
      const en = inward;
      const a = b.vertex(pa, en, 0, 0), c = b.vertex(pb, en, 1, 0), a2 = b.vertex(qa, en, 0, 1), c2 = b.vertex(qb, en, 1, 1);
      b.tri(mat, a, c, a2); b.tri(mat, c, c2, a2);
      b.tri(mat, a, a2, c); b.tri(mat, c, a2, c2); // double sided (cheap and robust)
    }
  };
  const n0 = new THREE.Vector3(0, 0, 0);
  strip(us.map((u) => [u, rect.v0]), n0.clone().set(0, 1, 0));
  strip(us.map((u) => [u, rect.v1]), n0.clone().set(0, -1, 0));
  strip(vs.map((v) => [rect.u0, v]), n0.clone().set(0, 0, 1));
  strip(vs.map((v) => [rect.u1, v]), n0.clone().set(0, 0, -1));
  if (back) {
    const ids = [];
    for (let i = 0; i <= nu; i++) {
      ids.push([]);
      for (let j = 0; j <= nv; j++) {
        const [p, n] = pt(us[i], vs[j]);
        p.addScaledVector(n, -depth);
        ids[i].push(b.vertex(p, n, p.z * 2, vs[j] * 3));
      }
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) b.quad(backMat, ids[i][j], ids[i][j + 1], ids[i + 1][j], ids[i + 1][j + 1], flip);
  }
  return b;
}

// Thin conformal patch floating just above the surface (intakes, light lenses ...)
export function buildConformal(shape, rect, side, offset, mat, builder, opts = {}) {
  const { nu = 12, nv = 6, uvScale = 1, shapeFn } = opts;
  const b = builder || new GeoBuilder();
  const flip = side < 0;
  const ids = [];
  for (let i = 0; i <= nu; i++) {
    ids.push([]);
    for (let j = 0; j <= nv; j++) {
      const u = rect.u0 + (rect.u1 - rect.u0) * (i / nu);
      const v = rect.v0 + (rect.v1 - rect.v0) * (j / nv);
      const p = new THREE.Vector3(), n = new THREE.Vector3();
      shape.point(u, v, p); shape.normal(u, v, n);
      p.x *= side; n.x *= side;
      const off = typeof offset === 'function' ? offset(i / nu, j / nv) : offset;
      p.addScaledVector(n, off);
      ids[i].push(b.vertex(p, n, (i / nu) * uvScale * (rect.u1 - rect.u0) * 8, (j / nv) * uvScale));
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    if (shapeFn && !shapeFn((i + 0.5) / nu, (j + 0.5) / nv)) continue;
    b.quad(mat, ids[i][j], ids[i][j + 1], ids[i + 1][j], ids[i + 1][j + 1], flip);
  }
  return b;
}

// Points along a path drawn on the surface, offset along the normal.
export function surfacePath(shape, uvPts, side, offset = 0.004, samples = 40) {
  const ctrl = uvPts.map(([u, v]) => new THREE.Vector2(u, v));
  const spline = new THREE.SplineCurve(ctrl);
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const q = spline.getPoint(i / samples);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    shape.point(q.x, q.y, p); shape.normal(q.x, q.y, n);
    p.x *= side; n.x *= side;
    p.addScaledVector(n, offset);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

// Material that discards fragments inside wheel-arch cylinders (object space).
export function withCuts(material, cuts) {
  const decl = cuts.map((c, i) => `uniform vec4 uCut${i};`).join('\n');
  const test = cuts.map((c, i) => `if (abs(vObj.x) > uCut${i}.w && length(vObj.yz - uCut${i}.xy) < uCut${i}.z) discard;`).join('\n');
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    cuts.forEach((c, i) => { sh.uniforms['uCut' + i] = { value: new THREE.Vector4(c.y, c.z, c.r, c.xMin) }; });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n' + decl)
      .replace('void main() {', 'void main() {\n' + test);
  };
  material.customProgramCacheKey = () => 'cuts' + cuts.length + (material.userData.cacheKey || '');
  return material;
}

export function depthWithCuts(cuts) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  return withCuts(m, cuts);
}
