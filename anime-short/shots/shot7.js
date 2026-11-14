// Shot 7 — inside a parked car looking up through the windshield at a railway overpass.
// A long blue train slides off to the left; catenary gantries, road signs, trees, painted sky.
// The car interior is a painted silhouette overlay attached to the camera (static camera).

const W = 1280, H = 720;

export default {
  duration: 3.042,
  credit: { role: 'STORYLINE', cx: 0.795, ry: 0.644, ny: 0.694 },
  post: {
    bloom: 0.18, bloomRadius: 0.6, bloomThreshold: 0.92,
    exposure: 1.0, contrast: 0.95, saturation: 0.86,
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

    scene.add(makeSky({ zenith: '#4a76a0', mid: '#5482a4', horizon: '#6a92ae', haze: 0.3 }));

    /* ---------------- painted material with dapple ---------------- */
    const uDap = { value: 0 };
    const DAPPLE_GLSL = `
      ${NOISE_GLSL}
      uniform float uT;
      float dapple(vec3 p, float scale, float cover, float soft){
        vec2 q = vec2(p.x + p.z * 0.6, p.y + p.z * 0.35) * scale;
        q += vec2(sin(uT * 0.9 + q.y * 0.5), cos(uT * 0.7 + q.x * 0.4)) * 0.06;
        float n = fbm(q) + 0.22 * vnoise(q * 5.0 + 3.1);
        return smoothstep(cover - soft, cover + soft, n);
      }`;
    const uT = { value: 0 };
    function paintMat({ shadow = '#333', lit = '#999', map = null, cover = 0.62, scale = 0.35, dap = 1.0, alphaTest = 0.5,
      side = THREE.FrontSide, varAmt = 0.18, varScale = 0.25, litFace = 0.0, rim = null, soft = 0.02, litMax = 1.0, boost = 1.0, coverX = [0, 1, 0] } = {}) {
      return new THREE.ShaderMaterial({
        uniforms: { cS: { value: col(shadow) }, cL: { value: col(lit) }, tMap: { value: map }, uHasMap: { value: map ? 1 : 0 },
          uCover: { value: cover }, uScale: { value: scale }, uDap: { value: dap }, uSun: { value: SUN }, uT,
          uAT: { value: alphaTest }, uVar: { value: varAmt }, uVS: { value: varScale }, uLitFace: { value: litFace },
          uSoftE: { value: soft }, uLitMax: { value: litMax }, uBoost: { value: boost }, uCovX: { value: new THREE.Vector3(...coverX) } },
        vertexShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
          void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vW; varying vec3 vN;
          uniform vec3 cS, cL, uSun; uniform sampler2D tMap; uniform float uHasMap, uCover, uScale, uDap, uAT, uVar, uVS, uLitFace, uSoftE, uLitMax, uBoost; uniform vec3 uCovX;
          ${DAPPLE_GLSL}
          void main(){
            vec4 m = uHasMap > 0.5 ? texture2D(tMap, vUv) : vec4(1.);
            if (m.a < uAT) discard;
            float ndl = dot(normalize(vN), uSun);
            float face = smoothstep(-0.05, 0.1, ndl);
            float cov = uCover - smoothstep(uCovX.x, uCovX.y, vW.x) * uCovX.z;
            float d = mix(1.0, dapple(vW, uScale, cov, uSoftE), uDap);
            float L = max(face * d, uLitFace * face) * uLitMax;
            vec3 c = mix(cS, cL * uBoost, L) * m.rgb;
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
      g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
      g.lineWidth = 6;
      const n = 2, s = h / n;
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
        const v = 215 + r() * 40;
        g.fillStyle = `rgba(${v},${v * 0.97},${v * 0.95},0.3)`;
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
    const faceMat = paintMat({ shadow: '#2e2623', lit: '#7e604a', map: concreteTex, cover: 0.86, scale: 0.45, varAmt: 0.06, soft: 0.07, litMax: 0.55, coverX: [4, 20, 0.04] });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(260, 4.6, 11), faceMat);
    slab.position.set(-100, -2.2, -5.5); bridge.add(slab);
    const lowerMat = paintMat({ shadow: '#362d28', lit: '#76604c', map: concreteTex, cover: 0.86, scale: 0.4, varAmt: 0.06, soft: 0.07, litMax: 0.5, coverX: [4, 20, 0.04] });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(94, 20, 9), lowerMat);
    lower.position.set(-10, -14.5, -6.5); bridge.add(lower);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 3), lowerMat);
    pier.position.set(-106, -14.5, -3.5); bridge.add(pier);
    // shaded fascia band just under the railing
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(260, 1.5, 0.4), paintMat({ shadow: '#261e1f', lit: '#6a5040', map: concreteTex, cover: 0.9, scale: 0.45, varAmt: 0.05, soft: 0.07, litMax: 0.5 }));
    fascia.position.set(-100, -0.75, 0.2); bridge.add(fascia);
    // dark underside of the slab
    const under = new THREE.Mesh(new THREE.BoxGeometry(260, 0.3, 10), new THREE.MeshBasicMaterial({ color: col('#1c1718') }));
    under.position.set(-100, -4.55, -5.5); bridge.add(under);
    // railing: posts + rails
    const railMat = paintMat({ shadow: '#6a7080', lit: '#d0ccc4', cover: 0.6, scale: 0.5 });
    const rail2Mat = paintMat({ shadow: '#3c4050', lit: '#9a948c', cover: 0.6, scale: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);
    const posts = new THREE.InstancedMesh(postGeo, railMat, 80);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 80; i++) { m4.makeTranslation(25 - i * 3.6, 0.55, 0.1); posts.setMatrixAt(i, m4); }
    bridge.add(posts);
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(260, 0.12, 0.1), railMat); rail1.position.set(-100, 1.05, 0.0); bridge.add(rail1);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(260, 0.1, 0.08), rail2Mat); rail2.position.set(-100, 0.55, 0.0); bridge.add(rail2);

    /* ---------------- train ---------------- */
    const trainTex = paintTexture('s7_train', 1024, 128, (g, w, h, r) => {
      g.fillStyle = '#1a1632'; g.fillRect(0, 0, w, h);             // navy/indigo body (in shade)
      g.fillStyle = '#b8c2dc'; g.fillRect(0, 0, w, 8);             // pale roof rim
      g.fillStyle = '#2c2c58'; g.fillRect(0, 8, w, 8);
      g.fillStyle = '#26263e'; g.fillRect(0, 32, w, 48);           // window band
      for (let i = 0; i < 8; i++) {                                // windows
        const x = 40 + i * 122;
        g.fillStyle = '#16162a'; g.fillRect(x + 4, 37, 84, 38);
        g.fillStyle = 'rgba(120,130,170,0.35)'; g.fillRect(x + 6, 39, 34, 5);
      }
      g.fillStyle = '#1e1c36'; g.fillRect(0, 98, w, 30);
      g.strokeStyle = '#17152c'; g.lineWidth = 3;
      for (const x of [20, w - 20]) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x, h); g.stroke(); }
    });
    const trainMat = paintMat({ shadow: '#ffffff', lit: '#ffd2a8', boost: 2.0, litMax: 0.5, soft: 0.08, map: trainTex, cover: 0.78, scale: 0.45, varAmt: 0.05 });
    const train = new THREE.Group();
    bridge.add(train);
    const CAR = 20, NCARS = 14;
    for (let i = 0; i < NCARS; i++) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(CAR - 0.2, 3.6, 2.9), trainMat);
      car.position.set(-(i + 0.5) * CAR, 2.2, -3.0);
      train.add(car);
    }
    // rounded tail cab at local x = 0 (the train's rear end, near side)
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 3.6, 16, 1, false, 0, Math.PI), trainMat);
    cab.scale.set(1.0, 1, 1.6); cab.rotation.y = 0; cab.position.set(-0.3, 2.2, -3.0);
    cab.rotation.y = Math.PI / 2; cab.scale.set(1.0, 1, 1.0);
    train.add(cab);

    /* ---------------- catenary gantries ---------------- */
    const rustMat = paintMat({ shadow: '#33231f', lit: '#a87650', map: latWhite, cover: 0.62, scale: 0.6, side: THREE.DoubleSide, varAmt: 0.1 });
    const redMat = paintMat({ shadow: '#3a2420', lit: '#7e4e40', map: latWhite, cover: 0.55, scale: 0.6, side: THREE.DoubleSide, varAmt: 0.1 });
    const greyMat = paintMat({ shadow: '#4c4a5a', lit: '#c8a060', map: latWhite, cover: 0.62, scale: 0.6, side: THREE.DoubleSide, varAmt: 0.1 });
    const yelMat = paintMat({ shadow: '#9a8048', lit: '#e0c27a', map: latWhite, cover: 0.4, scale: 0.6, side: THREE.DoubleSide, varAmt: 0.1 });
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
    beam([-41, 0, -1], [-41, 19.5, -1], 3.0, 3.0, rustMat, 4.4);
    beam([-41, 18.4, -1], [-32, 9.6, -12], 1.8, 2.0, greyMat, 3.0);
    beam([-32, 0, -12], [-32, 10, -12], 0.7, 0.7, yelMat, 1.4);
    // right gantry (behind the train, tilted)
    beam([0, 0, -10], [6, 22, -12], 2.0, 2.0, redMat, 3.0);
    beam([4, 15, -11], [14, 18, -6], 1.0, 1.0, redMat, 2.0);
    // far left gantry
    beam([-76, 0, -1], [-76, 8, -1], 1.3, 1.3, yelMat, 2.0);
    beam([-76, 7.4, -1], [-68, 5, -14], 1.3, 1.3, yelMat, 2.0);

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
    const signMat = (map) => paintMat({ shadow: '#4a4258', lit: '#e8dcd6', map, cover: 0.6, scale: 1.6, alphaTest: 0.5, side: THREE.DoubleSide, varAmt: 0.06 });
    const signs = new THREE.Group();
    signs.position.set(-1.02, 0, -9);
    scene.add(signs);
    const poleMat = paintMat({ shadow: '#3a3a48', lit: '#b8b0a8', cover: 0.5, scale: 2.0 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 8, 8), poleMat); pole.position.set(0, 0, 0); signs.add(pole);
    const tri = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62), signMat(signTri)); tri.position.set(0, 2.4, 0.08); signs.add(tri);
    const rnd = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), signMat(signRound)); rnd.position.set(0, 0.75, 0.08); signs.add(rnd);

    /* ---------------- clouds ---------------- */
    // painted cloud cards: layered soft puffs (shadow -> mid -> light), canvas blurred for a gouache edge
    function cloudCard(seed, w, h, nP) {
      const tex = paintTexture('s7_cloud' + seed, 512, 256, (g, W2, H2) => {
        const r = rng(seed * 13 + 5);
        g.clearRect(0, 0, W2, H2);
        const puffs = [];
        // a few slanted streak rows of flattened, irregular puffs (broken cumulus)
        const rows = 2 + Math.floor(r() * 2);
        for (let k = 0; k < rows; k++) {
          const y0 = lerp(0.4, 0.66, r()), slope = lerp(-0.12, 0.05, r());
          const x0 = lerp(0.06, 0.3, r()), x1 = lerp(0.65, 0.94, r());
          const n = Math.round(nP * 1.6 / rows);
          for (let i = 0; i < n; i++) {
            if (r() < 0.12) continue;                                   // gaps -> broken look
            const x = lerp(x0, x1, r());
            const y = y0 + (x - 0.5) * slope - Math.pow(r(), 2) * 0.16;
            const rad = lerp(0.05, 0.12, r());
            puffs.push([x * W2, y * H2, rad * H2 * 1.4, lerp(1.6, 2.6, r())]);
          }
        }
        const layer = (color, dy, k) => {
          g.fillStyle = color;
          for (const [x, y, rr, asp] of puffs) { g.beginPath(); g.ellipse(x + dy * rr * 0.4, y + dy * rr, rr * k * asp, rr * k, -0.08, 0, Math.PI * 2); g.fill(); }
        };
        layer('#63809f', 0.0, 1.0);
        layer('#7689a4', -0.25, 0.82);
        layer('#8796ad', -0.5, 0.6);
        layer('#939fb2', -0.7, 0.36);
        // painterly breakup: small bites out of the edges
        g.globalCompositeOperation = 'destination-out';
        // trim a few base bites only (keeps interiors solid)
        for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(r() * W2, lerp(0.66, 0.8, r()) * H2, lerp(8, 20, r()) * 2, lerp(4, 9, r()), 0, 0, Math.PI * 2); g.fill(); }
        g.globalCompositeOperation = 'source-over';
        // flat-ish base
        g.globalCompositeOperation = 'destination-out';
        const fade = g.createLinearGradient(0, H2 * 0.68, 0, H2 * 0.82);
        fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
        g.fillStyle = fade; g.fillRect(0, H2 * 0.68, W2, H2 * 0.32);
        g.globalCompositeOperation = 'source-over';
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      m.renderOrder = -5;
      return m;
    }
    const clouds = [
      [38, 92, -200, 125, 62, 3, 26], [98, 110, -200, 75, 40, 5, 14], [152, 134, -200, 100, 55, 8, 20], [-2, 80, -200, 55, 28, 11, 10],
      [190, 106, -200, 55, 28, 13, 10], [-92, 100, -200, 40, 18, 17, 8], [-104, 55, -200, 34, 16, 19, 8], [64, 128, -200, 64, 30, 23, 12],
      [120, 150, -210, 60, 26, 29, 10], [-14, 100, -200, 45, 22, 31, 9], [212, 140, -200, 60, 28, 37, 12],
      [-70, 125, -200, 30, 12, 41, 7], [-118, 85, -200, 26, 11, 43, 7], [-84, 40, -200, 24, 10, 47, 6], [108, 78, -200, 40, 16, 53, 8],
    ];
    for (const [x, y, z, w, h, sd, n] of clouds) {
      const c = cloudCard(sd, w, h, n);
      c.position.set(x, y, z); c.lookAt(0, 0, 0); scene.add(c);
    }

    /* ---------------- trees ---------------- */
    // big tree seen through the side window (left)
    const treeL = [];
    { const r = rng(77);
      // canopy envelope: x edge (toward the pillar) as a function of height
      for (let i = 0; i < 95; i++) {
        const y = lerp(-2, 24, r());
        const edge = -10.5 - Math.max(0, y - 9) * 0.45 - Math.max(0, 3 - y) * 0.5;
        const x = lerp(-26, edge, Math.pow(r(), 0.55));
        treeL.push([x, y, lerp(-17, -22, r()), lerp(1.0, 1.7, r())]);
      } }
    scene.add(makeFoliage({ clumps: treeL, maxCards: 20000,
      density: 2.6, cardSize: 0.62, kind: 'small', seed: 21, wind: 0.05, shell: 0.5, lightWrap: 0.8, sizeJitter: 0.4,
      dark: '#164634', mid: '#22644a', light: '#3a8a60', highlight: '#76b87e' }));
    // tree behind the bridge on the right
    scene.add(makeFoliage({ clumps: [[38, 20, -60, 7], [46, 18, -58, 6], [30, 17, -64, 5.5]],
      density: 6, cardSize: 1.6, kind: 'small', seed: 31, wind: 0.02,
      dark: '#1a2622', mid: '#28382e', light: '#3a5040', highlight: '#58705a', lightWrap: 0.3 }));
    scene.add(makeFoliage({ clumps: [[8, 15, -66, 3.5], [14, 15.5, -68, 3]],
      density: 6, cardSize: 1.3, kind: 'small', seed: 33, wind: 0.02,
      dark: '#1c3a32', mid: '#2c5a46', light: '#4a7a58', highlight: '#7aa070' }));
    // overhanging branch above the car (top right)
    scene.add(makeFoliage({ clumps: [[3, 6.6, -8, 1.0], [5, 6.2, -8, 1.1], [7, 6.4, -8, 1.2], [9, 6.8, -8, 1.2], [1.6, 4.9, -8.5, 0.6], [2.6, 5.4, -8.5, 0.7], [3.2, 4.3, -8.5, 0.4], [4.2, 4.0, -8.5, 0.35]],
      density: 1.4, cardSize: 0.32, kind: 'small', seed: 41, wind: 0.06, shell: 0.3,
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
          c += arc(p, vec2(0.95, 1.12), 0.22, 0.1, 0.32);
          c += arc(p, vec2(0.12, -0.62), 0.78, 0.12, 0.15);
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
