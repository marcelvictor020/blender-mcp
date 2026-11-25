"""Real skies: a colour-keyed twilight -> sunset gradient and layered volumetric clouds lit by a low sun.

Clouds are density fields (cumulus bank with flat bottoms, altocumulus rows, sheared cirrus, plus any sculpted animals/faces you hand in).
Light is marched through the density toward the sun (self-shadowing -> dark bellies, bright shoulders), then coloured by altitude: low clouds
orange, middle clouds salmon/pink, high clouds lilac/blue in shadow; undersides pick up warm bounce; silver linings; god-rays; sun disc.
"""
import math
import numpy as np
import cv2
from util import *

PAL_KEYS = [
    (2000, [(0, (0.06, 0.09, 0.30)), (300, (0.20, 0.20, 0.50)), (520, (0.62, 0.36, 0.58)), (680, (0.98, 0.55, 0.44)), (783, (1.0, 0.74, 0.46))]),
    (3600, [(0, (0.07, 0.11, 0.32)), (300, (0.20, 0.22, 0.52)), (520, (0.60, 0.40, 0.62)), (680, (0.96, 0.58, 0.50)), (783, (1.0, 0.76, 0.52))]),
    (5200, [(0, (0.10, 0.16, 0.40)), (300, (0.30, 0.33, 0.62)), (520, (0.74, 0.50, 0.66)), (680, (0.99, 0.68, 0.50)), (783, (1.0, 0.82, 0.55))]),
    (7000, [(0, (0.16, 0.30, 0.58)), (300, (0.38, 0.52, 0.76)), (520, (0.88, 0.68, 0.70)), (680, (1.0, 0.73, 0.42)), (783, (1.0, 0.85, 0.52))]),
    (8800, [(0, (0.21, 0.33, 0.58)), (300, (0.43, 0.52, 0.74)), (520, (0.80, 0.64, 0.72)), (680, (0.99, 0.69, 0.47)), (783, (1.0, 0.83, 0.55))]),
    (13000, [(0, (0.21, 0.33, 0.58)), (300, (0.43, 0.52, 0.74)), (520, (0.80, 0.64, 0.72)), (680, (0.99, 0.69, 0.47)), (783, (1.0, 0.83, 0.55))]),
]


def _shift(img, dx, dy):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(img, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def gradient(x0, w, h=HZ):
    """(h,w,3) sky gradient, interpolated between colour keys along x"""
    ys = np.arange(h, dtype=np.float32)
    cols = []
    for (kx, stops) in PAL_KEYS:
        sy = [s[0] for s in stops]; sc = np.array([s[1] for s in stops], np.float32)
        cols.append(np.stack([np.interp(ys, sy, sc[:, k]) for k in range(3)], -1))
    kx = np.array([k[0] for k in PAL_KEYS], np.float32)
    xs = np.arange(x0, x0 + w, dtype=np.float32)
    out = np.zeros((h, w, 3), np.float32)
    for i, col in enumerate(cols):
        wt = np.zeros(w, np.float32)
        if i > 0:
            m = (xs >= kx[i - 1]) & (xs <= kx[i]); wt[m] = (xs[m] - kx[i - 1]) / (kx[i] - kx[i - 1])
        if i < len(cols) - 1:
            m = (xs >= kx[i]) & (xs <= kx[i + 1]); wt[m] = 1 - (xs[m] - kx[i]) / (kx[i + 1] - kx[i])
        wt[(i == 0) & (xs < kx[0])] = 1.0
        wt[(i == len(cols) - 1) & (xs > kx[-1])] = 1.0
        out += col[:, None, :] * wt[None, :, None]
    return out


def density(x0, w, h, seed, cov_x, extra=None, extra_h=None):
    """cloud opacity-density D in [0,1] (soft edges) and an UNSATURATED height field Hh (keeps lumpy detail inside thick cloud)"""
    y = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)
    cx = cov_x(xs)[None, :]
    D = np.zeros((h, w), np.float32)
    Hh = np.zeros((h, w), np.float32)

    def layer(f, t, soft, mask):
        u = np.clip((f - t) / soft, 0, 2.6)
        d = (u * u * (3 - 2 * np.clip(u, 0, 1))) * mask
        return np.clip(d, 0, 1), u * mask

    # --- cumulus bank: flat ragged bottoms, cauliflower tops
    prof = np.exp(-((y - 585) / 185.0) ** 2)
    base = fbm01(x0, 0, w, h, 330, 5, seed + 1, aniso=1.8)
    det = fbm01(x0, 0, w, h, 58, 4, seed + 2, aniso=1.25)
    fine = fbm01(x0, 0, w, h, 17, 3, seed + 5, aniso=1.1)
    bil = 1 - np.abs(fbm(x0, 0, w, h, 105, 4, seed + 3, aniso=1.4) * 1.7)
    f = 0.46 * base + 0.22 * det + 0.22 * np.clip(bil, 0, 1) + 0.10 * fine
    cov = np.clip(cx * prof * 1.25, 0, 1.4)
    ybot = 742 + 22 * fbm(x0, 0, w, 1, 90, 2, seed + 4)[0][None, :] + 6 * fbm(x0, 0, w, 1, 22, 2, seed + 6)[0][None, :]
    mask = smoothstep(ybot + 26, ybot - 6, y)
    d1, h1 = layer(f, 0.70 - 0.40 * cov, 0.34, mask)
    D, Hh = np.maximum(D, d1), np.maximum(Hh, h1)
    # --- altocumulus: long rows of soft puffs
    prof2 = np.exp(-((y - 345) / 100.0) ** 2)
    b2 = fbm01(x0, 0, w, h, 210, 4, seed + 11, aniso=5.0)
    d2f = fbm01(x0, 0, w, h, 30, 3, seed + 12, aniso=1.7)
    f2 = 0.60 * b2 + 0.40 * d2f
    cov2 = np.clip(cx * prof2 * 0.9, 0, 1.2)
    d2, h2 = layer(f2, 0.66 - 0.34 * cov2, 0.30, np.float32(0.82))
    D, Hh = np.maximum(D, d2), np.maximum(Hh, h2 * 0.8)
    # --- sheared cirrus, thin and wispy
    prof3 = np.exp(-((y - 150) / 115.0) ** 2)
    b3 = fbm01(x0, 0, w, h, 230, 4, seed + 21, aniso=9.0)
    gy_, gx_ = np.mgrid[0:h, 0:w].astype(np.float32)
    b3 = cv2.remap(b3, gx_ + y * 0.55, gy_, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    d3, h3 = layer(b3, 0.60 - 0.30 * cx * prof3, 0.34, np.float32(0.50))
    D, Hh = np.maximum(D, d3), np.maximum(Hh, h3 * 0.4)
    if extra is not None:
        D = np.maximum(D, extra)
        Hh = np.maximum(Hh, extra_h if extra_h is not None else extra * 2.0)
    return np.clip(D, 0, 1), Hh


def _tw(tw, xs):
    return np.zeros(xs.shape, np.float32) if tw is None else np.asarray(tw(xs), np.float32)


def sun_overlay(img, x0, sun, h=HZ):
    """re-draw the sun disc over a finished image (after mist and trees, so haze never dulls it); modifies rows [0,h) of img in place"""
    sx, sy = sun
    ys = np.arange(h, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + img.shape[1], dtype=np.float32)[None, :]
    sd = np.hypot(xs - sx, ys - sy)
    disc = smoothstep(52.0, 46.0, sd)
    limb = 1.0 - 0.07 * smoothstep(0.0, 52.0, sd)
    t_ = smoothstep(0.0, 52.0, sd)[..., None]
    core = (np.array([1.0, 0.99, 0.90], np.float32) * (1 - t_) + np.array([1.0, 0.84, 0.46], np.float32) * t_) * limb[..., None]
    bloom = np.exp(-(np.clip(sd - 46.0, 0, None) / 30.0) ** 1.4) * 0.40 * (sd >= 46.0)
    img[:h] = img[:h] + bloom[..., None] * np.array([1.0, 0.88, 0.62], np.float32) * (1 - disc[..., None])
    img[:h] = img[:h] * (1 - disc[..., None]) + core * disc[..., None]
    return img


def sky(x0, w, sun=(7330.0, 766.0), seed=3, cov_x=None, extra=None, extra_h=None, rays=1.0, strength=1.0, sun_vis=1.0, h=HZ, tw=None, disc_on=True):
    """full sky rows [0,h) for global columns [x0,x0+w). The light is a point-source at the sun: clouds left of it are lit from the right and
    vice-versa. `tw(xs)` in [0,1] mixes toward a dusk palette (rose / lilac lit sides, indigo shadows) for the pond's evening."""
    cov_x = cov_x or (lambda xs: np.full(xs.shape, 0.8, np.float32))
    bg = gradient(x0, w, h)
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    twv = _tw(tw, xs)                                                          # (1,w)
    sx, sy = sun
    d = np.hypot(xs - sx, (ys - sy) * 1.15)
    glow = (np.exp(-(d / 760.0) ** 1.4) * 0.52 + np.exp(-(d / 190.0) ** 1.3) * 0.9) * sun_vis
    bg = bg + glow[..., None] * np.array([1.0, 0.66, 0.30], np.float32) * 0.62 * strength
    # afterglow along the horizon in the dusk part (the sun has only just gone: a long rose / apricot band)
    ag = np.exp(-((ys - (h - 6)) / 78.0) ** 2) * twv * (0.30 + 0.20 * fbm01(x0, 0, w, h, 320, 3, seed + 90, aniso=5.0))
    bg = bg + ag[..., None] * np.array([1.0, 0.52, 0.30], np.float32)
    D, Hh = density(x0, w, h, seed, cov_x, extra, extra_h)
    D = cv2.GaussianBlur(D, (0, 0), 1.1)
    Dn, _ = density(x0, w, h, seed, cov_x, None, None) if extra is not None else (D, Hh)
    xmask = np.clip(extra, 0, 1) if extra is not None else np.zeros_like(D)
    Dm = cv2.GaussianBlur(np.maximum(Dn, 0.28 * xmask), (0, 0), 3.0)
    N, step = 26, 13.0
    accR = np.zeros_like(D); accL = np.zeros_like(D)
    for i in range(1, N + 1):
        accR += _shift(Dm, -i * step * 0.98, -i * step * 0.20)                   # marching toward a sun on the right (+x)
        accL += _shift(Dm, i * step * 0.98, -i * step * 0.20)                    # ... or on the left (-x)
    mR = smoothstep(sx + 420, sx - 420, xs)
    acc = accR * mR + accL * (1 - mR)
    T = np.exp(-0.075 * acc)
    g = cv2.GaussianBlur(Hh, (0, 0), 2.4) * (5.0 * (1 - 0.92 * twv))
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    n = np.stack([-gx, -gy, np.ones_like(gx) * 1.0], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    lx = 0.84 * np.tanh((sx - xs) / 520.0) * np.ones_like(D)
    Lv = np.stack([lx, np.full_like(D, 0.18), np.full_like(D, 0.50)], -1)
    Lv /= np.linalg.norm(Lv, axis=-1, keepdims=True)
    diff = np.clip((n * Lv).sum(-1), 0, 1)
    core = np.exp(-0.45 * np.clip(Hh, 0, 3))
    b = np.clip(0.10 + 0.64 * T + 0.24 * diff * (0.55 + 0.45 * T) + 0.08 * core + 0.30 * cv2.GaussianBlur(xmask, (0, 0), 2.0), 0, 1.2)
    a = np.clip((h - ys) / h, 0, 1)                                         # 0 at the horizon .. 1 at the zenith
    ak = np.array([0.0, 0.30, 0.62, 1.0], np.float32)
    def prof(vals):
        return np.stack([np.interp(a[:, 0], ak, v)[:, None] * np.ones((1, w), np.float32) for v in vals], -1)
    lit = prof(([1.00, 1.00, 0.98, 0.90], [0.58, 0.70, 0.78, 0.80], [0.26, 0.50, 0.76, 0.92]))
    shd = prof(([0.52, 0.42, 0.32, 0.26], [0.28, 0.30, 0.34, 0.34], [0.36, 0.48, 0.58, 0.60]))
    lit_d = prof(([0.99, 0.80, 0.62, 0.48], [0.66, 0.60, 0.66, 0.54], [0.58, 0.70, 0.90, 0.92]))        # dusk: apricot -> rose -> lilac -> cornflower
    shd_d = prof(([0.52, 0.36, 0.36, 0.22], [0.26, 0.22, 0.28, 0.20], [0.46, 0.54, 0.68, 0.52]))        # dusk shadows: plum -> indigo
    t3 = twv[..., None]
    lit = lit * (1 - t3) + lit_d * t3
    shd = shd * (1 - t3) + shd_d * t3
    far = (0.55 + 0.45 * np.exp(-np.abs(xs - sx) / 3400.0))[..., None]
    lit = lit * far
    bb = np.clip(b, 0, 1)[..., None]
    col = shd * (1 - bb) + lit * bb
    col = col + np.clip(b - 1.0, 0, 0.3)[..., None] * 0.9
    under = np.clip(cv2.GaussianBlur(D, (0, 0), 3.0) - _shift(cv2.GaussianBlur(D, (0, 0), 3.0), 0, -30), 0, 1)
    under_c = np.array([0.60, 0.26, 0.06], np.float32) * (1 - t3) + np.array([0.95, 0.40, 0.34], np.float32) * t3
    col = col + under[..., None] * under_c * (0.35 + 0.65 * (1 - a))[..., None]
    edge = np.clip(1.0 - np.clip(Hh, 0, 1.0), 0, 1) * (1 - np.exp(-6.0 * D)) * diff
    edge_c = np.array([1.0, 0.84, 0.58], np.float32) * (1 - t3) + np.array([1.0, 0.80, 0.84], np.float32) * t3
    col = col + (edge * np.exp(-np.abs(xs - sx) / 2000.0) * 0.30 * (1 - 0.65 * twv))[..., None] * edge_c
    A = 1 - np.exp(-2.4 * D)
    img = bg * (1 - A[..., None]) + col * A[..., None]
    # god rays through the gaps
    if rays > 0:
        th = np.arctan2(ys - sy, xs - sx)
        rng = np.random.default_rng(seed + 55)
        arr = rng.random(900).astype(np.float32)
        arr = np.convolve(np.concatenate([arr, arr[:8]]), np.ones(5, np.float32) / 5, 'same')[:900]
        idx = ((th + math.pi) / (2 * math.pi)) * 899
        rr = np.interp(idx.ravel(), np.arange(900), arr).reshape(th.shape)
        ray = cv2.GaussianBlur(np.clip((rr - 0.42) * 3.2, 0, 1) ** 1.4, (0, 0), 1.6) * np.exp(-d / 2800.0)
        ray = ray * (1 - 0.88 * A) * smoothstep(40, 180, d) * rays
        img = img + ray[..., None] * np.array([1.0, 0.80, 0.50], np.float32) * 0.22 * strength
    # the sun itself: a whole disc with a soft limb, a pale halo and a faint ring (as seen through high haze). disc_on=False leaves the disc to be
    # drawn last (sun_overlay) so that nothing which moves the sky around - the sideways drag, haze - can bend it.
    sd = np.hypot(xs - sx, ys - sy)
    if disc_on:
        disc = smoothstep(52.0, 46.0, sd) * sun_vis
        halo = np.exp(-(np.clip(sd - 46.0, 0, None) / 38.0) ** 1.4) * 0.55 * sun_vis * (sd >= 46.0)
        ring = np.exp(-((sd - 118.0) / 7.0) ** 2) * 0.11 * sun_vis
        limb = 1.0 - 0.10 * smoothstep(0.0, 52.0, sd)
        img = img + (halo + ring)[..., None] * np.array([1.0, 0.86, 0.60], np.float32) * (1 - disc[..., None])
        img = img * (1 - disc[..., None] * 0.97) + (np.array([1.0, 0.96, 0.80], np.float32) * limb[..., None]) * disc[..., None] * 0.97
    else:
        halo = np.exp(-(np.clip(sd - 46.0, 0, None) / 38.0) ** 1.4) * 0.55 * sun_vis
        ring = np.exp(-((sd - 118.0) / 7.0) ** 2) * 0.11 * sun_vis
        img = img + (halo + ring)[..., None] * np.array([1.0, 0.86, 0.60], np.float32)
    return np.clip(img, 0, 1).astype(np.float32), D


if __name__ == '__main__':
    import time
    t = time.time()
    x0, w = 6800, 3000
    img, D = sky(x0, w, cov_x=lambda xs: 0.85 * smoothstep(5500, 7500, xs) + 0.12)
    print('sky', img.shape, round(time.time() - t, 1), 's')
    save_png(WORK + '/sky_test.png', cv2.resize(np.concatenate([img, np.zeros((H - HZ, w, 3), np.float32)], 0), None, fx=0.66, fy=0.66, interpolation=cv2.INTER_AREA)[:560])
