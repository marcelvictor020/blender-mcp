"""Small living things and festive details, painted with gradients: fireflies, butterflies, swans with cygnets, folk-painted flower-boats with candles,
glowing sky lanterns, bunting with painted flags, a doe and fawn, drifting pollen motes. Each is a sprite so it can be pasted with a water reflection."""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi


def sprite(wpx, hpx, fn, ss=3):
    L = Layer(wpx, hpx, 0, 0, ss)
    fn(L.ctx)
    return L.get()                                    # (rgb premultiplied, alpha)


def paste(img, spr, x, y, k=1.0):
    rgb, a = spr
    h, w = a.shape
    x, y = int(round(x)), int(round(y))
    xa, ya = max(0, x), max(0, y)
    xb, yb = min(img.shape[1], x + w), min(img.shape[0], y + h)
    if xa >= xb or ya >= yb: return
    sa = a[ya - y:yb - y, xa - x:xb - x][..., None] * k
    img[ya:yb, xa:xb] = img[ya:yb, xa:xb] * (1 - sa) + rgb[ya - y:yb - y, xa - x:xb - x] * k


def reflect(spr, amp=1.6, freq=0.55, blur=1.4, k=0.55, seed=0):
    """vertically flipped, rippled, softened copy for water"""
    rgb, a = spr
    h, w = a.shape
    fr, fa = rgb[::-1].copy(), a[::-1].copy()
    ph = np.random.default_rng(abs(int(seed)) % (2 ** 31)).uniform(0, TAU)
    ys = np.arange(h, dtype=np.float32)
    dx = (amp * (1 + ys / max(h, 1)) * np.sin(ys * freq + ph))[:, None]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), ys)
    fr = cv2.remap(fr, gx + dx, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    fa = cv2.remap(fa, gx + dx, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    fr = cv2.GaussianBlur(fr, (0, 0), sigmaX=blur * 1.6, sigmaY=blur)
    fa = cv2.GaussianBlur(fa, (0, 0), sigmaX=blur * 1.6, sigmaY=blur)
    fade = (k * np.exp(-ys / (0.9 * max(h, 1))))[:, None]
    return fr * fade[..., None], fa * fade


def grad_v(c, y0, y1, stops):
    g = cairo.LinearGradient(0, y0, 0, y1)
    for o, col in stops: g.add_color_stop_rgb(o, *col)
    return g


# ============================================================================================ swans
def draw_swan(c, L, tint=(1.0, 1.0, 1.0)):
    """swan facing right, waterline at y=0, centre x=0, body length L"""
    t = lambda col: tuple(min(1, v * tint[i]) for i, v in enumerate(col))
    c.new_path(); c.move_to(-0.56 * L, -0.03 * L)
    c.curve_to(-0.47 * L, -0.22 * L, -0.10 * L, -0.28 * L, 0.20 * L, -0.21 * L)
    c.curve_to(0.34 * L, -0.18 * L, 0.40 * L, -0.09 * L, 0.35 * L, -0.01 * L)
    c.curve_to(0.18 * L, 0.04 * L, -0.34 * L, 0.05 * L, -0.56 * L, -0.03 * L)
    c.close_path()
    c.set_source(grad_v(c, -0.28 * L, 0.05 * L, [(0, t((1.0, 0.96, 0.96))), (0.55, t((0.90, 0.88, 0.94))), (1, t((0.64, 0.64, 0.80)))]))
    c.fill_preserve(); c.set_source_rgba(0.35, 0.35, 0.50, 0.40); c.set_line_width(max(0.7, 0.008 * L)); c.stroke()
    c.new_path(); c.move_to(-0.52 * L, -0.04 * L); c.line_to(-0.66 * L, -0.15 * L); c.line_to(-0.46 * L, -0.12 * L); c.close_path()                    # tail
    c.set_source_rgb(*t((0.94, 0.92, 0.95))); c.fill()
    c.new_path(); c.move_to(-0.42 * L, -0.07 * L)                                                                                                       # folded wing
    c.curve_to(-0.30 * L, -0.30 * L, 0.06 * L, -0.30 * L, 0.20 * L, -0.19 * L); c.curve_to(0.05 * L, -0.15 * L, -0.20 * L, -0.08 * L, -0.42 * L, -0.07 * L)
    c.set_source_rgba(1, 1, 1, 0.55); c.fill()
    c.set_source_rgba(0.45, 0.45, 0.62, 0.35); c.set_line_width(max(0.6, 0.006 * L))
    for k in range(7):
        x = -0.34 * L + k * 0.07 * L
        c.new_path(); c.move_to(x, -0.24 * L + 0.02 * k * L * 0.4); c.curve_to(x + 0.03 * L, -0.18 * L, x + 0.05 * L, -0.13 * L, x + 0.06 * L, -0.10 * L); c.stroke()
    # neck: an S-curve tube
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    for (wd, col) in ((0.082 * L, (0.58, 0.58, 0.74)), (0.066 * L, (0.97, 0.94, 0.96))):
        c.set_source_rgb(*t(col)); c.set_line_width(wd)
        c.new_path(); c.move_to(0.27 * L, -0.15 * L); c.curve_to(0.46 * L, -0.20 * L, 0.34 * L, -0.45 * L, 0.46 * L, -0.56 * L); c.stroke()
    c.set_source_rgb(*t((0.97, 0.94, 0.96))); c.new_path(); c.save(); c.translate(0.50 * L, -0.60 * L); c.rotate(0.20); c.scale(0.062 * L, 0.040 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    c.set_source_rgb(0.92, 0.44, 0.10); c.new_path(); c.move_to(0.545 * L, -0.615 * L); c.line_to(0.64 * L, -0.585 * L); c.line_to(0.545 * L, -0.575 * L); c.close_path(); c.fill()
    c.set_source_rgb(0.05, 0.04, 0.04); c.new_path(); c.arc(0.532 * L, -0.614 * L, 0.011 * L, 0, TAU); c.fill(); c.new_path(); c.arc(0.55 * L, -0.601 * L, 0.012 * L, 0, TAU); c.fill()


def draw_cygnet(c, L):
    c.new_path(); c.save(); c.translate(0, -0.10 * L); c.scale(0.5 * L, 0.20 * L); c.arc(0, 0, 1, 0, TAU); c.restore()
    c.set_source(grad_v(c, -0.3 * L, 0.0, [(0, (0.80, 0.78, 0.80)), (1, (0.56, 0.54, 0.64))])); c.fill()
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_source_rgb(0.72, 0.70, 0.74); c.set_line_width(0.14 * L)
    c.new_path(); c.move_to(0.32 * L, -0.14 * L); c.curve_to(0.46 * L, -0.20 * L, 0.42 * L, -0.40 * L, 0.52 * L, -0.46 * L); c.stroke()
    c.set_source_rgb(0.76, 0.74, 0.78); c.new_path(); c.arc(0.54 * L, -0.48 * L, 0.10 * L, 0, TAU); c.fill()
    c.set_source_rgb(0.30, 0.26, 0.26); c.new_path(); c.move_to(0.62 * L, -0.50 * L); c.line_to(0.72 * L, -0.47 * L); c.line_to(0.62 * L, -0.45 * L); c.close_path(); c.fill()


def swan_family(img, x, y_wl, L, rng, tint=(1, 1, 1), refl=True):
    """two swans + three cygnets with reflections"""
    parts = [(0, 0, L, 'swan'), (-1.05 * L, 0.10 * L, L * 0.86, 'swan')] + [(-0.40 * L - k * 0.30 * L, 0.20 * L + 0.04 * L * k, L * 0.32, 'cyg') for k in range(3)]
    for (dx, dy, LL, kind) in parts:
        wpx, hpx = int(LL * 1.5), int(LL * 0.9)
        def fn(c, LL=LL, kind=kind):
            c.translate(wpx * 0.55, hpx * 0.80)
            (draw_swan(c, LL, tint) if kind == 'swan' else draw_cygnet(c, LL))
        spr = sprite(wpx, hpx, fn)
        px, py = x + dx - wpx * 0.55, y_wl + dy - hpx * 0.80
        if refl:
            rr, ra = reflect(spr, amp=1.2, k=0.60, seed=int(dx))
            paste(img, (rr, ra), px, py + hpx * 0.60)
        paste(img, spr, px, py)
        # wake ripples
        for kk in range(3):
            pass


# ============================================================================================ flower boats
def draw_boat(c, L, seed, pal=0):
    """a little gondola of a boat, bow and stern swept up, painted with dots, heaped with wildflowers and lit by three candles"""
    rng = np.random.default_rng(seed)
    hull = [((0.80, 0.18, 0.14), (0.97, 0.90, 0.72)), ((0.18, 0.36, 0.64), (0.98, 0.84, 0.30)), ((0.12, 0.46, 0.34), (0.97, 0.92, 0.80))][pal % 3]
    def outline():
        c.new_path(); c.move_to(-0.60 * L, -0.34 * L)
        c.curve_to(-0.52 * L, -0.06 * L, -0.30 * L, 0.05 * L, 0, 0.05 * L)
        c.curve_to(0.30 * L, 0.05 * L, 0.52 * L, -0.06 * L, 0.60 * L, -0.34 * L)
        c.curve_to(0.50 * L, -0.24 * L, 0.40 * L, -0.19 * L, 0.30 * L, -0.19 * L)
        c.line_to(-0.30 * L, -0.19 * L)
        c.curve_to(-0.40 * L, -0.19 * L, -0.50 * L, -0.24 * L, -0.60 * L, -0.34 * L)
        c.close_path()
    outline()
    c.set_source(grad_v(c, -0.34 * L, 0.05 * L, [(0, tuple(min(1, v * 1.30) for v in hull[0])), (0.55, hull[0]), (1, tuple(v * 0.50 for v in hull[0]))])); c.fill_preserve()
    c.set_source_rgba(0.06, 0.04, 0.03, 0.8); c.set_line_width(max(0.8, 0.014 * L)); c.stroke()
    c.set_source_rgb(*hull[1]); c.set_line_width(max(1.0, 0.020 * L)); c.new_path(); c.move_to(-0.57 * L, -0.31 * L)                  # gold gunwale line
    c.curve_to(-0.50 * L, -0.22 * L, -0.40 * L, -0.18 * L, -0.30 * L, -0.18 * L); c.line_to(0.30 * L, -0.18 * L); c.curve_to(0.40 * L, -0.18 * L, 0.50 * L, -0.22 * L, 0.57 * L, -0.31 * L); c.stroke()
    for k in range(9):                                                                                                                  # folk dots + a little kurbits at the bow
        x = -0.40 * L + k * 0.10 * L
        c.set_source_rgb(*hull[1]); c.new_path(); c.arc(x, -0.085 * L + 0.012 * L * math.sin(k * 1.3), 0.017 * L, 0, TAU); c.fill()
    for k in range(34):                                                                                                                 # heap of flowers
        fx = rng.normal(0, 0.17 * L); fy = -0.20 * L - abs(rng.normal(0, 0.085 * L)) * (1.0 - min(1.0, abs(fx) / (0.34 * L)) * 0.7)
        col = [(0.97, 0.94, 0.90), (0.92, 0.42, 0.52), (0.98, 0.80, 0.28), (0.60, 0.70, 0.96), (0.88, 0.20, 0.20), (0.74, 0.58, 0.94)][k % 6]
        c.set_source_rgb(0.18, 0.34, 0.12); c.new_path(); c.arc(fx, fy + 0.014 * L, 0.050 * L, 0, TAU); c.fill()
        c.set_source_rgb(*col); c.new_path(); c.arc(fx, fy, 0.044 * L, 0, TAU); c.fill()
        c.set_source_rgb(0.98, 0.78, 0.22); c.new_path(); c.arc(fx, fy, 0.014 * L, 0, TAU); c.fill()
    for (cx_, top_, wd) in ((0.0, -0.58, 0.032), (-0.21, -0.43, 0.026), (0.21, -0.45, 0.026)):                                          # three candles
        g = cairo.RadialGradient(cx_ * L, top_ * L, 1, cx_ * L, top_ * L, 0.40 * L); g.add_color_stop_rgba(0, 1.0, 0.86, 0.50, 0.70); g.add_color_stop_rgba(0.35, 1.0, 0.70, 0.30, 0.26); g.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)
        c.set_source(g); c.new_path(); c.arc(cx_ * L, top_ * L, 0.40 * L, 0, TAU); c.fill()
        c.set_source_rgb(0.95, 0.93, 0.86); c.new_path(); c.rectangle((cx_ - wd / 2) * L, top_ * L, wd * L, (-0.25 - top_) * L); c.fill()
        c.set_source_rgb(1.0, 0.95, 0.70); c.new_path(); c.save(); c.translate(cx_ * L, (top_ - 0.03) * L); c.scale(0.018 * L, 0.045 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def flower_boat(img, x, y_wl, L, seed, refl=True, pal=0):
    wpx, hpx = int(L * 1.5), int(L * 1.5)
    spr = sprite(wpx, hpx, lambda c: (c.translate(wpx / 2, hpx * 0.80), draw_boat(c, L, seed, pal)))
    px, py = x - wpx / 2, y_wl - hpx * 0.80
    if refl:
        rr, ra = reflect(spr, amp=1.0, k=0.62, seed=seed)
        paste(img, (rr, ra), px, py + hpx * 0.60)
    paste(img, spr, px, py)


# ============================================================================================ sky lanterns
def draw_lantern(c, S, warm=1.0, day=0.0):
    halo = cairo.RadialGradient(0, 0, 1, 0, 0, S * 2.6)
    halo.add_color_stop_rgba(0, 1.0, 0.78, 0.36, 0.55 * warm * (1 - 0.7 * day)); halo.add_color_stop_rgba(0.4, 1.0, 0.62, 0.22, 0.20 * warm * (1 - 0.7 * day)); halo.add_color_stop_rgba(1, 1.0, 0.5, 0.15, 0)
    c.set_source(halo); c.new_path(); c.arc(0, 0, S * 2.6, 0, TAU); c.fill()
    c.new_path(); c.move_to(-0.55 * S, -0.9 * S); c.curve_to(-0.95 * S, -0.3 * S, -0.8 * S, 0.5 * S, -0.42 * S, 0.9 * S); c.line_to(0.42 * S, 0.9 * S)
    c.curve_to(0.8 * S, 0.5 * S, 0.95 * S, -0.3 * S, 0.55 * S, -0.9 * S); c.curve_to(0.25 * S, -1.05 * S, -0.25 * S, -1.05 * S, -0.55 * S, -0.9 * S); c.close_path()
    g = cairo.RadialGradient(0, 0.55 * S, 1, 0, 0.1 * S, 1.1 * S)
    g.add_color_stop_rgb(0, 1.0, 0.97, 0.78); g.add_color_stop_rgb(0.35, 1.0, 0.76, 0.34); g.add_color_stop_rgb(1, 0.90 - 0.1 * day, 0.46 + 0.1 * day, 0.18 + 0.2 * day)
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.45, 0.2, 0.05, 0.5); c.set_line_width(max(0.6, 0.05 * S)); c.stroke()
    c.set_source_rgba(0.55, 0.25, 0.05, 0.35); c.set_line_width(max(0.5, 0.03 * S))
    for fx in (-0.45, 0.0, 0.45):
        c.new_path(); c.move_to(fx * S * 0.9, -0.95 * S); c.curve_to(fx * S * 1.2, -0.2 * S, fx * S * 1.0, 0.5 * S, fx * S * 0.55, 0.9 * S); c.stroke()
    c.set_source_rgb(1.0, 0.98, 0.84); c.new_path(); c.arc(0, 0.82 * S, 0.22 * S, 0, TAU); c.fill()


def sky_lantern(img, x, y, S, day=0.0, warm=1.0):
    wpx = int(S * 5.4); spr = sprite(wpx, wpx, lambda c: (c.translate(wpx / 2, wpx / 2), draw_lantern(c, S, warm, day)), ss=2)
    px, py = x - wpx / 2, y - wpx / 2
    rgb, a = spr
    # lantern glow is additive; body is normal
    img[:] = np.clip(img, 0, 1)
    h, w = a.shape
    xa, ya = max(0, int(px)), max(0, int(py)); xb, yb = min(img.shape[1], int(px) + w), min(img.shape[0], int(py) + h)
    if xa >= xb or ya >= yb: return
    sub = (slice(ya - int(py), yb - int(py)), slice(xa - int(px), xb - int(px)))
    img[ya:yb, xa:xb] = img[ya:yb, xa:xb] * (1 - a[sub][..., None] * 0.85) + rgb[sub] * 0.95


# ============================================================================================ fireflies, motes
def fireflies(img, rng, n, xr, yr, size=(1.5, 4.0), glow=1.0, color=(0.82, 1.0, 0.42)):
    """additive soft glows; img is modified in place (float RGB)"""
    H_, W_ = img.shape[:2]
    for i in range(n):
        x = rng.uniform(*xr); y = rng.uniform(*yr)
        s = rng.uniform(*size) * rng.choice([1, 1, 1, 2.2])
        r = int(s * 9) + 2
        xa, xb, ya, yb = int(x) - r, int(x) + r + 1, int(y) - r, int(y) + r + 1
        if xa < 0 or ya < 0 or xb > W_ or yb > H_: continue
        X, Y = np.meshgrid(np.arange(xa, xb) - x, np.arange(ya, yb) - y)
        d2 = X * X + Y * Y
        g = (np.exp(-d2 / (2 * (s * 0.9) ** 2)) * 1.2 + np.exp(-d2 / (2 * (s * 3.2) ** 2)) * 0.30) * glow * rng.uniform(0.55, 1.0)
        img[ya:yb, xa:xb] = 1 - (1 - img[ya:yb, xa:xb]) * (1 - np.clip(g[..., None] * np.array(color, np.float32), 0, 1))


def motes(img, rng, n, xr, yr, color=(1.0, 0.88, 0.60), size=(0.8, 2.4), glow=0.6):
    fireflies(img, rng, n, xr, yr, size, glow, color)


# ============================================================================================ butterflies
def draw_butterfly(c, S, kind, flap=0.8, seed=0):
    rng = np.random.default_rng(seed)
    pals = {'monarch': ((0.96, 0.52, 0.10), (0.06, 0.04, 0.04), (0.98, 0.96, 0.92)), 'blue': ((0.30, 0.55, 0.95), (0.05, 0.08, 0.20), (0.80, 0.92, 1.0)),
            'yellow': ((0.98, 0.88, 0.22), (0.50, 0.38, 0.05), (1.0, 0.96, 0.7)), 'white': ((0.97, 0.97, 0.94), (0.15, 0.15, 0.18), (1.0, 1.0, 1.0)),
            'admiral': ((0.10, 0.08, 0.10), (0.85, 0.18, 0.10), (0.98, 0.96, 0.92))}
    main, edge, spot = pals[kind]
    for side in (-1, 1):
        c.save(); c.scale(side * flap, 1.0)
        # upper wing
        c.new_path(); c.move_to(0, 0); c.curve_to(0.15 * S, -0.55 * S, 0.80 * S, -0.95 * S, 1.00 * S, -0.50 * S); c.curve_to(0.95 * S, -0.10 * S, 0.50 * S, 0.12 * S, 0, 0.06 * S); c.close_path()
        g = cairo.RadialGradient(0.18 * S, 0.0, 1, 0.45 * S, -0.35 * S, 0.9 * S); g.add_color_stop_rgb(0, *[v * 0.62 for v in main]); g.add_color_stop_rgb(0.6, *main); g.add_color_stop_rgb(1, *[min(1, v * 1.15) for v in main])
        c.set_source(g); c.fill_preserve(); c.set_source_rgb(*edge); c.set_line_width(max(0.8, 0.07 * S)); c.stroke()
        # lower wing
        c.new_path(); c.move_to(0, 0.04 * S); c.curve_to(0.55 * S, 0.0, 0.90 * S, 0.30 * S, 0.62 * S, 0.62 * S); c.curve_to(0.35 * S, 0.80 * S, 0.06 * S, 0.45 * S, 0, 0.18 * S); c.close_path()
        c.set_source(g); c.fill_preserve(); c.set_source_rgb(*edge); c.set_line_width(max(0.8, 0.06 * S)); c.stroke()
        c.set_source_rgba(*edge, 0.8); c.set_line_width(max(0.5, 0.025 * S))
        for k in range(5):
            a = -0.2 - 0.18 * k
            c.new_path(); c.move_to(0.06 * S, -0.02 * S); c.line_to(0.95 * S * math.cos(a) * 0.98, 0.95 * S * math.sin(a) - 0.1 * S); c.stroke()
        c.set_source_rgb(*spot)
        for (sx, sy, sr) in ((0.78, -0.62, 0.05), (0.88, -0.45, 0.04), (0.70, -0.74, 0.035), (0.60, 0.50, 0.04)):
            c.new_path(); c.arc(sx * S, sy * S, sr * S, 0, TAU); c.fill()
        c.restore()
    c.set_source_rgb(0.08, 0.06, 0.05); c.set_line_width(max(1.0, 0.07 * S)); c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.new_path(); c.move_to(0, -0.40 * S); c.line_to(0, 0.45 * S); c.stroke()
    c.set_line_width(max(0.5, 0.02 * S)); c.new_path(); c.move_to(0, -0.40 * S); c.curve_to(-0.10 * S, -0.70 * S, -0.22 * S, -0.78 * S, -0.30 * S, -0.74 * S)
    c.move_to(0, -0.40 * S); c.curve_to(0.10 * S, -0.70 * S, 0.22 * S, -0.78 * S, 0.30 * S, -0.74 * S); c.stroke()


def butterflies(img, items):
    """items: [(x, y, S, angle, kind, flap, seed)]"""
    for (x, y, S, ang, kind, flap, seed) in items:
        wpx = int(S * 3.2)
        spr = sprite(wpx, wpx, lambda c: (c.translate(wpx / 2, wpx / 2), c.rotate(ang), draw_butterfly(c, S, kind, flap, seed)), ss=3)
        rgb, a = spr
        sh = (rgb * 0.0, a * 0.0)
        paste(img, spr, x - wpx / 2, y - wpx / 2)


# ============================================================================================ bunting
def festoon(img, p0, p1, sag, n, rng, fw=26, pal=None):
    L = Layer(img.shape[1], img.shape[0], 0, 0, 1) if False else None
    pal = pal or [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    xs = np.linspace(p0[0], p1[0], 200)
    ys = np.linspace(p0[1], p1[1], 200) + sag * 4 * np.linspace(0, 1, 200) * (1 - np.linspace(0, 1, 200))
    x0b, y0b = int(min(xs)) - 40, int(min(ys)) - 20
    x1b, y1b = int(max(xs)) + 40, int(max(ys)) + int(fw * 2.2) + 20
    wpx, hpx = x1b - x0b, y1b - y0b
    Ly = Layer(wpx, hpx, x0b, y0b, 2)
    c = Ly.ctx
    c.set_source_rgba(0.12, 0.08, 0.05, 0.95); c.set_line_width(1.6); c.new_path(); c.move_to(xs[0], ys[0]); [c.line_to(a, b) for a, b in zip(xs, ys)]; c.stroke()
    for i in range(n):
        t = (i + 0.5) / n
        j = int(t * 199)
        x, y = xs[j], ys[j]
        tx, ty = xs[min(j + 3, 199)] - xs[max(j - 3, 0)], ys[min(j + 3, 199)] - ys[max(j - 3, 0)]
        L_ = math.hypot(tx, ty) + 1e-6; tx, ty = tx / L_, ty / L_
        a = (x - tx * fw / 2, y - ty * fw / 2); b = (x + tx * fw / 2, y + ty * fw / 2)
        tip = (x + rng.normal(0, 1.2), y + fw * 1.25)
        col = pal[i % len(pal)]
        g = cairo.LinearGradient(a[0], 0, b[0], 0); g.add_color_stop_rgb(0, *[min(1, v * 1.12 + 0.05) for v in col]); g.add_color_stop_rgb(1, *[v * 0.78 for v in col])
        c.set_source(g); c.new_path(); c.move_to(*a); c.line_to(*b); c.line_to(*tip); c.close_path(); c.fill_preserve()
        c.set_source_rgba(0.1, 0.06, 0.04, 0.55); c.set_line_width(0.9); c.stroke()
        cx_, cy_ = x, y + fw * 0.42                                                                       # painted folk flower on the flag
        for k in range(5):
            ang = TAU * k / 5 + i
            c.set_source_rgb(*(0.97, 0.94, 0.86) if col != pal[0] else (0.84, 0.20, 0.18)); c.new_path(); c.arc(cx_ + math.cos(ang) * fw * 0.10, cy_ + math.sin(ang) * fw * 0.10, fw * 0.07, 0, TAU); c.fill()
        c.set_source_rgb(0.96, 0.76, 0.20); c.new_path(); c.arc(cx_, cy_, fw * 0.05, 0, TAU); c.fill()
    rgb, a = Ly.get()
    paste(img, (rgb, a), x0b, y0b)


# ============================================================================================ deer
def draw_deer(c, L, fawn=False):
    """a doe seen from the side, facing left (toward the sun); hooves at y=0, body length L. Sun-side gold rim, pale belly, spots on the fawn."""
    coat, belly, dark = (0.60, 0.40, 0.24), (0.90, 0.80, 0.64), (0.26, 0.17, 0.11)
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
    c.set_source_rgba(0.03, 0.05, 0.02, 0.30); c.new_path(); c.save(); c.translate(0.05 * L, -0.005 * L); c.scale(0.55 * L, 0.05 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    def leg(x, far, bend):
        k = 0.66 if far else 1.0
        col = tuple(v * k for v in coat)
        hip, knee, hoof = (x * L, -0.38 * L), ((x + bend * 0.5) * L, -0.19 * L), ((x + bend) * L, -0.012 * L)
        c.set_source_rgb(*col); c.set_line_width(0.058 * L); c.new_path(); c.move_to(*hip); c.line_to(*knee); c.stroke()
        c.set_line_width(0.034 * L); c.new_path(); c.move_to(*knee); c.line_to(*hoof); c.stroke()
        c.set_source_rgb(*[v * 0.6 for v in dark]); c.new_path(); c.save(); c.translate(hoof[0], hoof[1]); c.scale(0.020 * L, 0.014 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    leg(-0.22, True, -0.012); leg(0.33, True, 0.010); leg(-0.30, False, 0.016); leg(0.27, False, -0.012)
    # body: a bean, withers high, rump rounded
    c.new_path(); c.move_to(-0.36 * L, -0.44 * L)
    c.curve_to(-0.42 * L, -0.62 * L, -0.20 * L, -0.67 * L, 0.04 * L, -0.64 * L)
    c.curve_to(0.28 * L, -0.62 * L, 0.45 * L, -0.60 * L, 0.45 * L, -0.46 * L)
    c.curve_to(0.45 * L, -0.31 * L, 0.30 * L, -0.30 * L, 0.12 * L, -0.31 * L)
    c.curve_to(-0.10 * L, -0.30 * L, -0.32 * L, -0.30 * L, -0.36 * L, -0.44 * L); c.close_path()
    g = grad_v(c, -0.67 * L, -0.28 * L, [(0, tuple(min(1, v * 1.25) for v in coat)), (0.45, coat), (0.80, tuple(v * 0.95 for v in belly)), (1, belly)])
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.12, 0.07, 0.04, 0.55); c.set_line_width(max(0.7, 0.008 * L)); c.stroke()
    c.set_source_rgba(1.0, 0.82, 0.45, 0.55); c.set_line_width(max(0.8, 0.012 * L)); c.new_path(); c.move_to(-0.34 * L, -0.55 * L); c.curve_to(-0.30 * L, -0.65 * L, -0.12 * L, -0.67 * L, 0.04 * L, -0.645 * L); c.stroke()   # sun rim on the back
    c.set_source_rgba(0.20, 0.12, 0.07, 0.30); c.set_line_width(0.02 * L); c.new_path(); c.move_to(-0.30 * L, -0.62 * L); c.curve_to(-0.05 * L, -0.67 * L, 0.25 * L, -0.64 * L, 0.42 * L, -0.56 * L); c.stroke()  # dorsal line
    c.set_source_rgb(0.97, 0.94, 0.88); c.new_path(); c.save(); c.translate(0.43 * L, -0.47 * L); c.scale(0.045 * L, 0.095 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()       # pale rump
    c.set_source_rgb(0.95, 0.90, 0.80); c.new_path(); c.move_to(0.45 * L, -0.55 * L); c.line_to(0.50 * L, -0.50 * L); c.line_to(0.45 * L, -0.46 * L); c.close_path(); c.fill()            # tail
    if fawn:
        r = np.random.default_rng(5)
        c.set_source_rgba(0.98, 0.95, 0.86, 0.85)
        for _ in range(16):
            sx, sy = r.uniform(-0.28, 0.38) * L, r.uniform(-0.62, -0.44) * L
            c.new_path(); c.arc(sx, sy, 0.016 * L, 0, TAU); c.fill()
    # neck + head
    c.new_path(); c.move_to(-0.26 * L, -0.62 * L); c.curve_to(-0.33 * L, -0.70 * L, -0.40 * L, -0.77 * L, -0.47 * L, -0.80 * L)
    c.line_to(-0.56 * L, -0.74 * L); c.curve_to(-0.48 * L, -0.68 * L, -0.40 * L, -0.54 * L, -0.34 * L, -0.46 * L); c.close_path()
    g2 = cairo.LinearGradient(-0.62 * L, 0, -0.26 * L, 0); g2.add_color_stop_rgb(0, *[min(1, v * 1.2) for v in coat]); g2.add_color_stop_rgb(1, *[v * 0.92 for v in coat])
    c.set_source(g2); c.fill()
    c.new_path(); c.save(); c.translate(-0.565 * L, -0.775 * L); c.rotate(0.50); c.scale(0.112 * L, 0.052 * L); c.arc(0, 0, 1, 0, TAU); c.restore()
    c.set_source(g2); c.fill_preserve(); c.set_source_rgba(0.12, 0.07, 0.04, 0.5); c.set_line_width(max(0.6, 0.006 * L)); c.stroke()
    c.set_source_rgb(0.12, 0.08, 0.06); c.new_path(); c.save(); c.translate(-0.660 * L, -0.742 * L); c.scale(0.017 * L, 0.013 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()          # nose
    c.set_source_rgb(0.97, 0.94, 0.88); c.new_path(); c.save(); c.translate(-0.645 * L, -0.720 * L); c.rotate(0.4); c.scale(0.036 * L, 0.014 * L); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()  # muzzle
    for (ex, ey, rot, sz) in ((-0.465, -0.835, -1.15, 1.0), (-0.415, -0.810, -0.80, 0.85)):
        c.new_path(); c.save(); c.translate(ex * L, ey * L); c.rotate(rot); c.scale(0.062 * L * sz, 0.024 * L * sz); c.arc(0, 0, 1, 0, TAU); c.restore()
        c.set_source_rgb(*coat); c.fill_preserve(); c.set_source_rgba(0.80, 0.56, 0.50, 0.7); c.set_line_width(max(0.5, 0.005 * L)); c.stroke()
    c.set_source_rgb(0.05, 0.03, 0.03); c.new_path(); c.arc(-0.588 * L, -0.787 * L, 0.0105 * L, 0, TAU); c.fill()
    c.set_source_rgba(1, 1, 1, 0.85); c.new_path(); c.arc(-0.591 * L, -0.791 * L, 0.0035 * L, 0, TAU); c.fill()


def deer_pair(img, x, y_base, L):
    for (dx, dy, LL, fawn) in ((0, 0, L, False), (0.64 * L, 0.05 * L, L * 0.60, True)):
        wpx, hpx = int(LL * 1.4), int(LL * 1.1)
        spr = sprite(wpx, hpx, lambda c, LL=LL, fawn=fawn: (c.translate(wpx / 2, hpx * 0.97), draw_deer(c, LL, fawn)), ss=3)
        rgb, a = spr
        a_s = cv2.GaussianBlur(a, (0, 0), 0.7)
        rgb_s = cv2.GaussianBlur(rgb, (0, 0), 0.7)
        paste(img, (rgb_s, a_s), x + dx - wpx / 2, y_base + dy - hpx * 0.97)


def lantern_flock(seed=2024):
    """the same drifting sky lanterns carried across the whole journey, rising a little as they go: [(x, y, size)]"""
    rng = np.random.default_rng(seed)
    out = []
    x = 4300.0
    while x < 12700:
        x += rng.uniform(95, 270)
        if abs(x - 7330) < 150: continue
        yc = 770 - 0.082 * (x - 4000)
        y = yc + rng.normal(0, 125)
        if y < 60 or y > 740: continue
        out.append((float(x), float(y), float(rng.uniform(7.0, 15.0))))
    return out
