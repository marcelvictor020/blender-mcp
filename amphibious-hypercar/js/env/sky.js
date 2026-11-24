// Physically-based sky, sun, time of day, environment lighting and stars.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, smoothstep, lerp } from '../util/noise.js';

export class SkySystem {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    this.sky.name = 'sky';
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.0;
    u.rayleigh.value = 2.1;
    u.mieCoefficient.value = 0.0035;
    u.mieDirectionalG.value = 0.86;

    this.sunDir = new THREE.Vector3();
    this.sunColor = new THREE.Color();
    this.horizonColor = new THREE.Color();
    this.zenithColor = new THREE.Color();
    this.hour = 17.6;
    this.night = 0;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    // wide, low-frequency cascade so hills, houses and trees cast shadows too
    this.sunFar = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunFar.castShadow = true;
    this.sunFar.shadow.mapSize.set(4096, 4096);
    const fc = this.sunFar.shadow.camera;
    fc.left = -270; fc.right = 270; fc.top = 270; fc.bottom = -270; fc.near = 10; fc.far = 1600;
    this.sunFar.shadow.bias = -0.0006;
    this.sunFar.shadow.normalBias = 0.6;
    this.sunFar.shadow.autoUpdate = false;
    this.farFrame = 0;
    scene.add(this.sunFar, this.sunFar.target);

    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b5a45, 0.35);
    scene.add(this.hemi);

    this._buildStars();
    this._buildClouds();

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(900);
    this.envSky.material.uniforms = THREE.UniformsUtils.clone(this.sky.material.uniforms);
    this.envScene.add(this.envSky);
    // a sea-coloured lower hemisphere so reflections of "below the horizon" read as water
    const seaGeo = new THREE.SphereGeometry(800, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2);
    this.envSea = new THREE.Mesh(seaGeo, new THREE.MeshBasicMaterial({ color: 0x0b3a48, side: THREE.BackSide }));
    this.envScene.add(this.envSea);
    this.envRT = null;
    this.setHour(this.hour);
  }

  _buildStars() {
    const n = 2200;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.95 + 0.05;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 7000;
      pos[i * 3 + 1] = Math.cos(ph) * 7000;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 7000;
      size[i] = Math.pow(Math.random(), 6) * 3 + 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `attribute float size; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99999; gl_PointSize = size; }`,
      fragmentShader: `uniform float uOpacity; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(0.9,0.95,1.0), a * uOpacity); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  _buildClouds() {
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: this.sunDir }, uSunColor: { value: new THREE.Color(1, 1, 1) }, uZenith: { value: new THREE.Color() },
        uTime: { value: 0 }, uCover: { value: 0.56 }, uNight: { value: 0 }, uSunI: { value: 1 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99995; }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uZenith; uniform float uTime; uniform float uCover; uniform float uNight; uniform float uSunI;
        varying vec3 vDir;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1,0)), u.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          if (d.y < 0.005) discard;
          vec2 p = d.xz / (d.y + 0.06) * 1.4 + vec2(uTime * 0.0035, uTime * 0.0012);
          float base = fbm(p * 0.8);
          float detail = fbm(p * 3.1 + 7.0);
          float cum = smoothstep(uCover, uCover + 0.22, base * 0.78 + detail * 0.32);
          float cir = smoothstep(0.58, 0.9, fbm(vec2(p.x * 0.35, p.y * 2.4) + 19.0)) * 0.4;
          float a = max(cum, cir) * smoothstep(0.005, 0.16, d.y);
          float toward = pow(max(dot(d, normalize(uSunDir)), 0.0), 6.0);
          float body = 0.62 + 0.38 * smoothstep(0.3, 0.8, detail);   // darker undersides
          vec3 lit = uSunColor * uSunI * (1.35 * body + toward * 1.2) + uZenith * 0.55;
          lit = mix(lit, uZenith * 0.5 + vec3(0.015, 0.02, 0.03), uNight);
          gl_FragColor = vec4(lit, a * 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(7500, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  }

  // hour in [5, 21.5]
  setHour(hour) {
    this.hour = hour;
    // Summer day on the Riviera: sunrise ~5:50, sunset ~20:50, noon high ~66 deg
    const dayFrac = (hour - 5.85) / (20.85 - 5.85);
    const elev = Math.sin(clamp(dayFrac, -0.2, 1.2) * Math.PI) * 66 * Math.PI / 180 - (dayFrac < 0 || dayFrac > 1 ? 0.05 : 0);
    // azimuth east(+x) -> south(+z) -> west(-x)
    const az = lerp(-0.2, Math.PI + 0.2, clamp(dayFrac, -0.1, 1.1));
    const ce = Math.cos(elev);
    this.sunDir.set(Math.cos(az) * ce, Math.sin(elev), Math.sin(az) * ce).normalize();
    this.elevation = elev;

    const u = this.sky.material.uniforms;
    const sunPos = this.sunDir.clone().multiplyScalar(1000);
    u.sunPosition.value.copy(sunPos);
    const eu = this.envSky.material.uniforms;
    for (const k in u) if (eu[k]) eu[k].value = u[k].value.clone ? u[k].value.clone() : u[k].value;

    const e = elev * 180 / Math.PI;
    // sun colour: warm near horizon
    const warm = 1 - smoothstep(2, 28, e);
    this.sunColor.setRGB(1.0, lerp(0.97, 0.62, warm), lerp(0.92, 0.36, warm));
    const sunI = smoothstep(-2.5, 6, e);
    this.night = 1 - smoothstep(-6, 3, e);
    this.sunTotal = 4.8 * sunI;
    this.sun.intensity = this.sunTotal * 0.42;
    this.sun.color.copy(this.sunColor);
    if (this.sunFar) { this.sunFar.intensity = this.sunTotal * 0.58; this.sunFar.color.copy(this.sunColor); this.sunFar.shadow.needsUpdate = true; }
    this.hemi.intensity = lerp(0.03, 0.09, smoothstep(-8, 20, e));
    this.hemi.color.setRGB(lerp(0.25, 0.72, sunI), lerp(0.32, 0.84, sunI), lerp(0.55, 1.0, sunI));

    this.horizonColor.setRGB(
      lerp(0.03, lerp(0.72, 0.95, warm), sunI),
      lerp(0.05, lerp(0.83, 0.66, warm), sunI),
      lerp(0.10, lerp(0.95, 0.52, warm), sunI));
    this.zenithColor.setRGB(lerp(0.01, 0.24, sunI), lerp(0.02, 0.45, sunI), lerp(0.05, 0.85, sunI));
    this.starMat.uniforms.uOpacity.value = this.night;
    if (this.cloudMat) {
      const cu = this.cloudMat.uniforms;
      cu.uSunColor.value.copy(this.sunColor);
      cu.uZenith.value.copy(this.zenithColor);
      cu.uNight.value = this.night;
      cu.uSunI.value = sunI;
    }
    this.envDirty = true;
  }

  // Re-generate the image based lighting from the sky (cheap, ~1 frame).
  updateEnvironment(force = false) {
    if (!this.envDirty && !force) return this.envRT;
    this.envDirty = false;
    const old = this.envRT;
    this.envSea.material.color.setRGB(0.02 + 0.05 * (1 - this.night), 0.10 * (1 - this.night) + 0.01, 0.13 * (1 - this.night) + 0.02);
    this.envRT = this.pmrem.fromScene(this.envScene, 0.0, 1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.3 + 0.1 * (1 - this.night);
    if (old) old.dispose();
    return this.envRT;
  }

  update(focus) {
    // keep the shadow frustum centred on the focus (usually the car)
    const d = this.sunDir;
    this.sun.position.set(focus.x + d.x * 120, focus.y + d.y * 120, focus.z + d.z * 120);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    // the wide cascade follows the view (snapped, refreshed every few frames)
    const fc = this.farFocus || focus;
    const sx = Math.round(fc.x / 20) * 20, sz = Math.round(fc.z / 20) * 20;
    this.sunFar.position.set(sx + d.x * 800, d.y * 800, sz + d.z * 800);
    this.sunFar.target.position.set(sx, 0, sz);
    this.sunFar.target.updateMatrixWorld();
    if (++this.farFrame % 8 === 0) this.sunFar.shadow.needsUpdate = true;
    this.stars.position.copy(focus);
    this.clouds.position.copy(focus);
    this.cloudMat.uniforms.uTime.value = performance.now() / 1000;
  }
}
