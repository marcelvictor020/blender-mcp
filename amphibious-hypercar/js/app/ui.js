// DOM bindings for the exhibition interface.
import { PAINTS, FINISHES, LEATHERS, TRIMS, WHEEL_FINISHES, LIGHTS } from '../vehicle/materials.js';
import { WHEEL_STYLES } from '../vehicle/wheel.js';
import { DESIGNS } from '../vehicle/designs.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(app) {
    this.app = app;
    this._toastT = 0;
    this._buildModels();
    this._buildConfig();
    this._bindViews();
    this._bindTimeline();
    this._bindPanel();
    this._bindInspect();
    this._bindSystems();
    this._bindEnv();
    this._bindTouch();
  }

  _buildModels() {
    const nav = $('models');
    DESIGNS.forEach((d, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<b>${d.name}</b><small>${['Grand tourer', 'Track hypercar', 'Speedster'][i]}</small>`;
      b.onclick = () => this.app.selectDesign(i);
      nav.appendChild(b);
    });
  }

  setDesign(i) {
    const d = DESIGNS[i];
    [...$('models').children].forEach((b, k) => b.classList.toggle('on', k === i));
    $('model-name').textContent = d.name;
    $('model-tagline').textContent = d.tagline;
    $('model-specs').innerHTML = d.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    this.syncConfig();
  }

  _swatches(el, list, onPick, cls = '') {
    el.innerHTML = '';
    list.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'sw ' + cls;
      b.style.background = p.color;
      b.title = p.name;
      b.setAttribute('aria-label', p.name);
      b.dataset.id = p.id;
      b.onclick = () => onPick(p);
      el.appendChild(b);
    });
  }
  _chips(el, list, onPick) {
    el.innerHTML = '';
    list.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = p.name;
      b.dataset.id = p.id;
      b.onclick = () => onPick(p);
      el.appendChild(b);
    });
  }

  _buildConfig() {
    const a = this.app;
    this._swatches($('paints'), PAINTS, (p) => { a.cfg.paint = p.id; a.applyConfig(); });
    this._chips($('finishes'), FINISHES, (p) => { a.cfg.finish = p.id; a.applyConfig(); });
    this._chips($('wheel-styles'), Object.entries(WHEEL_STYLES).map(([id, s]) => ({ id, name: s.name })), (p) => { a.cfg.wheelStyle = p.id; a.applyConfig(); });
    this._swatches($('wheel-finishes'), WHEEL_FINISHES, (p) => { a.cfg.wheelFinish = p.id; a.applyConfig(); });
    this._swatches($('leathers'), LEATHERS, (p) => { a.cfg.leather = p.id; a.applyConfig(); });
    this._chips($('trims'), TRIMS, (p) => { a.cfg.trim = p.id; a.applyConfig(); });
    this._chips($('light-colors'), LIGHTS, (p) => { a.cfg.light = p.id; a.applyConfig(); });
    $('headlights').onclick = () => { a.cfg.headlights = !a.cfg.headlights; a.applyConfig(); };
    $('ambient').onclick = () => { a.cfg.ambient = !a.cfg.ambient; a.applyConfig(); };
  }

  syncConfig() {
    const c = this.app.cfg;
    const mark = (id, val) => [...$(id).children].forEach((b) => b.classList.toggle('on', b.dataset.id === val));
    mark('paints', c.paint); mark('finishes', c.finish); mark('wheel-styles', c.wheelStyle);
    mark('wheel-finishes', c.wheelFinish); mark('leathers', c.leather); mark('trims', c.trim); mark('light-colors', c.light);
    $('headlights').classList.toggle('on', !!c.headlights);
    $('ambient').classList.toggle('on', !!c.ambient);
  }

  _bindViews() {
    $('views').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.app.setView(b.dataset.view);
    });
    $('tour').onclick = () => this.app.toggleTour();
  }

  setView(v) {
    [...$('views').children].forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    const driving = v !== 'showcase' || !this.app.pinned;
    $('telemetry').hidden = !driving;
    $('keys').hidden = !(v === 'drive' || v === 'cockpit');
    $('touch').hidden = !(matchMedia('(pointer: coarse)').matches && (v === 'drive' || v === 'cockpit'));
  }

  setTour(on) { $('tour').classList.toggle('on', on); }

  _bindTimeline() {
    const a = this.app;
    $('tl-marine').onclick = () => a.sequence(1);
    $('tl-road').onclick = () => a.sequence(-1);
    $('tl-pause').onclick = () => a.togglePause();
    $('tl-foil').onclick = () => a.toggleFoils();
    const track = $('tl-track');
    let drag = false;
    const scrub = (e) => {
      const r = track.getBoundingClientRect();
      a.scrub(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    };
    track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); scrub(e); });
    track.addEventListener('pointermove', (e) => { if (drag) scrub(e); });
    track.addEventListener('pointerup', () => { drag = false; });
  }

  _bindPanel() {
    const panel = $('panel');
    panel.querySelector('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      panel.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      panel.querySelectorAll('.tab-body').forEach((x) => x.classList.toggle('on', x.dataset.body === b.dataset.tab));
    });
    $('panel-toggle').onclick = () => panel.classList.toggle('collapsed');
    if (window.innerWidth < 860) panel.classList.add('collapsed');
  }

  _bindInspect() {
    const a = this.app;
    document.querySelectorAll('[data-toggle]').forEach((b) => {
      b.onclick = () => { const k = b.dataset.toggle; a.toggleBody(k); };
    });
    $('cutaway').oninput = (e) => a.setCutaway(+e.target.value);
    $('explode').oninput = (e) => a.setExplode(+e.target.value);
    $('xray').onclick = () => { a.cfg.xray = !a.cfg.xray; $('xray').classList.toggle('on', a.cfg.xray); a.car.M.setXray(a.cfg.xray); };
    $('labels-toggle').onclick = () => { a.labelsOn = !a.labelsOn; $('labels-toggle').classList.toggle('on', a.labelsOn); };
  }

  syncBody() {
    const s = this.app.targets;
    document.querySelectorAll('[data-toggle]').forEach((b) => b.classList.toggle('on', s[b.dataset.toggle] > 0.5));
  }

  _bindSystems() {
    const a = this.app;
    const sys = [['sponson', 'Sponson hulls'], ['arm', 'Telescopic arms'], ['yaw', 'Pod rotation'], ['impeller', 'Impellers + ducts'], ['foil', 'Hydrofoils'], ['ride', 'Foil ride height']];
    const el = $('systems');
    this.sysBars = {};
    for (const [k, name] of sys) {
      const label = document.createElement('span');
      label.textContent = name;
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = 'Cycle';
      b.onclick = () => a.toggleSystem(k);
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = '<i></i>';
      el.append(label, b, bar);
      this.sysBars[k] = bar.firstChild;
    }
    $('seq-speed').oninput = (e) => { a.seqSpeed = +e.target.value; };
    $('auto-transform').onclick = () => { a.autoTransform = !a.autoTransform; $('auto-transform').classList.toggle('on', a.autoTransform); };
    $('auto-foil').onclick = () => { a.autoFoil = !a.autoFoil; $('auto-foil').classList.toggle('on', a.autoFoil); };
  }

  _bindEnv() {
    const a = this.app;
    const fmt = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    $('tod').oninput = (e) => { a.setHour(+e.target.value); $('tod-out').textContent = fmt(+e.target.value); };
    const seaName = (v) => (v < 0.15 ? 'Glassy' : v < 0.35 ? 'Calm' : v < 0.6 ? 'Moderate' : v < 0.8 ? 'Choppy' : 'Rough');
    $('sea').oninput = (e) => { a.setSea(+e.target.value); $('sea-out').textContent = seaName(+e.target.value); };
    $('clarity').oninput = (e) => a.setClarity(+e.target.value);
    $('q-high').onclick = () => { a.setQuality(1); $('q-high').classList.add('on'); $('q-bal').classList.remove('on'); };
    $('q-bal').onclick = () => { a.setQuality(0); $('q-bal').classList.add('on'); $('q-high').classList.remove('on'); };
    $('day-cycle').onclick = () => { a.dayCycle = !a.dayCycle; $('day-cycle').classList.toggle('on', a.dayCycle); };
    this.fmtHour = fmt;
  }

  syncHour(h) { $('tod').value = h; $('tod-out').textContent = this.fmtHour(h); }

  _bindTouch() {
    const a = this.app;
    document.querySelectorAll('#touch button').forEach((b) => {
      const k = b.dataset.k;
      const on = (v) => (e) => { e.preventDefault(); a.touch[k] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', on(true));
      b.addEventListener('pointerup', on(false));
      b.addEventListener('pointerleave', on(false));
      b.addEventListener('pointercancel', on(false));
    });
  }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // per-frame refresh (cheap)
  frame(state) {
    const p = state.master;
    $('tl-fill').style.width = (p * 100).toFixed(1) + '%';
    $('tl-handle').style.left = (p * 100).toFixed(1) + '%';
    const st = $('tl-stage');
    st.textContent = state.stageText;
    st.classList.toggle('marine', p > 0.5);
    $('tl-pause').classList.toggle('on', state.paused);
    $('tl-foil').classList.toggle('on', state.foil);
    $('tl-foil').classList.add('marine');
    for (const k in this.sysBars) this.sysBars[k].style.width = ((state.sys[k] || 0) * 100).toFixed(0) + '%';
  }

  telemetry(t) {
    $('t-speed').textContent = t.speedText;
    $('t-unit').textContent = t.unit;
    const m = $('t-mode');
    m.textContent = t.mode;
    m.classList.toggle('marine', t.marine);
    $('t-ride').textContent = t.ride;
    $('t-depth').textContent = t.depth;
    $('t-hdg').textContent = t.hdg;
    $('t-thrust').textContent = t.thrust;
  }

  loading(frac, text) {
    $('loading-bar').style.width = (frac * 100).toFixed(0) + '%';
    if (text) $('loading-text').textContent = text;
    if (frac >= 1) setTimeout(() => $('loading').classList.add('done'), 250);
  }
}
