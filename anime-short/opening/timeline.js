// 陽炎 KAGERŌ opening — 48.0 s timeline on the 160 BPM grid (1 beat = 0.375 s, 1 bar = 1.5 s).
// Each entry: { kind, beats, id?, variant?, fx?, overlay?, ...opts }. start/dur (seconds) are computed below.
//   kind 'g_*'     -> 2D graphic segment, module opening/seg/<kind>.js
//   kind 'world_*' -> 3D world segment,  module opening/seg/<kind>.js (placeholder scene until it exists)
// `variant` is passed through ctx.seg.variant (and instances are cached per kind+variant).
import { BEAT, snares, beatTimes } from './fx.js';

const S = [
  /* ---- COLD OPEN  bars 1–4  (0–6 s) ---- */
  { kind: 'g_coldopen', beats: 4 },
  { kind: 'world_town_high', beats: 12, overlay: [{ kind: 'timecode', text: '16:44', from: 0, to: 4.3 }],
    fx: { grade: 'golden', gradeMix: 0.5, grain: 0.03, keys: { fade: [[0, 1], [0.5, 0]] } } },
  /* ---- WORLD  bars 5–8  (6–12 s): beat-cut montage ---- */
  { kind: 'world_vending', beats: 4, fx: { grade: 'dusk', gradeMix: 0.4, grain: 0.03 } },
  { kind: 'world_meadow_egret', beats: 4, fx: { grain: 0.03 } },
  { kind: 'world_lantern', beats: 4, fx: { grade: 'dusk', gradeMix: 0.3, grain: 0.03 } },
  { kind: 'world_coupe', beats: 4, fx: { grade: 'night', gradeMix: 0.5, grain: 0.035,
    keys: { ca: [[0, 0], [1.1, 0.004], [1.5, 0.012]], glitch: [[0, 0], [1.2, 0], [1.5, 0.5]] }, impacts: [{ t: 1.5 - 1 / 24, kind: 'flash' }] } },
  /* ---- DROP + TITLE  bars 9–12  (12–18 s) ---- */
  { kind: 'g_title', beats: 4 },
  { kind: 'g_card', id: 'card_ren', variant: 'ren', beats: 4 },
  { kind: 'g_card', id: 'card_aoi', variant: 'aoi', beats: 4 },
  { kind: 'g_card', id: 'card_collector', variant: 'collector', beats: 4 },
  /* ---- THE TURN  bars 13–20  (18–30 s) ---- */
  { kind: 'world_bloodsky', beats: 8, fx: (lt) => ({ grade: 'blood', gradeMix: Math.min(1, lt / 2.2) * 0.5, grain: 0.04, vignette: 0.25 }) },
  { kind: 'world_shadow_creature', beats: 8, fx: { grade: 'blood', gradeMix: 0.35, grain: 0.04, vignette: 0.3 } },
  { kind: 'world_ghost_train', beats: 4, fx: { grade: 'blood', gradeMix: 0.3, grain: 0.04 } },
  { kind: 'world_crossing_gate', beats: 4, fx: { grade: 'blood', gradeMix: 0.3, grain: 0.04 } },
  { kind: 'world_eye', beats: 8, fx: { grain: 0.04, vignette: 0.35, ca: 0.002 } , snareGlitch: true },
  /* ---- CLASH  bars 21–28  (30–42 s): cuts every 2 beats, credits on colour blocks ---- */
  { kind: 'world_ren_overpass', beats: 4, variant: 'a', clash: true },
  { kind: 'g_credit', beats: 2, role: 'DIRECTOR', name: 'OPUS 5.5', scheme: 'red' },
  { kind: 'world_kagero_giant', beats: 4, variant: 'a', clash: true },
  { kind: 'g_credit', beats: 2, role: 'STORYBOARD', name: 'YOUR NAME', scheme: 'teal' },
  { kind: 'world_ren_overpass', beats: 2, variant: 'aura', clash: true },
  { kind: 'world_kagero_giant', beats: 2, variant: 'close', clash: true },
  { kind: 'g_credit', beats: 2, role: 'MUSIC', name: 'OPUS 5.5', scheme: 'cream' },
  { kind: 'g_clash', beats: 2, variant: 'leap' },
  { kind: 'world_ren_overpass', beats: 2, variant: 'leap', clash: true },
  { kind: 'g_credit', beats: 2, role: 'ANIMATION', name: 'YOUR NAME', scheme: 'black' },
  { kind: 'world_kagero_giant', beats: 4, variant: 'strike', clash: true },
  { kind: 'g_credit', beats: 2, role: 'PRODUCED BY', name: 'OPUS 5.5', scheme: 'teal' },
  { kind: 'g_clash', beats: 2, variant: 'final' },
  /* ---- OUTRO  bars 29–32  (42–48 s) ---- */
  { kind: 'world_meadow_birds', beats: 8, fx: { grain: 0.03, keys: { fade: [[0, 0.6], [0.3, 0]] } } },
  { kind: 'g_logo', beats: 8 },
];

let acc = 0;
const counts = {};
for (const s of S) {
  s.start = +(acc * BEAT).toFixed(4); s.dur = +(s.beats * BEAT).toFixed(4); acc += s.beats;
  counts[s.kind] = (counts[s.kind] || 0) + 1;
  if (!s.id) s.id = s.kind + (s.variant && s.variant !== 'a' ? '_' + s.variant : '');
}
// make ids unique (credits etc.)
const seen = {};
for (const s of S) { if (seen[s.id] !== undefined) { seen[s.id]++; s.id += '_' + seen[s.id]; } else seen[s.id] = 0; }

// CLASH world cuts: invert frame on the cut, b/w frame on the off-beat, shake on the downbeat, light speed lines.
for (const s of S) {
  if (s.clash) {
    const base = s.fx || {};
    s.fx = { grain: 0.05, vignette: 0.25, ca: 0.0025, speed: 0.35, ...base,
      impacts: [{ t: 0, kind: 'invert' }, ...beatTimes(s.start, s.dur, 2, 1).map(t => ({ t, kind: 'bw' }))],
      shakeHits: [{ t: 0, amt: 1.2, len: 0.3 }],
      glitchHits: snares(s.start, s.dur).map(t => ({ t, amt: 0.5, len: 0.12 })) };
  }
  if (s.snareGlitch) {
    s.fx = { ...(s.fx || {}), glitchHits: snares(s.start, s.dur).map(t => ({ t, amt: 0.9, len: 0.16 })),
      shakeHits: snares(s.start, s.dur).map(t => ({ t, amt: 0.4, len: 0.15 })) };
  }
}

export const SEGMENTS = S;
export const TOTAL = +(acc * BEAT).toFixed(4);   // 48.0
