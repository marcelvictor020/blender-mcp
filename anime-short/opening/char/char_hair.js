// Hair: individually shaped, tapered, arched clumps (lofted lens sections along Catmull-Rom guides) laid over a
// scalp shell, arranged into bangs / sides / back / crown layers. Built in head units (see char_face.js).
// Each vertex carries aT (0 root -> 1 tip) and aPh (clump id/phase) for sway + the highlight band.
import * as THREE from 'three';
import { strand, merge, grid, clamp, lerp, sstep, TAU, rng } from './char_geo.js';

export const SCALP = { c: new THREE.Vector3(0, 0.56, 0), rx: 0.448, ry: 0.458, rzf: 0.418, rzb: 0.49 };
const D2R = Math.PI / 180;
export function dirAE(az, el) { az *= D2R; el *= D2R; return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }
export function scalpPoint(d, lift = 0, sc = SCALP) {
  d = d.clone().normalize();
  const rz = d.z > 0 ? sc.rzf : sc.rzb;
  const r = 1 / Math.sqrt((d.x / sc.rx) ** 2 + (d.y / sc.ry) ** 2 + (d.z / rz) ** 2);
  return sc.c.clone().addScaledVector(d, r * (1 + lift));
}
function slerpDir(a, b, t) { const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize()); return a.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, t)); }

/**
 * One clump. o: { az, el (root), tip: [x,y,z], exit: elevation where it leaves the scalp (default: tip direction),
 * w (half width), th (half thickness), lift, bulge, tipPow, flick: [x,y,z] added near the tip, arch, twist, via: [[x,y,z]] }
 */
export function clump(o, id) {
  const rootDir = dirAE(o.az, o.el);
  const tip = new THREE.Vector3(...o.tip);
  const tipDir = tip.clone().sub(SCALP.c).normalize();
  let exitDir = tipDir.clone();
  if (o.exit !== undefined) { const az = Math.atan2(tipDir.x, tipDir.z) / D2R; exitDir = dirAE(o.exitAz ?? az, o.exit); }
  const lift = o.lift ?? 0.06;
  const pts = [scalpPoint(rootDir, -0.06)];
  const n = o.n ?? 3;
  for (let k = 1; k <= n; k++) { const s = k / n; pts.push(scalpPoint(slerpDir(rootDir, exitDir, s), lift * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, s * 0.9 + 0.1))))); }
  if (o.via) for (const v of o.via) pts.push(new THREE.Vector3(...v));
  if (o.bulge) { const last = pts[pts.length - 1]; const mid = last.clone().lerp(tip, 0.5); const outv = mid.clone().sub(SCALP.c); outv.y = 0; outv.normalize(); mid.addScaledVector(outv, o.bulge); pts.push(mid); }
  if (o.flick) { const pre = pts[pts.length - 1].clone().lerp(tip, 0.75); pts.push(pre); tip.add(new THREE.Vector3(...o.flick)); }
  pts.push(tip);
  // drop points that are too close (Catmull-Rom hates duplicates)
  const P = [pts[0]]; for (const p of pts.slice(1)) if (p.distanceTo(P[P.length - 1]) > 0.012) P.push(p);
  const w = o.w ?? 0.07, th = o.th ?? 0.022, tp = o.tipPow ?? 1.0, rw = o.rootW ?? 0.75, pk = o.peak ?? 0.4;
  const geo = strand(P, {
    width: t => w * (t < pk ? lerp(rw, 1, sstep(0, pk, t)) : Math.pow(Math.max(0, (1 - t) / (1 - pk)), tp)) + 0.0006,
    thick: t => th * Math.pow(Math.max(0, 1 - t), 0.6) * (0.8 + 0.2 * sstep(0, 0.2, t)) + 0.0004,
    out: (p) => { const v = p.clone().sub(SCALP.c); if (o.outY !== undefined) v.y *= o.outY; return v.normalize(); },
    seg: o.seg ?? 16, ns: 8, arch: o.arch ?? 0.45, twist: o.twist ?? 0,
    attrs: { aPh: id + 0.5 },
  });
  geo.userData.clump = { o, pts: P };
  return geo;
}

/** Scalp cap: ellipsoid patch above a hairline elevation curve elH(az). */
export function scalpCap(elH, lift = 0.0, nu = 64, nv = 22) {
  return grid((u, v) => {
    const az = u * 360, el = lerp(89.5, elH(az), v);
    return scalpPoint(dirAE(az, el), lift).toArray();
  }, nu, nv, { closedU: true, capStart: scalpPoint(new THREE.Vector3(0, 1, 0), lift).toArray() });
}

/** Build the whole hair from a list of clump specs. Returns { geo, capGeo, bangs: [clumpGeo...] } */
export function buildHair(list, elH, capLift = 0.0) {
  const geos = list.map((o, i) => clump(o, i));
  const cap = scalpCap(elH, capLift);
  const geo = merge(geos.map(g => { const c = g.clone(); c.deleteAttribute('normal'); c.computeVertexNormals(); return c; }));
  geo.computeVertexNormals();
  return { geo, capGeo: cap, clumps: geos };
}

/** Polygons (head units, x/y) of the forehead shadow cast by bang clumps, offset down by `drop`. */
export function bangShadow(clumps, drop = 0.03, dx = 0.0) {
  const polys = [];
  for (const g of clumps) {
    const o = g.userData.clump.o; if (!o.bang) continue;
    const curve = g.userData.curve, w = o.w ?? 0.07, tp = o.tipPow ?? 1.1;
    const L = [], R = [];
    for (let k = 0; k <= 16; k++) {
      const t = lerp(0.15, 1, k / 16), p = curve.getPoint(t), T = curve.getTangent(t);
      const ww = w * Math.pow(1 - t, tp) * 1.05 + 0.002;
      const sx = -T.y, sy = T.x; const l = Math.hypot(sx, sy) || 1;
      L.push([p.x + sx / l * ww + dx, p.y + sy / l * ww - drop]); R.push([p.x - sx / l * ww + dx, p.y - sy / l * ww - drop]);
    }
    polys.push([...L, ...R.reverse(), [R[R.length - 1][0], 1.2], [L[0][0], 1.2]]);
  }
  return polys;
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
// tip helper on the face plane: x, y (head units), z offset in front of the face
const faceZ = (S, y, x) => { const p = S.point(y, Math.asin(clamp(x / S.W(y), -1, 1))); return p[2]; };

/** REN: messy, spiky, long bangs between the eyes, a few strands up, longer nape. */
export function styleMessy(S, seed = 3) {
  const R = rng(seed), J = (a) => (R() - 0.5) * a;
  const L = [];
  // --- bangs: broad triangular clumps; roots on the top-front, tips on the brow/eye line (long ones between the eyes)
  const bangs = [
    // [rootAz, rootEl, tipX, tipY, w, flickX]
    [-4, 60, -0.015, 0.33, 0.12, 0.0],
    [16, 60, 0.1, 0.43, 0.115, 0.01],
    [-22, 58, -0.13, 0.42, 0.115, -0.01],
    [34, 56, 0.2, 0.37, 0.11, 0.015],
    [-40, 54, -0.23, 0.36, 0.11, -0.015],
    [52, 50, 0.3, 0.31, 0.13, 0.02],
    [-56, 50, -0.31, 0.3, 0.13, -0.02],
    [6, 64, 0.05, 0.5, 0.1, 0.0],
    [-10, 64, -0.07, 0.52, 0.1, 0],
  ];
  bangs.forEach(([az, el, x, y, w, fx]) => {
    const z = faceZ(S, y, x) + 0.04 + Math.abs(x) * 0.06;
    L.push({ bang: true, az: az + J(3), el: el + J(2), tip: [x, y, z], w, th: 0.02, lift: 0.07, exit: 28 + J(4), tipPow: 1.0, peak: 0.45, flick: [fx, 0.0, 0.012], arch: 0.4 });
  });
  // --- sides: in front of / over the ears down to the jaw
  for (const sx of [-1, 1]) {
    [[74, 34, 0.41, 0.2, 0.12, 0.11], [96, 30, 0.43, 0.17, -0.02, 0.12], [118, 28, 0.42, 0.15, -0.16, 0.12]].forEach(([az, el, x, y, z, w]) => {
      L.push({ az: sx * (az + J(4)), el: el + J(3), tip: [sx * (x + J(0.015)), y + J(0.03), z], exit: 2, w, th: 0.022, lift: 0.05, bulge: 0.0, tipPow: 1.0, peak: 0.45, flick: [sx * 0.012, 0.0, 0.0] });
    });
  }
  // --- back: two layers of broad clumps down to the nape
  for (let i = 0; i < 8; i++) {
    const az = 128 + i * (104 / 7) + J(5), a = az * D2R;
    const r = 0.4 + R() * 0.04, y = 0.02 + R() * 0.06 - (Math.abs(Math.cos(a)) > 0.9 ? 0.05 : 0);
    L.push({ az, el: 32 + J(5), tip: [Math.sin(a) * r, y, Math.cos(a) * r - 0.03], exit: -30, w: 0.14, th: 0.03, lift: 0.08, bulge: 0.02, tipPow: 1.0, peak: 0.45, flick: [Math.sin(a) * 0.025, 0.01, Math.cos(a) * 0.02] });
  }
  for (let i = 0; i < 7; i++) {
    const az = 134 + i * (92 / 6) + J(5), a = az * D2R;
    L.push({ az, el: 55 + J(5), tip: [Math.sin(a) * 0.47, 0.2 + R() * 0.06, Math.cos(a) * 0.5], exit: -8, w: 0.16, th: 0.03, lift: 0.08, tipPow: 1.0, peak: 0.45, flick: [Math.sin(a) * 0.03, 0.02, Math.cos(a) * 0.03] });
  }
  // nape tail (longer)
  for (const sx of [-1, 0, 1]) L.push({ az: 180 + sx * 16, el: 12, tip: [sx * 0.08, -0.1, -0.3], exit: -42, w: 0.09, th: 0.025, lift: 0.06, tipPow: 1.0, flick: [sx * 0.015, 0, -0.015] });
  // --- crown / top layer: broad clumps lying on the scalp (smooth mass, slightly jagged silhouette)
  for (let i = 0; i < 9; i++) {
    const az = i * 40 + J(8), a = az * D2R, el = 22 + J(6);
    const tip = scalpPoint(dirAE(az, el), 0.07);
    L.push({ az: az + 180 + J(10), el: 80, tip: tip.toArray(), exit: el + 6, w: 0.19, th: 0.032, lift: 0.08, tipPow: 1.0, peak: 0.4, n: 3 });
  }
  // --- ahoge: strands sticking up from the crown
  L.push({ az: 170, el: 84, tip: [0.05, 1.19, -0.1], via: [[0.0, 1.08, -0.06]], w: 0.045, th: 0.014, lift: 0.04, tipPow: 1.0, peak: 0.25, n: 1, flick: [0.04, 0.0, 0.03] });
  L.push({ az: 150, el: 80, tip: [0.14, 1.12, -0.2], via: [[0.07, 1.06, -0.12]], w: 0.04, th: 0.012, lift: 0.04, tipPow: 1.0, peak: 0.25, n: 1, flick: [0.03, -0.02, -0.02] });
  // temple locks covering the hairline corners
  for (const sx of [-1, 1]) for (const [az, el, x, y, w] of [[50, 46, 0.3, 0.42, 0.12], [62, 38, 0.36, 0.34, 0.11], [70, 32, 0.4, 0.27, 0.1]])
    L.push({ az: sx * (az + J(3)), el, tip: [sx * x, y, faceZ(S, y, sx * Math.min(x, 0.36)) + 0.03], exit: 16, w, th: 0.022, lift: 0.07, tipPow: 1.0, peak: 0.45, flick: [sx * 0.01, 0, 0.01] });
  const elH = az => { const a = ((az + 180) % 360) - 180, f = Math.abs(a) / 180; return lerp(lerp(24, -12, sstep(0.07, 0.24, f)), -38, sstep(0.55, 0.95, f)); };
  return { list: L, elH };
}

/** AOI: chestnut bob, straight blunt bangs, ends curving in at the jaw. */
export function styleBob(S, seed = 5) {
  const R = rng(seed), J = (a) => (R() - 0.5) * a;
  const L = [];
  // straight bangs: 11 narrow clumps with nearly level tips at brow line
  for (let i = 0; i < 11; i++) {
    const s = i / 10 - 0.5, x = s * 0.74;
    const y = 0.545 + J(0.02) - Math.abs(s) * 0.03;
    const z = faceZ(S, y, x) + 0.035 + Math.abs(x) * 0.07;
    L.push({ bang: true, az: s * 70 + J(3), el: 60 + J(3), tip: [x, y, z], w: 0.052, th: 0.022, lift: 0.06, exit: 26, tipPow: 0.55, rootW: 0.9, arch: 0.45, flick: [0, 0.0, 0.0] });
  }
  // longer side bangs framing the face
  for (const sx of [-1, 1]) {
    L.push({ bang: true, az: sx * 50, el: 46, tip: [sx * 0.36, 0.3, faceZ(S, 0.3, sx * 0.36) + 0.06], w: 0.06, th: 0.024, lift: 0.07, exit: 20, tipPow: 0.9, flick: [sx * 0.0, 0, 0.0] });
  }
  // bob body: rings of clumps around sides/back, tips at chin level, curving inward
  const N = 18;
  for (let i = 0; i < N; i++) {
    const az = 62 + i * ((360 - 124) / (N - 1)), a = az * D2R;
    const backness = sstep(90, 180, Math.abs(((az + 180) % 360) - 180) < 180 ? (az > 180 ? 360 - az : az) : 0);
    const r = 0.5 + J(0.02), y = lerp(0.08, 0.06, backness) + J(0.02);
    const tip = [Math.sin(a) * r * 0.86, y, Math.cos(a) * r * 0.8 - 0.05];
    L.push({ az: az + J(4), el: 40 + J(5), tip, exit: -8, w: 0.1, th: 0.03, lift: 0.1, bulge: 0.05, tipPow: 0.85, rootW: 0.95, flick: [-Math.sin(a) * 0.04, 0.02, -Math.cos(a) * 0.04] });
  }
  // outer shell layer (shorter, from higher roots) for volume
  for (let i = 0; i < 12; i++) {
    const az = 70 + i * ((360 - 140) / 11), a = az * D2R;
    L.push({ az: az + J(5), el: 62 + J(5), tip: [Math.sin(a) * 0.56, 0.2 + J(0.04), Math.cos(a) * 0.52 - 0.04], exit: 10, w: 0.12, th: 0.034, lift: 0.13, bulge: 0.04, tipPow: 0.9, rootW: 0.95, flick: [-Math.sin(a) * 0.03, 0.0, -Math.cos(a) * 0.03] });
  }
  // crown
  for (let i = 0; i < 8; i++) { const az = i * 45 + J(10), a = az * D2R; L.push({ az, el: 84, tip: [Math.sin(a) * 0.36, 0.86, Math.cos(a) * 0.36 * (Math.cos(a) > 0 ? 0.9 : 1.1)], w: 0.13, th: 0.035, lift: 0.1, tipPow: 0.9, n: 2 }); }
  const elH = az => { const a = ((az + 180) % 360) - 180, f = Math.abs(a) / 180; return lerp(lerp(24, -2, sstep(0.1, 0.45, f)), -42, sstep(0.55, 0.95, f)); };
  return { list: L, elH };
}

/** COLLECTOR: lank straight hair falling from under the hat to the shoulders. */
export function styleLank(S, seed = 9) {
  const R = rng(seed), J = (a) => (R() - 0.5) * a;
  const L = [];
  for (let i = 0; i < 16; i++) {
    const az = 55 + i * (250 / 15) + J(5), a = az * D2R;
    const front = Math.cos(a) > 0.2;
    L.push({ az, el: 30 + J(6), tip: [Math.sin(a) * 0.5, -0.45 + J(0.1) + (front ? 0.15 : 0), Math.cos(a) * 0.42 - 0.05], exit: -15, w: 0.14, th: 0.026, lift: 0.07, bulge: 0.02, tipPow: 1.0, peak: 0.5, flick: [Math.sin(a) * 0.03, 0, 0] });
  }
  // a parted fringe
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const x = sx * (0.08 + k * 0.1);
    L.push({ bang: true, az: sx * (10 + k * 18), el: 62, tip: [x * 1.25, 0.6 - k * 0.12, faceZ(S, 0.6 - k * 0.12, x * 1.2) + 0.05], exit: 30, w: 0.11, th: 0.022, lift: 0.06, tipPow: 1.0, peak: 0.45, flick: [sx * 0.02, 0, 0] });
  }
  const elH = az => { const a = ((az + 180) % 360) - 180, f = Math.abs(a) / 180; return lerp(lerp(30, 0, sstep(0.1, 0.45, f)), -30, sstep(0.55, 0.95, f)); };
  return { list: L, elH };
}
