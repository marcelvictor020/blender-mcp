// g_stripes — standalone diagonal stripe transition (opts: colors[], mode 'cover' | 'sweep').
import { RED, CREAM, TEAL, INK, fill, coverWipe, sweepBands, stripes } from './gfx2d.js';
export default {
  type: '2d',
  build(core, ctx) {
    const S = ctx.seg, cols = S.colors || [RED, CREAM, TEAL, INK];
    return {
      fx: { grain: 0.03 },
      draw(g, t) {
        const p = t / S.dur;
        fill(g, S.bg || INK);
        if (S.mode === 'sweep') { stripes(g, [INK, RED], 60, -0.5, t * 600); sweepBands(g, p, cols); }
        else coverWipe(g, p, cols, { stagger: 0.18, span: 0.45 });
      },
    };
  },
};
