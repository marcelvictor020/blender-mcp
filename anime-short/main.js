import * as core from './core.js';
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
const ONLY = q.has('shot') ? parseInt(q.get('shot')) - 1 : -1;
const AUTO_W = (Math.min(innerWidth, innerHeight * 16 / 9) * (devicePixelRatio || 1)) >= 1500 ? 1920 : 1280;
const W = parseInt(q.get('w') || (RENDER ? '1920' : String(AUTO_W))), H = parseInt(q.get('h') || String(Math.round(W * 9 / 16)));
const NAME = (q.get('name') || 'YOUR NAME').toUpperCase();

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const engine = new Engine(canvas, W, H);
const credit = document.getElementById('credit');
const roleEl = credit.querySelector('.role'), nameEl = credit.querySelector('.name');
nameEl.textContent = NAME;

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

let lastShot = -1;
function renderAt(t) {
  const { i, lt } = locate(t);
  const shot = getShot(i);
  const m = mods[i];
  if (!shot) { engine.renderer.setClearColor(0x000000); engine.renderer.clear(); return; }
  if (i !== lastShot) {
    engine.applyPost(m.post);
    if (m.credit) {
      credit.style.display = 'block';
      roleEl.textContent = m.credit.role;
      credit.style.left = (m.credit.cx * 100) + '%';
      roleEl.style.top = (m.credit.ry * 100) + '%';
      nameEl.style.top = (m.credit.ny * 100) + '%';
    } else credit.style.display = 'none';
    lastShot = i;
  }
  shared.uTime.value = lt + 10;
  shot.update?.(lt, core);
  engine.render(shot.scene, shot.camera, lt);
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
  const loop = () => {
    const t = paused ? pausedAt : ((performance.now() - t0) / 1000) % dur;
    renderAt(t); fill.style.width = (t / dur * 100) + '%';
    if (timeEl) timeEl.textContent = fmt(t) + ' / ' + fmt(dur);
    if (shotEl) { const i = locate(t).i; shotEl.textContent = 'Shot ' + (i + 1) + ' · ' + NAMES[i]; }
    requestAnimationFrame(loop);
  };
  loop();
}
