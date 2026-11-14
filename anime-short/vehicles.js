// Properly modelled, physically shaded vehicles for the anime short.
//   makeCoupe(opts)     — 1980s Japanese hatchback coupe (white over black two-tone, wide tail-light bar, 13" alloys)
//   makeKeiTruck(opts)  — cab-over kei truck (white, drop-side bed, cab guard, 12" steel wheels)
//   makeEnvMap(key, o)  — PMREM environment (sky + sun + surrounding blocks) for reflections
//   addVehicleLight(..) — shadow-casting sun fitted to the vehicle
//   makeGroundShadow(..) — soft contact shadow + cast-shadow catcher (with leaf-shadow dapple)
//
// Vehicle-local axes: x = right, y = up, z = back (forward is -z). Origin = rear-centre on the ground.
// Every material shares one uniform block (returned as `u`) so a shot can drive the leaf-shadow dapple,
// rim light and time from its update().
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ctx, NOISE_GLSL, shared } from './core.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ------------------------------------------------------------------ */
/* Shared uniforms + material enhancement                               */
/* ------------------------------------------------------------------ */
export function vehicleUniforms(o = {}) {
  return {
    uTime: shared.uTime,
    uLeafAmt: { value: o.leafAmt ?? 0 },          // 0 = full sun, 1 = full leaf-dappled shade
    uLeafCover: { value: o.leafCover ?? 0.55 },   // fraction of the surface in leaf shadow
    uLeafScale: { value: o.leafScale ?? 1.6 },    // leaves per metre
    uLeafSharp: { value: o.leafSharp ?? 0.08 },
    uLeafSeed: { value: o.leafSeed ?? 3.0 },
    uLeafSun: { value: new THREE.Vector3(...(o.sunDir || [0.4, 0.8, 0.4])).normalize() },
    uRimColor: { value: new THREE.Color(o.rimColor || '#ffb27a') },
    uRimAmt: { value: o.rimAmt ?? 0.0 },
    uRimPow: { value: o.rimPow ?? 4.0 },
    uGrime: { value: o.grime ?? 0.15 },
  };
}

const LEAF_GLSL = /* glsl */`
uniform float uTime, uLeafAmt, uLeafCover, uLeafScale, uLeafSharp, uLeafSeed;
uniform vec3 uLeafSun;
float leafCells(vec2 q){
  vec2 i = floor(q), f = fract(q); float s = 0.;
  for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
    vec2 c = vec2(float(x), float(y)); vec2 id = i + c;
    vec2 h = vec2(hash12(id), hash12(id + 17.3));
    vec2 o = c + h - f;
    float a = hash12(id + 5.1) * 6.283 + sin(uTime*1.4 + h.x*9.0) * 0.12;
    vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * o;
    float k = 0.30 + 0.18 * hash12(id + 9.7);
    float yy = clamp(abs(r.y) / k, 0., 1.);
    float w = 0.20 * pow(1.0 - yy * yy, 0.7);
    s = max(s, 1.0 - smoothstep(w * 0.8, w, abs(r.x)) - step(1.0, yy));
  }
  return clamp(s, 0., 1.);
}
float leafMask(vec3 p){
  if (uLeafAmt <= 0.001) return 1.0;
  vec3 L = normalize(uLeafSun);
  vec3 t1 = normalize(cross(L, abs(L.y) > 0.95 ? vec3(1,0,0) : vec3(0,1,0)));
  vec3 t2 = cross(L, t1);
  vec2 q = vec2(dot(p, t1), dot(p, t2)) * uLeafScale + uLeafSeed;
  q += vec2(sin(uTime*0.55 + q.y*0.15), cos(uTime*0.43 + q.x*0.15)) * 0.05;
  float open = smoothstep(uLeafCover - 0.07, uLeafCover + 0.07, fbm(q * 0.28 + 11.0));
  float l1 = leafCells(q);
  float l2 = leafCells(q * 0.57 + vec2(3.1, 7.7));
  // thin twig shadows: ridges of a warped noise field
  vec2 qw = q * 0.42 + vec2(fbm(q * 0.2 + 3.0), fbm(q * 0.2 + 8.0)) * 1.6;
  float tw = 1.0 - smoothstep(0.01, 0.06, abs(vnoise(qw) - 0.5));
  float lit = open * (1.0 - 0.9 * l1) * (1.0 - 0.55 * l2) * (1.0 - 0.8 * tw);
  return mix(1.0, smoothstep(0.5 - uLeafSharp, 0.5 + uLeafSharp, lit), uLeafAmt);
}`;

/**
 * Inject world/local position varyings, leaf-shadow on direct light, rim light, two-tone + grime zones.
 * zones: { split, lower:'#hex', lowerRough, stripe:'#hex', stripeY, stripeW } (vehicle-local y, for body paint)
 */
function enhance(mat, u, zones = null, key = 'veh') {
  const zu = zones ? {
    uSplit: { value: zones.split }, uLower: { value: new THREE.Color(zones.lower) }, uLowerRough: { value: zones.lowerRough ?? 0.5 },
    uStripe: { value: new THREE.Color(zones.stripe || '#000000') }, uStripeY: { value: zones.stripeY ?? -1 }, uStripeW: { value: zones.stripeW ?? 0.012 },
  } : null;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, zu || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 _wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        vWPos = (modelMatrix * _wp).xyz;`);
    const lightsChunk = THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight', 'directLight.color *= _leafM; RE_Direct( directLight');
    let fs = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vLocal;
        uniform vec3 uRimColor; uniform float uRimAmt, uRimPow, uGrime;
        ${zu ? 'uniform float uSplit, uLowerRough, uStripeY, uStripeW; uniform vec3 uLower, uStripe;' : ''}
        ${NOISE_GLSL}
        ${LEAF_GLSL}`)
      .replace('#include <lights_fragment_begin>', `float _leafM = leafMask(vWPos);\n${lightsChunk}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float _ly = vLocal.y;
        ${zu ? `
          float _isLow = 1.0 - smoothstep(uSplit - 0.002, uSplit + 0.002, _ly);
          diffuseColor.rgb = mix(diffuseColor.rgb, uLower, _isLow);
          float _st = smoothstep(uStripeY - 0.0015, uStripeY, _ly) * (1.0 - smoothstep(uStripeY + uStripeW, uStripeY + uStripeW + 0.0015, _ly));
          diffuseColor.rgb = mix(diffuseColor.rgb, uStripe, _st);` : ''}
        float _g = (1.0 - smoothstep(0.12, 0.65, _ly)) * (0.55 + 0.45 * fbm(vLocal.xz * 7.0 + vLocal.y * 9.0));
        diffuseColor.rgb *= 1.0 - uGrime * _g;`)
      .replace('#include <opaque_fragment>', `
        float _fr = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPow);
        outgoingLight += uRimColor * _fr * uRimAmt * (0.35 + 0.65 * _leafM) * smoothstep(0.15, 0.6, dot(diffuseColor.rgb, vec3(0.333)));
        #include <opaque_fragment>`);
    if (zu) {
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uLowerRough, _isLow);`);
      fs = fs.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= 1.0 - 0.7 * _isLow;
        #endif`);
    }
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key + (zones ? 'z' : '');
  return mat;
}

function physical(u, o, zones, key) {
  const { color = '#ffffff', ...rest } = o;
  return enhance(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), ...rest }), u, zones, key);
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */
// arc points (f, y) around centre (cf, cy) from angle a0 to a1
function arc(cf, cy, r, a0, a1, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); out.push([cf + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
// wheel-arch notch on a bottom edge at height yb (traversed front -> back)
function archNotch(cf, cy, r, yb, n = 16) {
  const s = Math.asin(clamp01((yb - cy) / r));
  return arc(cf, cy, r, s, Math.PI - s, n);
}

/**
 * Extrude a side profile (points as [f, y]: f = metres forward from the rear, y = height) across the width.
 * Returns geometry in vehicle-local space with rounded edges and creased normals.
 * taper(y) -> width scale (for tumblehome).
 */
function profileExtrude(pts, width, { bevel = 0.04, segs = 3, taper = null, crease = 38 } = {}) {
  const shape = new THREE.Shape(pts.map(([f, y]) => V2(f, y)));
  const depth = Math.max(0.002, width - 2 * bevel);
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segs, steps: 1, curveSegments: 4 });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -depth / 2, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  if (taper) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getY(i)));
  }
  g.deleteAttribute('normal');
  g = toCreasedNormals(g, THREE.MathUtils.degToRad(crease));
  return g;
}

/** A flat polygon (points [f, y]) laid onto a side surface at x = xOf(y) (+ outward offset). side = +1 right, -1 left. */
function sidePanel(pts, xOf, side, off = 0.004) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([f, y]) => V2(f, y))));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = p.getX(i), y = p.getY(i);
    p.setXYZ(i, side * (xOf(y) + off), y, -f);
  }
  g.computeVertexNormals();
  // make normals point outward
  const n = g.attributes.normal;
  if (n.getX(0) * side < 0 && g.index) { g.setIndex([...g.index.array].reverse()); g.computeVertexNormals(); }
  return g;
}

/** A quad lying on a sloped profile segment (a -> b in [f,y]) between widths wa..wb, offset along its normal. */
function slopeQuad(a, b, wa, wb, off = 0.004, inset = 0.0) {
  const [fa, ya] = a, [fb, yb] = b;
  let df = fb - fa, dy = yb - ya; const len = Math.hypot(df, dy); df /= len; dy /= len;
  const A = [fa + df * inset, ya + dy * inset], B = [fb - df * inset, yb - dy * inset];
  // normal in (f,y): rotate dir to point "outward" (up / away from the body); car z = -f
  let nf = -dy, ny = df; if (ny < 0) { nf = -nf; ny = -ny; }
  const P = (f, y, x) => [x, y + ny * off, -(f + nf * off)];
  const v = [...P(A[0], A[1], -wa / 2), ...P(A[0], A[1], wa / 2), ...P(B[0], B[1], wb / 2), ...P(B[0], B[1], -wb / 2)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0 && ny > 0.01) { g.setIndex([0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); }
  return g;
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const mesh = (g, m, cast = true, recv = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; return o; };

/* ------------------------------------------------------------------ */
/* Wheels                                                               */
/* ------------------------------------------------------------------ */
function makeWheel(u, { r = 0.29, width = 0.185, rimR = 0.168, spokes = 8, rimColor = '#9a9ea4', rimMetal = 0.85, steel = false } = {}) {
  const g = new THREE.Group();
  const hw = width / 2;
  // tyre: lathe profile (radius, axial) -> rotate so the axle is along x
  const prof = [[rimR - 0.004, -hw * 0.82], [rimR + 0.02, -hw * 0.98], [r - 0.04, -hw], [r - 0.012, -hw * 0.9], [r, -hw * 0.62],
    [r, hw * 0.62], [r - 0.012, hw * 0.9], [r - 0.04, hw], [rimR + 0.02, hw * 0.98], [rimR - 0.004, hw * 0.82]].map(([a, b]) => V2(a, b));
  const tyreG = new THREE.LatheGeometry(prof, 40); tyreG.rotateZ(Math.PI / 2);
  const rubber = physical(u, { color: '#151517', roughness: 0.82, metalness: 0, sheen: 0.3, sheenRoughness: 0.8, sheenColor: new THREE.Color('#2a2a2e') }, null, 'rubber');
  g.add(mesh(tyreG, rubber));
  // sidewall lettering-ish ring (subtle)
  const rimMat = physical(u, { color: rimColor, roughness: steel ? 0.5 : 0.3, metalness: steel ? 0.2 : rimMetal, clearcoat: steel ? 0.3 : 0.6, clearcoatRoughness: 0.2 }, null, 'rim');
  const darkMat = physical(u, { color: '#1a1b1e', roughness: 0.6, metalness: 0.4 }, null, 'rimdark');
  // barrel (inside of rim) + brake drum
  const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 32, 1, true); barrel.rotateZ(Math.PI / 2);
  g.add(mesh(barrel, darkMat));
  const drum = new THREE.CylinderGeometry(rimR * 0.6, rimR * 0.6, width * 0.5, 20); drum.rotateZ(Math.PI / 2); drum.translate(-0.01, 0, 0);
  g.add(mesh(drum, darkMat));
  const face = new THREE.Group(); face.position.x = hw * 0.55; g.add(face);
  // rim lip
  const lip = new THREE.TorusGeometry(rimR, 0.011, 8, 40); lip.rotateY(Math.PI / 2);
  face.add(mesh(lip, rimMat));
  if (steel) {
    const disc = new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.96, 0.02, 32); disc.rotateZ(Math.PI / 2); disc.translate(-0.015, 0, 0);
    face.add(mesh(disc, rimMat));
    for (let i = 0; i < 6; i++) { // ventilation holes as dark discs
      const a = i / 6 * Math.PI * 2; const h = new THREE.CircleGeometry(0.022, 14); h.rotateY(Math.PI / 2);
      h.translate(0.0, Math.cos(a) * rimR * 0.62, Math.sin(a) * rimR * 0.62); face.add(mesh(h, darkMat, false));
    }
    const cap = new THREE.SphereGeometry(rimR * 0.36, 20, 10, 0, Math.PI); cap.rotateY(Math.PI / 2); cap.scale(0.35, 1, 1);
    face.add(mesh(cap, rimMat));
  } else {
    const hub = new THREE.CylinderGeometry(rimR * 0.3, rimR * 0.34, 0.05, 20); hub.rotateZ(Math.PI / 2); face.add(mesh(hub, rimMat));
    for (let i = 0; i < spokes; i++) {
      const sp = new THREE.BoxGeometry(0.03, rimR * 0.78, 0.05);
      sp.translate(-0.012, rimR * 0.54, 0); sp.rotateX(i / spokes * Math.PI * 2);
      face.add(mesh(sp, rimMat));
    }
    const cap = new THREE.CylinderGeometry(rimR * 0.16, rimR * 0.16, 0.06, 16); cap.rotateZ(Math.PI / 2); cap.translate(0.012, 0, 0);
    face.add(mesh(cap, darkMat));
    for (let i = 0; i < 4; i++) { const n = new THREE.SphereGeometry(0.009, 8, 6); const a = i / 4 * Math.PI * 2; n.translate(0.02, Math.cos(a) * rimR * 0.22, Math.sin(a) * rimR * 0.22); face.add(mesh(n, darkMat, false)); }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* Coupe                                                                */
/* ------------------------------------------------------------------ */
export function makeCoupe(o = {}) {
  const u = vehicleUniforms(o);
  const env = o.envMap || null;
  const L = 4.18, W = 1.625;
  const RW = 0.80, FW = 3.20, WR = 0.29, AR = 0.352, AY = 0.30, YB = 0.19;
  const BELT = 0.84, ROOF = 1.335, GW = 1.44, GT = 1.16;
  const group = new THREE.Group();

  const paint = physical(u, { color: o.color || '#ecebe7', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: o.envIntensity ?? 1.0 },
    { split: o.split ?? 0.47, lower: o.lower || '#0e0f12', lowerRough: 0.42, stripe: '#9a1d22', stripeY: (o.split ?? 0.47) + 0.004, stripeW: 0.01 }, 'paint');
  const trim = physical(u, { color: '#121315', roughness: 0.55, metalness: 0, envMap: env, envMapIntensity: 0.6 }, null, 'trim');
  const gloss = physical(u, { color: '#0c0d10', roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMap: env, envMapIntensity: 1.0 }, null, 'gloss');
  const glass = physical(u, { color: '#05070b', roughness: 0.05, metalness: 0, envMap: env, envMapIntensity: o.glassEnv ?? 0.9, specularIntensity: 1, ior: 1.52, polygonOffset: true, polygonOffsetFactor: -1 }, null, 'glass');
  const cabinDark = new THREE.MeshStandardMaterial({ color: '#0b0b0e', roughness: 0.9 });

  // ---- lower body (side profile with both wheel arches) ----
  const lower = [
    [0.05, YB], [0.0, 0.28], [0.0, 0.50], [0.02, 0.56], [0.03, 0.74], [0.075, 0.80],
    [0.6, 0.812], [1.6, 0.828], [2.86, BELT], [3.05, 0.838], [3.6, 0.80], [3.98, 0.745], [4.13, 0.70], [4.18, 0.62], [4.18, 0.42], [4.14, 0.25], [4.06, YB],
    ...archNotch(FW, AY, AR, YB), ...archNotch(RW, AY, AR, YB),
  ];
  // slight body-side curvature: widest at 0.6 m, pulled in toward the sill and the belt
  const bodyTaper = (y) => 1 - 0.035 * Math.pow((y - 0.6) / 0.35, 2) * (y > 0.6 ? 0.6 : 1);
  group.add(mesh(profileExtrude(lower, W, { bevel: 0.055, segs: 4, taper: bodyTaper }), paint));

  // ---- greenhouse (hatch, roof, windscreen) with tumblehome ----
  const HATCH_TOP = [1.30, 1.272], WS_TOP = [2.32, 1.292], WS_BOT = [2.88, 0.86];
  const gh = [[0.075, 0.79], [0.12, 0.815], HATCH_TOP, [1.55, 1.322], [1.95, ROOF], [2.18, 1.326], WS_TOP, WS_BOT, [2.95, 0.80]];
  const ghTaper = (y) => lerp(1, GT / GW, clamp01((y - BELT) / (ROOF - BELT)));
  group.add(mesh(profileExtrude(gh, GW, { bevel: 0.05, segs: 4, taper: ghTaper, crease: 30 }), paint));
  const ghX = (y) => (GW / 2) * ghTaper(y) - 0.002;

  // ---- glass: side windows, hatch, windscreen ----
  for (const s of [-1, 1]) {
    group.add(mesh(sidePanel([[1.86, 0.88], [2.76, 0.88], [2.31, 1.245], [1.88, 1.25]], ghX, s, 0.004), glass, false, false));
    group.add(mesh(sidePanel([[1.02, 0.88], [1.78, 0.88], [1.78, 1.245], [1.40, 1.245], [1.02, 1.04]], ghX, s, 0.004), glass, false, false));
    group.add(mesh(sidePanel([[1.78, 0.875], [1.86, 0.875], [1.88, 1.252], [1.78, 1.252]], ghX, s, 0.006), gloss));          // B-pillar
    // C-pillar louvre panel with slats
    group.add(mesh(sidePanel([[0.58, 0.875], [1.02, 0.875], [1.02, 1.04], [0.58, 0.90]], ghX, s, 0.005), trim));
    for (let i = 0; i < 6; i++) {
      const f0 = 0.62 + i * 0.065;
      group.add(mesh(sidePanel([[f0, 0.885], [f0 + 0.03, 0.885], [f0 + 0.03, 0.885 + (f0 - 0.58) * 0.37 + 0.02], [f0, 0.885 + (f0 - 0.58) * 0.37]], ghX, s, 0.009), gloss, false));
    }
    // window surround (black rubber) along the belt
    group.add(mesh(sidePanel([[0.58, 0.858], [2.80, 0.858], [2.80, 0.878], [0.58, 0.878]], ghX, s, 0.006), trim, false));
  }
  const wAt = (y) => GW * ghTaper(y) - 0.03;
  group.add(mesh(slopeQuad([0.12, 0.815], HATCH_TOP, wAt(0.83) - 0.14, wAt(1.26) - 0.14, 0.006, 0.07), glass, false, false));
  group.add(mesh(slopeQuad(WS_BOT, WS_TOP, wAt(0.87) - 0.12, wAt(1.28) - 0.14, 0.006, 0.05), glass, false, false));
  // rear wiper
  {
    const up = new THREE.Vector3(0, 0.457, -1.18).normalize(), across = new THREE.Vector3(1, 0, 0);
    const n = new THREE.Vector3().crossVectors(across, up).normalize();
    const dir = across.clone().multiplyScalar(0.82).addScaledVector(up, 0.57).normalize();
    const piv = new THREE.Vector3(0.0, 0.815 + 0.13 * 0.387, -0.25).addScaledVector(n, 0.02);
    const wg = new THREE.BoxGeometry(0.012, 0.012, 0.5); const wm = mesh(wg, trim);
    wm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); wm.position.copy(piv).addScaledVector(dir, 0.25); group.add(wm);
  }
  // cabin interior silhouette (seats, headrests) seen through the glass
  {
    const cab = new THREE.BoxGeometry(1.0, 0.3, 1.9); cab.translate(0, 0.93, -1.95); group.add(mesh(cab, cabinDark, false, false));
    for (const x of [-0.36, 0.36]) {
      const seat = new RoundedBoxGeometry(0.42, 0.5, 0.12, 2, 0.05); seat.rotateX(-0.25); seat.translate(x * 0.9, 0.95, -1.70); group.add(mesh(seat, cabinDark, false, false));
      const hr = new RoundedBoxGeometry(0.22, 0.15, 0.1, 2, 0.04); hr.translate(x * 0.9, 1.2, -1.64); group.add(mesh(hr, cabinDark, false, false));
    }
  }

  // ---- rear: tail-light bar, garnish, bumper, plate ----
  const lensTex = canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = '#3e0509'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(255,120,110,0.25)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,0,4,0.55)'; for (let y = 8; y < h; y += 12) g.fillRect(0, y, w, 3);
    g.fillStyle = '#4a2410'; g.fillRect(w * 0.74, 4, w * 0.1, h - 8);                  // amber indicator
    g.fillStyle = '#5a5654'; g.fillRect(w * 0.85, 4, w * 0.12, h - 8);                  // reverse lamp
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 8; y < h; y += 12) g.fillRect(w * 0.70, y, w * 0.28, 2);
    g.strokeStyle = '#120204'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
  const lens = physical(u, { color: '#ffffff', map: lensTex, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, envMap: env, envMapIntensity: 1.2, emissive: new THREE.Color('#2a0204'), emissiveIntensity: 0.4 }, null, 'lens');
  for (const s of [-1, 1]) {
    const lg = new RoundedBoxGeometry(0.56, 0.155, 0.05, 2, 0.012);
    if (s < 0) { const uv = lg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
    lg.translate(s * 0.505, 0.655, 0.0); group.add(mesh(lg, lens));
  }
  { const gg = new RoundedBoxGeometry(0.46, 0.06, 0.04, 2, 0.01); gg.translate(0, 0.705, -0.002); group.add(mesh(gg, gloss)); }
  { const rc = new RoundedBoxGeometry(0.42, 0.2, 0.02, 2, 0.02); rc.translate(0, 0.565, -0.012); group.add(mesh(rc, gloss)); }
  // rear bumper (black, wraps around)
  { const bg = new RoundedBoxGeometry(W + 0.03, 0.2, 0.26, 3, 0.05); bg.translate(0, 0.36, -0.06); group.add(mesh(bg, trim)); }
  { const fb = new RoundedBoxGeometry(W + 0.03, 0.2, 0.24, 3, 0.05); fb.translate(0, 0.36, -L + 0.07); group.add(mesh(fb, trim)); }
  // plate
  const plateTex = canvasTex(330, 165, (g, w, h) => {
    g.fillStyle = '#f3f0e6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2c4a2a'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#20402a'; g.textAlign = 'center';
    g.font = '28px sans-serif'; g.fillText('群馬 56', w * 0.42, 44); g.font = '26px sans-serif'; g.fillText('ふ', 34, 128);
    g.font = 'bold 86px sans-serif'; g.fillText(o.plate || '13954', w * 0.56, 140);
  });
  const plateM = physical(u, { color: '#ffffff', map: plateTex, roughness: 0.45, metalness: 0, envMap: env, envMapIntensity: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: plateTex, emissiveIntensity: o.plateGlow ?? 0.08 }, null, 'plate');
  { const pg = new THREE.PlaneGeometry(0.33, 0.165); pg.translate(0, 0.57, 0.012); group.add(mesh(pg, plateM, false)); }
  { const pf = new RoundedBoxGeometry(0.35, 0.185, 0.02, 2, 0.006); pf.translate(0, 0.57, 0.0); group.add(mesh(pf, trim, false)); }

  // ---- side details: door shut lines, handle, mirror, rubbing strip ----
  const bodyX = (y) => (W / 2) * bodyTaper(y);
  for (const s of [-1, 1]) {
    for (const f of [1.80, 2.86]) group.add(mesh(sidePanel([[f, 0.25], [f + 0.006, 0.25], [f + 0.006, 0.78], [f, 0.78]], bodyX, s, 0.002), gloss, false));
    group.add(mesh(sidePanel([[1.80, 0.25], [2.866, 0.25], [2.866, 0.256], [1.80, 0.256]], bodyX, s, 0.002), gloss, false));
    // side rubbing strip
    { const rg = new RoundedBoxGeometry(0.018, 0.035, 3.2, 2, 0.008); rg.translate(s * (bodyX(0.52) + 0.006), 0.52, -2.18); group.add(mesh(rg, trim)); }
    // door handle
    { const hg = new RoundedBoxGeometry(0.02, 0.03, 0.16, 2, 0.008); hg.translate(s * (bodyX(0.76) + 0.004), 0.76, -1.95); group.add(mesh(hg, gloss)); }
    // mirror
    const mg = new RoundedBoxGeometry(0.1, 0.085, 0.16, 3, 0.03); mg.translate(s * (ghX(0.93) + 0.09), 0.935, -2.66); group.add(mesh(mg, paint));
    const mgl = new THREE.PlaneGeometry(0.075, 0.06); mgl.translate(s * (ghX(0.93) + 0.09), 0.935, -2.578); group.add(mesh(mgl, glass, false, false));
    const ms = new THREE.BoxGeometry(0.06, 0.03, 0.05); ms.translate(s * (ghX(0.9) + 0.03), 0.91, -2.70); group.add(mesh(ms, trim));
    // side marker near the front
    { const sm = new RoundedBoxGeometry(0.012, 0.03, 0.08, 1, 0.005); sm.translate(s * (bodyX(0.6) + 0.004), 0.6, -3.75); group.add(mesh(sm, lens)); }
  }

  // ---- wheel houses + wheels ----
  const houseMat = new THREE.MeshStandardMaterial({ color: '#060607', roughness: 0.95, side: THREE.DoubleSide });
  const wheels = [];
  for (const f of [RW, FW]) {
    const hg = new THREE.CylinderGeometry(AR - 0.01, AR - 0.01, W - 0.06, 24, 1, true, 0, Math.PI); hg.rotateZ(Math.PI / 2);
    hg.translate(0, AY, -f); group.add(mesh(hg, houseMat, false, false));
    const iw = new THREE.CircleGeometry(AR, 24, 0, Math.PI); iw.rotateY(Math.PI / 2); iw.translate(0, AY, -f);
    for (const x of [-0.34, 0.34]) { const c = iw.clone(); c.translate(x, 0, 0); group.add(mesh(c, houseMat, false, false)); }
    for (const s of [-1, 1]) {
      const wh = makeWheel(u, { r: WR, width: 0.185, rimR: 0.168, spokes: o.spokes ?? 8, rimColor: o.rimColor || '#8d9298' });
      wh.position.set(s * (W / 2 - 0.12), WR, -f); if (s < 0) wh.rotation.y = Math.PI;
      group.add(wh); wheels.push(wh);
    }
  }
  // underbody
  { const ub = new THREE.BoxGeometry(W - 0.5, 0.08, L - 0.3); ub.translate(0, 0.17, -L / 2); group.add(mesh(ub, houseMat, true, false)); }
  // exhaust
  { const ex = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12); ex.rotateX(Math.PI / 2); ex.translate(-0.48, 0.2, -0.02); group.add(mesh(ex, new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.8, roughness: 0.45 }))); }

  return { group, u, wheels, length: L, width: W, materials: { paint, trim, glass, lens } };
}

/* ------------------------------------------------------------------ */
/* Kei truck                                                            */
/* ------------------------------------------------------------------ */
export function makeKeiTruck(o = {}) {
  const u = vehicleUniforms({ grime: 0.25, ...o });
  const env = o.envMap || null;
  const L = 3.395, W = 1.475;
  const RA = 0.86, FA = 2.78, WR = 0.27, AR = 0.33, AY = 0.29;
  const CAB0 = 2.04, FLOOR = 0.40, ROOF = 1.765;
  const group = new THREE.Group();

  const paint = physical(u, { color: o.color || '#e9e5dc', roughness: 0.42, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.18, envMap: env, envMapIntensity: o.envIntensity ?? 0.9 }, null, 'kpaint');
  const trim = physical(u, { color: '#18191b', roughness: 0.62, metalness: 0, envMap: env, envMapIntensity: 0.4 }, null, 'ktrim');
  const steel = physical(u, { color: '#232427', roughness: 0.55, metalness: 0.5, envMap: env, envMapIntensity: 0.5 }, null, 'ksteel');
  const glass = physical(u, { color: '#070a0f', roughness: 0.05, metalness: 0, envMap: env, envMapIntensity: o.glassEnv ?? 1.1, ior: 1.52, polygonOffset: true, polygonOffsetFactor: -1 }, null, 'kglass');
  const cabinDark = new THREE.MeshStandardMaterial({ color: '#0c0c0f', roughness: 0.9 });
  const houseMat = new THREE.MeshStandardMaterial({ color: '#08080a', roughness: 0.95, side: THREE.DoubleSide });

  // ---- cab: cab-over profile with the front wheel arch ----
  const cab = [
    [CAB0, FLOOR], [CAB0, 1.70], [CAB0 + 0.06, ROOF], [3.12, ROOF], [3.22, 1.735], [3.345, 1.21], [3.39, 1.12], [3.395, 0.62], [3.375, FLOOR],
    ...archNotch(FA, AY, AR, FLOOR),
  ];
  const cabTaper = (y) => 1 - 0.05 * clamp01((y - 1.15) / (ROOF - 1.15));
  group.add(mesh(profileExtrude(cab, W, { bevel: 0.06, segs: 4, taper: cabTaper, crease: 34 }), paint));
  const cabX = (y) => (W / 2) * cabTaper(y) - 0.002;
  const wsA = [3.345, 1.21], wsB = [3.22, 1.735];
  group.add(mesh(slopeQuad(wsA, wsB, W * 0.9, W * 0.86, 0.006, 0.05), glass, false, false));
  // interior silhouette
  { const ib = new THREE.BoxGeometry(W - 0.14, 0.5, 1.1); ib.translate(0, 1.2, -2.7); group.add(mesh(ib, cabinDark, false, false)); }
  for (const s of [-1, 1]) {
    // door window (front edge follows the A-pillar)
    group.add(mesh(sidePanel([[2.42, 1.17], [3.25, 1.17], [3.33, 1.24], [3.205, 1.69], [2.48, 1.69], [2.42, 1.62]], cabX, s, 0.004), glass, false, false));
    // small rear quarter window
    group.add(mesh(sidePanel([[2.13, 1.30], [2.32, 1.30], [2.32, 1.66], [2.13, 1.66]], cabX, s, 0.004), glass, false, false));
    // window rubber surround / door shut lines
    for (const f of [2.37, 3.33]) group.add(mesh(sidePanel([[f, 0.46], [f + 0.007, 0.46], [f + 0.007, 1.70], [f, 1.70]], cabX, s, 0.002), trim, false));
    group.add(mesh(sidePanel([[2.37, 1.145], [3.33, 1.145], [3.33, 1.152], [2.37, 1.152]], cabX, s, 0.002), trim, false));
    { const hg = new RoundedBoxGeometry(0.02, 0.035, 0.13, 2, 0.008); hg.translate(s * (cabX(1.06) + 0.004), 1.06, -2.52); group.add(mesh(hg, trim)); }
    // mirror on a stalk
    { const mg = new RoundedBoxGeometry(0.06, 0.15, 0.11, 2, 0.02); mg.translate(s * (W / 2 + 0.13), 1.38, -3.30); group.add(mesh(mg, trim));
      const st = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6); st.rotateZ(Math.PI / 2); st.translate(s * (W / 2 + 0.06), 1.33, -3.28); group.add(mesh(st, trim)); }
    // step under the door
    { const sg = new THREE.BoxGeometry(0.1, 0.03, 0.45); sg.translate(s * (W / 2 - 0.04), 0.36, -2.48); group.add(mesh(sg, steel)); }
    // indicator lamp at the front corner
    { const ig = new RoundedBoxGeometry(0.02, 0.06, 0.1, 1, 0.008); ig.translate(s * (W / 2 + 0.002), 0.98, -3.32); group.add(mesh(ig, physical(u, { color: '#d8781a', roughness: 0.15, clearcoat: 1, envMap: env }, null, 'kamber'))); }
  }
  // front bumper + grille stripe
  { const fb = new RoundedBoxGeometry(W + 0.02, 0.17, 0.12, 2, 0.04); fb.translate(0, 0.49, -L - 0.02); group.add(mesh(fb, physical(u, { color: '#bdbab3', roughness: 0.55, envMap: env }, null, 'kbump'))); }
  { const gr = new RoundedBoxGeometry(W * 0.62, 0.07, 0.02, 1, 0.01); gr.translate(0, 0.95, -L - 0.002); group.add(mesh(gr, trim)); }

  // ---- cab guard (headache rack) behind the cab ----
  {
    const fx = W / 2 - 0.05, f = CAB0 - 0.05, y0 = 1.02, y1 = 1.80;
    const tube = (a, b, r = 0.022) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), 8);
      const m = mesh(g, paint); m.position.copy(A).lerp(B, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); group.add(m);
    };
    tube([-fx, y0, -f], [-fx, y1, -f]); tube([fx, y0, -f], [fx, y1, -f]);
    tube([-fx, y1, -f], [fx, y1, -f]); tube([-fx, y0 + 0.05, -f], [fx, y0 + 0.05, -f]); tube([-fx, 1.42, -f], [fx, 1.42, -f], 0.016);
    for (let i = 1; i < 8; i++) { const x = lerp(-fx, fx, i / 8); tube([x, y0 + 0.05, -f], [x, y1, -f], 0.011); }
    // cab back panel window
    const bw = new THREE.PlaneGeometry(W * 0.62, 0.32); bw.rotateY(Math.PI); bw.translate(0, 1.47, -CAB0 + 0.004);
    group.add(mesh(bw, glass, false, false));
  }

  // ---- bed: deck, drop sides with pressed ribs, tail gate, stake posts ----
  const DECK = 0.72, GATE_H = 0.31, BW = 1.40;
  { const dg = new THREE.BoxGeometry(BW, 0.04, CAB0 - 0.06); dg.translate(0, DECK, -(CAB0 - 0.06) / 2); group.add(mesh(dg, steel)); }
  const gate = (len, alongZ) => {
    const g = new THREE.Group();
    const p = new RoundedBoxGeometry(alongZ ? 0.035 : len, GATE_H, alongZ ? len : 0.035, 2, 0.01); p.translate(0, GATE_H / 2, 0); g.add(mesh(p, paint));
    for (const yy of [0.09, 0.19]) { const r = new RoundedBoxGeometry(alongZ ? 0.05 : len - 0.08, 0.035, alongZ ? len - 0.08 : 0.05, 2, 0.012); r.translate(0, yy, 0); g.add(mesh(r, paint)); }
    const top = new RoundedBoxGeometry(alongZ ? 0.06 : len, 0.03, alongZ ? len : 0.06, 2, 0.01); top.translate(0, GATE_H, 0); g.add(mesh(top, paint));
    return g;
  };
  for (const s of [-1, 1]) { const g = gate(CAB0 - 0.08, true); g.position.set(s * (BW / 2 + 0.01), DECK + 0.02, -(CAB0 - 0.08) / 2 - 0.02); group.add(g); }
  { const g = gate(BW, false); g.position.set(0, DECK + 0.02, -0.02); group.add(g); }
  for (const s of [-1, 1]) for (const f of [0.02, CAB0 - 0.1]) { const pg = new THREE.BoxGeometry(0.06, GATE_H + 0.06, 0.06); pg.translate(s * (BW / 2 + 0.02), DECK + GATE_H / 2 + 0.02, -f); group.add(mesh(pg, paint)); }
  // hinges + rope hooks along the bottom of the side gates
  for (const s of [-1, 1]) for (const f of [0.35, 1.0, 1.65]) { const hg = new THREE.BoxGeometry(0.05, 0.04, 0.06); hg.translate(s * (BW / 2 + 0.035), DECK + 0.02, -f); group.add(mesh(hg, steel)); }

  // ---- chassis, rear lamps, bumper, fenders, mud flaps, fuel tank ----
  for (const x of [-0.42, 0.42]) { const cg = new THREE.BoxGeometry(0.07, 0.14, L - 0.5); cg.translate(x, 0.52, -(L - 0.5) / 2 - 0.08); group.add(mesh(cg, steel)); }
  { const tg = new THREE.BoxGeometry(0.5, 0.22, 0.45); tg.translate(-0.25, 0.48, -1.55); group.add(mesh(tg, steel)); }
  { const rb = new THREE.BoxGeometry(BW - 0.1, 0.07, 0.07); rb.translate(0, 0.47, 0.02); group.add(mesh(rb, steel)); }
  const kLens = physical(u, { color: '#8a1016', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, emissive: new THREE.Color('#3a0306'), emissiveIntensity: 0.6 }, null, 'klens');
  const kAmb = physical(u, { color: '#d27a1c', roughness: 0.12, clearcoat: 1, envMap: env }, null, 'kamb2');
  for (const s of [-1, 1]) {
    const hz = new THREE.BoxGeometry(0.34, 0.13, 0.08); hz.translate(s * 0.53, 0.60, -0.02); group.add(mesh(hz, trim));
    const r1 = new RoundedBoxGeometry(0.15, 0.1, 0.03, 1, 0.01); r1.translate(s * 0.6, 0.60, 0.025); group.add(mesh(r1, kLens));
    const r2 = new RoundedBoxGeometry(0.09, 0.1, 0.03, 1, 0.01); r2.translate(s * 0.47, 0.60, 0.025); group.add(mesh(r2, kAmb));
    // rear fender (half cylinder over the rear wheel) + mud flap
    const fg = new THREE.CylinderGeometry(AR, AR, 0.22, 20, 1, true, 0, Math.PI); fg.rotateZ(Math.PI / 2);
    fg.translate(s * (BW / 2 - 0.1), AY, -RA); group.add(mesh(fg, houseMat, false, false));
    const mf = new THREE.BoxGeometry(0.2, 0.22, 0.01); mf.translate(s * (BW / 2 - 0.1), 0.2, -RA + AR + 0.02); group.add(mesh(mf, trim));
  }
  // front wheel house
  { const hg = new THREE.CylinderGeometry(AR - 0.01, AR - 0.01, W - 0.08, 24, 1, true, 0, Math.PI); hg.rotateZ(Math.PI / 2); hg.translate(0, AY, -FA); group.add(mesh(hg, houseMat, false, false));
    const iw = new THREE.CircleGeometry(AR, 24, 0, Math.PI); iw.rotateY(Math.PI / 2); iw.translate(0, AY, -FA);
    for (const x of [-0.32, 0.32]) { const c = iw.clone(); c.translate(x, 0, 0); group.add(mesh(c, houseMat, false, false)); } }
  // cab underside
  { const ub = new THREE.BoxGeometry(W - 0.12, 0.08, L - CAB0 - 0.1); ub.translate(0, FLOOR - 0.02, -(CAB0 + L) / 2); group.add(mesh(ub, houseMat, true, false)); }

  const wheels = [];
  for (const f of [RA, FA]) for (const s of [-1, 1]) {
    const wh = makeWheel(u, { r: WR, width: 0.15, rimR: 0.15, steel: true, rimColor: '#c9c6bf' });
    wh.position.set(s * (f === RA ? BW / 2 - 0.1 : W / 2 - 0.13), WR, -f); if (s < 0) wh.rotation.y = Math.PI;
    group.add(wh); wheels.push(wh);
  }
  return { group, u, wheels, length: L, width: W, materials: { paint, trim, glass } };
}

/* ------------------------------------------------------------------ */
/* Environment, light, ground shadow                                    */
/* ------------------------------------------------------------------ */
const envCache = new Map();
/**
 * PMREM environment for reflections. o: { zenith, horizon, ground, sunDir, sunColor, sunPower, blocks:[{dir:[x,z], w, h, dist, color}] }
 */
export function makeEnvMap(key, o = {}) {
  if (envCache.has(key)) return envCache.get(key);
  const r = ctx.renderer; if (!r) return null;
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cZ: { value: new THREE.Color(o.zenith || '#2f86c6') }, cH: { value: new THREE.Color(o.horizon || '#cfe3ee') }, cG: { value: new THREE.Color(o.ground || '#3c3a36') } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 vD; uniform vec3 cZ, cH, cG; void main(){ float y = vD.y; vec3 c = y > 0. ? mix(cH, cZ, pow(y, 0.6)) : mix(cH * 0.6 + cG * 0.4, cG, smoothstep(0., 0.15, -y)); gl_FragColor = vec4(c, 1.); }',
  }));
  scene.add(sky);
  const sd = new THREE.Vector3(...(o.sunDir || [0.4, 0.8, 0.4])).normalize();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(o.sunSize || 2.2, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(o.sunColor || '#fff4e0').multiplyScalar(o.sunPower ?? 30) }));
  sun.position.copy(sd.clone().multiplyScalar(45)); scene.add(sun);
  // a few soft bright cloud patches
  for (const c of (o.clouds || [])) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(c.size || 6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color || '#ffffff').multiplyScalar(c.power ?? 1.6) }));
    const d = new THREE.Vector3(...c.dir).normalize(); m.position.copy(d.multiplyScalar(42)); m.scale.set(1.6, 0.6, 1.6); scene.add(m);
  }
  for (const b of (o.blocks || [])) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w || 10, b.h || 8, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color || '#2a2420') }));
    const a = Math.atan2(b.dir[0], b.dir[1]); const d = b.dist || 15;
    m.position.set(Math.sin(a) * d, (b.h || 8) / 2 + (b.y || 0) - 1.2, Math.cos(a) * d); m.lookAt(0, m.position.y, 0); scene.add(m);
  }
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(scene, 0.02, 0.1, 100).texture;
  pm.dispose();
  envCache.set(key, tex);
  return tex;
}

/** Shadow-casting sun fitted around `target` (Vector3). Returns the light. */
export function addVehicleLight(scene, { sunDir = [0.4, 0.8, 0.4], color = '#fff2e0', intensity = 3.0, target = new THREE.Vector3(), radius = 4, mapSize = 2048 } = {}) {
  const d = new THREE.Vector3(...sunDir).normalize();
  const light = new THREE.DirectionalLight(new THREE.Color(color), intensity);
  light.position.copy(target).addScaledVector(d, 30);
  light.target.position.copy(target);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  const c = light.shadow.camera; c.left = c.bottom = -radius; c.right = c.top = radius; c.near = 1; c.far = 80;
  light.shadow.bias = -0.0004; light.shadow.normalBias = 0.015; light.shadow.radius = 3;
  scene.add(light, light.target);
  return light;
}

/** Soft contact shadow + a cast-shadow catcher that respects the leaf dapple. Returns a Group placed in vehicle-local space. */
export function makeGroundShadow(veh, { contact = 0.85, cast = 0.55, color = '#05060a' } = {}) {
  const g = new THREE.Group();
  const L = veh.length, W = veh.width;
  const tex = canvasTex(256, 512, (c, w, h) => {
    c.filter = 'blur(18px)'; c.fillStyle = 'rgba(0,0,0,1)';
    const rr = (x, y, ww, hh, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + ww, y, x + ww, y + hh, r); c.arcTo(x + ww, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + ww, y, r); c.fill(); };
    rr(w * 0.2, h * 0.12, w * 0.6, h * 0.76, 30);
    c.filter = 'blur(8px)';
    for (const f of [0.22, 0.78]) for (const s of [0.24, 0.76]) { c.beginPath(); c.ellipse(w * s, h * f, w * 0.08, h * 0.06, 0, 0, Math.PI * 2); c.fill(); }
  }, false);
  const cm = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), alphaMap: tex, transparent: true, opacity: contact, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const cg = new THREE.PlaneGeometry(W * 1.35, L * 1.18); cg.rotateX(-Math.PI / 2); cg.translate(0, 0.004, -L / 2);
  const cmesh = new THREE.Mesh(cg, cm); cmesh.renderOrder = 1; g.add(cmesh);
  // cast-shadow catcher
  const sm = new THREE.ShadowMaterial({ color: new THREE.Color(color), opacity: cast, depthWrite: false });
  sm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, veh.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}\n${LEAF_GLSL}`)
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * leafMask(vWPos) );');
  };
  const sg = new THREE.PlaneGeometry(W * 4, L * 3); sg.rotateX(-Math.PI / 2); sg.translate(0, 0.006, -L / 2);
  const smesh = new THREE.Mesh(sg, sm); smesh.receiveShadow = true; smesh.renderOrder = 2; g.add(smesh);
  return g;
}
