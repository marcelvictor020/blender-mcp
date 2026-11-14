import { makeCoupe, makeEnvMap, addVehicleLight, makeGroundShadow } from '../vehicles.js';
import { pbrUniforms, pbr, canvasTex, texSet } from '../pbr.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// Shot 5 — low angle in the shade, looking up at an old two-storey wooden shop-house: lattice balcony, chōchin lantern,
// triangular SLOW sign, white AE86-style hatchback parked lower right, concrete overpass + blue sky, back-lit tree,
// leaves with glowing butterflies lower left. Static camera; dappled leaf light shimmers across everything.
//
// Layout: the camera is static, so every element is placed from reference *pixel* coordinates.
// Camera at the origin looking down -Z with a shifted (off-axis) frustum: verticals stay vertical, horizon at y=575px.
// Facades are local frames (x = along the street, y = up, z = out toward the street) fitted to the reference's
// vanishing lines; everything on them is modelled geometry (clapboards, corrugated sheets, lattice slats, window
// frames, eaves, gutters, pipes) with PBR materials lit by a shadow-casting sun + leaf-shadow dapple (pbr.js).

const W0 = 1280, H0 = 720, F = 900, CX = 640, CY = 575, GROUND = -0.95;

export default {
  duration: 3.042,
  credit: { role: 'EDITING', cx: 0.248, ry: 0.56, ny: 0.62 },
  post: { bloom: 0.45, bloomRadius: 0.55, bloomThreshold: 0.72, exposure: 1.0, contrast: 1.06, saturation: 1.05,
    lift: [0.01, 0.008, 0.02], gamma: [1, 1, 1], gain: [1.0, 0.99, 0.98], vignette: 0.3, grain: 0.035, ca: 0.0015, soft: 0.2 },

  build(core) {
    const { THREE, shared, rng, col, makeSky, makeCloud, makeFoliage, makeButterflies, makeMotes, mergeGeometries } = core;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a10');

    /* ---------------- camera: off-axis frustum ---------------- */
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
    camera.position.set(0, 0, 0);
    camera.updateProjectionMatrix = function () {
      const n = this.near;
      this.projectionMatrix.makePerspective(n * (0 - CX) / F, n * (W0 - CX) / F, n * (CY - 0) / F, n * (CY - H0) / F, n, this.far);
      this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    };
    camera.updateProjectionMatrix();

    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const UP = V(0, 1, 0);
    const ray = (px, py) => V((px - CX) / F, (CY - py) / F, -1);
    const at = (px, py, d) => ray(px, py).multiplyScalar(d);
    const dirTo = (vpx) => V((vpx - CX) / F, 0, -1).normalize();

    function plane(origin, dir0) {
      const dir = dir0.clone();
      let n = new THREE.Vector3().crossVectors(dir, UP).normalize();
      if (n.dot(origin) > 0) { dir.negate(); n.negate(); }   // face the camera, keep the basis right-handed
      const P = {
        o: origin.clone(), d: dir.clone(), n,
        hit(px, py) { const r = ray(px, py); const t = origin.dot(n) / r.dot(n); return r.multiplyScalar(t); },
        uv(px, py) { const p = P.hit(px, py).sub(origin); return [p.dot(dir), p.y]; },
        pt(u, v, off = 0) { return origin.clone().addScaledVector(dir, u).addScaledVector(UP, v).addScaledVector(n, off); },
        quat() { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, UP, n)); },
        shift(off) { return plane(origin.clone().addScaledVector(n, off), dir); },
        frame() { const g = new THREE.Group(); g.quaternion.copy(P.quat()); g.position.copy(origin); scene.add(g); g.updateMatrixWorld(true); return g; },
      };
      return P;
    }

    /* ---------------- lights + PBR materials ---------------- */
    const L = V(-0.45, 0.75, 0.5).normalize();       // the car's sun (vehicle light below)
    const LB = V(0.45, 0.65, 0.6).normalize();       // sun on the set: from the street side, high, through the canopy
    const SUN_INT = 7.5, SUN_EPS = 1e-4;              // set sun: tiny on the car materials, scaled back up on set materials
    const ub = pbrUniforms({ sunDir: [LB.x, LB.y, LB.z], leafAmt: 1, leafCover: 0.5, leafScale: 4.6, leafSharp: 0.04, leafSeed: 7.3,
      rimColor: '#ff9a62', rimAmt: 0.0, rimPow: 5, grime: 0, sunGain: 1 });
    ub.uDirGain = { value: [0, SUN_INT / SUN_EPS, 0, 0] };   // per directional light (fixed up once the lights exist)
    // set material: pbr() + per-light gain so the set is lit only by its own shadow-casting sun (+ hemisphere fill)
    // far set (overpass) sits outside the canopy shade: lit by the car's sun L instead, bigger softer leaf shadows
    const uo = pbrUniforms({ sunDir: [L.x, L.y, L.z], leafAmt: 0.8, leafCover: 0.45, leafScale: 1.4, leafSharp: 0.08, leafSeed: 2.1, grime: 0, rimAmt: 0 });
    uo.uDirGain = { value: [0, 0, 0, 0] };
    function bm(o, u = ub) {
      const m = pbr(u, o, null, 's5set');
      const ob = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        ob(sh, r);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDirGain[4];')
          .replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= uDirGain[ i ];');
      };
      m.customProgramCacheKey = () => 's5set';
      return m;
    }
    const env = makeEnvMap('s5_env', {
      zenith: '#3f8fc2', horizon: '#9fb4c0', ground: '#231f1c', sunDir: [L.x, L.y, L.z], sunColor: '#ffe8cc', sunPower: 22,
      clouds: [{ dir: [0.8, 0.35, -0.6], size: 7, power: 1.5 }, { dir: [0.4, 0.5, -0.9], size: 6, power: 1.3 }],
      blocks: [
        { dir: [-1, -0.2], w: 26, h: 14, dist: 9, color: '#1d1714' }, { dir: [-0.3, -1], w: 22, h: 12, dist: 10, color: '#231c17' },
        { dir: [0.9, -0.7], w: 30, h: 5, dist: 14, y: 3, color: '#5d5853' }, { dir: [1, 0.4], w: 14, h: 3, dist: 9, color: '#3a3532' }, { dir: [0.2, 1], w: 30, h: 9, dist: 12, color: '#2b2622' },
      ],
    });

    /* ---------------- procedural texture sets ---------------- */
    const hex = (c, a = 1) => { const k = col(c); k.convertLinearToSRGB(); return `rgba(${k.r * 255 | 0},${k.g * 255 | 0},${k.b * 255 | 0},${a})`; };
    function woodDraw(base, dark, light, seed, vertical = false) {
      return (g, w, h) => {
        const r = rng(seed);
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        if (vertical) { g.translate(w, 0); g.rotate(Math.PI / 2); [w, h] = [h, w]; }
        for (let i = 0; i < 260; i++) {               // grain streaks along the board
          const y = r() * h, l = w * (0.2 + r() * 0.8), x = r() * w, t = 0.6 + r() * 2.2;
          g.strokeStyle = r() < 0.55 ? hex(dark, 0.18 + r() * 0.3) : hex(light, 0.08 + r() * 0.18); g.lineWidth = t;
          g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * 0.3, y + (r() - 0.5) * 6, x + l * 0.7, y + (r() - 0.5) * 6, x + l, y + (r() - 0.5) * 4); g.stroke();
        }
        for (let i = 0; i < 8; i++) {                 // knots
          const x = r() * w, y = r() * h, rr = 3 + r() * 6;
          g.fillStyle = hex(dark, 0.6); g.beginPath(); g.ellipse(x, y, rr * 2.2, rr, 0, 0, 7); g.fill();
        }
        for (let i = 0; i < 40; i++) { g.fillStyle = hex(r() < 0.5 ? dark : light, 0.08 + r() * 0.1); g.fillRect(r() * w, r() * h, 30 + r() * 120, 10 + r() * 30); }
      };
    }
    const T = {
      board: texSet(1024, 256, woodDraw('#6a5446', '#2a1a12', '#a08068', 11), { normalStrength: 2.4, roughBase: 0.82 }),
      slat: texSet(256, 1024, woodDraw('#5e3a2c', '#24120c', '#9a6a50', 23, true), { normalStrength: 2.0, roughBase: 0.8 }),
      beam: texSet(1024, 256, woodDraw('#8a4a30', '#3a1a10', '#c08060', 31), { normalStrength: 2.0, roughBase: 0.7 }),
      corr: texSet(512, 512, (g, w, h) => {
        const r = rng(41);
        g.fillStyle = '#857c80'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {               // rust / dirt streaks running down from laps & fixings
          const x = r() * w, y = r() * h * 0.8, l = 40 + r() * 260, wd = 2 + r() * 10;
          const gr = g.createLinearGradient(0, y, 0, y + l); const c = r() < 0.5 ? '120,64,40' : '70,62,66';
          gr.addColorStop(0, `rgba(${c},${0.25 + r() * 0.4})`); gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr; g.fillRect(x, y, wd, l);
        }
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,50,50' : '210,200,200'},${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 3); }
        for (let y = 0; y < h; y += 128) for (let x = 6; x < w; x += 39) { g.fillStyle = 'rgba(40,30,30,0.7)'; g.beginPath(); g.arc(x, y + 6, 2.2, 0, 7); g.fill(); }
      }, { normalStrength: 1.2, roughBase: 0.55, roughVar: 0.4 }),
      conc: texSet(512, 512, (g, w, h) => {
        const r = rng(51);
        g.fillStyle = '#b7ad98'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,112,96' : '220,212,196'},${0.04 + r() * 0.08})`; g.beginPath(); g.arc(r() * w, r() * h, 6 + r() * 40, 0, 7); g.fill(); }
        for (let i = 0; i < 40; i++) { const x = r() * w, l = 60 + r() * 300; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(70,66,58,0.35)'); gr.addColorStop(1, 'rgba(70,66,58,0)'); g.fillStyle = gr; g.fillRect(x, 0, 3 + r() * 16, l); }
        for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,56,50' : '235,230,220'},${0.15 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
      }, { normalStrength: 1.5, roughBase: 0.9, roughVar: 0.2 }),
      asph: texSet(512, 512, (g, w, h) => {
        const r = rng(61);
        g.fillStyle = '#2c2b2e'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6000; i++) { const v = 30 + r() * 110 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},${0.4 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(20,20,22,${0.1 + r() * 0.15})`; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 60, 0, 7); g.fill(); }
      }, { normalStrength: 2.5, roughBase: 0.9, roughVar: 0.15 }),
    };
    for (const k of ['slat']) for (const t of Object.values(T[k])) t.wrapS = t.wrapT = THREE.RepeatWrapping;

    const M = {
      board: bm({ ...T.board, vertexColors: true, roughness: 1 }),
      boardDark: bm({ ...T.board, color: '#4a3e3e', vertexColors: true, roughness: 1 }),
      slat: bm({ ...T.slat, vertexColors: true, roughness: 1 }),
      beam: bm({ ...T.beam, vertexColors: true, roughness: 1 }),
      trim: bm({ ...T.board, color: '#d6cfc8', vertexColors: true, roughness: 0.9 }),
      frame: bm({ color: '#d4d0ca', roughness: 0.45, metalness: 0.2, envMap: env, envMapIntensity: 0.25, vertexColors: true }),
      corr: bm({ ...T.corr, roughness: 1, metalness: 0.35, envMap: env, envMapIntensity: 0.2, side: THREE.DoubleSide }),
      sheetDark: bm({ ...T.corr, color: '#55525a', roughness: 1, metalness: 0.3, vertexColors: true }),
      metal: bm({ color: '#c9ccd2', roughness: 0.38, metalness: 0.65, envMap: env, envMapIntensity: 0.45, vertexColors: true }),
      darkMetal: bm({ color: '#3a3c44', roughness: 0.5, metalness: 0.5, envMap: env, envMapIntensity: 0.3, vertexColors: true }),
      glass: bm({ color: '#0a0d16', roughness: 0.04, metalness: 0, envMap: env, envMapIntensity: 0.55, vertexColors: true }),
      interior: new THREE.MeshStandardMaterial({ color: col('#0c0b10'), roughness: 1, vertexColors: true }),
      conc: bm({ ...T.conc, roughness: 1, vertexColors: true }),
      asph: bm({ ...T.asph, roughness: 1 }),
    };
    for (const t of [T.asph.map, T.asph.normalMap, T.asph.roughnessMap]) t.repeat.set(10, 10);

    /* ---------------- geometry helpers (merged boxes with real UVs + per-piece tint) ---------------- */
    const E = new THREE.Euler(), MX = new THREE.Matrix4();
    function bx(w, h, d, x, y, z, o = {}) {
      const g = o.round ? new RoundedBoxGeometry(w, h, d, 1, o.round) : new THREE.BoxGeometry(w, h, d);
      const s = o.uvs ?? 1, uv = g.attributes.uv, uo = o.uo ?? 0, vo = o.vo ?? 0;
      if (!o.round) {
        const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
        for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * s + uo, uv.getY(i) * dims[f][1] * s + vo); }
      }
      if (o.rx || o.ry || o.rz) g.applyMatrix4(MX.makeRotationFromEuler(E.set(o.rx || 0, o.ry || 0, o.rz || 0)));
      g.translate(x, y, z);
      const c = o.c ?? 1, cc = Array.isArray(c) ? c : [c, c, c];
      const ca = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < ca.length; i += 3) { ca[i] = cc[0]; ca[i + 1] = cc[1]; ca[i + 2] = cc[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      return g;
    }
    function tube(a, b, r, o = {}) {        // cylinder between two local points
      const len = a.distanceTo(b);
      const g = new THREE.CylinderGeometry(r, r, len, o.seg || 10, 1, false);
      g.applyMatrix4(MX.makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize())));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const ca = new Float32Array(g.attributes.position.count * 3).fill(o.c ?? 1);
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      return g;
    }
    function add(parent, geos, mat, cast = true, recv = true) {
      const mixed = geos.some((x) => !x.index);
      const g = geos.length === 1 ? geos[0] : mergeGeometries(mixed ? geos.map((x) => (x.index ? x.toNonIndexed() : x)) : geos, false);
      const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
    }
    // horizontal clapboard wall (shitamiita): overlapping tilted boards, split around openings
    function clapboards(list, { u0, u1, v0, v1, z = 0, h = 0.21, lap = 0.035, tilt = 0.1, holes = [], seed = 1, maxLen = 3.0, tint = 0.25 }) {
      const r = rng(seed);
      for (let v = v0; v < v1 - 0.02; v += h - lap) {
        let segs = [[u0, u1]];
        for (const [a0, b0, a1, b1] of holes) if (v + h > b0 && v < b1) segs = segs.flatMap(([a, b]) => [[a, Math.min(b, a0)], [Math.max(a, a1), b]]).filter(([a, b]) => b - a > 0.03);
        for (const [a, b] of segs) {
          let x = a;
          while (x < b - 0.02) {
            const len = Math.min(b - x, maxLen * (0.55 + 0.45 * r()));
            const k = 1 - tint * r();
            list.push(bx(len - 0.006, h, 0.016, x + len / 2, v + h / 2, z + 0.012 + 0.012 * r(), { rx: -tilt * (0.8 + 0.4 * r()), uvs: 0.5, uo: r(), vo: r(), c: [k, k * (0.97 + 0.05 * r()), k * (0.95 + 0.06 * r())] }));
            x += len;
          }
        }
      }
      return list;
    }
    // corrugated sheet: sine-displaced plane (ribs vertical)
    function corrSheet(parent, u0, u1, v0, v1, z, { pitch = 0.076, amp = 0.011, mat = M.corr, tilt = 0 } = {}) {
      const w = u1 - u0, h = v1 - v0, n = Math.max(1, Math.round(w / pitch));
      const g = new THREE.PlaneGeometry(w, h, n * 8, 2);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2;
        p.setZ(i, amp * Math.sin(x / pitch * Math.PI * 2) + tilt * (y / h - 0.5));
        uv.setXY(i, (u0 + x) / 2.2, (v0 + y) / 2.2);
      }
      g.computeVertexNormals(); g.translate(u0 + w / 2, v0 + h / 2, z);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    }

    const G0 = GROUND + 0.07;                         // street level (the car's ground)

    /* ---------------- main street facade frame (x = along street, y = up, z = toward street) ---------------- */
    const PA = plane(at(570, 575, 8), dirTo(1320));
    const FA = PA.frame();
    const R = rng(77);
    {
      const wood = [], woodDark = [], beam = [], slat = [], trim = [], frame = [], glass = [], metal = [], dmetal = [], sheet = [], conc = [];
      /* --- left shop-house (lantern wall): clapboards, overhanging upper storey, roof eave --- */
      clapboards(wood, { u0: -5.8, u1: -3.0, v0: G0, v1: 1.98, z: 0, seed: 3 });
      clapboards(wood, { u0: -5.8, u1: -3.0, v0: 1.96, v1: 2.75, z: 0.42, seed: 4 });
      beam.push(bx(2.8, 0.1, 0.46, -4.4, 1.95, 0.21, { uvs: 0.5, c: 0.55 }));                 // upper-floor joist header (soffit)
      beam.push(bx(2.8, 0.06, 0.9, -4.4, 2.72, 0.45, { uvs: 0.5, c: 0.35 }));                 // roof eave soffit
      for (let u = -5.7; u < -3.0; u += 0.42) beam.push(bx(0.05, 0.08, 0.9, u, 2.66, 0.45, { uvs: 0.5, c: 0.5 }));   // rafters
      beam.push(bx(2.8, 0.16, 0.035, -4.4, 2.7, 0.92, { uvs: 0.5, c: 0.8 }));                 // eave fascia
      trim.push(bx(0.13, 2.9, 0.13, -3.02, 0.55, 0.07, { uvs: 0.5, c: 0.55 }));                // corner post
      woodDark.push(bx(0.04, 0.8, 0.44, -2.99, 2.35, 0.22, { uvs: 0.5, c: 0.6 }));             // upper-storey end board
      woodDark.push(bx(3.2, 4.5, 0.1, -4.4, 5.0, -0.6, { uvs: 0.5, c: 0.35 }));                // setback upper wall / roof mass
      woodDark.push(bx(3.2, 0.06, 1.4, -4.4, 2.78, 0.1, { uvs: 0.5, c: 0.3 }));
      /* --- corrugated metal section with the recessed stair --- */
      const panels = (a, b, v0, v1, seed) => { const r = rng(seed); for (let u = a, i = 0; u < b - 0.01; u += 0.8, i++) corrSheet(FA, u - 0.02, Math.min(b, u + 0.82), v0, v1, 0.02 + 0.009 * (i % 2), { tilt: (r() - 0.5) * 0.02 }); };
      panels(-2.98, -0.36, G0, 1.42, 5);
      panels(-1.6, -0.36, 1.36, 3.42, 6);
      panels(-2.98, -0.36, 3.36, 6.2, 7);
      // recess: back wall, side walls, ceiling, stair + handrails
      woodDark.push(bx(1.36, 2.0, 0.05, -2.25, 2.39, -1.2, { uvs: 0.5, c: 0.5 }));
      woodDark.push(bx(0.05, 2.0, 1.2, -2.93, 2.39, -0.6, { uvs: 0.5, c: 0.4 }), bx(0.05, 2.0, 1.2, -1.57, 2.39, -0.6, { uvs: 0.5, c: 0.6 }));
      woodDark.push(bx(1.36, 0.06, 1.2, -2.25, 3.4, -0.6, { uvs: 0.5, c: 0.3 }), bx(1.36, 0.08, 1.2, -2.25, 1.38, -0.6, { uvs: 0.5, c: 0.5 }));
      for (let k = 0; k < 7; k++) dmetal.push(bx(0.24, 0.035, 0.85, -2.82 + k * 0.19, 1.5 + k * 0.27, -0.62));
      dmetal.push(bx(0.06, 0.06, 2.4, -2.25, 2.3, -0.2, { rz: 0, ry: 0, rx: 0 }));
      for (const [dz, dv] of [[0.08, 0], [0.08, 0.32]]) dmetal.push(tube(V(-2.95, 1.42 + dv, dz), V(-1.55, 2.06 + dv, dz), 0.02, { c: 0.7 }));
      for (let k = 0; k < 4; k++) { const u = -2.85 + k * 0.4, v = 1.46 + (u + 2.95) * 0.457; dmetal.push(tube(V(u, v - 0.02, 0.08), V(u, v + 0.35, 0.08), 0.013, { c: 0.6 })); }
      metal.push(tube(V(-0.7, G0, 0.12), V(-0.7, 6.6, 0.12), 0.045, { c: 1 }));             // white downpipe
      for (const v of [0.6, 2.2, 3.9, 5.5]) dmetal.push(bx(0.03, 0.03, 0.12, -0.7, v, 0.06));
      /* --- main house: ground floor --- */
      trim.push(bx(0.28, 7.6, 0.16, -0.22, 2.9, -0.02, { uvs: 0.5, c: 0.95 }));               // corner post / trim
      const WIN = [0.0, -0.05, 4.4, 2.25], LAT = [4.6, 0.42, 9.4, 2.0];
      clapboards(wood, { u0: -0.08, u1: 10.4, v0: G0, v1: 3.0, z: 0, holes: [WIN, LAT], seed: 8, maxLen: 3.2 });
      // window: outer frame, mullion, transoms, sashes, glass
      {
        const [a, b, c, d] = WIN, f = 0.075, zf = 0.05;
        frame.push(bx(f, d - b, 0.1, a + f / 2, (b + d) / 2, zf), bx(f, d - b, 0.1, c - f / 2, (b + d) / 2, zf));
        frame.push(bx(c - a + 0.1, f, 0.12, (a + c) / 2, d - f / 2, zf + 0.01), bx(c - a + 0.16, 0.06, 0.18, (a + c) / 2, b, zf + 0.04));
        frame.push(bx(0.06, d - b, 0.09, 2.05, (b + d) / 2, zf - 0.005));
        for (const v of [1.86, 2.03]) frame.push(bx(c - a, 0.035, 0.07, (a + c) / 2, v, zf - 0.01));
        for (const [u0, u1] of [[a + f, 2.02], [2.08, c - f]]) {
          const m = (u0 + u1) / 2, s = 0.04;
          frame.push(bx(u1 - u0, s, 0.05, m, b + 0.06, 0.01, { c: 0.9 }), bx(u1 - u0, s, 0.05, m, 1.82, 0.01, { c: 0.9 }));
          frame.push(bx(s, 1.78, 0.05, u0 + s / 2, 0.93, 0.01, { c: 0.9 }), bx(s, 1.78, 0.05, u1 - s / 2, 0.93, 0.01, { c: 0.9 }));
          glass.push(bx(u1 - u0 - 0.06, 1.74, 0.01, m, 0.93, -0.005, { c: 0.9 + 0.2 * R() }));
          for (const [v0, v1] of [[1.88, 2.01], [2.05, d - f]]) glass.push(bx(u1 - u0, v1 - v0, 0.01, m, (v0 + v1) / 2, 0.0, { c: 1.1 }));
        }
      }
      // koshi lattice window
      {
        const [a, b, c, d] = LAT;
        beam.push(bx(c - a + 0.14, 0.09, 0.12, (a + c) / 2, d + 0.03, 0.05, { uvs: 0.5, c: 0.9 }), bx(c - a + 0.14, 0.09, 0.14, (a + c) / 2, b - 0.03, 0.06, { uvs: 0.5, c: 0.8 }));
        beam.push(bx(0.08, d - b, 0.1, a, (b + d) / 2, 0.05, { uvs: 0.5 }), bx(0.08, d - b, 0.1, c, (b + d) / 2, 0.05, { uvs: 0.5 }));
        beam.push(bx(c - a, 0.05, 0.06, (a + c) / 2, (b + d) / 2 + 0.2, 0.06, { uvs: 0.5, c: 0.9 }));
        for (let u = a + 0.08; u < c - 0.04; u += 0.105) slat.push(bx(0.034, d - b, 0.045, u, (b + d) / 2, 0.075, { uvs: 0.5, uo: R(), c: 0.85 + 0.25 * R() }));
        woodDark.push(bx(c - a, d - b, 0.02, (a + c) / 2, (b + d) / 2, -0.06, { uvs: 0.5, c: 0.8 }));
        for (let u = a + 0.45; u < c; u += 0.9) woodDark.push(bx(0.04, d - b, 0.03, u, (b + d) / 2, -0.04, { uvs: 0.5, c: 1.2 }));
      }
      // concrete gutter / kerb along the wall base
      conc.push(bx(17, 0.07, 0.42, 2.4, G0 + 0.03, 0.22, { uvs: 0.45, round: 0 }));
      /* --- ground-floor eave (hisashi) with fascia, rafters and a gutter --- */
      {
        const a = -0.75, b = 11.2, m = (a + b) / 2, w = b - a;
        sheet.push(bx(w, 0.03, 0.68, m, 2.64, 0.31, { rx: 0.43, c: 0.7 }));
        for (let u = a + 0.2; u < b; u += 0.9) beam.push(bx(0.05, 0.07, 0.66, u, 2.6, 0.3, { rx: 0.43, uvs: 0.5, c: 0.45 }));
        beam.push(bx(w, 0.1, 0.03, m, 2.47, 0.62, { uvs: 0.5, c: 0.6 }));
        metal.push(tube(V(a, 2.43, 0.68), V(b, 2.43, 0.68), 0.055, { seg: 14, c: 0.92 }));
        for (let u = a + 0.3; u < b; u += 1.2) dmetal.push(bx(0.025, 0.02, 0.14, u, 2.39, 0.64));
        metal.push(tube(V(a + 0.05, 2.43, 0.68), V(a + 0.05, 2.25, 0.4), 0.04, { c: 0.9 }), tube(V(a + 0.05, 2.25, 0.4), V(a + 0.05, G0, 0.4), 0.04, { c: 0.9 }));
      }
      /* --- balcony (2nd floor): floor slab, lit fascia beam, vertical lattice slats, posts, rails, roof eave --- */
      {
        const a = -0.95, b = 7.15, m = (a + b) / 2, w = b - a, ZB = 0.92;
        woodDark.push(bx(w, 0.14, 0.95, m, 3.0, 0.475, { uvs: 0.5, c: 0.55 }));
        for (let u = a + 0.15; u < b; u += 0.6) woodDark.push(bx(0.07, 0.1, 0.9, u, 2.88, 0.45, { uvs: 0.5, c: 0.45 }));    // joists
        beam.push(bx(w, 0.31, 0.11, m, 3.22, ZB + 0.02, { uvs: 0.5 }));
        beam.push(bx(w, 0.1, 0.06, m, 2.98, ZB + 0.03, { uvs: 0.5, c: 0.5 }));
        clapboards(woodDark, { u0: a, u1: b + 3, v0: 3.05, v1: 6.7, z: 0, seed: 9, maxLen: 2.2 });
        const sr = rng(19);
        for (let u = a + 0.03; u < b - 0.02; u += 0.072) {
          if (sr() < 0.03) continue;
          const k = 0.75 + 0.45 * sr(), lean = (sr() - 0.5) * 0.012;
          slat.push(bx(0.034, 3.12, 0.022, u, 4.95, ZB + (sr() - 0.5) * 0.01, { rz: lean, uo: sr(), c: [k, k * 0.95, k * 0.9] }));
        }
        for (let z = 0.06; z < ZB; z += 0.072) slat.push(bx(0.022, 3.12, 0.034, a, 4.95, z, { uo: sr(), c: 0.8 }));
        for (const v of [3.42, 4.62, 6.45]) beam.push(bx(w, 0.06, 0.05, m, v, ZB - 0.035, { uvs: 0.5, c: 0.75 }));
        for (let u = a + 0.04; u < b; u += 2.0) beam.push(bx(0.1, 3.3, 0.1, u, 4.98, ZB, { uvs: 0.5, c: 0.7 }));
        // main roof eave over the balcony
        const ra = -1.2, rb = 5.2, rm = (ra + rb) / 2, rw = rb - ra;
        woodDark.push(bx(rw, 0.05, 1.95, rm, 6.74, 0.97, { uvs: 0.5, c: 0.3 }));
        for (let u = ra + 0.1; u < rb; u += 0.45) woodDark.push(bx(0.06, 0.1, 1.95, u, 6.67, 0.97, { uvs: 0.5, c: 0.45 }));
        beam.push(bx(rw, 0.2, 0.04, rm, 6.72, 1.96, { uvs: 0.5, c: 0.85 }));
        sheet.push(bx(rw, 0.04, 2.3, rm, 6.95, 0.9, { rx: -0.45, c: 0.5 }));
      }
      add(FA, wood, M.board); add(FA, woodDark, M.boardDark); add(FA, beam, M.beam); add(FA, slat, M.slat);
      add(FA, trim, M.trim); add(FA, frame, M.frame); add(FA, glass, M.glass, false, true); add(FA, metal, M.metal);
      add(FA, dmetal, M.darkMetal); add(FA, sheet, M.sheetDark); add(FA, conc, M.conc, false, true);
    }

    /* ---------------- asphalt street (receives the real shadows) ---------------- */
    {
      const g = new THREE.PlaneGeometry(60, 60); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, M.asph); m.position.set(6, G0 - 0.004, -18); m.receiveShadow = true; scene.add(m);
    }

    /* ---------------- paper lantern (ribbed chōchin, translucent glow, kanji) ---------------- */
    {
      const lanTex = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = '#f1ebe2'; g.fillRect(0, 0, w, h);
        const r = rng(5);
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '150,130,110' : '255,250,240'},${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 6 + r() * 40, 2 + r() * 8); }
        g.fillStyle = '#7a1612'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.save(); g.translate(w * 0.5, h * 0.5); g.scale(0.5, 1);       // u wraps the full circumference: squeeze horizontally
        g.font = 'bold 150px serif'; g.fillText('串', 0, -h * 0.17); g.fillText('焼', 0, h * 0.15);
        g.font = 'bold 34px serif'; ['や', 'き', 'と', 'り'].forEach((c, i) => g.fillText(c, w * 0.22, -h * 0.24 + i * 38));
        g.restore();
      });
      const N = 26, H = 0.62, RAD = 0.21, prof = [];
      for (let i = 0; i <= 130; i++) {
        const t = i / 130, y = (t - 0.5) * H;
        const s = Math.sin(Math.PI * (0.1 + 0.8 * t));
        const rib = 1 - 0.035 * Math.pow(Math.abs(Math.sin(t * N * Math.PI)), 0.35);
        prof.push(new THREE.Vector2(RAD * Math.pow(s, 0.6) * rib, y));
      }
      const lg = new THREE.LatheGeometry(prof, 56);
      const paper = bm({ map: lanTex, roughness: 0.9, emissive: '#ffb27a', emissiveMap: lanTex, emissiveIntensity: 0.4, side: THREE.DoubleSide });
      const cap = bm({ color: '#4a1210', roughness: 0.35, clearcoat: 0.6, envMap: env, envMapIntensity: 0.4 });
      const lan = new THREE.Group();
      const body = new THREE.Mesh(lg, paper); body.castShadow = true; body.receiveShadow = true; lan.add(body);
      const ry = Math.sqrt(1 - 0.8 * 0.8);
      for (const sgn of [1, -1]) {
        const cr = RAD * Math.pow(Math.sin(Math.PI * 0.1), 0.6) + 0.012;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(cr, cr, 0.045, 32), cap); c.position.y = sgn * (H / 2 + 0.015); c.castShadow = true; lan.add(c);
      }
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6), cap); wire.position.y = H / 2 + 0.27; lan.add(wire);
      lan.position.copy(at(152, 226, 4.5));
      const toCam = lan.position.clone().negate().setY(0).normalize();
      lan.rotation.y = Math.atan2(-toCam.x, -toCam.z) + 0.35;
      lan.rotation.z = 0.04;
      scene.add(lan);
      // wall bracket arm the lantern hangs from
      const top = lan.position.clone().add(V(0, H / 2 + 0.52, 0));
      const wallPt = PA.shift(0.42).pt(PA.shift(0.42).uv(110, 100)[0], top.y);
      const arm = new THREE.Mesh(tube(wallPt, top, 0.012), M.darkMetal); arm.castShadow = true; scene.add(arm);
    }

    /* ---------------- SLOW sign: plate with thickness on a bracket + pole ---------------- */
    {
      const dS = 6.0, s = 0.8, h = s * Math.sqrt(3) / 2;
      const shape = new THREE.Shape(); shape.moveTo(-s / 2, h / 3); shape.lineTo(s / 2, h / 3); shape.lineTo(0, -2 * h / 3); shape.closePath();
      const signTex = canvasTex(512, 512, (g, w, hh) => {
        const P = (x, y) => [(x / s + 0.5) * w, (1 - (y + 2 * h / 3) / h) * hh];
        const tri = (m) => { g.beginPath(); const p = [P(-s / 2 + m * 1.73, h / 3 - m), P(s / 2 - m * 1.73, h / 3 - m), P(0, -2 * h / 3 + 2 * m)]; g.moveTo(...p[0]); g.lineTo(...p[1]); g.lineTo(...p[2]); g.closePath(); };
        g.fillStyle = '#e8e6e2'; g.fillRect(0, 0, w, hh);
        tri(0.0); g.fillStyle = '#c3221c'; g.fill();
        tri(0.075); g.fillStyle = '#f2efe9'; g.fill();
        g.fillStyle = '#b5231d'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = 'bold 74px serif'; g.fillText('徐行', w / 2, hh * 0.24);
        g.font = 'bold 44px sans-serif'; g.fillText('SLOW', w / 2, hh * 0.41);
      });
      const sign = new THREE.Group();
      const body = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2, curveSegments: 1 });
      body.translate(0, 0, -0.012);
      const bodyM = new THREE.Mesh(body, bm({ color: '#9da0a4', roughness: 0.45, metalness: 0.6, envMap: env, envMapIntensity: 0.4 })); bodyM.castShadow = bodyM.receiveShadow = true; sign.add(bodyM);
      const face = new THREE.ShapeGeometry(shape); const fp = face.attributes.position, fu = face.attributes.uv;
      for (let i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i) / s + 0.5, (fp.getY(i) + 2 * h / 3) / h);
      face.translate(0, 0, 0.0045);
      const faceM = new THREE.Mesh(face, bm({ map: signTex, roughness: 0.32, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3, envMap: env, envMapIntensity: 0.5 }));
      faceM.receiveShadow = true; sign.add(faceM);
      // bracket: a back plate + two pipe clamps
      const pole = at(505, 600, dS); pole.z -= 0.08;
      const bk = bm({ color: '#8c8f94', roughness: 0.5, metalness: 0.7, envMap: env, envMapIntensity: 0.4 });
      sign.position.copy(at(517, 332, dS)); sign.rotation.y = 0.2; scene.add(sign);
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.02), bk); bp.position.set(0, -0.05, -0.03); bp.castShadow = true; sign.add(bp);
      sign.updateMatrixWorld(true);
      const poleTop = at(505, 268, dS).y;
      const pg = new THREE.CylinderGeometry(0.031, 0.031, poleTop - G0, 16); pg.translate(0, (poleTop + G0) / 2, 0);
      const pm = new THREE.Mesh(pg, bm({ color: '#dcdad4', roughness: 0.42, metalness: 0.35, envMap: env, envMapIntensity: 0.5 }));
      pm.position.set(pole.x, 0, pole.z); pm.castShadow = pm.receiveShadow = true; scene.add(pm);
      const capG = new THREE.SphereGeometry(0.034, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); const pc = new THREE.Mesh(capG, bk); pc.position.set(pole.x, poleTop, pole.z); scene.add(pc);
      for (const y of [sign.position.y + 0.1, sign.position.y - 0.2]) {
        const cl = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 6, 16), bk); cl.rotation.x = Math.PI / 2; cl.position.set(pole.x, y, pole.z); cl.castShadow = true; scene.add(cl);
        const ar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.1), bk); ar.position.copy(sign.position).setY(y); ar.position.lerp(V(pole.x, y, pole.z), 0.5); scene.add(ar);
      }
    }

    /* ---------------- overpass: chamfered concrete deck, girders, pier, railing tubes ---------------- */
    {
      const PO = plane(at(1100, 470, 24), dirTo(250));
      const FO = PO.frame();
      const uvP = (px, py) => PO.uv(px, py);
      const [uA, vTop] = uvP(930, 382), [uB, vTopR] = uvP(1300, 328);
      const vBot = uvP(930, 482)[1];
      const u0 = Math.min(uA, uB) - 6, u1 = Math.max(uA, uB) + 6, um = (u0 + u1) / 2, w = u1 - u0;
      const vt = (vTop + vTopR) / 2, vb = vBot;
      const gl = G0 - PO.o.y;                           // street level in this frame
      const cm = bm({ ...T.conc, roughness: 1, vertexColors: true }, uo);
      const cd = bm({ ...T.conc, color: '#57534c', roughness: 1, vertexColors: true }, uo);
      const conc = [], dark = [], rail = [], wd = [];
      conc.push(bx(w, vt - vb, 0.35, um, (vt + vb) / 2, -0.175, { round: 0.04 }));                    // parapet
      conc.push(bx(w, 0.12, 0.5, um, vt + 0.04, -0.2, { round: 0.04, c: 1.05 }));                     // coping
      conc.push(bx(w, 0.16, 0.14, um, vb - 0.03, 0.05, { round: 0.03, c: 1.1 }));                     // drip edge
      dark.push(bx(w, 0.5, 15, um, vb - 0.3, -7.5, { c: 0.6 }));                                        // deck slab
      for (let z = -1.0; z > -14; z -= 2.1) dark.push(bx(w, 1.0, 0.45, um, vb - 1.0, z, { c: 0.7 }));  // girders
      dark.push(bx(w, vb - gl + 0.4, 0.6, um, (vb + gl) / 2, -14.5, { c: 0.32 }));                      // far abutment wall
      // pier at the near (right) end
      const PP = PO.shift(-1.2); const [uP] = PP.uv(1236, 600);
      conc.push(bx(1.5, vb - gl, 1.5, uP, (vb + gl) / 2 - 0.3, -1.2, { round: 0.05, c: 0.95 }));
      dark.push(bx(3.0, 0.9, 13, uP, vb - 1.2, -7.0, { c: 0.75 }));
      // railing on the parapet: posts + two rails (tubes)
      const zr = -0.18, rh = (vt - vb) * 0.85;
      for (let u = u0 + 0.5; u < u1; u += 2.2) rail.push(tube(V(u, vt + 0.1, zr), V(u, vt + rh, zr), 0.035));
      for (const f of [1, 0.5]) rail.push(tube(V(u0, vt + rh * f, zr), V(u1, vt + rh * f, zr), f > 0.9 ? 0.035 : 0.025, { seg: 10 }));
      add(FO, conc, cm); add(FO, dark, cd, false, true);
      add(FO, rail, bm({ color: '#e4e6e6', roughness: 0.35, metalness: 0.5, envMap: env, envMapIntensity: 0.5, vertexColors: true }, uo));
      // sunlit wooden fence on the far side, under the deck
      const PW = PO.shift(-14.1); const [uW0, vW0] = PW.uv(1062, 628), [uW1, vW1] = PW.uv(1208, 574);
      for (let u = Math.min(uW0, uW1); u < Math.max(uW0, uW1); u += 0.16) wd.push(bx(0.14, Math.abs(vW1 - vW0), 0.03, u, (vW0 + vW1) / 2, -14.1, { uvs: 0.5, uo: R(), c: 1.2 + 0.4 * R() }));
      if (wd.length) add(FO, wd, bm({ ...T.slat, vertexColors: true, roughness: 1 }, uo));
    }

    /* ---------------- the set's sun: shadow-casting, fitted to the facade ---------------- */
    const sunB = new THREE.DirectionalLight(col('#ffdcb8'), SUN_EPS);
    {
      const target = FA.localToWorld(V(2.0, 2.5, 0));
      sunB.position.copy(target).addScaledVector(LB, 40); sunB.target.position.copy(target);
      sunB.castShadow = true; sunB.shadow.mapSize.set(4096, 4096);
      sunB.shadow.bias = -0.0006; sunB.shadow.normalBias = 0.02;
      scene.add(sunB, sunB.target);
      const dc = new THREE.OrthographicCamera(); dc.position.copy(sunB.position); dc.lookAt(target); dc.updateMatrixWorld(true);
      const lo = V(1e9, 1e9, 1e9), hi = V(-1e9, -1e9, -1e9);
      for (const u of [-6, 11.2]) for (const v of [G0, 7.2]) for (const z of [-1.3, 2.1]) {
        const p = FA.localToWorld(V(u, v, z)).applyMatrix4(dc.matrixWorldInverse); lo.min(p); hi.max(p);
      }
      const c = sunB.shadow.camera; c.left = lo.x - 0.5; c.right = hi.x + 0.5; c.bottom = lo.y - 0.5; c.top = hi.y + 0.5;
      c.near = Math.max(0.5, -hi.z - 6); c.far = -lo.z + 6; c.updateProjectionMatrix();
    }

    /* ---------------- sky + clouds ---------------- */
    scene.add(makeSky({ zenith: '#0c5e80', mid: '#1a809c', horizon: '#2a90a8', haze: 0.2, horizonY: 0.0 }));
    const cloudA = makeCloud({ w: 260, h: 130, seed: 11, light: '#d6d2c8', mid: '#c2beb4', shadow: '#9a9ca4', lightDir: [-0.3, 0.9],
      puffs: [[-0.32, -0.05, 0.22], [-0.18, 0.08, 0.26], [-0.02, 0.18, 0.3], [0.14, 0.12, 0.26], [0.3, 0.02, 0.2], [0.42, -0.08, 0.14], [-0.42, -0.1, 0.13], [0.05, -0.05, 0.25], [0.22, -0.08, 0.2], [-0.15, -0.1, 0.2]] });
    cloudA.position.copy(at(1080, 300, 500)); cloudA.lookAt(0, 0, 0); scene.add(cloudA);

    /* ---------------- car: modelled hatchback coupe, PBR paint, real + contact shadows, leaf dapple ---------------- */
    const car = new THREE.Group();
    let carVeh;
    {
      const fwd = dirTo(1640), side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const env = makeEnvMap('s5_env', {
        zenith: '#3f8fc2', horizon: '#9fb4c0', ground: '#231f1c', sunDir: [L.x, L.y, L.z], sunColor: '#ffe8cc', sunPower: 22,
        clouds: [{ dir: [0.8, 0.35, -0.6], size: 7, power: 1.5 }, { dir: [0.4, 0.5, -0.9], size: 6, power: 1.3 }],
        blocks: [
          { dir: [-1, -0.2], w: 26, h: 14, dist: 9, color: '#1d1714' }, { dir: [-0.3, -1], w: 22, h: 12, dist: 10, color: '#231c17' },
          { dir: [0.9, -0.7], w: 30, h: 5, dist: 14, y: 3, color: '#5d5853' }, { dir: [1, 0.4], w: 14, h: 3, dist: 9, color: '#3a3532' }, { dir: [0.2, 1], w: 30, h: 9, dist: 12, color: '#2b2622' },
        ],
      });
      carVeh = makeCoupe({ envMap: env, envIntensity: 0.95, sunDir: [L.x, L.y, L.z], leafAmt: 1, leafCover: 0.5, leafScale: 4.6, leafSharp: 0.04, leafSeed: 7.3,
        rimColor: '#ff8a52', rimAmt: 0.12, rimPow: 6, grime: 0.12, plate: '13954' });
      car.add(carVeh.group);
      car.add(makeGroundShadow(carVeh, { contact: 0.9, cast: 0.5 }));
      car.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, UP, fwd.clone().negate()));
      const rear = at(706, 741, 4.35); rear.y = GROUND + 0.07;
      car.position.copy(rear);
      car.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      scene.add(car);
      // lighting for the physically shaded car only (the painted set ignores lights)
      const carCentre = car.localToWorld(new THREE.Vector3(0, 0.6, -2.0));
      addVehicleLight(scene, { sunDir: [L.x, L.y, L.z], color: '#ffe3c2', intensity: 2.3, target: carCentre, radius: 3.6 });
      scene.add(new THREE.HemisphereLight(new THREE.Color('#7f97b8'), new THREE.Color('#3a2a22'), 0.55));
    }

    /* ---------------- foliage ---------------- */
    const pxClump = (px, py, d, rpx) => { const p = at(px, py, d); return [p.x, p.y, p.z, rpx / F * d]; };
    const treeClumps = [];
    {
      const r = rng(55);
      const pts = [[900, 20, 60], [980, 40, 60], [1060, 10, 70], [1160, 40, 90], [1250, 20, 70], [935, 140, 45],
        [1220, 160, 70], [1265, 260, 60], [1195, 290, 40], [1255, 370, 45], [915, 90, 40], [1110, 80, 50]];
      for (const [x, y, rr] of pts) treeClumps.push(pxClump(x + (r() - 0.5) * 20, y, 7, rr));
    }
    const tree = makeFoliage({ clumps: treeClumps, density: 1.8, cardSize: 0.55, kind: 'round', seed: 8, texSeed: 3,
      dark: '#163a30', mid: '#2c5c3a', light: '#4a8648', highlight: '#84b466', wind: 0.04, shell: 0.85, lightWrap: 0.7, sizeJitter: 0.5 });
    scene.add(tree);

    const bushClumps = [];
    {
      const pts = [[40, 420, 60], [120, 470, 70], [60, 560, 90], [180, 560, 70], [230, 650, 70], [100, 680, 90], [20, 640, 60], [200, 470, 40], [10, 360, 40]];
      for (const [x, y, rr] of pts) bushClumps.push(pxClump(x, y, 3.0, rr));
    }
    const bush = makeFoliage({ clumps: bushClumps, density: 0.55, cardSize: 0.56, kind: 'broad', seed: 12, texSeed: 2,
      dark: '#173622', mid: '#2e623c', light: '#5a9c58', highlight: '#acd47e', wind: 0.03, shell: 0.6, lightWrap: 0.5, sizeJitter: 0.5 });
    scene.add(bush);

    /* ---------------- butterflies + motes ---------------- */
    const b0 = at(30, 700, 2.8), b1 = at(470, 480, 3.4);
    const bflies = makeButterflies({ count: 28, box: [[b0.x, b0.y, -3.2], [b1.x, b1.y, -2.6]], size: 0.055, color: '#f0b040', seed: 7, speed: 0.9, glow: 1.05 });
    scene.add(bflies);
    const m0 = at(300, 100, 4), m1 = at(1100, 700, 6);
    scene.add(makeMotes({ count: 40, box: [[m0.x, m1.y, -6], [m1.x, m0.y, -3.5]], size: 0.012, color: '#fff2d8', opacity: 0.6, seed: 13, speed: 0.1 }));

    /* light order (three.js puts shadow-casting directional lights first, stable) -> per-light gains on set materials */
    {
      const dl = []; scene.traverse((o) => { if (o.isDirectionalLight) dl.push(o); });
      dl.sort((a, b) => (b.castShadow ? 1 : 0) - (a.castShadow ? 1 : 0));
      ub.uDirGain.value = [0, 1, 2, 3].map((i) => (dl[i] === sunB ? SUN_INT / SUN_EPS : 0));
      uo.uDirGain.value = [0, 1, 2, 3].map((i) => (dl[i] && dl[i] !== sunB ? 1.9 : 0));
    }

    const sunDir = L.clone().negate().setY(0.3).normalize(); // foliage lit from behind (back-light)
    return {
      scene, camera,
      update(t) {
        shared.uSunDir.value.copy(V(-0.45, -0.1, 0.9).normalize());
        shared.uDapple.value = 0;
      },
    };
  },
};
