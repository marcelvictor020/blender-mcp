"""Sideways, line-by-line scene blending ("wet paint dragged across the board").

smear_blend() joins two aligned images A (left) and B (right). Every ROW has its own boundary and its own softness, so
the join is a staggered comb of horizontal streaks rather than a clean crossfade; colours from each side are dragged into the
other along the row (horizontal motion blur that grows toward the boundary); the boundary wanders with row-coherent noise.
"""
import numpy as np
import cv2
from util import *


def row_noise(h, cell, seed, octaves=3):
    """smooth 1-D noise along the rows, roughly in [-1, 1]"""
    return fbm(seed * 131 % 9973, 0, 1, h, cell, octaves, seed)[:, 0] * 1.9


def smear_blend(A, B, xs0, xc, width, seed=1, amp=170.0, streak=420.0, drag=0.6):
    h, w = A.shape[:2]
    X = (np.arange(w, dtype=np.float32) + xs0)[None, :]
    n_c = row_noise(h, 130, seed)
    n_m = row_noise(h, 34, seed + 5)
    n_f = row_noise(h, 6, seed + 9)
    b = xc + amp * (0.80 * n_c + 0.40 * n_m + 0.16 * n_f)                      # per-row boundary (canvas x)
    soft = np.clip(0.55 + 0.45 * row_noise(h, 22, seed + 3), 0.12, 1.0)         # per-row softness
    hw = (width * 0.5) * soft
    b, hw = b[:, None], hw[:, None]
    m = smoothstep(b - hw, b + hw, X)
    # streaks: horizontal blur that grows toward the boundary, longer on some rows than others
    sa = np.clip(1.0 - np.abs(X - b) / (hw * 2.4 + 40.0), 0, 1) * np.clip(0.45 + 0.55 * (0.5 + 0.5 * row_noise(h, 16, seed + 7)), 0, 1)[:, None]
    lens = [1, int(streak * 0.10) | 1, int(streak * 0.32) | 1, int(streak) | 1]
    t = np.clip(sa * 3.0, 0, 3.0)

    def smeared(img):
        levels = [img] + [cv2.blur(img, (k, 1)) for k in lens[1:]]
        out = np.zeros_like(img)
        for j, lv in enumerate(levels):
            wj = np.clip(1 - np.abs(t - j), 0, 1)
            out += lv * wj[..., None]
        return out

    As, Bs = smeared(A), smeared(B)
    # a little real dragging: shift the sampled columns along the row toward the other scene
    if drag > 0:
        d = (sa * 70.0 * drag * (0.4 + 0.6 * (0.5 + 0.5 * row_noise(h, 9, seed + 11))[:, None])).astype(np.float32)
        gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        As = cv2.remap(As, gx - d * (1 - m), gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        Bs = cv2.remap(Bs, gx + d * m, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return As * (1 - m[..., None]) + Bs * m[..., None]


def stagger_blend(A, B, xs0, xc, width, seed=1, amp=200.0, soft_min=0.10, fine=1.0):
    """Line-by-line sideways blend that PRESERVES detail. Every scanline has its own changeover x (a comb of horizontal steps: large
    swells + mid ripples + a 2-3 px scanline jitter) and its own softness; nothing is blurred or dragged, so every object in A and B
    stays crisp on its own side and the two renderings of the same thing interleave row by row in the zone between."""
    h, w = A.shape[:2]
    X = (np.arange(w, dtype=np.float32) + xs0)[None, :]
    n = (0.80 * row_noise(h, 150, seed) + 0.50 * row_noise(h, 44, seed + 5) + 0.30 * row_noise(h, 11, seed + 9)
         + 0.20 * fine * row_noise(h, 3, seed + 13))
    b = (xc + amp * n)[:, None]
    soft = np.clip(0.55 + 0.45 * row_noise(h, 22, seed + 3), soft_min, 1.0)
    hw = (0.5 * width * soft)[:, None]
    m = smoothstep(b - hw, b + hw, X)
    e = 60.0                                                       # whatever the row noise does, the zone starts as pure A and ends as pure B (no hard edge at its borders)
    m = m * smoothstep(xs0, xs0 + e, X)
    m = 1 - (1 - m) * smoothstep(xs0 + w, xs0 + w - e, X)
    return A * (1 - m[..., None]) + B * m[..., None]


def lowfreq_match(A, B, xs0, xa, xb, sigma=70.0, strength=0.9):
    """pull A's colour field toward B's - low frequencies only - as x goes from xa to xb, so that the line-by-line join trades DETAIL (folk outline for painted water,
    dusk cloud for sunset cloud) and not a step of colour: no stain where one picture's blue meets the other's lilac"""
    h, w = A.shape[:2]
    X = (np.arange(w, dtype=np.float32) + xs0)[None, :]
    k = smoothstep(xa, xb, X)[..., None] * strength
    La = cv2.GaussianBlur(np.ascontiguousarray(A, np.float32), (0, 0), sigma)
    Lb = cv2.GaussianBlur(np.ascontiguousarray(B, np.float32), (0, 0), sigma)
    return np.clip(A + (Lb - La) * k, 0, 1)
