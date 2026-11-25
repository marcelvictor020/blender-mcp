"""Garden actors + final assembly: the spiral of girls round a garlanded maypole (long golden shadows), the plank A-frame temple (your
reference) with a woman in the doorway, flower beds, grass, mist, the same birds and white-robed walkers as the pond, then the oil-paint pass."""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
from folk import Z
import fig
from fig import Light
import garden as G
import chain as CH
from garden import gpt, lake_y, GX0, GX1, GW, CXG, BASE_Y, APEX_Y, HALF, FG, HCAM, SUN_G
from trees import leaf

TAU = 2 * math.pi
DRESSES, BELTS, HAIRS, SKINS = CH.DRESSES, CH.BELTS, CH.HAIRS, CH.SKINS
sun_light = CH.sun_light
_over = CH._over


# ============================================================================================ maypole
def maypole(w, x0, base, s, height_m=7.4):
    """a midsummer pole wrapped in leaves and flowers, a crossbar with two hanging hoops, ribbons down to the dancers"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    bx, by = base
    top = by - height_m * s
    r = Z(5)
    pw = 0.15 * s
    g = cairo.LinearGradient(bx - pw, 0, bx + pw, 0)
    g.add_color_stop_rgb(0, 0.50, 0.52, 0.24); g.add_color_stop_rgb(0.5, 0.24, 0.38, 0.15); g.add_color_stop_rgb(1, 0.09, 0.17, 0.08)
    c.set_source(g); c.new_path(); c.rectangle(bx - pw, top, 2 * pw, by - top); c.fill()
    bar_y = top + 0.55 * s
    bar = 1.30 * s
    c.set_source(g); c.new_path(); c.rectangle(bx - bar, bar_y - 0.07 * s, 2 * bar, 0.14 * s); c.fill()
    cols = [(0.97, 0.94, 0.84), (0.95, 0.80, 0.42), (0.74, 0.82, 0.95), (0.92, 0.66, 0.66), (0.97, 0.94, 0.84), (0.55, 0.72, 0.52)]
    for k, col in enumerate(cols * 2):
        a = TAU * k / 12 + 0.3
        ex, ey = bx + math.cos(a) * 2.2 * s, by - 0.25 * s + math.sin(a) * 0.55 * s
        c.set_source_rgba(col[0], col[1], col[2], 0.88); c.set_line_width(0.045 * s)
        c.new_path(); c.move_to(bx, top + 0.45 * s)
        c.curve_to(bx + math.cos(a) * 0.5 * s, top + 2.4 * s, ex - math.cos(a) * 0.3 * s, ey - 2.2 * s, ex, ey); c.stroke()
    for sx in (-1, 1):
        hx, hy = bx + sx * bar * 0.90, bar_y + 0.95 * s
        c.set_source_rgba(0.14, 0.26, 0.10, 1); c.set_line_width(0.16 * s)
        c.new_path(); c.arc(hx, hy, 0.62 * s, 0, TAU); c.stroke()
        for i in range(40):
            a_ = TAU * i / 40
            leaf(c, hx + math.cos(a_) * 0.62 * s, hy + math.sin(a_) * 0.62 * s, 0.24 * s, a_ + 1.2, (0.20 + 0.18 * r.random(), 0.36 + 0.16 * r.random(), 0.14))
        for i in range(16):
            a_ = TAU * i / 16 + 0.2
            col = [(0.97, 0.95, 0.88), (0.95, 0.78, 0.30), (0.92, 0.55, 0.60)][i % 3]
            c.set_source_rgba(*col, 1); c.new_path(); c.arc(hx + math.cos(a_) * 0.62 * s, hy + math.sin(a_) * 0.62 * s, 0.065 * s, 0, TAU); c.fill()
    n = 190
    for i in range(n):
        t = i / n
        y = by - t * (by - top)
        ph = t * 30.0
        x = bx + math.sin(ph) * pw * 1.2
        for k in range(2):
            leaf(c, x, y, 0.21 * s * (0.8 + 0.4 * r.random()), math.pi / 2 + math.sin(ph) * 1.3 + k * 2.4, (0.16 + 0.20 * r.random(), 0.32 + 0.18 * r.random(), 0.12 + 0.05 * r.random()))
        if i % 3 == 0:
            col = [(0.97, 0.95, 0.88), (0.95, 0.78, 0.30), (0.90, 0.50, 0.58), (0.72, 0.80, 0.96)][i % 4]
            c.set_source_rgba(*col, 1); c.new_path(); c.arc(x + math.sin(ph + 1.0) * 0.06 * s, y, 0.050 * s, 0, TAU); c.fill()
    for i in range(22):
        a_ = TAU * i / 22
        leaf(c, bx + math.cos(a_) * 0.30 * s, top + math.sin(a_) * 0.18 * s - 0.08 * s, 0.26 * s, a_ - 1.2, (0.20, 0.38, 0.14))
    c.set_source_rgba(0.98, 0.84, 0.36, 1); c.new_path(); c.arc(bx, top - 0.10 * s, 0.10 * s, 0, TAU); c.fill()
    return L.get()


# ============================================================================================ the temple (plank A-frame)
def temple(x0, w):
    ap = (CXG, APEX_Y); bl = (CXG - HALF, BASE_Y); br = (CXG + HALF, BASE_Y)
    tri = Layer(w, H, x0, 0, 2)
    c = tri.ctx
    c.new_path(); c.move_to(*ap); c.line_to(*br); c.line_to(*bl); c.close_path(); c.set_source_rgb(1, 1, 1); c.fill()
    _, mask = tri.get()
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    ph = 23.0
    k = np.floor((ys - APEX_Y) / ph)
    fr = (ys - APEX_Y) / ph - k
    rnd = np.sin(k * 12.9898 + 4.1) * 43758.5453 % 1.0
    tone = 0.90 + 0.20 * rnd
    grain = fbm(x0, 0, w, H, 9, 4, 301, aniso=55.0) * 0.5 + fbm(x0, 0, w, H, 4, 3, 302, aniso=70.0) * 0.5
    knots = np.exp(-(((np.sin(xs * 0.043 + k * 3.1) * 0.5 + 0.5) - 0.5) / 0.04) ** 2) * (rnd > 0.55) * np.exp(-((fr - 0.5) / 0.22) ** 2) * 0.25
    base = np.array([0.88, 0.66, 0.30], np.float32)
    col = base[None, None, :] * (tone * (1 + 0.14 * grain))[..., None]
    seam = np.exp(-(fr / 0.045) ** 2) + np.exp(-((1 - fr) / 0.03) ** 2) * 0.5
    col = col * (1 - 0.55 * np.clip(seam, 0, 1))[..., None] * (1 - knots)[..., None]
    u = (xs - bl[0]) / (br[0] - bl[0])
    lit = 1.14 - 0.58 * smoothstep(0.0, 1.0, u) ** 0.85
    col = col * lit[..., None]
    foot = smoothstep(BASE_Y - 140, BASE_Y, ys)
    col = col * (1 - 0.12 * foot)[..., None] + np.array([0.18, 0.26, 0.05], np.float32) * (0.10 * foot)[..., None]
    col = col + np.array([0.20, 0.12, 0.02], np.float32) * (np.exp(-((u) / 0.07) ** 2) * 0.5)[..., None]
    rgb = np.clip(col, 0, 1)
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    for side in (-1, 1):
        xb = CXG + side * HALF
        c.set_source_rgb(0.62, 0.43, 0.18); c.set_line_width(13)
        c.new_path(); c.move_to(ap[0], ap[1] + 4); c.line_to(xb - side * 6, BASE_Y); c.stroke()
        c.set_source_rgba(1.0, 0.86, 0.52, 0.40 if side < 0 else 0.15); c.set_line_width(3)
        c.new_path(); c.move_to(ap[0] - side * 5, ap[1] + 12); c.line_to(xb - side * 11, BASE_Y); c.stroke()
    lit_set = {(-1, 0, 2), (-1, 0, 4), (1, 0, 1), (1, 0, 3), (-1, 1, 2), (1, 1, 1)}
    for side in (-1, 1):
        d = np.array([side * HALF, BASE_Y - APEX_Y], np.float32); L_ = float(np.linalg.norm(d)); d = d / L_
        nrm = np.array([-d[1], d[0]], np.float32) * (1 if side > 0 else -1)
        nrm = nrm if nrm[0] * side < 0 else -nrm
        for row, off in enumerate((46, 106)):
            n_w = 5 if row == 0 else 4
            for i in range(n_w):
                t = (0.20 + 0.60 * i / (n_w - 1)) * (1 - 0.05 * row)
                P0 = np.array([CXG, APEX_Y], np.float32) + d * (t * L_)
                xx, yy = P0 + nrm * off
                wv, hv = 20, 28
                lit_w = (side, row, i) in lit_set
                c.set_source_rgb(0.74, 0.54, 0.24); c.new_path(); c.rectangle(xx - wv / 2 - 3, yy - hv / 2 - 3, wv + 6, hv + 6); c.fill()
                c.set_source_rgb(*(1.0, 0.82, 0.40) if lit_w else (0.08, 0.07, 0.09)); c.new_path(); c.rectangle(xx - wv / 2, yy - hv / 2, wv, hv); c.fill()
                if lit_w:
                    gg = cairo.RadialGradient(xx, yy, 2, xx, yy, 62); gg.add_color_stop_rgba(0, 1, .8, .35, .50); gg.add_color_stop_rgba(1, 1, .8, .35, 0)
                    c.set_source(gg); c.new_path(); c.arc(xx, yy, 62, 0, TAU); c.fill()
                c.set_source_rgba(0.28, 0.17, 0.06, 0.9); c.set_line_width(1.6); c.new_path(); c.move_to(xx, yy - hv / 2); c.line_to(xx, yy + hv / 2); c.move_to(xx - wv / 2, yy); c.line_to(xx + wv / 2, yy); c.stroke()
    c.set_source_rgb(0.62, 0.44, 0.20); c.new_path(); c.rectangle(CXG - 40, 262, 80, 84); c.fill()
    c.set_source_rgb(0.05, 0.045, 0.06); c.new_path(); c.rectangle(CXG - 31, 271, 62, 66); c.fill()
    c.set_source_rgba(0.40, 0.27, 0.10, 0.9); c.set_line_width(2.5); c.new_path(); c.rectangle(CXG - 31, 271, 62, 66); c.stroke()
    dw, dh = 118, 200
    dl, dr_, da = (CXG - dw, BASE_Y), (CXG + dw, BASE_Y), (CXG, BASE_Y - dh)
    c.set_source_rgb(0.03, 0.03, 0.04); c.new_path(); c.move_to(*da); c.line_to(*dr_); c.line_to(*dl); c.close_path(); c.fill()
    for kk, sc in enumerate((0.66, 0.42, 0.26)):
        apx, apy = CXG, HZ - (HZ - da[1]) * sc
        by = HZ + (BASE_Y - HZ) * sc
        c.set_source_rgba(0.95, 0.74, 0.30, 0.85 - 0.2 * kk); c.set_line_width(5.0 - 1.4 * kk)
        c.new_path(); c.move_to(apx, apy); c.line_to(CXG + dw * sc, by); c.line_to(CXG - dw * sc, by); c.close_path(); c.stroke()
    gg = cairo.RadialGradient(CXG, HZ, 1, CXG, HZ, 40); gg.add_color_stop_rgba(0, 1.0, 0.82, 0.45, 0.95); gg.add_color_stop_rgba(1, 1.0, 0.7, 0.3, 0)
    c.set_source(gg); c.new_path(); c.arc(CXG, HZ, 40, 0, TAU); c.fill()
    la, ra_ = L.get()
    out_rgb = rgb * mask[..., None]
    out_rgb = out_rgb * (1 - ra_[..., None]) + la
    return out_rgb, np.clip(mask, 0, 1)


def tri_x(y, side):
    t = (y - APEX_Y) / (BASE_Y - APEX_Y)
    return CXG + side * HALF * t


def ivy_layer(x0, w):
    """climbing ivy: runners with paired leaves up both edges, across the lower facade and spilling over the roof edge (golden-hour greens)"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    r = np.random.default_rng(73)
    pal = [(0.16, 0.34, 0.10), (0.22, 0.42, 0.12), (0.30, 0.50, 0.14), (0.12, 0.26, 0.08), (0.42, 0.55, 0.16), (0.36, 0.48, 0.12)]

    def runner(x, y, ang, length, depth=0):
        px, py = x, y
        for k in range(int(length / 11)):
            a = ang + r.normal(0, .22)
            px += math.cos(a) * 11; py += math.sin(a) * 11
            c.set_source_rgba(0.08, 0.16, 0.05, 1); c.set_line_width(2.2); c.new_path(); c.move_to(px - math.cos(a) * 11, py - math.sin(a) * 11); c.line_to(px, py); c.stroke()
            for sd in (-1, 1):
                if r.random() < .72:
                    leaf(c, px, py, r.uniform(15, 27), a + sd * r.uniform(.7, 1.5), pal[int(r.integers(len(pal)))])
            if depth < 1 and r.random() < .06:
                runner(px, py, a + r.choice([-1, 1]) * r.uniform(.5, 1.1), length * 0.35, depth + 1)
    for side, top in ((-1, 0.40), (1, 0.62)):
        for j in range(4):
            yy = BASE_Y - 6 - j * 6
            xx = tri_x(yy, side) - side * (14 + 12 * j)
            ang = math.atan2(APEX_Y - BASE_Y, -side * HALF) + r.normal(0, .06)
            runner(xx, yy, ang, (BASE_Y - APEX_Y) * top * r.uniform(.75, 1.1) / 0.9)
    for j in range(9):
        runner(r.uniform(CXG - HALF * .72, CXG + HALF * .72), BASE_Y - 4, -math.pi / 2 + r.normal(0, .55), r.uniform(60, 200))
    for j in range(16):
        side = r.choice([-1, 1]); yy = r.uniform(APEX_Y + 90, BASE_Y - 210)
        runner(tri_x(yy, side), yy, math.pi / 2 - side * 0.9 + r.normal(0, .3), r.uniform(25, 70))
    return L.get()


def doors_and_woman(x0, w):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    dw = 118
    for side in (-1, 1):
        hx = CXG + side * (dw + 2)
        pts = [(hx, BASE_Y), (hx + side * 40, BASE_Y - 8), (hx + side * 46, BASE_Y - 214), (hx + side * 6, BASE_Y - 192)]
        gd = cairo.LinearGradient(pts[0][0], 0, pts[1][0], 0)
        if side < 0: gd.add_color_stop_rgb(0, 0.20, 0.50, 0.74); gd.add_color_stop_rgb(1, 0.38, 0.72, 0.90)
        else: gd.add_color_stop_rgb(0, 0.14, 0.38, 0.60); gd.add_color_stop_rgb(1, 0.24, 0.52, 0.74)
        c.set_source(gd); c.new_path(); c.move_to(*pts[0]); [c.line_to(*p) for p in pts[1:]]; c.close_path(); c.fill()
        c.set_source_rgba(0.08, 0.20, 0.34, 0.9); c.set_line_width(2.0); c.new_path(); c.move_to(*pts[0]); [c.line_to(*p) for p in pts[1:]]; c.close_path(); c.stroke()
        c.set_source_rgba(0.88, 0.96, 1.0, 0.55); c.set_line_width(2.2)
        c.new_path(); c.move_to(pts[0][0] + side * 6, pts[0][1] - 18); c.line_to(pts[2][0] - side * 5, pts[2][1] + 16); c.move_to(pts[1][0] - side * 5, pts[1][1] - 14); c.line_to(pts[3][0] + side * 5, pts[3][1] + 16); c.stroke()
        for kk in range(3):
            c.set_source_rgba(0.06, 0.18, 0.30, 0.45); c.set_line_width(1.4)
            f = (kk + 1) / 4
            c.new_path(); c.move_to(pts[0][0] + (pts[1][0] - pts[0][0]) * f, pts[0][1] + (pts[1][1] - pts[0][1]) * f); c.line_to(pts[3][0] + (pts[2][0] - pts[3][0]) * f, pts[3][1] + (pts[2][1] - pts[3][1]) * f); c.stroke()
    la, aa = L.get()
    interior = Light(key_dir=(-0.45, -0.20, 0.85), key_col=(1.0, 0.86, 0.62), key_gain=0.55, amb_col=(0.55, 0.52, 0.58), amb_gain=0.38,
                     bounce_col=(0.30, 0.22, 0.10), bounce_gain=0.3, rim_dir=(0.9, -0.2, 0.2), rim_col=(1.0, 0.8, 0.5), rim_gain=0.45)
    sp = fig.render(150, dict(view='front', yaw=0.0, arm_l=(-0.118, 0.470), arm_r=(0.118, 0.470), hair=(0.30, 0.20, 0.12), dress=(0.95, 0.93, 0.88),
                               crown=True, smile=0.0, feet=False, hem_y=0.0, bow=True), interior, seed=17)
    ox, oy = sp['anchor']
    rgb_s = sp['rgb'] / np.maximum(sp['a'], 1e-4)[..., None]
    pm = np.zeros((H, w, 3), np.float32); pa = np.zeros((H, w), np.float32)
    _over(pm, pa, rgb_s, sp['a'], int(round(CXG - x0 - ox)), int(round(BASE_Y - 3 - oy)))
    return la, aa, pm, pa


# ============================================================================================ walkers on the far lawn + birds
def walkers_garden(x0, w):
    """the white-robed procession keeps walking the far edge of the lawn, in front of the forest foot"""
    canvas = np.zeros((H, w, 3), np.float32); alpha = np.zeros((H, w), np.float32)
    gold = Light(key_dir=(-0.8, -0.15, 0.55), key_col=(1.0, 0.82, 0.55), key_gain=1.0, amb_col=(0.55, 0.62, 0.78), amb_gain=0.55,
                 bounce_col=(0.3, 0.3, 0.15), bounce_gain=0.3, rim_dir=(-0.95, -0.2, 0.0), rim_col=(1.0, 0.85, 0.55), rim_gain=0.5)
    for i, (x, h, sd) in enumerate(PROCESSION):
        if not (x0 - 20 < x < x0 + w + 20) or x < 8900: continue
        T = max(16, int(h * 1.10))
        sp = fig.render(T, dict(view='front' if i % 2 else 'side', facing=1, arm_l=(-0.118, 0.47), arm_r=(0.118, 0.47), crown=(i % 3 == 0), feet=False,
                                 hair=(0.40, 0.28, 0.16)), gold, seed=sd, ss=2)
        ox, oy = sp['anchor']
        rgb_s = sp['rgb'] / np.maximum(sp['a'], 1e-4)[..., None]
        _over(canvas, alpha, rgb_s, sp['a'], int(round(x - x0 - ox)), int(round(HZ + 8 - oy)))
    return canvas, alpha


def birds_garden(x0, w):
    from pond2 import draw_bird_real
    L = Layer(w, H, x0, 0, 2)
    for (bx, by, bs, ba, seed) in BIRDS:
        if bx < 6300: continue
        draw_bird_real(L.ctx, bx, by, bs * 0.95, ba * 0.7, seed, (seed % 100) * 0.4 + bx * 0.011)
    rgb, a = L.get()
    return cv2.GaussianBlur(rgb, (0, 0), 0.6) * 1.0, cv2.GaussianBlur(a, (0, 0), 0.7)


# ============================================================================================ assembly
def render_garden(x0=GX0, w=GW, paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    img = G.build_environment(x0, w, verbose=False)
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    land = ((ys > HZ) & (ys > G.lake_y(xs)) | (xs >= 10200)).astype(np.float32)
    land = np.where(ys > HZ, land, 0.0).astype(np.float32)
    gr, ga = G.grass_blades(x0, w)
    img = img * (1 - ga[..., None]) + gr
    if verbose: print('grass', round(time.time() - t0, 1))
    dx = xs - (CXG + HALF)
    ax = smoothstep(-40, 110, dx) * (1 - smoothstep(380, 1250, dx))
    ytop = BASE_Y - 8
    ybot = BASE_Y + 78 + 0.16 * np.clip(dx, 0, None)
    tshadow = np.clip(ax * smoothstep(ytop, ytop + 16, ys) * (1 - smoothstep(ybot - 24, ybot + 72, ys)), 0, 1)
    ch = CH.render_chain(x0, w, 7650, 10200, verbose=verbose, split_y=RING['base_y'])
    # long pole shadow (to the right) + the dancers' shadows
    s_pole = FG / CH.ring_geometry()[1]
    pole_sh = np.zeros((H, w), np.float32)
    px, py = RING['cx'] - x0, RING['base_y']
    poly = np.array([[px - 7, py], [px + 7, py], [px + 7.4 * s_pole * 1.15 + 12, py + 7.4 * s_pole * 0.52], [px + 7.4 * s_pole * 1.15 - 12, py + 7.4 * s_pole * 0.52]], np.float32)
    cv2.fillConvexPoly(pole_sh, (poly * 4).astype(np.int32), 1.0, lineType=cv2.LINE_AA, shift=2)
    shadow = np.clip(np.maximum(np.maximum(ch['shadow'], 0.5 * tshadow), 0.55 * cv2.GaussianBlur(pole_sh, (0, 0), 3.0)), 0, 1) * land
    img = img * (1 - 0.50 * shadow[..., None]) + np.array([0.04, 0.09, 0.14], np.float32) * (0.50 * shadow[..., None])
    tr, ta = temple(x0, w)
    img = img * (1 - ta[..., None]) + tr
    la, aa, pm, pa = doors_and_woman(x0, w)
    img = img * (1 - aa[..., None]) + la
    img = img * (1 - pa[..., None]) + pm
    iv, iva = ivy_layer(x0, w)
    img = img * (1 - iva[..., None]) + iv
    fb, fa = G.flower_beds(x0, w)
    img = img * (1 - fa[..., None]) + fb
    dz, dza = G.daisies(x0, w)
    img = img * (1 - dza[..., None]) + dz
    wc, wa = walkers_garden(x0, w)
    img = img * (1 - wa[..., None]) + wc * wa[..., None]
    img = img * (1 - ch['alpha_b'][..., None]) + ch['canvas_b'] * ch['alpha_b'][..., None]
    mp, mpa = maypole(w, x0, (RING['cx'], RING['base_y'] - 2), s_pole)
    img = img * (1 - mpa[..., None]) + mp
    img = img * (1 - ch['alpha'][..., None]) + ch['canvas'] * ch['alpha'][..., None]
    if verbose: print('actors', round(time.time() - t0, 1))
    bloom = np.exp(-(((xs - SUN_G[0]) / 2200.0) ** 2 + ((ys - 700) / 520.0) ** 2))
    img = 1 - (1 - img) * (1 - bloom[..., None] * np.array([0.22, 0.12, 0.02], np.float32))
    wisp = np.exp(-((ys - (BASE_Y - 24)) / 36.0) ** 2) * fbm01(x0, 0, w, H, 150, 4, 33, aniso=6.0) * smoothstep(9700, 10100, xs) * (1 - smoothstep(10900, 11600, xs)) * 0.38
    img = img * (1 - wisp[..., None]) + np.array([1.0, 0.92, 0.72], np.float32) * wisp[..., None]
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it:
        return img
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    people = np.maximum(ch['alpha'], ch['alpha_b'])
    detail = np.clip(edges + (people > 0.5) * 0.6 + (ta > 0.5) * 0.3 + (mpa > 0.5) * 0.4, 0, 1)
    fine_hard = (people > 0.5) | (mpa > 0.6)
    sk = 0.30 + 0.35 * cv2.GaussianBlur((people > 0.3).astype(np.float32), (0, 0), 4.0)
    out, n = paint(img, passes=((9, 1.0, 0.0), (5.5, 1.0, 0.03), (3.4, 1.0, 0.04), (2.1, 1.1, 0.05), (1.4, 1.3, 0.07)),
                   default_flow=0.0, default_w=0.5, detail=detail, seed=9, struct_keep=sk, verbose=verbose, fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    br, ba = birds_garden(x0, w)
    out = out * (1 - ba[..., None]) + br
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_garden()
    print('garden', round(time.time() - t, 1), 's')
    cache_save('f_garden', GX0, img)
    preview(img, WORK + '/g_preview.png', 2200)
    save_png(WORK + '/g_ring.png', img[:, 8640 - GX0:9720 - GX0])
    save_png(WORK + '/g_temple.png', img[:, 9720 - GX0:10800 - GX0])
