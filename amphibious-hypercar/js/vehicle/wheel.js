// Wheel / propulsion pod assembly.
// Local frame: axle along +x (outer face at +x). The spokes are variable-pitch
// blades: flat in road mode, twisted into impeller blades in marine mode.
// The tyre + rim then act as the duct of a rim-shrouded thruster.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function tireGeometry(R, w, Rr) {
  const h = w / 2;
  const pts = [
    [Rr - 0.004, -h + 0.012], [Rr + 0.018, -h - 0.004], [Rr + 0.05, -h - 0.012], [R - 0.035, -h - 0.006],
    [R - 0.012, -h + 0.012], [R - 0.002, -h + 0.04], [R, -h + 0.07], [R, h - 0.07], [R - 0.002, h - 0.04],
    [R - 0.012, h - 0.012], [R - 0.035, h + 0.006], [Rr + 0.05, h + 0.012], [Rr + 0.018, h + 0.004], [Rr - 0.004, h - 0.012],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 72);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function rimGeometry(Rr, w) {
  const h = w / 2 - 0.01;
  const pts = [
    [Rr - 0.012, -h], [Rr - 0.004, -h - 0.004], [Rr + 0.006, -h + 0.006], [Rr - 0.006, -h + 0.03],
    [Rr - 0.01, h - 0.035], [Rr + 0.004, h - 0.012], [Rr + 0.012, h], [Rr + 0.006, h + 0.012], [Rr - 0.014, h + 0.008],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 72);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// Twisted, tapered, swept blade. Radial along +y, chord along z, thickness x.
function bladeGeometry(len, chordRoot, chordTip, thick, sweep, dish, twist) {
  const g = new THREE.BoxGeometry(thick, len, 1, 1, 14, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + len / 2; // 0..len
    const t = y / len;
    const chord = chordRoot + (chordTip - chordRoot) * t;
    let z = p.getZ(i) * chord;
    let x = p.getX(i);
    // lenticular section: thinner toward leading/trailing edges
    const edge = 1 - Math.pow(Math.abs(p.getZ(i)) * 2, 2) * 0.75;
    x *= edge;
    // twist about the radial axis
    const tw = twist * t;
    const xr = x * Math.cos(tw) - z * Math.sin(tw), zr = x * Math.sin(tw) + z * Math.cos(tw);
    p.setXYZ(i, xr + dish * (1 - t) * (1 - t), y, zr + sweep * t * t);
  }
  g.computeVertexNormals();
  return g;
}

export const WHEEL_STYLES = {
  turbine: { name: 'Turbine', n: 9, chordRoot: 0.05, chordTip: 0.032, sweep: 0.06, thick: 0.016, twist: 0.25 },
  blade: { name: 'Aero Blade', n: 5, chordRoot: 0.085, chordTip: 0.06, sweep: 0.025, thick: 0.02, twist: 0.12 },
  mesh: { name: 'Fine Mesh', n: 14, chordRoot: 0.03, chordTip: 0.02, sweep: 0.09, thick: 0.013, twist: 0.32 },
};

export class WheelAssembly {
  constructor(M, { r = 0.355, width = 0.29, style = 'turbine' } = {}) {
    this.M = M;
    this.r = r; this.width = width;
    this.group = new THREE.Group(); // non-rotating root at wheel centre
    this.spin = new THREE.Group(); // rotates about x
    this.group.add(this.spin);
    const Rr = r - 0.092;
    this.Rr = Rr;

    const tire = new THREE.Mesh(tireGeometry(r, width, Rr), M.tire);
    tire.castShadow = true; tire.receiveShadow = true;
    this.spin.add(tire);
    const rim = new THREE.Mesh(rimGeometry(Rr, width), M.wheel);
    rim.castShadow = true;
    this.spin.add(rim);
    // inner barrel liner (dark, so the duct reads as a tube)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(Rr - 0.014, Rr - 0.014, width - 0.03, 48, 1, true), M.gunmetal);
    barrel.rotation.z = Math.PI / 2;
    barrel.material = M.gunmetal;
    this.spin.add(barrel);

    // hub + centre lock
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.07, 24), M.wheel);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = width / 2 - 0.05;
    this.spin.add(hub);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.03, 6), M.darkTitanium);
    nut.rotation.z = Math.PI / 2;
    nut.position.x = width / 2 - 0.005;
    this.spin.add(nut);
    // spinner (hydrodynamic nose cone) – telescopes out in marine mode
    const spinG = new THREE.SphereGeometry(0.062, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    spinG.scale(1, 1.9, 1);
    spinG.rotateZ(-Math.PI / 2);
    this.spinner = new THREE.Mesh(spinG, M.titanium);
    this.spinner.position.x = width / 2 - 0.02;
    this.spinner.scale.set(0.25, 1, 1);
    this.spin.add(this.spinner);

    // brake disc + bell
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.205, 48, 1), M.brakeDisc);
    disc.rotation.y = Math.PI / 2;
    disc.position.x = -0.04;
    disc.material.side = THREE.DoubleSide;
    const discRim = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.032, 48, 1, true), M.brakeDisc);
    discRim.rotation.z = Math.PI / 2;
    discRim.position.x = -0.04;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.07, 32, 1, true), M.darkTitanium);
    bell.rotation.z = Math.PI / 2;
    bell.position.x = 0.0;
    this.spin.add(disc, discRim, bell);

    // spokes (pitchable)
    this.spokes = [];
    this.spokeRoot = new THREE.Group();
    this.spokeRoot.position.x = width / 2 - 0.045;
    this.spin.add(this.spokeRoot);
    this.setStyle(style);

    // caliper (static)
    const calG = new THREE.CylinderGeometry(0.205, 0.205, 0.07, 16, 1, true, -0.55, 1.1);
    const cal = new THREE.Group();
    const calBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.2, 2, 2, 6), M.caliper);
    calBody.position.y = 0.19;
    const pp = calBody.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const z = pp.getZ(i);
      pp.setY(i, pp.getY(i) - z * z * 1.6);
    }
    calBody.geometry.computeVertexNormals();
    cal.add(calBody);
    cal.position.x = -0.04;
    cal.rotation.x = 0.5;
    this.group.add(cal);
    void calG;

    // duct sleeve (static, slides aft = -x) with stator vanes + LED lip
    this.sleeve = new THREE.Group();
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(Rr - 0.022, Rr - 0.03, 0.24, 48, 1, true), M.titanium);
    sl.rotation.z = Math.PI / 2;
    sl.material = M.titanium;
    const slIn = new THREE.Mesh(new THREE.CylinderGeometry(Rr - 0.03, Rr - 0.036, 0.24, 48, 1, true), M.gunmetal);
    slIn.rotation.z = Math.PI / 2;
    slIn.geometry.scale(1, 1, 1);
    slIn.material = M.gunmetal.clone();
    slIn.material.side = THREE.BackSide;
    this.sleeve.add(sl, slIn);
    for (let k = 0; k < 5; k++) {
      const vane = new THREE.Mesh(new THREE.BoxGeometry(0.11, Rr - 0.11, 0.008), M.darkTitanium);
      const piv = new THREE.Group();
      piv.rotation.x = (k / 5) * Math.PI * 2;
      vane.position.set(-0.04, (Rr - 0.11) / 2 + 0.08, 0);
      vane.rotation.y = 0.25;
      piv.add(vane);
      this.sleeve.add(piv);
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(Rr - 0.026, 0.0045, 8, 64), M.ledCyan);
    lip.rotation.y = Math.PI / 2;
    lip.position.x = -0.12;
    this.sleeve.add(lip);
    this.sleeveLip = lip;
    this.group.add(this.sleeve);
    this.setMarine(0, 0);
  }

  setStyle(styleId) {
    const st = WHEEL_STYLES[styleId] || WHEEL_STYLES.turbine;
    this.styleId = styleId;
    for (const s of this.spokes) this.spokeRoot.remove(s.pivot);
    this.spokes = [];
    const len = this.Rr - 0.072;
    const geo = bladeGeometry(len, st.chordRoot, st.chordTip, st.thick, st.sweep, -0.03, st.twist);
    geo.translate(0, len / 2, 0);
    for (let k = 0; k < st.n; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.x = (k / st.n) * Math.PI * 2;
      const pitch = new THREE.Group();
      pitch.position.y = 0.064;
      const blade = new THREE.Mesh(geo, k % 2 && styleId === 'mesh' ? this.M.wheelAccent : this.M.wheel);
      blade.castShadow = true;
      pitch.add(blade);
      pivot.add(pitch);
      this.spokeRoot.add(pivot);
      this.spokes.push({ pivot, pitch });
    }
    if (this._marine !== undefined) this.setMarine(this._marine, this._sleeve);
  }

  // impeller: 0 = road spokes, 1 = full blade pitch; sleeve: 0..1 extension
  setMarine(impeller, sleeve) {
    this._marine = impeller; this._sleeve = sleeve;
    const pitch = impeller * 0.62;
    for (const s of this.spokes) s.pitch.rotation.y = pitch;
    this.spinner.scale.set(0.25 + impeller * 0.95, 1, 1);
    this.spinner.position.x = this.width / 2 - 0.02 + impeller * 0.02;
    this.sleeve.position.x = -sleeve * 0.22;
    this.sleeve.visible = sleeve > 0.001;
    this.sleeveLip.visible = sleeve > 0.6;
  }
}

// Hydraulic actuator: barrel anchored at A, chrome rod reaching B.
export class Strut {
  constructor(M, { barrel = 0.32, r = 0.028, rod = 0.014, spring = false } = {}) {
    this.group = new THREE.Group();
    this.barrelLen = barrel;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, barrel, 18), M.darkTitanium);
    b.geometry.translate(0, barrel / 2, 0);
    b.castShadow = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.03, 18), M.titanium);
    cap.position.y = barrel;
    const eye = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.35, 8, 16), M.titanium);
    eye.rotation.y = Math.PI / 2;
    this.barrel = new THREE.Group();
    this.barrel.add(b, cap, eye);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(rod, rod, 1, 14), M.chrome);
    this.rod.geometry.translate(0, 0.5, 0);
    this.rodEye = new THREE.Mesh(new THREE.TorusGeometry(rod * 1.6, rod * 0.6, 8, 16), M.titanium);
    this.rodEye.rotation.y = Math.PI / 2;
    this.group.add(this.barrel, this.rod, this.rodEye);
    if (spring) {
      const pts = [];
      const turns = 7, R = r * 1.65;
      for (let i = 0; i <= turns * 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * R, (i / (turns * 16)), Math.sin(a) * R));
      }
      this.spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, r * 0.22, 6, false), M.caliper);
      this.group.add(this.spring);
    }
  }
  set(A, B) {
    const d = _v.subVectors(B, A);
    const L = d.length();
    _q.setFromUnitVectors(UP, d.normalize());
    this.barrel.position.copy(A); this.barrel.quaternion.copy(_q);
    const rodStart = _w.copy(A).addScaledVector(d, Math.min(this.barrelLen, L - 0.02));
    const rodLen = Math.max(0.02, L - this.barrelLen + 0.06);
    this.rod.position.copy(A).addScaledVector(d, L - rodLen);
    this.rod.quaternion.copy(_q);
    this.rod.scale.set(1, rodLen, 1);
    this.rodEye.position.copy(B);
    this.rodEye.quaternion.copy(_q);
    this.rodEye.rotateX(Math.PI / 2);
    if (this.spring) {
      this.spring.position.copy(A).addScaledVector(d, this.barrelLen * 0.35);
      this.spring.quaternion.copy(_q);
      this.spring.scale.set(1, Math.max(0.05, L - this.barrelLen * 0.35 - 0.04), 1);
    }
    void rodStart;
    this.length = L;
  }
}

// Flexible hydraulic hose between two moving points (cubic bezier tube).
export class Hose {
  constructor(M, radius = 0.009, segs = 24, mat) {
    this.segs = segs;
    this.radius = radius;
    this.curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(this.curve, segs, radius, 6, false), mat || M.braided);
    this.mesh.frustumCulled = false;
  }
  set(A, tA, B, tB) {
    const c = this.curve;
    c.v0.copy(A); c.v3.copy(B);
    const L = A.distanceTo(B);
    c.v1.copy(A).addScaledVector(tA, L * 0.45);
    c.v2.copy(B).addScaledVector(tB, L * 0.45);
    const g = new THREE.TubeGeometry(c, this.segs, this.radius, 6, false);
    this.mesh.geometry.attributes.position.copy(g.attributes.position);
    this.mesh.geometry.attributes.normal.copy(g.attributes.normal);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
    g.dispose();
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
