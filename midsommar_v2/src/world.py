"""The WORLD LAKE: one continuous sky + far shore + mirrored water for x = 4000 .. 12900, built once and sliced by the pond, the flow stage and the
garden. Because the three stages share these pixels, the sky never changes between slides - it only turns from dusk (indigo / rose / lilac, first
stars) into the golden hour of the garden, with the sun going down at x = 7330, one whole disc, and the same islands drifting past.
"""
import math
import numpy as np
import cv2
from util import *
import clouds3 as CL
import trees2 as T2
import sculpt as SC
import water as W
from shared import RIBBON, ribbon_thick, FACE
from folk import ribbon_puffs
from garden import SUN_G, mist, glitter, lake_y
import cairo
BASE_Y_FRAC = 0.985

WX0, WX1 = 2000, 12900 + SHIFT
WW = WX1 - WX0


def dusk(xs):
    return smoothstep(7000, 5200, xs)


def cover(xs):
    return 0.34 + 0.26 * smoothstep(7300, 9200, xs) + 0.24 * smoothstep(6700, 4800, xs)


def lake_colour(x0, w):
    xs = np.arange(x0, x0 + w, dtype=np.float32)
    k = smoothstep(4600, 7300, xs)[:, None]
    a = np.array([0.035, 0.085, 0.190], np.float32)                   # indigo-teal of the dusk lake
    b = np.array([0.075, 0.175, 0.215], np.float32)                   # green-teal of the golden-hour lake
    return (a * (1 - k) + b * k)[None, :, :]


def far_lights(img, x0, rng):
    """a few tiny warm windows / lanterns on the far shore: the life in the distance (and, mirrored, their streaks on the water)"""
    H_, W_ = img.shape[:2]
    for x in np.concatenate([rng.uniform(4300, 7000, 26), rng.uniform(7000, 8300, 6)]):
        s = rng.uniform(0.9, 2.0); y = HZ - rng.uniform(0.5, 2.5)
        r = int(s * 9) + 2
        xi, yi = int(x - x0), int(y)
        if xi - r < 0 or xi + r + 1 > W_: continue
        X, Y = np.meshgrid(np.arange(xi - r, xi + r + 1) - (x - x0), np.arange(yi - r, yi + r + 1) - y)
        g = (np.exp(-(X * X + Y * Y) / (2 * (s * 0.8) ** 2)) + 0.28 * np.exp(-(X * X + Y * Y) / (2 * (s * 3.0) ** 2))) * float(dusk(np.array([x]))[0]) * rng.uniform(0.5, 1.0)
        img[yi - r:yi + r + 1, xi - r:xi + r + 1] = 1 - (1 - img[yi - r:yi + r + 1, xi - r:xi + r + 1]) * (1 - np.clip(g[..., None] * np.array([1.0, 0.74, 0.38], np.float32), 0, 1))


def hills_(img, x0, w):
    """two tiers of soft violet / gold hills behind the treeline: the far side of the lake has a landscape, not a line"""
    xs = np.arange(x0, x0 + w, dtype=np.float32)
    ys = np.arange(HZ - 160, HZ + 2, dtype=np.float32)[:, None]
    td = dusk(xs)
    for (amp, sc, seed, haze, ridge_c) in ((95.0, 520, 61, 0.55, 1.0), (55.0, 300, 62, 0.34, 0.8)):
        prof = fbm01(x0, 0, w, 1, sc, 4, seed, aniso=3.0)[0]
        A = amp * (0.35 + 0.65 * smoothstep(3300, 6200, xs)) * (0.55 + 0.9 * prof) * (0.35 + 0.65 * (1 - 0.9 * smoothstep(8700, 9500, xs))) * (1 - 0.85 * np.exp(-((xs - 7330.0) / 760.0) ** 2))   # the low hills part for the sun
        top = HZ - A
        m = smoothstep(top - 3, top + 3, ys)
        dusk_c = np.array([0.34, 0.27, 0.52], np.float32) * ridge_c; gold_c = np.array([0.52, 0.46, 0.46], np.float32) * ridge_c
        col = dusk_c[None, None, :] * td[None, :, None] + gold_c[None, None, :] * (1 - td[None, :, None])
        hz_ = np.array([0.86, 0.66, 0.76], np.float32)[None, None, :] * td[None, :, None] + np.array([1.0, 0.82, 0.60], np.float32)[None, None, :] * (1 - td[None, :, None])
        top_l = np.clip((ys - top) / np.maximum(A, 1)[None, :], 0, 1)
        col = col * (1 - 0.35 * top_l[..., None]) * (1 - haze) + hz_ * (haze + 0.25 * top_l[..., None] * (1 - haze))
        sl = img[HZ - 160:HZ + 2]
        img[HZ - 160:HZ + 2] = sl * (1 - m[..., None]) + col * m[..., None]


def far_island_house(img, x0, w):
    """a low island at the sun's own place with the yellow A-frame standing on it, seen from across the lake: against the sun its face is in shade, so it is a
    dark violet shape with glowing windows and a gold rim along the roof; two firs and a birch stand beside it. The lake mirrors all of it."""
    import house as HS
    from trees2 import conifer, birch, deciduous, CONIF, BIRCHP, DECID
    cx = 7330.0
    s = 0.235
    rgb, a = HS.render_house(HS.BX0, HS.WL)
    rgb = rgb[HS.BY0:HS.BY1]; a = a[HS.BY0:HS.BY1]
    h0, w0 = a.shape
    nw, nh = int(round(w0 * s)), int(round(h0 * s))
    rgb = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA); a = cv2.resize(a, (nw, nh), interpolation=cv2.INTER_AREA)
    base_y = HZ + 8
    # the island: a low mound with reeds, the same colours as the far shore
    L = Layer(w, 120, x0, HZ - 60, 3)
    c = L.ctx
    rng = np.random.default_rng(71)
    xs = np.linspace(cx - 230, cx + 230, 70)
    top = base_y - 9 * np.sin(np.linspace(0, math.pi, 70)) ** 0.7 - 1.2 * np.sin(xs * 0.2)
    c.new_path(); c.move_to(xs[0], base_y + 6)
    for x_, y_ in zip(xs, top): c.line_to(float(x_), float(y_))
    c.line_to(xs[-1], base_y + 6); c.close_path()
    g_ = cairo.LinearGradient(0, base_y - 10, 0, base_y + 6); g_.add_color_stop_rgb(0, 0.42, 0.40, 0.30); g_.add_color_stop_rgb(1, 0.18, 0.20, 0.16)
    c.set_source(g_); c.fill()
    for (tx, th, kind) in ((cx - 170, 84, 'c'), (cx - 140, 62, 'c'), (cx - 198, 50, 'c'), (cx + 150, 90, 'b'), (cx + 182, 66, 'c'), (cx + 122, 54, 'd')):
        hz = (0.66, 0.50, 0.70)
        yb = float(np.interp(tx, xs, top)) + 2
        if kind == 'c': conifer(c, tx, yb, th, rng, CONIF, 0.46, hz, density=0.8)
        elif kind == 'b': birch(c, tx, yb, th, rng, BIRCHP, 0.46, hz, density=0.8)
        else: deciduous(c, tx, yb, th, rng, DECID, 0.46, hz, density=0.8)
    lr, la = L.get()
    img[HZ - 60:HZ + 60] = img[HZ - 60:HZ + 60] * (1 - la[..., None]) + lr
    # the house: shade side toward us, violet; lit windows glow; a gold rim where the sun grazes the roof
    lum = rgb.mean(-1) / np.maximum(a, 1e-3)
    warm = (rgb[..., 0] - rgb[..., 2]) / np.maximum(a, 1e-3)
    win = np.clip((lum - 0.62) * 4.0, 0, 1) * np.clip(warm * 3.0, 0, 1) * (a > 0.8)
    body = rgb * 0.50 + np.array([0.20, 0.10, 0.16], np.float32)[None, None, :] * a[..., None] * 0.55
    col = body * (1 - win[..., None]) + rgb * 1.15 * win[..., None]
    rim = np.clip(a - cv2.GaussianBlur(a, (0, 0), 2.4), 0, 1) * 3.0
    col = col + rim[..., None] * np.array([1.0, 0.82, 0.48], np.float32) * 1.0
    # lit windows: warm squares with a soft glow (positions are the real ones of the house)
    Ld = Layer(HS.WL, HS.HL, HS.BX0, HS.BY0, 1)
    placed = HS.windows(Ld.ctx, np.random.default_rng(73))
    rw = np.random.default_rng(9)
    glow = np.zeros((nh, nw), np.float32)
    for (xx, yy) in placed:
        if rw.random() < 0.38: continue
        gx_, gy_ = (xx - HS.BX0) * s, (yy - HS.BY0) * s
        X, Y = np.meshgrid(np.arange(nw, dtype=np.float32) - gx_, np.arange(nh, dtype=np.float32) - gy_)
        glow += np.exp(-(X * X / 5.0 + Y * Y / 8.0))
    col = col + np.clip(glow, 0, 1)[..., None] * np.array([1.0, 0.80, 0.42], np.float32) * 1.1 * a[..., None]
    col = col * (1 - 0.14) + 0.14 * np.array([0.90, 0.68, 0.58], np.float32)[None, None, :] * a[..., None]            # haze
    x_a = int(round(cx - nw / 2 - x0)); y_a = int(round(base_y - nh * (BASE_Y_FRAC)))
    xa, xb = max(0, x_a), min(w, x_a + nw)
    ya, yb = y_a, y_a + nh
    sub = img[ya:yb, xa:xb]
    am = a[:, xa - x_a:xb - x_a][..., None]
    img[ya:yb, xa:xb] = sub * (1 - am) + col[:, xa - x_a:xb - x_a]
    return img



def lake_mist(x0, w, h):
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    n = fbm01(x0, 0, w, h, 260, 4, 19 + 3, aniso=7.0)
    base = np.exp(-((ys - (HZ - 24)) / 70.0) ** 2) * (0.35 + 0.65 * n)
    high = np.exp(-((ys - (HZ - 160)) / 120.0) ** 2) * (0.10 + 0.50 * fbm01(x0, 0, w, h, 330, 3, 26, aniso=5.0)) * 0.55
    return np.clip(base + high, 0, 0.92)


def build_chunk(x0, w, forest_seed=81, verbose=True, skip=None):
    import time
    from water import mirror_water, star_field
    t0 = time.time()
    Hm = np.maximum(SC.animal_height('bear', x0, w, HZ, 8900.0, 232.0, 470.0, seed=3), SC.animal_height('swan', x0, w, HZ, 10900.0, 300.0, 400.0, seed=5))
    inside = (Hm > 0).astype(np.float32)
    Hm = np.clip(Hm * (1 + 0.06 * fbm(x0, 0, w, HZ, 26, 3, 31)) + 0.9 * fbm(x0, 0, w, HZ, 11, 3, 32) * inside, 0, None)
    Hm = cv2.GaussianBlur(Hm, (0, 0), 2.0)
    ext_a = np.clip(Hm / 11.0, 0, 1) * 0.9
    sky, Dsky = CL.sky(x0, w, sun=SUN_G, seed=3, cov_x=cover, extra=ext_a, extra_h=Hm / 9.0, tw=dusk, disc_on=True)
    if verbose: print('world sky', round(time.time() - t0, 1))
    ys_ = np.arange(HZ, dtype=np.float32)[:, None]; xs_ = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    mx, my, mr = 7080.0, 250.0, 84.0                                                  # the day-moon of slide 2, still up, pale in the blue
    cres = np.clip(1 - np.hypot(xs_ - mx, ys_ - my) / mr, 0, 1) * (np.hypot(xs_ - mx - 0.34 * mr, ys_ - my + 0.06 * mr) > 0.86 * mr)
    cres = np.clip(cv2.GaussianBlur(cres.astype(np.float32), (0, 0), 1.4) * 6.0, 0, 1) * 0.55 * (1 - smoothstep(7200, 7500, xs_)) * (1 - 0.9 * (1 - np.exp(-2.4 * Dsky)))
    sky = sky * (1 - cres[..., None]) + np.array([0.96, 0.94, 0.90], np.float32) * cres[..., None]
    # first stars through the open dusk sky (and, because they are painted before the mirror, faintly on the lake)
    lum = sky.mean(-1)
    open_ = np.clip(1 - 2.6 * Dsky, 0, 1) * np.clip((0.50 - lum) / 0.30, 0, 1) * (ys_ < 640) * dusk(xs_)
    full0 = np.zeros((H, w, 3), np.float32); full0[:HZ] = sky
    st = star_field(x0, w, np.pad(open_, ((0, H - HZ), (0, 0))).astype(np.float32), seed=29)
    sky = 1 - (1 - sky) * (1 - np.clip(st[:HZ] * 0.9, 0, 1))
    # the sleeping woman and her breath (the folk cloud made real), painted with the pond's pearl-and-rose cloud shading
    W._PUFFS = ribbon_puffs(RIBBON, ribbon_thick, seed=7, puff=0.55)[0]
    W.EXTRA_HEIGHT = lambda x0_, w_, h_: SC.face_height(x0_, w_, h_, FACE['cx'], FACE['cy'], FACE['S'])
    sky, _ = W.add_ribbon_cloud(sky, x0, w)
    img = np.zeros((H, w, 3), np.float32)
    img[:HZ] = sky
    hills_(img, x0, w)
    layers = T2.world_forest(x0, w, seed=forest_seed, skip=skip if skip is not None else None)
    if verbose: print('world forest', round(time.time() - t0, 1))
    mst = lake_mist(x0, w, HZ + 60)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    tdusk = dusk(xs)
    hz_c = (np.array([1.0, 0.84, 0.60], np.float32)[None, None, :] * (1 - tdusk[..., None]) + np.array([0.80, 0.62, 0.78], np.float32)[None, None, :] * tdusk[..., None])
    for li, (rgb, a) in enumerate(layers):
        sl = img[HZ - 520:HZ + 60]
        img[HZ - 520:HZ + 60] = sl * (1 - a[..., None]) + rgb
        m = mst[HZ - 520:HZ + 60] * (0.34 + 0.24 * li)
        img[HZ - 520:HZ + 60] = img[HZ - 520:HZ + 60] * (1 - m[..., None]) + hz_c * m[..., None] * 0.95
    far_lights(img, x0, np.random.default_rng(5))
    if x0 < 7330 < x0 + w: far_island_house(img, x0, w)
    if verbose: print('shore', round(time.time() - t0, 1))
    wc = lake_colour(x0, w)
    lake = mirror_water(img, x0, w, wc, seed=17)
    lake[HZ:] = lake[HZ:] * 0.88                                           # water is almost always darker than the sky it mirrors
    # soft mist lying on the water in the dusk part, pearl-coloured; a glint path under the sun
    ysf = np.arange(H, dtype=np.float32)[:, None]
    low = np.exp(-((ysf - (HZ + 70)) / 110.0) ** 2) * (0.18 + 0.82 * fbm01(x0, 0, w, H, 200, 4, 71, aniso=6.0)) * (0.34 * tdusk + 0.16 * (1 - tdusk))
    col = np.array([0.70, 0.60, 0.80], np.float32) * tdusk[..., None] + np.array([0.98, 0.86, 0.66], np.float32) * (1 - tdusk[..., None])
    lake[HZ:] = lake[HZ:] * (1 - low[HZ:, :, None]) + col * low[HZ:, :, None]
    gr_, ga_ = glitter(x0, w)
    lake = 1 - (1 - lake) * (1 - np.clip(gr_ * ga_[..., None] * 1.0, 0, 1))
    lake[:HZ] = img[:HZ]
    if verbose: print('world done', round(time.time() - t0, 1))
    return np.clip(lake, 0, 1).astype(np.float32)


def build(verbose=True):
    """chunk A is the 16-slide world (2000..12900) with a clearing cut into its forest from 12560; chunk B (12500..13980) is a new forest that starts
    after 12700; the join is a hard cut at 12620, inside the clearing - sky, mist and water are global fields, so nothing shows"""
    CUT = 12620
    A = build_chunk(2000, 10900, 81, verbose, skip=(12420, 1e9))
    B = build_chunk(12500, WX1 - 12500, 83, verbose, skip=(-1e9, 12830))
    out = np.zeros((H, WW, 3), np.float32)
    out[:, :CUT - 2000] = A[:, :CUT - 2000]
    out[:, CUT - 2000:] = B[:, CUT - 12500:]
    return out


if __name__ == '__main__':
    import time
    t = time.time()
    img = build()
    cache_save('f_world', WX0, img)
    print('world', img.shape, round(time.time() - t, 1), 's')
    preview(img, WORK + '/world_preview.png', 2400)
