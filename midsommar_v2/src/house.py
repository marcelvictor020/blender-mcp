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
    """weathered clapboard lit by the low sun from the left; (HL,WL,3) in local coordinates.
    Boards have their own tone, horizontal grain (growth-ring streaks), a bevel (lit top edge, shadowed lower edge, dark gap), staggered butt joints with
    nail pairs and rust runs, a few knots; silvering at the top, damp and algae at the foot; wide soft rain streaks (not hair-lines)."""
    ys = (np.arange(HL, dtype=np.float32) + BY0)[:, None]
    xs = (np.arange(WL, dtype=np.float32) + BX0)[None, :]
    ph = 18.0
    kk = np.floor((ys - APEX_Y) / ph); fr = (ys - APEX_Y) / ph - kk
    h1 = lambda a: np.sin(a * 12.9898 + 4.1) * 43758.5453 % 1.0
    r1, r2, r3, r4 = h1(kk), h1(kk + 17.3), h1(kk + 91.7), h1(kk + 5.9)
    ochre = np.array([0.82, 0.60, 0.16], np.float32); gold = np.array([0.99, 0.82, 0.30], np.float32); grey = np.array([0.70, 0.62, 0.44], np.float32)
    tone = np.broadcast_to(r1, (HL, WL))
    # each board is cut into lengths; every length gets its own tone (boards come from different trees)
    Lj = (230 + 150 * r3)
    off = 400 * r2
    seg = np.floor((xs - off) / Lj)
    jx = (xs - off) - seg * Lj
    dj = np.minimum(jx, Lj - jx)
    ts = h1(seg * 3.7 + kk * 1.9)
    tone = np.clip(0.45 * r1 + 0.55 * ts, 0, 1)
    tone = tone ** 0.85
    base = ochre[None, None, :] * (1 - tone)[..., None] + gold[None, None, :] * tone[..., None]
    sil = np.clip((ts - 0.74) * 3.0, 0, 1) * 0.55 + (r2 > 0.86) * 0.35                       # a few silvered, weathered boards
    base = base * (1 - sil[..., None]) + grey[None, None, :] * sil[..., None]
    # growth-ring grain: long wavy lines along the board
    gz = fbm(BX0, BY0, WL, HL, 5, 3, 311, aniso=70.0)
    ring = 0.5 + 0.5 * np.sin((fr * ph) * 1.55 + gz * 9.0 + r4 * 6.0)
    fine = fbm(BX0, BY0, WL, HL, 2, 2, 312, aniso=110.0)
    col = base * (1 + 0.085 * (ring - 0.5) * 2 + 0.055 * fine)[..., None]
    # bevel: lit top edge, shadowed lower edge, dark gap
    hi = smoothstep(0.0, 0.10, fr) * (1 - smoothstep(0.10, 0.26, fr))
    sh = smoothstep(0.66, 1.0, fr)
    gap = smoothstep(0.93, 1.0, fr)
    col = col * (1 + 0.30 * hi - 0.34 * sh - 0.56 * gap)[..., None]
    # butt joints + nail pairs (with a rust run below each nail)
    joint = np.exp(-(dj / 1.1) ** 2) * (fr < 0.94)
    col = col * (1 - 0.55 * joint)[..., None]
    for sgn in (-1, 1):
        dxn = dj - 9.0
        nail = np.exp(-((dxn ** 2 + ((fr - 0.46) * ph) ** 2) / 1.5)) * (jx < Lj / 2 if sgn < 0 else jx >= Lj / 2)
        col = col * (1 - 0.60 * nail)[..., None] + 0.20 * np.exp(-((dxn ** 2 + ((fr - 0.46) * ph - 1.0) ** 2) / 0.8))[..., None] * 0.0
        run = np.exp(-(dxn / 1.6) ** 2) * np.clip(1 - np.abs((fr - 0.46) * ph - 8.0) / 8.0, 0, 1) * (jx < Lj / 2 if sgn < 0 else jx >= Lj / 2)
        col = col * (1 - 0.16 * run)[..., None] + np.array([0.30, 0.16, 0.06], np.float32) * (0.10 * run)[..., None]
    # knots: rare dark whorls
    kn_cell = 130.0
    kx = np.floor(xs / kn_cell); ky = kk
    krand = h1(kx * 7.3 + ky * 3.1)
    kcx = (kx + 0.2 + 0.6 * h1(kx * 1.7 + ky)) * kn_cell
    kdx = xs - kcx; kdy = (fr - 0.5) * ph
    kd2 = (kdx / 5.5) ** 2 + (kdy / 3.4) ** 2
    knot = (krand > 0.86) * (np.exp(-kd2) * 0.55 + np.exp(-((np.sqrt(kd2) - 1.6) ** 2) / 0.30) * 0.30)
    col = col * (1 - 0.55 * np.clip(knot, 0, 1))[..., None]
    # large-scale: silvered at the top, damp/dark + algae at the foot, wide soft rain streaks
    ty0 = np.clip((ys - APEX_Y) / (BASE_Y - APEX_Y), 0, 1)
    col = col * (1 - 0.10 * (1 - ty0))[..., None] + np.array([0.20, 0.17, 0.12], np.float32) * (0.06 * (1 - ty0))[..., None]
    st = fbm(BX0, BY0, WL, HL, 90, 3, 303, aniso=0.16)
    col = col * (1 - 0.07 * np.clip(st * 2.2, 0, 1))[..., None]
    gy = smoothstep(BASE_Y - 170, BASE_Y, ys)
    grime = gy * (0.40 + 0.60 * fbm01(BX0, BY0, WL, HL, 60, 3, 305, aniso=2.5))
    col = col * (1 - 0.40 * grime)[..., None] + np.array([0.26, 0.36, 0.13], np.float32) * (0.26 * grime)[..., None]
    # sunlight raking from the left
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
def bargeboards(c, sides=(-1, 1)):
    ap = (CXG, APEX_Y)
    for side in sides:
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


def _rect(c, x, y, w, h):
    c.new_path(); c.rectangle(x, y, w, h)


def glass(c, gx0, gy0, gw, gh, kind, rng, sun=0.6, figure=False, panes=(2, 3), reflect=None):
    """real glass: a room behind it (warm lamp, beam, shelf, curtains, sometimes a pale figure standing very still), the sky and the dark tree-line of the
    meadow mirrored in it (more where the room is dark), sun glare in diagonal bands that move from pane to pane, muntins with a lit and a shaded side"""
    c.save(); _rect(c, gx0, gy0, gw, gh); c.clip()
    # ---- the room
    if kind == 'lit':
        lx, ly = gx0 + gw * rng.uniform(0.38, 0.62), gy0 + gh * 0.40
        g = cairo.RadialGradient(lx, ly, 1, lx, ly, gh * 0.95)
        g.add_color_stop_rgb(0, 1.0, 0.97, 0.78); g.add_color_stop_rgb(0.20, 1.0, 0.86, 0.46); g.add_color_stop_rgb(0.60, 0.92, 0.58, 0.20); g.add_color_stop_rgb(1, 0.52, 0.26, 0.09)
        c.set_source(g); c.paint()
        c.set_source_rgba(0.26, 0.13, 0.05, 0.95); _rect(c, gx0, gy0, gw, gh * 0.13); c.fill()                      # ceiling beam
        c.set_source_rgba(0.40, 0.21, 0.08, 0.60); _rect(c, gx0, gy0 + gh * 0.13, gw, gh * 0.025); c.fill()
        c.set_source_rgba(0.30, 0.15, 0.06, 0.82); _rect(c, gx0, gy0 + gh * 0.80, gw, gh * 0.20); c.fill()           # shelf / table edge
        for k in range(3):                                                                                           # things on it
            bx = gx0 + gw * (0.12 + 0.30 * k + 0.05 * rng.random())
            c.set_source_rgba(0.22, 0.11, 0.05, 0.9); _rect(c, bx, gy0 + gh * (0.70 - 0.05 * rng.random()), gw * 0.14, gh * 0.12); c.fill()
        if figure:
            fx = gx0 + gw * 0.52
            c.set_source_rgba(0.95, 0.93, 0.88, 0.96)                                                                # a girl in white, facing out, motionless
            c.new_path(); c.move_to(fx - gw * 0.16, gy0 + gh); c.line_to(fx - gw * 0.10, gy0 + gh * 0.50); c.line_to(fx + gw * 0.10, gy0 + gh * 0.50); c.line_to(fx + gw * 0.16, gy0 + gh); c.close_path(); c.fill()
            c.new_path(); c.arc(fx, gy0 + gh * 0.39, gw * 0.100, 0, TAU); c.set_source_rgba(0.96, 0.84, 0.76, 1); c.fill()
            c.set_source_rgba(0.28, 0.20, 0.12, 0.92); c.new_path(); c.arc(fx, gy0 + gh * 0.35, gw * 0.108, math.pi, TAU); c.fill()
            c.set_source_rgba(0.10, 0.06, 0.05, 0.95)
            for sx in (-1, 1):
                c.new_path(); c.arc(fx + sx * gw * 0.040, gy0 + gh * 0.395, max(0.35, gw * 0.014), 0, TAU); c.fill()
            c.set_source_rgba(0.70, 0.22, 0.24, 0.9); c.set_line_width(max(0.35, gw * 0.012)); c.new_path()
            c.move_to(fx - gw * 0.048, gy0 + gh * 0.435); c.curve_to(fx - gw * 0.02, gy0 + gh * 0.455, fx + gw * 0.02, gy0 + gh * 0.455, fx + gw * 0.048, gy0 + gh * 0.435); c.stroke()
        for sx in (-1, 1):                                                                                           # curtains, lit from behind
            xe = gx0 + (gw if sx > 0 else 0)
            c.set_source_rgba(0.98, 0.93, 0.84, 0.90); c.new_path(); c.move_to(xe, gy0); c.curve_to(xe - sx * gw * 0.30, gy0 + gh * 0.25, xe - sx * gw * 0.46, gy0 + gh * 0.55, xe - sx * gw * 0.20, gy0 + gh * 0.80)
            c.line_to(xe - sx * gw * 0.08, gy0 + gh); c.line_to(xe, gy0 + gh); c.close_path(); c.fill()
            c.set_source_rgba(0.62, 0.46, 0.30, 0.38); c.set_line_width(max(0.5, gw * 0.03))
            for q in range(2):
                c.new_path(); c.move_to(xe - sx * gw * (0.07 + 0.10 * q), gy0 + gh * 0.04); c.curve_to(xe - sx * gw * (0.14 + 0.10 * q), gy0 + gh * 0.40, xe - sx * gw * (0.18 + 0.09 * q), gy0 + gh * 0.60, xe - sx * gw * (0.08 + 0.07 * q), gy0 + gh * 0.95); c.stroke()
    elif kind == 'dim':
        g = cairo.LinearGradient(0, gy0, 0, gy0 + gh); g.add_color_stop_rgb(0, 0.10, 0.12, 0.20); g.add_color_stop_rgb(1, 0.05, 0.05, 0.08)
        c.set_source(g); c.paint()
        c.set_source_rgba(0.34, 0.20, 0.10, 0.5); _rect(c, gx0, gy0 + gh * 0.55, gw, gh * 0.04); c.fill()                # a shelf
        cx_, cy_ = gx0 + gw * rng.uniform(0.2, 0.8), gy0 + gh * 0.50
        gcan = cairo.RadialGradient(cx_, cy_, 0.5, cx_, cy_, gw * 0.5); gcan.add_color_stop_rgba(0, 1.0, 0.80, 0.40, 0.55); gcan.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)   # a far candle
        c.set_source(gcan); c.paint()
    else:
        g = cairo.LinearGradient(0, gy0, 0, gy0 + gh); g.add_color_stop_rgb(0, 0.16, 0.22, 0.34); g.add_color_stop_rgb(1, 0.07, 0.07, 0.10)
        c.set_source(g); c.paint()
    # ---- reflections: the sky, a few clouds, the tree-line, the glowing ground
    ra = {'lit': 0.20, 'dim': 0.52, 'sky': 0.66}[kind]
    if reflect is not None: ra = reflect
    g = cairo.LinearGradient(0, gy0, 0, gy0 + gh)
    g.add_color_stop_rgba(0.00, 0.30, 0.40, 0.72, ra); g.add_color_stop_rgba(0.34, 0.66, 0.54, 0.74, ra * 0.95); g.add_color_stop_rgba(0.52, 0.98, 0.70, 0.58, ra)
    g.add_color_stop_rgba(0.60, 1.0, 0.80, 0.50, ra); g.add_color_stop_rgba(0.62, 0.20, 0.26, 0.12, ra * 0.95); g.add_color_stop_rgba(1.0, 0.36, 0.40, 0.16, ra * 0.70)
    c.set_source(g); c.paint()
    c.set_source_rgba(0.08, 0.15, 0.10, 0.80 * ra / 0.66)                                                            # tree-line
    c.new_path(); c.move_to(gx0, gy0 + gh * 0.64)
    for k in range(0, 13):
        px = gx0 + gw * k / 12.0
        c.line_to(px, gy0 + gh * (0.50 + 0.07 * math.sin(k * 2.1 + gx0) + (0.05 if k % 3 == 0 else 0.0)))
    c.line_to(gx0 + gw, gy0 + gh * 0.64); c.close_path(); c.fill()
    for k in range(2):                                                                                                # clouds in the reflection
        cxp, cyp = gx0 + gw * rng.uniform(0.2, 0.8), gy0 + gh * rng.uniform(0.10, 0.34)
        gcl = cairo.RadialGradient(cxp, cyp, 0.5, cxp, cyp, gw * 0.40); gcl.add_color_stop_rgba(0, 1.0, 0.84, 0.80, 0.50 * ra / 0.66); gcl.add_color_stop_rgba(1, 1.0, 0.84, 0.80, 0)
        c.set_source(gcl); c.new_path(); c.save(); c.translate(cxp, cyp); c.scale(1.0, 0.45); c.translate(-cxp, -cyp); c.arc(cxp, cyp, gw * 0.40, 0, TAU); c.restore(); c.fill()
    # ---- sun glare: two diagonal bands, stronger for windows nearer the sun
    s_ = max(0.0, min(1.0, sun))
    for (a0, bw, al) in ((0.04, 0.34, 0.68), (0.54, 0.12, 0.48)):
        gl = cairo.LinearGradient(gx0 + gw * a0, 0, gx0 + gw * (a0 + bw), 0)
        gl.add_color_stop_rgba(0.0, 1.0, 0.96, 0.78, 0.0); gl.add_color_stop_rgba(0.45, 1.0, 0.95, 0.74, al * s_); gl.add_color_stop_rgba(1.0, 1.0, 0.90, 0.62, 0.0)
        c.set_source(gl); c.new_path()
        c.move_to(gx0 + gw * (a0 - 0.30), gy0 + gh); c.line_to(gx0 + gw * (a0 + bw - 0.30), gy0 + gh); c.line_to(gx0 + gw * (a0 + bw + 0.60), gy0); c.line_to(gx0 + gw * (a0 + 0.60), gy0); c.close_path(); c.fill()
    if s_ > 0.40:                                                                                                      # the sun catches the glass: a hot spot, a flare and a streak
        fxp, fyp = gx0 + gw * 0.24, gy0 + gh * 0.20
        gfl = cairo.RadialGradient(fxp, fyp, 0.3, fxp, fyp, gw * 0.95); gfl.add_color_stop_rgba(0, 1.0, 0.99, 0.90, 1.0 * s_); gfl.add_color_stop_rgba(0.25, 1.0, 0.90, 0.58, 0.62 * s_); gfl.add_color_stop_rgba(1, 1.0, 0.7, 0.3, 0)
        c.set_source(gfl); c.new_path(); c.arc(fxp, fyp, gw * 0.95, 0, TAU); c.fill()
        c.set_source_rgba(1.0, 0.98, 0.88, 0.85 * s_); c.set_line_width(max(0.5, gw * 0.026))
        c.new_path(); c.move_to(fxp - gw * 0.50, fyp); c.line_to(fxp + gw * 0.50, fyp); c.move_to(fxp, fyp - gw * 0.50); c.line_to(fxp, fyp + gw * 0.50); c.stroke()
        c.set_source_rgba(1.0, 0.96, 0.80, 0.50 * s_); c.set_line_width(max(0.6, gw * 0.10))
        c.new_path(); c.move_to(gx0 + gw * 0.05, gy0 + gh * 0.95); c.line_to(gx0 + gw * 0.62, gy0 + gh * 0.05); c.stroke()
    for k in range(3):                                                                                                 # a little dirt run on old glass
        sx_ = gx0 + gw * rng.uniform(0.1, 0.9)
        c.set_source_rgba(0.30, 0.26, 0.20, 0.07); c.set_line_width(max(0.5, gw * 0.04)); c.new_path(); c.move_to(sx_, gy0); c.line_to(sx_ + rng.normal(0, 0.8), gy0 + gh * rng.uniform(0.5, 1.0)); c.stroke()
    c.restore()
    # ---- muntins: lit on the sun side, shaded on the other, a bright glass edge at the top-left of every pane
    nx_, ny_ = panes
    xs_ = [gx0 + gw * k / nx_ for k in range(1, nx_)]
    ys_ = [gy0 + gh * k / ny_ for k in range(1, ny_)]
    mw = max(1.1, gw * 0.075)
    for xm in xs_:
        c.set_source_rgb(0.90, 0.86, 0.76); _rect(c, xm - mw / 2, gy0, mw, gh); c.fill()
        c.set_source_rgba(1, 1, 1, 0.55); _rect(c, xm - mw / 2, gy0, mw * 0.35, gh); c.fill()
        c.set_source_rgba(0.20, 0.15, 0.08, 0.45); _rect(c, xm + mw * 0.2, gy0, mw * 0.3, gh); c.fill()
    for ym in ys_:
        c.set_source_rgb(0.90, 0.86, 0.76); _rect(c, gx0, ym - mw / 2, gw, mw); c.fill()
        c.set_source_rgba(1, 1, 1, 0.55); _rect(c, gx0, ym - mw / 2, gw, mw * 0.35); c.fill()
        c.set_source_rgba(0.20, 0.15, 0.08, 0.45); _rect(c, gx0, ym + mw * 0.2, gw, mw * 0.3); c.fill()
    xe_ = [gx0] + xs_ + [gx0 + gw]; ye_ = [gy0] + ys_ + [gy0 + gh]
    for a_ in range(len(xe_) - 1):
        for b_ in range(len(ye_) - 1):
            c.set_source_rgba(1, 1, 1, 0.38); c.set_line_width(0.6)
            c.new_path(); c.move_to(xe_[a_] + mw * 0.5, ye_[b_ + 1] - mw * 0.5); c.line_to(xe_[a_] + mw * 0.5, ye_[b_] + mw * 0.5); c.line_to(xe_[a_ + 1] - mw * 0.5, ye_[b_] + mw * 0.5); c.stroke()
    c.set_source_rgba(0.10, 0.07, 0.04, 0.85); c.set_line_width(1.0); _rect(c, gx0, gy0, gw, gh); c.stroke()


def shutter(c, x, y, w, h, lit, rng):
    """an open louvred shutter painted cornflower blue, with a heart cut out of it"""
    base = (0.40, 0.58, 0.86) if lit else (0.24, 0.40, 0.66)
    g = cairo.LinearGradient(x, 0, x + w, 0); g.add_color_stop_rgb(0, *[min(1, v * (1.12 if lit else 0.96)) for v in base]); g.add_color_stop_rgb(1, *[v * (0.88 if lit else 0.74) for v in base])
    c.set_source(g); _rect(c, x, y, w, h); c.fill()
    n = int(h / 3.0)
    for k in range(n):
        yy = y + 2 + k * (h - 4) / n
        c.set_source_rgba(1, 1, 1, 0.20 if lit else 0.10); c.set_line_width(0.5); c.new_path(); c.move_to(x + 1.2, yy); c.line_to(x + w - 1.2, yy); c.stroke()
        c.set_source_rgba(0.04, 0.10, 0.22, 0.45); c.new_path(); c.move_to(x + 1.2, yy + 1.1); c.line_to(x + w - 1.2, yy + 1.1); c.stroke()
    hx_, hy_ = x + w / 2, y + h * 0.20
    c.set_source_rgb(0.07, 0.07, 0.10); c.new_path(); c.move_to(hx_, hy_ + w * 0.22); c.curve_to(hx_ - w * 0.40, hy_ - w * 0.05, hx_ - w * 0.12, hy_ - w * 0.30, hx_, hy_ - w * 0.06)
    c.curve_to(hx_ + w * 0.12, hy_ - w * 0.30, hx_ + w * 0.40, hy_ - w * 0.05, hx_, hy_ + w * 0.22); c.fill()
    c.set_source_rgba(0.04, 0.10, 0.22, 0.85); c.set_line_width(0.8); _rect(c, x, y, w, h); c.stroke()
    c.set_source_rgba(1, 1, 1, 0.30 if lit else 0.14); c.set_line_width(0.7); c.new_path(); c.move_to(x + 0.6, y + h); c.line_to(x + 0.6, y + 0.6); c.line_to(x + w, y + 0.6); c.stroke()


def window(c, cx, cy, wv, hv, kind, rng, box=False, shut=False, sun=0.6, figure=False):
    """a casement window set INTO the planks: spill of lamp-light on the wall, drop shadow, bevelled casing with a drip cap, dark left/top reveal and a sunlit right
    reveal, real glass (see glass()), a sloping sill, a flower box with geraniums, and louvred shutters on some"""
    cw = 5.5
    x0_, y0_ = cx - wv / 2, cy - hv / 2
    if kind == 'lit':                                                                                             # lamp-light spilling on the boards round the window
        g = cairo.RadialGradient(cx, cy + hv * 0.05, hv * 0.30, cx, cy + hv * 0.05, hv * 1.55)
        g.add_color_stop_rgba(0, 1.0, 0.78, 0.34, 0.34); g.add_color_stop_rgba(1, 1.0, 0.7, 0.3, 0)
        c.set_source(g); c.new_path(); c.arc(cx, cy + hv * 0.05, hv * 1.55, 0, TAU); c.fill()
    for k in range(5):                                                                                            # soft cast shadow to the right / down
        c.set_source_rgba(0.04, 0.02, 0.01, 0.11 - 0.018 * k); _rect(c, x0_ - cw + 2 + k * 1.4, y0_ - cw + 3 + k * 1.7, wv + 2 * cw + k * 0.8, hv + 2 * cw + k * 0.8); c.fill()
    if shut:                                                                                                      # shutters stand open against the wall
        sw = wv * 0.50
        shutter(c, x0_ - cw - sw - 1.5, y0_ - 2, sw, hv + 4 + cw, True, rng)
        shutter(c, x0_ + wv + cw + 1.5, y0_ - 2, sw, hv + 4 + cw, False, rng)
    # casing (painted cream, bevelled)
    g = cairo.LinearGradient(x0_ - cw, 0, x0_ + wv + cw, 0); g.add_color_stop_rgb(0, 0.99, 0.96, 0.88); g.add_color_stop_rgb(1, 0.80, 0.76, 0.66)
    c.set_source(g); _rect(c, x0_ - cw, y0_ - cw, wv + 2 * cw, hv + 2 * cw); c.fill()
    c.set_source_rgba(1, 1, 1, 0.60); c.set_line_width(0.8); c.new_path(); c.move_to(x0_ - cw + 0.4, y0_ + hv + cw); c.line_to(x0_ - cw + 0.4, y0_ - cw + 0.4); c.line_to(x0_ + wv + cw, y0_ - cw + 0.4); c.stroke()
    c.set_source_rgba(0.28, 0.22, 0.14, 0.60); c.set_line_width(0.9); c.new_path(); c.move_to(x0_ + wv + cw - 0.4, y0_ - cw); c.line_to(x0_ + wv + cw - 0.4, y0_ + hv + cw - 0.4); c.line_to(x0_ - cw, y0_ + hv + cw - 0.4); c.stroke()
    c.set_source_rgb(0.92, 0.88, 0.78); _rect(c, x0_ - cw - 2, y0_ - cw - 3.2, wv + 2 * cw + 4, 3.2); c.fill()                       # drip cap
    c.set_source_rgba(0.10, 0.06, 0.03, 0.40); _rect(c, x0_ - cw - 2, y0_ - cw, wv + 2 * cw + 4, 1.6); c.fill()
    # the glass is recessed: left and top reveal dark, right reveal catches the sun
    rv = 2.6
    c.set_source_rgba(0.08, 0.06, 0.04, 0.88); _rect(c, x0_, y0_, rv, hv); c.fill(); _rect(c, x0_, y0_, wv, rv * 1.2); c.fill()
    c.set_source_rgba(1.0, 0.84, 0.52, 0.78); _rect(c, x0_ + wv - rv * 0.8, y0_ + rv, rv * 0.8, hv - rv); c.fill()
    gx0, gy0, gw, gh = x0_ + rv, y0_ + rv * 1.2, wv - rv - rv * 0.8, hv - rv * 1.2
    glass(c, gx0, gy0, gw, gh, kind, rng, sun=sun, figure=figure)
    # sill: top face lit, front face shaded, a dark line where it meets the wall
    c.set_source_rgb(0.96, 0.92, 0.82); c.new_path(); c.move_to(x0_ - cw - 3, y0_ + hv + cw + 1.0); c.line_to(x0_ + wv + cw + 3, y0_ + hv + cw + 1.0)
    c.line_to(x0_ + wv + cw + 5, y0_ + hv + cw + 4.2); c.line_to(x0_ - cw - 5, y0_ + hv + cw + 4.2); c.close_path(); c.fill()
    c.set_source_rgb(0.74, 0.70, 0.60); _rect(c, x0_ - cw - 5, y0_ + hv + cw + 4.2, wv + 2 * cw + 10, 2.4); c.fill()
    c.set_source_rgba(0.06, 0.03, 0.01, 0.55); _rect(c, x0_ - cw - 5, y0_ + hv + cw + 6.6, wv + 2 * cw + 10, 2.4); c.fill()
    if box:
        by_ = y0_ + hv + cw + 7
        g = cairo.LinearGradient(0, by_, 0, by_ + 11); g.add_color_stop_rgb(0, 0.40, 0.58, 0.88); g.add_color_stop_rgb(1, 0.22, 0.34, 0.60)
        c.set_source(g); _rect(c, x0_ - cw - 3, by_, wv + 2 * cw + 6, 11); c.fill()
        c.set_source_rgba(1, 1, 1, 0.30); _rect(c, x0_ - cw - 3, by_, wv + 2 * cw + 6, 1.3); c.fill()
        c.set_source_rgba(0.05, 0.04, 0.03, 0.55); _rect(c, x0_ - cw - 3, by_ + 11, wv + 2 * cw + 6, 2.0); c.fill()
        c.set_source_rgba(0.04, 0.03, 0.02, 0.28); _rect(c, x0_ - cw - 1, by_ + 13, wv + 2 * cw + 4, 4.5); c.fill()
        for k in range(10):                                                                                    # leaves, then geraniums (sphere-shaded blobs), trailing ivy
            fx = x0_ - cw - 1 + k * (wv + 2 * cw + 2) / 9
            c.set_source_rgb(0.12 + 0.06 * rng.random(), 0.32 + 0.12 * rng.random(), 0.10); c.new_path(); c.save(); c.translate(fx, by_ - 2); c.rotate(rng.uniform(-0.8, 0.8)); c.scale(5.0, 2.8); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        for k in range(8):
            fx = x0_ - cw + 1 + k * (wv + 2 * cw - 2) / 7; fy = by_ - 4.5 + rng.normal(0, 1.2)
            col = [(0.88, 0.12, 0.16), (0.96, 0.40, 0.48), (0.98, 0.94, 0.90), (0.88, 0.12, 0.16)][k % 4]
            gg = cairo.RadialGradient(fx - 1.2, fy - 1.4, 0.3, fx, fy, 4.2); gg.add_color_stop_rgb(0, *[min(1, v * 1.35 + 0.1) for v in col]); gg.add_color_stop_rgb(1, *[v * 0.62 for v in col])
            c.set_source(gg); c.new_path(); c.arc(fx, fy, 3.9, 0, TAU); c.fill()
        c.set_source_rgba(0.14, 0.34, 0.10, 0.9); c.set_line_width(1.1)
        for k in range(4):
            fx = x0_ - cw + 2 + k * (wv + 2 * cw - 4) / 3
            c.new_path(); c.move_to(fx, by_ + 9); c.curve_to(fx + rng.normal(0, 2), by_ + 14, fx + rng.normal(0, 2), by_ + 18, fx + rng.normal(0, 2), by_ + rng.uniform(19, 26)); c.stroke()


def windows(c, rng):
    lit = {(-1, 0, 2), (-1, 0, 4), (1, 0, 1), (1, 0, 3), (-1, 1, 2), (1, 1, 1), (1, 1, 3), (-1, 0, 0)}
    figure_at = {(1, 0, 3), (-1, 1, 2)}
    placed = []
    lant = [(CXG - 168.0, BASE_Y - 284.0), (CXG + 168.0, BASE_Y - 284.0)]
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
                if any(abs(xx - px) < 52 and abs(yy - py) < 62 for (px, py) in placed): continue
                if any(abs(xx - px) < 50 and abs(yy - py) < 46 for (px, py) in lant): continue            # no two windows may overlap (the old double window near the apex)
                placed.append((float(xx), float(yy)))
                kind = 'lit' if (side, row, i) in lit else ('sky' if rng.random() < 0.62 else 'dim')
                u = float(np.clip((xx - (CXG - HALF)) / (2 * HALF), 0, 1))
                window(c, float(xx), float(yy), 31, 42, kind, rng, box=(yy > BASE_Y - 330 and rng.random() < 0.55), shut=(rng.random() < 0.42),
                       sun=float(np.clip(1.10 - 1.0 * u, 0.12, 1.0)), figure=((side, row, i) in figure_at))
    return placed


def apex_window(c, rng):
    cx, cy = CXG, 306
    for k in range(5):
        c.set_source_rgba(0.04, 0.02, 0.01, 0.10 - 0.015 * k); c.new_path(); c.rectangle(cx - 44 + 3 + k, cy - 44 + 5 + k, 88, 88); c.fill()
    g = cairo.LinearGradient(cx - 44, 0, cx + 44, 0); g.add_color_stop_rgb(0, 0.62, 0.42, 0.22); g.add_color_stop_rgb(1, 0.32, 0.20, 0.10)
    c.set_source(g); c.new_path(); c.rectangle(cx - 44, cy - 44, 88, 88); c.fill()
    c.set_source_rgba(1, 0.9, 0.6, 0.35); c.set_line_width(1.0); c.new_path(); c.move_to(cx - 43.5, cy + 44); c.line_to(cx - 43.5, cy - 43.5); c.line_to(cx + 44, cy - 43.5); c.stroke()
    c.set_source_rgba(0.04, 0.02, 0.01, 0.8); c.rectangle(cx - 34, cy - 34, 7, 68); c.fill(); c.rectangle(cx - 34, cy - 34, 68, 7); c.fill()      # dark reveal
    c.set_source_rgba(1.0, 0.82, 0.50, 0.55); c.rectangle(cx + 28, cy - 27, 6, 61); c.fill()
    glass(c, cx - 27, cy - 27, 55, 61, 'dim', rng, sun=0.92, panes=(2, 2), reflect=0.55)
    g = cairo.RadialGradient(cx + 6, cy + 14, 1, cx, cy + 10, 36); g.add_color_stop_rgba(0, 1.0, 0.72, 0.30, 0.55); g.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)           # a candle deep in the attic
    c.save(); c.new_path(); c.rectangle(cx - 27, cy - 27, 55, 61); c.clip(); c.set_source(g); c.paint(); c.restore()
    c.set_source_rgba(0.12, 0.08, 0.04, 0.8); c.set_line_width(1.3); c.new_path(); c.rectangle(cx - 34, cy - 34, 68, 68); c.stroke()
    for sx in (-1, 1):
        x0s = cx + sx * 52 - (0 if sx > 0 else 18)
        shutter(c, x0s, cy - 40, 18, 80, sx < 0, rng)


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
    # paint over wood: faint grain through the paint, a few brush streaks, a gloss band where the sun hits, chipped edge
    rr_ = np.random.default_rng(5 + side)
    for k in range(14):
        u = 8 + k * 7.4 + rr_.normal(0, 1.2)
        x1, y1 = q.P(u, 6); x2, y2 = q.P(u + rr_.normal(0, 1.5), 192)
        c.set_source_rgba(0.04, 0.12, 0.24, 0.10); c.set_line_width(0.8); c.new_path(); c.move_to(x1, y1); c.line_to(x2, y2); c.stroke()
    for k in range(5):
        v = 20 + k * 36 + rr_.uniform(-4, 4)
        x1, y1 = q.P(4, v); x2, y2 = q.P(114, v + rr_.normal(0, 3))
        c.set_source_rgba(1, 1, 1, 0.07); c.set_line_width(2.2); c.new_path(); c.move_to(x1, y1); c.line_to(x2, y2); c.stroke()
    gl_ = cairo.LinearGradient(*q.P(0, 0), *q.P(60, 0)); gl_.add_color_stop_rgba(0, 1, 1, 1, 0.0); gl_.add_color_stop_rgba(0.5, 1, 1, 1, 0.20 if lit else 0.08); gl_.add_color_stop_rgba(1, 1, 1, 1, 0.0)
    c.set_source(gl_); c.new_path(); c.move_to(*A); c.line_to(*B); c.line_to(*C); c.line_to(*D); c.close_path(); c.fill()
    for k in range(5):
        x1, y1 = q.P(rr_.uniform(2, 116), rr_.uniform(2, 196))
        c.set_source_rgba(0.80, 0.70, 0.52, 0.55); c.new_path(); c.arc(x1, y1, rr_.uniform(0.6, 1.4), 0, TAU); c.fill()
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


def _shadow(a, dx, dy, sigma):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    s = cv2.warpAffine(a.astype(np.float32), M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR, borderValue=0)
    return cv2.GaussianBlur(s, (0, 0), sigma)


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
    sh1 = np.clip(_shadow(a1, 4.0, 6.0, 3.6) * (1 - a1), 0, 1) * mask                                             # everything that stands out from the wall casts a soft shadow on it
    rgb = rgb * (1 - 0.34 * sh1[..., None]) + np.array([0.05, 0.03, 0.08], np.float32) * (0.34 * sh1[..., None])
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
    spill = np.zeros((HL, WL), np.float32)
    yy_, xx_ = np.mgrid[0:HL, 0:WL]
    spill = np.exp(-(((xx_ + BX0 - CXG) / 120.0) ** 2 + ((yy_ + BY0 - (BASE_Y + 14)) / 30.0) ** 2)) * (yy_ + BY0 > BASE_Y)
    sh2 = np.clip(_shadow(a2, 5.0, 7.0, 4.2) * (1 - a2), 0, 1) * mask
    rgb = rgb * (1 - 0.40 * sh2[..., None]) + np.array([0.04, 0.03, 0.07], np.float32) * (0.40 * sh2[..., None])
    rgb = rgb * (1 - a2[..., None]) + r2
    rgb = 1 - (1 - rgb) * (1 - 0.50 * spill[..., None] * np.array([1.0, 0.72, 0.34], np.float32))                    # the doorway's light pools on the steps
    alpha = np.clip(alpha * (1 - a2) + a2, 0, 1)
    full_rgb = np.zeros((H, w, 3), np.float32); full_a = np.zeros((H, w), np.float32)
    xa = BX0 - x0
    full_rgb[BY0:BY1, xa:xa + WL] = rgb
    full_a[BY0:BY1, xa:xa + WL] = alpha
    return full_rgb, full_a


def facade_k(K, rx0, ry0, wo, ho):
    """the same clapboard as facade(), evaluated at K times the size over the house-space rectangle [rx0, rx0 + wo / K] x [ry0, ry0 + ho / K]: every board, joint, nail and
    knot is computed in house units, so a close-up is crisp, not an enlarged picture. (ho, wo, 3).
    Boards have their own tone, horizontal grain (growth-ring streaks), a bevel (lit top edge, shadowed lower edge, dark gap), staggered butt joints with
    nail pairs and rust runs, a few knots; silvering at the top, damp and algae at the foot; wide soft rain streaks (not hair-lines)."""
    ys = (ry0 + (np.arange(ho, dtype=np.float32) + 0.5) / K)[:, None]
    xs = (rx0 + (np.arange(wo, dtype=np.float32) + 0.5) / K)[None, :]
    fx0, fy0 = int(round(rx0 * K)), int(round(ry0 * K))
    FB = lambda cell, octv, seed, aniso=1.0: fbm(fx0, fy0, wo, ho, cell * K, octv, seed, aniso=aniso)
    FB01 = lambda cell, octv, seed, aniso=1.0: fbm01(fx0, fy0, wo, ho, cell * K, octv, seed, aniso=aniso)
    ph = 18.0
    kk = np.floor((ys - APEX_Y) / ph); fr = (ys - APEX_Y) / ph - kk
    h1 = lambda a: np.sin(a * 12.9898 + 4.1) * 43758.5453 % 1.0
    r1, r2, r3, r4 = h1(kk), h1(kk + 17.3), h1(kk + 91.7), h1(kk + 5.9)
    ochre = np.array([0.82, 0.60, 0.16], np.float32); gold = np.array([0.99, 0.82, 0.30], np.float32); grey = np.array([0.70, 0.62, 0.44], np.float32)
    tone = np.broadcast_to(r1, (ho, wo))
    # each board is cut into lengths; every length gets its own tone (boards come from different trees)
    Lj = (230 + 150 * r3)
    off = 400 * r2
    seg = np.floor((xs - off) / Lj)
    jx = (xs - off) - seg * Lj
    dj = np.minimum(jx, Lj - jx)
    ts = h1(seg * 3.7 + kk * 1.9)
    tone = np.clip(0.45 * r1 + 0.55 * ts, 0, 1)
    tone = tone ** 0.85
    base = ochre[None, None, :] * (1 - tone)[..., None] + gold[None, None, :] * tone[..., None]
    sil = np.clip((ts - 0.74) * 3.0, 0, 1) * 0.55 + (r2 > 0.86) * 0.35                       # a few silvered, weathered boards
    base = base * (1 - sil[..., None]) + grey[None, None, :] * sil[..., None]
    # growth-ring grain: long wavy lines along the board
    gz = FB(5, 3, 311, aniso=70.0)
    ring = 0.5 + 0.5 * np.sin((fr * ph) * 1.55 + gz * 9.0 + r4 * 6.0)
    fine = FB(2, 2, 312, aniso=110.0)
    col = base * (1 + 0.085 * (ring - 0.5) * 2 + 0.055 * fine)[..., None]
    # bevel: lit top edge, shadowed lower edge, dark gap
    hi = smoothstep(0.0, 0.10, fr) * (1 - smoothstep(0.10, 0.26, fr))
    sh = smoothstep(0.66, 1.0, fr)
    gap = smoothstep(0.93, 1.0, fr)
    col = col * (1 + 0.30 * hi - 0.34 * sh - 0.56 * gap)[..., None]
    # butt joints + nail pairs (with a rust run below each nail)
    joint = np.exp(-(dj / 1.1) ** 2) * (fr < 0.94)
    col = col * (1 - 0.55 * joint)[..., None]
    for sgn in (-1, 1):
        dxn = dj - 9.0
        nail = np.exp(-((dxn ** 2 + ((fr - 0.46) * ph) ** 2) / 1.5)) * (jx < Lj / 2 if sgn < 0 else jx >= Lj / 2)
        col = col * (1 - 0.60 * nail)[..., None] + 0.20 * np.exp(-((dxn ** 2 + ((fr - 0.46) * ph - 1.0) ** 2) / 0.8))[..., None] * 0.0
        run = np.exp(-(dxn / 1.6) ** 2) * np.clip(1 - np.abs((fr - 0.46) * ph - 8.0) / 8.0, 0, 1) * (jx < Lj / 2 if sgn < 0 else jx >= Lj / 2)
        col = col * (1 - 0.16 * run)[..., None] + np.array([0.30, 0.16, 0.06], np.float32) * (0.10 * run)[..., None]
    # knots: rare dark whorls
    kn_cell = 130.0
    kx = np.floor(xs / kn_cell); ky = kk
    krand = h1(kx * 7.3 + ky * 3.1)
    kcx = (kx + 0.2 + 0.6 * h1(kx * 1.7 + ky)) * kn_cell
    kdx = xs - kcx; kdy = (fr - 0.5) * ph
    kd2 = (kdx / 5.5) ** 2 + (kdy / 3.4) ** 2
    knot = (krand > 0.86) * (np.exp(-kd2) * 0.55 + np.exp(-((np.sqrt(kd2) - 1.6) ** 2) / 0.30) * 0.30)
    col = col * (1 - 0.55 * np.clip(knot, 0, 1))[..., None]
    # large-scale: silvered at the top, damp/dark + algae at the foot, wide soft rain streaks
    ty0 = np.clip((ys - APEX_Y) / (BASE_Y - APEX_Y), 0, 1)
    col = col * (1 - 0.10 * (1 - ty0))[..., None] + np.array([0.20, 0.17, 0.12], np.float32) * (0.06 * (1 - ty0))[..., None]
    st = FB(90, 3, 303, aniso=0.16)
    col = col * (1 - 0.07 * np.clip(st * 2.2, 0, 1))[..., None]
    gy = smoothstep(BASE_Y - 170, BASE_Y, ys)
    grime = gy * (0.40 + 0.60 * FB01(60, 3, 305, aniso=2.5))
    col = col * (1 - 0.40 * grime)[..., None] + np.array([0.26, 0.36, 0.13], np.float32) * (0.26 * grime)[..., None]
    # sunlight raking from the left
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


def layer_k(K, rx0, ry0, wo, ho, ss=2):
    """a cairo layer in which house coordinates are drawn K times larger: output pixel (px, py) <-> house point (rx0 + px / K, ry0 + py / K)"""
    L = Layer(wo, ho, 0, 0, ss)
    L.ctx.scale(K, K)
    L.ctx.translate(-rx0, -ry0)
    return L


def render_house_k(K, rx0, ry0, wo, ho, ss=2, wide_x=None):
    """the plank house seen close up: K times the size over the house-space rectangle [rx0, rx0 + wo / K] x [ry0, ry0 + ho / K]. Every board, window, shutter, leaf and
    lantern is drawn again at that size (nothing is enlarged), in the same order and with the same random numbers as render_house(), so the same windows are lit and the
    same flower boxes hang where they hang in the distant view.  The doorway is left OPEN (alpha 0 inside it) for the caller to put the inside there; the woman is not drawn.
    -> (rgb, alpha, door_mask)"""
    rng = np.random.default_rng(73)
    base = facade_k(K, rx0, ry0, wo, ho)
    Lm = layer_k(K, rx0, ry0, wo, ho, ss)
    c = Lm.ctx
    c.new_path(); c.move_to(CXG, APEX_Y); c.line_to(CXG + HALF, BASE_Y); c.line_to(CXG - HALF, BASE_Y); c.close_path(); c.set_source_rgb(1, 1, 1); c.fill()
    if wide_x is not None:                                                 # to the right of wide_x the wall simply goes on (the corner of the roof is never shown)
        c.new_path(); c.rectangle(CXG + wide_x, APEX_Y, 4000, BASE_Y - APEX_Y); c.fill()
    mask = Lm.get()[1]
    rgb = base * mask[..., None]
    alpha = mask.copy()
    L1 = layer_k(K, rx0, ry0, wo, ho, ss)
    bargeboards(L1.ctx, sides=((-1,) if wide_x is not None else (-1, 1))); windows(L1.ctx, rng); apex_window(L1.ctx, rng)
    r1, a1 = L1.get()
    sh1 = np.clip(_shadow(a1, 4.0 * K, 6.0 * K, 3.6 * K) * (1 - a1), 0, 1) * mask
    rgb = rgb * (1 - 0.34 * sh1[..., None]) + np.array([0.05, 0.03, 0.08], np.float32) * (0.34 * sh1[..., None])
    rgb = rgb * (1 - a1[..., None]) + r1
    alpha = np.clip(alpha * (1 - a1) + a1, 0, 1)
    Ld = layer_k(K, rx0, ry0, wo, ho, ss)
    cd = Ld.ctx
    cd.new_path(); cd.move_to(CXG, BASE_Y - DH); cd.line_to(CXG + DW, BASE_Y); cd.line_to(CXG - DW, BASE_Y); cd.close_path(); cd.set_source_rgb(1, 1, 1); cd.fill()
    door = Ld.get()[1]
    rgb = rgb * (1 - door[..., None])
    alpha = alpha * (1 - door)
    L2 = layer_k(K, rx0, ry0, wo, ho, ss)
    c = L2.ctx
    door_leaf(c, -1, True); door_leaf(c, 1, False)
    steps(c); pots(c, rng); lanterns(c); ivy(c, rng)
    r2, a2 = L2.get()
    sh2 = np.clip(_shadow(a2, 5.0 * K, 7.0 * K, 4.2 * K) * (1 - a2), 0, 1) * mask
    rgb = rgb * (1 - 0.40 * sh2[..., None]) + np.array([0.04, 0.03, 0.07], np.float32) * (0.40 * sh2[..., None])
    rgb = rgb * (1 - a2[..., None]) + r2
    alpha = np.clip(alpha * (1 - a2) + a2, 0, 1)
    return rgb, alpha, door, a2


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
