// Shot 7 — inside a parked car looking up through the windshield at a railway overpass.
// A long blue train slides off to the left; catenary gantries, road signs, trees, painted sky.
// The car interior is a painted silhouette overlay attached to the camera (static camera).

const W = 1280, H = 720;

export default {
  duration: 3.042,
  credit: { role: 'STORYLINE', cx: 0.795, ry: 0.644, ny: 0.694 },
  post: {
    bloom: 0.18, bloomRadius: 0.6, bloomThreshold: 0.92,
    exposure: 1.0, contrast: 0.97, saturation: 0.98,
    lift: [0.0, 0.0, 0.0], gamma: [1, 1, 1], gain: [1, 1, 1],
    vignette: 0.12, grain: 0.045, ca: 0.0015, leak: 0, soft: 0.22,
  },
  build(core) {
    const { THREE, shared, col, rng, lerp, clamp, NOISE_GLSL, paintTexture, makeSky, makeCloud, makeFoliage } = core;
    const scene = new THREE.Scene();

    /* ---------------- camera ---------------- */
    const FOV = 55;
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 2000);
    camera.position.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(18.5 * Math.PI / 180, 0, -1 * Math.PI / 180);
    scene.add(camera);
    const SUN = new THREE.Vector3(0.35, 0.75, 0.55).normalize();

    scene.add(makeSky({ zenith: '#3c6c9c', mid: '#4f80aa', horizon: '#6f9cbc', haze: 0.3 }));

    /* ---------------- painted material with dapple ---------------- */
    const uDap = { value: 0 };
    const DAPPLE_GLSL = `
      ${NOISE_GLSL}
      uniform float uT;
      float dapple(vec3 p, float scale, float cover){
        vec2 q = vec2(p.x + p.z * 0.6, p.y + p.z * 0.35) * scale;
        q += vec2(sin(uT * 0.9 + q.y * 0.5), cos(uT * 0.7 + q.x * 0.4)) * 0.06;
        float n = fbm(q) + 0.22 * vnoise(q * 5.0 + 3.1);
        return smoothstep(cover - 0.02, cover + 0.02, n);
      }`;
    const uT = { value: 0 };
    function paintMat({ shadow = '#333', lit = '#999', map = null, cover = 0.62, scale = 0.35, dap = 1.0, alphaTest = 0.5,
      side = THREE.FrontSide, varAmt = 0.18, varScale = 0.25, litFace = 0.0, rim = null } = {}) {
      return new THREE.ShaderMaterial({
        uniforms: { cS: { value: col(shadow) }, cL: { value: col(lit) }, tMap: { value: map }, uHasMap: { value: map ? 1 : 0 },
          uCover: { value: cover }, uScale: { value: scale }, uDap: { value: dap }, uSun: { value: SUN }, uT,
          uAT: { value: alphaTest }, uVar: { value: varAmt }, uVS: { value: varScale }, uLitFace: { value: litFace } },
        vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
          void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
          uniform vec3 cS, cL, uSun; uniform sampler2D tMap; uniform float uHasMap, uCover, uScale, uDap, uAT, uVar, uVS, uLitFace;
          ${DAPPLE_GLSL}
          void main(){
            vec4 m = uHasMap > 0.5 ? texture2D(tMap, vUv) : vec4(1.);
            if (m.a < uAT) discard;
            float ndl = dot(normalize(vN), uSun);
            float face = smoothstep(-0.05, 0.1, ndl);
            float d = mix(1.0, dapple(vW, uScale, uCover), uDap);
            float L = max(face * d, uLitFace * face);
            vec3 c = mix(cS, cL, L) * m.rgb;
            c *= 1.0 + (fbm(vW.xy * uVS + vW.z * 0.1) - 0.5) * uVar * 2.0;
            gl_FragColor = vec4(c, 1.);
          }`,
        side,
      });
    }

    /* ---------------- textures ---------------- */
    const latticeTex = (key, fg) => paintTexture('s7_lat_' + key, 64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = fg; g.fillStyle = fg;
      g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
      g.lineWidth = 4;
      const n = 4, s = h / n;
      for (let i = 0; i < n; i++) {
        g.beginPath(); g.moveTo(4, i * s); g.lineTo(w - 4, i * s + s / 2); g.lineTo(4, (i + 1) * s); g.stroke();
        g.fillRect(0, i * s - 2, w, 4);
      }
    });
    const latWhite = latticeTex('w', '#ffffff');
    function latticeBox(wid, len, dep, mat, reps) {
      const geo = new THREE.BoxGeometry(wid, len, dep);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * reps);
      return new THREE.Mesh(geo, mat);
    }
    latWhite.wrapS = latWhite.wrapT = THREE.RepeatWrapping;

    const concreteTex = paintTexture('s7_concrete', 512, 256, (g, w, h, r) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const v = 200 + r() * 55;
        g.fillStyle = `rgba(${v},${v * 0.97},${v * 0.95},0.35)`;
        g.fillRect(r() * w, r() * h, 4 + r() * 40, 2 + r() * 10);
      }
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(120,110,105,0.25)'; g.fillRect(i * 64, 0, 2, h); }
    });
    concreteTex.wrapS = concreteTex.wrapT = THREE.RepeatWrapping;

    /* ---------------- overpass ---------------- */
    const bridge = new THREE.Group();
    bridge.position.set(20, 6.9, -26);
    bridge.rotation.y = -40 * Math.PI / 180;
    scene.add(bridge);
    // local: x along bridge (+x = near/right), y up (deck surface 0), z toward camera (front face z=0)
    const faceMat = paintMat({ shadow: '#2a2223', lit: '#8c6c4c', map: concreteTex, cover: 0.7, scale: 0.42 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(260, 4.6, 11), faceMat);
    slab.position.set(-100, -2.2, -5.5); bridge.add(slab);
    const lowerMat = paintMat({ shadow: '#2e2826', lit: '#7d6650', map: concreteTex, cover: 0.68, scale: 0.36 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(100, 20, 9), lowerMat);
    lower.position.set(-13, -14.5, -6.5); bridge.add(lower);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 9), lowerMat);
    pier.position.set(-88, -14.5, -6.5); bridge.add(pier);
    // dark underside of the slab
    const under = new THREE.Mesh(new THREE.BoxGeometry(260, 0.3, 10), new THREE.MeshBasicMaterial({ color: col('#1c1718') }));
    under.position.set(-100, -4.55, -5.5); bridge.add(under);
    // railing: posts + rails
    const railMat = paintMat({ shadow: '#5a6274', lit: '#d8d6d0', cover: 0.55, scale: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.16, 1.1, 0.16);
    const posts = new THREE.InstancedMesh(postGeo, railMat, 80);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) { m4.makeTranslation(25 - i * 3.6, 0.55, -0.3); posts.setMatrixAt(i, m4); }
    bridge.add(posts);
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(260, 0.14, 0.1), railMat); rail1.position.set(-100, 1.05, -0.2); bridge.add(rail1);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(260, 0.1, 0.08), railMat); rail2.position.set(-100, 0.55, -0.2); bridge.add(rail2);

    /* ---------------- train ---------------- */
    const trainTex = paintTexture('s7_train', 1024, 128, (g, w, h, r) => {
      g.fillStyle = '#3a4c9a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#5a78c8'; g.fillRect(0, 0, w, 10);           // roof rim
      g.fillStyle = '#2a3780'; g.fillRect(0, 10, w, 6);
      for (let i = 0; i < 8; i++) {                                // windows
        const x = 40 + i * 122;
        g.fillStyle = '#5c6070'; g.fillRect(x, 34, 92, 44);
        g.fillStyle = '#3c4050'; g.fillRect(x + 4, 38, 84, 36);
        g.fillStyle = 'rgba(160,170,190,0.5)'; g.fillRect(x + 6, 40, 30, 6);
      }
      g.fillStyle = '#26306c'; g.fillRect(0, 96, w, 32);
      g.strokeStyle = '#1d2450'; g.lineWidth = 3;
      for (const x of [20, w - 20]) { g.beginPath(); g.moveTo(x, 20); g.lineTo(x, h); g.stroke(); }
    });
    const trainMat = paintMat({ shadow: '#4a4e72', lit: '#d6dcf0', map: trainTex, cover: 0.6, scale: 0.4 });
    const train = new THREE.Group();
    bridge.add(train);
    const CAR = 20, NCARS = 14;
    for (let i = 0; i < NCARS; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(CAR - 0.6, 3.6, 2.9), trainMat);
      car.position.set(-(i + 0.5) * CAR, 2.2, -3.0);
      train.add(car);
    }
    // rounded tail cab at local x = 0 (the train's rear end, near side)
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 3.6, 16, 1, false, 0, Math.PI), trainMat);
    cab.scale.set(1.0, 1, 1.6); cab.rotation.y = 0; cab.position.set(-0.3, 2.2, -3.0);
    cab.rotation.y = Math.PI / 2; cab.scale.set(1.0, 1, 1.0);
    train.add(cab);

    /* ---------------- catenary gantries ---------------- */
    const rustMat = paintMat({ shadow: '#4a2a26', lit: '#c07a52', map: latWhite, cover: 0.55, scale: 0.6, side: THREE.DoubleSide });
    const redMat = paintMat({ shadow: '#6a2a28', lit: '#d0806a', map: latWhite, cover: 0.5, scale: 0.6, side: THREE.DoubleSide });
    const greyMat = paintMat({ shadow: '#4a4a58', lit: '#c8a060', map: latWhite, cover: 0.6, scale: 0.6, side: THREE.DoubleSide });
    const yelMat = paintMat({ shadow: '#8a7040', lit: '#e0c070', map: latWhite, cover: 0.4, scale: 0.6, side: THREE.DoubleSide });
    function beam(a, b, wid, dep, mat, seg = 1.5) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const m = latticeBox(wid, len, dep, mat, len / seg);
      m.position.copy(A).lerp(B, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      bridge.add(m);
      return m;
    }
    // central gantry: near mast + boom to a yellow far post
    beam([-33, -6, 6], [-33, 16, 6], 2.0, 2.0, rustMat, 2.2);
    beam([-33, 15.2, 6], [-35, 12, -12], 1.3, 1.5, greyMat, 1.6);
    beam([-35, 0, -12], [-35, 12.5, -12], 0.6, 0.6, yelMat, 1.2);
    // right gantry (behind the train, tilted)
    beam([0, 0, -10], [6, 22, -12], 2.0, 2.0, redMat, 2.0);
    beam([4, 15, -11], [14, 18, -6], 1.0, 1.0, redMat, 1.4);
    // far left gantry
    beam([-66, 0, -1], [-66, 7, -1], 0.8, 0.8, yelMat, 1.2);
    beam([-66, 6.6, -1], [-70, 5, -14], 0.9, 0.9, yelMat, 1.2);

    /* ---------------- road signs ---------------- */
    const signTri = paintTexture('s7_tri', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const tri = (m) => { g.beginPath(); g.moveTo(m, 20 + m * 0.6); g.lineTo(w - m, 20 + m * 0.6); g.lineTo(w / 2, h - 20 - m * 1.2); g.closePath(); };
      g.lineJoin = 'round';
      tri(8); g.fillStyle = '#f0ece6'; g.fill();
      tri(26); g.fillStyle = '#c42a30'; g.fill();
      g.fillStyle = '#f0ece6'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
      g.fillText('止まれ', w / 2, 98);
    });
    const signRound = paintTexture('s7_round', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fillStyle = '#f0ece6'; g.fill();
      g.beginPath(); g.arc(128, 128, 114, 0, Math.PI * 2); g.fillStyle = '#c42a30'; g.fill();
      g.beginPath(); g.arc(128, 128, 84, 0, Math.PI * 2); g.fillStyle = '#2a4aa0'; g.fill();
      g.save(); g.translate(128, 128); g.rotate(Math.PI / 4); g.fillStyle = '#c42a30'; g.fillRect(-100, -14, 200, 28); g.restore();
    });
    const signMat = (map) => paintMat({ shadow: '#4a4058', lit: '#e8e0e0', map, cover: 0.55, scale: 2.2, alphaTest: 0.5, side: THREE.DoubleSide, varAmt: 0.06 });
    const signs = new THREE.Group();
    signs.position.set(-1.25, 0, -9);
    scene.add(signs);
    const poleMat = paintMat({ shadow: '#3a3a48', lit: '#b8b0a8', cover: 0.5, scale: 2.0 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 8, 8), poleMat); pole.position.set(0, 0, 0); signs.add(pole);
    const tri = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), signMat(signTri)); tri.position.set(0, 2.45, 0.08); signs.add(tri);
    const rnd = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), signMat(signRound)); rnd.position.set(0, 0.2, 0.08); signs.add(rnd);

    /* ---------------- clouds ---------------- */
    const cloudCfg = { light: '#d6dde8', mid: '#a9bbd0', shadow: '#7f99b8', lightDir: [0.2, 1], edge: 0.05 };
    const clouds = [
      [0, 90, -260, 160, 60, 3], [70, 120, -280, 140, 70, 5], [-55, 70, -240, 80, 40, 8], [120, 150, -260, 120, 70, 11],
      [-75, 115, -220, 70, 45, 13], [30, 150, -300, 160, 60, 17],
    ];
    for (const [x, y, z, w, h, s] of clouds) {
      const c = makeCloud({ w, h, seed: s, kind: 'cumulus', ...cloudCfg, detail: 1.4 });
      c.position.set(x, y, z); c.lookAt(0, 0, 0); scene.add(c);
    }

    /* ---------------- trees ---------------- */
    // big tree seen through the side window (left)
    scene.add(makeFoliage({ clumps: [[-14, 9, -6, 4.0], [-12, 5, -9, 3.6], [-16, 13, -10, 4.2], [-10, 12, -3, 3.4], [-12, 2, -5, 3.0], [-9, 7, -7, 2.5]],
      density: 7, cardSize: 1.0, kind: 'small', seed: 21, wind: 0.04,
      dark: '#163a34', mid: '#22574a', light: '#3d7d5c', highlight: '#7cb07a', lightWrap: 0.5 }));
    // tree behind the bridge on the right
    scene.add(makeFoliage({ clumps: [[38, 20, -60, 7], [46, 18, -58, 6], [30, 17, -64, 5.5]],
      density: 6, cardSize: 1.6, kind: 'small', seed: 31, wind: 0.02,
      dark: '#1c2c28', mid: '#2c4a3c', light: '#456a4e', highlight: '#6a8c64', lightWrap: 0.3 }));
    scene.add(makeFoliage({ clumps: [[8, 15, -66, 3.5], [14, 15.5, -68, 3]],
      density: 6, cardSize: 1.3, kind: 'small', seed: 33, wind: 0.02,
      dark: '#1c3a32', mid: '#2c5a46', light: '#4a7a58', highlight: '#7aa070' }));
    // overhanging branch above the car (top right)
    scene.add(makeFoliage({ clumps: [[3, 8, -6, 1.6], [6, 9, -7, 1.8], [9, 10, -8, 1.6], [1, 7.6, -7, 1.0], [7.5, 7.4, -6.5, 1.0]],
      density: 1.6, cardSize: 0.5, kind: 'small', seed: 41, wind: 0.06, shell: 0.2,
      dark: '#123028', mid: '#1f4a3c', light: '#3a6a50', highlight: '#5c8a62' }));

    /* ---------------- car interior overlay ---------------- */
    const interiorTex = paintTexture('s7_interior', W, H, (g) => {
      g.clearRect(0, 0, W, H);
      // base: whole frame dark
      const base = g.createLinearGradient(0, 0, 0, H);
      base.addColorStop(0, '#130d0f'); base.addColorStop(0.6, '#140e11'); base.addColorStop(1, '#16131e');
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      // sun visor (slightly lighter)
      g.fillStyle = '#19121499';
      g.beginPath(); g.moveTo(330, 150); g.lineTo(690, 100); g.lineTo(720, 230); g.lineTo(360, 270); g.closePath(); g.fill();
      g.fillStyle = '#1c1517'; g.fillRect(1030, 0, 250, 30);
      // left seat / door (bluish)
      g.fillStyle = '#1a1829';
      g.beginPath(); g.moveTo(0, 440); g.bezierCurveTo(70, 470, 140, 540, 180, 620); g.lineTo(230, 720); g.lineTo(0, 720); g.closePath(); g.fill();
      // dashboard
      const dg = g.createLinearGradient(0, 560, 0, 720);
      dg.addColorStop(0, '#22202e'); dg.addColorStop(0.15, '#1a1626'); dg.addColorStop(1, '#171320');
      g.fillStyle = dg;
      g.beginPath(); g.moveTo(512, 646); g.lineTo(800, 610); g.lineTo(1110, 574); g.lineTo(1280, 556); g.lineTo(1280, 720); g.lineTo(490, 720); g.closePath(); g.fill();
      // vents
      g.fillStyle = '#0f0c16';
      g.fillRect(842, 680, 48, 34); g.fillRect(908, 680, 52, 34);
      g.strokeStyle = '#1e1a28'; g.lineWidth = 2;
      for (let y = 686; y < 712; y += 6) { g.beginPath(); g.moveTo(844, y); g.lineTo(888, y); g.moveTo(910, y); g.lineTo(958, y); g.stroke(); }
      g.beginPath(); g.arc(1150, 605, 22, 0, Math.PI * 2); g.fillStyle = '#1c1826'; g.fill();
      g.strokeStyle = '#232030'; g.stroke();
      // cut out windows
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      // side window
      g.beginPath();
      g.moveTo(0, 14); g.bezierCurveTo(110, 60, 230, 160, 308, 252);
      g.lineTo(356, 420); g.lineTo(390, 560); g.lineTo(372, 640);
      g.bezierCurveTo(300, 636, 220, 625, 168, 606);
      g.bezierCurveTo(130, 560, 80, 500, 0, 456);
      g.closePath(); g.fill();
      // windshield
      g.beginPath();
      g.moveTo(398, 284); g.bezierCurveTo(700, 210, 1000, 120, 1280, 42);
      g.lineTo(1280, 556); g.lineTo(1110, 574); g.lineTo(800, 610); g.lineTo(518, 644);
      g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
      // wipers (outside, near the glass)
      g.strokeStyle = '#141018'; g.lineCap = 'round';
      g.lineWidth = 5; g.beginPath(); g.moveTo(560, 628); g.lineTo(920, 612); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(560, 636); g.lineTo(900, 620); g.stroke();
      g.lineWidth = 5; g.beginPath(); g.moveTo(950, 610); g.lineTo(1110, 596); g.stroke();
      // mirror
      g.save(); g.translate(881, 225); g.rotate(-8.5 * Math.PI / 180);
      const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
      rr(-118, -38, 236, 76, 16); g.fillStyle = '#0d0a0e'; g.fill();
      rr(-112, -32, 224, 64, 12);
      const mg = g.createLinearGradient(-110, -30, 110, 30);
      mg.addColorStop(0, '#5f97b6'); mg.addColorStop(1, '#3e7598'); g.fillStyle = mg; g.fill();
      g.fillStyle = 'rgba(200,215,230,0.55)';
      g.beginPath(); g.ellipse(40, -14, 30, 7, -0.1, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(150,170,120,0.5)'; g.fillRect(30, -10, 14, 6);
      g.restore();
      g.strokeStyle = '#0d0a0e'; g.lineWidth = 9; g.beginPath(); g.moveTo(862, 172); g.lineTo(868, 192); g.stroke();
    });
    const ovH = 2 * Math.tan(FOV / 2 * Math.PI / 180), ovW = ovH * 16 / 9;
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(ovW, ovH), new THREE.MeshBasicMaterial({ map: interiorTex, transparent: true, depthTest: false, depthWrite: false }));
    overlay.position.set(0, 0, -1); overlay.renderOrder = 100; camera.add(overlay);

    /* ---------------- rainbow light leak (screen space) ---------------- */
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(ovW, ovH), new THREE.ShaderMaterial({
      uniforms: { uT },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float uT;
        vec3 rainbow(float x){ return clamp(abs(mod(x*6.0+vec3(0.,4.,2.),6.0)-3.0)-1.0, 0., 1.); }
        vec3 arc(vec2 p, vec2 c, float R, float w, float k){
          float r = length((p - c) * vec2(16./9., 1.));
          float x = (r - R) / w;
          float a = smoothstep(1.0, 0.0, abs(x));
          return rainbow(clamp(x*0.5+0.5, 0., 1.) * 0.85) * a * k;
        }
        void main(){
          vec2 p = vUv;
          vec3 c = vec3(0.);
          c += arc(p, vec2(1.02, 1.18), 0.36, 0.07, 0.55);
          c += arc(p, vec2(0.12, -0.62), 0.78, 0.09, 0.35);
          c += vec3(0.9, 0.35, 0.15) * smoothstep(0.35, 0.0, length((p - vec2(1.02, 0.1)) * vec2(1.6, 1.))) * 0.35;
          c += vec3(0.8, 0.5, 0.25) * smoothstep(0.30, 0.0, length((p - vec2(0.95, 1.02)) * vec2(1.6, 1.))) * 0.25;
          gl_FragColor = vec4(c * c, 1.);
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    flare.position.set(0, 0, -0.99); flare.renderOrder = 101; camera.add(flare);

    /* ---------------- animation ---------------- */
    // train tail position along the bridge (local x, decreasing = moving away to the left)
    const tailX = (t) => {
      // fitted so the tail enters at the right edge ~1.9 s and exits left ~2.75 s
      const t0 = 2.0, x0 = -6, v = 61, a = 76;
      const dt = t - t0;
      return x0 - v * dt - (dt > 0 ? a * dt * dt : 0);
    };

    return {
      scene, camera,
      update(t) {
        uT.value = t;
        shared.uTime.value = t;
        shared.uSunDir.value.copy(SUN);
        shared.uDapple.value = 0;
        train.position.x = tailX(t);
      },
    };
  },
};
