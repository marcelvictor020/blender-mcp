// 陽炎 KAGERŌ — opening player / renderer.
// URL: ?render=1 (headless: window.__render(t), window.__ready, window.__timeline) · ?seg=<id|kind|index> (one segment, local t)
//      ?w=&h= (default 1920x1080 in render mode) · ?name=YOUR%20NAME (replaces "YOUR NAME" credits) · ?nofx=1
import * as core from '../core.js';
import { SEGMENTS, TOTAL } from './timeline.js';
import { createFx, resolveFx, BEAT, BAR, BPM } from './fx.js';
import { drawOverlay } from './seg/overlays.js';
const { Engine, shared, THREE } = core;

const q = new URLSearchParams(location.search);
const RENDER = q.has('render');
const AUTO_W = (Math.min(innerWidth, innerHeight * 16 / 9) * (devicePixelRatio || 1)) >= 1500 ? 1920 : 1280;
const W = parseInt(q.get('w') || (RENDER ? '1920' : String(AUTO_W))), H = parseInt(q.get('h') || String(Math.round(W * 9 / 16)));
const NAME = q.has('name') ? q.get('name').toUpperCase() : null;
const NOFX = q.has('nofx');

let ONLY = -1;
if (q.has('seg')) {
  const v = q.get('seg');
  ONLY = /^\d+$/.test(v) ? +v : SEGMENTS.findIndex(s => s.id === v);
  if (ONLY < 0) ONLY = SEGMENTS.findIndex(s => s.kind === v || s.variant === v);
  if (ONLY < 0) console.error('unknown seg', v);
}
if (NAME) for (const s of SEGMENTS) if (s.name === 'YOUR NAME') s.name = NAME;

const canvas = document.getElementById('c');
const stage = document.getElementById('stage');
const engine = new Engine(canvas, W, H);
core.ctx.renderer = engine.renderer; core.ctx.W = W; core.ctx.H = H;
const fx = createFx(engine);

/* ---------- 2D overlay canvas (timecodes, small credits) composited in the FX pass ---------- */
const ovCanvas = document.createElement('canvas'); ovCanvas.width = W; ovCanvas.height = H;
const ovG = ovCanvas.getContext('2d');
const ovTex = new THREE.CanvasTexture(ovCanvas); ovTex.premultiplyAlpha = true; ovTex.generateMipmaps = false; ovTex.minFilter = THREE.LinearFilter;

/* ---------- segment modules ---------- */
const NEUTRAL_POST = { bloom: 0, exposure: 1, contrast: 1, saturation: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], vignette: 0, grain: 0, ca: 0, soft: 0 };
const kinds = [...new Set(SEGMENTS.map(s => s.kind))];
const MODS = {};
await Promise.all(kinds.map(k => import('./seg/' + k + '.js').then(m => { MODS[k] = m.default; }).catch(e => {
  if (!/Failed to fetch|Importing a module script failed|404/.test(String(e))) console.error(k, e);
  MODS[k] = null;
})));

function placeholder(seg) {
  // simple coloured stand-in for a world segment that isn't built yet
  const scene = new THREE.Scene();
  let hsh = 0; for (const ch of seg.kind) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = (hsh % 360) / 360;
  scene.background = new THREE.Color().setHSL(hue, 0.35, 0.18);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100); camera.position.set(0, 1.6, 6); camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.5));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.3, 0.3) }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.7, 0.55) }));
  box.position.y = 1; scene.add(box);
  const lc = document.createElement('canvas'); lc.width = 1024; lc.height = 128;
  const lg = lc.getContext('2d'); lg.fillStyle = '#fff'; lg.font = '700 64px MontserratLocal, Arial'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
  lg.fillText(seg.kind + (seg.variant ? ' · ' + seg.variant : ''), 512, 64);
  const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
  label.position.set(0, 2.6, 0); scene.add(label);
  return { scene, camera, update(t) { box.rotation.set(t * 0.7, t * 1.1, 0); }, post: { bloom: 0.2 }, placeholder: true };
}

// Wrap a 2D segment ({ draw(g, lt), fx?, post? }) into a renderable instance: canvas -> texture -> fullscreen quad.
function make2D(inst2d) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false })));
  return {
    scene, camera, is2D: true, post: { ...NEUTRAL_POST, ...(inst2d.post || {}) }, fx: inst2d.fx,
    update(lt) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.setTransform(W / 1920, 0, 0, H / 1080, 0, 0);   // all 2D segments draw in 1920x1080 design units
      inst2d.draw(g, lt);
      tex.needsUpdate = true;
    },
  };
}

const ctxBase = { W, H, engine, BEAT, BAR, BPM, THREE };
const cache = new Map();   // key -> instance
const order = [];          // LRU of keys
function keyOf(seg) { return seg.kind.startsWith('g_') ? seg.id : seg.kind + '|' + (seg.variant || ''); }
function getInst(i) {
  const seg = SEGMENTS[i], key = keyOf(seg);
  if (!cache.has(key)) {
    const mod = MODS[seg.kind];
    const ctx = { ...ctxBase, seg };
    let inst;
    try {
      if (!mod) inst = seg.kind.startsWith('world_') ? placeholder(seg) : make2D({ draw: (g) => { g.fillStyle = '#300'; g.fillRect(0, 0, 1920, 1080); g.fillStyle = '#fff'; g.font = '60px Arial'; g.fillText('missing ' + seg.kind, 80, 540); } });
      else if (mod.type === '2d' || seg.kind.startsWith('g_')) inst = make2D(mod.build(core, ctx));
      else { inst = mod.build(core, ctx); if (!inst.post && mod.post) inst.post = mod.post; }
    } catch (e) { console.error('build failed', seg.id, e); inst = placeholder(seg); }
    cache.set(key, inst);
    if (RENDER) {   // keep memory bounded: drop least-recently-used 3D worlds
      const worlds = order.filter(k => !k.startsWith('g_') && k.includes('|'));
      if (worlds.length > 4) { const k = worlds[0]; dispose(cache.get(k)); cache.delete(k); order.splice(order.indexOf(k), 1); }
    }
  }
  const oi = order.indexOf(key); if (oi >= 0) order.splice(oi, 1); order.push(key);
  return cache.get(key);
}
function dispose(inst) { inst?.dispose?.(); inst?.scene?.traverse(o => { o.geometry?.dispose?.(); }); }

function locate(t) {
  if (ONLY >= 0) return { i: ONLY, lt: Math.max(0, Math.min(t, SEGMENTS[ONLY].dur - 1e-4)) };
  t = Math.max(0, Math.min(TOTAL - 1e-4, t));
  for (let i = SEGMENTS.length - 1; i >= 0; i--) if (t >= SEGMENTS[i].start - 1e-6) return { i, lt: t - SEGMENTS[i].start };
  return { i: 0, lt: t };
}

let lastI = -1;
function renderAt(t) {
  const { i, lt } = locate(t);
  const seg = SEGMENTS[i];
  const inst = getInst(i);
  if (i !== lastI) { engine.applyPost(inst.post); lastI = i; }
  shared.uTime.value = lt + 10;
  inst.update?.(lt, core, seg);
  engine.setLens(1, 0, 0, 0, 0);
  if (inst.lens) { const L = inst.lens(lt); engine.setLens(L.zoom ?? 1, L.panX ?? 0, L.panY ?? 0, L.bars ?? 0, L.roll ?? 0); }
  // overlay
  let ov = null;
  const items = (seg.overlay || []).filter(o => lt >= (o.from ?? 0) && lt <= (o.to ?? 1e9));
  if (items.length) {
    ovG.setTransform(1, 0, 0, 1, 0, 0); ovG.clearRect(0, 0, W, H); ovG.setTransform(W / 1920, 0, 0, H / 1080, 0, 0);
    for (const o of items) drawOverlay(ovG, o, lt, seg);
    ovTex.needsUpdate = true; ov = ovTex;
  }
  const P = resolveFx(NOFX ? [] : [seg.fx, inst.fx], lt, seg.dur);
  fx.apply(P, ONLY >= 0 ? lt : t, ov);
  engine.render(inst.scene, inst.camera, lt);
}

window.__timeline = { total: TOTAL, only: ONLY, segs: SEGMENTS.map(s => ({ id: s.id, kind: s.kind, variant: s.variant, start: s.start, dur: s.dur, built: !!MODS[s.kind] })) };

const wrap = document.getElementById('wrap');
function fit() {
  if (RENDER) { stage.style.width = W + 'px'; stage.style.height = H + 'px'; return; }
  const vw = wrap ? wrap.clientWidth : innerWidth, vh = wrap ? wrap.clientHeight : innerHeight; const s = Math.min(vw / 16, vh / 9);
  stage.style.width = (16 * s) + 'px'; stage.style.height = (9 * s) + 'px';
}
fit(); addEventListener('resize', fit);

if (RENDER) {
  await document.fonts.load('900 100px MontserratLocal').catch(() => {});
  await document.fonts.ready;
  window.__render = async (t) => { renderAt(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return true; };
  window.__ready = true;
} else {
  await document.fonts.load('900 100px MontserratLocal').catch(() => {});
  const dur = ONLY >= 0 ? SEGMENTS[ONLY].dur : TOTAL;
  let t0 = performance.now(), paused = false, pausedAt = 0;
  const bar = document.getElementById('bar'), fill = document.getElementById('fill'), btn = document.getElementById('play');
  const setT = (t) => { t0 = performance.now() - t * 1000; if (paused) pausedAt = t; };
  const curT = () => paused ? pausedAt : ((performance.now() - t0) / 1000) % dur;
  btn.onclick = () => { paused = !paused; if (paused) pausedAt = curT(); else setT(pausedAt); btn.textContent = paused ? '▶' : '❚❚'; syncAudio(); };
  bar.onclick = (e) => { const r = bar.getBoundingClientRect(); setT((e.clientX - r.left) / r.width * dur); syncAudio(); };
  addEventListener('keydown', (e) => { if (e.code === 'Space') { btn.onclick(); e.preventDefault(); } });
  // prebuild progressively so cuts don't hitch
  let pre = 0; const prebuild = () => { if (pre < SEGMENTS.length) { getInst(pre++); setTimeout(prebuild, 30); } }; prebuild();
  const timeEl = document.getElementById('time'), segEl = document.getElementById('segname');
  const fmt = (x) => Math.floor(x / 60) + ':' + (x % 60).toFixed(1).padStart(4, '0');
  const audio = document.getElementById('music'), soundBtn = document.getElementById('sound');
  let soundOn = false;
  function syncAudio() { if (!audio || !soundOn) return; audio.currentTime = curT(); if (paused) audio.pause(); else audio.play().catch(() => {}); }
  if (audio && soundBtn && ONLY < 0) {
    soundBtn.hidden = false;
    soundBtn.onclick = () => { soundOn = !soundOn; soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off'; if (soundOn) syncAudio(); else audio.pause(); };
  }
  const loop = () => {
    let t = curT();
    if (audio && soundOn && !paused && !audio.paused) {
      const at = audio.currentTime % dur;
      if (Math.abs(at - t) > 0.06 && Math.abs(at - t) < dur - 0.2) setT(at);
      t = at;
    }
    renderAt(t); fill.style.width = (t / dur * 100) + '%';
    if (timeEl) timeEl.textContent = fmt(t) + ' / ' + fmt(dur);
    if (segEl) { const s = SEGMENTS[locate(t).i]; segEl.textContent = s.id + (MODS[s.kind] ? '' : ' (placeholder)'); }
    requestAnimationFrame(loop);
  };
  loop();
}
