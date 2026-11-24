// Ocean surface: Gerstner swell + detail normals, planar reflections,
// screen-space refraction with depth-based absorption, foam and wake coupling.
import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';
import { waterNormalTexture, foamTexture } from '../util/textures.js';

function buildPolarGrid(segments = 200) {
  const radii = [0];
  let r = 0, step = 0.32;
  while (r < 9000) {
    r += step;
    radii.push(r);
    if (r > 7) step *= 1.042;
  }
  const rings = radii.length;
  const pos = new Float32Array((1 + (rings - 1) * segments) * 3);
  const spacing = new Float32Array(1 + (rings - 1) * segments);
  spacing[0] = 0.3;
  for (let i = 1; i < rings; i++) {
    const rr = radii[i];
    const sp = Math.max(radii[Math.min(i + 1, rings - 1)] - radii[i - 1], (rr * Math.PI * 2) / segments) * 0.8;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const k = 1 + (i - 1) * segments + s;
      pos[k * 3] = Math.cos(a) * rr;
      pos[k * 3 + 1] = 0;
      pos[k * 3 + 2] = Math.sin(a) * rr;
      spacing[k] = sp;
    }
  }
  const idx = [];
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let i = 1; i < rings - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + (i - 1) * segments + s;
      const b = 1 + (i - 1) * segments + ((s + 1) % segments);
      const c = 1 + i * segments + s;
      const d = 1 + i * segments + ((s + 1) % segments);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSpacing', new THREE.BufferAttribute(spacing, 1));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
${WAVE_GLSL}
attribute float aSpacing;
uniform vec3 uCenter;
uniform sampler2D uWaterData; uniform vec4 uWaterBounds;
uniform sampler2D uWake; uniform vec3 uWakeInfo;
uniform mat4 uReflMatrix;
varying vec3 vWorld; varying vec2 vP0; varying float vAtten; varying vec4 vRefl; varying float vSeabed;
varying float vWakeEdge;

void main(){
  vec2 p = position.xz + uCenter.xz;
  vec2 wuv = (p - uWaterBounds.xy) / uWaterBounds.zw;
  vec4 wd = vec4(-60.0, 1.0, 0.0, 1.0);
  if (wuv.x > 0.0 && wuv.y > 0.0 && wuv.x < 1.0 && wuv.y < 1.0) wd = texture2D(uWaterData, wuv);
  vAtten = wd.g; vSeabed = wd.r;
  float dCam = length(p - cameraPosition.xz);
  float footprint = max(aSpacing, dCam * 0.0016);
  vec3 d = gerstnerDisplace(p, vAtten, footprint);
  vec2 kuv = (p - uWakeInfo.xy) / uWakeInfo.z + 0.5;
  vec2 ke = smoothstep(0.0, 0.08, kuv) * smoothstep(1.0, 0.92, kuv);
  vWakeEdge = ke.x * ke.y;
  if (vWakeEdge > 0.0) d.y += texture2D(uWake, kuv).g * vWakeEdge;
  vec3 w = vec3(p.x + d.x, d.y, p.y + d.z);
  vWorld = w; vP0 = p;
  vRefl = uReflMatrix * vec4(p.x, 0.0, p.y, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;

const FRAG = /* glsl */ `
${WAVE_GLSL}
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunI;
uniform vec3 uHorizon; uniform vec3 uZenith;
uniform sampler2D uReflTex; uniform sampler2D uRefrTex; uniform sampler2D uDepthTex;
uniform sampler2D uNormalTex; uniform sampler2D uFoamTex; uniform sampler2D uWake; uniform vec3 uWakeInfo;
uniform vec2 uResolution; uniform float uNear; uniform float uFar;
uniform float uUnderwater; uniform float uFogDensity; uniform vec3 uAbsorb; uniform vec3 uDeep;
uniform float uSeaState; uniform float uNight; uniform vec3 uUnderFog;
varying vec3 vWorld; varying vec2 vP0; varying float vAtten; varying vec4 vRefl; varying float vSeabed;
varying float vWakeEdge;

float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }

vec3 sampleDetail(vec2 uv){ vec3 n = texture2D(uNormalTex, uv).xyz * 2.0 - 1.0; return vec3(n.x, 0.0, n.y); }

void main(){
  vec3 Vv = cameraPosition - vWorld;
  float dist = length(Vv);
  vec3 V = Vv / dist;
  float footprint = dist * 0.0022;
  float jac, crest;
  vec3 N = gerstnerNormal(vP0, vAtten, footprint, jac, crest);

  // detail ripples: three scrolling layers, faded with distance to avoid shimmer
  float fadeA = exp(-dist * 0.0025), fadeB = exp(-dist * 0.012), fadeC = exp(-dist * 0.05);
  vec3 dn = sampleDetail(vWorld.xz * 0.045 + uTime * vec2(0.010, -0.016)) * 0.55 * fadeA
          + sampleDetail(vWorld.xz * 0.13 + uTime * vec2(-0.021, -0.012)) * 0.40 * fadeB
          + sampleDetail(vWorld.xz * 0.47 + uTime * vec2(0.034, 0.027)) * 0.30 * fadeC;
  float detailAmt = (0.25 + 0.55 * uSeaState) * (0.35 + 0.65 * vAtten);
  N = normalize(N + dn * detailAmt);

  // wake (simulated ripples + foam from the vehicle)
  float wakeFoam = 0.0, turb = 0.0;
  if (vWakeEdge > 0.0) {
    vec2 kuv = (vP0 - uWakeInfo.xy) / uWakeInfo.z + 0.5;
    float e = 1.0 / 512.0;
    vec4 c = texture2D(uWake, kuv);
    float hl = texture2D(uWake, kuv - vec2(e, 0.0)).g, hr = texture2D(uWake, kuv + vec2(e, 0.0)).g;
    float hd = texture2D(uWake, kuv - vec2(0.0, e)).g, hu = texture2D(uWake, kuv + vec2(0.0, e)).g;
    vec2 grad = vec2(hr - hl, hu - hd) / (2.0 * e * uWakeInfo.z);
    N = normalize(N + vec3(-grad.x, 0.0, -grad.y) * vWakeEdge * 1.3);
    wakeFoam = c.r * vWakeEdge; turb = c.a * vWakeEdge;
  }

  vec3 L = normalize(uSunDir);
  vec2 suv = gl_FragCoord.xy / uResolution;
  float waterZ = linDepth(gl_FragCoord.z);
  vec3 col;

  if (uUnderwater < 0.5) {
    if (dot(N, V) < 0.0) N = normalize(N + V * (0.05 - dot(N, V)));
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

    // reflection
    vec2 rOff = vec2(N.x * 0.6, N.z * 1.6) * (1.0 / (1.0 + dist * 0.004));
    vec3 refl = texture2DProj(uReflTex, vRefl + vec4(rOff.x, rOff.y, 0.0, 0.0) * vRefl.w * 0.12).rgb;

    // refraction + absorption through the water column
    float sceneZ0 = linDepth(texture2D(uDepthTex, suv).r);
    float thick0 = max(sceneZ0 - waterZ, 0.0);
    vec2 ruv = suv + N.xz * 0.06 * clamp(thick0 * 0.35, 0.0, 1.0) / (1.0 + dist * 0.03);
    float sceneZ = linDepth(texture2D(uDepthTex, ruv).r);
    if (sceneZ < waterZ) { ruv = suv; sceneZ = sceneZ0; }
    vec3 refr = texture2D(uRefrTex, ruv).rgb;
    float pathLen = max(sceneZ - waterZ, 0.0) * dist / max(waterZ, 0.01);
    pathLen = min(pathLen, 400.0);
    float vert = pathLen * max(-dot(-V, vec3(0.0, -1.0, 0.0)) * -1.0 + 1.0, 1.0); // light also travelled down
    float L2 = pathLen + pathLen * clamp(V.y, 0.0, 1.0);
    vec3 T = exp(-uAbsorb * L2);
    float light = clamp(uSunI, 0.0, 1.0) * 0.85 + 0.15;
    vec3 scatter = uDeep * light * (0.55 + 0.45 * clamp(L.y * 1.5, 0.0, 1.0));
    vec3 body = refr * T + scatter * (1.0 - exp(-L2 * 0.085));

    // subsurface glow through backlit crests
    float sssF = pow(clamp(dot(V, -L) * 0.5 + 0.5, 0.0, 1.0), 4.0) * clamp(crest * 2.5 + 0.15, 0.0, 1.0);
    vec3 sss = vec3(0.06, 0.42, 0.40) * uSunColor * sssF * 0.55 * clamp(uSunI, 0.0, 1.0) * (1.0 - fadeA * 0.0);

    col = mix(body + sss, refl, F);

    // sun glitter
    vec3 R = reflect(-V, N);
    float rl = max(dot(R, L), 0.0);
    float spec = pow(rl, 1400.0) * 55.0 + pow(rl, 160.0) * 1.2 + pow(rl, 20.0) * 0.05;
    col += uSunColor * spec * clamp(uSunI, 0.0, 1.0) * (1.0 - smoothstep(0.0, 0.6, wakeFoam));

    // foam: shoreline/hull contact, wave crests, wake trails
    float vdepth = vWorld.y - vSeabed;
    float contact = 1.0 - smoothstep(0.0, 0.55, min(thick0 * clamp(V.y + 0.2, 0.2, 1.0), vdepth));
    float crestFoam = smoothstep(0.72, 0.38, jac) * smoothstep(0.05, 0.35, crest) * (0.3 + uSeaState);
    float ft1 = texture2D(uFoamTex, vWorld.xz * 0.11 + uTime * 0.012).r;
    float ft2 = texture2D(uFoamTex, vWorld.xz * 0.27 - uTime * 0.02).r;
    float pattern = ft1 * 0.65 + ft2 * 0.5;
    float shore = contact * (0.55 + 0.45 * sin(uTime * 1.3 + vSeabed * 3.0 + vWorld.x * 0.1));
    float foam = clamp(shore * pattern * 1.6 + crestFoam * pattern * 1.3 + wakeFoam * (0.35 + pattern) + turb * 0.35, 0.0, 1.0);
    float ndl = clamp(dot(N, L), 0.0, 1.0);
    vec3 foamCol = uSunColor * (ndl * 0.85 + 0.15) * clamp(uSunI, 0.0, 1.0) * 0.95 + uZenith * 0.45 + 0.02;
    col = mix(col, foamCol, foam * 0.92);
    col += vec3(0.0, 0.05, 0.05) * turb * clamp(uSunI, 0.1, 1.0);

    // aerial perspective toward the horizon
    float fog = 1.0 - exp(-dist * uFogDensity);
    col = mix(col, uHorizon, clamp(fog, 0.0, 1.0));
  } else {
    // seen from below: Snell's window + total internal reflection
    vec3 Nd = -N;
    vec3 I = -V;
    vec3 Tr = refract(I, Nd, 1.33);
    vec3 sky = texture2D(uRefrTex, suv + N.xz * 0.04).rgb;
    float tir = dot(Tr, Tr) < 0.01 ? 1.0 : 0.0;
    float edge = tir > 0.5 ? 0.0 : pow(1.0 - clamp(dot(Tr, vec3(0.0, 1.0, 0.0)), 0.0, 1.0), 6.0);
    vec3 window = sky * 1.1 + edge * uSunColor * 0.6;
    vec3 under = uUnderFog * 0.8;
    col = mix(window, under, tir);
    vec3 Rd = reflect(I, Nd);
    float sunThru = pow(max(dot(Tr, L), 0.0), 300.0) * 8.0 * (1.0 - tir);
    col += uSunColor * sunThru * clamp(uSunI, 0.0, 1.0);
    col = mix(col, vec3(1.0), clamp(wakeFoam + turb * 0.6, 0.0, 1.0) * 0.6);
    float fog = 1.0 - exp(-dist * 0.07);
    col = mix(col, uUnderFog, fog);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Ocean {
  constructor(renderer, terrain, waves) {
    this.renderer = renderer;
    this.waves = waves;
    this.geometry = buildPolarGrid(220);
    this.reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    this.refrRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    this.refrRT.depthTexture = new THREE.DepthTexture(512, 512);
    this.refrRT.depthTexture.type = THREE.UnsignedIntType;
    this.reflMatrix = new THREE.Matrix4();
    this.virtualCam = new THREE.PerspectiveCamera();
    this.hidden = []; // objects hidden while rendering reflection/refraction

    const ntex = waterNormalTexture();
    const ftex = foamTexture();
    this.uniforms = {
      uTime: { value: 0 },
      uWaveA: { value: waves.uA },
      uWaveB: { value: waves.uB },
      uCenter: { value: new THREE.Vector3() },
      uWaterData: { value: terrain.waterTex },
      uWaterBounds: { value: terrain.waterTexBounds },
      uWake: { value: null },
      uWakeInfo: { value: new THREE.Vector3(0, 0, 1) },
      uReflMatrix: { value: this.reflMatrix },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunI: { value: 1 },
      uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      uZenith: { value: new THREE.Color(0.3, 0.5, 0.8) },
      uReflTex: { value: this.reflRT.texture },
      uRefrTex: { value: this.refrRT.texture },
      uDepthTex: { value: this.refrRT.depthTexture },
      uNormalTex: { value: ntex },
      uFoamTex: { value: ftex },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 10000 },
      uUnderwater: { value: 0 },
      uFogDensity: { value: 0.00022 },
      uAbsorb: { value: new THREE.Vector3(0.46, 0.12, 0.085) },
      uDeep: { value: new THREE.Color(0.0, 0.085, 0.13) },
      uSeaState: { value: waves.seaState },
      uNight: { value: 0 },
      uUnderFog: { value: new THREE.Color(0.02, 0.22, 0.26) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'ocean';
    this.mesh.renderOrder = 1;
    this.quality = 1;
  }

  setSize(w, h, pixelRatio) {
    const W = Math.floor(w * pixelRatio), H = Math.floor(h * pixelRatio);
    this.uniforms.uResolution.value.set(W, H);
    const rq = this.quality >= 1 ? 0.5 : 0.35;
    const fq = this.quality >= 1 ? 1.0 : 0.6;
    this.reflRT.setSize(Math.max(64, Math.floor(W * rq)), Math.max(64, Math.floor(H * rq)));
    this.refrRT.setSize(Math.max(64, Math.floor(W * fq)), Math.max(64, Math.floor(H * fq)));
    this.refrScale = fq;
  }

  update(time, camera, sky) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCenter.value.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
    u.uSunDir.value.copy(sky.sunDir);
    u.uSunColor.value.copy(sky.sunColor);
    u.uSunI.value = sky.sunTotal / 4.8;
    u.uHorizon.value.copy(sky.horizonColor);
    u.uZenith.value.copy(sky.zenithColor);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uSeaState.value = this.waves.seaState;
    u.uNight.value = sky.night;
    const n = sky.night;
    u.uDeep.value.setRGB(0.0, 0.085 * (1 - n * 0.9), 0.13 * (1 - n * 0.85));
    u.uUnderFog.value.setRGB(0.02 * (1 - n), 0.20 * (1 - n * 0.9) + 0.01, 0.25 * (1 - n * 0.85) + 0.02);
  }

  // Render reflection + refraction targets for this frame.
  renderPasses(scene, camera, underwater) {
    const r = this.renderer;
    const oldTarget = r.getRenderTarget();
    const oldShadowAuto = r.shadowMap.autoUpdate;
    this.mesh.visible = false;
    for (const o of this.hidden) o.userData._vis = o.visible, o.visible = false;

    // --- reflection (mirror about y = 0)
    if (!underwater) {
      const vc = this.virtualCam;
      vc.copy(camera, false);
      vc.projectionMatrix.copy(camera.projectionMatrix);
      const cp = camera.getWorldPosition(_v1);
      const look = _v2.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_q)).add(cp);
      const up = _v3.set(0, 1, 0).applyQuaternion(_q);
      vc.position.set(cp.x, -cp.y, cp.z);
      vc.up.set(up.x, -up.y, up.z);
      vc.lookAt(look.x, -look.y, look.z);
      vc.updateMatrixWorld();
      vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
      this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      this.reflMatrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
      // oblique clip plane at the water line
      _plane.setFromNormalAndCoplanarPoint(_n.set(0, 1, 0), _v1.set(0, -0.02, 0));
      _plane.applyMatrix4(vc.matrixWorldInverse);
      _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
      const pm = vc.projectionMatrix;
      _qv.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
      _qv.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
      _qv.z = -1.0;
      _qv.w = (1.0 + pm.elements[10]) / pm.elements[14];
      _clip.multiplyScalar(2.0 / _clip.dot(_qv));
      pm.elements[2] = _clip.x; pm.elements[6] = _clip.y; pm.elements[10] = _clip.z + 1.0; pm.elements[14] = _clip.w;
      vc.projectionMatrixInverse.copy(pm).invert();
      r.shadowMap.autoUpdate = false;
      r.setRenderTarget(this.reflRT);
      r.clear();
      r.render(scene, vc);
    }

    // --- refraction (scene behind the surface, with depth)
    r.setRenderTarget(this.refrRT);
    r.clear();
    r.render(scene, camera);

    r.setRenderTarget(oldTarget);
    r.shadowMap.autoUpdate = oldShadowAuto;
    this.mesh.visible = true;
    for (const o of this.hidden) o.visible = o.userData._vis;
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4(), _qv = new THREE.Vector4();
