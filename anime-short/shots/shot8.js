// Shot 8 — final shot: straight-down aerial view of a wind-combed painterly meadow; a white crane and a black
// crane-like bird fly up through frame (lower-left -> top), flapping, slowly shrinking; pollen motes drift.
// Static camera. The meadow is a single full-frame shader (brush-stroke strands in staggered cells, wind sway),
// the birds are flat-coloured 2D silhouettes whose wing outlines are rebuilt every frame from a flap cycle.

const REF_W = 1280, REF_H = 720;

// Dark/light patch layout of the meadow: gaussian blobs [x, y, sigma(x-fraction), amount] (negative = darker).
const BLOBS = [
  [0.925, 0.689, 0.075, -0.80], [0.625, 0.667, 0.113, -0.28], [0.838, 0.067, 0.031, -0.82], [0.113, 0.267, 0.113, 0.21],
  [0.800, 0.900, 0.031, 0.65], [0.956, 0.056, 0.031, -0.63], [0.675, 0.467, 0.031, -0.58], [0.825, 0.333, 0.075, 0.23],
  [0.444, 0.178, 0.031, -0.53], [0.787, 0.678, 0.031, -0.50], [0.487, 0.633, 0.031, 0.49], [0.762, 0.022, 0.019, -0.76],
  [0.919, 0.900, 0.031, 0.44], [0.569, 0.900, 0.050, -0.26], [0.450, 0.933, 0.031, 0.41], [0.350, 0.344, 0.031, 0.41],
  [0.969, 0.522, 0.019, -0.65], [0.225, 0.767, 0.050, -0.24], [0.250, 0.289, 0.019, -0.63], [0.156, 0.967, 0.050, 0.21],
  [0.681, 0.744, 0.050, 0.21], [0.006, 0.900, 0.019, -0.56], [0.625, 0.256, 0.050, 0.20], [0.531, 0.089, 0.031, -0.32],
  [0.463, 0.400, 0.031, -0.28], [0.906, 0.633, 0.019, 0.44], [0.975, 0.733, 0.031, -0.26], [0.812, 0.344, 0.019, -0.42],
  [0.750, 0.956, 0.019, 0.37], [0.719, 0.022, 0.019, -0.40], [0.669, 0.100, 0.019, 0.37], [0.912, 0.022, 0.019, -0.36],
  [0.531, 0.511, 0.019, -0.34], [0.369, 0.567, 0.075, 0.09], [0.175, 0.344, 0.019, -0.34], [0.756, 0.178, 0.031, 0.20],
  [0.400, 0.033, 0.019, 0.32], [0.819, 0.511, 0.031, 0.19], [0.156, 0.178, 0.031, 0.19], [0.806, 0.022, 0.019, -0.31],
  // correction pass (fitted to the reference after a first render)
  [0.200, 0.044, 0.087, -0.19], [0.781, 0.033, 0.037, 0.34], [0.750, 0.300, 0.087, -0.13], [0.256, 0.556, 0.087, -0.11], [0.956, 0.678, 0.056, 0.17], [0.644, 0.467, 0.025, 0.29], [0.613, 0.667, 0.087, -0.09], [0.050, 0.000, 0.025, -0.26], [0.037, 0.222, 0.025, -0.25], [0.588, 0.856, 0.025, 0.24], [0.506, 0.778, 0.025, -0.23], [0.706, 0.067, 0.025, 0.23], [0.863, 0.156, 0.025, -0.22], [0.069, 0.611, 0.025, -0.22], [0.787, 0.644, 0.025, 0.21], [0.731, 0.711, 0.025, -0.23],
];

// Bird screen paths (pixels in a 1280x720 frame) fitted to the reference: cubic in t, plus log-size slope.
const PATH = {
  white: { x: [-1.716, 7.654, 86.588, 297.833], y: [0.796, 10.65, -241.007, 668.3], s0: 1.08, k: -0.106, phase: 0.0 },
  black: { x: [1.472, -15.932, 151.558, 174.258], y: [2.507, -9.651, -212.176, 817.865], s0: 0.95, k: -0.115, phase: -0.075 },
};
const poly = (c, t) => ((c[0] * t + c[1]) * t + c[2]) * t + c[3];

const GRASS_VS = /* glsl */`
varying vec2 vS;
uniform vec2 uView;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vS = vec2(wp.x / uView.x + 0.5, wp.z / uView.y + 0.5);   // 0..1 screen fraction, y down
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const GRASS_FS = (NOISE, nBlobs) => /* glsl */`
uniform float uT;
uniform vec4 uBlobs[${nBlobs}];
uniform vec3 cBase, cBaseLight, cBaseDark, cDark, cDeep, cLight, cLime, cCool, cOlive;
varying vec2 vS;
${NOISE}
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }

float patchField(vec2 s){
  float v = 0.0;
  for (int i = 0; i < ${nBlobs}; i++){
    vec4 b = uBlobs[i];
    vec2 d = s - b.xy; d.y *= ${(REF_H / REF_W).toFixed(4)};
    d = abs(d); d = min(d, vec2(1.0, ${(REF_H / REF_W).toFixed(4)}) - d);
    v += b.w * exp(-dot(d, d) / (2.0 * b.z * b.z));
  }
  return v;
}

// local strand angle (radians, math convention with y up) at pixel P
float strandAngle(vec2 P, vec2 s){
  return radians(123.0 - 20.0 * smoothstep(0.4, 0.75, s.x) - 4.0 * s.x + (vnoise(P * 0.006 + 11.0) - 0.5) * 14.0 + (vnoise(P * 0.03 + 3.0) - 0.5) * 8.0);
}
float windAt(vec2 P){
  return sin(dot(P, vec2(0.009, -0.016)) - uT * 2.2 + vnoise(P * 0.004) * 5.0);
}
// Evaluate one stroke living in lattice cell (ci, cj). Lattice is aligned to the global direction (D, N).
vec2 strokeCell(vec2 P, float ci, float qy, vec2 D, vec2 N, float cw, float ch, float seed, float wmax){
  float stag = hash12(vec2(ci, seed)) * 7.31;
  float cj = floor(qy + stag);
  vec2 cell = vec2(ci, cj);
  float r1 = hash12(cell + seed * 1.37);
  float r2 = hash12(cell + seed * 2.11 + 5.3);
  float r3 = hash12(cell + seed * 3.07 + 9.1);
  float r4 = hash12(cell + seed * 0.71 + 2.9);
  float len = mix(0.5, 1.0, r2) * ch;
  float cx = (ci + 0.5 + (r4 - 0.5) * 0.9) * cw;
  float cy = (cj + 0.5 + (r3 - 0.5) * 0.5 - stag) * ch;
  vec2 C = cx * N + cy * D;
  vec2 s = C / vec2(${REF_W.toFixed(1)}, ${REF_H.toFixed(1)});
  float w = windAt(C);
  float ang = strandAngle(C, s) + w * 0.07 + (r1 - 0.5) * 0.25;
  vec2 dc = vec2(cos(ang), -sin(ang));
  vec2 nc = vec2(-dc.y, dc.x);
  C += nc * (1.8 * w + 0.9 * sin(dot(C, vec2(-0.031, 0.017)) - uT * 4.1 + r3 * 6.28));
  vec2 rel = P - C;
  float a = dot(rel, dc), b = dot(rel, nc);
  float hl = len * 0.5;
  float t = a / hl;
  float wd = wmax * mix(0.6, 1.0, r4);
  float prof = wd * 0.5 * pow(max(1.0 - t * t, 0.0), 0.55) * (1.0 + 0.3 * t);
  float m = smoothstep(prof + 0.5, prof - 0.5, abs(b)) * step(abs(t), 1.0);
  return vec2(m, r1);
}
// one layer: check own column and both neighbours; topmost (last) hit wins
vec2 strokes(vec2 P, vec2 D, vec2 N, float cw, float ch, float seed, float wmax){
  float qx = dot(P, N) / cw, qy = dot(P, D) / ch;
  float c0 = floor(qx);
  vec2 res = vec2(0.0, 0.0);
  for (int k = -1; k <= 1; k++){
    vec2 r = strokeCell(P, c0 + float(k), qy, D, N, cw, ch, seed, wmax);
    if (r.x > res.x) res = r;
  }
  return res;
}

void main(){
  vec2 s = vS;
  vec2 P = s * vec2(${REF_W.toFixed(1)}, ${REF_H.toFixed(1)});
  float nz = fbm(P * 0.006 + 3.1);
  float g1 = radians(122.0);
  vec2 Dp = vec2(cos(g1), -sin(g1));
  vec2 Qp = vec2(dot(P, vec2(-Dp.y, Dp.x)), dot(P, Dp));
  float comb = vnoise(Qp * vec2(0.06, 0.006)) - 0.5 + (vnoise(Qp * vec2(0.18, 0.015) + 3.0) - 0.5) * 0.6;
  float pv = patchField((P + Dp * comb * 70.0) / vec2(1280.0, 720.0));
  float nz2 = fbm(P * 0.02 + 7.7);
  float pvn = pv + (nz - 0.5) * 0.35 + (nz2 - 0.5) * 0.15;

  float g0 = radians(115.0);
  vec2 D = vec2(cos(g0), -sin(g0));
  vec2 N = vec2(-D.y, D.x);

  // anisotropic streak noise (long brush smears along the strands)
  vec2 Q = vec2(dot(P, N), dot(P, D));
  float streak = vnoise(Q * vec2(0.09, 0.008) + 4.0) * 0.6 + vnoise(Q * vec2(0.25, 0.02) + 9.0) * 0.4;
  float mid = fbm(P * 0.012 + 21.0);

  vec3 base = cBase + (pvn < 0.0 ? vec3(46.0, 46.0, 15.0) : vec3(46.0, 40.0, 10.0)) / 255.0 * pvn * 1.1;
  base = mix(base, base * vec3(0.92, 1.0, 1.08), smoothstep(-0.1, -0.6, pvn));  // cooler shadows
  base *= 0.95 + 0.1 * streak;
  vec3 c = base;

  float darkness = clamp(-pvn * 1.4, 0.0, 1.0);
  float lightness = clamp(pvn * 1.8, 0.0, 1.0);
  // dense dark-stroke clumps live inside the dark patches
  float clump = smoothstep(0.28, 0.62, darkness + (mid - 0.5) * 1.1 + (streak - 0.5) * 0.3);

  vec2 sc = strokes(P + vec2(3.3, 11.0), D, N, 5.0, 28.0, 3.0, 3.0);
  vec2 sb = strokes(P + vec2(1.7, 5.0), D, N, 6.0, 32.0, 2.0, 3.0);
  vec2 sa = strokes(P, D, N, 7.0, 30.0, 1.0, 4.2);

  float pDark = mix(0.12, 0.85, clump);
  float pLight = 0.6 * (1.0 - clump * 0.7);
  vec3 lightCol = mix(base * vec3(1.2, 1.12, 1.2), cLight, 0.25 + 0.35 * lightness);
  vec3 olive = mix(base, cOlive, 0.7);
  vec3 darkSoft = mix(cDark, base, 0.45 - 0.4 * clump);
  // C: long thin light strands (and a few olive ones)
  if (sc.y < pLight) c = mix(c, (fract(sc.y * 17.0) > 0.85 ? olive : mix(lightCol, cLime, step(0.75, fract(sc.y * 29.0)) * lightness)), sc.x * 0.85);
  else if (sc.y > 1.0 - max(pDark, 0.3) * 0.7) c = mix(c, darkSoft, sc.x * 0.75);
  // B: medium strands
  if (sb.y < pLight * 0.7) c = mix(c, lightCol, sb.x * 0.7);
  else if (sb.y > 1.0 - pDark) c = mix(c, mix(darkSoft, cCool, step(0.75, fract(sb.y * 13.0)) * clump), sb.x * 0.85);
  // A: chunky dark clump strokes
  if (sa.y > 1.0 - pDark * 0.9 * smoothstep(0.1, 0.5, clump)) c = mix(c, mix(darkSoft, cDeep, clump * 0.7), sa.x * 0.95);
  else if (sa.y < pLight * 0.35) c = mix(c, lightCol, sa.x * 0.6);

  gl_FragColor = vec4(toLin(c), 1.0);
}`;

const MOTE_VS = /* glsl */`
attribute vec4 aM; uniform float uT; uniform vec2 uView; varying float vA;
void main(){
  vec2 p = aM.xy + vec2(0.012, -0.02) * uT + vec2(sin(uT * 0.7 + aM.z * 6.28) * 0.006, cos(uT * 0.5 + aM.z * 4.0) * 0.006);
  p = fract(p);
  vec3 wp = vec3((p.x - 0.5) * uView.x, 0.05, (p.y - 0.5) * uView.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_PointSize = aM.w;
  vA = 0.55 + 0.45 * sin(uT * 1.3 + aM.z * 20.0);
}`;
const MOTE_FS = /* glsl */`
uniform vec3 uCol; uniform float uOp; varying float vA;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, r);
  gl_FragColor = vec4(pow(uCol, vec3(2.2)), a * uOp * vA); }`;

/* ------------------------------------------------------------------ */
/* Bird silhouette (local 2D, units = reference pixels, +x = head)     */
/* ------------------------------------------------------------------ */
function buildBird(THREE, color) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, toneMapped: false });
  const root = new THREE.Group();         // positioned in world, faces camera
  const g = new THREE.Group(); root.add(g); // rotated in-plane (heading)
  // body + neck + head + legs as one static shape
  const body = new THREE.Shape();
  const pts = [];
  // body outline (counter-clockwise) — from tail around the back to chest, neck, head, beak, back down.
  pts.push([-20, 0], [-16, 6], [-6, 8.5], [5, 7.5], [10, 5.5], [14, 3.6], [18, 3.0], [22, 2.8], [25.5, 2.2], [28.5, 1.4], [30.5, 0.2],
    [35.5, -2.4], [30.5, -1.8], [27.5, -1.6], [24, -0.9], [20, -0.7], [16, -1.4], [12, -3.5], [8, -6.5], [0, -8.5], [-10, -7.5], [-16, -5]);
  body.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) body.lineTo(pts[i][0], pts[i][1]);
  body.closePath();
  const geos = [new THREE.ShapeGeometry(body)];
  // legs: two thin trailing strips
  const leg = (y0, y1, x1) => {
    const s = new THREE.Shape();
    s.moveTo(-14, y0 + 1.6); s.lineTo(x1, y1 + 1.1); s.lineTo(x1 - 3.5, y1 + 1.4); s.lineTo(x1 - 4, y1 - 0.6); s.lineTo(x1, y1 - 1.1); s.lineTo(-14, y0 - 1.6); s.closePath();
    return new THREE.ShapeGeometry(s);
  };
  geos.push(leg(-1.6, -4.2, -48), leg(1.4, 0.4, -46));
  for (const ge of geos) g.add(new THREE.Mesh(ge, mat));
  // wings: dynamic strips
  const NW = 14;
  const mkWing = () => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((NW + 1) * 2 * 3 + 6 * 3 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < NW; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    // feather fingers (6 tris) after strip vertices
    const base = (NW + 1) * 2;
    for (let k = 0; k < 6; k++) idx.push(base + k * 3, base + k * 3 + 1, base + k * 3 + 2);
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; g.add(m);
    return geo;
  };
  const wings = [mkWing(), mkWing()];
  return { root, g, wings, NW, mat };
}

// flap pose keys (from the reference, period 1.333 s):
// phase, upper wing [angle rel. to heading (deg), length px, chord, curl], lower wing [angle, length, chord, curl]
const KEYS = [
  [0.000, 103, 40, 1.30, 0.0, -75, 64, 1.35, 0.0],
  [0.125, 105, 33, 1.50, 0.1, -89, 56, 1.35, 0.15],
  [0.250, 94, 40, 1.40, 0.4, -92, 56, 1.30, 0.6],
  [0.375, 70, 56, 1.0, 1.0, -84, 60, 1.0, 1.0],
  [0.500, 72, 54, 1.15, 0.3, -64, 60, 1.05, 0.3],
  [0.570, 64, 60, 1.15, 0.12, -55, 62, 0.68, 0.05],
  [0.900, 64, 60, 1.12, 0.12, -54, 61, 0.65, 0.05],
  [0.940, 70, 55, 1.15, 0.1, -60, 57, 0.8, 0.05],
  [1.000, 103, 40, 1.30, 0.0, -75, 64, 1.35, 0.0],
];
function pose(ph) {
  ph = ((ph % 1) + 1) % 1;
  let i = 0; while (i < KEYS.length - 2 && ph > KEYS[i + 1][0]) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  let u = (ph - A[0]) / (B[0] - A[0]); u = u * u * (3 - 2 * u);
  return A.map((v, k) => v + (B[k] - v) * u).slice(1);
}

function updateWing(bird, geo, side, P) {
  const o = side > 0 ? 0 : 4;
  const len = P[o + 1], chord = P[o + 2], curl = P[o + 3];
  const ang = P[o] * Math.PI / 180;
  const NW = bird.NW;
  const pos = geo.attributes.position.array;
  // centreline from root, bending backwards (toward the tail, -x) by curl over the outer half
  let x = 5, y = side * 4, a = ang;
  const step = len / NW;
  const cl = [];
  for (let i = 0; i <= NW; i++) {
    const u = i / NW;
    cl.push([x, y, a, u]);
    const bend = curl * 4.8 * Math.max(0, u - 0.35) / NW * Math.PI / 2;
    // rotate direction toward the tail (-x): for left wing (pointing +y) rotate CCW, right wing CW
    a += side > 0 ? bend : -bend;
    x += Math.cos(a) * step; y += Math.sin(a) * step;
  }
  for (let i = 0; i <= NW; i++) {
    const [cx, cy, ca, u] = cl[i];
    // chord profile: wide inner wing, gently tapering to rounded tip
    const w = 0.82 * chord * (u < 0.15 ? 11 + u * 30 : 16 * Math.pow(Math.max(0, 1 - Math.pow((u - 0.15) / 0.85, 2.2)), 0.55) + 2.5 * (1 - u));
    const lx = side * Math.sin(ca), ly = -side * Math.cos(ca);   // leading-edge normal (toward the head side)
    const lead = 0.35 * w, trail = 0.65 * w;
    pos.set([cx + lx * lead, cy + ly * lead, 0, cx - lx * trail, cy - ly * trail, 0], i * 6);
  }
  // primary feather fingers at the tip trailing edge
  const base = (NW + 1) * 2 * 3;
  for (let k = 0; k < 6; k++) {
    const i = NW - 1 - Math.floor(k * 0.9);
    const [cx, cy, ca] = cl[Math.max(1, i)];
    const dx = Math.cos(ca), dy = Math.sin(ca);
    const ln = (6 + k * 0.6) * chord;
    const tx = -side * dy, ty = side * dx;   // trailing direction
    const ox = cx + tx * 4 * chord, oy = cy + ty * 4 * chord;
    const fx = dx * 0.6 + tx * 0.8, fy = dy * 0.6 + ty * 0.8;
    pos.set([ox - dx * 1.6, oy - dy * 1.6, 0, ox + dx * 1.6, oy + dy * 1.6, 0, ox + fx * ln, oy + fy * ln, 0], base + k * 9);
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeBoundingSphere();
}

export default {
  duration: 6.125,
  credit: null,
  post: { bloom: 0.0, bloomThreshold: 1.0, exposure: 1.0, contrast: 1.0, saturation: 1.0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
    vignette: 0.0, grain: 0.02, ca: 0.0, leak: 0, soft: 0.25 },
  build(core) {
    const { THREE, NOISE_GLSL, shared } = core;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#5f8f3c');
    const H = 20, FOV = 30;
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 100);
    camera.position.set(0, H, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const viewH = 2 * H * Math.tan(FOV * Math.PI / 360), viewW = viewH * 16 / 9;

    const uT = { value: 0 };
    const raw = (h) => { const c = new THREE.Color(); c.setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace); return c; };
    const grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uT, uView: { value: new THREE.Vector2(viewW, viewH) },
        uBlobs: { value: BLOBS.map(b => new THREE.Vector4(...b)) },
        cBase: { value: raw('#659a41') }, cBaseLight: { value: raw('#68983f') }, cBaseDark: { value: raw('#4a7d38') },
        cDark: { value: raw('#386428') }, cDeep: { value: raw('#2c5524') }, cLight: { value: raw('#72a346') }, cLime: { value: raw('#8fb950') },
        cCool: { value: raw('#3f7449') }, cOlive: { value: raw('#8e9c55') },
      },
      vertexShader: GRASS_VS,
      fragmentShader: GRASS_FS(NOISE_GLSL, BLOBS.length),
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(viewW * 1.05, viewH * 1.05), grassMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // pollen motes
    const r = core.rng(88);
    const NM = 40, aM = new Float32Array(NM * 4);
    for (let i = 0; i < NM; i++) aM.set([r(), r(), r(), 3 + r() * 4], i * 4);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NM * 3), 3));
    mg.setAttribute('aM', new THREE.BufferAttribute(aM, 4));
    const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: { uT, uView: { value: new THREE.Vector2(viewW, viewH) }, uCol: { value: raw('#a9cf86') }, uOp: { value: 0.55 } },
      vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, depthTest: false,
    }));
    motes.frustumCulled = false; motes.renderOrder = 1;
    scene.add(motes);

    // birds (flat silhouettes in a plane parallel to the ground)
    const BIRD_Y = 6;
    const vb = 2 * (H - BIRD_Y) * Math.tan(FOV * Math.PI / 360); // view height at bird depth
    const pxToWorld = vb / REF_H;
    const birds = {
      white: buildBird(THREE, '#cdcdcc'),
      black: buildBird(THREE, '#0a0302'),
    };
    for (const k in birds) {
      const b = birds[k];
      b.root.rotation.x = -Math.PI / 2;
      b.root.position.y = BIRD_Y + (k === 'white' ? 0.01 : 0);
      b.root.renderOrder = 2;
      scene.add(b.root);
    }

    return {
      scene, camera,
      update(t) {
        uT.value = t;
        shared.uTime.value = t + 10;
        for (const k in birds) {
          const b = birds[k], P = PATH[k];
          const tt = Math.min(t, 4.3);
          const sx = poly(P.x, tt), sy = poly(P.y, tt);
          b.root.visible = t < 4.3;
          b.root.position.x = (sx / REF_W - 0.5) * vb * 16 / 9;
          b.root.position.z = (sy / REF_H - 0.5) * vb;
          const sc = P.s0 * Math.exp(P.k * t) * pxToWorld;
          b.root.scale.set(sc, sc, sc);
          b.g.rotation.z = 47 * Math.PI / 180;
          const ph = pose(t / 1.333 + P.phase);
          updateWing(b, b.wings[0], 1, ph);
          updateWing(b, b.wings[1], -1, ph);
        }
      },
    };
  },
};
