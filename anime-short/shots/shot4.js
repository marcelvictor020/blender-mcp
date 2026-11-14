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
    lightRig(scene, { sunDir: SUN, sunColor: '#fff0d8', sunIntensity: 2.2, sky: '#9fd0e8', ground: '#6a8a4a', hemiIntensity: 0.9, ambient: '#3a5070', ambientIntensity: 0.3 });
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
            d += (fbm(q * 2.6 + uSeed + vec2(uTime * 0.003, 0.)) - 0.5) * 0.75 + (vnoise(q * 12. + uSeed * 3.) - 0.5) * 0.2;
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
            float rim = smoothstep(0.3, 0.04, d) * smoothstep(0.4, 0.85, up) * smoothstep(-0.05, 0.25, p.y);
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
      [250, 205, 50], [258, 290, 55], [330, 155, 46], [392, 112, 44], [440, 170, 50], [370, 250, 70], [300, 345, 55],
      [535, 175, 48], [612, 168, 50], [672, 150, 42], [724, 182, 40], [690, 245, 55], [600, 275, 70],
      [480, 300, 70], [420, 345, 70], [748, 262, 34], [235, 255, 44],
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

    /* ---------------- farmhouse: painted card (lighting painted in) ---------------- */
    const HX0 = 780, HY0 = 225, HX1 = 1280, HY1 = 580, HS = 2;
    const houseTex = paintTexture('s4_house_v5', (HX1 - HX0) * HS, (HY1 - HY0) * HS, (g, W, H, r) => {
      g.save(); g.scale(HS, HS); g.translate(-HX0, -HY0);
      const path = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
      const fillPoly = (pts, fill) => { path(pts); g.fillStyle = fill; g.fill(); };
      const vgrad = (y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
      const planks = (x0, y0, x1, y1, base, line, step = 8, jitter = 0.12) => {
        g.fillStyle = base; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        for (let x = x0; x < x1; x += step) {
          const v = (r() - 0.5) * jitter;
          g.fillStyle = v > 0 ? `rgba(255,230,190,${v})` : `rgba(20,10,0,${-v})`; g.fillRect(x, y0, step, y1 - y0);
          g.fillStyle = line; g.fillRect(x, y0, 1, y1 - y0);
        }
      };
      // kawara tile courses: each tile a rounded scallop with a dark lower lip and a lit crown
      const tiles = (pts, base, rowH, colW, lineA, slope = 0) => {
        g.save(); path(pts); g.clip();
        g.fillStyle = base; g.fillRect(HX0, HY0, HX1 - HX0, HY1 - HY0);
        let k = 0;
        for (let y = HY0; y < HY1; y += rowH, k++) {
          for (let x = HX0 - colW + (k % 2) * colW * 0.5; x < HX1 + colW; x += colW) {
            const xx = x + slope * (y - HY0);
            g.beginPath(); g.ellipse(xx, y + rowH * 0.15, colW * 0.5, rowH * 0.85, 0, 0, Math.PI);
            g.strokeStyle = `rgba(40,34,30,${lineA})`; g.lineWidth = 1.1; g.stroke();
            g.beginPath(); g.ellipse(xx, y + rowH * 0.05, colW * 0.3, rowH * 0.45, 0, Math.PI * 1.1, Math.PI * 1.9);
            g.strokeStyle = `rgba(255,245,228,${lineA * 0.45})`; g.lineWidth = 0.9; g.stroke();
          }
          g.fillStyle = `rgba(30,26,22,${lineA * 0.35})`; g.fillRect(HX0, y + rowH - 1.2, HX1 - HX0, 1.2);
        }
        g.restore();
      };
      // --- recess between buildings (deep shade)
      fillPoly([[985, 350], [1100, 350], [1100, 565], [985, 565]], '#1c1612');
      // --- building A: front wall
      g.fillStyle = vgrad(350, 400, [[0, '#33261c'], [1, '#6e5a44']]); g.fillRect(848, 350, 152, 50);
      planks(848, 403, 1000, 518, '#56402e', 'rgba(50,34,22,0.8)', 8);
      g.fillStyle = 'rgba(255,220,170,0.10)'; g.fillRect(848, 403, 70, 115);
      g.fillStyle = '#58412e'; g.fillRect(848, 398, 152, 6);
      g.fillStyle = '#4a3828'; g.fillRect(848, 455, 152, 3);
      // shadow of building B's roof across A
      fillPoly([[888, 518], [978, 436], [1000, 426], [1000, 520]], 'rgba(30,22,18,0.82)');
      g.fillStyle = '#c4a47e'; g.fillRect(848, 352, 7, 166);      // corner post (lit)
      g.fillStyle = '#7d6248'; g.fillRect(986, 352, 8, 166);
      // building A: left end wall under the roof overhang
      g.fillStyle = vgrad(352, 420, [[0, '#3a2c20'], [1, '#8a7458']]); g.fillRect(805, 352, 43, 66);
      planks(805, 418, 848, 518, '#6e5640', 'rgba(60,40,26,0.7)', 7);
      // stone base
      g.fillStyle = '#9d8d80'; g.fillRect(802, 516, 200, 40);
      for (let i = 0; i < 70; i++) {
        const x = 802 + r() * 196, y = 516 + r() * 36, w = 8 + r() * 14, h = 6 + r() * 8;
        g.fillStyle = `rgb(${150 + r() * 50 | 0},${135 + r() * 45 | 0},${120 + r() * 40 | 0})`;
        g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(70,60,52,0.7)'; g.lineWidth = 0.8; g.stroke();
      }
      g.fillStyle = 'rgba(40,30,25,0.35)'; g.fillRect(802, 516, 200, 5);
      // building A roof
      const roofA = [[862, 241], [1066, 239], [1108, 312], [1100, 350], [840, 346], [801, 353], [818, 326], [838, 296], [852, 266]];
      g.save(); path(roofA); g.clip();
      g.fillStyle = (() => { const gr = g.createLinearGradient(860, 240, 1100, 340); gr.addColorStop(0, '#e6caa8'); gr.addColorStop(0.45, '#bca88c'); gr.addColorStop(1, '#978874'); return gr; })();
      g.fillRect(HX0, HY0, 500, 200);
      g.restore();
      tiles(roofA, 'rgba(0,0,0,0)', 7.5, 9, 0.7, -0.25);
      g.fillStyle = 'rgba(255,236,210,0.18)'; fillPoly([[862, 241], [960, 240], [930, 300], [850, 300]], 'rgba(255,236,210,0.16)');
      // eave tile-ends band
      g.fillStyle = '#6b655a'; fillPoly([[806, 345], [1102, 343], [1100, 354], [804, 356]], '#6b655a');
      for (let x = 808; x < 1100; x += 8) { g.fillStyle = 'rgba(190,180,165,0.7)'; g.beginPath(); g.arc(x, 350, 2.4, 0, 7); g.fill(); }
      // ridge cap
      fillPoly([[860, 236], [1068, 234], [1068, 244], [860, 246]], '#857b6e');
      g.fillStyle = 'rgba(240,225,205,0.55)'; g.fillRect(860, 236, 208, 2.5);
      // bargeboard (curved, lit)
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(862, 238); g.quadraticCurveTo(840, 300, 800, 352); g.strokeStyle = '#6a4a30'; g.lineWidth = 11; g.stroke();
      g.beginPath(); g.moveTo(864, 236); g.quadraticCurveTo(843, 297, 803, 348); g.strokeStyle = '#c49a6c'; g.lineWidth = 6; g.stroke();
      g.beginPath(); g.moveTo(1066, 239); g.lineTo(1108, 312); g.strokeStyle = '#6e6458'; g.lineWidth = 3; g.stroke();
      // --- building B
      // wall under pent roof
      planks(1092, 386, 1280, 566, '#3a2c20', 'rgba(40,28,18,0.85)', 7);
      g.fillStyle = '#241c16'; g.fillRect(1092, 386, 188, 60);
      for (let x = 1100; x < 1250; x += 30) { g.fillStyle = 'rgba(52,40,30,0.8)'; g.fillRect(x, 392, 24, 48); }
      g.fillStyle = vgrad(386, 430, [[0, 'rgba(10,8,6,0.75)'], [1, 'rgba(10,8,6,0)']]); g.fillRect(1092, 386, 188, 44);
      g.fillStyle = '#7e664c'; g.fillRect(1092, 446, 188, 6);
      g.fillStyle = '#c8a87e'; g.fillRect(1246, 386, 10, 180);
      g.fillStyle = '#7a6248'; g.fillRect(1090, 386, 8, 180);
      g.fillStyle = '#8a6d50'; g.fillRect(1172, 386, 6, 180);
      g.fillStyle = 'rgba(20,14,10,0.5)'; g.fillRect(1098, 452, 148, 114);
      // gable triangle (planks, warm lit)
      g.save(); path([[1153, 262], [1092, 340], [1218, 342]]); g.clip();
      planks(1090, 258, 1220, 345, '#7c5c3e', 'rgba(45,30,18,0.8)', 6);
      g.fillStyle = vgrad(262, 300, [[0, 'rgba(20,12,8,0.6)'], [1, 'rgba(20,12,8,0)']]); g.fillRect(1090, 258, 130, 45);
      g.restore();
      // right roof surface of B
      const roofB = [[1155, 256], [1282, 247], [1282, 344], [1219, 343]];
      g.save(); path(roofB); g.clip();
      g.fillStyle = (() => { const gr = g.createLinearGradient(1160, 250, 1280, 340); gr.addColorStop(0, '#c8b496'); gr.addColorStop(1, '#a0907a'); return gr; })();
      g.fillRect(1100, 240, 190, 110); g.restore();
      tiles(roofB, 'rgba(0,0,0,0)', 7, 8.5, 0.7, 0.3);
      // B bargeboards
      g.beginPath(); g.moveTo(1153, 258); g.lineTo(1086, 343); g.strokeStyle = '#5e4630'; g.lineWidth = 9; g.stroke();
      g.beginPath(); g.moveTo(1154, 257); g.lineTo(1089, 340); g.strokeStyle = '#ae8c64'; g.lineWidth = 5; g.stroke();
      g.beginPath(); g.moveTo(1153, 258); g.lineTo(1219, 344); g.strokeStyle = '#8c6e50'; g.lineWidth = 5; g.stroke();
      fillPoly([[1150, 252], [1158, 252], [1158, 262], [1150, 262]], '#7a6e60');
      // pent roof (hisashi) across B, wrapping left
      const pent = [[1006, 347], [1282, 339], [1282, 384], [990, 389]];
      g.save(); path(pent); g.clip();
      g.fillStyle = vgrad(340, 389, [[0, '#a69680'], [1, '#7a6e60']]); g.fillRect(980, 335, 310, 60); g.restore();
      tiles(pent, 'rgba(0,0,0,0)', 6.5, 8, 0.7, 0.6);
      fillPoly([[990, 383], [1282, 378], [1282, 388], [988, 391]], '#5c564c');
      for (let x = 994; x < 1280; x += 7.5) { g.fillStyle = 'rgba(170,160,145,0.6)'; g.beginPath(); g.arc(x, 386, 2, 0, 7); g.fill(); }
      // small lower roof piece at left of B
      const low = [[996, 392], [1068, 390], [1060, 412], [1002, 414]];
      g.save(); path(low); g.clip(); g.fillStyle = '#9a9080'; g.fillRect(990, 388, 80, 30); g.restore();
      tiles(low, 'rgba(0,0,0,0)', 5, 7, 0.4);
      // red postbox
      g.fillStyle = '#c84a32'; g.fillRect(1053, 514, 29, 52);
      g.fillStyle = '#dd6044'; g.fillRect(1060, 514, 22, 52);
      g.fillStyle = '#e8775a'; g.fillRect(1052, 510, 31, 6);
      g.fillStyle = '#3a1a14'; g.fillRect(1062, 524, 16, 2);
      g.fillStyle = '#efe2d2'; g.fillRect(1064, 534, 10, 8);
      g.restore();
    });
    const houseMat = new THREE.MeshBasicMaterial({ map: houseTex, transparent: true, alphaTest: 0.5, depthWrite: true });
    scene.add(card(HX0, HY0, HX1, HY1, 21, houseMat));

    /* ---------------- utility poles + transformer + wires ---------------- */
    const poleMatA = toon({ color: '#e2d0b0', dapple: false });
    const poleMatB = toon({ color: '#9a7a60', dapple: false });
    const darkMat = new THREE.MeshBasicMaterial({ color: col('#3a3634') });
    const poleAt = (px, topPy, botPy, d, radPx, mat) => {
      const top = scr(px, topPy, d), bot = scr(px, botPy, d);
      const h = top.distanceTo(bot), rr = radPx * wpp(d);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.9, rr, h, 10), mat);
      m.position.copy(top).add(bot).multiplyScalar(0.5); scene.add(m); return { top, bot, rr };
    };
    const DA = 22.5, DB = 20.5;
    poleAt(530, 186, 560, DA, 6.5, poleMatA);
    poleAt(588, 253, 560, DA, 6.0, poleMatA);
    const barAt = (px0, px1, py, d, hPx, mat) => {
      const a = scr(px0, py, d), b = scr(px1, py, d);
      const m = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), hPx * wpp(d), hPx * wpp(d)), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5); facing(m); scene.add(m); return m;
    };
    barAt(520, 600, 283, DA - 0.2, 5, poleMatA);
    barAt(514, 584, 375, DA - 0.3, 5, poleMatA);
    barAt(522, 540, 190, DA - 0.2, 4, poleMatA);
    // transformer
    const tr = new THREE.Mesh(new THREE.BoxGeometry(48 * wpp(DA), 36 * wpp(DA), 30 * wpp(DA)), toon({ color: '#c8c2b4', dapple: false }));
    tr.position.copy(scr(554, 352, DA - 0.5)); facing(tr); scene.add(tr);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(2 * wpp(DA), 2 * wpp(DA), 9 * wpp(DA), 6), toon({ color: '#d8a868', dapple: false })); b.position.copy(scr(542 + i * 9, 330, DA - 0.6)); scene.add(b); }
    // pole B (wooden, near the house) + crossarm + street lamp arm
    poleAt(775, 213, 548, DB, 7, poleMatB);
    barAt(744, 778, 226, DB - 0.1, 4, poleMatB);
    barAt(744, 760, 240, DB - 0.1, 3, poleMatB);
    const lampArm = new THREE.Mesh(new THREE.BoxGeometry(52 * wpp(DB), 3 * wpp(DB), 3 * wpp(DB)), darkMat);
    lampArm.position.copy(scr(748, 266, DB - 0.2)); facing(lampArm); lampArm.rotateZ(-0.1); scene.add(lampArm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(12 * wpp(DB), 4 * wpp(DB), 6 * wpp(DB)), new THREE.MeshBasicMaterial({ color: col('#f4f0e0') }));
    lamp.position.copy(scr(724, 265, DB - 0.25)); facing(lamp); scene.add(lamp);
    // far small pole on the left
    poleAt(218, 288, 360, 70, 3.2, poleMatB);

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

    /* ---------------- kei truck ---------------- */
    const truck = new THREE.Group();
    const paintMat = (key, w, h, draw) => new THREE.MeshBasicMaterial({ map: paintTexture(key, w, h, draw) });
    const plain = (c) => new THREE.MeshBasicMaterial({ color: col(c) });
    const cabSide = paintMat('s4_cab_side', 256, 200, (g, w, h) => {
      g.fillStyle = '#dfd3c2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9bdac'; g.fillRect(0, h * 0.78, w, h * 0.22);
      // door window (front = left in texture)
      g.fillStyle = '#342a30'; g.beginPath(); g.moveTo(w * 0.03, h * 0.5); g.quadraticCurveTo(w * 0.04, h * 0.1, w * 0.16, h * 0.07); g.lineTo(w * 0.36, h * 0.07); g.lineTo(w * 0.36, h * 0.5); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(w * 0.2, h * 0.1, w * 0.1, h * 0.3);
      // barred rear section
      g.fillStyle = '#c2b6a6'; g.fillRect(w * 0.44, h * 0.06, w * 0.54, h * 0.36);
      g.fillStyle = '#4a3c3a';
      for (let i = 0; i < 4; i++) g.fillRect(w * (0.47 + i * 0.13), h * 0.12, w * 0.1, h * 0.26);
      g.fillStyle = 'rgba(80,70,60,0.5)'; g.fillRect(w * 0.41, 0, 2, h); g.fillRect(0, h * 0.5, w, 2);
    });
    const bedSide = paintMat('s4_bed_side', 256, 64, (g, w, h) => {
      g.fillStyle = '#e4dacb'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,105,90,0.35)'; g.fillRect(0, h * 0.5, w, 2); g.fillRect(0, h - 3, w, 3);
      g.fillStyle = '#f2ebe0'; g.fillRect(0, 0, w, 4);
    });
    const cabMats = [plain('#cfc5b6'), plain('#c4baab'), plain('#ece6dc'), plain('#222'), cabSide, plain('#d8cebe')];
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.32, 1.4), cabMats); cab.position.set(-0.95, 1.1, 0); truck.add(cab);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.46, 1.4), [plain('#eae2d6'), plain('#d2c8b8'), plain('#cbc2b4'), plain('#222'), bedSide, plain('#d8cebe')]);
    bed.position.set(0.77, 0.87, 0); truck.add(bed);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.42, 1.2), plain('#26242a')); chassis.position.set(0, 0.4, 0); truck.add(chassis);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.14), plain('#c43a2a')); tail.position.set(1.72, 0.55, 0.6); truck.add(tail);
    for (const [x, z] of [[-1.0, 0.62], [1.0, 0.62], [-1.0, -0.62], [1.0, -0.62]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 12), plain('#141416')); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.27, z); truck.add(wh);
    }
    scene.add(truck);
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
    // custom painterly grass: blades sampled per screen column + depth; each blade's height is chosen so that its
    // tip lands near the reference grass line (~y 540) regardless of depth -> tall near grass, short far grass.
    {
      const r = rng(41); const N = 52000;
      const segs = 4, pos = [], uvs = [], idx = [];
      for (let i = 0; i <= segs; i++) { const t = i / segs, ww = (1 - Math.pow(t, 1.6)) * 0.5;
        if (i < segs) { pos.push(-ww, t, 0, ww, t, 0); uvs.push(0, t, 1, t); } else { pos.push(0, 1, 0); uvs.push(0.5, 1); } }
      for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      idx.push((segs - 1) * 2, (segs - 1) * 2 + 1, segs * 2);
      const ig = new THREE.InstancedBufferGeometry();
      ig.setIndex(idx); ig.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const aO = new Float32Array(N * 4), aS = new Float32Array(N * 4), aC = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) {
        const z = 1.4 * Math.pow(34 / 1.4, Math.pow(r(), 0.85));
        const px = lerp(-80, 1360, r());
        const p = scr(px, HORIZON, z);
        const spike = r() < 0.08 ? 15 + r() * 30 : 0;
        const tipY = 560 + (r() - 0.5) * 40 - spike + (px < 420 ? 10 : 0) + Math.max(0, (px - 980) * 0.06);
        const h = Math.max(0.12, CAM_H - (tipY - HORIZON) * z / F);
        const w = (0.032 + 0.0105 * z) * lerp(0.7, 1.35, r());
        aO.set([p.x, 0, p.z, (r() - 0.5) * 1.1], i * 4);
        aS.set([h, w, r(), r()], i * 4);
        aC.set([px < 380 ? lerp(0.55, 0.8, clamp((px - 120) / 260, 0, 1)) : 1.0, z], i * 2);
      }
      ig.setAttribute('aO', new THREE.InstancedBufferAttribute(aO, 4));
      ig.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 4));
      ig.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 2));
      ig.instanceCount = N;
      const gm = new THREE.ShaderMaterial({
        uniforms: { uTime: shared.uTime, cLo: { value: col('#447f37') }, cMid: { value: col('#62983f') }, cHi: { value: col('#78ab49') },
          cTip: { value: col('#9cc464') }, cDk: { value: col('#3e7636') } },
        vertexShader: `attribute vec4 aO; attribute vec4 aS; attribute vec2 aC; uniform float uTime;
          varying float vT, vR, vR2, vSide, vShade, vZ;
          ${core.NOISE_GLSL}
          void main(){
            float t = position.y; vT = t;
            float c = cos(aO.w), s = sin(aO.w);
            vec3 p = vec3(position.x * aS.y, t * aS.x, 0.);
            p = vec3(p.x * c, p.y, p.x * s);
            float gust = vnoise(aO.xz * 0.25 + vec2(uTime * 0.6, uTime * 0.2));
            float sway = (gust - 0.45) * 0.22 + sin(uTime * 2.1 + aO.x * 1.3 + aO.z * 0.7) * 0.05;
            vec2 dir = vec2(0.10 + sway, 0.0) + vec2(aS.z - 0.5, aS.w - 0.5) * 0.30;
            p.xz += dir * t * t * aS.x;
            p.y -= length(dir) * t * t * aS.x * 0.25;
            vec4 mv = modelViewMatrix * vec4(aO.xyz + p, 1.);
            gl_Position = projectionMatrix * mv;
            vR = aS.z; vR2 = aS.w; vSide = position.x; vShade = aC.x; vZ = aC.y;
          }`,
        fragmentShader: `uniform vec3 cLo, cMid, cHi, cTip, cDk; varying float vT, vR, vR2, vSide, vShade, vZ;
          void main(){
            vec3 c = mix(cLo, cMid, smoothstep(0.0, 0.55, vT));
            c = mix(c, cHi, smoothstep(0.5, 0.92, vT) * (0.35 + 0.65 * vR));
            c = mix(c, cTip, smoothstep(0.86, 1.0, vT) * step(0.55, vR2) * 0.7);
            c = mix(c, cDk, step(0.82, vR) * 0.6);
            c *= 0.86 + 0.26 * vR2;
            c *= vSide > 0.0 ? 0.9 : 1.0;
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
    const plantPoly = [[-10, 60], [50, 66], [92, 120], [150, 130], [210, 140], [262, 250], [256, 300], [300, 360], [345, 450], [280, 465], [200, 470], [-10, 470]];
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
        // the reference keeps the truck almost perfectly side-on while it recedes: face its flank to the camera
        // (tiny yaw so a sliver of the cab front shows, as in the ref)
        const p = truckPos(t);
        truck.position.copy(p);
        truck.rotation.y = Math.atan2(-(p.x - camera.position.x), -(p.z - camera.position.z)) + 0.12;
      },
    };
  },
};
