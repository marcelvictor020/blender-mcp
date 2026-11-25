"""Shared engine for the Midsummer carousel panorama (10800 x 1350 -> 10 slides of 1080 x 1350).

Everything is procedural: periodic lattice noise, supersampled cairo layers, a projective
cairo wrapper (for murals painted on the perspective walls), plywood / paper textures.
All scene code works in GLOBAL canvas coordinates so scenes join seamlessly.
"""
import math, os
import numpy as np
import cv2
import cairo

import os as _os
N_SLIDES = int(_os.environ.get('N_SLIDES', 17))
SL = 1080                              # slide width
W, H = N_SLIDES * SL, 1350             # canvas
NW = 17280                             # width the value noise tiles over (kept at the 16-slide size so no texture re-seeds when slides are added)
SHIFT = W - NW                         # slides inserted after the house ('the invitation', slide 11) push the drawing + hallway right by this much
HZ = 783                              # shared horizon (58 % of 1350)
VPX = 14040 + SHIFT                   # vanishing point x  (the 14|15 cut of 17)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, 'work')
os.makedirs(WORK, exist_ok=True)


# ----------------------------------------------------------------------------- colour
def rgb(c):
    if isinstance(c, str):
        c = c.lstrip('#')
        return tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(v / 255.0 if v > 1.0 else v for v in c)


PAL = {k: rgb(v) for k, v in dict(
    sun='#F0B923', sun_hi='#F8D550', gold='#D79A1E', amber='#E08A22', orange='#D9772B',
    oxblood='#5E1519', oxblood_hi='#7C2025', falu='#8B2B22', brick='#A2402E',
    corn='#5B7FCB', corn_hi='#8FA8E0', midnight='#1E2D6B', deep_blue='#141E4A', pale_blue='#A9BEE6',
    linen='#F1E9D8', linen_sh='#CBBFA6', cream='#F6EFD9',
    moss='#6B7A3A', moss_hi='#97A24E', pond='#17392F', deep_pond='#0B241F', leaf='#4E6B33',
    jade='#9DD0B8', pale_jade='#CFE8DA', teal='#2F6D70',
    leafgold='#E6BC52', leafgold_hi='#FFE49A', ink='#2A1A14', rose='#D98A84', blush='#E8B4A4',
    ply='#E8D9B5', ply_dk='#C9B48A', pine='#D9B779', pine_dk='#A9824C', mustard='#CD9E4D',
    skin='#EFCDB0', skin_sh='#D9A98A', hair_b='#B88A4E', hair_d='#5A3A22', hair_l='#E3C58A',
).items()}


def mixc(a, b, t):
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, np.float32) - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def stops_lerp(t, stops):
    """Piecewise-linear colour ramp. t: ndarray. stops: [(pos,(r,g,b)),...] -> (...,3)"""
    pos = np.array([p for p, _ in stops], np.float32)
    col = np.array([c for _, c in stops], np.float32)
    t = np.clip(np.asarray(t, np.float32), pos[0], pos[-1])
    idx = np.clip(np.searchsorted(pos, t, side='right') - 1, 0, len(pos) - 2)
    f = ((t - pos[idx]) / (pos[idx + 1] - pos[idx] + 1e-9))[..., None]
    return col[idx] * (1 - f) + col[idx + 1] * f


# ----------------------------------------------------------------------------- noise
_LAT = {}


def noise_cell(x0, y0, w, h, cx, cy, seed):
    """Smooth value-noise octave, cell size (cx,cy) px, global coordinates, periodic in x
    whenever cx divides 10800."""
    gw = -(-NW // cx)
    gh = -(-H // cy) + 8
    key = (seed, cx, cy)
    if key not in _LAT:
        _LAT[key] = np.random.default_rng([seed & 0xFFFF, cx, cy]).standard_normal((gh, gw)).astype(np.float32)
    g = _LAT[key]
    i0, i1 = x0 // cx, (x0 + w - 1) // cx + 3
    j0, j1 = y0 // cy, (y0 + h - 1) // cy + 3
    cols = np.arange(i0 - 2, i1 + 2) % gw
    rows = np.clip(np.arange(j0 - 2, j1 + 2), 0, gh - 1)
    sub = g[np.ix_(rows, cols)]
    big = cv2.resize(sub, (sub.shape[1] * cx, sub.shape[0] * cy), interpolation=cv2.INTER_CUBIC)
    ox, oy = x0 - (i0 - 2) * cx, y0 - (j0 - 2) * cy
    return big[oy:oy + h, ox:ox + w]


_DIVS = np.array([d for d in range(1, NW + 1) if NW % d == 0])


def snapx(c):
    """nearest divisor of the canvas width -> noise is exactly periodic across the loop seam"""
    return int(_DIVS[np.argmin(np.abs(_DIVS - max(1, c)))])


def fbm(x0, y0, w, h, cell, octaves=5, seed=0, gain=0.5, aniso=1.0, lac=2.0):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cx = snapx(int(round(cell * aniso / (lac ** o))))
        cy = max(1, int(round(cell / (lac ** o))))
        out += amp * noise_cell(x0, y0, w, h, cx, cy, seed + 31 * o)
        tot += amp
        amp *= gain
    return out / tot


def fbm01(*a, **k):
    return np.clip(0.5 + 0.9 * fbm(*a, **k), 0, 1)


# ----------------------------------------------------------------------------- cairo layer
class Layer:
    """Supersampled RGBA cairo canvas covering global rect [x0,x0+w) x [y0,y0+h)."""

    def __init__(self, w, h, x0=0, y0=0, ss=2):
        self.w, self.h, self.x0, self.y0, self.ss = w, h, x0, y0, ss
        self.buf = np.zeros((h * ss, w * ss, 4), np.uint8)
        self.surf = cairo.ImageSurface.create_for_data(self.buf, cairo.FORMAT_ARGB32, w * ss, h * ss, w * ss * 4)
        self.ctx = cairo.Context(self.surf)
        self.ctx.scale(ss, ss)
        self.ctx.translate(-x0, -y0)
        self.ctx.set_antialias(cairo.ANTIALIAS_BEST)
        self.ctx.set_line_cap(cairo.LINE_CAP_ROUND)
        self.ctx.set_line_join(cairo.LINE_JOIN_ROUND)

    def get(self):
        """-> (premultiplied rgb float32 (h,w,3), alpha float32 (h,w))"""
        self.surf.flush()
        if self.ss == 1:
            small = self.buf.astype(np.float32) / 255
        else:
            small = np.empty((self.h, self.w, 4), np.float32)
            step = 96
            for r in range(0, self.h, step):
                r1 = min(self.h, r + step)
                chunk = self.buf[r * self.ss:r1 * self.ss].astype(np.float32) / 255
                small[r:r1] = cv2.resize(chunk, (self.w, r1 - r), interpolation=cv2.INTER_AREA)
        return np.ascontiguousarray(small[..., 2::-1]), small[..., 3].copy()

    def clear(self):
        self.buf[:] = 0


def over(dst, src_pm, a):
    """dst (h,w,3) in-place: premultiplied src over dst"""
    dst *= (1 - a)[..., None]
    dst += src_pm
    return dst


def lerp_img(dst, col, a):
    """in-place straight-alpha blend of colour (3,) or image onto dst with alpha a (h,w)"""
    dst *= (1 - a)[..., None]
    dst += np.asarray(col, np.float32) * a[..., None] if np.ndim(col) == 1 else col * a[..., None]
    return dst


# ----------------------------------------------------------------------------- projective cairo
class PCtx:
    """Subset of cairo.Context that draws shapes defined on a *plane* (local u,v) through a
    homography/proj(u,v)->(x,y). Lets the same folk-art drawing code paint the perspective walls."""

    def __init__(self, ctx, proj):
        self.c, self.proj = ctx, proj
        self.m = [1, 0, 0, 1, 0, 0]
        self.stack = []
        self.pt = (0.0, 0.0)          # current point, local plane coords
        self.start = (0.0, 0.0)
        self.lw = 1.0
        self.curvek = 1.0

    # -- transforms (local space)
    def _tf(self, x, y):
        a, b, c, d, e, f = self.m
        return a * x + c * y + e, b * x + d * y + f

    def _mul(self, n):
        a, b, c, d, e, f = self.m
        na, nb, nc, nd, ne, nf = n
        self.m = [a * na + c * nb, b * na + d * nb, a * nc + c * nd, b * nc + d * nd,
                  a * ne + c * nf + e, b * ne + d * nf + f]

    def save(self):
        self.stack.append((list(self.m), self.lw)); self.c.save()

    def restore(self):
        self.m, self.lw = self.stack.pop(); self.c.restore()

    def translate(self, x, y): self._mul([1, 0, 0, 1, x, y])
    def scale(self, sx, sy): self._mul([sx, 0, 0, sy, 0, 0])

    def rotate(self, a):
        ca, sa = math.cos(a), math.sin(a)
        self._mul([ca, sa, -sa, ca, 0, 0])

    def _P(self, x, y):
        u, v = self._tf(x, y)
        return self.proj(u, v)

    # -- path
    def new_path(self): self.c.new_path()

    def move_to(self, x, y):
        self.pt = (x, y); self.start = (x, y)
        px, py = self._P(x, y); self.c.move_to(px, py)

    def line_to(self, x, y):
        self.pt = (x, y)
        px, py = self._P(x, y); self.c.line_to(px, py)

    def curve_to(self, x1, y1, x2, y2, x3, y3):
        x0, y0 = self.pt
        n = 16
        for i in range(1, n + 1):
            t = i / n; mt = 1 - t
            x = mt ** 3 * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t ** 3 * x3
            y = mt ** 3 * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t ** 3 * y3
            px, py = self._P(x, y); self.c.line_to(px, py)
        self.pt = (x3, y3)

    def arc(self, xc, yc, r, a1, a2):
        n = max(8, int(abs(a2 - a1) / (2 * math.pi) * 48))
        for i in range(n + 1):
            a = a1 + (a2 - a1) * i / n
            x, y = xc + r * math.cos(a), yc + r * math.sin(a)
            if i == 0 and self.c.has_current_point() is False:
                self.move_to(x, y)
            else:
                self.line_to(x, y)

    def close_path(self):
        self.c.close_path(); self.pt = self.start

    def rectangle(self, x, y, w, h):
        self.move_to(x, y); self.line_to(x + w, y); self.line_to(x + w, y + h); self.line_to(x, y + h); self.close_path()

    # -- paint
    def set_source_rgb(self, r, g, b): self.c.set_source_rgb(r, g, b)
    def set_source_rgba(self, r, g, b, a): self.c.set_source_rgba(r, g, b, a)
    def set_line_cap(self, v): self.c.set_line_cap(v)
    def set_line_join(self, v): self.c.set_line_join(v)
    def set_line_width(self, w): self.lw = w

    def _k(self):
        u, v = self._tf(*self.pt)
        x0, y0 = self.proj(u, v); x1, y1 = self.proj(u + 1, v); x2, y2 = self.proj(u, v + 1)
        return math.sqrt(max(1e-9, math.hypot(x1 - x0, y1 - y0) * math.hypot(x2 - x0, y2 - y0)))

    def _lw(self):
        a, b, c, d, e, f = self.m
        loc = math.sqrt(abs(a * d - b * c))
        self.c.set_line_width(max(0.35, self.lw * loc * self._k()))

    def set_fill_rule(self, r): self.c.set_fill_rule(r)
    def new_sub_path(self): self.c.new_sub_path()
    def set_source(self, pat): pass                     # gradients are not projectable: ignored (callers fall back to flat colours)
    def arc_negative(self, xc, yc, r, a1, a2): self.arc(xc, yc, r, a1, a2)
    def has_current_point(self): return self.c.has_current_point()

    def fill(self): self.c.fill()
    def fill_preserve(self): self.c.fill_preserve()
    def stroke(self): self._lw(); self.c.stroke()
    def stroke_preserve(self): self._lw(); self.c.stroke_preserve()
    def clip(self): self.c.clip()
    def reset_clip(self): self.c.reset_clip()


# ----------------------------------------------------------------------------- warps / textures
def warp(img, dx, dy):
    """Displace image by per-pixel (dx,dy) (pixels). img (h,w[,c])."""
    h, w = img.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + dx.astype(np.float32), gy + dy.astype(np.float32), cv2.INTER_LINEAR,
                     borderMode=cv2.BORDER_REPLICATE)


def wobble_field(x0, y0, w, h, amp=1.5, cell=26, seed=5):
    return (amp * fbm(x0, y0, w, h, cell, 3, seed) * 1.6, amp * fbm(x0, y0, w, h, cell, 3, seed + 99) * 1.6)


def plywood(x0, y0, w, h, seed=3, strength=1.0, tint=None):
    """Pale birch plywood, long horizontal grain, cathedral figure, pin-knots."""
    yy = (np.arange(h, dtype=np.float32) + y0)[:, None]
    wf = fbm(x0, y0, w, h, 520, 3, seed, aniso=3.0)
    wf2 = fbm(x0, y0, w, h, 130, 3, seed + 7, aniso=4.0)
    val = (yy + 150 * wf + 22 * wf2) / 15.0
    tri = np.abs((val % 1.0) - 0.5) * 2
    lines = smoothstep(0.78, 1.0, tri)
    amp = 0.45 + 0.9 * fbm01(x0, y0, w, h, 700, 3, seed + 3, aniso=2.5)
    streak = fbm(x0, y0, w, h, 5, 2, seed + 11, aniso=60.0)
    broad = fbm(x0, y0, w, h, 300, 3, seed + 21, aniso=2.0)
    base = np.array(PAL['ply'], np.float32) if tint is None else np.array(tint, np.float32)
    dark = np.array(PAL['ply_dk'], np.float32)
    t = np.clip(0.22 * lines * amp + 0.16 * streak + 0.10 * broad, -0.3, 0.9) * strength
    out = base[None, None, :] * (1 - t[..., None]) + dark[None, None, :] * t[..., None]
    out *= (1 + 0.035 * broad)[..., None]
    return np.clip(out, 0, 1).astype(np.float32)


def paper(x0, y0, w, h, seed=8, base=(0.95, 0.91, 0.82)):
    n = fbm(x0, y0, w, h, 3, 2, seed) * 0.5 + fbm(x0, y0, w, h, 60, 3, seed + 1) * 0.5
    return np.clip(np.array(base, np.float32)[None, None, :] * (1 + 0.035 * n)[..., None], 0, 1).astype(np.float32)


def save_png(path, img):
    a = np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)
    cv2.imwrite(path, a[..., ::-1] if a.ndim == 3 else a)


def preview(img, path, width=1600):
    h, w = img.shape[:2]
    s = width / w
    sm = cv2.resize(img, (width, max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    save_png(path, sm)


def load_png(path):
    a = cv2.imread(path, cv2.IMREAD_COLOR)[..., ::-1]
    return a.astype(np.float32) / 255.0


def cache_save(name, x0, img):
    np.save(os.path.join(WORK, f'{name}.npy'), img.astype(np.float16))
    with open(os.path.join(WORK, f'{name}.x0'), 'w') as f:
        f.write(str(x0))


def cache_load(name):
    img = np.load(os.path.join(WORK, f'{name}.npy')).astype(np.float32)
    with open(os.path.join(WORK, f'{name}.x0')) as f:
        x0 = int(f.read())
    return x0, img


def rng(seed):
    return np.random.default_rng(seed)


def sun_shadow_dir(gx, gy, sun_x=7330.0, length=1.9, hz=None):
    """image-space direction of the cast shadow of a vertical object standing at (gx, gy): shadow lines are parallel in 3D, so in the picture they
    radiate away from the point on the horizon under the sun. Returns (kx, ky) for fig.cast_shadow (shadow tip = foot + height * (kx, ky))."""
    hz = HZ if hz is None else hz
    dx, dy = gx - sun_x, max(gy - hz, 4.0)
    n = math.hypot(dx, dy)
    return length * dx / n, length * dy / n
