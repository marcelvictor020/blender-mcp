"""The finish: ink and gouache instead of an oil-paint filter.

References studied for this (John Bauer's 'Princess Tuvstarr', 1913; the modern Scandinavian folk-pattern illustration of a calm sun with bows and
wisteria; the Art Nouveau woman in a knotwork frame): big simple shapes in flat or gently graded washes, a thin confident dark-brown ink contour that
wobbles like a hand, pigment that pools a little at the edges, paper grain, and very few, very carefully placed small details.

finish(img, lines, keep): flatten the render into gouache washes, pool the pigment at colour edges, draw ink outlines round the shapes we KNOW
(masks handed in by the scenes: house, trunks, foliage masses, figures), nudge ink and colour out of register by a pixel or two, add paper.
"""
import numpy as np
import cv2
from util import *

INK = np.array([0.17, 0.11, 0.10], np.float32)


def flatten(img, scale=0.5, iters=2, d=9, sc=26, ss=7):
    h, w = img.shape[:2]
    u8 = np.clip(img * 255, 0, 255).astype(np.uint8)
    sm = cv2.resize(u8, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    for _ in range(iters):
        sm = cv2.bilateralFilter(sm, d, sc, ss)
    return cv2.resize(sm, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0


def wobble(arr, amp, seed, cell=46):
    h, w = arr.shape[:2]
    dx = amp * fbm(0, 0, w, h, cell, 2, seed)
    dy = amp * fbm(0, 0, w, h, cell, 2, seed + 7)
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(arr, gx + dx, gy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def outline(mask, width=2.0, closing=7, light_x=None):
    """ink line round the outside of a mask (holes in foliage are closed so only the silhouette is drawn). With light_x (+1: light comes from the right,
    -1: from the left, scalar or (1,w)) the line is found on the shadow side of every shape and lost on the lit side - a painter's lost-and-found edge."""
    m = (mask > 0.5).astype(np.uint8)
    if closing > 1:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (closing, closing)))
    edge = m - cv2.erode(m, np.ones((3, 3), np.uint8))
    line = cv2.GaussianBlur(edge.astype(np.float32), (0, 0), max(0.6, width * 0.55))
    line = np.clip(line * (1.8 + 0.5 * width), 0, 1)
    if light_x is not None:
        mf = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.2)
        gx = cv2.Sobel(mf, cv2.CV_32F, 1, 0); gy = cv2.Sobel(mf, cv2.CV_32F, 0, 1)
        nx = -gx / (np.hypot(gx, gy) + 1e-4)                                   # outward normal, x component
        nxl = np.clip(nx * light_x, -1, 1)
        line = line * (0.30 + 0.70 * np.clip(0.5 - 0.5 * nxl, 0, 1))
    return line


def paper(h, w, seed=3):
    fine = fbm(0, 0, w, h, 3, 2, seed)
    mid = fbm(0, 0, w, h, 28, 3, seed + 1)
    fib = fbm(0, 0, w, h, 14, 2, seed + 2, aniso=7.0)
    return 1.0 + 0.030 * fine + 0.022 * mid + 0.014 * fib


def finish(img, lines=(), keep=None, flat=0.66, pool=0.12, grain=1.0, seed=1, register=1.2, light_x=None, tint=0.30):
    """lines: [(mask, width_px, alpha)] (alpha may be a (1,w) array); keep: 0..1 map of areas that must stay as drawn (faces, windows, flowers, stars);
    light_x: +1 / -1 / (1,w): which side the light comes from, so that outlines are found on the shadow side and lost on the lit side"""
    h, w = img.shape[:2]
    fl = flatten(img)
    k = flat * (1.0 if keep is None else (1.0 - np.clip(keep, 0, 1)))
    k = k[..., None] if np.ndim(k) == 2 else k
    base = img * (1 - k) + fl * k
    g = cv2.cvtColor(np.clip(base, 0, 1).astype(np.float32), cv2.COLOR_RGB2GRAY)
    e = np.clip(np.hypot(cv2.Sobel(cv2.GaussianBlur(g, (0, 0), 1.3), cv2.CV_32F, 1, 0), cv2.Sobel(cv2.GaussianBlur(g, (0, 0), 1.3), cv2.CV_32F, 0, 1)) * 4.0, 0, 1)
    base = base * (1 - pool * e[..., None] * np.array([0.9, 1.0, 0.8], np.float32))          # pigment pools a little at the edges
    ink = np.zeros((h, w), np.float32)
    for (mask, width, alpha) in lines:
        ink = np.maximum(ink, outline(mask, width, light_x=light_x) * alpha)
    if register > 0:
        ink = wobble(ink, register, seed + 11)
    ink = np.clip(ink * (0.92 + 0.16 * fbm01(0, 0, w, h, 9, 2, seed + 5)), 0, 1)             # the pen is not equally dark everywhere
    line_col = base * tint + INK * (1 - tint)                                                # a line is drawn in a dark version of what it encloses
    out = base * (1 - ink[..., None]) + line_col * ink[..., None]
    out = out * (1 + grain * (paper(h, w, seed) - 1.0))[..., None]
    return np.clip(out, 0, 1).astype(np.float32)
