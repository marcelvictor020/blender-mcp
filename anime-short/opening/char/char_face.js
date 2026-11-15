// Head geometry (anime proportions, built in "head units": chin y=0, crown y=1, face toward +z) and the
// FacePainter: a canvas face layer (eyes, lids, lashes, irises, brows, nose tick, mouth shapes, blush, extras)
// that the head shader projects onto the face front (u = x + 0.5, v = y).
import * as THREE from 'three';
import { grid, loft, clamp, lerp, sstep, spow, TAU } from './char_geo.js';

/* ------------------------------------------------------------------ */
/* Head shape                                                          */
/* ------------------------------------------------------------------ */
export function headShape(o = {}) {
  const S = {
    cy: 0.56, top: 0.44, W0: 0.43, F0: 0.40, B0: 0.47,
    cheekW: 0.405, cheekH: 0.36, chinW: 0.04, jawPow: 1.7, faceZ: 0.385, chinZ: 0.355, chinRound: 0.06,
    faceP: 2.7, nose: 0.016, jawFwd: 0.2, ...o,
  };
  const eCr = h => Math.sqrt(Math.max(0, 1 - ((h - S.cy) / S.top) ** 2));
  S.W = h => {
    if (h >= S.cy) return S.W0 * eCr(h);
    if (h >= S.cheekH) return lerp(S.cheekW, S.W0, sstep(S.cheekH, S.cy, h));
    const t = clamp(h / S.cheekH, 0, 1);
    return S.chinW + (S.cheekW - S.chinW) * (1 - Math.pow(1 - t, S.jawPow)) * Math.sqrt(sstep(-0.02, 0.06, h) * 0.6 + 0.4);
  };
  S.zf = h => {
    if (h >= 0.5) return Math.max(S.F0 * eCr(h), h >= S.cy ? 0 : S.faceZ);
    if (h >= S.chinRound) return lerp(S.chinZ, S.faceZ, (h - S.chinRound) / (0.5 - S.chinRound));
    const t = h / S.chinRound; return S.chinZ - 0.05 * (1 - Math.sqrt(1 - (1 - t) ** 2));
  };
  S.zb = h => {
    const skull = h >= S.cy ? -S.B0 * eCr(h) : -S.B0 * Math.sqrt(Math.max(0, 1 - ((h - S.cy) / (S.top + 0.02)) ** 2)) * sstep(0.0, 0.32, h);
    const jaw = (S.chinZ - 0.03) - 2.55 * h;
    return Math.min(skull, jaw);
  };
  S.z0 = h => h >= S.cheekH ? 0 : lerp(0, S.jawFwd, (S.cheekH - h) / S.cheekH);
  S.pf = h => h > 0.75 ? 2.0 : lerp(2.15, S.faceP, sstep(0.75, 0.55, h)) * (h < 0.12 ? lerp(0.85, 1, h / 0.12) : 1);
  /** point on the head surface for height h, angle a (0 front, PI/2 = +x) */
  S.point = (h, a) => {
    const W = S.W(h), zf = S.zf(h), zb = S.zb(h);
    const z0 = clamp(S.z0(h), zb + 0.02, zf - 0.02);
    const s = Math.sin(a), c = Math.cos(a);
    let x, z;
    if (c >= 0) { const e = 2 / S.pf(h); x = W * spow(s, e); z = z0 + (zf - z0) * spow(c, e); }
    else { x = W * spow(s, 1); z = z0 + (z0 - zb) * c; }
    // tiny nose bump on the face plane
    if (c > 0 && S.nose) z += S.nose * Math.exp(-(x / 0.028) ** 2) * sstep(0.34, 0.265, h) * sstep(0.215, 0.255, h);
    return [x, h, z];
  };
  return S;
}

export function headGeometry(S, { nu = 64, nv = 56 } = {}) {
  const hv = v => 0.5 + 0.5 * Math.cos(Math.PI * v);          // crown (v=0) -> chin (v=1), dense at the poles
  const g = grid((u, v) => S.point(hv(v), u * TAU), nu, nv, { closedU: true, capStart: [0, 1.0, 0], capEnd: S.point(0.0005, 0) });
  return g;
}

export function earGeometry() {
  // flattened D-shaped ear (local: +x outward, y up), ~0.07 x 0.13 head units
  const rings = [
    { y: 0.075, w: 0.002, df: 0.004, db: 0.004 },
    { y: 0.065, w: 0.016, df: 0.03, db: 0.022 },
    { y: 0.03, w: 0.02, df: 0.042, db: 0.03 },
    { y: -0.01, w: 0.019, df: 0.038, db: 0.026 },
    { y: -0.045, w: 0.015, df: 0.026, db: 0.018 },
    { y: -0.06, w: 0.004, df: 0.008, db: 0.006 },
  ];
  const g = loft(rings, { nr: 16, sub: 3 });
  g.rotateY(Math.PI / 2);           // depth axis -> x... we want the flat side facing outward: swap so 'w' is thickness along x
  g.rotateY(-Math.PI / 2);
  return g;
}

/* ------------------------------------------------------------------ */
/* Face painter                                                        */
/* ------------------------------------------------------------------ */
const C = (hex) => new THREE.Color(hex);
const css = (c, a = 1) => { const cc = c.clone ? c.clone() : C(c); cc.convertLinearToSRGB?.call; return `rgba(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)},${a})`; };
function mixHex(a, b, t) { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, t).getHexString(); }
// NOTE: THREE.Color(hex) converts to linear; for canvas we want sRGB values, so mix in sRGB via getHexString (which
// converts back to sRGB) and use plain hex strings for drawing.
function mixS(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  const m = s => Math.round(lerp(ch(pa, s), ch(pb, s), t));
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
function rgba(hex, a) { const p = parseInt(hex.slice(1), 16); return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`; }

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}
const lp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const lpc = (A, B, t) => A.map((p, i) => lp2(p, B[i], t));

/** tapered stroke polygon along a polyline; wfn(t) = full width */
function taper(g, pts, wfn) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = wfn(i / (pts.length - 1)) / 2;
    L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  g.beginPath(); g.moveTo(...L[0]); for (const p of L) g.lineTo(...p); for (let i = R.length - 1; i >= 0; i--) g.lineTo(...R[i]); g.closePath(); g.fill();
}
const sampleBez = (c, n = 24) => { const o = []; for (let i = 0; i <= n; i++) o.push(bez(c[0], c[1], c[2], c[3], i / n)); return o; };

export const EYE_STYLES = {
  // control points in eye units: x from inner (-1) to outer (+1) corner, y up. upper/lower lids open, closed + happy
  male: {
    upper: [[-1.0, -0.05], [-0.62, 0.78], [0.42, 0.98], [1.0, 0.18]],
    lower: [[-0.96, -0.12], [-0.45, -0.88], [0.5, -0.92], [0.97, -0.08]],
    lash: 'male', crease: 0.55,
  },
  female: {
    upper: [[-1.0, -0.02], [-0.66, 0.86], [0.38, 1.1], [1.02, 0.3]],
    lower: [[-0.95, -0.1], [-0.45, -0.95], [0.48, -0.98], [0.98, -0.12]],
    lash: 'female', crease: 0.75,
  },
  narrow: {
    upper: [[-1.0, -0.1], [-0.5, 0.18], [0.5, 0.26], [1.0, 0.05]],
    lower: [[-1.0, -0.12], [-0.5, -0.05], [0.5, 0.0], [1.0, 0.02]],
    lash: 'male', crease: 0, closedOnly: true,
  },
};
const CLOSED = [[-1.0, -0.22], [-0.45, -0.58], [0.45, -0.58], [1.0, -0.15]];
const HAPPY = [[-1.0, -0.42], [-0.5, 0.28], [0.5, 0.3], [1.0, -0.38]];
const NARROW_SMILE = [[-1.05, -0.35], [-0.45, 0.22], [0.45, 0.26], [1.08, -0.18]];

export class FacePainter {
  constructor(spec, { size = 1536 } = {}) {
    this.spec = spec; this.S = size;
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.bangShadow = [];
    this.key = '';
  }
  // head units -> canvas: x in [-0.5,0.5], y(h) in [0,1]
  begin() { const g = this.g, S = this.S; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S); g.setTransform(S, 0, 0, -S, S / 2, S); g.lineJoin = g.lineCap = 'round'; }

  draw(ex) {
    const key = JSON.stringify(ex);
    if (key === this.key) return false;
    this.key = key;
    const g = this.g, F = this.spec;
    this.begin();
    // forehead shadow cast by the bangs
    if (this.bangShadow.length) {
      g.fillStyle = F.skinShade;
      for (const poly of this.bangShadow) { g.beginPath(); poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); }
    }
    // blush
    const bl = ex.blush ?? F.blush ?? 0.5;
    if (bl > 0) for (const sx of [-1, 1]) {
      g.save(); g.translate(sx * F.blushX, F.blushY); g.scale(1, 0.5);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, F.blushR);
      rg.addColorStop(0, rgba(F.blushColor, 0.55 * bl)); rg.addColorStop(0.55, rgba(F.blushColor, 0.42 * bl)); rg.addColorStop(1, rgba(F.blushColor, 0));
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, F.blushR, 0, TAU); g.fill(); g.restore();
      if (F.blushLines) { g.strokeStyle = rgba('#d0605a', 0.55 * bl); g.lineWidth = 0.0035; for (let k = 0; k < 3; k++) { const x0 = sx * F.blushX - 0.03 + k * 0.022; g.beginPath(); g.moveTo(x0 + 0.008, F.blushY + 0.012); g.lineTo(x0 - 0.004, F.blushY - 0.012); g.stroke(); } }
    }
    // crimson glow halo on the skin (behind the eye)
    for (const side of ['L', 'R']) {
      const glow = ex['glow' + side] || 0; if (!glow) continue;
      const sx = side === 'L' ? 1 : -1;
      const rg = g.createRadialGradient(sx * F.eyeX, F.eyeY, 0.02, sx * F.eyeX, F.eyeY, 0.2);
      rg.addColorStop(0, rgba('#ff2a3a', 0.55 * glow)); rg.addColorStop(1, rgba('#ff2a3a', 0));
      g.fillStyle = rg; g.beginPath(); g.arc(sx * F.eyeX, F.eyeY, 0.2, 0, TAU); g.fill();
      if (glow > 0.4) this.cracks(sx, glow);
    }
    if (F.plaster) this.plaster(F.plaster);
    this.nose(ex);
    this.mouth(ex);
    this.eye(1, ex); this.eye(-1, ex);
    this.brow(1, ex); this.brow(-1, ex);
    this.tex.needsUpdate = true;
    return true;
  }

  eyeFrame(sx) { const F = this.spec; return { cx: sx * F.eyeX, cy: F.eyeY, w: F.eyeW, h: F.eyeH, sx, tilt: F.eyeTilt || 0 }; }
  // eye units -> head units
  E(fr, p) { const x = p[0] * fr.w, y = p[1] * fr.h; const c = Math.cos(fr.tilt), s = Math.sin(fr.tilt); return [fr.cx + fr.sx * (x * c - y * s), fr.cy + (x * s + y * c)]; }

  eye(sx, ex) {
    const g = this.g, F = this.spec, st = EYE_STYLES[F.eyeStyle || 'male'];
    const fr = this.eyeFrame(sx);
    const side = sx > 0 ? 'L' : 'R';
    const blink = clamp(ex.blink ?? 0, 0, 1), happy = clamp(ex.eyeSmile ?? 0, 0, 1);
    let open = st.closedOnly ? 0 : 1 - blink;
    const closedC = st.closedOnly ? (ex.eyeOpen ? st.upper : NARROW_SMILE) : (happy > 0 ? lpc(CLOSED, HAPPY, happy) : CLOSED);
    if (st.closedOnly && ex.eyeOpen) open = ex.eyeOpen;
    const upperOpen = ex.wide ? st.upper.map(p => [p[0], p[1] * 1.08]) : st.upper;
    const up = lpc(closedC, upperOpen, open);
    const lowC = lpc(lpc(st.lower, CLOSED, 0.3), st.lower, open);
    const lineCol = F.lineColor || '#2a1c22';
    const upPts = sampleBez(up.map(p => this.E(fr, p)), 28);
    const loPts = sampleBez(lowC.map(p => this.E(fr, p)), 28);
    const irisHex = ex['eyeColor' + side] || F.iris;
    if (open > 0.06) {
      g.save();
      g.beginPath(); upPts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); for (let i = loPts.length - 1; i >= 0; i--) g.lineTo(...loPts[i]); g.closePath();
      g.clip();
      g.fillStyle = F.sclera || '#fbfbfe'; g.fillRect(fr.cx - 0.2, fr.cy - 0.2, 0.4, 0.4);
      // iris
      const lx = clamp(ex.lookX ?? 0, -1, 1), ly = clamp(ex.lookY ?? 0, -1, 1);
      const icx = fr.cx + lx * F.eyeW * 0.36 + sx * F.irisIn, icy = fr.cy + ly * F.eyeH * 0.28 - F.eyeH * 0.08;
      const rx = F.irisRX, ry = F.irisRY;
      const grd = g.createLinearGradient(0, icy + ry, 0, icy - ry);
      grd.addColorStop(0, mixS(irisHex, '#000000', 0.62)); grd.addColorStop(0.35, mixS(irisHex, '#000000', 0.25));
      grd.addColorStop(0.7, irisHex); grd.addColorStop(1, mixS(irisHex, '#ffffff', 0.45));
      g.fillStyle = grd; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.fill();
      // radial fibres
      g.strokeStyle = rgba('#ffffff', 0.12); g.lineWidth = 0.0022;
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + 0.2; g.beginPath(); g.moveTo(icx + Math.cos(a) * rx * 0.45, icy + Math.sin(a) * ry * 0.45); g.lineTo(icx + Math.cos(a) * rx * 0.88, icy + Math.sin(a) * ry * 0.88); g.stroke(); }
      // lower bounce crescent
      g.save(); g.beginPath(); g.ellipse(icx, icy, rx * 0.92, ry * 0.92, 0, 0, TAU); g.clip();
      g.fillStyle = rgba(mixHexRGB(irisHex, '#ffffff', 0.55), 0.75);
      g.beginPath(); g.ellipse(icx, icy - ry * 0.62, rx * 0.72, ry * 0.36, 0, 0, TAU); g.ellipse(icx, icy - ry * 0.38, rx * 0.8, ry * 0.4, 0, 0, TAU, true); g.fill('evenodd');
      g.restore();
      // ring
      g.strokeStyle = mixS(irisHex, '#000000', 0.7); g.lineWidth = 0.0055;
      g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
      // pupil (round -> slit)
      const slit = clamp(ex['pupilSlit' + side] || 0, 0, 1);
      const prx = lerp(F.pupilR * 0.82, 0.0075, slit), pry = lerp(F.pupilR, ry * 0.9, slit);
      g.fillStyle = mixS(irisHex, '#050208', 0.86);
      pupilPath(g, icx, icy + ry * 0.04, prx, pry, slit); g.fill();
      if (slit > 0.2) { g.strokeStyle = rgba('#ffd0b0', 0.5 * slit); g.lineWidth = 0.002; pupilPath(g, icx, icy + ry * 0.04, prx + 0.003, pry + 0.004, slit); g.stroke(); }
      // lid shadow over sclera/iris top
      const sh = g.createLinearGradient(0, fr.cy + fr.h * 1.0, 0, fr.cy + fr.h * 0.05);
      sh.addColorStop(0, rgba(F.lidShadow || '#4a3d6e', 0.55)); sh.addColorStop(1, rgba(F.lidShadow || '#4a3d6e', 0));
      g.fillStyle = sh; g.beginPath(); upPts.forEach((p, i) => i ? g.lineTo(p[0], p[1] - fr.h * 0.6) : g.moveTo(p[0], p[1] + 0.05)); for (let i = upPts.length - 1; i >= 0; i--) g.lineTo(upPts[i][0], upPts[i][1] + 0.05); g.fill();
      // highlights (same screen side for both eyes)
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(icx - rx * 0.38, icy + ry * 0.38, rx * 0.36, ry * 0.3, -0.5, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(icx + rx * 0.42, icy - ry * 0.42, rx * 0.15, ry * 0.12, 0, 0, TAU); g.fill();
      if (F.sparkle) { g.beginPath(); g.ellipse(icx - rx * 0.05, icy - ry * 0.05, rx * 0.08, ry * 0.07, 0, 0, TAU); g.fill(); }
      g.restore();
      // lower lid line (outer 2/3)
      g.fillStyle = F.lowerLid || '#7a4a48';
      const lo = loPts.slice(Math.round(loPts.length * 0.3));
      taper(g, lo, t => 0.0012 + 0.0042 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.4 + 0.6 * t));
      // crease
      if (st.crease && open > 0.5) {
        g.fillStyle = rgba(F.creaseColor || '#b07a70', 0.9 * st.crease);
        const cr = sampleBez(up.map(p => this.E(fr, [p[0] * 0.92 + 0.08, p[1] + 0.28])), 20).slice(8, 21);
        taper(g, cr, t => 0.0032 * Math.sin(Math.PI * t));
      }
    }
    // upper lid line (+ lashes)
    g.fillStyle = lineCol;
    const thick = F.lidThick || 0.016;
    const closedness = 1 - open;
    taper(g, upPts, t => thick * lerp(0.3 + 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.6) * (0.55 + 0.6 * t), 0.55 + 0.45 * Math.sin(Math.PI * t), closedness));
    // outer corner wing / lashes
    const o = upPts[upPts.length - 1], o2 = upPts[upPts.length - 4];
    const dir = [o[0] - o2[0], o[1] - o2[1]]; const dl = Math.hypot(...dir); dir[0] /= dl; dir[1] /= dl;
    const flip = closedness > 0.5 && !happy ? -1 : 1;
    if (st.lash === 'female') {
      const L = [[0.05, 0.25], [0.045, -0.05], [0.032, 0.6]];
      for (const [len, ang] of L) {
        const a = Math.atan2(dir[1], dir[0]) + sx * ang * flip;
        const base = [o[0] - dir[0] * 0.012, o[1] - dir[1] * 0.012];
        const tip = [base[0] + Math.cos(a) * len * 0.62, base[1] + Math.sin(a) * len * 0.62];
        taper(g, [base, lp2(base, tip, 0.5), tip], t => 0.011 * (1 - t) + 0.0005);
      }
    } else {
      const a = Math.atan2(dir[1], dir[0]) - sx * 0.15 * flip;
      const base = [o[0] - dir[0] * 0.01, o[1] - dir[1] * 0.01], tip = [base[0] + Math.cos(a) * 0.026, base[1] + Math.sin(a) * 0.026];
      taper(g, [base, lp2(base, tip, 0.5), tip], t => thick * 0.8 * (1 - t) + 0.0005);
    }
    // inner corner tick
    if (open > 0.4) { const i0 = upPts[0]; taper(g, [i0, [i0[0] + sx * 0.004, i0[1] - 0.012]], t => 0.004 * (1 - t) + 0.001); }
  }

  brow(sx, ex) {
    const g = this.g, F = this.spec; if (F.noBrows) return;
    const b = ex.brow || 0;                         // + = worried (inner up), - = angry (inner down)
    const lift = (ex.browUp || 0) * 0.02;
    const x0 = sx * F.browIn, x1 = sx * F.browOut;
    const yIn = F.browY + b * 0.03 + lift, yOut = F.browY + F.browArch * 0.4 - b * 0.006 + lift;
    const pts = sampleBez([[x0, yIn], [lerp(x0, x1, 0.35), yIn + F.browArch + b * 0.01], [lerp(x0, x1, 0.75), yOut + F.browArch * 0.8], [x1, yOut - 0.006]], 20);
    g.fillStyle = F.browColor;
    taper(g, pts, t => F.browThick * (0.55 + 0.6 * Math.sin(Math.PI * (0.15 + t * 0.7))) * (t > 0.85 ? (1 - t) / 0.15 * 0.7 + 0.3 : 1));
  }

  nose() {
    const g = this.g, F = this.spec;
    g.fillStyle = F.noseColor || '#b9837a';
    const nx = F.noseX ?? 0.012, ny = F.noseY ?? 0.262;
    taper(g, [[nx + 0.004, ny + 0.022], [nx + 0.002, ny + 0.008], [nx - 0.007, ny - 0.004]], t => 0.0026 + 0.002 * t);
  }

  mouth(ex) {
    const g = this.g, F = this.spec;
    const my = F.mouthY, mw = F.mouthW * (ex.mouthW ?? 1);
    const m = ex.mouth || 'closed';
    const line = F.mouthLine || '#6e3434';
    const shape = typeof m === 'number' ? (m > 0.05 ? 'a' : 'closed') : m;
    const open = typeof m === 'number' ? m : 1;
    g.fillStyle = line;
    if (shape === 'closed') {
      taper(g, sampleBez([[-mw, my + 0.004], [-mw * 0.4, my - 0.002], [mw * 0.4, my - 0.003], [mw, my + 0.003]], 16), t => 0.0028 + 0.0028 * Math.sin(Math.PI * t));
    } else if (shape === 'smile' || shape === 'smirk') {
      const w = mw * (shape === 'smirk' ? 1.9 : 1.35), lift = shape === 'smirk' ? 0.024 : 0.014;
      const pts = sampleBez([[-w, my + lift], [-w * 0.45, my - 0.012], [w * 0.45, my - 0.012], [w, my + lift * (shape === 'smirk' ? 1.25 : 1)]], 20);
      taper(g, pts, t => 0.0022 + 0.0032 * Math.sin(Math.PI * t));
      if (shape === 'smile') for (const s of [-1, 1]) taper(g, [[s * w * 1.02, my + lift + 0.006], [s * w * 1.08, my + lift - 0.003]], () => 0.0022);
    } else {
      // open shapes: 'a', 'o', 'grin', 'shout'
      const k = shape === 'o' ? 0.55 : shape === 'grin' ? 1.4 : shape === 'shout' ? 1.25 : 0.95;
      const w = mw * k, depth = (shape === 'grin' ? 0.042 : shape === 'o' ? 0.05 : shape === 'shout' ? 0.075 : 0.05) * open;
      const top = my + (shape === 'grin' ? 0.01 : 0.006);
      g.beginPath();
      if (shape === 'o') { g.ellipse(0, my - depth * 0.45, w, depth * 0.62, 0, 0, TAU); }
      else {
        g.moveTo(-w, top + (shape === 'grin' ? 0.008 : 0));
        g.bezierCurveTo(-w * 0.4, top - 0.004, w * 0.4, top - 0.004, w, top + (shape === 'grin' ? 0.008 : 0));
        g.bezierCurveTo(w * 0.85, top - depth * 0.9, w * 0.35, top - depth, 0, top - depth);
        g.bezierCurveTo(-w * 0.35, top - depth, -w * 0.85, top - depth * 0.9, -w, top + (shape === 'grin' ? 0.008 : 0));
      }
      g.closePath();
      g.save(); g.clip();
      g.fillStyle = F.mouthIn || '#7a2b33'; g.fillRect(-0.2, my - 0.2, 0.4, 0.4);
      g.fillStyle = F.tongue || '#e0767c'; g.beginPath(); g.ellipse(0, top - depth * 1.05, w * 0.75, depth * 0.55, 0, 0, TAU); g.fill();
      if (shape !== 'o') { g.fillStyle = '#fbf8f6'; g.beginPath(); g.ellipse(0, top + 0.002, w * 0.95, (shape === 'grin' ? 0.016 : 0.0105), 0, 0, TAU); g.fill(); }
      g.restore();
      g.strokeStyle = line; g.lineWidth = 0.0035; g.stroke();
    }
  }

  plaster(p) {
    const g = this.g;
    g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0.35);
    g.fillStyle = '#f2d2b4'; g.strokeStyle = '#b98a6e'; g.lineWidth = 0.0022;
    const w = p.w || 0.075, h = p.h || 0.03;
    g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, h * 0.45); g.fill(); g.stroke();
    g.fillStyle = '#e3bc9a'; g.beginPath(); g.roundRect(-w * 0.18, -h * 0.36, w * 0.36, h * 0.72, h * 0.15); g.fill();
    g.fillStyle = '#c9a080'; for (const dx of [-0.3, 0.3]) for (const dy of [-0.2, 0.2]) { g.beginPath(); g.arc(dx * w, dy * h, 0.0016, 0, TAU); g.fill(); }
    g.restore();
  }

  cracks(sx, glow) {
    const g = this.g, F = this.spec;
    const R = mkr(7 + (sx > 0 ? 1 : 2));
    g.strokeStyle = rgba('#9a0a16', Math.min(1, (glow - 0.4) * 1.8)); g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      let a = (k / 6) * TAU + R() * 0.6 + 0.3, x = sx * F.eyeX + Math.cos(a) * F.eyeW * 1.15, y = F.eyeY + Math.sin(a) * F.eyeH * 1.2;
      g.lineWidth = 0.004; g.beginPath(); g.moveTo(x, y);
      const n = 4 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 0.016 * glow; y += Math.sin(a) * 0.016 * glow; g.lineTo(x, y); g.lineWidth *= 0.8; }
      g.stroke();
    }
  }
}
function mkr(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function mixHexRGB(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const m = s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t)); return '#' + [m(16), m(8), m(0)].map(v => v.toString(16).padStart(2, '0')).join(''); }
function pupilPath(g, x, y, rx, ry, slit) {
  const k = 0.5523, kt = lerp(k, 0.08, slit);       // handle length at top/bottom shrinks -> pointed slit
  g.beginPath();
  g.moveTo(x, y + ry);
  g.bezierCurveTo(x + rx * kt, y + ry, x + rx, y + ry * k, x + rx, y);
  g.bezierCurveTo(x + rx, y - ry * k, x + rx * kt, y - ry, x, y - ry);
  g.bezierCurveTo(x - rx * kt, y - ry, x - rx, y - ry * k, x - rx, y);
  g.bezierCurveTo(x - rx, y + ry * k, x - rx * kt, y + ry, x, y + ry);
  g.closePath();
}
