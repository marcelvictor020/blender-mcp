"""The plank A-frame, painted realistically: weathered clapboards (bevels, butt joints, nails, rain streaks, algae at the foot), carved bargeboards,
real casement windows (casing, mullions, sill, cast shadow, glass reflecting the sunset or glowing from a lamp behind a curtain, flower boxes),
the one dark square window near the apex with open shutters, pale-blue double doors painted with folk flowers, steps, pots, wall lanterns, ivy."""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import TEMPLE
import fig
from fig import Light
from fold import leaf2

TAU = 2 * math.pi
CXG, APEX_Y, BASE_Y, HALF = TEMPLE['cx'], TEMPLE['apex_y'], TEMPLE['base_y'], TEMPLE['half']
BX0, BX1 = int(CXG - HALF - 70), int(CXG + HALF + 70)
BY0, BY1 = int(APEX_Y - 50), int(BASE_Y + 46)
WL, HL = BX1 - BX0, BY1 - BY0
DW, DH = 118, 200


def _over(canvas, alpha, rgb, a, x0, y0):
    h, w = a.shape
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(canvas.shape[1], x0 + w), min(canvas.shape[0], y0 + h)
    if xa >= xb or ya >= yb: return
    sa = a[ya - y0:yb - y0, xa - x0:xb - x0]
    sc = rgb[ya - y0:yb - y0, xa - x0:xb - x0]
    canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sa)[..., None] + sc * sa[..., None]
    alpha[ya:yb, xa:xb] = alpha[ya:yb, xa:xb] * (1 - sa) + sa


def facade():
    """weathered clapboard, lit by the low sun from the left; (HL,WL,3) in local coordinates"""
    ys = (np.arange(HL, dtype=np.float32) + BY0)[:, None]
    xs = (np.arange(WL, dtype=np.float32) + BX0)[None, :]
    ph = 18.0
    kk = np.floor((ys - APEX_Y) / ph); fr = (ys - APEX_Y) / ph - kk
    h1 = lambda a: np.sin(a * 12.9898 + 4.1) * 43758.5453 % 1.0
    r1, r2, r3 = h1(kk), h1(kk + 17.3), h1(kk + 91.7)
    ochre = np.array([0.80, 0.60, 0.17], np.float32); gold = np.array([0.98, 0.82, 0.30], np.float32); grey = np.array([0.66, 0.58, 0.40], np.float32)
    base = ochre * (1 - r1)[..., None] + gold * r1[..., None]
    wth = (r2 > 0.82).astype(np.float32)[..., None] * 0.42
    base = base * (1 - wth) + grey * wth
    gr = 0.5 * fbm(BX0, BY0, WL, HL, 7, 4, 301, aniso=55.0) + 0.5 * fbm(BX0, BY0, WL, HL, 3, 3, 302, aniso=70.0)
    col = base * (1 + 0.17 * gr)[..., None]
    hi = smoothstep(0.0, 0.07, fr) * (1 - smoothstep(0.07, 0.22, fr))
    sh = smoothstep(0.72, 1.0, fr)
    seam = smoothstep(0.95, 1.0, fr)
    col = col * (1 + 0.22 * hi - 0.36 * sh - 0.34 * seam)[..., None]
    Lj = 250 + 120 * r3
    off = 400 * r2
    jx = (xs - off) % Lj
    dj = np.minimum(jx, Lj - jx)
    joint = np.exp(-(dj / 1.2) ** 2) * (fr < 0.95)
    col = col * (1 - 0.50 * joint)[..., None]
    for sgn in (-1, 1):
        nail = np.exp(-(((dj - 9.0) ** 2 + ((fr - 0.46) * ph) ** 2) / 1.6)) * (jx < Lj / 2 if sgn < 0 else jx >= Lj / 2)
        col = col * (1 - 0.55 * nail)[..., None]
    st = fbm(BX0, BY0, WL, HL, 50, 3, 303, aniso=0.035)
    col = col * (1 - 0.16 * np.clip(st * 2.0, 0, 1))[..., None]
    gy = smoothstep(BASE_Y - 170, BASE_Y, ys)
    grime = gy * (0.40 + 0.60 * fbm01(BX0, BY0, WL, HL, 60, 3, 305, aniso=2.5))
    col = col * (1 - 0.40 * grime)[..., None] + np.array([0.26, 0.36, 0.13], np.float32) * (0.26 * grime)[..., None]
    u = np.clip((xs - (CXG - HALF)) / (2 * HALF), 0, 1)
    ty = np.clip((ys - APEX_Y) / (BASE_Y - APEX_Y), 0, 1)
    sun = np.array([1.0, 0.86, 0.62], np.float32); amb = np.array([0.20, 0.19, 0.32], np.float32)
    light = sun[None, None, :] * (1.14 - 0.56 * u)[..., None] + amb[None, None, :] * (0.34 + 0.24 * (1 - ty))[..., None]
    col = col * light
    rb = np.clip(1 - np.abs((xs - (CXG + HALF * (ys - APEX_Y) / (BASE_Y - APEX_Y))) / 30.0), 0, 1)           # shadow under the right bargeboard
    col = col * (1 - 0.32 * rb)[..., None]
    lb = np.exp(-np.maximum(xs - (CXG - HALF * (ys - APEX_Y) / (BASE_Y - APEX_Y)), 0) / 14.0) * (xs >= CXG - HALF * (ys - APEX_Y) / (BASE_Y - APEX_Y))
    col = col + np.array([0.22, 0.12, 0.02], np.float32) * (lb * 0.45)[..., None]
    return np.clip(col, 0, 1)


def tri_mask():
    L = Layer(WL, HL, BX0, BY0, 2)
    c = L.ctx
    c.new_path(); c.move_to(CXG, APEX_Y); c.line_to(CXG + HALF, BASE_Y); c.line_to(CXG - HALF, BASE_Y); c.close_path(); c.set_source_rgb(1, 1, 1); c.fill()
    return L.get()[1]


# ------------------------------------------------------------------------------------------------ pieces
def bargeboards(c):
    ap = (CXG, APEX_Y)
    for side in (-1, 1):
        xb = CXG + side * HALF
        dx, dy = xb - ap[0], BASE_Y - ap[1]
        L = math.hypot(dx, dy); ux, uy = dx / L, dy / L; nx, ny = -uy * side, ux * side
        wd = 17
        quad = [ap, (xb, BASE_Y), (xb - nx * wd * 1.2, BASE_Y - ny * wd * 1.2), (ap[0] - nx * wd * 1.2, ap[1] - ny * wd * 1.2 + 6)]
        g = cairo.LinearGradient(ap[0] + 0, ap[1], ap[0] - nx * wd, ap[1] - ny * wd)
        if side < 0: g.add_color_stop_rgb(0, 1.0, 0.82, 0.50); g.add_color_stop_rgb(0.4, 0.66, 0.44, 0.20); g.add_color_stop_rgb(1, 0.40, 0.26, 0.12)
        else: g.add_color_stop_rgb(0, 0.46, 0.30, 0.14); g.add_color_stop_rgb(0.5, 0.36, 0.23, 0.11); g.add_color_stop_rgb(1, 0.24, 0.15, 0.07)
        c.set_source(g); c.new_path(); c.move_to(*quad[0]); [c.line_to(*q) for q in quad[1:]]; c.close_path(); c.fill()
        c.set_source_rgba(0.05, 0.03, 0.02, 0.55); c.set_line_width(1.3); c.new_path(); c.move_to(*quad[0]); [c.line_to(*q) for q in quad[1:]]; c.close_path(); c.stroke()
        # carved scalloped trim along the inner edge
        n = int(L / 24)
        c.set_source_rgb(0.34, 0.22, 0.10) if side > 0 else c.set_source_rgb(0.62, 0.42, 0.19)
        for i in range(2, n - 1):
            t = i / n
            px, py = ap[0] + dx * t - nx * wd * 1.2 * -1 * 0, ap[1] + dy * t
            c.new_path(); c.arc(px - nx * 6, py - ny * 6 + 0, 4.3, 0, TAU); c.fill()
    # finial
    c.set_source_rgb(0.30, 0.19, 0.09); c.new_path(); c.rectangle(CXG - 3, APEX_Y - 34, 6, 38); c.fill()
    g = cairo.RadialGradient(CXG - 2, APEX_Y - 40, 1, CXG, APEX_Y - 38, 8); g.add_color_stop_rgb(0, 1.0, 0.86, 0.50); g.add_color_stop_rgb(1, 0.62, 0.38, 0.12)
    c.set_source(g); c.new_path(); c.arc(CXG, APEX_Y - 38, 7.5, 0, TAU); c.fill()


def window(c, cx, cy, wv, hv, kind, rng, box=False, shut=False):
    """a casement window on the facade at centre (cx,cy)"""
    for k in range(4):                                                                  # soft cast shadow to the right/down
        c.set_source_rgba(0.04, 0.02, 0.01, 0.10 - 0.02 * k); c.new_path()
        c.rectangle(cx - wv / 2 - 6 + 2 + k * 1.5, cy - hv / 2 - 6 + 3 + k * 1.5, wv + 12, hv + 12); c.fill()
    # casing
    c.set_source_rgb(0.94, 0.90, 0.80); c.new_path(); c.rectangle(cx - wv / 2 - 6, cy - hv / 2 - 6, wv + 12, hv + 12); c.fill()
    c.set_source_rgba(0.35, 0.28, 0.18, 0.5); c.set_line_width(1.2); c.new_path(); c.rectangle(cx - wv / 2 - 6, cy - hv / 2 - 6, wv + 12, hv + 12); c.stroke()
    c.set_source_rgba(0.30, 0.24, 0.14, 0.35); c.new_path(); c.rectangle(cx - wv / 2 - 6, cy + hv / 2 + 2, wv + 12, 4); c.fill()
    # glass
    c.save(); c.new_path(); c.rectangle(cx - wv / 2, cy - hv / 2, wv, hv); c.clip()
    if kind == 'lit':
        g = cairo.RadialGradient(cx, cy + hv * 0.1, 1, cx, cy, hv * 0.75); g.add_color_stop_rgb(0, 1.0, 0.90, 0.58); g.add_color_stop_rgb(0.55, 1.0, 0.72, 0.28); g.add_color_stop_rgb(1, 0.78, 0.40, 0.12)
        c.set_source(g); c.paint()
        for sx in (-1, 1):                                                              # curtains
            c.set_source_rgba(0.96, 0.92, 0.84, 0.92); c.new_path(); c.move_to(cx + sx * wv / 2, cy - hv / 2); c.curve_to(cx + sx * wv * 0.18, cy - hv * 0.2, cx + sx * wv * 0.42, cy + hv * 0.2, cx + sx * wv * 0.12, cy + hv / 2); c.line_to(cx + sx * wv / 2, cy + hv / 2); c.close_path(); c.fill()
            c.set_source_rgba(0.7, 0.55, 0.40, 0.4); c.set_line_width(0.9); c.new_path(); c.move_to(cx + sx * wv * 0.28, cy - hv * 0.4); c.curve_to(cx + sx * wv * 0.30, cy, cx + sx * wv * 0.30, cy + hv * 0.2, cx + sx * wv * 0.20, cy + hv * 0.45); c.stroke()
    else:
        g = cairo.LinearGradient(0, cy - hv / 2, 0, cy + hv / 2)
        if kind == 'sky': g.add_color_stop_rgb(0, 0.46, 0.55, 0.80); g.add_color_stop_rgb(0.55, 0.92, 0.66, 0.60); g.add_color_stop_rgb(1, 1.0, 0.70, 0.40)
        else: g.add_color_stop_rgb(0, 0.20, 0.26, 0.44); g.add_color_stop_rgb(0.6, 0.30, 0.26, 0.34); g.add_color_stop_rgb(1, 0.10, 0.08, 0.10)
        c.set_source(g); c.paint()
        c.set_source_rgba(1, 1, 1, 0.26 if kind == 'sky' else 0.16); c.new_path()                         # diagonal glare
        c.move_to(cx - wv * 0.55, cy + hv * 0.1); c.line_to(cx - wv * 0.05, cy - hv * 0.55); c.line_to(cx + wv * 0.20, cy - hv * 0.55); c.line_to(cx - wv * 0.30, cy + hv * 0.1 + hv * 0.0); c.close_path(); c.fill()
        c.set_source_rgba(0.05, 0.04, 0.04, 0.35); c.new_path(); c.rectangle(cx - wv / 2, cy + hv * 0.18, wv, hv * 0.34); c.fill()    # room interior below the sill line
    c.restore()
    # muntins
    c.set_source_rgb(0.92, 0.88, 0.78); c.set_line_width(2.0)
    c.new_path(); c.move_to(cx, cy - hv / 2); c.line_to(cx, cy + hv / 2); c.stroke()
    for fy in (-1 / 6, 1 / 6):
        c.new_path(); c.move_to(cx - wv / 2, cy + hv * fy); c.line_to(cx + wv / 2, cy + hv * fy); c.stroke()
    c.set_source_rgba(0.25, 0.20, 0.12, 0.7); c.set_line_width(1.0); c.new_path(); c.rectangle(cx - wv / 2, cy - hv / 2, wv, hv); c.stroke()
    # sill
    c.set_source_rgb(0.90, 0.85, 0.74); c.new_path(); c.rectangle(cx - wv / 2 - 9, cy + hv / 2 + 6, wv + 18, 5); c.fill()
    c.set_source_rgba(0.1, 0.06, 0.03, 0.5); c.new_path(); c.rectangle(cx - wv / 2 - 9, cy + hv / 2 + 11, wv + 18, 3); c.fill()
    if box:
        c.set_source_rgb(0.40, 0.25, 0.13); c.new_path(); c.rectangle(cx - wv / 2 - 8, cy + hv / 2 + 11, wv + 16, 11); c.fill()
        c.set_source_rgba(0.1, 0.05, 0.02, 0.5); c.new_path(); c.rectangle(cx - wv / 2 - 8, cy + hv / 2 + 20, wv + 16, 2); c.fill()
        for k in range(9):
            fx = cx - wv / 2 - 4 + k * (wv + 8) / 8
            c.set_source_rgb(0.16, 0.34, 0.12); c.new_path(); c.arc(fx, cy + hv / 2 + 9, 5.0, 0, TAU); c.fill()
            col = [(0.86, 0.14, 0.18), (0.96, 0.42, 0.50), (0.97, 0.94, 0.90)][k % 3]
            c.set_source_rgb(*col); c.new_path(); c.arc(fx + rng.normal(0, 1), cy + hv / 2 + 4 + rng.normal(0, 1.5), 3.8, 0, TAU); c.fill()
    if shut:
        for sx in (-1, 1):
            x0s = cx + sx * (wv / 2 + 7) - (0 if sx > 0 else 14)
            c.set_source_rgb(0.50, 0.74, 0.88); c.new_path(); c.rectangle(x0s, cy - hv / 2 - 4, 14, hv + 8); c.fill()
            c.set_source_rgba(0.10, 0.22, 0.34, 0.8); c.set_line_width(1.0); c.new_path(); c.rectangle(x0s, cy - hv / 2 - 4, 14, hv + 8); c.stroke()


def windows(c, rng):
    lit = {(-1, 0, 2), (-1, 0, 4), (1, 0, 1), (1, 0, 3), (-1, 1, 2), (1, 1, 1), (1, 1, 3), (-1, 0, 0)}
    for side in (-1, 1):
        d = np.array([side * HALF, BASE_Y - APEX_Y], np.float32); L_ = float(np.linalg.norm(d)); d = d / L_
        nrm = np.array([-d[1], d[0]], np.float32) * (1 if side > 0 else -1)
        nrm = nrm if nrm[0] * side < 0 else -nrm
        for row, off in enumerate((68, 142)):
            n_w = 6 if row == 0 else 5
            for i in range(n_w):
                t = (0.17 + 0.62 * i / (n_w - 1)) * (1 - 0.06 * row)
                P0 = np.array([CXG, APEX_Y], np.float32) + d * (t * L_)
                xx, yy = P0 + nrm * off
                if abs(xx - CXG) < 175 and yy > BASE_Y - 270: continue
                if abs(xx - CXG) < 56 and yy < 380: continue
                kind = 'lit' if (side, row, i) in lit else ('sky' if rng.random() < 0.62 else 'dark')
                window(c, float(xx), float(yy), 29, 39, kind, rng, box=(yy > BASE_Y - 330 and rng.random() < 0.55))


def apex_window(c, rng):
    cx, cy = CXG, 306
    for k in range(5):
        c.set_source_rgba(0.04, 0.02, 0.01, 0.10 - 0.015 * k); c.new_path(); c.rectangle(cx - 44 + 3 + k, cy - 44 + 5 + k, 88, 88); c.fill()
    c.set_source_rgb(0.40, 0.27, 0.13); c.new_path(); c.rectangle(cx - 44, cy - 44, 88, 88); c.fill()
    c.set_source_rgb(0.04, 0.035, 0.05); c.new_path(); c.rectangle(cx - 34, cy - 34, 68, 68); c.fill()
    g = cairo.RadialGradient(cx + 6, cy + 12, 1, cx, cy + 8, 40); g.add_color_stop_rgba(0, 1.0, 0.72, 0.30, 0.55); g.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)
    c.set_source(g); c.new_path(); c.rectangle(cx - 34, cy - 34, 68, 68); c.fill()
    c.set_source_rgba(0.95, 0.90, 0.82, 0.45); c.new_path(); c.move_to(cx - 34, cy - 34); c.curve_to(cx - 20, cy - 8, cx - 28, cy + 10, cx - 34, cy + 34); c.line_to(cx - 34, cy - 34); c.fill()
    c.set_source_rgba(1, 1, 1, 0.12); c.new_path(); c.move_to(cx - 30, cy + 8); c.line_to(cx + 4, cy - 34); c.line_to(cx + 16, cy - 34); c.line_to(cx - 14, cy + 8); c.close_path(); c.fill()
    c.set_source_rgb(0.90, 0.85, 0.74); c.set_line_width(3); c.new_path(); c.move_to(cx, cy - 34); c.line_to(cx, cy + 34); c.move_to(cx - 34, cy); c.line_to(cx + 34, cy); c.stroke()
    c.set_source_rgba(0.12, 0.08, 0.04, 0.8); c.set_line_width(1.3); c.new_path(); c.rectangle(cx - 34, cy - 34, 68, 68); c.stroke()
    for sx in (-1, 1):
        x0s = cx + sx * 52 - (0 if sx > 0 else 18)
        c.set_source_rgb(0.50, 0.74, 0.88); c.new_path(); c.rectangle(x0s, cy - 40, 18, 80); c.fill()
        c.set_source_rgba(0.88, 0.40, 0.40, 0.9); c.new_path(); c.move_to(x0s + 9, cy + 6); c.curve_to(x0s + 2, cy - 4, x0s + 6, cy - 12, x0s + 9, cy - 6); c.curve_to(x0s + 12, cy - 12, x0s + 16, cy - 4, x0s + 9, cy + 6); c.fill()
        c.set_source_rgba(0.10, 0.22, 0.34, 0.8); c.set_line_width(1.0); c.new_path(); c.rectangle(x0s, cy - 40, 18, 80); c.stroke()


def doorway(c):
    """dark triangular opening with nested receding frames and a glow far down the corridor"""
    dl, dr, da = (CXG - DW, BASE_Y), (CXG + DW, BASE_Y), (CXG, BASE_Y - DH)
    c.set_source_rgb(0.035, 0.03, 0.04); c.new_path(); c.move_to(*da); c.line_to(*dr); c.line_to(*dl); c.close_path(); c.fill()
    g = cairo.RadialGradient(CXG, HZ, 1, CXG, HZ + 30, 150); g.add_color_stop_rgba(0, 1.0, 0.84, 0.50, 0.85); g.add_color_stop_rgba(1, 1.0, 0.7, 0.3, 0)
    c.save(); c.new_path(); c.move_to(*da); c.line_to(*dr); c.line_to(*dl); c.close_path(); c.clip(); c.set_source(g); c.paint(); c.restore()
    for kk, sc in enumerate((0.68, 0.45, 0.30, 0.20)):
        apx, apy = CXG, HZ - (HZ - da[1]) * sc
        by = HZ + (BASE_Y - HZ) * sc
        c.set_source_rgba(0.95, 0.74, 0.30, 0.88 - 0.17 * kk); c.set_line_width(5.0 - 1.1 * kk)
        c.new_path(); c.move_to(apx, apy); c.line_to(CXG + DW * sc, by); c.line_to(CXG - DW * sc, by); c.close_path(); c.stroke()
    c.set_source_rgb(0.34, 0.22, 0.10); c.set_line_width(7)                                                    # the frame itself
    c.new_path(); c.move_to(*dl); c.line_to(*da); c.line_to(*dr); c.stroke()
    c.set_source_rgba(1.0, 0.82, 0.50, 0.40); c.set_line_width(2); c.new_path(); c.move_to(dl[0] + 3, dl[1]); c.line_to(da[0] - 1, da[1] + 5); c.stroke()


class Quad:
    def __init__(self, A, B, C, D, wu, hv):
        self.A, self.B, self.C, self.D, self.wu, self.hv = A, B, C, D, wu, hv

    def P(self, u, v):
        s, t = u / self.wu, v / self.hv
        bx = (self.A[0] + (self.B[0] - self.A[0]) * s, self.A[1] + (self.B[1] - self.A[1]) * s)
        tx = (self.D[0] + (self.C[0] - self.D[0]) * s, self.D[1] + (self.C[1] - self.D[1]) * s)
        return bx[0] + (tx[0] - bx[0]) * t, bx[1] + (tx[1] - bx[1]) * t


def qpoly(c, q, pts, fill=None, stroke=None, lw=1.0):
    c.new_path()
    for i, (u, v) in enumerate(pts):
        x, y = q.P(u, v); (c.move_to if i == 0 else c.line_to)(x, y)
    c.close_path()
    if fill is not None:
        c.set_source_rgba(*fill); c.fill_preserve() if stroke is not None else c.fill()
    if stroke is not None:
        c.set_source_rgba(*stroke); c.set_line_width(lw); c.stroke()


def qell(c, q, cu, cv, ru, rv, rot=0.0, fill=None, stroke=None, lw=1.0, n=20):
    pts = [(cu + ru * math.cos(TAU * i / n) * math.cos(rot) - rv * math.sin(TAU * i / n) * math.sin(rot),
            cv + ru * math.cos(TAU * i / n) * math.sin(rot) + rv * math.sin(TAU * i / n) * math.cos(rot)) for i in range(n)]
    qpoly(c, q, pts, fill, stroke, lw)


def door_leaf(c, side, lit):
    hx = CXG + side * (DW + 2)
    A, B, C, D = (hx, BASE_Y), (hx + side * 40, BASE_Y - 8), (hx + side * 46, BASE_Y - 214), (hx + side * 6, BASE_Y - 194)
    q = Quad(A, B, C, D, 118.0, 200.0)
    # leaf body: pale-blue paint, brighter on the sunward side
    g = cairo.LinearGradient(A[0], 0, B[0], 0)
    if lit: g.add_color_stop_rgb(0, 0.34, 0.62, 0.80); g.add_color_stop_rgb(1, 0.60, 0.82, 0.94)
    else: g.add_color_stop_rgb(0, 0.20, 0.42, 0.62); g.add_color_stop_rgb(1, 0.34, 0.58, 0.78)
    c.set_source(g); c.new_path(); c.move_to(*A); c.line_to(*B); c.line_to(*C); c.line_to(*D); c.close_path(); c.fill()
    # panel mouldings
    for (u0, v0, u1, v1) in ((10, 12, 108, 84), (10, 96, 108, 172)):
        qpoly(c, q, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], None, (0.08, 0.20, 0.34, 0.65), 1.4)
        qpoly(c, q, [(u0 + 3, v0 + 3), (u1 - 3, v0 + 3), (u1 - 3, v1 - 3), (u0 + 3, v1 - 3)], None, (0.92, 0.97, 1.0, 0.45), 1.0)
    # folk painting: kurbits flower with leaves, vine border, dots
    cu, cv = 59, 128
    for (du, dv, rot) in ((-30, -34, 0.6), (30, -34, -0.6), (-34, -14, 0.9), (34, -14, -0.9)):
        qell(c, q, cu + du, cv + dv - 8, 17, 7, rot, (0.14, 0.36, 0.18, 1.0), (0.04, 0.12, 0.06, 0.8), 0.9)
    for k in range(8):
        a = TAU * k / 8
        qell(c, q, cu + 16 * math.cos(a), cv + 16 * math.sin(a), 11, 6.5, a, (0.80, 0.18, 0.16, 1.0), (0.30, 0.04, 0.04, 0.9), 0.9)
    for k in range(8):
        a = TAU * k / 8 + math.pi / 8
        qell(c, q, cu + 10 * math.cos(a), cv + 10 * math.sin(a), 7, 4.2, a, (0.97, 0.90, 0.72, 1.0), None)
    qell(c, q, cu, cv, 7, 7, 0, (0.95, 0.74, 0.20, 1.0), (0.4, 0.2, 0.0, 0.8), 0.9)
    for k in range(6):
        qell(c, q, cu + 3.5 * math.cos(TAU * k / 6), cv + 3.5 * math.sin(TAU * k / 6), 1.2, 1.2, 0, (0.55, 0.10, 0.08, 1.0), None, n=8)
    for cu2, cv2 in ((59, 40), (30, 40), (88, 40)):
        qell(c, q, cu2, cv2, 9, 5.5, 0.3, (0.97, 0.90, 0.72, 1.0), (0.3, 0.2, 0.1, 0.5), 0.8)
        qell(c, q, cu2, cv2, 3.4, 3.4, 0, (0.84, 0.22, 0.20, 1.0), None, n=10)
    # edge thickness (the free edge of the open leaf) + hinges + pull
    c.set_source_rgba(0.06, 0.12, 0.20, 0.85); c.set_line_width(3.0); c.new_path(); c.move_to(*B); c.line_to(*C); c.stroke()
    for v in (30, 100, 170):
        x1, y1 = q.P(0, v); x2, y2 = q.P(30, v + 1)
        c.set_source_rgb(0.05, 0.05, 0.06); c.set_line_width(3.2); c.new_path(); c.move_to(x1, y1); c.line_to(x2, y2); c.stroke()
        c.set_source_rgba(1, 1, 1, 0.20); c.set_line_width(0.9); c.new_path(); c.move_to(x1, y1 - 1); c.line_to(x2, y2 - 1); c.stroke()
    px, py = q.P(104, 96)
    c.set_source_rgb(0.80, 0.62, 0.20); c.new_path(); c.arc(px, py, 3.4, 0, TAU); c.stroke()


def steps(c):
    for k, (y, w, col) in enumerate(((BASE_Y + 3, 190, (0.62, 0.58, 0.52)), (BASE_Y + 15, 214, (0.56, 0.52, 0.47)), (BASE_Y + 27, 238, (0.50, 0.46, 0.42)))):
        c.set_source_rgb(*[v * 1.12 for v in col]); c.new_path(); c.rectangle(CXG - w / 2, y, w, 7); c.fill()
        c.set_source_rgb(*[v * 0.74 for v in col]); c.new_path(); c.rectangle(CXG - w / 2, y + 7, w, 5); c.fill()
        c.set_source_rgba(1.0, 0.85, 0.55, 0.28); c.new_path(); c.rectangle(CXG - w / 2, y, w * 0.4, 2); c.fill()
        c.set_source_rgba(0.04, 0.03, 0.02, 0.35); c.new_path(); c.rectangle(CXG - w / 2, y + 12, w, 2); c.fill()


def pots(c, rng):
    for sx in (-1, 1):
        for k, (dx, sc) in enumerate(((236, 1.0), (276, 0.78))):
            x, y = CXG + sx * dx, BASE_Y + 6
            g = cairo.LinearGradient(x - 18 * sc, 0, x + 18 * sc, 0); g.add_color_stop_rgb(0, 0.86, 0.50, 0.30); g.add_color_stop_rgb(0.5, 0.74, 0.40, 0.22); g.add_color_stop_rgb(1, 0.46, 0.22, 0.12)
            c.set_source(g); c.new_path(); c.move_to(x - 20 * sc, y - 34 * sc); c.line_to(x + 20 * sc, y - 34 * sc); c.line_to(x + 14 * sc, y); c.line_to(x - 14 * sc, y); c.close_path(); c.fill()
            c.set_source_rgb(0.80, 0.46, 0.26); c.new_path(); c.rectangle(x - 23 * sc, y - 40 * sc, 46 * sc, 8 * sc); c.fill()
            for j in range(11):
                a = rng.uniform(math.pi, TAU); rr = rng.uniform(8, 30) * sc
                lx, ly = x + math.cos(a) * rr * 1.3, y - 40 * sc + math.sin(a) * rr * 0.7 - 6
                c.set_source_rgb(0.14 + 0.1 * rng.random(), 0.34 + 0.1 * rng.random(), 0.10); c.new_path(); c.arc(lx, ly, 8 * sc, 0, TAU); c.fill()
            for j in range(7):
                a = rng.uniform(math.pi * 1.1, math.pi * 1.9); rr = rng.uniform(4, 22) * sc
                fx, fy = x + math.cos(a) * rr * 1.2, y - 48 * sc + math.sin(a) * rr * 0.9
                col = [(0.90, 0.12, 0.16), (0.98, 0.50, 0.56), (0.97, 0.94, 0.90)][j % 3]
                for p in range(5):
                    b = TAU * p / 5
                    c.set_source_rgb(*col); c.new_path(); c.arc(fx + math.cos(b) * 3.2 * sc, fy + math.sin(b) * 3.2 * sc, 3.2 * sc, 0, TAU); c.fill()
                c.set_source_rgb(0.98, 0.78, 0.24); c.new_path(); c.arc(fx, fy, 1.6 * sc, 0, TAU); c.fill()
            c.set_source_rgba(0.03, 0.05, 0.02, 0.40); c.new_path(); c.save(); c.translate(x + 26 * sc, y + 3); c.scale(34 * sc, 5 * sc); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def lanterns(c):
    for sx in (-1, 1):
        x, y = CXG + sx * 168, BASE_Y - 290
        c.set_source_rgb(0.08, 0.06, 0.05); c.set_line_width(2.4); c.new_path(); c.move_to(x - sx * 12, y - 14); c.line_to(x, y - 14); c.line_to(x, y - 6); c.stroke()
        g = cairo.RadialGradient(x, y + 6, 1, x, y + 6, 70); g.add_color_stop_rgba(0, 1.0, 0.80, 0.40, 0.55); g.add_color_stop_rgba(1, 1.0, 0.65, 0.25, 0)
        c.set_source(g); c.new_path(); c.arc(x, y + 6, 70, 0, TAU); c.fill()
        c.set_source_rgb(0.08, 0.06, 0.05); c.new_path(); c.move_to(x - 9, y - 6); c.line_to(x + 9, y - 6); c.line_to(x + 6, y - 11); c.line_to(x - 6, y - 11); c.close_path(); c.fill()
        g2 = cairo.LinearGradient(0, y - 6, 0, y + 20); g2.add_color_stop_rgb(0, 1.0, 0.95, 0.70); g2.add_color_stop_rgb(1, 1.0, 0.62, 0.22)
        c.set_source(g2); c.new_path(); c.rectangle(x - 7, y - 6, 14, 24); c.fill()
        c.set_source_rgb(0.08, 0.06, 0.05); c.set_line_width(1.6); c.new_path(); c.rectangle(x - 7, y - 6, 14, 24); c.stroke()
        c.new_path(); c.move_to(x, y - 6); c.line_to(x, y + 18); c.stroke()
        c.new_path(); c.move_to(x - 9, y + 18); c.line_to(x + 9, y + 18); c.line_to(x + 6, y + 23); c.line_to(x - 6, y + 23); c.close_path(); c.fill()


def ivy(c, rng):
    def tri_x(y, side):
        return CXG + side * HALF * (y - APEX_Y) / (BASE_Y - APEX_Y)

    def in_door(px, py):
        return abs(px - CXG) < DW + 70 and py > BASE_Y - DH - 80

    def runner(x, y, ang, length, depth=0):
        px, py = x, y
        for k in range(int(length / 10)):
            a = ang + rng.normal(0, .25)
            qx, qy = px + math.cos(a) * 10, py + math.sin(a) * 10
            if in_door(qx, qy):
                break
            px0, py0, px, py = px, py, qx, qy
            c.set_source_rgba(0.08, 0.14, 0.05, 1); c.set_line_width(1.8); c.new_path(); c.move_to(px0, py0); c.line_to(px, py); c.stroke()
            for sd in (-1, 1):
                if rng.random() < .62:
                    sz = rng.uniform(11, 21)
                    la = a + sd * rng.uniform(.7, 1.5)
                    sun = float(np.clip(0.5 - 0.5 * (px - CXG) / HALF, 0, 1))
                    c0 = (0.10 + 0.12 * sun + 0.04 * rng.random(), 0.26 + 0.18 * sun, 0.08 + 0.02 * sun)
                    c1 = (min(1, c0[0] * 1.9 + 0.12), min(1, c0[1] * 1.55 + 0.10), c0[2] * 1.2)
                    c.set_source_rgba(0.02, 0.04, 0.01, 0.30); c.new_path(); c.save(); c.translate(px + 2, py + 3); c.rotate(la); c.scale(sz * 0.55, sz * 0.33); c.arc(0.55, 0, 1, 0, TAU); c.restore(); c.fill()
                    leaf2(c, px, py, sz, la, c0, c1, vein=sz > 17)
            if depth < 1 and rng.random() < .05:
                runner(px, py, a + rng.choice([-1, 1]) * rng.uniform(.5, 1.1), length * 0.30, depth + 1)

    for side, top in ((-1, 0.34), (1, 0.50)):
        for j in range(3):
            yy = BASE_Y - 6 - j * 7
            xx = tri_x(yy, side) - side * (16 + 14 * j)
            ang = math.atan2(APEX_Y - BASE_Y, -side * HALF) + rng.normal(0, .06)
            runner(xx, yy, ang, (BASE_Y - APEX_Y) * top * rng.uniform(.75, 1.05) / 0.9)
    for j in range(7):
        side = rng.choice([-1, 1])
        runner(CXG + side * rng.uniform(190, HALF * .70), BASE_Y - 4, -math.pi / 2 + rng.normal(0, .5), rng.uniform(50, 150))
    for j in range(10):
        side = rng.choice([-1, 1]); yy = rng.uniform(APEX_Y + 110, BASE_Y - 240)
        runner(tri_x(yy, side), yy, math.pi / 2 - side * 0.9 + rng.normal(0, .3), rng.uniform(22, 55))


def woman():
    interior = Light(key_dir=(-0.45, -0.20, 0.85), key_col=(1.0, 0.86, 0.62), key_gain=0.50, amb_col=(0.55, 0.50, 0.56), amb_gain=0.34,
                     bounce_col=(0.30, 0.22, 0.10), bounce_gain=0.3, rim_dir=(0.9, -0.2, 0.2), rim_col=(1.0, 0.8, 0.5), rim_gain=0.70, rim_fres=0.7, fres_col=(1.0, 0.82, 0.52))
    return fig.render(150, dict(view='front', yaw=0.0, arm_l=(-0.118, 0.470), arm_r=(0.118, 0.470), hair=(0.30, 0.20, 0.12), dress=(0.95, 0.93, 0.88),
                                 crown=True, smile=0.0, feet=False, hem_y=0.0, bow=True), interior, seed=17)


def render_house(x0, w):
    """-> (rgb, alpha) full-size (H,w) layers of the whole house"""
    rng = np.random.default_rng(73)
    base = facade()
    mask = tri_mask()
    rgb = base * mask[..., None]
    alpha = mask.copy()
    L1 = Layer(WL, HL, BX0, BY0, 2)
    bargeboards(L1.ctx); windows(L1.ctx, rng); apex_window(L1.ctx, rng); doorway(L1.ctx)
    r1, a1 = L1.get()
    rgb = rgb * (1 - a1[..., None]) + r1
    alpha = np.clip(alpha * (1 - a1) + a1, 0, 1)
    sp = woman()
    ox, oy = sp['anchor']
    srgb = sp['rgb'] / np.maximum(sp['a'], 1e-4)[..., None]
    _over(rgb, alpha, srgb, sp['a'], int(round(CXG - BX0 - ox)), int(round(BASE_Y - 3 - BY0 - oy)))
    L2 = Layer(WL, HL, BX0, BY0, 2)
    c = L2.ctx
    door_leaf(c, -1, True); door_leaf(c, 1, False)
    steps(c); pots(c, rng); lanterns(c); ivy(c, rng)
    r2, a2 = L2.get()
    rgb = rgb * (1 - a2[..., None]) + r2
    alpha = np.clip(alpha * (1 - a2) + a2, 0, 1)
    full_rgb = np.zeros((H, w, 3), np.float32); full_a = np.zeros((H, w), np.float32)
    xa = BX0 - x0
    full_rgb[BY0:BY1, xa:xa + WL] = rgb
    full_a[BY0:BY1, xa:xa + WL] = alpha
    return full_rgb, full_a


if __name__ == '__main__':
    import time
    import clouds3 as CL
    t = time.time()
    x0, w = BX0 - 200, WL + 400
    sky_img, D = CL.sky(x0, w, sun=(7330.0, 766.0), cov_x=lambda xs: np.full(xs.shape, 0.7, np.float32))
    img = np.zeros((H, w, 3), np.float32)
    img[:HZ] = sky_img
    img[HZ:] = np.array([0.42, 0.46, 0.16], np.float32)
    rgb, a = render_house(x0, w)
    print('house', round(time.time() - t, 1), 's')
    img = img * (1 - a[..., None]) + rgb
    save_png(WORK + '/house_test.png', img[20:1000, 180:180 + WL + 40])
