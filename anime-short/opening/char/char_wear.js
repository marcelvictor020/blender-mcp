// Body + clothing builders for makeCharacter (character space, metres). All garments are thick closed shells or
// lofts skinned to the bone hierarchy by proximity, so they bend with the pose; hands/shoes/props are rigid.
import * as THREE from 'three';
import { loft, shell, grid, strand, ringAtY, ringPoint, ringAt, clamp, lerp, sstep, TAU, orient } from './char_geo.js';
import { autoShade, autoLine, addOutline } from './anime_char.js';
const addOutlineLocal = (ctx, mesh, color) => addOutline(mesh, ctx.U, { px: 1.1, color });

const MALE_TORSO = [
  [0.835, 0.05, 0.04, 0.04], [0.86, 0.1, 0.07, 0.075], [0.9, 0.135, 0.09, 0.095], [0.95, 0.14, 0.092, 0.097], [1.01, 0.128, 0.085, 0.087],
  [1.07, 0.118, 0.08, 0.08], [1.15, 0.125, 0.09, 0.083], [1.23, 0.137, 0.1, 0.088], [1.31, 0.145, 0.1, 0.088], [1.355, 0.152, 0.09, 0.085],
  [1.39, 0.148, 0.074, 0.072], [1.41, 0.112, 0.058, 0.058], [1.425, 0.062, 0.05, 0.048], [1.44, 0.048, 0.044, 0.044],
];
const FEMALE_TORSO = [
  [0.835, 0.05, 0.04, 0.04], [0.86, 0.11, 0.075, 0.08], [0.9, 0.146, 0.094, 0.1], [0.95, 0.147, 0.093, 0.1], [1.01, 0.126, 0.082, 0.086],
  [1.07, 0.108, 0.074, 0.074], [1.14, 0.112, 0.083, 0.076], [1.2, 0.122, 0.108, 0.08], [1.255, 0.125, 0.107, 0.08], [1.31, 0.128, 0.085, 0.08],
  [1.355, 0.135, 0.076, 0.075], [1.385, 0.132, 0.064, 0.064], [1.405, 0.098, 0.052, 0.05], [1.425, 0.052, 0.044, 0.042], [1.44, 0.042, 0.04, 0.04],
];
const torsoRings = (D, o = {}) => (D.fem ? FEMALE_TORSO : MALE_TORSO).map(([y, w, df, db]) => {
  const ws = (o.widthK || 1) * (y > 1.33 ? (o.shoulderK || 1) : 1);
  return { y: y * D.s, w: w * D.s * ws, df: df * D.s * (o.depthK || 1), db: db * D.s * (o.depthK || 1), cz: 0.004 * D.s, p: 2.3 };
});

// arm rings: [dy from shoulder, half-width x, half-depth z]
const ARM = [[0.03, 0.008, 0.008], [0.025, 0.028, 0.028], [0.014, 0.041, 0.04], [0, 0.047, 0.045], [-0.05, 0.045, 0.042], [-0.12, 0.04, 0.038], [-0.2, 0.036, 0.035],
  [-0.262, 0.031, 0.032], [-0.3, 0.034, 0.034], [-0.36, 0.032, 0.031], [-0.44, 0.025, 0.027], [-0.5, 0.0205, 0.025], [-0.512, 0.016, 0.02], [-0.518, 0.006, 0.008]];
// leg rings: [dy from hip joint, half-width, half-depth]
const LEG_TROUSER = [[0.085, 0.07, 0.07], [0.03, 0.088, 0.09], [-0.06, 0.085, 0.088], [-0.18, 0.076, 0.079], [-0.3, 0.065, 0.068], [-0.41, 0.058, 0.06], [-0.49, 0.058, 0.061],
  [-0.6, 0.054, 0.056], [-0.72, 0.051, 0.052], [-0.8, 0.053, 0.055], [-0.806, 0.045, 0.047], [-0.81, 0.02, 0.02]];
const LEG_BARE = [[0.085, 0.07, 0.07], [0.03, 0.08, 0.082], [-0.06, 0.074, 0.077], [-0.18, 0.064, 0.066], [-0.3, 0.052, 0.055], [-0.38, 0.044, 0.047], [-0.41, 0.043, 0.046],
  [-0.47, 0.047, 0.052], [-0.55, 0.045, 0.049], [-0.65, 0.034, 0.037], [-0.74, 0.025, 0.029], [-0.79, 0.026, 0.03], [-0.81, 0.016, 0.018], [-0.815, 0.004, 0.004]];

function stripeTex(base, stripe, from, to, key) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 128);
  // stripe drawn as a multiplier: we encode stripe colour / base colour (base is applied by the material)
  g.fillStyle = stripe; g.fillRect(0, Math.round((1 - to) * 128), 4, Math.max(1, Math.round((to - from) * 128)));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

export function buildBody(ctx, spec) {
  const { D, W, U } = ctx;
  const s = D.s, wear = spec.wear || {};
  const skin = { color: spec.skin, shade: spec.skinShade, term: -0.2, rimAmt: 0.25 };
  const skinLine = spec.skinLine || '#6a3f3a';
  const props = {};
  const TR = torsoRings(D, wear.torso || {});

  /* ---- torso (tee / blouse / under-coat) ---- */
  const topC = wear.top.color;
  const torsoGeo = loft(TR.map(r => ({ ...r })), { nr: 40, sub: 3 });
  let tmat = { color: topC, shade: wear.top.shade, term: -0.08 };
  if (wear.top.bottom) {   // lower part (pelvis) in the trouser/shorts colour: white base + 2-colour map along v
    const yb = wear.top.beltY * s; let sp = 0; for (let k = 0; k < 400; k++) { const q = k / 399 * (TR.length - 1); if (ringAt(TR, q).y <= yb) sp = q; }
    const vb = sp / (TR.length - 1);
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = topC; g.fillRect(0, 0, 4, 256); g.fillStyle = wear.top.bottom; g.fillRect(0, Math.round((1 - vb) * 256), 4, 256);
    g.fillStyle = wear.top.belt || wear.top.bottom; g.fillRect(0, Math.round((1 - vb) * 256) - 2, 4, 5);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
    tmat = { color: '#ffffff', shade: '#a9aed0', term: -0.08, map: t };
  }
  ctx.skinned(torsoGeo, tmat, ['hips:0.4', 'spine:0.4', 'chest:0.4', 'neck:0.55',
    { j: 'shoulderL', a: W.shoulderL.clone().add(new THREE.Vector3(-0.02, 0.02, 0)), b: W.shoulderL.clone().add(new THREE.Vector3(0, -0.04, 0)) },
    { j: 'shoulderR', a: W.shoulderR.clone().add(new THREE.Vector3(0.02, 0.02, 0)), b: W.shoulderR.clone().add(new THREE.Vector3(0, -0.04, 0)) },
    'hipL:0.8', 'hipR:0.8'], { name: 'torso', lineColor: wear.top.line || autoLine(topC) });

  /* ---- neck ---- */
  const nr = (D.fem ? 0.036 : 0.042) * s;
  const neckGeo = loft([{ y: D.neckY - 0.03 * s, w: nr * 1.25, d: nr * 1.1 }, { y: D.neckY + 0.01, w: nr * 1.05, d: nr }, { y: D.chinY + 0.01, w: nr, d: nr * 0.98, cz: 0.004 },
    { y: D.headY + 0.02, w: nr, d: nr, cz: 0.0 }, { y: D.headY + 0.03, w: nr * 0.5, d: nr * 0.5 }], { nr: 24, sub: 3 });
  const jawY = D.chinY + 0.005;
  ctx.skinned(neckGeo, { ...skin, shadowFn: `float yj = ${jawY.toFixed(4)} - 0.05 * ${s.toFixed(3)} + 0.6 * abs(vOP.x) - 0.25 * max(-vOP.z, 0.0); return vOP.y < yj ? 1.0 : 0.0;` },
    ['neck', 'head:1.2', 'chest:0.8'], { name: 'neck', lineColor: skinLine, outline: 1.2 });

  /* ---- arms ---- */
  const armK = (D.fem ? 0.86 : 1) * (wear.armK || 1);
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    const sh = W['shoulder' + S];
    const rings = ARM.map(([dy, w, d]) => ({ y: sh.y + dy * s * (dy < -0.27 ? 1 : 1), w: w * s * armK, d: d * s * armK, cx: sh.x, cz: sh.z }));
    // keep elbow/wrist rings aligned with the joints
    const g = loft(rings, { nr: 20, sub: 3 });
    ctx.skinned(g, wear.armColor ? { color: wear.armColor, shade: wear.armShade } : skin, ['chest:0.6', 'shoulder' + S, 'elbow' + S, 'wrist' + S], { name: 'arm' + S, lineColor: wear.armColor ? autoLine(wear.armColor) : skinLine, outline: 1.3 });
  }
  /* ---- hands ---- */
  for (const [S, sx] of [['L', 1], ['R', -1]]) buildHand(ctx, S, sx, wear.gloves ? { color: wear.gloves, shade: autoShade(wear.gloves, 0.55) } : skin, wear.gloves ? autoLine(wear.gloves, 0.4) : skinLine, spec);

  /* ---- legs ---- */
  const legType = wear.legs.type;
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    const hp = W['hip' + S];
    const src = legType === 'bare' ? LEG_BARE : LEG_TROUSER;
    const lk = wear.legs.k || 1;
    const rings = src.map(([dy, w, d]) => ({ y: hp.y + dy * s, w: w * s * lk, d: d * s * lk, cx: hp.x + (dy > 0 ? -sx * 0.01 * s : 0), cz: (dy < -0.43 ? -0.006 : 0.004) * s }));
    const g = loft(rings, { nr: 22, sub: 3 });
    const legMat = legType === 'bare' ? skin : { color: wear.legs.color, shade: wear.legs.shade, term: -0.05 };
    ctx.skinned(g, legMat, ['hips:0.75', 'hip' + S, 'knee' + S, 'ankle' + S], { name: 'leg' + S, lineColor: legType === 'bare' ? skinLine : autoLine(wear.legs.color, 0.45), outline: 1.4 });
    if (wear.socks) {
      const top = wear.socks.top ?? -0.6;
      const sr = LEG_BARE.filter(r => r[0] <= top + 0.02).map(([dy, w, d]) => ({ y: hp.y + dy * s, w: (w + 0.003) * s * lk, d: (d + 0.003) * s * lk, cx: hp.x, cz: -0.006 * s }));
      sr[0].y = hp.y + top * s;
      const sg = loft(sr, { nr: 22, sub: 2 });
      ctx.skinned(sg, { color: wear.socks.color, shade: wear.socks.shade || '#c7c9dc', term: -0.05 }, ['knee' + S, 'ankle' + S], { name: 'sock' + S, lineColor: '#7d7f94', outline: 1.2 });
    }
    buildShoe(ctx, S, sx, wear.shoes);
  }

  /* ---- garments ---- */
  if (wear.openShirt) buildOpenShirt(ctx, TR, wear.openShirt);
  if (wear.sleeves) buildSleeves(ctx, wear.sleeves);
  if (wear.shirtCollar) buildShirtCollar(ctx, TR, wear.shirtCollar);
  if (wear.sailor) buildSailor(ctx, TR, wear.sailor);
  if (wear.skirt) buildSkirt(ctx, TR, wear.skirt);
  if (wear.coat) buildCoat(ctx, TR, wear.coat);
  if (wear.bracelet) {
    const w = W.wristL; const g = new THREE.TorusGeometry(0.03 * s, 0.0042 * s, 8, 28); g.rotateX(Math.PI / 2); g.translate(w.x, w.y + 0.022 * s, w.z);
    ctx.rigid(g, { color: wear.bracelet, shade: autoShade(wear.bracelet, 0.6) }, 'elbowL', { outline: 1.0, lineColor: '#3a0508' });
    const k = new THREE.SphereGeometry(0.0075 * s, 10, 8); k.translate(w.x + 0.02 * s, w.y + 0.022 * s, w.z + 0.022 * s);
    ctx.rigid(k, { color: wear.bracelet, shade: autoShade(wear.bracelet, 0.6) }, 'elbowL', { outline: 1.0, lineColor: '#3a0508' });
  }
  if (wear.hat) buildHat(ctx, wear.hat);
  if (wear.jar) Object.assign(props, buildJar(ctx, wear.jar));
  if (wear.clip) buildClip(ctx, wear.clip);
  return props;
}

/* ------------------------------------------------------------------ */
function buildHand(ctx, S, sx, mat, line, spec) {
  const { D, W } = ctx, s = D.s * (D.fem ? 0.9 : 1) * (spec.handK || 1);
  const w = W['wrist' + S];
  // palm (hangs down, palm faces -sx (towards the body), thumb forward +z)
  const palm = loft([{ y: 0.004, w: 0.011, d: 0.02 }, { y: -0.004, w: 0.016, d: 0.027 }, { y: -0.035, w: 0.018, d: 0.034 }, { y: -0.07, w: 0.016, d: 0.037 },
    { y: -0.085, w: 0.013, d: 0.034 }, { y: -0.09, w: 0.006, d: 0.02 }].map(r => ({ ...r, y: r.y * s, w: r.w * s, d: r.d * s, cx: -sx * 0.003 * s })), { nr: 16, sub: 3 });
  palm.translate(w.x, w.y, w.z);
  ctx.rigid(palm, mat, 'wrist' + S, { outline: 1.1, lineColor: line });
  // fingers: 4 tapered capsules from the knuckles (bone fingers)
  const f0 = W['fingers' + S];
  const zs = [0.026, 0.009, -0.008, -0.024], ls = [0.07, 0.078, 0.073, 0.058];
  const geos = zs.map((z, i) => {
    const L = ls[i] * s, r = (i === 3 ? 0.0078 : 0.0088) * s;
    const g = loft([{ y: 0.012 * s, w: r * 0.6, d: r * 0.6 }, { y: 0.006 * s, w: r, d: r }, { y: -L * 0.5, w: r * 0.95, d: r * 0.92 }, { y: -L * 0.92, w: r * 0.8, d: r * 0.78 }, { y: -L, w: r * 0.3, d: r * 0.3 }], { nr: 10, sub: 2 });
    // slight natural bend towards the palm
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setX(k, p.getX(k) - sx * 0.12 * y * y / L); }
    g.translate(f0.x, f0.y, f0.z + z * s);
    g.computeVertexNormals();
    return g;
  });
  for (const g of geos) ctx.rigid(g, mat, 'fingers' + S, { outline: 1.0, lineColor: line });
  const t0 = W['thumb' + S];
  const tg = loft([{ y: 0.01 * s, w: 0.011 * s, d: 0.011 * s }, { y: -0.015 * s, w: 0.0105 * s, d: 0.0105 * s }, { y: -0.04 * s, w: 0.009 * s, d: 0.009 * s }, { y: -0.05 * s, w: 0.004 * s, d: 0.004 * s }], { nr: 10, sub: 2 });
  tg.rotateX(-0.55); tg.rotateZ(sx * 0.25); tg.translate(t0.x, t0.y, t0.z);
  ctx.rigid(tg, mat, 'thumb' + S, { outline: 1.0, lineColor: line });
}

function buildShoe(ctx, S, sx, o) {
  const { D, W } = ctx, s = D.s * (D.fem ? 0.92 : 1);
  const a = W['ankle' + S];
  const g0 = -a.y;                                   // ground in ankle-local
  const low = o.type === 'loafer' ? 0.82 : 1;
  // rings along forward axis f: [f, halfWidth, centreY(rel ankle), up, down]
  const R = [[-0.074, 0.014, -0.032, 0.024, 0.024], [-0.066, 0.04, -0.03, 0.05, 0.04], [-0.03, 0.049, -0.024, 0.06 * low, 0.048], [0.03, 0.051, -0.034, 0.05 * low, 0.04],
    [0.09, 0.053, -0.044, 0.04 * low, 0.031], [0.14, 0.05, -0.05, 0.032 * low, 0.025], [0.175, 0.042, -0.054, 0.025 * low, 0.021], [0.195, 0.026, -0.058, 0.016, 0.016], [0.203, 0.006, -0.06, 0.005, 0.005]];
  const mkRings = (k, dw, top) => R.map(([f, w, cy, up, dn]) => ({ y: f * s, w: (w + dw) * s, df: dn * s * k, db: (top ?? up) * s * k, cz: -cy * s, p: 2.6 }));
  const upper = loft(mkRings(1, 0), { nr: 22, sub: 3 });
  upper.rotateX(Math.PI / 2);
  upper.translate(a.x, a.y + 0.004, a.z);
  const shoeMat = { color: o.color, shade: o.shade || autoShade(o.color), term: -0.1 };
  ctx.rigid(upper, shoeMat, 'ankle' + S, { outline: 1.3, lineColor: o.line || autoLine(o.color, 0.35) });
  // sole: flat slab following the outline
  const sole = loft(R.map(([f, w]) => ({ y: f * s * 1.03 - 0.002, w: (w + 0.005) * s, df: 0.012 * s, db: 0.012 * s, cz: (-g0 - 0.012 * s) * -1, p: 5 })), { nr: 22, sub: 2 });
  sole.rotateX(Math.PI / 2);
  // after rotation: ring 'cz' -> -y ; we set cz so that the sole sits on the ground
  const sp = sole.attributes.position; for (let i = 0; i < sp.count; i++) sp.setY(i, sp.getY(i));
  sole.computeBoundingBox(); const by = sole.boundingBox.min.y;
  sole.translate(a.x, a.y + (g0 - by), a.z);
  ctx.rigid(sole, { color: o.sole, shade: autoShade(o.sole, 0.75), term: -0.1 }, 'ankle' + S, { outline: 1.2, lineColor: autoLine(o.sole, 0.35) });
}

/* open summer shirt over the tee (front open, short sleeves separate) */
function buildOpenShirt(ctx, TR, o) {
  const { D } = ctx, s = D.s;
  const yTop = 1.428 * s, yBot = o.hem * s;
  const fn = (u, v) => {
    const y = lerp(yTop, yBot, v);
    const gap = lerp(0.52, 0.42, v) + 0.06 * Math.sin(v * 3.0);
    const a = lerp(gap, TAU - gap, u);
    const r = ringAtY(TR, Math.max(y, 0.86 * s));
    const off = (0.011 + 0.03 * v * v + (y < 1.0 * s ? 0.012 : 0)) * s;
    const p = ringPoint({ ...r, w: Math.max(r.w, 0.128 * s), df: Math.max(r.df, 0.082 * s), db: Math.max(r.db, 0.083 * s) }, a, off);
    // front panels hang a bit forward of the body
    const front = Math.max(0, Math.cos(a)); p[2] += front * 0.006 * s * v;
    return p;
  };
  const g = shell(fn, 56, 26, 0.0055 * s);
  ctx.skinned(g, { color: o.color, shade: o.shade, term: -0.08, backDim: 0.85 }, ['hips:0.4', 'spine:0.4', 'chest:0.4', 'neck:0.6',
    { j: 'shoulderL', a: ctx.W.shoulderL.clone().add(new THREE.Vector3(-0.02, 0.02, 0)), b: ctx.W.shoulderL.clone().add(new THREE.Vector3(0, -0.04, 0)) },
    { j: 'shoulderR', a: ctx.W.shoulderR.clone().add(new THREE.Vector3(0.02, 0.02, 0)), b: ctx.W.shoulderR.clone().add(new THREE.Vector3(0, -0.04, 0)) }],
  { name: 'openShirt', lineColor: o.line || '#5d6475', outline: 1.4 });
  // fold lines: a few thin dark creases as small strands on the back + pocket
  if (o.pocket) {
    const r = ringAtY(TR, 1.27 * s); const p = ringPoint(r, 0.55, 0.0175 * s);
    const pg = shell((u, v) => { const a = lerp(0.42, 0.8, u), y = lerp(1.3 * s, 1.22 * s, v); const rr = ringAtY(TR, y); const q = ringPoint(rr, a, 0.0185 * s); return q; }, 6, 6, 0.002 * s);
    ctx.skinned(pg, { color: o.color, shade: o.shade, term: -0.08 }, ['chest'], { name: 'pocket', lineColor: o.line || '#5d6475', outline: 0.9 });
  }
}

function buildSleeves(ctx, o) {
  const { D, W } = ctx, s = D.s;
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    const sh = W['shoulder' + S];
    const len = o.len * s, rk = (D.fem ? 0.88 : 1);
    const fn = (u, v) => {
      const a = u * TAU;
      let y, rx, rz;
      if (v < 0.35) { const t = v / 0.35, q = Math.sin(t * Math.PI / 2); y = sh.y + 0.042 * s * Math.cos(t * Math.PI / 2); rx = 0.057 * s * Math.pow(q, 0.7) * rk; rz = 0.054 * s * Math.pow(q, 0.7) * rk; }
      else { const t = (v - 0.35) / 0.65; y = sh.y - t * len; rx = lerp(0.056, 0.054 + (o.flare || 0.004), t) * s * rk; rz = lerp(0.053, 0.052 + (o.flare || 0.004), t) * s * rk; }
      return [sh.x + Math.sin(a) * rx + sx * 0.004 * s, y, sh.z + Math.cos(a) * rz];
    };
    const g = shell(fn, 28, 14, 0.005 * s, { closedU: true, rimV0: false });
    const mat = o.cuff ? { color: o.color, shade: o.shade, term: -0.08, map: stripeTex(o.color, o.cuff, 0.86, 0.94, 'cuff') } : { color: o.color, shade: o.shade, term: -0.08 };
    ctx.skinned(g, mat, ['chest:0.7', 'shoulder' + S], { name: 'sleeve' + S, lineColor: o.line || '#5d6475', outline: 1.35 });
  }
}

function buildShirtCollar(ctx, TR, o) {
  const { D } = ctx, s = D.s;
  const fn = (u, v) => {
    const a = lerp(0.42, TAU - 0.42, u);
    const fr = sstep(1.25, 0.42, Math.min(a, TAU - a));            // 1 near the front ends
    const yIn = (1.462 - 0.01 * fr) * s;
    const yOut = (1.415 - 0.075 * fr) * s;
    const y = lerp(yIn, yOut, v);
    const rIn = 0.052 * s * (1 + 0.15 * fr);
    if (v < 0.3) { // stand part around the neck
      const t = v / 0.3;
      const yy = lerp(yIn, yIn - 0.022 * s, t);
      const rr = rIn + 0.012 * s * t;
      return [Math.sin(a) * rr * 1.18, yy, Math.cos(a) * rr - 0.004 * s];
    }
    const t = (v - 0.3) / 0.7;
    const r = ringAtY(TR, lerp(yIn - 0.022 * s, yOut, t));
    const base = ringPoint({ ...r, w: Math.max(r.w, 0.062 * s), df: Math.max(r.df, 0.052 * s), db: Math.max(r.db, 0.05 * s) }, a + (a < Math.PI ? -1 : 1) * 0.12 * fr * t, (0.02 + 0.01 * Math.sin(t * Math.PI)) * s);
    return [lerp(Math.sin(a) * (rIn + 0.012 * s) * 1.18, base[0], sstep(0, 0.4, t)), base[1], lerp(Math.cos(a) * (rIn + 0.012 * s) - 0.004 * s, base[2], sstep(0, 0.4, t))];
  };
  const g = shell(fn, 48, 10, 0.004 * s);
  ctx.skinned(g, { color: o.color, shade: o.shade, term: -0.08 }, ['chest:0.6', 'neck'], { name: 'collar', lineColor: o.line || '#5d6475', outline: 1.3 });
}

function buildSailor(ctx, TR, o) {
  const { D, W } = ctx, s = D.s;
  // edges as (angle, y) polylines on the torso surface (left half: angle 0 -> PI)
  const outer = [[0.02, 1.2], [0.55, 1.29], [1.05, 1.37], [1.5, 1.395], [2.05, 1.392], [2.3, 1.33], [2.33, 1.2], [2.6, 1.185], [Math.PI, 1.185]];
  const inner = [[0.02, 1.215], [0.3, 1.3], [0.62, 1.39], [1.0, 1.425], [1.6, 1.44], [2.3, 1.438], [2.7, 1.434], [Math.PI, 1.432]];
  const resample = (pl, n) => {
    const L = [0]; for (let i = 1; i < pl.length; i++) L.push(L[i - 1] + Math.hypot((pl[i][0] - pl[i - 1][0]) * 0.13, pl[i][1] - pl[i - 1][1]));
    const out = []; for (let k = 0; k <= n; k++) { const d = k / n * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const t = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); out.push([lerp(pl[i - 1][0], pl[i][0], t), lerp(pl[i - 1][1], pl[i][1], t)]); }
    return out;
  };
  const N = 40, Ro = resample(outer, N), Ri = resample(inner, N);
  const full = (arr) => [...arr.map(([a, y]) => [a, y]), ...arr.slice(0, -1).reverse().map(([a, y]) => [TAU - a, y])];
  const O = full(Ro), I = full(Ri), M = O.length - 1;
  const fn = (u, v) => {
    const k = clamp(u * M, 0, M), i = Math.min(Math.floor(k), M - 1), t = k - i;
    const o2 = [lerp(O[i][0], O[i + 1][0], t), lerp(O[i][1], O[i + 1][1], t)], i2 = [lerp(I[i][0], I[i + 1][0], t), lerp(I[i][1], I[i + 1][1], t)];
    const a = lerp(i2[0], o2[0], v), y = lerp(i2[1], o2[1], v) * s;
    const r = ringAtY(TR, y);
    const rr = { ...r, w: Math.max(r.w, 0.06 * s), df: Math.max(r.df, 0.05 * s), db: Math.max(r.db, 0.05 * s) };
    return ringPoint(rr, a, (0.008 + 0.006 * Math.sin(v * Math.PI) + (y > 1.41 * s ? 0.006 : 0)) * s);
  };
  const g = shell(fn, M * 2, 8, 0.004 * s);
  // the stripe is drawn in canvas as white*stripe; material multiplies base (navy) -> we instead pass base white and paint navy
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const gg = c.getContext('2d');
  gg.fillStyle = o.color; gg.fillRect(0, 0, 4, 128); gg.fillStyle = o.stripe; gg.fillRect(0, Math.round((1 - 0.88) * 128), 4, Math.round(0.07 * 128));
  const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; t2.generateMipmaps = false; t2.minFilter = THREE.LinearFilter;
  ctx.skinned(g, { color: '#ffffff', shade: '#9ea6cc', term: -0.08, map: t2 }, ['chest:0.5', 'neck:0.8', 'spine:0.6'], { name: 'sailorCollar', lineColor: autoLine(o.color, 0.5), outline: 1.35 });
  // neckerchief: knot + two tails
  const vY = 1.2 * s, r0 = ringAtY(TR, vY), vp = ringPoint(r0, 0, 0.022 * s);
  const knot = loft([{ y: 0.016, w: 0.003, d: 0.003 }, { y: 0.012, w: 0.016, d: 0.009 }, { y: 0, w: 0.02, d: 0.011 }, { y: -0.012, w: 0.015, d: 0.009 }, { y: -0.016, w: 0.003, d: 0.003 }].map(q => ({ ...q, y: q.y * s, w: q.w * s, d: q.d * s })), { nr: 16, sub: 2 });
  knot.translate(vp[0], vp[1], vp[2] + 0.006 * s);
  const scarf = { color: o.scarf, shade: autoShade(o.scarf, 0.62), term: -0.1 };
  ctx.skinned(knot, scarf, ['chest'], { name: 'scarfKnot', lineColor: autoLine(o.scarf, 0.3), outline: 1.2 });
  for (const sx of [-1, 1]) {
    const pts = [new THREE.Vector3(vp[0] + sx * 0.004, vp[1] - 0.005 * s, vp[2] + 0.004 * s), new THREE.Vector3(vp[0] + sx * 0.016 * s, vp[1] - 0.06 * s, vp[2] + 0.012 * s),
      new THREE.Vector3(vp[0] + sx * 0.03 * s, vp[1] - 0.14 * s, vp[2] + 0.006 * s)];
    const tg = strand(pts, { width: t => (0.008 + 0.024 * t) * s * (t > 0.85 ? Math.max(0.05, (1 - t) / 0.15) : 1), thick: () => 0.0025 * s, out: () => new THREE.Vector3(0, 0, 1), seg: 12, ns: 8, arch: 0.1 });
    tg.deleteAttribute('aT');
    ctx.skinned(tg, scarf, ['chest'], { name: 'scarfTail', lineColor: autoLine(o.scarf, 0.3), outline: 1.1 });
  }
}

function buildSkirt(ctx, TR, o) {
  const { D } = ctx, s = D.s;
  const yTop = o.top * s, yHem = o.hem * s, NP = o.pleats || 24;
  const rw = ringAtY(TR, yTop);
  const fn = (u, v) => {
    const a = u * TAU, y = lerp(yTop, yHem, v);
    const fl = Math.pow(v, 0.9);
    const rx = lerp(rw.w + 0.012 * s, o.flareX * s, fl), rzf = lerp(rw.df + 0.012 * s, o.flareZ * s, fl), rzb = lerp(rw.db + 0.012 * s, o.flareZ * 1.08 * s, fl);
    const ph = (a / TAU) * NP, f = ph - Math.floor(ph);
    const saw = (f < 0.78 ? f / 0.78 : (1 - f) / 0.22) - 0.5;               // knife pleats
    const amp = (0.022 * Math.pow(v, 0.8)) * s;
    const x = Math.sin(a) * (rx + saw * amp), z = (Math.cos(a) >= 0 ? rzf : rzb) * Math.cos(a) + Math.cos(a) * saw * amp;
    return [x, y, z + 0.006 * s];
  };
  const g = shell(fn, NP * 6, 12, 0.005 * s, { closedU: true });
  g.deleteAttribute('normal'); g.computeVertexNormals();
  const fixed = (p) => {
    const v = clamp((yTop - p.y) / (yTop - yHem), 0, 1);
    const leg = Math.pow(v, 1.2) * 0.85 * sstep(-0.12 * s, 0.06 * s, p.z);
    const l = sstep(-0.06 * s, 0.06 * s, p.x);
    return [['hips', 1 - leg], ['hipL', leg * l], ['hipR', leg * (1 - l)]].filter(e => e[1] > 1e-4);
  };
  ctx.skinned(g, { color: o.color, shade: o.shade, term: -0.02, soft: 0.02, rimAmt: 0.0 }, ['hips'], { name: 'skirt', lineColor: autoLine(o.color, 0.45), outline: 1.4, fixed });
}

function buildCoat(ctx, TR, o) {
  const { D, W } = ctx, s = D.s;
  const yTop = 1.432 * s, yHem = o.hem * s;
  const fn = (u, v) => {
    const y = lerp(yTop, yHem, v);
    const gap = 0.02 + 0.2 * sstep(0.55, 1.0, v);
    const a = lerp(gap, TAU - gap, u);
    let r;
    if (y > 0.88 * s) {
      r = ringAtY(TR, y);
      // a coat hangs straight from the chest: no waist pinch (avoids a concave crease at the hips)
      const k = sstep(1.25 * s, 1.0 * s, y), r0 = ringAtY(TR, 0.88 * s);
      r = { ...r, w: Math.max(r.w, lerp(0.07 * s, r0.w, k)), df: Math.max(r.df, lerp(0.055 * s, r0.df, k)), db: Math.max(r.db, lerp(0.055 * s, r0.db, k)) };
    }
    else { const r0 = ringAtY(TR, 0.88 * s), t = (0.88 * s - y) / (0.88 * s - yHem); r = { ...r0, y, w: lerp(r0.w, o.flare * s, t), df: lerp(r0.df, o.flare * 0.78 * s, t), db: lerp(r0.db, o.flare * 0.85 * s, t) }; }
    const off = (0.014 + 0.012 * sstep(1.0, 0.6, y / s)) * s;
    const p = ringPoint(r, a, off);
    // overlap the front edges a little (double-breasted look)
    if (Math.cos(a) > 0.9) p[2] += 0.004 * s;
    return p;
  };
  const g = shell(fn, 60, 40, 0.007 * s);
  const fixed = (p) => {
    if (p.y > 0.9 * s) return null;
    const v = clamp((0.9 * s - p.y) / (0.9 * s - yHem), 0, 1), leg = 0.45 * v * sstep(-0.1 * s, 0.08 * s, p.z), l = sstep(-0.05 * s, 0.05 * s, p.x);
    return [['hips', 1 - leg], ['hipL', leg * l], ['hipR', leg * (1 - l)]];
  };
  ctx.skinned(g, { color: o.color, shade: o.shade, term: -0.05 }, ['hips:0.4', 'spine:0.4', 'chest:0.4', 'neck:0.6',
    { j: 'shoulderL', a: W.shoulderL.clone().add(new THREE.Vector3(-0.02, 0.02, 0)), b: W.shoulderL.clone().add(new THREE.Vector3(0, -0.04, 0)) },
    { j: 'shoulderR', a: W.shoulderR.clone().add(new THREE.Vector3(0.02, 0.02, 0)), b: W.shoulderR.clone().add(new THREE.Vector3(0, -0.04, 0)) }],
  { name: 'coat', lineColor: autoLine(o.color, 0.3), outline: 1.6, fixed });
  // high collar
  const cf = (u, v) => {
    const a = lerp(0.45, TAU - 0.45, u), y = lerp(D.neckY + 0.015 * s, D.neckY + 0.1 * s, v);
    const r = lerp(0.075, 0.088, v) * s * (1 + 0.15 * Math.max(0, Math.cos(a)));
    return [Math.sin(a) * r * 1.12, y, Math.cos(a) * r - 0.01 * s];
  };
  ctx.skinned(shell(cf, 40, 6, 0.006 * s), { color: o.color, shade: o.shade, term: -0.05 }, ['chest:0.5', 'neck'], { name: 'coatCollar', lineColor: autoLine(o.color, 0.3), outline: 1.5 });
  // long sleeves
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    const sh = W['shoulder' + S];
    const rings = ARM.filter(r => r[0] > -0.51).map(([dy, w, d], i) => { const o2 = i === 0 ? -0.006 : dy > -0.06 ? 0.009 : 0.016; return { y: sh.y + dy * s + (i === 0 ? 0.004 * s : 0), w: (w + o2) * s, d: (d + o2) * s, cx: sh.x - sx * 0.006 * s, cz: sh.z }; });
    rings[rings.length - 1].w += 0.006 * s; rings[rings.length - 1].d += 0.006 * s;
    const sf = (u, v) => ringPoint(ringAt(rings, v * (rings.length - 1)), u * TAU);
    const sg = shell(sf, 22, 30, 0.006 * s, { closedU: true, rimV0: false });
    sg.computeVertexNormals();
    ctx.skinned(sg, { color: o.color, shade: o.shade, term: -0.05 }, ['chest:0.6', 'shoulder' + S, 'elbow' + S, 'wrist' + S], { name: 'coatSleeve' + S, lineColor: autoLine(o.color, 0.3), outline: 1.5 });
  }
  // buttons
  for (let i = 0; i < 4; i++) {
    const y = (1.2 - i * 0.13) * s; const r = y > 0.88 * s ? ringAtY(TR, y) : ringAtY(TR, 0.9 * s);
    const p = ringPoint(r, 0.18, 0.024 * s + (y < 0.9 * s ? 0.012 * s : 0));
    const bg = new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.004 * s, 14); bg.rotateX(Math.PI / 2); bg.translate(p[0], p[1], p[2]);
    ctx.skinned(bg, { color: '#141418', shade: '#08080c' }, ['spine', 'chest', 'hips'], { outline: 0.8, lineColor: '#000000' });
  }
}

function buildHat(ctx, o) {
  const { D, W } = ctx, H = D.H;
  const prof = [[0, 0.115], [0.07, 0.112], [0.115, 0.104], [0.128, 0.085], [0.128, 0.03], [0.134, 0.01], [0.2, 0.004], [0.265, -0.012], [0.272, -0.02], [0.262, -0.018], [0.2, -0.006], [0.13, -0.002]].map(([r, y]) => new THREE.Vector2(r * H / 0.235 * 1.05, y * H / 0.235 * 1.05));
  const g = new THREE.LatheGeometry(prof, 48);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const mg = mergeVerts(g); mg.computeVertexNormals();
  mg.rotateX(0.1); mg.translate(0, D.chinY + 0.8 * H, -0.01 * H);
  ctx.rigid(mg, { color: o.color, shade: autoShade(o.color, 0.55), term: -0.1, rimAmt: 0.5 }, 'head', { outline: 1.6, lineColor: '#000000' });
  const band = new THREE.CylinderGeometry(0.13 * H / 0.235 * 1.05, 0.131 * H / 0.235 * 1.05, 0.026 * H / 0.235, 48, 1, true);
  band.translate(0, 0.03 * H / 0.235, 0); band.rotateX(0.1); band.translate(0, D.chinY + 0.8 * H, -0.01 * H);
  const bm = new THREE.Mesh(band, ctx.toon({ color: o.band, shade: autoShade(o.band, 0.55), side: THREE.DoubleSide, rimAmt: 0 }));
  band.translate(-W.head.x, -W.head.y, -W.head.z); ctx.J.head.add(bm);
}
function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), pos = [], remap = [];
  for (let i = 0; i < p.count; i++) { const k = `${Math.round(p.getX(i) * 1e5)},${Math.round(p.getY(i) * 1e5)},${Math.round(p.getZ(i) * 1e5)}`; if (!map.has(k)) { map.set(k, pos.length / 3); pos.push(p.getX(i), p.getY(i), p.getZ(i)); } remap.push(map.get(k)); }
  const idx = g.index ? Array.from(g.index.array).map(i => remap[i]) : remap;
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); return out;
}

function buildJar(ctx, o) {
  const { D, W, U } = ctx, s = D.s;
  const jarG = new THREE.Group(); jarG.name = 'jar';
  // jar sits in the right hand: local to 'wristR', held below/inside the palm
  const R = 0.065, Hh = 0.17;
  const prof = [[0.0, 0], [R * 0.9, 0], [R, 0.012], [R, Hh * 0.82], [R * 0.82, Hh * 0.9], [R * 0.72, Hh * 0.95], [R * 0.74, Hh]].map(([r, y]) => new THREE.Vector2(r, y));
  const glassGeo = new THREE.LatheGeometry(prof, 40);
  const glass = new THREE.Mesh(glassGeo, new THREE.ShaderMaterial({
    uniforms: { uTint: { value: new THREE.Color('#bfe0e6') } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN, vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uTint; varying vec3 vN, vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float a = 0.08 + 0.55*smoothstep(0.55, 0.95, f); vec3 c = mix(uTint, vec3(1.0), smoothstep(0.85, 0.97, f)); gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
    }`,
  }));
  glass.renderOrder = 2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.028, 32), ctx.toon({ color: '#6d5a3c', shade: '#3e3324' }));
  lid.position.y = Hh + 0.012;
  // swirling shadow inside: noise-displaced sphere with an animated shader
  const inner = new THREE.Mesh(new THREE.SphereGeometry(R * 0.78, 40, 28), new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ vec3 p = position; float a = atan(p.z, p.x); float k = sin(a*3.0 + p.y*40.0 - uTime*2.0)*0.25 + sin(a*5.0 - p.y*25.0 + uTime*1.3)*0.15;
        p *= 1.0 + k*0.35; p.y *= 1.35; vP = position; vec4 w = modelMatrix*vec4(p,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main(){ float a = atan(vP.z, vP.x); float sw = sin(a*4.0 + vP.y*60.0 - uTime*3.0); float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        vec3 c = vec3(0.02, 0.0, 0.02) + vec3(0.9, 0.05, 0.08) * (smoothstep(0.6, 1.0, sw) * 0.35 + smoothstep(0.55, 0.9, f) * 1.2);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  inner.position.y = Hh * 0.45;
  jarG.add(inner, glass, lid);
  // position: centre the jar in the right palm (hand hangs along -y; palm faces +x for the right hand)
  jarG.position.set(0.055 * s, -0.11 * s, 0.0);
  jarG.rotation.set(0, 0, 0);
  ctx.J.wristR.add(jarG);
  addOutlineLocal(ctx, lid, '#1e160c');
  return { jar: jarG, update(t) { inner.rotation.y = t * 0.8; } };
}

function buildClip(ctx, o) {
  // star hair clip on the head (head-local units via headRoot is not available here -> attach to head bone)
  const { D, W } = ctx, H = D.H;
  const sh = new THREE.Shape(); const n = 5, R1 = 0.045 * H / 0.235 * (o.size || 1), R2 = R1 * 0.45;
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU + Math.PI / 2, r = i % 2 ? R2 : R1; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.01 * H / 0.235, bevelEnabled: true, bevelThickness: 0.004 * H / 0.235, bevelSize: 0.004 * H / 0.235, bevelSegments: 2 });
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); const mg = mergeVerts(g); mg.computeVertexNormals();
  mg.rotateY(o.rotY ?? 0.9); mg.rotateZ(o.rotZ ?? 0.3);
  const p = o.pos; // head units
  mg.translate(p[0] * H, D.chinY + p[1] * H, (p[2] + 0.05) * H);
  ctx.rigid(mg, { color: o.color, shade: autoShade(o.color, 0.72), term: -0.2 }, 'head', { outline: 1.2, lineColor: '#8a5a00' });
}
