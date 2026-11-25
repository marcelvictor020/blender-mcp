"""Slides 1-3: THE SUN / THE MOON / THE HAND-OVER  -  naive dalmalning on plywood, x from -1000 (loop side) to 3800.

One world, drawn flat: a WHOLE sun, kurbits swirls, the persistent flock of birds, a two-ring maypole dance, cottages and
pines on the horizon, the sun's long ray that ends at the moon, the cloud ribbon that is the BREATH of a sleeping cloud-face,
the white-robed procession on the far shore (it keeps walking into the next scenes).
"""
import math, sys
import numpy as np
import cv2
import cairo
from util import *
from folk import *
from shared import *
import sculpt as SC
import scene12 as S12
from scene12 import build_base, composite, shore_y, hill_pts, land_path, xgrad, tn, night, draw_plant

R = Z


def face_extra():
    return SC.face_edge_puffs(FACE['cx'], FACE['cy'], FACE['S']) + SC.face_extra_puffs(FACE['cx'], FACE['cy'], FACE['S'])


def draw_sky_objects2(F, x0, x1):
    P, I, L = F.P, F.I, F.L
    sx, sy, sR = SUN
    mx, my, mR = MOON
    star_rings(F, mx, my, mR, rings=4)
    moon(F, mx, my, mR)
    cloud_ribbon(F, RIBBON, ribbon_thick, seed=7, tone=0.0, puff=0.55, extra=face_extra())
    SC.face_ink_folk(F, FACE['cx'], FACE['cy'], FACE['S'])
    # kurbits swirls orbiting the sun (whole sun: swirls on both sides; the left ones cross the loop seam)
    orbit = 565.0
    angs = [-48, -34, -20, 22, 36, 50, 140, 160, 182, 204, 224]
    for k, a in enumerate(angs):
        th = math.radians(a)
        px, py = polar(sx, sy, orbit, th)
        R0 = 96 + 8 * (k % 2)
        stem = PAL['moss'] if k % 2 == 0 else PAL['leaf']
        leaves = [PAL['corn'], PAL['moss_hi'], PAL['corn_hi']]
        flower = [(PAL['oxblood_hi'], PAL['linen'], PAL['sun']), (PAL['corn'], PAL['sun_hi'], PAL['oxblood']), (PAL['linen'], PAL['rose'], PAL['gold'])][k % 3]
        kurb_scroll(F, px, py, R0, 1.15, 1, stem, flower=flower, leaves=leaves, lw=2.2, phase=th + math.pi * .5)
    for k in range(260):                                                       # beaded orbit ring all round the sun
        th = math.radians(-70 + k * 1.1)
        if abs(math.degrees(th) - LONG_ANG * 57.3) < 12: continue
        px, py = polar(sx, sy, orbit + 5 * math.sin(k * .9), th)
        if py > 770: continue
        P.set_source_rgba(*PAL['oxblood_hi'], .85); P.new_path(); P.arc(px, py, 3.0, 0, TAU); P.fill()
    sun(F, sx, sy, sR, skip=(LONG_ANG, 0.20))
    long_ray(F, sx, sy, sR, LONG_ANG, LONG_LEN, 36.0)
    # the flock: flat black folk birds, one family that keeps flying right through every later scene
    for (bx, by, bs, ba, bseed) in BIRDS:
        if bx < 3900: bird(F, bx, by, bs, ba)
    # thin orange line of the midnight sun on the horizon + glow
    for wdt, a in ((54, .035), (30, .06), (16, .10), (8, .2)):
        L.set_source_rgba(1.0, .62, .25, a); L.set_line_width(wdt)
        L.new_path(); L.move_to(1050, HZ - 1); L.line_to(x1 + 50, HZ - 1); L.stroke()
    F.I.set_source_rgba(0.98, .55, .14, 1); F.I.set_line_width(3.6)
    F.I.new_path(); F.I.move_to(1100, HZ - 1); F.I.line_to(x1 + 50, HZ - 1); F.I.stroke()


def draw_pond2(F, x0, x1):
    P, I, S = F.P, F.I, F.S
    r = R(31)
    xs = np.arange(x0 - 40, x1 + 41, 8.0)
    top = HZ + 1 + 2.5 * np.sin(xs / 61.0) + 1.5 * np.sin(xs / 17.0)
    P.new_path(); P.move_to(xs[0], HZ + 14)
    for x_, y_ in zip(xs, top): P.line_to(x_, y_)
    P.line_to(xs[-1], HZ + 14); P.close_path()
    P.set_source(xgrad(900, 1700, (0.40, 0.50, 0.22), (0.07, 0.16, 0.20))); P.fill()
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
        y += 17 + 0.075 * dyk
    for i, (x, y, sd) in enumerate(PADS):                                     # lily pads + lotus, same places in every style
        if not (x0 - 60 < x < x1 + 60): continue
        if y < shore_y(x) + 28: continue
        s = 0.5 + (y - HZ) / 380.0
        pad = P_ellipse(x, y, 34 * s, 10 * s)
        F.shape(pad, fill=tn(PAL['moss'], .6), ink=INK, lw=1.8)
        I.set_source_rgba(*INK, .6); I.set_line_width(1.2); I.new_path(); I.move_to(x, y); I.line_to(x + 30 * s, y - 3 * s); I.stroke()
        if i % 4 == 0:
            kurb_flower(F, x - 5 * s, y - 9 * s, 16 * s, tn(PAL['linen'], .8), tn(PAL['rose'], .7), tn(PAL['sun'], .6), petals=7, lw=1.6)


def ring_dance_folk(F, cx, cy, rings, h_base, tone=0.0, phase=0.0):
    """concentric rings of white-dressed dancers holding hands round a flower-wrapped pole, naive perspective ellipses"""
    maypole(F, cx, cy, 150)
    allp = []
    for ri, (rx, ry, n) in enumerate(rings):
        for i in range(n):
            th = TAU * i / n + phase + ri * 0.22
            allp.append((cy + ry * math.sin(th), ri, i, n, rx, ry, th))
    allp.sort()
    for (_, ri, i, n, rx, ry, th) in allp:
        x, y = cx + rx * math.cos(th), cy + ry * math.sin(th)
        th2 = TAU * ((i + 1) % n) / n + phase + ri * 0.22
        th0 = TAU * ((i - 1) % n) / n + phase + ri * 0.22
        nx_, ny_ = cx + rx * math.cos(th2), cy + ry * math.sin(th2)
        px_, py_ = cx + rx * math.cos(th0), cy + ry * math.sin(th0)
        hgt = h_base * (1.0 + 0.10 * math.sin(th))
        dancer(F, x, y, hgt, crown=True, seed=i + 31 * ri, arms=[((x + nx_) / 2, (y + ny_) / 2 - hgt * .60), ((x + px_) / 2, (y + py_) / 2 - hgt * .60)])


def draw_land2(F, x0, x1):
    P, I, S = F.P, F.I, F.S
    r = R(9)
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
        S.new_path(); S.move_to(pts[0][0], pts[0][1] + 5); [S.line_to(p[0], p[1] + 5) for p in pts[1:]]
        S.set_source_rgba(0.1, 0.2, 0.1, .20); S.set_line_width(10); S.stroke()
    cols = [PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen'], PAL['corn_hi'], PAL['rose']]
    for i in range(int(520 * (1850 - (x0 - 20)) / 1870.0)):
        x = r.uniform(x0 - 20, 1850); band = r.choice([0, 1, 2, 3, 4], p=[.18, .24, .24, .2, .14])
        y = bands[band][0] + r.uniform(18, 100) + (0 if band < 4 else 20)
        if y > shore_y(x) - 8: continue
        s = 0.55 + 1.3 * (y - HZ) / 500.0
        c1 = tn(cols[r.integers(len(cols))], x)
        if r.random() < .55:
            for k in range(4):
                a = -math.pi / 2 + r.normal(0, .5)
                I.set_source_rgba(*tn(PAL['leaf'], x), 1); I.set_line_width(2.0 * s); I.new_path(); I.move_to(x + k * 3 * s, y)
                I.curve_to(x + k * 3 * s, y - 10 * s, x + k * 3 * s + 8 * s * math.cos(a), y - 18 * s, x + k * 3 * s + 14 * s * math.cos(a), y - 24 * s); I.stroke()
        else:
            I.set_source_rgba(*tn(PAL['leaf'], x), 1); I.set_line_width(2.0 * s); I.new_path(); I.move_to(x, y); I.line_to(x, y - 20 * s); I.stroke()
            kurb_flower(F, x, y - 24 * s, 11 * s, c1, tn(PAL['linen'], x), tn(PAL['sun'], x), rot=r.uniform(0, 6), petals=6, lw=1.4 * s)
    for ctx in (P, I, S): ctx.restore()
    for (cx_, w_) in ((505, 40), (565, 32), (835, 44), (915, 36), (1030, 34)):
        cottage(F, cx_, HZ + 4, w_, tone=night(cx_))
    for px_ in (455, 620, 700, 905, 955, 1040, 1120, 760, 1085):
        pine(F, px_, HZ + 5, 46 + r.uniform(-8, 10), tone=night(px_))
    ring_dance_folk(F, 760.0, 918.0, [(300.0, 44.0, 21), (168.0, 25.0, 12)], 58.0)
    sxs = np.arange(1000, x1 + 60, 10.0)
    sys_ = shore_y(sxs)
    I.new_path(); I.move_to(sxs[0], sys_[0]); [I.line_to(a_, b_) for a_, b_ in zip(sxs, sys_)]
    I.set_source_rgba(*INK, .9); I.set_line_width(3.0); I.stroke()
    I.new_path(); I.move_to(sxs[0], sys_[0] + 7); [I.line_to(a_, b_ + 7) for a_, b_ in zip(sxs, sys_)]
    I.set_source_rgba(0.88, 0.93, 1.0, .55); I.set_line_width(4.0); I.stroke()
    for rd in REEDS:
        x = rd['x']; y = float(shore_y(x)) + 3
        if y < HZ + 25: continue
        sc = 0.6 + (y - HZ) / 420.0
        for k in range(rd['nb']):
            xo = x + (k - 2) * 5 * sc
            hh = rd['hs'][k] * sc
            sw1, sw2 = rd['sway'][k]
            P.set_source_rgba(*INK, 1); P.set_line_width(4.2 * sc); P.new_path(); P.move_to(xo, y); P.curve_to(xo + 2 * sc, y - hh * .5, xo + sw1 * sc, y - hh * .8, xo + sw2 * sc, y - hh); P.stroke()
            P.set_source_rgba(*tn(PAL['moss_hi'], .8), 1); P.set_line_width(2.4 * sc); P.new_path(); P.move_to(xo, y); P.curve_to(xo + 2 * sc, y - hh * .5, xo + sw1 * sc, y - hh * .8, xo + sw2 * sc, y - hh); P.stroke()
        if rd['cat']:
            F.shape(P_ellipse(x + rd['cat_dx'] * sc, y - rd['cat_h'] * sc, 5 * sc, 14 * sc), fill=(0.34, 0.20, 0.12), ink=INK, lw=1.4)
    plants = [(120, 1050, 74, 0), (1090, 1118, 64, 2), (1480, 1150, 56, 1)]
    for (px_, top, fr, k) in plants:
        draw_plant(F, px_, top, fr, k, tone=night(px_))
    draw_pond2(F, x0, x1)
    # the procession along the far shore (it never stops: later scenes draw the very same walkers)
    for i, (x, h, sd) in enumerate(PROCESSION):
        if not (x0 - 40 < x < x1 + 40) or x > 3600: continue
        dancer(F, x, HZ + 9, h, dress=PAL['linen'], crown=(i % 3 == 0), face=False, seed=100 + i, skirt=.9)
        if i % 4 == 0:
            P.set_source_rgba(1, .78, .34, 1); P.new_path(); P.arc(x + 11, HZ - h * .35, 2.4, 0, TAU); P.fill()
            F.L.set_source_rgba(1, .72, .30, .5); F.L.new_path(); F.L.arc(x + 11, HZ - h * .35, 9, 0, TAU); F.L.fill()


def render2(x0=-1000, x1=3800, ss=2, out='f_folk'):
    w = x1 - x0
    base, ply = build_base(x0, w)
    Fs = Folk(x0, w, ss)
    draw_sky_objects2(Fs, x0, x1)
    img = composite(Fs, base, ply, seed=10)
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
    Fl = Folk(x0, w, ss)
    draw_land2(Fl, x0, x1)
    img = composite(Fl, img, ply, seed=20)
    cache_save(out, x0, img)
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = render2()
    print('folk2', img.shape, round(time.time() - t, 1), 's')
    o = 1000
    preview(img[:, o:o + 3200], WORK + '/f_folk_preview.png', 2000)
    save_png(WORK + '/f_s1.png', img[:, o:o + 1080])
    save_png(WORK + '/f_s2.png', img[:, o + 1080:o + 2160])
    save_png(WORK + '/f_s3.png', img[:, o + 2160:o + 3240])
