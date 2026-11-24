"""Slide 6: THE TRIANGLE TEMPLE - golden-hour meadow (x ~4900..6900), painterly realism."""
import math
import numpy as np
import cv2
import cairo
from util import *
from sky import sky_rgb
from shared import TEMPLE
from folk import Z
from trees import leaf, catmull

TAU = 2 * math.pi
X0, X1 = 4700, 7600
MW = X1 - X0
CX, BASE_Y, APEX_Y, HALF = TEMPLE['cx'], TEMPLE['base_y'], TEMPLE['apex_y'], TEMPLE['half']
HCAM = 1.5                                   # camera height (m) -> px per metre on the ground = (y-HZ)/HCAM
S_DOOR = (BASE_Y - HZ) / HCAM


def tri_x(y, side):
    """x of the temple's left(-1)/right(+1) roof edge at height y"""
    t = (y - APEX_Y) / (BASE_Y - APEX_Y)
    return CX + side * HALF * t


# ----------------------------------------------------------------------------- sky + forest
def build_sky(x0, w):
    img = sky_rgb(x0, w, HZ)
    ys = np.arange(HZ, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    # low sun far left: warm glow bleeding along the horizon
    gl = np.exp(-(((xs - 4700) / 1500.0) ** 2 + ((ys - 700) / 330.0) ** 2))
    img = img + gl[..., None] * np.array([0.55, 0.32, 0.08], np.float32) * 0.55
    # soft cumulus lit gold on the left edges
    cl = fbm01(x0, 0, w, HZ, 240, 5, 41, aniso=3.0)
    cl = smoothstep(0.56, 0.84, cl) * (1 - smoothstep(560, 760, ys)) * smoothstep(40, 240, ys)
    cl = cv2.GaussianBlur(cl, (0, 0), 3.0)
    lit = np.clip(0.55 + 0.9 * (fbm(x0 + 7, 0, w, HZ, 180, 3, 42) * 0.7 + 0.5) - 0.0, 0.3, 1.2)
    ccol = np.array([0.97, 0.90, 0.78], np.float32) * lit[..., None] * 0.9 + np.array([0.62, 0.64, 0.72], np.float32) * (1 - lit[..., None]) * 0.5
    img = img * (1 - 0.82 * cl[..., None]) + ccol * 0.82 * cl[..., None]
    return np.clip(img, 0, 1)


def conifer(ctx, x, y, h, col):
    wd = h * 0.17
    tiers = 5
    ctx.set_source_rgba(*col, 1)
    ctx.new_path(); ctx.move_to(x - wd * 0.08, y)
    pts_l, pts_r = [], []
    for t_ in range(tiers):
        f0 = t_ / tiers; f1 = (t_ + 1) / tiers
        ww = wd * (1 - f0 * 0.82)
        pts_l += [(x - ww, y - h * (f0 + 0.55 / tiers) ), (x - ww * 0.35, y - h * f1 + h * 0.012)]
        pts_r += [(x + ww * 0.35, y - h * f1 + h * 0.012), (x + ww, y - h * (f0 + 0.55 / tiers))]
    ctx.move_to(x - wd * 0.1, y)
    ctx.line_to(x - wd, y - h * 0.05)
    for p in pts_l: ctx.line_to(*p)
    ctx.line_to(x, y - h)
    for p in reversed(pts_r): ctx.line_to(*p)
    ctx.line_to(x + wd, y - h * 0.05); ctx.line_to(x + wd * 0.1, y)
    ctx.close_path(); ctx.fill()


def forest_layers(x0, w, ss=1):
    """three misty layers of conifer + birch behind the temple, lit gold from the left"""
    out = []
    r = Z(61)
    specs = [(0.66, 0.62, 205, 520, (0.46, 0.50, 0.46)), (0.46, 0.80, 255, 640, (0.34, 0.38, 0.30)), (0.26, 0.97, 320, 380, (0.17, 0.23, 0.17))]
    sky_h = np.array([0.90, 0.84, 0.70], np.float32)
    for (haze, hmul, hmax, n, base) in specs:
        L = Layer(w, 520, x0, HZ - 470, ss)
        c = L.ctx
        for i in range(n):
            x = r.uniform(x0 - 20, x0 + w + 20)
            hh = (hmax * hmul * (0.55 + 0.6 * r.uniform(0, 1) ** 0.8)) * (1.0 - 0.35 * math.exp(-((x - CX) / 700.0) ** 2) * (1 if haze < 0.3 else 0))
            y = HZ - r.uniform(0, 14)
            warm = np.clip(0.5 + 0.5 * math.cos((x - 4700) / 1700.0), 0, 1)
            col = np.array(base) * (0.85 + 0.35 * r.random()) + np.array([0.20, 0.12, 0.02]) * warm * (1 - haze) * 1.5
            col = col * (1 - haze) + sky_h * haze
            if r.random() < 0.18:                                    # birches: pale trunks with yellow-green crowns
                cc = np.array([0.62, 0.66, 0.26]) * (1 - haze) + sky_h * haze
                for k in range(18):
                    leaf(c, x + r.normal(0, hh * .11), y - hh * r.uniform(.5, 1.0), hh * r.uniform(.07, .13), r.uniform(0, TAU), tuple(cc * r.uniform(.85, 1.1)))
            else:
                conifer(c, x, y, hh, tuple(np.clip(col, 0, 1)))
        rr, aa = L.get()
        rr = cv2.GaussianBlur(rr, (0, 0), 1.6); aa = cv2.GaussianBlur(aa, (0, 0), 1.6)
        out.append((rr, aa))
    return out


# ----------------------------------------------------------------------------- meadow, path, flower beds
def ground_color(x0, w):
    ys = np.arange(HZ, H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    t = (ys - HZ) / (H - HZ)
    far = np.array([0.72, 0.70, 0.30], np.float32); near = np.array([0.36, 0.40, 0.12], np.float32)
    col = far * (1 - t[..., None] ** 0.7) + near * t[..., None] ** 0.7
    n = fbm01(x0, HZ, w, H - HZ, 60, 4, 81, aniso=3.0)
    col = col * (0.82 + 0.4 * n[..., None])
    # mown path: lighter striped band converging on the door
    s = (ys - HZ) / HCAM
    half = 0.9 * s
    inpath = 1 - smoothstep(half * 0.94, half * 1.03, np.abs(xs - CX))
    stripe = 0.5 + 0.5 * np.sin(HCAM * 1000.0 / np.maximum(ys - HZ, 1.0) * 5.0)
    pc = np.array([0.66, 0.72, 0.28], np.float32) * (0.90 + 0.14 * stripe[..., None])
    col = col * (1 - inpath[..., None]) + pc * inpath[..., None]
    # warm sidelight from the left, long cool shadow of the temple falling right
    lit = 1.0 + 0.30 * np.exp(-((xs - 4800) / 1200.0) ** 2)
    col = col * lit[..., None]
    return col


def vnoise(u, v, seed=0):
    """smooth 2-D value noise on arrays (ground coordinates)"""
    iu, iv = np.floor(u).astype(np.int64), np.floor(v).astype(np.int64)
    fu, fv = u - iu, v - iv
    h = lambda i, j: (np.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453) % 1.0
    su, sv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    a, b_, c, d = h(iu, iv), h(iu + 1, iv), h(iu, iv + 1), h(iu + 1, iv + 1)
    return (a * (1 - su) + b_ * su) * (1 - sv) + (c * (1 - su) + d * su) * sv


FLOWER_COLS = [(0.72, 0.13, 0.17), (0.64, 0.15, 0.44), (0.92, 0.74, 0.16), (0.94, 0.92, 0.85), (0.56, 0.09, 0.15)]   # red, magenta, yellow, white, oxblood
FLOWER_EYE = [(0.95, 0.80, 0.30), (0.95, 0.78, 0.35), (0.50, 0.28, 0.06), (0.95, 0.72, 0.18), (0.95, 0.78, 0.35)]


def flower_layer(x0, w, ss=1):
    L = Layer(w, H, x0, 0, ss)
    c = L.ctx
    r = Z(71)
    pts = []
    for bed in (-1, 1):
        n = 40000
        Zd = 2.7 + 9.6 * r.uniform(0, 1, n) ** 1.25
        y = HZ + (1000.0 / Zd) * HCAM
        sc = (y - HZ) / HCAM
        X = bed * r.uniform(1.0, 3.4, n)
        x = CX + sc * X
        ok = (y > BASE_Y + 1) & (y < H + 6) & (x > x0 - 10) & (x < x0 + w + 10)
        # colour drifts live in GROUND space (lateral metres, depth metres): planted swathes that foreshorten with the path
        fam = vnoise(X * 0.80 + (40 if bed > 0 else 0), Zd * 0.115, 7) * 0.78 + vnoise(X * 2.4, Zd * 0.55, 9) * 0.22
        for i in np.nonzero(ok)[0]:
            pts.append((float(y[i]), float(x[i]), float(sc[i]), float(fam[i])))
    pts.sort()
    thr = (0.30, 0.45, 0.58, 0.72)
    for (y, x, sc, fam) in pts:
        k = int(np.searchsorted(thr, fam))
        if r.random() < 0.14: k = int(r.integers(len(FLOWER_COLS)))
        col = FLOWER_COLS[k]
        sz = min(max(sc * 0.062 * r.uniform(.8, 1.25), 1.6), 13.0)
        lightf = 1.0 + 0.22 * (1 if x < CX else -0.25)
        cc = tuple(min(1, v * lightf * r.uniform(.90, 1.06)) for v in col)
        c.set_source_rgb(0.08, 0.17, 0.05); c.new_path(); c.arc(x, y + sz * .5, sz * .95, 0, TAU); c.fill()          # leaf shade under the bloom
        if sz > 4.2:
            c.set_source_rgb(0.15, 0.30, 0.08); c.new_path(); c.arc(x - sz * .6, y + sz * .65, sz * .55, 0, TAU); c.fill(); c.new_path(); c.arc(x + sz * .6, y + sz * .7, sz * .5, 0, TAU); c.fill()
            for p in range(6):
                a_ = TAU * p / 6 + x
                c.set_source_rgb(*[v * 0.80 for v in cc]); c.new_path(); c.arc(x + math.cos(a_) * sz * .58, y + math.sin(a_) * sz * .52 + sz * .06, sz * .52, 0, TAU); c.fill()
            for p in range(6):
                a_ = TAU * p / 6 + x
                c.set_source_rgb(*cc); c.new_path(); c.arc(x + math.cos(a_) * sz * .52, y + math.sin(a_) * sz * .46, sz * .47, 0, TAU); c.fill()
            c.set_source_rgb(*FLOWER_EYE[k]); c.new_path(); c.arc(x, y, sz * .27, 0, TAU); c.fill()
        else:
            c.set_source_rgb(*cc); c.new_path(); c.arc(x, y, sz, 0, TAU); c.fill()
    return L.get()


def ground_shadow(x0, w):
    """the temple's long soft shadow, falling right across the meadow (sun low on the left)"""
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    dx = xs - (CX + HALF)
    ax = smoothstep(-40, 110, dx) * (1 - smoothstep(380, 1150, dx))
    ytop = BASE_Y - 6
    ybot = BASE_Y + 70 + 0.16 * np.clip(dx, 0, None)
    ay = smoothstep(ytop, ytop + 16, ys) * (1 - smoothstep(ybot - 24, ybot + 70, ys))
    n = 0.85 + 0.15 * fbm01(x0, 0, w, H, 90, 3, 97, aniso=4.0)
    return np.clip(ax * ay * n, 0, 1).astype(np.float32)


def grass_layer(x0, w, ss=1):
    L = Layer(w, H, x0, 0, ss)
    c = L.ctx
    r = Z(72)
    n = 30000
    ys = np.sort(HZ + 20 + (H - HZ - 10) * r.uniform(0, 1, n) ** 1.35)
    for y in ys:
        sc = (y - HZ) / HCAM
        x = r.uniform(x0 - 20, x0 + w + 20)
        # keep the path and the flower beds clear
        rel = abs(x - CX) / max(sc, 1)
        if rel < 3.45 and y > BASE_Y + 3 and r.random() > 0.004: continue
        hgt = sc * r.uniform(.10, .38)
        lean = r.normal(0, hgt * .22)
        g = r.uniform(0, 1)
        col = (0.30 + 0.38 * g, 0.42 + 0.34 * g, 0.10 + 0.10 * g)
        tip = (min(1, col[0] + .28), min(1, col[1] + .22), col[2] + .05)
        gr = cairo.LinearGradient(x, y, x + lean, y - hgt); gr.add_color_stop_rgb(0, *[v * .55 for v in col]); gr.add_color_stop_rgb(1, *tip)
        c.set_source(gr); c.set_line_width(max(1.0, sc * 0.011 * r.uniform(.7, 1.3)))
        c.new_path(); c.move_to(x, y); c.curve_to(x + lean * .2, y - hgt * .5, x + lean * .7, y - hgt * .85, x + lean, y - hgt); c.stroke()
    return L.get()


# ----------------------------------------------------------------------------- the temple
def temple_layer(x0, w, ss=2):
    L = Layer(w, H, x0, 0, ss)
    c = L.ctx
    r = Z(73)
    ap = (CX, APEX_Y); bl = (CX - HALF, BASE_Y); br = (CX + HALF, BASE_Y)
    def tri(ctx, inset=0.0):
        k = inset
        ctx.new_path(); ctx.move_to(ap[0], ap[1] + k * 2.3); ctx.line_to(br[0] - k * 1.1, br[1]); ctx.line_to(bl[0] + k * 1.1, bl[1]); ctx.close_path()
    # facade: warm mustard, lit from the left
    g = cairo.LinearGradient(bl[0], 0, br[0], 0)
    g.add_color_stop_rgb(0, 0.90, 0.68, 0.30); g.add_color_stop_rgb(0.5, 0.82, 0.62, 0.28); g.add_color_stop_rgb(1, 0.70, 0.52, 0.24)
    c.set_source(g); tri(c); c.fill()
    # planks
    c.save(); tri(c); c.clip()
    ph = 21.0
    y = APEX_Y
    k = 0
    while y < BASE_Y + 2:
        tone = r.uniform(-.05, .05)
        c.set_source_rgba(0.35 + tone, 0.22 + tone, 0.08, 0.55); c.set_line_width(1.5)
        c.new_path(); c.move_to(CX - HALF - 5, y); c.line_to(CX + HALF + 5, y); c.stroke()
        c.set_source_rgba(1, 0.88, 0.55, 0.18); c.set_line_width(1.2)
        c.new_path(); c.move_to(CX - HALF - 5, y + 1.6); c.line_to(CX + HALF + 5, y + 1.6); c.stroke()
        # butt joints
        for j in range(int(r.integers(2, 6))):
            xj = r.uniform(CX - HALF, CX + HALF)
            c.set_source_rgba(0.30, 0.18, 0.06, 0.5); c.set_line_width(1.1); c.new_path(); c.move_to(xj, y); c.line_to(xj, y + ph); c.stroke()
        y += ph; k += 1
    c.restore()
    # roof-edge trim boards (barge boards) in deeper mustard
    for side in (-1, 1):
        x_b = CX + side * HALF
        c.set_source_rgb(0.66, 0.46, 0.18); c.set_line_width(13)
        c.new_path(); c.move_to(ap[0], ap[1] + 4); c.line_to(x_b - side * 6, BASE_Y); c.stroke()
        c.set_source_rgba(1.0, 0.86, 0.5, 0.45); c.set_line_width(3)
        c.new_path(); c.move_to(ap[0] - side * 5, ap[1] + 12); c.line_to(x_b - side * 11, BASE_Y); c.stroke()
    # windows: two clean rows parallel to each roof slope, a few lit from within
    lit_set = {(-1, 0, 2), (-1, 0, 5), (1, 0, 1), (1, 0, 4), (1, 0, 6), (-1, 1, 3), (1, 1, 2)}
    for side in (-1, 1):
        d = np.array([side * HALF, BASE_Y - APEX_Y], np.float32); L_ = float(np.linalg.norm(d)); d = d / L_
        nrm = np.array([-d[1], d[0]], np.float32) * (1 if side > 0 else -1)
        nrm = nrm if nrm[0] * side < 0 else -nrm
        for row, off in enumerate((46, 104)):
            n_w = 8 if row == 0 else 6
            for i in range(n_w):
                t = (0.17 + 0.70 * i / (n_w - 1)) * (1 - 0.06 * row)
                P0 = np.array([CX, APEX_Y], np.float32) + d * (t * L_)
                xx, yy = P0 + nrm * off
                if abs(xx - CX) < 120 and yy > BASE_Y - 250: continue
                wv, hv = 20, 28
                lit = (side, row, i) in lit_set
                c.set_source_rgb(0.95, 0.86, 0.62); c.new_path(); c.rectangle(xx - wv / 2 - 3, yy - hv / 2 - 3, wv + 6, hv + 6); c.fill()
                c.set_source_rgb(*(1.0, 0.82, 0.38) if lit else (0.10, 0.08, 0.10)); c.new_path(); c.rectangle(xx - wv / 2, yy - hv / 2, wv, hv); c.fill()
                if lit:
                    gg = cairo.RadialGradient(xx, yy, 2, xx, yy, 64); gg.add_color_stop_rgba(0, 1, .8, .35, .55); gg.add_color_stop_rgba(1, 1, .8, .35, 0)
                    c.set_source(gg); c.new_path(); c.arc(xx, yy, 64, 0, TAU); c.fill()
                c.set_source_rgba(0.25, 0.15, 0.05, 0.9); c.set_line_width(1.6); c.new_path(); c.move_to(xx, yy - hv / 2); c.line_to(xx, yy + hv / 2); c.move_to(xx - wv / 2, yy); c.line_to(xx + wv / 2, yy); c.stroke()
    # the single dark square window near the apex
    c.set_source_rgb(0.90, 0.78, 0.50); c.new_path(); c.rectangle(CX - 36, 268, 72, 76); c.fill()
    c.set_source_rgb(0.06, 0.05, 0.07); c.new_path(); c.rectangle(CX - 30, 274, 60, 64); c.fill()
    c.set_source_rgba(0.30, 0.20, 0.08, 0.9); c.set_line_width(2.5); c.new_path(); c.rectangle(CX - 30, 274, 60, 64); c.stroke()
    # doorway: dark, with the first two triangular doorframes of the corridor receding to the horizon
    dw, dh = 84, 190
    dl, dr_, da = (CX - dw, BASE_Y), (CX + dw, BASE_Y), (CX, BASE_Y - dh)
    c.set_source_rgb(0.03, 0.03, 0.04); c.new_path(); c.move_to(*da); c.line_to(*dr_); c.line_to(*dl); c.close_path(); c.fill()
    for k, sc in enumerate((0.68, 0.43, 0.26)):
        apx, apy = CX, HZ - (HZ - da[1]) * sc
        by = HZ + (BASE_Y - HZ) * sc
        c.set_source_rgba(0.95, 0.74, 0.30, 0.9 - 0.2 * k); c.set_line_width(5.0 - 1.4 * k)
        c.new_path(); c.move_to(apx, apy); c.line_to(CX + dw * sc, by); c.line_to(CX - dw * sc, by); c.close_path(); c.stroke()
        c.set_source_rgba(0.05, 0.04, 0.04, 0.55); c.set_line_width(2); c.new_path(); c.move_to(apx, apy + 3); c.line_to(CX + dw * sc - 2, by); c.stroke()
    gg = cairo.RadialGradient(CX, HZ, 1, CX, HZ, 38); gg.add_color_stop_rgba(0, 1.0, 0.82, 0.45, 0.95); gg.add_color_stop_rgba(1, 1.0, 0.7, 0.3, 0)
    c.set_source(gg); c.new_path(); c.arc(CX, HZ, 38, 0, TAU); c.fill()
    # a pale figure standing inside (the girl from the pond)
    fx, fy = CX, BASE_Y - 4
    c.set_source_rgba(0.80, 0.78, 0.82, 0.70)
    c.new_path(); c.move_to(fx - 11, fy); c.curve_to(fx - 8, fy - 30, fx - 6, fy - 42, fx - 4.5, fy - 54); c.line_to(fx + 4.5, fy - 54); c.curve_to(fx + 6, fy - 42, fx + 8, fy - 30, fx + 11, fy); c.close_path(); c.fill()
    c.new_path(); c.arc(fx, fy - 60, 5.2, 0, TAU); c.fill()
    c.set_source_rgba(0.95, 0.75, 0.35, 0.8); c.new_path(); c.arc(fx, fy - 64, 6.0, math.pi * 1.05, math.pi * 1.95); c.set_line_width(1.8); c.stroke()
    # open pale-blue double doors swung outward
    for side in (-1, 1):
        hx = CX + side * (dw + 2)
        pts = [(hx, BASE_Y), (hx + side * 34, BASE_Y - 6), (hx + side * 40, BASE_Y - 196), (hx + side * 6, BASE_Y - 178)]
        gd = cairo.LinearGradient(pts[0][0], 0, pts[1][0], 0); gd.add_color_stop_rgb(0, 0.30, 0.55, 0.78); gd.add_color_stop_rgb(1, 0.52, 0.76, 0.92)
        c.set_source(gd); c.new_path(); c.move_to(*pts[0]); [c.line_to(*p) for p in pts[1:]]; c.close_path(); c.fill()
        c.set_source_rgba(0.12, 0.25, 0.42, 0.9); c.set_line_width(2.0); c.new_path(); c.move_to(*pts[0]); [c.line_to(*p) for p in pts[1:]]; c.close_path(); c.stroke()
        c.set_source_rgba(0.88, 0.95, 1.0, 0.55); c.set_line_width(1.8)
        c.new_path(); c.move_to(pts[0][0] + side * 4, pts[0][1] - 14); c.line_to(pts[2][0] - side * 4, pts[2][1] + 14); c.move_to(pts[1][0] - side * 4, pts[1][1] - 12); c.line_to(pts[3][0] + side * 4, pts[3][1] + 14); c.stroke()
    # ivy: climbing runners with leaves up both edges and over the lower facade
    def runner(x, y, ang, length, depth=0):
        px, py = x, y
        for k in range(int(length / 11)):
            a = ang + r.normal(0, .22)
            px += math.cos(a) * 11; py += math.sin(a) * 11
            c.set_source_rgba(0.08, 0.16, 0.05, 1); c.set_line_width(2.2); c.new_path(); c.move_to(px - math.cos(a) * 11, py - math.sin(a) * 11); c.line_to(px, py); c.stroke()
            for sd in (-1, 1):
                if r.random() < .72:
                    gcol = r.choice([(0.16, 0.34, 0.10), (0.22, 0.42, 0.12), (0.30, 0.50, 0.14), (0.12, 0.26, 0.08), (0.42, 0.55, 0.16)])
                    leaf(c, px, py, r.uniform(15, 27), a + sd * r.uniform(.7, 1.5), gcol)
            if depth < 1 and r.random() < .06:
                runner(px, py, a + r.choice([-1, 1]) * r.uniform(.5, 1.1), length * 0.35, depth + 1)
    for side, top in ((-1, 0.40), (1, 0.62)):
        for j in range(4):
            yy = BASE_Y - 6 - j * 6
            xx = tri_x(yy, side) - side * (14 + 12 * j)
            ang = math.atan2(APEX_Y - BASE_Y, -side * HALF) + r.normal(0, .06)
            runner(xx, yy, ang + (math.pi if side < 0 else 0) * 0, (BASE_Y - APEX_Y) * top * r.uniform(.75, 1.1) / 0.9)
    for j in range(8):
        runner(r.uniform(CX - HALF * .75, CX + HALF * .75), BASE_Y - 4, -math.pi / 2 + r.normal(0, .55), r.uniform(60, 190))
    for j in range(14):                                                            # leaves spilling over the roof edge
        side = r.choice([-1, 1]); yy = r.uniform(APEX_Y + 80, BASE_Y - 200)
        runner(tri_x(yy, side), yy, math.pi / 2 - side * 0.9 + r.normal(0, .3), r.uniform(25, 70))
    # sun-struck highlights on the left edge, ground contact shadow
    c.save(); tri(c); c.clip()
    gl = cairo.LinearGradient(bl[0], 0, CX, 0); gl.add_color_stop_rgba(0, 1.0, 0.85, 0.5, 0.20); gl.add_color_stop_rgba(1, 1.0, 0.85, 0.5, 0)
    c.set_source(gl); c.new_path(); c.rectangle(bl[0], APEX_Y, HALF, BASE_Y - APEX_Y); c.fill()
    c.restore()
    return L.get()


def render_meadow(x0=X0, w=MW, paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    sky = build_sky(x0, w)
    img = np.zeros((H, w, 3), np.float32)
    img[:HZ] = sky
    for (rr, aa) in forest_layers(x0, w):
        sl = img[HZ - 470:HZ + 50]
        img[HZ - 470:HZ + 50] = sl * (1 - aa[..., None]) + rr
    # golden haze band at the forest base (the jade ribbon of slide 5 turns into this)
    ys = np.arange(H, dtype=np.float32)[:, None]
    hz = np.exp(-((ys - (HZ - 36)) / 62.0) ** 2) * (0.40 + 0.35 * fbm01(x0, 0, w, H, 200, 3, 85, aniso=6.0))
    img = img * (1 - hz[..., None]) + np.array([0.98, 0.86, 0.60], np.float32) * hz[..., None] * 0.9
    gc = ground_color(x0, w)
    img[HZ:] = gc
    fr, fa = flower_layer(x0, w); img = img * (1 - fa[..., None]) + fr
    gr_, ga = grass_layer(x0, w); img = img * (1 - ga[..., None]) + gr_
    shd = ground_shadow(x0, w)
    img = img * (1 - 0.52 * shd[..., None]) + np.array([0.05, 0.09, 0.17], np.float32) * (0.52 * shd[..., None])
    tr, ta = temple_layer(x0, w)
    # wood grain on the planks
    grain = fbm(x0, 0, w, H, 90, 3, 86, aniso=14.0)
    tr = tr * (1 + 0.13 * grain)[..., None]
    img = img * (1 - ta[..., None]) + tr
    if verbose: print('meadow base', round(time.time() - t0, 1))
    img = np.clip(img, 0, 1).astype(np.float32)
    if not paint_it: return img
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    detail = np.clip(edges + (ta > 0.5) * 0.45, 0, 1)
    out, n = paint(img, passes=((13, 1.0, 0.0), (7.5, 1.0, 0.025), (4.2, 1.0, 0.03), (2.3, 1.1, 0.04), (1.5, 1.3, 0.06)),
                   default_flow=0.0, default_w=0.5, detail=detail, seed=9, struct_keep=0.30, verbose=verbose)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    return out.astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_meadow()
    print('meadow', round(time.time() - t, 1))
    cache_save('s6', X0, img)
    preview(img, WORK + '/s6_preview.png', 1900)
    save_png(WORK + '/s6_slide6.png', img[:, 5400 - X0:6480 - X0])
