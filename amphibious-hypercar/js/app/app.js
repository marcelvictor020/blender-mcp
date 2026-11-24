// Application orchestrator.
import * as THREE from 'three';
import { RenderCore } from './renderer.js';
import { SkySystem } from '../env/sky.js';
import { Terrain, PLINTH, QUAY } from '../env/terrain.js';
import { WaveModel } from '../env/waves.js';
import { Ocean } from '../env/ocean.js';
import { Marina } from '../env/marina.js';
import { WakeSim } from '../fx/wake.js';
import { Spray } from '../fx/spray.js';
import { DESIGNS } from '../vehicle/designs.js';
import { Car } from '../vehicle/car.js';
import { PAINTS, FINISHES, LEATHERS, WHEEL_FINISHES, LIGHTS } from '../vehicle/materials.js';
import { drawDisplays } from '../vehicle/interior.js';
import { VehiclePhysics } from '../physics/vehicle-physics.js';
import { CameraDirector } from './cameras.js';
import { UI } from './ui.js';
import { clamp, lerp, smoothstep, seg } from '../util/noise.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const VIEW_TO_CAM = { showcase: 'orbit', drive: 'chase', cockpit: 'cockpit', underwater: 'underwater', cinematic: 'cinematic' };
const KN = 1.94384;

const SEA_ROUTE = [
  [-78, 62], [-118, 140], [-150, 230], [-40, 320], [200, 340], [430, 305], [620, 260], [780, 320],
  [620, 410], [320, 420], [40, 400], [-180, 330], [-210, 230],
];
const LAUNCH_ROUTE = [[16, -60, 7], [-30, -58, 7], [-70, -54, 5], [-70, -36, 4], [-70, -12, 4], [-70, 18, 3], [-74, 40, 4]];

export class App {
  constructor(container, opts = {}) {
    this.container = container;
    this.test = !!opts.test;
    this.time = 0;
    this.view = 'showcase';
    this.pinned = true;
    this.turntable = 1.45;
    this.spin = true;
    this.master = 0; this.seqDir = 0; this.paused = false; this.seqSpeed = 1; this.manual = false;
    this.targets = { doors: 0, hood: 0, deck: 0, roof: 0 };
    this.sysTargets = { sponson: 0, arm: 0, yaw: 0, impeller: 0, foil: 0, ride: 0 };
    this.foilOn = false; this.foilAuto = false;
    this.autoTransform = true; this.autoFoil = true;
    this.explodeTarget = 0; this.cutawayTarget = 0;
    this.labelsOn = true;
    this.dayCycle = false;
    this.hour = 17.6;
    this.keys = new Set();
    this.touch = {};
    this.floatTimer = 0; this.shallowTimer = 0;
    this.cars = [];
    this.cfgs = DESIGNS.map((d) => ({ paint: d.paint, finish: 'gloss', wheelStyle: d.wheelStyle, wheelFinish: d.wheelFinish, leather: d.leather, trim: d.trim, light: 'ice', headlights: false, ambient: true, xray: false }));
    this.designIndex = 0;
    this.tour = null;
    this.lastEnv = { hour: -1, pos: new THREE.Vector3(1e9, 0, 0), design: -1 };
    this.prevSub = 0;
  }

  async init() {
    const ui = (this.ui = new UI(this));
    ui.loading(0.05, 'Starting renderer…');
    await nextFrame();
    const core = (this.core = new RenderCore(this.container));
    this.scene = core.scene; this.camera = core.camera; this.renderer = core.renderer;
    this.sky = new SkySystem(this.renderer, this.scene);
    ui.loading(0.15, 'Shaping the coastline…');
    await nextFrame();
    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh, this.terrain.roadMesh);
    this.waves = new WaveModel();
    ui.loading(0.4, 'Filling the sea…');
    await nextFrame();
    this.ocean = new Ocean(this.renderer, this.terrain, this.waves);
    this.scene.add(this.ocean.mesh);
    this.wake = new WakeSim(this.renderer);
    this.ocean.uniforms.uWake.value = this.wake.texture;
    this.spray = new Spray(6000);
    this.scene.add(this.spray.points);
    this.ocean.hidden.push(this.spray.points);
    this._marineSnow();
    ui.loading(0.55, 'Building the marina…');
    await nextFrame();
    this.marina = new Marina(this.terrain, this.waves);
    this.scene.add(this.marina.group);
    this.fog = new THREE.FogExp2(0xc8d6dc, 0.00016);
    this.scene.fog = this.fog;
    ui.loading(0.72, 'Assembling Thalassa GT…');
    await nextFrame();
    this.car = this._getCar(0);
    this.scene.add(this.car.root);
    this.physics = new VehiclePhysics(this.car, this.terrain, this.waves);
    this.director = new CameraDirector(this.camera, this.renderer.domElement);
    core.onResize = (w, h, pr) => this.ocean.setSize(w, h, pr);
    core.resize();
    this.setHour(this.hour);
    this._placeOnPlinth();
    this.camera.position.set(PLINTH.x + 5.9, QUAY.y + 1.45, PLINTH.z - 6.3);
    this.director.setMode('orbit', this.car.root.position);
    this.director.orbit.target.set(PLINTH.x - 0.6, QUAY.y + 0.75, PLINTH.z + 0.4);
    this._bindKeys();
    ui.setDesign(0);
    ui.setView('showcase');
    this.applyConfig();
    ui.loading(0.9, 'Lighting the scene…');
    await nextFrame();
    this._captureEnv(true);
    this._labelsInit();
    this._contactShadow();
    this.clock = new THREE.Clock();
    ui.loading(1);
    this.ready = true;
    if (!this.test) this.renderer.setAnimationLoop(() => this.frame());
    else this.frame(1 / 60);
    if (!this.test) setTimeout(() => ui.toast('Drag to orbit · press Drive to take the wheel · T transforms', 4200), 900);
  }

  // ------------------------------------------------------------------ cars + config
  _getCar(i) {
    if (!this.cars[i]) this.cars[i] = new Car(DESIGNS[i]);
    return this.cars[i];
  }

  selectDesign(i) {
    if (i === this.designIndex) return;
    const old = this.car;
    const s = { ...old.rig.s };
    this.scene.remove(old.root);
    this.designIndex = i;
    this.car = this._getCar(i);
    this.scene.add(this.car.root);
    Object.assign(this.car.rig.s, s);
    this.car.rig.s.explode = old.rig.s.explode;
    this.physics.setCar(this.car);
    this.car.root.position.copy(old.root.position);
    this.car.root.quaternion.copy(old.root.quaternion);
    if (this.pinned) this._placeOnPlinth();
    this.ui.setDesign(i);
    this.applyConfig();
    this.car.M.setXray(this.cfgs[i].xray);
    this.car.setCutaway(this.cutawayTarget);
    this._labelsInit();
    if (this.envRT) this.car.setEnvMap(this.envRT.texture, 0.55 + 0.5 * (1 - this.sky.night));
    this.lastEnv.design = -1;
    this.ui.toast(DESIGNS[i].name + ' — ' + DESIGNS[i].tagline);
  }

  get cfg() { return this.cfgs[this.designIndex]; }

  applyConfig() {
    const c = this.cfg, M = this.car.M;
    M.setPaint(PAINTS.find((p) => p.id === c.paint), FINISHES.find((f) => f.id === c.finish));
    M.setLeather(LEATHERS.find((l) => l.id === c.leather));
    M.setTrim(c.trim);
    M.setWheelFinish(WHEEL_FINISHES.find((w) => w.id === c.wheelFinish));
    M.setLightColor(LIGHTS.find((l) => l.id === c.light));
    for (const corner of this.car.rig.corners) if (corner.wheel.styleId !== c.wheelStyle) corner.wheel.setStyle(c.wheelStyle);
    this.ui.syncConfig();
  }

  // ------------------------------------------------------------------ views / modes
  setView(v, quiet) {
    if (this.tour && !quiet) this.toggleTour(false);
    if (v === 'underwater' && !this._inWater()) {
      this._launchInMarina();
      this.ui.toast('Launched in the marina basin for underwater inspection');
    }
    if ((v === 'drive' || v === 'cockpit') && this.pinned) this._unpin();
    this.view = v;
    const prevCam = this.director.mode;
    this.director.setMode(VIEW_TO_CAM[v], this.car.root.position);
    if (v === 'showcase') {
      const c = this.car.root.position;
      if (this.pinned) this.director.orbit.target.set(PLINTH.x, QUAY.y + 0.85, PLINTH.z);
      if (prevCam !== 'orbit') {
        // frame the car from a flattering three-quarter view
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.root.quaternion);
        fwd.y = 0; fwd.normalize();
        const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
        this.camera.position.copy(c).addScaledVector(fwd, 5.6).addScaledVector(side, 4.2);
        this.camera.position.y = Math.max(c.y + 1.3, this._waterHeight(this.camera.position.x, this.camera.position.z) + 0.6);
        if (!this.pinned) this.director.orbit.target.copy(c).add(new THREE.Vector3(0, 0.3, 0));
        this.camera.lookAt(this.director.orbit.target);
      }
    }
    this.ui.setView(v);
  }

  _inWater() {
    if (this.pinned) return false;
    return this.physics.telemetry.submerged > 0.05 || this.physics.telemetry.foilborne;
  }

  _placeOnPlinth() {
    const r = this.car.root;
    r.position.set(PLINTH.x, QUAY.y + PLINTH.h + this.car.com.y + 0.02, PLINTH.z);
    r.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.turntable);
  }

  _unpin() {
    if (!this.pinned) return;
    this.pinned = false;
    const p = this.car.root.position;
    this.physics.reset(new THREE.Vector3(p.x, p.y - this.car.com.y, p.z), this.turntable);
    this.physics.pos.y = p.y;
    if (this.master > 0.02) { this.sequence(-1); this.ui.toast('Returning to road configuration'); }
    this.marina.setPedestal(0);
  }

  returnToPlinth() {
    this.pinned = true;
    this.physics.vel.set(0, 0, 0);
    this.physics.angVel.set(0, 0, 0);
    this._placeOnPlinth();
    if (this.view === 'showcase') this.director.setMode('orbit', this.car.root.position);
  }

  _launchInMarina() {
    this.pinned = false;
    this.marina.setPedestal(0);
    this.master = 1; this.seqDir = 0; this.manual = false;
    this.car.rig.applyMaster(1);
    const s = this.car.rig.s;
    s.sponson = s.arm = s.yaw = s.impeller = 1;
    this.physics.reset(new THREE.Vector3(-40, 0, 40), 0.15);
    this.physics.pos.y = 0.05 + this.car.com.y - 0.4;
  }

  // ------------------------------------------------------------------ sequence control
  sequence(dir) {
    if (this.tour && dir) { /* tour drives the sequence itself */ }
    this.manual = false;
    this.paused = false;
    if (dir > 0) {
      this.seqDir = 1;
      this.targets.doors = this.targets.hood = this.targets.deck = 0;
      this.targets.roof = 0;
      this.ui.syncBody();
    } else if (dir < 0) {
      this.seqDir = -1;
      this.foilOn = false;
    }
  }

  toggleTransform() {
    const goingMarine = this.seqDir > 0 || (this.seqDir === 0 && this.master > 0.5);
    this.sequence(goingMarine ? -1 : 1);
    this.ui.toast(goingMarine ? 'Reversing to road configuration' : 'Deploying marine configuration');
  }

  togglePause() {
    this.paused = !this.paused;
    this.ui.toast(this.paused ? 'Transformation paused — orbit to inspect' : 'Transformation resumed');
  }

  scrub(v) {
    this.manual = false;
    this.seqDir = 0;
    this.paused = false;
    this.master = v;
    if (v < 0.95) this.foilOn = false;
  }

  toggleFoils() {
    if (this.car.rig.s.impeller < 0.9) { this.ui.toast('Hydrofoils deploy from the pods in marine mode'); return; }
    this.foilOn = !this.foilOn;
    this.foilAuto = false;
    this.ui.toast(this.foilOn ? 'Hydrofoils extending — accelerate to take off' : 'Hydrofoils retracting');
  }

  toggleSystem(k) {
    if (!this.manual) {
      this.manual = true;
      const s = this.car.rig.s;
      for (const key of ['sponson', 'arm', 'yaw', 'impeller']) this.sysTargets[key] = s[key] > 0.5 ? 1 : 0;
    }
    if (k === 'foil') { this.foilOn = !this.foilOn; this.foilAuto = false; return; }
    if (k === 'ride') { this.manualRide = this.manualRide ? 0 : 1; return; }
    this.sysTargets[k] = this.sysTargets[k] > 0.5 ? 0 : 1;
    this.paused = false;
  }

  toggleBody(k) {
    const sp = this.pinned ? 0 : this.physics.telemetry.speed;
    if (sp > 3 && k !== 'roof') { this.ui.toast('Panels stay locked while moving'); return; }
    if (this.master > 0.05 && k !== 'roof') { this.ui.toast('Panels are sealed in marine configuration'); return; }
    this.targets[k] = this.targets[k] > 0.5 ? 0 : 1;
    this.ui.syncBody();
  }

  setExplode(v) { this.explodeTarget = v; }
  setCutaway(v) { this.cutawayTarget = v; }

  setHour(h) {
    this.hour = h;
    this.sky.setHour(h);
    const n = this.sky.night;
    this.fog.color.copy(this.sky.horizonColor);
    if (this.car) this.car.setHeadlights(this.cfg.headlights || n > 0.55, n);
  }

  setSea(v) { this.waves.setSeaState(v); }
  setClarity(v) {
    const a = this.ocean.uniforms.uAbsorb.value;
    const k = lerp(1.8, 0.55, v);
    a.set(0.46 * k, 0.12 * k, 0.085 * k);
  }
  setQuality(q) {
    this.ocean.quality = q;
    this.core.setQuality(q);
    this.sky.sun.shadow.mapSize.set(q ? 2048 : 1024, q ? 2048 : 1024);
    if (this.sky.sun.shadow.map) { this.sky.sun.shadow.map.dispose(); this.sky.sun.shadow.map = null; }
  }

  toggleTour(force) {
    const on = force !== undefined ? force : !this.tour;
    if (!on) { this.tour = null; this.ui.setTour(false); document.body.classList.remove('hide-ui'); return; }
    this.tour = { step: 0, t: 0, idx: 0 };
    this.ui.setTour(true);
    this.returnToPlinth();
    this.master = 0; this.seqDir = 0; this.manual = false;
    this.setView('cinematic', true);
    this.ui.toast('Auto tour — press any key to take over');
  }

  // ------------------------------------------------------------------ input
  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      const k = e.key.toLowerCase();
      if (this.tour && !['u'].includes(k)) this.toggleTour(false);
      this.keys.add(k);
      if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      if (k === 't') this.toggleTransform();
      if (k === 'f') this.toggleFoils();
      if (k === 'c') {
        const order = ['drive', 'cockpit', 'cinematic', 'showcase'];
        this.setView(order[(order.indexOf(this.view) + 1) % order.length]);
      }
      if (k === 'v') this.setView(this.view === 'cockpit' ? 'drive' : 'cockpit');
      if (k === 'h') { this.cfg.headlights = !this.cfg.headlights; this.applyConfig(); }
      if (k === 'r') this._resetCar();
      if (k === 'p') { this.returnToPlinth(); this.setView('showcase'); }
      if (k === 'u') document.body.classList.toggle('hide-ui');
      if (k === '1' || k === '2' || k === '3') this.selectDesign(+k - 1);
      if (['w', 'arrowup'].includes(k) && this.pinned && this.view !== 'showcase') this._unpin();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _resetCar() {
    if (this.pinned) return;
    const P = this.physics;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(P.quat);
    const heading = Math.atan2(fwd.x, fwd.z);
    const p = P.pos.clone();
    const g = this.terrain.groundHeight(p.x, p.z);
    P.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    P.vel.set(0, 0, 0); P.angVel.set(0, 0, 0);
    P.pos.y = Math.max(g + this.car.com.y + 0.5, P.pos.y + 0.3);
    this.ui.toast('Vehicle reset');
  }

  _readInput() {
    const k = this.keys, t = this.touch;
    const up = k.has('w') || k.has('arrowup') || t.throttle;
    const down = k.has('s') || k.has('arrowdown') || t.brake;
    const left = k.has('a') || k.has('arrowleft') || t.left;
    const right = k.has('d') || k.has('arrowright') || t.right;
    const inp = this.physics.input;
    const thr = (up ? 1 : 0) - (down ? 1 : 0);
    inp.throttle += (thr - inp.throttle) * 0.25;
    if (Math.abs(inp.throttle) < 0.02 && !thr) inp.throttle = 0;
    inp.steer = (left ? 1 : 0) - (right ? 1 : 0);
    inp.handbrake = k.has(' ') ? 1 : 0;
    inp.brake = k.has(' ') ? 1 : 0;
    inp.boost = k.has('shift') ? 1 : 0;
  }

  // ------------------------------------------------------------------ frame
  frame(fixedDt) {
    const dt = fixedDt || Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const P = this.physics, car = this.car, rig = car.rig, tel = P.telemetry;

    if (this.dayCycle) {
      let h = this.hour + dt * 0.04;
      if (h > 21.5) h = 5.5;
      this.setHour(h);
      if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.ui.syncHour(h);
    }

    // inputs / autopilot
    if (this.tour) this._tour(dt);
    else if (!this.pinned) this._readInput();

    this._sequencer(dt);

    // physics or plinth pose
    if (this.pinned) {
      if (this.spin && this.view === 'showcase' && !this.tour) this.turntable += dt * 0.06;
      const lift = seg(rig.s.arm, 0.05, 0.6) * 0.5 + rig.s.ride * 0.72 + seg(rig.s.sponson, 0.1, 0.4) * 0.12;
      this.marina.setPedestal(lift + 0.0001);
      this._placeOnPlinth();
      car.root.position.y += lift;
      rig.steer = Math.sin(this.time * 0.4) * 0.15 * (1 - rig.s.arm);
      for (let i = 0; i < 4; i++) { rig.susp[i] = 0; }
      P.pos.copy(car.root.position); P.quat.copy(car.root.quaternion);
      this.marina.spin = this.turntable;
    } else {
      P.time = this.time - dt;
      P.step(dt, rig);
      car.root.position.copy(P.pos);
      car.root.quaternion.copy(P.quat);
      this._autoModes(dt);
    }
    car.update(dt);
    this._updateContactShadow();

    // explode / cutaway smoothing
    const s = rig.s;
    s.explode += (this.explodeTarget - s.explode) * Math.min(1, dt * 4);
    const cut = car.cutaway + (this.cutawayTarget - car.cutaway) * Math.min(1, dt * 5);
    car.setCutaway(cut < 0.002 ? 0 : cut);

    this._fx(dt);

    // camera
    const waterAt = (x, z) => this._waterHeight(x, z);
    this.director.update(dt, {
      car, pos: car.root.position, quat: car.root.quaternion, speed: this.pinned ? 0 : tel.speed,
      water: waterAt, ground: (x, z) => this.terrain.groundHeight(x, z), pinned: this.pinned,
    });

    this._environment(dt);
    if (this.renderEnabled !== false) this._render();
    this._hud(dt);
  }

  // Advance the simulation without rendering (used by automated tests).
  sim(seconds, dt = 1 / 60) {
    this.renderEnabled = false;
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.frame(dt);
    this.renderEnabled = true;
    this.frame(dt);
  }

  _sequencer(dt) {
    const rig = this.car.rig, s = rig.s;
    if (!this.paused) {
      if (!this.manual) {
        this.master = clamp(this.master + this.seqDir * dt * this.seqSpeed / 8, 0, 1);
        if ((this.seqDir > 0 && this.master >= 1) || (this.seqDir < 0 && this.master <= 0)) this.seqDir = 0;
        const m = this.master;
        this.sysTargets.sponson = seg(m, 0.06, 0.42);
        this.sysTargets.arm = seg(m, 0.28, 0.68);
        this.sysTargets.yaw = seg(m, 0.46, 0.76);
        this.sysTargets.impeller = seg(m, 0.7, 0.92);
      }
      const rate = this.manual ? 0.32 * this.seqSpeed : 2.5;
      for (const k of ['sponson', 'arm', 'yaw', 'impeller']) {
        const d = this.sysTargets[k] - s[k];
        s[k] += clamp(d, -rate * dt, rate * dt);
      }
      // foils + ride height
      const marineReady = s.impeller > 0.92 && s.yaw > 0.95;
      const foilT = this.foilOn && marineReady ? 1 : 0;
      s.foil += clamp(foilT - s.foil, -0.5 * dt, 0.5 * dt);
      let rideT = 0;
      if (s.foil > 0.95) {
        rideT = this.pinned || this.manual ? (this.manualRide ?? (this.pinned ? 1 : 0)) : smoothstep(8, 13, this.physics.telemetry.fwdSpeed);
        if (this.pinned && this.manualRide === undefined) rideT = 1;
      }
      s.ride += clamp(rideT - s.ride, -0.35 * dt, 0.35 * dt);
      // body panels
      const rates = { doors: 0.75, hood: 0.6, deck: 0.6, roof: 0.2 };
      for (const k in rates) s[k] += clamp(this.targets[k] - s[k], -rates[k] * dt, rates[k] * dt);
    }
    if (this.manual) this.master = (s.sponson + s.arm + s.yaw + s.impeller) / 4;
    rig.s.master = this.master;
  }

  _autoModes(dt) {
    const tel = this.physics.telemetry, s = this.car.rig.s;
    if (!this.autoTransform && !this.tour) return;
    if (tel.floating && this.master < 0.5 && this.seqDir <= 0) {
      this.floatTimer += dt;
      if (this.floatTimer > 0.7) {
        this.sequence(1);
        this.ui.toast('Afloat — sealing and deploying the marine configuration');
      }
    } else this.floatTimer = 0;
    const shallow = tel.waterDepth < 1.05 && tel.seabed > -2.2;
    if (s.impeller > 0.9 && this.seqDir >= 0 && shallow && tel.fwdSpeed < 6) {
      this.shallowTimer += dt;
      if (this.shallowTimer > 0.6) {
        this.sequence(-1);
        this.ui.toast('Shallows detected — wheels deploying for the ramp');
      }
    } else this.shallowTimer = 0;
    // automatic foil deployment
    if (this.autoFoil && s.impeller > 0.95 && this.seqDir >= 0) {
      if (!this.foilOn && tel.fwdSpeed > 7.0 && tel.waterDepth > 3) { this.foilOn = true; this.foilAuto = true; this.ui.toast('14 kn — hydrofoils extending'); }
      if (this.foilOn && this.foilAuto && tel.fwdSpeed < 5) { this.foilOn = false; this.foilAuto = false; }
    }
  }

  _waterHeight(x, z) {
    const wi = this.terrain.waterInfo(x, z);
    return this.waves.heightAt(x, z, this.time, wi.y);
  }

  // ------------------------------------------------------------------ FX coupling
  _fx(dt) {
    const P = this.physics, tel = P.telemetry, car = this.car, rig = car.rig;
    const sources = [];
    const spray = this.spray;
    if (!this.pinned && P.pos.y < 4) {
      const q = P.quat;
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const v = P.vel;
      const vF = tel.fwdSpeed;
      const sp = Math.abs(vF);
      const wp = new THREE.Vector3();
      // hull pressure field (inner keel columns, every other row)
      P.hull.forEach((hp, i) => {
        const row = Math.floor(i / 4), col = i % 4;
        if (row % 2 || (col !== 1 && col !== 2)) return;
        P.toWorld(hp.local, wp);
        const wh = this._waterHeight(wp.x, wp.z);
        const d = wh - wp.y;
        if (d <= 0) return;
        const bow = row >= 8;
        sources.push({ x: wp.x, z: wp.z, r: 1.15, depth: Math.min(d, 0.45) * 0.55, foam: clamp((sp - 2) * 0.0015, 0, 0.03) * (bow ? 2 : 1), turb: 0, dx: fwd.x, dz: fwd.z });
      });
      // bow spray + mist
      const bowU = 0.84;
      const shape = car.body.shape;
      for (const side of [1, -1]) {
        const lp = new THREE.Vector3(side * shape.hw(bowU) * 0.95, shape.yb(bowU) + 0.12, shape.zOf(bowU));
        P.toWorld(lp, wp);
        const wh = this._waterHeight(wp.x, wp.z);
        const imm = clamp((wh - wp.y + 0.1) / 0.35, 0, 1);
        if (imm > 0 && sp > 2.5 && !tel.foilborne) {
          const rate = Math.pow(sp - 2.5, 1.5) * 7 * imm;
          let n = rate * dt + Math.random();
          while (n-- > 1) {
            const lat = 1.2 + sp * 0.2, upv = 1.1 + sp * 0.15;
            spray.emit(wp.x, wh + 0.05, wp.z, v.x * 0.55 + right.x * side * lat, upv, v.z * 0.55 + right.z * side * lat, 0.9, 0.16 + Math.random() * 0.12, 0, 0.8);
            if (Math.random() < 0.18) spray.emit(wp.x, wh + 0.2, wp.z, v.x * 0.4 + right.x * side * lat * 0.5, upv * 0.4, v.z * 0.4 + right.z * side * lat * 0.5, 2.4, 1.2, 1, 0.6);
          }
        }
      }
      // pods: thrust wash, bubbles, strut spray when foiling
      const thrN = tel.thrust / 8200;
      for (let i = 0; i < 4; i++) {
        if (rig.s.arm < 0.5) break;
        rig.podLocal(i, wp);
        car.model.localToWorld(wp);
        const wh = this._waterHeight(wp.x, wp.z);
        const d = wh - wp.y;
        if (d < -0.4) continue;
        const behind = wp.clone().addScaledVector(fwd, -0.6);
        sources.push({ x: behind.x, z: behind.z, r: 0.55, depth: 0.05 + thrN * 0.06, foam: thrN * 0.012 + (tel.foilborne ? sp * 0.0012 : 0), turb: Math.abs(P.input.throttle) * 0.05 * rig.s.impeller });
        if (Math.abs(P.input.throttle) > 0.15 && d > 0.1 && Math.random() < 0.6) {
          spray.emit(behind.x + (Math.random() - 0.5) * 0.4, wp.y + (Math.random() - 0.5) * 0.3, behind.z + (Math.random() - 0.5) * 0.4, -fwd.x * 2, 0.2, -fwd.z * 2, 3, 0.05 + Math.random() * 0.05, 2, 0.4);
        }
        if (d < 0.8 && Math.abs(P.input.throttle) > 0.4 && Math.random() < 0.5 * Math.abs(P.input.throttle)) {
          spray.emit(behind.x, wh, behind.z, v.x * 0.3 - fwd.x * (1 + sp * 0.15), 1 + thrN * 2.5, v.z * 0.3 - fwd.z * (1 + sp * 0.15), 0.8, 0.18, 0, 0.6);
        }
        if (tel.foilborne && sp > 8) {
          const side = i % 2 === 0 ? 1 : -1;
          let n = sp * 0.5 * dt * 10 + Math.random();
          while (n-- > 1) spray.emit(wp.x, wh + 0.05, wp.z, v.x * 0.75 + right.x * side * (0.6 + sp * 0.06), 0.5 + sp * 0.09, v.z * 0.75 + right.z * side * (0.6 + sp * 0.06), 0.6, 0.1, 0, 0.5);
        }
      }
      // sponsons in the water
      if (rig.s.sponson > 0.8) {
        for (const sp2 of car.body.sponsons) {
          for (const k of [-0.6, 0.6]) {
            const lp = sp2.pivot.position.clone(); lp.z += k;
            P.toWorld(lp, wp);
            const wh = this._waterHeight(wp.x, wp.z);
            if (wh - wp.y > -0.12) sources.push({ x: wp.x, z: wp.z, r: 0.7, depth: 0.12, foam: clamp((sp - 2) * 0.002, 0, 0.02), turb: 0, dx: fwd.x, dz: fwd.z });
          }
        }
      }
      // splash on entering the water
      const sub = tel.submerged;
      if (sub > 0.08 && this.prevSub < 0.03 && P.vel.y < -0.8) {
        for (let k = 0; k < 260; k++) {
          const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.2;
          spray.emit(P.pos.x + Math.cos(a) * r, this._waterHeight(P.pos.x, P.pos.z) + 0.1, P.pos.z + Math.sin(a) * r * 1.6, Math.cos(a) * 3 + v.x * 0.4, 2.5 + Math.random() * 3.5, Math.sin(a) * 3 + v.z * 0.4, 1.4, 0.25, k % 7 === 0 ? 1 : 0, 1.2);
        }
      }
      // wheels churning through shallow water on the ramp
      if (rig.s.arm < 0.3 && sp > 1) {
        for (const w of P.wheels) {
          const lp = new THREE.Vector3(w.x, 0.05, w.z);
          P.toWorld(lp, wp);
          const wh = this._waterHeight(wp.x, wp.z);
          if (wh > wp.y && Math.random() < sp * 0.12) spray.emit(wp.x, wh, wp.z, v.x * 0.3 + (Math.random() - 0.5) * 2, 1 + sp * 0.3, v.z * 0.3 + (Math.random() - 0.5) * 2, 0.8, 0.14, 0, 0.6);
        }
      }
      this.prevSub = sub;
    }
    this.wake.setSources(sources);
    const focus = this.pinned ? this.camera.position : this.physics.pos;
    if (this.renderEnabled !== false || this.simWake) this.wake.update(dt, focus.x, focus.z);
    this.ocean.uniforms.uWake.value = this.wake.texture;
    this.ocean.uniforms.uWakeInfo.value.set(this.wake.center.x, this.wake.center.y, this.wake.metres);
    spray.update(dt, (x, z) => this._waterHeight(x, z));
  }

  _marineSnow() {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 24;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfe8e2, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
    this.ocean.hidden.push(this.snow);
  }

  // ------------------------------------------------------------------ environment & render
  _environment(dt) {
    const sky = this.sky, cam = this.camera;
    // centre the wide shadow cascade a little ahead of the camera
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    look.y = 0; look.normalize();
    sky.farFocus = this.camera.position.clone().addScaledVector(look, 160);
    sky.update(this.car.root.position);
    this.ocean.update(this.time, cam, sky);
    const tu = this.terrain.uniforms;
    tu.uTime.value = this.time;
    tu.uSunDir.value.copy(sky.sunDir);
    tu.uSunColor.value.copy(sky.sunColor).multiplyScalar(sky.sunTotal / 4.8);
    this.marina.update(this.time, sky.night, (x, z) => this._waterHeight(x, z));
    const sp = this.spray.uniforms;
    sp.uSun.value.copy(sky.sunColor).multiplyScalar(0.25 + 0.75 * sky.sunTotal / 4.8);
    sp.uAmb.value.copy(sky.zenithColor).multiplyScalar(0.8);
    sp.uScale.value = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.9;
    // underwater?
    const wh = this._waterHeight(cam.position.x, cam.position.z);
    this.under = cam.position.y < wh - 0.02;
    this.ocean.uniforms.uUnderwater.value = this.under ? 1 : 0;
    this.core.grade.uniforms.uUnder.value = this.under ? 1 : 0;
    this.core.grade.uniforms.uTime.value = this.time;
    this.core.grade.uniforms.uUnderColor.value.copy(this.ocean.uniforms.uUnderFog.value);
    if (this.under) {
      this.fog.color.copy(this.ocean.uniforms.uUnderFog.value);
      this.fog.density = 0.055;
      this.scene.background = this.fog.color;
      this.sky.sky.visible = false;
      this.snow.visible = true;
      const p = this.snow.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        for (let a = 0; a < 3; a++) {
          const c = cam.position.getComponent(a);
          let v = p.array[i * 3 + a] + (a === 1 ? dt * 0.02 : 0);
          if (v < c - 12) v += 24; else if (v > c + 12) v -= 24;
          p.array[i * 3 + a] = v;
        }
      }
      p.needsUpdate = true;
    } else {
      this.fog.color.copy(sky.horizonColor);
      this.fog.density = 0.00016;
      this.scene.background = null;
      this.sky.sky.visible = true;
      this.snow.visible = false;
    }
    // headlights automatically at dusk
    this.car.setHeadlights(this.cfg.headlights || sky.night > 0.55, sky.night);
    this.car.M.ledAmbient.emissiveIntensity = this.cfg.ambient ? 1.4 : 0;
    // refresh image-based lighting when the scene changes enough
    const moved = this.lastEnv.pos.distanceTo(this.car.root.position) > 140;
    if (this.renderEnabled !== false && (Math.abs(this.lastEnv.hour - this.hour) > 0.35 || moved || this.lastEnv.design !== this.designIndex)) this._captureEnv();
  }

  _captureEnv(force) {
    const sky = this.sky;
    if (!this.envCube) {
      this.envCubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
      this.envCube = new THREE.CubeCamera(1, 6000, this.envCubeRT);
      this.envSea = new THREE.Mesh(new THREE.CircleGeometry(5000, 48), new THREE.MeshBasicMaterial({ color: 0x0a3a46 }));
      this.envSea.rotation.x = -Math.PI / 2;
      this.envSea.position.y = 0.0;
    }
    const n = sky.night;
    this.envSea.material.color.setRGB(0.012 + 0.03 * (1 - n), 0.07 * (1 - n) + 0.005, 0.09 * (1 - n) + 0.01);
    const p = this.car.root.position;
    this.envCube.position.set(p.x, Math.max(p.y + 1.2, 1.2), p.z);
    const hidden = [this.ocean.mesh, this.car.root, this.spray.points, this.snow];
    const vis = hidden.map((o) => o.visible);
    hidden.forEach((o) => { o.visible = false; });
    this.scene.add(this.envSea);
    const oldDens = this.fog.density;
    this.fog.density = 0;
    const oldBg = this.scene.background;
    this.scene.background = null;
    sky.sky.visible = true;
    this.scene.environment = null;
    this.envCube.update(this.renderer, this.scene);
    this.scene.remove(this.envSea);
    hidden.forEach((o, i) => { o.visible = vis[i]; });
    this.fog.density = oldDens;
    this.scene.background = oldBg;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = this.pmrem.fromCubemap(this.envCubeRT.texture);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.3 + 0.12 * (1 - n);
    for (const c of this.cars) if (c) c.setEnvMap(rt.texture, 0.55 + 0.5 * (1 - n));
    this.lastEnv.hour = this.hour;
    this.lastEnv.pos.copy(p);
    this.lastEnv.design = this.designIndex;
    void force;
  }

  _render() {
    const sky = this.sky;
    if (this.under) {
      // the refraction pass needs the sky (Snell's window) without fog
      const dens = this.fog.density;
      this.fog.density = 0; // keep fog in the programs, just disable it for this pass
      this.scene.background = null;
      sky.sky.visible = true;
      this.ocean.renderPasses(this.scene, this.camera, true);
      sky.sky.visible = false;
      this.fog.density = dens;
      this.scene.background = this.fog.color;
    } else {
      this.ocean.renderPasses(this.scene, this.camera, false);
    }
    this.core.render();
  }

  // ------------------------------------------------------------------ HUD, displays, labels
  _hud(dt) {
    const s = this.car.rig.s, tel = this.physics.telemetry;
    const marine = s.impeller > 0.5;
    this._hudT = (this._hudT || 0) + dt;
    const stage = this.car.rig.stage;
    const st = this.paused ? stage + ' · paused' : this.seqDir ? (this.seqDir > 0 ? stage + ' →' : '← ' + stage) : stage;
    this.ui.frame({
      master: this.master, paused: this.paused, foil: this.foilOn,
      stageText: (s.foil > 0.5 ? (s.ride > 0.3 ? 'Foilborne' : 'Foils deployed') : st),
      sys: { sponson: s.sponson, arm: s.arm, yaw: s.yaw, impeller: s.impeller, foil: s.foil, ride: s.ride },
    });
    if (this._hudT < 0.1) return;
    this._hudT = 0;
    let mode = 'ROAD';
    if (this.pinned) mode = 'DISPLAY';
    else if (this.seqDir) mode = 'TRANSFORMING';
    else if (tel.foilborne) mode = 'FOILBORNE';
    else if (marine && tel.submerged > 0.02) mode = tel.fwdSpeed > 8 ? 'PLANING' : 'DISPLACEMENT';
    else if (tel.floating) mode = 'AFLOAT';
    const spd = Math.abs(tel.fwdSpeed);
    this.ui.telemetry({
      speedText: String(Math.round(marine ? spd * KN : spd * 3.6)), unit: marine ? 'knots' : 'km/h', mode, marine,
      ride: tel.foilborne || tel.submerged > 0 ? (tel.ride >= 0 ? '+' : '') + tel.ride.toFixed(2) + ' m' : '—',
      depth: tel.waterDepth > 0.05 && !this.pinned && tel.waterLevel > tel.seabed ? tel.waterDepth.toFixed(1) + ' m' : '—',
      hdg: Math.round(tel.heading) + '° ' + ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((360 - tel.heading + 180) % 360) / 45) % 8],
      thrust: marine ? (tel.thrust / 1000).toFixed(1) + ' kN' : '—',
    });
    if (this.view === 'cockpit' || this._dispT === undefined || this.time - this._dispT > 1) {
      this._dispT = this.time;
      drawDisplays(this.car.interior, {
        marine, kmh: spd * 3.6, knots: spd * KN, mode: mode,
        power: this.pinned ? 0 : Math.abs(this.physics.input.throttle), battery: 0.82,
        ride: clamp((tel.ride + 0.3) / 1.2, 0, 1), rideText: (tel.ride >= 0 ? '+' : '') + tel.ride.toFixed(2) + ' m',
        heading: tel.heading, transform: this.master, stage: this.car.rig.stage,
        depthText: tel.waterDepth > 0.05 && !this.pinned ? 'DEPTH ' + tel.waterDepth.toFixed(1) + ' M' : 'ON LAND',
        seaText: ['GLASSY', 'CALM', 'MODERATE', 'CHOPPY', 'ROUGH'][Math.min(4, Math.floor(this.waves.seaState * 5))],
        hydraulics: this.seqDir ? 'ACTIVE' : 'READY',
      });
    }
    this._labels();
  }

  _labelsInit() {
    const car = this.car, rig = car.rig, ch = car.chassis;
    const eng = { v12: 'Front-mid 6.5 L V12', v8: 'Twin-turbo hybrid V8', electric: 'Quad e-motor drive' }[car.design.engine];
    this.labelDefs = [
      { obj: rig.corners[0].wheel.group, title: 'Rim-shrouded impeller pod', sub: 'Spokes pitch into blades · duct sleeve' },
      { obj: rig.corners[0].arm, off: new THREE.Vector3(0.45, 0, 0), title: 'Three-stage hydraulic arm', sub: 'Telescopes 0.55 → 1.55 m' },
      { obj: rig.corners[1].ram.barrel, title: 'Active ram + coil', sub: 'Suspension on land, deploy force at sea' },
      { obj: car.body.sponsons[0].pivot, title: 'Teak-decked sponson', sub: 'Body sill becomes a flotation hull' },
      { obj: rig.corners[2].foil, title: 'Telescoping hydrofoil', sub: 'Flight-controlled flaps' },
      { obj: ch.parts.engine, title: eng, sub: 'Generator + hub-motor drive' },
      { obj: ch.parts.battery, title: '62 kWh structural battery', sub: 'Under the carbon tub' },
      { obj: car.body.sponsons[1].pivot, title: 'Deployment linkage', sub: 'Multi-stage telescopic struts' },
    ];
    const box = document.getElementById('labels');
    box.innerHTML = '';
    for (const d of this.labelDefs) {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.innerHTML = `<b>${d.title}</b><small>${d.sub}</small>`;
      const dot = document.createElement('div');
      dot.className = 'dot';
      box.append(el, dot);
      d.el = el; d.dot = dot;
    }
  }

  _labels() {
    const s = this.car.rig.s;
    const show = this.labelsOn && (s.explode > 0.08 || this.car.cutaway > 0.08 || this.cfg.xray || (this.paused && this.master > 0.05)) && this.view !== 'cockpit';
    const svg = document.getElementById('leaders');
    const W = window.innerWidth, H = window.innerHeight;
    let paths = '';
    const v = new THREE.Vector3();
    const used = [];
    for (const d of this.labelDefs) {
      if (!show) { d.el.style.opacity = 0; d.dot.style.opacity = 0; continue; }
      d.obj.getWorldPosition(v);
      if (d.off) v.add(d.off.clone().applyQuaternion(this.car.root.quaternion));
      v.project(this.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.el.style.opacity = 0; d.dot.style.opacity = 0; continue; }
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const dir = x > W / 2 ? 1 : -1;
      let lx = x + dir * 70, ly = y - 46;
      for (const u of used) if (Math.abs(u[0] - lx) < 170 && Math.abs(u[1] - ly) < 34) ly = u[1] - 38;
      used.push([lx, ly]);
      d.el.style.opacity = 1; d.dot.style.opacity = 1;
      d.dot.style.left = x + 'px'; d.dot.style.top = y + 'px';
      d.el.style.left = (dir > 0 ? lx : lx - d.el.offsetWidth) + 'px';
      d.el.style.top = ly + 'px';
      paths += `<path d="M${x},${y} L${lx},${ly}" stroke="rgba(216,195,160,0.7)" stroke-width="1" fill="none"/>`;
    }
    svg.innerHTML = paths;
  }

  // Soft ambient-occlusion shadow that anchors the car to whatever it stands on.
  _contactShadow() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(128, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
      const u = (x + 0.5) / 128 * 2 - 1, v = (y + 0.5) / 256 * 2 - 1;
      const d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
      const a = Math.pow(Math.max(0, 1 - d), 1.6);
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = Math.min(255, a * 300);
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
    mat.color.set(0xffffff);
    this.shadowBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.renderOrder = 2;
    this.scene.add(this.shadowBlob);
    this.ocean.hidden.push(this.shadowBlob);
  }

  _updateContactShadow() {
    const b = this.shadowBlob, car = this.car;
    if (!b) return;
    const d = car.design;
    const p = car.root.position;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.root.quaternion);
    const yaw = Math.atan2(fwd.x, fwd.z);
    let gy = this.terrain.groundHeight(p.x, p.z);
    if (this.pinned) gy = QUAY.y + PLINTH.h + 0.012;
    const wh = this._waterHeight(p.x, p.z);
    const lift = (p.y - car.com.y) - gy;
    const visible = gy > wh - 0.05;
    b.visible = visible;
    if (!visible) return;
    b.position.set(p.x, gy + 0.015, p.z);
    b.rotation.set(-Math.PI / 2, 0, yaw);
    const W = (d.wheels.trackF + d.wheels.trackR) / 2 + 0.55;
    const L = d.body.z1 - d.body.z0 + 0.5;
    const spread = 1 + Math.max(0, lift) * 0.5;
    b.scale.set(W * spread, L * spread, 1);
    b.material.opacity = 0.82 * Math.max(0, 1 - Math.max(0, lift) * 1.2) * (1 - this.sky.night * 0.4);
  }

  // ------------------------------------------------------------------ automatic tour
  _tour(dt) {
    const T = this.tour;
    T.t += dt;
    const P = this.physics;
    if (T.step === 0) {
      if (T.t > 1.5 && T.t < 1.6) this.targets.doors = 1;
      if (T.t > 5.2 && T.t < 5.3) this.targets.doors = 0;
      if (T.t > 6.5 && T.t < 6.6) this.targets.roof = 1;
      if (T.t > 12.5 && T.t < 12.6) this.targets.roof = 0;
      if (T.t > 17.5 && T.t < 17.6) { this.sequence(1); this.ui.toast('Transformation on the display lift'); }
      if (T.t > 27 && T.t < 27.1) { this.foilOn = true; }
      if (T.t > 31 && T.t < 31.1) { this.foilOn = false; }
      if (T.t > 34 && T.t < 34.1) this.sequence(-1);
      if (T.t > 43) { T.step = 1; T.t = 0; T.idx = 0; this._unpin(); this.ui.toast('Driving to the slipway'); }
      this.ui.syncBody();
      return;
    }
    const route = T.step === 1 ? LAUNCH_ROUTE : SEA_ROUTE;
    const wp = route[T.idx % route.length];
    const dx = wp[0] - P.pos.x, dz = wp[1] - P.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < (T.step === 1 ? 6 : 22)) {
      T.idx++;
      if (T.step === 1 && T.idx >= route.length) { T.step = 2; T.idx = 0; this.ui.toast('Open water — accelerating to foil'); }
    }
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(P.quat);
    const hf = Math.atan2(fwd.x, fwd.z), hd = Math.atan2(dx, dz);
    let err = hd - hf;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    const inp = P.input;
    inp.steer = clamp(err * 1.8, -1, 1);
    const s = this.car.rig.s;
    let vT = T.step === 1 ? (wp[2] || 6) : 26;
    if (T.step === 1 && P.telemetry.submerged > 0.05) vT = s.impeller > 0.9 ? 4 : 0.8;
    if (T.step === 2 && s.impeller < 0.95) vT = 3;
    vT *= 1 - 0.55 * Math.min(1, Math.abs(err) / 1.2);
    const vF = P.telemetry.fwdSpeed;
    inp.throttle = clamp((vT - vF) * 0.35, -1, 1);
    inp.brake = 0; inp.handbrake = 0; inp.boost = T.step === 2 && vT > 20 ? 1 : 0;
    if (T.step === 2 && this.master < 1 && this.seqDir === 0 && s.impeller < 0.5) this.sequence(1);
  }
}
