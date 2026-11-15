// Shared 2D graphic-design kit for the KAGERŌ opening cards (all drawing in 1920x1080 design units).
export const RED = '#d4202c', CREAM = '#f2e6c8', TEAL = '#1f8f8a', INK = '#0e0c10', WHITE = '#fffaf0', CRIMSON = '#ff1e2e';
export const LAT = '"MontserratLocal", "Montserrat", "Arial Black", Arial, sans-serif';
export const CJK = '"Hiragino Kaku Gothic StdN", "Hiragino Sans", "Yu Gothic", "YuGothic", "Noto Sans JP", "Noto Sans CJK JP", "IPAPGothic", "IPAGothic", sans-serif';

/* ---------- math / easing ---------- */
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const outCubic = (x) => 1 - Math.pow(1 - x, 3);
export const inOut = (x) => x * x * (3 - 2 * x);
export const outBack = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
/** deterministic shake offset that decays after an impact at t0 */
export function shake(t, t0, amp = 18, len = 0.35) {
  if (t < t0 || t > t0 + len) return [0, 0];
  const k = Math.pow(1 - (t - t0) / len, 2) * amp, f = Math.floor(t * 48);
  return [(hash(f) - 0.5) * 2 * k, (hash(f + 77) - 0.5) * 2 * k];
}

/* ---------- typography ---------- */
/** Kanji with fake-bold stroke (the system CJK fallback may only ship a regular weight). */
export function kanji(g, text, x, y, size, { fill = INK, bold = 0.028, stroke = null, strokeW = 0, shadow = null, align = 'center', alpha = 1 } = {}) {
  g.save(); g.globalAlpha *= alpha;
  g.font = `900 ${size}px ${CJK}`; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
  const pass = (dx, dy, col, extra) => {
    if (extra > 0) { g.strokeStyle = col; g.lineWidth = extra; g.strokeText(text, x + dx, y + dy); }
    g.fillStyle = col; g.fillText(text, x + dx, y + dy);
  };
  if (shadow) pass(shadow.dx, shadow.dy, shadow.color, size * bold + strokeW * 2);
  if (stroke && strokeW > 0) pass(0, 0, stroke, size * bold + strokeW * 2);
  pass(0, 0, fill, size * bold);
  g.restore();
}
/** vertical kanji column centred on x, starting at y (centre of first glyph) */
export function vkanji(g, text, x, y, size, opts = {}) {
  const chars = [...text]; const gap = opts.gap ?? 1.0;
  chars.forEach((ch, i) => kanji(g, ch, x, y + i * size * gap, size, opts));
}
/** Latin text drawn letter-by-letter with tracking; 'Ō' becomes O + drawn macron. Returns width. */
export function latin(g, text, x, y, size, { weight = 900, track = 0, fill = INK, align = 'left', italic = false, stroke = null, strokeW = 0, shadow = null, baseline = 'alphabetic', measure = false } = {}) {
  g.save();
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${LAT}`; g.textBaseline = baseline; g.textAlign = 'left'; g.lineJoin = 'round';
  const chars = [...text];
  const plain = chars.map(c => (c === 'Ō' ? 'O' : c === 'ō' ? 'o' : c));
  const ws = plain.map(c => g.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  if (measure) { g.restore(); return total; }
  let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const capTop = baseline === 'middle' ? -size * 0.36 : -size * 0.72;
  const draw = (dx, dy, col, sw) => {
    let cx = x0;
    for (let i = 0; i < chars.length; i++) {
      if (sw > 0) { g.strokeStyle = col; g.lineWidth = sw; g.strokeText(plain[i], cx + dx, y + dy); }
      g.fillStyle = col; g.fillText(plain[i], cx + dx, y + dy);
      if (chars[i] === 'Ō' || chars[i] === 'ō') {
        const mw = ws[i] * 0.62, mh = size * 0.085, top = (chars[i] === 'Ō' ? capTop : capTop * 0.7) - size * 0.2;
        g.fillRect(cx + dx + (ws[i] - mw) / 2 - sw / 2, y + dy + top - sw / 2, mw + sw, mh + sw);
      }
      cx += ws[i] + track;
    }
  };
  if (shadow) draw(shadow.dx, shadow.dy, shadow.color, (strokeW || 0) * 2);
  if (stroke && strokeW) draw(0, 0, stroke, strokeW * 2);
  draw(0, 0, fill, 0);
  g.restore();
  return total;
}

/* ---------- patterns / backgrounds ---------- */
export function fill(g, col) { g.fillStyle = col; g.fillRect(-40, -40, 2000, 1160); }
/** diagonal stripes over the full frame */
export function stripes(g, colors, width = 90, angle = -0.5, offset = 0) {
  g.save(); g.translate(960, 540); g.rotate(angle);
  const n = colors.length, period = width * n, span = 2400;
  const o = ((offset % period) + period) % period;
  for (let x = -span - period + o, i = 0; x < span; x += width, i++) {
    g.fillStyle = colors[((i % n) + n) % n]; g.fillRect(x, -span, width + 1, span * 2);
  }
  g.restore();
}
/** full-cover diagonal wipe: each colour band sweeps left->right in turn, later colours on top. */
export function coverWipe(g, p, colors, { shear = 420, stagger = 0.16, span = 0.5 } = {}) {
  colors.forEach((c, i) => {
    const f = outCubic(seg(p, i * stagger, i * stagger + span));
    if (f <= 0) return;
    const x = lerp(-shear - 40, 1920 + shear + 40, f);
    g.fillStyle = c; g.beginPath();
    g.moveTo(-60, -60); g.lineTo(x + shear / 2, -60); g.lineTo(x - shear / 2, 1140); g.lineTo(-60, 1140); g.closePath(); g.fill();
  });
}
/** bands that cross the frame (reveal what is under them as they leave) */
export function sweepBands(g, p, colors, { bw = 260, shear = 380, stagger = 0.08, dur = 0.55, dir = 1 } = {}) {
  colors.forEach((c, i) => {
    const f = inOut(seg(p, i * stagger, i * stagger + dur));
    if (f <= 0 || f >= 1) return;
    let x = lerp(-bw * 3 - shear, 1920 + shear + bw, f);
    if (dir < 0) x = 1920 - x;
    const w = bw * (1.6 - i * 0.25);
    g.fillStyle = c; g.beginPath();
    g.moveTo(x + shear / 2, -60); g.lineTo(x + shear / 2 + w, -60); g.lineTo(x - shear / 2 + w, 1140); g.lineTo(x - shear / 2, 1140); g.closePath(); g.fill();
  });
}
/** halftone dots; size(x,y) in 0..1 of cell */
export function halftone(g, cell, color, sizeFn, { ox = 0, oy = 0, angle = 0.26 } = {}) {
  g.save(); g.translate(960, 540); g.rotate(angle); g.fillStyle = color;
  const R = 1250;
  const sx = ((ox % cell) + cell) % cell, sy = ((oy % cell) + cell) % cell;
  for (let y = -R + sy, r = 0; y < R; y += cell, r++) {
    for (let x = -R + sx + (r % 2) * cell / 2; x < R; x += cell) {
      // back to screen coords for the size function
      const c = Math.cos(angle), s = Math.sin(angle);
      const X = 960 + x * c - y * s, Y = 540 + x * s + y * c;
      if (X < -cell || X > 1920 + cell || Y < -cell || Y > 1080 + cell) continue;
      const k = sizeFn(X, Y); if (k <= 0.02) continue;
      g.beginPath(); g.arc(x, y, Math.min(0.72, k) * cell * 0.5 * 1.38, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
export function concentric(g, cx, cy, spacing, phase, color, lw = 0.42) {
  g.save(); g.strokeStyle = color; g.lineWidth = spacing * lw;
  const o = ((phase % 1) + 1) % 1 * spacing;
  for (let r = o + 4; r < 2400; r += spacing) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.restore();
}
export function grid(g, cell, ox, oy, color, lw = 6, angle = 0) {
  g.save(); g.translate(960, 540); g.rotate(angle); g.fillStyle = color;
  const R = 1300, x0 = ((ox % cell) + cell) % cell, y0 = ((oy % cell) + cell) % cell;
  for (let x = -R + x0; x < R; x += cell) g.fillRect(x - lw / 2, -R, lw, 2 * R);
  for (let y = -R + y0; y < R; y += cell) g.fillRect(-R, y - lw / 2, 2 * R, lw);
  g.restore();
}
export function sunburst(g, cx, cy, n, rot, color) {
  g.save(); g.translate(cx, cy); g.rotate(rot); g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a0) * 2600, Math.sin(a0) * 2600); g.lineTo(Math.cos(a1) * 2600, Math.sin(a1) * 2600); g.closePath(); g.fill();
  }
  g.restore();
}
/** radial speed lines drawn as thin wedges (deterministic per frame) */
export function speedLines(g, cx, cy, t, color, { n = 90, inner = 330, density = 0.6, width = 0.012 } = {}) {
  g.save(); g.translate(cx, cy); g.fillStyle = color;
  const f = Math.floor(t * 24);
  for (let i = 0; i < n; i++) {
    if (hash(i * 7.3 + f * 13.1) > density) continue;
    const a = (i + hash(i + f) * 0.8) / n * Math.PI * 2, w = width * (0.4 + hash(i * 3.3 + f));
    const r0 = inner * (0.75 + hash(i * 1.7 + f * 0.3) * 0.7);
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a - w) * 2400, Math.sin(a - w) * 2400); g.lineTo(Math.cos(a + w) * 2400, Math.sin(a + w) * 2400); g.closePath(); g.fill();
  }
  g.restore();
}
/** marquee strip of small repeating text */
export function marquee(g, y, h, bg, fg, text, offset, size = 22) {
  g.fillStyle = bg; g.fillRect(-20, y, 1960, h);
  g.save(); g.beginPath(); g.rect(0, y, 1920, h); g.clip();
  const unit = latin(g, text, 0, 0, size, { weight: 800, track: size * 0.2, measure: true }) + size * 1.5;
  const o = -((offset % unit) + unit) % unit;
  for (let x = o; x < 1920; x += unit) latin(g, text, x, y + h / 2 + size * 0.36, size, { weight: 800, track: size * 0.2, fill: fg });
  g.restore();
}

/* ---------- silhouettes (paths in local units; draw with silhouette()) ---------- */
function spikes(g, cx, cy, a0, a1, n, rIn, rOut, lean, seed, first = true) {
  for (let k = 0; k <= n; k++) {
    const a = lerp(a0, a1, k / n);
    const ro = rOut * (0.82 + 0.36 * hash(seed + k * 1.31));
    const ri = rIn * (0.95 + 0.08 * hash(seed + k * 2.7));
    const am = a + (a1 - a0) / n * 0.5;
    if (k === 0 && first) g.moveTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri); else g.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri);
    if (k < n) g.lineTo(cx + Math.cos(am + lean) * ro, cy + Math.sin(am + lean) * ro);
  }
}
export const SIL = {
  ren(g) {   // bust, 3/4 facing right. head centre (0,0); ~1000 units tall to y=900
    g.moveTo(-58, 110); g.lineTo(-74, 196);
    g.quadraticCurveTo(-250, 214, -350, 300); g.quadraticCurveTo(-420, 420, -440, 980); g.lineTo(450, 980);
    g.quadraticCurveTo(440, 420, 360, 300); g.quadraticCurveTo(260, 214, 84, 192); g.lineTo(62, 100); g.closePath();
    // popped jacket collar
    g.moveTo(-50, 150); g.lineTo(-178, 46); g.lineTo(-206, 250); g.lineTo(-96, 290); g.closePath();
    g.moveTo(62, 146); g.lineTo(186, 58); g.lineTo(214, 252); g.lineTo(104, 286); g.closePath();
    // head + jaw (3/4)
    g.moveTo(92, -10); g.ellipse(0, -18, 92, 118, 0, 0, Math.PI * 2);
    g.moveTo(-70, 30); g.lineTo(-20, 104); g.lineTo(40, 128); g.lineTo(96, 66); g.lineTo(98, 10); g.closePath();
    // spiky hair mass, swept back to the left
    spikes(g, -10, -52, Math.PI * 0.82, Math.PI * 2.06, 11, 128, 225, -0.22, 3);
    // fringe spikes hanging over the forehead (stop above the eye line)
    g.lineTo(118, -30); g.lineTo(96, 8); g.lineTo(78, -36); g.lineTo(58, 2); g.lineTo(36, -42); g.lineTo(8, 0); g.lineTo(-14, -48);
    g.lineTo(-60, 10); g.lineTo(-96, -20); g.lineTo(-128, 40); g.lineTo(-118, -60); g.closePath();
    // tufts behind the ear / nape
    g.moveTo(-90, -20); g.lineTo(-170, 70); g.lineTo(-110, 40); g.lineTo(-150, 130); g.lineTo(-60, 70); g.closePath();
  },
  aoi(g) {   // bust, facing slightly right, bob hair + sailor collar. head centre (0,0)
    g.moveTo(-44, 120); g.lineTo(-54, 200);
    g.quadraticCurveTo(-200, 220, -290, 300); g.quadraticCurveTo(-350, 420, -370, 980); g.lineTo(380, 980);
    g.quadraticCurveTo(360, 420, 300, 300); g.quadraticCurveTo(210, 220, 62, 200); g.lineTo(50, 112); g.closePath();
    g.moveTo(84, -8); g.ellipse(4, -10, 84, 106, 0, 0, Math.PI * 2);
    g.moveTo(-50, 40); g.lineTo(0, 108); g.lineTo(46, 116); g.lineTo(90, 50); g.closePath();
    // bob: wide rounded dome, full sides, blunt cut that curls in toward the jaw
    g.moveTo(-178, 118);
    g.quadraticCurveTo(-210, -60, -150, -150); g.quadraticCurveTo(-60, -232, 40, -222); g.quadraticCurveTo(170, -205, 196, -60);
    g.quadraticCurveTo(212, 40, 186, 124); g.quadraticCurveTo(160, 134, 132, 118); g.lineTo(122, 30); g.lineTo(90, -46);
    g.lineTo(-70, -50); g.lineTo(-110, 30); g.lineTo(-122, 122); g.quadraticCurveTo(-150, 136, -178, 118); g.closePath();
  },
  aoiCollar(g) {  // sailor-collar V with two stripes each side (stroked; call with a real 2D context)
    g.lineCap = 'butt'; g.lineWidth = 13;
    for (const o of [0, 30]) {
      g.beginPath(); g.moveTo(-250 - o * 0.4, 262 + o); g.lineTo(-14, 352 + o * 1.3); g.lineTo(14, 352 + o * 1.3); g.lineTo(254 + o * 0.4, 262 + o); g.stroke();
    }
  },
  aoiTie(g) { g.moveTo(-34, 330); g.lineTo(34, 330); g.lineTo(70, 380); g.lineTo(20, 520); g.lineTo(-6, 384); g.closePath(); g.moveTo(-60, 322); g.lineTo(60, 322); g.lineTo(30, 360); g.lineTo(-30, 360); g.closePath(); },
  collector(g) {  // full figure, feet at (0,0), ~1040 units tall
    // hat brim + crown
    g.moveTo(250, -890); g.ellipse(0, -900, 250, 40, -0.07, 0, Math.PI * 2);
    g.moveTo(-112, -905); g.quadraticCurveTo(-118, -1030, -10, -1040); g.quadraticCurveTo(108, -1036, 110, -918); g.closePath();
    // head in shadow + high collar
    g.moveTo(-64, -880); g.lineTo(64, -880); g.lineTo(56, -790); g.lineTo(-56, -790); g.closePath();
    g.moveTo(-150, -740); g.lineTo(-104, -872); g.lineTo(-30, -800); g.lineTo(30, -800); g.lineTo(104, -872); g.lineTo(150, -740); g.closePath();
    // long coat with tattered hem
    g.moveTo(-60, -800); g.quadraticCurveTo(-200, -790, -226, -700); g.lineTo(-262, -380); g.lineTo(-330, -90);
    const hem = [[-330, -90], [-290, -40], [-262, -82], [-214, -30], [-180, -74], [-120, -36], [-80, -70], [80, -70], [124, -30], [170, -76], [222, -28], [262, -84], [300, -40], [334, -96]];
    for (const [x, y] of hem) g.lineTo(x, y);
    g.lineTo(262, -390); g.lineTo(230, -700); g.quadraticCurveTo(200, -790, 60, -800); g.closePath();
    // legs
    g.moveTo(-92, -80); g.lineTo(-40, -80); g.lineTo(-44, 0); g.lineTo(-104, 0); g.closePath();
    g.moveTo(40, -80); g.lineTo(92, -80); g.lineTo(104, 0); g.lineTo(44, 0); g.closePath();
    // outstretched arm holding the jar
    g.moveTo(190, -730); g.lineTo(376, -500); g.lineTo(356, -440); g.lineTo(316, -436); g.lineTo(180, -560); g.closePath();
  },
  oniAura(g, t) {   // flame aura with two horns around Ren's bust, head centre (0,0)
    const n = 34;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI * 0.55 + (k / n) * Math.PI * 1.9 + Math.PI * 0.0;
      const f = Math.floor(t * 18);
      let r = 330 + 120 * hash(k * 3.1 + f * 0.7) + (k % 2 ? 0 : 90);
      const x = Math.cos(a) * r * 1.05, y = Math.sin(a) * r * 0.95 - 40;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineTo(560, 980); g.lineTo(-560, 980); g.closePath();
    // horns
    g.moveTo(-120, -200); g.quadraticCurveTo(-230, -330, -200, -560); g.quadraticCurveTo(-140, -380, -40, -260); g.closePath();
    g.moveTo(90, -210); g.quadraticCurveTo(220, -340, 210, -580); g.quadraticCurveTo(140, -400, 20, -270); g.closePath();
  },
  kagero(g, t) {   // towering heat-haze spirit: wavering column of flame tongues
    const H = 1100, n = 26;
    g.moveTo(-420, 60);
    for (let k = 0; k <= n; k++) {
      const v = k / n, y = 60 - v * H;
      const w = 420 * Math.sin(Math.PI * (0.15 + v * 0.85)) * (0.75 + 0.25 * Math.sin(v * 9 + t * 6));
      g.lineTo(-w - 40 * Math.sin(v * 13 + t * 9), y);
    }
    for (let k = n; k >= 0; k--) {
      const v = k / n, y = 60 - v * H;
      const w = 420 * Math.sin(Math.PI * (0.15 + v * 0.85)) * (0.75 + 0.25 * Math.sin(v * 7 + t * 5 + 1));
      g.lineTo(w + 40 * Math.sin(v * 11 + t * 8), y - (k % 2) * 40);
    }
    g.closePath();
  },
};
/** draw a silhouette with an offset rim light: rim colour shifted by (rx, ry), then the body on top */
export function silhouette(g, pathFn, x, y, s, { fill = INK, rim = null, rx = 10, ry = -4, rot = 0, t = 0, alpha = 1 } = {}) {
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot); g.scale(s, s);
  if (rim) { g.save(); g.translate(rx / s, ry / s); unionFill(g, pathFn, rim, t); g.restore(); }
  unionFill(g, pathFn, fill, t);
  g.restore();
}
/** fill every subpath separately (so sub-shape winding never punches holes) */
export function unionFill(g, pathFn, color, t = 0) {
  g.fillStyle = color;
  let open = false;
  const P = {
    moveTo(x, y) { if (open) g.fill(); g.beginPath(); open = true; g.moveTo(x, y); },
    lineTo: (...a) => g.lineTo(...a), quadraticCurveTo: (...a) => g.quadraticCurveTo(...a), bezierCurveTo: (...a) => g.bezierCurveTo(...a),
    ellipse: (...a) => g.ellipse(...a), arc: (...a) => g.arc(...a), closePath: () => g.closePath(),
  };
  pathFn(P, t); if (open) g.fill();
}
/** anime eye glint: hot core + 4-point star flare */
export function glint(g, x, y, size, color = CRIMSON, a = 1) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.translate(x, y);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, size * 2.4);
  grd.addColorStop(0, 'rgba(255,90,90,0.9)'); grd.addColorStop(0.25, color); grd.addColorStop(1, 'rgba(255,0,20,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, size * 2.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = color;
  const star = (L, w) => { g.beginPath(); g.moveTo(-L, 0); g.lineTo(0, -w); g.lineTo(L, 0); g.lineTo(0, w); g.closePath(); g.fill(); };
  star(size * 5, size * 0.28); g.rotate(Math.PI / 2); star(size * 2.6, size * 0.22);
  g.fillStyle = '#fff3f0'; g.beginPath(); g.ellipse(0, 0, size * 0.55, size * 0.38, 0, 0, Math.PI * 2); g.fill();
  g.restore();
}
/** glowing shadow-jar */
export function jar(g, x, y, s, t) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const pulse = 0.85 + 0.15 * Math.sin(t * 9);
  const grd = g.createRadialGradient(0, 0, 10, 0, 0, 260);
  grd.addColorStop(0, `rgba(255,236,170,${0.9 * pulse})`); grd.addColorStop(0.35, `rgba(255,170,90,${0.45 * pulse})`); grd.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 260, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff1c4'; rr(g, -64, -86, 128, 176, 34); g.fill();
  g.fillStyle = INK; rr(g, -74, -112, 148, 34, 8); g.fill(); g.fillRect(-50, -124, 100, 16);
  // captured shadow swirling inside
  g.fillStyle = INK; g.beginPath();
  const sw = Math.sin(t * 5) * 8;
  g.moveTo(-18 + sw, 60); g.quadraticCurveTo(-34, 10, -14 + sw, -18); g.arc(sw * 0.5, -32, 16, Math.PI * 0.8, Math.PI * 2.2); g.quadraticCurveTo(30, 10, 20 + sw, 60); g.closePath(); g.fill();
  g.fillStyle = CRIMSON; g.fillRect(-6 + sw * 0.5, -36, 5, 5); g.fillRect(4 + sw * 0.5, -36, 5, 5);
  g.restore();
}
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function wheel(g, x, y, r, rot, color = INK) {
  g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = r * 0.075; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = r * 0.025; g.beginPath(); g.arc(0, 0, r * 0.9, 0, Math.PI * 2); g.stroke();
  g.lineWidth = r * 0.012;
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, b = a + (i % 2 ? 0.5 : -0.5); g.beginPath(); g.moveTo(Math.cos(b) * r * 0.08, Math.sin(b) * r * 0.08); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke(); }
  g.beginPath(); g.arc(0, 0, r * 0.1, 0, Math.PI * 2); g.fill();
  g.restore();
}
