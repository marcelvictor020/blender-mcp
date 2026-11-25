"""The foreground of the garden: a midsummer meadow. Tall grasses with golden seed heads lit from behind, and the seven flowers of the midsummer folk
custom (poppy, cornflower, ox-eye daisy, buttercup, red clover, harebell, foxglove) painted large and warm in the near field, small and many beyond."""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi


def petal(c, x, y, ang, L, Wd, col, edge=None):
    c.save(); c.translate(x, y); c.rotate(ang)
    c.new_path(); c.move_to(0, 0); c.curve_to(L * 0.2, -Wd, L * 0.85, -Wd * 0.9, L, 0); c.curve_to(L * 0.85, Wd * 0.9, L * 0.2, Wd, 0, 0); c.close_path()
    g = cairo.LinearGradient(0, 0, L, 0); g.add_color_stop_rgb(0, *[v * 0.62 for v in col]); g.add_color_stop_rgb(0.55, *col); g.add_color_stop_rgb(1, *[min(1, v * 1.12 + 0.03) for v in col])
    c.set_source(g); c.fill_preserve()
    if edge: c.set_source_rgba(*edge, 0.45); c.set_line_width(max(0.5, Wd * 0.10)); c.stroke()
    else: c.new_path()
    c.restore()


def stem(c, x, y0, y1, bend, w):
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    for (wd, col) in ((w * 1.5, (0.07, 0.15, 0.05)), (w, (0.22, 0.40, 0.12))):
        c.set_source_rgb(*col); c.set_line_width(wd)
        c.new_path(); c.move_to(x, y0); c.curve_to(x + bend * 0.2, y0 + (y1 - y0) * 0.4, x + bend * 0.8, y0 + (y1 - y0) * 0.75, x + bend, y1); c.stroke()


def leafpair(c, x, y, s, rng, ang=None):
    for sd in (-1, 1):
        a = (ang if ang is not None else -math.pi / 2) + sd * rng.uniform(0.7, 1.2)
        c.save(); c.translate(x, y); c.rotate(a)
        c.new_path(); c.move_to(0, 0); c.curve_to(s * 0.3, -s * 0.18, s * 0.8, -s * 0.12, s, 0); c.curve_to(s * 0.8, s * 0.12, s * 0.3, s * 0.18, 0, 0); c.close_path()
        g = cairo.LinearGradient(0, 0, s, 0); g.add_color_stop_rgb(0, 0.10, 0.22, 0.06); g.add_color_stop_rgb(1, 0.38, 0.52, 0.14)
        c.set_source(g); c.fill(); c.restore()


def poppy(c, x, y, r, rng):
    for k in range(4):
        a = TAU * k / 4 + rng.uniform(-0.2, 0.2)
        cx, cy = x + math.cos(a) * r * 0.42, y + math.sin(a) * r * 0.36
        g = cairo.RadialGradient(cx - r * 0.1, cy - r * 0.15, 1, cx, cy, r * 0.62)
        g.add_color_stop_rgb(0, 0.99, 0.30, 0.16); g.add_color_stop_rgb(0.7, 0.86, 0.12, 0.08); g.add_color_stop_rgb(1, 0.52, 0.04, 0.05)
        c.set_source(g); c.new_path(); c.save(); c.translate(cx, cy); c.rotate(a); c.scale(r * 0.62, r * 0.50); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    c.set_source_rgb(0.05, 0.04, 0.05); c.new_path(); c.arc(x, y, r * 0.17, 0, TAU); c.fill()
    for k in range(14):
        a = TAU * k / 14; c.set_source_rgb(0.08, 0.06, 0.10); c.new_path(); c.arc(x + math.cos(a) * r * 0.25, y + math.sin(a) * r * 0.22, max(0.7, r * 0.03), 0, TAU); c.fill()


def cornflower(c, x, y, r, rng):
    for k in range(10):
        a = TAU * k / 10 + 0.1
        petal(c, x, y, a, r * 0.95, r * 0.20, (0.28, 0.40, 0.88), (0.12, 0.16, 0.42))
    for k in range(10):
        a = TAU * (k + 0.5) / 10
        petal(c, x, y, a, r * 0.60, r * 0.14, (0.48, 0.60, 0.96))
    c.set_source_rgb(0.30, 0.14, 0.50); c.new_path(); c.arc(x, y, r * 0.17, 0, TAU); c.fill()


def oxeye(c, x, y, r, rng):
    n = 17
    for k in range(n):
        a = TAU * k / n + rng.uniform(-0.05, 0.05)
        petal(c, x, y, a, r, r * 0.13, (0.97, 0.96, 0.93), (0.55, 0.55, 0.50))
    g = cairo.RadialGradient(x - r * 0.07, y - r * 0.07, 1, x, y, r * 0.30)
    g.add_color_stop_rgb(0, 1.0, 0.90, 0.30); g.add_color_stop_rgb(1, 0.82, 0.54, 0.05)
    c.set_source(g); c.new_path(); c.arc(x, y, r * 0.29, 0, TAU); c.fill()


def buttercup(c, x, y, r, rng):
    for k in range(5):
        a = TAU * k / 5 + 0.3
        cx, cy = x + math.cos(a) * r * 0.40, y + math.sin(a) * r * 0.36
        g = cairo.RadialGradient(cx - r * 0.1, cy - r * 0.1, 1, cx, cy, r * 0.58)
        g.add_color_stop_rgb(0, 1.0, 0.96, 0.50); g.add_color_stop_rgb(0.6, 0.99, 0.82, 0.10); g.add_color_stop_rgb(1, 0.85, 0.58, 0.04)
        c.set_source(g); c.new_path(); c.save(); c.translate(cx, cy); c.rotate(a); c.scale(r * 0.58, r * 0.50); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    c.set_source_rgb(0.50, 0.58, 0.14); c.new_path(); c.arc(x, y, r * 0.12, 0, TAU); c.fill()


def clover(c, x, y, r, rng):
    for k in range(34):
        a = rng.uniform(0, TAU); d = r * 0.55 * math.sqrt(rng.random())
        px, py = x + math.cos(a) * d, y + math.sin(a) * d * 0.9 - r * 0.15
        petal(c, px, py, a, r * 0.40, r * 0.09, (0.88, 0.34 + 0.2 * rng.random(), 0.56), (0.5, 0.15, 0.3))
    leafpair(c, x, y + r * 0.55, r * 0.9, rng, ang=math.pi / 2)


def harebell(c, x, y, r, rng):
    stem(c, x, y + r * 1.6, y - r * 0.2, r * 0.7, max(1.0, r * 0.07))
    for k, (dx, dy, s) in enumerate(((0.0, 0.0, 1.0), (0.5, 0.9, 0.82), (-0.2, 1.7, 0.68))):
        bx, by = x + dx * r * 0.6, y + dy * r * 0.5
        c.new_path(); c.move_to(bx - r * 0.05, by - r * 0.20 * s); c.curve_to(bx - r * 0.45 * s, by + r * 0.10 * s, bx - r * 0.46 * s, by + r * 0.45 * s, bx - r * 0.52 * s, by + r * 0.62 * s)
        c.line_to(bx + r * 0.52 * s, by + r * 0.62 * s); c.curve_to(bx + r * 0.46 * s, by + r * 0.45 * s, bx + r * 0.45 * s, by + r * 0.10 * s, bx + r * 0.05, by - r * 0.20 * s); c.close_path()
        g = cairo.LinearGradient(bx - r * 0.5, 0, bx + r * 0.5, 0); g.add_color_stop_rgb(0, 0.44, 0.52, 0.94); g.add_color_stop_rgb(0.5, 0.62, 0.68, 0.98); g.add_color_stop_rgb(1, 0.34, 0.38, 0.78)
        c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.18, 0.20, 0.50, 0.5); c.set_line_width(max(0.6, r * 0.04)); c.stroke()


def foxglove(c, x, y, r, rng, height):
    stem(c, x, y + height, y, r * 0.3, max(1.5, r * 0.10))
    n = 9
    for k in range(n):
        t = k / (n - 1)
        by = y + t * height * 0.78 + r * 0.2
        bx = x + r * 0.3 * t + (0.5 if k % 2 else -0.5) * r * 0.30
        s = r * (0.34 + 0.26 * (1 - t) * 0 + 0.16 * t)
        c.new_path(); c.save(); c.translate(bx, by); c.rotate(0.25 if k % 2 else -0.25)
        c.move_to(-s * 0.28, -s * 0.25); c.curve_to(-s * 0.8, s * 0.1, -s * 0.85, s * 0.8, -s * 0.55, s * 1.05); c.line_to(s * 0.55, s * 1.05); c.curve_to(s * 0.85, s * 0.8, s * 0.8, s * 0.1, s * 0.28, -s * 0.25); c.close_path()
        g = cairo.LinearGradient(-s, 0, s, 0); g.add_color_stop_rgb(0, 0.66, 0.20, 0.52); g.add_color_stop_rgb(0.5, 0.88, 0.46, 0.72); g.add_color_stop_rgb(1, 0.56, 0.14, 0.42)
        c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.30, 0.05, 0.22, 0.5); c.set_line_width(max(0.5, s * 0.06)); c.stroke()
        c.set_source_rgb(0.98, 0.92, 0.94); c.new_path(); c.save(); c.translate(0, s * 0.82); c.scale(s * 0.38, s * 0.18); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        c.set_source_rgba(0.38, 0.06, 0.26, 0.85)
        for j in range(3):
            c.new_path(); c.arc((j - 1) * s * 0.17, s * 0.82 + (j % 2) * s * 0.04, max(0.5, s * 0.045), 0, TAU); c.fill()
        c.restore()


KINDS = ['poppy', 'cornflower', 'oxeye', 'buttercup', 'clover', 'harebell', 'foxglove']
WTS = np.array([0.20, 0.16, 0.20, 0.16, 0.12, 0.10, 0.06])


def grass(c, rng, x0, w, ybase_lo, ybase_hi, n, hlo, hhi, sun_side=-1, path=None):
    """backlit blades with golden tips + seed heads"""
    for i in range(n):
        x = rng.uniform(x0 - 20, x0 + w + 20); yb = rng.uniform(ybase_lo, ybase_hi)
        if path is not None and abs(x - path[0]) < 26 + 0.34 * max(0.0, yb - path[1]): continue
        sc = (yb - HZ) / 450.0
        hgt = rng.uniform(hlo, hhi) * (0.6 + 0.6 * sc)
        bend = rng.normal(0, 0.14) * hgt
        g = cairo.LinearGradient(x, yb, x + bend, yb - hgt)
        g.add_color_stop_rgb(0, 0.10, 0.20, 0.06); g.add_color_stop_rgb(0.5, 0.32, 0.46, 0.10); g.add_color_stop_rgb(1, 0.92, 0.80, 0.34)
        c.set_source(g); c.set_line_width(max(1.0, 2.2 * sc) * rng.uniform(0.7, 1.3)); c.set_line_cap(cairo.LINE_CAP_ROUND)
        c.new_path(); c.move_to(x, yb); c.curve_to(x + bend * 0.1, yb - hgt * 0.5, x + bend * 0.6, yb - hgt * 0.8, x + bend, yb - hgt); c.stroke()
        if rng.random() < 0.28:
            tx, ty = x + bend, yb - hgt
            c.set_source_rgb(0.86, 0.72, 0.30); c.new_path(); c.save(); c.translate(tx, ty); c.rotate(math.atan2(bend, -hgt) * -1 + rng.normal(0, 0.1)); c.scale(max(1.2, 2.6 * sc), max(3, 9 * sc)); c.arc(0, -0.6, 1, 0, TAU); c.restore(); c.fill()
            c.set_source_rgba(1.0, 0.94, 0.62, 0.8); c.set_line_width(max(0.6, 0.9 * sc))
            for k in range(5):
                c.new_path(); c.move_to(tx, ty - 3 * sc); c.line_to(tx + rng.normal(0, 4 * sc), ty - 12 * sc - rng.uniform(0, 5 * sc)); c.stroke()


def meadow(x0, w, seed=8, xfade=(8300, 9100), n_flowers=520, path=None):
    """returns (rgb, a) layers: [back grasses + small flowers], [near large flowers + foreground grass]"""
    rng = np.random.default_rng(seed)
    La = Layer(w, H, x0, 0, 2)
    c = La.ctx
    grass(c, rng, x0, w, HZ + 150, 1350, int(w * 0.55), 40, 130, path=path)
    pts = []
    for _ in range(n_flowers):
        y = HZ + 120 + 440 * rng.uniform(0, 1) ** 0.62
        x = rng.uniform(x0, x0 + w)
        pts.append((y, x))
    pts.sort()
    for (y, x) in pts:
        if y > 1345: continue
        if path is not None and abs(x - path[0]) < 40 + 0.36 * max(0.0, y - path[1]): continue
        sc = (y - HZ) / 520.0
        r = 6 + 34 * sc ** 1.15 * rng.uniform(0.75, 1.2)
        k = int(rng.choice(7, p=WTS / WTS.sum()))
        kind = KINDS[k]
        hgt = r * rng.uniform(1.8, 3.4) * (1.5 if kind == 'foxglove' else 1.0)
        if kind in ('harebell',):
            hgt = 0
        else:
            stem(c, x, y + hgt, y, rng.normal(0, r * 0.5), max(1.2, r * 0.10))
            leafpair(c, x + 0.0, y + hgt * 0.55, r * 1.3, rng)
        c.set_source_rgba(0.04, 0.08, 0.02, 0.25); c.new_path(); c.save(); c.translate(x + r * 0.2, y + r * 0.35); c.scale(r * 0.9, r * 0.38); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        {'poppy': poppy, 'cornflower': cornflower, 'oxeye': oxeye, 'buttercup': buttercup, 'clover': clover}.get(kind, None) and {'poppy': poppy, 'cornflower': cornflower, 'oxeye': oxeye, 'buttercup': buttercup, 'clover': clover}[kind](c, x, y, r, rng)
        if kind == 'harebell': harebell(c, x, y, r * 0.9, rng)
        if kind == 'foxglove': foxglove(c, x, y, r * 0.75, rng, hgt)
    grass(c, rng, x0, w, 1290, 1362, int(w * 0.30), 90, 230, path=path)
    rgb, a = La.get()
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    f = smoothstep(xfade[0], xfade[1], xs)
    return rgb * f[..., None], a * f


if __name__ == '__main__':
    import time
    t = time.time()
    x0, w = 10000, 1400
    rgb, a = meadow(x0, w)
    img = np.zeros((H, w, 3), np.float32); img[:] = np.array([0.45, 0.50, 0.18], np.float32)
    img = img * (1 - a[..., None]) + rgb
    save_png(WORK + '/meadow_test.png', img[1000:1350])
    print('meadow', round(time.time() - t, 1))
