// Shot 2 — very low angle looking up: concrete overpass (upper-left), utility pole + wires, towering cumulus,
// red drink vending machine in dappled leaf shadow (hero), chain-link fences, striped barrier tape with bulbs,
// traffic cone, framing leaves, glowing butterflies.
const SUN = [-0.55, 0.62, 0.56];

export default {
  duration: 3.0,
  credit: { role: 'CONCEPT AND DESIGN', cx: 0.297, ry: 0.51, ny: 0.556 },
  post: { bloom: 0.35, bloomRadius: 0.45, bloomThreshold: 0.8, exposure: 1.0, contrast: 1.04, saturation: 1.04,
    lift: [0.0, 0.0, 0.01], vignette: 0.2, grain: 0.03, ca: 0.001, soft: 0.2 },
  build(core) {
    const { THREE, makeSky, makeCloud, makeFoliage, lightRig, toon, makeWire, makeButterflies, makeMotes, shared,
      paintTexture, chainLinkTexture, softDotTexture, NOISE_GLSL, rng, lerp, col } = core;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 2000);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 0, 0);
    camera.rotation.set(THREE.MathUtils.degToRad(20), 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);

    /* ---------- screen-space placement helpers (1280x720 reference pixels) ---------- */
    const CAM = camera.position.clone();
    const ray = (px, py) => new THREE.Vector3(px / 640 - 1, 1 - py / 360, 0.5).unproject(camera).sub(CAM).normalize();
    const at = (px, py, d) => CAM.clone().addScaledVector(ray(px, py), d);
    const hitY = (px, py, Y) => { const r = ray(px, py); return CAM.clone().addScaledVector(r, (Y - CAM.y) / r.y); };
    const hitPlane = (px, py, plane) => { const r = new THREE.Ray(CAM.clone(), ray(px, py)); const o = new THREE.Vector3(); return r.intersectPlane(plane, o) || at(px, py, 50); };
    const V = (a) => new THREE.Vector3(...a);

    const GROUND = -0.6;
    const sunDir = new THREE.Vector3(...SUN).normalize();

    /* ---------------- sky + cloud ---------------- */
    scene.add(makeSky({ zenith: '#156f86', mid: '#177e91', horizon: '#3a93a2', haze: 0.2, horizonY: -0.2 }));
    // camera-plane placement: point at screen pixel with view-space depth z
    const FWD = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const atZ = (px, py, z) => { const r = ray(px, py); return CAM.clone().addScaledVector(r, z / r.dot(FWD)); };
    const pxScale = (z) => 2 * z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / 720;
    // screen-aligned painted card covering pixel rect [x0,y0]-[x1,y1] at depth z
    const card = (x0, y0, x1, y1, z, mat) => {
      const s = pxScale(z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * s, (y1 - y0) * s), mat);
      m.position.copy(atZ((x0 + x1) / 2, (y0 + y1) / 2, z)); m.quaternion.copy(camera.quaternion); scene.add(m); return m;
    };
    {
      // painted towering cumulus (blobs authored in reference pixel coords, back to front)
      const X0 = 480, Y0 = 70, X1 = 940, Y1 = 380, SC = 2;
      const blobs = [
        [700, 140, 24], [676, 152, 20], [726, 146, 22], [748, 165, 20], [662, 176, 20], [700, 172, 28],
        [792, 152, 21], [820, 166, 22], [846, 186, 21], [866, 206, 19], [881, 226, 14], [770, 182, 25], [812, 200, 27], [852, 226, 21],
        [722, 212, 34], [680, 222, 28], [762, 230, 30], [830, 250, 25], [868, 246, 16],
        [566, 226, 16], [590, 216, 18], [614, 226, 18], [640, 232, 18], [552, 252, 17], [582, 252, 22], [622, 254, 22], [656, 250, 26],
        [700, 262, 34], [782, 262, 30], [546, 282, 17], [590, 287, 25], [632, 282, 25], [672, 292, 28], [722, 302, 30], [762, 302, 30],
        [822, 292, 25], [860, 270, 18], [562, 312, 20], [612, 317, 25], [662, 322, 30], [712, 334, 30], [772, 330, 30], [830, 320, 28],
      ];
      const tex = paintTexture('s2_cloud', (X1 - X0) * SC, (Y1 - Y0) * SC, (g, w, h, r) => {
        g.clearRect(0, 0, w, h);
        const LD = [0.55, -0.83];
        g.filter = 'blur(2.2px)';
        for (const [bx, by, br] of blobs) {
          const x = (bx - X0) * SC, y = (by - Y0) * SC, rr = br * SC;
          // bumpy silhouette: main disc + sub-lobes on the upper rim
          const subs = [[0, 0, 1]];
          for (let k = 0; k < 3; k++) { const a = -Math.PI * (0.1 + 0.8 * r()); subs.push([Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.4 + r() * 0.2]); }
          const disc = (col, ox, oy, sc) => { g.fillStyle = col; for (const [sx, sy, sr] of subs) { g.beginPath(); g.arc(x + (sx + ox) * rr, y + (sy + oy) * rr, sr * rr * sc, 0, Math.PI * 2); g.fill(); } };
          disc('#76909a', 0, 0, 1.0);
          g.save(); g.beginPath(); for (const [sx, sy, sr] of subs) { g.moveTo(x + sx * rr + sr * rr, y + sy * rr); g.arc(x + sx * rr, y + sy * rr, sr * rr, 0, Math.PI * 2); } g.clip();
          disc('#93a0a0', LD[0] * 0.14, LD[1] * 0.14, 0.97);
          disc('#aba79d', LD[0] * 0.3, LD[1] * 0.3, 0.9);
          disc('#b5afa3', LD[0] * 0.55, LD[1] * 0.55, 0.62);
          g.restore();
        }
      });
      card(X0, Y0, X1, Y1, 900, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })).renderOrder = -5;
    }

    /* ---------------- lights ---------------- */
    lightRig(scene, { sunDir: SUN, sunColor: '#fff0dc', sunIntensity: 2.4, sky: '#6fb6c8', ground: '#4a3a30', hemiIntensity: 0.55,
      ambient: '#3a4a6a', ambientIntensity: 0.35 });

    /* ---------------- overpass ---------------- */
    const H = 5.2;                         // fascia top height above camera
    const P1 = hitY(150, 72, H), P2 = hitY(625, 338, H);
    const D = P2.clone().sub(P1).setY(0).normalize();
    let N = new THREE.Vector3(-D.z, 0, D.x); if (N.dot(P1.clone().sub(CAM).setY(0)) < 0) { N.negate(); D.negate(); }
    const opGroup = new THREE.Group(); scene.add(opGroup);
    const basis = new THREE.Matrix4().makeBasis(D, new THREE.Vector3(0, 1, 0), N);  // local x along road, z away from camera
    opGroup.matrixAutoUpdate = false;
    opGroup.matrix.copy(basis).setPosition(P1); opGroup.matrixWorldNeedsUpdate = true;
    const concTex = paintTexture('s2_conc', 512, 128, (g, w, h, r) => {
      g.fillStyle = '#bba78a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = r(); g.fillStyle = `rgba(${v < 0.5 ? '70,60,50' : '235,225,205'},${0.08 + r() * 0.12})`; g.fillRect(r() * w, r() * h, 2 + r() * 10, 1 + r() * 4); }
      g.fillStyle = 'rgba(60,50,40,0.35)'; g.fillRect(0, h * 0.82, w, h * 0.18);
      g.fillStyle = 'rgba(255,245,225,0.35)'; g.fillRect(0, 0, w, h * 0.08);
    }, { repeat: true });
    concTex.repeat.set(6, 1);
    const fasciaMat = toon({ color: '#d8c8a8', map: concTex, dapple: false });
    const underMat = toon({ color: '#3a3632', dapple: false });
    const girderMat = toon({ color: '#48443e', dapple: false });
    const flangeMat = toon({ color: '#77716a', dapple: false });
    const postMat = toon({ color: '#f4efe6', dapple: false });
    const L0 = -60, L1 = 60, LEN = L1 - L0, WID = 40;
    const obox = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); opGroup.add(m); return m; };
    // deck slab (fascia face at z=0)
    obox(LEN, 0.75, WID, underMat, (L0 + L1) / 2, -0.375, WID / 2);
    // fascia (lit concrete strip) slightly proud
    obox(LEN, 0.5, 0.12, fasciaMat, (L0 + L1) / 2, -0.25, -0.03);
    // longitudinal girders under the deck
    for (let z = 0.8; z < WID; z += 2.6) {
      const d = 1.1;
      obox(LEN, d, 0.3, girderMat, (L0 + L1) / 2, -0.75 - d / 2, z);
      obox(LEN, 0.1, 0.7, flangeMat, (L0 + L1) / 2, -0.75 - d, z);
    }
    // brackets under the fascia + railing posts
    for (let x = L0; x < L1; x += 0.72) {
      const br = obox(0.06, 0.8, 0.06, flangeMat, x, -1.0, 0.25); br.rotation.x = -0.6;
      obox(0.06, 1.1, 0.06, postMat, x + 0.36, 0.55, 0.1);
    }
    obox(LEN, 0.05, 0.05, toon({ color: '#5a3a30', dapple: false }), (L0 + L1) / 2, 1.08, 0.12);
    obox(LEN, 0.03, 0.03, toon({ color: '#5a3a30', dapple: false }), (L0 + L1) / 2, 0.78, 0.12);
    obox(LEN, 0.03, 0.03, toon({ color: '#5a3a30', dapple: false }), (L0 + L1) / 2, 0.45, 0.12);
    // far side: dark wall under the deck with lit beam lines (reads as more girders in the distance)
    obox(LEN, 30, 0.5, toon({ color: '#2c2724', dapple: false }), (L0 + L1) / 2, -15, WID);
    for (let k = 0; k < 9; k++) obox(LEN, 0.35, 0.4, flangeMat, (L0 + L1) / 2, -2.2 - k * 2.4, WID - 0.5);

    /* ---------------- utility pole + wires ---------------- */
    const poleTex = paintTexture('s2_pole', 64, 512, (g, w, h, r) => {
      g.fillStyle = '#d9cdb4'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(90,75,60,${0.05 + r() * 0.15})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 2 + r() * 14); }
      g.fillStyle = '#4a3a30'; for (let y = 20; y < h; y += 26) { g.fillRect(w * 0.3, y, 10, 3); g.fillRect(w * 0.62, y + 13, 10, 3); }
    });
    const poleMat = toon({ color: '#ffffff', map: poleTex, dapple: false });
    const PB = at(492, 600, 7.0), PT = at(518, 132, 0);
    {
      // keep top on the same depth plane-ish: choose top at height along ray so horizontal distance ~ base
      const r = ray(518, 132); const hb = Math.hypot(PB.x, PB.z); const rh = Math.hypot(r.x, r.z);
      PT.copy(CAM).addScaledVector(r, hb / rh);
      const len = PT.distanceTo(PB);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, len, 10), poleMat);
      pole.position.copy(PB).lerp(PT, 0.5);
      pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), PT.clone().sub(PB).normalize());
      scene.add(pole);
      // crossarm
      const ca = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), toon({ color: '#3a2a24', dapple: false }));
      ca.position.copy(PT).add(new THREE.Vector3(-0.35, -0.25, 0)); ca.rotation.z = -0.55; ca.rotation.y = 0.3; scene.add(ca);
      for (const [px, py] of [[456, 101], [486, 92], [498, 131]]) {
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8), toon({ color: '#6a3a30', dapple: false }));
        ins.position.copy(at(px, py, PT.distanceTo(CAM))); scene.add(ins);
      }
    }
    const wireCol = '#2a1a16';
    const W = (a, b, sag = 0.1, rad = 0.018) => scene.add(makeWire(a.toArray(), b.toArray(), { sag, radius: rad, color: wireCol }));
    {
      const dP = PT.distanceTo(CAM);
      W(at(456, 99, dP), at(800, -10, dP * 1.15), 0.05);
      W(at(486, 90, dP), at(980, -10, dP * 1.2), 0.08);
      W(at(456, 99, dP), at(160, 330, dP * 0.9), 0.06);
      W(at(486, 92, dP), at(180, 300, dP * 0.9), 0.06);
      W(at(498, 131, dP), at(250, 390, dP * 0.9), 0.08);
      W(at(498, 131, dP), at(640, 345, dP * 1.05), 0.05);
      W(at(510, 150, dP), at(640, 330, dP * 1.05), 0.02);
      // drop loop from crossarm
      W(at(487, 100, dP), at(515, 200, dP), 0.15, 0.012);
    }

    /* ---------------- right tree mass (behind right fence) ---------------- */
    {
      const clumps = []; const r = rng(77);
      const pts = [[1000, 150, 1.4], [1080, 70, 1.6], [1180, 40, 1.8], [1260, 120, 1.8], [1240, 300, 2.0], [1120, 260, 1.8], [1010, 300, 1.5],
        [960, 420, 1.3], [1060, 450, 1.7], [1180, 470, 1.9], [1260, 560, 1.8], [1100, 620, 1.8], [1000, 600, 1.5], [980, 700, 1.4], [1200, 700, 1.6], [940, 290, 1.0]];
      for (const [px, py, rr] of pts) { const p = at(px, py, 11 + r() * 2); clumps.push([p.x, p.y, p.z, rr]); }
      scene.add(makeFoliage({ clumps, density: 7, cardSize: 1.1, kind: 'round', seed: 31, texSeed: 3,
        dark: '#18241e', mid: '#21402f', light: '#335a3c', highlight: '#4f7a4a', wind: 0.02, lightWrap: 0.45, shell: 0.6 }));
    }

    /* ---------------- chain-link fences ---------------- */
    // chain-link: 2x2 rounded diamonds per tile
    const linkTex = paintTexture('s2_link', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 4.5; g.lineCap = 'round';
      for (let c = -2; c <= 4; c++) {
        const o = c * w / 2;
        g.beginPath(); g.moveTo(o, 0); g.bezierCurveTo(o + w * 0.3, h * 0.22, o + w * 0.2, h * 0.78, o + w, h); g.stroke();
        g.beginPath(); g.moveTo(o + w, 0); g.bezierCurveTo(o + w * 0.7, h * 0.22, o + w * 0.8, h * 0.78, o, h); g.stroke();
      }
    }, { srgb: false, repeat: true });
    const fenceMat = (rep, dark = '#3a2a24', lit = '#e8d6bc', cov = 0.6) => {
      const t = linkTex;
      return new THREE.ShaderMaterial({
        uniforms: { tLink: { value: t }, uRep: { value: new THREE.Vector2(...rep) }, uTime: shared.uTime, uSun: { value: sunDir },
          cDark: { value: col(dark) }, cLit: { value: col(lit) }, uCov: { value: cov } },
        vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform sampler2D tLink; uniform vec2 uRep; uniform float uTime; uniform vec3 uSun, cDark, cLit; uniform float uCov; varying vec2 vUv; varying vec3 vW;
          ${NOISE_GLSL}
          void main(){ float a = texture2D(tLink, vUv*uRep).a; if (a < 0.05) discard;
            vec3 L = normalize(uSun); vec3 t1 = normalize(cross(L, vec3(0.,1.,0.))); vec3 t2 = cross(L, t1);
            vec2 q = vec2(dot(vW,t1), dot(vW,t2))*1.3 + vec2(sin(uTime*0.6), cos(uTime*0.5))*0.08;
            float m = smoothstep(uCov, uCov + 0.04, fbm(q));
            gl_FragColor = vec4(mix(cDark, cLit, m), smoothstep(0.05, 0.6, a)); }`,
        side: THREE.DoubleSide, transparent: true, depthWrite: false,
      });
    };
    const quad = (A, B, C, Dd, mat) => {   // A top-left, B top-right, C bottom-right, D bottom-left
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...A.toArray(), ...B.toArray(), ...C.toArray(), ...Dd.toArray()], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      g.setIndex([0, 3, 1, 1, 3, 2]); g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    };
    const railMat = toon({ color: '#b8aaa0', dapple: false });
    const darkRailMat = toon({ color: '#4a3530', dapple: false });
    const tube = (a, b, r, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), mat);
      m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); scene.add(m); return m;
    };
    // left fence: top rail (125,548) -> (585,405)
    {
      const Hf = 1.05;
      const A = hitY(60, 568, Hf), B = hitY(600, 400, Hf);
      const len = A.distanceTo(B);
      const f = quad(A, B, B.clone().setY(GROUND), A.clone().setY(GROUND), fenceMat([len / 0.3, (Hf - GROUND) / 0.3], '#5a3c34', '#e0a880', 0.52));
      scene.add(f);
      tube(hitY(-40, 600, Hf), B, 0.035, railMat);
      // posts
      tube(hitY(140, 545, Hf), hitY(140, 545, Hf).setY(GROUND), 0.035, railMat);
    }
    // right fence: top rail (875,250) -> (1280,85)
    {
      const Hr = 1.5;
      const A = hitY(860, 258, Hr), B = hitY(1330, 62, Hr);
      const len = A.distanceTo(B);
      scene.add(quad(A, B, B.clone().setY(GROUND), A.clone().setY(GROUND), fenceMat([len / 0.12, (Hr - GROUND) / 0.12], '#2e2420', '#d8c8b0', 0.6)));
      tube(A, B, 0.03, darkRailMat);
      // diagonal brace / lower rail
      tube(at(975, 395, A.distanceTo(CAM) * 1.0), at(1300, 512, 2.6), 0.022, darkRailMat);
    }

    /* ---------------- vending machine (hero) ---------------- */
    const TOP = 1.2;
    const MA = hitY(582, 356, TOP), MB = hitY(866, 262, TOP), MC = hitY(978, 298, TOP);
    const vmDraw = (shade) => (g, w, h) => {
      const pr = rng(5);
      const R = shade ? '#6e0c14' : '#ec4f50';
      const WH = shade ? '#8a6a66' : '#f8eedc';
      g.fillStyle = R; g.fillRect(0, 0, w, h);
      // subtle painted variation
      for (let i = 0; i < 60; i++) { g.fillStyle = shade ? `rgba(40,0,5,${pr() * 0.12})` : `rgba(255,140,130,${pr() * 0.1})`; g.beginPath(); g.arc(pr() * w, pr() * h, 10 + pr() * 40, 0, 7); g.fill(); }
      g.fillStyle = shade ? '#5a0810' : '#d43a3c'; g.fillRect(0, 0, w, h * 0.018);
      // glass display
      const gx0 = w * 0.045, gx1 = w * 0.86, gy0 = h * 0.03, gy1 = h * 0.6;
      g.fillStyle = shade ? '#4a3a34' : '#e2d6be'; g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
      const rows = 5, rh = (gy1 - gy0) / rows;
      const cols = shade ? ['#8a7a6c', '#7a6458', '#86504a', '#6a6a5a', '#9a8a74', '#5a5a6a', '#8a6a4a', '#a09080'] :
        ['#f4ece0', '#efe0d0', '#f0c8b8', '#e4e8d4', '#f6e6c4', '#d8dce8', '#f2d8b0', '#fbf6ec'];
      for (let k = 0; k < rows; k++) {
        const y0 = gy0 + k * rh;
        g.fillStyle = shade ? '#2e2220' : '#cbbca4'; g.fillRect(gx0, y0, gx1 - gx0, rh * 0.12);
        const n = 9;
        for (let i = 0; i < n; i++) {
          const bx = gx0 + (i + 0.5) * (gx1 - gx0) / n, bw = (gx1 - gx0) / n * 0.6, bh = rh * (0.5 + pr() * 0.12);
          g.fillStyle = cols[Math.floor(pr() * cols.length)];
          const by = y0 + rh * 0.78 - bh;
          g.fillRect(bx - bw / 2, by + bh * 0.25, bw, bh * 0.75);
          g.fillRect(bx - bw * 0.3, by + bh * 0.08, bw * 0.6, bh * 0.2);
          g.fillStyle = shade ? '#b8a898' : '#ffffff'; g.fillRect(bx - bw * 0.2, by, bw * 0.4, bh * 0.08);
          g.fillStyle = shade ? '#9a8a7a' : '#fff8ec'; g.fillRect(bx - bw * 0.45, y0 + rh * 0.82, bw * 0.9, rh * 0.06);
          g.fillStyle = shade ? '#2a2a2a' : '#7a7068'; g.fillRect(bx - bw * 0.18, y0 + rh * 0.9, bw * 0.36, rh * 0.05);
        }
      }
      // glass reflection streaks
      g.fillStyle = shade ? 'rgba(160,140,130,0.10)' : 'rgba(255,255,255,0.15)'; g.beginPath(); g.moveTo(gx0, gy1); g.lineTo(gx0 + w * 0.2, gy0); g.lineTo(gx0 + w * 0.32, gy0); g.lineTo(gx0 + w * 0.12, gy1); g.fill();
      g.strokeStyle = shade ? '#4a0810' : '#c43030'; g.lineWidth = 5; g.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
      // ledge under glass
      g.fillStyle = shade ? '#580a10' : '#d84040'; g.fillRect(gx0, gy1, gx1 - gx0, h * 0.012);
      // right control column
      const cx0 = w * 0.885, cw = w * 0.085;
      g.fillStyle = WH; g.fillRect(cx0, h * 0.08, cw, h * 0.04); g.fillRect(cx0, h * 0.2, cw, h * 0.06);
      g.fillStyle = shade ? '#2a1a1a' : '#4a3a3a'; g.fillRect(cx0 + cw * 0.25, h * 0.215, cw * 0.5, h * 0.025);
      g.fillStyle = WH; g.fillRect(cx0, h * 0.33, cw, h * 0.08);
      g.fillStyle = shade ? '#3a2a2a' : '#5a4a4a'; g.fillRect(cx0 + cw * 0.2, h * 0.35, cw * 0.6, h * 0.035);
      // price/coin display strip under glass (right)
      g.fillStyle = WH; g.fillRect(w * 0.6, h * 0.625, w * 0.22, h * 0.018);
      g.fillStyle = shade ? '#5a5050' : '#d8d0c8'; g.beginPath(); g.arc(w * 0.74, h * 0.665, w * 0.04, 0, 7); g.fill();
      g.fillStyle = WH; g.fillRect(w * 0.58, h * 0.7, w * 0.12, h * 0.022);
      // lower panel: white wave + dragon scales
      g.save();
      g.strokeStyle = WH; g.lineCap = 'round';
      g.lineWidth = w * 0.035;
      g.beginPath(); g.moveTo(w * 0.42, h * 0.62); g.bezierCurveTo(w * 0.44, h * 0.68, w * 0.5, h * 0.72, w * 0.6, h * 0.76); g.bezierCurveTo(w * 0.72, h * 0.8, w * 0.85, h * 0.86, w * 0.95, h * 0.95); g.stroke();
      g.lineWidth = w * 0.012;
      g.beginPath(); g.moveTo(w * 0.47, h * 0.62); g.bezierCurveTo(w * 0.5, h * 0.67, w * 0.56, h * 0.7, w * 0.66, h * 0.73); g.stroke();
      // dragon body: dark scaled band
      for (let i = 0; i < 220; i++) {
        const t = pr(); const x = w * (0.55 + 0.32 * t + 0.03 * Math.sin(t * 12)), y = h * (0.78 + 0.14 * t) + (pr() - 0.5) * h * 0.04;
        g.fillStyle = shade ? '#140606' : '#2a0e0e'; g.beginPath(); g.arc(x, y, w * 0.016, 0, 7); g.fill();
        g.strokeStyle = shade ? '#4a2020' : '#c08070'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, w * 0.012, 0.2, 2.8); g.stroke();
      }
      g.restore();
      // product outlet
      g.fillStyle = shade ? '#1c0808' : '#2c1010'; g.fillRect(w * 0.2, h * 0.9, w * 0.62, h * 0.06);
      // stickers left
      g.fillStyle = WH; g.fillRect(w * 0.06, h * 0.7, w * 0.12, h * 0.08);
      g.fillStyle = shade ? '#3a3a6a' : '#6a7ac8'; g.fillRect(w * 0.08, h * 0.72, w * 0.08, h * 0.01); g.fillRect(w * 0.08, h * 0.74, w * 0.06, h * 0.01);
      g.fillStyle = WH; g.fillRect(w * 0.06, h * 0.8, w * 0.1, h * 0.04);
    };
    const sideDraw = (shade) => (g, w, h, r) => {
      const R = shade ? '#650c10' : '#e0443c';
      const WH = shade ? '#a08080' : '#f6e8d6';
      g.fillStyle = R; g.fillRect(0, 0, w, h);
      g.fillStyle = WH; g.font = `bold ${w * 0.2}px sans-serif`; g.fillText('GM', w * 0.55, h * 0.5);
      for (const [x, y] of [[0.6, 0.12], [0.65, 0.3], [0.7, 0.58], [0.62, 0.7]]) { g.beginPath(); g.moveTo(w * x, h * y); g.lineTo(w * (x + 0.06), h * (y + 0.03)); g.lineTo(w * x, h * (y + 0.05)); g.fill(); }
      g.fillStyle = shade ? '#6a6aa0' : '#8a8ae0'; g.fillRect(w * 0.42, h * 0.2, w * 0.05, h * 0.06);
      g.fillStyle = shade ? '#2a0a0a' : '#5a1a1a'; g.fillRect(w * 0.85, h * 0.15, w * 0.06, h * 0.4);
      g.fillStyle = '#e0c040'; g.beginPath(); g.arc(w * 0.98, h * 0.49, w * 0.025, 0, Math.PI * 2); g.fill();
    };
    const vmLit = paintTexture('s2_vmLit', 512, 1024, vmDraw(false)), vmSh = paintTexture('s2_vmSh', 512, 1024, vmDraw(true));
    const sdLit = paintTexture('s2_sdLit', 256, 1024, sideDraw(false)), sdSh = paintTexture('s2_sdSh', 256, 1024, sideDraw(true));
    const dappleMat = (tL, tS, cover, scale) => new THREE.ShaderMaterial({
      uniforms: { tL: { value: tL }, tS: { value: tS }, uTime: shared.uTime, uSun: { value: sunDir }, uCover: { value: cover }, uScale: { value: scale } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D tL, tS; uniform float uTime, uCover, uScale; uniform vec3 uSun; varying vec2 vUv; varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          vec3 L = normalize(uSun); vec3 t1 = normalize(cross(L, vec3(0.,1.,0.))); vec3 t2 = cross(L, t1);
          vec2 q = vec2(dot(vW,t1), dot(vW,t2)) * uScale;
          q += vec2(sin(uTime*0.55 + q.y*0.35), cos(uTime*0.42 + q.x*0.3)) * 0.12 + vec2(uTime*0.06, -uTime*0.025);
          float n = 0.8*fbm(q) + 0.2*vnoise(q*2.7 + vec2(3.1, uTime*0.12)) + 0.08*(vnoise(q*7.0 + uTime*0.3) - 0.5);
          float m = smoothstep(uCover - 0.015, uCover + 0.015, n);
          vec3 c = mix(texture2D(tS, vUv).rgb, texture2D(tL, vUv).rgb, m);
          gl_FragColor = vec4(c, 1.);
        }`,
    });
    {
      const A0 = MA.clone().setY(GROUND), B0 = MB.clone().setY(GROUND), C0 = MC.clone().setY(GROUND);
      scene.add(quad(MA, MB, B0, A0, dappleMat(vmLit, vmSh, 0.53, 6.5)));
      scene.add(quad(MB, MC, C0, B0, dappleMat(sdLit, sdSh, 0.74, 6.5)));
      // top lid (dark) + small vent box
      const Dp = MA.clone().add(MC).sub(MB);
      const lid = new THREE.BufferGeometry();
      lid.setAttribute('position', new THREE.Float32BufferAttribute([...MA.toArray(), ...MB.toArray(), ...MC.toArray(), ...Dp.toArray()], 3));
      lid.setIndex([0, 1, 2, 0, 2, 3]);
      scene.add(new THREE.Mesh(lid, new THREE.MeshBasicMaterial({ color: col('#4a0a10'), side: THREE.DoubleSide })));
      const vb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), toon({ color: '#3a3434', dapple: false }));
      vb.position.copy(MA.clone().lerp(MB, 0.55).lerp(Dp.clone().lerp(MC, 0.55), 0.6)).add(new THREE.Vector3(0, 0.09, 0)); scene.add(vb);
    }

    /* ---------------- barrier tape with bulbs ---------------- */
    const tapeTex = paintTexture('s2_tape', 512, 32, (g, w, h) => {
      g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { g.fillStyle = '#f2cf62'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, 0); g.lineTo(x + 52, 0); g.lineTo(x + 32, h); g.fill(); }
    }, { repeat: true });
    const ribbon = (pts, width, rep) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const n = 80, pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = curve.getPoint(t), tg = curve.getTangent(t);
        const side = new THREE.Vector3(0, 1, 0).sub(tg.clone().multiplyScalar(tg.y)).normalize().multiplyScalar(width / 2);
        side.applyAxisAngle(tg, 0.4 * Math.sin(t * 9));
        pos.push(...p.clone().add(side).toArray(), ...p.clone().sub(side).toArray()); uv.push(t * rep, 1, t * rep, 0);
        if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tapeTex, side: THREE.DoubleSide, color: col('#ffffff') }));
      scene.add(m); return curve;
    };
    const bulbs = [];
    {
      const c1 = ribbon([at(-20, 700, 3.2), at(120, 680, 3.4), at(260, 668, 3.6), at(380, 645, 3.8), at(470, 612, 4.0), at(540, 565, 4.2), at(590, 530, 4.4)], 0.065, 16);
      const c2 = ribbon([at(980, 492, 4.0), at(1100, 482, 3.6), at(1220, 466, 3.2), at(1320, 455, 3.0)], 0.075, 10);
      for (let i = 0; i < 9; i++) bulbs.push(c1.getPoint((i + 0.4) / 9));
      for (let i = 0; i < 4; i++) bulbs.push(c2.getPoint((i + 0.3) / 4));
      const bg = new THREE.BufferGeometry().setFromPoints(bulbs);
      const bm = new THREE.PointsMaterial({ size: 0.22, map: softDotTexture(), color: col('#ffe8a0'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      scene.add(new THREE.Points(bg, bm));
    }

    /* ---------------- traffic cone ---------------- */
    {
      const coneDraw = (sh) => (g, w, h) => {
        g.fillStyle = sh ? '#5e2c24' : '#f08a4a'; g.fillRect(0, 0, w, h);
        g.fillStyle = sh ? '#8a7c78' : '#fff6e8'; g.fillRect(0, h * 0.16, w, h * 0.13); g.fillRect(0, h * 0.42, w, h * 0.15);
      };
      const cp = hitY(1196, 545, 0.25);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 0.85, 16, 1, true),
        dappleMat(paintTexture('s2_coneL', 128, 256, coneDraw(false)), paintTexture('s2_coneS', 128, 256, coneDraw(true)), 0.6, 9.0));
      cone.position.copy(cp).setY(cp.y - 0.425); scene.add(cone);
    }

    /* ---------------- framing foliage ---------------- */
    const leafCols = { dark: '#14261c', mid: '#1f5a3e', light: '#3d8a5c', highlight: '#7fb87a' };
    const NOFOL = false;
    const fol = (pts, d, cardPx, opts) => { if (NOFOL) return;
      const k = pxScale(d);
      const clumps = pts.map(([px, py, rpx]) => { const p = atZ(px, py, d); return [p.x, p.y, p.z, rpx * k]; });
      const m = makeFoliage({ clumps, kind: 'broad', ...leafCols, wind: 0.05, lightWrap: 0.4, shell: 0.55, cardSize: cardPx * k, density: 2.2, ...opts });
      scene.add(m); return m;
    };
    // top-left mass + left edge column
    fol([[60, 40, 90], [180, 20, 70], [300, 5, 45], [20, 180, 80], [70, 260, 55], [10, 380, 60], [30, 480, 50], [120, 470, 35],
      [150, 560, 35], [40, 620, 55], [200, 650, 35], [100, 700, 45]], 2.2, 120, { seed: 41, texSeed: 2 });
    // top-centre hanging cluster
    fol([[470, 30, 55], [540, 60, 50], [600, 100, 40], [630, 40, 45], [430, 15, 40]], 3.2, 100, { seed: 43, texSeed: 4,
      dark: '#0f2018', mid: '#1b4a36', light: '#2f7050', highlight: '#5f9a6a' });

    /* ---------------- butterflies + motes ---------------- */
    {
      const a = at(60, 700, 3.0), b = at(460, 530, 3.6);
      scene.add(makeButterflies({ count: 14, box: [[Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)]],
        size: 0.05, color: '#ffd84a', glow: 1.5, speed: 0.8, seed: 12 }));
      const m1 = at(200, 650, 2.5), m2 = at(900, 150, 6);
      scene.add(makeMotes({ count: 30, box: [[Math.min(m1.x, m2.x), Math.min(m1.y, m2.y), Math.min(m1.z, m2.z)], [Math.max(m1.x, m2.x), Math.max(m1.y, m2.y), Math.max(m1.z, m2.z)]],
        size: 0.03, opacity: 0.6, seed: 4 }));
    }

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(sunDir);
        shared.uDapple.value = 0.85; shared.uDappleScale.value = 3.0; shared.uDappleCover.value = 0.5; shared.uDappleSpeed.value = 0.15;
        shared.uFogMax.value = 0.0;
      },
    };
  },
};
