"""Slides 1-2: THE SUN / THE MOON  -  naive dalmalning mural on plywood (x 0..~2700)."""
import math, sys
import numpy as np
import cv2
import cairo
from util import *
from folk import *
from sky import sky_rgb
from shared import RIBBON, ribbon_thick

SUN = (0.0, 330.0, 300.0)                                   # centre sits ON the loop seam -> cut in half
LONG_ANG = math.atan2(100.0, 1497.0)
MOON = (1690.0, 430.0, 175.0)
SHORE = [(1070, 1380), (1160, 1300), (1250, 1245), (1330, 1160), (1480, 1105), (1620, 1060), (1740, 985),
         (1900, 938), (2050, 872), (2200, 846), (2420, 812), (2700, 794), (3000, 787)]
def night(x):
    return float(smoothstep(850, 1550, x))


def shore_y(x):
    xs, ys = zip(*SHORE)
    x = np.asarray(x, np.float32)
    fade = np.clip((np.interp(x, xs, ys) - HZ) / 120.0, 0, 1)
    return np.interp(x, xs, ys) + fade * (9 * np.sin(x / 46.0) + 5 * np.sin(x / 17.0 + 1.3))


def xgrad(xa, xb, ca, cb):
    g = cairo.LinearGradient(xa, 0, xb, 0)
    g.add_color_stop_rgb(0, *ca); g.add_color_stop_rgb(1, *cb)
    return g


def tn(c, x): return tint_night(c, night(x))


# ----------------------------------------------------------------------------- base wash
def build_base(x0, w):
    ply = plywood(x0, 0, w, H, seed=3)
    sky = sky_rgb(x0, w, HZ, bands=10)
    mir = sky[::-1][:H - HZ] * 0.82
    wash = np.concatenate([sky, mir], 0)
    # painted-wash mottling and long brush streaks
    streak = fbm(x0, 0, w, H, 11, 3, 61, aniso=70.0)
    mott = fbm(x0, 0, w, H, 150, 4, 62)
    wash = wash * (1 + 0.028 * streak + 0.04 * mott)[..., None]
    grain = ply / ply.mean((0, 1))
    return np.clip(wash * grain ** 1.35, 0, 1).astype(np.float32), ply


def composite(F, base, ply, seed=0):
    h, w = base.shape[:2]
    x0 = F.x0
    pr, pa = F.paint.get(); sr, sa = F.shade.get(); ir, ia = F.ink.get(); lr, la = F.light.get()
    dxp, dyp = wobble_field(x0, 0, w, H, amp=1.0, cell=40, seed=seed + 1)
    dxi, dyi = wobble_field(x0, 0, w, H, amp=1.5, cell=24, seed=seed + 2)
    pr, pa = warp(pr, dxp, dyp), warp(pa, dxp, dyp)
    ir, ia = warp(ir, dxi, dyi), warp(ia, dxi, dyi)
    pc = pr / np.maximum(pa, 1e-4)[..., None]
    mott = (fbm(x0, 0, w, H, 38, 3, seed + 3) * 0.07 + fbm(x0, 0, w, H, 7, 2, seed + 4) * 0.03
            + fbm(x0, 0, w, H, 9, 2, seed + 5, aniso=16.0) * 0.04)
    edge = np.clip(pa - cv2.GaussianBlur(pa, (0, 0), 3.2), 0, 1)
    pc = pc * (1 + mott)[..., None] * (1 - 0.30 * edge)[..., None]
    grain = ply / ply.mean((0, 1))
    pc = pc * grain ** 0.5
    a = (pa * 0.985)[..., None]
    out = base * (1 - a) + pc * a
    sc = sr / np.maximum(sa, 1e-4)[..., None]
    out = out * (1 - sa[..., None] + sc * sa[..., None])
    out = out * (1 - ia[..., None]) + ir
    out = 1 - (1 - out) * (1 - np.clip(lr, 0, 1))
    return np.clip(out, 0, 1).astype(np.float32)


# ----------------------------------------------------------------------------- sky objects
def draw_sky_objects(F, x0, x1):
    P, I, L = F.P, F.I, F.L
    sx, sy, sR = SUN
    # moon + stars first, so the painted cloud ribbon passes IN FRONT of them
    mx, my, mR = MOON
    star_rings(F, mx, my, mR, rings=4)
    moon(F, mx, my, mR)
    # painted cloud ribbon (crosses cuts 1|2 and 2|3) - behind the sun's lower rays
    cloud_ribbon(F, RIBBON, ribbon_thick, seed=7, tone=0.0, puff=0.55)
    # kurbits swirls orbiting the sun (outside the rays) - slow clockwise orbit
    orbit = 700.0
    angs = [-46, -33, -20, 24, 37, 50, 150, 176, 206]            # the last three orbit the sun's far side (loop board)
    for k, a in enumerate(angs):
        th = math.radians(a)
        px, py = polar(sx, sy, orbit, th)
        R0 = 116 + 10 * (k % 2)
        stem = PAL['moss'] if k % 2 == 0 else PAL['leaf']
        leaves = [PAL['corn'], PAL['moss_hi'], PAL['corn_hi']]
        flower = [(PAL['oxblood_hi'], PAL['linen'], PAL['sun']), (PAL['corn'], PAL['sun_hi'], PAL['oxblood']),
                  (PAL['linen'], PAL['rose'], PAL['gold'])][k % 3]
        kurb_scroll(F, px, py, R0, 1.15, 1, stem, flower=flower, leaves=leaves, lw=2.2, phase=th + math.pi * .5)
    for k in range(120):                                   # beaded orbit ring
        th = math.radians(-60 + k * 1.1)
        if abs(math.degrees(th) - 4) < 14: continue
        px, py = polar(sx, sy, orbit + 5 * math.sin(k * .9), th)
        if py > 770: continue
        P.set_source_rgba(*PAL['oxblood_hi'], .85); P.new_path(); P.arc(px, py, 3.2, 0, TAU); P.fill()
    for k in range(120):                                   # beaded orbit ring, far side
        th = math.radians(120 + k * 1.1)
        px, py = polar(sx, sy, orbit + 5 * math.sin(k * .9 + 1.0), th)
        if py > 770: continue
        P.set_source_rgba(*PAL['oxblood_hi'], .85); P.new_path(); P.arc(px, py, 3.2, 0, TAU); P.fill()
    sun(F, sx, sy, sR, skip=(LONG_ANG, 0.16))
    long_ray(F, sx, sy, sR, LONG_ANG, 1500.0, 46.0)
    r = Z(12)
    flocks = [(780, 150, 7, 1.0), (1010, 250, 4, .8), (420, 70, 3, .8), (1330, 270, 3, .8), (640, 700, 4, .7)]
    for (fx, fy, n, sc) in flocks:
        for i in range(n):
            bx, by = fx + r.normal(0, 70), fy + r.normal(0, 38)
            bird(F, bx, by, r.uniform(15, 24) * sc, r.normal(-0.12, .12))
    # thin orange line of the midnight sun on the horizon + soft glow
    for wdt, a in ((54, .035), (30, .06), (16, .10), (8, .2)):
        L.set_source_rgba(1.0, .62, .25, a); L.set_line_width(wdt)
        L.new_path(); L.move_to(1050, HZ - 1); L.line_to(x1 + 50, HZ - 1); L.stroke()
    F.I.set_source_rgba(0.98, .55, .14, 1); F.I.set_line_width(3.6)
    F.I.new_path(); F.I.move_to(1100, HZ - 1); F.I.line_to(x1 + 50, HZ - 1); F.I.stroke()


# ----------------------------------------------------------------------------- land objects
def land_path(c, x0, x1):
    c.new_path(); c.move_to(x0 - 60, HZ)
    c.line_to(x1 + 60, HZ)
    xs = np.arange(x1 + 60, 1000, -20)
    for x in xs: c.line_to(float(x), float(shore_y(x)))
    c.line_to(970, 1400); c.line_to(x0 - 60, 1400); c.close_path()


def hill_pts(x0, x1, top, amp, lam, ph):
    xs = np.arange(x0 - 60, x1 + 61, 10.0)
    ys = top + amp * np.sin(TAU * xs / lam + ph) + amp * .45 * np.sin(TAU * xs / (lam * .37) + ph * 2.1)
    return list(zip(xs, ys))


def draw_land(F, x0, x1):
    P, I, S = F.P, F.I, F.S
    r = Z(9)
    bands = [(HZ + 0, 3.0, 400, (0.62, 0.69, 0.31)), (848, 14, 430, (0.47, 0.61, 0.28)),
             (952, 22, 540, (0.32, 0.49, 0.25)), (1086, 26, 620, (0.23, 0.39, 0.22)),
             (1216, 20, 720, (0.17, 0.31, 0.19))]
    for ctx in (P, I, S):
        ctx.save(); land_path(ctx, x0, x1); ctx.clip()
    for bi, (top, amp, lam, col) in enumerate(bands):
        pts = hill_pts(x0, x1, top, amp, lam, bi * 1.7)
        P.new_path(); P.move_to(pts[0][0], 1500)
        for p in pts: P.line_to(*p)
        P.line_to(pts[-1][0], 1500); P.close_path()
        P.set_source(xgrad(850, 1600, col, tint_night(col, 1.0))); P.fill()
        I.new_path(); I.move_to(*pts[0]); [I.line_to(*p) for p in pts[1:]]
        I.set_source_rgba(*INK, .85); I.set_line_width(2.4); I.stroke()
        # painted wash line under the ink
        S.new_path(); S.move_to(pts[0][0], pts[0][1] + 5); [S.line_to(p[0], p[1] + 5) for p in pts[1:]]
        S.set_source_rgba(0.1, 0.2, 0.1, .20); S.set_line_width(10); S.stroke()
    # grass tufts and small kurbits flowers scattered on the meadow
    cols = [PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen'], PAL['corn_hi'], PAL['rose']]
    for i in range(int(520 * (1850 - (x0 - 20)) / 1870.0)):          # constant density however far left the buffer starts
        x = r.uniform(x0 - 20, 1850); band = r.choice([0, 1, 2, 3, 4], p=[.18, .24, .24, .2, .14])
        y = bands[band][0] + r.uniform(18, 100) + (0 if band < 4 else 20)
        if y > shore_y(x) - 8: continue
        s = 0.55 + 1.3 * (y - HZ) / 500.0
        c1 = tn(cols[r.integers(len(cols))], x)
        if r.random() < .55:
            for k in range(4):                                         # tuft
                a = -math.pi / 2 + r.normal(0, .5)
                I.set_source_rgba(*tn(PAL['leaf'], x), 1); I.set_line_width(2.0 * s); I.new_path(); I.move_to(x + k * 3 * s, y)
                I.curve_to(x + k * 3 * s, y - 10 * s, x + k * 3 * s + 8 * s * math.cos(a), y - 18 * s, x + k * 3 * s + 14 * s * math.cos(a), y - 24 * s); I.stroke()
        else:
            I.set_source_rgba(*tn(PAL['leaf'], x), 1); I.set_line_width(2.0 * s); I.new_path(); I.move_to(x, y); I.line_to(x, y - 20 * s); I.stroke()
            kurb_flower(F, x, y - 24 * s, 11 * s, c1, tn(PAL['linen'], x), tn(PAL['sun'], x), rot=r.uniform(0, 6), petals=6, lw=1.4 * s)
    for ctx in (P, I, S): ctx.restore()
    # cottages, pines, the maypole and the faint ring of dancers (slide 1)
    for (cx_, w_) in ((505, 40), (565, 32), (770, 44), (850, 36), (1010, 34)):
        cottage(F, cx_, HZ + 4, w_, tone=night(cx_))
    for px_ in (455, 620, 700, 905, 955, 1040, 1120):
        pine(F, px_, HZ + 5, 46 + r.uniform(-8, 10), tone=night(px_))
    ring_c, rx, ry, n = (340.0, 884.0), 235.0, 34.0, 17
    maypole(F, ring_c[0], ring_c[1], 128)
    order = sorted(range(n), key=lambda i: math.sin(TAU * i / n))
    pos = [(ring_c[0] + rx * math.cos(TAU * i / n), ring_c[1] + ry * math.sin(TAU * i / n)) for i in range(n)]
    for i in order:
        x, y = pos[i]
        nxt, prv = pos[(i + 1) % n], pos[(i - 1) % n]
        dancer(F, x, y, 46, crown=True, seed=i, arms=[((x + nxt[0]) / 2, y - 46 * .62), ((x + prv[0]) / 2, y - 46 * .62)])
    # shoreline: ink line, pale foam line in the water, reeds
    sxs = np.arange(1000, x1 + 60, 10.0)
    sys_ = shore_y(sxs)
    I.new_path(); I.move_to(sxs[0], sys_[0]); [I.line_to(a_, b_) for a_, b_ in zip(sxs, sys_)]
    I.set_source_rgba(*INK, .9); I.set_line_width(3.0); I.stroke()
    I.new_path(); I.move_to(sxs[0], sys_[0] + 7); [I.line_to(a_, b_ + 7) for a_, b_ in zip(sxs, sys_)]
    I.set_source_rgba(0.88, 0.93, 1.0, .55); I.set_line_width(4.0); I.stroke()
    for i in range(46):
        x = r.uniform(1150, 2650); y = float(shore_y(x)) + 3
        if y < HZ + 25: continue
        sc = 0.6 + (y - HZ) / 420.0
        for k in range(r.integers(3, 6)):
            xo = x + (k - 2) * 5 * sc
            hh = r.uniform(46, 90) * sc
            P.set_source_rgba(*INK, 1); P.set_line_width(4.2 * sc); P.new_path(); P.move_to(xo, y); P.curve_to(xo + 2 * sc, y - hh * .5, xo + r.normal(0, 6) * sc, y - hh * .8, xo + r.normal(0, 9) * sc, y - hh); P.stroke()
            P.set_source_rgba(*tn(PAL['moss_hi'], .8), 1); P.set_line_width(2.4 * sc); P.new_path(); P.move_to(xo, y); P.curve_to(xo + 2 * sc, y - hh * .5, xo + r.normal(0, 6) * sc, y - hh * .8, xo + r.normal(0, 9) * sc, y - hh); P.stroke()
        if r.random() < .45:
            cx_ = x + r.normal(0, 4) * sc; hh = r.uniform(70, 110) * sc
            F.shape(P_ellipse(cx_, y - hh, 5 * sc, 14 * sc), fill=(0.34, 0.20, 0.12), ink=INK, lw=1.4)
    # big foreground kurbits plants along the bottom of the meadow
    plants = [(110, 1005, 78, 0), (430, 1060, 70, 1), (770, 1020, 82, 2), (1060, 1105, 66, 0)]
    for (px_, top, fr, k) in plants:
        draw_plant(F, px_, top, fr, k, tone=night(px_))
    # pond: rows of folk wave scallops, lily pads, far-shore strip
    draw_pond(F, x0, x1)
    # procession along the horizon (slide 2)
    n = 30
    for i in range(n):
        x = 1160 + i * (1000 / n) + r.normal(0, 6)
        h = 33 + r.normal(0, 1.2)
        dancer(F, x, HZ + 9, h, dress=PAL['linen'], crown=(i % 3 == 0), face=False, seed=100 + i, skirt=.9)
        if i % 4 == 0:                                                       # tiny lanterns
            P.set_source_rgba(1, .78, .34, 1); P.new_path(); P.arc(x + 11, HZ - h * .35, 2.4, 0, TAU); P.fill()
            F.L.set_source_rgba(1, .72, .30, .5); F.L.new_path(); F.L.arc(x + 11, HZ - h * .35, 9, 0, TAU); F.L.fill()


def draw_plant(F, x, top, fr, kind, tone=0.0):
    P, I = F.P, F.I
    stem = tint_night(PAL['moss'], tone); leaf1 = tint_night(PAL['corn'], tone); leaf2 = tint_night(PAL['moss_hi'], tone)
    lw = 2.8
    path = [(x, 1400), (x + 18, 1280), (x - 14, 1170), (x + 6, top + 40), (x, top)]
    for (col, ww, ctx) in ((INK, 12.0, P), (stem, 7.5, P)):
        ctx.set_source_rgba(*col, 1); ctx.set_line_width(ww); ctx.new_path(); ctx.move_to(*path[0])
        ctx.curve_to(*path[1], *path[2], *path[3]); ctx.line_to(*path[4]); ctx.stroke()
    for k, (yy, side, L_) in enumerate(((1285, -1, 120), (1215, 1, 112), (1140, -1, 96), (1085, 1, 82))):
        if yy < top + 30: continue
        kurb_leaf(F, x + (4 if side > 0 else -4), yy, L_, (0 if side > 0 else math.pi) - side * .55, leaf1 if k % 2 == 0 else leaf2, lw=lw, curl=.3)
    cols = [(PAL['oxblood_hi'], PAL['linen'], PAL['sun']), (PAL['corn'], PAL['sun_hi'], PAL['oxblood']),
            (PAL['sun'], PAL['oxblood_hi'], PAL['linen'])][kind]
    kurb_flower(F, x, top, fr, *[tint_night(c, tone) for c in cols], rot=.3 * kind, petals=9, lw=2.6)
    kurb_flower(F, x + fr * 1.15, top + fr * 0.9, fr * .45, tint_night(PAL['linen'], tone), tint_night(PAL['rose'], tone), tint_night(PAL['gold'], tone), petals=6, lw=2)


def draw_pond(F, x0, x1):
    P, I, S = F.P, F.I, F.S
    r = Z(31)
    # far-shore strip (the horizon): a dark, low land line carrying the procession
    xs = np.arange(x0 - 40, x1 + 41, 8.0)
    top = HZ + 1 + 2.5 * np.sin(xs / 61.0) + 1.5 * np.sin(xs / 17.0)
    P.new_path(); P.move_to(xs[0], HZ + 14)
    for x_, y_ in zip(xs, top): P.line_to(x_, y_)
    P.line_to(xs[-1], HZ + 14); P.close_path()
    P.set_source(xgrad(900, 1700, (0.40, 0.50, 0.22), (0.07, 0.16, 0.20))); P.fill()
    # wave scallops on the water (perspective rows)
    k = 0
    y = 806.0
    while y < 1345:
        dyk = y - HZ
        wlen = 15 + 0.115 * dyk
        x = x0 - 40 + r.uniform(0, wlen * 2)
        while x < x1 + 40:
            if y > shore_y(x + wlen * .5) + 6 and x > 1000:
                a = r.uniform(.30, .60)
                I.set_source_rgba(0.80, 0.88, 1.0, a); I.set_line_width(2.0 + .004 * dyk)
                I.new_path(); I.move_to(x, y); I.curve_to(x + wlen * .2, y + wlen * .26, x + wlen * .8, y + wlen * .26, x + wlen, y); I.stroke()
            x += wlen * r.uniform(1.15, 2.4)
        y += 17 + 0.075 * dyk; k += 1
    # lily pads + lotus
    for i in range(34):
        x = r.uniform(1450, 2650); y = r.uniform(900, 1330)
        if y < shore_y(x) + 28: continue
        s = 0.5 + (y - HZ) / 380.0
        pad = P_ellipse(x, y, 34 * s, 10 * s)
        F.shape(pad, fill=tn(PAL['moss'], .6), ink=INK, lw=1.8)
        I.set_source_rgba(*INK, .6); I.set_line_width(1.2); I.new_path(); I.move_to(x, y); I.line_to(x + 30 * s, y - 3 * s); I.stroke()
        if i % 4 == 0:
            kurb_flower(F, x - 5 * s, y - 9 * s, 16 * s, tn(PAL['linen'], .8), tn(PAL['rose'], .7), tn(PAL['sun'], .6), petals=7, lw=1.6)


def render(x0=-960, x1=2700, ss=2, out_prefix='s12'):
    """x0 < 0: the part left of x = 0 is the loop board at the far right of the carousel (slide 10 continues into slide 1)"""
    w = x1 - x0
    base, ply = build_base(x0, w)
    # --- sky objects first (they get mirrored into the pond)
    Fs = Folk(x0, w, ss)
    draw_sky_objects(Fs, x0, x1)
    img = composite(Fs, base, ply, seed=10)
    # --- mirror the painted sky into the water (folk water: wavy broken strokes)
    k = np.arange(1, H - HZ + 1, dtype=np.float32)
    src_y = np.clip(HZ - k * 0.96, 0, HZ - 1)
    amp = (0.5 + 0.016 * k)[:, None]
    n = fbm(x0, HZ, w, H - HZ, 70, 3, 77, aniso=9.0)
    gx, _ = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(H - HZ, dtype=np.float32))
    mx = gx + amp * (2.4 * n + np.sin(k[:, None] * .35 + n * 5))
    my = np.broadcast_to(src_y[:, None], mx.shape).astype(np.float32)
    refl = cv2.remap(img, mx.astype(np.float32), my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    refl = cv2.GaussianBlur(refl, (0, 0), sigmaX=5, sigmaY=1.2)
    stripe = 1 - 0.10 * (0.5 + 0.5 * np.sin(k * (0.55 - 0.0006 * k)))[:, None, None] * (0.4 + 0.6 * smoothstep(0, 60, k))[:, None, None]
    refl = refl * 0.80 * stripe * np.array([0.93, 0.97, 1.03], np.float32)
    img[HZ:] = refl
    # --- land and everything standing on it
    Fl = Folk(x0, w, ss)
    draw_land(Fl, x0, x1)
    img = composite(Fl, img, ply, seed=20)
    cache_save(out_prefix, x0, img)
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = render()
    print('rendered', img.shape, round(time.time() - t, 1), 's')
    o = -(-960)
    preview(img[:, o:o + 2160], WORK + '/s12_preview.png', 2100)
    save_png(WORK + '/s12_slide1.png', img[:, o:o + 1080])
    save_png(WORK + '/s12_slide2.png', img[:, o + 1080:o + 2160])
