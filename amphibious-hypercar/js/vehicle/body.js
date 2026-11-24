// Builds the sculpted body of a design: shell, opening panels, canopy,
// lights, intakes and wheel-arch liners. All panels are real separate
// meshes on pivots so they can open, deploy and explode.
import * as THREE from 'three';
import { BodyShape, FullShape, breakpoints, GeoBuilder, buildShell, buildPanel, buildJamb, buildConformal, surfacePath, buildCap } from './loft.js';
import { curve1D } from '../util/noise.js';

export class CanopyShape {
  constructor(body, c, vBelt) {
    this.body = body;
    this.c = c;
    this.vBelt = vBelt;
    this.rise = curve1D(c.rise);
    this._b = new THREE.Vector3();
  }
  zOf(u) { return this.body.zOf(u); }
  point(u, w, out) {
    const b = this.body.point(u, this.vBelt, this._b);
    const r = Math.max(0, this.rise(u));
    const th = w * Math.PI / 2;
    const n = this.c.n;
    const s = Math.pow(Math.sin(th), 2 / n), co = Math.pow(Math.max(0, Math.cos(th)), 2 / n);
    const x = b.x * co * (1 - this.c.tumble * s * Math.min(1, r / 0.12));
    const y = b.y + r * s;
    out.set(x, y, b.z);
    return out;
  }
  normal(u, w, out) {
    const e = 1e-4;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    this.point(Math.max(0, u - e), w, a); this.point(Math.min(1, u + e), w, b);
    this.point(u, Math.max(0, w - e), c); this.point(u, Math.min(1, w + e), d);
    out.crossVectors(d.sub(c), b.sub(a));
    if (out.lengthSq() < 1e-14) out.set(0, 1, 0);
    out.normalize();
    if (w >= 1 - 1e-6) { out.x = 0; out.normalize(); }
    return out;
  }
}

function meshFrom(builder, mats, opts = {}) {
  const geo = builder.build();
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  return m;
}

function translateGeo(mesh, v) {
  mesh.geometry.translate(-v.x, -v.y, -v.z);
  mesh.geometry.computeBoundingSphere();
}

export function buildBody(design, M) {
  const B = design.body;
  const shape = new BodyShape(B);
  const full = new FullShape(shape);
  const W = design.wheels;
  const root = new THREE.Group();
  root.name = 'body';
  const out = { shape, root, doors: [], sponsons: [], liners: [], details: new THREE.Group(), trims: [] };
  root.add(out.details);

  const cab = { u0: Math.min(design.canopy.u0, design.doors.u0), u1: design.doors.u1, v: design.cabin.vBelt };
  const D = design.doors, H = design.hood, K = design.deck, S = design.sponson;
  const carbonV = D.v0 - 0.005;

  const uCuts = [cab.u0, cab.u1, D.u0, D.u1, H.u0, H.u1, K.u0, K.u1, S.u0, S.u1];
  const vCuts = [cab.v, D.v0, H.v0, K.v0, S.v0, S.v1, carbonV, 0.1];
  const us = breakpoints(150, uCuts), vs = breakpoints(54, vCuts);

  const inR = (u, v, r) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1;
  const holes = [
    { u0: cab.u0, u1: cab.u1, v0: cab.v, v1: 1.01 },
    { u0: D.u0, u1: D.u1, v0: D.v0, v1: cab.v },
    { u0: H.u0, u1: H.u1, v0: H.v0, v1: 1.01 },
    { u0: K.u0, u1: K.u1, v0: K.v0, v1: 1.01 },
    { u0: S.u0, u1: S.u1, v0: S.v0, v1: S.v1 },
  ];
  const include = (u, v) => !holes.some((r) => inR(u, v, r));
  const matOf = (u, v) => (v < 0.1 || (v < 0.3 && u > 0.035 && u < 0.965) ? 1 : 0);

  // ---- shell (both halves) + jambs
  const shellB = new GeoBuilder();
  for (const side of [1, -1]) {
    buildShell(shape, us, vs, side, include, matOf, shellB);
    buildJamb(shape, { u0: D.u0, u1: D.u1, v0: D.v0, v1: cab.v }, side, 0.09, 2, shellB, { nu: 18, nv: 10 });
    buildJamb(shape, { u0: S.u0, u1: S.u1, v0: S.v0, v1: S.v1 }, side, S.thickness + 0.03, 2, shellB, { nu: 20, nv: 6, back: true, backMat: 1 });
    buildJamb(shape, { u0: H.u0, u1: H.u1, v0: H.v0, v1: 1 }, side, 0.06, 2, shellB, { nu: 16, nv: 6 });
    buildJamb(shape, { u0: K.u0, u1: K.u1, v0: K.v0, v1: 1 }, side, 0.06, 2, shellB, { nu: 16, nv: 6 });
    buildJamb(shape, { u0: cab.u0, u1: cab.u1, v0: cab.v, v1: 1 }, side, 0.07, 2, shellB, { nu: 14, nv: 6 });
    buildCap(shape, 0, side, 1, shellB);
    buildCap(shape, 1, side, 3, shellB);
  }
  const shell = meshFrom(shellB, [M.paintCut, M.carbonCut, M.innerCut, M.grille]);
  shell.customDepthMaterial = M.bodyDepth;
  shell.name = 'shell';
  shell.userData.skin = true;
  root.add(shell);
  out.shell = shell;

  // ---- arch liners
  for (const [z, track] of [[W.zf, W.trackF], [W.zr, W.trackR]]) {
    const Ra = W.r + 0.08;
    for (const side of [1, -1]) {
      const hwA = shape.hw(shape.uOf(z)) + 0.03;
      const g = new GeoBuilder();
      const nA = 28, nX = 4, x0 = 0.5;
      const ph0 = Math.asin(Math.max(-1, (0.12 - (W.r + 0.01)) / Ra));
      const ids = [];
      for (let i = 0; i <= nA; i++) {
        ids.push([]);
        const ph = ph0 + (Math.PI - 2 * ph0) * (i / nA);
        for (let j = 0; j <= nX; j++) {
          const x = (x0 + (hwA - x0) * (j / nX)) * side;
          const p = new THREE.Vector3(x, W.r + 0.01 + Math.sin(ph) * Ra, z + Math.cos(ph) * Ra);
          const n = new THREE.Vector3(0, -Math.sin(ph), -Math.cos(ph));
          ids[i].push(g.vertex(p, n, i / nA, j / nX));
        }
      }
      for (let i = 0; i < nA; i++) for (let j = 0; j < nX; j++) g.quad(0, ids[i][j], ids[i][j + 1], ids[i + 1][j], ids[i + 1][j + 1], side > 0);
      // inner wall
      const c = g.vertex(new THREE.Vector3(x0 * side, W.r, z), new THREE.Vector3(side, 0, 0), 0, 0);
      for (let i = 0; i < nA; i++) g.tri(0, c, ids[i][0], ids[i + 1][0]), g.tri(0, c, ids[i + 1][0], ids[i][0]);
      const liner = meshFrom(g, [M.blackSatin]);
      liner.material = M.blackSatin;
      root.add(liner);
      out.liners.push(liner);
    }
  }

  // ---- arch shields: slide out from the liner wall once the wheel has left,
  // closing the arch for a clean hull while leaving a slot for the arm
  out.shields = [];
  for (const [z] of [[W.zf], [W.zr]]) {
    const Ra = W.r + 0.075;
    const cy = W.r + 0.01;
    const chordY = 0.26 - cy; // keep the lower part open for the arm
    const a0 = Math.asin(Math.max(-1, Math.min(1, chordY / Ra)));
    const sh = new THREE.Shape();
    sh.moveTo(Math.cos(a0) * Ra, chordY);
    sh.absarc(0, 0, Ra, a0, Math.PI - a0, false);
    sh.lineTo(Math.cos(a0) * Ra, chordY);
    const g = new THREE.ShapeGeometry(sh, 40);
    for (const side of [1, -1]) {
      const geo = g.clone();
      geo.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      const m = new THREE.Mesh(geo, M.paint);
      m.castShadow = true;
      const hwA = shape.hw(shape.uOf(z));
      const trimG = new THREE.BoxGeometry(0.02, 0.014, 2 * Math.cos(a0) * Ra);
      const trim = new THREE.Mesh(trimG, M.titanium);
      trim.position.set(0, chordY, 0);
      m.add(trim);
      m.position.set(side * 0.52, cy, z);
      root.add(m);
      out.shields.push({ mesh: m, side, xIn: 0.52, xOut: hwA - 0.03 });
    }
  }

  // ---- doors
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    const hinge = new THREE.Vector3();
    shape.point(D.u1 - 0.004, cab.v, hinge); hinge.x *= side;
    pivot.position.copy(hinge);
    const b = buildPanel(shape, { u0: D.u0, u1: D.u1, v0: D.v0, v1: cab.v }, side, { nu: 22, nv: 14, thickness: 0.07, mats: { outer: 0, inner: 1, edge: 2 } });
    const door = meshFrom(b, [M.paint, M.leatherPlain, M.inner]);
    translateGeo(door, hinge);
    door.userData.skin = true;
    pivot.add(door);
    root.add(pivot);
    // door handle (flush titanium blade) + mirror pod
    const hp = new THREE.Vector3(), hn = new THREE.Vector3();
    const uh = D.u0 + (D.u1 - D.u0) * 0.26, vh = D.v0 + (cab.v - D.v0) * 0.72;
    shape.point(uh, vh, hp); shape.normal(uh, vh, hn); hp.x *= side; hn.x *= side;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.2), M.titanium);
    handle.position.copy(hp).addScaledVector(hn, 0.004).sub(hinge);
    handle.lookAt(handle.position.clone().add(hn));
    handle.rotateY(Math.PI / 2);
    pivot.add(handle);
    const mp = new THREE.Vector3(), mn = new THREE.Vector3();
    shape.point(D.u1 - 0.03, cab.v - 0.02, mp); shape.normal(D.u1 - 0.03, cab.v - 0.02, mn); mp.x *= side; mn.x *= side;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 10), M.paint);
    stalk.position.copy(mp).addScaledVector(mn, 0.06).sub(hinge);
    stalk.rotation.z = side * Math.PI / 2.4;
    const podG = new THREE.SphereGeometry(0.05, 20, 12);
    podG.scale(0.55, 0.42, 1.25);
    const pod = new THREE.Mesh(podG, M.paint);
    pod.position.copy(mp).addScaledVector(mn, 0.13).sub(hinge);
    pod.position.y += 0.04;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 16), M.blackGloss);
    lens.position.set(0, 0, -0.062);
    lens.rotation.y = Math.PI;
    pod.add(lens);
    pivot.add(stalk, pod);
    out.doors.push({ side, pivot, door, hinge, glass: null });
  }

  // ---- hood
  {
    const pivot = new THREE.Group();
    const hinge = new THREE.Vector3();
    shape.point(H.hinge === 'front' ? H.u1 : H.u0, 1, hinge);
    pivot.position.copy(hinge);
    const b = buildPanel(full, { u0: H.u0, u1: H.u1, v0: H.v0, v1: 2 - H.v0 }, 1, { nu: 22, nv: 20, thickness: 0.04, mats: { outer: 0, inner: 1, edge: 2 } });
    const hood = meshFrom(b, [design.id === 'nereid' ? M.carbon : M.paint, M.carbon, M.inner]);
    translateGeo(hood, hinge);
    hood.userData.skin = true;
    pivot.add(hood);
    // vents on the hood
    if (design.id !== 'halcyon') {
      for (const side of [1, -1]) {
        const vb = buildConformal(shape, { u0: H.u0 + 0.06, u1: H.u0 + 0.16, v0: 0.86, v1: 0.93 }, side, 0.003, 0, null, { nu: 10, nv: 4, uvScale: 1.5 });
        const vent = meshFrom(vb, [M.grille], { cast: false });
        translateGeo(vent, hinge);
        pivot.add(vent);
      }
    }
    root.add(pivot);
    out.hood = { pivot, hinge, mesh: hood, front: H.hinge === 'front', angle: H.angle };
  }

  // ---- rear deck / engine cover
  {
    const pivot = new THREE.Group();
    const hinge = new THREE.Vector3();
    shape.point(K.hinge === 'rear' ? K.u0 : K.u1, 1, hinge);
    pivot.position.copy(hinge);
    const b = buildPanel(full, { u0: K.u0, u1: K.u1, v0: K.v0, v1: 2 - K.v0 }, 1, { nu: 20, nv: 20, thickness: 0.035, mats: { outer: 0, inner: 1, edge: 2 } });
    const outerMat = K.material === 'teak' ? M.teak : K.material === 'louvre' ? M.tintGlass : M.paint;
    const deck = meshFrom(b, [outerMat, K.material === 'louvre' ? M.tintGlass : M.carbon, M.inner]);
    if (K.material === 'louvre') deck.castShadow = false;
    translateGeo(deck, hinge);
    deck.userData.skin = K.material !== 'teak';
    pivot.add(deck);
    if (K.material === 'louvre') {
      // carbon louvres across the glass engine cover
      for (let i = 0; i < 7; i++) {
        const u = K.u0 + 0.03 + (K.u1 - K.u0 - 0.06) * (i / 6);
        const pth = surfacePath(shape, [[u, K.v0 + 0.01], [u, 0.86], [u, 0.999]], 1, 0.012, 16);
        const pts = pth.getPoints(16);
        const mirrored = pts.map((p) => new THREE.Vector3(-p.x, p.y, p.z)).reverse();
        const full = new THREE.CatmullRomCurve3([...pts, ...mirrored.slice(1)]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(full, 48, 0.008, 6, false), M.carbon);
        tube.scale.set(1, 1, 1);
        tube.geometry.translate(-hinge.x, -hinge.y, -hinge.z);
        pivot.add(tube);
      }
    }
    if (K.material === 'teak') {
      // polished titanium spine strip on the teak deck
      const pth = surfacePath(shape, [[K.u0 + 0.01, 0.999], [K.u1 - 0.01, 0.999]], 1, 0.004, 20);
      const t = new THREE.Mesh(new THREE.TubeGeometry(pth, 30, 0.012, 8, false), M.titanium);
      t.geometry.translate(-hinge.x, -hinge.y, -hinge.z);
      pivot.add(t);
    }
    root.add(pivot);
    out.deck = { pivot, hinge, mesh: deck, rear: K.hinge === 'rear', angle: K.angle };
  }

  // ---- sponsons (lower side body panels that become flotation hulls)
  // The outer skin is cut flush from the body; the inner face is a flat plane
  // (the teak deck) whose normal is the band's mean normal, so the deployed
  // rotation lays the deck exactly horizontal.
  const um = (S.u0 + S.u1) / 2;
  const band = [];
  for (let j = 0; j <= 12; j++) {
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    shape.point(um, S.v0 + (S.v1 - S.v0) * (j / 12), p);
    shape.normal(um, S.v0 + (S.v1 - S.v0) * (j / 12), n);
    band.push([p, n]);
  }
  const nAvg = new THREE.Vector2();
  band.forEach(([, n]) => nAvg.add(new THREE.Vector2(n.x, n.y)));
  nAvg.normalize();
  let minS = Infinity;
  for (const [p] of band) minS = Math.min(minS, p.x * nAvg.x + p.y * nAvg.y);
  const plane = {
    nx: nAvg.x, ny: nAvg.y, c: minS - S.thickness,
  };
  out.sponsonTilt = Math.atan2(nAvg.y, nAvg.x); // mean normal angle (+x side)
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    const b = buildPanel(shape, { u0: S.u0, u1: S.u1, v0: S.v0, v1: S.v1 }, side, {
      nu: 30, nv: 12, gapU: 0.0012, gapV: 0.003,
      innerPlane: plane,
      mats: { outer: 0, inner: 1, edge: 2 },
      outerMatOf: (u, v) => (v > 0.3 ? 3 : 0),
      innerUV: (u, v, p) => [p.z * 1.0, (p.x * side * -nAvg.y + p.y * nAvg.x) * 2.2],
    });
    const mesh = meshFrom(b, [M.carbon, M.teak, M.hull, M.paint]);
    mesh.geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    mesh.geometry.boundingBox.getCenter(c);
    translateGeo(mesh, c);
    pivot.position.copy(c);
    pivot.add(mesh);
    mesh.userData.skin = true;
    // deck attachment point (centre of the flat inner face) in pivot space
    const deckC = new THREE.Vector3(band[6][0].x * side, band[6][0].y, c.z);
    const d = deckC.x * nAvg.x * side + deckC.y * nAvg.y - plane.c;
    deckC.x -= nAvg.x * side * d; deckC.y -= nAvg.y * d;
    deckC.sub(c);
    // LED strip along the outboard (former upper) edge — visible once deployed
    const pth = surfacePath(shape, [[S.u0 + 0.03, S.v1 - 0.012], [(S.u0 + S.u1) / 2, S.v1 - 0.014], [S.u1 - 0.03, S.v1 - 0.012]], side, -0.03, 30);
    const led = new THREE.Mesh(new THREE.TubeGeometry(pth, 40, 0.005, 6, false), M.ledCyan);
    led.geometry.translate(-c.x, -c.y, -c.z);
    pivot.add(led);
    // stainless rub rail along the outer chine
    const rp = surfacePath(shape, [[S.u0 + 0.02, S.v1 - 0.004], [(S.u0 + S.u1) / 2, S.v1 - 0.004], [S.u1 - 0.02, S.v1 - 0.004]], side, 0.006, 30);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(rp, 40, 0.008, 6, false), M.titanium);
    rail.geometry.translate(-c.x, -c.y, -c.z);
    pivot.add(rail);
    root.add(pivot);
    out.sponsons.push({ side, pivot, mesh, home: c.clone(), length: shape.zOf(S.u1) - shape.zOf(S.u0), deck: deckC });
  }

  // ---- canopy / greenhouse
  const C = design.canopy;
  const cs = new CanopyShape(shape, C, cab.v);
  const csFull = new FullShape(cs);
  out.canopyShape = cs;
  const roofPivot = new THREE.Group();
  {
    const fixed = new GeoBuilder();
    // windshield glass + rear glass span the centreline
    buildPanel(csFull, { u0: C.windshield, u1: C.u1, v0: C.pillarW, v1: 2 - C.pillarW }, 1, { nu: 14, nv: 20, thickness: 0.006, builder: fixed, gapU: 0.0005, gapV: 0.0005, mats: { outer: 0, inner: 0, edge: 2 } });
    buildPanel(csFull, { u0: C.u0, u1: C.rearGlass, v0: C.pillarW * 2, v1: 2 - C.pillarW * 2 }, 1, { nu: 8, nv: 16, thickness: 0.006, builder: fixed, gapU: 0.0005, gapV: 0.0005, mats: { outer: 0, inner: 0, edge: 2 } });
    for (const side of [1, -1]) {
      // A-pillars + buttresses
      buildPanel(cs, { u0: C.windshield, u1: C.u1, v0: 0, v1: C.pillarW }, side, { nu: 14, nv: 3, thickness: 0.02, builder: fixed, gapU: 0.0005, gapV: 0.0005, mats: { outer: 1, inner: 2, edge: 2 } });
      buildPanel(cs, { u0: C.u0, u1: C.rearGlass, v0: 0, v1: C.pillarW * 2 }, side, { nu: 8, nv: 4, thickness: 0.03, builder: fixed, gapU: 0.0005, gapV: 0.0005, mats: { outer: 1, inner: 2, edge: 2 } });
    }
    const canopyFixed = meshFrom(fixed, [M.glass, design.id === 'nereid' ? M.carbon : M.paint, M.blackGloss]);
    canopyFixed.userData.skin = true;
    root.add(canopyFixed);
    out.canopyFixed = canopyFixed;

    // roof panel (retractable)
    const rb = buildPanel(csFull, { u0: C.rearGlass, u1: C.windshield, v0: C.sideW, v1: 2 - C.sideW }, 1, { nu: 14, nv: 16, thickness: C.glassRoof ? 0.008 : 0.025, gapU: 0.0008, gapV: 0.0012, mats: { outer: 0, inner: 1, edge: 2 } });
    const roofMat = C.roofMaterial === 'glass' ? M.tintGlass : C.roofMaterial === 'carbon' ? M.carbon : M.paint;
    const roof = meshFrom(rb, [roofMat, C.glassRoof ? M.tintGlass : M.alcantara, M.blackGloss]);
    roof.geometry.computeBoundingBox();
    const rc = new THREE.Vector3(); roof.geometry.boundingBox.getCenter(rc);
    translateGeo(roof, rc);
    roofPivot.position.copy(rc);
    roofPivot.add(roof);
    roof.userData.skin = true;
    root.add(roofPivot);
    out.roof = { pivot: roofPivot, home: rc.clone(), mesh: roof };

    // side glass belongs to each door; it can drop into the door
    for (const d of out.doors) {
      const gb = buildPanel(cs, { u0: C.rearGlass, u1: C.windshield, v0: 0, v1: C.sideW }, d.side, { nu: 12, nv: 6, thickness: 0.006, gapU: 0.0015, gapV: 0.0015, mats: { outer: 0, inner: 0, edge: 1 } });
      const gl = meshFrom(gb, [M.glass, M.blackGloss], { cast: false });
      translateGeo(gl, d.hinge);
      const drop = new THREE.Group();
      drop.add(gl);
      d.pivot.add(drop);
      d.glass = drop;
    }

    // frame trims along windshield and roof edges (gloss black)
    const edgeTube = (pts, r = 0.009) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, 6, false);
    };
    const pathCS = (fixedU, fromW, toW, n = 16, side = 1) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const p = new THREE.Vector3(); cs.point(fixedU, fromW + (toW - fromW) * (i / n), p); p.x *= side; pts.push(p);
      }
      return pts;
    };
    const header = [...pathCS(C.windshield, 0, 1, 16, 1), ...pathCS(C.windshield, 1, 0, 16, -1).slice(1)];
    const frame = new THREE.Mesh(edgeTube(header, 0.012), M.blackGloss);
    root.add(frame);
  }

  // ---- lights, intakes, diffuser (per design signature)
  buildLights(design, shape, M, out);
  buildDetails(design, shape, M, out);

  if (design.humps) buildHumps(design, shape, M, out);
  if (design.wing) buildWing(design, shape, M, out);
  return out;
}

function buildLights(design, shape, M, out) {
  const g = out.details;
  const sig = {
    thalassa: { drl: [[0.985, 0.42], [0.975, 0.56], [0.955, 0.66], [0.925, 0.74]], lamp: { u0: 0.94, u1: 0.982, v0: 0.5, v1: 0.68 }, proj: [[0.968, 0.6], [0.958, 0.63]] },
    nereid: { drl: [[0.99, 0.36], [0.975, 0.5], [0.95, 0.62], [0.915, 0.71], [0.9, 0.76]], lamp: { u0: 0.93, u1: 0.98, v0: 0.46, v1: 0.66 }, proj: [[0.962, 0.55]] },
    halcyon: { drl: [[0.982, 0.5], [0.97, 0.6], [0.95, 0.66], [0.93, 0.68]], lamp: { u0: 0.935, u1: 0.98, v0: 0.5, v1: 0.7 }, proj: [[0.962, 0.6], [0.95, 0.64]] },
  }[design.lights];
  out.headLights = [];
  for (const side of [1, -1]) {
    // dark lamp housing with glass cover
    const hb = buildConformal(shape, sig.lamp, side, 0.0025, 0, null, {
      nu: 14, nv: 8,
      shapeFn: (a, b) => (Math.pow(Math.abs(a - 0.5) * 2, 4) + Math.pow(Math.abs(b - 0.5) * 2, 4)) < 1,
    });
    g.add(meshFrom(hb, [M.blackGloss], { cast: false }));
    const lb = buildConformal(shape, sig.lamp, side, 0.008, 0, null, {
      nu: 14, nv: 8,
      shapeFn: (a, b) => (Math.pow(Math.abs(a - 0.5) * 2, 4) + Math.pow(Math.abs(b - 0.5) * 2, 4)) < 1,
    });
    g.add(meshFrom(lb, [M.lensGlass], { cast: false }));
    const drl = surfacePath(shape, sig.drl, side, 0.006, 40);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(drl, 60, 0.0055, 8, false), M.led);
    g.add(tube);
    for (const [u, v] of sig.proj) {
      const p = new THREE.Vector3(), n = new THREE.Vector3();
      shape.point(u, v, p); shape.normal(u, v, n); p.x *= side; n.x *= side;
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.projector);
      lens.position.copy(p).addScaledVector(n, -0.004);
      lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      g.add(lens);
      out.headLights.push({ pos: lens.position.clone(), dir: n.clone() });
    }
  }
  // full-width tail light bar + red lens
  const tailPts = [];
  const tv = design.id === 'nereid' ? 0.72 : 0.66;
  for (let i = 0; i <= 24; i++) {
    const v = tv + (1 - tv) * (i / 24);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const u = 0.012 + (1 - i / 24) * 0.01;
    shape.point(u, v, p); shape.normal(u, v, n);
    p.addScaledVector(n, 0.006);
    tailPts.push(p);
  }
  const full = [...tailPts, ...tailPts.slice(0, -1).reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
  const tailCurve = new THREE.CatmullRomCurve3(full);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 90, 0.008, 8, false), M.ledRed);
  g.add(tail);
  for (const side of [1, -1]) {
    const rb = buildConformal(shape, { u0: 0.0, u1: 0.03, v0: tv - 0.05, v1: 0.97 }, side, 0.002, 0, null, { nu: 4, nv: 10 });
    g.add(meshFrom(rb, [M.redLens], { cast: false }));
  }
}

function buildDetails(design, shape, M, out) {
  const g = out.details;
  // front intake grille
  for (const side of [1, -1]) {
    const ib = buildConformal(shape, { u0: 0.962, u1: 0.999, v0: 0.18, v1: 0.43 }, side, 0.002, 0, null, { nu: 8, nv: 10, uvScale: 2 });
    g.add(meshFrom(ib, [M.grille], { cast: false }));
    // lower splitter blade (carbon)
    const sp = surfacePath(shape, [[0.99, 0.12], [0.96, 0.15], [0.9, 0.2]], side, 0.01, 20);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(sp, 24, 0.012, 6, false), M.carbon));
    // rocker/sill titanium strip above the sponson seam
    const S = design.sponson;
    const rp = surfacePath(shape, [[S.u0 - 0.04, S.v1 + 0.012], [(S.u0 + S.u1) / 2, S.v1 + 0.012], [S.u1 + 0.03, S.v1 + 0.012]], side, 0.004, 30);
    const strip = new THREE.Mesh(new THREE.TubeGeometry(rp, 40, 0.006, 6, false), M.titanium);
    g.add(strip);
  }
  if (design.id === 'nereid') {
    for (const side of [1, -1]) {
      const ib = buildConformal(shape, { u0: 0.27, u1: 0.335, v0: 0.42, v1: 0.6 }, side, 0.002, 0, null, { nu: 8, nv: 8, uvScale: 1.5 });
      g.add(meshFrom(ib, [M.grille], { cast: false }));
    }
  }
  // rear diffuser fins
  const finMat = M.carbon;
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.42), finMat);
    const u = 0.055;
    fin.position.set(i * 0.19, shape.yb(u) - 0.035, shape.zOf(u));
    fin.rotation.x = 0.32;
    g.add(fin);
  }
  // emblem on the nose: small enamelled roundel
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  shape.point(0.992, 0.62, p); shape.normal(0.992, 0.62, n);
  p.x = 0; n.x = 0; n.normalize();
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 32), M.gold);
  badge.position.copy(p).addScaledVector(n, 0.003);
  badge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  g.add(badge);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.007, 32), M.ledCyan);
  inner.position.copy(badge.position).addScaledVector(n, 0.001);
  inner.quaternion.copy(badge.quaternion);
  inner.scale.set(1, 1, 1);
  g.add(inner);
}

function buildHumps(design, shape, M, out) {
  // twin headrest fairings behind the seats (speedster)
  for (const side of [1, -1]) {
    const g = new THREE.SphereGeometry(0.2, 28, 18);
    g.scale(0.85, 0.75, 2.6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z > 0) pos.setY(i, pos.getY(i) * (1 - z / 0.55 * 0.35));
      if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.2);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.paint);
    m.position.set(side * 0.36, shape.yt(0.33) - 0.02, shape.zOf(0.3));
    m.castShadow = true;
    out.deck.pivot.add(m);
    m.position.sub(out.deck.hinge);
  }
}

function buildWing(design, shape, M, out) {
  // active rear wing that lowers flush for marine running
  const wingG = new THREE.Group();
  const span = 1.7, chord = 0.28;
  const shapeAir = new THREE.Shape();
  shapeAir.moveTo(0, 0);
  shapeAir.bezierCurveTo(0.05, 0.035, 0.18, 0.03, chord, 0.0);
  shapeAir.bezierCurveTo(0.18, 0.012, 0.05, -0.008, 0, 0);
  const geo = new THREE.ExtrudeGeometry(shapeAir, { depth: span, bevelEnabled: false, steps: 1 });
  geo.translate(-chord / 2, 0, -span / 2);
  geo.rotateY(Math.PI / 2);
  const blade = new THREE.Mesh(geo, M.carbon);
  blade.castShadow = true;
  wingG.add(blade);
  for (const s of [-1, 1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.34), M.carbon);
    ep.position.set(s * span / 2, -0.04, 0);
    wingG.add(ep);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.08), M.darkTitanium);
    strut.position.set(s * 0.42, -0.12, 0.02);
    strut.rotation.x = 0.2;
    wingG.add(strut);
  }
  const z = shape.zOf(0.05);
  const pivot = new THREE.Group();
  pivot.position.set(0, shape.yt(0.06) + 0.16, z);
  pivot.add(wingG);
  out.root.add(pivot);
  out.wing = { pivot, home: pivot.position.clone() };
}
