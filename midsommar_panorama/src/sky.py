"""One colour timeline for the sky across the whole canvas: gold day -> rose -> midnight cornflower ->
forest blue-hour -> jade dawn -> golden hour.  (x key, top, mid, horizon)"""
import numpy as np
from util import *

KEYS = [
    (0,    (0.84, 0.55, 0.20), (0.93, 0.73, 0.35), (0.98, 0.87, 0.60)),
    (700,  (0.84, 0.55, 0.20), (0.93, 0.73, 0.35), (0.98, 0.87, 0.60)),
    (1080, (0.60, 0.34, 0.44), (0.82, 0.50, 0.50), (0.95, 0.72, 0.58)),
    (1450, (0.22, 0.26, 0.55), (0.44, 0.42, 0.66), (0.88, 0.60, 0.52)),
    (1900, (0.10, 0.15, 0.42), (0.23, 0.30, 0.58), (0.82, 0.54, 0.47)),
    (3000, (0.07, 0.11, 0.32), (0.17, 0.26, 0.52), (0.72, 0.48, 0.46)),
    (3500, (0.06, 0.13, 0.24), (0.15, 0.30, 0.38), (0.62, 0.58, 0.54)),
    (4300, (0.07, 0.18, 0.26), (0.20, 0.38, 0.40), (0.68, 0.74, 0.62)),
    (5000, (0.16, 0.38, 0.48), (0.46, 0.62, 0.60), (0.88, 0.86, 0.66)),
    (5800, (0.27, 0.52, 0.66), (0.80, 0.76, 0.64), (0.99, 0.84, 0.56)),
    (6600, (0.27, 0.52, 0.66), (0.80, 0.76, 0.64), (0.99, 0.84, 0.56)),
]


def key_colors(xs):
    xs = np.asarray(xs, np.float32)
    kx = np.array([k[0] for k in KEYS], np.float32)
    out = []
    for j in (1, 2, 3):
        cols = np.array([k[j] for k in KEYS], np.float32)
        out.append(np.stack([np.interp(xs, kx, cols[:, c]) for c in range(3)], -1))
    return out


def sky_rgb(x0, w, y1=HZ, bands=0):
    """(y1, w, 3) float32 smooth sky for global columns [x0,x0+w); bands>0 quantises like painted washes"""
    xs = np.arange(x0, x0 + w)
    top, mid, hor = key_colors(xs)                                  # each (w,3)
    t = (np.arange(y1, dtype=np.float32) / HZ)[:, None]             # 0 top .. 1 horizon
    if bands:
        tb = np.floor(t * bands) / bands
        t = tb + (t - tb) * 0.18                                    # soft-edged bands
    a = smoothstep(0.0, 0.62, t)[..., None]
    b = (smoothstep(0.50, 1.0, t) ** 1.25)[..., None]
    c1 = top[None] * (1 - a) + mid[None] * a
    return (c1 * (1 - b) + hor[None] * b).astype(np.float32)
