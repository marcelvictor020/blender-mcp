// KAGERŌ anime character system (Three.js r170).
//   makeCharacter(core, spec) -> { group, joints, setPose(pose), setExpression(expr), update(t), U, spec, props }
//   toonMaterial(U, opts), outlineMaterial(U, opts), addOutline(mesh, U, opts), charUniforms(), CHAR_GLOBAL, POSES
// Body + clothes are GPU-skinned to a THREE.Bone hierarchy (bones are the named joints: root, hips, spine, chest, neck,
// head, shoulderL/R, elbowL/R, wristL/R, hipL/R, kneeL/R, ankleL/R, + fingersL/R, thumbL/R); head, hair, hands, shoes
// and props are rigid children of their bones. Shading: 2-tone hard-terminator toon with cool shadow colour + rim,
// back-face inverted-hull outlines with constant-ish pixel width. Face = canvas layer projected by the head shader.
import * as THREE from 'three';
import { autoSkin, addOutlineNormals, clamp, lerp } from './char_geo.js';
import { headShape, headGeometry, earGeometry, FacePainter } from './char_face.js';
import { buildHair, bangShadow, styleMessy, styleBob, styleLank } from './char_hair.js';
import { buildBody } from './char_wear.js';

/* ------------------------------------------------------------------ */
/* Uniforms                                                            */
/* ------------------------------------------------------------------ */
export const CHAR_GLOBAL = {
  uRes: { value: new THREE.Vector2(1280, 720) },     // set to the render size (outline px)
  uOutlineScale: { value: 1 },
};
export function charUniforms(o = {}) {
  return {
    uLightDir: { value: new THREE.Vector3(...(o.lightDir || [-0.45, 0.55, 0.7])).normalize() },
    uRimDir: { value: new THREE.Vector3(...(o.rimDir || [0.7, 0.35, -0.6])).normalize() },
    uRimColor: { value: new THREE.Color(o.rimColor || '#fff4e6') },
    uRimAmt: { value: o.rimAmt ?? 0.35 },
    uLightTint: { value: new THREE.Color(o.lightTint || '#ffffff') },
    uShadowTint: { value: new THREE.Color(o.shadowTint || '#ffffff') },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3(0, 0, 0) },
    uSway: { value: o.sway ?? 1 },
    ...CHAR_GLOBAL,
  };
}

/** cool, slightly saturated shadow colour for a base colour (sRGB hex in, hex out) */
export function autoShade(hex, k = 0.72) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  const s = new THREE.Color().setHSL((hsl.h + (hsl.h > 0.08 && hsl.h < 0.6 ? 0.02 : -0.0)) % 1, Math.min(1, hsl.s * 1.08 + 0.04), hsl.l * k);
  s.lerp(new THREE.Color('#5a64a0'), 0.12);
  return '#' + s.getHexString();
}
export function autoLine(hex, k = 0.32) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  return '#' + new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9 + 0.1), Math.max(0.03, hsl.l * k)).getHexString();
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const SWAY_GLSL = /* glsl */`
  attribute float aT; attribute float aPh; attribute float aS;
  uniform float uTime, uSway; uniform vec3 uWind;
  vec3 hairSway(vec3 p){
    float w = aT * aT * uSway;
    float ph = aPh * 2.399;
    vec3 d = vec3(sin(uTime * 1.6 + ph) * 0.018 + sin(uTime * 2.7 + ph * 1.7) * 0.008,
                  sin(uTime * 2.1 + ph * 0.7) * 0.004,
                  sin(uTime * 1.3 + ph * 1.3) * 0.01);
    if (p.z > 0.25 && p.y < 0.7) d.z = abs(d.z);         // bangs never swing into the face
    return (d + uWind) * w;
  }`;

const TOON_VS = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  varying vec3 vN; varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec2 vUv;
  #ifdef HAIR
    ${SWAY_GLSL}
    varying float vT; varying float vPh; varying float vS;
  #endif
  void main(){
    #include <skinbase_vertex>
    vec3 objectNormal = normal;
    #include <skinnormal_vertex>
    vec3 transformed = position;
    #include <skinning_vertex>
    vOP = position; vON = normal; vUv = uv;
    #ifdef HAIR
      transformed += hairSway(position); vT = aT; vPh = aPh; vS = aS;
    #endif
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * objectNormal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const TOON_FS = /* glsl */`
  uniform vec3 uColor, uShade, uLightDir, uRimDir, uRimColor, uLightTint, uShadowTint;
  uniform float uRimAmt, uRimK, uTerm, uSoft, uBackDim;
  varying vec3 vN; varying vec3 vWP; varying vec3 vOP; varying vec3 vON; varying vec2 vUv;
  #ifdef USE_TMAP
    uniform sampler2D uMap;
  #endif
  #ifdef HAIR
    uniform vec3 uHl, uHairC, uStrand; uniform float uHlY, uHlW, uHlAmt;
    varying float vT; varying float vPh; varying float vS;
  #endif
  #ifdef FACE
    uniform sampler2D uFace; uniform vec3 uEyeL, uEyeR, uGlowCol; uniform float uGlowL, uGlowR;
  #endif
  #ifdef EMIT
    uniform vec3 uEmit;
  #endif
  float extraLit(){ ${'SHADOW_FN'} }
  float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  void main(){
    vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(cameraPosition - vWP);
    float ndl = dot(n, normalize(uLightDir));
    float lit = smoothstep(uTerm - uSoft, uTerm + uSoft, ndl) * extraLit();
    vec3 base = uColor, sh = uShade * uShadowTint;
    #ifdef USE_TMAP
      vec4 tx = texture2D(uMap, vUv); base *= tx.rgb; sh *= tx.rgb;
    #endif
    vec3 c = mix(sh, base, lit) * uLightTint;
    #ifdef HAIR
      // anime highlight band: zig-zag streaks at a fixed height on the head, broken per clump
      vec3 hp = vOP - uHairC; float r = length(hp); float el = hp.y / max(r, 1e-4); float az = atan(hp.x, hp.z);
      float cid = h1(floor(vPh));
      float y0 = uHlY + (cid - 0.5) * 0.08 + 0.06 * (1.0 - cos(az)) * 0.5;
      float zig = pow(abs(fract(az * 7.0 + cid * 3.0) - 0.5) * 2.0, 1.5);   // 0..1 sawtooth (sharp teeth)
      float lo = y0 - uHlW * (0.2 + 0.8 * zig), hi = y0 + uHlW * 0.25 * (1.0 - zig * 0.5);
      float band = step(lo, el) * step(el, hi) * step(0.12, vT) * step(vT, 0.85) * step(0.22, cid);
      float facing = smoothstep(0.25, 0.55, dot(n, v)) * (0.25 + 0.75 * lit);
      c = mix(c, uHl * uLightTint, band * facing * uHlAmt);
      // drawn strand lines along each clump (1-2 per clump, fading toward root and tip)
      float off = (cid - 0.5) * 0.5;
      float ln = 1.0 - smoothstep(0.035, 0.07, abs(vS - off - 0.12)) ;
      ln = max(ln, (1.0 - smoothstep(0.03, 0.06, abs(vS + 0.45 - off * 0.5))) * step(0.5, cid));
      ln *= smoothstep(0.2, 0.35, vT) * (1.0 - smoothstep(0.75, 0.92, vT)) * smoothstep(0.1, 0.35, dot(n, v));
      c = mix(c, uStrand, ln * 0.85);
    #endif
    float fr = 1.0 - clamp(dot(n, v), 0.0, 1.0);
    float rim = smoothstep(uRimK, uRimK + 0.05, fr) * smoothstep(-0.05, 0.3, dot(n, normalize(uRimDir)));
    c = mix(c, uRimColor * mix(base, vec3(1.0), 0.6), rim * uRimAmt);
    #ifdef FACE
      vec3 on = normalize(vON);
      float fm = smoothstep(0.0, 0.3, on.z) * step(0.0, vOP.z);
      vec4 f = texture2D(uFace, vec2(vOP.x + 0.5, vOP.y));
      c = mix(c, f.rgb * mix(0.86, 1.0, lit) * uLightTint, f.a * fm);
      vec2 fp = vOP.xy;
      float dL = length((fp - uEyeL.xy) / vec2(1.0, 1.25)) / uEyeL.z, dR = length((fp - uEyeR.xy) / vec2(1.0, 1.25)) / uEyeR.z;
      c += uGlowCol * (uGlowL * (exp(-dL * dL * 2.0) * 0.25 + step(dL, 0.8) * f.a * 0.9 * smoothstep(0.25, 0.6, f.r - f.g)) +
                       uGlowR * (exp(-dR * dR * 2.0) * 0.25 + step(dR, 0.8) * f.a * 0.9 * smoothstep(0.25, 0.6, f.r - f.g))) * fm;
    #endif
    #ifdef EMIT
      c += uEmit;
    #endif
    if (!gl_FrontFacing) c *= uBackDim;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const OUTLINE_VS = /* glsl */`
  #include <common>
  #include <skinning_pars_vertex>
  attribute vec3 oN;
  uniform float uPx, uOutlineScale; uniform vec2 uRes;
  #ifdef HAIR
    ${SWAY_GLSL}
  #endif
  void main(){
    #include <skinbase_vertex>
    vec3 objectNormal = oN;
    #include <skinnormal_vertex>
    vec3 transformed = position;
    #include <skinning_vertex>
    #ifdef HAIR
      transformed += hairSway(position);
    #endif
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec3 nv = normalize(normalMatrix * objectNormal);
    vec2 d = nv.xy; float L = length(d); d = L > 1e-5 ? d / L : vec2(0.0);
    float px = uPx * uOutlineScale * clamp(pow(2.4 / max(-mv.z, 0.05), 0.55), 0.55, 1.9) * (uRes.y / 720.0);
    clip.xy += d * px * 2.0 / uRes * clip.w;
    clip.z += 0.00002 * clip.w;
    gl_Position = clip;
  }`;
const OUTLINE_FS = /* glsl */`uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Toon material. opts: color, shade, term (terminator, -1..1), soft, rimAmt, rimK, map (texture), hair ({hl, hlY, hlW}),
 * face (FacePainter texture), emit, shadowFn (GLSL body returning 0..1 lit factor from vOP/vON), backDim, side.
 */
export function toonMaterial(U, o = {}) {
  const color = o.color || '#ffffff';
  const uniforms = {
    ...U,
    uColor: { value: new THREE.Color(color) },
    uShade: { value: new THREE.Color(o.shade || autoShade(color)) },
    uTerm: { value: o.term ?? -0.05 }, uSoft: { value: o.soft ?? 0.025 },
    uRimK: { value: o.rimK ?? 0.6 }, uBackDim: { value: o.backDim ?? 0.78 },
  };
  if (o.rimAmt !== undefined) uniforms.uRimAmt = { value: o.rimAmt };
  const defines = {};
  if (o.map) { defines.USE_TMAP = ''; uniforms.uMap = { value: o.map }; }
  if (o.hair) {
    defines.HAIR = '';
    uniforms.uHl = { value: new THREE.Color(o.hair.hl) }; uniforms.uHairC = { value: new THREE.Vector3(0, 0.56, 0) };
    uniforms.uHlY = { value: o.hair.hlY ?? 0.42 }; uniforms.uStrand = { value: new THREE.Color(o.hair.strand || '#000000') }; uniforms.uHlW = { value: o.hair.hlW ?? 0.1 }; uniforms.uHlAmt = { value: o.hair.amt ?? 1 };
  }
  if (o.face) {
    defines.FACE = '';
    Object.assign(uniforms, { uFace: { value: o.face }, uEyeL: o.eyeL, uEyeR: o.eyeR, uGlowL: o.glowL, uGlowR: o.glowR, uGlowCol: { value: new THREE.Color('#ff1a30') } });
  }
  if (o.emit) { defines.EMIT = ''; uniforms.uEmit = { value: new THREE.Color(o.emit) }; }
  const m = new THREE.ShaderMaterial({
    uniforms, defines, vertexShader: TOON_VS,
    fragmentShader: TOON_FS.replace("${'SHADOW_FN'}", o.shadowFn || 'return 1.0;').replace('SHADOW_FN', o.shadowFn || 'return 1.0;'),
    side: o.side ?? THREE.FrontSide,
  });
  m.userData.toon = true;
  return m;
}

export function outlineMaterial(U, o = {}) {
  const defines = {}; if (o.hair) defines.HAIR = '';
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(o.color || '#1a1014') }, uPx: { value: o.px ?? 1.6 } },
    defines, vertexShader: OUTLINE_VS, fragmentShader: OUTLINE_FS, side: THREE.BackSide,
  });
}

/** Add an inverted-hull outline sibling for mesh (shares the geometry; skinned meshes get a skinned hull). */
export function addOutline(mesh, U, o = {}) {
  const geo = mesh.geometry;
  if (!geo.attributes.oN) addOutlineNormals(geo);
  const mat = outlineMaterial(U, o);
  let ol;
  if (mesh.isSkinnedMesh) { ol = new THREE.SkinnedMesh(geo, mat); ol.bind(mesh.skeleton, mesh.bindMatrix); }
  else ol = new THREE.Mesh(geo, mat);
  ol.position.copy(mesh.position); ol.quaternion.copy(mesh.quaternion); ol.scale.copy(mesh.scale);
  ol.frustumCulled = false; ol.name = (mesh.name || 'mesh') + '_outline';
  mesh.parent.add(ol);
  mesh.userData.outline = ol;
  return ol;
}

export const outline = addOutline;

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */
export const JOINTS = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR', 'fingersL', 'thumbL', 'fingersR', 'thumbR'];

/** Body dimensions (metres, character space, feet at y=0, facing +z, character's left = +x). */
export function bodyDims(spec) {
  const fem = spec.gender === 'f';
  const s = (spec.height || 1.72) / 1.72;
  const H = spec.headH || 0.235;
  const D = { s, fem, H, height: spec.height || 1.72 };
  D.ankleY = 0.075 * s; D.kneeY = 0.49 * s; D.hipJY = 0.90 * s; D.hipX = (fem ? 0.085 : 0.088) * s;
  D.hipsY = 0.95 * s; D.spineY = 1.07 * s; D.chestY = 1.22 * s; D.neckY = 1.405 * s;
  D.chinY = D.height - H; D.headY = D.chinY + 0.17 * H;
  D.shY = 1.373 * s - (fem ? 0.01 : 0); D.shX = (fem ? 0.145 : 0.158) * s * (spec.shoulderK || 1);
  D.elbowY = D.shY - 0.275 * s; D.wristY = D.elbowY - 0.235 * s;
  return D;
}

/* ------------------------------------------------------------------ */
/* Poses (radians, Euler XYZ on each bone; negative x on a limb = swing forward)                          */
/* ------------------------------------------------------------------ */
export const POSES = {
  rest: {},
  stand: { shoulderL: [0.02, 0, 0.1], shoulderR: [0.02, 0, -0.1], elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0], wristL: [0, 0, -0.05], wristR: [0, 0, 0.05],
    hipL: [0, 0, 0.02], hipR: [0, 0, -0.02], spine: [0.02, 0, 0], head: [0.03, 0, 0], curlL: 0.35, curlR: 0.35 },
  lookBack: { rootRot: [0, 0, 0], spine: [0, 0.32, 0], chest: [0, 0.38, -0.04], neck: [0.05, 0.45, 0.0], head: [0.12, 0.55, 0.1],
    shoulderL: [0.15, 0, 0.12], shoulderR: [-0.1, 0, -0.14], elbowL: [-0.2, 0, 0], elbowR: [-0.25, 0, 0], hipL: [0, 0.1, 0.02], hipR: [0, 0.1, -0.02], kneeR: [0.08, 0, 0], curlL: 0.4, curlR: 0.4 },
  armsOutLeap: { rootPos: [0, 0.35, 0], hips: [-0.12, 0, 0], spine: [-0.1, 0, 0], chest: [-0.14, 0, 0], neck: [-0.1, 0, 0], head: [-0.15, 0, 0],
    shoulderL: [-0.25, 0, 1.25], shoulderR: [-0.25, 0, -1.25], elbowL: [-0.15, 0, 0.15], elbowR: [-0.15, 0, -0.15], wristL: [0, 0, 0.2], wristR: [0, 0, -0.2],
    hipL: [-1.25, 0, 0.08], kneeL: [1.45, 0, 0], ankleL: [0.3, 0, 0], hipR: [0.45, 0, -0.05], kneeR: [0.9, 0, 0], ankleR: [0.45, 0, 0], curlL: 0.1, curlR: 0.1 },
  sitRailing: { rootPos: [0, 0, 0], hips: [0, 0, 0], spine: [0.08, 0, 0], chest: [0.06, 0, 0], head: [0.05, 0, 0],
    hipL: [-1.5, 0, 0.06], hipR: [-1.5, 0, -0.06], kneeL: [1.35, 0, 0], kneeR: [1.55, 0, 0], ankleL: [0.1, 0, 0], ankleR: [-0.05, 0, 0],
    shoulderL: [0.2, 0, 0.2], shoulderR: [0.2, 0, -0.2], elbowL: [0, 0, 0], elbowR: [0, 0, 0], wristL: [0, 0, 0.6], wristR: [0, 0, -0.6], curlL: 0.9, curlR: 0.9 },
  bike: { spine: [0.18, 0, 0], chest: [0.16, 0, 0], neck: [-0.12, 0, 0], head: [-0.16, 0, 0],
    shoulderL: [-0.95, 0, 0.18], shoulderR: [-0.95, 0, -0.18], elbowL: [-0.35, 0, 0], elbowR: [-0.35, 0, 0], wristL: [0.2, 0, -0.5], wristR: [0.2, 0, 0.5],
    hipL: [-1.55, 0, 0.05], kneeL: [1.75, 0, 0], ankleL: [-0.2, 0, 0], hipR: [-0.85, 0, -0.05], kneeR: [1.0, 0, 0], ankleR: [0.1, 0, 0], curlL: 0.95, curlR: 0.95 },
  holdJar: { spine: [-0.03, 0, 0], chest: [-0.05, -0.1, 0], neck: [0.05, 0.05, 0], head: [0.12, 0.12, -0.1],
    shoulderR: [-2.35, 0.25, -0.15], elbowR: [-0.75, 0, 0], wristR: [0.15, 0, -0.35],
    shoulderL: [0.05, 0, 0.12], elbowL: [-0.2, 0, 0], curlR: 0.85, curlL: 0.4, hipL: [0, 0, 0.03], hipR: [0, 0, -0.03] },
};

/* ------------------------------------------------------------------ */
/* Character                                                           */
/* ------------------------------------------------------------------ */
export function makeCharacter(core, spec) {
  const U = spec.uniforms || charUniforms(spec.light || {});
  const D = bodyDims(spec);
  const group = new THREE.Group(); group.name = spec.name || 'character';
  // --- bones
  const J = {};
  const mk = (name, parent, x, y, z) => { const b = new THREE.Bone(); b.name = name; J[name] = b; b.userData.rest = new THREE.Vector3(x, y, z); if (parent) { parent.add(b); } return b; };
  const W = {};                                            // rest world positions
  const place = (name, parent, wx, wy, wz) => { const pw = parent ? W[parent] : new THREE.Vector3(); W[name] = new THREE.Vector3(wx, wy, wz); const b = mk(name, parent ? J[parent] : null, wx - pw.x, wy - pw.y, wz - pw.z); b.position.copy(b.userData.rest); return b; };
  place('root', null, 0, 0, 0); group.add(J.root);
  place('hips', 'root', 0, D.hipsY, 0);
  place('spine', 'hips', 0, D.spineY, 0);
  place('chest', 'spine', 0, D.chestY, 0);
  place('neck', 'chest', 0, D.neckY, -0.008 * D.s);
  place('head', 'neck', 0, D.headY, -0.004 * D.s);
  for (const [S, sx] of [['L', 1], ['R', -1]]) {
    place('shoulder' + S, 'chest', sx * D.shX, D.shY, -0.006 * D.s);
    place('elbow' + S, 'shoulder' + S, sx * D.shX, D.elbowY, -0.006 * D.s);
    place('wrist' + S, 'elbow' + S, sx * D.shX, D.wristY, -0.004 * D.s);
    place('fingers' + S, 'wrist' + S, sx * D.shX, D.wristY - 0.085 * D.s * (spec.handK || 1), 0);
    place('thumb' + S, 'wrist' + S, sx * (D.shX - 0.008 * D.s), D.wristY - 0.022 * D.s, 0.022 * D.s);
    place('hip' + S, 'hips', sx * D.hipX, D.hipJY, 0);
    place('knee' + S, 'hip' + S, sx * D.hipX, D.kneeY, 0.004 * D.s);
    place('ankle' + S, 'knee' + S, sx * D.hipX, D.ankleY, -0.01 * D.s);
  }
  group.updateMatrixWorld(true);
  const boneList = JOINTS.map(n => J[n]);
  const skeleton = new THREE.Skeleton(boneList);
  const boneIndex = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
  // bone segments for proximity skinning (character space)
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const SEG = {
    hips: [W.hips, v3(0, D.hipJY - 0.06 * D.s, 0)], spine: [W.spine, W.chest], chest: [W.chest, W.neck], neck: [W.neck, W.head], head: [W.head, v3(0, D.height, 0)],
  };
  for (const S of ['L', 'R']) {
    SEG['shoulder' + S] = [W['shoulder' + S], W['elbow' + S]]; SEG['elbow' + S] = [W['elbow' + S], W['wrist' + S]];
    SEG['wrist' + S] = [W['wrist' + S], W['fingers' + S]]; SEG['fingers' + S] = [W['fingers' + S], W['fingers' + S].clone().add(v3(0, -0.07, 0))]; SEG['thumb' + S] = [W['thumb' + S], W['thumb' + S].clone().add(v3(0, -0.04, 0.02))];
    SEG['hip' + S] = [W['hip' + S], W['knee' + S]]; SEG['knee' + S] = [W['knee' + S], W['ankle' + S]]; SEG['ankle' + S] = [W['ankle' + S], W['ankle' + S].clone().add(v3(0, -0.05, 0.15))];
  }
  // candidates: 'name' | 'name:bias' | { j, bias, a, b }
  const cand = list => list.map(c => {
    if (typeof c === 'string') { const [j, b] = c.split(':'); c = { j, bias: b ? +b : 1 }; }
    const sg = SEG[c.j];
    return { index: boneIndex[c.j], a: c.a || sg[0], b: c.b || sg[1], bias: c.bias ?? 1 };
  });

  // --- mesh helpers
  const meshes = [];
  const ctx = {
    THREE, U, D, J, W, spec, SEG, group, toon: (o) => toonMaterial(U, o),
    /** skinned mesh in character space */
    skinned(geo, mat, cands, { outline = 1.5, lineColor, fixed = null, k = 6, name } = {}) {
      autoSkin(geo, cand(cands), { k, fixed: fixed ? (p) => { const r = fixed(p); return r && r.map(([j, w]) => [boneIndex[j], w]); } : null });
      addOutlineNormals(geo);
      const m = new THREE.SkinnedMesh(geo, mat.isMaterial ? mat : toonMaterial(U, mat));
      m.name = name || ''; m.frustumCulled = false;
      J.root.parent.add(m); m.bind(skeleton, new THREE.Matrix4());
      if (outline) addOutline(m, U, { px: outline, color: lineColor || autoLine((mat.color || '#888888')) });
      meshes.push(m); return m;
    },
    /** rigid mesh attached to a bone; geometry given in character space (rest) unless local=true */
    rigid(geo, mat, bone, { outline = 1.5, lineColor, local = false, name, hair = false } = {}) {
      if (!local) geo.translate(-W[bone].x, -W[bone].y, -W[bone].z);
      addOutlineNormals(geo);
      const m = new THREE.Mesh(geo, mat.isMaterial ? mat : toonMaterial(U, mat));
      m.name = name || ''; m.frustumCulled = false;
      J[bone].add(m);
      if (outline) addOutline(m, U, { px: outline, color: lineColor || autoLine(mat.color || '#888888'), hair });
      meshes.push(m); return m;
    },
  };

  // --- head (rigid, head units under headRoot)
  const HS = headShape(spec.headShape || {});
  const headRoot = new THREE.Group(); headRoot.name = 'headRoot';
  headRoot.scale.setScalar(D.H); headRoot.position.set(0, -0.17 * D.H, 0.05 * D.H);
  J.head.add(headRoot);
  const F = { skinShade: spec.skinShade, ...spec.face };
  const painter = new FacePainter(F, { size: spec.faceRes || 1536 });
  const eyeL = { value: new THREE.Vector3(F.eyeX, F.eyeY, F.eyeW * 1.1) }, eyeR = { value: new THREE.Vector3(-F.eyeX, F.eyeY, F.eyeW * 1.1) };
  const glowL = { value: 0 }, glowR = { value: 0 };
  const skinMat = toonMaterial(U, { color: spec.skin, shade: spec.skinShade, term: -0.2, rimAmt: 0.25 });
  const headMat = toonMaterial(U, { color: spec.skin, shade: spec.skinShade, term: -0.25, rimAmt: 0.2, face: painter.tex, eyeL, eyeR, glowL, glowR });
  const headGeo = headGeometry(HS); addOutlineNormals(headGeo);
  const head = new THREE.Mesh(headGeo, headMat); head.name = 'head'; headRoot.add(head);
  addOutline(head, U, { px: spec.faceLine ?? 1.25, color: spec.skinLine || '#6a3f3a' });
  // brow decal: same head surface + projection, pulled toward the camera so the brows read through the bangs
  const browMat = new THREE.ShaderMaterial({
    uniforms: { uBrow: { value: painter.browTex }, uBias: { value: (spec.browBias ?? 0.13) * D.H }, uLightTint: U.uLightTint },
    vertexShader: `varying vec3 vOP; varying vec3 vON; uniform float uBias;
      void main(){ vOP = position; vON = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); mv.xyz += normalize(-mv.xyz) * uBias; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uBrow; uniform vec3 uLightTint; varying vec3 vOP; varying vec3 vON;
      void main(){ float fm = smoothstep(0.05, 0.35, normalize(vON).z) * step(0.0, vOP.z);
        vec4 b = texture2D(uBrow, vec2(vOP.x + 0.5, vOP.y)); float a = b.a * fm; if (a < 0.02) discard;
        gl_FragColor = vec4(b.rgb * uLightTint, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const brows = new THREE.Mesh(headGeo, browMat); brows.name = 'brows'; brows.renderOrder = 6; headRoot.add(brows);
  for (const sx of [-1, 1]) {
    const eg = earGeometry(); eg.scale(sx, 1, 1); if (sx < 0) eg.index.array.reverse(); eg.computeVertexNormals(); addOutlineNormals(eg);
    const ear = new THREE.Mesh(eg, skinMat); ear.position.set(sx * (HS.W(0.4) - 0.012), 0.385, -0.03); ear.rotation.set(0, sx * 0.25, sx * -0.08); headRoot.add(ear);
    addOutline(ear, U, { px: 1.1, color: spec.skinLine || '#6a3f3a' });
  }
  // --- hair
  const style = { messy: styleMessy, bob: styleBob, lank: styleLank }[spec.hair.style](HS, spec.hair.seed);
  const hb = buildHair(style.list, style.elH, spec.hair.capLift ?? 0.035);
  const hairMat = toonMaterial(U, { color: spec.hair.color, shade: spec.hair.shade || autoShade(spec.hair.color, 0.62), term: -0.1, rimAmt: 0.3,
    hair: { strand: spec.hair.strandColor || spec.hair.line || autoLine(spec.hair.color, 0.4), hl: spec.hair.hl, hlY: spec.hair.hlY ?? 0.45, hlW: spec.hair.hlW ?? 0.07, amt: spec.hair.hlAmt ?? 1 } });
  const hairLine = spec.hair.line || autoLine(spec.hair.color, 0.35);
  const hairMesh = new THREE.Mesh(hb.geo, hairMat); hairMesh.name = 'hair'; headRoot.add(hairMesh);
  addOutline(hairMesh, U, { px: spec.hair.linePx ?? 1.7, color: hairLine, hair: true });
  const capGeo = hb.capGeo; const nC = capGeo.attributes.position.count;
  capGeo.setAttribute('aT', new THREE.Float32BufferAttribute(new Float32Array(nC), 1)); capGeo.setAttribute('aPh', new THREE.Float32BufferAttribute(new Float32Array(nC), 1)); capGeo.setAttribute('aS', new THREE.Float32BufferAttribute(new Float32Array(nC).fill(5), 1));
  const cap = new THREE.Mesh(capGeo, hairMat); cap.name = 'hairCap'; headRoot.add(cap);
  addOutline(cap, U, { px: (spec.hair.linePx ?? 1.7) * 0.88, color: hairLine, hair: true });
  painter.bangShadow = bangShadow(hb.clumps, spec.hair.shadowDrop ?? 0.035, spec.hair.shadowDx ?? 0.0);

  // --- body & clothes
  const props = buildBody(ctx, spec) || {};

  // --- expression
  const expr = { blink: 0, lookX: 0, lookY: 0, mouth: 'closed', eyeColorL: null, eyeColorR: null, pupilSlitL: 0, pupilSlitR: 0, glowL: 0, glowR: 0, eyeSmile: 0, brow: 0, blush: F.blush ?? 0.6, ...(spec.expr || {}) };
  function setExpression(e = {}) {
    Object.assign(expr, e);
    glowL.value = expr.glowL || 0; glowR.value = expr.glowR || 0;
    painter.draw(expr);
  }
  setExpression({});

  function setPose(p = {}) {
    if (typeof p === 'string') p = POSES[p] || {};
    for (const n of JOINTS) { J[n].rotation.set(0, 0, 0); J[n].position.copy(J[n].userData.rest); }
    for (const [k, v] of Object.entries(p)) if (J[k] && Array.isArray(v)) J[k].rotation.set(v[0], v[1], v[2], v[3] || 'XYZ');
    if (p.rootPos) J.root.position.set(...p.rootPos);
    if (p.rootRot) J.root.rotation.set(...p.rootRot);
    for (const S of ['L', 'R']) {
      const c = p['curl' + S] ?? 0.3, sx = S === 'L' ? 1 : -1;
      J['fingers' + S].rotation.z += -sx * c * 1.35; J['thumb' + S].rotation.x += -c * 0.5; J['thumb' + S].rotation.z += -sx * c * 0.4;
    }
    group.updateMatrixWorld(true);
  }
  setPose(spec.pose || 'stand');

  function update(t) {
    U.uTime.value = t;
    if (props.update) props.update(t);
  }
  return { group, joints: J, skeleton, setPose, setExpression, update, U, spec, D, props, painter, expr, headRoot, meshes };
}
