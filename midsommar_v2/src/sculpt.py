"""Sculpted clouds: a face, a bear, a swan.

One silhouette, two renderings. The silhouette is a smooth polygon in a small local frame. For the FOLK style it becomes a ring
of ink-outlined scalloped puffs; for the REAL style it becomes a height field (distance-transform "pillow" + sculpted features +
cauliflower noise + a wobbly edge) lit like a volumetric cloud. Same shape, same place, so the cloud can melt from one style
into the other without changing what it is.
"""
import math
import numpy as np
import cv2
from util import *

TAU = 2 * math.pi


def closed_spline(pts, n_per=14):
    pts = np.asarray(pts, np.float32)
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        for k in range(n_per):
            t = k / n_per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out, np.float32)


class Frame:
    """local frame: (u right, v up) in units of S, rotated by phi (counter-clockwise on screen), anchored at (cx,cy)"""

    def __init__(self, cx, cy, S, phi=0.0, flip=False):
        self.cx, self.cy, self.S, self.phi, self.flip = cx, cy, S, phi, flip
        self.c, self.s = math.cos(phi), math.sin(phi)

    def __call__(self, u, v):
        if self.flip: u = -u
        return (self.cx + self.S * (u * self.c - v * self.s), self.cy - self.S * (u * self.s + v * self.c))

    def inv(self, x, y):
        a, b = (x - self.cx) / self.S, -(y - self.cy) / self.S
        u, v = a * self.c + b * self.s, -a * self.s + b * self.c
        return (-u if self.flip else u), v

    def pts(self, lst):
        return np.array([self(u, v) for (u, v) in lst], np.float32)


# ====================================================================================================== shapes (local frames)
FACE_FRONT = [(0.18, 0.40), (0.255, 0.30), (0.285, 0.20), (0.298, 0.135), (0.282, 0.100), (0.318, 0.025), (0.372, -0.050), (0.405, -0.095),
              (0.375, -0.118), (0.340, -0.122), (0.352, -0.150), (0.372, -0.172), (0.340, -0.196), (0.355, -0.222), (0.330, -0.252),
              (0.318, -0.262), (0.335, -0.300), (0.328, -0.335), (0.290, -0.365), (0.190, -0.345), (0.120, -0.360), (0.095, -0.500)]
FACE_BACK = [(-0.12, -0.56), (-0.24, -0.47), (-0.34, -0.28), (-0.41, -0.05), (-0.42, 0.18), (-0.33, 0.36), (-0.15, 0.47), (0.05, 0.47)]
FACE_POLY = FACE_FRONT + FACE_BACK
FACE_FINE_RANGE = (0.0, 0.12, -0.40, 0.14)          # u>=, ... : the front-of-face band where details are small (nose, lips, chin)

BEAR = [(-0.50, 0.06), (-0.50, 0.12), (-0.44, 0.16), (-0.28, 0.215), (-0.08, 0.25), (0.08, 0.30), (0.20, 0.27), (0.26, 0.31), (0.30, 0.355),
        (0.345, 0.31), (0.37, 0.25), (0.44, 0.185), (0.52, 0.15), (0.555, 0.115), (0.535, 0.075), (0.47, 0.055), (0.40, 0.03), (0.32, 0.02),
        (0.27, -0.03), (0.28, -0.14), (0.30, -0.30), (0.32, -0.40), (0.29, -0.44), (0.17, -0.44), (0.16, -0.36), (0.14, -0.22), (0.10, -0.12),
        (-0.02, -0.115), (-0.12, -0.12), (-0.17, -0.16), (-0.19, -0.30), (-0.19, -0.40), (-0.21, -0.44), (-0.33, -0.44), (-0.34, -0.38),
        (-0.36, -0.25), (-0.44, -0.12), (-0.50, 0.0)]
BEAR_FAR = [[(0.04, -0.10), (0.06, -0.25), (0.08, -0.39), (0.06, -0.44), (-0.06, -0.44), (-0.07, -0.37), (-0.08, -0.24), (-0.10, -0.10)],
            [(-0.07, -0.11), (-0.04, -0.26), (-0.02, -0.39), (-0.04, -0.44), (-0.16, -0.44), (-0.17, -0.37), (-0.18, -0.25), (-0.20, -0.11)]]


def _tube(center, widths, n_per=10):
    c = closed_spline(center, 1) if False else np.array(center, np.float32)
    # open Catmull-Rom through the centre line, tapered width -> polygon
    P, Wd = [], []
    pp = np.vstack([c[0], c, c[-1]])
    wp = np.concatenate([[widths[0]], widths, [widths[-1]]])
    for i in range(len(c) - 1):
        for k in range(n_per):
            t = k / n_per
            p0, p1, p2, p3 = pp[i], pp[i + 1], pp[i + 2], pp[i + 3]
            P.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
            Wd.append(wp[i + 1] * (1 - t) + wp[i + 2] * t)
    P = np.array(P, np.float32); Wd = np.array(Wd, np.float32)
    tg = np.gradient(P, axis=0)
    tg /= np.linalg.norm(tg, axis=1, keepdims=True) + 1e-9
    nr = np.stack([-tg[:, 1], tg[:, 0]], 1)
    left = P + nr * Wd[:, None]; right = P - nr * Wd[:, None]
    return np.vstack([left, right[::-1]])


SWAN_BODY = [(-0.58, 0.20), (-0.44, 0.06), (-0.26, -0.08), (0.0, -0.15), (0.24, -0.11), (0.36, 0.02), (0.31, 0.13), (0.12, 0.18), (-0.10, 0.19), (-0.32, 0.21)]
SWAN_NECK = [(0.20, 0.05), (0.34, 0.20), (0.42, 0.38), (0.37, 0.56), (0.40, 0.70), (0.47, 0.80)]
SWAN_NECK_W = [0.095, 0.082, 0.068, 0.060, 0.054, 0.050]
SWAN_HEAD = (0.53, 0.815, 0.085, 0.066)
SWAN_BEAK = [(0.60, 0.845), (0.76, 0.785), (0.60, 0.775)]


def _ellipse_poly(cx, cy, rx, ry, n=28):
    return [(cx + rx * math.cos(TAU * i / n), cy + ry * math.sin(TAU * i / n)) for i in range(n)]


# ====================================================================================================== rasterising / height fields
def raster(polys, x0, w, h, ss=2, y0=0):
    L = Layer(w, h, x0, y0, ss)
    c = L.ctx
    c.set_source_rgba(1, 1, 1, 1)
    for poly in polys:
        c.new_path()
        c.move_to(*poly[0])
        for p in poly[1:]:
            c.line_to(*p)
        c.close_path()
        c.fill()
    return L.get()[1]


def wobble(mask, x0, w, h, amp, cell, seed):
    dx = fbm(x0, 0, w, h, cell, 3, seed) * amp * 1.8
    dy = fbm(x0, 0, w, h, cell, 3, seed + 9) * amp * 1.8
    return warp(mask, dx, dy)


def pillow(mask, pr, inner=0.28):
    m8 = (mask > 0.5).astype(np.uint8)
    d = cv2.distanceTransform(m8, cv2.DIST_L2, 5).astype(np.float32)
    r = np.minimum(d, pr) / pr
    h = pr * np.sqrt(np.clip(1 - (1 - r) ** 2, 0, 1))
    return h + inner * np.minimum(d, 3.0 * pr)


def bump(H, x0, px, py, sx, sy, amp, rot=0.0):
    h, w = H.shape
    xs = (np.arange(w, dtype=np.float32) + x0 - px)[None, :]
    ys = (np.arange(h, dtype=np.float32) - py)[:, None]
    c, s = math.cos(rot), math.sin(rot)
    a, b = xs * c + ys * s, -xs * s + ys * c
    H += amp * np.exp(-((a / sx) ** 2 + (b / sy) ** 2))


def puff_height(puffs, x0, w, h, k=0.82):
    Hm = np.zeros((h, w), np.float32)
    for (px, py, pr) in puffs:
        xa, xb = int(px - pr - x0), int(px + pr - x0) + 1
        ya, yb = int(py - pr), int(py + pr) + 1
        xa, xb, ya, yb = max(xa, 0), min(xb, w), max(ya, 0), min(yb, h)
        if xa >= xb or ya >= yb: continue
        X = (np.arange(xa, xb, dtype=np.float32) + x0 - px)[None, :]
        Y = (np.arange(ya, yb, dtype=np.float32) - py)[:, None]
        hh = pr * np.sqrt(np.clip(1 - (X * X + Y * Y) / (pr * pr), 0, 1)) * k
        np.maximum(Hm[ya:yb, xa:xb], hh, out=Hm[ya:yb, xa:xb])
    return Hm


# ====================================================================================================== the sleeper (face)
FACE_PHI = 0.30                                      # head tilted back: she looks up at the sky


def face_frame(cx, cy, S):
    return Frame(cx, cy, S, FACE_PHI)


def face_polygon(cx, cy, S):
    return closed_spline(face_frame(cx, cy, S).pts(FACE_POLY), 10)


HAIR = [(-0.62, 0.12, 0.30), (-0.84, -0.06, 0.28), (-1.08, -0.20, 0.26), (-0.70, 0.40, 0.22), (-0.52, -0.34, 0.27), (-0.95, -0.46, 0.24),
        (-1.30, -0.32, 0.26), (-1.55, -0.40, 0.25), (-0.30, 0.50, 0.18), (-1.12, 0.10, 0.22)]


def face_extra_puffs(cx, cy, S, seed=5):
    """hair billows behind the head + the breath: puffs leaving the lips on a curve that lands on the ribbon (it becomes the mist)"""
    from shared import RIBBON
    f = face_frame(cx, cy, S)
    puffs = []
    for (u, v, r) in HAIR:
        x, y = f(u, v)
        puffs.append((x, y, r * S))
    lx, ly = f(0.372, -0.172)
    rx = np.array([p[0] for p in RIBBON], np.float32); ry = np.array([p[1] for p in RIBBON], np.float32)
    ex = lx + 330.0
    ey = float(np.interp(ex, rx, ry)) - 14.0
    P0, P1, P2, P3 = (lx + 16, ly + 4), (lx + 120, ly + 12), (lx + 235, ey - 78), (ex, ey)
    n = 11
    for i in range(n):
        t = i / (n - 1)
        mt = 1 - t
        x = mt ** 3 * P0[0] + 3 * mt * mt * t * P1[0] + 3 * mt * t * t * P2[0] + t ** 3 * P3[0]
        y = mt ** 3 * P0[1] + 3 * mt * mt * t * P1[1] + 3 * mt * t * t * P2[1] + t ** 3 * P3[1]
        puffs.append((float(x), float(y), float((0.014 + 0.074 * t ** 1.25) * S)))
    return puffs


def face_edge_puffs(cx, cy, S, seed=3):
    """folk style: scalloped puffs along the profile (small along the features) + a loose interior fill"""
    poly = face_polygon(cx, cy, S)
    f = face_frame(cx, cy, S)
    rng = np.random.default_rng(seed)
    n = len(poly)
    seg = np.hypot(*(np.roll(poly, -1, 0) - poly).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    area = 0.5 * np.sum(poly[:, 0] * np.roll(poly[:, 1], -1) - np.roll(poly[:, 0], -1) * poly[:, 1])
    puffs = []
    s = 0.0
    while s < cum[-1]:
        i = min(int(np.searchsorted(cum, s)), n - 1)
        x, y = poly[i]
        u, v = f.inv(x, y)
        fine = (u > 0.26 and -0.40 < v < 0.14)
        r = (0.030 if fine else 0.055) * S * rng.uniform(0.9, 1.1)
        t = poly[(i + 1) % n] - poly[i]
        L = math.hypot(*t) + 1e-9
        nx, ny = (t[1] / L, -t[0] / L) if area > 0 else (-t[1] / L, t[0] / L)
        puffs.append((float(x + nx * r * 0.72), float(y + ny * r * 0.72), float(r)))
        s += r * 0.95
    gx, gy = np.meshgrid(np.arange(cx - 0.5 * S, cx + 0.5 * S, 0.11 * S), np.arange(cy - 0.62 * S, cy + 0.62 * S, 0.11 * S))
    m = raster([poly], int(cx - 0.8 * S), int(1.6 * S), int(1.5 * S), 1, int(cy - 0.75 * S))
    for x, y in zip(gx.ravel(), gy.ravel()):
        ix, iy = int(x - (cx - 0.8 * S)), int(y - (cy - 0.75 * S))
        if 0 <= iy < m.shape[0] and 0 <= ix < m.shape[1] and m[iy, ix] > 0.5:
            d = np.min(np.hypot(poly[:, 0] - x, poly[:, 1] - y))
            if d > 0.085 * S:
                puffs.append((float(x), float(y), float(min(0.13 * S, d * 1.05))))
    return puffs


def face_height(x0, w, h, cx, cy, S, seed=5):
    """real style: a sculpted pillow with sockets, brow, nose, lips, chin + hair/breath puffs"""
    f = face_frame(cx, cy, S)
    poly = face_polygon(cx, cy, S)
    m = raster([poly], x0, w, h, 2)
    m = wobble(m, x0, w, h, 0.0065 * S, 38, seed)
    Hm = pillow(m, 0.075 * S, 0.30)
    for (u, v, su, sv, a) in ((0.15, 0.075, 0.075, 0.040, -0.040),        # eye socket (closed lid sits in a shallow hollow)
                              (0.17, 0.150, 0.095, 0.030, 0.030),         # brow ridge
                              (0.20, -0.075, 0.110, 0.080, 0.045),        # cheek
                              (0.395, -0.098, 0.035, 0.030, 0.040),       # nose tip
                              (0.360, -0.172, 0.040, 0.020, 0.030),       # upper lip
                              (0.350, -0.222, 0.040, 0.022, 0.026),       # lower lip
                              (0.326, -0.330, 0.045, 0.040, 0.030),       # chin
                              (0.330, -0.034, 0.030, 0.050, 0.018),       # nose bridge
                              (-0.05, 0.28, 0.200, 0.140, 0.040)):        # forehead / skull swell
        px, py = f(u, v)
        bump(Hm, x0, px, py, su * S, sv * S, a * S, rot=-FACE_PHI)
    Hm *= m
    Hm = np.maximum(Hm, puff_height(face_extra_puffs(cx, cy, S, seed), x0, w, h))
    return Hm


# ====================================================================================================== animals
def animal_polys(kind, cx, cy, S, flip=False):
    f = Frame(cx, cy, S, 0.0, flip)
    if kind == 'bear':
        return [closed_spline(f.pts(BEAR), 8)] + [closed_spline(f.pts(p), 8) for p in BEAR_FAR]
    neck = _tube(SWAN_NECK, SWAN_NECK_W)
    return [closed_spline(f.pts(SWAN_BODY), 8), f.pts([tuple(p) for p in neck]),
            f.pts(_ellipse_poly(SWAN_HEAD[0], SWAN_HEAD[1], SWAN_HEAD[2], SWAN_HEAD[3])), f.pts(SWAN_BEAK)]


def animal_height(kind, x0, w, h, cx, cy, S, flip=False, seed=2):
    polys = animal_polys(kind, cx, cy, S, flip)
    m = raster(polys, x0, w, h, 2)
    m = wobble(m, x0, w, h, 0.014 * S, 46, seed)
    Hm = pillow(m, 0.060 * S if kind == 'bear' else 0.048 * S, 0.34)
    f = Frame(cx, cy, S, 0.0, flip)
    if kind == 'bear':
        for (u, v, su, sv, a) in ((0.0, 0.05, 0.28, 0.12, 0.030), (0.40, 0.04, 0.12, 0.08, 0.020), (-0.28, 0.0, 0.18, 0.12, 0.020)):
            px, py = f(u, v); bump(Hm, x0, px, py, su * S, sv * S, a * S)
        px, py = f(0.32, 0.045); bump(Hm, x0, px, py, 0.012 * S, 0.012 * S, -0.020 * S)             # eye hollow
    else:
        for (u, v, su, sv, a) in ((-0.10, 0.02, 0.30, 0.13, 0.050), (0.40, 0.40, 0.07, 0.30, 0.025)):
            px, py = f(u, v); bump(Hm, x0, px, py, su * S, sv * S, a * S)
    Hm *= m
    return Hm


def animal_edge_puffs(kind, cx, cy, S, flip=False, seed=4):
    polys = animal_polys(kind, cx, cy, S, flip)
    rng = np.random.default_rng(seed)
    puffs = []
    for poly in polys:
        n = len(poly)
        seg = np.hypot(*(np.roll(poly, -1, 0) - poly).T)
        cum = np.concatenate([[0], np.cumsum(seg)])
        area = 0.5 * np.sum(poly[:, 0] * np.roll(poly[:, 1], -1) - np.roll(poly[:, 0], -1) * poly[:, 1])
        s = 0.0
        while s < cum[-1]:
            i = min(int(np.searchsorted(cum, s)), n - 1)
            x, y = poly[i]
            r = (0.034 if kind == 'bear' else 0.036) * S * rng.uniform(0.9, 1.1)
            t = poly[(i + 1) % n] - poly[i]
            L = math.hypot(*t) + 1e-9
            nx, ny = (t[1] / L, -t[0] / L) if area > 0 else (-t[1] / L, t[0] / L)
            puffs.append((float(x + nx * r * 0.72), float(y + ny * r * 0.72), float(r)))
            s += r * 0.95
        m = raster([poly], int(poly[:, 0].min()) - 4, int(poly[:, 0].max() - poly[:, 0].min()) + 8, int(poly[:, 1].max() - poly[:, 1].min()) + 8, 1, int(poly[:, 1].min()) - 4)
        gx0, gy0 = int(poly[:, 0].min()) - 4, int(poly[:, 1].min()) - 4
        step = 0.05 * S
        for x in np.arange(poly[:, 0].min(), poly[:, 0].max(), step):
            for y in np.arange(poly[:, 1].min(), poly[:, 1].max(), step):
                ix, iy = int(x - gx0), int(y - gy0)
                if 0 <= iy < m.shape[0] and 0 <= ix < m.shape[1] and m[iy, ix] > 0.5:
                    d = np.min(np.hypot(poly[:, 0] - x, poly[:, 1] - y))
                    if d > 0.03 * S:
                        puffs.append((float(x), float(y), float(min(0.085 * S, d * 1.15))))
    return puffs


# ====================================================================================================== face details (ink and paint)
def face_lines(cx, cy, S):
    """all the little lines of the sleeping face as lists of canvas points (closed eye, lashes, brow, nostril, lips, blush centre)"""
    f = face_frame(cx, cy, S)
    P = lambda u, v: f(u, v)

    def curve(p0, p1, p2, p3, n=18):
        out = []
        for i in range(n + 1):
            t = i / n
            mt = 1 - t
            out.append((mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
                        mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1]))
        return out

    lines = dict(
        eye=curve(P(0.045, 0.080), P(0.090, 0.040), P(0.170, 0.035), P(0.228, 0.085)),
        brow=curve(P(0.020, 0.150), P(0.090, 0.190), P(0.175, 0.195), P(0.255, 0.150)),
        nostril=curve(P(0.372, -0.108), P(0.355, -0.115), P(0.340, -0.108), P(0.330, -0.098), 8),
        lips=curve(P(0.364, -0.190), P(0.330, -0.186), P(0.300, -0.192), P(0.265, -0.205)),
        lid=curve(P(0.050, 0.070), P(0.100, 0.052), P(0.170, 0.050), P(0.225, 0.078), 14),
    )
    lashes = []
    for k in range(6):
        t = 0.10 + 0.145 * k
        u = 0.045 + 0.183 * t + 0.0
        v = 0.080 - 0.040 * math.sin(math.pi * t) * 1.0
        lashes.append([P(u, v - 0.004), P(u - 0.010 + 0.012 * t, v - 0.036 - 0.006 * math.sin(math.pi * t))])
    lines['lashes'] = lashes
    lines['blush'] = P(0.17, -0.075)
    lines['profile'] = [P(u, v) for (u, v) in FACE_FRONT[:21]]
    return lines


def face_paint_real(img, x0, cx, cy, S, strength=1.0):
    """the sleeping face's lines as soft painted strokes over the lit cloud (closed eye + lashes, brow, nostril, lips, blush)"""
    import cairo
    h, w = img.shape[:2]
    buf = np.zeros((h, w, 4), np.uint8)
    surf = cairo.ImageSurface.create_for_data(buf, cairo.FORMAT_ARGB32, w, h, w * 4)
    c = cairo.Context(surf)
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
    ln = face_lines(cx, cy, S)
    sh = lambda p: (p[0] - x0, p[1])
    bx, by = sh(ln['blush'])
    g = cairo.RadialGradient(bx, by, 0, bx, by, 0.10 * S)
    g.add_color_stop_rgba(0, 0.95, 0.45, 0.48, 0.30 * strength); g.add_color_stop_rgba(1, 0.95, 0.45, 0.48, 0)
    c.set_source(g); c.new_path(); c.arc(bx, by, 0.10 * S, 0, TAU); c.fill()
    for key, wd, col in (('eye', 0.011, (0.13, 0.15, 0.30, 0.62)), ('lid', 0.006, (0.20, 0.24, 0.42, 0.30)), ('brow', 0.010, (0.16, 0.18, 0.34, 0.34)),
                         ('nostril', 0.009, (0.16, 0.16, 0.28, 0.46)), ('lips', 0.010, (0.34, 0.16, 0.24, 0.55))):
        p = [sh(q) for q in ln[key]]
        c.set_source_rgba(col[0], col[1], col[2], col[3] * strength); c.set_line_width(wd * S)
        c.new_path(); c.move_to(*p[0]); [c.line_to(*q) for q in p[1:]]; c.stroke()
    c.set_source_rgba(0.13, 0.15, 0.30, 0.50 * strength); c.set_line_width(0.0042 * S)
    for l in ln['lashes']:
        a, b = sh(l[0]), sh(l[1]); c.new_path(); c.move_to(*a); c.line_to(*b); c.stroke()
    p = [sh(q) for q in ln['profile']]                                     # a cool hairline along the profile so it reads at a glance
    c.set_source_rgba(0.12, 0.16, 0.36, 0.26 * strength); c.set_line_width(0.0065 * S)
    c.new_path(); c.move_to(*p[0]); [c.line_to(*q) for q in p[1:]]; c.stroke()
    surf.flush()
    lay = buf.astype(np.float32) / 255.0
    lay = cv2.GaussianBlur(lay, (0, 0), 0.8)
    return img * (1 - lay[..., 3])[..., None] + lay[..., 2::-1]


def face_ink_folk(F, cx, cy, S, lw=2.4):
    I = F.I
    ln = face_lines(cx, cy, S)
    I.set_source_rgba(0.16, 0.10, 0.12, 1); I.set_line_width(lw * 1.3)
    for key in ('eye', 'brow', 'nostril', 'lips'):
        p = ln[key]; I.new_path(); I.move_to(*p[0]); [I.line_to(*q) for q in p[1:]]; I.stroke()
    I.set_line_width(lw * 0.8)
    for l in ln['lashes']:
        I.new_path(); I.move_to(*l[0]); I.line_to(*l[1]); I.stroke()
    bx, by = ln['blush']
    F.S.set_source_rgba(0.92, 0.50, 0.50, 0.42); F.S.new_path(); F.S.arc(bx, by, 0.10 * S, 0, TAU); F.S.fill()
