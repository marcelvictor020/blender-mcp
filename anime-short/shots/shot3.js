// Shot 3 — Ghibli-style flower garden: layered painterly forest backdrop, row of flowering bushes,
// four painted boulders in bright lime grass, broad framing leaves, tiny yellow butterflies, drifting pollen.
// Static eye-level camera. Most elements are placed by reference-frame pixel coords + view distance.

const FOV = 40, CAM_Y = 1.0;
const TV = Math.tan((FOV / 2) * Math.PI / 180), TH = TV * 16 / 9;
// pixel (1280x720 reference frame) + view distance -> world position (camera at origin looking -Z)
const S = (px, py, d) => [(px / 640 - 1) * TH * d, CAM_Y + (1 - py / 360) * TV * d, -d];
const PX = (pxLen, d) => pxLen / 360 * TV * d;             // pixel length -> world length at distance d
const GD = (py) => CAM_Y / ((py / 360 - 1) * TV);          // view distance of ground point seen at pixel row py

export default {
  duration: 3.042,
  credit: { role: '3D ANIMATOR', cx: 0.743, ry: 0.674, ny: 0.726 },
  post: { bloom: 0.18, bloomRadius: 0.5, bloomThreshold: 0.9, exposure: 1.05, contrast: 1.03, saturation: 1.04,
    lift: [0.0, 0.01, 0.015], gamma: [1, 1, 1], gain: [1.02, 1.02, 0.96], vignette: 0.14, grain: 0.025, ca: 0.0008, soft: 0.25 },

  build(core) {
    const { THREE, rng, lerp, clamp, col, shared, NOISE_GLSL, paintTexture, makeFoliage, makeButterflies, makeMotes, lightRig } = core;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1d3a26');
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 500);
    camera.position.set(0, CAM_Y, 0);
    camera.lookAt(0, CAM_Y, -1);
    const SUN = [-0.45, 0.75, 0.5];
    lightRig(scene, { sunDir: SUN, sunIntensity: 2.2, hemiIntensity: 0.8, sky: '#cfe8c0', ground: '#3a5a2a', ambient: '#2c4a40', ambientIntensity: 0.4 });

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
      uniforms: { tMap: { value: backTex }, uTime: shared.uTime },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform sampler2D tMap; uniform float uTime; varying vec2 vUv; ${NOISE_GLSL}
        void main(){ vec2 uv = vUv; float n = vnoise(uv*vec2(9.,6.) + uTime*0.25);
          uv += vec2(sin(uTime*0.9 + uv.y*14.), cos(uTime*0.7 + uv.x*11.)) * 0.0012 * (0.5+n);
          vec3 c = texture2D(tMap, uv).rgb; gl_FragColor = vec4(c, 1.); }`,
      depthWrite: false,
    });
    const BD = 40;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * TH * BD * 1.02, 2 * TV * BD * 1.02), backMat);
    back.position.set(...S(640, 360, BD)); back.renderOrder = -10; scene.add(back);

    /* ---------------- 2. near forest layers (3D foliage, swaying) ---------------- */
    const foliage = (clumpsPx, opts) => {
      const clumps = clumpsPx.map(([px, py, d, rpx]) => [...S(px, py, d), PX(rpx, d)]);
      const m = makeFoliage({ clumps, ...opts }); scene.add(m); return m;
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

    /* ---------------- 3. grass ---------------- */
    const groundMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW;
        void main(){ float pool = smoothstep(3.2, 0.4, length((vW.xz - vec2(0.0, -3.0))*vec2(0.7,1.0)));
          vec3 c = mix(vec3(0.035,0.11,0.015), vec3(0.07,0.2,0.03), pool); gl_FragColor = vec4(c,1.); }`,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -10); scene.add(ground);
    scene.add(makeStrokeGrass(core, { x0: -5, x1: 5, z0: -10, z1: -2.4, count: 50000, h: [0.09, 0.17], w: 0.04, seed: 21 }));

    /* ---------------- 4. boulders ---------------- */
    const rockDefs = [
      // [px centre, py bottom, width px, height px, base colour, light colour, dark colour, seed]
      [260, 612, 172, 112, '#625f5a', '#8c8a84', '#46443f', 1],
      [414, 636, 186, 95, '#6a5c45', '#928268', '#4a3f30', 2],
      [606, 592, 222, 116, '#62605d', '#8d8c87', '#44423f', 3],
      [905, 645, 250, 112, '#433f3a', '#5c5650', '#2e2b28', 4],
    ];
    for (const [px, pyb, wpx, hpx, cb, cl, cd, sd] of rockDefs) {
      const d = GD(pyb - 8);
      const rock = makeRock(core, { w: PX(wpx, d), h: PX(hpx, d) * 1.15, seed: sd, base: cb, light: cl, dark: cd });
      const p = S(px, pyb, d); rock.position.set(p[0], -PX(hpx, d) * 0.08, p[2]);
      scene.add(rock);
    }

    /* ---------------- 5. flower bushes ---------------- */
    const flowers = []; // {p:[x,y,z], s, c, cc, type, shade}
    const R = rng(77);
    const sunV = new THREE.Vector3(...SUN).normalize();
    // scatter flowers on the front hemisphere of an ellipsoid bush given in pixels
    function bush(px, py, d, rxp, ryp, n, spec, seed) {
      const r = rng(seed);
      const c = S(px, py, d), rx = PX(rxp, d), ry = PX(ryp, d);
      for (let i = 0; i < n; i++) {
        let x, y, z, l;
        do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 1.2 - 0.2; l = x * x + y * y + z * z; } while (l > 1 || l < 0.1);
        l = Math.sqrt(l); const nx = x / l, ny = y / l, nz = z / l;
        const sh = 0.72 + 0.4 * Math.max(0, nx * sunV.x + ny * sunV.y + nz * sunV.z) - 0.18 * (1 - l);
        const sp = spec[Math.floor(r() * spec.length)];
        flowers.push({ p: [c[0] + x * rx, c[1] + y * ry, c[2] + z * rx * 0.9], s: PX(sp.s * lerp(0.75, 1.2, r()), d), c: sp.c, cc: sp.cc, type: sp.t, shade: sh * lerp(0.85, 1.1, r()), ph: r() * 6.28 });
      }
      return { c, rx, ry };
    }
    const PINK = [{ t: 1, s: 18, c: '#e98aa8', cc: '#c94f78' }, { t: 1, s: 16, c: '#f2a7bd', cc: '#d0607f' }, { t: 1, s: 15, c: '#d66f92', cc: '#b04066' }, { t: 1, s: 14, c: '#e07a9c', cc: '#b84870' }, { t: 1, s: 15, c: '#f4bccb', cc: '#d77892' }];
    const YEL = [{ t: 1, s: 17, c: '#f6d42a', cc: '#d79a12' }, { t: 3, s: 14, c: '#f3cf20', cc: '#d79a12' }];
    const RED = [{ t: 1, s: 14, c: '#c8162a', cc: '#7a0a16' }, { t: 1, s: 12, c: '#d42232', cc: '#8a0c1a' }, { t: 3, s: 11, c: '#b0122a', cc: '#700814' }];
    const ORA = [{ t: 0, s: 44, c: '#f07a1e', cc: '#5a160a' }, { t: 0, s: 38, c: '#ec8a24', cc: '#5a160a' }, { t: 0, s: 34, c: '#e86a18', cc: '#5a160a' }];
    const WHI = [{ t: 1, s: 18, c: '#ece6d4', cc: '#cdbd8e' }, { t: 1, s: 15, c: '#e2dcc6', cc: '#c0b082' }];
    const PUR = [{ t: 2, s: 27, c: '#9c94e0', cc: '#e6c23a' }, { t: 2, s: 23, c: '#8c86d4', cc: '#e6c23a' }, { t: 2, s: 25, c: '#aaa2e8', cc: '#efcf48' }];

    // green bodies of bushes (leaf foliage under the flowers)
    const greenBush = (list, opts) => foliage(list, { density: 5, shell: 0.5, kind: 'small', wind: 0.035, dark: '#1a3a22', mid: '#2f5e30', light: '#4f8a3e', highlight: '#86b35a', ...opts });
    greenBush([[340, 455, 7.4, 80], [280, 480, 7.2, 50], [400, 480, 7.2, 55]], { cardSize: PX(24, 7.4), seed: 31, texSeed: 4 });
    greenBush([[510, 450, 7.7, 75], [560, 470, 7.6, 60], [460, 480, 7.5, 50]], { cardSize: PX(22, 7.7), seed: 32, texSeed: 6, dark: '#132a19', mid: '#22442a', light: '#3a6a37' });
    greenBush([[700, 445, 7.9, 85], [760, 470, 7.8, 50], [640, 470, 7.8, 50]], { cardSize: PX(24, 7.9), seed: 33, texSeed: 8 });
    greenBush([[915, 400, 8.4, 85], [905, 470, 8.3, 80], [950, 320, 8.4, 55], [870, 320, 8.4, 45]], { density: 3, cardSize: PX(24, 8.4), seed: 34, texSeed: 10, dark: '#1a3420', mid: '#2c5a2e', light: '#4a8040' });
    greenBush([[1060, 190, 7.0, 30], [1100, 250, 7.0, 35], [1130, 310, 7.0, 35], [1170, 360, 7.0, 30], [1090, 330, 7.0, 25]], { density: 1.6, shell: 0.2, cardSize: PX(30, 7.0), seed: 35, texSeed: 12, dark: '#2a4a30', mid: '#4a7a50', light: '#7aa070', highlight: '#a6c79a' });
    greenBush([[870, 540, 3.6, 70], [1020, 460, 3.7, 70], [800, 580, 3.4, 40]], { density: 3.5, cardSize: PX(26, 3.6), seed: 36, texSeed: 14, dark: '#24452c', mid: '#3a6e40', light: '#5e9050' });

    bush(345, 455, 7.3, 90, 82, 380, PINK, 101);
    bush(515, 440, 7.6, 90, 100, 65, YEL, 102);
    bush(705, 440, 7.8, 100, 64, 330, PINK, 103);
    bush(875, 290, 8.3, 50, 35, 60, RED, 104);
    bush(960, 300, 8.3, 50, 45, 70, RED, 114);
    bush(900, 365, 8.3, 85, 50, 120, RED, 115);
    bush(955, 425, 8.3, 80, 50, 120, RED, 113);
    bush(890, 470, 8.3, 85, 35, 80, RED, 118);
    bush(995, 380, 8.3, 30, 60, 40, RED, 116);
    for (let k = 0; k < 7; k++) { const t = k / 6; bush(lerp(1050, 1195, t) + (k % 2) * 20, lerp(165, 370, t), 6.9, 42, 34, 10, WHI, 120 + k); }
    bush(860, 535, 3.5, 95, 70, 85, PUR, 106);
    bush(1010, 450, 3.6, 100, 70, 85, PUR, 117);
    bush(1080, 410, 3.6, 60, 50, 60, PUR, 107);
    bush(790, 585, 3.3, 45, 35, 35, PUR, 112);
    // orange day-lilies (left), yellow sprinkles and small red flowers
    bush(110, 405, 3.7, 105, 140, 40, ORA, 108);
    bush(120, 525, 3.7, 80, 35, 18, ORA, 119);
    bush(50, 420, 3.8, 55, 60, 30, [{ t: 1, s: 16, c: '#f2d02a', cc: '#d8a414' }], 109);
    bush(195, 548, 3.9, 40, 12, 10, [{ t: 3, s: 12, c: '#e3392a', cc: '#a01b14' }], 110);
    bush(340, 255, 12, 25, 15, 6, [{ t: 1, s: 9, c: '#e8a59a', cc: '#c0786a' }], 111);
    scene.add(makeFlowers(core, flowers));

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
/* Instanced flower sprites (canvas-painted atlas, per-instance tint)       */
/* ======================================================================= */
function flowerAtlas(core) {
  const { paintTexture, lerp } = core;
  // 4 cells (128px): 0 lily, 1 five-petal, 2 aster, 3 small cross. R = petal value, G = centre mask, A = alpha
  return paintTexture('s3_flowers', 512, 128, (g, W, H, R) => {
    g.clearRect(0, 0, W, H);
    const cell = (i, f) => { g.save(); g.translate(i * 128 + 64, 64); f(); g.restore(); };
    const petal = (len, wid, rot, v) => {
      g.save(); g.rotate(rot); g.beginPath(); g.moveTo(0, 0);
      g.quadraticCurveTo(wid, -len * 0.45, 0, -len); g.quadraticCurveTo(-wid, -len * 0.45, 0, 0);
      g.fillStyle = `rgb(${v},0,0)`; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgb(120,0,0)'; g.stroke(); g.restore();
    };
    const round = (r0, rr, rot, v) => { g.save(); g.rotate(rot); g.beginPath(); g.ellipse(0, -r0, rr * 0.8, rr, 0, 0, Math.PI * 2); g.fillStyle = `rgb(${v},0,0)`; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgb(130,0,0)'; g.stroke(); g.restore(); };
    cell(0, () => { for (let k = 0; k < 6; k++) petal(58, 22, k * Math.PI / 3 + 0.2, k % 2 ? 230 : 255); g.beginPath(); g.arc(0, 0, 13, 0, 6.3); g.fillStyle = 'rgb(120,255,0)'; g.fill(); });
    cell(1, () => { for (let k = 0; k < 5; k++) round(28, 26, k * Math.PI * 0.4, [255, 225, 240, 210, 250][k]); g.beginPath(); g.arc(0, 0, 10, 0, 6.3); g.fillStyle = 'rgb(200,255,0)'; g.fill(); });
    cell(2, () => { for (let k = 0; k < 14; k++) petal(58, 9, k * Math.PI / 7, k % 2 ? 215 : 255); g.beginPath(); g.arc(0, 0, 15, 0, 6.3); g.fillStyle = 'rgb(255,255,0)'; g.fill(); });
    cell(3, () => { for (let k = 0; k < 4; k++) round(24, 25, k * Math.PI * 0.5 + 0.4, [255, 220, 240, 200][k]); g.beginPath(); g.arc(0, 0, 9, 0, 6.3); g.fillStyle = 'rgb(180,200,0)'; g.fill(); });
  }, { srgb: false });
}

function makeFlowers(core, list) {
  const { THREE, col, shared } = core;
  const n = list.length;
  const geo = new THREE.PlaneGeometry(1, 1);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
  const aP = new Float32Array(n * 4), aC = new Float32Array(n * 3), aCC = new Float32Array(n * 3), aT = new Float32Array(n * 4);
  list.forEach((f, i) => {
    aP.set([...f.p, f.s], i * 4);
    const c = col(f.c), cc = col(f.cc);
    aC.set([c.r, c.g, c.b], i * 3); aCC.set([cc.r, cc.g, cc.b], i * 3);
    aT.set([f.type, f.shade, f.ph, (f.ph * 7.13) % 6.28], i * 4);
  });
  ig.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  ig.setAttribute('aCC', new THREE.InstancedBufferAttribute(aCC, 3));
  ig.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4));
  ig.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tA: { value: flowerAtlas(core) }, uTime: shared.uTime },
    vertexShader: `attribute vec4 aP; attribute vec3 aC; attribute vec3 aCC; attribute vec4 aT; uniform float uTime;
      varying vec2 vUv; varying vec3 vC, vCC; varying float vSh;
      void main(){
        float cellI = aT.x; vUv = vec2((uv.x + cellI) * 0.25, uv.y);
        vC = aC; vCC = aCC; vSh = aT.y;
        vec3 p = aP.xyz;
        float sw = sin(uTime*1.4 + aT.z + p.x*0.6) * 0.6 + sin(uTime*2.3 + aT.z*1.7) * 0.4;
        p.x += sw * aP.w * 0.12; p.y += abs(sw) * aP.w * 0.03;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        float a = aT.w + sw*0.15; vec2 cs = vec2(cos(a), sin(a));
        mv.xy += mat2(cs.x, cs.y, -cs.y, cs.x) * position.xy * aP.w;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D tA; varying vec2 vUv; varying vec3 vC, vCC; varying float vSh;
      void main(){ vec4 t = texture2D(tA, vUv); if (t.a < 0.5) discard;
        vec3 c = vC * mix(0.55, 1.0, smoothstep(0.4, 1.0, t.r));
        c = mix(c, vCC, t.g);
        c *= vSh;
        gl_FragColor = vec4(c, 1.); }`,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
}

/* ======================================================================= */
/* Painted boulder: displaced sphere, 3-band light + posterised patch paint */
/* ======================================================================= */
function makeRock(core, { w, h, seed, base, light, dark }) {
  const { THREE, rng, col, shared, NOISE_GLSL } = core;
  const r = rng(seed * 13 + 5);
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position; const v = new THREE.Vector3();
  const o1 = r() * 10, o2 = r() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 2.1 + o1) * Math.sin(v.y * 1.7 + o2) * Math.sin(v.z * 2.3 + o1) * 0.08 + Math.sin(v.x * 5 + v.z * 4 + o2) * 0.025;
    v.multiplyScalar(1 + n);
    if (v.y < 0) v.y *= 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: { cB: { value: col(base) }, cL: { value: col(light) }, cD: { value: col(dark) }, uSun: { value: new THREE.Vector3(0.55, 0.65, 0.5).normalize() }, uSeed: { value: seed * 3.7 } },
    vertexShader: `varying vec3 vN, vO; void main(){ vO = position; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 cB, cL, cD, uSun; uniform float uSeed; varying vec3 vN, vO; ${NOISE_GLSL}
      vec2 vor(vec3 p){ vec3 i = floor(p), f = fract(p); float md = 9.; float id = 0.;
        for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){ vec3 g = vec3(x,y,z);
          vec3 o = vec3(hash13(i+g), hash13(i+g+17.3), hash13(i+g+41.1));
          float d = length(g + o - f); if (d < md) { md = d; id = hash13(i+g+uSeed); } }
        return vec2(md, id); }
      void main(){
        float ndl = dot(normalize(vN), normalize(uSun));
        vec3 q = vO * vec3(1.0, 1.6, 1.0) + fbm(vO.xy*2.0+uSeed)*0.25;
        vec2 v1 = vor(q * 3.2 + uSeed);
        vec2 v2 = vor(q * 6.5 + uSeed*1.7);
        float l = ndl*0.45 + 0.5 + (v1.y-0.5)*0.3 + (v2.y-0.5)*0.16;
        l -= smoothstep(0.1, -0.3, vO.y) * 0.25;
        vec3 c = mix(cD, cB, smoothstep(0.30, 0.42, l));
        c = mix(c, cL, smoothstep(0.72, 0.82, l));
        c *= 0.94 + 0.12 * hash13(floor(q*9.0) + uSeed);
        c = mix(c, c*vec3(0.8,0.95,0.75), smoothstep(0.0, -0.3, vO.y)); // grass bounce at the base
        gl_FragColor = vec4(c, 1.); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(w / 2, h, w / 2 * 0.8);
  return m;
}

/* ======================================================================= */
/* Painterly stroke grass: wide tapered blades, lighter pool in the centre  */
/* ======================================================================= */
function makeStrokeGrass(core, o) {
  const { THREE, rng, lerp, clamp, col, shared, NOISE_GLSL } = core;
  const { x0, x1, z0, z1, count, h, w, seed, dk = '#22461a', md = '#3c7a28', lt = '#5a9634', hi = '#82b54c' } = o;
  const r = rng(seed);
  const segs = 4, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, ww = (1 - Math.pow(t, 1.3)) * 0.5;
    if (i < segs) { pos.push(-ww, t, 0, ww, t, 0); uvs.push(0, t, 1, t); } else { pos.push(0, 1, 0); uvs.push(0.5, 1); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
  const ig = new THREE.InstancedBufferGeometry();
  ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const aO = new Float32Array(count * 4), aS = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    // denser near the camera so the foreground reads as a carpet
    const zt = Math.pow(r(), 0.8);
    const pz = lerp(z1, z0, zt), px = (r() * 2 - 1) * (0.72 * -pz + 0.3) + (x0 + x1) * 0.5;
    aO.set([px, 0, pz, (r() - 0.5) * 1.2], i * 4);
    const nf = lerp(1.9, 0.5, clamp((-pz - 2.4) / 4, 0, 1));
    aS.set([lerp(h[0], h[1], r()) * nf, w * lerp(0.7, 1.4, r()) * Math.sqrt(nf), r(), r()], i * 4);
  }
  ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4));
  ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
  ig.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, cDk: { value: col(dk) }, cMd: { value: col(md) }, cLt: { value: col(lt) }, cHi: { value: col(hi) } },
    vertexShader: `attribute vec4 aO; attribute vec4 aS; uniform float uTime; varying float vT, vR, vPool, vP, vFar; ${NOISE_GLSL}
      void main(){
        float t = position.y; vT = t; vR = aS.z;
        vec3 p = vec3(position.x * aS.y, t * aS.x, 0.);
        float c = cos(aO.w), s = sin(aO.w); p = vec3(p.x*c, p.y, p.x*s);
        float wn = vnoise(aO.xz*0.6 + vec2(uTime*0.6, uTime*0.2));
        float sway = (wn - 0.45) * 0.35 + sin(uTime*2.0 + aO.x*1.3 + aO.z*0.9) * 0.06;
        vec2 dir = vec2(1.0, 0.2) * sway + vec2(aS.z-0.5, aS.w-0.5) * 0.5 + vec2(0.12, 0.0);
        p.xz += dir * t * t * aS.x; p.y -= length(dir) * t * t * aS.x * 0.25;
        vec3 wp = aO.xyz + p;
        vPool = smoothstep(3.2, 0.4, length((aO.xz - vec2(0.0, -3.0))*vec2(0.7,1.0)));
        vP = fbm(aO.xz*0.9); vFar = smoothstep(3.2, 7.0, -aO.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.);
      }`,
    fragmentShader: `varying float vT, vR, vPool, vP, vFar; uniform vec3 cDk, cMd, cLt, cHi;
      void main(){
        vec3 dk = cDk, md = cMd, lt = cLt, hi = cHi;
        float l = vT*0.7 + (vR-0.5)*0.4 + (vPool-0.5)*0.5 + (vP-0.5)*0.5 - vFar*0.22;
        vec3 c = mix(dk, md, smoothstep(-0.05, 0.25, l));
        c = mix(c, lt, smoothstep(0.35, 0.6, l));
        c = mix(c, hi, smoothstep(0.85, 1.05, l));
        gl_FragColor = vec4(c, 1.);
      }`,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(ig, mat); m.frustumCulled = false; return m;
}
