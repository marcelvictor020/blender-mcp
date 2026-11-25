"""Garden actors + final assembly: the spiral of girls round a garlanded maypole (long golden shadows), the plank A-frame temple (your
reference) with a woman in the doorway, flower beds, grass, mist, the same birds and white-robed walkers as the pond, then the oil-paint pass."""
import math
import os
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
import house as HS
import meadow as MD
import critters as CR
import ribbons as RB
import reflect as RF
import invitation as INV

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
    cols = [(0.70, 0.12, 0.16), (0.98, 0.80, 0.26), (0.30, 0.48, 0.86), (0.97, 0.94, 0.86), (0.32, 0.58, 0.30), (0.88, 0.40, 0.46)]
    for k, col in enumerate(cols * 2):
        a = TAU * k / 12 + 0.3
        ex, ey = bx + math.cos(a) * 2.2 * s, by - 0.25 * s + math.sin(a) * 0.55 * s
        c.set_source_rgba(0.12, 0.08, 0.06, 0.9); c.set_line_width(0.080 * s)
        c.new_path(); c.move_to(bx, top + 0.45 * s)
        c.curve_to(bx + math.cos(a) * 0.5 * s, top + 2.4 * s, ex - math.cos(a) * 0.3 * s, ey - 2.2 * s, ex, ey); c.stroke()
        c.set_source_rgba(col[0], col[1], col[2], 1.0); c.set_line_width(0.062 * s)
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



POST_Z = [8.0, 10.6, 14.0, 18.5, 24.5, 32.0]


def post_list():
    """(px, py, sc) of every post of the avenue: one ground-plane mapping shared with the meadow, the path and the house"""
    out = []
    for Zd in sorted(POST_Z, reverse=True):
        py = HZ + G.HCAM * G.FG / Zd
        sc = (py - HZ) / G.HCAM
        for side in (-1, 1):
            out.append((CXG + side * 1.75 * G.FG / Zd, py, sc))
    return out


def posts_shadow(x0, w):
    """long soft shadows of the avenue posts lying across the path, all running away from the sun's footpoint (a one-point-perspective fan)"""
    m = np.zeros((H, w), np.float32)
    for (px, py, sc) in post_list():
        ux, uy = sun_shadow_dir(px, py, length=1.0)
        ln = 2.45 * sc * 1.5
        th = max(2.0, 0.085 * sc)                                              # thickness measured across the shadow, not across the post
        nx_, ny_ = -uy, ux
        bx, by = px - x0, py
        pts = np.array([[bx - th * nx_, by - th * ny_], [bx + th * nx_, by + th * ny_], [bx + ux * ln + 0.55 * th * nx_, by + uy * ln + 0.55 * th * ny_],
                        [bx + ux * ln - 0.55 * th * nx_, by + uy * ln - 0.55 * th * ny_]], np.float32)
        cv2.fillConvexPoly(m, (pts * 4).astype(np.int32), 1.0, lineType=cv2.LINE_AA, shift=2)
    return cv2.GaussianBlur(m, (0, 0), 2.4)


def lantern_posts(out, x0, w, rng):
    """an avenue of painted posts with lanterns running to the door, with bunting from post to post: the strongest perspective cue in the garden
    (heights, spacing and widths all follow the same ground-plane mapping as the meadow, the path and the house)"""
    FGl, HC = G.FG, G.HCAM
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    tops = {-1: [], 1: []}
    for (px, py, sc) in post_list():
        if True:
            side = -1 if px < CXG else 1
            if not (x0 - 80 < px < x0 + w + 80): continue
            ph, pw = 2.45 * sc, max(1.6, 0.070 * sc)
            gp = cairo.LinearGradient(px - pw, 0, px + pw, 0)
            gp.add_color_stop_rgb(0, 0.82, 0.34, 0.24); gp.add_color_stop_rgb(0.55, 0.60, 0.17, 0.15); gp.add_color_stop_rgb(1, 0.30, 0.08, 0.09)
            c.set_source(gp); c.new_path(); c.rectangle(px - pw, py - ph, 2 * pw, ph); c.fill_preserve()
            c.set_source_rgba(0.17, 0.11, 0.10, 0.8); c.set_line_width(max(0.7, 0.012 * sc)); c.stroke()
            for b in range(3):                                                    # painted bands like a dalarna post
                by = py - ph * (0.18 + 0.12 * b)
                c.set_source_rgb(0.97, 0.90, 0.62); c.new_path(); c.rectangle(px - pw, by, 2 * pw, 0.05 * sc); c.fill()
            lw, lh = 0.17 * sc, 0.30 * sc
            ly = py - ph - lh
            gl = cairo.RadialGradient(px, ly + lh * 0.5, 1, px, ly + lh * 0.5, 0.95 * sc)
            gl.add_color_stop_rgba(0, 1.0, 0.82, 0.45, 0.55); gl.add_color_stop_rgba(0.4, 1.0, 0.66, 0.28, 0.20); gl.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)
            c.set_source(gl); c.new_path(); c.arc(px, ly + lh * 0.5, 0.95 * sc, 0, TAU); c.fill()
            c.new_path(); c.move_to(px - lw * 0.7, ly + lh); c.line_to(px - lw, ly + lh * 0.2); c.line_to(px, ly - lh * 0.12); c.line_to(px + lw, ly + lh * 0.2); c.line_to(px + lw * 0.7, ly + lh); c.close_path()
            gg = cairo.LinearGradient(0, ly, 0, ly + lh); gg.add_color_stop_rgb(0, 1.0, 0.95, 0.70); gg.add_color_stop_rgb(1, 1.0, 0.72, 0.30)
            c.set_source(gg); c.fill_preserve(); c.set_source_rgba(0.17, 0.11, 0.10, 0.85); c.set_line_width(max(0.7, 0.014 * sc)); c.stroke()
            tops[side].append((px - x0, ly - 0.02 * sc))
    rgb, a = L.get()
    out = out * (1 - a[..., None]) + rgb
    gold = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    for side in (-1, 1):
        P = sorted(tops[side], key=lambda p: -p[1])                              # near -> far
        for (p0, p1) in zip(P[:-1], P[1:]):
            span = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            CR.festoon(out, p0, p1, 0.10 * span, max(4, int(span / 26)), rng, fw=max(7, 0.40 * span / max(4, int(span / 26)) + 6), pal=gold)
    return out


def festive(out, x0, w, s_pole):
    """crisp details painted on top: bunting with folk flowers between the maypole and the house, a doe and her fawn at the forest edge, sky lanterns
    drifting on, butterflies over the meadow, fireflies waking in the shade of the trees"""
    rng = np.random.default_rng(404)
    cx, by = RING['cx'], RING['base_y']
    top = by - 7.4 * s_pole
    sh = lambda p: (p[0] - x0, p[1])
    gold = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    rr_, ra_ = RB.ribbon_layer(x0, w)                                     # the five silk ribbons that left the arch's canopy arrive at the maypole
    ramp = smoothstep(8668, 8699, np.arange(x0, x0 + w, dtype=np.float32))[None, :]
    out = out * (1 - ra_[..., None] * ramp[..., None]) + rr_ * ramp[..., None]
    CR.festoon(out, sh((cx, top + 0.6 * s_pole)), sh((CXG, APEX_Y + 6)), 90, 34, rng, fw=30, pal=gold)
    CR.festoon(out, sh((cx, top + 1.5 * s_pole)), sh((CXG - HALF + 24, BASE_Y - 26)), 70, 22, rng, fw=26, pal=gold[1:] + gold[:1])
    CR.festoon(out, sh((CXG, APEX_Y + 6)), sh((CXG - HALF * 0.97, BASE_Y - 24)), 8, 30, rng, fw=22, pal=gold)
    CR.festoon(out, sh((CXG, APEX_Y + 6)), sh((CXG + HALF * 0.97, BASE_Y - 24)), 8, 30, rng, fw=22, pal=gold[2:] + gold[:2])
    CR.deer_pair(out, 12180 - x0, HZ + 176, 104)
    CR.deer_pair(out, 12760 - x0, HZ + 130, 70)
    before_sky = out.copy()
    for (lx, ly, S) in CR.lantern_flock():
        if x0 + 40 < lx < x0 + w - 40 and lx >= 8750:
            CR.sky_lantern(out, lx - x0, ly, S, day=0.55, warm=0.8)
    out = lantern_posts(out, x0, w, rng)
    CR.moon_open_eyed(out, 12560 - x0, 300, 96)                                                   # the moon that is about to be drawn: its eyes are open
    kinds = ['monarch', 'blue', 'yellow', 'white', 'admiral']
    items = []
    for i in range(18):
        x = rng.uniform(8900, 12600); y = rng.uniform(980, 1290)
        S = 11 + 16 * (y - 980) / 310.0
        items.append((x - x0, y, S * rng.uniform(0.85, 1.2), rng.uniform(-0.9, 0.9), kinds[i % 5], rng.uniform(0.35, 0.95), int(rng.integers(1 << 20))))
    CR.butterflies(out, items)
    _ys = np.arange(H, dtype=np.float32)[:, None]; _xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    lake_m = ((_ys < G.lake_y(_xs) - 6) & (_xs < 10200)).astype(np.float32)
    out = RF.add_reflections(out, before_sky, x0, w, lake_m)
    CR.fireflies(out, rng, 46, (10800 - x0, 12880 - x0), (700, 1010), size=(1.2, 2.6), glow=0.55, color=(1.0, 0.92, 0.55))
    return out

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
    ch = CH.render_chain(x0, w, 7650, 10200, verbose=verbose, split_y=RING['base_y'], shadow_dir=lambda gx, gy: sun_shadow_dir(gx, gy, length=1.35), ss=3, shadow_blur=0.020, shadow_strength=0.62)
    # long pole shadow along the line away from the sun's footpoint + the dancers' shadows + the avenue posts
    s_pole = FG / CH.ring_geometry()[1]
    pole_sh = np.zeros((H, w), np.float32)
    px, py = RING['cx'] - x0, RING['base_y']
    ux, uy = sun_shadow_dir(RING['cx'], RING['base_y'], length=1.0)
    Lp_ = 7.4 * s_pole * 1.35
    nxp, nyp = -uy, ux
    poly = np.array([[px - 7 * nxp, py - 7 * nyp], [px + 7 * nxp, py + 7 * nyp], [px + ux * Lp_ + 12 * nxp, py + uy * Lp_ + 12 * nyp], [px + ux * Lp_ - 12 * nxp, py + uy * Lp_ - 12 * nyp]], np.float32)
    cv2.fillConvexPoly(pole_sh, (poly * 4).astype(np.int32), 1.0, lineType=cv2.LINE_AA, shift=2)
    post_sh = posts_shadow(x0, w)
    shadow = np.clip(np.maximum(np.maximum(np.maximum(ch['shadow'], 0.5 * tshadow), 0.55 * cv2.GaussianBlur(pole_sh, (0, 0), 3.0)), 0.9 * post_sh), 0, 1) * land
    hr, ta = HS.render_house(x0, w)
    img = img * (1 - ta[..., None]) + hr
    dz, dza = G.daisies(x0, w)
    img = img * (1 - dza[..., None]) + dz
    mr_, ma_ = MD.meadow(x0, w, path=(CXG, BASE_Y))
    img = img * (1 - ma_[..., None]) + mr_
    shadow_col = np.array([0.07, 0.09, 0.24], np.float32)                      # golden-hour shadows are blue-violet (lit by the sky, not the sun)
    img = img * (1 - 0.56 * shadow[..., None]) + shadow_col * (0.56 * shadow[..., None])   # shadows fall on the grass and flowers too
    img, inv_people, inv_extra = INV.render(x0, w, img)                                          # slide 11: the invitation (gate, path, the two girls)
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
    cache_save('f_garden_raw', x0, img)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    people = np.maximum(np.maximum(ch['alpha'], ch['alpha_b']), inv_people)
    if os.environ.get('FINISH', 'ink') == 'ink':
        import ink as INK
        lake_keep = ((ys > HZ + 2) & (ys < G.lake_y(xs) - 3) & (xs < 10200)).astype(np.float32)
        keep = np.clip(0.75 * (ma_ > 0.3) + 0.55 * (ta > 0.5) + 0.65 * (people > 0.5) + 0.85 * (mpa > 0.15) + 0.85 * lake_keep + 0.55 * (inv_extra.get('pergola', 0 * ta) > 0.2) + 0.30 * (inv_extra.get('glow', 0 * ta).mean(-1) > 0.2 if 'glow' in inv_extra else 0), 0, 1).astype(np.float32)
        keep = cv2.GaussianBlur(keep, (0, 0), 2.0)
        out = INK.finish(img, lines=[(ta > 0.5, 2.6, 0.95), (people > 0.5, 1.6, 0.85), (mpa > 0.5, 1.8, 0.9), (inv_people > 0.5, 1.4, 0.55)], keep=keep, seed=9, light_x=-1.0)
        if verbose: print('inked', round(time.time() - t0, 1))
        br, ba = birds_garden(x0, w)
        out = out * (1 - ba[..., None]) + br
        out = festive(out, x0, w, s_pole)
        return np.clip(out, 0, 1).astype(np.float32)
    detail = np.clip(edges + (people > 0.5) * 0.6 + (ta > 0.5) * 0.3 + (mpa > 0.5) * 0.4 + (ma_ > 0.3) * 0.35, 0, 1)
    fine_hard = (people > 0.5) | (mpa > 0.6)
    sk = 0.30 + 0.35 * cv2.GaussianBlur((people > 0.3).astype(np.float32), (0, 0), 4.0)
    out, n = paint(img, passes=((9, 1.0, 0.0), (5.5, 1.0, 0.03), (3.4, 1.0, 0.04), (2.1, 1.1, 0.05), (1.4, 1.3, 0.07)),
                   default_flow=0.0, default_w=0.5, detail=detail, seed=9, struct_keep=sk, verbose=verbose, fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    br, ba = birds_garden(x0, w)
    out = out * (1 - ba[..., None]) + br
    out = festive(out, x0, w, s_pole)
    out = INV.living(out, x0, w)
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
    save_png(WORK + '/g_s11.png', img[:, 10800 - GX0:11880 - GX0])
