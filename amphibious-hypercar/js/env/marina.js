// Marina, exhibition plinth, breakwater + lighthouse, moored yachts,
// hillside village and Mediterranean vegetation (instanced).
import * as THREE from 'three';
import { QUAY, SLIPWAY, PLINTH, BREAKWATER, road, ROAD_HALF, naturalHeight } from './terrain.js';
import { BodyShape, GeoBuilder, buildShell } from '../vehicle/loft.js';
import { stoneTexture, teakTextures, pavingTexture } from '../util/textures.js';
import { mulberry32, clamp, smoothstep, Simplex2 } from '../util/noise.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const rnd = mulberry32(2025);
const R = (a, b) => a + (b - a) * rnd();

function stdMat(color, rough = 0.8, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

export class Marina {
  constructor(terrain, waves) {
    this.terrain = terrain;
    this.waves = waves;
    this.group = new THREE.Group();
    this.group.name = 'marina';
    this.boats = [];
    this.nightMats = [];
    this.lampLights = [];
    this._quay();
    this._slipway();
    this._plinth();
    this._pontoons();
    this._breakwater();
    this._lighthouse();
    this._yachts();
    this._village();
    this._vegetation();
    this._roadWalls();
  }

  _quay() {
    const g = this.group;
    const W = QUAY.x1 - QUAY.x0, D = QUAY.z1 - QUAY.z0;
    const paveTex = pavingTexture().clone();
    paveTex.repeat.set(W / 7, D / 7);
    paveTex.needsUpdate = true;
    const pave = stdMat(0xf2ebe0, 0.78, 0, { map: paveTex });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(W, D), pave);
    top.rotation.x = -Math.PI / 2;
    top.position.set((QUAY.x0 + QUAY.x1) / 2, QUAY.y, (QUAY.z0 + QUAY.z1) / 2);
    top.receiveShadow = true;
    g.add(top);
    // quay wall (stone blocks) facing the basin
    const wallTex = stoneTexture().clone();
    wallTex.repeat.set(W / 4, 2.2);
    wallTex.needsUpdate = true;
    const wallMat = stdMat(0xcfc3ad, 0.9, 0, { map: wallTex });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(W, 8, 1.2), wallMat);
    wall.position.set((QUAY.x0 + QUAY.x1) / 2, QUAY.y - 4, QUAY.z1 - 0.6);
    wall.receiveShadow = true;
    g.add(wall);
    // travertine coping along the edge
    const coping = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, 0.7), stdMat(0xf1ebe0, 0.6));
    coping.position.set((QUAY.x0 + QUAY.x1) / 2, QUAY.y + 0.11, QUAY.z1 - 0.35);
    coping.receiveShadow = true; coping.castShadow = true;
    g.add(coping);
    // bollards + lamp posts along the promenade
    const iron = stdMat(0x1b1c1e, 0.5, 0.7);
    const bollardG = new THREE.CylinderGeometry(0.16, 0.2, 0.55, 14);
    const bollards = new THREE.InstancedMesh(bollardG, iron, 40);
    const lampG = new THREE.CylinderGeometry(0.05, 0.08, 4.2, 10);
    const lamps = new THREE.InstancedMesh(lampG, iron, 16);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd8a0, emissiveIntensity: 0 });
    this.nightMats.push({ mat: bulbMat, max: 4 });
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 16, 10), bulbMat, 16);
    const m4 = new THREE.Matrix4();
    let bi = 0, li = 0;
    for (let x = QUAY.x0 + 8; x < QUAY.x1 - 4; x += 7.5) {
      if (x > SLIPWAY.x0 - 2 && x < SLIPWAY.x1 + 2) continue;
      if (bi < 40) bollards.setMatrixAt(bi++, m4.makeTranslation(x, QUAY.y + 0.27, QUAY.z1 - 1.2));
    }
    for (let x = QUAY.x0 + 14; x < QUAY.x1 - 10 && li < 16; x += 19) {
      lamps.setMatrixAt(li, m4.makeTranslation(x, QUAY.y + 2.1, QUAY.z0 + 7));
      bulbs.setMatrixAt(li, m4.makeTranslation(x, QUAY.y + 4.3, QUAY.z0 + 7));
      li++;
    }
    bollards.count = bi; lamps.count = li; bulbs.count = li;
    for (const m of [bollards, lamps]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.add(bulbs);
    // a handful of real lights for night time
    for (let k = 0; k < 4; k++) {
      const pl = new THREE.PointLight(0xffd8a0, 0, 26, 2);
      pl.position.set(QUAY.x0 + 40 + k * 70, QUAY.y + 4.1, QUAY.z0 + 7);
      g.add(pl);
      this.lampLights.push(pl);
    }
    // palms along the promenade
    this._palms(g);
  }

  _palms(g) {
    const trunkMat = stdMat(0x7a6a55, 0.95);
    const frondMat = stdMat(0x3f5a2a, 0.8, 0, { side: THREE.DoubleSide });
    for (let k = 0; k < 9; k++) {
      const x = QUAY.x0 + 30 + k * 30 + R(-3, 3);
      if (Math.abs(x - PLINTH.x) < 12 || (x > SLIPWAY.x0 - 4 && x < SLIPWAY.x1 + 4)) continue;
      const z = QUAY.z0 + 10 + R(0, 6);
      const p = new THREE.Group();
      const h = R(7, 10);
      const lean = R(-0.15, 0.15);
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(lean) * h * (i / 8) * (i / 8), h * (i / 8), 0));
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.22, 8, false), trunkMat);
      trunk.castShadow = true;
      p.add(trunk);
      for (let f = 0; f < 11; f++) {
        const fr = new THREE.PlaneGeometry(0.7, 3.6, 1, 6);
        const pp = fr.attributes.position;
        for (let i = 0; i < pp.count; i++) {
          const y = pp.getY(i) + 1.8;
          pp.setZ(i, -0.08 * y * y);
          pp.setX(i, pp.getX(i) * Math.sin(Math.PI * (y / 3.6)) );
          pp.setY(i, y);
        }
        fr.computeVertexNormals();
        const fm = new THREE.Mesh(fr, frondMat);
        fm.castShadow = true;
        fm.position.copy(pts[8]);
        fm.rotation.order = 'YXZ';
        fm.rotation.y = (f / 11) * Math.PI * 2;
        fm.rotation.x = -1.0 - R(0, 0.5);
        p.add(fm);
      }
      p.position.set(x, QUAY.y, z);
      g.add(p);
    }
  }

  _slipway() {
    const S = SLIPWAY;
    const len = Math.hypot(S.zBot - S.zTop, S.yTop - S.yBot);
    const tex = stoneTexture().clone();
    tex.repeat.set(3, 8);
    tex.needsUpdate = true;
    const mat = stdMat(0xb5b0a6, 0.8, 0, { map: tex });
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.6, len), mat);
    const ang = Math.atan2(S.yTop - S.yBot, S.zBot - S.zTop);
    ramp.rotation.x = ang;
    ramp.position.set((S.x0 + S.x1) / 2, (S.yTop + S.yBot) / 2 - 0.3, (S.zTop + S.zBot) / 2);
    ramp.receiveShadow = true;
    this.group.add(ramp);
    for (const x of [S.x0 - 0.3, S.x1 + 0.3]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, len), mat);
      curb.rotation.x = ang;
      curb.position.set(x, (S.yTop + S.yBot) / 2 + 0.05, (S.zTop + S.zBot) / 2);
      curb.castShadow = true; curb.receiveShadow = true;
      this.group.add(curb);
    }
  }

  _plinth() {
    const P = PLINTH;
    const g = new THREE.Group();
    g.position.set(P.x, QUAY.y, P.z);
    const stoneTex = pavingTexture().clone();
    stoneTex.repeat.set(1.4, 1.4);
    stoneTex.needsUpdate = true;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r + 0.06, P.h, 128), new THREE.MeshPhysicalMaterial({ color: 0xe4dccd, map: stoneTex, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
    base.position.y = P.h / 2;
    base.receiveShadow = true;
    g.add(base);
    const ttTex = pavingTexture().clone(); ttTex.repeat.set(0.9, 0.9); ttTex.rotation = 0.6; ttTex.needsUpdate = true;
    this.turntable = new THREE.Mesh(new THREE.CylinderGeometry(P.r - 0.5, P.r - 0.5, 0.02, 128), new THREE.MeshStandardMaterial({ color: 0x8d857b, map: ttTex, roughness: 0.62, metalness: 0 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(P.r + 0.03, 0.035, 10, 160), new THREE.MeshPhysicalMaterial({ color: 0xbdb7ae, metalness: 1, roughness: 0.28 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = P.h - 0.01;
    g.add(rim);
    this.turntable.position.y = P.h + 0.01;
    this.turntable.receiveShadow = true;
    g.add(this.turntable);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe6c4, emissiveIntensity: 0.0 });
    this.nightMats.push({ mat: ringMat, max: 2.2, min: 0.0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(P.r - 0.48, 0.012, 8, 160), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = P.h + 0.022;
    g.add(ring);
    // display lift column that raises the car for in-show transformations
    this.pedestal = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1, 48), new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, metalness: 0.9, roughness: 0.22, clearcoat: 1 }));
    col.geometry.translate(0, 0.5, 0);
    col.castShadow = true;
    this.pedestalCol = col;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0.8, roughness: 0.4 }));
    this.pedestalCap = cap;
    this.pedestal.add(col, cap);
    this.pedestal.position.y = P.h;
    g.add(this.pedestal);
    const iron = stdMat(0x202124, 0.3, 0.9);
    // exhibition spotlights that take over after dusk
    this.plinthSpots = [];
    for (const [ang, h] of [[0.6, 7.5], [2.7, 6.8], [4.5, 7.2]]) {
      const sp = new THREE.SpotLight(0xfff1dc, 0, 22, 0.42, 0.6, 1.4);
      sp.position.set(Math.cos(ang) * 6.5, h, Math.sin(ang) * 6.5);
      sp.target.position.set(0, 0.6, 0);
      g.add(sp, sp.target);
      this.plinthSpots.push(sp);
    }
    this.plinth = g;
    this.group.add(g);
    this.setPedestal(0);
  }

  setPedestal(h) {
    this.pedestalCol.scale.y = Math.max(0.001, h);
    this.pedestalCap.position.y = h;
    this.pedestal.visible = h > 0.01;
  }

  _pontoons() {
    const teak = teakTextures();
    const deckTex = teak.map.clone();
    deckTex.repeat.set(0.6, 30);
    deckTex.rotation = Math.PI / 2;
    deckTex.needsUpdate = true;
    const deckMat = stdMat(0xb8aa95, 0.85, 0, { map: deckTex });
    const floatMat = stdMat(0x2a2d30, 0.6, 0.2);
    this.pontoons = [];
    for (const x of [8, 66, 118]) {
      const len = 70;
      const p = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, len), deckMat);
      deck.castShadow = true; deck.receiveShadow = true;
      p.add(deck);
      for (let z = -len / 2 + 2; z < len / 2; z += 4) {
        const fl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 3.2), floatMat);
        fl.position.set(0, -0.32, z);
        p.add(fl);
        for (const s of [-1, 1]) {
          const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.35), stdMat(0xbfc3c7, 0.3, 1));
          cleat.position.set(s * 1.2, 0.13, z);
          p.add(cleat);
        }
      }
      p.position.set(x, 0.42, QUAY.z1 + len / 2 + 1);
      this.group.add(p);
      this.pontoons.push({ g: p, base: p.position.clone() });
    }
  }

  _breakwater() {
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), stdMat(0xa69e90, 0.95), 900);
    const pos = rocks.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const s = 0.8 + Math.sin(i * 12.9898) * 0.2;
      pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * (0.75 + Math.cos(i * 7.1) * 0.15), pos.getZ(i) * s);
    }
    rocks.geometry.computeVertexNormals();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    const crown = [];
    for (let i = 0; i < BREAKWATER.length - 1; i++) {
      const [ax, az] = BREAKWATER[i], [bx, bz] = BREAKWATER[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const nx = -tz, nz = tx;
      for (let d = 0; d < len; d += 2.6) {
        for (let k = -3; k <= 3; k++) {
          if (n >= 900) break;
          const off = k * 2.4 + R(-0.6, 0.6);
          const x = ax + tx * (d + R(-0.8, 0.8)) + nx * off, z = az + tz * (d + R(-0.8, 0.8)) + nz * off;
          const y = 2.0 - Math.abs(k) * 1.4 + R(-0.4, 0.3);
          const s = R(1.3, 2.4);
          e.set(R(0, 6), R(0, 6), R(0, 6));
          q.setFromEuler(e);
          sc.set(s * R(0.9, 1.3), s * R(0.7, 1.0), s * R(0.9, 1.3));
          rocks.setMatrixAt(n++, m4.compose(p.set(x, y, z), q, sc));
        }
      }
      // concrete crown wall
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, len + 0.4), stdMat(0xd2cbbd, 0.85));
      wall.position.set((ax + bx) / 2 - nx * 0.5, 3.0, (az + bz) / 2 - nz * 0.5);
      wall.rotation.y = Math.atan2(tx, tz);
      wall.castShadow = true; wall.receiveShadow = true;
      crown.push(wall);
      this.group.add(wall);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, len + 0.4), stdMat(0xe3dccf, 0.8));
      walk.position.set((ax + bx) / 2 - nx * 2.6, 2.3, (az + bz) / 2 - nz * 2.6);
      walk.rotation.y = Math.atan2(tx, tz);
      walk.receiveShadow = true;
      this.group.add(walk);
    }
    rocks.count = n;
    rocks.castShadow = true; rocks.receiveShadow = true;
    this.group.add(rocks);
  }

  _lighthouse() {
    const [x, z] = BREAKWATER[BREAKWATER.length - 1];
    const g = new THREE.Group();
    const white = stdMat(0xf3efe8, 0.6);
    const green = stdMat(0x2d6b4a, 0.5);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 2.5, 32), white);
    base.position.y = 2.6;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 10, 32), white);
    tower.position.y = 8.8;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 1.6, 32), green);
    band.position.y = 11.5;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.2, 32), stdMat(0x2a2b2d, 0.4, 0.8));
    gallery.position.y = 13.9;
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x334, emissive: 0x9dffc8, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 });
    this.nightMats.push({ mat: lanternMat, max: 8, min: 0.2 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 24), lanternMat);
    lantern.position.y = 14.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.9, 24), green);
    roof.position.y = 15.8;
    for (const m of [base, tower, band, gallery, lantern, roof]) { m.castShadow = true; g.add(m); }
    // sweeping beam
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xbfffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamG = new THREE.ConeGeometry(2.5, 70, 24, 1, true);
    beamG.translate(0, -35, 0);
    beamG.rotateZ(Math.PI / 2);
    this.beam = new THREE.Mesh(beamG, beamMat);
    this.beam.position.y = 14.7;
    g.add(this.beam);
    g.position.set(x - 3, 0, z - 2);
    this.lighthouse = g;
    this.group.add(g);
  }

  _yachtGeometry(L, B, white, navy, deck, glass, motor) {
    const g = new THREE.Group();
    const hull = new BodyShape({
      z0: -L / 2, z1: L / 2,
      hw: [[0, B * 0.42], [0.08, B * 0.47], [0.4, B * 0.5], [0.7, B * 0.45], [0.88, B * 0.3], [0.97, B * 0.1], [1, 0.02]],
      yb: [[0, 0.2], [0.3, -0.7], [0.6, -0.75], [0.85, -0.4], [1, 0.5]],
      ys: [[0, 0.75], [1, 0.95]],
      yt: [[0, 1.15], [0.5, 1.2], [1, 1.45]],
      nt: 6, nb: 1.6, tumble: 0,
    });
    const us = Array.from({ length: 41 }, (_, i) => i / 40), vs = Array.from({ length: 21 }, (_, i) => i / 20);
    const b = new GeoBuilder();
    for (const s of [1, -1]) buildShell(hull, us, vs, s, () => true, (u, v) => (v > 0.88 ? 2 : v > 0.42 && v < 0.47 ? 1 : 0), b);
    const m = new THREE.Mesh(b.build(), [white, navy, deck]);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    // superstructure
    const sup = new BodyShape({
      z0: -L * 0.32, z1: L * (motor ? 0.2 : 0.1),
      hw: [[0, B * 0.36], [0.6, B * 0.34], [1, B * 0.12]],
      yb: 1.15, ys: [[0, 1.6], [1, 1.5]], yt: [[0, motor ? 2.4 : 1.75], [0.6, motor ? 2.35 : 1.75], [1, 1.5]],
      nt: 5, nb: 8, tumble: 0.12,
    });
    const b2 = new GeoBuilder();
    for (const s of [1, -1]) buildShell(sup, us, vs, s, () => true, (u, v) => (v > 0.45 && v < 0.75 ? 1 : 0), b2);
    const sm = new THREE.Mesh(b2.build(), [white, glass]);
    sm.castShadow = true;
    g.add(sm);
    if (!motor) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, L * 1.35, 12), stdMat(0xd6d8db, 0.3, 0.9));
      mast.position.set(0, L * 0.675 + 1.2, L * 0.08);
      mast.castShadow = true;
      g.add(mast);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, L * 0.42, 10), stdMat(0xd6d8db, 0.3, 0.9));
      boom.rotation.x = Math.PI / 2;
      boom.position.set(0, 2.4, L * 0.08 - L * 0.21);
      g.add(boom);
      const furled = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, L * 0.4, 10), stdMat(0x1f3550, 0.9));
      furled.rotation.x = Math.PI / 2;
      furled.position.set(0, 2.62, L * 0.08 - L * 0.2);
      g.add(furled);
    }
    return g;
  }

  _yachts() {
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    const navy = new THREE.MeshPhysicalMaterial({ color: 0x14243b, roughness: 0.25, clearcoat: 1 });
    const t = teakTextures();
    const deck = stdMat(0xffffff, 0.6, 0, { map: t.map });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1418, roughness: 0.05, metalness: 0.6, clearcoat: 1 });
    const slots = [
      [8 - 6.5, 1], [8 - 6.5, 3], [8 + 6.5, 0], [8 + 6.5, 2.4],
      [66 - 7, 1.2], [66 + 7, 0], [66 + 7, 2.5], [118 - 7.5, 0.5], [118 + 7.5, 1.6], [118 + 7.5, 3.2],
    ];
    slots.forEach(([x, k], i) => {
      const motor = i % 3 !== 1;
      const L = motor ? R(13, 19) : R(12, 16);
      const B = L * R(0.27, 0.31);
      const y = this._yachtGeometry(L, B, white, navy, deck, glass, motor);
      const z = QUAY.z1 + 6 + k * 16 + L / 2;
      y.position.set(x, 0, z);
      y.rotation.y = R(-0.03, 0.03) + (i % 2 ? Math.PI : 0);
      this.group.add(y);
      this.boats.push({ g: y, x, z, phase: R(0, 6), L, B, yaw: y.rotation.y });
    });
  }

  _village() {
    // facade tile: one bay (3.4 m wide x 3.1 m storey) with a shuttered window
    const TW = 3.4, TH = 3.1;
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const nz = new Simplex2(91);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = 236 + nz.fbm(x * 0.04, y * 0.04, 3) * 10 + nz.noise(x * 0.3, y * 0.3) * 4;
      const i = (y * 256 + x) * 4;
      img.data[i] = v; img.data[i + 1] = v * 0.985; img.data[i + 2] = v * 0.955; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // window opening, shutters, sill, lintel
    const wx = 98, wy = 52, ww = 60, wh = 110;
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
    ctx.fillStyle = '#1d1c1b'; ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = 'rgba(120,140,150,0.25)'; ctx.fillRect(wx + 6, wy + 6, ww / 2 - 9, wh - 12); ctx.fillRect(wx + ww / 2 + 3, wy + 6, ww / 2 - 9, wh - 12);
    ctx.fillStyle = '#e9e4da'; ctx.fillRect(wx - 8, wy + wh, ww + 16, 7); ctx.fillRect(wx - 6, wy - 9, ww + 12, 6);
    for (const sx of [wx - 34, wx + ww + 3]) {
      ctx.fillStyle = '#4c6b52'; ctx.fillRect(sx, wy, 31, wh);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
      for (let k = 4; k < wh; k += 5) { ctx.beginPath(); ctx.moveTo(sx + 2, wy + k); ctx.lineTo(sx + 29, wy + k); ctx.stroke(); }
      ctx.strokeRect(sx + 0.5, wy + 0.5, 30, wh - 1);
    }
    // string course between storeys
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0, 248, 256, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    const ec = document.createElement('canvas'); ec.width = ec.height = 256;
    const ectx = ec.getContext('2d');
    ectx.fillStyle = '#000'; ectx.fillRect(0, 0, 256, 256);
    ectx.fillStyle = '#ffc98a'; ectx.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
    const em = new THREE.CanvasTexture(ec);
    em.colorSpace = THREE.SRGBColorSpace; em.wrapS = em.wrapT = THREE.RepeatWrapping;
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0 });
    // tile the facade by real size (per face, from the instance scale) and light ~40% of windows
    wallMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTile; varying vec2 vSeed;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float wdt = abs(normal.x) > 0.5 ? sc.z : sc.x;
          vTile = uv * vec2(wdt / ${TW.toFixed(2)}, sc.y / ${TH.toFixed(2)});
          vTile.x = floor(wdt / ${TW.toFixed(2)} + 0.5) > 0.5 ? uv.x * floor(wdt / ${TW.toFixed(2)} + 0.5) : vTile.x;
          vTile.y = uv.y * sc.y / ${TH.toFixed(2)} - fract(sc.y / ${TH.toFixed(2)});
          vSeed = instanceMatrix[3].xz;
          if (abs(normal.y) > 0.5) vTile = vec2(0.02);`)
        ;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTile; varying vec2 vSeed;')
        .replace('#include <map_fragment>', 'vec4 sampledDiffuseColor = texture2D( map, vTile ); diffuseColor *= sampledDiffuseColor;')
        .replace('#include <emissivemap_fragment>', `vec4 emissiveColor = texture2D( emissiveMap, vTile );
          float lit = step(0.6, fract(sin(dot(floor(vTile) + vSeed * 0.37, vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance *= emissiveColor.rgb * lit;`);
    };
    wallMat.customProgramCacheKey = () => 'facade';
    this.nightMats.push({ mat: wallMat, max: 1.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const terraceMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.9 });
    const N = 170;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, N);
    const roofG = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    roofG.rotateY(Math.PI / 4);
    roofG.translate(0, 0.5, 0);
    const roofs = new THREE.InstancedMesh(roofG, roofMat, N);
    const terraces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), terraceMat, N);
    const palette = ['#f0e6d4', '#e7c48b', '#e2a587', '#d69a5c', '#efd9a1', '#e8b8a6', '#cc7d5b', '#f3eee5', '#d9b38c'].map((h) => new THREE.Color(h));
    const tiles = ['#a9573a', '#b5653f', '#9c4e35', '#b8714c'].map((h) => new THREE.Color(h));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0, nr = 0, nt = 0, tries = 0;
    const placed = [];
    this.housePts = placed;
    const rn = {};
    while (n < N && tries < 9000) {
      tries++;
      const x = R(-280, 320), z = R(-340, -110);
      if (x > QUAY.x0 - 6 && x < QUAY.x1 + 6 && z > QUAY.z0 - 8) continue;
      const h0 = this.terrain.gridHeight(x, z);
      if (h0 < 3 || h0 > 75) continue;
      const s1 = Math.abs(this.terrain.gridHeight(x + 4, z) - this.terrain.gridHeight(x - 4, z)) / 8;
      const s2 = Math.abs(this.terrain.gridHeight(x, z + 4) - this.terrain.gridHeight(x, z - 4)) / 8;
      if (Math.max(s1, s2) > 0.5) continue;
      road.nearest(x, z, rn);
      if (rn.d < ROAD_HALF + 6) continue;
      const dist = Math.hypot(x - 20, z + 135);
      if (rnd() > Math.exp(-dist / 150)) continue;
      const w = R(6.5, 11), d = R(6.5, 10), storeys = rnd() < 0.55 ? 3 : 2;
      const h = storeys * 3.1 + 0.3;
      if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + Math.max(w, d) * 0.55)) continue;
      placed.push([x, z, Math.max(w, d) * 0.55]);
      // face downhill / toward the sea with a little jitter
      const yaw = Math.round(R(-0.6, 0.6)) * 0.0 + R(-0.18, 0.18) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      q.setFromAxisAngle(up, yaw);
      const sink = 3.5;
      const base = h0 - Math.max(s1, s2) * Math.max(w, d) * 0.5;
      walls.setMatrixAt(n, m4.compose(p.set(x, base + (h + sink) / 2 - sink, z), q, sc.set(w, h + sink, d)));
      walls.setColorAt(n, palette[Math.floor(rnd() * palette.length)]);
      const top = base + h;
      if (rnd() < 0.68) {
        roofs.setMatrixAt(nr, m4.compose(p.set(x, top - 0.05, z), q, sc.set(w * 1.12, Math.min(w, d) * R(0.22, 0.3), d * 1.12)));
        roofs.setColorAt(nr, tiles[Math.floor(rnd() * tiles.length)]);
        nr++;
      } else {
        terraces.setMatrixAt(nt, m4.compose(p.set(x, top + 0.25, z), q, sc.set(w * 1.03, 0.5, d * 1.03)));
        nt++;
      }
      n++;
    }
    walls.count = n; roofs.count = nr; terraces.count = nt;
    for (const m of [walls, roofs, terraces]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    // campanile
    const ch = this.terrain.gridHeight(-40, -175);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 26, 4.5), new THREE.MeshStandardMaterial({ color: 0xe2c28a, roughness: 0.9 }));
    tower.position.set(-40, ch + 11, -175);
    const belfry = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.5, 4.8), terraceMat);
    belfry.position.set(-40, ch + 24.2, -175);
    const troof = new THREE.Mesh(new THREE.ConeGeometry(3.3, 5.5, 4), new THREE.MeshStandardMaterial({ color: 0xa9573a, roughness: 0.8 }));
    troof.rotation.y = Math.PI / 4;
    troof.position.set(-40, ch + 27.2, -175);
    for (const m of [tower, belfry, troof]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  _foliageMaterial() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
          #else
          vec2 ip = vec2(0.0);
          #endif
          float hgt = max(0.0, position.y);
          float sway = sin(uTime * 1.1 + ip.x * 0.11 + ip.y * 0.07) * 0.6 + sin(uTime * 2.3 + ip.x * 0.37) * 0.25;
          transformed.x += sway * hgt * hgt * 0.0016;
          transformed.z += sway * hgt * hgt * 0.0009;`);
    };
    mat.customProgramCacheKey = () => 'foliage';
    return mat;
  }

  _vegetation() {
    this.windTime = { value: 0 };
    const noise = new Simplex2(404);
    const clump = (cx, cy, cz, sx, sy, sz, amp, base, seed, light = 1.12, dark = 0.5, detail = 1) => {
      let g = new THREE.IcosahedronGeometry(1, detail);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = mergeVertices(g);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const nn = noise.noise(x * 2.1 + seed, z * 2.1 + y * 1.7) * 0.6 + noise.noise(x * 5 + seed * 2, y * 5 - z * 3) * 0.3;
        const r = 1 + nn * amp;
        x *= r; y *= r; z *= r;
        if (y < 0) y *= 0.45;
        const t = (y + 0.45) / 1.45;
        const shade = dark + (light - dark) * Math.min(1, Math.max(0, t)) + nn * 0.08;
        col[i * 3] = base[0] * shade; col[i * 3 + 1] = base[1] * shade; col[i * 3 + 2] = base[2] * shade;
        p.setXYZ(i, cx + x * sx, cy + y * sy, cz + z * sz);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    };
    const trunk = (pts, r0, r1, colr) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v)));
      const g = new THREE.TubeGeometry(curve, 8, 1, 7, false);
      const p = g.attributes.position;
      const c = new Float32Array(p.count * 3);
      // taper radius along the tube
      for (let i = 0; i < p.count; i++) {
        const seg = Math.floor(i / 8) / 8;
        const pt = curve.getPoint(Math.min(1, seg));
        const r = r0 + (r1 - r0) * seg;
        p.setXYZ(i, pt.x + (p.getX(i) - pt.x) * r, pt.y + (p.getY(i) - pt.y) * r, pt.z + (p.getZ(i) - pt.z) * r);
        c[i * 3] = colr[0]; c[i * 3 + 1] = colr[1]; c[i * 3 + 2] = colr[2];
      }
      g.deleteAttribute('uv');
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.computeVertexNormals();
      return g;
    };
    const bark = [0.33, 0.24, 0.18];
    // --- stone pine: tall bare trunk, limbs, flat umbrella crown
    const pineParts = [trunk([[0, -0.5, 0], [0.25, 4, 0.1], [0.5, 8.6, 0.2]], 0.34, 0.2, bark)];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      pineParts.push(trunk([[0.5, 8.2, 0.2], [0.5 + Math.cos(a) * 1.2, 9.4, 0.2 + Math.sin(a) * 1.2], [0.5 + Math.cos(a) * 2.4, 10.1, 0.2 + Math.sin(a) * 2.4]], 0.16, 0.07, bark));
    }
    const pineGreen = [0.085, 0.13, 0.055];
    pineParts.push(clump(0.5, 10.7, 0.2, 2.9, 1.15, 2.9, 0.22, pineGreen, 1, 1.12, 0.5, 2));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.2;
      const r = 3.0 + (k % 2) * 0.7;
      pineParts.push(clump(0.5 + Math.cos(a) * r, 10.1 + (k % 3) * 0.2, 0.2 + Math.sin(a) * r, 2.0 + (k % 3) * 0.3, 0.95, 2.0, 0.25, pineGreen, 10 + k));
    }
    const pineGeo = mergeGeometries(pineParts.map((g) => { g.deleteAttribute('uv'); return g; }));
    // --- cypress: dense flame of foliage
    const cyp = new THREE.LatheGeometry(Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      const r = Math.sin(Math.PI * Math.min(1, t * 1.08)) * (0.95 - 0.5 * t) * 1.05 + 0.02;
      return new THREE.Vector2(Math.max(0.02, r), t * 12);
    }), 10);
    cyp.deleteAttribute('uv');
    {
      const p = cyp.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const nn = noise.noise(x * 1.6 + y * 0.4, z * 1.6 - y * 0.9) * 0.5 + noise.noise(y * 2.5, x * 3) * 0.25;
        const r = 1 + nn * 0.42;
        p.setXYZ(i, x * r, y, z * r);
        const shade = 0.55 + 0.55 * (y / 12) + nn * 0.15;
        col[i * 3] = 0.06 * shade; col[i * 3 + 1] = 0.1 * shade; col[i * 3 + 2] = 0.05 * shade;
      }
      cyp.setAttribute('color', new THREE.BufferAttribute(col, 3));
      cyp.computeVertexNormals();
    }
    // --- olive: gnarled trunk, silvery rounded crown
    const olive = [0.24, 0.27, 0.17];
    const oliveParts = [trunk([[0, -0.3, 0], [0.3, 1.2, -0.2], [0, 2.2, 0.15], [0.2, 2.8, 0]], 0.3, 0.14, [0.3, 0.27, 0.22])];
    oliveParts.push(clump(0.1, 3.4, 0, 1.7, 1.2, 1.7, 0.3, olive, 3, 1.2, 0.55));
    oliveParts.push(clump(1.1, 3.0, 0.6, 1.1, 0.9, 1.1, 0.3, olive, 4, 1.2, 0.55));
    oliveParts.push(clump(-0.9, 3.1, -0.5, 1.2, 0.9, 1.2, 0.3, olive, 5, 1.2, 0.55));
    const oliveGeo = mergeGeometries(oliveParts);
    // --- macchia shrub
    const shrubGeo = mergeGeometries([
      clump(0, 0.55, 0, 0.9, 0.62, 0.9, 0.35, [0.13, 0.17, 0.08], 21),
      clump(0.65, 0.4, 0.3, 0.62, 0.46, 0.62, 0.35, [0.15, 0.18, 0.09], 22),
    ]);

    const mat = this._foliageMaterial();
    const NP = 600, NC = 260, NO = 280, NS = 7000;
    const pines = new THREE.InstancedMesh(pineGeo, mat, NP);
    const cyps = new THREE.InstancedMesh(cyp, mat, NC);
    const olives = new THREE.InstancedMesh(oliveGeo, mat, NO);
    const shrubs = new THREE.InstancedMesh(shrubGeo, mat, NS);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const rn = {};
    const T = this.terrain;
    const nearHouse = (x, z, r) => (this.housePts || []).some(([hx, hz, hr]) => Math.hypot(hx - x, hz - z) < hr + r);
    const site = (x, z, minH, maxSlope, roadGap, houseGap) => {
      const h = T.gridHeight(x, z);
      if (h < minH) return null;
      const sx = Math.abs(T.gridHeight(x + 2, z) - T.gridHeight(x - 2, z)) / 4;
      const sz = Math.abs(T.gridHeight(x, z + 2) - T.gridHeight(x, z - 2)) / 4;
      const slope = Math.max(sx, sz);
      if (slope > maxSlope) return null;
      if (x > QUAY.x0 - 4 && x < QUAY.x1 + 4 && z > QUAY.z0 - 6 && z < QUAY.z1 + 2) return null;
      road.nearest(x, z, rn);
      if (rn.d < ROAD_HALF + roadGap) return null;
      if (houseGap && nearHouse(x, z, houseGap)) return null;
      return { h: Math.min(h, T.gridHeight(x + 1, z), T.gridHeight(x - 1, z), T.gridHeight(x, z + 1), T.gridHeight(x, z - 1)), slope, road: rn.d };
    };
    let n = 0;
    for (let t = 0; t < 60000 && n < NP; t++) {
      const x = R(-1000, 1100), z = R(-600, 170);
      const s = site(x, z, 4, 0.65, 6, 4);
      if (!s) continue;
      const v = T.vegAt(x, z);
      const focus = Math.exp(-Math.hypot(x - 40, z + 120) / 520);
      if (rnd() > v * (0.35 + 0.65 * focus) * 1.4) continue;
      const k = R(0.75, 1.3);
      q.setFromAxisAngle(up, R(0, 6.3));
      pines.setMatrixAt(n, m4.compose(p.set(x, s.h - 0.2, z), q, sc.set(k * R(0.9, 1.1), k, k * R(0.9, 1.1))));
      col.setRGB(1, 1, 1).multiplyScalar(R(0.8, 1.15));
      pines.setColorAt(n, col);
      n++;
    }
    pines.count = n;
    // cypress: accents near houses and in rows along the road
    n = 0;
    for (let i = 4; i < road.n - 4 && n < NC * 0.5; i += 3) {
      const x = road.px[i], z = road.pz[i];
      if (Math.abs(x - 20) > 420 || z > -60) continue;
      if (noise.noise(i * 0.01, 3.3) < 0.25) continue;
      const side = noise.noise(i * 0.03, 7.7) > 0 ? 1 : -1;
      const ex = x - road.tz[i] * side * (ROAD_HALF + 3.2), ez = z + road.tx[i] * side * (ROAD_HALF + 3.2);
      const s = site(ex, ez, 3, 0.5, 2.5, 2);
      if (!s) continue;
      const k = R(0.8, 1.15);
      cyps.setMatrixAt(n++, m4.compose(p.set(ex, s.h - 0.3, ez), q.identity(), sc.set(k * 0.9, k, k * 0.9)));
    }
    for (let t = 0; t < 30000 && n < NC; t++) {
      const x = R(-450, 600), z = R(-420, -95);
      const s = site(x, z, 4, 0.5, 4, 3);
      if (!s) continue;
      if (rnd() > Math.exp(-Math.hypot(x - 20, z - -140) / 200)) continue;
      const k = R(0.7, 1.2);
      cyps.setMatrixAt(n++, m4.compose(p.set(x, s.h - 0.3, z), q.identity(), sc.set(k * 0.9, k, k * 0.9)));
    }
    cyps.count = n;
    // olives on the gentler slopes around the village (terraces)
    n = 0;
    for (let t = 0; t < 40000 && n < NO; t++) {
      const x = R(-500, 650), z = R(-480, -100);
      const s = site(x, z, 5, 0.42, 5, 3);
      if (!s) continue;
      if (rnd() > 0.55 * Math.exp(-Math.hypot(x - 30, z + 200) / 260)) continue;
      const k = R(0.8, 1.25);
      q.setFromAxisAngle(up, R(0, 6.3));
      olives.setMatrixAt(n, m4.compose(p.set(x, s.h - 0.15, z), q, sc.set(k, k, k)));
      col.setRGB(1, 1, 1).multiplyScalar(R(0.9, 1.15));
      olives.setColorAt(n, col);
      n++;
    }
    olives.count = n;
    // macchia ground cover
    n = 0;
    for (let t = 0; t < 90000 && n < NS; t++) {
      const wide = rnd() < 0.45;
      const x = wide ? R(-1150, 1150) : R(-550, 650), z = wide ? R(-750, 185) : R(-420, 120);
      const s = site(x, z, 2.4, 0.85, 3, 1.5);
      if (!s) continue;
      const v = T.vegAt(x, z);
      if (rnd() > 0.15 + v * 0.85) continue;
      const k = R(0.6, 1.9) * (0.7 + v * 0.6);
      q.setFromAxisAngle(up, R(0, 6.3));
      shrubs.setMatrixAt(n, m4.compose(p.set(x, s.h - 0.15, z), q, sc.set(k * R(0.9, 1.4), k * R(0.7, 1.0), k * R(0.9, 1.4))));
      col.setHSL(0.2 + R(-0.06, 0.05), R(0.15, 0.4), R(0.4, 0.6)).multiplyScalar(1.6);
      shrubs.setColorAt(n, col);
      n++;
    }
    shrubs.count = n;
    for (const m of [pines, cyps, olives, shrubs]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  _roadWalls() {
    // whitewashed stone parapets where the road runs along a drop
    const N = 2400;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stdMat(0xe8e2d6, 0.9), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < road.n - 2 && n < N; i += 2) {
      const x = road.px[i], z = road.pz[i], y = road.py[i];
      if (x > QUAY.x0 - 4 && x < QUAY.x1 + 4 && z > QUAY.z0 - 4) continue;
      const nx = -road.tz[i], nz = road.tx[i];
      for (const s of [-1, 1]) {
        const ex = x + nx * s * (ROAD_HALF + 0.5), ez = z + nz * s * (ROAD_HALF + 0.5);
        const drop = y - naturalHeight(x + nx * s * 14, z + nz * s * 14);
        if (drop < 3.5) continue;
        q.setFromAxisAngle(up, Math.atan2(road.tx[i], road.tz[i]));
        walls.setMatrixAt(n++, m4.compose(p.set(ex, y + 0.35, ez), q, sc.set(0.45, 0.75, 3.05)));
      }
    }
    walls.count = n;
    walls.castShadow = true; walls.receiveShadow = true;
    this.group.add(walls);
  }

  update(t, night, waveAt) {
    for (const b of this.boats) {
      const h = waveAt(b.x, b.z);
      const h2 = waveAt(b.x, b.z + b.L * 0.4);
      const h3 = waveAt(b.x + b.B * 0.4, b.z);
      b.g.position.y = h * 0.9 - 0.05 + Math.sin(t * 0.7 + b.phase) * 0.02;
      b.g.rotation.set((h - h2) / (b.L * 0.4) * 0.8, b.yaw, (h3 - h) / (b.B * 0.4) * 0.8 + Math.sin(t * 0.9 + b.phase) * 0.006, 'YXZ');
    }
    for (const p of this.pontoons) p.g.position.y = p.base.y + waveAt(p.base.x, p.base.z) * 0.3;
    for (const nm of this.nightMats) nm.mat.emissiveIntensity = (nm.min || 0) + (nm.max - (nm.min || 0)) * night;
    for (const l of this.lampLights) l.intensity = night * 60;
    for (const sp of this.plinthSpots) sp.intensity = smoothstep(0.15, 0.7, night) * 140;
    this.windTime.value = t;
    this.beam.rotation.y = t * 0.8;
    this.beam.material.opacity = night * 0.09;
    this.beam.visible = night > 0.05;
    if (this.turntable && this.spin) this.turntable.rotation.y = this.spin;
  }
}
