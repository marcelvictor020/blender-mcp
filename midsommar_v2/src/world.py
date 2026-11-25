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

WX0, WX1 = 2000, 12900
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
        A = amp * (0.35 + 0.65 * smoothstep(3300, 6200, xs)) * (0.55 + 0.9 * prof) * (0.35 + 0.65 * (1 - 0.9 * smoothstep(8700, 9500, xs)))
        top = HZ - A
        m = smoothstep(top - 3, top + 3, ys)
        dusk_c = np.array([0.34, 0.27, 0.52], np.float32) * ridge_c; gold_c = np.array([0.52, 0.46, 0.46], np.float32) * ridge_c
        col = dusk_c[None, None, :] * td[None, :, None] + gold_c[None, None, :] * (1 - td[None, :, None])
        hz_ = np.array([0.86, 0.66, 0.76], np.float32)[None, None, :] * td[None, :, None] + np.array([1.0, 0.82, 0.60], np.float32)[None, None, :] * (1 - td[None, :, None])
        top_l = np.clip((ys - top) / np.maximum(A, 1)[None, :], 0, 1)
        col = col * (1 - 0.35 * top_l[..., None]) * (1 - haze) + hz_ * (haze + 0.25 * top_l[..., None] * (1 - haze))
        sl = img[HZ - 160:HZ + 2]
        img[HZ - 160:HZ + 2] = sl * (1 - m[..., None]) + col * m[..., None]


def lake_mist(x0, w, h):
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    n = fbm01(x0, 0, w, h, 260, 4, 19 + 3, aniso=7.0)
    base = np.exp(-((ys - (HZ - 24)) / 70.0) ** 2) * (0.35 + 0.65 * n)
    high = np.exp(-((ys - (HZ - 160)) / 120.0) ** 2) * (0.10 + 0.50 * fbm01(x0, 0, w, h, 330, 3, 26, aniso=5.0)) * 0.55
    return np.clip(base + high, 0, 0.92)


def build(verbose=True):
    import time
    from water import mirror_water, star_field
    t0 = time.time()
    x0, w = WX0, WW
    Hm = np.maximum(SC.animal_height('bear', x0, w, HZ, 8900.0, 232.0, 470.0, seed=3), SC.animal_height('swan', x0, w, HZ, 10900.0, 300.0, 400.0, seed=5))
    inside = (Hm > 0).astype(np.float32)
    Hm = np.clip(Hm * (1 + 0.06 * fbm(x0, 0, w, HZ, 26, 3, 31)) + 0.9 * fbm(x0, 0, w, HZ, 11, 3, 32) * inside, 0, None)
    Hm = cv2.GaussianBlur(Hm, (0, 0), 2.0)
    ext_a = np.clip(Hm / 11.0, 0, 1) * 0.9
    sky, Dsky = CL.sky(x0, w, sun=SUN_G, seed=3, cov_x=cover, extra=ext_a, extra_h=Hm / 9.0, tw=dusk)
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
    layers = T2.world_forest(x0, w, seed=81)
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
    if verbose: print('shore', round(time.time() - t0, 1))
    wc = lake_colour(x0, w)
    lake = mirror_water(img, x0, w, wc, seed=17)
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


if __name__ == '__main__':
    import time
    t = time.time()
    img = build()
    cache_save('f_world', WX0, img)
    print('world', img.shape, round(time.time() - t, 1), 's')
    preview(img, WORK + '/world_preview.png', 2400)
