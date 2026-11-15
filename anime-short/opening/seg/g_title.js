// g_title — DROP: diagonal stripe cover-wipes (red / teal / black / cream), then 「陽炎」 slams in kanji by kanji,
// the KAGERŌ bar slams on beat 3, sunburst + hazard corners, impact frames and decaying shake.
import { RED, CREAM, TEAL, INK, LAT, fill, coverWipe, sunburst, stripes, kanji, latin, seg, outExpo, outBack, shake, marquee, halftone } from './gfx2d.js';
const K1 = 0.375, K2 = 0.47, KB = 0.75;
export default {
  type: '2d',
  build() {
    return {
      fx: {
        crt: 0.35, grain: 0.035, vignette: 0.18,
        impacts: [{ t: K1, kind: 'invert' }, { t: K2, kind: 'flash', amt: 0.85 }, { t: KB, kind: 'bw' }, { t: KB + 1 / 24, kind: 'invert' }],
        keys: { ca: [[0, 0.002], [K1, 0.002], [K1 + 0.01, 0.014], [K1 + 0.2, 0.002], [KB, 0.002], [KB + 0.01, 0.016], [KB + 0.25, 0.002]] },
        glitchHits: [{ t: K1, amt: 0.6, len: 0.1 }, { t: KB, amt: 0.8, len: 0.14 }],
      },
      draw(g, t) {
        if (t < K1) {   // stripe cover-wipes
          fill(g, INK);
          coverWipe(g, t / K1, [RED, TEAL, INK, CREAM], { stagger: 0.2, span: 0.42, shear: 520 });
          return;
        }
        const [sx1, sy1] = shake(t, K1, 26), [sx2, sy2] = shake(t, K2, 22), [sx3, sy3] = shake(t, KB, 34);
        const z = 1.0 + 0.035 * (t - K1);
        g.save();
        g.translate(960 + sx1 + sx2 + sx3, 540 + sy1 + sy2 + sy3); g.scale(z, z); g.translate(-960, -540);
        fill(g, CREAM);
        sunburst(g, 960, 520, 18, -0.4 + t * 0.35, RED);
        // halftone fade toward the centre (keeps the kanji readable)
        halftone(g, 34, CREAM, (X, Y) => Math.min(1, Math.hypot(X - 960, (Y - 520) * 1.6) / 900 - 0.25), { ox: t * 40 });
        // hazard corners
        for (const [cx, cy, s] of [[0, 0, 1], [1920, 1080, -1]]) {
          g.save(); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + s * 560, cy); g.lineTo(cx, cy + s * 330); g.closePath(); g.clip();
          stripes(g, [INK, TEAL], 46, -0.55, t * 220 * s); g.restore();
        }
        // central disc
        const dS = outBack(seg(t, K1, K1 + 0.12), 2.2);
        g.save(); g.translate(960, 520); g.scale(dS, dS);
        g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 352, 0, Math.PI * 2); g.fill();
        g.fillStyle = CREAM; g.beginPath(); g.arc(0, 0, 334, 0, Math.PI * 2); g.fill();
        g.fillStyle = RED; g.beginPath(); g.arc(0, 0, 300, 0, Math.PI * 2); g.fill();
        g.restore();
        // 陽 炎 slams
        const slam = (ch, x, t0, rot) => {
          const p = seg(t, t0, t0 + 0.075); if (p <= 0) return;
          const s = 1 + 2.4 * (1 - outExpo(p));
          g.save(); g.translate(x, 500); g.scale(s, s); g.rotate(rot * (1 - p));
          kanji(g, ch, 0, 0, 430, { fill: INK, stroke: CREAM, strokeW: 16, shadow: { dx: 22, dy: 22, color: INK }, bold: 0.035, alpha: Math.min(1, p * 3) });
          g.restore();
        };
        slam('陽', 745, K1, -0.25); slam('炎', 1175, K2, 0.25);
        // KAGERŌ bar
        const pb = outExpo(seg(t, KB, KB + 0.09));
        if (pb > 0) {
          const off = (1 - pb) * 2200;
          g.save(); g.translate(off, 0);
          g.fillStyle = INK; g.beginPath(); g.moveTo(380, 790); g.lineTo(1600, 790); g.lineTo(1560, 930); g.lineTo(340, 930); g.closePath(); g.fill();
          g.fillStyle = RED; g.beginPath(); g.moveTo(1610, 790); g.lineTo(1700, 790); g.lineTo(1660, 930); g.lineTo(1570, 930); g.closePath(); g.fill();
          latin(g, 'KAGERŌ', 970, 906, 132, { weight: 900, track: 46, fill: CREAM, align: 'center' });
          g.restore();
          latin(g, 'TV ANIMATION  —  ORIGINAL', 400, 970, 26, { weight: 800, track: 7, fill: INK });
        }
        g.restore();
        // top/bottom marquees
        marquee(g, 0, 44, INK, CREAM, 'HINODE-CHŌ  ·  16:44  ·  陽炎  ·  KAGERŌ  ·', t * 260, 22);
        marquee(g, 1036, 44, RED, CREAM, 'SUMMER NEVER ENDS  ·  THE BELL RINGS AT 4:44  ·', -t * 300, 22);
      },
    };
  },
};
