// g_coldopen — black; crossing lights blink "kan-kan" on the half-beat; small timecode 16:44.
import { CREAM, INK, LAT, fill, latin, seg, glint } from './gfx2d.js';
export default {
  type: '2d',
  build() {
    return {
      fx: { grain: 0.06, vignette: 0.4, crt: 0.15 },
      draw(g, t) {
        fill(g, '#050406');
        const on = Math.floor(t / 0.1875) % 2;   // half-beat alternation
        const a = seg(t, 0.05, 0.25);
        for (const [i, x] of [[0, 900], [1, 1020]]) {
          const lit = (i === on) ? a : 0.08 * a;
          g.fillStyle = '#1a1416'; g.beginPath(); g.arc(x, 430, 34, 0, Math.PI * 2); g.fill();
          if (lit > 0.1) {
            const grd = g.createRadialGradient(x, 430, 2, x, 430, 120);
            grd.addColorStop(0, `rgba(255,70,60,${lit})`); grd.addColorStop(0.25, `rgba(220,30,40,${0.5 * lit})`); grd.addColorStop(1, 'rgba(200,20,30,0)');
            g.fillStyle = grd; g.beginPath(); g.arc(x, 430, 120, 0, Math.PI * 2); g.fill();
            g.fillStyle = `rgba(255,200,190,${lit})`; g.beginPath(); g.arc(x, 430, 22, 0, Math.PI * 2); g.fill();
          }
        }
        g.fillStyle = '#211a1c'; g.fillRect(956, 470, 8, 120); g.fillRect(880, 470, 160, 8);
        // ×-shaped crossing sign
        g.save(); g.translate(960, 330); g.fillStyle = `rgba(242,230,200,${0.5 * a})`;
        for (const r of [0.5, -0.5]) { g.save(); g.rotate(r); g.fillRect(-90, -9, 180, 18); g.restore(); }
        g.restore();
        const ta = seg(t, 0.35, 0.6);
        g.globalAlpha = ta;
        const colon = Math.floor(t / 0.375) % 2 ? ':' : ' ';
        latin(g, '16' + colon + '44', 960, 700, 64, { weight: 600, track: 18, fill: CREAM, align: 'center' });
        latin(g, 'HINODE-CHŌ', 960, 760, 20, { weight: 700, track: 12, fill: 'rgba(242,230,200,0.6)', align: 'center' });
        g.globalAlpha = 1;
      },
    };
  },
};
