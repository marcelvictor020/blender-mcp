"""Slides 3-4: CLOUDS INTO WATER / THE POND  (painterly realism, x ~2000..4500).

Pipeline: sky + moonlit volumetric ribbon cloud -> far shore -> mirror water (Fresnel, ripples)
-> pouring vapour + mist bands -> (scene4: trees, boat, girl, lantern) -> oil-paint pass -> post glints.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from sky import sky_rgb, key_colors
from folk import ribbon_puffs, Z
from shared import RIBBON, ribbon_thick

X0, X1 = 2000, 5500
CW = X1 - X0
_PUFFS = None
EXTRA_HEIGHT = None


def puffs():
    global _PUFFS
    if _PUFFS is None:
        _PUFFS = ribbon_puffs(RIBBON, ribbon_thick, seed=7, puff=0.55)[0]
    return _PUFFS


def ribbon_height(x0, w, h):
    """cloud as a union of spheres built from the folk puff circles -> billowy height field H (px) and radius map"""
    Hm = np.zeros((h, w), np.float32)
    for (px, py, pr) in puffs():
        xa, xb = int(px - pr - x0), int(px + pr - x0) + 1
        ya, yb = int(py - pr), int(py + pr) + 1
        xa, xb, ya, yb = max(xa, 0), min(xb, w), max(ya, 0), min(yb, h)
        if xa >= xb or ya >= yb: continue
        X = (np.arange(xa, xb, dtype=np.float32) + x0 - px)[None, :]
        Y = (np.arange(ya, yb, dtype=np.float32) - py)[:, None]
        d2 = (X * X + Y * Y) / (pr * pr)
        hh = pr * np.sqrt(np.clip(1 - d2, 0, 1)) * 0.82
        np.maximum(Hm[ya:yb, xa:xb], hh, out=Hm[ya:yb, xa:xb])
    if EXTRA_HEIGHT is not None:
        Hm = np.maximum(Hm, EXTRA_HEIGHT(x0, w, h))
    return Hm


def centre_y(x):
    xs, ys = zip(*RIBBON)
    return np.interp(x, xs, ys)


def shade_cloud(Hm, light_cool, light_warm):
    """lit like a heap of soft spheres: cool moonlight from the upper left, warm horizon bounce from below"""
    g = cv2.GaussianBlur(Hm, (0, 0), 3.4)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    n = np.stack([-gx, -gy, np.ones_like(gx) * 1.15], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L1 = np.array([-0.55, -0.66, 0.52], np.float32); L1 /= np.linalg.norm(L1)
    L2 = np.array([0.10, 0.90, 0.42], np.float32); L2 /= np.linalg.norm(L2)
    d1 = np.clip((n * L1).sum(-1), 0, 1) ** 0.85; d2 = np.clip((n * L2).sum(-1), 0, 1)
    thick = np.clip(g / 62.0, 0, 1)
    amb = np.array([0.30, 0.34, 0.54], np.float32) * (0.82 + 0.18 * (1 - thick))[..., None]
    col = amb + d1[..., None] * np.array(light_cool, np.float32) * 0.66 + d2[..., None] * np.array(light_warm, np.float32) * 0.62
    return col


def build_sky(x0, w):
    h = HZ
    img = sky_rgb(x0, w, h)
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    # warm horizon glow of the low midnight sun (stronger in slide 3, dies into the forest blue of slide 4)
    gl = np.exp(-((ys - (h - 6)) / 62.0) ** 2) * (0.42 - 0.26 * smoothstep(2800, 4200, xs))
    gl = gl * (0.8 + 0.4 * fbm01(x0, 0, w, h, 260, 3, 5, aniso=4.0))
    img = img + gl[..., None] * np.array([1.0, 0.50, 0.22], np.float32)
    # high thin cirrus, moonlit
    ci = fbm01(x0, 0, w, h, 130, 3, 11, aniso=8.0, gain=0.42)
    ci = cv2.GaussianBlur(smoothstep(0.62, 0.95, ci), (0, 0), 3.0) * smoothstep(60, 330, ys) * (1 - smoothstep(520, 720, ys)) * 0.26
    img = img * (1 - ci[..., None]) + np.array([0.60, 0.66, 0.90], np.float32) * ci[..., None]
    # low stratus bands lit warm from below
    st = fbm01(x0, 0, w, h, 200, 3, 21, aniso=9.0, gain=0.42)
    st = cv2.GaussianBlur(smoothstep(0.56, 0.86, st), (0, 0), 2.5) * np.exp(-((ys - 700) / 55.0) ** 2) * 0.55 * (1 - smoothstep(3300, 4100, xs))
    img = img * (1 - st[..., None]) + np.array([0.80, 0.52, 0.50], np.float32) * st[..., None]
    return np.clip(img, 0, 1)


def add_ribbon_cloud(img, x0, w):
    h = img.shape[0]
    Hm = ribbon_height(x0, w, h)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    vap = smoothstep(3000, 3750, xs)
    # cauliflower detail on the surface; edges raggedised more and more as it turns to vapour
    n1 = fbm(x0, 0, w, h, 26, 4, 31); n2 = fbm(x0, 0, w, h, 9, 3, 32)
    inside = (Hm > 0).astype(np.float32)
    Hm = np.clip(Hm * (1 + 0.12 * n1) + 2.2 * n2 * inside - 8.0 * vap * (n2 + 0.45) * inside, 0, None)
    Hm = cv2.GaussianBlur(Hm, (0, 0), 2.6)
    col = shade_cloud(Hm, (0.80, 0.86, 1.0), (1.0, 0.64, 0.48))
    col = col * (1 - 0.45 * vap)[..., None] + np.array([0.50, 0.57, 0.72], np.float32) * (0.45 * vap)[..., None]
    a = np.clip(Hm / (16.0 + 22.0 * vap), 0, 1) ** 0.9 * (1 - 0.28 * vap)
    a = cv2.GaussianBlur(a, (0, 0), 1.2)
    return img * (1 - a[..., None]) + col * a[..., None], Hm


def far_shore(x0, w):
    """low dark treeline on the horizon, two hazy layers of slim firs"""
    L = Layer(w, 90, x0, HZ - 70, ss=3)
    c = L.ctx
    r = Z(77)
    for layer, (col, hmul, n) in enumerate((((0.15, 0.19, 0.33), 0.60, 900), ((0.045, 0.085, 0.12), 1.0, 1000))):
        c.set_source_rgba(*col, 1)
        xs = np.arange(x0 - 20, x0 + w + 20, 3.0)
        base = HZ - 1.5 - 2.4 * (1 + np.sin(xs / 137.0 + layer)) - 1.8 * (1 + np.sin(xs / 41.0))
        c.new_path(); c.move_to(xs[0], HZ + 4)
        for xx, yy in zip(xs, base): c.line_to(xx, yy)
        c.line_to(xs[-1], HZ + 4); c.close_path(); c.fill()
        for i in range(n):
            x = r.uniform(x0 - 10, x0 + w + 10)
            bh = min(24.0, (4.5 + r.gamma(2.0, 2.6)) * hmul)
            yb = float(np.interp(x, xs, base)) + 2
            wd = bh * r.uniform(.11, .17)
            tiers = 3
            c.new_path(); c.move_to(x - wd, yb)
            for t_ in range(tiers):
                yy = yb - bh * (t_ + 1) / tiers; ww = wd * (1 - (t_ + 1) / (tiers + .6))
                c.line_to(x - ww * 1.25, yb - bh * (t_ + .55) / tiers); c.line_to(x - ww * .6, yy + bh * .02)
            c.line_to(x, yb - bh)
            for t_ in reversed(range(tiers)):
                yy = yb - bh * (t_ + 1) / tiers; ww = wd * (1 - (t_ + 1) / (tiers + .6))
                c.line_to(x + ww * .6, yy + bh * .02); c.line_to(x + ww * 1.25, yb - bh * (t_ + .55) / tiers)
            c.line_to(x + wd, yb); c.close_path(); c.fill()
    return L.get()


def tiny_procession(x0, w):
    """the last robed figures of slide 2, now pale silhouettes dissolving into the vapour"""
    L = Layer(w, 60, x0, HZ - 50, ss=3)
    c = L.ctx
    r = Z(5)
    for i in range(15):
        x = 2178 + i * 33 + r.normal(0, 1.5)
        if not (x0 <= x < x0 + w): continue
        s_ = 33 - i * 0.7
        a = max(0.0, 0.85 - i * 0.058)
        c.set_source_rgba(0.74, 0.70, 0.84, a)
        c.new_path(); c.move_to(x - s_ * .17, HZ + 7); c.curve_to(x - s_ * .12, HZ + 7 - s_ * .4, x - s_ * .09, HZ + 7 - s_ * .62, x - s_ * .07, HZ + 7 - s_ * .76)
        c.line_to(x + s_ * .07, HZ + 7 - s_ * .76); c.curve_to(x + s_ * .09, HZ + 7 - s_ * .62, x + s_ * .12, HZ + 7 - s_ * .4, x + s_ * .17, HZ + 7); c.close_path(); c.fill()
        c.new_path(); c.arc(x, HZ + 7 - s_ * .86, s_ * .085, 0, 6.2832); c.fill()
        c.set_source_rgba(1.0, 0.72, 0.45, a * .55)               # rim light from the low sun
        c.set_line_width(1.0); c.new_path(); c.move_to(x - s_ * .08, HZ + 7 - s_ * .74); c.curve_to(x - s_ * .12, HZ + 7 - s_ * .5, x - s_ * .15, HZ + 7 - s_ * .25, x - s_ * .17, HZ + 7); c.stroke()
    return L.get()


def mirror_water(img, x0, w, water_rgb, seed=3):
    """fill rows HZ..H with the mirror of rows above the horizon: ripple-sliced, Fresnel-weighted"""
    nh = H - HZ
    k = np.arange(nh, dtype=np.float32)
    xs = np.arange(w, dtype=np.float32)[None, :]
    ph = fbm(x0, HZ, w, nh, 160, 3, seed, aniso=5.0)
    amp = (0.35 + 0.012 * k)[:, None]
    wave = np.sin((k[:, None] ** 0.82) * 0.55 + ph * 7.0) + 0.5 * np.sin(k[:, None] * 0.21 + ph * 11.0 + 2.0)
    mx = xs + amp * wave * 1.5
    src = (HZ - 1 - k * 0.998 + 1.4 * np.sin(k * 0.31 + 1.0))[:, None] + 0 * xs
    refl = cv2.remap(img, mx.astype(np.float32), src.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    refl = cv2.GaussianBlur(refl, (0, 0), sigmaX=1.6, sigmaY=0.9)
    fres = (0.94 - 0.42 * smoothstep(0, 560, k))[:, None, None]
    wc = np.asarray(water_rgb, np.float32)
    out = refl * fres + wc * (1 - fres)
    # soft horizontal light/dark ripple lines
    rl = fbm(x0, HZ, w, nh, 9, 3, seed + 5, aniso=34.0)
    out = out * (1 + 0.16 * rl * (0.4 + smoothstep(0, 300, k))[:, None])[..., None]
    img = img.copy()
    img[HZ:] = out
    return img


def add_vapour(img, x0, w):
    """vapour pouring from the ribbon cloud down to the pond, then lying on it as a long mist band"""
    h = img.shape[0]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    ys = np.arange(h, dtype=np.float32)[:, None]
    cy = centre_y(xs)
    th = np.array([ribbon_thick(s) for s in np.linspace(0, 4500, 600)], np.float32)
    cum = np.linspace(0, 4500, 600)
    # curtain falling from the cloud's underside
    ramp = smoothstep(2650, 3350, xs) * (1 - smoothstep(3600, 4500, xs) * 0.35)
    below = ys - (cy + 38)
    streak = fbm01(x0, 0, w, h, 190, 3, 51, aniso=0.045, gain=0.5)
    curt = np.clip(below / 150.0, 0, 6)
    curtain = ramp * np.exp(-curt * 1.2) * (0.25 + 0.95 * streak) * smoothstep(0, 24, below) * 0.80 * (1 - smoothstep(HZ + 20, HZ + 130, ys))
    # long mist band on the pond (mirror symmetric about the horizon so band and reflection read as one)
    dist = np.abs(ys - (HZ + 6))
    sig = 24 + 46 * smoothstep(2400, 3500, xs) * (1 - 0.30 * smoothstep(3900, 4400, xs))
    band = np.exp(-(dist / sig) ** 2) * (0.35 + 0.65 * fbm01(x0, 0, w, h, 130, 4, 61, aniso=8.0))
    band = band * smoothstep(2650, 3250, xs) * (1 - 0.25 * smoothstep(4300, 5100, xs))
    # low ground mist on the water
    low = np.exp(-((ys - (HZ + 90)) / 120.0) ** 2) * (0.25 + 0.75 * fbm01(x0, 0, w, h, 190, 4, 71, aniso=6.0)) * 0.42
    low = low * smoothstep(2700, 3400, xs)
    m = np.clip(curtain + band * 0.78 + low, 0, 0.88)
    glow = np.exp(-((ys - HZ) / 70.0) ** 2)
    col = np.array([0.58, 0.60, 0.76], np.float32) * (1 - 0.35 * glow)[..., None] + np.array([0.95, 0.58, 0.44], np.float32) * (0.35 * glow)[..., None]
    col = col * (1 - 0.35 * smoothstep(3400, 4300, xs))[..., None] + np.array([0.46, 0.62, 0.62], np.float32) * (0.35 * smoothstep(3400, 4300, xs))[..., None]
    return img * (1 - m[..., None]) + col * m[..., None]


def render_scene3(x0=X0, w=CW, layerA=None):
    img = build_sky(x0, w)
    img, Dm = add_ribbon_cloud(img, x0, w)
    sr, sa = far_shore(x0, w)
    img[HZ - 70:HZ] = img[HZ - 70:HZ] * (1 - sa[:70, :, None]) + sr[:70]
    pr, pa = tiny_procession(x0, w)
    img[HZ - 50:HZ] = img[HZ - 50:HZ] * (1 - pa[:50, :, None]) + pr[:50]
    if layerA is not None:
        ra, aa = layerA
        img[280:HZ] = img[280:HZ] * (1 - aa[:HZ - 280, :, None]) + ra[:HZ - 280]
    full = np.zeros((H, w, 3), np.float32); full[:HZ] = img
    xs = np.arange(x0, x0 + w, dtype=np.float32)[:, None]
    wc = float(smoothstep(3000, 3800, x0 + w * 0.5))
    wcol = np.array([0.020, 0.050, 0.120], np.float32) * (1 - wc) + np.array([0.012, 0.050, 0.050], np.float32) * wc
    full = mirror_water(full, x0, w, wcol)
    full = add_vapour(full, x0, w)
    return np.clip(full, 0, 1).astype(np.float32)



# ===================================================================== slide 4 assembly
import boat as BT
import trees as TR


def boat_reflection(boat_rgb, boat_a, x0, w):
    """mirror of boat+girl+lantern about the waterline, ripple-sliced; returns (rgb, a) full-width, rows WL..H"""
    WL = int(BT.WATERLINE)
    nh = H - WL
    k = np.arange(nh, dtype=np.float32)
    bw = boat_a.shape[1]
    gx, _ = np.meshgrid(np.arange(bw, dtype=np.float32), np.arange(nh, dtype=np.float32))
    amp = (0.8 + 0.055 * k)[:, None]
    wave = np.sin(k[:, None] * 0.42 + fbm(BT.BX0, WL, bw, nh, 40, 2, 9, aniso=6.0) * 5) + 0.5 * np.sin(k[:, None] * 0.17 + 1.3)
    mx = gx + amp * wave
    src_y = (WL - k * 0.97 - BT.BY0)[:, None] + 0 * gx
    rr = cv2.remap(boat_rgb, mx, src_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    ra = cv2.remap(boat_a, mx, src_y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    rr = cv2.GaussianBlur(rr, (0, 0), sigmaX=2.2, sigmaY=1.4); ra = cv2.GaussianBlur(ra, (0, 0), sigmaX=2.2, sigmaY=1.4)
    fade = (0.70 * np.exp(-k / 230.0))[:, None]
    return rr * fade[..., None], ra * fade


def lantern_light(x0, w):
    """additive warm light: tight core, halo, wide scattering in the mist. returns (H,w,3)"""
    lx, ly = BT.LANTERN
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    d2 = (xs - lx) ** 2 + (ys - ly) ** 2
    g = 1.0 * np.exp(-d2 / (2 * 28.0 ** 2)) + 0.55 * np.exp(-d2 / (2 * 80.0 ** 2)) + 0.30 * np.exp(-d2 / (2 * 190.0 ** 2)) + 0.16 * np.exp(-d2 / (2 * 420.0 ** 2))
    warm = np.array([1.0, 0.66, 0.30], np.float32)
    core = np.array([1.0, 0.92, 0.70], np.float32)
    c = (g[..., None] * warm) * 0.55
    c = c + (np.exp(-d2 / (2 * 16.0 ** 2)))[..., None] * core * 0.55
    return c.astype(np.float32), g.astype(np.float32)


def lantern_mist(x0, w):
    lx, ly = BT.LANTERN
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    d2 = ((xs - lx) / 330.0) ** 2 + ((ys - ly - 40) / 240.0) ** 2
    m = np.exp(-d2) * (0.35 + 0.65 * fbm01(x0, 0, w, H, 150, 4, 91, aniso=2.0)) * 0.33
    return m.astype(np.float32)


def water_streak(x0, w, seed=5):
    """the lantern's reflection: broken dashes of warm light falling away from the hull"""
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    r = Z(seed)
    lx = BT.LANTERN[0]
    for k in range(34):
        y = BT.WATERLINE + 14 + k * 11.5 + r.uniform(-2, 2)
        if y >= H: break
        t = k / 34.0
        wd = (72 * (1 - t * .55)) * r.uniform(.45, 1.1)
        a = 0.62 * (1 - t) ** 1.2 * r.uniform(.5, 1.0)
        c.set_source_rgba(1.0, 0.72 - .25 * t, 0.30 - .15 * t, a)
        c.set_line_width(r.uniform(2.0, 4.2) * (1 + t))
        xo = r.normal(0, 4 + 14 * t)
        c.new_path(); c.move_to(lx + xo - wd / 2, y); c.line_to(lx + xo + wd / 2, y); c.stroke()
    return L.get()


def ripple_rings(x0, w, seed=8):
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    r = Z(seed)
    lx = BT.LANTERN[0]
    for i in range(330):
        y = 800 + (r.uniform(0, 1) ** 0.75) * 540
        x = r.uniform(x0, x0 + w)
        dist = (y - 783) / 560.0
        rx = r.uniform(5, 26) * (0.35 + 1.9 * dist)
        ry = rx * (0.085 + 0.12 * dist)
        warm = np.exp(-((x - lx) / 260.0) ** 2) * np.exp(-((y - BT.WATERLINE - 80) / 170.0) ** 2)
        col = (0.80 + 0.2 * warm, 0.88 - 0.1 * warm, 1.0 - 0.45 * warm)
        for ring in range(r.integers(1, 4)):
            c.set_source_rgba(*col, r.uniform(.12, .38) * (0.55 + warm)); c.set_line_width(1.1 + dist)
            c.save(); c.translate(x, y); c.scale(rx * (1 + .6 * ring), ry * (1 + .6 * ring)); c.new_path(); c.arc(0, 0, 1, 0, TAU if 'TAU' in globals() else 6.2832); c.restore(); c.stroke()
    # rings round the hull
    for k, sc in enumerate((1.0, 1.35, 1.8)):
        c.set_source_rgba(0.85, 0.9, 1.0, 0.30 - 0.08 * k); c.set_line_width(1.8)
        c.save(); c.translate(3806, BT.WATERLINE + 8); c.scale(330 * sc, 17 * sc); c.new_path(); c.arc(0, 0, 1, 0, 6.2832); c.restore(); c.stroke()
    return L.get()


def drizzle(x0, w, seed=3):
    L = Layer(w, H, x0, 0, ss=1)
    c = L.ctx
    r = Z(seed)
    for i in range(3000):
        x = r.uniform(x0 - 40, x0 + w); y = r.uniform(-40, H)
        ln = r.uniform(14, 44)
        a = r.uniform(.04, .13) * (0.55 + 0.45 * (1 - y / H))
        c.set_source_rgba(0.82, 0.92, 1.0, a); c.set_line_width(r.uniform(.8, 1.5))
        c.new_path(); c.move_to(x, y); c.line_to(x - ln * .13, y + ln); c.stroke()
    return L.get()


def star_field(x0, w, mask, seed=17):
    """real, tiny, soft stars with a few cross-spikes; only through open sky"""
    r = Z(seed)
    img = np.zeros((H, w, 3), np.float32)
    for i in range(420):
        x = int(r.uniform(0, w)); y = int(r.uniform(10, 640))
        mag = r.pareto(2.4) * 0.5 + 0.25
        b = min(1.0, mag) * (1 - y / 800.0)
        tint = np.array([0.82, 0.88, 1.0], np.float32) if r.random() < .7 else np.array([1.0, 0.88, 0.7], np.float32)
        img[y, x] += tint * b
    img = cv2.GaussianBlur(img, (0, 0), 0.9) * 5.5
    big = np.zeros((H, w, 3), np.float32)
    for i in range(34):
        x = int(r.uniform(0, w)); y = int(r.uniform(20, 520))
        big[y, x] = np.array([0.95, 0.96, 1.0], np.float32) * r.uniform(.6, 1.0)
    glow = cv2.GaussianBlur(big, (0, 0), 3.2) * 14
    cross = cv2.GaussianBlur(big, (0, 0), sigmaX=14, sigmaY=0.7) * 9 + cv2.GaussianBlur(big, (0, 0), sigmaX=0.7, sigmaY=14) * 9
    return (img + glow + cross) * mask[..., None]


def render_scene34(x0=X0, w=CW, paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    T = TR.render_trees(x0, w)
    base = render_scene3(x0, w, layerA=(T['A'][0], T['A'][1]))
    if verbose: print('base', round(time.time() - t0, 1))
    boat_rgb, boat_a = BT.render_boat()
    # lantern-lit mist over the water, boat reflection, warm streak, ripples
    img = base.copy()
    lm = lantern_mist(x0, w)
    img = img * (1 - lm[..., None]) + np.array([1.0, 0.72, 0.42], np.float32) * lm[..., None]
    rr, ra = boat_reflection(boat_rgb, boat_a, x0, w)
    WL = int(BT.WATERLINE); ox = BT.BX0 - x0
    sl = img[WL:, ox:ox + BT.BW]
    img[WL:, ox:ox + BT.BW] = sl * (1 - ra[..., None]) + rr
    sr, sa = water_streak(x0, w)
    img = img * (1 - sa[..., None]) + sr
    rg, rga = ripple_rings(x0, w)
    img = img * (1 - rga[..., None]) + rg
    # mid boughs, then the boat, then the near trunks
    rb, ab = T['B']; img = img * (1 - ab[..., None]) + rb
    oy = BT.BY0
    img[oy:oy + BT.BH, ox:ox + BT.BW] = img[oy:oy + BT.BH, ox:ox + BT.BW] * (1 - boat_a[..., None]) + boat_rgb
    rc, ac = T['C']
    mask = T['M']
    bark = TR.bark_relief(x0, w, mask)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    inner = np.clip(1 - np.abs(xs - 3800) / 560.0, 0, 1)            # trunk sides facing the lantern catch warm light
    rc = rc + (mask * np.clip(bark - 0.80, 0, 1.2) ** 1.5 * 0.040 * (0.15 + inner))[..., None] * np.array([0.85, 0.62, 0.38], np.float32)
    rc = rc + (mask * np.clip(1.15 - bark, 0, 1) * 0.02)[..., None] * np.array([0.5, 1.0, 0.4], np.float32)   # moss
    img = img * (1 - ac[..., None]) + rc
    # lantern light (additive, also rim-lights the leaves & trunks nearest it)
    gl, g = lantern_light(x0, w)
    edge = np.clip(ac - cv2.GaussianBlur(ac, (0, 0), 3.0), 0, 1)
    img = 1 - (1 - img) * (1 - np.clip(gl, 0, 1))
    img = img + (edge * g * 0.9)[..., None] * np.array([1.0, 0.6, 0.25], np.float32)
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it:
        return img
    # --- oil paint, keeping fine detail on the girl / lantern / hull / shoreline
    detail = np.zeros((H, w), np.float32)
    gx0 = 3690 - x0; detail[630:960, gx0:gx0 + 240] = 1.0
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 2.0, 0, 1)
    detail = np.clip(detail + edges, 0, 1)
    out, n = paint(img, passes=((13, 1.0, 0.0), (7.5, 1.0, 0.025), (4.2, 1.0, 0.03), (2.2, 1.1, 0.04), (1.4, 1.3, 0.06)),
                   default_flow=0.0, default_w=0.55, detail=detail, seed=7, struct_keep=0.22, verbose=verbose)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    # --- post glints (not painted): stars through open sky, rain, gold-leaf flecks near the light
    open_sky = np.clip(1 - ac - ab * 0.9, 0, 1)
    open_sky = open_sky * (1 - np.clip(img[..., 2] * 0 + 0, 0, 1))
    ys = np.arange(H, dtype=np.float32)[:, None]
    open_sky = open_sky * (ys < 680)
    st = star_field(x0, w, open_sky)
    out = 1 - (1 - out) * (1 - np.clip(st, 0, 1))
    dr, dra = drizzle(x0, w)
    out = out * (1 - dra[..., None]) + dr
    r = Z(99)
    sp = np.zeros((H, w), np.float32)
    prob = (g ** 2.4) * 0.0035
    hits = r.random((H, w)) < prob
    sp[hits] = r.uniform(.4, 1, hits.sum())
    sp = cv2.GaussianBlur(sp, (0, 0), 0.8) * 5
    out = np.clip(out + sp[..., None] * np.array([1.0, 0.82, 0.45], np.float32), 0, 1)
    return out.astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_scene34()
    print('scene34 done', round(time.time() - t, 1), 's')
    cache_save('s34', X0, img)
    preview(img, WORK + '/s34_preview.png', 2000)
    save_png(WORK + '/s34_slide3.png', img[:, 2160 - X0:3240 - X0])
    save_png(WORK + '/s34_slide4.png', img[:, 3240 - X0:4320 - X0])
