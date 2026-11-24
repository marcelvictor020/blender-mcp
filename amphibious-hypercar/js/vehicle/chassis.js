// Chassis spine, subframes, battery, hydraulic power unit and the three
// powertrains (V12 / hybrid V8 / quad e-motor). Built from primitives with
// enough detail to reward the cutaway and exploded views.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function rbox(w, h, d, r, mat, seg = 3) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(r0, r1, h, mat, seg = 20, axis = 'y') {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
function tube(points, r, mat, seg = 32) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, 8, false), mat);
  m.castShadow = true;
  return m;
}
function strutBetween(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const m = cyl(r, r, d.length(), mat, 10);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function frame(nodes, edges, r, mat) {
  const g = new THREE.Group();
  for (const [i, j] of edges) g.add(strutBetween(nodes[i], nodes[j], r, mat));
  for (const n of nodes) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(r * 1.6, 10, 8), mat);
    k.position.set(...n);
    g.add(k);
  }
  return g;
}

// ---------------------------------------------------------------- engines
function cylinderBank(n, M, len, mat) {
  const g = new THREE.Group();
  const head = rbox(len, 0.12, 0.2, 0.03, M.engineBlock);
  head.position.y = 0.06;
  g.add(head);
  const cover = rbox(len * 0.96, 0.07, 0.17, 0.03, mat);
  cover.position.y = 0.155;
  g.add(cover);
  // ribbing + bolts
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    const coil = cyl(0.018, 0.018, 0.06, M.blackGloss, 12);
    coil.position.set(x, 0.2, 0);
    g.add(coil);
    for (const s of [-1, 1]) {
      const bolt = cyl(0.008, 0.008, 0.012, M.titanium, 6);
      bolt.position.set(x, 0.19, s * 0.07);
      g.add(bolt);
    }
  }
  const rib = rbox(len * 0.9, 0.012, 0.02, 0.005, M.titanium);
  rib.position.y = 0.195;
  g.add(rib);
  return g;
}

function buildV12(M) {
  const g = new THREE.Group();
  g.name = 'V12 engine';
  const len = 0.66;
  const crank = rbox(len + 0.08, 0.26, 0.4, 0.05, M.engineBlock);
  crank.position.y = 0;
  g.add(crank);
  const sump = rbox(len, 0.1, 0.3, 0.03, M.darkTitanium);
  sump.position.y = -0.17;
  g.add(sump);
  for (const s of [-1, 1]) {
    const bank = cylinderBank(6, M, len, M.engineRed);
    bank.position.set(0, 0.12, s * 0.13);
    bank.rotation.x = s * 0.56;
    g.add(bank);
    // exhaust headers sweeping down the outside of each bank
    for (let i = 0; i < 6; i++) {
      const x = -len / 2 + (i + 0.5) * (len / 6);
      g.add(tube([[x, 0.12, s * 0.27], [x, 0.04, s * 0.36], [x * 0.6 - 0.05, -0.12, s * 0.34], [-len / 2 - 0.1, -0.2, s * 0.26]], 0.017, M.titanium, 20));
    }
  }
  // carbon plenum + 12 titanium trumpets in the vee
  const plenum = rbox(len * 0.95, 0.09, 0.2, 0.04, M.carbon);
  plenum.position.y = 0.31;
  g.add(plenum);
  for (let i = 0; i < 12; i++) {
    const x = -len / 2 + ((i % 6) + 0.5) * (len / 6);
    const s = i < 6 ? -1 : 1;
    const tr = cyl(0.022, 0.03, 0.08, M.titanium, 14);
    tr.position.set(x, 0.36, s * 0.05);
    g.add(tr);
  }
  // front accessory drive
  for (const [y, z, r] of [[0.05, 0, 0.09], [0.18, 0.12, 0.05], [0.18, -0.12, 0.05], [-0.05, 0.16, 0.06]]) {
    const p = cyl(r, r, 0.03, M.darkTitanium, 24, 'x');
    p.position.set(len / 2 + 0.06, y, z);
    g.add(p);
  }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 40), M.rubber);
  belt.rotation.y = Math.PI / 2;
  belt.scale.set(1, 0.95, 0.75);
  belt.position.set(len / 2 + 0.06, 0.08, 0);
  g.add(belt);
  g.rotation.y = Math.PI / 2; // crank along z
  return g;
}

function buildV8(M) {
  const g = new THREE.Group();
  g.name = 'Hybrid V8';
  const len = 0.5;
  const crank = rbox(len + 0.08, 0.24, 0.38, 0.05, M.engineBlock);
  g.add(crank);
  for (const s of [-1, 1]) {
    const bank = cylinderBank(4, M, len, M.carbon);
    bank.position.set(0, 0.12, s * 0.12);
    bank.rotation.x = s * 0.78;
    g.add(bank);
  }
  // hot-vee twin turbos
  for (const s of [-1, 1]) {
    const snail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.04, 12, 28), M.titanium);
    snail.position.set(-0.12 + s * 0.14, 0.33, 0);
    snail.rotation.x = Math.PI / 2;
    g.add(snail);
    const comp = cyl(0.05, 0.06, 0.08, M.gold, 20, 'z');
    comp.position.set(-0.12 + s * 0.14, 0.33, 0.07);
    g.add(comp);
    g.add(tube([[-0.12 + s * 0.14, 0.33, 0.12], [-0.05 + s * 0.1, 0.42, 0.2], [0.18, 0.36, 0.05]], 0.028, M.carbon, 16));
  }
  // e-motor between engine and gearbox (orange HV)
  const em = cyl(0.17, 0.17, 0.16, M.darkTitanium, 32, 'x');
  em.position.x = -len / 2 - 0.12;
  g.add(em);
  const ring = cyl(0.172, 0.172, 0.04, M.copper, 32, 'x');
  ring.position.x = -len / 2 - 0.12;
  g.add(ring);
  g.add(tube([[-len / 2 - 0.12, 0.17, 0.05], [-len / 2 - 0.05, 0.3, 0.2], [0.1, 0.22, 0.3]], 0.016, M.orange, 16));
  g.rotation.y = Math.PI / 2;
  return g;
}

function buildEMotors(M) {
  const g = new THREE.Group();
  g.name = 'Quad e-motor drive';
  for (const s of [-1, 1]) {
    const m = cyl(0.15, 0.15, 0.24, M.darkTitanium, 36, 'x');
    m.position.x = s * 0.24;
    g.add(m);
    for (let i = 0; i < 10; i++) {
      const fin = cyl(0.158, 0.158, 0.006, M.titanium, 36, 'x');
      fin.position.x = s * (0.14 + i * 0.022);
      g.add(fin);
    }
    const inv = rbox(0.22, 0.07, 0.28, 0.02, M.battery);
    inv.position.set(s * 0.24, 0.2, 0.05);
    g.add(inv);
    for (let k = 0; k < 3; k++) {
      const plug = cyl(0.014, 0.014, 0.05, M.orange, 10);
      plug.position.set(s * 0.24 + (k - 1) * 0.06, 0.25, 0.14);
      g.add(plug);
    }
    g.add(tube([[s * 0.24, 0.24, 0.17], [s * 0.2, 0.3, 0.45], [s * 0.12, 0.2, 0.9]], 0.017, M.orange, 16));
  }
  const gear = rbox(0.24, 0.3, 0.3, 0.05, M.engineBlock);
  g.add(gear);
  const logo = cyl(0.06, 0.06, 0.01, M.gold, 24, 'z');
  logo.position.set(0, 0, 0.155);
  g.add(logo);
  return g;
}

export function buildChassis(design, shape, M) {
  const root = new THREE.Group();
  root.name = 'chassis';
  const W = design.wheels;
  const parts = {};

  // central spine (carbon torque tube + titanium rails)
  const spineLen = W.zf - W.zr + 0.3;
  const spine = rbox(0.2, 0.12, spineLen, 0.03, M.carbon);
  spine.position.set(0, 0.45, (W.zf + W.zr) / 2);
  root.add(spine);
  for (const s of [-1, 1]) {
    const rail = cyl(0.016, 0.016, spineLen, M.titanium, 10, 'z');
    rail.position.set(s * 0.11, 0.52, (W.zf + W.zr) / 2);
    root.add(rail);
  }
  // hydraulic manifolds at each axle
  for (const z of [W.zf, W.zr]) {
    const man = rbox(0.18, 0.12, 0.22, 0.02, M.titanium);
    man.position.set(0, 0.66, z);
    root.add(man);
    for (let i = 0; i < 4; i++) {
      const v = cyl(0.014, 0.014, 0.05, M.gold, 8);
      v.position.set(-0.06 + i * 0.04, 0.74, z);
      root.add(v);
    }
  }
  // tubular titanium subframes
  for (const [z0, dir] of [[W.zf, 1], [W.zr, -1]]) {
    const y0 = 0.3, y1 = 0.78;
    const zA = z0 - dir * 0.35, zB = z0 + dir * 0.35;
    const nodes = [
      [-0.36, y0, zA], [0.36, y0, zA], [-0.36, y1, zA], [0.36, y1, zA],
      [-0.3, y0, zB], [0.3, y0, zB], [-0.26, y1 - 0.06, zB], [0.26, y1 - 0.06, zB],
    ];
    const edges = [[0, 1], [2, 3], [0, 2], [1, 3], [4, 5], [6, 7], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7], [0, 3], [4, 7], [2, 7]];
    root.add(frame(nodes, edges, 0.014, M.titanium));
  }

  // battery pack under the cabin floor
  const bat = new THREE.Group();
  bat.name = 'Battery';
  const zc = shape.zOf((design.doors.u0 + design.doors.u1) / 2);
  const pack = rbox(1.0, 0.09, 1.5, 0.02, M.battery);
  bat.add(pack);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    const mod = rbox(0.21, 0.02, 0.22, 0.01, M.darkTitanium);
    mod.position.set(-0.36 + j * 0.24, 0.055, -0.62 + i * 0.25);
    bat.add(mod);
  }
  bat.position.set(0, 0.165, zc);
  root.add(bat);
  parts.battery = bat;

  // hydraulic power unit in the nose: pump, reservoir, accumulators
  const hpu = new THREE.Group();
  hpu.name = 'Hydraulic power unit';
  const pump = cyl(0.07, 0.07, 0.22, M.darkTitanium, 24, 'x');
  hpu.add(pump);
  const motorH = cyl(0.075, 0.075, 0.12, M.copper, 24, 'x');
  motorH.position.x = 0.17;
  hpu.add(motorH);
  const res = rbox(0.26, 0.14, 0.12, 0.04, M.titanium);
  res.position.set(-0.05, 0.12, -0.08);
  hpu.add(res);
  for (const s of [-1, 1]) {
    const acc = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), M.gold);
    acc.position.set(s * 0.28, 0.04, 0.02);
    hpu.add(acc);
  }
  hpu.position.set(0, 0.38, shape.zOf(0.9));
  root.add(hpu);
  // radiators behind the grille
  for (const s of [-1, 1]) {
    const rad = rbox(0.5, 0.26, 0.05, 0.01, M.grille);
    rad.position.set(s * 0.42, 0.36, shape.zOf(0.955));
    rad.rotation.y = s * 0.35;
    rad.rotation.x = -0.25;
    root.add(rad);
  }
  // fuel cell / range extender tank (hybrid designs) and the powertrain
  let engine;
  if (design.engine === 'v12') {
    engine = buildV12(M);
    engine.position.set(0, 0.48, 0.92);
    // transaxle at the rear, torque tube
    const gb = rbox(0.34, 0.3, 0.44, 0.05, M.engineBlock);
    gb.position.set(0, 0.42, W.zr - 0.05);
    root.add(gb);
  } else if (design.engine === 'v8') {
    engine = buildV8(M);
    engine.position.set(0, 0.46, -1.0);
    const gb = rbox(0.34, 0.28, 0.4, 0.05, M.engineBlock);
    gb.position.set(0, 0.42, W.zr - 0.25);
    root.add(gb);
  } else {
    engine = buildEMotors(M);
    engine.position.set(0, 0.38, W.zr);
    const front = buildEMotors(M);
    front.scale.setScalar(0.75);
    front.position.set(0, 0.38, W.zf - 0.05);
    root.add(front);
    // marine jet impeller housing / storage under the teak deck
    const tub = rbox(0.9, 0.22, 0.55, 0.06, M.carbon);
    tub.position.set(0, 0.62, -0.85);
    root.add(tub);
  }
  root.add(engine);
  parts.engine = engine;
  // half-shafts to the rear corners (decouple visually when arms extend)
  const shafts = [];
  for (const s of [-1, 1]) {
    const sh = cyl(0.03, 0.03, 0.4, M.titanium, 12, 'x');
    sh.position.set(s * 0.32, 0.4, W.zr);
    root.add(sh);
    shafts.push(sh);
  }
  // front/rear bulkheads (carbon), firewall behind the seats
  const zFw = shape.zOf(design.doors.u0) - 0.05;
  const fw = rbox(1.3, 0.55, 0.04, 0.02, M.carbon);
  fw.position.set(0, 0.55, zFw);
  root.add(fw);
  const zDash = shape.zOf(design.doors.u1) + 0.18;
  const bh = rbox(1.25, 0.4, 0.04, 0.02, M.carbon);
  bh.position.set(0, 0.45, zDash);
  root.add(bh);

  const update = (rig) => {
    const a = rig.s.arm;
    for (const sh of shafts) sh.scale.x = 1 - a * 0.85;
    const e = rig.s.explode;
    engine.position.y = (design.engine === 'v12' ? 0.48 : design.engine === 'v8' ? 0.46 : 0.38) + e * 0.55;
    bat.position.y = 0.165 - e * 0.32;
    hpu.position.y = 0.38 + e * 0.35;
  };
  return { root, parts, update };
}
