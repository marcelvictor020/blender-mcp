"""Slide 5: THE ZOOMQUILT BLEND - reality folds.  Nature only: twisting trunks, giant leaves, vines, flower garlands spiralling
inward (log-polar tunnel), jade smoke along the arms, the pond swirling up into cloud, a half-scale copy of the next scene
nested in the portal (the Zoomquilt trick).  Everything leans and pulls toward the right."""
import math
import numpy as np
import cv2
import cairo
from util import *
from trees import leaf, catmull, bough
from folk import ribbon_puffs, Z

TAU = 2 * math.pi
CXV, CYV = 4992.0, 688.0                     # vortex centre
SX = 1.22                                    # horizontal stretch: everything pulls to the right
R_IN, R_OUT = 60.0, 840.0
UW = 3600
SC = UW / TAU
VH = int(math.log(R_OUT / R_IN) * SC) + 2
TW = 0.74
X0F, X1F = 4150, 5950
FW = X1F - X0F


def vmix(t, r):
    """leaf colour by radius (t=0 at the portal: sun-gilded; t=1 outer: deep teal) with random variation"""
    pal = [(0.50, 0.72, 0.58), (0.34, 0.52, 0.22), (0.07, 0.27, 0.21), (0.12, 0.38, 0.38), (0.20, 0.45, 0.24), (0.58, 0.60, 0.18), (0.10, 0.33, 0.26)]
    c = np.array(pal[r.integers(len(pal))], np.float32) * r.uniform(.78, 1.12)
    gold = np.array([0.74, 0.70, 0.22], np.float32)
    k = float(1 - smoothstep(0.0, 0.55, t)) * 0.55
    return tuple(np.clip(c * (1 - k) + gold * k, 0, 1))


def leaf2(c, x, y, size, ang, c0, c1, vein=True):
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    g = cairo.LinearGradient(*T(0, 0), *T(size, 0)); g.add_color_stop_rgb(0, *c0); g.add_color_stop_rgb(1, *c1)
    c.set_source(g)
    c.new_path(); c.move_to(*T(0, 0))
    c.curve_to(*T(size * .28, -size * .40), *T(size * .72, -size * .34), *T(size, 0))
    c.curve_to(*T(size * .72, size * .30), *T(size * .28, size * .38), *T(0, 0)); c.close_path(); c.fill()
    if vein:
        c.set_source_rgba(0.04, 0.12, 0.08, 0.55); c.set_line_width(max(1.0, size * 0.012))
        c.new_path(); c.move_to(*T(0, 0)); c.curve_to(*T(size * .3, size * .02), *T(size * .7, -size * .02), *T(size * .96, 0)); c.stroke()
        for k in range(1, 5):
            for sg in (-1, 1):
                c.new_path(); c.move_to(*T(size * (0.12 + .17 * k), 0)); c.line_to(*T(size * (0.22 + .17 * k), sg * size * (0.20 - .025 * k))); c.stroke()
        c.set_source_rgba(1, .95, .6, 0.22); c.set_line_width(max(1.0, size * 0.02))
        c.new_path(); c.move_to(*T(size * .08, -size * .10)); c.curve_to(*T(size * .3, -size * .30), *T(size * .6, -size * .26), *T(size * .9, -size * .03)); c.stroke()


def flower(c, x, y, r_, col, r):
    n = int(r.integers(5, 9))
    for k in range(n):
        a = TAU * k / n + r.uniform(0, 1)
        c.save(); c.translate(x + math.cos(a) * r_ * .55, y + math.sin(a) * r_ * .55); c.rotate(a); c.scale(r_ * .62, r_ * .30)
        c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore()
        c.set_source_rgba(*col, 0.97); c.fill()
    c.set_source_rgb(0.95, 0.72, 0.18); c.new_path(); c.arc(x, y, r_ * .26, 0, TAU); c.fill()


def draw_texture(seed=11):
    r = np.random.default_rng(seed)
    L = Layer(3 * UW, VH, 0, 0, ss=1)
    c = L.ctx
    def thrice(fn):
        for off in (0, UW, 2 * UW): fn(off)
    # vines with leaf pairs and flower garlands
    for i in range(46):
        u0 = UW * (i + r.uniform(.0, 1.0)) / 46 + UW
        ph = r.uniform(0, TAU); amp = r.uniform(30, 75); per = r.uniform(5, 9)
        pts = [(u0 + amp * math.sin(ph + (j / 24) * per) + 120 * (j / 24), VH + 30 - (j / 24) * (VH + 60)) for j in range(25)]
        sm = catmull(pts, 6)
        for off in (-UW, 0, UW):
            c.set_source_rgba(0.04, 0.10, 0.07, 1); c.set_line_width(12)
            c.new_path(); c.move_to(sm[0][0] + off, sm[0][1]); [c.line_to(p[0] + off, p[1]) for p in sm[1:]]; c.stroke()
            c.set_source_rgba(0.14, 0.30, 0.14, 1); c.set_line_width(7)
            c.new_path(); c.move_to(sm[0][0] + off, sm[0][1]); [c.line_to(p[0] + off, p[1]) for p in sm[1:]]; c.stroke()
        for j in range(3, len(sm) - 3, 5):
            p = sm[j]; q = sm[j + 2]
            base_ang = math.atan2(q[1] - p[1], q[0] - p[0])
            t = 1 - p[1] / VH
            for sg in (-1, 1):
                sz = r.uniform(90, 190) * (0.7 + 0.5 * t)
                c0 = vmix(1 - t, r); c1 = tuple(np.clip(np.array(c0) * 1.35 + 0.05, 0, 1))
                for off in (-UW, 0, UW):
                    leaf2(c, p[0] + off, p[1], sz, base_ang + sg * r.uniform(.7, 1.35), c0, c1)
        if i % 3 == 0:                                                 # garland of flowers winding along this vine
            for j in range(2, len(sm) - 2, 3):
                p = sm[j]
                col = [(0.96, 0.93, 0.84), (0.93, 0.74, 0.74), (0.97, 0.84, 0.36), (0.80, 0.86, 0.96)][r.integers(4)]
                for off in (-UW, 0, UW):
                    flower(c, p[0] + off + 22 * math.sin(j), p[1], r.uniform(24, 40) * (0.7 + 0.6 * (1 - p[1] / VH)), col, r)
    # large floating leaves, smaller leaves, petals, gold flecks
    for n_, (lo, hi) in ((200, (230, 470)), (420, (80, 190))):
        for i in range(n_):
            u = r.uniform(UW * .95, UW * 2.05); v = r.uniform(-20, VH)
            t = 1 - v / VH
            sz = r.uniform(lo, hi) * (0.6 + 0.6 * t)
            c0 = vmix(1 - t, r); c1 = tuple(np.clip(np.array(c0) * 1.3 + 0.06, 0, 1))
            ang = math.pi / 2 * -1 + r.normal(0, .8)
            for off in (-UW, 0, UW):
                leaf2(c, u + off, v, sz, ang, c0, c1, vein=sz > 120)
    # twisting trunks, painted OVER the leaf mass so they stay legible
    for i in range(7):
        u0 = UW * (i + r.uniform(.1, .9)) / 7 + UW
        pts = []
        ph = r.uniform(0, TAU); amp = r.uniform(60, 130)
        for j in range(9):
            t = j / 8
            pts.append((u0 + amp * math.sin(ph + t * 7.5) + 90 * t, VH + 60 - t * (VH + 120)))
        rad0, rad1 = r.uniform(24, 38), r.uniform(78, 112)
        for off in (-UW, 0, UW):
            P_ = [(p[0] + off, p[1]) for p in pts]
            bough(c, P_, rad0, rad1, 1 if i % 2 else -1, (0.05, 0.07, 0.05), (0.22, 0.19, 0.11), (0.60, 0.54, 0.28), seed=i + 3)
    for i in range(520):
        u = r.uniform(UW, 2 * UW); v = r.uniform(0, VH)
        col = [(0.93, 0.89, 0.80), (0.86, 0.70, 0.68), (0.90, 0.82, 0.50)][r.integers(3)]
        sz = r.uniform(14, 34) * (0.5 + 0.9 * (1 - v / VH))
        for off in (-UW, 0, UW):
            c.save(); c.translate(u + off, v); c.rotate(r.uniform(0, TAU)); c.scale(sz, sz * .45); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore()
            c.set_source_rgba(*col, 0.9); c.fill()
    for i in range(2200):
        u = r.uniform(UW, 2 * UW); v = r.uniform(0, VH)
        for off in (-UW, 0, UW):
            c.set_source_rgba(1.0, 0.86, 0.45, r.uniform(.4, .95)); c.new_path(); c.arc(u + off, v, r.uniform(1.2, 3.0), 0, TAU); c.fill()
    rgb_, a_ = L.get()
    return np.ascontiguousarray(rgb_[:, UW:2 * UW]), np.ascontiguousarray(a_[:, UW:2 * UW])


def fbm_wrap(Uw, Vh, cu, cv_, octaves, seed, gain=0.5):
    rng = np.random.default_rng(seed)
    out = np.zeros((Vh, Uw), np.float32); amp, tot = 1.0, 0.0
    for o in range(octaves):
        gu = max(2, int(round(Uw / (cu / 2 ** o)))); gv = max(2, int(round(Vh / (cv_ / 2 ** o)))) + 3
        g = rng.standard_normal((gv, gu)).astype(np.float32)
        big = cv2.resize(np.tile(g, (1, 3)), (3 * Uw, Vh), interpolation=cv2.INTER_CUBIC)[:, Uw:2 * Uw]
        out += amp * big; tot += amp; amp *= gain
    return out / tot


def clouds_texture():
    n = fbm_wrap(UW, VH, 260, 760, 5, 7)
    wv = fbm_wrap(UW, VH, 420, 420, 3, 8)
    # domain warp for curls
    gy, gx = np.mgrid[0:VH, 0:UW].astype(np.float32)
    n = cv2.remap(n, (gx + 180 * wv) % UW, np.clip(gy + 140 * wv, 0, VH - 1), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    gate = smoothstep(-0.05, 0.30, fbm_wrap(UW, VH, 800, 520, 3, 33))
    a = smoothstep(0.10, 0.55, n) * 0.80 * gate
    t = gy / VH
    col = np.array([0.62, 0.84, 0.76], np.float32) * (0.85 + 0.3 * (1 - t))[..., None]
    col = col + np.array([0.28, 0.20, 0.04], np.float32) * (1 - smoothstep(0, 0.5, t))[..., None] * 0.9
    return np.clip(col, 0, 1).astype(np.float32), a.astype(np.float32)


def map_log_polar(tex_rgb, tex_a, x0, w, strength=1.0):
    """tex (premultiplied rgb + alpha) -> screen through the spiral; mip-mapped by radius"""
    yy, xx = np.mgrid[0:H, 0:w].astype(np.float32)
    gx = (xx + x0 - CXV) / SX; gy = yy - CYV
    r = np.maximum(np.hypot(gx, gy), 1.0)
    th = np.arctan2(gy, gx)
    lr = np.log(r / R_IN)
    u = ((th + TW * lr) % TAU) / TAU * UW
    v = np.clip(lr * SC, 0, VH - 1.001)
    valid = ((lr >= 0) & (lr * SC < VH - 1)).astype(np.float32)
    m = np.clip(np.log2(np.maximum(SC / r, 1.0)), 0, 3.0)
    lev = np.floor(m).astype(np.int32); fr = m - lev
    out_rgb = np.zeros((H, w, 3), np.float32); out_a = np.zeros((H, w), np.float32)
    pyr = [(tex_rgb, tex_a)]
    for L in range(1, 4):
        pyr.append((cv2.resize(pyr[-1][0], (UW >> L, VH >> L), interpolation=cv2.INTER_AREA), cv2.resize(pyr[-1][1], (UW >> L, VH >> L), interpolation=cv2.INTER_AREA)))
    for L in range(4):
        wgt = np.where(lev == L, 1 - fr, 0) + np.where(lev == L - 1, fr, 0)
        if not wgt.any(): continue
        mx = (u / (2 ** L)).astype(np.float32); my = (v / (2 ** L)).astype(np.float32)
        rgb_s = cv2.remap(pyr[L][0], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        a_s = cv2.remap(pyr[L][1], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
        out_rgb += rgb_s * wgt[..., None]; out_a += a_s * wgt
    return out_rgb * valid[..., None], out_a * valid, r


def swirl_base(img, x0, A=2.3, sigma=400.0):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:w].astype(np.float32)
    gx = (xx + x0 - CXV) / SX; gy = yy - CYV
    r = np.hypot(gx, gy); th = np.arctan2(gy, gx)
    win = smoothstep(1350, 1080, yy) * smoothstep(0, 260, yy)             # never sample outside the picture
    xwin = 1 - smoothstep(5120, 5400, xx + x0)                                 # swirl is gone before the 5|6 cut
    phi = A * np.exp(-(r / sigma) ** 1.5) * win * xwin
    ths = th + phi
    sx_ = CXV + SX * r * np.cos(ths) - x0; sy_ = CYV + r * np.sin(ths)
    return cv2.remap(img, sx_.astype(np.float32), sy_.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def petal_shape(c, x, y, size, ang, c0, c1, a):
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    g = cairo.LinearGradient(*T(0, 0), *T(size, 0)); g.add_color_stop_rgba(0, *c0, a); g.add_color_stop_rgba(1, *c1, a)
    c.set_source(g)
    c.new_path(); c.move_to(*T(0, 0)); c.curve_to(*T(size * .2, -size * .42), *T(size * .8, -size * .36), *T(size, 0)); c.curve_to(*T(size * .8, size * .30), *T(size * .2, size * .40), *T(0, 0)); c.close_path(); c.fill()


def drifting(x0, w, seed=5):
    """huge petals and leaves floating like slow ribbons, with soft trails; they carry on through the 5|6 cut"""
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    r = Z(seed)
    for i in range(17):
        x = r.uniform(4300, 5950); y = r.uniform(80, 1260)
        sz = r.uniform(110, 300) * (0.8 + 0.3 * ((x - 4300) / 1650))
        ang = r.normal(-0.15, 0.55) + (0 if r.random() < .6 else math.pi)
        kind = r.integers(3)
        if kind == 0: c0, c1 = (0.96, 0.90, 0.84), (0.88, 0.62, 0.66)
        elif kind == 1: c0, c1 = (0.55, 0.78, 0.62), (0.90, 0.88, 0.45)
        else: c0, c1 = (0.96, 0.90, 0.70), (0.96, 0.72, 0.42)
        # ribbon trail
        trail = Z(seed + i)
        x2, y2 = x - math.cos(ang) * sz * 1.6, y - math.sin(ang) * sz * 1.6
        g = cairo.LinearGradient(x, y, x2, y2); g.add_color_stop_rgba(0, *c0, 0.26); g.add_color_stop_rgba(1, *c0, 0)
        c.set_source(g); c.set_line_width(sz * .10)
        c.new_path(); c.move_to(x, y); c.curve_to(x - math.cos(ang) * sz * .5, y - math.sin(ang) * sz * .5 + sz * .25, x - math.cos(ang) * sz, y - math.sin(ang) * sz - sz * .25, x2, y2); c.stroke()
        petal_shape(c, x, y, sz, ang, c0, c1, 0.62)
        c.set_source_rgba(1, .98, .85, .30); c.set_line_width(max(1.2, sz * .012))
        c.new_path(); c.move_to(x, y); c.line_to(x + math.cos(ang) * sz * .94, y + math.sin(ang) * sz * .94); c.stroke()
    return L.get()


def crossing_vine(x0, w):
    """one sweeping vine that crosses cut 5|6 and falls open onto the meadow"""
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    r = Z(9)
    pts = [(4620, -60), (4800, 70), (5060, 190), (5300, 290), (5520, 400), (5700, 560), (5830, 760), (5880, 980)]
    P_, R_ = bough(c, pts, 40, 13, -1, (0.03, 0.06, 0.04), (0.12, 0.20, 0.10), (0.55, 0.60, 0.25), seed=12)
    for k in range(0, len(P_), 2):
        p = P_[k]; t = k / len(P_)
        for sg in (-1, 1):
            if r.random() < .8:
                c0 = vmix(1 - t * .7, r); c1 = tuple(np.clip(np.array(c0) * 1.4 + .06, 0, 1))
                leaf2(c, p[0], p[1], r.uniform(70, 150) * (0.8 + .4 * t), math.pi / 2 + sg * r.uniform(.4, 1.2) + (-.3 if sg > 0 else .3), c0, c1)
        if r.random() < .22:
            flower(c, p[0] + r.normal(0, 8), p[1] + r.uniform(0, 30), r.uniform(18, 34), [(0.97, 0.94, 0.86), (0.96, 0.78, 0.78), (0.98, 0.86, 0.40)][r.integers(3)], r)
    for k in range(0, len(P_), 6):                               # hanging tendrils that fall open over the meadow
        p = P_[k]
        for j in range(5):
            c.set_source_rgba(0.14, 0.30, 0.14, 1); c.set_line_width(3.2)
            ln = r.uniform(60, 190)
            c.new_path(); c.move_to(p[0] + r.normal(0, 6), p[1]); c.curve_to(p[0] + 10, p[1] + ln * .4, p[0] - 12, p[1] + ln * .7, p[0] + r.normal(0, 14), p[1] + ln); c.stroke()
    return L.get()


def jade_ribbon(x0, w):
    """jade cloud ribbon: volumetric, lit gold from the meadow side, flows right across 5|6 and settles as the haze of slide 6"""
    import water as W
    ctrl = [(4900, 700), (5100, 640), (5300, 592), (5480, 580), (5680, 610), (5880, 668), (6000, 720)]
    puffs, _, _ = ribbon_puffs(ctrl, lambda s: 78 - 26 * float(smoothstep(900, 1500, s)), seed=19, puff=0.58)
    Hm = np.zeros((H, w), np.float32)
    for (px, py, pr) in puffs:
        xa, xb = int(px - pr - x0), int(px + pr - x0) + 1; ya, yb = int(py - pr), int(py + pr) + 1
        xa, xb, ya, yb = max(xa, 0), min(xb, w), max(ya, 0), min(yb, H)
        if xa >= xb or ya >= yb: continue
        X = (np.arange(xa, xb, dtype=np.float32) + x0 - px)[None, :]; Y = (np.arange(ya, yb, dtype=np.float32) - py)[:, None]
        hh = pr * np.sqrt(np.clip(1 - (X * X + Y * Y) / (pr * pr), 0, 1)) * 0.85
        np.maximum(Hm[ya:yb, xa:xb], hh, out=Hm[ya:yb, xa:xb])
    n1 = fbm(x0, 0, w, H, 30, 4, 141)
    Hm = np.clip(Hm * (1 + 0.14 * n1), 0, None); Hm = cv2.GaussianBlur(Hm, (0, 0), 3.0)
    g = cv2.GaussianBlur(Hm, (0, 0), 3.4)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8.0; gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    n = np.stack([-gx, -gy, np.ones_like(gx) * 1.15], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L1 = np.array([0.62, -0.55, 0.56], np.float32); L1 /= np.linalg.norm(L1)          # sunlit from the right / above
    L2 = np.array([-0.2, 0.9, 0.4], np.float32); L2 /= np.linalg.norm(L2)
    d1 = np.clip((n * L1).sum(-1), 0, 1); d2 = np.clip((n * L2).sum(-1), 0, 1)
    col = np.array([0.34, 0.50, 0.50], np.float32) + d1[..., None] * np.array([1.0, 0.92, 0.66], np.float32) * 0.62 + d2[..., None] * np.array([0.5, 0.78, 0.74], np.float32) * 0.40
    a = np.clip(Hm / 18.0, 0, 1) ** 0.9
    a = cv2.GaussianBlur(a, (0, 0), 1.3) * 0.92
    return np.clip(col, 0, 1) * a[..., None], a


def portal(x0, w, s6x0, s6):
    """half-scale copy of the next scene nested in the centre of the vortex"""
    cx, cy, R = CXV - x0, CYV, 112
    crop = s6[40:1000, 5560 - s6x0:6700 - s6x0]
    k = (2 * R) / 700.0
    small = cv2.resize(crop, (int(crop.shape[1] * k), int(crop.shape[0] * k)), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    out = np.zeros((H, w, 3), np.float32); alpha = np.zeros((H, w), np.float32)
    y0 = int(cy - sh * 0.50); xx0 = int(cx - sw * 0.5)
    out[y0:y0 + sh, xx0:xx0 + sw] = small
    yy, xx = np.mgrid[0:H, 0:w].astype(np.float32)
    d = np.hypot(xx - cx, yy - cy)
    alpha = 1 - smoothstep(R - 5, R + 3, d)
    glow = np.exp(-((d - R) / 16.0) ** 2) * 0.9 + np.exp(-(d / 210.0) ** 2) * 0.55
    return out, alpha, glow


def render_fold(x0=X0F, w=FW, verbose=True, paint_it=True):
    import time
    from paint import paint
    t0 = time.time()
    s34x0, s34 = cache_load('s34')
    s6x0, s6 = cache_load('s6')
    # --- base: pond/canopy world on the left, golden meadow on the right, blended along a wandering front
    base = np.zeros((H, w, 3), np.float32)
    xs = np.arange(x0, x0 + w)
    a34 = s34[:, np.clip(xs - s34x0, 0, s34.shape[1] - 1)]
    a6 = s6[:, np.clip(xs - s6x0, 0, s6.shape[1] - 1)]
    front = smoothstep(4760, 5130, xs[None, :].astype(np.float32) + 110 * fbm(x0, 0, w, H, 300, 3, 151))
    base = a34 * (1 - front[..., None]) + a6 * front[..., None]
    base = swirl_base(base, x0)
    if verbose: print('base+swirl', round(time.time() - t0, 1))
    # --- foliage tunnel
    tex_rgb, tex_a = draw_texture()
    if verbose: print('texture', round(time.time() - t0, 1))
    tex_pm = tex_rgb                                           # Layer.get() already premultiplied
    f_rgb, f_a, rr = map_log_polar(tex_pm, tex_a, x0, w)
    cl_col, cl_a = clouds_texture()
    c_rgb, c_a, _ = map_log_polar(cl_col * cl_a[..., None], cl_a, x0, w)
    xx = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    Mr = smoothstep(R_IN * 1.0, R_IN * 2.0, rr) * (1 - smoothstep(330, 800, rr)) * (1 - 0.92 * smoothstep(5250, 5900, xx))
    # the foliage does not fade as a veil: it dissolves into leaf-sized patches (noise-thresholded), so the fold breaks apart
    nz = fbm01(x0, 0, w, H, 26, 3, 171)
    Md = smoothstep(0.0, 0.16, Mr - 0.80 * nz * (1 - Mr ** 3))
    f_lum = (f_rgb / np.maximum(f_a, 1e-3)[..., None]).mean(-1)
    dark = smoothstep(0.30, 0.13, f_lum)                      # trunk-brown fragments never float loose in the sky
    Md = Md * (1 - dark * (1 - Mr) ** 0.6 * 0.97)
    Md = np.where(Mr > 0.985, 1.0, Md)
    img = base * (1 - 0.50 * c_a[..., None] * Mr[..., None]) + 0.50 * c_rgb * Mr[..., None]
    fa = f_a * Md
    img = img * (1 - fa[..., None]) + f_rgb * Md[..., None]
    img = img * (1 - 0.30 * c_a[..., None] * Mr[..., None]) + 0.30 * c_rgb * Mr[..., None]
    if verbose: print('tunnel', round(time.time() - t0, 1))
    # --- explicit continuity objects across 5|6: jade cloud ribbon, then the sweeping vine
    jr, ja = jade_ribbon(x0, w)
    img = img * (1 - ja[..., None]) + jr
    vr, va = crossing_vine(x0, w)
    img = img * (1 - va[..., None]) + vr
    # --- the portal (nested next scene) + its golden bloom, in front of the ribbon
    p_rgb, p_a, p_glow = portal(x0, w, s6x0, s6)
    img = 1 - (1 - img) * (1 - np.clip(p_glow[..., None] * np.array([1.0, 0.82, 0.45], np.float32) * 0.55, 0, 1))
    img = img * (1 - p_a[..., None]) + p_rgb * p_a[..., None]
    dr, da = drifting(x0, w)
    img = img * (1 - da[..., None]) + dr
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it: return img
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    detail = np.clip(edges + (p_a > 0.3) * 0.5, 0, 1)
    out, n = paint(img, passes=((9, 1.0, 0.0), (5.5, 1.0, 0.03), (3.4, 1.0, 0.04), (2.0, 1.1, 0.05), (1.4, 1.3, 0.07)),
                   default_flow=0.0, default_w=0.35, detail=detail, seed=21, struct_keep=0.32, verbose=verbose)
    out = out * (1 - p_a[..., None] * 0.9) + img * (p_a[..., None] * 0.9)      # keep the nested scene crisp
    if verbose: print('painted', n, round(time.time() - t0, 1))
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_fold()
    print('fold', round(time.time() - t, 1))
    cache_save('s5', X0F, img)
    preview(img, WORK + '/s5_preview.png', 1800)
    save_png(WORK + '/s5_slide5.png', img[:, 4320 - X0F:5400 - X0F])
