import { makeKeiTruck, makeEnvMap, makeGroundShadow } from '../vehicles.js';
import { pbrUniforms, pbr, texSet } from '../pbr.js';
// Shot 4 — rural summer field: low eye-level camera in tall grass. Weathered wooden farmhouse (right),
// white kei truck driving off to the left, utility poles + sagging wires, big dark tree mass, overhanging leaves,
// tall broad-leaf weed on the left, glowing butterflies over the lower-left bush.
//
// Layout is authored in *screen pixels* (1280x720 reference frame) + view depth, unprojected through the static
// camera, so big shapes land on the same pixels as the reference.

const FOV = 35;
const HORIZON = 452;      // screen y of the horizon (kei-truck roof sits on it => eye height ~ truck height)
const CAM_H = 1.75;       // eye height (m), standing in tall grass

export default {
  duration: 3.125,
  credit: null,
  post: {
    bloom: 0.22, bloomRadius: 0.6, bloomThreshold: 0.82,
    exposure: 1.0, contrast: 1.0, saturation: 1.0,
    lift: [0.0, 0.01, 0.02], gamma: [1, 1, 1], gain: [1, 1, 1],
    vignette: 0.06, grain: 0.025, ca: 0.0012, soft: 0.25,
  },
  build(core) {
    const { THREE, makeSky, makeCloud, makeFoliage, makeGrass, lightRig, toon, rng, lerp, clamp, col, shared, paintTexture, canvasTexture } = core;
    const scene = new THREE.Scene();

    /* ---------------- camera + screen-space placement helpers ---------------- */
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 3000);
    const F = 360 / Math.tan(FOV * Math.PI / 360);           // focal length in reference pixels
    camera.position.set(0, CAM_H, 0);
    camera.rotation.set(Math.atan((HORIZON - 360) / F), 0, 0); // pitch up so the horizon sits at y=455
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const FWD = new THREE.Vector3(); camera.getWorldDirection(FWD);
    const ray = (px, py) => new THREE.Vector3(px / 640 - 1, 1 - py / 360, 0.5).unproject(camera).sub(camera.position).normalize();
    const scr = (px, py, d) => { const v = ray(px, py); return v.multiplyScalar(d / v.dot(FWD)).add(camera.position); };
    const gnd = (px, py) => { const v = ray(px, py); return v.multiplyScalar(-CAM_H / v.y).add(camera.position); };
    const wpp = (d) => d / F;                                  // world units per pixel at view depth d
    const facing = (m) => { m.quaternion.copy(camera.quaternion); return m; };
    const card = (px0, py0, px1, py1, d, mat) => {             // screen-aligned rectangle covering a pixel rect at depth d
      const m = new THREE.Mesh(new THREE.PlaneGeometry((px1 - px0) * wpp(d), (py1 - py0) * wpp(d)), mat);
      m.position.copy(scr((px0 + px1) / 2, (py0 + py1) / 2, d)); return facing(m);
    };

    /* ---------------- sky, light ---------------- */
    scene.add(makeSky({ zenith: '#118fb2', mid: '#169ab8', horizon: '#5aa0b4', haze: 0.1 }));
    const SUN = [0.62, 0.55, 0.56];
    const rig = lightRig(scene, { sunDir: SUN, sunColor: '#fff0d8', sunIntensity: 2.2, sky: '#9fd0e8', ground: '#6a8a4a', hemiIntensity: 0.9, ambient: '#3a5070', ambientIntensity: 0.3 });
    const sunV = new THREE.Vector3(...SUN).normalize();

    /* ---------------- clouds ---------------- */
    const paintedCloud = (w, h, puffs, seed) => {
      const blobs = puffs.map(p => new THREE.Vector3(...p));
      while (blobs.length < 32) blobs.push(new THREE.Vector3(9, 9, 0.0001));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uBlobs: { value: blobs }, uSeed: { value: seed * 1.37 }, uAspect: { value: w / h }, uTime: shared.uTime,
          cL: { value: col('#f4f6f6') }, cM: { value: col('#c9d6e0') }, cS: { value: col('#b2c4d1') }, cB: { value: col('#9db3c4') } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `varying vec2 vUv; uniform vec3 uBlobs[32]; uniform float uSeed, uAspect, uTime; uniform vec3 cL, cM, cS, cB;
          ${core.NOISE_GLSL}
          float dens(vec2 p){
            vec2 q = p * vec2(uAspect, 1.0); float d = -1.0;
            for (int i = 0; i < 32; i++){ vec3 b = uBlobs[i]; float k = 1. - length(q - b.xy * vec2(uAspect, 1.0)) / b.z; d = max(d, k); }
            d += (fbm(q * 1.9 + uSeed + vec2(uTime * 0.003, 0.)) - 0.5) * 1.05 + (fbm(q * 7. + uSeed * 3.) - 0.5) * 0.35;
            float e = smoothstep(0.5, 0.42, abs(p.x)) * smoothstep(0.5, 0.42, abs(p.y));
            return d - (1.0 - e) * 1.5;
          }
          void main(){
            vec2 p = vUv - 0.5; float d = dens(p);
            float a = smoothstep(0.0, 0.16, d) * 0.97; if (a < 0.01) discard;
            float e = 0.01;
            vec2 g = vec2(dens(p + vec2(e, 0.)) - dens(p - vec2(e, 0.)), dens(p + vec2(0., e)) - dens(p - vec2(0., e)));
            vec2 nOut = -normalize(g + 1e-6);
            float up = dot(nOut, normalize(vec2(0.35, 1.0)));
            float rim = smoothstep(0.34, 0.04, d) * smoothstep(0.25, 0.8, up) * smoothstep(-0.1, 0.2, p.y);
            float hgt = smoothstep(-0.32, 0.3, p.y);
            float n = fbm(p * vec2(uAspect, 1.) * 6. + uSeed * 2.);
            vec3 c = mix(cB, cS, smoothstep(0.0, 0.35, hgt + (n - 0.5) * 0.4));
            c = mix(c, cM, smoothstep(0.2, 0.6, hgt * 0.7 + up * 0.15 + (n - 0.5) * 0.4));
            c = mix(c, cL, smoothstep(0.45, 0.62, rim + (n - 0.5) * 0.2));
            gl_FragColor = vec4(c, a);
          }`,
        transparent: true, depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.renderOrder = -5; return m;
    };
    const cloudFromPx = (x0, y0, x1, y1, puffs, seed, extra = {}) => {
      const W = x1 - x0, H = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, D = 700;
      const pf = puffs.map(([px, py, pr]) => [(px - cx) / W, (cy - py) / H, pr / H]);
      const c = paintedCloud(W * wpp(D), H * wpp(D), pf, seed);
      c.position.copy(scr(cx, cy, D)); return facing(c);
    };
    scene.add(cloudFromPx(150, 20, 830, 440, [
      [250, 205, 60], [258, 295, 66], [330, 150, 56], [392, 110, 54], [445, 170, 60], [370, 250, 84], [300, 345, 66],
      [535, 175, 58], [612, 168, 60], [672, 150, 50], [724, 185, 48], [690, 245, 66], [600, 275, 84],
      [480, 300, 84], [420, 345, 84], [748, 262, 40], [235, 255, 52],
    ], 4));
    scene.add(cloudFromPx(-60, 170, 190, 400, [
      [10, 255, 36], [62, 248, 38], [100, 275, 34], [40, 298, 44], [-10, 240, 36], [112, 318, 30], [62, 322, 40], [140, 300, 26],
    ], 11));

    /* ---------------- far background trees (painterly clumps) ---------------- */
    const clumpsPx = (list, d) => list.map(([px, py, pr, dz = 0]) => { const p = scr(px, py, d + dz); return [p.x, p.y, p.z, pr * wpp(d + dz)]; });
    // big dark tree mass, centre-left (shadow side facing us)
    scene.add(makeFoliage({ clumps: clumpsPx([
      [345, 340, 55], [335, 430, 55], [390, 295, 55], [440, 255, 60], [495, 228, 58], [545, 235, 58], [400, 385, 80],
      [470, 330, 80], [540, 320, 70], [440, 460, 80], [360, 480, 60], [520, 440, 70], [590, 400, 60], [300, 500, 40],
      [330, 515, 40, -12], [400, 520, 40, -12], [460, 515, 35, -12], [250, 520, 30, -12],
    ], 42), density: 6, cardSize: 2.6, kind: 'round', seed: 21, texSeed: 3,
      dark: '#0f1718', mid: '#172625', light: '#22423a', highlight: '#346a54', lightWrap: 0.1, wind: 0.004, shell: 0.6 }));
    // lit teal right half of that mass
    scene.add(makeFoliage({ clumps: clumpsPx([
      [600, 250, 45], [655, 280, 50], [715, 305, 45], [765, 340, 42], [800, 390, 40], [820, 440, 35], [690, 360, 50],
      [630, 330, 45], [740, 410, 45], [660, 420, 40], [580, 300, 40],
    ], 38), density: 7, cardSize: 2.2, kind: 'round', seed: 22, texSeed: 4,
      dark: '#15292a', mid: '#1f4642', light: '#2f6e5c', highlight: '#4f9a78', lightWrap: 0.3, wind: 0.004, shell: 0.6 }));
    // very dark navy tree behind the farmhouse
    scene.add(makeFoliage({ clumps: clumpsPx([
      [1000, 140, 50], [1060, 110, 50], [1115, 150, 50], [1040, 205, 60], [1100, 230, 55], [1150, 270, 45], [1190, 305, 50],
      [985, 255, 45], [1000, 330, 50], [1240, 330, 45], [1180, 200, 40], [1060, 300, 50], [960, 300, 30],
    ], 48), density: 6, cardSize: 2.8, kind: 'round', seed: 23, texSeed: 5,
      dark: '#0a161b', mid: '#102329', light: '#173a3c', highlight: '#2a6458', lightWrap: 0.1, wind: 0.004, shell: 0.6 }));
    // lighter bushes in the middle distance
    scene.add(makeFoliage({ clumps: clumpsPx([
      [470, 470, 28], [505, 440, 26], [655, 445, 32], [705, 462, 36], [760, 440, 32], [805, 470, 32], [545, 500, 28],
      [690, 505, 34], [745, 500, 32], [825, 500, 26], [470, 515, 22], [630, 500, 26],
    ], 26), density: 8, cardSize: 1.2, kind: 'round', seed: 24, texSeed: 6,
      dark: '#22483c', mid: '#3d7a58', light: '#6ea262', highlight: '#a2c87e', lightWrap: 0.35, wind: 0.008, shell: 0.6 }));
    scene.add(makeFoliage({ clumps: clumpsPx([[595, 478, 34], [575, 505, 26], [620, 515, 22]], 25.5),
      density: 8, cardSize: 1.1, kind: 'round', seed: 25, texSeed: 7,
      dark: '#5e8a40', mid: '#8eb658', light: '#b8d27a', highlight: '#dde8a2', lightWrap: 0.4, wind: 0.008, shell: 0.6 }));

    /* ---------------- modelled set: farmhouse + utility poles (PBR, real cast shadows) ----------------
       Everything is real 3D geometry aligned with the world axes (the camera only pitches), placed from reference-pixel
       anchors at chosen depths via atZ(). The house/pole materials take their direct sun from `hsun`, a zero-intensity
       shadow-casting twin of rig.sun whose shadow frustum covers the house + poles (rig.sun's box follows the truck);
       in those materials rig.sun's own (unshadowed here) contribution is swapped for hsun's shadowed one. */
    const atZ = (px, py, d) => { const v = ray(px, py); return v.multiplyScalar(-d / v.z).add(camera.position); };
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const HU = pbrUniforms({ sunDir: SUN, leafAmt: 0, sunGain: 1.35, rimAmt: 0, grime: 0 });
    const houseEnv = makeEnvMap('s4_house_env', {
      zenith: '#2f86c0', horizon: '#b9d4dc', ground: '#4a5a34', sunDir: SUN, sunColor: '#fff2dc', sunPower: 10,
      clouds: [{ dir: [-0.6, 0.45, -0.7], size: 8, power: 1.3 }],
      blocks: [{ dir: [-0.5, -1], w: 34, h: 10, dist: 16, color: '#163128' }, { dir: [0.3, 1], w: 30, h: 3, dist: 14, color: '#3e5a2c' }],
    });
    const hsun = new THREE.DirectionalLight(0xffffff, 0);
    hsun.castShadow = true; hsun.shadow.mapSize.set(2048, 2048);
    {
      const HC = V3(5.0, 2.5, -21.5);
      hsun.position.copy(HC).addScaledVector(sunV, 40); hsun.target.position.copy(HC);
      const c = hsun.shadow.camera; c.left = c.bottom = -12; c.right = c.top = 12; c.near = 5; c.far = 90;
      hsun.shadow.bias = -0.0006; hsun.shadow.normalBias = 0.025; hsun.shadow.radius = 2;
      scene.add(hsun, hsun.target);
    }
    const uHSun = { value: rig.sun.color.clone().multiplyScalar(rig.sun.intensity) };
    const uSunW = { value: sunV.clone() };
    const hmat = (key, o) => {
      const m = pbr(HU, { envMap: houseEnv, envMapIntensity: 0.45, roughness: 0.85, metalness: 0, ...o }, null, 's4h_' + key);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev(sh, r);
        sh.uniforms.uHSun = uHSun; sh.uniforms.uSunW = uSunW;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uHSun, uSunW;')
          .replaceAll('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
            if (dot(directLight.color, vec3(1.0)) < 1e-6) directLight.color = uHSun;
            else if (dot(directLight.direction, normalize((viewMatrix * vec4(uSunW, 0.0)).xyz)) > 0.9995) directLight.color = vec3(0.0);`);
      };
      m.customProgramCacheKey = () => 's4h_' + key + (o.map ? 'm' : '') + (o.normalMap ? 'n' : '');
      return m;
    };
    const shade = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); return o; };
    const M4 = new THREE.Matrix4();
    // oriented box between two world points: z along a->b, y as close to `up` as possible
    const barMatrix = (a, b, w, h, up = V3(0, 1, 0), ext = 0) => {
      const z = b.clone().sub(a); const len = z.length() + ext; z.normalize();
      const x = up.clone().cross(z).normalize(); const y = z.clone().cross(x);
      return new THREE.Matrix4().makeBasis(x.multiplyScalar(w), y.multiplyScalar(h), z.multiplyScalar(len)).setPosition(a.clone().add(b).multiplyScalar(0.5));
    };
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const instanced = (geo, mat, list, colors) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = im.receiveShadow = true; scene.add(im); return im;
    };
    const tint = (base, r, amt = 0.12, warm = 0) => { const k = 1 + (r() - 0.5) * 2 * amt; const w = (r() - 0.5) * warm; return new THREE.Color(base).multiplyScalar(k).offsetHSL(w, 0, 0); };

    /* --- textures --- */
    const woodTex = texSet(128, 512, (g, w, h) => {
      const R = rng(5);
      g.fillStyle = '#8a6a4c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {                       // long vertical grain streaks
        const x = R() * w, ww = 1 + R() * 4, a = 0.08 + R() * 0.22;
        g.fillStyle = R() < 0.6 ? `rgba(40,24,12,${a})` : `rgba(200,170,130,${a * 0.6})`;
        g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 2.5, y); g.lineTo(x + ww, h); g.lineTo(x + ww, 0); g.fill();
      }
      for (let i = 0; i < 4; i++) { const x = R() * w, y = R() * h; g.fillStyle = 'rgba(30,18,8,0.5)'; g.beginPath(); g.ellipse(x, y, 4, 9, 0, 0, 7); g.fill(); }
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.15)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(20,10,0,0.25)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(15,8,2,0.55)'; g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    }, { normalStrength: 3.0, roughBase: 0.82, roughVar: 0.25 });
    const stoneTex = texSet(256, 128, (g, w, h) => {
      const R = rng(9);
      g.fillStyle = '#4a4038'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = R() * w, y = R() * h, rx = 9 + R() * 14, ry = 6 + R() * 8, v = 150 + R() * 70;
        g.fillStyle = `rgb(${v | 0},${(v * 0.93) | 0},${(v * 0.84) | 0})`;
        for (const dx of [-w, 0, w]) { g.beginPath(); g.ellipse(x + dx, y, rx, ry, R() * 0.6, 0, 7); g.fill(); }
      }
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,240'},${R() * 0.12})`; g.fillRect(R() * w, R() * h, 2, 2); }
    }, { normalStrength: 4.0, roughBase: 0.9, roughVar: 0.1 });
    const concreteTex = texSet(64, 256, (g, w, h) => {
      const R = rng(13);
      g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '60,50,40' : '255,250,240'},${R() * 0.1})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
      for (let i = 0; i < 6; i++) { const x = R() * w; g.fillStyle = `rgba(70,60,50,${0.05 + R() * 0.08})`; g.fillRect(x, R() * h * 0.5, 1 + R() * 2, h); }
      g.fillStyle = 'rgba(40,30,20,0.6)'; for (let y = 20; y < h; y += 46) g.fillRect(0, y, w, 1);   // step-bolt rings
    }, { normalStrength: 1.5, roughBase: 0.9, roughVar: 0.1 });

    const woodMat = hmat('wood', { color: '#a88a6c', ...woodTex, normalScale: new THREE.Vector2(0.8, 0.8) });
    const postMat = hmat('post', { color: '#d8c0a0', ...woodTex, normalScale: new THREE.Vector2(0.5, 0.5) });
    const darkWoodMat = hmat('dwood', { color: '#5a4636', ...woodTex });
    const tileMat = hmat('tile', { color: '#bdb6aa', roughness: 0.55, envMapIntensity: 0.6 });
    const stoneMat = hmat('stone', { color: '#ffffff', ...stoneTex });
    const voidMat = hmat('void', { color: '#140f0b', roughness: 1, envMapIntensity: 0.05 });

    /* --- kawara tile: arc cover tile with a thick lower lip (x across, y up = roof normal, z = down-slope 0..1) --- */
    const tileGeo = (() => {
      const S = 8, P = [], pos = [], idx = [];
      for (let i = 0; i <= S; i++) { const th = -0.9 + 1.8 * i / S; P.push([0.5 * Math.sin(th) / Math.sin(0.9), 0.4 * (Math.cos(th) - Math.cos(0.9))]); }
      for (const z of [0, 1]) for (const [x, y] of P) pos.push(x, y, z);
      for (let i = 0; i < S; i++) idx.push(i, i + S + 1, i + 1, i + 1, i + S + 1, i + S + 2);
      const b = pos.length / 3;
      for (const [x, y] of P) pos.push(x, y, 1, x, y - 0.22, 1);
      for (let i = 0; i < S; i++) { const t0 = b + i * 2, t1 = b + i * 2 + 2; idx.push(t0, t0 + 1, t1, t1, t0 + 1, t1 + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      g.computeVertexNormals(); return g;
    })();
    // lay tiles over a roof patch given its left/right edges as functions of v (0 = eave, 1 = ridge) -> world points.
    // rows and columns are spaced in *screen pixels* (like the reference's ~9x7 px tile scale)
    const tileList = [], tileCols = [];
    const roofTiles = (L, R, { rows, colPx = 9, seed = 1, base = '#bdb6aa', lift = 0.16, over = 1.55, wScale = 1.08 }) => {
      const r = rng(seed), toPx = (p) => { const q = p.clone().project(camera); return new THREE.Vector2(q.x * 640, q.y * 360); };
      for (let j = 0; j < rows; j++) {
        const v = (j + 0.5) / rows, dv = 1 / rows;
        const a = L(v), b = R(v), a2 = L(Math.min(1, v + dv)), b2 = R(Math.min(1, v + dv));
        const n = Math.max(2, Math.round(toPx(a).distanceTo(toPx(b)) / colPx));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5 + (j % 2) * 0.5 - 0.25) / n; if (u > 1) continue;
          const p = a.clone().lerp(b, u), pU = a2.clone().lerp(b2, u);
          const U = b.clone().sub(a).normalize(), Vv = pU.clone().sub(p); const len = Vv.length() * over; Vv.normalize();
          const N = U.clone().cross(Vv).normalize(); if (N.y < 0) N.negate();
          const Vp = N.clone().cross(U).normalize(); if (Vp.dot(Vv) < 0) Vp.negate();
          const w = a.distanceTo(b) / n * wScale;
          const tl = lift + (r() - 0.5) * 0.06;
          const zAx = Vp.clone().negate().multiplyScalar(Math.cos(tl)).addScaledVector(N, Math.sin(tl));
          const yAx = N.clone().multiplyScalar(Math.cos(tl)).addScaledVector(Vp, Math.sin(tl));
          const xAx = yAx.clone().cross(zAx).normalize();
          const top = p.clone().addScaledVector(Vp, len * 0.92).addScaledVector(N, 0.01);
          const m = new THREE.Matrix4().makeBasis(xAx.multiplyScalar(w), yAx.multiplyScalar(w * 0.9), zAx.multiplyScalar(len)).setPosition(top);
          tileList.push(m); tileCols.push(tint(base, r, 0.1, 0.01));
        }
      }
    };
    const linePts = (pts) => (v) => {      // polyline in v (pts given from eave (v=0) to ridge (v=1)), world points
      const f = clamp(v, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f));
      return pts[i].clone().lerp(pts[i + 1], f - i);
    };
    const curvePts = (pts) => { const c = new THREE.CatmullRomCurve3(pts); return (v) => c.getPoint(clamp(v, 0, 1)); };

    /* ===== building A (left, irimoya-like sweep with curved bargeboard) ===== */
    const dWA = 20.5, dEA = 19.3, dRA = 23.0;
    // front slope: left edge sweeps from the eave corner up to the ridge apex (constant depth, like an upturned verge);
    // right edge is the gable rake running back to the ridge
    const AL = curvePts([atZ(975, 343, dEA), atZ(938, 322, dEA), atZ(905, 295, dEA), atZ(882, 268, dEA), atZ(866, 246, dEA)]);
    const AR = linePts([atZ(1106, 347, dEA), atZ(1104, 318, (dEA + dRA) / 2 - 0.4), atZ(1067, 243, dRA)]);
    roofTiles(AL, AR, { rows: 15, colPx: 9, seed: 31, base: '#c4bdb0' });
    // ridge (noshi stack + round cap) along the top
    {
      const a = AL(1).add(V3(0, 0.05, 0)), b = AR(1).add(V3(0, 0.05, 0));
      const ridgeMat = hmat('ridge', { color: '#8e877c', roughness: 0.5, envMapIntensity: 0.6 });
      const rk = []; for (let k = 0; k < 3; k++) rk.push(barMatrix(a.clone().add(V3(0, k * 0.07, 0)), b.clone().add(V3(0, k * 0.07, 0)), 0.3 - k * 0.04, 0.075, V3(0, 1, 0), 0.2));
      instanced(boxGeo, ridgeMat, rk);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 10, 1, false, 0, Math.PI), ridgeMat);
      const capM = barMatrix(a.clone().add(V3(0, 0.22, 0)), b.clone().add(V3(0, 0.22, 0)), 1, 1, V3(0, 1, 0), 0.25);
      cap.geometry.rotateX(Math.PI / 2); cap.geometry.rotateZ(Math.PI / 2); cap.applyMatrix4(capM); scene.add(shade(cap));
      for (const e of [a, b]) { const o = new THREE.Mesh(boxGeo, ridgeMat); o.scale.set(0.34, 0.42, 0.3); o.position.copy(e).add(V3(0, 0.2, 0)); scene.add(shade(o)); }
    }
    // eave line: fascia + rafter ends + soffit (deep eave; casts the shadow band onto the wall)
    {
      const eL = AL(0), eR = AR(0);
      const fas = new THREE.Mesh(boxGeo, darkWoodMat); fas.applyMatrix4(barMatrix(eL.clone().add(V3(0, -0.08, 0.02)), eR.clone().add(V3(0, -0.08, 0.02)), 0.08, 0.14, V3(0, 1, 0), 0.1)); scene.add(shade(fas));
      const raf = []; const n = 12;
      for (let i = 0; i <= n; i++) { const p = eL.clone().lerp(eR, i / n); raf.push(barMatrix(p.clone().add(V3(0, -0.16, 0)), V3(p.x, p.y - 0.02, -dWA), 0.08, 0.1)); }
      const lc = []; for (let i = 0; i <= 16; i++) { const v = i / 16 * 0.85; const p = AL(v); raf.push(barMatrix(p.clone().add(V3(0, -0.14, 0)), V3(p.x + 0.2, p.y - 0.05, -dWA - 0.2), 0.07, 0.1)); }
      instanced(boxGeo, postMat, raf);
      // soffit board (underside of the roof between the eave and the wall)
      const sg = new THREE.BufferGeometry(); const sp = [];
      const outer = [], inner = [];
      for (let i = 0; i <= 12; i++) { const v = 0.95 - i / 12 * 0.95; const p = AL(v).add(V3(0, -0.12, 0)); outer.push(p); inner.push(V3(p.x + 0.25, p.y - 0.15, -dWA - 0.05)); }
      for (let i = 1; i <= 8; i++) { const p = eL.clone().lerp(eR, i / 8).add(V3(0, -0.12, 0)); outer.push(p); inner.push(V3(p.x, p.y - 0.05, -dWA - 0.05)); }
      for (let i = 0; i < outer.length - 1; i++) sp.push(...outer[i].toArray(), ...inner[i].toArray(), ...outer[i + 1].toArray(), ...outer[i + 1].toArray(), ...inner[i].toArray(), ...inner[i + 1].toArray());
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.computeVertexNormals();
      const soff = new THREE.Mesh(sg, hmat('soffit', { color: '#3a2c22', side: THREE.DoubleSide })); scene.add(shade(soff));
    }
    // curved bargeboard (hafu) down the left gable + verge tiles riding on it
    {
      const bb = [atZ(866, 243, dEA), atZ(850, 268, 19.7), atZ(834, 296, 20.0), atZ(818, 325, 20.25), atZ(801, 352, 20.5)];
      const curve = new THREE.CatmullRomCurve3(bb); const pts = curve.getPoints(16);
      const bm = [], vt = [], vc = []; const r = rng(17);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        bm.push(barMatrix(a.clone().add(V3(0, -0.17, 0)), b.clone().add(V3(0, -0.17, 0)), 0.1, 0.32, V3(1, 0, 0.6).normalize(), 0.04));
      }
      instanced(boxGeo, postMat, bm);
      const pts2 = curve.getPoints(22);
      for (let i = 0; i < pts2.length - 1; i++) {
        const a = pts2[i], b = pts2[i + 1];
        vt.push(barMatrix(a.clone().add(V3(-0.04, 0.06, 0.05)), b.clone().add(V3(-0.04, 0.06, 0.05)), 0.24, 0.13, V3(-0.3, 1, 0.5).normalize(), 0.02));
        vc.push(tint('#a8a296', r, 0.12));
      }
      instanced(boxGeo, tileMat, vt, vc);
      // tile band behind the bargeboard (the left slope seen edge-on), fills the strip up to the ridge
      const BL = curvePts(bb.slice().reverse().map((p) => p.clone().add(V3(-0.02, 0.12, -0.25))));
      const BR = curvePts(bb.slice().reverse().map((p) => p.clone().add(V3(0.45, 0.32, -1.6))));
      roofTiles(BL, BR, { rows: 16, colPx: 8, seed: 33, base: '#9c968a' });
    }
    // walls of A: vertical boards (instanced, jittered) + posts + rails
    const topA = (px) => {                  // top of A's front wall on screen (follows the sweep of the roof edge)
      const T = [[848, 268], [866, 250], [882, 270], [905, 297], [938, 324], [975, 345], [1000, 348]];
      for (let i = 0; i < T.length - 1; i++) if (px <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (px - T[i][0]) / (T[i + 1][0] - T[i][0]));
      return 348;
    };
    {
      const r = rng(51), pl = [], pc = [];
      const xa = atZ(848, 500, dWA).x, xb = atZ(1000, 500, dWA).x;
      for (let x = xa; x < xb; x += 0.2) {
        const xm = x + 0.1, pxm = 640 + xm * F / dWA;
        const yTop = atZ(pxm, topA(pxm) - 3, dWA).y, yBot = 0.55;
        pl.push(barMatrix(V3(xm, yBot, -dWA + (r() - 0.5) * 0.02), V3(xm, yTop, -dWA + (r() - 0.5) * 0.02), 0.205, 0.035, V3(0, 0, 1)));
        pc.push(tint('#6e5038', r, 0.16, 0.02));
      }
      // left end wall (faces the camera side), boards running back in depth
      const XL = xa - 0.06;
      for (let z = dWA; z < dWA + 5.2; z += 0.21) {
        const zm = z + 0.105, pxm = 640 + XL * F / zm;
        const yTop = lerp(4.6, 3.95, (zm - dWA) / 5.2);
        pl.push(barMatrix(V3(XL + (r() - 0.5) * 0.02, 0.55, -zm), V3(XL, yTop, -zm), 0.035, 0.21, V3(0, 0, 1)));
        pc.push(tint('#8a6a4c', r, 0.16, 0.02));
      }
      instanced(boxGeo, woodMat, pl, pc);
      // posts + rails
      const pm = [];
      for (const px of [849, 986]) { const p = atZ(px, 500, dWA - 0.06); pm.push(barMatrix(V3(p.x, 0.5, p.z), V3(p.x, atZ(px, topA(px) + 4, dWA).y, p.z), 0.2, 0.2, V3(0, 0, 1))); }
      for (const py of [352, 402, 456]) { const a = atZ(848, py, dWA - 0.07), b = atZ(1000, py, dWA - 0.07); b.y = a.y; pm.push(barMatrix(a, b, 0.08, 0.13, V3(0, 1, 0), 0.1)); }
      const ze = dWA + 5.2; pm.push(barMatrix(V3(XL - 0.03, 0.5, -ze), V3(XL - 0.03, 3.95, -ze), 0.2, 0.2, V3(0, 0, 1)));
      pm.push(barMatrix(V3(XL - 0.04, 2.6, -dWA), V3(XL - 0.04, 2.6, -ze), 0.08, 0.12, V3(0, 1, 0)));
      instanced(boxGeo, postMat, pm);
      // stone base under A (front + left side), top catches the sun
      const sb = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stoneMat);
      const s0 = atZ(802, 540, dWA - 0.35), s1 = atZ(1003, 540, dWA - 0.35);
      sb.scale.set(s1.x - s0.x, 0.66, 5.9); sb.position.set((s0.x + s1.x) / 2, 0.29, -dWA + 0.4 - 2.95);
      const uvs = sb.geometry.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * 4);
      scene.add(shade(sb));
      const cap = new THREE.Mesh(boxGeo, hmat('stonecap', { color: '#a89c8c', roughness: 0.95 }));
      cap.scale.set(s1.x - s0.x + 0.06, 0.06, 5.96); cap.position.set(sb.position.x, 0.63, sb.position.z); scene.add(shade(cap));
    }

    /* ===== recess + doorway between A and B ===== */
    const dWB = 18.6;
    {
      const back = new THREE.Mesh(boxGeo, voidMat); const p0 = atZ(990, 560, 21.6), p1 = atZ(1100, 330, 21.6);
      back.scale.set(p1.x - p0.x + 1, p1.y - p0.y, 0.1); back.position.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, -21.6); scene.add(shade(back));
      // B's left side wall (in shade, faces the camera side) with a dark doorway
      const xB = atZ(1092, 450, dWB).x;
      const r = rng(61), sw = [], sc = [];
      for (let z = dWB; z < 21.5; z += 0.21) { sw.push(barMatrix(V3(xB, 0, -z - 0.105), V3(xB, 3.5, -z - 0.105), 0.035, 0.21, V3(0, 0, 1))); sc.push(tint('#4a3828', r, 0.15)); }
      instanced(boxGeo, darkWoodMat, sw, sc);
      const door = new THREE.Mesh(boxGeo, voidMat); door.scale.set(0.06, 1.9, 1.15); door.position.set(xB - 0.02, 0.95, -dWB - 1.35); scene.add(door);
      const dfr = []; for (const z of [dWB + 0.75, dWB + 1.95]) dfr.push(barMatrix(V3(xB - 0.05, 0, -z), V3(xB - 0.05, 2.0, -z), 0.08, 0.1, V3(0, 0, 1)));
      dfr.push(barMatrix(V3(xB - 0.05, 2.0, -dWB - 0.7), V3(xB - 0.05, 2.0, -dWB - 2.0), 0.08, 0.12, V3(0, 1, 0)));
      instanced(boxGeo, postMat, dfr);
    }

    /* ===== building B (right): cross gable + wing roof + pent roof (hisashi) over a plank wall ===== */
    {
      const r = rng(71);
      // front wall boards
      const pl = [], pc = [];
      const xa = atZ(1092, 500, dWB).x, xb = atZ(1300, 500, dWB).x;
      const yWallTop = atZ(1150, 343, dWB).y;
      for (let x = xa; x < xb; x += 0.2) {
        const xm = x + 0.1, j = (r() - 0.5) * 0.02;
        pl.push(barMatrix(V3(xm, -0.1, -dWB + j), V3(xm, yWallTop, -dWB + j), 0.205, 0.035, V3(0, 0, 1)));
        pc.push(tint('#5c4430', r, 0.18, 0.02));
      }
      // gable triangle boards
      const ap = atZ(1153, 266, dWB), gl = atZ(1094, 342, dWB), gr = atZ(1216, 342, dWB);
      for (let x = gl.x; x < gr.x; x += 0.19) {
        const xm = x + 0.095, t = xm < ap.x ? (xm - gl.x) / (ap.x - gl.x) : (gr.x - xm) / (gr.x - ap.x);
        const yt = lerp(gl.y, ap.y, clamp(t, 0, 1));
        pl.push(barMatrix(V3(xm, gl.y - 0.05, -dWB + 0.02), V3(xm, yt, -dWB + 0.02), 0.19, 0.03, V3(0, 0, 1)));
        pc.push(tint('#8a6644', r, 0.15, 0.02));
      }
      instanced(boxGeo, woodMat, pl, pc);
      // posts, rails, battens on the upper (shaded) band
      const pm = [];
      for (const px of [1094, 1172, 1250]) { const p = atZ(px, 500, dWB - 0.08); pm.push(barMatrix(V3(p.x, -0.1, p.z), V3(p.x, yWallTop, p.z), 0.16, 0.16, V3(0, 0, 1))); }
      for (const py of [448, 388]) { const a = atZ(1092, py, dWB - 0.1), b = atZ(1300, py, dWB - 0.1); b.y = a.y; pm.push(barMatrix(a, b, 0.08, 0.12, V3(0, 1, 0))); }
      pm.push(barMatrix(gl.clone().add(V3(-0.1, 0, 0.08)), gr.clone().add(V3(0.1, 0, 0.08)), 0.1, 0.16, V3(0, 1, 0)));
      instanced(boxGeo, postMat, pm);
      const bt = []; for (let px = 1112; px < 1290; px += 31) { const a = atZ(px, 448, dWB - 0.06), b = atZ(px, 392, dWB - 0.06); bt.push(barMatrix(a, V3(a.x, b.y, a.z), 0.05, 0.05, V3(0, 0, 1))); }
      instanced(boxGeo, darkWoodMat, bt);
      // cross-gable bargeboards
      const dG = dWB - 0.35;
      const A0 = atZ(1153, 260, dG), L0 = atZ(1084, 344, dG), R0 = atZ(1220, 345, dG);
      instanced(boxGeo, postMat, [barMatrix(A0, L0, 0.08, 0.26, V3(0, 0, 1), 0.2), barMatrix(A0, R0, 0.08, 0.22, V3(0, 0, 1), 0.2)]);
      // left slope of the cross gable (seen at a grazing angle) + right wing roof
      const back = 4.0;
      roofTiles(linePts([L0.clone().add(V3(-0.08, 0.1, 0.12)), A0.clone().add(V3(0, 0.14, 0.12))]),
        linePts([L0.clone().add(V3(0.75, 0.75, -back)), A0.clone().add(V3(0, 0.14, -back))]), { rows: 14, colPx: 8, seed: 72, base: '#a8a194' });
      roofTiles(linePts([R0.clone().add(V3(-0.1, 0.05, 0.05)), atZ(1157, 256, 22.6)]), linePts([atZ(1300, 345, dG), atZ(1300, 246, 22.6)]),
        { rows: 15, colPx: 9, seed: 73, base: '#c2bbae' });
      // pent roof (hisashi) wrapping left over the recess; its eave throws the dark band over B's upper wall
      const dP = dWB - 1.45;
      roofTiles(linePts([atZ(990, 389, dP), atZ(1006, 345, dWB + 0.05)]), linePts([atZ(1300, 384, dP), atZ(1300, 340, dWB + 0.05)]),
        { rows: 6, colPx: 8, seed: 74, base: '#b2ab9e', lift: 0.12 });
      const pe0 = atZ(990, 392, dP), pe1 = atZ(1300, 386, dP); pe1.y = pe0.y;
      const praf = [barMatrix(pe0.clone().add(V3(0, -0.06, 0)), pe1.clone().add(V3(0, -0.06, 0)), 0.07, 0.12, V3(0, 1, 0))];
      for (let px = 996; px < 1300; px += 18) { const a = atZ(px, 392, dP); praf.push(barMatrix(V3(a.x, pe0.y - 0.08, a.z), V3(a.x, pe0.y + 0.3, -dWB), 0.05, 0.07)); }
      instanced(boxGeo, postMat, praf);
      // little lower canopy over the doorway
      roofTiles(linePts([atZ(998, 413, dP - 0.3), atZ(996, 392, dP + 0.5)]), linePts([atZ(1062, 412, dP - 0.3), atZ(1068, 391, dP + 0.5)]),
        { rows: 3, colPx: 7, seed: 75, base: '#b8b1a4', lift: 0.1 });
    }
    instanced(tileGeo, tileMat, tileList, tileCols);

    /* ===== red postbox (modelled) ===== */
    {
      const pr = hmat('postbox', { color: '#d23a22', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.8 });
      const g = new THREE.Group(); const c = atZ(1067, 560, 18.1); g.position.set(c.x, 0, c.z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.36), pr); body.position.y = 0.42;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.41), pr); top.position.y = 0.84;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.02), voidMat); slot.position.set(0.02, 0.66, 0.185);
      const lab = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.01), hmat('label', { color: '#efe6d8', roughness: 0.6 })); lab.position.set(0.02, 0.5, 0.183);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), darkWoodMat); leg.position.y = 0.02;
      g.add(body, top, slot, lab, leg); g.rotation.y = -0.18; scene.add(shade(g));
    }

    /* ---------------- utility poles: concrete + wooden, crossarms, insulators, transformer, street lamp ---------------- */
    const poleMatA = toon({ color: '#e2d0b0', dapple: false });   // far pole (kept painterly)
    const concMat = hmat('conc', { color: '#f2e6d0', ...concreteTex, roughness: 0.9 });
    const polWood = hmat('polewood', { color: '#b89878', ...woodTex });
    const steelMat = hmat('steel', { color: '#8a8c88', roughness: 0.5, metalness: 0.6, envMapIntensity: 0.8 });
    const porcMat = hmat('porc', { color: '#f2efe6', roughness: 0.25, envMapIntensity: 0.9 });
    const brownPorc = hmat('bporc', { color: '#a86a3c', roughness: 0.3, envMapIntensity: 0.9 });
    const transMat = hmat('trans', { color: '#c6c2b8', roughness: 0.55, metalness: 0.35, envMapIntensity: 0.7 });
    const realPole = (px, topPy, botPy, d, radPx, mat) => {
      const top = atZ(px, topPy, d), bot = atZ(px, botPy, d); top.x = bot.x;
      const rr = radPx * d / F;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.82, rr, top.y - bot.y, 16), mat);
      m.position.copy(top).add(bot).multiplyScalar(0.5); scene.add(shade(m)); return { top, bot, rr };
    };
    const DA = 22.5, DB = 20.5;
    const pA1 = realPole(530, 186, 600, DA, 6.5, concMat), pA2 = realPole(588, 253, 600, DA, 6.0, concMat);
    {
      const bars = [];
      const y283 = atZ(560, 283, DA).y, y375 = atZ(560, 377, DA).y;
      bars.push(barMatrix(V3(pA1.top.x - 0.25, y283, -DA + 0.2), V3(pA2.top.x + 0.25, y283, -DA + 0.2), 0.1, 0.1, V3(0, 1, 0)));
      bars.push(barMatrix(V3(pA1.top.x - 0.35, y375, -DA + 0.2), V3(pA2.top.x + 0.35, y375, -DA + 0.2), 0.1, 0.1, V3(0, 1, 0)));
      bars.push(barMatrix(V3(pA1.top.x - 0.45, y375 - 0.05, -DA + 0.1), V3(pA1.top.x - 0.45, y375 - 0.05, -DA + 0.8), 0.08, 0.08, V3(0, 1, 0)));
      const yTop = atZ(530, 196, DA).y; bars.push(barMatrix(V3(pA1.top.x - 0.35, yTop, -DA + 0.2), V3(pA1.top.x + 0.35, yTop, -DA + 0.2), 0.09, 0.09, V3(0, 1, 0)));
      const yTop2 = atZ(588, 262, DA).y; bars.push(barMatrix(V3(pA2.top.x - 0.4, yTop2, -DA + 0.2), V3(pA2.top.x + 0.4, yTop2, -DA + 0.2), 0.09, 0.09, V3(0, 1, 0)));
      // diagonal braces
      bars.push(barMatrix(V3(pA1.top.x, y283 - 0.6, -DA + 0.18), V3(pA2.top.x, y283 - 0.02, -DA + 0.18), 0.04, 0.04, V3(0, 0, 1)));
      instanced(boxGeo, steelMat, bars);
      // transformer: banded cylinder tank + lid + fins + three brown bushings, on the lower platform
      const tc = atZ(554, 352, DA - 0.55); const tH = 30 * DA / F, tR = 20 * DA / F;
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR, tH, 20), transMat); tank.position.set(tc.x, y375 + 0.08 + tH / 2, tc.z);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(tR * 1.08, tR * 1.08, 0.06, 20), transMat); lid.position.set(tc.x, y375 + 0.1 + tH, tc.z);
      const g = new THREE.Group(); g.add(tank, lid);
      for (const yy of [0.25, 0.55, 0.85]) { const band = new THREE.Mesh(new THREE.TorusGeometry(tR * 1.01, 0.012, 4, 24), transMat); band.rotation.x = Math.PI / 2; band.position.set(tc.x, y375 + 0.08 + tH * yy, tc.z); g.add(band); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const f = new THREE.Mesh(boxGeo, transMat); f.scale.set(0.02, tH * 0.8, 0.09); f.position.set(tc.x + Math.cos(a) * (tR + 0.03), y375 + 0.08 + tH / 2, tc.z + Math.sin(a) * (tR + 0.03)); f.rotation.y = -a; g.add(f); }
      for (let i = -1; i <= 1; i++) {
        const bu = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 8), brownPorc); bu.position.set(tc.x + i * 0.16, y375 + 0.22 + tH, tc.z + 0.05);
        g.add(bu);
        for (let k = 0; k < 3; k++) { const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10), brownPorc); disc.position.set(bu.position.x, bu.position.y - 0.06 + k * 0.05, bu.position.z); g.add(disc); }
      }
      const plat = new THREE.Mesh(boxGeo, steelMat); plat.scale.set(pA2.top.x - pA1.top.x + 0.7, 0.05, 0.6); plat.position.set((pA1.top.x + pA2.top.x) / 2, y375 + 0.05, -DA + 0.35); g.add(plat);
      scene.add(shade(g));
      // pin insulators on the top arms
      const ins = [];
      for (const [p, yy] of [[pA1, yTop], [pA2, yTop2]]) for (const dx of [-0.3, 0.3]) ins.push(new THREE.Matrix4().makeTranslation(p.top.x + dx, yy + 0.09, -DA + 0.2));
      instanced(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 8), porcMat, ins);
    }
    // pole B (wooden, near the house): crossarms with insulators + a street lamp on a curved arm
    const pB = realPole(775, 213, 600, DB, 7, polWood);
    {
      const y1 = atZ(760, 226, DB).y, y2 = atZ(760, 240, DB).y, x = pB.top.x;
      instanced(boxGeo, polWood, [
        barMatrix(V3(x - 0.95, y1, -DB + 0.18), V3(x + 0.25, y1, -DB + 0.18), 0.09, 0.1, V3(0, 1, 0)),
        barMatrix(V3(x - 0.75, y2, -DB + 0.18), V3(x + 0.15, y2, -DB + 0.18), 0.08, 0.09, V3(0, 1, 0)),
        barMatrix(V3(x - 0.7, y1 - 0.02, -DB + 0.18), V3(x - 0.02, y1 - 0.55, -DB + 0.15), 0.04, 0.04, V3(0, 0, 1)),
      ]);
      const ins = []; for (const dx of [-0.85, -0.45, 0.15]) ins.push(new THREE.Matrix4().makeTranslation(x + dx, y1 + 0.1, -DB + 0.18));
      for (const dx of [-0.65, -0.3]) ins.push(new THREE.Matrix4().makeTranslation(x + dx, y2 + 0.09, -DB + 0.18));
      instanced(new THREE.CylinderGeometry(0.03, 0.045, 0.11, 8), porcMat, ins);
      // step bolts
      const sb = []; for (let k = 0; k < 9; k++) { const yy = 2.2 + k * 0.42; const s = k % 2 ? 1 : -1; sb.push(barMatrix(V3(x, yy, -DB), V3(x + s * pB.rr * 2.4, yy, -DB + 0.05), 0.018, 0.018, V3(0, 1, 0))); }
      instanced(boxGeo, steelMat, sb);
      // lamp: curved steel arm reaching left, housing with an emissive lens
      const a0 = atZ(775, 290, DB - 0.05); a0.x = x;
      const arm = new THREE.CatmullRomCurve3([V3(x - 0.02, a0.y, -DB + 0.1), V3(x - 0.35, a0.y + 0.28, -DB + 0.2), V3(x - 0.75, a0.y + 0.34, -DB + 0.25), atZ(726, 264, DB - 0.3)]);
      scene.add(shade(new THREE.Mesh(new THREE.TubeGeometry(arm, 16, 0.025, 6), steelMat)));
      const lp = atZ(722, 266, DB - 0.3);
      const hous = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.3, 10), hmat('lamp', { color: '#6a6c6a', roughness: 0.45, metalness: 0.5 }));
      hous.rotation.z = Math.PI / 2 - 0.15; hous.position.copy(lp); scene.add(shade(hous));
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: col('#fffbea') }));
      lens.position.copy(lp).add(V3(0, -0.07, 0)); scene.add(lens);
      // pole bands / sign plate
      const plate = new THREE.Mesh(boxGeo, hmat('plate', { color: '#d8d4c8', roughness: 0.5 })); plate.scale.set(0.16, 0.42, 0.01);
      plate.position.set(x, 2.6, -DB + pB.rr + 0.01); scene.add(shade(plate));
    }
    // far small pole on the left
    {
      const top = scr(218, 288, 70), bot = scr(218, 360, 70);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * wpp(70) * 0.9, 3.2 * wpp(70), top.distanceTo(bot), 8), poleMatA);
      m.position.copy(top).add(bot).multiplyScalar(0.5); scene.add(m);
    }

    const wireMat = new THREE.MeshBasicMaterial({ color: col('#2c2f36') });
    const wire = (a, b, sagPx, thickPx = 1.3) => {
      const A = scr(a[0], a[1], a[2]), B = scr(b[0], b[1], b[2]);
      const dm = (a[2] + b[2]) / 2, sag = sagPx * wpp(dm), pts = [];
      for (let i = 0; i <= 32; i++) { const t = i / 32; const p = A.clone().lerp(B, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, thickPx * 0.5 * wpp(dm), 4, false), wireMat);
      scene.add(m);
    };
    // long top wire across the left
    wire([-20, 194, 30], [528, 190, 26], 6, 1.3);
    // A -> B wires
    for (let i = 0; i < 4; i++) wire([590, 258 + i * 9, DA], [748 + i * 4, 224 + i * 6, DB], 14 + i * 3, 1.3);
    // B -> right across the house
    wire([776, 222, DB], [1290, 250, 11], 22, 1.4);
    wire([776, 232, DB], [1290, 268, 11], 26, 1.4);
    wire([772, 242, DB], [1290, 290, 11], 28, 1.4);
    wire([760, 240, DB], [870, 268, 13.5], 6, 1.1);
    // left far pole wires
    wire([-20, 280, 60], [218, 292, 70], 5, 1.0);
    wire([218, 292, 70], [460, 330, 50], 14, 1.0);
    wire([-20, 296, 60], [218, 300, 70], 5, 1.0);
    wire([218, 300, 70], [460, 350, 50], 12, 1.0);
    wire([140, 290, 60], [450, 450, 40], 30, 1.0);

    /* ---------------- kei truck: modelled, PBR, real cast + contact shadow, faces its direction of travel ---------------- */
    const truck = new THREE.Group();
    const truckEnv = makeEnvMap('s4_env', {
      zenith: '#3a9ad0', horizon: '#e8eef0', ground: '#9a9a78', sunDir: SUN, sunColor: '#fff2dc', sunPower: 26,
      clouds: [{ dir: [-0.6, 0.45, -0.7], size: 8, power: 1.6 }, { dir: [-0.2, 0.35, -1], size: 7, power: 1.4 }],
      blocks: [
        { dir: [-0.5, -1], w: 34, h: 10, dist: 16, color: '#163128' }, { dir: [0.7, -1], w: 18, h: 7, dist: 12, color: '#4a3a2c' },
        { dir: [1, 0.2], w: 20, h: 4, dist: 14, color: '#4a5a40' },
      ],
    });
    const kv = makeKeiTruck({ envMap: truckEnv, envIntensity: 1.25, sunDir: SUN, leafAmt: 0, grime: 0.22, color: '#e4d9c6', sunGain: 2.0 });
    const truckBody = new THREE.Group(); truckBody.position.z = kv.length / 2;   // centre the vehicle on the path point
    truckBody.add(kv.group, makeGroundShadow(kv, { contact: 0.75, cast: 0.6, color: '#0c140c' }));
    truck.add(truckBody);
    truck.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    scene.add(truck);
    {
      const sun = rig.sun;
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera; sc.left = sc.bottom = -9; sc.right = sc.top = 9; sc.near = 1; sc.far = 200;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    }
    const kp = (px, d) => { const p = scr(px, HORIZON, d); p.y = 0; return p; };
    const P0 = kp(865, 14.2), P1 = kp(562, 16.9), P2 = kp(330, 20.6);
    const truckPos = (t) => {
      const u = clamp(t / 3.0, 0, 1);
      // quadratic through the three keyframes (t=0, 1.5, 3)
      const a = P0, b = P1, c = P2;
      const l0 = 2 * (u - 0.5) * (u - 1), l1 = -4 * u * (u - 1), l2 = 2 * u * (u - 0.5);
      return new THREE.Vector3(a.x * l0 + b.x * l1 + c.x * l2, 0, a.z * l0 + b.z * l1 + c.z * l2);
    };

    /* ---------------- ground + grass ---------------- */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: col('#4f8a3a') }));
    ground.material.color = col('#2a4630'); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.01, -60); scene.add(ground);
    // lit grass: wide curved blades sampled per screen column + depth; each blade's height is chosen so that its tip lands
    // near the reference grass line (~y 540) regardless of depth -> tall near grass, short far grass. Per-blade normals
    // (with a folded midrib) are lit by the sun: lit vs shaded faces, back-lit translucency, root AO, clump hue, tip glints.
    {
      const r = rng(41); const N = 60000;
      const segs = 5, pos = [], idx = [];
      for (let i = 0; i <= segs; i++) { const t = i / segs, ww = Math.pow(1 - t, 0.85) * 0.5; if (i < segs) pos.push(-ww, t, 0, ww, t, 0); else pos.push(0, 1, 0); }
      for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
      const ig = new THREE.InstancedBufferGeometry();
      ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const aO = new Float32Array(N * 4), aS = new Float32Array(N * 4), aC = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const z = 1.3 * Math.pow(34 / 1.3, Math.pow(r(), 0.8));
        const px = lerp(-80, 1360, r());
        const p = scr(px, HORIZON, z);
        const spike = r() < 0.08 ? 15 + r() * 30 : 0;
        const tipY = 560 + (r() - 0.5) * 40 - spike + (px < 420 ? 10 : 0) + Math.max(0, (px - 980) * 0.06);
        const h = Math.max(0.12, CAM_H - (tipY - HORIZON) * z / F);
        const w = (0.05 + 0.014 * z) * lerp(0.65, 1.45, r());
        aO.set([p.x, 0, p.z, (r() - 0.5) * 1.5], i * 4);
        aS.set([h, w, r(), r()], i * 4);
        aC.set([px < 380 ? lerp(0.55, 0.8, clamp((px - 120) / 260, 0, 1)) : 1.0, z], i * 2);
      }
      ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4));
      ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
      ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 2));
      ig.instanceCount = N;
      const gm = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uSun: { value: sunV.clone() },
          cA: { value: col('#5f9a3c') }, cB: { value: col('#78ad46') }, cC: { value: col('#4c8a48') },
          cTip: { value: col('#c8e07a') }, cRoot: { value: col('#24401e') }, cTrans: { value: col('#d8f080') } },
        vertexShader: `attribute vec4 aO; attribute vec4 aS; attribute vec2 aC; uniform float uTime;
          varying float vT, vR, vR2, vShade, vClump, vSide; varying vec3 vN, vW;
          ${core.NOISE_GLSL}
          void main(){
            float t = position.y; vT = t;
            float c = cos(aO.w), s = sin(aO.w);
            vec3 W = vec3(c, 0., s);
            float h = aS.x;
            // gusts roll across the field (low-frequency travelling noise) + per-blade flutter
            float gust = vnoise(aO.xz * 0.16 + vec2(-uTime * 0.85, uTime * 0.25));
            gust = smoothstep(0.35, 0.85, gust);
            float sway = gust * 0.34 + sin(uTime * 2.3 + aO.x * 1.7 + aO.z * 0.9) * 0.045 + sin(uTime * 7.0 + aS.z * 40.) * 0.015 * t;
            vec2 dir = vec2(0.08 + sway, -0.02 - gust * 0.08) + vec2(aS.z - 0.5, aS.w - 0.5) * 0.42;
            vec3 p = W * position.x * aS.y + vec3(0., t * h, 0.);
            float L = length(dir);
            p.xz += dir * t * t * h;
            p.y -= L * L * t * t * h * 0.35;
            vec3 T = normalize(vec3(dir.x * 2. * t * h, h * (1. - 0.7 * L * L * t), dir.y * 2. * t * h));
            vec3 n = normalize(cross(W, T));
            // folded blade: each half tilts away from the midrib
            vSide = sign(position.x);
            n = normalize(n + W * vSide * 0.55);
            vN = n;
            vec3 wp = aO.xyz + p; vW = wp;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
            vR = aS.z; vR2 = aS.w; vShade = aC.x;
            vClump = vnoise(aO.xz * 0.55 + 3.0) * 0.65 + vnoise(aO.xz * 2.3) * 0.35;
          }`,
        fragmentShader: `uniform vec3 uSun, cA, cB, cC, cTip, cRoot, cTrans; varying float vT, vR, vR2, vShade, vClump, vSide; varying vec3 vN, vW;
          void main(){
            vec3 n = normalize(vN);
            vec3 V = normalize(cameraPosition - vW);
            float facing = dot(n, V);
            if (facing < 0.) n = -n;
            float ndl = dot(n, uSun);
            float diff = max(ndl, 0.);
            float trans = max(-ndl, 0.) * (0.35 + 0.65 * vT);
            // clump colour: yellow-green / mid / cool blue-green patches
            vec3 alb = mix(cC, cA, smoothstep(0.25, 0.55, vClump));
            alb = mix(alb, cB, smoothstep(0.55, 0.85, vClump + (vR - 0.5) * 0.25));
            alb *= 0.86 + 0.28 * vR2;
            float ao = mix(0.32, 1.0, smoothstep(0.0, 0.62, vT));
            float sky = 0.58 + 0.22 * n.y;
            vec3 c = alb * (sky + 0.62 * diff) + cTrans * alb * trans * 0.55;
            c *= ao;
            c = mix(cRoot, c, smoothstep(0.0, 0.3, vT) * 0.6 + 0.4);
            // tips catch the light
            c = mix(c, cTip, smoothstep(0.84, 1.0, vT) * smoothstep(0.2, 0.75, diff) * step(0.45, vR2) * 0.55);
            c *= vShade;
            gl_FragColor = vec4(c, 1.);
          }`,
        side: THREE.DoubleSide,
      });
      const gmesh = new THREE.Mesh(ig, gm); gmesh.frustumCulled = false; scene.add(gmesh);
    }

    /* ---------------- near leaves (screen-authored leaf cards) ---------------- */
    const leafAtlas = canvasTexture('s4_leaf_atlas', 512, 128, (g) => {
      g.clearRect(0, 0, 512, 128);
      const shapes = [
        (g) => { g.moveTo(64, 124); g.bezierCurveTo(14, 104, 14, 46, 64, 2); g.bezierCurveTo(114, 46, 114, 104, 64, 124); },          // ovate, pointed
        (g) => { g.moveTo(64, 112); g.bezierCurveTo(44, 126, 8, 106, 12, 74); g.bezierCurveTo(16, 42, 50, 24, 64, 2); g.bezierCurveTo(78, 24, 112, 42, 116, 74); g.bezierCurveTo(120, 106, 84, 126, 64, 112); }, // cordate, pointed
        (g) => { g.moveTo(64, 124); g.bezierCurveTo(24, 100, 26, 40, 64, 4); g.bezierCurveTo(102, 40, 104, 100, 64, 124); },          // narrow
        (g) => { g.moveTo(64, 120); g.bezierCurveTo(2, 110, 6, 20, 64, 10); g.bezierCurveTo(122, 20, 126, 110, 64, 120); },           // round
      ];
      shapes.forEach((s, i) => {
        g.save(); g.translate(i * 128, 0);
        g.beginPath(); s(g); g.closePath(); g.fillStyle = '#d8d8d8'; g.fill();
        g.save(); g.clip(); g.fillStyle = '#ffffff'; g.fillRect(64, 0, 64, 128);
        g.strokeStyle = '#a0a0a0'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(64, 118); g.lineTo(64, 12); g.stroke();
        g.restore(); g.restore();
      });
    }, { srgb: false });
    const leafLayer = (items, { pal, wind = 0.02, fogA = 0, fogC = '#7aa8b8' }) => {
      const n = items.length;
      const geo = new THREE.PlaneGeometry(1, 1);
      const ig = new THREE.InstancedBufferGeometry();
      ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
      const aP = new Float32Array(n * 4), aL = new Float32Array(n * 4);
      items.forEach((it, i) => { aP.set([it[0], it[1], it[2], it[3]], i * 4); aL.set([it[4], it[5], it[6], it[7]], i * 4); });
      ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
      ig.setAttribute('aL', new THREE.InstancedBufferAttribute(aL, 4));
      ig.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { tLeaf: { value: leafAtlas }, uTime: shared.uTime, uWind: { value: wind },
          c0: { value: col(pal[0]) }, c1: { value: col(pal[1]) }, c2: { value: col(pal[2]) }, c3: { value: col(pal[3]) },
          uFogA: { value: fogA }, cFog: { value: col(fogC) } },
        vertexShader: `attribute vec4 aP; attribute vec4 aL; uniform float uTime, uWind;
          varying vec2 vUv; varying float vTone, vVar, vPh;
          void main(){
            vec3 c = aP.xyz;
            float s = sin(uTime*1.6 + aL.w*6.2831) + 0.55*sin(uTime*2.7 + aL.w*17.0 + c.x*0.7);
            float rot = aL.x + s*uWind*2.5;
            vec4 mv = modelViewMatrix * vec4(c, 1.0);
            mv.xy += vec2(0.6, 0.25) * s * uWind * aP.w;
            vec2 cs = vec2(cos(rot), sin(rot));
            mv.xy += mat2(cs.x, cs.y, -cs.y, cs.x) * position.xy * aP.w;
            gl_Position = projectionMatrix * mv;
            vUv = uv; vTone = aL.y; vVar = aL.z; vPh = aL.w;
          }`,
        fragmentShader: `uniform sampler2D tLeaf; uniform vec3 c0, c1, c2, c3, cFog; uniform float uFogA;
          varying vec2 vUv; varying float vTone, vVar, vPh;
          void main(){
            vec4 t = texture2D(tLeaf, vec2((clamp(vUv.x,0.02,0.98) + vVar) * 0.25, vUv.y));
            if (t.a < 0.5) discard;
            float k = vTone;
            vec3 c = mix(c0, c1, smoothstep(0.23, 0.27, k));
            c = mix(c, c2, smoothstep(0.48, 0.52, k));
            c = mix(c, c3, smoothstep(0.73, 0.77, k));
            c *= mix(0.84, 1.0, t.r) * (0.93 + 0.14 * fract(vPh * 7.31));
            c = mix(c, cFog, uFogA);
            gl_FragColor = vec4(c, 1.0);
          }`,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
    };
    const inPoly = (x, y, poly) => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
    // fill a screen polygon with leaves. tone(px,py,r)->0..1; darker leaves sit deeper so lit ones overlap them.
    const spray = (out, seed, poly, n, o) => {
      const r = rng(seed);
      const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      let k = 0, tries = 0;
      while (k < n && tries++ < n * 200) {
        const px = lerp(bx0, bx1, r()), py = lerp(by0, by1, r());
        if (!inPoly(px, py, poly)) continue;
        const tone = clamp(o.tone(px, py, r), 0, 1);
        const d = o.d + (1 - tone) * (o.dz || 0.4) + r() * 0.05;
        const p = scr(px, py, d);
        const s = lerp(o.size[0], o.size[1], r()) * wpp(d);
        const rot = o.rot ? o.rot(px, py, r) : r() * Math.PI * 2;
        const v = o.variant !== undefined ? (typeof o.variant === 'function' ? o.variant(r) : o.variant) : 0;
        out.push([p.x, p.y, p.z, s, rot, tone, v, r()]);
        k++;
      }
      return out;
    };
    const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    // --- top canopy (main mass across the top)
    const canopyPoly = [[280, -30], [1015, -30], [1000, 30], [978, 62], [948, 92], [915, 112], [878, 130], [848, 140], [818, 122], [788, 102],
      [758, 112], [728, 128], [700, 152], [672, 172], [655, 178], [664, 205], [642, 242], [602, 252], [560, 242], [520, 218], [490, 202],
      [468, 188], [440, 190], [412, 170], [380, 120], [340, 100], [300, 70], [284, 40]];
    const canopy = [];
    // dense core along the very top (dark interior + lit leaves)
    const canopyCore = [[430, -30], [1015, -30], [1000, 26], [975, 52], [945, 76], [905, 92], [870, 104], [840, 104], [812, 88], [784, 74],
      [752, 80], [722, 92], [690, 108], [650, 112], [610, 100], [570, 92], [530, 84], [490, 64], [455, 30]];
    spray(canopy, 101, canopyCore, 150, { d: 5.2, dz: 0.6, size: [26, 72],
      tone: (x, y, r) => 0.02 + r() * 0.22, rot: (x, y, r) => Math.PI + (r() - 0.5) * 2.4, variant: 0 });
    spray(canopy, 102, canopyCore, 150, { d: 5.0, dz: 0.6, size: [24, 66],
      tone: (x, y, r) => { const q = r(); return q < 0.5 ? 0.3 + r() * 0.15 : 0.52 + r() * 0.2 + (q > 0.93 ? 0.25 : 0); },
      rot: (x, y, r) => Math.PI + (r() - 0.5) * 2.2, variant: 0 });
    // sparse fringe of individual hanging leaves (sky shows between them)
    spray(canopy, 105, canopyPoly, 95, { d: 4.9, dz: 0.5, size: [22, 74],
      tone: (x, y, r) => { const q = r(); return q < 0.35 ? r() * 0.08 : q < 0.6 ? 0.3 + r() * 0.15 : 0.52 + r() * 0.2; },
      rot: (x, y, r) => Math.PI + (r() - 0.5) * 2.0, variant: 0 });
    // the drooping spray above the transformer pole
    spray(canopy, 106, [[480, 150], [670, 150], [660, 250], [600, 256], [520, 225]], 26, { d: 4.8, dz: 0.4, size: [28, 66],
      tone: (x, y, r) => (r() < 0.45 ? r() * 0.08 : 0.3 + r() * 0.4), rot: (x, y, r) => Math.PI + (r() - 0.5) * 1.6, variant: 0 });
    // right-hand bright cluster
    const canopyR = [[995, -30], [1300, -30], [1300, 300], [1242, 302], [1196, 285], [1165, 258], [1146, 210], [1110, 168], [1068, 136], [1030, 104], [1004, 64]];
    spray(canopy, 103, canopyR, 140, { d: 4.6, dz: 0.5, size: [26, 70], tone: (x, y, r) => 0.05 + r() * 0.2, rot: (x, y, r) => Math.PI * 0.85 + (r() - 0.5) * 2.4, variant: 0 });
    spray(canopy, 104, canopyR, 230, { d: 4.4, dz: 0.5, size: [26, 64],
      tone: (x, y, r) => { const q = r(); return q < (y < 110 ? 0.55 : 0.2) ? 0.32 + r() * 0.12 : 0.55 + r() * 0.18 + (q > 0.6 ? 0.25 : 0); },
      rot: (x, y, r) => Math.PI * 0.85 + (r() - 0.5) * 2.4, variant: 0 });
    scene.add(leafLayer(canopy, { pal: ['#071110', '#1b3a30', '#33694c', '#5b946b'], wind: 0.015 }));

    // --- tall broad-leaf weed on the left edge (silhouetted against the sky)
    const plantPoly = [[-10, 60], [50, 66], [92, 120], [150, 130], [210, 140], [262, 250], [256, 300], [300, 360], [345, 450], [280, 465], [200, 470], [120, 500], [-10, 520]];
    const plant = [];
    spray(plant, 201, plantPoly, 44, { d: 2.6, dz: 0.3, size: [54, 76], tone: (x, y, r) => 0.02 + r() * 0.22,
      rot: (x, y, r) => Math.PI + (r() - 0.5) * 2.6, variant: 2 });
    spray(plant, 202, plantPoly, 46, { d: 2.5, dz: 0.3, size: [54, 78], tone: (x, y, r) => (r() < 0.45 ? 0.3 + r() * 0.15 : 0.55 + r() * 0.2 + (r() < 0.3 ? 0.22 : 0)),
      rot: (x, y, r) => Math.PI + (r() - 0.5) * 2.6, variant: 2 });
    {
      const stemMat = new THREE.MeshBasicMaterial({ color: col('#1c3024') });
      const stem = (pts, d, thickPx) => {
        const P = pts.map(([x, y]) => scr(x, y, d));
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P), 24, thickPx * 0.5 * wpp(d), 5, false), stemMat));
      };
      stem([[60, 560], [70, 420], [55, 260], [40, 120], [30, 70]], 2.7, 5);
      stem([[200, 560], [215, 420], [190, 290], [165, 160]], 2.8, 4);
      stem([[300, 540], [290, 450], [262, 360], [250, 290]], 2.8, 3.5);
      stem([[215, 420], [250, 400], [300, 395]], 2.8, 2.5);
      stem([[190, 290], [150, 270], [120, 240]], 2.8, 2.5);
    }
    scene.add(leafLayer(plant, { pal: ['#12211b', '#264434', '#4a7a50', '#76a070'], wind: 0.03 }));

    // --- dense dark bush, lower left (butterflies hover over it)
    const bushPoly = [[-10, 540], [60, 536], [140, 550], [200, 575], [250, 605], [290, 640], [320, 680], [340, 730], [-10, 730]];
    const bush = [];
    spray(bush, 301, bushPoly, 120, { d: 1.15, dz: 0.15, size: [40, 62], tone: (x, y, r) => 0.01 + r() * 0.23,
      rot: (x, y, r) => (r() - 0.5) * 3.0 + Math.PI * (r() < 0.5 ? 1 : 0), variant: (r) => (r() < 0.6 ? 1 : 2) });
    spray(bush, 302, bushPoly, 34, { d: 1.1, dz: 0.15, size: [38, 58],
      tone: (x, y, r) => { const top = 1 - sm(440, 650, y); return r() < 0.08 + top * 0.2 ? 0.52 + r() * 0.22 + (r() < 0.25 ? 0.22 : 0) : 0.3 + r() * 0.16; },
      rot: (x, y, r) => (r() - 0.5) * 3.0 + Math.PI * (r() < 0.5 ? 1 : 0), variant: 1 });
    // loose leaves poking above the grass to the right of the bush
    spray(bush, 303, [[320, 620], [540, 620], [540, 730], [320, 730]], 16, { d: 1.2, dz: 0.2, size: [38, 54],
      tone: (x, y, r) => 0.02 + r() * 0.4, rot: (x, y, r) => (r() - 0.5) * 2.2, variant: 1 });
    scene.add(leafLayer(bush, { pal: ['#070f0b', '#122719', '#234a2a', '#41733c'], wind: 0.025 }));

    /* ---------------- butterflies (tiny glowing yellow) ---------------- */
    const bfTex = canvasTexture('s4_bfly', 64, 64, (g, w, h) => {
      g.fillStyle = '#fff';
      for (const s of [-1, 1]) { g.save(); g.translate(32, 34); g.scale(s, 1);
        g.beginPath(); g.ellipse(12, -8, 13, 10, -0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(9, 10, 8, 7, 0.6, 0, 7); g.fill(); g.restore(); }
    }, { srgb: false });
    {
      const r = rng(77); const n = 30; const D = 1.0;
      const aB = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        let px, py;
        do { px = r() * 620; py = 480 + r() * 240; } while (!inPoly(px, py, [[0, 480], [300, 490], [460, 560], [620, 600], [620, 720], [0, 720]]));
        const p = scr(px, py, D - 0.3);
        aB.set([p.x, p.y, p.z, r() * 100], i * 4);
      }
      const geo = new THREE.PlaneGeometry(1, 1); const ig = new THREE.InstancedBufferGeometry();
      ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
      ig.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4)); ig.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, uSize: { value: 8.5 * wpp(D) }, uAmp: { value: 14 * wpp(D) }, tB: { value: bfTex }, uCol: { value: col('#ffe38a') } },
        vertexShader: `attribute vec4 aB; uniform float uTime, uSize, uAmp; varying vec2 vUv;
          void main(){ vUv = uv; float ph = aB.w; float t = uTime;
            vec3 c = aB.xyz + vec3(sin(t*0.9+ph)*1.0 + sin(t*2.3+ph*2.)*0.35, sin(t*1.3+ph*1.3)*0.7 + sin(t*3.7+ph)*0.2, 0.0) * uAmp;
            float flap = 0.2 + 0.8*abs(sin(t*13.0 + ph*5.0));
            vec4 mv = modelViewMatrix * vec4(c,1.);
            mv.xy += vec2(position.x * flap, position.y) * uSize;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform sampler2D tB; uniform vec3 uCol; varying vec2 vUv;
          void main(){ float a = texture2D(tB, vUv).a; if (a < 0.4) discard; gl_FragColor = vec4(uCol * 1.6, 1.0); }`,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; scene.add(m);
    }

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(sunV);
        shared.uDapple.value = 0;
        shared.uFogMax.value = 0;
        // the truck faces its direction of travel (away and to the left): the rear gate + cab guard face the camera
        const p = truckPos(t);
        const d = truckPos(Math.min(t + 0.04, 3.2)).sub(truckPos(Math.max(t - 0.04, 0)));
        truck.position.copy(p);
        truck.rotation.y = Math.atan2(-d.x, -d.z);
        // spin the wheels by distance travelled (tyre radius 0.27 m)
        let dist = 0; for (let k = 0; k < 24; k++) dist += truckPos(t * (k + 1) / 24).distanceTo(truckPos(t * k / 24));
        for (const w of kv.wheels) w.rotation.x = -dist / 0.27;
        rig.sun.target.position.copy(p); rig.sun.position.copy(p).addScaledVector(sunV, 60); rig.sun.target.updateMatrixWorld();
      },
    };
  },
};
