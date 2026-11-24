// Marina, exhibition plinth, breakwater + lighthouse, moored yachts,
// hillside village and Mediterranean vegetation (instanced).
import * as THREE from 'three';
import { QUAY, SLIPWAY, PLINTH, BREAKWATER, road, ROAD_HALF, naturalHeight } from './terrain.js';
import { BodyShape, GeoBuilder, buildShell } from '../vehicle/loft.js';
import { facadeTexture, stoneTexture, teakTextures, carbonTextures } from '../util/textures.js';
import { mulberry32, clamp, smoothstep } from '../util/noise.js';

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
    const paveTex = stoneTexture().clone();
    paveTex.repeat.set(W / 6, D / 3);
    paveTex.needsUpdate = true;
    const pave = stdMat(0xe9e1d2, 0.85, 0, { map: paveTex });
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
      lamps.setMatrixAt(li, m4.makeTranslation(x, QUAY.y + 2.1, QUAY.z1 - 4.5));
      bulbs.setMatrixAt(li, m4.makeTranslation(x, QUAY.y + 4.3, QUAY.z1 - 4.5));
      li++;
    }
    bollards.count = bi; lamps.count = li; bulbs.count = li;
    for (const m of [bollards, lamps]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.add(bulbs);
    // a handful of real lights for night time
    for (let k = 0; k < 4; k++) {
      const pl = new THREE.PointLight(0xffd8a0, 0, 26, 2);
      pl.position.set(QUAY.x0 + 40 + k * 70, QUAY.y + 4.1, QUAY.z1 - 4.5);
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
    const base = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r + 0.25, P.h, 96), new THREE.MeshPhysicalMaterial({ color: 0x101214, roughness: 0.12, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }));
    base.position.y = P.h / 2;
    base.receiveShadow = true;
    g.add(base);
    this.turntable = new THREE.Mesh(new THREE.CylinderGeometry(P.r - 0.5, P.r - 0.5, 0.02, 96), new THREE.MeshPhysicalMaterial({ color: 0x1c1f22, roughness: 0.25, metalness: 0.6, clearcoat: 1 }));
    this.turntable.position.y = P.h + 0.01;
    this.turntable.receiveShadow = true;
    g.add(this.turntable);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xcfe9ff, emissiveIntensity: 1.6 });
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
    // low stanchions with a polished rope
    const iron = stdMat(0x202124, 0.3, 0.9);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) > 0.8 && Math.cos(a) * 0 === 0 && Math.sin(a) > 0) continue; // opening toward the sea
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 12), iron);
      post.position.set(Math.cos(a) * (P.r + 1.4), 0.45, Math.sin(a) * (P.r + 1.4));
      post.castShadow = true;
      g.add(post);
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
    const tex = facadeTexture();
    // night emissive windows
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 256);
    for (let fl = 0; fl < 2; fl++) for (let k = 0; k < 2; k++) {
      if ((fl * 2 + k) % 3 === 0) continue;
      ctx.fillStyle = '#ffcf8f'; ctx.fillRect(40 + k * 120, 40 + fl * 120, 56, 70);
    }
    const em = new THREE.CanvasTexture(c);
    em.colorSpace = THREE.SRGBColorSpace;
    const wallMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0 });
    this.nightMats.push({ mat: wallMat, max: 1.2 });
    const roofMat = stdMat(0xb4603f, 0.85);
    const N = 150;
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, N);
    const roofG = new THREE.ConeGeometry(0.75, 1, 4, 1);
    roofG.rotateY(Math.PI / 4);
    roofG.translate(0, 0.5, 0);
    const roofs = new THREE.InstancedMesh(roofG, roofMat, N);
    const palette = ['#f2ebe0', '#e8c98f', '#e5a98c', '#d9a35f', '#f0dca4', '#e9b9a9', '#cf7f5c', '#f4efe7'].map((h) => new THREE.Color(h));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0, tries = 0;
    const placed = [];
    const rn = {};
    while (n < N && tries < 6000) {
      tries++;
      const x = R(-260, 300), z = R(-330, -112);
      if (x > QUAY.x0 - 6 && x < QUAY.x1 + 6 && z > QUAY.z0 - 8) continue;
      const h0 = this.terrain.gridHeight(x, z);
      if (h0 < 3 || h0 > 70) continue;
      const s1 = Math.abs(this.terrain.gridHeight(x + 4, z) - this.terrain.gridHeight(x - 4, z)) / 8;
      const s2 = Math.abs(this.terrain.gridHeight(x, z + 4) - this.terrain.gridHeight(x, z - 4)) / 8;
      if (Math.max(s1, s2) > 0.55) continue;
      road.nearest(x, z, rn);
      if (rn.d < ROAD_HALF + 7) continue;
      // cluster near the marina
      const dist = Math.hypot(x - 20, z + 120);
      if (rnd() > Math.exp(-dist / 160)) continue;
      const w = R(6, 11), d = R(6, 10), h = R(5, 10.5);
      if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + Math.max(w, d) * 0.6)) continue;
      placed.push([x, z, Math.max(w, d) * 0.6]);
      const yaw = Math.round(R(0, 4)) * (Math.PI / 2) + R(-0.25, 0.25) + Math.atan2(20 - x, -40 - z) * 0.3;
      q.setFromAxisAngle(up, yaw);
      const sink = 4;
      walls.setMatrixAt(n, m4.compose(p.set(x, h0 + (h - sink) / 2, z), q, sc.set(w, h + sink, d)));
      walls.setColorAt(n, palette[Math.floor(rnd() * palette.length)]);
      roofs.setMatrixAt(n, m4.compose(p.set(x, h0 + h - sink / 2 - 0.05 - 2 + 2, z), q, sc.set(w * 1.06 * 1.414 / 1.06, R(1.6, 2.6), d * 1.414)));
      n++;
    }
    walls.count = n; roofs.count = n;
    walls.castShadow = roofs.castShadow = true;
    walls.receiveShadow = roofs.receiveShadow = true;
    this.group.add(walls, roofs);
    // campanile
    const ch = this.terrain.gridHeight(-40, -175);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 26, 4.5), new THREE.MeshStandardMaterial({ color: 0xe7c88f, roughness: 0.85 }));
    tower.position.set(-40, ch + 11, -175);
    const troof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 4), roofMat);
    troof.rotation.y = Math.PI / 4;
    troof.position.set(-40, ch + 26.5, -175);
    tower.castShadow = troof.castShadow = true;
    this.group.add(tower, troof);
  }

  _vegetation() {
    const pineCanopy = new THREE.IcosahedronGeometry(1, 2);
    pineCanopy.scale(1, 0.36, 1);
    const pinePos = pineCanopy.attributes.position;
    for (let i = 0; i < pinePos.count; i++) {
      const y = pinePos.getY(i);
      pinePos.setY(i, y > 0 ? y * 1.1 : y * 0.4);
    }
    pineCanopy.computeVertexNormals();
    const canopyMat = stdMat(0x2f3d22, 0.9);
    const trunkMat = stdMat(0x5b4636, 0.95);
    const shrubMat = stdMat(0x3d4a28, 0.95);
    const cypMat = stdMat(0x1f2c1a, 0.9);
    const NP = 360, NC = 220, NS = 3200;
    const pines = new THREE.InstancedMesh(pineCanopy, canopyMat, NP);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.3, 1, 6), trunkMat, NP);
    const cypG = new THREE.ConeGeometry(1, 1, 10, 3);
    const cp = cypG.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i) + 0.5;
      const bulge = Math.sin(Math.PI * Math.min(1, y * 1.05)) * 0.6 + 0.4 * (1 - y);
      cp.setX(i, cp.getX(i) * bulge); cp.setZ(i, cp.getZ(i) * bulge);
    }
    cypG.computeVertexNormals();
    const cyps = new THREE.InstancedMesh(cypG, cypMat, NC);
    const shrubG = new THREE.IcosahedronGeometry(1, 1);
    const shrubs = new THREE.InstancedMesh(shrubG, shrubMat, NS);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    const rn = {};
    const ok = (x, z, minH = 3.5, maxSlope = 0.7, roadGap = 8) => {
      const h = this.terrain.gridHeight(x, z);
      if (h < minH) return null;
      const sx = Math.abs(this.terrain.gridHeight(x + 2, z) - this.terrain.gridHeight(x - 2, z)) / 4;
      const sz = Math.abs(this.terrain.gridHeight(x, z + 2) - this.terrain.gridHeight(x, z - 2)) / 4;
      if (Math.max(sx, sz) > maxSlope) return null;
      if (x > QUAY.x0 - 4 && x < QUAY.x1 + 4 && z > QUAY.z0 - 6 && z < QUAY.z1 + 2) return null;
      road.nearest(x, z, rn);
      if (rn.d < ROAD_HALF + roadGap) return null;
      return h;
    };
    let n = 0;
    for (let t = 0; t < 30000 && n < NP; t++) {
      const x = R(-900, 1000), z = R(-520, 160);
      const h = ok(x, z, 4, 0.6, 7);
      if (h === null) continue;
      if (rnd() > 0.35 + 0.65 * Math.exp(-Math.hypot(x - 40, z + 150) / 380)) continue;
      const s = R(4.5, 7.5);
      const th = R(6, 11);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R(0, 6));
      trunks.setMatrixAt(n, m4.compose(p.set(x, h + th / 2 - 0.5, z), q, sc.set(1, th, 1)));
      pines.setMatrixAt(n, m4.compose(p.set(x + R(-0.6, 0.6), h + th, z + R(-0.6, 0.6)), q, sc.set(s, s * R(0.8, 1.1), s * R(0.85, 1.15))));
      col.setHSL(0.24 + R(-0.03, 0.03), 0.35, 0.18 + R(-0.03, 0.04));
      pines.setColorAt(n, col);
      n++;
    }
    pines.count = trunks.count = n;
    n = 0;
    for (let t = 0; t < 20000 && n < NC; t++) {
      const x = R(-500, 600), z = R(-420, -90);
      const h = ok(x, z, 4, 0.5, 6);
      if (h === null) continue;
      if (rnd() > Math.exp(-Math.hypot(x - 20, z + 140) / 220)) continue;
      const hh = R(8, 15), r = hh * R(0.09, 0.12);
      cyps.setMatrixAt(n, m4.compose(p.set(x, h + hh / 2 - 0.3, z), q.identity(), sc.set(r, hh, r)));
      n++;
    }
    cyps.count = n;
    n = 0;
    for (let t = 0; t < 60000 && n < NS; t++) {
      const x = R(-1100, 1100), z = R(-700, 180);
      const h = ok(x, z, 2.2, 0.85, 4);
      if (h === null) continue;
      const s = R(0.8, 2.4);
      q.setFromEuler(new THREE.Euler(R(-0.2, 0.2), R(0, 6), R(-0.2, 0.2)));
      shrubs.setMatrixAt(n, m4.compose(p.set(x, h + s * 0.35, z), q, sc.set(s * R(1, 1.6), s * R(0.55, 0.85), s * R(1, 1.6))));
      col.setHSL(0.2 + R(-0.05, 0.05), R(0.25, 0.4), R(0.14, 0.26));
      shrubs.setColorAt(n, col);
      n++;
    }
    shrubs.count = n;
    for (const m of [pines, trunks, cyps, shrubs]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
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
    this.beam.rotation.y = t * 0.8;
    this.beam.material.opacity = night * 0.09;
    this.beam.visible = night > 0.05;
    if (this.turntable && this.spin) this.turntable.rotation.y = this.spin;
  }
}
