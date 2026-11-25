"""Slides 5-8: THE PULL - one sideways current carries the pond into the garden (x 4300..8700).

The base is a row-by-row smear between the painted pond (left) and the painted garden (right): every scanline changes over at its own
place, so the water, the sky and the shore melt in horizontal streaks - the same lake becoming the same lake, now gold. On top, the
current itself: bark ribbons unwind from the arch's canopy and thin to vines that curl into kurbits spirals, leaves ride it and turn
from night-teal to sun-gold, mist streams off the lake, and the chain of girls walks across the water (reflections) toward the shore.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
from folk import Z
from trees import leaf, catmull
from fold import leaf2
import garden as G
import chain as CH
from blend import smear_blend, stagger_blend

TAU = 2 * math.pi
FX0, FX1 = 4300, 8700
FW = FX1 - FX0
TARGET = (8350.0, 770.0)


def flow_angle(x, y):
    x = np.asarray(x, np.float32); y = np.asarray(y, np.float32)
    base = np.arctan2(TARGET[1] - y, TARGET[0] - x)
    ramp = np.clip((x - FX0 + 250) / 700.0, 0, 1)
    wob = 0.30 * np.sin(y / 150.0 + x / 1100.0) + 0.16 * np.sin(x / 430.0 + 1.7 + y / 400.0)
    return base + wob * ramp


def streamline(x, y, n, ds=12.0):
    pts = [(float(x), float(y))]
    for _ in range(n):
        a = float(flow_angle(x, y))
        x += math.cos(a) * ds; y += math.sin(a) * ds
        pts.append((x, y))
        if x > FX1 + 200: break
    return pts


def lerpc(stops, x):
    xs = [s[0] for s in stops]
    cols = np.array([s[1] for s in stops], np.float32)
    return tuple(float(np.interp(x, xs, cols[:, k])) for k in range(3))


LEAF_STOPS = [(4300, (0.05, 0.20, 0.18)), (5200, (0.10, 0.34, 0.28)), (6200, (0.30, 0.48, 0.24)), (7200, (0.58, 0.60, 0.22)), (8400, (0.80, 0.70, 0.28))]
BARK_DARK = [(4300, (0.025, 0.045, 0.040)), (6000, (0.07, 0.06, 0.04)), (8000, (0.22, 0.15, 0.06))]
BARK_BASE = [(4300, (0.10, 0.12, 0.09)), (6000, (0.26, 0.22, 0.12)), (8000, (0.58, 0.44, 0.18))]
BARK_LIT = [(4300, (0.24, 0.26, 0.17)), (6000, (0.52, 0.45, 0.24)), (8000, (0.98, 0.82, 0.44))]


def draw_ribbon(c, pts, r0, r1, seed, lit_side=1, taper=0.8, with_bark=True):
    P = catmull(pts, 5)
    n = len(P)
    t = np.linspace(0, 1, n)
    R = r0 * (1 - t ** taper) + r1 * t ** taper
    R = R * (1 + 0.14 * np.sin(t * 24 + seed))
    tang = np.gradient(P, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-6
    nor = np.stack([-tang[:, 1], tang[:, 0]], 1)
    Lp = P + nor * R[:, None]; Rp = P - nor * R[:, None]
    for i in range(n - 1):
        x = float(P[i, 0])
        dark, base, lit = lerpc(BARK_DARK, x), lerpc(BARK_BASE, x), lerpc(BARK_LIT, x)
        ext = tang[i] * 1.3
        quad = [Lp[i] - ext, Lp[i + 1] + ext, Rp[i + 1] + ext, Rp[i] - ext]
        g = cairo.LinearGradient(Lp[i][0], Lp[i][1], Rp[i][0], Rp[i][1])
        pl = 0.80 if lit_side > 0 else 0.20
        g.add_color_stop_rgb(0.0, *dark); g.add_color_stop_rgb(0.18, *dark); g.add_color_stop_rgb(0.5, *base); g.add_color_stop_rgb(pl, *lit); g.add_color_stop_rgb(1.0, *dark)
        c.set_source(g)
        c.new_path(); c.move_to(*quad[0]); [c.line_to(*q) for q in quad[1:]]; c.close_path(); c.fill()
    if with_bark and r0 > 24:
        rng = np.random.default_rng(seed)
        for k in range(5):
            f = rng.uniform(-0.8, 0.8)
            c.set_source_rgba(0.0, 0.0, 0.0, 0.30); c.set_line_width(max(1.0, r0 * 0.025))
            c.new_path()
            for i in range(0, n, 2):
                q = P[i] + nor[i] * R[i] * (f + 0.06 * math.sin(i * 0.3 + k))
                (c.move_to if i == 0 else c.line_to)(*q)
            c.stroke()
        c.set_source_rgba(1.0, 0.92, 0.70, 0.22); c.set_line_width(max(1.2, r0 * 0.05))
        c.new_path()
        for i in range(0, n, 2):
            q = P[i] + nor[i] * R[i] * 0.55 * lit_side
            (c.move_to if i == 0 else c.line_to)(*q)
        c.stroke()
    return P, R


def vine_with_leaves(c, pts, r0, seed, curl=True):
    rng = np.random.default_rng(seed)
    P, R = draw_ribbon(c, pts, r0, max(1.5, r0 * 0.35), seed, taper=0.9, with_bark=False)
    n = len(P)
    for i in range(6, n - 4, 6):
        x, y = float(P[i, 0]), float(P[i, 1])
        tx, ty = P[min(i + 2, n - 1)] - P[i]
        ang = math.atan2(ty, tx)
        col = lerpc(LEAF_STOPS, x)
        for sg in (-1, 1):
            sz = rng.uniform(34, 70) * (0.8 + 0.6 * float(smoothstep(4300, 6200, x)) * (1 - float(smoothstep(7600, 8400, x))))
            c1 = tuple(min(1.0, v * 1.35 + 0.07) for v in col)
            leaf2(c, x, y, sz, ang + sg * rng.uniform(0.6, 1.2), tuple(v * rng.uniform(0.85, 1.1) for v in col), c1)
        if rng.random() < 0.20:
            fc = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.80), (0.98, 0.86, 0.42)][int(rng.integers(3))]
            for k in range(5):
                a = TAU * k / 5 + rng.uniform(0, 1)
                c.set_source_rgba(*fc, 0.95)
                c.new_path(); c.save(); c.translate(x + math.cos(a) * 9, y + math.sin(a) * 9); c.rotate(a); c.scale(11, 6); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
            c.set_source_rgba(0.95, 0.70, 0.16, 1); c.new_path(); c.arc(x, y, 4, 0, TAU); c.fill()
    if curl:
        ex, ey = float(P[-1, 0]), float(P[-1, 1])
        a0 = math.atan2(P[-1, 1] - P[-4, 1], P[-1, 0] - P[-4, 0])
        rad = rng.uniform(46, 80)
        c.set_source_rgba(*lerpc(BARK_BASE, ex), 1)
        c.set_line_width(max(2.0, r0 * 0.30))
        c.new_path()
        sp = []
        for k in range(60):
            tt = k / 59
            ang = a0 + math.pi / 2 + tt * TAU * 1.9
            rr = rad * (1 - tt * 0.92)
            sp.append((ex + math.cos(ang) * rr - math.cos(a0 + math.pi / 2) * rad, ey + math.sin(ang) * rr - math.sin(a0 + math.pi / 2) * rad))
        c.move_to(ex, ey)
        for q in sp: c.line_to(*q)
        c.stroke()
        for k in range(8):
            q = sp[int(8 + k * 6)]
            col = lerpc(LEAF_STOPS, ex)
            leaf2(c, q[0], q[1], rng.uniform(26, 44), a0 + k * 0.9, col, tuple(min(1, v * 1.4 + 0.06) for v in col))


def leaves_layer(x0, w, tier, n, seed):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(seed)
    size_mul = {0: 0.62, 1: 1.0, 2: 1.35}[tier]
    placed = 0
    while placed < n:
        x = rng.uniform(FX0 + 40, FX1 - 200)
        bell = math.exp(-((x - 6000) / 1500.0) ** 2)
        if rng.random() > 0.15 + 0.85 * bell: continue
        y = rng.uniform(-30, 640) if rng.random() < 0.82 else rng.uniform(640, 1100)
        a = float(flow_angle(x, y)) + rng.normal(0, 0.42)
        sz = rng.lognormal(math.log(58), 0.42) * size_mul * (0.65 + 0.85 * bell)
        col = lerpc(LEAF_STOPS, x + rng.normal(0, 260))
        col = tuple(float(np.clip(v * rng.uniform(0.80, 1.14), 0, 1)) for v in col)
        shade_k = {0: 0.62, 1: 0.92, 2: 1.10}[tier]
        c0 = tuple(v * shade_k for v in col)
        c1 = tuple(min(1.0, v * 1.45 + 0.07) for v in c0)
        leaf2(c, x, y, sz, a, c0, c1, vein=sz > 70)
        placed += 1
    rgb, a = L.get()
    if tier == 0:
        rgb = cv2.GaussianBlur(rgb, (0, 0), 1.6); a = cv2.GaussianBlur(a, (0, 0), 1.6)
    elif tier == 2:
        rgb = cv2.GaussianBlur(rgb, (0, 0), 1.1); a = cv2.GaussianBlur(a, (0, 0), 1.1) * 0.92
    return rgb, a


def petals_layer(x0, w, seed=3, n=900):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(seed)
    placed = 0
    while placed < n:
        x = rng.uniform(FX0 + 200, FX1 - 150)
        bell = math.exp(-((x - 6800) / 1800.0) ** 2)
        if rng.random() > bell: continue
        y = rng.uniform(0, 1000)
        a = float(flow_angle(x, y)) + rng.normal(0, 0.3)
        sz = rng.uniform(5, 15) * (0.6 + 0.8 * bell)
        col = [(0.97, 0.95, 0.90), (0.96, 0.80, 0.82), (0.98, 0.86, 0.42), (0.80, 0.88, 0.98)][int(rng.integers(4))]
        tail = sz * rng.uniform(2.5, 6)
        gr = cairo.LinearGradient(x, y, x - math.cos(a) * tail, y - math.sin(a) * tail)
        gr.add_color_stop_rgba(0, *col, 0.55); gr.add_color_stop_rgba(1, *col, 0)
        c.set_source(gr); c.set_line_width(sz * 0.7)
        c.new_path(); c.move_to(x, y); c.line_to(x - math.cos(a) * tail, y - math.sin(a) * tail); c.stroke()
        c.set_source_rgba(*col, 0.95)
        c.new_path(); c.save(); c.translate(x, y); c.rotate(a); c.scale(sz, sz * 0.5); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        placed += 1
    return L.get()


def mist_streams(x0, w):
    puffs = []
    rng = np.random.default_rng(66)
    for (sy, th0, fx) in ((770, 36, 4400), (700, 46, 4650), (590, 40, 4500), (440, 32, 4800), (320, 26, 5000), (850, 52, 4500)):
        pts = streamline(fx, sy, 260, ds=14.0)
        arc = 0.0
        prev = pts[0]
        for p in pts[1:]:
            arc += math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p
            if arc < 14: continue
            arc = 0.0
            t = (p[0] - fx) / max(1.0, 3600.0)
            if t > 1: break
            th = th0 * (0.5 + 1.2 * math.sin(math.pi * min(1, max(0, t))) ** 0.8) * rng.uniform(0.85, 1.15)
            puffs.append((p[0] + rng.normal(0, 4), p[1] + rng.normal(0, 7), th))
    Hm = G.puff_height(puffs, x0, w, H)
    n1 = fbm(x0, 0, w, H, 22, 4, 31)
    Hm = np.clip(Hm * (1 + 0.14 * n1), 0, None)
    Hm = cv2.GaussianBlur(Hm, (0, 0), 2.6)
    col = G.shade_gold(Hm)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    k = (1 - smoothstep(4600, 7200, xs))
    jade = np.array([0.52, 0.74, 0.70], np.float32)
    col = col * (1 - 0.55 * k[..., None]) + jade * (0.55 * k[..., None]) * np.clip(col.mean(-1, keepdims=True) * 1.2, 0.5, 1.0)
    a = np.clip(Hm / 15.0, 0, 1) ** 0.9 * 0.70
    a = cv2.GaussianBlur(a, (0, 0), 1.6)
    return col * a[..., None], a


def render_flow(paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    px0, A = cache_load('f_pond')
    gx0, B = cache_load('f_garden')
    x0, w = FX0, FW
    xs = np.arange(x0, x0 + w)
    a_img = A[:, np.clip(xs - px0, 0, A.shape[1] - 1)]
    b_img = B[:, np.clip(xs - gx0, 0, B.shape[1] - 1)]
    base = stagger_blend(a_img, b_img, x0, 7500.0, 1250.0, seed=11, amp=300.0)
    if verbose: print('smear blend', round(time.time() - t0, 1))
    img = base.copy()
    xsf = xs.astype(np.float32)[None, :]
    mr, ma = mist_streams(x0, w)
    img = img * (1 - ma[..., None]) + mr
    lb, lba = leaves_layer(x0, w, 0, 420, 5)
    img = img * (1 - lba[..., None]) + lb
    # vines + two canopy ribbons: they grow out of the arch's canopy (alpha ramps up from nothing so there is no seam at 4300)
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(23)
    seeds_v = [(4660, 150), (4640, 300), (4700, 470), (4620, 620), (4740, 90), (4720, 380), (4680, 720)]
    for k, (sx, sy) in enumerate(seeds_v):
        pts = streamline(sx, sy, 300 + int(rng.integers(0, 40)), 13.0)
        vine_with_leaves(c, pts[: int(len(pts) * rng.uniform(0.62, 0.9))], rng.uniform(6, 10), 100 + k, curl=True)
    for (sx, sy, r0, k) in ((4700, 205, 34, 0), (4720, 560, 28, 1)):
        pts = streamline(sx, sy, 330, 12.0)
        draw_ribbon(c, pts, r0, 5.0, 200 + k, lit_side=1 if k % 2 else -1, taper=0.75)
    rr, ra = L.get()
    ramp = smoothstep(4560, 5100, xsf)
    img = img * (1 - (ra * ramp)[..., None]) + rr * ramp[..., None]
    gm, gma = leaves_layer(x0, w, 1, 520, 7)
    img = img * (1 - gma[..., None]) + gm
    # the chain of girls on the water: reflections first, then the girls
    ch = CH.render_chain(x0, w, 4700, 8750, verbose=verbose)
    img = img * (1 - ch['refl_a'][..., None]) + ch['refl'] * ch['refl_a'][..., None]
    mist_foot = np.exp(-(((np.arange(H, dtype=np.float32)[:, None] - (HZ + 120)) / 150.0) ** 2)) * fbm01(x0, 0, w, H, 200, 3, 77, aniso=6.0) * 0.20
    img = img * (1 - ch['alpha'][..., None]) + ch['canvas'] * ch['alpha'][..., None]
    img = img * (1 - mist_foot[..., None] * (1 - ch['alpha'])[..., None]) + np.array([0.92, 0.88, 0.80], np.float32) * (mist_foot * (1 - ch['alpha']))[..., None]
    gf, gfa = leaves_layer(x0, w, 2, 160, 9)
    img = img * (1 - gfa[..., None]) + gf
    pr, pa = petals_layer(x0, w)
    img = img * (1 - pa[..., None]) + pr
    ys = np.arange(H, dtype=np.float32)[:, None]
    bloom = np.exp(-(((xsf - G.SUN_G[0]) / 2300.0) ** 2 + ((ys - 700) / 520.0) ** 2))
    img = 1 - (1 - img) * (1 - bloom[..., None] * np.array([0.20, 0.11, 0.02], np.float32))
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it:
        return img
    ang = flow_angle(np.broadcast_to(xsf, (H, w)), np.broadcast_to(ys, (H, w))).astype(np.float32)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    detail = np.clip(edges + (ch['alpha'] > 0.5) * 0.7, 0, 1)
    fine_hard = ch['alpha'] > 0.5
    sk = 0.20 + 0.45 * cv2.GaussianBlur((ch['alpha'] > 0.3).astype(np.float32), (0, 0), 4.0)
    out, n = paint(img, passes=((13, 1.0, 0.0), (7.5, 1.0, 0.025), (4.2, 1.0, 0.03), (2.3, 1.1, 0.04), (1.4, 1.3, 0.06)),
                   default_flow=ang, default_w=0.95, detail=detail, seed=21, struct_keep=sk, verbose=verbose, fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    # feather into the already-painted pond (left) and garden (right) so the strokes never seam
    mL = smoothstep(4560, 5100, xsf); mR = 1 - smoothstep(8250, 8700, xsf)
    out = a_img * (1 - mL[..., None]) + out * mL[..., None]
    out = out * mR[..., None] + b_img * (1 - mR[..., None])
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_flow()
    print('flow', round(time.time() - t, 1), 's')
    cache_save('f_flow', FX0, img)
    preview(img, WORK + '/f_flow_preview.png', 2200)
