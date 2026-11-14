// Shot 1 — golden-hour low-angle street view up at an elevated railway.
// Static telephoto camera looking up; a commuter train crosses the viaduct left -> right.
// Geometry is laid out by un-projecting reference pixel coordinates (1280x720) onto world planes,
// so the big shapes land where they are in the reference.
// REALISM PASS: all man-made things are modelled geometry with physically based materials (pbr.js): chamfered concrete
// viaduct with Y-corbels, tube-truss catenary gantries, towers with real balcony slabs / railings / recessed windows,
// a modelled commuter train, signal heads with visors + lit lenses, signs with thickness, tube fence and a bicycle —
// lit by one low golden shadow-casting sun, a cool sky fill and PMREM reflections.
import { pbrUniforms, pbr, makeEnvMap, texSet } from '../pbr.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export default {
  duration: 3.958,
  credit: { role: 'CREATED BY', cx: 0.744, ry: 0.6875, ny: 0.736 },
  post: {
    bloom: 0.4, bloomRadius: 0.5, bloomThreshold: 0.86,
    exposure: 0.9, contrast: 1.12, saturation: 1.02,
    lift: [0.02, 0.015, 0.01], gamma: [1.0, 1.0, 0.99], gain: [1.0, 1.0, 0.96],
    vignette: 0.2, grain: 0.03, ca: 0.0012, soft: 0.12,
  },
  build(core) {
    const { THREE, makeSky, makeFoliage, flat, makeMotes, paintTexture, shared, rng, lerp, col, mergeGeometries } = core;
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

    /* ---------------- sky ---------------- */
    scene.add(makeSky({ zenith: '#3c6c98', mid: '#5996b8', horizon: '#8cbcc4', haze: 0.4, horizonY: 0.0 }));

    /* ---------------- light: one low golden shadow-casting sun + cool sky fill + PMREM env ---------------- */
    // low golden sun from behind the camera, slightly left: corbel shadows fall right and a little down onto the web wall
    const SUN = V3(-0.08, 0.25, 0.965).normalize();
    const FOL_SUN = V3(-0.3, 0.3, 0.9).normalize();      // the painted foliage was tuned for this
    shared.uSunDir.value.copy(FOL_SUN);
    const env = makeEnvMap('s1_env', {
      zenith: '#36689a', horizon: '#a8b8c8', ground: '#454c62', sunDir: SUN.toArray(), sunColor: '#ffcf8a', sunPower: 5, sunSize: 3,
      clouds: [{ dir: [0.5, 0.6, -1], size: 7, power: 1.3 }, { dir: [0.2, 0.4, -1], size: 5, power: 1.1 }],
      blocks: [
        { dir: [-1, 0.3], w: 30, h: 22, dist: 14, color: '#4c4036' }, { dir: [1, -0.3], w: 22, h: 30, dist: 14, color: '#3e4048' },
        { dir: [0, -1], w: 40, h: 8, dist: 18, y: 4, color: '#a08a66' }, { dir: [0, 1], w: 40, h: 10, dist: 16, color: '#3a342e' },
      ],
    });
    const UNI = (o = {}) => pbrUniforms({ sunDir: SUN.toArray(), leafAmt: 0, grime: 0, rimAmt: 0, rimColor: '#ffb060', ...o });
    const UL = UNI();                                   // sunlit set
    const US = UNI({ sunGain: 0 });                     // set in shade: sky + bounce only
    const UG = UNI({ sunGain: 0.3 });                   // far gantries, mostly shaded
    const UF = UNI({ sunGain: 0.22, rimAmt: 0.5, rimPow: 3 });   // fence / bicycle in shade with a warm rim
    const M = (o, u = UL) => pbr(u, { envMap: env, envMapIntensity: 1.0, roughness: 0.8, metalness: 0, ...o }, null, 's1');
    const sun = new THREE.DirectionalLight(col('#ffcc66'), 5.3);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(col('#9cb2d8'), col('#5e5e6c'), 1.45));

    /* ---------------- textures (albedo + relief + roughness) ---------------- */
    const concT = texSet(512, 512, (g, w, h) => {
      const r = rng(5);
      g.fillStyle = '#dcd3c6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * h, rr = 20 + r() * 90, c = r() < 0.55 ? '120,108,98' : '250,246,236';
        const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${c},${0.05 + r() * 0.1})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      for (let i = 0; i < 45; i++) {
        const x = r() * w, y = r() * h * 0.6, l = 60 + r() * 220;
        const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(92,82,76,0.2)'); gr.addColorStop(1, 'rgba(92,82,76,0)');
        g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 6, l);
      }
      for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '70,64,60' : '255,252,245'},${0.15 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
      g.fillStyle = 'rgba(96,88,82,0.4)'; g.fillRect(0, 254, w, 3); g.fillRect(254, 0, 2, h);
    }, { normalStrength: 1.6, roughBase: 0.88, roughVar: 0.15 });
    for (const t of Object.values(concT)) t.repeat.set(0.25, 0.25);
    const tileT = texSet(256, 256, (g, w, h) => {
      const r = rng(17);
      g.fillStyle = '#b8ac98'; g.fillRect(0, 0, w, h);
      const n = 8, s = w / n;
      for (let y = 0; y < n * 2; y++) for (let x = 0; x < n; x++) {
        const v = 226 + (r() - 0.5) * 22; g.fillStyle = `rgb(${v},${v - 8},${v - 26})`;
        g.fillRect(x * s + 1.5, y * s / 2 + 1.5, s - 3, s / 2 - 3);
      }
      for (let i = 0; i < 20; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(140,120,100,0.12)'); gr.addColorStop(1, 'rgba(140,120,100,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    }, { normalStrength: 1.2, roughBase: 0.6, roughVar: 0.3 });
    for (const t of Object.values(tileT)) t.repeat.set(0.5, 0.5);

    /* ---------------- geometry helpers ---------------- */
    // world-scale box-projected UVs (metres * k) so textures stay continuous across merged pieces
    const triUV = (geo, k = 1) => {
      const p = geo.attributes.position, n = geo.attributes.normal;
      const uv = new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
      for (let i = 0; i < p.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
        if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k);
        else if (ay >= az) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k);
        else uv.setXY(i, p.getX(i) * k, p.getY(i) * k);
      }
      geo.setAttribute('uv', uv); return geo;
    };
    const bx = (w, h, d, x, y, z, r = 0) => {
      const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3))) : new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z); return g;
    };
    const rodG = (a, b, r, seg = 6, open = false) => {
      const len = a.distanceTo(b); const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize()));
      const m = a.clone().lerp(b, 0.5); g.translate(m.x, m.y, m.z); return g;
    };
    // material -> geometry list; flushed into one merged mesh per material
    const bucket = () => new Map();
    const put = (B, mat, ...geos) => { if (!B.has(mat)) B.set(mat, []); B.get(mat).push(...geos); };
    const flush = (B, parent, { cast = true, recv = true, uv = 0 } = {}) => {
      const out = [];
      for (const [mat, list] of B) {
        const gs = list.map((g) => { let q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); if (uv) triUV(q, uv); else if (!q.attributes.uv) triUV(q, 1); return q; });
        const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); out.push(m);
      }
      B.clear(); return out;
    };
    // extrude a (d, h) cross-section along local x from s0 to s1 (frame: x = s, y = h, z = d)
    const BASIS = new THREE.Matrix4().makeBasis(V3(0, 0, -1), V3(0, 1, 0), V3(1, 0, 0));
    const prof = (pts, s0, s1) => {
      const sh = new THREE.Shape(pts.map(([d, h]) => new THREE.Vector2(-d, h)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: s1 - s0, bevelEnabled: false, steps: 1, curveSegments: 4 });
      g.applyMatrix4(BASIS); g.translate(s0, 0, 0); return g;
    };
    // a wall band (x0..x1, y0..y1, z0..z1) with rectangular openings [[xa, xb, ya, yb]]: piers + fills above/below
    const wallOpen = (x0, x1, y0, y1, z0, z1, ops) => {
      const gs = []; const zc = (z0 + z1) / 2, dz = z1 - z0; let x = x0;
      const B = (xa, xb, ya, yb) => { if (xb - xa > 1e-3 && yb - ya > 1e-3) gs.push(bx(xb - xa, yb - ya, dz, (xa + xb) / 2, (ya + yb) / 2, zc)); };
      for (const [xa, xb, ya, yb] of [...ops].sort((a, b) => a[0] - b[0])) { B(x, xa, y0, y1); B(xa, xb, y0, ya); B(xa, xb, yb, y1); x = xb; }
      B(x, x1, y0, y1); return gs;
    };

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
      const regions = [
        [905, 78, 125, 50, -0.42, 420, 0.4], [985, 18, 70, 30, -0.3, 200, 0.4], [865, 128, 62, 22, -0.25, 140, 0.3],
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
          const cc = shade < 0.5 ? mix(LIT, MID, shade * 2) : mix(MID, SH, (shade - 0.5) * 2);
          const len = rx * lerp(0.28, 0.55, r()) * (1 - 0.5 * Math.abs(u));
          const puffy = ry > 15;
          const hole = Math.sin(px * 0.09 + py * 0.05) * Math.sin(py * 0.13 - px * 0.04);
          if (puffy && hole > 0.25) continue;
          if (puffy) {
            const rr = len * lerp(0.35, 0.6, r());
            stroke(px + rr * 0.25, py + rr * 0.3, rr, rr * 0.7, rot, SH.join(','), a * 0.7);
            if (shade < 0.4) stroke(px - rr * 0.2, py - rr * 0.25, rr * 0.7, rr * 0.45, rot, LIT.join(','), a * 0.9);
            else stroke(px - rr * 0.1, py - rr * 0.1, rr * 0.7, rr * 0.5, rot, MID.join(','), a * 0.5);
          } else stroke(px, py, len, len * lerp(0.18, 0.35, r()), rot + (r() - 0.5) * 0.35, cc, a * (1 - 0.4 * Math.abs(u)));
        }
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
    scene.add(via); via.updateMatrixWorld(true);
    const local = (px, py, d) => { const p = onPlane(px, py, A.clone().add(N.clone().multiplyScalar(d)), N).sub(A); return [p.dot(U), p.y]; };
    const fromLocal = (s, h, d) => A.clone().add(U.clone().multiplyScalar(s)).add(V3(0, h, 0)).add(N.clone().multiplyScalar(d));
    const S0 = -90, S1 = 260;
    const bandBot = local(420, 312, 0)[1];
    const wallBot = local(420, 470, -2.2)[1];
    const girdTop = local(450, 464, 0.6)[1];
    const girdBot = local(700, 612, 0.6)[1];
    const pierTop = local(370, 532, 1.6)[1];

    /* materials (viaduct) */
    const cT = (o) => ({ map: concT.map, normalMap: concT.normalMap, roughnessMap: concT.roughnessMap, normalScale: new THREE.Vector2(0.8, 0.8), ...o });
    const mParapet = M(cT({ color: '#f6dcb0' }));
    const mWall = M(cT({ color: '#fff8e6' }));
    const mCorbel = M(cT({ color: '#f4ead8' }));
    const mDeck = M(cT({ color: '#8a7068' }), US);
    const mGird = M(cT({ color: '#d6d8dc' }), US);
    const mPier = M(cT({ color: '#7e7478' }), US);
    const mRail = M({ color: '#f2ebde', roughness: 0.45, metalness: 0.25 });
    const mRailS = M({ color: '#e8e2d8', roughness: 0.45, metalness: 0.25 }, US);
    const VB = bucket();
    // parapet / edge beam: chamfered top edge + drip lip
    put(VB, mParapet, prof([[-1.2, 0], [-0.06, 0], [0, -0.06], [0, bandBot + 0.12], [-0.1, bandBot], [-1.2, bandBot]], S0, S1));
    // a shallow recessed groove along the parapet face
    put(VB, mParapet, prof([[-0.02, bandBot + 0.42], [0.0, bandBot + 0.4], [0.0, bandBot + 0.36], [-0.02, bandBot + 0.34]], S0, S1));
    // deck slab edge (overhang) with chamfered nose, and the deep underside
    put(VB, mDeck, prof([[-3.0, bandBot + 0.4], [-0.6, bandBot + 0.4], [-0.6, bandBot - 0.04], [-0.72, bandBot - 0.16], [-3.0, bandBot - 0.16]], S0, S1));
    put(VB, mDeck, prof([[-14, bandBot + 0.4], [-3.0, bandBot + 0.4], [-3.0, bandBot - 0.6], [-14, bandBot - 0.6]], S0, S1));
    // web wall (set back) — receives the corbel shadows; vertical construction joints
    put(VB, mWall, prof([[-3.0, bandBot], [-2.2, bandBot], [-2.2, wallBot + 0.25], [-2.05, wallBot + 0.1], [-2.05, wallBot], [-3.0, wallBot]], S0, S1));
    for (let s = -36; s < S1; s += 22) put(VB, mDeck, bx(0.06, bandBot - wallBot - 0.3, 0.04, s + 5.5, (bandBot + wallBot) / 2 + 0.1, -2.19));
    // Y-corbels under the overhang (bevelled extrusions)
    {
      const sh = new THREE.Shape();
      sh.moveTo(-0.62, 0); sh.lineTo(-0.44, 0); sh.lineTo(0, -1.05); sh.lineTo(0.44, 0); sh.lineTo(0.62, 0);
      sh.lineTo(0.09, -1.32); sh.lineTo(0.09, -1.95); sh.lineTo(-0.09, -1.95); sh.lineTo(-0.09, -1.32); sh.lineTo(-0.62, 0);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.35, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 2 });
      const c0 = local(317, 400, -2.2)[0], cs = local(657, 400, -2.2)[0] - c0;
      for (let s = c0 - 4 * cs; s < S1; s += cs) { const g = geo.clone(); g.translate(s, bandBot - 0.02, -2.15); put(VB, mCorbel, g); }
    }
    // lower girders (in shade): stacked flanges with chamfers
    {
      const pts = [[-1.0, girdTop], [0.6, girdTop]];
      for (let k = 3; k >= 1; k--) { const hh = lerp(girdBot, girdTop, k / 4); pts.push([0.6, hh + 0.08], [0.82, hh + 0.04], [0.86, hh - 0.02], [0.86, hh - 0.08], [0.6, hh - 0.12]); }
      pts.push([0.6, girdBot + 0.06], [0.54, girdBot], [-1.0, girdBot]);
      put(VB, mGird, prof(pts, S0, S1));
      // stiffener ribs under the girder
      for (let s = -40; s < S1; s += 5.5) put(VB, mGird, bx(0.12, girdTop - girdBot - 0.2, 0.18, s, (girdTop + girdBot) / 2, 0.68));
    }
    // piers + chamfered caps
    for (const px of [370, 478, 880, 965, 1180]) {
      const sp = local(px, 600, 1.6)[0];
      put(VB, mPier, bx(1.6, pierTop + 16, 1.2, sp, (pierTop - 16) / 2, 1.6, 0.06));
      put(VB, mGird, bx(1.9, 0.5, 1.4, sp, pierTop - 0.25, 1.6, 0.08));
    }
    // railing on the parapet: tube posts with base plates + two rails
    {
      const ps = [360, 690, 800, 905, 1000].map((px) => local(px, 300, 0.15)[0]);
      const step = (ps[4] - ps[1]) / 3;
      for (let k = -6; k < 0; k++) ps.push(ps[0] + k * step);
      for (let k = 1; k < 12; k++) ps.push(ps[4] + k * step);
      for (const sp of ps) {
        put(VB, mRail, rodG(V3(sp, bandBot + 0.25, 0.17), V3(sp, 1.5, 0.17), 0.07, 10));
        put(VB, mRail, bx(0.26, 0.34, 0.06, sp, bandBot + 0.5, 0.03, 0.015), bx(0.26, 0.3, 0.06, sp, -0.3, 0.03, 0.015));
      }
      put(VB, mRail, rodG(V3(S0, 1.47, 0.17), V3(S1, 1.47, 0.17), 0.05, 8), rodG(V3(S0, 0.78, 0.17), V3(S1, 0.78, 0.17), 0.035, 8));
    }
    // bent cable brackets hanging under the deck on the right part
    for (let s = 30; s < S1; s += 8) {
      const t = new THREE.TorusGeometry(1.3, 0.06, 6, 14, Math.PI * 0.6); t.rotateZ(Math.PI * 0.9); t.translate(s, bandBot - 1.2, 0.3);
      put(VB, mRailS, t);
    }
    flush(VB, via);
    // backdrop under the viaduct: shaded buildings with a few sunlit patches (far, painted)
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

    /* ---------------- train (modelled cars) ---------------- */
    const train = new THREE.Group(); via.add(train); train.position.y = -0.3;
    const CAR = 20, NCARS = 10, TD = -2.9, TH0 = -1.0, W = 2.9, HW0 = 0.85, HW1 = 1.72, HB = 1.96;
    {
      const mBody = M({ color: '#ecd8b8', roughness: 0.38, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.3 });
      const mStripe = M({ color: '#e0442a', roughness: 0.4, metalness: 0.1, clearcoat: 0.3 });
      const mGlass = M({ color: '#262a34', roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4 });
      const mRoof = M({ color: '#8e8a86', roughness: 0.6, metalness: 0.3 });
      const mDark = M({ color: '#2c2a30', roughness: 0.7 });
      const mPanto = M({ color: '#3a3a40', roughness: 0.4, metalness: 0.6 });
      const TB = bucket();
      const doors = [-7.4, -2.47, 2.47, 7.4];
      for (let i = 0; i < NCARS; i++) {
        const c = -i * (CAR + 0.6) - CAR / 2;
        const ops = [];
        // door windows (two leaves) + side windows between doors
        for (const ds of doors) ops.push([c + ds - 0.52, c + ds - 0.1, 0.98, 1.62], [c + ds + 0.1, c + ds + 0.52, 0.98, 1.62]);
        const segs = [[-CAR / 2 + 0.35, doors[0] - 0.8], [doors[0] + 0.8, doors[1] - 0.8], [doors[1] + 0.8, doors[2] - 0.8], [doors[2] + 0.8, doors[3] - 0.8], [doors[3] + 0.8, CAR / 2 - 0.35]];
        for (const [a, b] of segs) {
          const n = (b - a) > 2.4 ? 2 : 1, wseg = (b - a - 0.25 * (n - 1)) / n;
          for (let k = 0; k < n; k++) ops.push([c + a + k * (wseg + 0.25), c + a + k * (wseg + 0.25) + wseg, HW0 + 0.04, HW1 - 0.02]);
        }
        put(TB, mBody, ...wallOpen(c - CAR / 2, c + CAR / 2, HW0, HW1, TD - W / 2, TD + W / 2, ops));
        put(TB, mBody, bx(CAR, HW0 - TH0, W, c, (TH0 + HW0) / 2, TD), bx(CAR, HB - HW1, W, c, (HW1 + HB) / 2, TD));
        put(TB, mGlass, bx(CAR - 0.3, HW1 - HW0, W - 0.12, c, (HW0 + HW1) / 2, TD));
        // door leaves, slightly proud, with a centre seam
        for (const ds of doors) {
          put(TB, mBody, bx(1.3, HW0 - TH0 - 0.1, W + 0.02, c + ds, (TH0 + 0.1 + HW0) / 2, TD));
          put(TB, mDark, bx(0.025, HW1 - TH0 - 0.15, W + 0.03, c + ds, (TH0 + HW1) / 2, TD));
          put(TB, mDark, bx(0.025, HW1 - TH0 - 0.15, W + 0.025, c + ds - 0.66, (TH0 + HW1) / 2, TD), bx(0.025, HW1 - TH0 - 0.15, W + 0.025, c + ds + 0.66, (TH0 + HW1) / 2, TD));
        }
        // stripes: broad red band below the windows, thin one along the cant rail
        put(TB, mStripe, bx(CAR, 0.26, W + 0.05, c, 0.5, TD), bx(CAR, 0.07, W + 0.03, c, HB - 0.1, TD));
        // roof (curved), AC units, gangway
        put(TB, mRoof, prof([[-W / 2, HB], [-W / 2 + 0.03, HB + 0.1], [-W / 2 + 0.18, HB + 0.2], [-0.8, HB + 0.3], [0, HB + 0.33], [0.8, HB + 0.3], [W / 2 - 0.18, HB + 0.2], [W / 2 - 0.03, HB + 0.1], [W / 2, HB]].map(([d, h]) => [d + TD, h]), c - CAR / 2, c + CAR / 2));
        for (const o of [-5.5, 5.5]) put(TB, mRoof, bx(2.6, 0.32, 1.9, c + o, HB + 0.42, TD, 0.08));
        put(TB, mDark, bx(0.7, HB - TH0 - 0.3, W - 0.4, c - CAR / 2 - 0.3, (TH0 + HB) / 2, TD));
        // pantograph on some cars
        if (i % 3 === 1) {
          const p0 = c - 2.5, ph = HB + 0.33;
          put(TB, mPanto, bx(1.6, 0.12, 1.6, p0, ph + 0.06, TD));
          for (const sd of [-0.55, 0.55]) {
            put(TB, mPanto, rodG(V3(p0 - 0.6, ph + 0.12, TD + sd), V3(p0 + 0.3, ph + 0.75, TD + sd), 0.03, 5), rodG(V3(p0 + 0.3, ph + 0.75, TD + sd), V3(p0 - 0.2, ph + 1.25, TD + sd * 0.6), 0.025, 5));
          }
          put(TB, mPanto, bx(0.12, 0.06, 1.9, p0 - 0.2, ph + 1.28, TD));
          put(TB, mPanto, ...[-0.6, 0.6].map((sd) => rodG(V3(p0, ph + 0.12, TD + sd), V3(p0, ph + 0.75, TD + sd), 0.04, 5)));
        }
      }
      // leading cab nose (front at s = 0)
      {
        const sh = new THREE.Shape([[0, TH0], [0.45, TH0], [0.45, 0.8], [0.25, 1.85], [0, HB + 0.25]].map(([x, y]) => new THREE.Vector2(x, y)));
        const g = new THREE.ExtrudeGeometry(sh, { depth: W - 0.04, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
        g.translate(0, 0, TD - (W - 0.04) / 2); put(TB, mBody, g);
        const ws = bx(0.04, 0.82, W - 0.5, 0, 0, 0); ws.rotateZ(-Math.atan2(0.2, 1.05)); ws.translate(0.38, 1.33, TD); put(TB, mGlass, ws);
        put(TB, mStripe, bx(0.06, 0.26, W - 0.05, 0.5, 0.5, TD));
      }
      flush(TB, train);
    }

    /* ---------------- catenary gantries: tube-lattice trusses ---------------- */
    // square lattice truss along +x from 0..len, section w x w, chords + zig-zag lacing + battens
    const trussG = (len, w, rc = 0.08, rd = 0.036) => {
      const gs = [], h = w / 2, n = Math.max(1, Math.round(len / (w * 1.05))), st = len / n;
      const C = [[-h, -h], [h, -h], [h, h], [-h, h]];
      for (const [y, z] of C) gs.push(rodG(V3(0, y, z), V3(len, y, z), rc, 6, true));
      for (let f = 0; f < 4; f++) {
        const [y0, z0] = C[f], [y1, z1] = C[(f + 1) % 4];
        for (let i = 0; i < n; i++) {
          const xa = i * st, xb = (i + 1) * st, fl = (i + f) % 2;
          gs.push(rodG(V3(xa, fl ? y0 : y1, fl ? z0 : z1), V3(xb, fl ? y1 : y0, fl ? z1 : z0), rd, 4, true));
          gs.push(rodG(V3(xa, y0, z0), V3(xa, y1, z1), rd, 4, true));
        }
      }
      return gs;
    };
    const projPx = (v) => { const p = v.clone().project(camera); return [(p.x + 1) * 640, (1 - p.y) * 360]; };
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
    const mGantL = M({ color: '#d8d2c6', roughness: 0.5, metalness: 0.55 });
    const mGantS = M({ color: '#8a8c92', roughness: 0.6, metalness: 0.45 }, UG);
    const mIns = M({ color: '#c8642c', roughness: 0.3, metalness: 0.0 }, UG);
    const GB = bucket();
    const gantryAt = (xf, yf, xn, yn, postW, beamW, mat, postX = null) => {
      const b = solveBeam(xf, yf, xn, yn);
      const sp = postX !== null ? local(postX, 300, b.dF)[0] : b.s;
      const pl = b.h + 1.5;
      for (const g of trussG(pl, postW)) { g.rotateZ(Math.PI / 2); g.translate(sp, -1.5, b.dF); put(GB, mat, g); }
      put(GB, mat, bx(postW + 0.3, 0.12, postW + 0.3, sp, b.h + 0.04, b.dF));
      const bl = b.dF - b.dN + 0.6;
      for (const g of trussG(bl, beamW, 0.07, 0.032)) { g.rotateY(Math.PI / 2); g.translate(b.s, b.h - beamW / 2, b.dF + 0.3); put(GB, mat, g); }
      return b;
    };
    const g1 = gantryAt(488, 18, 300, 155, 0.9, 0.75, mGantL, 480);
    const g2 = gantryAt(812, 100, 545, 262, 1.35, 0.8, mGantS, 828);
    const g3 = gantryAt(1040, 270, 855, 350, 0.9, 0.7, mGantS, 1003);
    // drop arms + insulators hanging from the far beams
    for (const b of [g2, g3]) for (const f of [0.3, 0.62]) {
      const d = lerp(b.dF, b.dN, f), h0 = b.h - 0.75;
      put(GB, mGantS, rodG(V3(b.s, h0, d), V3(b.s, h0 - 2.2, d), 0.04, 6), rodG(V3(b.s, h0 - 1.6, d), V3(b.s, h0 - 1.6, d + 1.4), 0.03, 6));
      put(GB, mIns, rodG(V3(b.s, h0 - 0.2, d), V3(b.s, h0 - 0.75, d), 0.08, 8));
    }
    // round catenary pole (near side, behind traffic light)
    { const sp = local(748, 300, -0.6)[0], ht = local(748, 112, -0.6)[1];
      put(GB, mGantL, rodG(V3(sp, -1.5, -0.6), V3(sp, ht, -0.6), 0.17, 14), bx(0.5, 0.25, 0.5, sp, ht, -0.6, 0.05), rodG(V3(sp, ht - 1.2, -0.6), V3(sp, ht - 1.2, -3.2), 0.05, 6)); }
    flush(GB, via, { uv: 1 });
    // overhead wires along the line
    const wireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7d7672') });
    for (const [hh, dd] of [[6.0, -3.5], [6.8, -3.5], [6.0, -8], [6.8, -8], [9.6, -1.0]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, S1 - S0, 4), wireMat);
      w.rotation.z = Math.PI / 2; w.position.set((S0 + S1) / 2, hh, dd); via.add(w);
    }

    /* ---------------- yellow apartment tower (behind): modelled facade ---------------- */
    const FL = 3.0;
    {
      const Z = -95;
      const L = onPlane(226, 300, V3(0, 0, Z), V3(0, 0, 1)), R = onPlane(560, 300, V3(0, 0, Z), V3(0, 0, 1));
      const x0 = L.x, x1 = R.x, w = x1 - x0, H = 120;
      const tT = (o) => ({ map: tileT.map, normalMap: tileT.normalMap, roughnessMap: tileT.roughnessMap, normalScale: new THREE.Vector2(0.6, 0.6), ...o });
      const mTw = M(tT({ color: '#e8b47c' }));
      const mTrim = M(cT({ color: '#fbe6c4' }));
      const mWin = M({ color: '#24160f', roughness: 0.08, metalness: 0.1, envMapIntensity: 1.1 });
      const mFrame = M({ color: '#8c6a50', roughness: 0.45, metalness: 0.4 });
      const mRec = M({ color: '#5c3424', roughness: 0.9 });
      const mBal = M({ color: '#3e2a26', roughness: 0.3, metalness: 0.5 });
      const TW = bucket();
      put(TW, mTw, bx(w, H, 20, (x0 + x1) / 2, H / 2, Z - 10));
      const X = (f) => x0 + f * w;
      const ZF = Z + 0.3;                                         // facade face (openings recessed to Z)
      const ops = [[X(0.075), X(0.29), 0.5, 2.75], [X(0.39), X(0.52), 0.85, 2.45], [X(0.586), X(0.715), 0.85, 2.45], [X(0.78), X(0.91), 0.85, 2.45]];
      for (let f = 3; f < 24; f++) {
        const y0 = f * FL;
        put(TW, mTw, ...wallOpen(x0, x1, y0, y0 + FL, Z, ZF, ops.map(([a, b, ya, yb]) => [a, b, y0 + ya, y0 + yb])));
        // floor-slab band (casts a thin shadow line)
        put(TW, mTrim, bx(w + 0.3, 0.26, 0.5, (x0 + x1) / 2, y0 + 0.02, ZF + 0.1, 0.03));
        // windows: frame + glass + mullion
        for (const [a, b, ya, yb] of ops.slice(1)) {
          put(TW, mWin, bx(b - a, yb - ya, 0.05, (a + b) / 2, y0 + (ya + yb) / 2, Z + 0.05));
          put(TW, mFrame, bx(0.08, yb - ya, 0.12, (a + b) / 2, y0 + (ya + yb) / 2, Z + 0.1), bx(b - a, 0.07, 0.14, (a + b) / 2, y0 + ya + 0.035, Z + 0.1), bx(b - a, 0.06, 0.12, (a + b) / 2, y0 + yb - 0.03, Z + 0.1));
          put(TW, mTrim, bx(b - a + 0.2, 0.08, 0.35, (a + b) / 2, y0 + ya - 0.02, ZF + 0.1));   // sill
        }
        // balcony bay: deep recess, projecting slab, dark railing with a light top rail, glass door
        const [a, b] = ops[0];
        put(TW, mRec, bx(b - a, 2.3, 0.05, (a + b) / 2, y0 + 1.65, Z + 0.03));
        put(TW, mWin, bx((b - a) * 0.6, 2.0, 0.05, a + (b - a) * 0.62, y0 + 1.55, Z + 0.06));
        put(TW, mTrim, bx(b - a + 0.25, 0.22, 1.25, (a + b) / 2, y0 + 0.1, ZF + 0.62, 0.03));
        put(TW, mBal, bx(b - a, 0.95, 0.06, (a + b) / 2, y0 + 0.7, ZF + 1.15));
        put(TW, mTrim, bx(b - a + 0.1, 0.08, 0.14, (a + b) / 2, y0 + 1.2, ZF + 1.15, 0.02));
        for (const xx of [a, b]) put(TW, mTw, bx(0.18, FL, 1.25, xx, y0 + FL / 2, ZF + 0.62));
      }
      // pilaster between the balcony column and the windows + corner trims
      put(TW, mTw, bx(X(0.36) - X(0.31), H, 0.7, (X(0.31) + X(0.36)) / 2, H / 2, ZF + 0.35, 0.05));
      put(TW, mTrim, bx(0.5, H, 0.5, x0 + 0.25, H / 2, ZF + 0.2));
      // right stacked-balcony wing (projects toward camera)
      const Zw = Z + 6;
      const Rw = onPlane(690, 60, V3(0, 0, Zw), V3(0, 0, 1)), Lw = onPlane(545, 60, V3(0, 0, Zw), V3(0, 0, 1));
      const wx0 = Lw.x, wx1 = Rw.x, ww = wx1 - wx0;
      put(TW, mTw, bx(ww, H, 12, (wx0 + wx1) / 2, H / 2, Zw - 6));
      for (let f = 3; f < 24; f++) {
        const y0 = f * FL;
        put(TW, mTrim, bx(ww + 0.4, 0.34, 1.7, (wx0 + wx1) / 2 + 0.1, y0 + 0.05, Zw + 0.85, 0.04));       // balcony slab
        put(TW, mWin, bx(ww - 0.2, FL - 0.4, 0.05, (wx0 + wx1) / 2, y0 + FL / 2 + 0.05, Zw + 0.03));       // window wall
        for (let x = wx0 + 0.6; x < wx1 - 0.3; x += 1.05) put(TW, mFrame, bx(0.09, FL - 0.4, 0.1, x, y0 + FL / 2 + 0.05, Zw + 0.08));
        put(TW, mFrame, bx(ww, 0.08, 0.1, (wx0 + wx1) / 2, y0 + 1.15, Zw + 0.08));
        put(TW, mBal, bx(ww * 0.4, 1.0, 0.04, wx1 - ww * 0.2, y0 + 0.75, Zw + 1.62));                         // glass balustrade (right end)
        put(TW, mTrim, bx(0.12, 1.0, 1.6, wx1 + 0.05, y0 + 0.72, Zw + 0.85));
        put(TW, mFrame, rodG(V3(wx0, y0 + 1.22, Zw + 1.62), V3(wx1, y0 + 1.22, Zw + 1.62), 0.025, 6));
      }
      flush(TW, scene);
    }

    /* ---------------- right grey highrise (in shade): modelled balconies ---------------- */
    {
      const Z = -46;
      const L = onPlane(1062, 360, V3(0, 0, Z), V3(0, 0, 1));
      const dist = Math.hypot(L.x, L.z);
      const pxPerM = 1661 / dist;
      const floorM = 108 / pxPerM, colM = 108 / pxPerM;
      const W2 = 30, H2 = 160;
      const UHr = UNI({ sunGain: 0.12 });
      const mHw = M(cT({ color: '#e8dccb' }), UHr);
      const mHt = M(cT({ color: '#f0e8de' }), UHr);
      const mHg = M({ color: '#1a1a22', roughness: 0.12, metalness: 0.2, envMapIntensity: 1.0 }, US);
      const mHf = M({ color: '#cfcac2', roughness: 0.4, metalness: 0.4 }, US);
      const HBk = bucket();
      const x0 = L.x, zf = Z;
      put(HBk, mHw, bx(W2, H2, 3, x0 + W2 / 2, H2 / 2 - 2, Z - 1.5));
      for (let b = 0; b < 4; b++) {
        const bx0 = x0 + b * colM;
        put(HBk, mHt, bx(0.42, H2, 0.45, bx0 + 0.05, H2 / 2 - 2, zf + 0.22));                // pilaster
        for (let f = -1; f < 12; f++) {
          const y = f * floorM + (b % 2) * floorM / 2 + 2.3;
          const cx = bx0 + colM / 2;
          // balcony: slab + glass balustrade + side fins + recessed window behind
          put(HBk, mHt, bx(colM * 0.86, 0.22, 1.25, cx, y, zf + 0.62, 0.03));
          put(HBk, mHg, bx(colM * 0.8, floorM * 0.3, 0.04, cx, y + 0.11 + floorM * 0.15, zf + 1.2));
          put(HBk, mHf, bx(colM * 0.82, 0.06, 0.08, cx, y + 0.12 + floorM * 0.3, zf + 1.2));
          put(HBk, mHg, bx(colM * 0.62, floorM * 0.62, 0.04, cx, y + 0.12 + floorM * 0.33, zf + 0.02));
          if (b % 2 === 1) {   // window with frame on the alternate bays (between balconies)
            const wy = y + floorM * 0.66, ww = colM * 0.5, wh = floorM * 0.4;
            put(HBk, mHg, bx(ww, wh, 0.04, cx, wy, zf + 0.04));
            put(HBk, mHf, bx(ww + 0.12, 0.08, 0.16, cx, wy - wh / 2, zf + 0.08), bx(ww + 0.12, 0.06, 0.1, cx, wy + wh / 2, zf + 0.06),
              bx(0.06, wh, 0.1, cx - ww / 2, wy, zf + 0.06), bx(0.06, wh, 0.1, cx + ww / 2, wy, zf + 0.06), bx(0.05, wh, 0.08, cx, wy, zf + 0.06));
          }
        }
      }
      flush(HBk, scene);
    }

    /* ---------------- traffic signal ---------------- */
    const sig = new THREE.Group(); scene.add(sig);
    const SD = 15;
    const mPole = M({ color: '#a08c72', roughness: 0.55, metalness: 0.3 });
    const mHous = M({ color: '#a89a8a', roughness: 0.5, metalness: 0.25 });
    const mVisor = M({ color: '#36302f', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const SB = bucket();
    const poleBase = atDist(518, 720, SD); poleBase.y = 0;
    put(SB, mPole, rodG(V3(poleBase.x, 0, poleBase.z), V3(poleBase.x, 13, poleBase.z), 0.11, 16));
    {
      const armY = atDist(520, 222, SD).y;
      const lampC = atDist(720, 255, SD - 1.0);
      const armA = V3(poleBase.x, armY, poleBase.z);
      put(SB, mPole, rodG(armA, lampC, 0.05, 8), rodG(armA.clone().add(V3(0, 0.5, 0)), lampC.clone().lerp(armA, 0.5), 0.025, 6));
      const head = new THREE.Group(); head.position.copy(lampC); head.lookAt(CP.clone().add(V3(-8, -4, 0))); sig.add(head);
      const HB2 = bucket();
      // stadium-shaped housing with rounded edges
      const hs = new THREE.Shape(); hs.moveTo(-0.42, -0.25); hs.lineTo(0.42, -0.25); hs.absarc(0.42, 0, 0.25, -Math.PI / 2, Math.PI / 2, false); hs.lineTo(-0.42, 0.25); hs.absarc(-0.42, 0, 0.25, Math.PI / 2, Math.PI * 1.5, false);
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 12 });
      hg.translate(0, 0, -0.12); put(HB2, mHous, hg);
      put(HB2, mHous, bx(1.2, 0.12, 0.12, 0, -0.33, -0.08, 0.02), bx(0.3, 0.1, 0.14, 0, 0.3, -0.06, 0.02));
      const lampCols = ['#8ee0d0', '#ffa030', '#ff3c24'], glow = [1.6, 2.4, 2.4];
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.43;
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 8, 0, Math.PI * 2, 0, 1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(lampCols[i]).multiplyScalar(glow[i]) }));
        lens.rotation.x = Math.PI / 2; lens.scale.set(1, 0.5, 1); lens.position.set(x, 0, 0.07); head.add(lens);
        const ring = new THREE.TorusGeometry(0.2, 0.02, 6, 24); ring.translate(x, 0, 0.11); put(HB2, mVisor, ring);
        const visor = new THREE.CylinderGeometry(0.215, 0.215, 0.3, 20, 1, true, Math.PI * 0.4, Math.PI * 1.2);
        visor.rotateX(Math.PI / 2); visor.translate(x, 0, 0.24); put(HB2, mVisor, visor);
      }
      flush(HB2, head, { uv: 4 });
      // box + band clamps on the pole
      put(SB, mPole, bx(0.24, 0.48, 0.2, poleBase.x + 0.17, atDist(520, 155, SD).y, poleBase.z, 0.03));
      for (const py of [70, 222, 497, 400]) put(SB, mPole, rodG(V3(poleBase.x, atDist(520, py, SD).y - 0.07, poleBase.z), V3(poleBase.x, atDist(520, py, SD).y + 0.07, poleBase.z), 0.15, 14));
    }
    // pedestrian signal + kanji panel + turn-right sign
    {
      const pc = atDist(428, 445, SD - 0.3);
      const ped = new THREE.Group(); ped.position.copy(pc); ped.lookAt(CP); sig.add(ped);
      const PB = bucket();
      put(PB, M({ color: '#d6c4a4', roughness: 0.5, metalness: 0.2 }), bx(0.44, 0.98, 0.26, 0, 0, -0.13, 0.04));
      for (const y of [0.22, -0.2]) {
        put(PB, mVisor, bx(0.4, 0.035, 0.16, 0, y + 0.2, 0.06, 0.01), bx(0.025, 0.36, 0.14, -0.19, y, 0.05), bx(0.025, 0.36, 0.14, 0.19, y, 0.05));
      }
      flush(PB, ped, { uv: 4 });
      const redMan = paintTexture('s1_pedred', 64, 64, (g) => { g.fillStyle = '#5a1a10'; g.fillRect(0, 0, 64, 64); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, '#ffe080'); gr.addColorStop(0.5, '#ff7a28'); gr.addColorStop(1, '#a02a10'); g.fillStyle = gr; g.fillRect(4, 4, 56, 56); });
      const blueMan = paintTexture('s1_pedblue', 64, 64, (g) => { g.fillStyle = '#c8e4f0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#88b4d4'; g.fillRect(8, 8, 48, 48); g.fillStyle = '#e8f6ff'; g.beginPath(); g.arc(32, 18, 6, 0, 7); g.fill(); g.fillRect(26, 26, 12, 26); });
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.36), new THREE.MeshBasicMaterial({ map: redMan, color: new THREE.Color(1.6, 1.4, 1.2) })); a.position.set(0, 0.22, 0.005); ped.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.36), new THREE.MeshBasicMaterial({ map: blueMan })); b.position.set(0, -0.2, 0.005); ped.add(b);
      const kanji = paintTexture('s1_kanji', 64, 160, (g, w, h) => {
        g.fillStyle = '#f2e6cc'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a7a66'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
        g.fillStyle = '#6a5a4a'; g.font = 'bold 15px sans-serif';
        const tx = ['歩', '行', '者', '自', '転', '車', '専', '用'];
        tx.forEach((c, i) => g.fillText(c, i < 3 ? 34 : 10, 26 + (i < 3 ? i : i - 3) * 22));
      });
      const kb = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.92, 0.04, 1, 0.012), M({ color: '#d8ccb4', roughness: 0.5, metalness: 0.3 }));
      kb.position.set(0.43, -0.05, -0.03); kb.castShadow = kb.receiveShadow = true; ped.add(kb);
      const kp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.9), M({ map: kanji, roughness: 0.6 })); kp.position.set(0.43, -0.05, -0.008); kp.receiveShadow = true; ped.add(kp);
      put(SB, mPole, rodG(atDist(445, 497, SD), atDist(512, 497, SD), 0.04, 8), rodG(atDist(445, 400, SD), atDist(512, 400, SD), 0.04, 8));
      // turn-right sign: disc with thickness + rolled rim, printed face, bracket clamps
      const signTex = paintTexture('s1_turnsign', 256, 256, (g) => {
        g.clearRect(0, 0, 256, 256);
        g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
        g.fillStyle = '#3d9a86'; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill();
        g.strokeStyle = '#f8f6ee'; g.lineWidth = 22; g.lineCap = 'butt';
        g.beginPath(); g.moveTo(100, 210); g.lineTo(100, 130); g.quadraticCurveTo(100, 100, 135, 100); g.lineTo(160, 100); g.stroke();
        g.fillStyle = '#f8f6ee'; g.beginPath(); g.moveTo(155, 62); g.lineTo(205, 100); g.lineTo(155, 138); g.closePath(); g.fill();
      });
      const sc = atDist(568, 458, SD - 0.6);
      const sign = new THREE.Group(); sign.position.copy(sc); sign.lookAt(CP.clone().add(V3(4, 0, 0))); sig.add(sign);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.025, 48), M({ color: '#a8aaa8', roughness: 0.4, metalness: 0.7 }));
      disc.rotation.x = Math.PI / 2; disc.castShadow = disc.receiveShadow = true; sign.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.012, 6, 48), M({ color: '#e8e8e2', roughness: 0.35, metalness: 0.6 })); rim.position.z = 0.012; sign.add(rim);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.322, 48), M({ map: signTex, roughness: 0.35, envMapIntensity: 1.0 })); face.position.z = 0.0135; face.receiveShadow = true; sign.add(face);
      const mSp = M({ color: '#e6e2da', roughness: 0.4, metalness: 0.5 });
      put(SB, mSp, rodG(V3(sc.x, 0, sc.z - 0.06), V3(sc.x, sc.y + 0.3, sc.z - 0.06), 0.04, 10));
      for (const dy of [-0.18, 0.18]) put(SB, mSp, bx(0.1, 0.05, 0.1, sc.x, sc.y + dy, sc.z - 0.04, 0.01));
      flush(SB, sig, { uv: 4 });
    }

    /* ---------------- foreground fence, bicycle, low wall ---------------- */
    const fence = new THREE.Group(); scene.add(fence);
    {
      const FD = 17;
      const T0 = atDist(470, 602, FD), T1 = onY(1280, 545, T0.y);
      const FY = T0.y;
      const dir = T1.clone().sub(T0); const len = dir.length(); dir.normalize();
      const ang = Math.atan2(-dir.z, dir.x);
      const g = new THREE.Group(); g.position.copy(T0); g.rotation.y = ang; fence.add(g);
      const FB = bucket();
      const mFr = M({ color: '#a8a4b4', roughness: 0.45, metalness: 0.4 }, UF);
      for (const yy of [0, -0.42, -0.9]) put(FB, mFr, rodG(V3(-2, yy, 0), V3(len + 2, yy, 0), yy === 0 ? 0.05 : 0.035, 10));
      const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0a8').multiplyScalar(1.5) });
      const fplane = T0.clone(), fN = V3(-dir.z, 0, dir.x);
      for (const px of [487, 545, 610, 680, 770, 875, 990, 1135, 1272]) {
        const P = onPlane(px, 600, fplane, fN).sub(T0); const x = P.dot(dir);
        put(FB, mFr, bx(0.13, 2.4, 0.13, x, -1.1, 0, 0.02), bx(0.17, 0.05, 0.17, x, 0.12, 0, 0.01));
        put(FB, glowM, bx(0.035, 2.2, 0.135, x - 0.055, -1.05, 0.003));
      }
      flush(FB, g, { uv: 2 });
      // warm lit panels behind fence (low building wall)
      const panelTex = paintTexture('s1_panels', 256, 128, (g2, w, h) => {
        g2.fillStyle = '#e3a75a'; g2.fillRect(0, 0, w, h);
        g2.fillStyle = '#7d5a52'; for (let i = 0; i < 6; i++) g2.fillRect(i * 44 + 30, 0, 8, h);
        g2.fillStyle = 'rgba(255,220,140,0.6)'; g2.fillRect(0, 0, w, 10);
      });
      const Q = atDist(1000, 690, FD + 4);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), flat({ map: panelTex }));
      wall.position.set(Q.x, Q.y - 0.3, Q.z); wall.rotation.y = ang; scene.add(wall);
      // left low railing (sunlit tubes) + lit wall
      const lrM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc870').multiplyScalar(1.15) });
      const L0 = atDist(290, 648, 16), L1 = atDist(470, 655, 16); L1.y = L0.y;
      const lg = new THREE.Group(); lg.position.copy(L0); const ld = L1.clone().sub(L0); lg.rotation.y = Math.atan2(-ld.z, ld.x); fence.add(lg);
      const ll = ld.length(); const LB = bucket();
      put(LB, lrM, rodG(V3(0, 0, 0), V3(ll, 0, 0), 0.022, 6), rodG(V3(0, -0.2, 0), V3(ll, -0.2, 0), 0.018, 6));
      for (let i = 0; i <= 6; i++) put(LB, lrM, rodG(V3(i * ll / 6, 0, 0), V3(i * ll / 6, -1.0, 0), 0.018, 6));
      flush(LB, lg, { cast: false, recv: false });
      const lw = atDist(380, 705, 17);
      const lowWall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.0, 0.3), flat({ color: '#f2bd68' })); lowWall.position.set(lw.x, lw.y - 0.3, lw.z); lowWall.rotation.y = lg.rotation.y; scene.add(lowWall);

      // bicycle leaning on the fence (centre ~ screen 778, wheels 690..865): modelled road bike
      const bike = new THREE.Group();
      const bc = onPlane(778, 650, T0, fN);
      bike.position.set(bc.x, FY - 1.25, bc.z); bike.scale.setScalar(1.25); bike.rotation.y = ang; scene.add(bike);
      const BK = bucket();
      const mFrame = M({ color: '#cc3a1c', roughness: 0.28, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }, UF);
      const mTire = M({ color: '#2a2a30', roughness: 0.85 }, UF);
      const mMetal = M({ color: '#dcdce0', roughness: 0.25, metalness: 0.95 }, UF);
      const mBlack = M({ color: '#1e1c20', roughness: 0.5 }, UF);
      const wheelR = 0.34;
      const T = (a, b2, r = 0.017, m = mFrame) => put(BK, m, rodG(V3(...a), V3(...b2), r, 8));
      for (const xw of [-0.52, 0.52]) {
        const tr = new THREE.TorusGeometry(wheelR, 0.018, 8, 48); tr.translate(xw, wheelR, 0); put(BK, mTire, tr);
        const rm = new THREE.TorusGeometry(wheelR - 0.03, 0.009, 5, 48); rm.translate(xw, wheelR, 0); put(BK, mMetal, rm);
        put(BK, mMetal, rodG(V3(xw, wheelR, -0.05), V3(xw, wheelR, 0.05), 0.022, 10));
        for (let sp = 0; sp < 16; sp++) {
          const a = sp / 16 * Math.PI * 2, side = sp % 2 ? 0.03 : -0.03;
          put(BK, mMetal, rodG(V3(xw, wheelR, side), V3(xw + Math.cos(a) * (wheelR - 0.035), wheelR + Math.sin(a) * (wheelR - 0.035), 0), 0.0025, 3));
        }
      }
      const BB = [0.0, 0.3, 0], ST = [-0.12, 0.84, 0], HT = [0.42, 0.82, 0], HBt = [0.45, 0.68, 0];
      T(BB, ST, 0.019); T(ST, HT, 0.017); T(BB, HBt, 0.021); T(HT, HBt, 0.022);
      for (const z of [-0.035, 0.035]) { T(BB, [-0.52, wheelR, z], 0.011); T(ST, [-0.52, wheelR, z], 0.01); T(HBt, [0.52, wheelR, z], 0.012); }
      T(HT, [0.47, 0.93, 0], 0.014, mMetal); T([0.47, 0.93, 0], [0.42, 0.93, 0], 0.013, mMetal);
      // drop handlebar
      const hb = new THREE.TorusGeometry(0.075, 0.012, 6, 16, Math.PI); hb.rotateZ(-Math.PI / 2);
      for (const z of [-0.2, 0.2]) { const h2 = hb.clone(); h2.translate(0.42, 0.855, z); put(BK, mBlack, h2); }
      T([0.42, 0.93, -0.2], [0.42, 0.93, 0.2], 0.013, mBlack);
      T(ST, [-0.15, 0.95, 0], 0.012, mMetal);
      put(BK, mBlack, bx(0.24, 0.045, 0.1, -0.16, 0.97, 0, 0.02));
      const cr = new THREE.TorusGeometry(0.09, 0.012, 6, 24); cr.translate(0, 0.3, 0.06); put(BK, mMetal, cr);
      T([0, 0.3, 0.08], [0.07, 0.15, 0.1], 0.012, mMetal); T([0, 0.3, -0.08], [-0.07, 0.45, -0.1], 0.012, mMetal);
      put(BK, mBlack, bx(0.1, 0.02, 0.06, 0.07, 0.15, 0.13), bx(0.1, 0.02, 0.06, -0.07, 0.45, -0.13));
      T([0.0, 0.3, 0.07], [-0.52, wheelR, 0.07], 0.004, mBlack);
      flush(BK, bike, { uv: 4 });
      bike.rotation.z = -0.04;
    }

    /* ---------------- big conifer/bushy tree (left) ---------------- */
    {
      const r = rng(11);
      const TD2 = 7.5;
      const clumps = [];
      const rightEdge = (py) => py < 40 ? 135 : py < 250 ? 175 : py < 560 ? 215 : 225;
      const leftEdge = (py) => py < 300 ? 240 - py * 0.8 : -80;
      for (let py = -40; py < 780; py += 34) {
        const re = rightEdge(py);
        for (let px = leftEdge(py); px < re; px += 60) {
          const jx = px + (r() - 0.5) * 40, jy = py + (r() - 0.5) * 30;
          const edge = re - jx;
          const p = atDist(jx, jy, TD2 + (r() - 0.5) * 1.2 + (edge < 60 ? 0.4 : 0));
          clumps.push([p.x, p.y, p.z, lerp(0.28, 0.45, r())]);
        }
      }
      const tree = makeFoliage({ clumps, density: 3, cardSize: 0.42, kind: 'round', seed: 3, texSeed: 2,
        dark: '#10180b', mid: '#18220f', light: '#222e15', highlight: '#2e3c1c', wind: 0.02, shell: 0.6, lightWrap: 0.35, terminator: 0.0, sizeJitter: 0.6 });
      scene.add(tree);
      const bl = [];
      for (let i = 0; i < 11; i++) {
        const py = lerp(40, 520, Math.pow(r(), 1.3)), lo = rightEdge(py) - 130, hi = rightEdge(py) + 10;
        const px = lerp(lo, hi, Math.sqrt(r()));
        const p = atDist(px, py, TD2 - 0.9); bl.push([p.x, p.y, p.z, lerp(0.22, 0.32, r())]);
      }
      scene.add(makeFoliage({ clumps: bl, density: 0.5, cardSize: 0.24, kind: 'round', seed: 21, texSeed: 5, flatten: 0.6,
        dark: '#4c5a34', mid: '#5c6c3e', light: '#6c7e45', highlight: '#7d8f4a', wind: 0.025, shell: 0.5, lightWrap: 0.9, terminator: 0.2, sizeJitter: 0.4 }));
      const rim = [];
      for (let i = 0; i < 7; i++) { const py = lerp(60, 520, r()); const p = atDist(rightEdge(py) + lerp(55, 95, r()), py, TD2 - 0.2); rim.push([p.x, p.y, p.z, lerp(0.04, 0.07, r())]); }
      scene.add(makeFoliage({ clumps: rim, density: 1.2, cardSize: 0.12, kind: 'round', seed: 33, texSeed: 7,
        dark: '#4a4420', mid: '#7a6a2c', light: '#a88a3a', highlight: '#c8a048', wind: 0.025, shell: 0.4, lightWrap: 0.7, terminator: 0.05 }));
      const lc = [];
      for (let py = 450; py < 780; py += 55) for (let px = -20; px < 70; px += 50) { if (px > 20 && py < 540) continue; const p = atDist(px + (r() - 0.5) * 20, py + (r() - 0.5) * 20, 4.0); lc.push([p.x, p.y, p.z, 0.12]); }
      scene.add(makeFoliage({ clumps: lc, density: 2.2, cardSize: 0.26, kind: 'broad', seed: 8, texSeed: 3,
        dark: '#173626', mid: '#2f6540', light: '#5a9a58', highlight: '#9ccc78', wind: 0.04, shell: 0.5, lightWrap: 0.5 }));
    }

    /* ---------------- motes ---------------- */
    const m0 = atDist(640, 400, 12);
    scene.add(makeMotes({ count: 50, box: [[m0.x - 6, m0.y - 3, m0.z - 3], [m0.x + 6, m0.y + 4, m0.z + 3]], size: 0.05, color: '#ffe4a8', opacity: 0.6, seed: 4 }));

    /* ---------------- off-screen shadow caster: a building toward the sun shades the right part of the viaduct ---------------- */
    {
      const SBd = local(805, 380, 0)[0];
      const q = (s, h) => fromLocal(s, h, 0).addScaledVector(SUN, 30);
      const pts = [q(SBd + 0.6 * 20, -20), q(S1 + 300, -20), q(S1 + 300, 3), q(SBd - 0.6 * 3, 3)];
      const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]);
      const occ = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
      occ.castShadow = true; occ.frustumCulled = false; scene.add(occ);
    }

    /* ---------------- fit the sun's shadow frustum to the visible set ---------------- */
    {
      const pts = [];
      for (const D of [12, 30, 60]) for (const px of [0, 640, 1280]) for (const py of [0, 720]) pts.push(atDist(px, py, D));
      for (const px of [200, 700, 1080]) for (const py of [0, 400]) pts.push(atDist(px, py, 102));
      const c = pts.reduce((a, p) => a.add(p), V3(0, 0, 0)).multiplyScalar(1 / pts.length);
      sun.target.position.copy(c); sun.position.copy(c).addScaledVector(SUN, 200);
      const dc = new THREE.OrthographicCamera(); dc.position.copy(sun.position); dc.lookAt(c); dc.updateMatrixWorld(true);
      const lo = V3(1e9, 1e9, 1e9), hi = V3(-1e9, -1e9, -1e9);
      for (const p of pts) { const v = p.clone().applyMatrix4(dc.matrixWorldInverse); lo.min(v); hi.max(v); }
      const sc = sun.shadow.camera; sc.left = lo.x - 1; sc.right = hi.x + 1; sc.bottom = lo.y - 1; sc.top = hi.y + 1;
      sc.near = Math.max(1, -hi.z - 40); sc.far = -lo.z + 20; sc.updateProjectionMatrix();
    }

    // train timing: front s position (viaduct local) vs time
    const trainS = (t) => -4.3 + (t - 1.2) * 13.6;

    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(FOL_SUN);
        shared.uDapple.value = 0; shared.uFogMax.value = 0;
        train.position.x = trainS(t);
        train.visible = true;
      },
    };
  },
};
