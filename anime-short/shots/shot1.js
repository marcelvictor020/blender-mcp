// Shot 1 — golden-hour low-angle street view up at an elevated railway.
// Static telephoto camera looking up; a commuter train crosses the viaduct left -> right.
// Geometry is laid out by un-projecting reference pixel coordinates (1280x720) onto world planes,
// so the big shapes land where they are in the reference.

export default {
  duration: 3.958,
  credit: { role: 'CREATED BY', cx: 0.744, ry: 0.6875, ny: 0.736 },
  post: {
    bloom: 0.45, bloomRadius: 0.55, bloomThreshold: 0.78,
    exposure: 0.93, contrast: 1.06, saturation: 1.0,
    lift: [0.03, 0.015, 0.0], gamma: [1.02, 1.0, 0.98], gain: [1.03, 1.0, 0.95],
    vignette: 0.2, grain: 0.03, ca: 0.0012, soft: 0.12,
  },
  build(core) {
    const { THREE, makeSky, makeCloud, makeFoliage, lightRig, toon, flat, box, cyl, makeWire, makeMotes, paintTexture, shared, rng, lerp } = core;
    const scene = new THREE.Scene();

    /* ---------------- camera ---------------- */
    const FOV = 25, PITCH = 15 * Math.PI / 180;
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 3000);
    camera.position.set(0, 1.5, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(PITCH, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const CP = camera.position.clone();
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    // ray direction for reference pixel (1280x720)
    const ray = (px, py) => V3(px / 640 - 1, 1 - py / 360, 0.5).unproject(camera).sub(CP).normalize();
    const onPlane = (px, py, P0, N) => { const d = ray(px, py); const t = P0.clone().sub(CP).dot(N) / d.dot(N); return CP.clone().add(d.multiplyScalar(t)); };
    const onY = (px, py, y) => onPlane(px, py, V3(0, y, 0), V3(0, 1, 0));
    const atDist = (px, py, D) => { const d = ray(px, py); const h = Math.hypot(d.x, d.z); return CP.clone().add(d.multiplyScalar(D / h)); }; // horizontal distance D

    /* ---------------- sky + light ---------------- */
    scene.add(makeSky({ zenith: '#3c6c98', mid: '#5996b8', horizon: '#8cbcc4', haze: 0.4, horizonY: 0.0 }));
    const SUN = V3(-0.3, 0.3, 0.9).normalize();
    const rig = lightRig(scene, { sunDir: SUN.toArray(), sunColor: '#ffcf6e', sunIntensity: 3.6, sky: '#8aa8cc', ground: '#6a7088', hemiIntensity: 0.9,
      ambient: '#7a8aa8', ambientIntensity: 0.8, shadows: true, shadowBox: 45, shadowRes: 2048, target: [5, 10, -40] });
    rig.sun.shadow.camera.far = 400; rig.sun.shadow.bias = -0.0008; rig.sun.shadow.normalBias = 0.04;
    rig.sun.shadow.camera.updateProjectionMatrix();

    /* ---------------- clouds (top right) : painted camera-space card ---------------- */
    scene.add(camera);
    const tanV = Math.tan(FOV / 2 * Math.PI / 180), tanH = tanV * 16 / 9;
    const camCard = (x0, y0, x1, y1, Z, mat) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) / 640 * tanH * Z, (y1 - y0) / 360 * tanV * Z), mat);
      m.position.set(((x0 + x1) / 1280 - 1) * tanH * Z, (1 - (y0 + y1) / 720) * tanV * Z, -Z);
      camera.add(m); return m;
    };
    const CX0 = 600, CY0 = -20, CX1 = 1100, CY1 = 300, CS = 2;
    const cloudTex = paintTexture('s1_clouds2', (CX1 - CX0) * CS, (CY1 - CY0) * CS, (g, w, h, r) => {
      g.clearRect(0, 0, w, h);
      const stroke = (px, py, rx, ry, rot, c, a) => {
        const x = (px - CX0) * CS, y = (py - CY0) * CS;
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, Math.max(ry, 0.5) / rx);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx * CS);
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(0.55, `rgba(${c},${a * 0.7})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx * CS, 0, 7); g.fill(); g.restore();
      };
      const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t)).join(',');
      const LIT = [246, 247, 242], MID = [200, 214, 224], SH = [128, 156, 186];
      // [cx, cy, rx, ry, rot, n, alpha]
      const regions = [
        [905, 78, 125, 50, -0.42, 320, 0.26], [985, 18, 70, 30, -0.3, 150, 0.26], [865, 128, 62, 22, -0.25, 110, 0.2],
        [800, 112, 40, 16, -0.3, 50, 0.12], [738, 82, 52, 20, -0.5, 80, 0.13], [716, 124, 30, 7, -0.25, 30, 0.12],
        [785, 196, 75, 6, -0.15, 50, 0.1], [930, 176, 50, 7, -0.2, 40, 0.1], [960, 246, 52, 6, -0.05, 40, 0.1],
        [1012, 236, 30, 7, -0.1, 30, 0.12], [956, 190, 16, 8, -0.2, 25, 0.14], [1050, 60, 30, 14, -0.4, 40, 0.12],
      ];
      for (const [cx, cy, rx, ry, rot, n, a] of regions) {
        const c = Math.cos(rot), s = Math.sin(rot);
        for (let i = 0; i < n; i++) {
          let u, v; do { u = r() * 2 - 1; v = r() * 2 - 1; } while (u * u + v * v > 1);
          v = v * 0.9 + (r() - 0.5) * 0.2;
          const px = cx + u * rx * c - v * ry * s, py = cy + u * rx * s + v * ry * c;
          const shade = Math.min(1, Math.max(0, v * 0.6 + 0.45 + (r() - 0.5) * 0.3));
          const col = shade < 0.5 ? mix(LIT, MID, shade * 2) : mix(MID, SH, (shade - 0.5) * 2);
          const len = rx * lerp(0.18, 0.4, r()) * (1 - 0.5 * Math.abs(u));
          stroke(px, py, len, len * lerp(0.18, 0.35, r()), rot + (r() - 0.5) * 0.35, col, a * (1 - 0.4 * Math.abs(u)));
        }
        // lit crest along the upper edge
        for (let i = 0; i < n / 4; i++) {
          const u = r() * 1.8 - 0.9, v = -0.75 + (r() - 0.5) * 0.3;
          const px = cx + u * rx * c - v * ry * s, py = cy + u * rx * s + v * ry * c;
          const len = rx * lerp(0.1, 0.25, r());
          stroke(px, py, len, len * 0.3, rot + (r() - 0.5) * 0.3, LIT.join(','), a * 1.3 * (1 - Math.abs(u) * 0.6));
        }
      }
    });
    const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false });
    const cloudCard = camCard(CX0, CY0, CX1, CY1, 800, cloudMat); cloudCard.renderOrder = -5;

    /* ---------------- materials ---------------- */
    const steel = toon({ color: '#cfc8bb' });
    const poleMat = toon({ color: '#e0b070' });

    /* ---------------- viaduct frame ---------------- */
    const YTOP = 14.5;                       // parapet top (world y)
    const A = onY(300, 240, YTOP), B = onY(1000, 392, YTOP);
    const U = B.clone().sub(A).setY(0).normalize();
    const UP = V3(0, 1, 0);
    const N = U.clone().cross(UP).negate();  // horizontal, toward camera
    if (N.dot(CP.clone().sub(A)) < 0) N.negate();
    // local (s along U, h up, d toward camera) relative to A
    const via = new THREE.Group();
    via.position.copy(A);
    via.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, UP, N));
    scene.add(via);
    const local = (px, py, d) => { const p = onPlane(px, py, A.clone().add(N.clone().multiplyScalar(d)), N).sub(A); return [p.dot(U), p.y]; };
    const vbox = (s0, s1, h0, h1, d0, d1, mat, cast = true, recv = true) => {
      const m = box(s1 - s0, h1 - h0, d1 - d0, mat, (s0 + s1) / 2, (h0 + h1) / 2, (d0 + d1) / 2);
      m.castShadow = cast; m.receiveShadow = recv; via.add(m); return m;
    };
    // viaduct toon material with a painted sun mask: direct light *= k * (s + slope*h < sB)
    const vtoon = (color, { k = 1, sB = 1e4, slope = 0, soft = 0.4 } = {}) => {
      const m = toon({ color });
      const ob = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        ob(sh, r);
        sh.uniforms.vA = { value: A }; sh.uniforms.vU = { value: U };
        sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vWPos;', 'varying vec3 vWPos; uniform vec3 vA, vU;')
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            { vec3 q = vWPos - vA; float ss = dot(q, vU) + ${slope.toFixed(3)} * q.y;
              reflectedLight.directDiffuse *= ${k.toFixed(3)} * (1.0 - smoothstep(${(sB - soft).toFixed(3)}, ${(sB + soft).toFixed(3)}, ss)); }`);
      };
      m.customProgramCacheKey = () => 'vtoon' + [k, sB, slope, soft].join('_');
      return m;
    };
    const SB = local(805, 380, 0)[0];
    const concLit = vtoon('#efe2c8', { sB: SB, slope: 0.6 });
    const concDark = vtoon('#9a8a88', { sB: SB, slope: 0.6 });
    const S0 = -90, S1 = 260;
    const bandBot = local(420, 312, 0)[1];
    const wallBot = local(420, 470, -2.2)[1];
    const girdTop = local(700, 445, 0.6)[1];
    const girdBot = local(700, 612, 0.6)[1];
    // parapet / edge beam (lit band)
    vbox(S0, S1, bandBot, 0, -1.2, 0, vtoon('#e6c890', { sB: SB, slope: 0.6 }), false, true);
    // deck slab underside (overhang)
    vbox(S0, S1, bandBot - 0.15, bandBot + 0.4, -3.0, -0.6, concDark, false, true);
    vbox(S0, S1, bandBot - 0.6, bandBot + 0.4, -14, -3.0, concDark, false, false);
    // web wall (set back) — receives bracket shadows
    vbox(S0, S1, wallBot, bandBot, -3.0, -2.2, concLit, false, true);
    // brackets under overhang
    const bracketMat = vtoon('#dccaa8', { sB: SB, slope: 0.6 });
    for (let s = -40; s < S1; s += 9.5) {
      const g = new THREE.Group();
      const sh = new THREE.Shape();
      const H = 2.2, D = 2.0;
      sh.moveTo(0, 0); sh.lineTo(D, 0); sh.lineTo(D, -0.35); sh.lineTo(0.35, -H); sh.lineTo(0, -H); sh.lineTo(0, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
      const m = new THREE.Mesh(geo, bracketMat); m.castShadow = true; m.receiveShadow = true;
      // shape x -> local d (toward camera), shape y -> h
      m.rotation.y = -Math.PI / 2; // shape x axis -> +z(local d)
      g.add(m); g.position.set(s, bandBot, -2.2); via.add(g);
    }
    // lower girder (cross beam, ribbed) — mostly in shadow
    const girdMat = vtoon('#bfc4cc', { k: 1, sB: local(330, 590, 0)[0], slope: 0 });
    vbox(S0, S1, girdBot, girdTop, -1.0, 0.6, girdMat);
    const ribMat = vtoon('#e4e6ea', { k: 0 });
    for (let k = 1; k <= 3; k++) { const hh = lerp(girdBot, girdTop, k / 4); vbox(S0, S1, hh - 0.1, hh + 0.06, 0.6, 0.85, ribMat); }
    // piers
    const pierMat = vtoon('#8a8088', { k: 0 });
    const pierTop = local(370, 532, 1.6)[1];
    for (const px of [370, 478, 880, 965, 1180]) {
      const sp = local(px, 600, 1.6)[0];
      vbox(sp - 0.8, sp + 0.8, -16, pierTop, 1.0, 2.2, pierMat);
      vbox(sp - 0.95, sp + 0.95, pierTop - 0.5, pierTop, 0.9, 2.3, vtoon('#b4a69c', { k: 0 }));
    }
    // backdrop under the viaduct: shaded buildings with a few sunlit patches
    {
      const bt = paintTexture('s1_under', 512, 128, (g, w, h, r) => {
        g.fillStyle = '#4a5468'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3c4254'; for (let i = 0; i < 12; i++) g.fillRect(r() * w, 0, 10 + r() * 30, h);
        g.fillStyle = '#e8b25e'; for (const [x, y, ww, hh] of [[60, 70, 50, 40], [150, 90, 30, 30], [330, 60, 70, 50], [420, 80, 40, 40]]) g.fillRect(x, y, ww, hh);
        g.fillStyle = '#9fc2d8'; g.fillRect(250, 30, 30, 30);
      });
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(120, 12), flat({ map: bt }));
      bm.position.set(20, girdBot - 6, -14); via.add(bm);
    }
    // railing posts on parapet + top rail
    const railMat = vtoon('#f0e6d4', { sB: SB + 2, slope: 0.6 });
    {
      const ps = [360, 690, 800, 905, 1000].map(px => local(px, 300, 0.15)[0]);
      const step = (ps[4] - ps[1]) / 3;
      for (let k = -6; k < 0; k++) ps.push(ps[0] + k * step);
      for (let k = 1; k < 12; k++) ps.push(ps[4] + k * step);
      for (const sp of ps) vbox(sp - 0.12, sp + 0.12, bandBot + 0.2, 1.5, 0.05, 0.3, railMat, true, true);
      vbox(S0, S1, 1.42, 1.5, 0.05, 0.25, railMat, false, true);
      vbox(S0, S1, 0.75, 0.81, 0.05, 0.25, railMat, false, true);
    }
    // hanging hooks (cable brackets) under the deck on the right part
    for (let s = 30; s < S1; s += 8) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 16, Math.PI * 0.6), railMat);
      c.position.set(s, bandBot - 1.2, 0.3); c.rotation.z = Math.PI * 0.9; via.add(c);
    }

    /* ---------------- train ---------------- */
    const trainTex = paintTexture('s1_train2', 1024, 256, (g, w, h) => {
      // visible part above the parapet = top ~170 rows
      g.fillStyle = '#f1dfc2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8aea4'; g.fillRect(0, 0, w, 8);
      g.fillStyle = '#e2462a'; g.fillRect(0, 12, w, 14);       // upper stripe (under roof)
      g.fillStyle = '#e2462a'; g.fillRect(0, 122, w, 16);      // lower stripe
      const win = '#6c6f7a';
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 250;
        g.fillStyle = '#d2c2a8'; g.fillRect(x, 30, 64, 226);                    // door
        g.fillStyle = win; g.fillRect(x + 6, 40, 22, 66); g.fillRect(x + 36, 40, 22, 66);
        if (i < 4) { g.fillStyle = win; g.fillRect(x + 90, 40, 140, 62); g.fillStyle = 'rgba(255,230,190,0.28)'; g.fillRect(x + 90, 40, 140, 14); g.fillStyle = '#e8d8bc'; g.fillRect(x + 158, 40, 5, 62); }
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 250) g.fillRect(x, 0, 3, h);
    });
    const trainMat = toon({ color: '#ffffff', map: trainTex, dapple: false });
    const trainRoof = toon({ color: '#9a9590' });
    const train = new THREE.Group(); via.add(train);
    const CAR = 20, NCARS = 10, TD = -2.9, TH0 = -1.0, TH1 = 2.1;
    for (let i = 0; i < NCARS; i++) {
      const s = -i * (CAR + 0.6) - CAR / 2;
      const body = box(CAR, TH1 - TH0, 2.9, [trainMat, trainMat, trainRoof, trainRoof, trainMat, trainMat], s, (TH0 + TH1) / 2, TD);
      body.castShadow = true; body.receiveShadow = true; train.add(body);
      // roof equipment
      train.add(box(CAR * 0.9, 0.25, 2.2, trainRoof, s, TH1 + 0.12, TD));
    }
    // front cab (rounded-ish)
    train.add(box(0.6, TH1 - TH0 - 0.2, 2.8, toon({ color: '#e8d6b4' }), 0.3, (TH0 + TH1) / 2 - 0.1, TD));

    /* ---------------- catenary gantries ---------------- */
    const latticeTex = paintTexture('s1_lattice', 256, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineCap = 'square';
      g.lineWidth = 12; g.beginPath(); g.moveTo(0, 6); g.lineTo(w, 6); g.moveTo(0, h - 6); g.lineTo(w, h - 6); g.stroke();
      g.lineWidth = 7; g.beginPath();
      for (let x = 0; x <= w; x += 64) { g.moveTo(x, 4); g.lineTo(x + 32, h - 4); g.lineTo(x + 64, 4); g.moveTo(x, 4); g.lineTo(x, h - 4); }
      g.stroke();
    }, { srgb: false });
    const truss = (len, w, color = '#d8cfc0') => {
      const t = latticeTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(len / w)), 1); t.needsUpdate = true;
      const mat = toon({ color, alphaMap: t, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, w), mat); return m;
    };
    const gantry = (s, dFar, dNear, hTop, postW, beamW, color) => {
      const g = new THREE.Group();
      const post = truss(hTop + 0.5, postW, color); post.rotation.z = Math.PI / 2; post.position.set(s, (hTop + 0.5) / 2, dFar); g.add(post);
      const beam = truss(dNear - dFar + 1, beamW, color); beam.rotation.y = Math.PI / 2; beam.position.set(s, hTop - beamW / 2, (dFar + dNear) / 2); g.add(beam);
      via.add(g); return g;
    };
    const projPx = (v) => { const p = v.clone().project(camera); return [(p.x + 1) * 640, (1 - p.y) * 360]; };
    const fromLocal = (s, h, d) => A.clone().add(U.clone().multiplyScalar(s)).add(V3(0, h, 0)).add(N.clone().multiplyScalar(d));
    const solveBeam = (xf, yf, xn, yn) => {
      let best = null;
      for (let dF = -4; dF <= 3; dF += 0.25) {
        const [s, h] = local(xf, yf, dF);
        for (let dN = dF - 30; dN <= dF - 2; dN += 0.25) {
          const [px, py] = projPx(fromLocal(s, h, dN)); const e = (px - xn) ** 2 + (py - yn) ** 2;
          if (!best || e < best.e) best = { e, s, h, dF, dN };
        }
      }
      return best;
    };
    const gantryAt = (xf, yf, xn, yn, postW, beamW, color, postX = null) => {
      const b = solveBeam(xf, yf, xn, yn);
      const sp = postX !== null ? local(postX, 300, b.dF)[0] : b.s;
      const g = new THREE.Group();
      const post = truss(b.h + 1.5, postW, color); post.rotation.z = Math.PI / 2; post.position.set(sp, (b.h + 1.5) / 2 - 1.5, b.dF); g.add(post);
      const beam = truss(b.dF - b.dN + 0.6, beamW, color); beam.rotation.y = Math.PI / 2; beam.position.set(b.s, b.h - beamW / 2, (b.dF + b.dN) / 2); g.add(beam);
      via.add(g); return b;
    };
    const g1 = gantryAt(488, 18, 300, 155, 0.9, 0.75, '#efdcb4', 480);
    const g2 = gantryAt(812, 100, 545, 262, 1.1, 0.75, '#a8a49e', 828);
    const g3 = gantryAt(1040, 270, 855, 350, 0.9, 0.7, '#8e8e96', 1003);
    // round catenary pole (near side, behind traffic light)
    { const sp = local(748, 300, -0.6)[0], ht = local(748, 112, -0.6)[1]; const p = cyl(0.16, 0.18, ht + 1, steel, sp, (ht - 1) / 2, -0.6); p.castShadow = true; via.add(p); via.add(cyl(0.22, 0.22, 0.25, steel, sp, ht, -0.6)); }
    // overhead wires along the line
    const wireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#57524e') });
    for (const [hh, dd] of [[6.0, -3.5], [6.8, -3.5], [6.0, -8], [6.8, -8], [9.6, -1.0]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, S1 - S0, 4), wireMat);
      w.rotation.z = Math.PI / 2; w.position.set((S0 + S1) / 2, hh, dd); via.add(w);
    }

    /* ---------------- tan apartment tower (behind) ---------------- */
    {
      const Z = -95;
      const FL = 3.0;   // floor height (m) ; texture = 8 floors
      const towerTex = paintTexture('s1_tower', 512, 512, (g, w, h, r) => {
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f8e0a0'); gr.addColorStop(1, '#f4d088');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        const fl = 64;
        for (let y = 0; y < h; y += fl) {
          // left balcony column (recessed, dark)
          g.fillStyle = '#9a5a28'; g.fillRect(70, y + 8, 70, 42); g.fillStyle = '#c27a36'; g.fillRect(74, y + 12, 28, 34);
          g.fillStyle = '#f9de96'; g.fillRect(64, y + 46, 84, 8);
          // windows pairs
          for (const x of [200, 300, 400]) {
            g.fillStyle = '#b78048'; g.fillRect(x, y + 14, 60, 34);
            g.fillStyle = '#d9a45c'; g.fillRect(x + 4, y + 18, 24, 26); g.fillStyle = '#c88e4c'; g.fillRect(x + 32, y + 18, 24, 26);
          }
          g.fillStyle = 'rgba(150,80,30,0.35)'; g.fillRect(0, y + 54, w, 4);
          g.fillStyle = 'rgba(255,240,190,0.5)'; g.fillRect(0, y + 58, w, 3);
        }
        g.fillStyle = '#fbe2a0'; g.fillRect(0, 0, 14, h); g.fillRect(170, 0, 12, h);
      });
      towerTex.wrapT = THREE.RepeatWrapping;
      const towerSide = flat({ color: '#c47a3a' });
      const L = onPlane(226, 300, V3(0, 0, Z), V3(0, 0, 1)), R = onPlane(560, 300, V3(0, 0, Z), V3(0, 0, 1));
      const w = R.x - L.x, H = 120;
      towerTex.repeat.set(1, H / (8 * FL));
      const t = box(w, H, 20, [towerSide, towerSide, towerSide, towerSide, flat({ map: towerTex }), towerSide], (L.x + R.x) / 2, H / 2, Z - 10);
      scene.add(t);
      // right stacked-balcony wing (projects toward camera)
      const Zw = Z + 6;
      const Rw = onPlane(690, 60, V3(0, 0, Zw), V3(0, 0, 1)), Lw = onPlane(545, 60, V3(0, 0, Zw), V3(0, 0, 1));
      const wingTex = paintTexture('s1_wing', 256, 512, (g, w2, h2) => {
        g.fillStyle = '#f0c070'; g.fillRect(0, 0, w2, h2);
        for (let y = 0; y < h2; y += 64) {
          g.fillStyle = '#7e4420'; g.fillRect(0, y, w2, 40);
          g.fillStyle = '#b8682c'; for (let x = 12; x < w2; x += 46) g.fillRect(x, y + 6, 30, 30);
          g.fillStyle = '#9c5426'; g.fillRect(0, y + 30, w2, 10);
          g.fillStyle = '#fbe0a0'; g.fillRect(0, y + 40, w2, 9);
          g.fillStyle = '#e2a85c'; g.fillRect(0, y + 49, w2, 15);
        }
      });
      wingTex.wrapT = THREE.RepeatWrapping; wingTex.repeat.set(1, H / (8 * FL));
      const wing = box(Rw.x - Lw.x, H, 12, [flat({ color: '#d08844' }), towerSide, towerSide, towerSide, flat({ map: wingTex }), towerSide], (Lw.x + Rw.x) / 2, H / 2, Zw - 6);
      scene.add(wing);
    }

    /* ---------------- right grey highrise (in shade) ---------------- */
    {
      const Z = -46;
      const L = onPlane(1062, 360, V3(0, 0, Z), V3(0, 0, 1));
      const dist = Math.hypot(L.x, L.z);
      const pxPerM = 1661 / dist;
      const floorM = 85 / pxPerM, colM = 75 / pxPerM;      // floor height & balcony bay width matching screen sizes
      const hrTex = paintTexture('s1_highrise', 384, 512, (g, w, h) => {
        // 3 bays x 4 floors ; bay = 128 px, floor = 128 px
        g.fillStyle = '#857565'; g.fillRect(0, 0, w, h);
        for (let f = 0; f < 4; f++) for (let b = 0; b < 3; b++) {
          const x = b * 128, y = f * 128 + (b % 2) * 64;
          for (const yy of [y, y - 512]) {
            g.fillStyle = '#5d6672'; g.fillRect(x + 22, yy + 82, 100, 26);         // slab underside (cool)
            g.fillStyle = '#9fa3a6'; g.fillRect(x + 22, yy + 70, 100, 12);         // slab edge
            g.fillStyle = '#181a22'; g.fillRect(x + 26, yy + 28, 92, 42);          // glass balustrade
            g.fillStyle = 'rgba(130,150,180,0.22)'; g.fillRect(x + 26, yy + 28, 92, 6);
            if (b % 2 === 1) { g.fillStyle = '#20222c'; g.fillRect(x + 50, yy - 30, 44, 40); g.strokeStyle = '#9a8f86'; g.lineWidth = 3; g.strokeRect(x + 50, yy - 30, 44, 40); }
          }
        }
        g.fillStyle = '#a49b90'; for (let b = 0; b <= 3; b++) g.fillRect(b * 128 - 2, 0, 18, h);    // pilasters
      });
      hrTex.wrapS = hrTex.wrapT = THREE.RepeatWrapping;
      const W = 30, H = 160;
      hrTex.repeat.set(W / (3 * colM), H / (4 * floorM));
      hrTex.offset.set(0.0, 0.0);
      const front = flat({ map: hrTex });
      const side = flat({ color: '#a7aaa8' });
      const hr = box(W, H, 3, [side, side, side, side, front, side], L.x + W / 2, H / 2 - 2, Z - 1.5);
      scene.add(hr);
    }

    /* ---------------- traffic signal ---------------- */
    const sig = new THREE.Group(); scene.add(sig);
    const SD = 15;
    const poleBase = atDist(518, 720, SD); poleBase.y = 0;
    const pole = cyl(0.1, 0.11, 13, poleMat, poleBase.x, 6.5, poleBase.z); pole.castShadow = true; sig.add(pole);
    {
      const armY = atDist(520, 222, SD).y;
      const lampC = atDist(720, 255, SD - 1.0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, lampC.distanceTo(V3(poleBase.x, armY, poleBase.z)), 6), poleMat);
      const mid = lampC.clone().add(V3(poleBase.x, armY, poleBase.z)).multiplyScalar(0.5); arm.position.copy(mid);
      arm.quaternion.setFromUnitVectors(V3(0, 1, 0), lampC.clone().sub(V3(poleBase.x, armY, poleBase.z)).normalize()); sig.add(arm);
      const head = new THREE.Group(); head.position.copy(lampC); head.lookAt(CP.clone().add(V3(-8, -4, 0))); sig.add(head);
      const hous = toon({ color: '#a89080', dapple: false });
      const housDark = toon({ color: '#4a3c44', dapple: false });
      head.add(box(0.72, 0.36, 0.26, hous, 0, 0, 0));
      for (const sx of [-1, 1]) { const c = cyl(0.18, 0.18, 0.26, hous, sx * 0.36, 0, 0, 20); c.rotation.x = Math.PI / 2; head.add(c); }
      const lampCols = ['#7cc0a8', '#ff9a30', '#ff3c24'], glow = [0.45, 1.6, 1.5];
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.36;
        const L = new THREE.Mesh(new THREE.CircleGeometry(0.135, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(lampCols[i]).multiplyScalar(glow[i]) }));
        L.position.set(x, 0, 0.135); head.add(L);
        const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.22, 20, 1, true, -Math.PI * 0.5, Math.PI * 1.0), housDark);
        visor.material.side = THREE.DoubleSide;
        visor.rotation.x = Math.PI / 2; visor.position.set(x, 0.0, 0.24); head.add(visor);
      }
      head.add(box(0.95, 0.12, 0.2, hous, 0, -0.24, -0.05));
      // small box on pole
      sig.add(box(0.22, 0.45, 0.22, poleMat, poleBase.x + 0.15, atDist(520, 155, SD).y, poleBase.z));
      sig.add(cyl(0.17, 0.17, 0.12, poleMat, poleBase.x, atDist(520, 70, SD).y, poleBase.z));
    }
    // pedestrian signal + kanji panel + turn-right sign
    {
      const pc = atDist(428, 445, SD - 0.3);
      const ped = new THREE.Group(); ped.position.copy(pc); ped.lookAt(CP); sig.add(ped);
      ped.add(box(0.42, 0.95, 0.25, toon({ color: '#d9c4a0' }), 0, 0, -0.12));
      const redMan = paintTexture('s1_pedred', 64, 64, (g, w, h) => { g.fillStyle = '#5a1a10'; g.fillRect(0, 0, w, h); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, '#ffe080'); gr.addColorStop(0.5, '#ff7a28'); gr.addColorStop(1, '#a02a10'); g.fillStyle = gr; g.fillRect(4, 4, 56, 56); });
      const blueMan = paintTexture('s1_pedblue', 64, 64, (g, w, h) => { g.fillStyle = '#c8e4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#88b4d4'; g.fillRect(8, 8, 48, 48); g.fillStyle = '#e8f6ff'; g.beginPath(); g.arc(32, 18, 6, 0, 7); g.fill(); g.fillRect(26, 26, 12, 26); });
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.36), new THREE.MeshBasicMaterial({ map: redMan, color: new THREE.Color(1.6, 1.4, 1.2) })); a.position.set(0, 0.22, 0.02); ped.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.36), new THREE.MeshBasicMaterial({ map: blueMan })); b.position.set(0, -0.2, 0.02); ped.add(b);
      const kanji = paintTexture('s1_kanji', 64, 160, (g, w, h) => {
        g.fillStyle = '#f2e6cc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a7a66'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = '#6a5a4a'; g.font = 'bold 15px sans-serif';
        const tx = ['歩', '行', '者', '自', '転', '車', '専', '用'];
        tx.forEach((c, i) => g.fillText(c, i < 3 ? 34 : 10, 26 + (i < 3 ? i : i - 3) * 22));
      });
      const kp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), toon({ map: kanji, dapple: false })); kp.position.set(0.42, -0.05, 0); ped.add(kp);
      const armY2 = atDist(520, 497, SD).y;
      const arm2 = cyl(0.04, 0.04, 0.9, poleMat, 0, 0, 0); arm2.rotation.z = Math.PI / 2; arm2.position.copy(atDist(470, 497, SD)); sig.add(arm2);
      const arm3 = cyl(0.04, 0.04, 0.9, poleMat, 0, 0, 0); arm3.rotation.z = Math.PI / 2; arm3.position.copy(atDist(470, 400, SD)); sig.add(arm3);
      // turn right sign
      const signTex = paintTexture('s1_turnsign', 256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
        g.fillStyle = '#3d9a86'; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill();
        g.strokeStyle = '#f8f6ee'; g.lineWidth = 22; g.lineCap = 'butt';
        g.beginPath(); g.moveTo(100, 210); g.lineTo(100, 130); g.quadraticCurveTo(100, 100, 135, 100); g.lineTo(160, 100); g.stroke();
        g.fillStyle = '#f8f6ee'; g.beginPath(); g.moveTo(155, 62); g.lineTo(205, 100); g.lineTo(155, 138); g.closePath(); g.fill();
      });
      const sc = atDist(568, 458, SD - 0.6);
      const sign = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, color: new THREE.Color(0.95, 0.95, 0.9) }));
      sign.position.copy(sc); sign.lookAt(CP.clone().add(V3(4, 0, 0))); sig.add(sign);
      const sp = cyl(0.04, 0.04, sc.y, toon({ color: '#ece6dc' }), sc.x, sc.y / 2, sc.z - 0.05); sig.add(sp);
    }

    /* ---------------- foreground fence, bicycle, low wall ---------------- */
    const fence = new THREE.Group(); scene.add(fence);
    {
      // fence ~10 m away on a raised ledge; top rail from screen (470,602) to (1280,545)
      const FD = 17;
      const T0 = atDist(470, 602, FD), T1 = onY(1280, 545, T0.y);
      const FY = T0.y;
      const dir = T1.clone().sub(T0); const len = dir.length(); dir.normalize();
      const ang = Math.atan2(-dir.z, dir.x);
      const g = new THREE.Group(); g.position.copy(T0); g.rotation.y = ang; fence.add(g);
      const railM = toon({ color: '#9894a0', dapple: false });
      for (const yy of [0, -0.42, -0.9]) g.add(box(len + 4, 0.08, 0.08, railM, len / 2, yy, 0));
      const postM = toon({ color: '#9a96a2', dapple: false });
      const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0a8').multiplyScalar(1.5) });
      const fplane = T0.clone(), fN = V3(-dir.z, 0, dir.x);
      for (const px of [487, 545, 610, 680, 770, 875, 990, 1135, 1272]) {
        const P = onPlane(px, 600, fplane, fN).sub(T0); const x = P.dot(dir);
        g.add(box(0.13, 2.4, 0.13, postM, x, -1.1, 0));
        g.add(box(0.045, 2.2, 0.135, glowM, x - 0.05, -1.05, 0.003));
      }
      // warm lit panels behind fence (low building wall)
      const panelTex = paintTexture('s1_panels', 256, 128, (g2, w, h) => {
        g2.fillStyle = '#e3a75a'; g2.fillRect(0, 0, w, h);
        g2.fillStyle = '#7d5a52'; for (let i = 0; i < 6; i++) g2.fillRect(i * 44 + 30, 0, 8, h);
        g2.fillStyle = 'rgba(255,220,140,0.6)'; g2.fillRect(0, 0, w, 10);
      });
      const Q = atDist(1000, 690, FD + 4);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), flat({ map: panelTex }));
      wall.position.set(Q.x, Q.y - 0.3, Q.z); wall.rotation.y = ang; scene.add(wall);
      // left low railing + lit wall
      const lrM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc870').multiplyScalar(1.15) });
      const L0 = atDist(290, 648, 16), L1 = atDist(470, 655, 16); L1.y = L0.y;
      const lg = new THREE.Group(); lg.position.copy(L0); const ld = L1.clone().sub(L0); lg.rotation.y = Math.atan2(-ld.z, ld.x); fence.add(lg);
      const ll = ld.length();
      lg.add(box(ll, 0.035, 0.035, lrM, ll / 2, 0, 0), box(ll, 0.035, 0.035, lrM, ll / 2, -0.2, 0));
      for (let i = 0; i <= 6; i++) lg.add(box(0.035, 1.0, 0.035, lrM, i * ll / 6, -0.5, 0));
      const lw = atDist(380, 705, 17);
      const lowWall = box(3.6, 1.0, 0.3, flat({ color: '#f2bd68' }), lw.x, lw.y - 0.3, lw.z); lowWall.rotation.y = lg.rotation.y; scene.add(lowWall);
      // bicycle leaning on the fence (centre ~ screen 778, wheels 690..865)
      const bike = new THREE.Group();
      const bc = onPlane(778, 650, T0, V3(-dir.z, 0, dir.x));
      bike.position.set(bc.x, FY - 1.25, bc.z); bike.scale.setScalar(1.25); bike.rotation.y = ang; scene.add(bike);
      const bm = toon({ color: '#d4542c', dapple: false });
      const tire = toon({ color: '#3a3842', dapple: false });
      const wheelR = 0.34;
      for (const xw of [-0.52, 0.52]) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(wheelR, 0.016, 6, 40), tire); t.position.set(xw, wheelR, 0); bike.add(t);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelR - 0.035, 0.007, 4, 40), toon({ color: '#d8d0c8' })); rim.position.set(xw, wheelR, 0); bike.add(rim);
        for (let sp = 0; sp < 8; sp++) { const a = sp / 8 * Math.PI; const spk = box(0.004, (wheelR - 0.04) * 2, 0.004, toon({ color: '#cfc6c0' }), xw, wheelR, 0); spk.rotation.z = a; bike.add(spk); }
      }
      const tube = (a, b2, r = 0.016) => {
        const va = V3(...a), vb = V3(...b2); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), 6), bm);
        m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), vb.clone().sub(va).normalize()); bike.add(m);
      };
      const BB = [0.0, 0.3, 0], ST = [-0.12, 0.84, 0], HT = [0.42, 0.82, 0], HB = [0.45, 0.68, 0];
      tube(BB, ST); tube(ST, HT); tube(BB, HB); tube(BB, [-0.52, wheelR, 0]); tube(ST, [-0.52, wheelR, 0]); tube(HB, [0.52, wheelR, 0]); tube(HT, [0.47, 0.93, 0]);
      tube([0.47, 0.93, -0.2], [0.47, 0.93, 0.2], 0.013);
      tube([-0.12, 0.84, 0], [-0.15, 0.94, 0], 0.012);
      bike.add(box(0.22, 0.05, 0.09, toon({ color: '#3a2a26' }), -0.15, 0.96, 0));
      bike.rotation.z = -0.04;
    }

    /* ---------------- big conifer/bushy tree (left) ---------------- */
    {
      const r = rng(11);
      const TD = 7.5;
      const clumps = [];
      // silhouette: right edge x(py)
      const rightEdge = (py) => py < 40 ? 160 : py < 250 ? 190 : py < 560 ? 215 : 225;
      const leftEdge = (py) => py < 160 ? 190 - py * 1.3 : -80;
      for (let py = -40; py < 780; py += 34) {
        const re = rightEdge(py);
        for (let px = leftEdge(py); px < re; px += 60) {
          const jx = px + (r() - 0.5) * 40, jy = py + (r() - 0.5) * 30;
          const edge = re - jx;
          const p = atDist(jx, jy, TD + (r() - 0.5) * 1.2 + (edge < 60 ? 0.4 : 0));
          clumps.push([p.x, p.y, p.z, lerp(0.28, 0.45, r())]);
        }
      }
      const tree = makeFoliage({ clumps, density: 3, cardSize: 0.42, kind: 'round', seed: 3, texSeed: 2,
        dark: '#1f2611', mid: '#2e3a19', light: '#62793a', highlight: '#90a85a', wind: 0.02, shell: 0.6, lightWrap: 0.35, terminator: -0.04, sizeJitter: 0.6 });
      scene.add(tree);
      // lower-left broad leaves (very close)
      const lc = [];
      for (let py = 425; py < 780; py += 30) for (let px = -30; px < 90; px += 34) { if (px > 40 && py < 520) continue; const p = atDist(px + (r() - 0.5) * 20, py + (r() - 0.5) * 20, 4.0); lc.push([p.x, p.y, p.z, 0.11]); }
      const leaves = makeFoliage({ clumps: lc, density: 5, cardSize: 0.13, kind: 'broad', seed: 8, texSeed: 3,
        dark: '#122a20', mid: '#24503a', light: '#4f8a52', highlight: '#8fc070', wind: 0.04, shell: 0.5, lightWrap: 0.4 });
      scene.add(leaves);
    }

    /* ---------------- motes ---------------- */
    const m0 = atDist(640, 400, 12);
    scene.add(makeMotes({ count: 50, box: [[m0.x - 6, m0.y - 3, m0.z - 3], [m0.x + 6, m0.y + 4, m0.z + 3]], size: 0.05, color: '#ffe4a8', opacity: 0.6, seed: 4 }));

    /* ---------------- shadow occluder (puts right part / lower girder in shade) ---------------- */
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const occ = (x, y, z, w, h, d) => { const o = box(w, h, d, occMat, x, y, z); o.castShadow = true; scene.add(o); return o; };
    {
      // place occluders between the sun and shaded regions
      const shadePts = [[900, 430, 0], [1000, 470, 0]];
      for (const [px, py] of shadePts) {
        const p = onPlane(px, py, A, N); // point on viaduct face
        const o = p.clone().add(SUN.clone().multiplyScalar(25));
        occ(o.x, o.y, o.z, 6, 8, 6);
      }
    }

    // train timing: front s position (viaduct local) vs time
    const trainS = (t) => -4.3 + (t - 1.2) * 13.6;

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(SUN);
        shared.uDapple.value = 0; shared.uFogMax.value = 0;
        train.position.x = trainS(t);
        train.visible = true;
      },
    };
  },
};
