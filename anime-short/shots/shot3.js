// Shot 3 — Ghibli-style flower garden: layered painterly forest backdrop, row of flowering bushes,
// four painted boulders in bright lime grass, broad framing leaves, tiny yellow butterflies, drifting pollen.
// Static eye-level camera. Most elements are placed by reference-frame pixel coords + view distance.
// REALISM PASS: shadow-casting sun + PMREM env; boulders are displaced geometry with painted PBR rock (texSet) and baked AO;
// the lawn is ~56k instanced, per-blade lit curved blades with analytic rock shadows/contact AO; flowers are modelled 3D petals.
import { pbrUniforms, pbr, makeEnvMap, addSunShadow, texSet } from '../pbr.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const FOV = 40, CAM_Y = 1.0;
const TV = Math.tan((FOV / 2) * Math.PI / 180), TH = TV * 16 / 9;
// pixel (1280x720 reference frame) + view distance -> world position (camera at origin looking -Z)
const S = (px, py, d) => [(px / 640 - 1) * TH * d, CAM_Y + (1 - py / 360) * TV * d, -d];
const PX = (pxLen, d) => pxLen / 360 * TV * d;             // pixel length -> world length at distance d
const GD = (py) => CAM_Y / ((py / 360 - 1) * TV);          // view distance of ground point seen at pixel row py

export default {
  duration: 3.042,
  credit: { role: '3D ANIMATOR', cx: 0.743, ry: 0.674, ny: 0.726 },
  post: { bloom: 0.18, bloomRadius: 0.5, bloomThreshold: 0.9, exposure: 1.05, contrast: 1.03, saturation: 0.99,
    lift: [0.0, 0.01, 0.015], gamma: [1, 1, 1], gain: [1.02, 1.01, 0.99], vignette: 0.14, grain: 0.025, ca: 0.0008, soft: 0.25 },

  build(core) {
    const { THREE, rng, lerp, clamp, col, shared, NOISE_GLSL, paintTexture, makeFoliage, makeButterflies, makeMotes, lightRig } = core;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1d3a26');
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 500);
    camera.position.set(0, CAM_Y, 0);
    camera.lookAt(0, CAM_Y, -1);
    // lighting: one shadow-casting warm sun (upper right, slightly frontal), green-tinted sky/bounce, PMREM env
    const SUN = [0.5, 0.74, 0.45];
    const sunV = new THREE.Vector3(...SUN).normalize();
    shared.uSunDir.value.copy(sunV);
    const env = makeEnvMap('s3_env', { zenith: '#c0d8d4', horizon: '#8eaa88', ground: '#44583a', sunDir: SUN, sunColor: '#fff2d8', sunPower: 10,
      blocks: [{ dir: [0, -1], w: 40, h: 12, dist: 11, color: '#2c5232' }, { dir: [0, 1], w: 40, h: 14, dist: 8, color: '#1c3a24' },
        { dir: [-1, 0], w: 30, h: 12, dist: 7, color: '#1a3420' }, { dir: [1, 0], w: 30, h: 12, dist: 7, color: '#21402a' }] });
    const PU = pbrUniforms({ sunDir: SUN, leafAmt: 0, grime: 0.3, rimAmt: 0 });
    const sunL = addSunShadow(scene, { sunDir: SUN, color: '#fff0d6', intensity: 2.4, target: new THREE.Vector3(-0.1, 0.3, -5.0), radius: 3.4, mapSize: 2048 });
    sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.02;
    scene.add(new THREE.HemisphereLight(col('#d4e4dc'), col('#5a7048'), 0.75));

    /* ---------------- tiny JS value noise for the canvas painter ---------------- */
    const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), ux), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux), uy);
    };
    const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 5, y * 2.1 + 3) * 0.3 + vn(x * 4.3 + 9, y * 4.3 + 1) * 0.15;
    const hex = (h) => { const c = parseInt(h.slice(1), 16); return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; };
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    function leafShape(g, len, wid) {
      g.beginPath(); g.moveTo(0, -len / 2);
      g.quadraticCurveTo(wid, -len * 0.05, 0, len / 2);
      g.quadraticCurveTo(-wid, -len * 0.05, 0, -len / 2); g.closePath();
    }
    // a little cluster of 3-7 serrated leaves around (0,0)
    function leafCluster(g, r, R, size) {
      const n = 3 + Math.floor(R() * 5);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, d = R() * size * 0.55;
        g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(a + Math.PI / 2 + (R() - 0.5));
        leafShape(g, size * lerp(0.6, 1.0, R()), size * lerp(0.22, 0.34, R())); g.fill(); g.restore();
      }
    }

    /* ---------------- 1. far painted forest backdrop (canvas) ---------------- */
    // coarse colour layout (painter's colour study, 16 x 6 cells over the full frame; last row repeats downward)
    const GRID = [
      '1e2d22 1e3724 294e2f 23432a 436f45 417440 51854f 254230 23382c 538058 345637 1a3a26 1d3828 1b3d25 193725 1b4b2f',
      '18261c 162019 2b462f 3f6841 507c49 437345 3d693d 2e5d38 1a2b1f 335634 407241 324d36 476d48 213725 1e3c29 1a4229',
      '1e3021 18241b 244129 467a48 428046 365f3c 2f4f33 254e32 1e382b 3e5e45 4a7948 457e49 659262 607d51 334830 1e432e',
      '2a4a2c 3a6a3c 447845 3a6f3e 3b713b 2f5934 1a2820 264833 30623a 25432b 3b5934 4a6d40 557a4c 465d3d 3e5c40 23442d',
      '2c4a2c 30562f 3f6e3f 3a6a3c 345c3a 2c5534 263f28 20362a 3e6a40 345a36 2e4e30 3a5a38 3c5e3c 3a5a3a 3a5a3c 2a4a30',
      '22381f 24401f 2a4a2c 2c4a2c 2a4a2c 284a2c 284628 284628 2c4c2c 2c4c2c 2a4a2c 2a4a2c 2a4a2c 2a4a30 284a2e 264a2e',
    ].map(row => row.split(' ').map(h => hex('#' + h)));
    const gridAt = (u, v) => {
      const x = clamp(u * 16 - 0.5, 0, 15), y = clamp(v * 9 - 0.5, 0, 5);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(15, x0 + 1), y1 = Math.min(5, y0 + 1), fx = ss(0, 1, x - x0), fy = ss(0, 1, y - y0);
      return [0, 1, 2].map(k => lerp(lerp(GRID[y0][x0][k], GRID[y0][x1][k], fx), lerp(GRID[y1][x0][k], GRID[y1][x1][k], fx), fy));
    };
    function design(u, v) {
      const wu = u + (fbm(u * 7, v * 7) - 0.5) * 0.06, wv = v + (fbm(u * 7 + 7, v * 7 + 2) - 0.5) * 0.06;
      return gridAt(wu, wv);
    }
    const BW = 1600, BH = 900;
    const backTex = paintTexture('s3_forest', BW, BH, (g, W, H, R) => {
      // base: per-pixel design (coarse) then painterly leaf strokes on top
      const img = g.createImageData(W / 4, H / 4);
      for (let y = 0; y < H / 4; y++) for (let x = 0; x < W / 4; x++) {
        const c = design(x / (W / 4), y / (H / 4)); const o = (y * W / 4 + x) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
      }
      const tmp = document.createElement('canvas'); tmp.width = W / 4; tmp.height = H / 4; tmp.getContext('2d').putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, W, H);
      // stroke passes. Each pass stamps leaf clusters only where its own low-frequency mask is on, so
      // strokes of one value group into coherent painted masses with crisp leafy edges.
      const fill = (c, k, a, warm = 0) => { g.fillStyle = `rgba(${Math.min(255, c[0] * k + warm) | 0},${Math.min(255, c[1] * k + warm * 0.8) | 0},${Math.min(255, c[2] * k) | 0},${a})`; };
      const passes = [
        // n, size, mask seed, threshold, value k, alpha, warm, soft
        [1800, 70, 0, -1, 1.0, 0.30, 0, true],
        [5000, 30, 1, 0.52, 0.62, 0.95, 0, false],   // shadow masses
        [6000, 22, 0, -1, 1.0, 0.85, 0, false],      // mid leaves
        [4000, 24, 2, 0.56, 1.28, 0.9, 6, false],    // lit masses
        [2500, 13, 3, 0.62, 1.5, 0.95, 14, false],   // pale leaf sprays
        [3000, 12, 4, 0.58, 0.55, 0.95, 0, false],   // dark accents
      ];
      for (const [n, size, ms, th, k0, alpha, warm, soft] of passes) {
        for (let i = 0; i < n; i++) {
          const u = R(), v = R() * 0.82;
          if (th > 0 && fbm(u * 6 + ms * 13.1, v * 4 + ms * 7.7) < th) continue;
          const c = design(u, v);
          fill(c, k0 * (1 + (R() - 0.5) * 0.14), alpha, warm);
          g.save(); g.translate(u * W, v * H);
          if (soft) { g.beginPath(); g.ellipse(0, 0, size * lerp(0.5, 1, R()), size * lerp(0.4, 0.8, R()), R() * 3, 0, Math.PI * 2); g.fill(); }
          else leafCluster(g, size, R, size * lerp(0.7, 1.3, R()));
          g.restore();
        }
      }
      // a few pale grass tufts in the mid-depth (fern-like strokes)
      g.strokeStyle = 'rgba(160,200,130,0.55)'; g.lineWidth = 2;
      for (const [u, v] of [[0.19, 0.42], [0.66, 0.27], [0.58, 0.52], [0.84, 0.34]]) {
        for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(u * W, v * H); g.quadraticCurveTo(u * W + (k - 3) * 6, v * H - 25, u * W + (k - 3) * 14, v * H - 38 + Math.abs(k - 3) * 5); g.stroke(); }
      }
    });
    const backMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: backTex }, uTime: shared.uTime, cMist: { value: col('#a6caa2') }, cDeep: { value: col('#5e8a66') } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tMap; uniform float uTime; varying vec2 vUv; ${NOISE_GLSL}
        void main(){ vec2 uv = vUv; float n = vnoise(uv*vec2(9.,6.) + uTime*0.25);
          uv += vec2(sin(uTime*0.9 + uv.y*14.), cos(uTime*0.7 + uv.x*11.)) * 0.0005 * (0.5+n);
          // aerial perspective: the far layer is softer than the crisp near leaves
          vec3 c = texture2D(tMap, uv).rgb * 0.2;
          for (int k = 0; k < 8; k++) { float a = float(k) * 0.785 + 0.4; c += texture2D(tMap, uv + vec2(cos(a), sin(a)) * vec2(0.0026, 0.0046)).rgb * 0.1; }
          vec2 p = vec2(vUv.x, 1.0 - vUv.y);
          // deep shadowed void (tree trunks) behind the clearing
          float trunk = smoothstep(0.075, 0.0, abs(p.x - 0.5 + p.y * 0.05) - 0.035) * smoothstep(0.62, 0.12, p.y) * (0.6 + 0.4 * fbm(p * vec2(7., 3.)));
          c *= 1.0 - 0.6 * trunk;
          // misty light in the middle distance: soft glows + diagonal shafts from the upper right
          float glow = exp(-dot((p - vec2(0.6, 0.3)) * vec2(2.2, 2.6), (p - vec2(0.6, 0.3)) * vec2(2.2, 2.6)) * 2.0);
          float glow2 = exp(-dot((p - vec2(0.27, 0.33)) * vec2(2.6, 3.0), (p - vec2(0.27, 0.33)) * vec2(2.6, 3.0)) * 2.0);
          float across = p.x + p.y * 0.38;
          float shafts = smoothstep(0.45, 0.85, vnoise(vec2(across * 14.0, 3.0 + uTime * 0.08))) * smoothstep(0.75, 0.1, p.y) * smoothstep(0.25, 0.45, p.x);
          float mist = clamp(glow * 0.6 + glow2 * 0.32 + shafts * 0.3, 0.0, 0.9) * (0.7 + 0.3 * fbm(p * vec2(5., 3.) + uTime * 0.02));
          c = mix(c, cMist, mist * 0.62);
          c = mix(c, cDeep, 0.06);
          gl_FragColor = vec4(c, 1.); }`,
      depthWrite: false,
    });
    const BD = 40;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * TH * BD * 1.02, 2 * TV * BD * 1.02), backMat);
    back.position.set(...S(640, 360, BD)); back.renderOrder = -10; scene.add(back);

    /* ---------------- 2. near forest layers (3D foliage, swaying) ---------------- */
    const foliage = (clumpsPx, opts) => {
      const clumps = clumpsPx.map(([px, py, d, rpx]) => [...S(px, py, d), PX(rpx, d)]);
      const m = makeFoliage({ clumps, ...opts, wind: (opts.wind ?? 0.03) * 0.5 }); scene.add(m); return m;
    };
    // top-left canopy: near-black mass broken by mid-green leaf sprays
    foliage([[40, 30, 14, 90], [160, 50, 14, 75], [50, 160, 14, 75], [195, 150, 14, 35]],
      { density: 3.2, cardSize: PX(80, 14), kind: 'broad', seed: 11, texSeed: 3, dark: '#0b120e', mid: '#121d16', light: '#22382a', highlight: '#3a5e40', wind: 0.02, lightWrap: 0.2, shell: 0.2 });
    foliage([[150, 120, 13, 60], [60, 90, 13, 40], [280, 120, 13, 40], [250, 40, 13, 50], [20, 230, 13, 30]],
      { density: 0.7, cardSize: PX(40, 13), kind: 'small', seed: 16, texSeed: 11, dark: '#1f3a28', mid: '#2f5a3a', light: '#4a7a50', highlight: '#6a9a68', wind: 0.03, shell: 0.1 });
    // pale leaf sprays hanging into the light (centre)
    foliage([[420, 110, 16, 50], [470, 210, 16, 40], [600, 280, 16, 45], [560, 170, 16, 30], [700, 120, 16, 30], [840, 250, 16, 30]],
      { density: 0.9, cardSize: PX(40, 16), kind: 'small', seed: 12, texSeed: 5, dark: '#2c5a3a', mid: '#467f50', light: '#6f9f6c', highlight: '#90bd86', wind: 0.03, shell: 0.1 });
    // top-right overhang: dark crisp broad leaves
    foliage([[950, 30, 11, 65], [1040, 55, 11, 55], [905, 110, 11, 25], [1100, 20, 11, 60], [880, 40, 11, 30]],
      { density: 0.8, cardSize: PX(80, 11), kind: 'broad', seed: 13, texSeed: 7, dark: '#0c1812', mid: '#11221a', light: '#1d3a2a', highlight: '#2f5a40', wind: 0.02, lightWrap: 0.1, shell: 0.25 });
    // right tree mass (teal-green, clearly lit leaves)
    foliage([[1250, 110, 10, 110], [1250, 270, 10, 100], [1270, 420, 10, 90], [1180, 60, 10, 50]],
      { density: 2.4, cardSize: PX(56, 10), kind: 'broad', seed: 14, texSeed: 9, dark: '#0f2418', mid: '#1a4430', light: '#2c6646', highlight: '#4f9068', wind: 0.02, shell: 0.3 });
    // dark green shrub band behind the flower bushes
    foliage([[300, 450, 9.5, 70], [430, 420, 9.5, 70], [560, 430, 9.5, 80], [690, 420, 9.5, 70], [810, 440, 9.5, 70], [200, 440, 9.5, 60]],
      { density: 3, cardSize: PX(34, 9.5), kind: 'small', seed: 15, texSeed: 2, dark: '#14261a', mid: '#1d3a24', light: '#2f5a34', highlight: '#4e7e46', wind: 0.02, shell: 0.4, flatten: 0.7 });

    /* ---------------- 3. boulders: displaced geometry, painted PBR rock (albedo/normal/roughness), AO + moss ---------------- */
    const rockGrey = rockTexSet(core, 31, ROCK_PAL.grey);
    const rockBrown = rockTexSet(core, 32, ROCK_PAL.brown);
    const rockDefs = [
      // px centre, py bottom, width px, height px, texture set, tint, moss, seed
      [265, 642, 168, 124, rockGrey, '#f2f3fa', 0.08, 1],
      [414, 666, 188, 100, rockBrown, '#ffffff', 0.06, 2],
      [604, 615, 222, 128, rockGrey, '#f4f4f4', 0.14, 3],
      [905, 665, 250, 112, rockGrey, '#6e6862', 0.2, 4],
    ];
    const occ = [];   // ellipsoid occluders {c, r, s: shadow strength, ao: contact-AO strength} for the analytic grass shadows
    for (const [px, pyb, wpx, hpx, ts, tint, moss, sd] of rockDefs) {
      const d = GD(pyb - 8);
      const w = PX(wpx, d), h = PX(hpx, d) * 1.15;
      const rock = makeRock(core, { w, h, seed: sd, moss });
      rock.material = pbr(PU, { color: tint, map: ts.map, normalMap: ts.normalMap, normalScale: new THREE.Vector2(1.3, 1.3),
        roughnessMap: ts.roughnessMap, roughness: 1, metalness: 0, vertexColors: true, envMap: env, envMapIntensity: 0.7 }, null, 's3rock');
      const p = S(px, pyb, d); rock.position.set(p[0], -PX(hpx, d) * 0.08, p[2]);
      rock.castShadow = rock.receiveShadow = true; scene.add(rock);
      occ.push({ c: [p[0], rock.position.y, p[2]], r: [w * 0.5, h, w * 0.4], s: 0.8, ao: 0.75 });
    }
    // the aster masses in front also shade the grass under them
    for (const [px, py, d, rx, ry] of [[860, 560, 2.95, 95, 70], [1010, 470, 3.6, 100, 70], [790, 590, 2.9, 45, 35]]) {
      const c = S(px, py, d); occ.push({ c, r: [PX(rx, d), PX(ry, d) * 1.4, PX(rx, d) * 0.7], s: 0.5, ao: 0.35 });
    }

    /* ---------------- 4. lush grass: ~56k instanced curved blades, per-blade sun + translucency, AO, rock shadows ---------------- */
    const occC = [], occR = [];
    for (let i = 0; i < 8; i++) {
      const o = occ[i];
      occC.push(o ? new THREE.Vector4(...o.c, o.ao) : new THREE.Vector4(0, -50, 0, 0));
      occR.push(o ? new THREE.Vector4(...o.r, o.s) : new THREE.Vector4(1, 1, 1, 0));
    }
    const GU = {
      uTime: shared.uTime, uSun: { value: sunV.clone() }, uOccC: { value: occC }, uOccR: { value: occR },
      cRoot: { value: col('#345e2a') }, cMid: { value: col('#78b24a') }, cTip: { value: col('#c0e872') }, cDry: { value: col('#c2d86c') },
      cDark: { value: col('#336a2c') }, cSky: { value: col('#a4c4b0') }, cSunC: { value: col('#fff2d4') }, uSunI: { value: 1.25 }, uSkyI: { value: 0.75 },
    };
    const OCC_GLSL = `
      uniform vec4 uOccC[8]; uniform vec4 uOccR[8];
      float occShadow(vec3 p, vec3 L){ float sh = 1.0;
        for (int i = 0; i < 8; i++){ vec3 R = uOccR[i].xyz; vec3 o = (p - uOccC[i].xyz) / R; vec3 d = L / R;
          float tt = max(-dot(o, d) / dot(d, d), 0.0); float dist = length(o + d * tt);
          sh *= 1.0 - uOccR[i].w * (1.0 - smoothstep(0.72, 1.12, dist)); }
        return sh; }
      float occAO(vec3 p){ float a = 1.0;
        for (int i = 0; i < 8; i++){ vec3 o = (p - uOccC[i].xyz) / uOccR[i].xyz; o.y *= 0.5;
          a *= 1.0 - uOccC[i].w * (1.0 - smoothstep(0.92, 1.65, length(o))); }
        return a; }
      // sunlit clearing: framing foliage shades the frame edges, drifting leaf dapple breaks the light
      float canopy(vec3 p, float time){
        float sx = p.x / max(-p.z * ${TH.toFixed(4)}, 0.5);
        float pool = 1.0 - smoothstep(0.42, 0.95, abs(sx - 0.02 + 0.08 * p.z / 6.0));
        pool *= mix(1.0, 0.75, smoothstep(6.0, 8.5, -p.z));
        float dap = smoothstep(0.38, 0.6, fbm(p.xz * vec2(1.1, 0.8) + vec2(time * 0.04, 0.0) + 7.0));
        return mix(0.32, 1.0, clamp(pool * (0.62 + 0.45 * dap), 0.0, 1.0)); }`;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShaderMaterial({
      uniforms: GU,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uSun, cRoot, cSky, cSunC; uniform float uTime; varying vec3 vW; ${NOISE_GLSL} ${OCC_GLSL}
        void main(){ float a = occAO(vW); float s = occShadow(vW, normalize(uSun)) * canopy(vW, uTime);
          vec3 c = cRoot * (0.55 * cSky * a + 0.45 * cSunC * s) * (0.75 + 0.5 * fbm(vW.xz * 3.0));
          gl_FragColor = vec4(c, 1.); }`,
    }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -10); scene.add(ground);
    {
      const N = 56000, r = rng(21), bl = [];
      const rocksOnly = occ.slice(0, 4);
      const inRock = (x, z) => rocksOnly.some(o => ((x - o.c[0]) / o.r[0]) ** 2 + ((z - o.c[2]) / o.r[2]) ** 2 < 0.75);
      let tries = 0;
      while (bl.length < N * 8 && tries++ < N * 3) {
        const d = lerp(2.45, 9.2, Math.pow(r(), 0.85));
        const x = (r() * 2 - 1) * (TH * d * 1.05 + 0.12);
        if (inRock(x, -d)) continue;
        const cl = fbm(x * 1.6 + 3, d * 1.6);                         // clump height variation
        const hb = lerp(0.7, 1.3, cl) * lerp(1.12, 0.72, ss(3.0, 7.5, d));
        bl.push(x, 0, -d, r() * Math.PI * 2, lerp(0.12, 0.24, Math.pow(r(), 0.8)) * hb, lerp(0.03, 0.06, r()), r(), r());
      }
      scene.add(makeLitGrass(core, bl, GU, OCC_GLSL));
    }

    /* ---------------- 5. flower bushes: modelled 3D petals + leaves (instanced, lit per fragment) ---------------- */
    const FL = { lily: [], five: [], aster: [], four: [], leaf: [], strap: [] };
    const TYPES = ['lily', 'five', 'aster', 'four'];
    const LEAF_G = ['#2c6428', '#3a782e', '#4a8a36', '#5a9a40', '#28562a', '#3f7034'];
    const nT = new THREE.Vector3();
    // scatter flowers (front hemisphere of an ellipsoid bush given in pixels) plus 3D leaves in the bush body
    function bush(px, py, d, rxp, ryp, n, spec, seed, lv = 0.8, lo = {}) {
      const r = rng(seed);
      const c = S(px, py, d), rx = PX(rxp, d), ry = PX(ryp, d);
      // loose spray: stems fan out from the bush base, flower clusters at their (irregular) ends
      const spray = (k) => { const a = (r() - 0.5) * 2.5, len = Math.sqrt(lerp(0.12, 1, r())) * k;
        const x = Math.sin(a) * len * 1.08, y = Math.min(1, -0.85 + Math.cos(a) * len * 1.85 * lerp(0.75, 1.1, r())), z = lerp(-0.25, 0.85, r()) * (0.4 + 0.6 * Math.cos(a));
        return [x, y, z, Math.min(1, Math.max(0.3, 0.45 + 0.55 * len))]; };
      const pick = (lmin) => { let x, y, z, l; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 1.2 - 0.2; l = x * x + y * y + z * z; } while (l > 1 || l < lmin); l = Math.sqrt(l); return [x, y, z, l]; };
      const cl = lo.cl || 1, cs = lo.cs || 0.2; let base = null;
      for (let i = 0; i < n; i++) {
        if (i % cl === 0) base = lo.spray ? spray(1) : pick(0.12);
        let [x, y, z, l] = base;
        if (i % cl) { x += (r() - 0.5) * cs; y += (r() - 0.5) * cs * rx / ry; z += (r() - 0.5) * cs; l = Math.max(0.2, Math.min(1, Math.hypot(x, y, z))); }
        const nx = x / l, ny = y / l, nz = z / l;
        const sunF = Math.max(0, nx * sunV.x + ny * sunV.y + nz * sunV.z);
        const sp = spec[Math.floor(r() * spec.length)];
        nT.set(nx * 0.7 + (r() - 0.5) * 0.7, ny * 0.45 + 0.3 + (r() - 0.5) * 0.5, nz * 0.5 + 0.6 + (r() - 0.5) * 0.4).normalize();
        FL[TYPES[sp.t]].push({ p: [c[0] + x * rx, c[1] + y * ry, c[2] + z * rx * 0.9], s: PX(sp.s * lerp(0.75, 1.15, r()), d) * (lo.fs ?? 1),
          n: nT.toArray(), roll: r() * 6.283, c: sp.c, cc: sp.cc, th: sp.th ?? 0.3,
          sun: lerp(0.3, 1.0, ss(0.35, 0.95, l)) * (0.6 + 0.4 * sunF), ao: lerp(0.5, 1.0, l), ph: r() * 6.28 });
      }
      const nl = lo.nl ?? Math.round(n * lv), kind = lo.kind || 'leaf', cols = lo.cols || LEAF_G;
      for (let i = 0; i < nl; i++) {
        const [x, y, z, l] = lo.spray ? spray(lerp(0.35, 1, r())) : pick(0.25);
        const nx = x / l, ny = y / l, nz = z / l;
        const sunF = Math.max(0, nx * sunV.x + ny * sunV.y + nz * sunV.z);
        if (kind === 'strap') nT.set((r() - 0.5) * 0.8, 0.15 + r() * 0.3, 0.8).normalize();
        else nT.set(nx * 0.6 + (r() - 0.5) * 0.8, ny * 0.3 + 0.55 + (r() - 0.5) * 0.5, nz * 0.4 + 0.5 + (r() - 0.5) * 0.5).normalize();
        const cc = cols[Math.floor(r() * cols.length)];
        FL[kind].push({ p: [c[0] + x * rx * 0.95, c[1] + y * ry * 0.95, c[2] + z * rx * 0.85], s: PX((lo.ls || 18) * lerp(0.7, 1.25, r()), d),
          n: nT.toArray(), roll: kind === 'strap' ? (r() - 0.5) * 1.6 : r() * 6.283, c: cc, cc: '#1c3a18', th: 0,
          sun: lerp(0.25, 1.0, ss(0.4, 0.95, l)) * (0.55 + 0.45 * sunF), ao: lerp(0.4, 1.0, l), ph: r() * 6.28 });
      }
      return { c, rx, ry };
    }
    const PINK = [{ t: 1, s: 17, c: '#e47aaa', cc: '#c03c78', th: 0.5 }, { t: 1, s: 16, c: '#ee9cc2', cc: '#cc5488', th: 0.5 }, { t: 1, s: 15, c: '#d0608f', cc: '#a83068', th: 0.5 }, { t: 1, s: 14, c: '#dc6ea0', cc: '#b23c74', th: 0.5 }, { t: 1, s: 15, c: '#f2b4d0', cc: '#d0709a', th: 0.5 }];
    const YEL = [{ t: 3, s: 19, c: '#f6d42a', cc: '#d79a12', th: 0.25 }, { t: 3, s: 16, c: '#f3cf20', cc: '#d79a12', th: 0.25 }, { t: 1, s: 15, c: '#f8dc3a', cc: '#d79a12', th: 0.2 }];
    const RED = [{ t: 1, s: 13, c: '#cc1634', cc: '#780a1c', th: 0.35 }, { t: 1, s: 11, c: '#d8243e', cc: '#880c22', th: 0.35 }, { t: 3, s: 10, c: '#b41232', cc: '#6e0818', th: 0.35 }];
    const ORA = [{ t: 0, s: 44, c: '#f07a1e', cc: '#3e0a06', th: 0.95 }, { t: 0, s: 38, c: '#ee8a26', cc: '#3e0a06', th: 0.95 }, { t: 0, s: 34, c: '#e86a18', cc: '#3e0a06', th: 0.95 }];
    const WHI = [{ t: 1, s: 23, c: '#f0ead8', cc: '#cdbd8e', th: 0.3 }, { t: 1, s: 20, c: '#e6e0ca', cc: '#c0b082', th: 0.3 }];
    const PUR = [{ t: 2, s: 29, c: '#a090e2', cc: '#e8b832', th: 0 }, { t: 2, s: 25, c: '#9282d6', cc: '#e8b832', th: 0 }, { t: 2, s: 27, c: '#b0a0ea', cc: '#f0c844', th: 0 }];

    // green bodies of bushes (painted leaf foliage behind/under the modelled flowers and leaves)
    const greenBush = (list, opts) => foliage(list, { density: 5, shell: 0.5, kind: 'small', wind: 0.035, dark: '#1a3a22', mid: '#2f5e30', light: '#4f8a3e', highlight: '#86b35a', ...opts });
    greenBush([[340, 470, 7.4, 62], [285, 488, 7.2, 42], [400, 488, 7.2, 46]], { cardSize: PX(24, 7.4), seed: 31, texSeed: 4 });
    greenBush([[510, 450, 7.7, 75], [560, 470, 7.6, 60], [460, 480, 7.5, 50]], { cardSize: PX(22, 7.7), seed: 32, texSeed: 6, dark: '#132a19', mid: '#22442a', light: '#3a6a37' });
    greenBush([[700, 462, 7.9, 64], [760, 478, 7.8, 42], [640, 478, 7.8, 42]], { cardSize: PX(24, 7.9), seed: 33, texSeed: 8 });
    greenBush([[915, 400, 8.4, 85], [905, 470, 8.3, 80], [950, 320, 8.4, 55], [870, 320, 8.4, 45]], { density: 3, cardSize: PX(24, 8.4), seed: 34, texSeed: 10, dark: '#1a3420', mid: '#2c5a2e', light: '#4a8040' });
    greenBush([[1060, 190, 7.0, 30], [1100, 250, 7.0, 35], [1130, 310, 7.0, 35], [1170, 360, 7.0, 30], [1090, 330, 7.0, 25]], { density: 1.6, shell: 0.2, cardSize: PX(30, 7.0), seed: 35, texSeed: 12, dark: '#2a4a30', mid: '#4a7a50', light: '#7aa070', highlight: '#a6c79a' });
    greenBush([[870, 540, 3.0, 70], [1020, 460, 3.7, 70], [800, 580, 2.95, 40]], { density: 3.5, cardSize: PX(26, 3.6), seed: 36, texSeed: 14, dark: '#24452c', mid: '#3a6e40', light: '#5e9050' });

    bush(345, 452, 7.3, 98, 92, 480, PINK, 101, 1.5, { spray: true, ls: 15, cl: 6, cs: 0.32, cols: ['#5a9a40', '#6aa84a', '#7ab45a', '#4a8a38', '#3c7a32'] });
    const YL = { ls: 13, cl: 2, cs: 0.25, cols: ['#2e5e2a', '#3a6e30', '#4a7e38', '#24502a'] };
    bush(512, 478, 7.25, 78, 50, 90, YEL, 102, 0.45, YL);
    bush(522, 415, 7.25, 64, 45, 80, YEL, 122, 0.45, YL);
    bush(535, 365, 7.25, 36, 28, 30, YEL, 123, 0.45, YL);
    bush(705, 440, 7.8, 105, 72, 420, PINK, 103, 1.5, { spray: true, ls: 15, cl: 6, cs: 0.32, cols: ['#5a9a40', '#6aa84a', '#7ab45a', '#4a8a38', '#3c7a32'] });
    // red spire: airy column of small star-flower clusters among lit leaves
    const RL = { cl: 5, cs: 0.32, ls: 12, fs: 1.45, cols: ['#3e7a34', '#4c8a3c', '#5a9a46', '#6aa852', '#336a2e'] };
    bush(915, 452, 8.3, 88, 38, 150, RED, 113, 0.6, RL);
    bush(918, 398, 8.3, 92, 42, 180, RED, 115, 0.6, RL);
    bush(912, 342, 8.3, 82, 40, 160, RED, 114, 0.6, RL);
    bush(962, 292, 8.3, 46, 34, 80, RED, 104, 0.6, RL);
    bush(846, 312, 8.3, 30, 26, 40, RED, 118, 0.6, RL);
    bush(985, 262, 8.3, 22, 18, 15, RED, 116, 0.6, RL);
    for (let k = 0; k < 7; k++) { const t = k / 6; bush(lerp(1050, 1195, t) + (k % 2) * 20, lerp(165, 370, t), 6.9, 44, 36, 9, WHI, 120 + k, 3.0, { ls: 26, cols: ['#5e9452', '#6ea45e', '#7eb06a', '#4e8248', '#8cbc78'] }); }
    // right-hand shrub: modelled, sun-lit leaves (depth layer between the painted canopy and the framing leaves)
    const RS = { ls: 30, cols: ['#2f6a3c', '#3c7a46', '#4a8a52', '#5a9a5e', '#264f30', '#6aa66a', '#78b070'] };
    bush(1195, 290, 7.6, 120, 160, 0, [], 140, 0, { ...RS, nl: 650 });
    bush(1215, 520, 5.2, 125, 150, 0, [], 141, 0, { ...RS, nl: 650, ls: 34 });
    bush(860, 540, 2.95, 95, 75, 80, PUR, 106, 1.1, { ls: 26 });
    bush(1000, 455, 3.6, 95, 65, 72, PUR, 117, 1.3, { ls: 26 });
    bush(1085, 410, 3.6, 55, 50, 48, PUR, 107, 1.3, { ls: 26 });
    bush(790, 590, 2.9, 50, 35, 26, PUR, 112, 1.3, { ls: 26 });
    // orange day-lilies (left, with strap leaves), yellow sprinkles and small red flowers
    bush(110, 405, 3.7, 105, 140, 52, ORA, 108, 1.6, { ls: 34, cols: ['#24502a', '#2e6232', '#3a723a', '#1e4424', '#4a8240'] });
    bush(120, 525, 3.7, 80, 35, 18, ORA, 119, 1.4, { ls: 34, cols: ['#24502a', '#2e6232', '#3a723a', '#1e4424', '#4a8240'] });
    bush(50, 420, 3.8, 55, 60, 30, [{ t: 1, s: 16, c: '#f2d02a', cc: '#d8a414', th: 0.25 }], 109, 0.5);
    bush(195, 548, 3.9, 40, 12, 10, [{ t: 3, s: 12, c: '#e3392a', cc: '#a01b14', th: 0.3 }], 110, 0.5);
    bush(340, 255, 12, 25, 15, 6, [{ t: 1, s: 9, c: '#e8a59a', cc: '#c0786a', th: 0.3 }], 111, 0);
    const FU = { uTime: shared.uTime, uSun: { value: sunV.clone() }, cSun: { value: col('#fff2d6') }, cSky: { value: col('#c4e2c8') }, cGnd: { value: col('#5a8a3a') }, uSunI: { value: 0.85 }, uSkyI: { value: 0.46 } };
    for (const k of Object.keys(FL)) if (FL[k].length) scene.add(makeInstFlowers(core, flowerGeo(THREE, k), FL[k], FU));

    // overhanging canopy edges: modelled dark leaves with sunlit rims, layered over the painted canopy
    const CAN = { ls: 34, cols: ['#0f2216', '#16301e', '#1e3c26', '#2a5032', '#3c6a40'] };
    bush(130, 40, 6.2, 190, 70, 0, [], 150, 0, { ...CAN, nl: 330 });
    bush(40, 190, 6.0, 70, 110, 0, [], 151, 0, { ...CAN, nl: 160 });
    bush(950, 50, 6.4, 150, 70, 0, [], 152, 0, { ...CAN, nl: 300 });
    bush(560, -20, 6.8, 170, 30, 0, [], 153, 0, { ...CAN, nl: 140, cols: ['#1a3622', '#24462c', '#2f5838', '#3e6c44'] });
    // volumetric light: faint additive shafts crossing the mid-distance foliage
    {
      const SD = 12.5;
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(2 * TH * SD, 2 * TV * SD), new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, cS: { value: col('#cfe8b4') } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
        fragmentShader: `uniform float uTime; uniform vec3 cS; varying vec2 vUv; ${NOISE_GLSL}
          void main(){ vec2 p = vec2(vUv.x, 1.0 - vUv.y); float across = p.x + p.y * 0.38;
            float s = smoothstep(0.5, 0.9, vnoise(vec2(across * 11.0, 7.0 + uTime * 0.06))) * (0.6 + 0.4 * vnoise(vec2(across * 31.0, 2.0)));
            s *= smoothstep(0.7, 0.15, p.y) * smoothstep(0.28, 0.5, p.x) * smoothstep(0.98, 0.8, p.x);
            float g = exp(-dot((p - vec2(0.6, 0.3)) * vec2(2.4, 3.0), (p - vec2(0.6, 0.3)) * vec2(2.4, 3.0)) * 2.0);
            gl_FragColor = vec4(cS * (s * 0.075 + g * 0.05), 1.); }`,
      }));
      sh.position.set(...S(640, 360, SD)); sh.renderOrder = 5; scene.add(sh);
    }

    /* ---------------- 6. foreground framing leaves ---------------- */
    foliage([[40, 400, 4.6, 110], [150, 470, 4.6, 90], [60, 290, 4.8, 60], [90, 545, 4.3, 85], [190, 530, 4.4, 40]],
      { density: 3, cardSize: PX(60, 4.6), kind: 'broad', seed: 44, texSeed: 5, dark: '#12261a', mid: '#20432a', light: '#3f7240', highlight: '#6a9a4a', wind: 0.025, lightWrap: 0.25, shell: 0.5 });
    foliage([[80, 670, 2.6, 120], [170, 715, 2.2, 75], [20, 690, 2.2, 100], [170, 625, 2.8, 50], [80, 730, 2.1, 100]],
      { density: 3.2, cardSize: PX(70, 3.2), kind: 'broad', seed: 41, texSeed: 2, dark: '#0c1d12', mid: '#17331f', light: '#2f5a33', highlight: '#5a8a4a', wind: 0.025, lightWrap: 0.25, shell: 0.5 });
    foliage([[1235, 520, 3.4, 130], [1190, 650, 2.6, 115], [1270, 380, 3.6, 100], [1090, 690, 2.3, 60], [1250, 680, 2.3, 90], [1180, 730, 2.1, 80], [1270, 730, 2.1, 80]],
      { density: 3.2, cardSize: PX(70, 3.3), kind: 'broad', seed: 42, texSeed: 3, dark: '#0f2316', mid: '#1f4029', light: '#3f7040', highlight: '#6f9a5a', wind: 0.025, lightWrap: 0.3, shell: 0.5 });
    foliage([[820, 715, 2.1, 25], [965, 715, 2.1, 30]],
      { density: 3, cardSize: PX(50, 2.9), kind: 'broad', seed: 43, texSeed: 4, dark: '#0b1a10', mid: '#132a19', light: '#24452a', highlight: '#3a6640', wind: 0.02 });

    /* ---------------- 7. butterflies & pollen ---------------- */
    const bf = makeButterflies({ count: 9, box: [S(780, 300, 7), S(1150, 520, 6)], size: PX(14, 7), color: '#f3d34a', glow: 1.05, speed: 0.6, seed: 8 });
    scene.add(bf);
    scene.add(makeMotes({ count: 40, box: [S(200, 200, 9), S(1100, 560, 4)], size: 0.012, color: '#f7f0c0', opacity: 0.45, seed: 4, speed: 0.08 }));

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.set(...SUN).normalize();
        shared.uDapple.value = 0;
        shared.uFogMax.value = 0;
      },
    };
  },
};

/* ======================================================================= */
/* small JS noise helpers (module scope)                                   */
/* ======================================================================= */
const _h3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const _sm = (t) => t * t * (3 - 2 * t);
function vn3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = _sm(x - ix), fy = _sm(y - iy), fz = _sm(z - iz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => _h3(ix + dx, iy + dy, iz + dz);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
const fbm3 = (x, y, z) => vn3(x, y, z) * 0.5 + vn3(x * 2.03 + 5.2, y * 2.03 + 1.3, z * 2.03 + 7.1) * 0.27 + vn3(x * 4.1 + 2.7, y * 4.1 + 9.4, z * 4.1 + 3.3) * 0.15 + vn3(x * 8.3 + 1.1, y * 8.3 + 4.4, z * 8.3 + 8.8) * 0.08;
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ======================================================================= */
/* Lit grass: instanced curved blades (shot 6 approach) + rock shadows/AO   */
/* ======================================================================= */
function makeLitGrass(core, bl, U, OCC_GLSL) {
  const { THREE, NOISE_GLSL } = core;
  const n = bl.length / 8, segs = 5, pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ww = 0.5 * (1 - Math.pow(t, 1.7)) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 3.0) * 1.57));
    if (i < segs) pos.push(-ww, t, 0, ww, t, 0); else pos.push(0, 1, 0);
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
  const ig = new THREE.InstancedBufferGeometry(); ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const aO = new Float32Array(n * 4), aS = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { for (let k = 0; k < 4; k++) { aO[i * 4 + k] = bl[i * 8 + k]; aS[i * 4 + k] = bl[i * 8 + 4 + k]; } }
  ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4)); ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  ig.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aO; attribute vec4 aS; uniform float uTime; uniform vec3 uSun;
      varying vec3 vN, vW, vWd; varying float vT, vX, vP, vQ, vR, vSh, vAO;
      ${NOISE_GLSL}
      ${OCC_GLSL}
      void main(){
        float t = position.y; float h = aS.x;
        float c = cos(aO.w), s = sin(aO.w);
        vec3 Wd = vec3(c, 0., -s), Fd = vec3(s, 0., c);
        vec2 gp = aO.xz * vec2(0.45, 0.6) + vec2(-uTime * 0.9, uTime * 0.15);
        float gust = vnoise(gp) * 0.75 + vnoise(gp * 2.3 + 3.7) * 0.35;
        float flutter = sin(uTime * 3.3 + aS.w * 31.0 + aO.x * 4.7) * 0.06 + sin(uTime * 5.1 + aS.z * 17.0) * 0.03;
        vec3 windD = normalize(vec3(1.0, 0.0, 0.15));
        float clump = vnoise(aO.xz * 2.2 + 11.0);
        vec3 bendV = Fd * (aS.z - 0.5) * 0.55 + windD * (0.04 + clump * 0.2 + gust * 0.28 + flutter) + vec3(0., 0., 0.1);
        vec3 p = aO.xyz + Wd * position.x * aS.y + vec3(0., t * h, 0.);
        vec3 off = bendV * h * t * t;
        p += off; p.y -= dot(off, off) / max(h, 0.01) * 0.45;
        vec3 tang = normalize(vec3(0., h, 0.) + 2.0 * bendV * h * t);
        vN = normalize(cross(Wd, tang)); vWd = Wd; vW = p; vT = t;
        vX = position.x * 2.0 / max(1.0 - pow(t, 1.7), 0.05);
        vP = fbm(aO.xz * 0.45 + 3.0); vQ = clump * 0.7 + vnoise(aO.xz * 6.0 + 7.0) * 0.3; vR = aS.w;
        vSh = occShadow(p, normalize(uSun)) * canopy(p, uTime);
        vAO = occAO(aO.xyz);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform vec3 uSun, cRoot, cMid, cTip, cDry, cDark, cSky, cSunC; uniform float uSunI, uSkyI, uTime;
      varying vec3 vN, vW, vWd; varying float vT, vX, vP, vQ, vR, vSh, vAO;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN + vWd * clamp(vX, -1., 1.) * 0.6);          // folded blade: two lit/shaded halves
        if (dot(N, V) < 0.0) N = -N;
        vec3 L = normalize(uSun);
        vec3 alb = mix(cRoot, cMid, smoothstep(0.0, 0.6, vT));
        alb = mix(alb, cTip, smoothstep(0.5, 1.0, vT) * (0.35 + 0.65 * vR));
        alb = mix(alb, cDry * mix(0.8, 1.05, vT), smoothstep(0.58, 0.8, vP) * 0.4);
        alb = mix(alb, cDark, smoothstep(0.42, 0.22, vP) * 0.45);
        alb *= 0.7 + 0.55 * vQ;
        alb = mix(alb, cDark * 0.85, step(0.88, vR) * 0.55);              // scattered darker blue-green blades
        float ndl = dot(N, L);
        float diff = max(ndl, 0.0) * 0.8 + 0.2 * (ndl * 0.5 + 0.5);
        float trans = max(-ndl, 0.0) * 0.45 * smoothstep(0.2, 0.9, vT);
        float ao = mix(0.28, 1.0, smoothstep(0.0, 0.75, vT)) * vAO;
        float self = mix(0.5, 1.0, smoothstep(0.05, 0.8, vT));
        vec3 sunC = cSunC * uSunI * vSh * self * mix(1.0, vAO, 0.6);
        vec3 c = alb * (sunC * (diff + trans * vec3(1.05, 1.2, 0.55)) + cSky * uSkyI * ao);
        vec3 H = normalize(L + V);
        c += sunC * pow(max(dot(N, H), 0.0), 20.0) * 0.1 * smoothstep(0.4, 1.0, vT);
        c += cTip * sunC * smoothstep(0.72, 1.0, vT) * (0.12 + 0.2 * max(ndl, 0.0)) * (0.5 + 0.5 * vR);   // sunlit tips
        c *= 1.0 + 0.14 * smoothstep(-4.6, -2.6, vW.z);                                                  // brighter lime foreground
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
}

/* ======================================================================= */
/* Modelled flowers & leaves: real petal geometry, instanced, lit per pixel */
/* ======================================================================= */
// local flower faces +Z with unit diameter; aK = (radial t along petal, centre flag, across-petal s)
function flowerGeo(THREE, kind) {
  const pos = [], kk = [], idx = [];
  const petal = (ang, len, wid, { segL = 4, segW = 2, cup = 0.3, curl = 0, shape = 'round', r0 = 0.02, fold = 0, lift = 0 } = {}) => {
    const b = pos.length / 3, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i <= segL; i++) {
      const t = i / segL;
      const pf = shape === 'round' ? Math.sin(Math.PI * Math.pow(t, 0.7)) * (0.6 + 0.4 * t) + 0.1 * (1 - t)
        : shape === 'point' ? Math.sin(Math.PI * Math.pow(t, 0.85)) + 0.06 * (1 - t)
        : Math.min(1, 0.3 + 3 * t) * (t < 0.75 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2)));
      for (let j = 0; j <= segW; j++) {
        const s = j / segW * 2 - 1, x = s * wid * 0.5 * pf, rr = r0 + t * len;
        const z = lift + (cup * t * t + curl * t * t * t * t) * len + s * s * wid * 0.16 * pf - fold * Math.abs(s) * wid * 0.5 * pf;
        pos.push(rr * ca - x * sa, rr * sa + x * ca, z); kk.push(t, 0, s);
      }
    }
    for (let i = 0; i < segL; i++) for (let j = 0; j < segW; j++) { const a = b + i * (segW + 1) + j, c = a + segW + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  };
  const centre = (rc, hc, n = 8) => {
    const b = pos.length / 3; pos.push(0, 0, hc); kk.push(0, 1, 0);
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; pos.push(Math.cos(a) * rc * 0.6, Math.sin(a) * rc * 0.6, hc * 0.78); kk.push(0, 1, 0); }
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; pos.push(Math.cos(a) * rc, Math.sin(a) * rc, 0.0); kk.push(0, 1, 0); }
    for (let k = 0; k < n; k++) { const k1 = (k + 1) % n; idx.push(b, b + 1 + k, b + 1 + k1, b + 1 + k, b + 1 + n + k, b + 1 + k1, b + 1 + k1, b + 1 + n + k, b + 1 + n + k1); }
  };
  if (kind === 'lily') { for (let k = 0; k < 5; k++) petal(k * Math.PI * 0.4 + 0.3, 0.44, 0.46, { cup: 0.18, curl: -0.12, segL: 4, segW: 3, r0: 0.04 }); centre(0.1, 0.05, 8); }   // black-eyed (Thunbergia-like) flower
  else if (kind === 'five') { for (let k = 0; k < 5; k++) petal(k * Math.PI * 0.4, 0.42, 0.36, { cup: 0.22, segL: 3 }); centre(0.07, 0.03, 6); }
  else if (kind === 'four') { for (let k = 0; k < 4; k++) petal(k * Math.PI * 0.5 + 0.4, 0.42, 0.42, { cup: 0.3, segL: 3 }); centre(0.06, 0.03, 6); }
  else if (kind === 'aster') { for (let k = 0; k < 16; k++) petal(k * Math.PI / 8 + (k % 2) * 0.08, k % 2 ? 0.42 : 0.46, 0.085, { shape: 'strap', cup: 0.08, segL: 4, segW: 1, r0: 0.06, lift: (k % 2) * 0.012 }); centre(0.13, 0.07, 10); }
  else if (kind === 'leaf') petal(Math.PI / 2, 1.0, 0.42, { shape: 'point', cup: -0.25, segL: 5, r0: 0, fold: 0.35 });
  else if (kind === 'strap') petal(Math.PI / 2, 1.0, 0.09, { shape: 'point', cup: -0.4, segL: 6, segW: 1, r0: 0, fold: 0.2 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function makeInstFlowers(core, geo, list, U) {
  const { THREE, col } = core;
  const n = list.length, ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index; for (const k of ['position', 'normal', 'aK']) ig.setAttribute(k, geo.attributes[k]);
  const aP = new Float32Array(n * 4), aN = new Float32Array(n * 4), aC = new Float32Array(n * 3), aCC = new Float32Array(n * 3), aT = new Float32Array(n * 4);
  list.forEach((f, i) => {
    aP.set([...f.p, f.s], i * 4); aN.set([...f.n, f.roll], i * 4);
    const c = col(f.c), cc = col(f.cc); aC.set([c.r, c.g, c.b], i * 3); aCC.set([cc.r, cc.g, cc.b], i * 3);
    aT.set([f.sun, f.ao, f.ph, f.th], i * 4);
  });
  ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4)); ig.setAttribute('aN', new THREE.InstancedBufferAttribute(aN, 4));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3)); ig.setAttribute('aCC', new THREE.InstancedBufferAttribute(aCC, 3));
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  ig.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 aK; attribute vec4 aP, aN, aT; attribute vec3 aC, aCC; uniform float uTime;
      varying vec3 vW, vN, vC, vCC, vK; varying float vSun, vAO, vTh;
      void main(){
        float sw = sin(uTime * 1.5 + aT.z + aP.x * 0.7) * 0.6 + sin(uTime * 2.6 + aT.z * 1.9) * 0.4;
        vec3 n = normalize(aN.xyz + vec3(sw * 0.12, 0.0, sw * 0.05));
        vec3 up = abs(n.y) > 0.95 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
        vec3 tx = normalize(cross(up, n)), ty = cross(n, tx);
        float c = cos(aN.w), s = sin(aN.w);
        mat3 B = mat3(tx * c + ty * s, -tx * s + ty * c, n);
        vec3 p = aP.xyz + B * position * aP.w;
        p.x += sw * aP.w * 0.1; p.y += abs(sw) * aP.w * 0.025;
        vN = B * normal; vW = p; vC = aC; vCC = aCC; vK = aK; vSun = aT.x; vAO = aT.y; vTh = aT.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform vec3 uSun, cSun, cSky, cGnd; uniform float uSunI, uSkyI;
      varying vec3 vW, vN, vC, vCC, vK; varying float vSun, vAO, vTh;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
        float bk = step(dot(N, V), 0.0); N = mix(N, -N, bk);
        vec3 L = normalize(uSun);
        float t = vK.x;
        vec3 alb = mix(vC * vec3(0.8, 0.72, 0.78), vC, smoothstep(0.0, 0.6, t));
        alb = mix(alb, min(vC * 1.12 + 0.02, vec3(1.)), smoothstep(0.7, 1.0, t) * 0.6);
        alb = mix(alb, vCC, (1.0 - smoothstep(0.05, 0.38, t)) * vTh);
        alb *= 1.0 + 0.14 * (1.0 - smoothstep(0.0, 0.2, abs(vK.z))) * step(0.001, t);   // midrib / vein sheen
        alb = mix(alb, vCC, vK.y);
        float ndl = dot(N, L);
        float diff = max(ndl, 0.0) * 0.8 + 0.2 * (ndl * 0.5 + 0.5);
        float trans = max(-ndl, 0.0) * 0.6;
        vec3 amb = mix(cGnd, cSky, 0.55 + 0.45 * N.y);
        vec3 c = alb * (cSun * uSunI * vSun * (diff + trans * vec3(1.1, 1.0, 0.75)) + amb * uSkyI * vAO);
        vec3 H = normalize(L + V); c += cSun * uSunI * vSun * pow(max(dot(N, H), 0.0), 24.0) * 0.06;
        c *= 1.0 - 0.1 * bk;
        gl_FragColor = vec4(c, 1.);
      }`,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
}

/* ======================================================================= */
/* Boulders: displaced, faceted geometry with baked AO/moss vertex colours  */
/* ======================================================================= */
const ROCK_PAL = {
  grey: { base: '#7f7c77', light: ['#9d9a93', '#8f8d88', '#aaa79e', '#94918a'], dark: ['#5f5c58', '#4e4c49', '#6c6964', '#585a5c'], lichen: '#bdbb9c' },
  brown: { base: '#8b7d63', light: ['#a99b7f', '#9d9075', '#b6a98b', '#a09070'], dark: ['#6b5d46', '#5b4d39', '#786a52', '#62584a'], lichen: '#c4bc94' },
};
function rockTexSet(core, seed, P) {
  const { rng, lerp } = core;
  return texSet(512, 512, (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = P.base; g.fillRect(0, 0, w, h);
    const wrap = (x, y, rad, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox > -rad && x + ox < w + rad && y + oy > -rad && y + oy < h + rad) { g.save(); g.translate(x + ox, y + oy); fn(); g.restore(); } } };
    const pickC = () => (r() < 0.45 ? P.dark : P.light)[Math.floor(r() * 4)];
    // large soft value blotches
    g.filter = 'blur(18px)';
    for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, rad = lerp(30, 90, r()); g.globalAlpha = 0.35; g.fillStyle = pickC();
      wrap(x, y, rad * 1.5, () => { g.beginPath(); g.ellipse(0, 0, rad, rad * lerp(0.5, 1, r()), r() * 3, 0, Math.PI * 2); g.fill(); }); }
    g.filter = 'none';
    // angular painted facets (the reference's chunky, mottled rock surface)
    for (let i = 0; i < 800; i++) {
      const x = r() * w, y = r() * h, sz = lerp(8, 52, Math.pow(r(), 1.4)); g.globalAlpha = lerp(0.35, 0.85, r()); g.fillStyle = pickC();
      const nv = 4 + Math.floor(r() * 3), a0 = r() * 6.28, rs = []; for (let k = 0; k < nv; k++) rs.push(lerp(0.5, 1, r()));
      wrap(x, y, sz, () => { g.beginPath(); for (let k = 0; k < nv; k++) { const a = a0 + k / nv * 6.283; g.lineTo(Math.cos(a) * sz * rs[k], Math.sin(a) * sz * rs[k] * 0.7); } g.closePath(); g.fill(); });
    }
    // cracks with a lit lip
    for (let i = 0; i < 24; i++) {
      let x = r() * w, y = r() * h, a = r() * 6.28; const pts = [[x, y]];
      for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 1.2; const l = lerp(8, 26, r()); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
      const lw = lerp(0.8, 2.4, r());
      for (const [off, st] of [[1.6, 'rgba(210,205,192,0.28)'], [0, 'rgba(34,30,26,0.6)']]) {
        g.globalAlpha = 1; g.strokeStyle = st; g.lineWidth = lw;
        g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + off, py + off) : g.moveTo(px + off, py + off)); g.stroke();
      }
    }
    // speckle grain + lichen spots
    for (let i = 0; i < 3000; i++) { g.globalAlpha = 0.3; g.fillStyle = r() < 0.5 ? '#2e2c29' : '#c8c4b8'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
    for (let i = 0; i < 45; i++) { const x = r() * w, y = r() * h; g.fillStyle = P.lichen;
      for (let k = 0; k < 12; k++) { g.globalAlpha = lerp(0.25, 0.55, r()); g.beginPath(); g.arc(x + (r() - 0.5) * 18, y + (r() - 0.5) * 14, lerp(1, 3.5, r()), 0, 6.3); g.fill(); } }
    g.globalAlpha = 1;
  }, { normalStrength: 2.6, roughBase: 0.84, roughVar: 0.3 });
}

function makeRock(core, { w, h, seed, moss = 0.2 }) {
  const { THREE, rng, lerp } = core;
  const r = rng(seed * 13 + 5);
  let geo = new THREE.IcosahedronGeometry(1, 5);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position, v = new THREE.Vector3(), pn = new THREE.Vector3();
  const o = [r() * 50, r() * 50, r() * 50];
  const planes = [];
  for (let k = 0; k < 8; k++) { const a = r() * Math.PI * 2, e = lerp(-0.1, 1.2, r()); planes.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), lerp(0.8, 0.96, r())]); }
  const cav = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.set(Math.sign(v.x) * Math.abs(v.x) ** 0.8, Math.sign(v.y) * Math.abs(v.y) ** 0.62, Math.sign(v.z) * Math.abs(v.z) ** 0.8);   // squarer, loaf-like dome
    const lo = (fbm3(v.x * 1.1 + o[0], v.y * 1.1 + o[1], v.z * 1.1 + o[2]) - 0.5) * 0.24;
    const hi = (fbm3(v.x * 4.5 + o[1], v.y * 4.5 + o[2], v.z * 4.5 + o[0]) - 0.5) * 0.09;
    v.multiplyScalar(1 + lo + hi);
    for (const [px, py, pz, pd] of planes) { const dd = v.x * px + v.y * py + v.z * pz; if (dd > pd) v.addScaledVector(pn.set(px, py, pz), -(dd - pd) * 0.55); }
    if (v.y < 0) v.y *= 0.3;
    pos.setXYZ(i, v.x, v.y, v.z); cav[i] = hi;
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, cols = new Float32Array(pos.count * 3), uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv[i * 2] = (v.x * w * 0.5 + v.z * w * 0.2) * 1.6 + seed * 0.37; uv[i * 2 + 1] = (v.y * h + v.z * w * 0.22) * 1.6 + seed * 0.21;
    const ao = lerp(0.32, 1.0, sst(-0.04, 0.42, v.y)) * Math.min(1.08, Math.max(0.6, 1 + cav[i] * 5));
    const mz = moss * sst(0.35, 0.85, nrm.getY(i)) * sst(0.42, 0.62, fbm3(v.x * 3 + 9, v.y * 3, v.z * 3));
    const gb = 1 - sst(-0.04, 0.3, v.y);                                    // green bounce from the lawn at the base
    cols[i * 3] = ao * lerp(1, 0.62, mz) * lerp(1, 0.86, gb);
    cols[i * 3 + 1] = ao * lerp(1, 0.86, mz) * lerp(1, 0.95, gb);
    cols[i * 3 + 2] = ao * lerp(1, 0.36, mz) * lerp(1, 0.8, gb);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  m.scale.set(w / 2, h, w / 2 * 0.8);
  return m;
}
