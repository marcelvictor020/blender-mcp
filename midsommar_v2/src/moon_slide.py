"""The last slide: THE MOON, the sun's twin.

Slide 1 opened on a huge calm sun with a human face, painted flat on plywood. The carousel ends on its night twin, painted the same way: a huge full moon with
long petal rays in pale blue and cream - and its face is AWAKE. The moon of slide 2 slept; this one stares straight out at you with wide pale eyes whose pupils
are small, and it smiles the girls' smile (too wide, one even row of teeth). Below it the white-dressed ring dance goes round its pole under the star rings; one
small dancer has stepped out of the ring and stands facing you. (That is all. Nothing here is meant to frighten anyone; it is only a little more attentive than a moon should be.)
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from folk import *
import folk2 as FK2
import scene12 as S12

X0M = 15700                                   # final x of the first column of this panel (500 px of plywood to blend with the overhead dance board)
WM = 1580
SLIDE_X = 16200                               # the slide proper starts here
CXM, CYM, RM = 16200 + 610.0, 362.0, 245.0
NIGHT = [(0.058, 0.080, 0.250), (0.14, 0.20, 0.46), (0.34, 0.40, 0.66), (0.62, 0.52, 0.66), (0.92, 0.66, 0.50)]
INK_B = (0.12, 0.16, 0.34)
BLUE = (0.70, 0.78, 0.96)
CREAM = PAL['cream']


def base_night(x0, w):
    ply = plywood(x0, 0, w, H, seed=8)
    ys = np.arange(H, dtype=np.float32)
    stops = np.array([0, 0.30, 0.58, 0.74, 0.77], np.float32) * HZ / 0.77
    cols = np.array(NIGHT, np.float32)
    col = np.stack([np.interp(ys, [0, 220, 470, 700, HZ], cols[:, k]) for k in range(3)], -1)
    wash = np.repeat(col[:, None, :], w, 1)
    wash[HZ:] = wash[:HZ][::-1][:H - HZ] * 0.55 + np.array([0.04, 0.10, 0.12], np.float32) * 0.45
    streak = fbm(x0, 0, w, H, 11, 3, 161, aniso=70.0); mott = fbm(x0, 0, w, H, 150, 4, 162)
    wash = wash * (1 + 0.028 * streak + 0.04 * mott)[..., None]
    grain = ply / ply.mean((0, 1))
    return np.clip(wash * grain ** 1.35, 0, 1).astype(np.float32), ply


def moon_face(F, cx, cy, R):
    """awake: wide level eyes with a ring of white all round a pale iris and a small black pupil, high thin brows, a long calm nose, and the girls' smile"""
    P, I, S, L = F.P, F.I, F.S, F.L
    lw = max(1.4, 0.0075 * R)
    for s in (-1, 1):
        soft_disc(S, cx + s * .43 * R, cy + .26 * R, .19 * R, PAL['rose'], 0.34)
    for s in (-1, 1):                                                              # brows: thin, high, a little too arched
        I.set_source_rgba(*INK_B, 1); I.set_line_width(lw * 1.7); I.new_path()
        I.move_to(cx + s * .13 * R, cy - .27 * R); I.curve_to(cx + s * .27 * R, cy - .44 * R, cx + s * .46 * R, cy - .44 * R, cx + s * .60 * R, cy - .29 * R); I.stroke()
    for s in (-1, 1):
        ex, ey = cx + s * .34 * R, cy - .10 * R
        def eye(c, s=s, ex=ex, ey=ey):
            c.new_path(); c.move_to(ex - s * .23 * R, ey + .02 * R)
            c.curve_to(ex - s * .11 * R, ey - .20 * R, ex + s * .13 * R, ey - .22 * R, ex + s * .26 * R, ey + .02 * R)
            c.curve_to(ex + s * .12 * R, ey + .14 * R, ex - s * .10 * R, ey + .14 * R, ex - s * .23 * R, ey + .02 * R); c.close_path()
        eye(P); P.set_source_rgb(*PAL['linen']); P.fill()
        P.save(); eye(P); P.clip()
        g = cairo.RadialGradient(ex + s * .01 * R, ey - .01 * R, .01 * R, ex + s * .01 * R, ey - .01 * R, .105 * R)
        g.add_color_stop_rgb(0, 0.40, 0.52, 0.62); g.add_color_stop_rgb(0.72, 0.64, 0.76, 0.86); g.add_color_stop_rgb(1, 0.22, 0.30, 0.46)
        P.set_source(g); P.new_path(); P.arc(ex + s * .01 * R, ey - .01 * R, .105 * R, 0, TAU); P.fill()
        P.set_source_rgb(0.05, 0.06, 0.12); P.new_path(); P.arc(ex + s * .01 * R, ey - .01 * R, .030 * R, 0, TAU); P.fill()
        P.set_source_rgb(1, 1, .95); P.new_path(); P.arc(ex + s * .01 * R + .035 * R, ey - .04 * R, .014 * R, 0, TAU); P.fill()
        P.restore()
        eye(I); I.set_source_rgba(*INK_B, 1); I.set_line_width(lw * 1.5); I.stroke()
        I.set_source_rgba(*INK_B, 1); I.set_line_width(lw * 2.0)                                                  # upper lid
        I.new_path(); I.move_to(ex - s * .23 * R, ey + .02 * R); I.curve_to(ex - s * .11 * R, ey - .20 * R, ex + s * .13 * R, ey - .22 * R, ex + s * .26 * R, ey + .02 * R); I.stroke()
        for k in range(5):
            ax, ay = ex + s * (.18 + .018 * k) * R, ey - (.02 - .018 * k) * R
            I.set_line_width(lw * .8); I.new_path(); I.move_to(ax, ay); I.line_to(ax + s * .05 * R, ay - .04 * R + .01 * R * k); I.stroke()
    I.set_source_rgba(*INK_B, 1); I.set_line_width(lw * 1.2)
    I.new_path(); I.move_to(cx - .015 * R, cy - .15 * R); I.curve_to(cx - .03 * R, cy + .02 * R, cx - .06 * R, cy + .13 * R, cx - .09 * R, cy + .22 * R); I.stroke()
    I.new_path(); I.move_to(cx - .10 * R, cy + .23 * R); I.curve_to(cx - .02 * R, cy + .31 * R, cx + .05 * R, cy + .31 * R, cx + .12 * R, cy + .22 * R); I.stroke()
    for s in (-1, 1):
        I.new_path(); I.arc(cx + s * .075 * R, cy + .225 * R, .035 * R, 0.1, 2.9); I.stroke()
    S.set_source_rgba(0.40, 0.50, 0.82, .18)
    S.new_path(); S.move_to(cx, cy - .12 * R); S.curve_to(cx + .05 * R, cy, cx + .10 * R, cy + .14 * R, cx + .13 * R, cy + .22 * R); S.line_to(cx + .02 * R, cy + .21 * R); S.close_path(); S.fill()
    # the smile: wide, lips thin, nine even teeth, corners far up in the cheeks - and the eyes above it do not move
    mw = .43 * R
    my = cy + .45 * R
    lift = .075 * R
    def upper(u): return my - lift * abs(u) ** 2.2
    N_ = 40
    us = [-1 + 2 * k / N_ for k in range(N_ + 1)]
    up = [(cx + u * mw, upper(u)) for u in us]
    lo = [(cx + u * mw * .97, upper(u) + .062 * R * (1 - abs(u) ** 1.6) * 1.0 + 0.004 * R) for u in us]
    def mouth(c):
        c.new_path(); c.move_to(*up[0]); [c.line_to(*p_) for p_ in up[1:]]; [c.line_to(*p_) for p_ in lo[::-1]]; c.close_path()
    mouth(P); P.set_source_rgb(0.20, 0.07, 0.10); P.fill()
    P.save(); mouth(P); P.clip()
    for k in range(9):
        u0, u1 = -0.80 + 1.60 * k / 9, -0.80 + 1.60 * (k + 1) / 9
        um = 0.5 * (u0 + u1)
        x0_, x1_ = cx + u0 * mw, cx + u1 * mw
        yt = upper(um); yb = yt + .056 * R * (1 - abs(um) ** 1.6) * .86
        P.set_source_rgb(*PAL['linen']); P.new_path(); P.rectangle(x0_ + .003 * R, yt, x1_ - x0_ - .006 * R, yb - yt); P.fill()
        I.set_source_rgba(*INK_B, 0.85); I.set_line_width(lw * .7); I.new_path(); I.rectangle(x0_ + .003 * R, yt, x1_ - x0_ - .006 * R, yb - yt); I.stroke()
    P.restore()
    mouth(I); I.set_source_rgba(*INK_B, 1); I.set_line_width(lw * 1.25); I.stroke()
    for s in (-1, 1):
        I.set_line_width(lw); I.new_path(); I.arc(cx + s * (mw + .035 * R), my - lift + .01 * R, .035 * R, -1.2 if s > 0 else 1.9, -.2 if s > 0 else 2.9); I.stroke()
    r = Z(5)
    for _ in range(26):
        a = r.uniform(0, TAU); d = R * math.sqrt(r.uniform(0.05, 0.9))
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        L.set_source_rgba(1, .95, .8, r.uniform(.2, .55)); L.new_path(); L.arc(x, y, r.uniform(0.7, 1.9) * max(1, R / 220), 0, TAU); L.fill()


def moon_full(F, cx, cy, R):
    P, I, S, L = F.P, F.I, F.S, F.L
    lw = max(1.6, 0.0085 * R)
    soft_disc(P, cx, cy, R * 2.25, (0.62, 0.70, 0.92), 0.38)
    n = 22
    for ring in (0, 1):
        for i in range(n):
            th = TAU * i / n + (math.pi / n if ring else 0.0)
            tip = (1.50 if ring else 1.92) + 0.07 * math.sin(i * 2.3 + ring)
            col = CREAM if ring else BLUE
            hw = (0.082 if ring else 0.070) * (22 / n) * 1.6
            F.shape(ray_shape(cx, cy, th, R * 1.012, R * tip, hw, 0.075), fill=col, ink=INK_B, lw=lw * 1.15, shade=(0.45, 0.55, 0.85), sa=0.0)
            x0_, y0_ = polar(cx, cy, R * 1.02, th); x1_, y1_ = polar(cx, cy, R * (tip - 0.12), th + 0.05)
            I.set_source_rgba(0.40, 0.50, 0.80, 0.75); I.set_line_width(lw * 0.8); I.new_path(); I.move_to(x0_, y0_); I.line_to(x1_, y1_); I.stroke()
            for k in range(3):
                t = 0.28 + 0.2 * k
                xa, ya = polar(cx, cy, R * (1.0 + (tip - 1.0) * t), th - hw * (1 - t) * 0.9)
                xb, yb = polar(cx, cy, R * (1.0 + (tip - 1.0) * (t + 0.08)), th - hw * (1 - t) * 0.2)
                I.set_source_rgba(0.40, 0.50, 0.80, 0.55); I.set_line_width(lw * 0.7); I.new_path(); I.move_to(xa, ya); I.line_to(xb, yb); I.stroke()
    F.shape(P_circle(cx, cy, R), fill=(0.58, 0.66, 0.88), ink=INK_B, lw=lw * 1.5)
    F.shape(P_circle(cx, cy, R * 0.955), fill=(0.90, 0.90, 0.88))
    F.shape(P_circle(cx, cy, R * 0.80), fill=(0.97, 0.96, 0.90), a=0.95)
    S.save(); S.new_path(); S.arc(cx, cy, R * 0.955, 0, TAU); S.clip()
    S.set_source_rgba(0.34, 0.42, 0.74, 0.40); S.new_path(); S.arc(cx, cy, R * 0.955, -math.pi / 2, math.pi / 2); S.arc_negative(cx - R * 0.42, cy, R * 1.12, math.pi / 2 + 0.55, -math.pi / 2 - 0.55); S.close_path(); S.fill()
    S.restore()
    r = Z(21)
    for k in range(7):                                                                             # maria: flat soft-edged blue-grey patches, placed to read as shadows of eyes and cheeks
        a = r.uniform(0, TAU); d = R * r.uniform(0.35, 0.82)
        mx_, my_ = cx + d * math.cos(a), cy + d * math.sin(a)
        if abs(mx_ - cx) < .55 * R and abs(my_ - cy) < .55 * R: continue
        soft_disc(S, mx_, my_, R * r.uniform(.09, .19), (0.50, 0.58, 0.80), 0.30)
    for k in range(40):
        th = TAU * k / 40; r0, r1 = R * (0.86 + 0.02 * (k % 3)), R * 0.99
        x0_, y0_ = polar(cx, cy, r0, th); x1_, y1_ = polar(cx, cy, r1, th)
        I.set_source_rgba(0.42, 0.52, 0.82, 0.55); I.set_line_width(lw * 0.9); I.new_path(); I.move_to(x0_, y0_); I.line_to(x1_, y1_); I.stroke()
    for k in range(60):
        th = TAU * k / 60
        x, y = polar(cx, cy, R * 1.025, th)
        P.set_source_rgba(*PAL['oxblood_hi'], 1); P.new_path(); P.arc(x, y, R * 0.011, 0, TAU); P.fill()
    moon_face(F, cx, cy, R)


def draw_all(F, x0, x1):
    P, I, S, L = F.P, F.I, F.S, F.L
    cx, cy, R = CXM, CYM, RM
    star_rings(F, cx, cy, R, rings=3)
    moon_full(F, cx, cy, R)
    orbit = 565.0
    for k, a in enumerate([-58, -40, -22, 26, 42, 58, 138, 158, 182, 204, 222]):
        th = math.radians(a)
        px, py = polar(cx, cy, orbit, th)
        if py > 760: continue
        R0 = 96 + 8 * (k % 2)
        stem = PAL['moss'] if k % 2 == 0 else PAL['leaf']
        flower = [(PAL['corn'], PAL['linen'], PAL['sun_hi']), (PAL['linen'], PAL['corn_hi'], PAL['sun']), (PAL['oxblood_hi'], PAL['linen'], PAL['sun'])][k % 3]
        kurb_scroll(F, px, py, R0, 1.15, 1, stem, flower=flower, leaves=[PAL['corn'], PAL['moss_hi'], PAL['corn_hi']], lw=2.2, phase=th + math.pi * .5)
    for k in range(260):
        th = math.radians(-70 + k * 1.1)
        px, py = polar(cx, cy, orbit + 5 * math.sin(k * .9), th)
        if py > 760: continue
        P.set_source_rgba(*PAL['corn_hi'], .85); P.new_path(); P.arc(px, py, 3.0, 0, TAU); P.fill()
    rb = Z(404)
    for (bx, by, bs, ba) in ((16200 + 120, 230, 16, -0.12), (16200 + 168, 262, 14, -0.10), (16200 + 205, 215, 15, -0.14), (16200 + 880, 118, 13, 0.10), (16200 + 940, 140, 12, 0.08), (16200 + 1010, 108, 13, 0.12)):
        bird(F, bx, by, bs, ba)
    # the horizon: a thin line of the last light, then the land in night colours
    for wdt, a in ((54, .035), (30, .06), (16, .10), (8, .2)):
        L.set_source_rgba(1.0, .62, .25, a); L.set_line_width(wdt); L.new_path(); L.move_to(x0 - 20, HZ - 1); L.line_to(x1 + 20, HZ - 1); L.stroke()
    I.set_source_rgba(0.98, .55, .14, 1); I.set_line_width(3.6); I.new_path(); I.move_to(x0 - 20, HZ - 1); I.line_to(x1 + 20, HZ - 1); I.stroke()
    r = Z(9)
    bands = [(HZ + 0, 3.0, 400, (0.16, 0.24, 0.30)), (848, 14, 430, (0.12, 0.22, 0.24)), (952, 22, 540, (0.10, 0.19, 0.20)), (1086, 26, 620, (0.08, 0.15, 0.17)), (1216, 20, 720, (0.06, 0.12, 0.14))]
    for ctx in (P, I, S):
        ctx.save(); ctx.new_path(); ctx.rectangle(x0 - 40, HZ - 4, x1 - x0 + 80, H); ctx.clip()
    for bi, (top, amp, lam, col) in enumerate(bands):
        pts = S12.hill_pts(x0 - 40, x1 + 40, top, amp, lam, bi * 1.7)
        P.new_path(); P.move_to(pts[0][0], 1500)
        for p in pts: P.line_to(*p)
        P.line_to(pts[-1][0], 1500); P.close_path(); P.set_source_rgb(*col); P.fill()
        I.new_path(); I.move_to(*pts[0]); [I.line_to(*p) for p in pts[1:]]; I.set_source_rgba(*INK, .85); I.set_line_width(2.4); I.stroke()
        S.new_path(); S.move_to(pts[0][0], pts[0][1] + 5); [S.line_to(p[0], p[1] + 5) for p in pts[1:]]; S.set_source_rgba(0.02, 0.05, 0.10, .25); S.set_line_width(10); S.stroke()
    cols = [PAL['corn_hi'], PAL['linen'], PAL['rose'], PAL['sun_hi']]
    for i in range(300):
        x = r.uniform(x0 - 20, x1 + 20); band = int(r.choice([0, 1, 2, 3, 4], p=[.18, .24, .24, .2, .14]))
        y = bands[band][0] + r.uniform(18, 100) + (0 if band < 4 else 20)
        s = 0.55 + 1.3 * (y - HZ) / 500.0
        col = tuple(v * 0.55 for v in cols[int(r.integers(len(cols)))])
        I.set_source_rgba(0.08, 0.16, 0.14, 1); I.set_line_width(2.0 * s); I.new_path(); I.move_to(x, y); I.line_to(x, y - 20 * s); I.stroke()
        kurb_flower(F, x, y - 24 * s, 11 * s, col, tuple(v * 0.7 for v in PAL['linen']), tuple(v * 0.6 for v in PAL['sun']), rot=r.uniform(0, 6), petals=6, lw=1.4 * s)
    for ctx in (P, I, S): ctx.restore()
    for px_ in (16200 + 80, 16200 + 135, 16200 + 440, 16200 + 500, 16200 + 760, 16200 + 825, 16200 + 1000, 16200 + 1050):
        pine(F, px_, HZ + 5, 46 + r.uniform(-8, 10), tone=1.0)
    for (cx_, w_) in ((16200 + 280, 38), (16200 + 330, 30), (16200 + 930, 40)):
        cottage(F, cx_, HZ + 4, w_, tone=1.0)
    # the ring dance under the moon: two rings of tiny white dancers round a pole, tone 1 = night
    FK2.ring_dance_folk(F, 16200 + 405.0, 930.0, [(300.0, 44.0, 21), (168.0, 25.0, 12)], 58.0, tone=1.0)
    # one dancer has left the ring and stands in front of it, facing us
    dancer(F, 16200 + 455.0, 1062.0, 112.0, crown=True, face=True, seed=77, skirt=1.0)


def render(ss=2):
    x0, w = X0M, WM
    base, ply = base_night(x0, w)
    Fs = Folk(x0, w, ss)
    draw_all(Fs, x0, x0 + w)
    img = S12.composite(Fs, base, ply, seed=30)
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = render()
    cache_save('f_moon', X0M, img)
    print('moon', img.shape, round(time.time() - t, 1), 's')
    save_png(WORK + '/f_moon_slide.png', img[:, SLIDE_X - X0M:])
