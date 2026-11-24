// Camera director: orbit showcase, spring chase, cockpit, underwater
// inspection and an automatic cinematic shot sequence.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, lerp } from '../util/noise.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _l = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class CameraDirector {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.06;
    this.orbit.minDistance = 2.2;
    this.orbit.maxDistance = 60;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.target.set(0, 1, 0);
    this.mode = 'orbit';
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this.chaseInit = false;
    this.look = { yaw: 0, pitch: 0, dragging: false, lx: 0, ly: 0, ret: 0 };
    this.under = { az: 0.9, el: -0.32, dist: 7.5 };
    this.cine = { shot: -1, t: 0, dur: 6.5, anchor: new THREE.Vector3(), seed: 0 };
    this.lastTarget = new THREE.Vector3();
    this.idle = 0;
    this.fov = 38;
    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => {
      this.idle = 0;
      if (this.mode === 'orbit') return;
      this.look.dragging = true; this.look.lx = e.clientX; this.look.ly = e.clientY;
      d.setPointerCapture?.(e.pointerId);
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.look.dragging) return;
      const dx = e.clientX - this.look.lx, dy = e.clientY - this.look.ly;
      this.look.lx = e.clientX; this.look.ly = e.clientY;
      if (this.mode === 'underwater') {
        this.under.az -= dx * 0.006;
        this.under.el = clamp(this.under.el + dy * 0.004, -1.2, -0.06);
      } else {
        this.look.yaw -= dx * 0.005;
        this.look.pitch = clamp(this.look.pitch - dy * 0.004, -0.8, 0.6);
        this.look.ret = 0;
      }
    });
    const end = () => { this.look.dragging = false; };
    d.addEventListener('pointerup', end);
    d.addEventListener('pointercancel', end);
    d.addEventListener('wheel', (e) => {
      this.idle = 0;
      if (this.mode === 'underwater') this.under.dist = clamp(this.under.dist * (1 + Math.sign(e.deltaY) * 0.08), 3, 18);
    }, { passive: true });
  }

  setMode(mode, carPos) {
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    this.look.yaw = 0; this.look.pitch = 0;
    this.chaseInit = false;
    this._lookInit = false;
    this.cine.shot = -1;
    if (mode === 'orbit' && carPos) {
      this.orbit.target.copy(carPos).add(_v.set(0, 0.4, 0));
      this.lastTarget.copy(carPos);
    }
    this.camera.near = mode === 'cockpit' ? 0.03 : 0.1;
    this.camera.updateProjectionMatrix();
  }

  // ctx: { car (Car), pos, quat, speed, water(x,z), ground(x,z), pinned, marine }
  update(dt, ctx) {
    const cam = this.camera;
    this.idle += dt;
    let fov = 38;
    const fwd = _f.set(0, 0, 1).applyQuaternion(ctx.quat);
    if (this.mode === 'orbit') {
      // keep the orbit centred on a moving car
      _v.subVectors(ctx.pos, this.lastTarget);
      this.orbit.target.add(_v);
      cam.position.add(_v);
      this.lastTarget.copy(ctx.pos);
      this.orbit.autoRotate = this.idle > 9;
      this.orbit.autoRotateSpeed = 0.35;
      this.orbit.update();
      fov = 32;
    } else if (this.mode === 'chase') {
      const fl = _v.set(fwd.x, 0, fwd.z).normalize();
      if (!this.look.dragging) { this.look.ret += dt; if (this.look.ret > 1.2) { this.look.yaw *= 1 - Math.min(1, dt * 2); this.look.pitch *= 1 - Math.min(1, dt * 2); } }
      fl.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.look.yaw);
      const sp = ctx.speed;
      const dist = 6.6 + Math.min(sp, 40) * 0.07;
      const h = 1.85 + Math.min(sp, 40) * 0.012 + this.look.pitch * 3;
      const desired = new THREE.Vector3().copy(ctx.pos).addScaledVector(fl, -dist);
      desired.y += h;
      if (!this.chaseInit) { this.chasePos.copy(desired); this.chaseInit = true; }
      const k = 1 - Math.exp(-dt * 4.5);
      this.chasePos.lerp(desired, k);
      this._clearSurface(this.chasePos, ctx, 0.45);
      cam.position.copy(this.chasePos);
      const look = _l.copy(ctx.pos).addScaledVector(fwd, 1.5);
      look.y += 0.7;
      if (!this._lookInit) { this.chaseLook.copy(look); this._lookInit = true; }
      this.chaseLook.lerp(look, 1 - Math.exp(-dt * 10));
      cam.lookAt(this.chaseLook);
      fov = 40 + Math.min(sp, 45) * 0.28;
    } else if (this.mode === 'cockpit') {
      const eye = ctx.car.interior.eye;
      cam.position.copy(eye);
      ctx.car.model.localToWorld(cam.position);
      if (!this.look.dragging) { this.look.ret += dt; if (this.look.ret > 2) { this.look.yaw *= 1 - Math.min(1, dt * 1.5); this.look.pitch *= 1 - Math.min(1, dt * 1.5); } }
      _e.set(this.look.pitch - 0.08, this.look.yaw + Math.PI, 0, 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.copy(ctx.quat).multiply(_q);
      fov = 64;
    } else if (this.mode === 'underwater') {
      const u = this.under;
      if (this.idle > 6) u.az += dt * 0.08;
      const target = _w.copy(ctx.pos);
      target.y -= 0.35;
      const wl = ctx.water(ctx.pos.x, ctx.pos.z);
      const ce = Math.cos(u.el), se = Math.sin(u.el);
      const p = new THREE.Vector3(Math.sin(u.az) * ce * u.dist, se * u.dist, Math.cos(u.az) * ce * u.dist).add(target);
      const wAt = ctx.water(p.x, p.z);
      if (p.y > wAt - 0.45) p.y = wAt - 0.45;
      const g = ctx.ground(p.x, p.z);
      if (p.y < g + 0.4) p.y = g + 0.4;
      cam.position.lerp(p, 1 - Math.exp(-dt * 6));
      if (cam.position.y > wAt - 0.4) cam.position.y = wAt - 0.4;
      cam.lookAt(target);
      void wl;
      fov = 52;
    } else if (this.mode === 'cinematic') {
      fov = this._cinematic(dt, ctx, fwd);
    }
    this.fov += (fov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  _clearSurface(p, ctx, margin) {
    const w = ctx.water(p.x, p.z);
    const g = ctx.ground(p.x, p.z);
    p.y = Math.max(p.y, w + margin, g + margin);
  }

  _cinematic(dt, ctx, fwd) {
    const c = this.cine;
    c.t += dt;
    const moving = ctx.speed > 3;
    const shots = moving ? ['lowFront', 'sideTrack', 'drone', 'flyby', 'rearLow', 'waterline', 'podDetail'] : ['orbitLow', 'orbitHigh', 'detailFront', 'detailSide', 'topDown'];
    if (c.shot < 0 || c.t > c.dur || (c.moving !== moving && c.t > 2.5)) {
      c.moving = moving;
      c.shot = (c.shot + 1 + Math.floor(Math.random() * 2)) % shots.length;
      c.t = 0;
      c.seed = Math.random();
      c.dur = 6 + Math.random() * 2.5;
      c.anchor.copy(ctx.pos).addScaledVector(fwd, 32 + ctx.speed * 1.6);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
      c.anchor.addScaledVector(right, (c.seed > 0.5 ? 1 : -1) * (6 + c.seed * 6));
      c.anchor.y = Math.max(ctx.water(c.anchor.x, c.anchor.z), ctx.ground(c.anchor.x, c.anchor.z)) + 1.1;
      c.name = shots[c.shot % shots.length];
    }
    const name = c.name;
    const cam = this.camera;
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const P = new THREE.Vector3();
    const L = new THREE.Vector3().copy(ctx.pos);
    const t = c.t;
    const s = c.seed > 0.5 ? 1 : -1;
    let fov = 36;
    switch (name) {
      case 'lowFront': P.copy(ctx.pos).addScaledVector(fwd, 9 - t * 0.35).addScaledVector(right, 2.4 * s); P.y = ctx.pos.y + 0.1; L.y += 0.4; fov = 30; break;
      case 'sideTrack': P.copy(ctx.pos).addScaledVector(right, 6 * s).addScaledVector(fwd, -1.5 + t * 0.3); P.y = ctx.pos.y + 0.5; L.addScaledVector(fwd, 0.6); fov = 34; break;
      case 'drone': { const a = c.seed * 6.28 + t * 0.1; P.set(ctx.pos.x + Math.sin(a) * 24, ctx.pos.y + 13, ctx.pos.z + Math.cos(a) * 24); fov = 40; break; }
      case 'flyby': P.copy(c.anchor); fov = 28 + Math.min(18, ctx.pos.distanceTo(c.anchor) * 0.3); break;
      case 'rearLow': P.copy(ctx.pos).addScaledVector(fwd, -7.5).addScaledVector(right, -1.6 * s); P.y = ctx.pos.y + 0.45; L.addScaledVector(fwd, 5); fov = 36; break;
      case 'waterline': P.copy(ctx.pos).addScaledVector(fwd, -15 + t * 0.5).addScaledVector(right, 7 * s); P.y = ctx.water(P.x, P.z) + 0.3; fov = 32; break;
      case 'podDetail': { const lp = ctx.car.rig.podLocal(s > 0 ? 0 : 1, new THREE.Vector3()); ctx.car.model.localToWorld(lp); P.copy(lp).addScaledVector(fwd, 3.4).addScaledVector(right, 2.2 * s); P.y = lp.y + 0.9; L.copy(lp); fov = 34; break; }
      case 'orbitLow': { const a = c.seed * 6.28 + t * 0.12; P.set(ctx.pos.x + Math.sin(a) * 7.5, ctx.pos.y + 0.35, ctx.pos.z + Math.cos(a) * 7.5); L.y += 0.2; fov = 32; break; }
      case 'orbitHigh': { const a = c.seed * 6.28 - t * 0.1; P.set(ctx.pos.x + Math.sin(a) * 9, ctx.pos.y + 4.2, ctx.pos.z + Math.cos(a) * 9); fov = 34; break; }
      case 'detailFront': P.copy(ctx.pos).addScaledVector(fwd, 4.2 - t * 0.15).addScaledVector(right, 1.6 * s); P.y = ctx.pos.y + 0.55; L.addScaledVector(fwd, 1.6); fov = 30; break;
      case 'detailSide': P.copy(ctx.pos).addScaledVector(right, 3.4 * s).addScaledVector(fwd, 2.4 - t * 0.5); P.y = ctx.pos.y + 0.2; L.addScaledVector(fwd, 0.4); fov = 34; break;
      case 'topDown': P.copy(ctx.pos).addScaledVector(fwd, -2.2); P.y += 11 - t * 0.4; L.addScaledVector(fwd, 0.4); fov = 34; break;
    }
    this._clearSurface(P, ctx, 0.2);
    if (name === 'flyby' || c.t < 0.05) cam.position.copy(P); else cam.position.lerp(P, 1 - Math.exp(-dt * 5));
    cam.up.set(0, 1, 0);
    cam.lookAt(L);
    return fov;
  }
}
