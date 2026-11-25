"""Painted trees: tapered trunks and limbs shaded like cylinders, foliage built from thousands of leaf-dabs that are sphere-lit by the low sun
(gold on the sunny side, blue-green in shade, translucent rim), conifers as drooping sprays of needle clumps, birches with white bark.
Atmospheric haze pulls far trees toward the sunset glow."""
import math
import numpy as np
import cairo
import cv2
from util import *

TAU = 2 * math.pi
LV = np.array([-0.86, 0.12, 0.50], np.float32); LV /= np.linalg.norm(LV)

DECID = dict(shadow=(0.04, 0.12, 0.10), mid=(0.13, 0.29, 0.12), lit=(0.50, 0.58, 0.17), rim=(1.0, 0.86, 0.40), trunk=(0.30, 0.20, 0.13), trunk_lit=(0.70, 0.46, 0.24))
CONIF = dict(shadow=(0.02, 0.085, 0.085), mid=(0.06, 0.20, 0.14), lit=(0.30, 0.44, 0.17), rim=(0.96, 0.78, 0.36), trunk=(0.22, 0.14, 0.09), trunk_lit=(0.55, 0.36, 0.20))
BIRCHP = dict(shadow=(0.08, 0.19, 0.10), mid=(0.26, 0.40, 0.12), lit=(0.62, 0.66, 0.22), rim=(1.0, 0.90, 0.46), trunk=(0.72, 0.70, 0.64), trunk_lit=(1.0, 0.94, 0.80))


def mix3(a, b, t):
    t = max(0.0, min(1.0, t))
    return (a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t)


def leaf_col(pal, lam, rng, var=0.11):
    c = mix3(pal['shadow'], pal['mid'], lam / 0.42) if lam < 0.42 else mix3(pal['mid'], pal['lit'], (lam - 0.42) / 0.48)
    if lam > 0.78:
        c = mix3(c, pal['rim'], (lam - 0.78) * 1.3)
    j = 1 + rng.normal(0, var)
    h = rng.normal(0, 0.035)
    return (min(1, max(0, c[0] * j + h * 0.7)), min(1, max(0, c[1] * j + h * 0.15)), min(1, max(0, c[2] * j - h * 0.5)))


def hz(col, haze, hazecol):
    return (col[0] * (1 - haze) + hazecol[0] * haze, col[1] * (1 - haze) + hazecol[1] * haze, col[2] * (1 - haze) + hazecol[2] * haze)


def limb(c, p0, p1, w0, w1, pal, haze, hazecol, sway=0.0):
    """tapered limb with a lit side (left) and shaded side (right)"""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) + 1e-6
    nx, ny = -dy / L, dx / L
    mx, my = (p0[0] + p1[0]) / 2 + nx * sway, (p0[1] + p1[1]) / 2 + ny * sway
    a = (p0[0] + nx * w0, p0[1] + ny * w0); b = (p0[0] - nx * w0, p0[1] - ny * w0)
    d = (p1[0] - nx * w1, p1[1] - ny * w1); e = (p1[0] + nx * w1, p1[1] + ny * w1)
    dark = hz(pal['trunk'], haze, hazecol); lit = hz(pal['trunk_lit'], haze, hazecol)
    g = cairo.LinearGradient(p0[0] + nx * w0, p0[1] + ny * w0, p0[0] - nx * w0, p0[1] - ny * w0)
    side = -1.0 if nx > 0 else 1.0
    g.add_color_stop_rgb(0.0, *(lit if nx < 0 else dark)); g.add_color_stop_rgb(0.30, *mix3(lit if nx < 0 else dark, dark if nx < 0 else lit, 0.35))
    g.add_color_stop_rgb(1.0, *(dark if nx < 0 else lit))
    c.set_source(g)
    c.new_path(); c.move_to(*a); c.curve_to(a[0] * 0.5 + mx * 0.5 + nx * w0 * 0.2, a[1] * 0.5 + my * 0.5 + ny * w0 * 0.2, e[0] * 0.5 + mx * 0.5 + nx * w1 * 0.2, e[1] * 0.5 + my * 0.5 + ny * w1 * 0.2, *e)
    c.line_to(*d); c.curve_to(d[0] * 0.5 + mx * 0.5 - nx * w1 * 0.2, d[1] * 0.5 + my * 0.5 - ny * w1 * 0.2, b[0] * 0.5 + mx * 0.5 - nx * w0 * 0.2, b[1] * 0.5 + my * 0.5 - ny * w0 * 0.2, *b)
    c.close_path(); c.fill()


def bark_lines(c, p0, p1, w0, w1, rng, haze, n=None):
    if w0 < 2.2: return
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) + 1e-6
    nx, ny = -dy / L, dx / L
    n = n or int(w0 * 0.9)
    for k in range(n):
        f = rng.uniform(-0.85, 0.85)
        t0 = rng.uniform(0, 0.7); t1 = min(1.0, t0 + rng.uniform(0.15, 0.4))
        wa = (w0 * (1 - t0) + w1 * t0) * f; wb = (w0 * (1 - t1) + w1 * t1) * f
        a = (p0[0] + dx * t0 + nx * wa, p0[1] + dy * t0 + ny * wa); b = (p0[0] + dx * t1 + nx * wb, p0[1] + dy * t1 + ny * wb)
        c.set_source_rgba(0.04, 0.025, 0.02, 0.35 * (1 - haze)); c.set_line_width(max(0.7, w0 * 0.06))
        c.new_path(); c.move_to(*a); c.line_to(*b); c.stroke()


def crown(c, cx, cy, rx, ry, n, pal, rng, haze, hazecol, ccx=None, ccy=None, crx=None, cry=None, holes=0.40, dab=1.0):
    """foliage mass: three passes (shadow mass, mid dabs, bright dabs). Normals blend the clump's own sphere with the whole crown's sphere."""
    ccx = cx if ccx is None else ccx; ccy = cy if ccy is None else ccy
    crx = rx if crx is None else crx; cry = ry if cry is None else cry
    for (frac, rs, lb) in ((0.20, 0.23, -0.22), (0.42, 0.125, 0.0), (0.62, 0.068, 0.16)):
        m = int(n * frac)
        r_px = max(1.0, rs * rx * dab)
        for _ in range(m):
            th = rng.uniform(0, TAU); rad = math.sqrt(rng.random())
            u, v = rad * math.cos(th), rad * math.sin(th)
            if rad > 0.80 and rng.random() < holes: continue
            px, py = cx + u * rx, cy + v * ry
            U, V = (px - ccx) / crx, (py - ccy) / cry
            nx, ny = 0.50 * U + 0.60 * u, 0.50 * V + 0.60 * v
            q = nx * nx + ny * ny
            if q > 1.0: nx, ny = nx / math.sqrt(q), ny / math.sqrt(q); q = 1.0
            nz = math.sqrt(1 - q)
            lam = max(0.0, min(1.0, nx * LV[0] + ny * LV[1] + nz * LV[2] + lb))
            col = hz(leaf_col(pal, lam, rng), haze, hazecol)
            c.set_source_rgb(*col)
            c.new_path(); c.arc(px, py, r_px * rng.uniform(0.75, 1.3), 0, TAU); c.fill()


def deciduous(c, x, yb, h, rng, pal, haze, hazecol, density=1.0, aspect=1.0):
    lean = rng.normal(0, 0.018) * h
    tr_h = 0.40 * h
    top = (x + lean, yb - tr_h)
    wb, wt = 0.050 * h, 0.022 * h
    ncl = int(rng.integers(5, 9))
    crx, cry = 0.31 * h * aspect, 0.27 * h
    ccx, ccy = top[0], yb - 0.66 * h
    clumps = []
    for i in range(ncl):
        ang = TAU * (i + rng.random() * 0.8) / ncl
        rr = rng.uniform(0.18, 0.78)
        clumps.append((ccx + math.cos(ang) * rr * crx, ccy + math.sin(ang) * rr * cry * 0.9 - 0.03 * h, crx * rng.uniform(0.36, 0.56)))
    limb(c, (x, yb), top, wb, wt, pal, haze, hazecol)
    bark_lines(c, (x, yb), top, wb, wt, rng, haze)
    for (kx, ky, kr) in clumps:
        limb(c, (top[0], top[1] + 0.04 * h), (kx, ky + 0.35 * kr), wt * 0.8, max(0.7, wt * 0.30), pal, haze, hazecol, sway=rng.normal(0, 3))
    for (kx, ky, kr) in sorted(clumps, key=lambda t: t[1]):
        n = int(density * max(26, 0.16 * kr * kr))
        crown(c, kx, ky, kr, kr * 0.86, n, pal, rng, haze, hazecol, ccx, ccy, crx, cry)


def conifer(c, x, yb, h, rng, pal, haze, hazecol, density=1.0):
    lean = rng.normal(0, 0.012) * h
    tw = max(0.9, 0.017 * h)
    limb(c, (x, yb), (x + lean, yb - h * 0.97), tw * 1.5, tw * 0.35, pal, haze, hazecol)
    n = max(6, int(h / 9.5))
    m = 5 if h > 150 else (4 if h > 90 else 3)
    ccx = x + lean * 0.5
    for i in range(n - 1, -1, -1):
        t = i / (n - 1)
        yi = yb - h * (0.05 + 0.92 * t)
        wi = h * 0.30 * (1 - t) ** 0.92 * rng.uniform(0.78, 1.18) + 0.012 * h
        for side in (-1, 1):
            tip = (x + lean * (1 - t) + side * wi, yi + 0.075 * h * (1 - 0.5 * t) * rng.uniform(0.7, 1.2))
            base = (x + lean * (1 - t), yi)
            ang = math.atan2(tip[1] - base[1], tip[0] - base[0])
            for k in range(m):
                s = 0.16 + 0.84 * k / max(1, m - 1)
                px = base[0] + (tip[0] - base[0]) * s
                py = base[1] + (tip[1] - base[1]) * s + 0.04 * h * s * s * (1 - 0.3 * t)
                rr = (0.020 + 0.013 * s) * h * (0.75 + 0.5 * (1 - t))
                for q in range(int(2 + density * 2)):
                    ox, oy = rng.normal(0, rr * 0.8), rng.normal(0, rr * 0.45)
                    nx = 0.6 * side * s * (-1.0) + rng.normal(0, 0.18)       # sun side = left (-x)
                    lam = max(0.0, min(1.0, (-side) * 0.62 * s + 0.30 + rng.normal(0, 0.14) + 0.22 * (1 - t) - 0.16 * (oy > 0)))
                    col = hz(leaf_col(pal, lam, rng, 0.10), haze, hazecol)
                    c.set_source_rgb(*col)
                    c.save(); c.translate(px + ox, py + oy); c.rotate(ang + rng.normal(0, 0.35)); c.scale(rr * 1.35, rr * 0.62); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def birch(c, x, yb, h, rng, pal, haze, hazecol, density=1.0):
    lean = rng.normal(0, 0.022) * h
    top = (x + lean, yb - 0.80 * h)
    wb = max(1.2, 0.028 * h)
    limb(c, (x, yb), top, wb, wb * 0.45, pal, haze, hazecol, sway=rng.normal(0, 2))
    for k in range(int(h / 18)):                                         # dark horizontal bark marks
        t = rng.uniform(0.05, 0.9); px, py = x + lean * t, yb - 0.8 * h * t
        c.set_source_rgba(0.06, 0.05, 0.04, 0.55 * (1 - haze)); c.set_line_width(max(0.8, wb * 0.35))
        c.new_path(); c.move_to(px - wb * 0.6, py); c.line_to(px + wb * rng.uniform(0.1, 0.7), py + rng.normal(0, 0.6)); c.stroke()
    ccx, ccy = top[0], yb - 0.80 * h
    crx, cry = 0.24 * h, 0.26 * h
    for i in range(int(rng.integers(3, 6))):
        ang = TAU * rng.random(); rr = rng.uniform(0.0, 0.55)
        kx, ky, kr = ccx + math.cos(ang) * rr * crx, ccy + math.sin(ang) * rr * cry - 0.03 * h, crx * rng.uniform(0.42, 0.62)
        limb(c, (top[0], top[1] + 0.06 * h), (kx, ky + 0.4 * kr), wb * 0.45, 0.7, pal, haze, hazecol)
    for i in range(int(rng.integers(3, 6))):
        ang = TAU * rng.random(); rr = rng.uniform(0.0, 0.55)
        kx, ky, kr = ccx + math.cos(ang) * rr * crx, ccy + math.sin(ang) * rr * cry - 0.03 * h, crx * rng.uniform(0.42, 0.62)
        crown(c, kx, ky, kr, kr * 0.9, int(density * max(24, 0.14 * kr * kr)), pal, rng, haze, hazecol, ccx, ccy, crx, cry, holes=0.55, dab=1.1)


def forest_layers(x0, w, seed=81, lake_x=8950.0, hazecol=(1.0, 0.84, 0.60), rows=580, ytop=HZ - 520):
    """three depth bands of trees across [x0,x0+w); returns [(rgb premult, alpha)] far -> near, rows [ytop, ytop+rows)"""
    out = []
    rng = np.random.default_rng(seed)
    wk = w / 4900.0
    specs = [(0.78, (62, 130), int(1500 * wk), 0.6, 0.006, 1.6), (0.52, (120, 215), int(950 * wk), 0.85, 0.014, 1.0), (0.20, (190, 320), int(500 * wk), 1.0, 0.030, 0.45)]
    for li, (haze, (hlo, hhi), n, dens, dyb, blur) in enumerate(specs):
        L = Layer(w, rows, x0, ytop, 1)
        c = L.ctx
        pts = []
        for i in range(n):
            x = rng.uniform(x0 - 40, x0 + w + 40)
            keep = float(smoothstep(lake_x - 250, lake_x + 450, x))
            if li > 0 and rng.random() > keep: continue
            if li == 0 and rng.random() > 0.22 + 0.78 * keep: continue
            hh = hlo + (hhi - hlo) * rng.beta(2.0, 2.4)
            yb = HZ + rng.uniform(-5, 14) + li * 12 * rng.random()
            pts.append((yb, x, hh))
        pts.sort()
        for (yb, x, hh) in pts:
            kind = rng.random()
            if kind < 0.62: conifer(c, x, yb, hh, rng, CONIF, haze, hazecol, density=dens)
            elif kind < 0.84: deciduous(c, x, yb, hh * 0.9, rng, DECID, haze, hazecol, density=dens, aspect=rng.uniform(0.9, 1.3))
            else: birch(c, x, yb, hh * 0.85, rng, BIRCHP, haze, hazecol, density=dens)
        rgb, a = L.get()
        if blur > 0.5:
            rgb = cv2.GaussianBlur(rgb, (0, 0), blur); a = cv2.GaussianBlur(a, (0, 0), blur)
        out.append((rgb, a))
    return out


def _segments(rng, a, b, glo, ghi, llo, lhi):
    out = []; x = a + rng.uniform(0, glo)
    while x < b:
        L = rng.uniform(llo, lhi); out.append((x, x + L)); x += L + rng.uniform(glo, ghi)
    return out


def bank(c, xa, xb, yb, haze, hazecol, rng, hmax=7.0):
    """a low grassy shore the trees stand on (a dome of meadow + reed tufts) - so the far shore is land, not floating trees"""
    n = max(8, int((xb - xa) / 4))
    xs = np.linspace(xa, xb, n)
    prof = np.sin(np.linspace(0, math.pi, n)) ** 0.6
    top = yb - hmax * prof * (0.75 + 0.25 * np.sin(xs * 0.11 + rng.uniform(0, 6)))
    c.new_path(); c.move_to(xs[0], yb + 4)
    for x_, y_ in zip(xs, top): c.line_to(x_, y_)
    c.line_to(xs[-1], yb + 4); c.close_path()
    base = hz((0.16, 0.26, 0.10), haze, hazecol); lit = hz((0.46, 0.50, 0.16), haze, hazecol)
    g = cairo.LinearGradient(0, yb - hmax, 0, yb + 3)
    g.add_color_stop_rgb(0, *lit); g.add_color_stop_rgb(0.5, *base); g.add_color_stop_rgb(1, *hz((0.06, 0.12, 0.08), haze, hazecol))
    c.set_source(g); c.fill()
    for _ in range(int((xb - xa) / 3)):
        x = rng.uniform(xa, xb); k = int(np.clip((x - xa) / max(1, xb - xa) * (n - 1), 0, n - 1))
        c.set_source_rgb(*hz((0.30 + 0.2 * rng.random(), 0.40 + 0.15 * rng.random(), 0.14), haze, hazecol))
        c.set_line_width(max(0.6, hmax * 0.14)); c.new_path(); c.move_to(x, top[k] + 1.5); c.line_to(x + rng.normal(0, 0.8), top[k] - rng.uniform(1, hmax * 0.8)); c.stroke()


def world_forest(x0, w, seed=81, rows=580, ytop=HZ - 520, F0=8700.0, F1=9400.0, dusk=(7000.0, 5200.0)):
    """the far shore of the whole lake as one continuous painted treeline: a thin hazy strip in the dusk pond, islands of firs and birches, then
    the big gold-lit forest of the garden. Same trees wherever it is sliced."""
    rng = np.random.default_rng(seed)
    F = lambda x: float(smoothstep(F0, F1, x))
    twf = lambda x: float(smoothstep(dusk[0], dusk[1], x))
    gold, dusk_h = np.array([1.0, 0.84, 0.62]), np.array([0.76, 0.60, 0.80])
    hazc = lambda x: tuple(gold * (1 - twf(x)) + dusk_h * twf(x))
    far_seg = _segments(rng, x0 - 200, F0 + 100, 90, 500, 160, 700)
    isl = [(4980, 150), (5700, 235), (6450, 150), (7040, 210), (7720, 320), (8330, 240)]
    inseg = lambda segs, x: any(a <= x <= b for a, b in segs)
    inisl = lambda x: any(abs(x - c_) < hw for c_, hw in isl)
    specs = [(0.78, (62, 130), 0.6, 1.6), (0.52, (120, 215), 0.85, 1.0), (0.20, (190, 320), 1.0, 0.45)]
    gaps = _segments(rng, F0 + 500, x0 + w, 520, 1300, 70, 190)
    out = []
    for li, (haze, (hlo, hhi), dens, blur) in enumerate(specs):
        L = Layer(w, rows, x0, ytop, 1)
        c = L.ctx
        pts = []
        n = int({0: 1500, 1: 950, 2: 500}[li] * w / 4900.0)
        for i in range(n):
            x = rng.uniform(x0 - 40, x0 + w + 40)
            f = F(x)
            if li == 0:
                keep = 0.15 + 0.85 * f + (0.85 * (1 - f) if inseg(far_seg, x) else 0.0)
                sc = 0.20 + 0.80 * f
                if rng.random() > min(1.0, keep): continue
                if f < 0.5 and not inseg(far_seg, x) and rng.random() > 0.35: continue
            elif li == 1:
                keep = f + ((1 - f) * (1.0 if inisl(x) else 0.0))
                sc = 0.30 + 0.70 * f
                if rng.random() > keep: continue
            else:
                keep = f
                sc = 1.0
                if rng.random() > keep: continue
            wave = 0.78 + 0.22 * math.sin(x / 340.0 + 1.0) + 0.14 * math.sin(x / 131.0 + 2.0) + 0.10 * math.sin(x / 57.0)
            if f > 0.5 and any(a_ <= x <= b_ for a_, b_ in gaps): continue
            hh = (hlo + (hhi - hlo) * rng.beta(2.0, 2.4)) * sc * wave * float(np.clip(rng.lognormal(0, 0.22), 0.6, 1.6))
            yb = HZ + rng.uniform(-5, 14) * (0.4 + 0.6 * f) + li * 12 * rng.random() * (0.2 + 0.8 * f)
            pts.append((yb, x, hh))
        if li == 1:
            for (xa, xb, side) in ((3150, 3640, 0), (3950, 4560, 1)):
                if xb < x0 - 50 or xa > x0 + w + 50: continue
                for _ in range(int(560 * (xb - xa) / 500)):
                    x = rng.uniform(xa, xb)
                    edge = (xb - x) / (xb - xa) if side == 0 else (x - xa) / (xb - xa)
                    if rng.random() > float(smoothstep(0.0, 0.22, edge)): continue
                    pts.append((HZ + rng.uniform(-3, 9), x, max(22.0, 36 + 250 * edge ** 1.5 + rng.normal(0, 12))))
        pts.sort()
        if li == 1:
            for (xa, xb) in ((3150, 3640), (3950, 4560)):
                if xb > x0 - 50 and xa < x0 + w + 50: bank(c, xa, xb, HZ + 7, haze, hazc((xa + xb) / 2), rng, hmax=6.0)
        if li == 0:
            for (a, b) in far_seg:
                if b > x0 - 50 and a < x0 + w + 50: bank(c, a, b, HZ + 1.5, haze, hazc((a + b) / 2), rng, hmax=2.6)
        if li == 1:
            for (c_, hw) in isl:
                if c_ + hw > x0 - 50 and c_ - hw < x0 + w + 50: bank(c, c_ - hw, c_ + hw, HZ + 7, haze, hazc(c_), rng, hmax=7.5)
        for (yb, x, hh) in pts:
            kind = rng.random()
            hc = hazc(x)
            f = F(x)
            if kind < 0.46 - 0.06 * (1 - f): conifer(c, x, yb, hh, rng, CONIF, haze, hc, density=dens)
            elif kind < 0.82: deciduous(c, x, yb, hh * 0.9, rng, DECID, haze, hc, density=dens, aspect=rng.uniform(0.9, 1.3))
            else: birch(c, x, yb, hh * 0.85, rng, BIRCHP, haze, hc, density=dens)
        rgb, a = L.get()
        if blur > 0.5:
            rgb = cv2.GaussianBlur(rgb, (0, 0), blur); a = cv2.GaussianBlur(a, (0, 0), blur)
        out.append((rgb, a))
    return out


if __name__ == '__main__':
    import time
    import clouds3 as CL
    t = time.time()
    x0, w = 9700, 1500
    sky_img, D = CL.sky(x0, w, cov_x=lambda xs: np.full(xs.shape, 0.8, np.float32))
    img = np.zeros((H, w, 3), np.float32)
    img[:HZ] = sky_img
    img[HZ:] = np.array([0.45, 0.50, 0.18], np.float32)
    layers = forest_layers(x0, w)
    print('forest', round(time.time() - t, 1), 's')
    for (rgb, a) in layers:
        sl = img[HZ - 520:HZ + 60]
        img[HZ - 520:HZ + 60] = sl * (1 - a[..., None]) + rgb
    save_png(WORK + '/trees_test.png', img[300:900])
