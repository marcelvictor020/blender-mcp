// Shot 2 — very low angle looking up: concrete overpass (upper-left), utility pole + wires, towering cumulus,
// red drink vending machine in dappled leaf shadow (hero), chain-link fences, striped barrier tape with bulbs,
// traffic cone, framing leaves, glowing butterflies.
// REALISM PASS: modelled PBR geometry (pbr.js) lit by one shadow-casting sun with leaf-shadow dapple on direct light and
// PMREM sky reflections: red machine (rounded cabinet, recessed display with instanced bottles/cans, buttons, slots, outlet,
// decals, dusty glass), chamfered concrete overpass with haunch brackets + girders + railing tubes, square concrete pole
// with ladder recess / step bolts / crossarm / insulators, chain-link on real posts + rails, glowing tape, lathe cone.
import { pbrUniforms, pbr, makeEnvMap, addSunShadow, canvasTex, texSet } from '../pbr.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SUN = [-0.25, 0.6, 0.76];

export default {
  duration: 3.0,
  credit: { role: 'CONCEPT AND DESIGN', cx: 0.297, ry: 0.51, ny: 0.556 },
  post: { bloom: 0.35, bloomRadius: 0.45, bloomThreshold: 0.8, exposure: 1.0, contrast: 1.04, saturation: 1.0,
    lift: [0.02, 0.012, 0.0], vignette: 0.2, grain: 0.03, ca: 0.001, soft: 0.2 },
  build(core) {
    const { THREE, makeSky, makeFoliage, makeWire, makeButterflies, makeMotes, shared,
      paintTexture, softDotTexture, rng, lerp, col } = core;
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
    const UP = new THREE.Vector3(0, 1, 0);

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
        g.filter = 'blur(1.5px)';
        const lobes = [];
        for (const [bx, by, br] of blobs) {
          const x = (bx - X0) * SC, y = (by - Y0) * SC, rr = br * SC;
          lobes.push([x, y, rr]);
          for (let k = 0; k < 3; k++) { const a = -Math.PI * (0.1 + 0.8 * r()); lobes.push([x + Math.cos(a) * rr * 0.72, y + Math.sin(a) * rr * 0.72, rr * (0.4 + r() * 0.2)]); }
        }
        const pass = (colr, off, sc) => { g.fillStyle = colr; g.beginPath(); for (const [x, y, rr] of lobes) { g.moveTo(x + LD[0] * off * rr + rr * sc, y + LD[1] * off * rr); g.arc(x + LD[0] * off * rr, y + LD[1] * off * rr, rr * sc, 0, Math.PI * 2); } g.fill(); };
        pass('#7a929b', 0, 1.0);
        g.save(); g.beginPath(); for (const [x, y, rr] of lobes) { g.moveTo(x + rr, y); g.arc(x, y, rr, 0, Math.PI * 2); } g.clip();
        pass('#97a3a2', 0.18, 0.96);
        pass('#aca89e', 0.42, 0.84);
        pass('#b8b2a6', 0.7, 0.5);
        g.globalCompositeOperation = 'multiply';
        const gr = g.createLinearGradient(0, (150 - Y0) * SC, 0, (330 - Y0) * SC);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(200,215,225,0.55)'); gr.addColorStop(1, 'rgba(170,195,210,0.8)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'source-over';
        g.restore();
      });
      card(X0, Y0, X1, Y1, 900, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })).renderOrder = -5;
    }

    /* ---------------- lighting: one shadow-casting sun + sky env + leaf-shadow dapple ---------------- */
    shared.uSunDir.value.copy(sunDir);
    const env = makeEnvMap('s2_env', {
      zenith: '#1a7a92', horizon: '#a2c6c4', ground: '#433c36', sunDir: SUN, sunColor: '#ffe8cc', sunPower: 16,
      clouds: [{ dir: [0.35, 0.55, -1], size: 7, power: 1.6 }, { dir: [-0.4, 0.7, 0.6], size: 5, power: 1.2 }],
      blocks: [
        { dir: [-1, -0.3], w: 30, h: 14, dist: 12, y: 2, color: '#5a554e' },   // overpass, upper left
        { dir: [1, -0.2], w: 26, h: 16, dist: 9, color: '#1c3424' },           // tree mass right
        { dir: [0, 1], w: 40, h: 10, dist: 8, color: '#18281e' },             // trees behind the camera
        { dir: [-1, 0.5], w: 20, h: 12, dist: 6, color: '#16301f' },
      ],
    });
    const UNI = (o) => pbrUniforms({ sunDir: SUN, leafScale: 8.5, leafSharp: 0.085, leafSeed: 9.0, grime: 0, ...o });
    const LEAF = { leafAmt: 0.97, leafCover: 0.505 };
    const UM = UNI({ ...LEAF, grime: 0.05 });                 // machine body + cone under the tree
    const UGl = UNI({ ...LEAF, leafCover: 0.465, sunGain: 1.2 });               // dusty glass: catches bright leaf-shaped sun patches
    const UPr = UNI({ ...LEAF, sunGain: 0.6 });                // products behind the glass
    const UO = UNI({ leafAmt: 0 });                           // overpass / pole (open sun)
    const UF = UNI({ leafAmt: 0.45, leafCover: 0.42, leafScale: 5.0 });   // fences / tape
    const sunLight = addSunShadow(scene, { sunDir: SUN, color: '#ffe0b4', intensity: 3.4,
      target: new THREE.Vector3(0.6, 0.3, -2.9), radius: 2.6, mapSize: 2048 });
    sunLight.shadow.bias = -0.0003; sunLight.shadow.normalBias = 0.01;
    scene.add(new THREE.HemisphereLight(col('#86c0d0'), col('#574c44'), 0.62));
    // pbr material with an anisotropic (diagonal, streaky) leaf-shadow cookie with a third leaf layer
    const M = (u, o, key = 's2') => {
      const m = pbr(u, { envMap: env, envMapIntensity: 0.9, ...o }, null, key); const ob = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => { ob(sh, r); sh.fragmentShader = sh.fragmentShader.replace('float w = 0.20 * pow(1.0 - yy * yy, 0.7);', 'float w = 0.24 * pow(1.0 - yy * yy, 0.6);').replace('vec2 q = vec2(dot(p, t1), dot(p, t2)) * uLeafScale + uLeafSeed;',
        'vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * vec2(dot(p, t1), dot(p, t2)); q = q * uLeafScale * vec2(0.85, 1.12) + uLeafSeed;')
        .replace('float lit = open * (1.0 - 0.9 * l1) * (1.0 - 0.55 * l2) * (1.0 - 0.8 * tw);',
          `vec2 qa = q * 0.52; vec2 wq = vec2(fbm(qa * 0.6 + 3.0), fbm(qa * 0.6 + 8.0));
          float big = fbm(qa + wq * 1.3) * 0.62 + 0.38 * fbm(q * 1.05 + wq * 0.8 + 6.0);           // broad sun patches
          float f = big - 0.1 * l1 - 0.08 * l2 - 0.05 * tw;                         // leaf-shaped bites on the edges
          float lit = 0.5 + (f - uLeafCover) * 3.2;`); };
      m.customProgramCacheKey = () => key + '_s2a'; return m;
    };
    const add = (geo, mat, parent = scene, cast = true, recv = true) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m; };
    const rbox = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
    const rodGeo = (a, b, rad, seg = 8) => {
      const len = a.distanceTo(b); const g = new THREE.CylinderGeometry(rad, rad, len, seg, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
      g.applyQuaternion(q); const m = a.clone().lerp(b, 0.5); g.translate(m.x, m.y, m.z); return g;
    };
    const rod = (a, b, rad, mat, parent = scene, seg = 8) => add(rodGeo(a, b, rad, seg), mat, parent);
    // box-projected world-scale UVs (s metres per texture tile) for boxes / rounded boxes
    const boxUV = (geo, s) => { const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (ax >= ay && ax >= az) uv.setXY(i, z / s, y / s); else if (ay >= az) uv.setXY(i, x / s, z / s); else uv.setXY(i, x / s, y / s); }
      return geo; };

    /* ---------------- concrete texture set (stains, drips, form lines, pits) ---------------- */
    const concT = texSet(512, 512, (g, w, h) => {
      const r = rng(21); g.fillStyle = '#b6aea2'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 110; const gr = g.createRadialGradient(x, y, 0, x, y, rr);
        const v = r() < 0.55 ? '74,70,64' : '226,220,208'; gr.addColorStop(0, `rgba(${v},${0.08 + r() * 0.12})`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      g.filter = 'blur(3px)'; for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, len = 40 + r() * 200; const gr = g.createLinearGradient(0, y, 0, y + len);
        gr.addColorStop(0, `rgba(58,48,40,${0.18 + r() * 0.25})`); gr.addColorStop(1, 'rgba(58,48,40,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 9, len); }
      g.filter = 'none';
      for (let i = 0; i < 9000; i++) { const v = r() < 0.5 ? 80 + r() * 40 : 190 + r() * 50; g.fillStyle = `rgba(${v | 0},${(v - 6) | 0},${(v - 14) | 0},${0.25 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1 + r() * 1.6); }
            for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(40,34,30,0.45)'; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 1.5, 0, 7); g.fill(); }
    }, { normalStrength: 2.4, roughBase: 0.86, roughVar: 0.2 });
    const concM = (c, key = 's2conc', u = UO) => M(u, { color: c, map: concT.map, normalMap: concT.normalMap, roughnessMap: concT.roughnessMap, envMapIntensity: 0.55 }, key);

    /* ---------------- overpass: chamfered edge beam + coping, deck, haunch brackets, I-girders, railing tubes ---------------- */
    const H = 5.2;                         // coping height above camera
    const P1 = hitY(150, 52, H), P2 = hitY(625, 336, H);
    const D = P2.clone().sub(P1).setY(0).normalize();
    let N = new THREE.Vector3(-D.z, 0, D.x); if (N.dot(P1.clone().sub(CAM).setY(0)) < 0) { N.negate(); D.negate(); }
    const opGroup = new THREE.Group(); scene.add(opGroup);
    const basis = new THREE.Matrix4().makeBasis(D, UP, N);  // local x along road, z away from camera
    opGroup.matrixAutoUpdate = false;
    opGroup.matrix.copy(basis).setPosition(P1); opGroup.matrixWorldNeedsUpdate = true;
    {
      const L0 = -80, L1 = 220, LEN = L1 - L0, WID = 40, LC = (L0 + L1) / 2;
      const fasciaM = concM('#ffffff'), underM = concM('#a49e96'), girderM = concM('#bab4ac');
      const DY = -0.42;   // deck sits below the railing tops (tall posts as in the original)
      const ob = (geo, mat, x, y, z, s = 3.0) => { geo.translate(x, y + DY, z); boxUV(geo, s); return add(geo, mat, opGroup, false, true); };
      ob(new THREE.BoxGeometry(LEN, 0.42, WID), underM, LC, -0.62, WID / 2);              // deck slab
      ob(rbox(LEN, 0.74, 0.36, 0.05, 2), fasciaM, LC, -0.3, 0.13);                       // edge beam (fascia), chamfered
      ob(rbox(LEN, 0.12, 0.46, 0.035, 2), fasciaM, LC, 0.1, 0.16);                       // coping
      ob(rbox(LEN, 0.06, 0.1, 0.02, 1), underM, LC, -0.69, -0.02);                       // drip lip
      // haunch brackets (triangular plates) under the edge beam
      const sh = new THREE.Shape([new THREE.Vector2(0.2, -0.64), new THREE.Vector2(0.4, -0.64), new THREE.Vector2(0.5, -0.8), new THREE.Vector2(1.55, -1.74), new THREE.Vector2(1.47, -1.79), new THREE.Vector2(0.24, -0.8)]);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
      bg.rotateY(-Math.PI / 2); bg.computeVertexNormals(); boxUV(bg, 1.5);
      const nb = Math.floor(LEN / 1.44); const bim = new THREE.InstancedMesh(bg, girderM, nb); bim.receiveShadow = true;
      for (let i = 0; i < nb; i++) bim.setMatrixAt(i, new THREE.Matrix4().makeTranslation(L0 + i * 1.44 + 0.04, DY, 0));
      opGroup.add(bim);
      // longitudinal I-girders under the deck
      for (let z = 1.6, k = 0; z < WID; z += 3.4, k++) {
        ob(rbox(LEN, 1.0, 0.26, 0.03, 1), girderM, LC, -1.33, z);
        ob(rbox(LEN, 0.16, 0.7, 0.04, 1), girderM, LC, -1.86, z);
        ob(rbox(LEN, 0.12, 0.5, 0.03, 1), underM, LC, -0.88, z);
      }
      // far side: shaded pier wall + cross beams
      ob(new THREE.BoxGeometry(LEN, 30, 0.5), concM('#3a3532'), LC, -15, WID, 4);
      for (let k = 0; k < 9; k++) ob(rbox(LEN, 0.35, 0.4, 0.04, 1), girderM, LC, -2.2 - k * 2.4, WID - 0.5);
      // railing: white tube posts, three rusty rails
      const postM = M(UO, { color: '#ece6da', roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }, 's2paint');
      const railM = M(UO, { color: '#5e3a2e', roughness: 0.5, metalness: 0.45, envMapIntensity: 0.8 }, 's2paint');
      const pg = new THREE.CylinderGeometry(0.028, 0.032, 1.5, 10).translate(0, 0.49, 0.14);
      const np = Math.floor(LEN / 0.72); const pim = new THREE.InstancedMesh(pg, postM, np); pim.receiveShadow = true;
      for (let i = 0; i < np; i++) pim.setMatrixAt(i, new THREE.Matrix4().makeTranslation(L0 + i * 0.72 + 0.36, 0, 0));
      opGroup.add(pim);
      for (const [y, r] of [[1.24, 0.026], [0.84, 0.016], [0.44, 0.016]]) add(new THREE.CylinderGeometry(r, r, LEN, 8).rotateZ(Math.PI / 2).translate(LC, y, 0.14), railM, opGroup, false, true);
      add(new THREE.CylinderGeometry(0.03, 0.03, LEN, 8).rotateZ(Math.PI / 2).translate(LC, 1.24, 0.14), railM, opGroup, false, true);
    }

    /* ---------------- utility pole: square concrete column with ladder recess, step bolts, crossarm, insulators ---------------- */
    const PB = at(492, 600, 7.0), PT = at(518, 132, 0);
    const dP = (() => { const r = ray(518, 132); const hb = Math.hypot(PB.x, PB.z); const rh = Math.hypot(r.x, r.z); PT.copy(CAM).addScaledVector(r, hb / rh); return PT.distanceTo(CAM); })();
    {
      const poleT = texSet(128, 512, (g, w, h) => {
        const r = rng(33); g.fillStyle = '#cdc1aa'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 3000; i++) { const v = r() < 0.5 ? 90 + r() * 50 : 200 + r() * 40; g.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 18) | 0},${0.2 + r() * 0.4})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 2); }
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(70,58,48,${0.08 + r() * 0.16})`; g.fillRect(r() * w, r() * h, 1 + r() * 4, 20 + r() * 120); }
        g.fillStyle = '#3c332d'; g.fillRect(w * 0.34, 0, w * 0.32, h);                                  // recessed ladder channel
        for (let k = 0; k < 4; k++) { const y = k * h / 4; g.fillStyle = '#c3b7a0'; g.fillRect(w * 0.32, y, w * 0.36, h * 0.05);
          g.fillStyle = 'rgba(30,24,20,0.5)'; g.fillRect(w * 0.34, y + h * 0.05, w * 0.32, h * 0.012); }
        g.fillStyle = 'rgba(255,248,232,0.35)'; g.fillRect(w * 0.3, 0, 2, h); g.fillRect(w * 0.69, 0, 2, h);
      }, { normalStrength: 3.0, roughBase: 0.85 });
      for (const t of [poleT.map, poleT.normalMap, poleT.roughnessMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const len = PT.distanceTo(PB);
      for (const t of [poleT.map, poleT.normalMap, poleT.roughnessMap]) t.repeat.set(4, len / 1.7);
      let pg = new THREE.CylinderGeometry(0.11 * Math.SQRT2, 0.15 * Math.SQRT2, len, 4, 1, false, Math.PI / 4).toNonIndexed();
      const toCam = CAM.clone().sub(PB).setY(0).normalize();
      pg.rotateY(Math.atan2(toCam.x, toCam.z)); pg.computeVertexNormals();
      const pm = M(UO, { color: '#ffffff', map: poleT.map, normalMap: poleT.normalMap, roughnessMap: poleT.roughnessMap, roughness: 1, envMapIntensity: 0.6 }, 's2pole');
      const pole = add(pg, pm);
      const dir = PT.clone().sub(PB).normalize();
      pole.position.copy(PB).lerp(PT, 0.5);
      pole.quaternion.setFromUnitVectors(UP, dir);
      const rust = M(UO, { color: '#4a2a22', roughness: 0.6, metalness: 0.5 }, 's2steel');
      const steel = M(UO, { color: '#5a4038', roughness: 0.5, metalness: 0.55 }, 's2steel');
      const porc = M(UO, { color: '#7a3424', roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1 }, 's2steel');
      // step bolts, alternating sides
      const side = new THREE.Vector3().crossVectors(UP, toCam).normalize();
      for (let k = 0; k < 14; k++) {
        const t = 0.32 + k * 0.05; const c = PB.clone().lerp(PT, t); const sx = k % 2 ? 1 : -1; const hw = lerp(0.15, 0.11, t);
        rod(c.clone().addScaledVector(side, sx * hw * 0.8), c.clone().addScaledVector(side, sx * (hw + 0.17)).add(new THREE.Vector3(0, 0.02, 0)), 0.013, rust, scene, 6);
      }
      // crossarm with insulators + drop loop
      const ca0 = at(450, 95, dP), ca1 = at(516, 156, dP);
      add(rbox(ca0.distanceTo(ca1), 0.085, 0.085, 0.012, 1), steel).position.copy(ca0).lerp(ca1, 0.5);
      scene.children[scene.children.length - 1].quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), ca1.clone().sub(ca0).normalize());
      add(rbox(0.3, 0.07, 0.07, 0.01, 1), steel).position.copy(at(512, 168, dP));                     // brace clamp
      for (const t of [0.25, 0.9]) add(new THREE.TorusGeometry(0.16, 0.012, 5, 16).rotateX(Math.PI / 2), steel).position.copy(PB.clone().lerp(PT, t));
      for (const [px, py] of [[457, 100], [484, 88], [498, 131]]) {
        const b = at(px, py + 6, dP);
        add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), steel).position.copy(b);
        for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.045 - k * 0.004, 0.05 - k * 0.004, 0.028, 12), porc).position.copy(b).add(new THREE.Vector3(0, 0.03 + k * 0.035, 0));
      }
    }
    const wireCol = '#2a1a16';
    const W = (a, b, sag = 0.1, rad = 0.018) => scene.add(makeWire(a.toArray(), b.toArray(), { sag, radius: rad, color: wireCol }));
    {
      W(at(456, 99, dP), at(800, -10, dP * 1.15), 0.05);
      W(at(486, 90, dP), at(980, -10, dP * 1.2), 0.08);
      W(at(456, 99, dP), at(160, 330, dP * 0.9), 0.06);
      W(at(486, 92, dP), at(180, 300, dP * 0.9), 0.06);
      W(at(498, 131, dP), at(250, 390, dP * 0.9), 0.08);
      W(at(498, 131, dP), at(640, 345, dP * 1.05), 0.05);
      W(at(510, 150, dP), at(640, 330, dP * 1.05), 0.02);
      W(at(487, 100, dP), at(515, 200, dP), 0.15, 0.012);
    }

    { const gp = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: col('#2a2420') })); gp.rotation.x = -Math.PI / 2; gp.position.y = GROUND; scene.add(gp); }

    /* ---------------- right tree mass (behind right fence) ---------------- */
    {
      const clumps = []; const r = rng(77);
      const pts = [[1000, 150, 1.4], [1080, 70, 1.6], [1180, 40, 1.8], [1260, 120, 1.8], [1240, 300, 2.0], [1120, 260, 1.8], [1010, 300, 1.5],
        [960, 420, 1.3], [1060, 450, 1.7], [1180, 470, 1.9], [1260, 560, 1.8], [1100, 620, 1.8], [1000, 600, 1.5], [980, 700, 1.4], [1200, 700, 1.6], [940, 290, 1.0]];
      for (const [px, py, rr] of pts) { const p = at(px, py, 11 + r() * 2); clumps.push([p.x, p.y, p.z, rr]); }
      scene.add(makeFoliage({ clumps, density: 7, cardSize: 1.1, kind: 'round', seed: 31, texSeed: 3,
        dark: '#1a2a20', mid: '#284a34', light: '#3c6a44', highlight: '#62925a', wind: 0.02, lightWrap: 0.45, shell: 0.6 }));
    }

    /* ---------------- chain-link fences: PBR wire mesh (alpha) on galvanised / rusty tube posts + rails ---------------- */
    const linkTex = paintTexture('s2_link', 128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.lineCap = 'round';
      for (let c = -2; c <= 4; c++) {
        const o = c * w / 2;
        g.beginPath(); g.moveTo(o, 0); g.bezierCurveTo(o + w * 0.3, h * 0.22, o + w * 0.2, h * 0.78, o + w, h); g.stroke();
        g.beginPath(); g.moveTo(o + w, 0); g.bezierCurveTo(o + w * 0.7, h * 0.22, o + w * 0.8, h * 0.78, o, h); g.stroke();
      }
    }, { srgb: false, repeat: true });
    const linkMat = (rep, c, u, op = 1) => { const t = linkTex.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep);
      return M(u, { color: c, alphaMap: t, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.0 }, 's2chain'); };
    const quad = (A, B, C, Dd, mat) => {   // A top-left, B top-right, C bottom-right, D bottom-left
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...A.toArray(), ...B.toArray(), ...C.toArray(), ...Dd.toArray()], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
      g.setIndex([0, 3, 1, 1, 3, 2]); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
    };
    const galv = M(UF, { color: '#c9bdb2', roughness: 0.35, metalness: 0.65, envMapIntensity: 1.1 }, 's2steel');
    const rustTube = M(UF, { color: '#4c3028', roughness: 0.55, metalness: 0.35 }, 's2steel');
    // left fence: top rail (125,548) -> (585,405)
    {
      const Hf = 1.05;
      const A = hitY(60, 568, Hf), B = hitY(600, 400, Hf);
      const len = A.distanceTo(B);
      quad(A, B, B.clone().setY(GROUND), A.clone().setY(GROUND), linkMat([len / 0.48, (Hf - GROUND) / 0.48], '#f4ccc0', UF, 0.95));
      rod(hitY(-40, 600, Hf), B, 0.036, galv, scene, 12);
      const pA = hitY(140, 545, Hf); rod(pA.clone().setY(Hf + 0.04), pA.clone().setY(GROUND), 0.038, galv, scene, 12);
      add(new THREE.SphereGeometry(0.042, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), galv).position.copy(pA).setY(Hf + 0.04);
      rod(pA.clone().setY(Hf - 0.05), hitY(420, 700, GROUND + 0.1), 0.022, galv, scene, 8);           // diagonal brace
      rod(B.clone().setY(Hf), B.clone().setY(GROUND), 0.036, galv, scene, 12);
    }
    // right fence: top rail (875,250) -> (1280,85)
    {
      const Hr = 2.6, KR = (Hr - CAM.y) / 1.5;   // pushed back (same screen line) so the fence stays behind the machine
      const A = hitY(860, 258, Hr), B = hitY(1330, 62, Hr);
      const len = A.distanceTo(B);
      quad(A, B, B.clone().setY(GROUND), A.clone().setY(GROUND), linkMat([len / (0.12 * KR), (Hr - GROUND) / (0.12 * KR)], '#d8ccc0', UNI({ leafAmt: 0.85, leafCover: 0.5, leafScale: 4 }), 0.9));
      rod(A, B, 0.032, rustTube, scene, 10);
      rod(at(975, 395, A.distanceTo(CAM)), at(1300, 512, 2.6), 0.024, rustTube, scene, 8);
    }

    /* ---------------- red vending machine (hero): rounded cabinet, recessed lit display, instanced products ---------------- */
    const TOP = 1.2;
    const MA = hitY(582, 356, TOP), MB = hitY(866, 262, TOP);
    const fdir = MB.clone().sub(MA).setY(0).normalize();
    const VW = MA.distanceTo(MB), VH = TOP - GROUND, VD = 0.78, T = 0.12, KICK = 0.07;
    const vm = new THREE.Group(); scene.add(vm);
    vm.position.set(MA.x, GROUND, MA.z);
    vm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fdir, UP, fdir.clone().cross(UP)));
    const X = (f) => f * VW, Y = (g) => VH - g * VH;      // front fractions (x from left, g from top) -> local
    const RED = '#c80f22';
    {
      const tw = 384, th = Math.round(384 * VH / VW);
      const frontTex = canvasTex(tw, th, (g, w, h) => {
        const r = rng(37); const x = (f) => f * w, y = (f) => f * h;
        g.fillStyle = '#cf1426'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 90; i++) { const cx = r() * w, cy = r() * h, rr = 10 + r() * 50; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
          const v = r() < 0.6 ? '90,0,8' : '255,110,100'; gr.addColorStop(0, `rgba(${v},${0.05 + r() * 0.06})`); gr.addColorStop(1, `rgba(${v},0)`); g.fillStyle = gr; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
        g.fillStyle = '#b4121a'; g.fillRect(0, 0, w, y(0.02));
        // right column: logo sticker
        g.fillStyle = '#f3ede7'; g.fillRect(x(0.9), y(0.055), x(0.075), y(0.11));
        g.fillStyle = '#d42a2e'; g.fillRect(x(0.915), y(0.07), x(0.045), y(0.03)); g.fillRect(x(0.925), y(0.11), x(0.025), y(0.04));
        // lower-left stickers
        g.fillStyle = '#efe8e2'; g.fillRect(x(0.06), y(0.64), x(0.13), y(0.09)); g.fillRect(x(0.06), y(0.745), x(0.1), y(0.035));
        g.fillStyle = '#8a8d96'; for (let i = 0; i < 6; i++) g.fillRect(x(0.075), y(0.652 + i * 0.012), x(0.09 + r() * 0.02), 2);
        g.fillStyle = '#3d5ab0'; g.fillRect(x(0.075), y(0.755), x(0.06), 3);
        // white wave strokes
        g.strokeStyle = '#f4ece4'; g.lineCap = 'round';
        g.lineWidth = w * 0.028; g.beginPath(); g.moveTo(x(0.3), y(0.585)); g.bezierCurveTo(x(0.36), y(0.66), x(0.5), y(0.7), x(0.62), y(0.74)); g.bezierCurveTo(x(0.74), y(0.78), x(0.86), y(0.84), x(0.98), y(0.96)); g.stroke();
        g.lineWidth = w * 0.01; g.beginPath(); g.moveTo(x(0.37), y(0.585)); g.bezierCurveTo(x(0.42), y(0.64), x(0.52), y(0.67), x(0.64), y(0.705)); g.stroke();
        g.lineWidth = w * 0.014; g.beginPath(); g.moveTo(x(0.02), y(0.6)); g.bezierCurveTo(x(0.06), y(0.7), x(0.03), y(0.82), x(0.1), y(0.95)); g.stroke();
        // dragon: dark scaled serpent body curving across the lower panel
        const bez = (t, p0, p1, p2, p3) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
        for (let i = 0; i < 520; i++) {
          const t = i / 520; const cx = x(bez(t, 0.48, 0.62, 0.8, 0.95)), cy = y(bez(t, 0.6, 0.66, 0.7, 0.88)) + Math.sin(t * 20) * y(0.008);
          const off = (r() - 0.5) * y(0.07); const px = cx - off * 0.4, py = cy + off;
          g.fillStyle = '#240a0c'; g.beginPath(); g.arc(px, py, w * 0.018, 0, 7); g.fill();
          g.strokeStyle = 'rgba(200,140,120,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.arc(px, py, w * 0.01, 0.3, 2.7); g.stroke();
        }
        g.fillStyle = '#240a0c'; g.beginPath(); g.ellipse(x(0.47), y(0.6), x(0.04), y(0.025), -0.4, 0, 7); g.fill();     // head
        g.fillStyle = '#f0e2d0'; g.beginPath(); g.arc(x(0.455), y(0.595), x(0.008), 0, 7); g.fill();
        g.strokeStyle = '#e8d8c4'; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x(0.44), y(0.59 + k * 0.006)); g.lineTo(x(0.36 - k * 0.02), y(0.58 + k * 0.012)); g.stroke(); }
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,10,10,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 4 + r() * 20, 2 + r() * 6); }
        const gr = g.createLinearGradient(0, y(0.85), 0, h); gr.addColorStop(0, 'rgba(50,10,10,0)'); gr.addColorStop(1, 'rgba(50,10,10,0.3)'); g.fillStyle = gr; g.fillRect(0, y(0.85), w, h);
      }, true);
      const bodyM = M(UM, { color: RED, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 }, 's2vm');
      const doorM = M(UM, { color: '#ffffff', map: frontTex, roughness: 0.3, clearcoat: 0.65, clearcoatRoughness: 0.18 }, 's2vm');
      const dark = M(UM, { color: '#1c1416', roughness: 0.5, metalness: 0.3 }, 's2vm');
      // cabinet, top cap, kick plate, top vent box
      add(rbox(VW, VH - KICK, VD - T + 0.02, 0.04, 3), bodyM, vm).position.set(VW / 2, KICK + (VH - KICK) / 2, -T - (VD - T) / 2 + 0.01);
      add(rbox(VW + 0.014, 0.04, VD + 0.014, 0.014, 2), M(UM, { color: '#a80f18', roughness: 0.4, clearcoat: 0.4 }, 's2vm'), vm).position.set(VW / 2, VH - 0.014, -VD / 2 + 0.007);
      add(rbox(VW - 0.03, KICK, VD - 0.06, 0.008, 1), dark, vm).position.set(VW / 2, KICK / 2, -VD / 2 - 0.02);
      add(rbox(0.09, 0.38, 0.1, 0.012, 2), M(UM, { color: '#2a2224', roughness: 0.55, metalness: 0.2 }, 's2vm'), vm).position.set(X(0.53), VH + 0.16, -0.26);
      // door slab around the display window (window = recess T deep); UVs follow the front so the graphics line up
      const [wx0, wy0, wx1, wy1] = [0.03, 0.044, 0.885, 0.567];
      const parts = [];
      for (const [f0, g0, f1, g1] of [[0, 0, 1, wy0], [0, wy1, 1, 1 - KICK / VH], [0, wy0, wx0, wy1], [wx1, wy0, 1, wy1]]) {
        const geo = rbox((f1 - f0) * VW, (g1 - g0) * VH, T + 0.01, 0.014, 2); geo.translate((X(f0) + X(f1)) / 2, (Y(g0) + Y(g1)) / 2, -(T + 0.01) / 2);
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / VW, p.getY(i) / VH);
        parts.push(geo);
      }
      add(mergeGeometries(parts), doorM, vm);
      // display interior: lit back wall, shelves, price strips with buttons, products
      const ww = X(wx1) - X(wx0), wh = Y(wy0) - Y(wy1), wcx = (X(wx0) + X(wx1)) / 2, wcy = (Y(wy0) + Y(wy1)) / 2;
      const backTex = canvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b4aca6'); gr.addColorStop(1, '#787270'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,250,240,0.25)'; g.fillRect(0, h * (0.1 + k * 0.2), w, 3); } }, true);
      add(new THREE.PlaneGeometry(ww, wh), M(UM, { color: '#ffffff', map: backTex, emissive: '#ffffff', emissiveMap: backTex, emissiveIntensity: 0.035, roughness: 0.6 }, 's2vmb'), vm, false, true)
        .position.set(wcx, wcy, -T + 0.022);
      const shelfM = M(UM, { color: '#8a8886', roughness: 0.45, metalness: 0.5 }, 's2vm');
      const prod = { bottle: [], label: [], cap: [], can: [], btn: [] };
      const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
      const putP = (list, x, y, z, sx, sy, sz, c) => list.push([new THREE.Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.set(sx, sy, sz)), col(c)]);
      const palA = ['#f2ece6', '#e6b4b0', '#d63a3a', '#e8c35a', '#3b8f5a', '#5a7ed0', '#c25a2a', '#f4f4f0', '#8a4a32'];
      const rows = [
        { y: 1.53, h: 0.17, n: 13, pal: ['#f0e4dc', '#e6b4b0', '#f4f4f0', '#d63a3a', '#e8c35a', '#cfe6f0'] },
        { y: 1.32, h: 0.18, n: 13, pal: palA },
        { y: 1.11, h: 0.18, n: 13, pal: ['#d63a3a', '#e8c35a', '#5a7ed0', '#f4f4f0', '#3b8f5a', '#c25a2a', '#2f2f3a'] },
        { y: 0.95, h: 0.11, n: 15, kind: 'can', pal: ['#d63a3a', '#e8c35a', '#3b8f5a', '#2f2f3a', '#f4f4f0', '#5a7ed0', '#c0c4cc'] },
        { y: 0.8, h: 0.11, n: 15, kind: 'can', pal: ['#e8c35a', '#d63a3a', '#f4f4f0', '#3b62b0', '#9a6a3a', '#c0c4cc'] },
      ];
      const stripM = M(UM, { color: '#b8b2ac', roughness: 0.35, clearcoat: 0.3 }, 's2vm');
      for (const row of rows) {
        const yb = row.y, n = row.n, sp = ww / n;
        add(new THREE.BoxGeometry(ww, 0.012, T - 0.03), shelfM, vm).position.set(wcx, yb - 0.006, -T / 2 - 0.005);
        add(new THREE.BoxGeometry(ww, 0.034, 0.012), stripM, vm).position.set(wcx, yb - 0.024, -0.032);
        const r = rng(row.y * 1000);
        for (let i = 0; i < n; i++) {
          const x = wcx - ww / 2 + (i + 0.5) * sp, z = -0.068;
          putP(prod.btn, x, yb - 0.028, -0.024, 1, 1, 1, r() < 0.15 ? '#e83a2a' : '#f4f2ee');
          const c = row.pal[Math.floor(r() * row.pal.length)];
          if (row.kind === 'can') putP(prod.can, x, yb, z, sp * 0.4, row.h * lerp(0.95, 1.05, r()), sp * 0.4, c);
          else {
            const hh = row.h * lerp(0.82, 1.0, r()), rr = Math.min(sp * 0.4, 0.034);
            putP(prod.bottle, x, yb, z, rr, hh, rr, r() < 0.35 ? '#dfe9ee' : c);
            putP(prod.label, x, yb, z, rr, hh, rr, row.pal[Math.floor(r() * row.pal.length)]);
            putP(prod.cap, x, yb, z, rr, hh, rr, r() < 0.6 ? '#f5f5f2' : row.pal[Math.floor(r() * row.pal.length)]);
          }
        }
      }
      {
        const lathe = new THREE.LatheGeometry([[0, 0], [0.86, 0], [0.97, 0.03], [1, 0.08], [1, 0.56], [0.95, 0.63], [0.72, 0.73], [0.46, 0.8], [0.38, 0.84], [0.38, 0.9], [0, 0.9]]
          .map(([x, y]) => new THREE.Vector2(x, y)), 12);
        const label = new THREE.CylinderGeometry(1.025, 1.025, 0.3, 12, 1, true).translate(0, 0.38, 0);
        const capG = new THREE.CylinderGeometry(0.42, 0.42, 0.11, 10).translate(0, 0.94, 0);
        const canG = new THREE.CylinderGeometry(0.92, 1, 1, 12).translate(0, 0.5, 0);
        const btnG = rbox(0.026, 0.014, 0.012, 0.003, 1);
        const mk = (geo, list, mat) => {
          if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach(([m4, c], i) => { im.setMatrixAt(i, m4); im.setColorAt(i, c); });
          im.castShadow = true; im.receiveShadow = true; vm.add(im); return im;
        };
        mk(lathe, prod.bottle, M(UPr, { color: '#ffffff', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#08090a', envMapIntensity: 0.5 }, 's2prod'));
        mk(label, prod.label, M(UPr, { color: '#ffffff', roughness: 0.4, emissive: '#101112' }, 's2prod'));
        mk(capG, prod.cap, M(UPr, { color: '#ffffff', roughness: 0.4, emissive: '#26282a' }, 's2prod'));
        mk(canG, prod.can, M(UPr, { color: '#ffffff', roughness: 0.25, metalness: 0.5, emissive: '#0c0d0e' }, 's2prod'));
        mk(btnG, prod.btn, M(UPr, { color: '#ffffff', roughness: 0.3, clearcoat: 0.6 }, 's2prod'));
      }
      // dusty glass: additive layer = sky reflections + bright leaf-shaped sun patches scattered by the dust
      const sheenTex = canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.4)';
        for (const [x0, wd] of [[10, 26], [52, 10], [80, 34]]) { g.beginPath(); g.moveTo(x0, -10); g.lineTo(x0 + wd, -10); g.lineTo(x0 + wd - 90, h + 10); g.lineTo(x0 - 90, h + 10); g.closePath(); g.fill(); }
      }, true);
      const glassM = M(UGl, { color: '#e2d2b6', roughness: 0.4, metalness: 0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        envMapIntensity: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#a8c4dc', emissiveMap: sheenTex, emissiveIntensity: 0.12 }, 's2glass');
      const gm = add(new THREE.PlaneGeometry(ww, wh), glassM, vm, false, true); gm.position.set(wcx, wcy, -0.014); gm.renderOrder = 3;
      // modules: protruding boxes in front-fraction coords
      const box = (f0, g0, f1, g1, dz, mat, z0 = 0, r = 0.006) => {
        const m = add(rbox((f1 - f0) * VW, (g1 - g0) * VH, dz, r, 2), mat, vm); m.position.set((X(f0) + X(f1)) / 2, (Y(g0) + Y(g1)) / 2, z0 + dz / 2 - 0.002); return m; };
      const white = M(UM, { color: '#ece8e4', roughness: 0.32, clearcoat: 0.5 }, 's2vm');
      const blackP = M(UM, { color: '#1e1c20', roughness: 0.35, clearcoat: 0.5 }, 's2vm');
      const silver = M(UM, { color: '#c4c6ca', roughness: 0.3, metalness: 0.8 }, 's2vm');
      const ledR = M(UM, { color: '#301818', emissive: '#ff6040', emissiveIntensity: 0.8, roughness: 0.2 }, 's2vm');
      box(0.9, 0.19, 0.975, 0.27, 0.02, white); box(0.915, 0.215, 0.96, 0.232, 0.026, blackP);                      // bill acceptor
      box(0.905, 0.3, 0.97, 0.4, 0.02, white); box(0.915, 0.315, 0.96, 0.345, 0.026, blackP); box(0.925, 0.36, 0.95, 0.385, 0.026, ledR);
      box(0.03, 0.567, 0.885, 0.584, 0.045, silver, 0, 0.004);                                                      // ledge under the glass
      box(0.62, 0.59, 0.84, 0.64, 0.022, silver);                                                                     // coin / price module
      box(0.64, 0.598, 0.7, 0.612, 0.028, blackP); box(0.72, 0.6, 0.745, 0.632, 0.028, blackP); box(0.64, 0.618, 0.7, 0.632, 0.028, ledR);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16).rotateX(Math.PI / 2), M(UM, { color: '#d8d2cc', roughness: 0.3, metalness: 0.6 }, 's2vm'), vm).position.set(X(0.8), Y(0.62), 0.03);
      // product outlet: bezel + dark flap
      const bz = M(UM, { color: '#8a1018', roughness: 0.38, clearcoat: 0.5 }, 's2vm');
      const flap = M(UM, { color: '#121014', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }, 's2vm');
      const [o0, p0, o1, p1] = [0.26, 0.775, 0.74, 0.875]; const tb = 0.02;
      box(o0, p0, o1, p0 + tb / VH, 0.03, bz); box(o0, p1 - tb / VH, o1, p1, 0.03, bz); box(o0, p0, o0 + tb / VW, p1, 0.03, bz); box(o1 - tb / VW, p0, o1, p1, 0.03, bz);
      add(new THREE.PlaneGeometry((o1 - o0) * VW - 2 * tb, (p1 - p0) * VH - 2 * tb), flap, vm).position.set(X((o0 + o1) / 2), Y((p0 + p1) / 2), 0.004);
      // side decals (GM logo, arrows, label strip, stickers) on the right side panel
      const sideTex = canvasTex(256, 512, (g, w, h) => {
        g.clearRect(0, 0, w, h); const x = (f) => f * w, y = (f) => f * h;
        g.fillStyle = '#f4ece6'; g.font = `bold ${Math.round(h * 0.075)}px sans-serif`; g.fillText('GM', x(0.4), y(0.63));
        g.fillStyle = '#e8c838'; g.beginPath(); g.arc(x(0.85), y(0.6), x(0.035), 0, 7); g.fill();
        const arrow = (cx, cy, s) => { g.fillStyle = '#f4ece6'; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.7, cy); g.lineTo(cx + s * 0.25, cy); g.lineTo(cx + s * 0.25, cy + s); g.lineTo(cx - s * 0.25, cy + s); g.lineTo(cx - s * 0.25, cy); g.lineTo(cx - s * 0.7, cy); g.closePath(); g.fill(); };
        arrow(x(0.66), y(0.22), x(0.06)); arrow(x(0.76), y(0.47), x(0.06)); arrow(x(0.38), y(0.7), x(0.06)); arrow(x(0.55), y(0.86), x(0.05));
        g.fillStyle = '#2a0c0e'; g.fillRect(x(0.82), y(0.3), x(0.12), y(0.22));
        g.fillStyle = '#d8a090'; for (let k = 0; k < 9; k++) g.fillRect(x(0.855), y(0.31 + k * 0.023), x(0.05), y(0.012));
        g.fillStyle = '#7468c8'; g.fillRect(x(0.28), y(0.28), x(0.12), y(0.07)); g.fillStyle = '#f0f0f8'; g.fillRect(x(0.3), y(0.295), x(0.08), y(0.01));
      }, true);
      const sd = add(new THREE.PlaneGeometry(VD - 0.06, VH - 0.1), M(UM, { color: '#ffffff', map: sideTex, transparent: true, alphaTest: 0.3, roughness: 0.3, clearcoat: 0.5 }, 's2dec'), vm, false, true);
      sd.rotation.y = Math.PI / 2; sd.position.set(VW + 0.0015, VH / 2, -VD / 2);
    }

    /* ---------------- barrier tape (PBR plastic ribbon, yellow segments glow) + bulbs ---------------- */
    const tapeTex = paintTexture('s2_tape', 512, 32, (g, w, h) => {
      g.fillStyle = '#16120f'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { g.fillStyle = '#ecc860'; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, 0); g.lineTo(x + 54, 0); g.lineTo(x + 40, h); g.fill(); }
    }, { repeat: true });
    const tapeGlow = paintTexture('s2_tapeG', 512, 32, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.filter = 'blur(2px)';
      for (let x = 0; x < w; x += 64) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + 4, h); g.lineTo(x + 17, 0); g.lineTo(x + 51, 0); g.lineTo(x + 37, h); g.fill(); }
    }, { repeat: true });
    const tapeM = (glow) => M(UF, { color: '#ffffff', map: tapeTex, emissive: '#ffd27a', emissiveMap: tapeGlow, emissiveIntensity: glow, side: THREE.DoubleSide, roughness: 0.32, clearcoat: 0.5, envMapIntensity: 0.7 }, 's2tape');
    const ribbon = (pts, width, glow) => {
      const curve = new THREE.CatmullRomCurve3(pts); const rep = curve.getLength() / 2.3;
      const n = 80, pos = [], uv = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = curve.getPoint(t), tg = curve.getTangent(t);
        const side = new THREE.Vector3(0, 1, 0).sub(tg.clone().multiplyScalar(tg.y)).normalize().multiplyScalar(width / 2);
        side.applyAxisAngle(tg, 0.15 * Math.sin(t * 7));
        pos.push(...p.clone().add(side).toArray(), ...p.clone().sub(side).toArray()); uv.push(t * rep, 1, t * rep, 0);
        if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      g.computeVertexNormals(); add(g, tapeM(glow), scene, false, true); return curve;
    };
    {
      const c1 = ribbon([at(-20, 700, 3.2), at(120, 680, 3.4), at(260, 668, 3.6), at(380, 645, 3.8), at(470, 612, 4.0), at(540, 565, 4.2), at(590, 530, 4.4)], 0.11, 0.8);
      const c2 = ribbon([at(980, 492, 4.0), at(1100, 482, 3.6), at(1220, 466, 3.2), at(1320, 455, 3.0)], 0.1, 1.5);
      const bulbM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c8').multiplyScalar(2.2) });
      const bulbs = []; for (let i = 0; i < 9; i++) bulbs.push(c1.getPoint((i + 0.4) / 9));
      for (const p of bulbs) add(new THREE.SphereGeometry(0.016, 10, 6), bulbM, scene, false, false).position.copy(p).add(new THREE.Vector3(0, -0.03, 0));
      const bg = new THREE.BufferGeometry().setFromPoints(bulbs);
      scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.3, map: softDotTexture(), color: col('#ffe2a0'), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
      const rb = [0.12, 0.42, 0.72].map(t => c2.getPoint(t));
      const rg = new THREE.BufferGeometry().setFromPoints(rb);
      scene.add(new THREE.Points(rg, new THREE.PointsMaterial({ size: 0.18, map: softDotTexture(), color: col('#ffd890'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      scene.add(new THREE.Points(rg, new THREE.PointsMaterial({ size: 0.06, map: softDotTexture(), color: col('#fffbe8'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }

    /* ---------------- traffic cone: lathe-turned PBR plastic with reflective band, square base ---------------- */
    {
      const UC = UNI({ leafAmt: 0.85, leafCover: 0.44, grime: 0.05 });
      const coneM = M(UC, { color: '#ec7a40', roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, emissive: '#7a2a10', emissiveIntensity: 0.15, envMapIntensity: 0.7 }, 's2cone');
      const bandM = M(UC, { color: '#f0eae2', roughness: 0.22, metalness: 0.25, clearcoat: 0.8, envMapIntensity: 1.2 }, 's2cone');
      const h = 0.85, cp = hitY(1196, 545, 0.25);
      const g = new THREE.Group(); g.position.set(cp.x, GROUND, cp.z); g.rotation.y = 0.4; scene.add(g);
      const body = new THREE.LatheGeometry([[0.2, 0], [0.19, 0.05], [0.13, 0.42], [0.075, 0.78], [0.045, 0.94], [0.036, 0.975], [0, 0.98]].map(([x, y]) => new THREE.Vector2(x * h, y * h)), 32);
      add(body, coneM, g).position.y = 0.045 * h;
      for (const [y0, y1] of [[0.47, 0.62], [0.2, 0.3]]) {
        const rAt = (y) => lerp(0.13, 0.075, (y - 0.42) / 0.36) + (y < 0.42 ? (0.42 - y) / 0.37 * 0.06 : 0);
        add(new THREE.LatheGeometry([[rAt(y0) + 0.004, y0], [rAt(y1) + 0.004, y1]].map(([x, y]) => new THREE.Vector2(x * h, y * h)), 32), bandM, g).position.y = 0.045 * h;
      }
      add(rbox(0.56 * h, 0.05 * h, 0.56 * h, 0.03 * h, 2), coneM, g).position.y = 0.025 * h;
    }

    /* ---------------- framing foliage ---------------- */
    const leafCols = { dark: '#16291f', mid: '#24603f', light: '#3f8d5a', highlight: '#86c07a', terminator: 0.1 };
    const fol = (pts, d, cardPx, opts) => {
      const k = pxScale(d);
      const clumps = pts.map(([px, py, rpx]) => { const p = atZ(px, py, d); return [p.x, p.y, p.z, rpx * k]; });
      const m = makeFoliage({ clumps, kind: 'broad', ...leafCols, wind: 0.05, lightWrap: 0.4, shell: 0.55, cardSize: cardPx * k, density: 2.2, ...opts });
      scene.add(m); return m;
    };
    // top-left mass + left edge column
    fol([[60, 40, 90], [170, 15, 60], [290, 0, 40], [20, 180, 80], [60, 270, 50], [0, 380, 50], [10, 480, 45], [110, 480, 28],
      [140, 560, 28], [20, 610, 45], [180, 650, 25], [70, 700, 40]], 2.2, 115, { seed: 41, texSeed: 2 });
    // top-centre hanging cluster
    fol([[470, 30, 55], [540, 60, 50], [600, 100, 40], [630, 40, 45], [430, 15, 40]], 3.2, 100, { seed: 43, texSeed: 4,
      dark: '#0f2018', mid: '#1b4a36', light: '#2f7050', highlight: '#5f9a6a' });

    /* ---------------- butterflies + motes ---------------- */
    {
      const a = at(60, 700, 3.0), b = at(460, 530, 3.6);
      scene.add(makeButterflies({ count: 14, box: [[Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)], [Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)]],
        size: 0.075, color: '#ffd84a', glow: 1.6, speed: 0.8, seed: 12 }));
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
