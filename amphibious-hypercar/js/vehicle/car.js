// Assembles a complete vehicle: body, rig, chassis, powertrain, interior,
// lights. Owns its materials and customisation state.
import * as THREE from 'three';
import { CarMaterials, PAINTS, LEATHERS, WHEEL_FINISHES, LIGHTS } from './materials.js';
import { buildBody } from './body.js';
import { Rig } from './mechanisms.js';
import { buildChassis } from './chassis.js';
import { buildInterior } from './interior.js';

export class Car {
  constructor(design) {
    this.design = design;
    const W = design.wheels;
    this.cuts = [
      { y: W.r + 0.01, z: W.zf, r: W.r + 0.08, xMin: 0.5 },
      { y: W.r + 0.01, z: W.zr, r: W.r + 0.08, xMin: 0.5 },
    ];
    const M = (this.M = new CarMaterials(this.cuts));
    M.setPaint(PAINTS.find((p) => p.id === design.paint));
    M.setLeather(LEATHERS.find((l) => l.id === design.leather));
    M.setWheelFinish(WHEEL_FINISHES.find((w) => w.id === design.wheelFinish));
    M.setLightColor(LIGHTS[0]);

    this.root = new THREE.Group(); // world transform (at centre of mass)
    this.root.name = 'car:' + design.id;
    this.model = new THREE.Group(); // car-local (ground origin)
    this.root.add(this.model);
    this.com = new THREE.Vector3(0, 0.5, design.engine === 'v12' ? 0.08 : -0.12);
    this.model.position.copy(this.com).negate();

    this.body = buildBody(design, M);
    this.model.add(this.body.root);
    this.rig = new Rig(design, this.body, M);
    this.model.add(this.rig.root);
    for (const sp of this.body.sponsons) this.model.add(sp.pivot); // sponsons stay low when exploding
    this.chassis = buildChassis(design, this.body.shape, M);
    this.model.add(this.chassis.root);
    this.interior = buildInterior(design, this.body, M);
    this.model.add(this.interior.root);
    M.trimMeshes = this.interior.trimMeshes;
    M.setTrim(design.trim);

    this._lights();
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; } });
    this.cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.cutaway = 0;
  }

  _lights() {
    const g = new THREE.Group();
    this.headSpots = [];
    for (const side of [1, -1]) {
      const sp = new THREE.SpotLight(0xf2f6ff, 0, 90, 0.42, 0.55, 1.6);
      const hl = this.body.headLights.find((h) => Math.sign(h.pos.x) === side) || { pos: new THREE.Vector3(side * 0.7, 0.6, 2.2) };
      sp.position.copy(hl.pos);
      sp.target.position.copy(hl.pos).add(new THREE.Vector3(side * 0.4, -0.6, 12));
      g.add(sp, sp.target);
      this.headSpots.push(sp);
    }
    // interior ambient light (subtle)
    this.cabinLight = new THREE.PointLight(0xffc890, 0, 2.2, 2);
    this.cabinLight.position.set(0, 0.95, 0.05);
    g.add(this.cabinLight);
    this.model.add(g);
  }

  setHeadlights(on, night = 0) {
    for (const s of this.headSpots) s.intensity = on ? 60 + 40 * night : 0;
    this.M.projector.emissiveIntensity = on ? 3 : 0;
    this.cabinLight.intensity = on ? 0.6 * (0.3 + night) : 0;
  }

  setCutaway(amount) {
    this.cutaway = amount;
    if (amount > 0) {
      this.M.setClipping(this.M._clipOn ? this.M.clipPlanes : (this.M._clipOn = true, this.M.clipPlanes = [this.cutPlane]));
    } else if (this.M._clipOn) {
      this.M._clipOn = false;
      this.M.setClipping(null);
    }
  }

  update(dt) {
    this.rig.update(dt);
    this.interior.update(dt, this.rig);
    this.chassis.update?.(this.rig);
    if (this.cutaway > 0) {
      // longitudinal section plane sweeping across the car (world space)
      this.root.updateMatrixWorld();
      const x = THREE.MathUtils.lerp(1.2, -0.02, this.cutaway);
      const n = new THREE.Vector3(-1, 0, 0).transformDirection(this.model.matrixWorld);
      const p = new THREE.Vector3(x, 0, 0).applyMatrix4(this.model.matrixWorld);
      this.cutPlane.setFromNormalAndCoplanarPoint(n, p);
    }
  }
}
