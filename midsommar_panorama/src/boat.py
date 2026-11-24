"""The lone rowboat, the young woman in white linen with a flower crown, and her lantern (slide 4)."""
import math
import numpy as np
import cairo
from util import *

TAU = 2 * math.pi
LANTERN = (3862.0, 812.0)          # warm light source: the only warm light on the water
WATERLINE = 972.0                  # y where the hull meets the water (mirror axis for the reflection)
BX0, BY0, BW, BH = 3380, 540, 900, 520


def bez(p0, p1, p2, p3, t):
    t = np.asarray(t, np.float32)[..., None]
    p0, p1, p2, p3 = (np.asarray(p, np.float32) for p in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def smooth(ctx, pts, closed=True, k=0.5):
    n = len(pts)
    ctx.new_path(); ctx.move_to(*pts[0])
    for i in (range(n) if closed else range(n - 1)):
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[0]
        p1 = pts[i]; p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 3 * 2, p1[1] + (p2[1] - p0[1]) * k / 3 * 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 3 * 2, p2[1] - (p3[1] - p1[1]) * k / 3 * 2)
        ctx.curve_to(*c1, *c2, *p2)
    if closed: ctx.close_path()


def lin(ctx, x0, y0, x1, y1, stops):
    g = cairo.LinearGradient(x0, y0, x1, y1)
    for o, c in stops:
        g.add_color_stop_rgba(o, *c) if len(c) == 4 else g.add_color_stop_rgb(o, *c)
    ctx.set_source(g)


def rad(ctx, x, y, r0, r1, stops):
    g = cairo.RadialGradient(x, y, r0, x, y, r1)
    for o, c in stops:
        g.add_color_stop_rgba(o, *c)
    ctx.set_source(g)


def ell(ctx, cx, cy, rx, ry, rot=0.0):
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(rx, ry)
    ctx.new_path(); ctx.arc(0, 0, 1, 0, TAU); ctx.close_path(); ctx.restore()


# ----------------------------------------------------------------------------- hull
def hull_curves():
    G = (np.array((3498, 880)), np.array((3600, 930)), np.array((3960, 934)), np.array((4108, 862)))
    K = (np.array((3534, 962)), np.array((3640, 998)), np.array((3940, 996)), np.array((4084, 946)))
    return G, K


def draw_hull_back(ctx):
    """inner face of the far gunwale (seen above the near rail) - drawn BEFORE the girl"""
    G, K = hull_curves()
    t = np.linspace(0, 1, 60)
    near = bez(*G, t)
    far = near + np.stack([np.zeros_like(t), -15 * np.sin(np.pi * t) ** 0.6 - 2], 1)
    ctx.new_path(); ctx.move_to(*far[0]); [ctx.line_to(*p) for p in far[1:]]; [ctx.line_to(*p) for p in near[::-1]]; ctx.close_path()
    lin(ctx, 0, 880, 0, 935, [(0, (0.20, 0.13, 0.08)), (1, (0.04, 0.025, 0.02))]); ctx.fill()
    ctx.set_source_rgba(0.55, 0.34, 0.16, 0.9); ctx.set_line_width(2.2)
    ctx.new_path(); ctx.move_to(*far[0]); [ctx.line_to(*p) for p in far[1:]]; ctx.stroke()


def draw_hull_front(ctx):
    G, K = hull_curves()
    t = np.linspace(0, 1, 80)
    N = 6
    curves = [bez(*G, t) * (1 - k / N) + bez(*K, t) * (k / N) for k in range(N + 1)]
    base_cols = [(0.19, 0.12, 0.075), (0.14, 0.085, 0.055), (0.11, 0.07, 0.045), (0.085, 0.055, 0.04), (0.065, 0.045, 0.035), (0.05, 0.035, 0.03)]
    for k in range(N):
        top, bot = curves[k], curves[k + 1]
        ctx.new_path(); ctx.move_to(*top[0]); [ctx.line_to(*p) for p in top[1:]]; [ctx.line_to(*p) for p in bot[::-1]]; ctx.close_path()
        lin(ctx, 0, float(top[40][1]), 0, float(bot[40][1]), [(0, tuple(min(1, c * 1.55) for c in base_cols[k])), (0.35, base_cols[k]), (1, tuple(c * 0.55 for c in base_cols[k]))])
        ctx.fill()
        # lapstrake lip: light line along the upper edge, dark shadow line below it
        ctx.set_source_rgba(0.62, 0.40, 0.20, 0.55); ctx.set_line_width(1.8)
        ctx.new_path(); ctx.move_to(*top[0]); [ctx.line_to(*p) for p in top[1:]]; ctx.stroke()
        ctx.set_source_rgba(0.01, 0.005, 0.005, 0.65); ctx.set_line_width(1.6)
        ctx.new_path(); ctx.move_to(*bot[0] + np.array([0, 1.6])); [ctx.line_to(*(p + np.array([0, 1.6]))) for p in bot[1:]]; ctx.stroke()
    # end caps (transom + stem)
    ctx.set_source_rgba(0.10, 0.06, 0.04, 1)
    ctx.new_path(); ctx.move_to(3498, 880); ctx.line_to(3534, 962); ctx.line_to(3522, 960); ctx.line_to(3490, 880); ctx.close_path(); ctx.fill()
    ctx.new_path(); ctx.move_to(4108, 862); ctx.curve_to(4126, 890, 4116, 930, 4084, 946); ctx.line_to(4078, 940); ctx.curve_to(4104, 920, 4112, 890, 4100, 866); ctx.close_path(); ctx.fill()
    # rail
    near = bez(*G, t)
    ctx.set_source_rgba(0.34, 0.20, 0.10, 1); ctx.set_line_width(7)
    ctx.new_path(); ctx.move_to(*near[0]); [ctx.line_to(*p) for p in near[1:]]; ctx.stroke()
    ctx.set_source_rgba(0.80, 0.55, 0.28, 0.85); ctx.set_line_width(2.4)
    ctx.new_path(); ctx.move_to(*(near[0] + np.array([0, -2.5]))); [ctx.line_to(*(p + np.array([0, -2.5]))) for p in near[1:]]; ctx.stroke()
    # warm lantern light pooling on the planks
    ctx.save()
    ctx.new_path(); top, bot = curves[0], curves[N]
    ctx.move_to(*top[0]); [ctx.line_to(*p) for p in top[1:]]; [ctx.line_to(*p) for p in bot[::-1]]; ctx.close_path(); ctx.clip()
    rad(ctx, LANTERN[0], LANTERN[1] + 40, 8, 250, [(0, (1.0, 0.66, 0.28, .55)), (0.35, (1.0, 0.52, 0.18, .22)), (1, (1.0, 0.45, 0.1, 0))])
    ctx.new_path(); ctx.rectangle(3400, 840, 800, 160); ctx.fill()
    ctx.restore()


# ----------------------------------------------------------------------------- the girl
SK_SH, SK_MID, SK_LIT = (0.55, 0.38, 0.34), (0.86, 0.65, 0.52), (1.0, 0.80, 0.58)
HAIR_D, HAIR_M, HAIR_L = (0.30, 0.17, 0.09), (0.55, 0.36, 0.17), (0.90, 0.64, 0.30)


def draw_girl(ctx, tx=3772.0):
    dx = tx - 3772.0
    P = lambda x, y: (x + dx, y)
    # long hair behind the shoulders
    pts = [P(3756, 654), P(3742, 666), P(3731, 700), P(3722, 748), P(3722, 800), P(3736, 806), P(3744, 770), P(3748, 730), P(3794, 726), P(3800, 764), P(3812, 788), P(3818, 770), P(3816, 724), P(3804, 676), P(3788, 654)]
    smooth(ctx, pts)
    lin(ctx, 3722 + dx, 0, 3820 + dx, 0, [(0, HAIR_D), (0.55, HAIR_M), (1, HAIR_L)]); ctx.fill()
    # dress (linen): cool shadow left, warm lantern light right
    d = [P(3768, 701), P(3745, 708), P(3741, 738), P(3748, 772), P(3742, 826), P(3722, 884), P(3700, 944), P(3836, 944), P(3812, 884), P(3799, 826), P(3792, 772), P(3797, 738), P(3794, 708)]
    smooth(ctx, d)
    lin(ctx, 3700 + dx, 0, 3840 + dx, 0, [(0, (0.40, 0.45, 0.62)), (0.38, (0.74, 0.76, 0.82)), (0.70, (0.97, 0.90, 0.78)), (1, (1.0, 0.82, 0.58))]); ctx.fill_preserve()
    ctx.save(); ctx.clip()
    for k, (xa, xb) in enumerate(((3724, 3730), (3745, 3752), (3768, 3770), (3790, 3790), (3812, 3808))):   # soft folds
        ctx.set_source_rgba(0.30, 0.32, 0.50, 0.20); ctx.set_line_width(3.2)
        ctx.new_path(); ctx.move_to(xa * 0.5 + 3768 * 0.5 + dx, 772); ctx.curve_to(xa + dx, 830, xb + dx, 880, xb + (xb - 3768) * .35 + dx, 944); ctx.stroke()
        ctx.set_source_rgba(1.0, 0.92, 0.75, 0.16); ctx.set_line_width(2.2)
        ctx.new_path(); ctx.move_to(xa * 0.5 + 3768 * 0.5 + 5 + dx, 774); ctx.curve_to(xa + 5 + dx, 830, xb + 5 + dx, 880, xb + 5 + (xb - 3768) * .35 + dx, 944); ctx.stroke()
    rad(ctx, LANTERN[0] + dx * 0, LANTERN[1], 6, 150, [(0, (1.0, 0.72, 0.36, .62)), (1, (1.0, 0.6, 0.2, 0))])
    ctx.new_path(); ctx.rectangle(3690, 690, 160, 260); ctx.fill()
    ctx.restore()
    ctx.set_source_rgba(0.12, 0.10, 0.16, 0.5); ctx.set_line_width(1.1); smooth(ctx, d); ctx.stroke()
    # belt of ribbon at the waist
    ctx.set_source_rgba(0.55, 0.62, 0.78, .8); ctx.set_line_width(3)
    ctx.new_path(); ctx.move_to(3746 + dx, 766); ctx.curve_to(3760 + dx, 773, 3782 + dx, 773, 3795 + dx, 766); ctx.stroke()
    # neck + neckline
    smooth(ctx, [P(3762, 688), P(3774, 688), P(3778, 704), P(3768, 712), P(3758, 704)])
    lin(ctx, 3758 + dx, 0, 3780 + dx, 0, [(0, SK_SH), (0.6, SK_MID), (1, SK_LIT)]); ctx.fill()
    # sleeves (puffed)
    for (cx, cy, rx, ry, rot) in ((3739, 726, 14, 21, 0.25), (3801, 728, 14, 21, -0.25)):
        ell(ctx, cx + dx, cy, rx, ry, rot)
        lin(ctx, cx - rx + dx, 0, cx + rx + dx, 0, [(0, (0.45, 0.5, 0.66)), (0.5, (0.85, 0.85, 0.88)), (1, (1.0, 0.86, 0.66))]); ctx.fill()
    # arms: left hangs holding the dress, right holds the lantern out
    for pts_, (c0, c1) in (([P(3734, 742), P(3731, 772), P(3734, 800)], (SK_SH, SK_MID)), ([P(3806, 744), P(3828, 764), P(3852, 784)], (SK_MID, SK_LIT))):
        ctx.set_source_rgba(*c0, 1); ctx.set_line_width(8.5); ctx.new_path(); ctx.move_to(*pts_[0]); ctx.curve_to(*pts_[0], *pts_[1], *pts_[2]); ctx.stroke()
        ctx.set_source_rgba(*c1, 1); ctx.set_line_width(5.4); ctx.new_path(); ctx.move_to(*pts_[0]); ctx.curve_to(*pts_[0], *pts_[1], *pts_[2]); ctx.stroke()
    ell(ctx, 3736 + dx, 803, 4.5, 5.5); ctx.set_source_rgb(*SK_SH); ctx.fill()
    ell(ctx, 3855 + dx, 787, 5, 5.2); ctx.set_source_rgb(*SK_LIT); ctx.fill()
    # head
    ell(ctx, 3772 + dx, 672, 15.5, 19.5, 0.10)
    lin(ctx, 3756 + dx, 0, 3790 + dx, 0, [(0, (0.60, 0.42, 0.38)), (0.45, SK_MID), (1, SK_LIT)]); ctx.fill_preserve()
    ctx.set_source_rgba(0.25, 0.12, 0.10, .35); ctx.set_line_width(0.9); ctx.stroke()
    # face: downcast eyes, brows, nose, small calm mouth, rosy cheeks
    for ex in (3765, 3780):
        ctx.set_source_rgba(0.14, 0.07, 0.06, .95); ctx.set_line_width(1.3)
        ctx.new_path(); ctx.arc(ex + dx, 674.5, 3.0, 0.15, 2.95); ctx.stroke()
        ctx.set_source_rgba(0.30, 0.17, 0.10, .6); ctx.set_line_width(0.9)
        ctx.new_path(); ctx.move_to(ex - 3.6 + dx, 668.5); ctx.curve_to(ex - 1 + dx, 666.5, ex + 2 + dx, 666.5, ex + 3.8 + dx, 668.5); ctx.stroke()
    ctx.set_source_rgba(0.45, 0.25, 0.18, .55); ctx.set_line_width(1.0)
    ctx.new_path(); ctx.move_to(3773 + dx, 673); ctx.curve_to(3775 + dx, 679, 3776 + dx, 681, 3772 + dx, 682); ctx.stroke()
    ctx.set_source_rgba(0.62, 0.22, 0.22, .9); ctx.set_line_width(1.5)
    ctx.new_path(); ctx.move_to(3767 + dx, 686); ctx.curve_to(3770 + dx, 688.2, 3775 + dx, 688.2, 3778 + dx, 685.6); ctx.stroke()
    for cx in (3763, 3782):
        rad(ctx, cx + dx, 681, 0, 6, [(0, (0.95, 0.45, 0.4, .45)), (1, (0.95, 0.45, 0.4, 0))]); ctx.new_path(); ctx.arc(cx + dx, 681, 6, 0, TAU); ctx.fill()
    # hair over the head: centre part, soft waves falling past the ears
    smooth(ctx, [P(3757, 673), P(3757, 660), P(3764, 652), P(3774, 650), P(3784, 653), P(3788, 664), P(3786, 676), P(3783, 662), P(3775, 657), P(3766, 660), P(3760, 672), P(3758, 686)])
    lin(ctx, 3757 + dx, 0, 3790 + dx, 0, [(0, HAIR_D), (0.6, HAIR_M), (1, HAIR_L)]); ctx.fill()
    # flower crown (white, pale blue, buttercup yellow) with leaves, slightly askew
    r = np.random.default_rng(12)
    ring = []
    for i in range(15):
        a = math.pi * (1.02 + 0.98 * i / 14)
        ring.append((3772 + dx + 17.6 * math.cos(a), 661 + 8.5 * math.sin(a) + 3.5 * math.cos(a * .5) - 1.5))
    for i, (fx, fy) in enumerate(ring):
        ell(ctx, fx, fy + 2, 5.5, 2.4, r.uniform(-.8, .8)); ctx.set_source_rgba(0.20, 0.34, 0.14, 1); ctx.fill()
    for i, (fx, fy) in enumerate(ring):
        col = [(0.98, 0.96, 0.90), (0.62, 0.72, 0.96), (0.98, 0.80, 0.22), (0.98, 0.96, 0.90)][i % 4]
        sz = 3.2 + 1.4 * r.random()
        for k in range(5):
            a = TAU * k / 5 + i
            ell(ctx, fx + math.cos(a) * sz * .6, fy + math.sin(a) * sz * .6, sz * .55, sz * .38, a); ctx.set_source_rgb(*col); ctx.fill()
        ctx.set_source_rgb(0.95, 0.65, 0.12); ctx.new_path(); ctx.arc(fx, fy, sz * .32, 0, TAU); ctx.fill()
    for k in range(5):                                    # a few petals blown loose
        px, py = 3790 + k * 11 + r.uniform(-6, 6) + dx, 700 + k * 26 + r.uniform(-10, 10)
        ell(ctx, px, py, 3.0, 1.7, r.uniform(0, 3)); ctx.set_source_rgba(0.98, 0.96, 0.92, .8); ctx.fill()


# ----------------------------------------------------------------------------- lantern
def draw_lantern(ctx, cx, cy):
    # arm-held ring + chain
    ctx.set_source_rgba(0.08, 0.06, 0.05, 1); ctx.set_line_width(1.6)
    ctx.new_path(); ctx.arc(cx - 3, cy - 26, 4.5, 0, TAU); ctx.stroke()
    # top cap
    ctx.new_path(); ctx.move_to(cx - 11, cy - 18); ctx.line_to(cx - 6, cy - 25); ctx.line_to(cx + 6, cy - 25); ctx.line_to(cx + 11, cy - 18); ctx.close_path(); ctx.fill()
    # glass body (amber), brightest in the middle
    ctx.new_path(); ctx.move_to(cx - 11, cy - 18); ctx.line_to(cx + 11, cy - 18); ctx.line_to(cx + 9, cy + 12); ctx.line_to(cx - 9, cy + 12); ctx.close_path()
    rad(ctx, cx, cy - 2, 1, 17, [(0, (1.0, 0.98, 0.82, 1)), (0.35, (1.0, 0.82, 0.38, 1)), (1, (0.92, 0.50, 0.12, 1))]); ctx.fill()
    # frame bars
    ctx.set_source_rgba(0.10, 0.07, 0.05, 1); ctx.set_line_width(1.5)
    for xo in (-5.5, 0, 5.5):
        ctx.new_path(); ctx.move_to(cx + xo * 1.15, cy - 18); ctx.line_to(cx + xo * 0.95, cy + 12); ctx.stroke()
    ctx.new_path(); ctx.move_to(cx - 12, cy + 12); ctx.line_to(cx + 12, cy + 12); ctx.line_to(cx + 9, cy + 17); ctx.line_to(cx - 9, cy + 17); ctx.close_path(); ctx.fill()
    # flame
    ell(ctx, cx, cy - 3, 3.2, 7.0); ctx.set_source_rgba(1, 1, 0.92, 1); ctx.fill()


def render_boat(ss=3):
    L = Layer(BW, BH, BX0, BY0, ss)
    c = L.ctx
    draw_hull_back(c)
    draw_girl(c)
    draw_lantern(c, *LANTERN)
    draw_hull_front(c)
    return L.get()
