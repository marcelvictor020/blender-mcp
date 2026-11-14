import * as core from './core.js';
import { cameraMove, BARS } from './camera_moves.js';
const { Engine, shared, THREE } = core;

const SHOTS = [
  { file: 'shot1.js', duration: 3.958 }, { file: 'shot2.js', duration: 3.0 }, { file: 'shot3.js', duration: 3.042 },
  { file: 'shot4.js', duration: 3.125 }, { file: 'shot5.js', duration: 3.042 }, { file: 'shot6.js', duration: 3.041 },
  { file: 'shot7.js', duration: 3.042 }, { file: 'shot8.js', duration: 6.125 },
];
let acc = 0; for (const s of SHOTS) { s.start = acc; acc += s.duration; }
const TOTAL = acc;

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const STATIC = q.has('static');
const ONLY = q.has('shot') ? parseInt(q.get('shot')) - 1 : -1;
const AUTO_W = (Math.min(innerWidth, innerHeight * 16 / 9) * (devicePixelRatio || 1)) >= 1500 ? 1920 : 1280;
const W = parseInt(q.get('w') || (RENDER ? '1920' : String(AUTO_W))), H = parseInt(q.get('h') || String(Math.round(W * 9 / 16)));
const NAME = (q.get('name') || 'YOUR NAME').toUpperCase();

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const engine = new Engine(canvas, W, H);
core.ctx.renderer = engine.renderer; core.ctx.W = W; core.ctx.H = H;
const credit = document.getElementById('credit');
const roleEl = credit.querySelector('.role'), nameEl = credit.querySelector('.name');
nameEl.textContent = NAME;

// Optional per-shot credit overrides: credits.json = { "<shot number>": { role, name, cx, ry, ny, from, to, fade } }
let CREDITS = {};
try { const r = await fetch('credits.json', { cache: 'no-store' }); if (r.ok) CREDITS = await r.json(); } catch (e) { /* none */ }

const mods = await Promise.all(SHOTS.map(s => import('./shots/' + s.file).then(m => m.default).catch(e => { console.error(s.file, e); return null; })));
const built = new Map();
function getShot(i) {
  if (!built.has(i)) {
    const m = mods[i];
    if (!m) return null;
    const inst = m.build(core, { W, H });
    built.set(i, inst);
    if (RENDER) for (const k of [...built.keys()]) if (Math.abs(k - i) > 1 && k !== i) { disposeScene(built.get(k).scene); built.delete(k); }
  }
  return built.get(i);
}
function disposeScene(s) { s.traverse(o => { o.geometry?.dispose?.(); }); }

function locate(t) {
  if (ONLY >= 0) return { i: ONLY, lt: Math.min(t, SHOTS[ONLY].duration - 1e-3) };
  t = Math.max(0, Math.min(TOTAL - 1e-3, t));
  for (let i = SHOTS.length - 1; i >= 0; i--) if (t >= SHOTS[i].start) return { i, lt: t - SHOTS[i].start };
  return { i: 0, lt: t };
}

let lastShot = -1, curCredit = null;
function creditFor(i) {
  const c = { ...(mods[i]?.credit || {}), ...(CREDITS[String(i + 1)] || {}) };
  return (c.role || c.name) ? c : null;
}
function renderAt(t) {
  const { i, lt } = locate(t);
  const shot = getShot(i);
  const m = mods[i];
  if (!shot) { engine.renderer.setClearColor(0x000000); engine.renderer.clear(); return; }
  if (i !== lastShot) {
    engine.applyPost(m.post);
    curCredit = creditFor(i);
    if (curCredit) {
      const c = curCredit;
      credit.style.display = 'block';
      roleEl.textContent = c.role || '';
      nameEl.textContent = (q.has('name') ? NAME : (c.name || NAME));
      credit.style.left = (c.cx * 100) + '%';
      roleEl.style.top = (c.ry * 100) + '%';
      nameEl.style.top = (c.ny * 100) + '%';
    } else credit.style.display = 'none';
    lastShot = i;
  }
  if (curCredit) {
    const c = curCredit, f = c.fade ?? 0.5;
    let o = 1;
    if (c.from != null) o = Math.min(1, Math.max(0, (lt - c.from) / f));
    if (c.to != null) o *= Math.min(1, Math.max(0, (c.to - lt) / f));
    credit.style.opacity = String(o);
  }
  shared.uTime.value = lt + 10;
  shot.update?.(lt, core);
  const cam = shot.camera;
  if (STATIC) { engine.setLens(1, 0, 0, 0, 0); engine.render(shot.scene, cam, lt); return; }
  const mv = cameraMove(i + 1, lt, SHOTS[i].duration);
  const p0 = cam.position.clone(), q0 = cam.quaternion.clone();
  if (!mv.twoD) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    cam.position.addScaledVector(fwd, mv.dolly);
    cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(mv.pitch, mv.yaw, 0, 'YXZ')));
    cam.updateMatrixWorld(true);
  }
  engine.setLens(mv.zoom, mv.twoD ? mv.yaw * 0.3 : 0, mv.twoD ? mv.pitch * 0.3 : 0, BARS, mv.roll);
  engine.render(shot.scene, cam, lt);
  cam.position.copy(p0); cam.quaternion.copy(q0); cam.updateMatrixWorld(true);
}

const wrap = document.getElementById('wrap');
function fit() {
  if (RENDER) { stage.style.width = W + 'px'; stage.style.height = H + 'px'; return; }
  const vw = wrap ? wrap.clientWidth : innerWidth, vh = wrap ? wrap.clientHeight : innerHeight; const s = Math.min(vw / 16, vh / 9);
  stage.style.width = (16 * s) + 'px'; stage.style.height = (9 * s) + 'px';
  stage.style.fontSize = (16 * s / 100) + 'px';
}
fit(); addEventListener('resize', fit);
if (RENDER) stage.style.fontSize = (W / 100) + 'px';

if (RENDER) {
  await document.fonts.ready;
  window.__render = async (t) => { renderAt(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };
  window.__ready = true;
} else {
  const dur = ONLY >= 0 ? SHOTS[ONLY].duration : TOTAL;
  let t0 = performance.now(), paused = false, pausedAt = 0;
  const bar = document.getElementById('bar'), fill = document.getElementById('fill'), btn = document.getElementById('play');
  const setT = (t) => { t0 = performance.now() - t * 1000; if (paused) pausedAt = t; };
  btn.onclick = () => { paused = !paused; if (paused) pausedAt = (performance.now() - t0) / 1000 % dur; else setT(pausedAt); btn.textContent = paused ? '▶' : '❚❚'; };
  bar.onclick = (e) => { const r = bar.getBoundingClientRect(); setT((e.clientX - r.left) / r.width * dur); };
  // pre-build shots progressively so cuts don't hitch
  let pre = 0; const prebuild = () => { if (pre < SHOTS.length) { getShot(pre++); setTimeout(prebuild, 30); } }; prebuild();
  const timeEl = document.getElementById('time'), shotEl = document.getElementById('shotname');
  const NAMES = ['Viaduct at golden hour', 'Vending machine under the overpass', 'Flower garden', 'Field and farmhouse',
    'Old shop-house', 'Vending machine row', 'Inside the car', 'Meadow from above'];
  const fmt = (x) => Math.floor(x / 60) + ':' + String(Math.floor(x % 60)).padStart(2, '0');
  const audio = document.getElementById('music'), soundBtn = document.getElementById('sound');
  let soundOn = false;
  const curT = () => paused ? pausedAt : ((performance.now() - t0) / 1000) % dur;
  if (audio && soundBtn && ONLY < 0) {
    soundBtn.hidden = false;
    soundBtn.onclick = () => {
      soundOn = !soundOn;
      soundBtn.setAttribute('aria-pressed', String(soundOn));
      soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
      if (soundOn) { audio.currentTime = curT(); if (!paused) audio.play().catch(() => {}); } else audio.pause();
    };
    const oldPlay = btn.onclick; btn.onclick = () => { oldPlay(); if (soundOn) { if (paused) audio.pause(); else { audio.currentTime = curT(); audio.play().catch(() => {}); } } };
    const oldSeek = bar.onclick; bar.onclick = (e) => { oldSeek(e); if (soundOn) audio.currentTime = curT(); };
  }
  const loop = () => {
    let t = curT();
    if (audio && soundOn && !paused && !audio.paused) {   // audio is the master clock while sound is on
      const at = audio.currentTime % dur;
      if (Math.abs(at - t) > 0.06 && Math.abs(at - t) < dur - 0.2) setT(at);
      t = at;
    }
    renderAt(t); fill.style.width = (t / dur * 100) + '%';
    if (timeEl) timeEl.textContent = fmt(t) + ' / ' + fmt(dur);
    if (shotEl) { const i = locate(t).i; shotEl.textContent = 'Shot ' + (i + 1) + ' · ' + NAMES[i]; }
    requestAnimationFrame(loop);
  };
  loop();
}
