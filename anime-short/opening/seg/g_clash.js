// g_clash — 2-beat graphic hits for the CLASH: 'leap' (Ren's kage-oni aura on cream with speed lines) /
// 'final' (red sky, towering kagerō vs. oni silhouette, white impact star, giant 影).
import { RED, CREAM, TEAL, INK, CRIMSON, fill, speedLines, silhouette, SIL, glint, kanji, latin, seg, outExpo, shake, hash } from './gfx2d.js';
export default {
  type: '2d',
  build(core, ctx) {
    const V = ctx.seg.variant || 'leap';
    return {
      fx: V === 'final'
        ? { grain: 0.05, crt: 0.2, impacts: [{ t: 0, kind: 'invert' }, { t: 0.375, kind: 'bw' }, { t: 0.375 + 1 / 24, kind: 'invert' }], shakeHits: [{ t: 0.375, amt: 1.4, len: 0.37 }], glitchHits: [{ t: 0.375, amt: 0.7, len: 0.15 }], ca: 0.004 }
        : { grain: 0.05, crt: 0.15, impacts: [{ t: 0, kind: 'invert' }], shakeHits: [{ t: 0, amt: 1, len: 0.3 }], ca: 0.003 },
      draw(g, t) {
        if (V === 'leap') {
          const [sx, sy] = shake(t, 0, 30, 0.4);
          fill(g, CREAM);
          speedLines(g, 1000, 470, t, INK, { n: 160, inner: 380, density: 0.55, width: 0.012 });
          const s = 1.05 + 0.25 * outExpo(seg(t, 0, 0.6));
          g.save(); g.translate(sx, sy);
          silhouette(g, SIL.oniAura, 1000, 520, s, { fill: INK, rim: RED, rx: 0, ry: -16, t });
          silhouette(g, SIL.ren, 1000, 520, s, { fill: INK, rim: RED, rx: 12, ry: -6 });
          glint(g, 1000 + 52 * s, 520 + 22 * s, 16, CRIMSON, 1);
          g.restore();
          kanji(g, '鬼', 260, 540, 420, { fill: RED, shadow: { dx: 16, dy: 16, color: INK }, alpha: 0.95 });
        } else {
          const [sx, sy] = shake(t, 0.375, 40, 0.37);
          g.save(); g.translate(sx, sy);
          fill(g, RED);
          kanji(g, '影', 960, 520, 980, { fill: '#a3121d', bold: 0.04 });
          speedLines(g, 960, 540, t, INK, { n: 140, inner: 300, density: 0.5, width: 0.01 });
          // towering kagerō, wavering
          g.save(); g.translate(1420, 980); g.scale(1.05, 1.05); g.globalAlpha = 0.95;
          g.fillStyle = '#2a0508'; g.beginPath(); SIL.kagero(g, t); g.fill();
          g.restore();
          for (let i = 0; i < 7; i++) glint(g, 1300 + hash(i) * 260, 300 + hash(i + 9) * 420, 6, CREAM, 0.9);
          // impact star
          const p = seg(t, 0.375, 0.45);
          if (p > 0) {
            g.save(); g.translate(980, 560); g.rotate(hash(Math.floor(t * 24)) * 0.4); g.fillStyle = '#fffaf0';
            g.beginPath(); const n = 14;
            for (let k = 0; k < n * 2; k++) { const a = k / (n * 2) * Math.PI * 2, r = (k % 2 ? 90 : 420 + 200 * hash(k)) * (0.6 + 0.6 * outExpo(p)); k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
            g.closePath(); g.fill(); g.restore();
          }
          silhouette(g, SIL.oniAura, 520, 600, 0.95, { fill: INK, rim: CREAM, rx: 10, ry: -10, t });
          silhouette(g, SIL.ren, 520, 600, 0.95, { fill: INK });
          glint(g, 520 + 50, 600 + 21, 14, CRIMSON, 1);
          g.restore();
        }
      },
    };
  },
};
