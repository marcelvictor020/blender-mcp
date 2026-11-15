// g_card — character cards (variant: ren | aoi | collector). 1 bar each: band sweep in, silhouette slides in,
// giant vertical kanji slams, name tag, loud animated pattern background.
import { RED, CREAM, TEAL, INK, CRIMSON, LAT, fill, sweepBands, halftone, concentric, grid, stripes, kanji, vkanji, latin,
  silhouette, unionFill, SIL, glint, jar, wheel, seg, outExpo, outCubic, outBack, shake, marquee, lerp } from './gfx2d.js';
const KS = 0.26;   // kanji slam time
const CARDS = {
  ren: { no: '01', name: 'REN', kanji: '蓮', sub: 'AGE 17  ·  THE SHOP-HOUSE BOY', bg: RED, band: [INK, CREAM, TEAL], tagBg: CREAM, tagFg: INK, subFg: RED },
  aoi: { no: '02', name: 'AOI', kanji: '葵', sub: 'AGE 17  ·  SHE HEARS THE BELL', bg: TEAL, band: [CREAM, RED, INK], tagBg: CREAM, tagFg: INK, subFg: TEAL },
  collector: { no: '03', name: 'THE COLLECTOR', kanji: '蒐集者', sub: 'KEEPER OF SHADOWS IN JARS', bg: CREAM, band: [RED, INK, TEAL], tagBg: INK, tagFg: CREAM, subFg: RED },
};
export default {
  type: '2d',
  build(core, ctx) {
    const V = ctx.seg.variant || 'ren', C = CARDS[V] || CARDS.ren;
    return {
      fx: { grain: 0.035, crt: 0.2, vignette: 0.15,
        impacts: [{ t: KS, kind: 'flash', amt: 0.55, color: '#fff6e8' }],
        shakeHits: [{ t: KS, amt: 0.5, len: 0.2 }],
        keys: { ca: [[0, 0.012], [0.2, 0.002], [KS, 0.002], [KS + 0.01, 0.01], [KS + 0.2, 0.0015]] } },
      draw(g, t) {
        const [shx, shy] = shake(t, KS, 20);
        g.save(); g.translate(shx, shy);
        fill(g, C.bg);
        /* ---- pattern ---- */
        if (V === 'ren') {
          halftone(g, 46, INK, (X, Y) => (1920 - X) / 1920 * 0.55 + Y / 1080 * 0.6 - 0.35, { ox: t * 70, oy: -t * 30, angle: 0.4 });
          g.save(); g.beginPath(); g.moveTo(1040, -20); g.lineTo(1420, -20); g.lineTo(980, 1100); g.lineTo(600, 1100); g.closePath(); g.clip();
          stripes(g, [INK, RED], 22, -0.38, t * 120); g.restore();
        } else if (V === 'aoi') {
          concentric(g, 430, 640, 120, t * 1.3, CREAM, 0.3);
        } else {
          grid(g, 128, t * 64, t * 40, INK, 5, 0.0);
          g.fillStyle = RED; g.beginPath(); g.arc(780, 420, 360, 0, Math.PI * 2); g.fill();
          g.fillStyle = C.bg; for (let i = 0; i < 6; i++) g.fillRect(380, 560 + i * 34 + i * i * 2, 820, 8 + i * 3);
        }
        /* ---- giant kanji (slam) ---- */
        const pk = seg(t, KS - 0.07, KS);
        if (pk > 0) {
          const s = 1 + 1.6 * (1 - outExpo(pk)), a = Math.min(1, pk * 2.5);
          g.save(); g.translate(1490, 540); g.scale(s, s); g.translate(-1490, -540);
          if (V === 'collector') vkanji(g, C.kanji, 1450, 250, 285, { fill: INK, shadow: { dx: 16, dy: 16, color: RED }, gap: 1.06, alpha: a });
          else kanji(g, C.kanji, 1470, 500, 700, { fill: CREAM, shadow: { dx: 24, dy: 24, color: INK }, stroke: INK, strokeW: 8, bold: 0.018, alpha: a });
          g.restore();
        }
        /* ---- silhouette ---- */
        const ps = outExpo(seg(t, 0.06, 0.42));
        const slide = (1 - ps) * -520, zoom = 1 + 0.035 * t;
        const ghosts = ps < 0.98 ? [[0.25, 160], [0.4, 80]] : [];
        const drawSil = (dx, alpha) => {
          g.save(); g.globalAlpha = alpha; g.translate(dx, 0);
          if (V === 'ren') {
            silhouette(g, SIL.ren, 640, 470, 0.98 * zoom, { fill: INK, rim: CREAM, rx: 14, ry: -6 });
          } else if (V === 'aoi') {
            wheel(g, 430, 640, 390, t * 2.2, INK);
            silhouette(g, SIL.aoi, 860, 450, 0.98 * zoom, { fill: INK, rim: CREAM, rx: 13, ry: -6 });
            g.save(); g.translate(860, 450); g.scale(0.98 * zoom, 0.98 * zoom);
            g.strokeStyle = CREAM; SIL.aoiCollar(g); unionFill(g, SIL.aoiTie, RED); g.restore();
          } else {
            silhouette(g, SIL.collector, 720, 1082, 0.9 * zoom, { fill: INK, rim: RED, rx: -14, ry: -6 });
          }
          g.restore();
        };
        for (const [al, dx] of ghosts) drawSil(slide - dx, al * (1 - ps));
        drawSil(slide, 1);
        // details that need the final silhouette position
        if (V === 'ren') {
          const ga = seg(t, 0.55, 0.68) * (0.85 + 0.15 * Math.sin(t * 40));
          const s = 0.98 * zoom; glint(g, slide + 640 + 52 * s, 470 + 22 * s, 10 + 8 * seg(t, 0.55, 0.75), CRIMSON, ga);
        } else if (V === 'collector') {
          const s = 0.9 * zoom;
          jar(g, slide + 720 + 368 * s, 1082 - 350 * s, 0.76, t);
          const ea = seg(t, 0.5, 0.6);
          for (const ex of [-24, 22]) { g.globalAlpha = ea; g.fillStyle = CREAM; g.fillRect(slide + 720 + ex * s - 7, 1082 - 846 * s, 14, 6); }
          g.globalAlpha = 1;
        }
        /* ---- name tag ---- */
        const pt = outExpo(seg(t, 0.34, 0.5));
        if (pt > 0) {
          g.save(); g.translate((1 - pt) * -900, 0);
          const size = V === 'collector' ? 92 : 132;
          g.font = `900 ${size}px ${LAT}`;
          const w = [...C.name].reduce((a, c) => a + g.measureText(c).width + size * 0.12, 0) + 90;
          g.fillStyle = C.tagBg; g.beginPath(); g.moveTo(60, 842); g.lineTo(60 + w + 40, 842); g.lineTo(60 + w, 1002); g.lineTo(60, 1002); g.closePath(); g.fill();
          latin(g, C.name, 100, 922 + size * 0.36, size, { weight: 900, track: size * 0.12, fill: C.tagFg });
          g.fillStyle = INK; g.fillRect(60, 790, 460, 44);
          latin(g, 'CHARACTER  ' + C.no, 80, 822, 24, { weight: 800, track: 6, fill: CREAM });
          latin(g, C.sub, 66, 1040, 22, { weight: 800, track: 5, fill: V === 'collector' ? INK : CREAM });
          g.restore();
        }
        // number badge
        latin(g, C.no, 1860, 140, 120, { weight: 900, fill: 'rgba(0,0,0,0)', stroke: V === 'collector' ? INK : CREAM, strokeW: 3, align: 'right' });
        g.restore();
        marquee(g, 0, 40, INK, C.bg === CREAM ? CREAM : C.bg, C.name + '  ·  ' + C.kanji + '  ·  KAGERŌ  ·', t * 240, 20);
        /* ---- band sweep in (transition) ---- */
        sweepBands(g, t / 0.34, C.band, { bw: 300, stagger: 0.12, dur: 0.6 });
      },
    };
  },
};
