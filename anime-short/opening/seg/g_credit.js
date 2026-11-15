// g_credit — CLASH pop-typography credit card (2 beats): slanted colour band, role tag, giant name slam, vertical kanji role.
// opts on the timeline entry: role, name, scheme: red | teal | cream | black
import { RED, CREAM, TEAL, INK, fill, stripes, halftone, kanji, vkanji, latin, seg, outExpo, shake, speedLines, sweepBands } from './gfx2d.js';
const SCHEMES = {
  red:   { b: INK, a: RED, name: CREAM, shadow: INK, tagBg: CREAM, tagFg: INK, acc: TEAL, kj: RED },
  teal:  { b: CREAM, a: TEAL, name: CREAM, shadow: INK, tagBg: INK, tagFg: CREAM, acc: RED, kj: TEAL },
  cream: { b: RED, a: CREAM, name: INK, shadow: RED, tagBg: INK, tagFg: CREAM, acc: TEAL, kj: INK },
  black: { b: TEAL, a: INK, name: CREAM, shadow: RED, tagBg: RED, tagFg: CREAM, acc: CREAM, kj: INK },
};
const ROLE_JP = { 'DIRECTOR': '監督', 'STORYBOARD': '絵コンテ', 'MUSIC': '音楽', 'ANIMATION': '作画', 'PRODUCED BY': '制作',
  'CHARACTER DESIGN': '人物', 'ART DIRECTOR': '美術', 'SCREENPLAY': '脚本', 'CREATED BY': '原作' };
export default {
  type: '2d',
  build(core, ctx) {
    const S = ctx.seg, C = SCHEMES[S.scheme] || SCHEMES.red;
    const role = S.role || 'DIRECTOR', name = S.name || 'OPUS 5.5', jp = ROLE_JP[role] || '';
    const flip = (ctx.seg.start / 0.75) % 2 > 0.5 ? -1 : 1;   // alternate the slant between consecutive credits
    return {
      fx: { grain: 0.04, crt: 0.25, impacts: [{ t: 0, kind: 'invert' }, { t: 0.13, kind: 'flash', amt: 0.4 }], shakeHits: [{ t: 0.12, amt: 0.6, len: 0.25 }],
        keys: { ca: [[0, 0.016], [0.12, 0.003], [0.13, 0.012], [0.35, 0.002]] } },
      draw(g, t) {
        const [sx, sy] = shake(t, 0.12, 22);
        g.save(); g.translate(sx, sy);
        fill(g, C.b);
        stripes(g, [C.b, C.acc], 34, -0.5 * flip, t * 400);
        g.globalAlpha = 0.9; g.fillStyle = C.b; g.fillRect(0, 0, 1920, 1080); g.globalAlpha = 1;
        speedLines(g, 960, 560, t, C.acc, { n: 120, inner: 520, density: 0.45, width: 0.01 });
        // vertical role kanji
        // slanted band
        const pb = outExpo(seg(t, 0, 0.12));
        g.save(); g.translate(960, 560); g.rotate(-0.09 * flip); g.translate((1 - pb) * 2400 * flip, 0);
        g.fillStyle = C.a; g.fillRect(-1300, -200, 2600, 400);
        g.fillStyle = C.acc; g.fillRect(-1300, 205, 2600, 18);
        halftone(g, 26, C.shadow, (X, Y) => (X / 1920) * 0.7 - 0.25, { ox: t * 90, angle: 0.2 });
        g.restore();
        if (jp) kanji(g, jp, flip > 0 ? 1870 : 50, 900, 180, { fill: C.kj === C.b ? C.acc : C.kj, align: flip > 0 ? 'right' : 'left', alpha: outExpo(seg(t, 0.08, 0.2)) });
        // role tag
        const pr = outExpo(seg(t, 0.05, 0.16));
        g.save(); g.translate((1 - pr) * -1200, 0);
        g.translate(960, 560); g.rotate(-0.09 * flip);
        g.fillStyle = C.tagBg; g.fillRect(-760, -268, 40 + role.length * 30, 70);
        latin(g, role, -740, -221, 34, { weight: 800, track: 9, fill: C.tagFg });
        g.restore();
        // name slam
        const pn = seg(t, 0.06, 0.13);
        if (pn > 0) {
          const s = 1 + 1.4 * (1 - outExpo(pn));
          g.save(); g.translate(960, 560); g.rotate(-0.09 * flip); g.scale(s, s); g.transform(1, 0, -0.18, 1, 0, 0);
          const size = name.length > 9 ? 190 : 230;
          latin(g, name, 0, size * 0.36, size, { weight: 900, track: size * 0.04, fill: C.name, align: 'center', shadow: { dx: 16, dy: 16, color: C.shadow }, baseline: 'alphabetic' });
          g.restore();
        }
        g.restore();
        sweepBands(g, 1 - Math.max(0, (0.75 - t) / 0.14), [C.acc, C.a], { bw: 220, stagger: 0.1, dur: 0.7 });
      },
    };
  },
};
