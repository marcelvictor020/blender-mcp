"""Ancient arching trees for slide 4 (the cathedral over the pond) - tapered boughs with cylinder shading,
bark relief, hanging leaf strands, three depth layers."""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi
Zr = np.random.default_rng


def catmull(pts, n_per=22):
    pts = np.array(pts, np.float32)
    pp = np.vstack([pts[0], pts, pts[-1]])
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pp[i], pp[i + 1], pp[i + 2], pp[i + 3]
        for k in range(n_per):
            t = k / n_per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-1])
    return np.array(out, np.float32)


# the architecture of the cathedral: (name, control points, r_start, r_end)
TRUNK_L = [(3338, 1420), (3342, 1180), (3362, 960), (3412, 760), (3500, 570), (3628, 418), (3790, 318), (3960, 266), (4140, 250)]
TRUNK_R = [(4212, 1420), (4206, 1180), (4178, 972), (4130, 790), (4046, 612), (3940, 462), (3806, 356), (3668, 312), (3560, 330)]
BR_RIGHT = [(4046, 612), (4128, 500), (4236, 398), (4350, 316), (4470, 262), (4620, 236)]      # canopy that crosses cut 4|5
BR_LEFT2 = [(3412, 760), (3350, 640), (3305, 500), (3268, 360), (3246, 200)]                     # outer boughs
BR_R2 = [(4130, 790), (4236, 650), (4320, 500)]
BR_L3 = [(3628, 418), (3560, 268), (3520, 120), (3500, -40)]
BR_R3 = [(3940, 462), (3990, 330), (4050, 190), (4090, 40)]


def sample_radius(n, r0, r1, bumps=0.06, seed=1):
    t = np.linspace(0, 1, n)
    r = r0 + (r1 - r0) * t ** 0.78
    r = r * (1 + bumps * np.sin(t * 21 + seed) * (0.4 + t))
    return r.astype(np.float32)


def bough(ctx, pts, r0, r1, lit_side, dark, base, lit, rim=None, seed=1, mask=None):
    P = catmull(pts, 26)
    n = len(P)
    R = sample_radius(n, r0, r1, seed=seed)
    tang = np.gradient(P, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-6
    nor = np.stack([-tang[:, 1], tang[:, 0]], 1)
    L = P + nor * R[:, None]; Rr = P - nor * R[:, None]
    for i in range(n - 1):
        ext = tang[i] * 1.3
        quad = [L[i] - ext, L[i + 1] + ext, Rr[i + 1] + ext, Rr[i] - ext]
        g = cairo.LinearGradient(L[i][0], L[i][1], Rr[i][0], Rr[i][1])
        # lit_side = +1 -> lit toward the 'right' offset (-nor), -1 -> toward 'left'
        pl = 0.80 if lit_side > 0 else 0.20
        g.add_color_stop_rgb(0.0, *dark); g.add_color_stop_rgb(max(0.02, min(pl, 1 - pl) * .55), *dark)
        g.add_color_stop_rgb(0.5, *base); g.add_color_stop_rgb(pl, *lit)
        g.add_color_stop_rgb(1.0 if lit_side > 0 else 0.0, *(lit if rim is None else rim)) if False else None
        g.add_color_stop_rgb(1.0, *dark)
        ctx.set_source(g)
        ctx.new_path(); ctx.move_to(*quad[0]); [ctx.line_to(*q) for q in quad[1:]]; ctx.close_path(); ctx.fill()
        if mask is not None:
            mask.set_source_rgba(1, 1, 1, 1); mask.new_path(); mask.move_to(*quad[0]); [mask.line_to(*q) for q in quad[1:]]; mask.close_path(); mask.fill()
    return P, R


def leaf(ctx, x, y, size, ang, col, a=1.0):
    ca, sa = math.cos(ang), math.sin(ang)
    def T(u, v): return (x + u * ca - v * sa, y + u * sa + v * ca)
    ctx.set_source_rgba(*col, a)
    ctx.new_path(); ctx.move_to(*T(0, 0))
    ctx.curve_to(*T(size * .3, -size * .34), *T(size * .75, -size * .30), *T(size, 0))
    ctx.curve_to(*T(size * .75, size * .26), *T(size * .3, size * .30), *T(0, 0))
    ctx.close_path(); ctx.fill()


def strand(ctx, ax, ay, length, size, r, palette, depth_mix, glow=None, sway=1.0, hang=1.5707):
    n = max(3, int(length / (size * .55)))
    ph = r.uniform(0, 6.28); sw = r.uniform(.4, 1.6) * sway
    for k in range(n):
        t = k / n
        x = ax + math.sin(ph + t * 3.0) * sw * 14 * t * (1 + t)
        y = ay + t * length
        s = size * (1.0 - .45 * t) * r.uniform(.8, 1.25)
        c = palette[r.integers(len(palette))]
        c = mixc(c, depth_mix[0], depth_mix[1])
        if glow is not None and r.random() < .22:
            c = mixc(c, glow, .35)
        for side in (-1, 1):
            leaf(ctx, x + side * s * .12, y, s * 1.5, hang + side * r.uniform(.5, 1.25) + math.sin(ph + t * 3) * .2, c)


def canopy_mass(ctx, region, n, size, r, palette, depth_mix, hole=(3790, 70, 230, 135), xfade=None):
    x0, x1, y0, y1 = region
    for i in range(n):
        x = r.uniform(x0, x1); y = r.uniform(y0, y1)
        if xfade is not None and r.random() > float(smoothstep(xfade[0], xfade[1], x)): continue
        if hole is not None:
            q = ((x - hole[0]) / hole[2]) ** 2 + ((y - hole[1]) / hole[3]) ** 2
            if q < 1.0 and r.random() < (1 - q) ** 0.5 * 0.96: continue
        c = mixc(palette[r.integers(len(palette))], depth_mix[0], depth_mix[1])
        leaf(ctx, x, y, size * r.uniform(.7, 1.5), r.uniform(0, TAU), c)


def render_trees(x0, w, ss=2):
    """-> dict(A=(rgb,a), B=(rgb,a), C=(rgb,a)) layers + 'trunk' masks for lighting"""
    out = {}
    haze = (0.30, 0.45, 0.46)
    pal_far = [(0.06, 0.14, 0.14), (0.08, 0.18, 0.17), (0.05, 0.12, 0.13), (0.10, 0.20, 0.16)]
    pal_mid = [(0.035, 0.10, 0.08), (0.05, 0.14, 0.10), (0.03, 0.08, 0.07), (0.07, 0.17, 0.11), (0.09, 0.19, 0.10)]
    pal_near = [(0.015, 0.045, 0.040), (0.02, 0.06, 0.05), (0.03, 0.08, 0.06), (0.012, 0.035, 0.03), (0.04, 0.10, 0.07)]
    r = Zr(404)

    # --- A: far banks - soft hazy tree masses flanking the vista (mirrored by the water)
    LA = Layer(w, 620, x0, 280, ss=1)
    c = LA.ctx
    for side, (xa, xb) in enumerate(((3150, 3640), (3950, 4560))):
        for i in range(2400):
            x = r.uniform(xa, xb)
            edge = (xb - x) / (xb - xa) if side == 0 else (x - xa) / (xb - xa)         # 1 toward the picture edge
            hgt = 40 + 430 * edge ** 1.5 + r.normal(0, 24)
            ramp = float(smoothstep(0.0, 0.22, edge)) if True else 1.0
            if r.random() > ramp: continue
            y = HZ - 3 - r.uniform(0, 1) ** 1.6 * hgt
            col = mixc(pal_far[r.integers(4)], haze, 0.30 + 0.35 * (1 - edge))
            leaf(c, x, y, r.uniform(14, 30), r.uniform(0, TAU), col)
    ra_, aa_ = LA.get()
    ra_ = cv2.GaussianBlur(ra_, (0, 0), 2.6); aa_ = cv2.GaussianBlur(aa_, (0, 0), 2.6)
    out['A'] = (ra_, aa_)

    # --- B: secondary boughs + loose leaf masses (mid depth)
    LB = Layer(w, H, x0, 0, ss=1)
    c = LB.ctx
    dm = ((0.10, 0.20, 0.20), 0.22)
    for (pts, r0, r1, side, sd) in ((BR_LEFT2, 34, 10, +1, 3), (BR_R2, 30, 10, -1, 4), (BR_L3, 22, 7, +1, 5), (BR_R3, 22, 7, -1, 6)):
        P, R = bough(c, pts, r0, r1, side, (0.012, 0.03, 0.03), (0.03, 0.07, 0.06), (0.10, 0.20, 0.17), seed=sd)
        for k in range(0, len(P), 3):
            strand(c, P[k][0] + r.normal(0, 8), P[k][1] + R[k] * .5, r.uniform(60, 190), r.uniform(10, 16), r, pal_mid, dm)
    canopy_mass(c, (3170, 3560, -40, 330), 2300, 16, r, pal_mid, dm, xfade=(3190, 3360))
    canopy_mass(c, (4060, 4950, -40, 380), 3800, 16, r, pal_mid, dm, xfade=None)
    canopy_mass(c, (3560, 4060, -50, 190), 1100, 15, r, pal_mid, dm)
    out['B'] = LB.get()

    # --- C: the two ancient trunks, main boughs, long hanging strands (near, darkest)
    LC = Layer(w, H, x0, 0, ss=1)
    c = LC.ctx
    LM = Layer(w, H, x0, 0, ss=1)
    MC = LM.ctx
    dark, base = (0.006, 0.016, 0.016), (0.022, 0.050, 0.044)
    PL, RL = bough(c, TRUNK_L, 112, 18, -1, dark, base, (0.20, 0.17, 0.11), seed=1, mask=MC)
    PR, RR = bough(c, TRUNK_R, 104, 16, +1, dark, base, (0.20, 0.17, 0.11), seed=2, mask=MC)
    PB, RB = bough(c, BR_RIGHT, 34, 11, +1, dark, base, (0.12, 0.15, 0.12), seed=7, mask=MC)
    dm0 = ((0.04, 0.09, 0.09), 0.0)
    for (P, R, lo) in ((PL, RL, 0.0), (PR, RR, 0.0), (PB, RB, 0.0)):
        for k in range(0, len(P), 2):
            if P[k][1] > 880: continue
            n_st = 2 if P[k][1] < 560 else 1
            for _ in range(n_st):
                strand(c, P[k][0] + r.normal(0, R[k] * .6), P[k][1] + R[k] * r.uniform(.2, 1.0), r.uniform(70, 330), r.uniform(12, 20), r, pal_near, dm0, glow=(0.40, 0.42, 0.14), sway=1.3)
    canopy_mass(c, (3170, 3640, -60, 300), 2300, 21, r, pal_near, dm0, xfade=(3190, 3360))
    canopy_mass(c, (3900, 4950, -60, 350), 4600, 21, r, pal_near, dm0)
    canopy_mass(c, (3560, 4000, -60, 190), 1100, 19, r, pal_near, dm0)
    # ivy and moss hanging from the arch apex
    for _ in range(36):
        ax = r.uniform(3640, 3980); ay = 300 + (abs(ax - 3800) / 180.0) * 10
        strand(c, ax, ay, r.uniform(80, 280), r.uniform(9, 14), r, pal_near, dm0, glow=(0.38, 0.42, 0.16), sway=1.8)
    out['C'] = LC.get()
    out['M'] = LM.get()[1]
    return out


def bark_relief(x0, w, alpha, seed=3):
    """vertical bark ridges + moss for the trunk mask"""
    n1 = fbm(x0, 0, w, H, 150, 4, seed, aniso=0.07)
    n2 = fbm(x0, 0, w, H, 40, 3, seed + 1, aniso=0.09)
    return 1 + 0.55 * n1 + 0.35 * n2
