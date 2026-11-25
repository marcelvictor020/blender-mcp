"""Slides 7-11: THE GARDEN - golden hour on the lake's far shore (x 7000..11900).

It is the SAME place as the pond: the lake still lies on the left (same lily pads, same reeds, same white-robed walkers on the far
shore, same birds), the mist is the same mist, now lit gold; a misty fir-and-birch wall stands behind a mown lawn; clouds have
become a bear and a swan; the sun hangs low over the water with its pale day-moon still up.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
from sky import sky_rgb
from folk import Z
from trees import leaf
import sculpt as SC

TAU = 2 * math.pi
GX0, GX1 = 7000, 12900
GW = GX1 - GX0
CXG = TEMPLE['cx']
BASE_Y, APEX_Y, HALF = TEMPLE['base_y'], TEMPLE['apex_y'], TEMPLE['half']
FG, HCAM = 1000.0, 4.2
SUN_G = (7330.0, 766.0)

LAKE = [(6900, 1190), (7400, 1135), (7900, 1065), (8300, 990), (8650, 925), (8950, 868), (9250, 826), (9600, 798), (9950, 786), (10200, 783)]


def lake_y(x):
    xs, ys = zip(*LAKE)
    x = np.asarray(x, np.float32)
    y = np.interp(x, xs, ys)
    fade = np.clip((y - HZ) / 90.0, 0, 1)
    return y + fade * (6 * np.sin(x / 53.0) + 3 * np.sin(x / 19.0 + 1.1))


def gpt(X, Zd):
    """ground-plane point (lateral metres from the path axis, depth metres) -> screen x, y, px-per-metre"""
    return CXG + X * FG / Zd, HZ + HCAM * FG / Zd, FG / Zd


def puff_height(puffs, x0, w, h):
    return SC.puff_height(puffs, x0, w, h)


def shade_gold(Hm):
    """cloud lit by the low sun from the LEFT: gold key, warm-grey belly, a rose bounce from below"""
    g = cv2.GaussianBlur(Hm, (0, 0), 3.0)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    n = np.stack([-gx, -gy, np.ones_like(gx) * 1.1], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L1 = np.array([-0.88, -0.25, 0.40], np.float32); L1 /= np.linalg.norm(L1)
    L2 = np.array([0.15, 0.90, 0.40], np.float32); L2 /= np.linalg.norm(L2)
    d1 = np.clip((n * L1).sum(-1), 0, 1) ** 0.8
    d2 = np.clip((n * L2).sum(-1), 0, 1)
    thick = np.clip(g / 60.0, 0, 1)
    amb = np.array([0.66, 0.65, 0.68], np.float32) * (0.85 + 0.15 * (1 - thick))[..., None]
    return amb + d1[..., None] * np.array([1.0, 0.86, 0.56], np.float32) * 0.62 + d2[..., None] * np.array([0.92, 0.70, 0.56], np.float32) * 0.20


# ============================================================================================ sky, sun, moon, clouds
def sky_garden(x0, w):
    h = HZ
    img = sky_rgb(x0, w, h)
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    d = np.hypot(xs - SUN_G[0], (ys - SUN_G[1]) * 1.25)
    glow = np.exp(-(d / 700.0) ** 1.5) * 0.50 + np.exp(-(d / 170.0) ** 1.4) * 0.85
    img = img + glow[..., None] * np.array([1.0, 0.70, 0.30], np.float32) * 0.70
    sh = (ys * 0.34).astype(np.float32)
    ci = fbm01(x0, 0, w, h, 170, 5, 171, aniso=6.5, gain=0.52)
    gy_, gx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    ci = cv2.remap(ci, gx_ + sh, gy_, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    ci = cv2.GaussianBlur(smoothstep(0.54, 0.86, ci), (0, 0), 2.2) * smoothstep(20, 220, ys) * (1 - smoothstep(560, 760, ys)) * 0.50
    warm = np.clip(1.0 - (xs - SUN_G[0]) / 5200.0, 0.25, 1.0)
    cc = np.array([1.0, 0.93, 0.80], np.float32)[None, None, :] * warm[..., None] + np.array([0.86, 0.90, 0.96], np.float32)[None, None, :] * (1 - warm[..., None])
    img = img * (1 - ci[..., None]) + cc * ci[..., None]
    sd = np.hypot(xs - SUN_G[0], ys - SUN_G[1])
    disc = np.exp(-(sd / 34.0) ** 4)
    img = img * (1 - disc[..., None] * 0.95) + np.array([1.0, 0.97, 0.84], np.float32) * disc[..., None] * 0.95
    img = img + np.exp(-(sd / 90.0) ** 1.3)[..., None] * np.array([1.0, 0.78, 0.42], np.float32) * 0.42
    mx, my, mr = 7080.0, 236.0, 96.0
    cres = np.clip(1 - np.hypot(xs - mx, ys - my) / mr, 0, 1) * (np.hypot(xs - mx - 0.34 * mr, ys - my + 0.06 * mr) > 0.86 * mr)
    cres = cv2.GaussianBlur(cres.astype(np.float32), (0, 0), 1.4)
    cres = np.clip(cres * 6.0, 0, 1) * 0.55 * (1 - smoothstep(7200, 7500, xs))
    img = img * (1 - cres[..., None]) + np.array([0.94, 0.94, 0.92], np.float32) * cres[..., None]
    return np.clip(img, 0, 1)


def clouds_garden(img, x0, w):
    h = img.shape[0]
    Hm = np.zeros((h, w), np.float32)
    Hm = np.maximum(Hm, SC.animal_height('bear', x0, w, h, 8880.0, 252.0, 600.0, flip=False, seed=3))
    Hm = np.maximum(Hm, SC.animal_height('swan', x0, w, h, 10950.0, 330.0, 470.0, flip=False, seed=5))
    rng = np.random.default_rng(55)
    puffs = []
    for (cx, cy, n, sp) in ((7850, 470, 16, 70), (11350, 395, 12, 62), (8300, 590, 9, 60), (10100, 520, 8, 54)):
        for i in range(n):
            puffs.append((cx + rng.normal(0, sp * 1.8), cy + rng.normal(0, sp * 0.35) - abs(rng.normal(0, 22)), rng.uniform(26, 58)))
    Hm = np.maximum(Hm, puff_height(puffs, x0, w, h))
    n1 = fbm(x0, 0, w, h, 26, 3, 31)
    inside = (Hm > 0).astype(np.float32)
    Hm = np.clip(Hm * (1 + 0.06 * n1) + 0.9 * fbm(x0, 0, w, h, 11, 3, 32) * inside, 0, None)
    Hm = cv2.GaussianBlur(Hm, (0, 0), 2.0)
    col = shade_gold(Hm)
    a = np.clip(Hm / 14.0, 0, 1) ** 0.8
    a = cv2.GaussianBlur(a, (0, 0), 1.0) * 0.95
    return img * (1 - a[..., None]) + col * a[..., None]


# ============================================================================================ forest wall (firs + birches, misty)
def fir(c, x, y, h, base, rng):
    n = int(rng.integers(7, 11))
    wd = h * rng.uniform(0.17, 0.27)
    lean = rng.normal(0, 0.020) * h
    base = np.array(base, np.float32)
    lit = np.clip(base * 1.5 + np.array([0.20, 0.15, 0.00], np.float32), 0, 1)
    dark = base * 0.78
    tiers = []
    for t in range(n):
        f = t / n
        hb = y - h * 0.92 * f
        top = hb - (h / n) * rng.uniform(1.5, 2.0)
        ww = wd * (1 - f) ** 0.95 * rng.uniform(0.78, 1.25) + 0.012 * h
        tiers.append((hb, top, ww, lean * f + rng.normal(0, 0.004) * h))
    for (hb, top, ww, off) in tiers:
        for side, col in ((-1, lit * 0.82 + base * 0.18), (1, dark)):
            ww_ = ww * rng.uniform(0.88, 1.12)
            c.set_source_rgba(float(col[0]), float(col[1]), float(col[2]), 1)
            c.new_path()
            c.move_to(x + off, top)
            c.line_to(x + off + side * ww_ * 0.30, top + (hb - top) * 0.34)
            c.line_to(x + off + side * ww_ * 0.62, top + (hb - top) * 0.62)
            c.line_to(x + off + side * ww_ * 0.98, hb + (hb - top) * rng.uniform(0.05, 0.16))
            c.line_to(x + off + side * ww_ * 0.78, hb - (hb - top) * 0.03)
            c.line_to(x + off + side * ww_ * 0.60, hb + (hb - top) * 0.07)
            c.line_to(x + off + side * ww_ * 0.36, hb - (hb - top) * 0.04)
            c.line_to(x + off + side * ww_ * 0.18, hb + (hb - top) * 0.05)
            c.line_to(x + off, hb)
            c.close_path()
            c.fill()


def birch(c, x, y, h, base, rng):
    """round-crowned deciduous tree with a pale trunk; crown = a cluster of leaf clumps lit gold on the sun side"""
    c.set_source_rgba(0.86, 0.82, 0.70, 1); c.set_line_width(max(1.2, h * 0.022))
    c.new_path(); c.move_to(x, y); c.curve_to(x + rng.normal(0, 3), y - h * 0.4, x + rng.normal(0, 4), y - h * 0.6, x + rng.normal(0, 4), y - h * 0.78); c.stroke()
    base = np.array(base, np.float32)
    cx, cy = x, y - h * 0.80
    for k in range(int(10 + h / 18)):
        a = rng.uniform(0, TAU); d = rng.uniform(0, h * 0.20)
        px, py = cx + math.cos(a) * d * 0.9, cy + math.sin(a) * d * 0.75
        r = rng.uniform(0.07, 0.13) * h
        warm = np.clip(0.5 - math.cos(a) * 0.5, 0, 1)
        col = np.clip(base * (0.85 + 0.3 * rng.random()) + np.array([0.20, 0.17, 0.0]) * (1 - warm), 0, 1)
        c.set_source_rgba(float(col[0]), float(col[1]), float(col[2]), 1); c.new_path(); c.arc(px, py, r, 0, TAU); c.fill()


def forest_wall(x0, w):
    out = []
    rng = np.random.default_rng(81)
    wk = w / 4900.0
    specs = [(0.70, 0.62, 160, int(1900 * wk), (0.34, 0.42, 0.36)), (0.50, 0.82, 210, int(1500 * wk), (0.24, 0.34, 0.26)), (0.30, 1.00, 255, int(1100 * wk), (0.15, 0.25, 0.18))]
    haze_c = np.array([0.98, 0.86, 0.64], np.float32)
    for li, (haze, hmul, hmax, n, base) in enumerate(specs):
        L = Layer(w, 580, x0, HZ - 520, 2)
        c = L.ctx
        for i in range(n):
            x = rng.uniform(x0 - 30, x0 + w + 30)
            if x < 8950 and rng.random() < 0.94: continue
            hh = hmax * hmul * (0.40 + 0.70 * rng.gamma(3.0, 0.33))
            y = HZ + rng.uniform(-6, 14)
            warm = np.clip(0.55 + 0.45 * math.cos((x - 7400) / 2400.0), 0, 1)
            base_c = np.array(base, np.float32) * (0.82 + 0.34 * rng.random())
            col = base_c * (1 - haze) + haze_c * haze * (0.80 + 0.2 * warm)
            if rng.random() < 0.20:
                birch(c, x, y, hh * 0.78, tuple(np.clip(col * np.array([1.25, 1.18, 0.55]), 0, 1)), rng)
            else:
                fir(c, x, y, hh, tuple(np.clip(col, 0, 1)), rng)
        rgb, a = L.get()
        tex = fbm(x0, HZ - 520, w, 580, 5, 3, 201 + li) * 0.55 + fbm(x0, HZ - 520, w, 580, 13, 3, 211 + li) * 0.45
        rgb = rgb * (1 + 0.28 * tex)[..., None]
        a_l = np.roll(a, 2, axis=1)
        rim = np.clip(a - a_l, 0, 1) * (1 - haze)
        rgb = rgb + rim[..., None] * np.array([0.40, 0.30, 0.09], np.float32) * a[..., None]
        rgb = cv2.GaussianBlur(rgb, (0, 0), 1.2 + 0.8 * (2 - li)); a = cv2.GaussianBlur(a, (0, 0), 1.2 + 0.8 * (2 - li))
        out.append((rgb, a))
    return out


def mist(x0, w, h, seed=3):
    ys = np.arange(h, dtype=np.float32)[:, None]
    n = fbm01(x0, 0, w, h, 260, 4, 19 + seed, aniso=7.0)
    base = np.exp(-((ys - (HZ - 24)) / 70.0) ** 2) * (0.35 + 0.65 * n)
    high = np.exp(-((ys - (HZ - 160)) / 120.0) ** 2) * (0.10 + 0.50 * fbm01(x0, 0, w, h, 330, 3, 23 + seed, aniso=5.0)) * 0.55
    return np.clip(base * 1.0 + high, 0, 0.92)


def light_shafts(x0, w, h):
    L = Layer(w, h, x0, 0, 1)
    c = L.ctx
    r = np.random.default_rng(12)
    for i in range(18):
        ang = math.radians(r.uniform(-48, -2))
        width = math.radians(r.uniform(1.6, 5.0))
        length = 4800
        x_, y_ = SUN_G
        pts = [(x_, y_), (x_ + length * math.cos(ang - width), y_ + length * math.sin(ang - width)), (x_ + length * math.cos(ang + width), y_ + length * math.sin(ang + width))]
        g = cairo.LinearGradient(x_, y_, x_ + length * math.cos(ang), y_ + length * math.sin(ang))
        a0 = r.uniform(0.018, 0.045)
        g.add_color_stop_rgba(0, 1.0, 0.84, 0.50, a0); g.add_color_stop_rgba(0.55, 1.0, 0.82, 0.50, a0 * 0.45); g.add_color_stop_rgba(1, 1.0, 0.82, 0.5, 0)
        c.set_source(g)
        c.new_path(); c.move_to(*pts[0]); c.line_to(*pts[1]); c.line_to(*pts[2]); c.close_path(); c.fill()
    return L.get()


# ============================================================================================ lake extras (same pads/reeds as the pond)
GARDEN_REEDS = []
_rr = np.random.default_rng(15)
for _i in range(40):
    _x = float(_rr.uniform(7050, 9900)); _nb = int(_rr.integers(3, 6))
    GARDEN_REEDS.append(dict(x=_x, nb=_nb, hs=[float(_rr.uniform(50, 95)) for _ in range(_nb)], sway=[(float(_rr.normal(0, 6)), float(_rr.normal(0, 9))) for _ in range(_nb)],
                             cat=bool(_rr.random() < .45), cat_h=float(_rr.uniform(70, 110)), cat_dx=float(_rr.normal(0, 4))))


def lake_extras(x0, w):
    """lily pads + lotus on the water, reeds + cat-tails on the shore (golden-hour lit)"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    for i, (x, y, sd) in enumerate(PADS):
        if not (x0 - 60 < x < x0 + w + 60) or x < 6950: continue
        if y > lake_y(x) - 26 or y < HZ + 14: continue
        s = 0.5 + (y - HZ) / 380.0
        rx, ry = 34 * s, 10 * s
        c.set_source_rgba(0.04, 0.10, 0.08, 0.40)
        c.new_path(); c.save(); c.translate(x + 2 * s, y + 3 * s); c.scale(rx * 1.04, ry * 1.1); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        g = cairo.RadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, rx)
        g.add_color_stop_rgba(0, 0.58, 0.62, 0.26, 1); g.add_color_stop_rgba(0.7, 0.28, 0.40, 0.18, 1); g.add_color_stop_rgba(1, 0.12, 0.22, 0.12, 1)
        c.new_path(); c.save(); c.translate(x, y); c.scale(rx, ry); c.arc(0, 0, 1, math.radians(18), math.radians(342)); c.line_to(0, 0); c.close_path(); c.restore()
        c.set_source(g); c.fill()
        if i % 4 == 0:
            fx, fy = x - 6 * s, y - 8 * s
            for k, (rad, col) in enumerate(((16 * s, (0.90, 0.66, 0.66)), (12 * s, (0.98, 0.88, 0.84)))):
                for p in range(8 if k == 0 else 6):
                    a_ = TAU * p / (8 if k == 0 else 6) + k * 0.3
                    c.save(); c.translate(fx + math.cos(a_) * rad * 0.45, fy + math.sin(a_) * rad * 0.26); c.rotate(a_)
                    c.scale(rad * 0.62, rad * 0.30); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore()
                    c.set_source_rgba(col[0], col[1], col[2], 0.95); c.fill()
            c.set_source_rgba(0.98, 0.80, 0.32, 1); c.new_path(); c.arc(fx, fy, 3.0 * s, 0, TAU); c.fill()
    for rd in GARDEN_REEDS:
        x = rd['x']; y = float(lake_y(x)) + 2
        if y < HZ + 18 or not (x0 - 30 < x < x0 + w + 30): continue
        sc = 0.55 + (y - HZ) / 420.0
        for k in range(rd['nb']):
            xo = x + (k - 2) * 5 * sc
            hh = rd['hs'][k] * sc
            sw1, sw2 = rd['sway'][k]
            c.set_source_rgba(0.10, 0.13, 0.06, 1); c.set_line_width(3.2 * sc)
            c.new_path(); c.move_to(xo, y); c.curve_to(xo + 2 * sc, y - hh * .5, xo + sw1 * sc, y - hh * .8, xo + sw2 * sc, y - hh); c.stroke()
            c.set_source_rgba(0.62, 0.62, 0.28, 0.9); c.set_line_width(1.5 * sc)
            c.new_path(); c.move_to(xo - 0.8 * sc, y); c.curve_to(xo + 1.2 * sc, y - hh * .5, xo + sw1 * sc - 0.8, y - hh * .8, xo + sw2 * sc - 0.8, y - hh); c.stroke()
        if rd['cat']:
            c.set_source_rgba(0.34, 0.20, 0.10, 1)
            c.new_path(); c.save(); c.translate(x + rd['cat_dx'] * sc, y - rd['cat_h'] * sc); c.scale(4.6 * sc, 13 * sc); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    return L.get()


def glitter(x0, w):
    """sun-glitter on the lake: a broken path of light below the sun"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    r = np.random.default_rng(66)
    for k in range(900):
        y = HZ + 3 + (r.uniform(0, 1) ** 1.35) * 520
        spread = 18 + 0.34 * (y - HZ)
        x = SUN_G[0] + r.normal(0, spread * 0.55)
        if y > lake_y(x) - 4: continue
        wd = r.uniform(5, 26) * (0.5 + (y - HZ) / 260.0)
        a = r.uniform(0.25, 0.80) * math.exp(-(y - HZ) / 520.0)
        c.set_source_rgba(1.0, 0.92, 0.66, a); c.set_line_width(r.uniform(1.2, 2.6))
        c.new_path(); c.move_to(x - wd / 2, y); c.line_to(x + wd / 2, y); c.stroke()
    return L.get()


# ============================================================================================ lawn
def lawn_color(x0, w):
    ys = np.arange(HZ, H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    Zd = HCAM * FG / np.maximum(ys - HZ, 1.0)
    X = (xs - CXG) * Zd / FG
    t = (ys - HZ) / (H - HZ)
    far = np.array([0.70, 0.64, 0.30], np.float32)
    near = np.array([0.34, 0.34, 0.13], np.float32)
    col = far * (1 - t[..., None] ** 0.7) + near * t[..., None] ** 0.7
    n = fbm01(x0, HZ, w, H - HZ, 70, 4, 81, aniso=3.0)
    n2 = fbm01(x0, HZ, w, H - HZ, 14, 3, 82, aniso=1.0)
    n3 = fbm01(x0, HZ, w, H - HZ, 230, 3, 83, aniso=2.5)
    col = col * (0.88 + 0.20 * n[..., None]) * (0.96 + 0.08 * n2[..., None])
    col = col * (1 + 0.16 * (n3 - 0.5))[..., None] + np.array([0.04, 0.02, -0.02], np.float32) * (n3 - 0.5)[..., None]
    inpath = 1 - smoothstep(0.90, 1.0, np.abs(X))
    stripe = 0.5 + 0.5 * np.sin(Zd * 3.1)
    fine = fbm01(x0, HZ, w, H - HZ, 3, 2, 85, aniso=0.5)
    pc = np.array([0.60, 0.60, 0.27], np.float32) * (0.90 + 0.14 * stripe[..., None]) * (0.92 + 0.16 * fine[..., None])
    col = col * (1 - inpath[..., None]) + pc * inpath[..., None]
    lit = 1.0 + 0.40 * np.exp(-((xs - 7500) / 1700.0) ** 2)
    col = col * lit[..., None]
    bands = fbm01(x0, HZ, w, H - HZ, 90, 3, 91, aniso=6.0)
    sh = smoothstep(0.56, 0.78, bands) * 0.16
    col = col * (1 - sh[..., None]) + np.array([0.05, 0.10, 0.12], np.float32) * sh[..., None]
    return np.clip(col, 0, 1)


def grass_blades(x0, w, n=34000, ss=1):
    L = Layer(w, H, x0, 0, ss)
    c = L.ctx
    r = Z(72)
    ys = np.sort(HZ + 8 + (H - HZ - 8) * r.uniform(0, 1, n) ** 1.3)
    for y in ys:
        sc = (y - HZ) / HCAM
        x = r.uniform(x0 - 20, x0 + w + 20)
        if y < lake_y(x) + 2: continue
        Zd = HCAM * FG / max(y - HZ, 1)
        Xl = abs((x - CXG) * Zd / FG)
        if Xl < 3.45 and y > BASE_Y + 3 and r.random() > 0.01: continue
        hgt = sc * r.uniform(.08, .30)
        lean = r.normal(0.02, hgt * .20)
        g = r.uniform(0, 1)
        dry = r.random() < 0.20
        base = np.array([0.30 + 0.20 * g, 0.27 + 0.14 * g, 0.08 + 0.04 * g]) if dry else np.array([0.19 + 0.14 * g, 0.25 + 0.15 * g, 0.07 + 0.04 * g])
        warm = np.clip(1.0 - (x - 7500) / 4500.0, 0.2, 1.0)
        tip = np.minimum(1.0, base * (1.55 + 0.45 * warm) + np.array([0.14, 0.11, 0.0]) * warm)
        gr = cairo.LinearGradient(x, y, x + lean, y - hgt)
        gr.add_color_stop_rgb(0, *(base * 0.55)); gr.add_color_stop_rgb(1, *tip)
        c.set_source(gr); c.set_line_width(max(0.9, sc * 0.010 * r.uniform(.7, 1.3)))
        c.new_path(); c.move_to(x, y); c.curve_to(x + lean * .2, y - hgt * .5, x + lean * .7, y - hgt * .85, x + lean, y - hgt); c.stroke()
    return L.get()


def vnoise(u, v, seed=0):
    iu, iv = np.floor(u).astype(np.int64), np.floor(v).astype(np.int64)
    fu, fv = u - iu, v - iv
    h = lambda i, j: (np.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453) % 1.0
    su, sv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    a, b_, c_, d = h(iu, iv), h(iu + 1, iv), h(iu, iv + 1), h(iu + 1, iv + 1)
    return (a * (1 - su) + b_ * su) * (1 - sv) + (c_ * (1 - su) + d * su) * sv


FLOWER_COLS = [(0.68, 0.13, 0.16), (0.66, 0.20, 0.42), (0.92, 0.72, 0.16), (0.95, 0.92, 0.84), (0.50, 0.09, 0.14), (0.86, 0.46, 0.18), (0.55, 0.34, 0.60)]
FLOWER_EYE = [(0.95, 0.80, 0.30), (0.95, 0.78, 0.35), (0.50, 0.28, 0.06), (0.95, 0.72, 0.18), (0.95, 0.78, 0.35), (0.40, 0.22, 0.05), (0.95, 0.85, 0.40)]
BASEW = np.array([0.26, 0.17, 0.22, 0.22, 0.09, 0.02, 0.02])


def flower_beds(x0, w):
    L = Layer(w, H, x0, 0, 1)
    c = L.ctx
    r = Z(71)
    pts = []
    for bed in (-1, 1):
        n = 70000
        Zd = 2.6 + 17.4 * r.uniform(0, 1, n) ** 1.55
        y = HZ + (HCAM * FG / Zd)
        sc = (y - HZ) / HCAM
        X = bed * r.uniform(1.0, 3.4, n)
        x = CXG + sc * X
        ok = (y > BASE_Y + 1) & (y < H + 14) & (x > x0 - 10) & (x < x0 + w + 10)
        drift = vnoise(X * 1.3 + (40 if bed > 0 else 0), Zd * 0.22, 7)
        for i in np.nonzero(ok)[0]:
            pts.append((float(y[i]), float(x[i]), float(sc[i]), float(drift[i]), float(abs(X[i]))))
    pts.sort()
    for bed in (-1, 1):
        quad = []
        for Zd in (19.7, 2.4):
            quad.append((CXG + bed * 1.0 * FG / Zd, HZ + HCAM * FG / Zd)); quad.append((CXG + bed * 3.4 * FG / Zd, HZ + HCAM * FG / Zd))
        c.set_source_rgb(0.10, 0.14, 0.05)
        c.new_path(); c.move_to(*quad[0]); c.line_to(*quad[1]); c.line_to(*quad[3]); c.line_to(*quad[2]); c.close_path(); c.fill()
    for (y, x, sc, drift, Xa) in pts:
        wts = BASEW * (1 + 0.7 * np.array([math.sin(drift * 6.3 + k * 1.7) for k in range(7)]))
        wts = np.clip(wts, 0.01, None); wts /= wts.sum()
        k = int(r.choice(7, p=wts))
        col = FLOWER_COLS[k]
        sz = min(max(sc * 0.082 * r.uniform(.75, 1.25), 1.5), 20.0)
        lightf = 1.0 + 0.26 * (1 if x < CXG else -0.20)
        cc = tuple(min(1, v * lightf * r.uniform(.88, 1.08)) for v in col)
        gcol = (0.10 + 0.08 * r.random(), 0.22 + 0.10 * r.random(), 0.06)
        c.set_source_rgb(*gcol); c.new_path(); c.arc(x + r.normal(0, sz * .4), y + sz * .55, sz * 1.05, 0, TAU); c.fill()
        if sz > 4.0:
            for p in range(2):
                a_ = r.uniform(0, TAU)
                leaf(c, x, y + sz * 0.3, sz * 1.5, a_, (0.12 + 0.12 * r.random(), 0.26 + 0.12 * r.random(), 0.07))
            n_p = 6 if sz < 9 else 7
            for p in range(n_p):
                a_ = TAU * p / n_p + x
                c.set_source_rgb(*[v * 0.76 for v in cc]); c.new_path(); c.arc(x + math.cos(a_) * sz * .58, y + math.sin(a_) * sz * .50 + sz * .07, sz * .52, 0, TAU); c.fill()
            for p in range(n_p):
                a_ = TAU * p / n_p + x
                c.set_source_rgb(*cc); c.new_path(); c.arc(x + math.cos(a_) * sz * .52, y + math.sin(a_) * sz * .45, sz * .47, 0, TAU); c.fill()
            c.set_source_rgb(*FLOWER_EYE[k]); c.new_path(); c.arc(x, y, sz * .27, 0, TAU); c.fill()
            if sz > 9:
                c.set_source_rgba(1, 1, 0.9, 0.35); c.new_path(); c.arc(x - sz * .18, y - sz * .18, sz * .13, 0, TAU); c.fill()
        else:
            c.set_source_rgb(*cc); c.new_path(); c.arc(x, y, sz, 0, TAU); c.fill()
    for bed in (-1, 1):
        for X_ in (1.0, 3.4):
            c.set_source_rgba(0.08, 0.06, 0.03, 0.9); c.set_line_width(3.0)
            c.new_path()
            for k, Zd in enumerate(np.linspace(19.7, 2.4, 80)):
                px, py = CXG + bed * X_ * FG / Zd, HZ + HCAM * FG / Zd
                (c.move_to if k == 0 else c.line_to)(px, py)
            c.stroke()
    return L.get()


def daisies(x0, w):
    L = Layer(w, H, x0, 0, 1)
    c = L.ctx
    r = Z(19)
    for i in range(5200):
        y = HZ + 20 + (H - HZ - 20) * r.uniform(0, 1) ** 1.2
        x = r.uniform(x0, x0 + w)
        if y < lake_y(x) + 6: continue
        sc = (y - HZ) / HCAM
        Zd = HCAM * FG / (y - HZ)
        Xl = abs((x - CXG) * Zd / FG)
        if Xl < 3.7 and y > BASE_Y: continue
        s = max(1.4, sc * 0.030 * r.uniform(0.7, 1.3))
        col = [(0.97, 0.95, 0.88), (0.95, 0.80, 0.30), (0.88, 0.60, 0.65)][int(r.integers(3))]
        c.set_source_rgba(*col, 0.92); c.new_path(); c.arc(x, y, s, 0, TAU); c.fill()
        c.set_source_rgba(0.95, 0.72, 0.18, 0.95); c.new_path(); c.arc(x, y, s * 0.35, 0, TAU); c.fill()
    return L.get()


# ============================================================================================ environment assembly
def build_environment(x0=GX0, w=GW, verbose=True):
    import time
    from water import mirror_water
    t0 = time.time()
    sky = sky_garden(x0, w)
    sky = clouds_garden(sky, x0, w)
    img = np.zeros((H, w, 3), np.float32)
    img[:HZ] = sky
    hz_c = np.array([0.99, 0.86, 0.60], np.float32)
    layers = forest_wall(x0, w)
    mst = mist(x0, w, HZ + 60)
    for li, (rgb, a) in enumerate(layers):
        sl = img[HZ - 520:HZ + 60]
        img[HZ - 520:HZ + 60] = sl * (1 - a[..., None]) + rgb
        m = mst[HZ - 520:HZ + 60][:, :] * (0.50 + 0.30 * li)
        img[HZ - 520:HZ + 60] = img[HZ - 520:HZ + 60] * (1 - m[..., None]) + hz_c * m[..., None] * 0.95
    if verbose: print('forest', round(time.time() - t0, 1))
    sr, sa = light_shafts(x0, w, H)
    img = img * (1 - sa[..., None] * 0.3) + sr * 1.0
    full = img.copy()
    water_c = np.array([0.06, 0.16, 0.20], np.float32)
    lake = mirror_water(full, x0, w, water_c, seed=17)
    ys = np.arange(HZ, H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    ly = lake_y(xs)
    wat = ((ys < ly) & (xs < 10200)).astype(np.float32)
    wat = cv2.GaussianBlur(wat, (0, 0), 1.2)
    lawn = lawn_color(x0, w)
    img[HZ:] = lawn
    img[HZ:] = img[HZ:] * (1 - wat[..., None]) + lake[HZ:] * wat[..., None]
    gr_, ga_ = glitter(x0, w)
    img = 1 - (1 - img) * (1 - np.clip(gr_ * ga_[..., None] * 1.0, 0, 1))
    lr, la = lake_extras(x0, w)
    img = img * (1 - la[..., None]) + lr
    edge = np.exp(-((ys - ly) / 7.0) ** 2) * (xs < 10100)
    img[HZ:] = img[HZ:] * (1 - 0.30 * edge[..., None]) + np.array([0.90, 0.86, 0.70], np.float32) * (0.20 * edge[..., None])
    if verbose: print('lake+lawn', round(time.time() - t0, 1))
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = build_environment()
    print('env', round(time.time() - t, 1), 's')
    preview(img, WORK + '/g_env_preview.png', 2000)
