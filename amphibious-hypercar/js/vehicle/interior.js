// Cockpit: tub, bucket seats, sculpted dashboard with live instrument
// displays, animated steering wheel, console, pedals and door cards.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function rbox(w, h, d, r, mat, seg = 4) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Bolstered cushion: rounded box whose top face rises toward the sides.
function bolsteredGeometry(w, h, d, bolster, r = 0.03) {
  const g = new RoundedBoxGeometry(w, h, d, 6, r);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const q = Math.abs(x) / (w / 2);
    const lift = bolster * Math.pow(Math.max(0, (q - 0.45) / 0.55), 1.6);
    if (y > -h / 2 + 0.01) p.setY(i, y + lift * ((y + h / 2) / h));
    // slight dish in the centre
    if (y > 0) p.setY(i, p.getY(i) - 0.012 * (1 - q * q));
  }
  g.computeVertexNormals();
  return g;
}

function buildSeat(M, sport) {
  const seat = new THREE.Group();
  // cushion
  const cush = new THREE.Mesh(bolsteredGeometry(0.5, 0.1, 0.5, sport ? 0.09 : 0.06), M.leatherPlain);
  cush.position.set(0, 0.0, 0.2);
  cush.rotation.x = -0.08;
  const cushC = rbox(0.28, 0.03, 0.42, 0.012, M.leather);
  cushC.position.set(0, 0.052, 0.2);
  cushC.rotation.x = -0.08;
  seat.add(cush, cushC);
  // backrest pivoted at the hip
  const back = new THREE.Group();
  back.rotation.x = -0.36;
  const bk = new THREE.Mesh(bolsteredGeometry(0.5, 0.11, 0.64, sport ? 0.11 : 0.07), M.leatherPlain);
  bk.rotation.x = Math.PI / 2;
  bk.position.set(0, 0.37, -0.04);
  const bkC = rbox(0.28, 0.03, 0.54, 0.012, M.leather);
  bkC.rotation.x = Math.PI / 2;
  bkC.position.set(0, 0.36, 0.015);
  const shell = rbox(0.54, 0.76, 0.05, 0.025, M.carbon);
  shell.position.set(0, 0.38, -0.11);
  const head = rbox(0.27, 0.14, 0.09, 0.04, M.leatherPlain);
  head.position.set(0, 0.74, -0.06);
  const headShell = rbox(0.29, 0.16, 0.04, 0.02, M.carbon);
  headShell.position.set(0, 0.74, -0.11);
  // embossed roundel
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), M.gold);
  emb.position.set(0, 0.75, -0.0135);
  back.add(bk, bkC, shell, head, headShell, emb);
  if (sport) {
    // harness slots
    for (const s of [-1, 1]) {
      const slot = rbox(0.05, 0.015, 0.05, 0.006, M.blackGloss);
      slot.position.set(s * 0.07, 0.64, -0.04);
      back.add(slot);
    }
  }
  seat.add(back);
  // rails
  for (const s of [-1, 1]) {
    const rail = rbox(0.03, 0.03, 0.46, 0.008, M.titanium);
    rail.position.set(s * 0.18, -0.07, 0.15);
    seat.add(rail);
  }
  return seat;
}

function buildSteering(M, yoke) {
  const g = new THREE.Group();
  const rimG = new THREE.TorusGeometry(0.17, 0.02, 14, 64);
  const p = rimG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (yoke && y > 0.11) y = 0.11 + (y - 0.11) * 0.25;
    if (y < -0.12) y = -0.12 + (y + 0.12) * 0.3;
    p.setY(i, y * 0.92);
  }
  rimG.computeVertexNormals();
  const rim = new THREE.Mesh(rimG, M.alcantara);
  g.add(rim);
  // titanium top marker
  const mark = rbox(0.012, 0.006, 0.03, 0.002, M.gold);
  mark.position.set(0, yoke ? 0.105 : 0.152, 0);
  g.add(mark);
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = rbox(0.14, 0.03, 0.022, 0.01, M.carbon);
    sp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.08, -0.005);
    sp.rotation.z = a;
    g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.05, 32), M.leatherDark);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = -0.02;
  g.add(hub);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), M.gold);
  badge.position.z = 0.006;
  g.add(badge);
  // rotary drive-mode selectors on the spokes
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 20), M.titanium);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(s * 0.1, -0.02, 0.012);
    g.add(knob);
    const paddle = rbox(0.09, 0.05, 0.008, 0.004, M.titanium);
    paddle.position.set(s * 0.15, 0.03, -0.05);
    paddle.rotation.z = s * 0.25;
    g.add(paddle);
  }
  return g;
}

export function buildInterior(design, body, M) {
  const root = new THREE.Group();
  root.name = 'interior';
  const shape = body.shape;
  const D = design.doors;
  const zc0 = shape.zOf(D.u0), zc1 = shape.zOf(D.u1);
  const trimMeshes = [];
  const floorY = 0.225;
  const sport = design.id === 'nereid';

  // tub floor + footwell (carpet), side sills (carbon)
  const floor = rbox(1.25, 0.03, zc1 - zc0 + 0.62, 0.01, M.carpet);
  floor.position.set(0, floorY, (zc0 + zc1) / 2 + 0.25);
  root.add(floor);
  const tunnel = rbox(0.26, 0.2, zc1 - zc0 + 0.5, 0.04, M.carbon);
  tunnel.position.set(0, floorY + 0.1, (zc0 + zc1) / 2 + 0.2);
  root.add(tunnel);
  for (const s of [-1, 1]) {
    const sill = rbox(0.14, 0.18, zc1 - zc0, 0.03, M.carbon);
    sill.position.set(s * 0.72, floorY + 0.08, (zc0 + zc1) / 2);
    root.add(sill);
  }
  // rear bulkhead / parcel shelf + roll hoops
  const shelf = rbox(1.3, 0.04, 0.42, 0.02, design.id === 'halcyon' ? M.teak : M.alcantara);
  shelf.position.set(0, shape.yt(D.u0) - 0.14, zc0 - 0.12);
  root.add(shelf);
  for (const s of [-1, 1]) {
    const hoopPts = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI * (i / 16);
      hoopPts.push(new THREE.Vector3(s * 0.37 + Math.cos(a) * 0.17, shape.yt(D.u0) - 0.12 + Math.sin(a) * 0.2, zc0 - 0.04));
    }
    const hoop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hoopPts), 24, 0.018, 10, false), M.titanium);
    root.add(hoop);
  }

  // seats
  const seatZ = zc0 + 0.36;
  const seats = [];
  for (const s of [1, -1]) {
    const seat = buildSeat(M, sport);
    seat.position.set(s * 0.37, floorY + 0.06, seatZ);
    root.add(seat);
    seats.push(seat);
  }

  // dashboard: extruded profile wrapping across the cabin
  const yTop = shape.yt(D.u1) - 0.03;
  const dz = zc1 + 0.05;
  const prof = new THREE.Shape();
  prof.moveTo(0.42, yTop - 0.02);
  prof.bezierCurveTo(0.2, yTop + 0.02, 0.02, yTop + 0.02, -0.06, yTop - 0.03);
  prof.bezierCurveTo(-0.12, yTop - 0.08, -0.13, yTop - 0.18, -0.08, yTop - 0.26);
  prof.lineTo(0.06, floorY + 0.3);
  prof.lineTo(0.42, floorY + 0.25);
  prof.lineTo(0.42, yTop - 0.02);
  const dashG = new THREE.ExtrudeGeometry(prof, { depth: 1.46, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 16, steps: 24 });
  dashG.translate(0, 0, -0.73);
  dashG.rotateY(-Math.PI / 2); // profile x -> -z... extrude along x
  const dp = dashG.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i);
    dp.setZ(i, dp.getZ(i) - 0.16 * x * x); // wrap toward the doors
  }
  dashG.computeVertexNormals();
  const dash = new THREE.Mesh(dashG, M.leatherDark);
  dash.position.set(0, 0, dz);
  dash.castShadow = true; dash.receiveShadow = true;
  root.add(dash);
  // trim insert across the dash face
  const insertPts = [];
  for (let i = 0; i <= 30; i++) {
    const x = -0.7 + 1.4 * (i / 30);
    insertPts.push(new THREE.Vector3(x, yTop - 0.11, dz - 0.115 - 0.16 * x * x));
  }
  const insert = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(insertPts), 40, 0.03, 4, false), M.trimTeak);
  insert.scale.set(1, 1, 1);
  insert.geometry.scale(1, 1, 0.35);
  root.add(insert);
  trimMeshes.push(insert);
  const ambPts = insertPts.map((p) => p.clone().add(new THREE.Vector3(0, -0.04, 0.005)));
  const amb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ambPts), 40, 0.0028, 6, false), M.ledAmbient);
  root.add(amb);
  // air vents (titanium rings)
  for (const x of [-0.62, -0.12, 0.12, 0.62]) {
    const v = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 10, 28), M.titanium);
    v.position.set(x, yTop - 0.07, dz - 0.11 - 0.16 * x * x);
    root.add(v);
    const vin = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), M.grille);
    vin.position.copy(v.position).add(new THREE.Vector3(0, 0, 0.004));
    vin.rotation.y = Math.PI;
    root.add(vin);
  }

  // instrument cluster: curved display in a carbon visor
  const cluster = makeDisplay(1024, 320);
  const clG = new THREE.CylinderGeometry(0.55, 0.55, 0.11, 32, 1, true, Math.PI - 0.32, 0.64);
  const clMat = new THREE.MeshBasicMaterial({ map: cluster.texture, side: THREE.DoubleSide, toneMapped: false });
  const cl = new THREE.Mesh(clG, clMat);
  cl.position.set(0, 0, 0.55);
  const clPivot = new THREE.Group();
  clPivot.position.set(0.37, yTop + 0.02, dz - 0.1);
  clPivot.add(cl);
  clPivot.rotation.x = 0.1;
  root.add(clPivot);
  const visor = rbox(0.42, 0.02, 0.16, 0.01, M.carbon);
  visor.position.set(0.37, yTop + 0.085, dz - 0.06);
  root.add(visor);
  // centre screen
  const center = makeDisplay(512, 340);
  const cs = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ map: center.texture, toneMapped: false }));
  cs.position.set(0, yTop - 0.06, dz - 0.15);
  cs.rotation.set(-0.35, Math.PI, 0);
  cs.rotation.order = 'YXZ';
  cs.rotation.set(-0.35, Math.PI, 0);
  root.add(cs);
  const csFrame = rbox(0.26, 0.18, 0.012, 0.008, M.blackGloss);
  csFrame.position.copy(cs.position).add(new THREE.Vector3(0, 0, 0.008));
  csFrame.rotation.copy(cs.rotation);
  root.add(csFrame);

  // centre console with selectors
  const con = rbox(0.24, 0.16, 0.6, 0.04, M.leatherDark);
  con.position.set(0, floorY + 0.26, dz - 0.42);
  con.rotation.x = 0.12;
  root.add(con);
  const conTrim = rbox(0.2, 0.012, 0.5, 0.005, M.trimTeak);
  conTrim.position.set(0, floorY + 0.345, dz - 0.44);
  conTrim.rotation.x = 0.12;
  root.add(conTrim);
  trimMeshes.push(conTrim);
  for (let i = 0; i < 3; i++) {
    const tog = rbox(0.016, 0.04, 0.012, 0.004, M.titanium);
    tog.position.set(-0.04 + i * 0.04, floorY + 0.37, dz - 0.32 - 0.0);
    tog.rotation.x = 0.4;
    root.add(tog);
  }
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.03, 32), M.titanium);
  dial.position.set(0, floorY + 0.37, dz - 0.5);
  root.add(dial);
  const start = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 24), M.ledRed);
  start.rotation.x = -Math.PI / 2 + 0.12;
  start.position.set(0.07, floorY + 0.36, dz - 0.5);
  root.add(start);
  const armrest = rbox(0.2, 0.06, 0.32, 0.03, M.leatherPlain);
  armrest.position.set(0, floorY + 0.36, seatZ - 0.05);
  root.add(armrest);

  // steering column + wheel
  const steerPivot = new THREE.Group();
  steerPivot.position.set(0.37, yTop - 0.11, dz - 0.38);
  steerPivot.rotation.x = 0.42;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 16), M.blackSatin);
  col.rotation.x = Math.PI / 2;
  col.position.z = 0.16;
  steerPivot.add(col);
  const wheel = buildSteering(M, design.id !== 'halcyon');
  wheel.rotation.y = Math.PI;
  steerPivot.add(wheel);
  root.add(steerPivot);
  // pedals
  for (const [x, w] of [[0.3, 0.06], [0.42, 0.09]]) {
    const ped = rbox(w, 0.12, 0.012, 0.005, M.titanium);
    ped.position.set(x, floorY + 0.12, dz + 0.22);
    ped.rotation.x = -0.4;
    root.add(ped);
  }

  // door cards attached to each door so they swing with it
  for (const d of body.doors) {
    const um = (D.u0 + D.u1) / 2;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    shape.point(um, 0.58, p); shape.normal(um, 0.58, n); p.x *= d.side; n.x *= d.side;
    const base = p.clone().addScaledVector(n, -0.09).sub(d.hinge);
    const ar = rbox(0.06, 0.05, 0.4, 0.02, M.leatherPlain);
    ar.position.copy(base).add(new THREE.Vector3(-d.side * 0.03, -0.02, 0));
    d.pivot.add(ar);
    const tr = rbox(0.012, 0.08, 0.5, 0.004, M.trimTeak);
    tr.position.copy(base).add(new THREE.Vector3(-d.side * 0.005, 0.1, 0.02));
    d.pivot.add(tr);
    trimMeshes.push(tr);
    const pull = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 20, Math.PI), M.titanium);
    pull.position.copy(base).add(new THREE.Vector3(-d.side * 0.04, 0.02, 0.12));
    pull.rotation.set(0, Math.PI / 2, Math.PI / 2);
    d.pivot.add(pull);
    const spk = new THREE.Mesh(new THREE.CircleGeometry(0.06, 28), M.grille);
    spk.position.copy(base).add(new THREE.Vector3(-d.side * 0.004, -0.12, 0.18));
    spk.rotation.y = -d.side * Math.PI / 2;
    d.pivot.add(spk);
    const strip = rbox(0.004, 0.004, 0.46, 0.0015, M.ledAmbient);
    strip.position.copy(base).add(new THREE.Vector3(-d.side * 0.012, 0.055, 0.02));
    d.pivot.add(strip);
  }

  const eye = new THREE.Vector3(0.37, floorY + 0.06 + 0.66, seatZ - 0.02);
  const state = { steer: 0 };
  return {
    root, trimMeshes, seats, eye, cluster, center, steerPivot, wheel,
    update(dt, rig) {
      wheel.rotation.z = -rig.steer * 2.1;
      const e = rig.s.explode;
      for (const s of seats) s.position.y = floorY + 0.06 + e * 0.32;
      void state;
    },
  };
}

// Canvas-backed display texture
function makeDisplay(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture, w, h };
}

const ACC = '#6fe3d6';
// Draw the live driver display and centre screen.
export function drawDisplays(interior, t) {
  const c = interior.cluster, ctx = c.ctx, W = c.w, H = c.h;
  ctx.fillStyle = '#030607';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(40,80,90,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // speed
  ctx.fillStyle = '#eef6f8';
  ctx.font = '300 128px Manrope, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(t.marine ? t.knots : t.kmh)), W * 0.5, H * 0.58);
  ctx.font = '500 22px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(238,246,248,0.6)';
  ctx.fillText(t.marine ? 'KNOTS' : 'KM/H', W * 0.5, H * 0.7);
  ctx.fillStyle = ACC;
  ctx.font = '500 24px "IBM Plex Mono", monospace';
  ctx.fillText(t.mode, W * 0.5, H * 0.18);
  // power arc (left)
  const arc = (cx, val, label, sub) => {
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.arc(cx, H * 0.55, 100, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    ctx.strokeStyle = ACC;
    ctx.beginPath(); ctx.arc(cx, H * 0.55, 100, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * Math.max(0, Math.min(1, val)))); ctx.stroke();
    ctx.fillStyle = '#eef6f8'; ctx.font = '400 34px Manrope, sans-serif';
    ctx.fillText(label, cx, H * 0.58);
    ctx.fillStyle = 'rgba(238,246,248,0.55)'; ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillText(sub, cx, H * 0.68);
  };
  arc(W * 0.17, t.power, Math.round(t.power * 100) + '%', 'POWER');
  arc(W * 0.83, t.marine ? t.ride : t.battery, t.marine ? t.rideText : Math.round(t.battery * 100) + '%', t.marine ? 'RIDE HEIGHT' : 'CHARGE');
  // heading tape
  ctx.save();
  ctx.beginPath(); ctx.rect(W * 0.3, H * 0.82, W * 0.4, 40); ctx.clip();
  ctx.fillStyle = 'rgba(238,246,248,0.7)';
  ctx.font = '500 18px "IBM Plex Mono", monospace';
  for (let d = -60; d <= 60; d += 15) {
    const hdg = Math.round(t.heading / 15) * 15 + d;
    const x = W * 0.5 + (hdg - t.heading) * 3.2;
    const n = ((hdg % 360) + 360) % 360;
    const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n);
    ctx.fillText(lab, x, H * 0.82 + 26);
  }
  ctx.restore();
  ctx.fillStyle = ACC; ctx.fillRect(W * 0.5 - 1, H * 0.82, 2, 34);
  c.texture.needsUpdate = true;

  // centre screen: transformation schematic
  const s = interior.center, x = s.ctx;
  x.fillStyle = '#05090b'; x.fillRect(0, 0, s.w, s.h);
  x.strokeStyle = 'rgba(111,227,214,0.25)'; x.lineWidth = 1;
  for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, i * 30); x.lineTo(s.w, i * 30); x.stroke(); }
  const cx = s.w / 2, cy = s.h / 2 + 10;
  x.fillStyle = 'rgba(238,246,248,0.9)';
  x.beginPath(); x.ellipse(cx, cy, 40, 110, 0, 0, Math.PI * 2); x.fill();
  const m = t.transform;
  const sp = m * 70;
  x.fillStyle = '#b08050';
  x.fillRect(cx - 42 - sp - 10, cy - 60, 12, 120);
  x.fillRect(cx + 42 + sp - 2, cy - 60, 12, 120);
  x.fillStyle = ACC;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = cx + sx * (48 + m * 40), py = cy + sy * 80;
    x.save(); x.translate(px, py); x.rotate(m * Math.PI / 2 * sx * 0);
    x.fillRect(-8 - (1 - m) * 4, -16 + m * 4, 16 + (1 - m) * 8, 32 - m * 8);
    x.restore();
  }
  x.fillStyle = 'rgba(238,246,248,0.85)'; x.font = '500 20px "IBM Plex Mono", monospace'; x.textAlign = 'left';
  x.fillText(t.stage.toUpperCase(), 18, 30);
  x.textAlign = 'right';
  x.fillText(t.depthText, s.w - 18, 30);
  x.textAlign = 'left'; x.fillStyle = 'rgba(238,246,248,0.55)'; x.font = '500 15px "IBM Plex Mono", monospace';
  x.fillText('SEA ' + t.seaText, 18, s.h - 18);
  x.textAlign = 'right';
  x.fillText('HYDRAULICS ' + t.hydraulics, s.w - 18, s.h - 18);
  s.texture.needsUpdate = true;
}
