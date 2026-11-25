"""Slide 4, rebuilt: the cathedral of two ancient trees over the dusk lake.

Wood is shaded per pixel (cylinder normals from the bough geometry + bark relief + moss/lichen, lit by the lantern, the rose afterglow on the right and the
blue sky), the roots stand IN the water and are reflected in it, the foliage is thousands of sphere-lit leaf dabs in three tones of light (blue sky from above,
rose-gold dusk from the right, lantern-yellow from below), and the canopy is hung with laburnum, wisteria, hawthorn blossom and ivy - colour instead of
a flat green mass.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from trees import catmull, sample_radius, leaf, TRUNK_L, TRUNK_R, BR_RIGHT, BR_LEFT2, BR_R2, BR_L3, BR_R3
import boat as BT
from shared import GIRL_X

TAU = 2 * math.pi
YW = 1214.0
HOLE = (3790.0, 70.0, 230.0, 135.0)
ROOTS_L = [[(3352, 1090), (3296, 1150), (3228, 1196), (3150, 1218)], [(3400, 1080), (3446, 1150), (3508, 1198), (3592, 1220)], [(3342, 1040), (3270, 1100), (3196, 1130), (3112, 1168)]]
ROOTS_R = [[(4204, 1090), (4262, 1150), (4332, 1196), (4412, 1218)], [(4160, 1080), (4118, 1150), (4056, 1198), (3980, 1220)], [(4214, 1040), (4290, 1100), (4368, 1130), (4452, 1168)]]


def yw_line(xs):
    xs = np.asarray(xs, np.float32)
    return YW + 2.4 * np.sin(xs * 0.087) + 1.6 * np.sin(xs * 0.231 + 1.0)


def enc_bough(c, pts, r0, r1, seed):
    P = catmull(pts, 26)
    n = len(P)
    R = sample_radius(n, r0, r1, seed=seed)
    tang = np.gradient(P, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-6
    nor = np.stack([-tang[:, 1], tang[:, 0]], 1)
    Lp = P + nor * R[:, None]; Rp = P - nor * R[:, None]
    for i in range(n - 1):
        ext = tang[i] * 1.3
        quad = [Lp[i] - ext, Lp[i + 1] + ext, Rp[i + 1] + ext, Rp[i] - ext]
        g = cairo.LinearGradient(Lp[i][0], Lp[i][1], Rp[i][0], Rp[i][1])
        cr, cb = 0.5 + 0.5 * float(nor[i, 0]), 0.5 + 0.5 * float(nor[i, 1])
        g.add_color_stop_rgb(0.0, 0.0, cr, cb); g.add_color_stop_rgb(1.0, 1.0, cr, cb)
        c.set_source(g); c.new_path(); c.move_to(*quad[0]); [c.line_to(*q) for q in quad[1:]]; c.close_path(); c.fill()
    return P, R


def wood_geometry(x0, w):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    PS = {}
    for k, (pts, r0, r1, sd) in enumerate(((BR_L3, 22, 7, 5), (BR_R3, 22, 7, 6), (BR_LEFT2, 34, 10, 3), (BR_R2, 30, 10, 4))):
        PS['b%d' % k] = enc_bough(c, pts, r0, r1, sd)
    for k, pts in enumerate(ROOTS_L): PS['rl%d' % k] = enc_bough(c, pts, 64 - 12 * k, 12, 20 + k)
    for k, pts in enumerate(ROOTS_R): PS['rr%d' % k] = enc_bough(c, pts, 64 - 12 * k, 12, 30 + k)
    PS['L'] = enc_bough(c, TRUNK_L, 112, 18, 1)
    PS['R'] = enc_bough(c, TRUNK_R, 104, 16, 2)
    PS['BR'] = enc_bough(c, BR_RIGHT, 34, 11, 7)
    rgb, a = L.get()
    enc = rgb / np.maximum(a, 1e-3)[..., None]
    return enc, a, PS


def shade_wood(x0, w, enc, a, lantern, seed=5):
    h = H
    p = enc[..., 0]; nxa = enc[..., 1] * 2 - 1; nya = enc[..., 2] * 2 - 1
    s = np.clip(1 - 2 * p, -0.97, 0.97)
    nz = np.sqrt(1 - s * s)
    nx, ny = s * nxa, s * nya
    horiz = cv2.GaussianBlur((np.abs(nya) > 0.62).astype(np.float32), (0, 0), 3.0)
    hv = 0.55 * fbm(x0, 0, w, h, 150, 4, seed, aniso=0.07) + 0.35 * fbm(x0, 0, w, h, 40, 3, seed + 1, aniso=0.09) + 0.20 * fbm(x0, 0, w, h, 9, 3, seed + 9)
    hh = 0.55 * fbm(x0, 0, w, h, 150, 4, seed + 4, aniso=14.0) + 0.35 * fbm(x0, 0, w, h, 40, 3, seed + 5, aniso=11.0) + 0.20 * fbm(x0, 0, w, h, 9, 3, seed + 9)
    bh = hv * (1 - horiz) + hh * horiz
    gx = cv2.Sobel(bh, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(bh, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    k = 11.0
    N = np.stack([nx - k * gx, ny - k * gy, nz + 0.30], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    X = (np.arange(x0, x0 + w, dtype=np.float32))[None, :] * np.ones((h, 1), np.float32)
    Y = np.arange(h, dtype=np.float32)[:, None] * np.ones((1, w), np.float32)
    lx, ly = lantern
    dxl, dyl = lx - X, ly - Y
    dist = np.hypot(dxl, dyl) + 1e-3
    Lv = np.stack([dxl / dist, dyl / dist, np.full_like(dist, 0.10)], -1); Lv /= np.linalg.norm(Lv, axis=-1, keepdims=True)
    lam = np.clip((N * Lv).sum(-1), 0, 1)
    fall = 1.0 / (1.0 + (dist / 250.0) ** 2)
    lan = (lam ** 0.9 * fall)[..., None] * np.array([1.0, 0.64, 0.28], np.float32) * 1.9
    Lg = np.array([0.85, 0.18, -0.30], np.float32); Lg /= np.linalg.norm(Lg)
    glow = (np.clip((N * Lg).sum(-1), 0, 1) ** 1.1)[..., None] * np.array([1.0, 0.56, 0.46], np.float32) * 0.95
    up = np.clip(-N[..., 1], 0, 1); dn = np.clip(N[..., 1], 0, 1)
    amb = up[..., None] * np.array([0.26, 0.30, 0.52], np.float32) * 0.95 + (0.30 + 0.0 * up)[..., None] * np.array([0.16, 0.14, 0.26], np.float32) + dn[..., None] * np.array([0.42, 0.28, 0.22], np.float32) * 0.7
    ridge = np.clip(0.5 + 0.9 * bh, 0, 1)
    alb = np.array([0.11, 0.080, 0.062], np.float32) * (1 - ridge[..., None]) + np.array([0.46, 0.37, 0.28], np.float32) * ridge[..., None]
    moss_n = fbm01(x0, 0, w, h, 120, 4, seed + 21, aniso=0.5)
    wet = smoothstep(YW - 230, YW - 8, Y)
    moss = smoothstep(0.52, 0.72, moss_n) * (0.18 + 0.82 * np.clip(0.4 + 0.6 * wet + 0.3 * (nz - 0.5), 0, 1))
    alb = alb * (1 - 0.82 * moss[..., None]) + np.array([0.10, 0.25, 0.07], np.float32) * (0.82 * moss[..., None]) * (0.7 + 0.8 * ridge[..., None])
    lich = smoothstep(0.80, 0.90, fbm01(x0, 0, w, h, 14, 3, seed + 31)) * (1 - moss) * 0.7
    alb = alb * (1 - lich[..., None]) + np.array([0.52, 0.60, 0.44], np.float32) * lich[..., None]
    ao = np.clip(0.55 + 0.95 * ridge, 0.25, 1.0)[..., None]
    col = alb * (amb + lan + glow) * ao
    spec = (np.clip((N * Lv).sum(-1), 0, 1) ** 10 * fall * 0.35)[..., None] * np.array([1.0, 0.75, 0.45], np.float32)
    col = col + spec * (0.4 + 0.6 * moss[..., None] * 0 + 0.6 * ridge[..., None])
    contact = np.exp(-((np.asarray(yw_line(X), np.float32) - Y) / 11.0) ** 2) * (Y < yw_line(X) + 4)
    col = col * (1 - 0.55 * contact[..., None])
    return np.clip(col, 0, 1.2).astype(np.float32), bh


# ---------------------------------------------------------------------------------------------------- foliage
SH, MD, LT, HI = (0.010, 0.040, 0.050), (0.045, 0.150, 0.105), (0.19, 0.38, 0.16), (0.50, 0.56, 0.20)


def leaf_rgb(sky_l, glow_l, lan_l, rng, haze=0.0, hazec=(0.46, 0.38, 0.64)):
    t = sky_l
    if t < 0.45: col = [SH[i] + (MD[i] - SH[i]) * t / 0.45 for i in range(3)]
    else: col = [MD[i] + (LT[i] - MD[i]) * (t - 0.45) / 0.55 for i in range(3)]
    if t > 0.75:
        hf = (t - 0.75) * 1.6
        col = [col[i] + (HI[i] - col[i]) * hf for i in range(3)]
    col = [col[0] + glow_l * 0.30 + lan_l * 0.55, col[1] + glow_l * 0.14 + lan_l * 0.34, col[2] + glow_l * 0.06 + lan_l * 0.08]
    j = 1 + rng.normal(0, 0.10)
    col = [col[0] * j * (1 + rng.normal(0, 0.05)), col[1] * j, col[2] * j * (1 + rng.normal(0, 0.08))]
    if rng.random() < 0.04: col = [col[0] + 0.18, col[1] + 0.12, col[2] - 0.03]                 # a few sun-yellowed leaves
    return tuple(float(np.clip(v * (1 - haze) + hazec[i] * haze, 0, 1)) for i, v in enumerate(col))


Ls_ = np.array([0.18, -0.86, 0.48], np.float32); Ls_ /= np.linalg.norm(Ls_)
Lg_ = np.array([0.82, 0.10, 0.56], np.float32); Lg_ /= np.linalg.norm(Lg_)


def dab_light(px, py, n, lantern):
    sky = max(0.0, float(n[0] * Ls_[0] + n[1] * Ls_[1] + n[2] * Ls_[2]))
    gl = max(0.0, float(n[0] * Lg_[0] + n[1] * Lg_[1] + n[2] * Lg_[2])) ** 1.5
    dx, dy = lantern[0] - px, lantern[1] - py
    d = math.hypot(dx, dy) + 1e-3
    lam = max(0.0, (n[0] * dx + n[1] * dy) / d * 0.9 + n[2] * 0.1)
    return sky, gl, lam / (1.0 + (d / 300.0) ** 2)


def clump(c, cx, cy, rx, ry, n, rng, lantern, size=(13, 24), haze=0.0, hole=True, skew=0.0):
    for _ in range(n):
        th = rng.uniform(0, TAU); rad = math.sqrt(rng.random())
        u, v = rad * math.cos(th), rad * math.sin(th)
        if rad > 0.82 and rng.random() < 0.38: continue
        px, py = cx + u * rx, cy + v * ry
        if hole:
            q = ((px - HOLE[0]) / HOLE[2]) ** 2 + ((py - HOLE[1]) / HOLE[3]) ** 2
            if q < 1.0 and rng.random() < (1 - q) ** 0.5 * 0.96: continue
        nz = math.sqrt(max(0.0, 1 - u * u * 0.8 - v * v * 0.8))
        nn = (u * 0.9 + skew, v * 0.9, nz)
        sky, gl, lan = dab_light(px, py, nn, lantern)
        col = leaf_rgb(sky * 0.85 + 0.10 * (1 - rad), gl, lan, rng, haze)
        leaf(c, px, py, rng.uniform(*size), rng.uniform(0, TAU), col)


def blossom(c, x, y, r, col, rng):
    for k in range(5):
        a = TAU * k / 5 + rng.uniform(0, 1)
        c.set_source_rgba(*col, 0.96); c.new_path(); c.arc(x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55, r * 0.46, 0, TAU); c.fill()
    c.set_source_rgba(0.98, 0.80, 0.30, 1); c.new_path(); c.arc(x, y, r * 0.30, 0, TAU); c.fill()


def chain_flowers(c, ax, ay, length, rng, lantern, kind):
    """a hanging raceme: laburnum (gold) or wisteria (lilac); lit warmer the nearer it hangs to the lantern"""
    n = int(length / 4.6)
    ph = rng.uniform(0, 6.28); sw = rng.uniform(0.5, 1.4)
    c.set_source_rgba(0.05, 0.14, 0.06, 0.9); c.set_line_width(1.5)
    c.new_path()
    for k in range(n + 1):
        t = k / n
        x = ax + math.sin(ph + t * 2.4) * sw * 11 * t; y = ay + t * length
        (c.move_to if k == 0 else c.line_to)(x, y)
    c.stroke()
    for k in range(n):
        t = k / n
        x = ax + math.sin(ph + t * 2.4) * sw * 11 * t; y = ay + t * length
        d = math.hypot(lantern[0] - x, lantern[1] - y)
        lit = 1.0 / (1.0 + (d / 340.0) ** 2)
        width = (1.0 - t) ** 0.8 if kind == 'wist' else (0.45 + 0.5 * (1 - t))
        for side in (-1, 1):
            if rng.random() < 0.15: continue
            bx = x + side * rng.uniform(1.5, 7.0) * width * (1.4 if kind == 'wist' else 1.0); by = y + rng.normal(0, 1.2)
            sz = (4.8 if kind == 'wist' else 4.0) * (1 - 0.40 * t) * rng.uniform(0.8, 1.25)
            if kind == 'lab':
                base = (0.95, 0.76, 0.10); hi = (1.0, 0.92, 0.45)
            else:
                base = (0.56, 0.42, 0.84); hi = (0.82, 0.70, 0.98)
            m = min(1.0, 0.35 + 0.9 * lit) * rng.uniform(0.75, 1.1)
            col = tuple(float(np.clip(base[i] * (1 - m * 0.5) + hi[i] * m * 0.5 + 0.10 * lit * (1.0, 0.6, 0.2)[i], 0, 1)) for i in range(3))
            c.set_source_rgba(*col, 1.0)
            c.new_path(); c.save(); c.translate(bx, by); c.rotate(rng.uniform(-0.7, 0.7)); c.scale(sz * 0.80, sz * 1.15); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def hanging_leaves(c, ax, ay, length, rng, lantern, haze=0.0):
    n = max(3, int(length / 9))
    ph = rng.uniform(0, 6.28); sw = rng.uniform(0.4, 1.5)
    for k in range(n):
        t = k / n
        x = ax + math.sin(ph + t * 3.0) * sw * 14 * t * (1 + t); y = ay + t * length
        s = 13.0 * (1 - 0.40 * t) * rng.uniform(0.8, 1.25)
        for side in (-1, 1):
            sky = rng.uniform(0.15, 0.80)
            d = math.hypot(lantern[0] - x, lantern[1] - y)
            lan = 0.8 / (1.0 + (d / 300.0) ** 2)
            col = leaf_rgb(sky, 0.25 * (side > 0), lan * rng.uniform(0.5, 1.2), rng, haze)
            leaf(c, x + side * s * 0.12, y, s * 1.5, 1.5707 + side * rng.uniform(0.5, 1.25) + math.sin(ph + t * 3) * 0.2, col)


def ivy_run(c, x, y, ang, length, rng, lantern):
    px, py = x, y
    for k in range(int(length / 10)):
        a = ang + rng.normal(0, 0.20)
        px += math.cos(a) * 10; py += math.sin(a) * 10
        c.set_source_rgba(0.05, 0.10, 0.04, 1); c.set_line_width(1.8)
        c.new_path(); c.move_to(px - math.cos(a) * 10, py - math.sin(a) * 10); c.line_to(px, py); c.stroke()
        for sd in (-1, 1):
            if rng.random() < 0.75:
                sky = rng.uniform(0.15, 0.7)
                d = math.hypot(lantern[0] - px, lantern[1] - py)
                col = leaf_rgb(sky, 0.15, 0.9 / (1.0 + (d / 260.0) ** 2), rng)
                leaf(c, px, py, rng.uniform(13, 24), a + sd * rng.uniform(0.7, 1.5), col)


def render_arch(x0=3000, w=2100, seed=404, verbose=True):
    import time
    t0 = time.time()
    lantern = BT.LANTERN
    rng = np.random.default_rng(seed)
    enc, wa, PS = wood_geometry(x0, w)
    wood, bh = shade_wood(x0, w, enc, wa, lantern)
    if verbose: print('wood', round(time.time() - t0, 1))
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    Y = np.arange(H, dtype=np.float32)[:, None]
    below = smoothstep(yw_line(xs) + 1.6, yw_line(xs) - 1.6, Y)
    wa = wa * below
    # ---- B: the farther, hazier canopy (dusk-violet leaf tones)
    LB = Layer(w, H, x0, 0, 1)
    c = LB.ctx
    for _ in range(150):
        cx = rng.uniform(3200, 4980); cy = rng.uniform(-50, 330)
        r_ = rng.uniform(60, 120)
        clump(c, cx, cy, r_, r_ * 0.8, int(r_ * r_ * 0.045), rng, lantern, size=(16, 30), haze=0.45)
    rb, ab = LB.get()
    rb = cv2.GaussianBlur(rb, (0, 0), 0.9); ab = cv2.GaussianBlur(ab, (0, 0), 0.9)
    # ---- C: near foliage, hanging strands, flowers, ivy, ribs of ivy up the trunks
    LC = Layer(w, H, x0, 0, 1)
    c = LC.ctx
    # ceiling clumps (a dome of leaves with a skylight over the girl)
    for _ in range(240):
        cx = rng.uniform(3140, 4980); cy = rng.uniform(-70, 190)
        r_ = rng.uniform(46, 98)
        clump(c, cx, cy, r_, r_ * 0.78, int(r_ * r_ * 0.060), rng, lantern, size=(12, 22))
    # clumps hugging the boughs
    for key in ('L', 'R', 'BR', 'b0', 'b1', 'b2', 'b3'):
        P, R = PS[key]
        for k in range(0, len(P), 7):
            if P[k][1] > 640 or P[k][1] < -40: continue
            for _ in range(2):
                ox, oy = rng.normal(0, 26), rng.normal(0, 26)
                r_ = rng.uniform(26, 56) * (0.7 + 0.5 * float(smoothstep(700, 300, P[k][1])))
                clump(c, P[k][0] + ox, P[k][1] + oy, r_, r_ * 0.85, int(r_ * r_ * 0.09), rng, lantern, size=(10, 19), skew=0.25 * np.sign(ox))
    # curtains of leaves down the outer sides of the arch
    for side, (xa, xb) in enumerate(((3140, 3330), (4300, 4780))):
        for _ in range(26):
            cx = rng.uniform(xa, xb); cy = rng.uniform(200, 560)
            clump(c, cx, cy, rng.uniform(28, 52), rng.uniform(55, 110), int(rng.uniform(150, 300)), rng, lantern, size=(11, 20), skew=-0.3 if side == 0 else 0.3)
    # clear the girl's face / lantern area of dangling things
    def keep(x, y):
        return not ((3600 < x < 4020 and y > 330) or (abs(x - (GIRL_X + 22)) < 130 and 400 < y < 980))
    for key in ('L', 'R', 'BR', 'b0', 'b1', 'b2', 'b3'):
        P, R = PS[key]
        for k in range(0, len(P), 4):
            x, y = float(P[k][0]), float(P[k][1])
            if y > 560 or y < 40 or not keep(x, y): continue
            for _ in range(2 if y < 420 else 1):
                hanging_leaves(c, x + rng.normal(0, R[k] * 0.6), y + R[k] * rng.uniform(0.2, 1.0), rng.uniform(60, 250), rng, lantern)
    n_lab = n_wis = 0
    for key in ('L', 'R', 'BR', 'b2', 'b3'):
        P, R = PS[key]
        for k in range(0, len(P), 5):
            x, y = float(P[k][0]), float(P[k][1])
            if not (260 < y < 560) or not keep(x, y) or rng.random() > 0.55: continue
            kind = 'lab' if x < 3800 else 'wist'
            if (x < 3500 and kind == 'wist') or (x > 4100 and kind == 'lab'): kind = 'lab' if rng.random() < 0.5 else 'wist'
            chain_flowers(c, x + rng.normal(0, 8), y + R[k] * 0.9, rng.uniform(95, 230), rng, lantern, kind)
    for _ in range(420):                                                      # hawthorn / elder blossom scattered through the canopy
        x = rng.uniform(3100, 4950); y = rng.uniform(-30, 420)
        q = ((x - HOLE[0]) / HOLE[2]) ** 2 + ((y - HOLE[1]) / HOLE[3]) ** 2
        if q < 1.0 or not keep(x, y): continue
        blossom(c, x, y, rng.uniform(3.4, 6.2), [(0.98, 0.95, 0.90), (0.97, 0.80, 0.84), (0.99, 0.90, 0.70)][int(rng.integers(3))], rng)
    for (X0t, side) in ((3338, -1), (4212, 1)):                               # ivy runners up the trunks
        for j in range(7):
            ivy_run(c, X0t + side * rng.uniform(-95, 95), YW - rng.uniform(20, 120), -math.pi / 2 + rng.normal(0, 0.25), rng.uniform(160, 520), rng, lantern)
    rc, ac = LC.get()
    fx = smoothstep(3010, 3150, xs)[0]
    rc = rc * fx[None, :, None]; ac = ac * fx[None, :]
    rb = rb * fx[None, :, None]; ab = ab * fx[None, :]
    if verbose: print('foliage', round(time.time() - t0, 1))
    return dict(wood=wood, wa=wa, B=(rb, ab), C=(rc, ac), x0=x0, w=w)


def trunk_reflection(rgb, a, x0, w, depth=136):
    """the trunks' feet in the lake: flipped, rippled, softened, darkened"""
    k = np.arange(depth, dtype=np.float32)[:, None]
    y0 = int(YW)
    fr = rgb[y0 - depth:y0][::-1].copy(); fa = a[y0 - depth:y0][::-1].copy()
    ph = fbm(x0, y0, w, depth, 70, 3, 9, aniso=6.0)
    dx = (1.0 + 0.09 * k) * (np.sin(k * 0.55 + ph * 6) + 0.5 * np.sin(k * 0.23 + ph * 9)) * 1.3
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(depth, dtype=np.float32))
    fr = cv2.remap(fr, gx + dx, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    fa = cv2.remap(fa, gx + dx, gy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    fr2 = cv2.GaussianBlur(fr, (0, 0), sigmaX=4.0, sigmaY=2.2); fa2 = cv2.GaussianBlur(fa, (0, 0), sigmaX=4.0, sigmaY=2.2)
    m = np.clip(k / 40.0, 0, 1)[..., None]
    fr = fr * (1 - m) + fr2 * m; fa = fa * (1 - m[..., 0]) + fa2 * m[..., 0]
    fade = (0.72 * np.exp(-k / 85.0))
    out_rgb = np.zeros((H, w, 3), np.float32); out_a = np.zeros((H, w), np.float32)
    n = min(depth, H - y0)
    out_rgb[y0:y0 + n] = fr[:n] * fade[:n][..., None]
    out_a[y0:y0 + n] = fa[:n] * fade[:n]
    return out_rgb, out_a


def water_rings(x0, w):
    """ripple rings, foam and a few floating leaves round the trunk feet"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(12)
    for (cx, sd) in ((3340, -1), (4212, 1)):
        for k in range(7):
            rx = 150 + 46 * k + rng.uniform(-6, 6); ry = 9 + 3.2 * k
            c.set_source_rgba(0.82, 0.90, 1.0, 0.34 * (1 - k / 8)); c.set_line_width(1.4)
            c.new_path(); c.save(); c.translate(cx + sd * 18, YW + 8 + k * 2); c.scale(rx, ry); c.arc(0, 0, 1, math.radians(5), math.radians(175)); c.restore(); c.stroke()
        for _ in range(40):
            x = cx + rng.normal(0, 180); y = YW + rng.uniform(2, 120)
            if y > 1345: continue
            col = [(0.96, 0.84, 0.50), (0.60, 0.70, 0.30), (0.98, 0.92, 0.88), (0.94, 0.70, 0.74)][int(rng.integers(4))]
            c.set_source_rgba(*col, 0.88); c.new_path(); c.save(); c.translate(x, y); c.rotate(rng.uniform(-0.4, 0.4)); c.scale(rng.uniform(4, 8), rng.uniform(1.5, 2.8)); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    for _ in range(18):                                                       # pale foam line along the waterline
        x = rng.uniform(3100, 3600) if rng.random() < 0.5 else rng.uniform(3980, 4480)
        c.set_source_rgba(0.95, 0.97, 1.0, 0.35); c.set_line_width(1.6)
        c.new_path(); c.move_to(x, float(yw_line(x)) + 2); c.line_to(x + rng.uniform(10, 38), float(yw_line(x + 20)) + 2); c.stroke()
    return L.get()


if __name__ == '__main__':
    import time
    from util import cache_load
    t = time.time()
    wx0, world = cache_load('f_world')
    A = render_arch()
    x0, w = A['x0'], A['w']
    img = world[:, x0 - wx0:x0 - wx0 + w].copy()
    # simple composite for the test
    rb, ab = A['B']
    img = img * (1 - ab[..., None]) + rb
    wood = A['wood']; wa = A['wa']
    rc, ac = A['C']
    rr, ra = trunk_reflection(np.concatenate([wood * wa[..., None]], 0), wa, x0, w)
    img = img * (1 - ra[..., None]) + rr
    img = img * (1 - wa[..., None]) + wood * wa[..., None]
    img = img * (1 - ac[..., None]) + rc
    wr, wra = water_rings(x0, w)
    img = img * (1 - wra[..., None]) + wr
    save_png(WORK + '/arch_test.png', np.clip(img, 0, 1))
    print('arch', round(time.time() - t, 1), 's')
