// Rigid-body vehicle dynamics for road, displacement, planing and foiling.
// - Land: 4 spring/damper wheels with a friction-circle tyre model.
// - Water: distributed buoyancy columns sampled against the actual Gerstner
//   surface (so waves pitch and roll the car), anisotropic hull drag with
//   orbital water velocity, planing lift, vectored pod thrust and actively
//   controlled hydrofoils with ventilation near the surface.
import * as THREE from 'three';
import { clamp, smoothstep, lerp } from '../util/noise.js';

const RHO = 1025, G = 9.81;
const _f = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _m = new THREE.Matrix3(), _q = new THREE.Quaternion(), _w3 = new THREE.Vector3();
const _ws = { height: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0 };

export class VehiclePhysics {
  constructor(car, terrain, waves) {
    this.car = car; this.terrain = terrain; this.waves = waves;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.time = 0;
    this.input = { throttle: 0, steer: 0, brake: 0, handbrake: 0, boost: 0 };
    this.steerSmoothed = 0;
    this.telemetry = { speed: 0, fwdSpeed: 0, submerged: 0, floating: false, grounded: 0, waterDepth: 0, ride: 0, foilborne: false, power: 0, thrust: 0, heading: 0, pitch: 0, roll: 0 };
    this.events = []; // splash events for FX
    this.foilCL = [0, 0, 0, 0];
    this.wheelSpin = [0, 0, 0, 0];
    this.suspPrev = [0, 0, 0, 0];
    this.susp = [0, 0, 0, 0];
    this.setCar(car);
  }

  setCar(car) {
    this.car = car;
    const d = car.design;
    this.mass = d.mass;
    const L = d.body.z1 - d.body.z0;
    this.inertia = new THREE.Vector3(this.mass / 12 * (1.2 * 1.2 + L * L), this.mass / 12 * (4 + L * L), this.mass / 12 * (4 + 1.44));
    this.com = car.com.clone();
    // hull buoyancy columns (car-local, ground origin)
    const shape = car.body.shape;
    this.hull = [];
    const NU = 11, NX = 4;
    for (let i = 0; i < NU; i++) {
      const u = 0.035 + (0.93 * (i + 0.5)) / NU;
      const hw = shape.hw(u) * 0.92;
      const yb = shape.yb(u);
      const yt = Math.min(shape.yt(u), 0.95);
      const dz = (L * 0.93) / NU;
      for (let j = 0; j < NX; j++) {
        const xn = -1 + (2 * (j + 0.5)) / NX;
        const x = xn * hw;
        // bottom rises toward the sides (superellipse bilge)
        const bilge = Math.pow(Math.abs(xn), 4) * 0.12;
        this.hull.push({ local: new THREE.Vector3(x, yb + bilge, shape.zOf(u)), area: dz * (2 * hw / NX), height: Math.max(0.1, yt - yb - bilge), side: dz * 0.5, front: (2 * hw / NX) * 0.5 });
      }
    }
    this.hullVolume = this.hull.reduce((s, h) => s + h.area * h.height, 0);
    // collision probes around the lower body
    this.probes = [];
    for (const u of [0.02, 0.2, 0.5, 0.8, 0.98]) {
      const hw = shape.hw(u) * 0.85;
      for (const x of u === 0.02 || u === 0.98 ? [0] : [-hw, hw]) this.probes.push(new THREE.Vector3(x, shape.yb(u) + 0.02, shape.zOf(u)));
    }
    const W = d.wheels;
    this.wheels = [
      { x: W.trackF / 2, z: W.zf, front: true }, { x: -W.trackF / 2, z: W.zf, front: true },
      { x: W.trackR / 2, z: W.zr, front: false }, { x: -W.trackR / 2, z: W.zr, front: false },
    ];
    this.wheelR = W.r;
    this.restLen = 0.2; // suspension travel window above the wheel centre
    this.c0 = 0.075; // static compression
    this.k = (this.mass * G / 4) / this.c0;
    this.c = 2 * 0.38 * Math.sqrt(this.k * this.mass / 4);
  }

  // place the car at a world position/heading resting on the ground
  reset(position, heading = 0) {
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const g = this.terrain.groundHeight(position.x, position.z);
    this.pos.set(position.x, Math.max(g, position.y ?? g) + this.com.y + 0.02, position.z);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
  }

  toWorld(local, out) {
    // car-local (ground origin) -> world
    return out.copy(local).sub(this.com).applyQuaternion(this.quat).add(this.pos);
  }

  waterAt(x, z, out = _ws) {
    const wi = this.terrain.waterInfo(x, z);
    this.waves.sample(x, z, this.time, wi.y, out);
    out.seabed = wi.x;
    return out;
  }

  step(dt, rig) {
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this._substep(h, rig);
    // telemetry
    const fwd = _a.set(0, 0, 1).applyQuaternion(this.quat);
    const T = this.telemetry;
    T.speed = this.vel.length();
    T.fwdSpeed = this.vel.dot(fwd);
    T.heading = ((Math.atan2(fwd.x, fwd.z) * 180) / Math.PI + 360) % 360;
    const up = _b.set(0, 1, 0).applyQuaternion(this.quat);
    T.pitch = Math.asin(clamp(fwd.y, -1, 1));
    T.roll = Math.asin(clamp(-_n.set(1, 0, 0).applyQuaternion(this.quat).y, -1, 1));
    void up;
    rig.wheelSpin = this.wheelSpin;
    rig.susp = this.susp;
    rig.flap = this.foilCL.map((c) => clamp((c - 0.35) * 1.2, -1, 1));
  }

  _substep(dt, rig) {
    this.time += dt;
    const m = this.mass;
    const q = this.quat;
    const right = _f.set(1, 0, 0).applyQuaternion(q).clone();
    const up = _f.set(0, 1, 0).applyQuaternion(q).clone();
    const fwd = _f.set(0, 0, 1).applyQuaternion(q).clone();
    const F = new THREE.Vector3(0, -m * G, 0);
    const T = new THREE.Vector3();
    const dbg = this.debug ? (this.dbg = this.dbg || {}) : null;
    let cat = 'other';
    const addForce = (f, at) => {
      F.add(f);
      _r.subVectors(at, this.pos);
      _t.crossVectors(_r, f);
      T.add(_t);
      if (dbg) dbg[cat] = (dbg[cat] || 0) + _t.dot(right);
    };
    const pointVel = (at, out) => {
      _r.subVectors(at, this.pos);
      return out.crossVectors(this.angVel, _r).add(this.vel);
    };
    const inp = this.input;
    const steerRate = rig.s.impeller > 0.6 ? lerp(5, 1.6, smoothstep(6, 16, Math.abs(this.telemetry.fwdSpeed || 0))) : 6;
    this.steerSmoothed += (inp.steer - this.steerSmoothed) * Math.min(1, dt * steerRate);
    const steer = this.steerSmoothed;
    rig.steer = steer;
    const s = rig.s;
    const roadMode = s.arm < 0.25;
    const marine = s.impeller > 0.6;
    const vF = this.vel.dot(fwd);
    const speed = this.vel.length();
    const tel = this.telemetry;

    // ------------------------------------------------ land wheels
    let grounded = 0;
    if (roadMode) {
      const maxSteer = lerp(0.55, 0.12, smoothstep(5, 60, Math.abs(vF)));
      const drive = inp.throttle * (inp.boost ? 1.35 : 1);
      const power = 900000 * (inp.boost ? 1.25 : 1);
      const engineF = Math.min(m * 1.15 * G, power / Math.max(4, Math.abs(vF)));
      for (let i = 0; i < 4; i++) {
        const w = this.wheels[i];
        const attach = _p.set(w.x, this.wheelR + this.restLen, w.z);
        const A = this.toWorld(attach, new THREE.Vector3());
        const gy = this.terrain.groundHeight(A.x, A.z);
        const upY = Math.max(0.3, up.y);
        const dist = (A.y - gy) / upY; // along -up
        const maxLen = this.restLen + this.wheelR + this.c0; // spring preload at design ride height
        let comp = maxLen - dist;
        if (comp > 0) {
          grounded++;
          comp = Math.min(comp, 0.32);
          const compRate = (comp - this.suspPrev[i]) / dt;
          this.suspPrev[i] = comp;
          let Fs = this.k * comp + this.c * compRate;
          Fs = Math.max(0, Fs);
          const contact = A.clone().addScaledVector(up, -dist);
          this.terrain.groundNormal(contact.x, contact.z, _n);
          addForce(_n.clone().multiplyScalar(Fs), contact);
          // tyre forces
          const sa = w.front ? steer * maxSteer : 0;
          const wf = fwd.clone().applyAxisAngle(up, sa);
          const wl = new THREE.Vector3().crossVectors(up, wf).normalize();
          const vc = pointVel(contact, new THREE.Vector3());
          const vf = vc.dot(wf), vl = vc.dot(wl);
          const mu = 1.25;
          const N = Fs;
          let Fl = -mu * N * clamp(vl / (Math.abs(vf) * 0.09 + 0.35), -1, 1);
          let Fl2 = drive * engineF / 4;
          if (inp.brake > 0 || (Math.sign(inp.throttle) !== Math.sign(vf) && Math.abs(vf) > 0.5 && inp.throttle !== 0)) {
            const b = Math.max(inp.brake, Math.abs(inp.throttle));
            Fl2 = -Math.sign(vf) * b * m * G * 1.1 / 4;
            if (inp.brake > 0 && Math.abs(vf) < 0.5) Fl2 = -vf * N * 0.5;
          }
          if (inp.handbrake && !w.front) { Fl2 = -Math.sign(vf) * mu * N * 0.8; Fl *= 0.35; }
          Fl2 -= vf * 12; // rolling resistance
          // friction circle
          const mag = Math.hypot(Fl, Fl2), lim = mu * N * 1.05;
          if (mag > lim) { Fl *= lim / mag; Fl2 *= lim / mag; }
          addForce(wl.multiplyScalar(Fl).add(wf.multiplyScalar(Fl2)), contact);
          this.susp[i] = comp - this.c0;
          this.wheelSpin[i] += (vf / this.wheelR) * dt;
        } else {
          this.suspPrev[i] = 0;
          this.susp[i] = Math.max(-0.12, this.susp[i] - dt * 0.5);
          this.wheelSpin[i] += drive * 30 * dt;
        }
      }
    } else {
      // pods spin with thrust
      for (let i = 0; i < 4; i++) this.wheelSpin[i] += (inp.throttle * 55 + vF * 0.5) * dt * clamp(s.impeller, 0, 1);
      for (let i = 0; i < 4; i++) this.susp[i] *= 0.95;
    }
    tel.grounded = grounded;

    // aero
    const v2 = speed * speed;
    if (speed > 0.1) addForce(this.vel.clone().multiplyScalar(-0.5 * 1.2 * 0.72 * speed), this.pos);
    if (roadMode && grounded) addForce(up.clone().multiplyScalar(-0.5 * 1.2 * 1.1 * vF * vF), this.pos);

    // ------------------------------------------------ water
    let subVol = 0, subX = 0, subY = 0, subZ = 0, wetPoints = 0;
    const nearWater = this.pos.y < 3.5;
    if (nearWater) {
      const W = _ws;
      for (const hp of this.hull) {
        const P = this.toWorld(hp.local, _p);
        this.waterAt(P.x, P.z, W);
        const depth = W.height - P.y;
        if (depth <= 0) continue;
        if (W.seabed > P.y + 0.05 && W.seabed > W.height - 0.05) continue;
        const d = Math.min(depth, hp.height);
        const frac = d / hp.height;
        const vol = hp.area * d;
        subVol += vol;
        wetPoints++;
        const C = P.clone().addScaledVector(up, d * 0.5);
        subX += C.x * vol; subY += C.y * vol; subZ += C.z * vol;
        cat = 'buoy';
        // buoyancy acts along gravity's opposite
        addForce(new THREE.Vector3(0, RHO * G * vol, 0), C);
        // anisotropic drag relative to the orbital water motion
        const vp = pointVel(C, _v).sub(_a.set(W.vx, W.vy, W.vz));
        const vx = vp.dot(right), vy = vp.dot(up), vz = vp.dot(fwd);
        const fx = -0.5 * RHO * 1.0 * hp.side * hp.height * frac * vx * Math.abs(vx) - (60 + 22 * Math.abs(vz)) * frac * vx;
        const fy = -0.5 * RHO * 1.1 * hp.area * vy * Math.abs(vy) * Math.min(1, frac * 3) - 1600 * hp.area * vy * Math.min(1, frac * 4);
        const fz = -10 * frac * vz;
        cat = 'hulldrag';
        // planing lift: dynamic pressure on the wetted bottom
        const plan = vz > 0.5 ? 0.5 * RHO * vz * vz * hp.area * 0.012 * Math.min(1, frac * 2.5) : 0;
        addForce(right.clone().multiplyScalar(fx).addScaledVector(up, fy + plan).addScaledVector(fwd, fz), C);
      }
      cat = 'sponson';
      // sponsons
      for (let j = 0; j < 2; j++) {
        const dep = s.sponson;
        if (dep < 0.7) continue;
        const sp = this.car.body.sponsons[j];
        const c = sp.pivot.position;
        for (let k = -2; k <= 2; k++) {
          const local = _n.set(c.x, c.y - 0.15, c.z + k * 0.36);
          const P = this.toWorld(local, _p);
          this.waterAt(P.x, P.z, W);
          const depth = W.height - P.y;
          if (depth <= 0) continue;
          const d = Math.min(depth, 0.3);
          const vol = 0.42 * 0.36 * d;
          subVol += vol * 0.6;
          addForce(new THREE.Vector3(0, RHO * G * vol, 0), P);
          const vp = pointVel(P, _v).sub(_a.set(W.vx, W.vy, W.vz));
          const vy = vp.dot(up), vx = vp.dot(right);
          addForce(up.clone().multiplyScalar(-0.5 * RHO * 0.9 * 0.15 * vy * Math.abs(vy) - 300 * vy).addScaledVector(right, -0.5 * RHO * 0.3 * 0.1 * vx * Math.abs(vx)), P);
        }
      }
    }
    tel.submerged = subVol / Math.max(0.01, this.hullVolume);
    tel.subVol = subVol;
    if (subVol > 0.001) {
      // global hull resistance (skin + wave-making), scaled by wetted volume
      // Resistance is applied just below the centre of mass on the centreline.
      // (Applying it at the wetted centroid made a buried bow pull itself
      // further under — a runaway "submarining" moment.)
      const C = this.pos.clone().addScaledVector(up, -0.12);
      const vRef = (this.mass / RHO);
      const wet = Math.pow(Math.min(2, subVol / vRef), 0.66);
      const hump = 1 + 0.5 * Math.exp(-Math.pow((Math.abs(vF) - 7) / 3.5, 2));
      const R = 0.5 * RHO * vF * Math.abs(vF) * 0.15 * wet * hump + vF * 220 * wet;
      cat = 'resist';
      addForce(fwd.clone().multiplyScalar(-R), C);
      // yaw damping (keel effect) + roll damping
      T.addScaledVector(up, -this.angVel.dot(up) * 6500 * wet);
      T.addScaledVector(fwd, -this.angVel.dot(fwd) * 3600 * wet);
      T.addScaledVector(right, -this.angVel.dot(right) * 9000 * wet);
    }

    // ------------------------------------------------ propulsion pods + foils
    let thrustTotal = 0, thrustPitch = 0, podRoll = 0;
    const podEff = clamp((s.impeller - 0.6) / 0.4, 0, 1);
    if (podEff > 0 || s.foil > 0) {
      const Tmax = 2050 * (inp.boost ? 1.3 : 1);
      for (let i = 0; i < 4; i++) {
        rig.podLocal(i, _a);
        const P = this.toWorld(_a, new THREE.Vector3());
        const W = this.waterAt(P.x, P.z);
        const depth = W.height - P.y;
        const eff = clamp((depth + 0.15) / 0.35, 0, 1);
        const c = rig.corners[i];
        const front = i < 2;
        const vecA = (front ? 1 : -1) * steer * lerp(0.32, 0.018, smoothstep(3, 16, Math.abs(vF)));
        const dir = fwd.clone().applyAxisAngle(up, vecA);
        // differential thrust assists turning at low speed
        const sideSign = c.side;
        const diff = 1 + steer * 0.25 * sideSign * (inp.throttle >= 0 ? -1 : 1);
        let thr = inp.throttle * (inp.throttle < 0 ? 0.5 : 1) * Tmax * eff * podEff * diff;
        // thrust falls with speed (fixed power)
        thr *= clamp(1.15 - Math.abs(vF) / 60, 0.5, 1);
        thrustTotal += Math.abs(thr);
        thrustPitch += thr * (this.com.y - _a.y); // low thrust line pitches the nose up
        cat = 'thrust';
        if (thr) addForce(dir.multiplyScalar(thr), P);
        cat = 'pod';
        // pod + strut drag & lateral grip in the water: struts/pods act as
        // lifting surfaces in sideslip (linear in v_fwd * v_lat), rear pods
        // carry more area so the craft weathervanes into its track
        if (depth > -0.3) {
          const wetF = clamp((depth + 0.3) / 0.6, 0, 1) * podEff;
          const vp = pointVel(P, _v);
          // lateral axis of the (vectored) pod: a yawed pod meets the flow at
          // an angle and makes rudder lift
          const podRight = right.clone().applyAxisAngle(up, vecA);
          const vx = vp.dot(podRight), vz = vp.dot(fwd), vy = vp.dot(up);
          const kLat = (front ? 330 : 560) * (1 + s.ride * 0.8);
          const fx = (-0.5 * RHO * 0.12 * vx * Math.abs(vx) - kLat * vx * Math.max(Math.abs(vz), 1.5)) * wetF;
          const fz = -0.5 * RHO * 0.006 * vz * Math.abs(vz) * wetF;
          const fy = -0.5 * RHO * 0.12 * vy * Math.abs(vy) * wetF;
          const latF = podRight.multiplyScalar(fx);
          podRoll += _w3.crossVectors(_r.subVectors(P, this.pos), latF).dot(fwd);
          addForce(latF.addScaledVector(fwd, fz).addScaledVector(up, fy), P);
          thrustPitch += fz * (this.com.y - _a.y);
        }
      }
    }
    // ------------------------------------------------ hydrofoils: central flight controller
    // Total lift holds the commanded ride height (weight feed-forward minus
    // measured buoyancy), and pitch/roll moments are distributed fore/aft and
    // port/starboard. Each foil's C_L saturates at low speed, so takeoff is natural.
    if (s.foil <= 0.2) this.pitchI = this.rollI = 0;
    if (s.foil > 0.2) {
      const foils = [];
      let zf = 0, zr = 0, lx = 0;
      for (let i = 0; i < 4; i++) {
        rig.foilLocal(i, _a);
        const zl = _a.z - this.com.z, xl = _a.x - this.com.x;
        const Pf = this.toWorld(_a, new THREE.Vector3());
        const Wf = this.waterAt(Pf.x, Pf.z);
        const fd = Wf.height - Pf.y;
        const vp = pointVel(Pf, _v);
        const vfwd = Math.max(0, vp.dot(fwd));
        const q0 = 0.5 * RHO * vfwd * vfwd * 0.13 * s.foil;
        const vent = smoothstep(-0.02, 0.22, fd);
        foils.push({ Pf, q0, vent, front: i < 2, left: rig.corners[i].side > 0, ly: _a.y });
        if (i < 2) zf += zl / 2; else zr += zl / 2;
        lx += Math.abs(xl) / 4;
      }
      const h = tel.rideFilt ?? tel.ride ?? -0.2;
      const B = RHO * G * subVol;
      const hT = lerp(-0.12, 0.48, s.ride);
      const Ltot = clamp(m * G - B + m * (5 * (hT - h) - 3.4 * this.vel.y), 0, m * G * 1.45);
      const theta = Math.asin(clamp(fwd.y, -1, 1));
      const qRate = -this.angVel.dot(right);
      this.pitchI = clamp((this.pitchI || 0) + (0.02 - theta) * dt, -0.3, 0.3);
      const dPitch = this.inertia.x * (12 * (0.02 - theta) - 6.5 * qRate + 5 * this.pitchI) - thrustPitch - (this.foilDragPitch || 0);
      const bankL = -right.y;
      const pRate = -this.angVel.dot(fwd);
      const bankT = steer * 0.16 * smoothstep(8, 20, vF);
      this.rollI = clamp((this.rollI || 0) + (bankT - bankL) * dt, -0.3, 0.3);
      const dRoll = this.inertia.z * (1 + s.sponson * 0.6) * (30 * (bankT - bankL) - 9 * pRate + 12 * this.rollI) + podRoll;
      const lever = Math.max(0.5, zf - zr);
      const Lf = Ltot * (-zr) / lever + dPitch / lever;
      const Lr = Ltot - Ltot * (-zr) / lever - dPitch / lever;
      let k = 0;
      let fdp = 0;
      for (const f of foils) {
        const Li = (f.front ? Lf : Lr) / 2 + (f.left ? -1 : 1) * dRoll / (4 * Math.max(0.4, lx));
        const cmd = clamp(Li / Math.max(f.q0, 1), -0.1, 1.1);
        this.foilCL[k] += (cmd - this.foilCL[k]) * Math.min(1, dt * 15);
        const L = f.q0 * this.foilCL[k] * f.vent;
        const Dr = f.q0 * (0.012 + this.foilCL[k] * this.foilCL[k] * 0.045) * f.vent;
        addForce(up.clone().multiplyScalar(L).addScaledVector(fwd, -Dr), f.Pf);
        fdp += -Dr * (this.com.y - f.ly);
        k++;
      }
      this.foilDragPitch = fdp;
    }
    tel.thrust = thrustTotal;

    // marine paddling when floating but not transformed (wheels churn)
    if (!marine && tel.submerged > 0.25 && !grounded) {
      addForce(fwd.clone().multiplyScalar(inp.throttle * 1400), this.pos);
      T.addScaledVector(up, steer * 900 * Math.sign(vF || 1));
    }
    // rudder-like yaw from vectored pods at speed
    if (marine && podEff > 0) {
      // vectored pods act as rudders at speed and as azimuth thrusters at rest
      T.addScaledVector(up, steer * podEff * 1700 * (1 - smoothstep(1, 5, Math.abs(vF))));
      T.addScaledVector(up, -this.angVel.dot(up) * 2200 * podEff);
    }

    // ------------------------------------------------ terrain collisions (hull + pods)
    const probes = this.probes.slice();
    if (!roadMode) for (let i = 0; i < 4; i++) probes.push(rig.podLocal(i, new THREE.Vector3()).add(_n.set(0, -this.wheelR * 0.9, 0)));
    for (const lp of probes) {
      const P = this.toWorld(lp, new THREE.Vector3());
      const gy = this.terrain.groundHeight(P.x, P.z);
      const pen = gy - P.y;
      if (pen > 0) {
        this.terrain.groundNormal(P.x, P.z, _n);
        const vp = pointVel(P, _v);
        const vn = vp.dot(_n);
        const fn = Math.max(0, 3.2e5 * Math.min(pen, 0.4) - 1.6e4 * vn);
        const vt = vp.clone().addScaledVector(_n, -vn);
        const ft = vt.multiplyScalar(-Math.min(fn * 0.6, 4000) / Math.max(0.3, vt.length()));
        addForce(_n.clone().multiplyScalar(fn).add(ft), P);
      }
    }

    // ------------------------------------------------ integrate
    this.vel.addScaledVector(F, dt / m);
    // angular: transform torque to body frame, divide by inertia
    const qi = _q.copy(q).invert();
    const Tb = T.applyQuaternion(qi);
    const wb = this.angVel.clone().applyQuaternion(qi);
    const I = this.inertia;
    // ponton outriggers widen roll inertia when deployed
    const Iz = I.z * (1 + s.sponson * 0.6);
    const Lb = new THREE.Vector3(wb.x * I.x, wb.y * I.y, wb.z * Iz);
    const gyro = new THREE.Vector3().crossVectors(wb, Lb);
    wb.x += ((Tb.x - gyro.x) / I.x) * dt;
    wb.y += ((Tb.y - gyro.y) / I.y) * dt;
    wb.z += ((Tb.z - gyro.z) / Iz) * dt;
    this.angVel.copy(wb.applyQuaternion(q));
    this.angVel.multiplyScalar(1 - dt * 0.05);
    this.pos.addScaledVector(this.vel, dt);
    const w = this.angVel;
    const dq = new THREE.Quaternion(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0).multiply(q);
    q.x += dq.x; q.y += dq.y; q.z += dq.z; q.w += dq.w;
    q.normalize();

    // ------------------------------------------------ status
    const wc = this.waterAt(this.pos.x, this.pos.z);
    tel.waterDepth = wc.height - wc.seabed;
    tel.waterLevel = wc.height;
    tel.seabed = wc.seabed;
    tel.floating = tel.submerged > 0.12 && grounded === 0;
    const bottom = this.toWorld(_p.set(0, this.car.body.shape.yb(0.5), 0), new THREE.Vector3());
    tel.ride = bottom.y - wc.height;
    // platforming: the flight controller follows a low-passed sea surface
    this.wlFilt = this.wlFilt === undefined ? wc.height : this.wlFilt + (wc.height - this.wlFilt) * Math.min(1, dt * 1.2);
    tel.rideFilt = bottom.y - this.wlFilt;
    tel.foilborne = s.foil > 0.5 && tel.ride > 0.12 && subVol < 0.05;
    tel.power = clamp(Math.abs(inp.throttle) * (0.6 + 0.4 * (inp.boost ? 1 : 0)), 0, 1);
  }
}
