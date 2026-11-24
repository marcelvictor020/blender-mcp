// Transformation rig: wheel corner modules on 3-stage telescopic arms,
// sponson deployment linkages, pod foils, opening panels and the master
// land <-> marine sequence. Everything is driven by scalar states so the
// sequence can be paused, scrubbed and reversed at any point.
import * as THREE from 'three';
import { WheelAssembly, Strut, Hose } from './wheel.js';
import { clamp, lerp, seg } from '../util/noise.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function box(w, h, d, mat, r = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function airfoilShape(chord, thick) {
  const s = new THREE.Shape();
  const n = 16;
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = i / n;
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
    const camber = 0.03 * thick * 10 * Math.sin(Math.PI * x);
    top.push([x, camber + yt]); bot.push([x, camber - yt]);
  }
  // leading edge at +x (chord runs from +chord/2 at LE to -chord/2 at TE)
  const P = (x, y) => [chord / 2 - x * chord, y * chord];
  s.moveTo(...P(top[0][0], top[0][1]));
  for (let i = 1; i <= n; i++) s.lineTo(...P(top[i][0], top[i][1]));
  for (let i = n; i >= 0; i--) s.lineTo(...P(bot[i][0], bot[i][1]));
  return s;
}

function wingGeometry(chord, thick, span, taper = 1) {
  const g = new THREE.ExtrudeGeometry(airfoilShape(chord, thick), { depth: span, bevelEnabled: false, steps: 4, curveSegments: 4 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / span;
    const s = 1 - (1 - taper) * t;
    p.setX(i, p.getX(i) * s - (1 - s) * chord * 0.15);
    p.setY(i, p.getY(i) * s);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ corner
class Corner {
  constructor(M, design, front, side) {
    const W = design.wheels;
    this.front = front; this.side = side;
    this.track = front ? W.trackF : W.trackR;
    this.r = W.r;
    this.root = new THREE.Group();
    this.root.position.z = front ? W.zf : W.zr;
    this.root.scale.x = side;
    this.root.name = (front ? 'F' : 'R') + (side > 0 ? 'L' : 'R');

    const S = (this.S = new THREE.Vector3(0.14, 0.44, 0));
    this.Kland = new THREE.Vector3(this.track / 2 - 0.17, W.r, 0);
    this.Kctrl = new THREE.Vector3(this.track / 2 + 0.16, 0.44, 0);
    this.Kmarine = new THREE.Vector3(1.2, -0.04, 0);
    this.Kfoil = new THREE.Vector3(1.13, -0.72, 0);
    this.K = this.Kland.clone();

    // pivot housing on the central spine
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 24), M.darkTitanium);
    housing.rotation.x = Math.PI / 2;
    housing.position.copy(S);
    this.root.add(housing);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), M.titanium);
    flange.rotation.x = Math.PI / 2;
    flange.position.copy(S).add(new THREE.Vector3(0, 0, 0.1));
    this.root.add(flange);

    // three-stage telescopic arm
    this.arm = new THREE.Group();
    this.arm.position.copy(S);
    this.root.add(this.arm);
    const outer = box(0.4, 0.12, 0.13, M.forged);
    outer.geometry.translate(0.2, 0, 0);
    const outerRib = box(0.36, 0.02, 0.15, M.darkTitanium);
    outerRib.geometry.translate(0.2, 0.065, 0);
    this.arm.add(outer, outerRib);
    this.mid = box(0.6, 0.095, 0.105, M.titanium);
    this.mid.geometry.translate(0.3, 0, 0);
    this.inner = box(0.6, 0.072, 0.082, M.chrome);
    this.inner.geometry.translate(0.3, 0, 0);
    this.arm.add(this.mid, this.inner);

    // knuckle / hub carrier / motor pod
    this.knuckle = new THREE.Group();
    this.root.add(this.knuckle);
    const kp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 20), M.titanium);
    this.knuckle.add(kp);
    const upright = box(0.07, 0.3, 0.12, M.forged);
    upright.position.set(0.06, 0, 0);
    this.knuckle.add(upright);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 32), M.darkTitanium);
    motor.rotation.z = Math.PI / 2;
    motor.position.x = 0.05;
    this.knuckle.add(motor);
    const fins = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.1, 32, 1, true), M.copper);
    fins.rotation.z = Math.PI / 2;
    fins.position.x = 0.05;
    fins.scale.set(1, 1, 1);
    this.knuckle.add(fins);
    // tail cone: telescopes aft (local -x) in marine mode
    const tcG = new THREE.CylinderGeometry(0.125, 0.03, 0.34, 32, 1);
    tcG.rotateZ(Math.PI / 2);
    tcG.translate(-0.17, 0, 0);
    this.tail = new THREE.Mesh(tcG, M.hull);
    this.tail.castShadow = true;
    this.knuckle.add(this.tail);
    const tailRing = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.006, 8, 40), M.titanium);
    tailRing.rotation.y = Math.PI / 2;
    this.tail.add(tailRing);

    // wheel
    this.wheel = new WheelAssembly(M, { r: W.r, width: front ? W.widthF : W.widthR, style: design.wheelStyle });
    this.wheel.group.position.x = 0.17;
    this.knuckle.add(this.wheel.group);

    // retractable foils (telescoping wings) below the pod
    this.foil = new THREE.Group();
    this.foil.position.set(0.06, -0.16, 0);
    this.knuckle.add(this.foil);
    const strutF = box(0.12, 0.08, 0.03, M.darkTitanium);
    strutF.position.y = 0.05;
    this.foil.add(strutF);
    const chord = design.foil.chord;
    const rootG = wingGeometry(chord * 1.15, 0.13, 0.26, 0.92);
    rootG.translate(0, 0, -0.13);
    const rootW = new THREE.Mesh(rootG, M.darkTitanium);
    rootW.castShadow = true;
    this.foil.add(rootW);
    this.wings = [];
    for (const s of [1, -1]) {
      const g = wingGeometry(chord, 0.12, design.foil.span, 0.62);
      if (s < 0) { g.scale(1, 1, -1); g.computeVertexNormals(); }
      const holder = new THREE.Group();
      holder.rotation.x = s * 0.14; // anhedral
      const wing = new THREE.Mesh(g, M.titanium);
      wing.castShadow = true;
      holder.add(wing);
      const flap = box(chord * 0.28, 0.006, design.foil.span * 0.7, M.carbon);
      flap.geometry.translate(-chord * 0.14, 0, s * design.foil.span * 0.45);
      const flapPivot = new THREE.Group();
      flapPivot.position.x = -chord * 0.36;
      flapPivot.add(flap);
      holder.add(flapPivot);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(chord * 0.09, 12, 8), M.titanium);
      tip.scale.set(4, 0.8, 1);
      tip.position.z = s * design.foil.span;
      holder.add(tip);
      this.foil.add(holder);
      this.wings.push({ s, holder, wing, flapPivot });
    }

    // hydraulic actuator with coil spring (also the active suspension)
    this.anchor = new THREE.Vector3(0.26, 0.86, 0.0);
    this.ram = new Strut(M, { barrel: 0.3, r: 0.03, rod: 0.016, spring: true });
    this.root.add(this.ram.group);
    // orange HV cable from spine to hub motor, braided hydraulic line to ram
    this.cable = new Hose(M, 0.011, 28, M.orange);
    this.hose = new Hose(M, 0.008, 20, M.braided);
    this.root.add(this.cable.mesh, this.hose.mesh);
    this.manifold = new THREE.Vector3(0.05, 0.66, front ? -0.12 : 0.12);

    this.state = { arm: 0, yaw: 0, impeller: 0, sleeve: 0, foil: 0, ride: 0, steer: 0, susp: 0, flap: 0 };
    this.spinAngle = 0;
  }

  update(st, explode) {
    const s = this.state;
    Object.assign(s, st);
    // arm path: land -> (outward) -> marine -> (down) -> foil
    const t = s.arm;
    const K = this.K;
    if (t <= 0) K.copy(this.Kland);
    else {
      // quadratic bezier through the outward control point
      const a = 1 - t;
      K.set(
        a * a * this.Kland.x + 2 * a * t * this.Kctrl.x + t * t * this.Kmarine.x,
        a * a * this.Kland.y + 2 * a * t * this.Kctrl.y + t * t * this.Kmarine.y,
        0,
      );
    }
    if (s.ride > 0) K.lerp(_v.copy(this.Kfoil), s.ride);
    K.y += s.susp * (1 - t);
    const S = this.S;
    const dx = K.x - S.x, dy = K.y - S.y;
    const L = Math.hypot(dx, dy);
    this.arm.rotation.z = Math.atan2(dy, dx);
    this.mid.position.x = clamp((L - 0.6) * 0.55, 0, 0.35);
    this.inner.position.x = L - 0.6;
    this.armLength = L;

    this.knuckle.position.copy(K);
    this.knuckle.position.x += explode * 0.5;
    // yaw into thrust axis (outer face forward), plus steering / vectoring
    const steerLand = this.front ? s.steer * 0.55 : 0;
    const vector = (this.front ? 1 : -1) * s.steer * 0.35;
    const yaw = -s.yaw * Math.PI / 2 + lerp(steerLand, vector, s.yaw) * (this.side > 0 ? 1 : -1);
    this.knuckle.rotation.y = yaw;
    this.tail.position.x = -0.2 * (1 - s.impeller) + 0.0;
    this.tail.scale.set(0.15 + 0.85 * s.impeller, 1, 1);
    this.tail.visible = s.impeller > 0.02;
    this.wheel.setMarine(s.impeller, s.sleeve);
    this.wheel.spin.rotation.x = this.spinAngle;

    // foils telescope out of the root stubs
    for (const w of this.wings) {
      w.wing.scale.z = 0.08 + 0.92 * s.foil;
      w.holder.visible = s.foil > 0.01;
      w.flapPivot.scale.z = s.foil;
      w.flapPivot.rotation.z = s.flap * 0.4;
    }
    this.foil.visible = s.impeller > 0.3 || s.foil > 0;

    // ram from chassis anchor to a point on the outer sleeve
    const ca = Math.cos(this.arm.rotation.z), sa = Math.sin(this.arm.rotation.z);
    const P = _v2.set(S.x + ca * 0.3 - sa * 0.07, S.y + sa * 0.3 + ca * 0.07, 0);
    this.ram.set(this.anchor, P);

    // cables follow the arm
    if (this._lastK === undefined || Math.abs(this._lastK - (K.x * 7 + K.y * 13 + yaw)) > 1e-4) {
      this._lastK = K.x * 7 + K.y * 13 + yaw;
      const dir = _v3.set(ca, sa, 0);
      this.cable.set(_v.copy(S).add(new THREE.Vector3(0, 0.08, 0.06)), dir, new THREE.Vector3(K.x - ca * 0.05, K.y + 0.1, 0.05), new THREE.Vector3(-ca, 0.6, 0).normalize());
      this.hose.set(this.manifold, new THREE.Vector3(1, 0.4, 0), new THREE.Vector3().copy(this.anchor), new THREE.Vector3(0, 1, 0));
    }
  }

  // world positions useful for physics/FX (car-local)
  wheelCenterLocal(out) {
    return this.wheel.group.getWorldPosition(out);
  }
}

// ------------------------------------------------------------------ sponson linkage
class SponsonLink {
  constructor(M, design, shape, sp, tilt) {
    this.sp = sp; // { side, pivot, home, length, deck }
    this.tilt = tilt;
    const S = design.sponson;
    const uc = (S.u0 + S.u1) / 2;
    this.deployed = new THREE.Vector3(sp.side * (shape.hw(uc) + S.out), S.y, sp.home.z);
    this.thickness = S.thickness;
    this.struts = [];
    this.root = new THREE.Group();
    for (const dz of [-0.48, 0.48]) {
      const strut = new Strut(M, { barrel: 0.44, r: 0.032, rod: 0.02 });
      // extra telescoping stages
      strut.stages = [0.024, 0.018].map((r) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), M.chrome);
        m.geometry.translate(0, 0.5, 0);
        strut.group.add(m);
        return m;
      });
      this.root.add(strut.group);
      const anchor = new THREE.Vector3(sp.side * 0.28, sp.home.y + 0.06, sp.home.z + dz * sp.length / 2);
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), M.darkTitanium);
      mount.position.copy(anchor);
      this.root.add(mount);
      this.struts.push({ strut, anchor, local: new THREE.Vector3(sp.deck.x, sp.deck.y, dz * sp.length / 2) });
    }
    this.value = 0;
  }

  update(t, explode) {
    const sp = this.sp;
    const home = sp.home;
    const out1 = seg(t, 0, 0.3) * 0.18;
    const k = seg(t, 0.18, 1);
    const p0 = _v.set(home.x + sp.side * out1, home.y, home.z);
    const ctrl = _v2.set(this.deployed.x, home.y + 0.06, home.z);
    const a = 1 - k;
    const x = a * a * p0.x + 2 * a * k * ctrl.x + k * k * this.deployed.x;
    const y = a * a * p0.y + 2 * a * k * ctrl.y + k * k * this.deployed.y;
    sp.pivot.position.set(x + sp.side * explode * 0.6, y - explode * 0.15, home.z);
    // rotate so the mean outer normal points straight down (deck horizontal)
    sp.pivot.rotation.z = -sp.side * (Math.PI / 2 + this.tilt) * seg(t, 0.22, 0.88);
    sp.pivot.updateMatrix();
    for (const s of this.struts) {
      const B = s.local.clone().applyMatrix4(sp.pivot.matrix);
      s.strut.set(s.anchor, B);
      // distribute extension across the stages
      const L = s.anchor.distanceTo(B);
      const dir = _v3.subVectors(B, s.anchor).normalize();
      const q = s.strut.rod.quaternion;
      let start = s.strut.barrelLen - 0.04;
      const ext = Math.max(0, L - s.strut.barrelLen);
      s.strut.stages.forEach((m, i) => {
        const seglen = Math.min(0.42, Math.max(0.02, ext - i * 0.38 + 0.04));
        m.position.copy(s.anchor).addScaledVector(dir, Math.min(start, L - 0.02));
        m.quaternion.copy(q);
        m.scale.set(1, Math.max(0.02, Math.min(seglen, L - start)), 1);
        m.visible = ext > i * 0.38;
        start += 0.38;
      });
    }
    this.root.visible = t > 0.001 || explode > 0;
  }
}

// ------------------------------------------------------------------ rig
export class Rig {
  constructor(design, body, M) {
    this.design = design;
    this.body = body;
    this.M = M;
    this.root = new THREE.Group();
    this.corners = [];
    for (const front of [true, false]) for (const side of [1, -1]) {
      const c = new Corner(M, design, front, side);
      this.corners.push(c);
      this.root.add(c.root);
    }
    this.sponsons = body.sponsons.map((sp) => {
      const link = new SponsonLink(M, design, body.shape, sp, body.sponsonTilt);
      this.root.add(link.root);
      return link;
    });
    // animated scalar states (0..1)
    this.s = {
      master: 0, sponson: 0, arm: 0, yaw: 0, impeller: 0, foil: 0, ride: 0,
      doors: 0, hood: 0, deck: 0, roof: 0, explode: 0,
    };
    this.steer = 0;
    this.susp = [0, 0, 0, 0];
    this.flap = [0, 0, 0, 0];
    this.wheelSpin = [0, 0, 0, 0];
    this.manual = false; // individual systems driven independently
  }

  // the choreographed master sequence
  applyMaster(p) {
    const s = this.s;
    s.master = p;
    s.sponson = seg(p, 0.06, 0.42);
    s.arm = seg(p, 0.28, 0.68);
    s.yaw = seg(p, 0.46, 0.76);
    s.impeller = seg(p, 0.7, 0.92);
  }

  get stage() {
    const p = this.s.master;
    if (p <= 0.001) return 'Road';
    if (p < 0.06) return 'Sealing';
    if (p < 0.3) return 'Sponsons';
    if (p < 0.5) return 'Arms';
    if (p < 0.72) return 'Pods';
    if (p < 0.999) return 'Impellers';
    return 'Marine';
  }

  update(dt) {
    const s = this.s;
    const e = s.explode;
    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      c.spinAngle = this.wheelSpin[i];
      c.update({
        arm: s.arm, yaw: s.yaw, impeller: s.impeller, sleeve: seg(s.impeller, 0.2, 1), foil: s.foil, ride: s.ride * s.arm,
        steer: this.steer, susp: this.susp[i], flap: this.flap[i],
      }, e);
    }
    for (const l of this.sponsons) l.update(s.sponson, e);

    const b = this.body;
    const lift = e * 1.05;
    b.root.position.y = lift;
    // doors
    const style = this.design.doorStyle;
    for (const d of b.doors) {
      const o = s.doors;
      let yaw = 0, pitch = 0;
      if (style === 'dihedral') { yaw = 0.62 * seg(o, 0, 0.6); pitch = 0.95 * seg(o, 0.25, 1); }
      else if (style === 'scissor') { yaw = 0.1 * seg(o, 0, 0.3); pitch = 1.25 * seg(o, 0.1, 1); }
      else { yaw = 0.5 * seg(o, 0, 0.7); pitch = 0.75 * seg(o, 0.2, 1); }
      d.pivot.rotation.set(pitch, -d.side * yaw, 0, 'YXZ');
      d.pivot.position.copy(d.hinge);
      d.pivot.position.x += d.side * e * 0.5;
      const drop = Math.max(seg(s.roof, 0, 0.22), o > 0 ? 0.05 : 0);
      d.glass.position.y = -drop * 0.3;
      d.glass.position.x = -d.side * drop * 0.03;
    }
    // hood
    const h = b.hood;
    h.pivot.rotation.x = (h.front ? 1 : -1) * h.angle * seg(s.hood, 0, 1);
    h.pivot.position.copy(h.hinge).add(_v.set(0, e * 0.45, e * 0.35));
    // roof retraction choreography (deck opens to receive the roof)
    const r = s.roof;
    const deckForRoof = seg(r, 0, 0.22) * (1 - seg(r, 0.8, 1));
    const k = b.deck;
    k.pivot.rotation.x = -(k.rear ? 1 : -1) * Math.max(k.angle * seg(s.deck, 0, 1), 0.55 * deckForRoof);
    k.pivot.position.copy(k.hinge).add(_v.set(0, e * 0.45, -e * 0.35));
    const rf = b.roof;
    const shape = b.shape;
    const du = (this.design.deck.u0 + this.design.deck.u1) / 2;
    const stowZ = shape.zOf(du) + 0.1;
    const stowY = shape.yt(du) - 0.16;
    const slide = seg(r, 0.25, 0.75);
    const lower = seg(r, 0.5, 0.82);
    rf.pivot.position.set(0, rf.home.y + 0.04 * seg(r, 0.15, 0.3) + (stowY - rf.home.y) * lower, lerp(rf.home.z, stowZ, slide));
    rf.pivot.position.y += e * 0.7;
    rf.pivot.rotation.x = 0.12 * slide;
    rf.pivot.scale.setScalar(1 - 0.06 * lower);
    // arch shields close once the wheels are out
    const shieldT = seg(s.master, 0.66, 0.86);
    for (const sh of b.shields) {
      sh.mesh.position.x = sh.side * lerp(sh.xIn, sh.xOut, shieldT);
      sh.mesh.visible = shieldT > 0.001 || e > 0;
    }
    // rear wing folds flush in marine mode
    if (b.wing) {
      const m = seg(s.master, 0, 0.2);
      b.wing.pivot.position.copy(b.wing.home);
      b.wing.pivot.position.y -= 0.13 * m;
      b.wing.pivot.rotation.x = 0.0 + 0.12 * m;
    }
  }

  // ---- queries for physics (car-local positions)
  podLocal(i, out) {
    const c = this.corners[i];
    c.root.updateMatrix();
    out.set(c.K.x + 0.0, c.K.y, 0);
    // wheel centre in corner space accounting for yaw
    const yaw = c.knuckle.rotation.y;
    out.x += Math.cos(yaw) * 0.17;
    out.z += -Math.sin(yaw) * 0.17;
    return out.applyMatrix4(c.root.matrix);
  }
  foilLocal(i, out) {
    const c = this.corners[i];
    c.root.updateMatrix();
    out.set(c.K.x, c.K.y - 0.16, 0);
    return out.applyMatrix4(c.root.matrix);
  }
  sponsonLocal(j, out) {
    return out.copy(this.sponsons[j].sp.pivot.position);
  }
}
