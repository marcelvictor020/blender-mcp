// g_logo — OUTRO end card: red sun rises, 「陽炎」 slams, KAGERŌ wipes in, heat-haze shimmer, CRT power-off.
import { RED, CREAM, TEAL, INK, fill, kanji, latin, seg, outExpo, outCubic, shake } from './gfx2d.js';
const KS = 0.75, KB = 1.125, OFF0 = 2.3, OFF1 = 2.85;
export default {
  type: '2d',
  build() {
    return {
      fx: (lt) => ({ crt: 1, grain: 0.045, vignette: 0.1, haze: lt < OFF0 ? 1 : 0,
        power: Math.max(0, Math.min(1, (lt - OFF0) / (OFF1 - OFF0))),
        impacts: [{ t: KS, kind: 'flash', amt: 0.8, color: '#fff2dc' }, { t: KS + 1 / 24, kind: 'invert' }],
        shakeHits: [{ t: KS, amt: 0.8, len: 0.3 }], ca: lt > KS && lt < KS + 0.2 ? 0.01 : 0.0025 }),
      draw(g, t) {
        fill(g, '#0b0910');
        const [sx, sy] = shake(t, KS, 16);
        g.save(); g.translate(sx, sy);
        // sun with retro horizontal cuts
        const rise = outCubic(seg(t, 0, 0.7));
        const cy = 1000 - 540 * rise, R = 300;
        g.save(); g.beginPath(); g.rect(0, 0, 1920, 760); g.clip();
        const grd = g.createRadialGradient(960, cy, R * 0.8, 960, cy, R * 2.4);
        grd.addColorStop(0, 'rgba(212,32,44,0.35)'); grd.addColorStop(1, 'rgba(212,32,44,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 1920, 1080);
        g.fillStyle = RED; g.beginPath(); g.arc(960, cy, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0b0910';
        for (let i = 0; i < 7; i++) { const y = cy + 40 + i * 38; g.fillRect(600, y, 720, 4 + i * 3.2); }
        g.restore();
        // horizon line
        g.fillStyle = CREAM; g.fillRect(260, 760, 1400, 4);
        // kanji slam
        const pk = seg(t, KS - 0.07, KS);
        if (pk > 0) {
          const s = 1 + 1.8 * (1 - outExpo(pk));
          g.save(); g.translate(960, 470); g.scale(s, s);
          kanji(g, '陽炎', 0, 0, 330, { fill: CREAM, stroke: '#0b0910', strokeW: 14, shadow: { dx: 0, dy: 0, color: '#0b0910' }, alpha: Math.min(1, pk * 2) });
          g.restore();
        }
        // KAGERŌ wipe reveal
        const pb = outExpo(seg(t, KB, KB + 0.3));
        if (pb > 0) {
          g.save(); g.beginPath(); g.rect(960 - 700 * pb, 780, 1400 * pb, 200); g.clip();
          latin(g, 'KAGERŌ', 960, 900, 118, { weight: 900, track: 58, fill: CREAM, align: 'center' });
          g.restore();
        }
        const pa = seg(t, 1.5, 1.8);
        g.globalAlpha = pa;
        latin(g, 'AN ORIGINAL ANIMATION', 960, 975, 24, { weight: 700, track: 12, fill: 'rgba(242,230,200,0.75)', align: 'center' });
        latin(g, 'HINODE-CHŌ  16:44', 960, 1015, 18, { weight: 700, track: 10, fill: RED, align: 'center' });
        g.globalAlpha = 1;
        g.restore();
      },
    };
  },
};
