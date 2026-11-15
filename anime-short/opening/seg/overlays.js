// Overlay items drawn on top of any segment (composited in the FX pass, so glitch/CRT affect them too).
// { kind: 'timecode', text, from, to } · { kind: 'credit', role, name, from, to, pos: 'bl'|'br' } · { kind: 'label', text }
import { RED, CREAM, INK, latin, seg, outExpo } from './gfx2d.js';
export function drawOverlay(g, o, lt, segm) {
  const from = o.from ?? 0, to = o.to ?? segm.dur;
  const a = Math.min(seg(lt, from, from + 0.3), 1 - seg(lt, to - 0.3, to));
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  if (o.kind === 'timecode') {
    const blink = Math.floor((lt + segm.start) / 0.375) % 2 === 0;
    g.fillStyle = RED; g.beginPath(); g.arc(112, 968, 10, 0, Math.PI * 2); if (blink) g.fill();
    const txt = o.text || '16:44';
    latin(g, txt, 136, 984, 42, { weight: 600, track: 10, fill: CREAM, shadow: { dx: 2, dy: 2, color: 'rgba(0,0,0,0.5)' } });
    latin(g, 'HINODE-CHŌ', 138, 1018, 16, { weight: 700, track: 8, fill: 'rgba(242,230,200,0.75)' });
  } else if (o.kind === 'credit') {
    const p = outExpo(seg(lt, from, from + 0.2));
    const right = o.pos === 'br';
    g.translate(right ? (1 - p) * 800 : (1 - p) * -800, 0);
    const x = right ? 1860 : 60;
    g.fillStyle = RED; g.fillRect(right ? x - 520 : x, 880, 520, 50);
    latin(g, o.role || '', right ? x - 500 : x + 20, 915, 26, { weight: 800, track: 7, fill: CREAM });
    g.fillStyle = INK; g.fillRect(right ? x - 620 : x, 932, 620, 96);
    latin(g, o.name || '', right ? x - 600 : x + 20, 1002, 64, { weight: 900, track: 6, fill: CREAM });
  } else if (o.kind === 'label') {
    latin(g, o.text || segm.id, 60, 80, 30, { weight: 700, track: 4, fill: CREAM });
  }
  g.restore();
}
