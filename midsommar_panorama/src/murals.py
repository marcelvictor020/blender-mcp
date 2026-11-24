"""Naive-folk wall paintings for the hallway. All drawn in local panel units (1 m = 400 u, y down) and pushed through
a projective context onto the sloping walls. Same toolkit as slides 1-2."""
import math
import numpy as np
from util import *
from folk import *

TAU = 2 * math.pi
U = 400.0                                  # local units per metre


class Pen:
    """lightweight stand-in for Folk: same attributes, but the contexts are (projective) wrappers"""
    def __init__(self, F, proj):
        self.P, self.S, self.I, self.L = (PCtx(l.ctx, proj) for l in (F.paint, F.shade, F.ink, F.light))
        self.proj = proj

    def shape(self, build, fill=None, ink=None, lw=2.4, a=1.0, shade=None, sa=0.35):
        if fill is not None:
            build(self.P); self.P.set_source_rgba(*fill, a); self.P.fill()
        if shade is not None:
            build(self.S); self.S.set_source_rgba(*shade, sa); self.S.fill()
        if ink is not None:
            build(self.I); self.I.set_source_rgba(*ink, 1.0); self.I.set_line_width(lw); self.I.stroke()


def bear(F, x, y, s, flip=False, eyes_closed=False):
    """folk bear in profile, facing right; (x,y) = centre of belly, s = body half-length"""
    k = s / 90.0
    sg = -1 if flip else 1
    P = lambda a, b: (x + sg * a * k, y + b * k)
    brown, dark, belly = (0.43, 0.25, 0.12), (0.30, 0.16, 0.08), (0.58, 0.38, 0.20)
    lw = 2.4 * k
    def ell(cx, cy, rx, ry, rot=0.0):
        return P_ellipse(*P(cx, cy), rx * k, ry * k, rot * sg)
    for lx in (-62, -26, 38, 72):                                     # legs
        F.shape(ell(lx, 52, 17, 34), fill=dark, ink=INK, lw=lw)
        F.shape(ell(lx + 4 * sg, 82, 19, 9), fill=dark, ink=INK, lw=lw)
    F.shape(ell(0, 0, 100, 58), fill=brown, ink=INK, lw=lw * 1.2)
    F.shape(ell(-5, 26, 70, 26), fill=belly, a=0.55)
    F.shape(ell(-98, -10, 17, 15), fill=dark, ink=INK, lw=lw)           # tail
    F.shape(ell(98, -34, 42, 34, -0.2), fill=brown, ink=INK, lw=lw * 1.2)        # head
    F.shape(ell(134, -22, 26, 17, 0.15), fill=belly, ink=INK, lw=lw)             # snout
    F.shape(P_circle(*P(156, -30), 7 * k), fill=(0.08, 0.05, 0.05))
    F.shape(P_circle(*P(86, -66), 12 * k), fill=dark, ink=INK, lw=lw)             # ear
    F.shape(P_circle(*P(112, -62), 11 * k), fill=dark, ink=INK, lw=lw)
    ex, ey = P(112, -42)
    if eyes_closed:
        F.I.set_source_rgba(*INK, 1); F.I.set_line_width(lw * .9); F.I.new_path(); F.I.arc(ex, ey, 6 * k, 0.2, 2.9); F.I.stroke()
    else:
        F.shape(P_circle(ex, ey, 4.5 * k), fill=(0.05, 0.03, 0.03))
    F.I.set_source_rgba(*INK, 1); F.I.set_line_width(lw); F.I.new_path(); mx, my = P(126, -12); F.I.move_to(mx, my); F.I.curve_to(*P(136, -3), *P(146, -4), *P(152, -10)); F.I.stroke()
    for k_ in range(14):                                               # fur strokes
        a = k_ * 0.9
        fx, fy = P(-70 + 14 * k_, -44 + 8 * math.sin(a * 2.3))
        F.I.set_source_rgba(0.18, 0.09, 0.05, .55); F.I.set_line_width(lw * .7); F.I.new_path(); F.I.move_to(fx, fy); F.I.line_to(fx + sg * 8 * k, fy + 10 * k); F.I.stroke()


def flying_woman(F, x, y, s, eyes_closed=False):
    """a woman in white flying left->right, arms out, hair streaming"""
    P = lambda a, b: (x + a * s, y + b * s)
    lw = max(1.0, 0.012 * s)
    F.shape(P_smooth([P(-.9, -.15), P(-.55, -.32), P(-.2, -.22), P(.1, -.16), P(-.15, .08), P(-.6, .25), P(-1.0, .30)]), fill=PAL['linen'], ink=INK, lw=lw, shade=(0.5, 0.55, 0.8), sa=0.0)
    F.S.set_source_rgba(0.50, 0.56, 0.80, .35); F.S.new_path(); F.S.move_to(*P(-.9, -.15)); F.S.curve_to(*P(-.6, -.05), *P(-.3, .1), *P(-.15, .08)); F.S.line_to(*P(-.6, .25)); F.S.line_to(*P(-1.0, .30)); F.S.close_path(); F.S.fill()
    for a_, b_ in ((.05, -.20), (.30, -.34)):                          # arms
        F.I.set_source_rgba(*INK, 1); F.I.set_line_width(lw * 2.4); F.I.new_path(); F.I.move_to(*P(-.05, -.12)); F.I.line_to(*P(a_ + .25, b_ - .02)); F.I.stroke()
        F.I.set_source_rgba(*PAL['skin'], 1); F.I.set_line_width(lw * 1.4); F.I.new_path(); F.I.move_to(*P(-.05, -.12)); F.I.line_to(*P(a_ + .25, b_ - .02)); F.I.stroke()
    F.shape(P_circle(*P(.22, -.22), .12 * s), fill=PAL['skin'], ink=INK, lw=lw)
    F.shape(P_smooth([P(.14, -.31), P(.28, -.35), P(.34, -.22), P(.10, -.30)]), fill=PAL['hair_b'], ink=INK, lw=lw * .8)
    for k in range(5):                                                   # streaming hair
        F.I.set_source_rgba(*PAL['hair_b'], 1); F.I.set_line_width(lw * 2.2); F.I.new_path(); F.I.move_to(*P(.12, -.28 + k * .03))
        F.I.curve_to(*P(-.1, -.35 + k * .05), *P(-.4, -.30 + k * .06), *P(-.7, -.2 + k * .09)); F.I.stroke()
    ex, ey = P(.28, -.24)
    if eyes_closed:
        F.I.set_source_rgba(*INK, 1); F.I.set_line_width(lw); F.I.new_path(); F.I.arc(ex, ey, .018 * s, 0.2, 2.9); F.I.stroke()
    else:
        F.shape(P_circle(ex, ey, .012 * s), fill=INK)
    F.I.set_source_rgba(*INK_R, 1); F.I.set_line_width(lw * .8); F.I.new_path(); F.I.arc(*P(.30, -.17), .03 * s, 0.4, 2.7); F.I.stroke()
    for i in range(6):                                                    # flower crown
        cx_, cy_ = P(.12 + .05 * i, -.33 + .01 * i)
        F.shape(P_circle(cx_, cy_, .022 * s), fill=[PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen']][i % 3], ink=INK, lw=lw * .5)


def panel_bg(F, w, h, top, bot, ground, horizon=0.62, seed=0):
    """plywood board with a painted sky wash, hills and grain; framed by a thin oxblood border and zigzag frieze"""
    r = np.random.default_rng(seed)
    F.shape(P_poly([(0, 0), (w, 0), (w, h), (0, h)]), fill=PAL['ply'], a=1.0)
    n = 9
    y_a, y_b = h * 0.05, h * horizon
    for i in range(n):
        F.shape(P_poly([(0.04 * w, y_a + (y_b - y_a) * i / n), (0.96 * w, y_a + (y_b - y_a) * i / n),
                        (0.96 * w, y_a + (y_b - y_a) * (i + 1) / n + 2), (0.04 * w, y_a + (y_b - y_a) * (i + 1) / n + 2)]), fill=mixc(top, bot, i / (n - 1)), a=0.92)
    pts = [(0.04 * w, h * horizon)] + [(0.04 * w + 0.92 * w * i / 24, h * (horizon + 0.018 * math.sin(i * 0.8 + seed))) for i in range(25)] + [(0.96 * w, h * 0.96), (0.04 * w, h * 0.96)]
    F.shape(P_poly(pts), fill=ground, ink=INK, lw=1.8, a=0.95)
    for k in range(34):
        y = r.uniform(0, h)
        F.I.set_source_rgba(0.45, 0.32, 0.15, r.uniform(.05, .13)); F.I.set_line_width(1.1)
        F.I.new_path(); F.I.move_to(0, y); F.I.curve_to(w * .3, y + r.normal(0, 7), w * .6, y + r.normal(0, 7), w, y + r.normal(0, 5)); F.I.stroke()
    for (ins, col, lw_) in ((7, PAL['oxblood'], 2.4), (19, PAL['oxblood_hi'], 1.4)):
        F.shape(P_poly([(ins, ins), (w - ins, ins), (w - ins, h - ins), (ins, h - ins)]), ink=col, lw=lw_)
    nz = int((w - 60) / 24)
    for sidey in (h * 0.025 + 8, h - h * 0.025 - 8):
        pts = [(30 + i * (w - 60) / nz, sidey + (6 if i % 2 else -6)) for i in range(nz + 1)]
        F.I.set_source_rgba(*PAL['oxblood'], 1); F.I.set_line_width(1.6); F.I.new_path(); F.I.move_to(*pts[0]); [F.I.line_to(*p) for p in pts[1:]]; F.I.stroke()


def plywood_board(F, w, h, border=True):
    panel_bg(F, w, h, (0.62, 0.78, 0.92), (0.97, 0.90, 0.70), (0.52, 0.66, 0.30))


def mural_dance(F, w, h, closed=False):
    panel_bg(F, w, h, (0.98, 0.86, 0.46), (0.99, 0.93, 0.74), (0.45, 0.62, 0.28), seed=1)
    sun(F, w * 0.5, h * 0.20, w * 0.20, eyes_closed=closed)
    cols = [(PAL['oxblood_hi'], PAL['corn']), (PAL['corn'], PAL['sun_hi']), (PAL['moss'], PAL['oxblood_hi'])]
    hh = h * 0.40
    for i in range(3):
        x = w * (0.20 + 0.30 * i); y = h * 0.86
        F.shape(P_poly([(x - hh * .27, y), (x - hh * .10, y - hh * .50), (x + hh * .10, y - hh * .50), (x + hh * .27, y)]), fill=cols[i][0], ink=INK, lw=2.0)
        F.shape(P_poly([(x - hh * .10, y - hh * .50), (x - hh * .115, y - hh * .78), (x + hh * .115, y - hh * .78), (x + hh * .10, y - hh * .50)]), fill=cols[i][1], ink=INK, lw=2.0)
        dancer(F, x, y + 4, hh, dress=cols[i][1], crown=True, eyes_closed=closed, seed=30 + i,
               arms=([(x + w * .15, y - hh * .66)] if i == 0 else [(x + w * .15, y - hh * .66), (x - w * .15, y - hh * .66)] if i == 1 else [(x - w * .15, y - hh * .66)]))
    for i in range(7):
        kurb_flower(F, w * (0.09 + 0.14 * i), h * 0.935, w * 0.045, [PAL['oxblood_hi'], PAL['linen'], PAL['sun']][i % 3], PAL['linen'], PAL['sun'], rot=i, petals=7, lw=1.4)
    for i in range(7): bird(F, w * (0.12 + 0.12 * i), h * (0.42 + 0.03 * (i % 3)), w * .020, -.1)


def mural_bear(F, w, h, closed=False):
    panel_bg(F, w, h, (0.16, 0.22, 0.52), (0.66, 0.60, 0.74), (0.20, 0.38, 0.22), seed=2)
    moon(F, w * 0.66, h * 0.22, w * 0.15)
    for i in range(12):
        star8(F, w * (0.10 + 0.075 * i), h * (0.09 + 0.05 * (i % 4)), w * 0.016, PAL['cream'], ink=(0.2, 0.2, 0.4))
    for (px, py, hh) in ((w * .13, h * .70, h * .36), (w * .88, h * .68, h * .40)):
        pine(F, px, py + h * .03, hh)
    bear(F, w * 0.50, h * 0.68, w * 0.30, eyes_closed=closed)
    for i in range(6):
        x = w * (0.10 + 0.16 * i)
        F.I.set_source_rgba(*PAL['leaf'], 1); F.I.set_line_width(6); F.I.new_path(); F.I.move_to(x, h * .95); F.I.curve_to(x + 6, h * .90, x - 6, h * .86, x + 2, h * .82); F.I.stroke()
        kurb_flower(F, x + 2, h * .81, w * .045, [PAL['sun_hi'], PAL['oxblood_hi'], PAL['corn']][i % 3], PAL['linen'], PAL['oxblood'], petals=7, lw=1.5)


def mural_flying(F, w, h, closed=False):
    panel_bg(F, w, h, (0.60, 0.80, 0.92), (0.99, 0.92, 0.72), (0.50, 0.64, 0.30), seed=3)
    cloud_ribbon(F, [(w * .06, h * .40), (w * .3, h * .33), (w * .55, h * .40), (w * .94, h * .30)], lambda s_: h * .06, seed=3, puff=0.55, lw=2.0)
    flying_woman(F, w * 0.50, h * 0.27, w * 0.34, eyes_closed=closed)
    for (cx_, w_) in ((w * .20, w * .20), (w * .47, w * .24), (w * .76, w * .20)):
        cottage(F, cx_, h * .82, w_)
    for px in (w * .08, w * .34, w * .62, w * .90): pine(F, px, h * .82, h * .15)
    maypole(F, w * 0.62, h * 0.92, h * .28)
    for i in range(6): dancer(F, w * (0.14 + 0.12 * i), h * .95, h * .10, seed=40 + i, eyes_closed=closed)


def mural_sun(F, w, h, closed=False):
    panel_bg(F, w, h, (0.98, 0.80, 0.40), (0.99, 0.92, 0.70), (0.44, 0.60, 0.26), seed=4)
    sun(F, w * 0.50, h * 0.27, w * 0.24, eyes_closed=closed)
    F.I.set_source_rgba(*INK, 1); F.I.set_line_width(14); F.I.new_path(); F.I.move_to(w * .5, h * .95); F.I.curve_to(w * .52, h * .80, w * .47, h * .68, w * .5, h * .60); F.I.stroke()
    F.I.set_source_rgba(*PAL['moss'], 1); F.I.set_line_width(9); F.I.new_path(); F.I.move_to(w * .5, h * .95); F.I.curve_to(w * .52, h * .80, w * .47, h * .68, w * .5, h * .60); F.I.stroke()
    for i, (dx, dy, c3) in enumerate(((-.20, .68, 0), (.20, .66, 1), (-.28, .80, 1), (.28, .78, 0), (0, .57, 2))):
        kurb_flower(F, w * (.5 + dx), h * dy, w * .085, [PAL['oxblood_hi'], PAL['corn'], PAL['sun']][c3], PAL['linen'], PAL['sun'], rot=i, petals=8, lw=1.8)
        kurb_leaf(F, w * (.5 + dx * .5), h * (dy + .06), w * .13, (0 if dx > 0 else math.pi) - .6, PAL['moss'], lw=1.8)
    for sgn in (-1, 1):
        dancer(F, w * (.5 + sgn * .34), h * .93, h * .36, dress=PAL['linen'], eyes_closed=closed, seed=50 + sgn, arms=[(w * .5 + sgn * w * .20, h * .78)])
    for i in range(6): bird(F, w * (.10 + .16 * i), h * (.58 + .03 * (i % 2)), w * .020, .0)


MURALS = {'dance': mural_dance, 'bear': mural_bear, 'flying': mural_flying, 'sun': mural_sun}


def rune_circle(F, w, h, idx, closed=False):
    """large yellow disc holding a hand-painted rune, painted straight onto the oxblood wall"""
    cx, cy, R = w / 2, h / 2, min(w, h) * 0.46
    F.shape(P_circle(cx, cy, R * 1.07), fill=PAL['oxblood_hi'], a=0.5)
    F.shape(P_circle(cx, cy, R), fill=PAL['amber'], ink=INK_R, lw=2.6)
    F.shape(P_circle(cx, cy, R * 0.93), fill=PAL['sun'])
    F.shape(P_circle(cx, cy, R * 0.60), fill=PAL['sun_hi'], ink=INK_R, lw=1.8)
    for k in range(40):
        a = TAU * k / 40
        x, y = polar(cx, cy, R * 0.77, a)
        rune(F, x, y, R * 0.12, idx * 7 + k, col=PAL['oxblood'], lw=max(1.2, R * 0.012))
    for k in range(24):
        a = TAU * k / 24; x, y = polar(cx, cy, R * 0.99, a)
        F.P.set_source_rgba(*PAL['oxblood_hi'], 1); F.P.new_path(); F.P.arc(x, y, R * 0.018, 0, TAU); F.P.fill()
    rune(F, cx, cy, R * 0.82, idx, col=PAL['oxblood'], lw=max(2.0, R * 0.045), layer='I')


def mural_maypole(F, w, h, closed=False, medallion=False):
    """top-down maypole dance: concentric rings of white-dressed dancers round a flower-wrapped pole;
    the circles echo the nested doorframes."""
    cx, cy = w * 0.5, h * 0.5
    if medallion:
        R = min(w, h) * 0.44
        F.shape(P_circle(cx, cy, R * 1.20), fill=PAL['oxblood'], ink=INK, lw=2.6)
        F.shape(P_circle(cx, cy, R * 1.14), fill=PAL['ply'], ink=PAL['oxblood_hi'], lw=1.6)
        F.shape(P_circle(cx, cy, R * 1.08), ink=PAL['oxblood'], lw=1.4)
    else:
        plywood_board(F, w, h)
        R = min(w, h) * 0.46
    F.shape(P_circle(cx, cy, R * 1.04), fill=(0.55, 0.72, 0.38), ink=INK, lw=2.4, a=0.95)               # meadow disc
    for rr in (R * 0.86, R * 0.60, R * 0.36):
        F.I.set_source_rgba(*PAL['oxblood'], .45); F.I.set_line_width(1.4); F.I.new_path(); F.I.arc(cx, cy, rr, 0, TAU); F.I.stroke()
    for ri, (rr, n) in enumerate(((R * 0.86, 30), (R * 0.60, 21), (R * 0.36, 13))):
        pts = [polar(cx, cy, rr, TAU * i / n + ri * 0.2) for i in range(n)]
        for i in range(n):                                                   # shadows first
            x, y = pts[i]
            F.S.set_source_rgba(0.1, 0.18, 0.3, .35); F.S.new_path(); F.S.arc(x + 8, y + 9, 11, 0, TAU); F.S.fill()
        for i in range(n):
            x, y = pts[i]; nx, ny = pts[(i + 1) % n]
            F.I.set_source_rgba(*INK, 1); F.I.set_line_width(3.6); F.I.new_path(); F.I.move_to(x, y); F.I.line_to(nx, ny); F.I.stroke()
            F.I.set_source_rgba(*PAL['linen'], 1); F.I.set_line_width(2.2); F.I.new_path(); F.I.move_to(x, y); F.I.line_to(nx, ny); F.I.stroke()
        for i in range(n):
            x, y = pts[i]
            ang = math.atan2(y - cy, x - cx)
            F.shape(P_ellipse(x, y, 15, 10, ang + math.pi / 2), fill=PAL['linen'], ink=INK, lw=1.4)       # shoulders
            F.shape(P_circle(x, y, 7.6), fill=[PAL['hair_l'], PAL['hair_b'], PAL['hair_d']][i % 3], ink=INK, lw=1.1)
            F.P.set_source_rgb(*[PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen'], PAL['corn_hi']][i % 4]); F.P.new_path(); F.P.arc(x + 1.5, y - 1.5, 2.2, 0, TAU); F.P.fill()
    for k, col in enumerate((PAL['oxblood_hi'], PAL['sun_hi'], PAL['corn_hi'], PAL['linen'], PAL['rose'], PAL['moss_hi'])):   # ribbons
        a = TAU * k / 6 + 0.35
        F.I.set_source_rgba(*col, 1); F.I.set_line_width(3.2); F.I.new_path(); F.I.move_to(cx, cy)
        F.I.curve_to(*polar(cx, cy, R * .2, a - .5), *polar(cx, cy, R * .45, a + .5), *polar(cx, cy, R * .72, a + .9)); F.I.stroke()
    F.shape(P_circle(cx, cy, R * 0.15), fill=PAL['moss'], ink=INK, lw=2.2)
    for i in range(18):
        x, y = polar(cx, cy, R * 0.10, TAU * i / 18)
        kurb_flower(F, x, y, 11, [PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen']][i % 3], PAL['linen'], PAL['sun'], petals=5, lw=1.0)
    kurb_flower(F, cx, cy, 26, PAL['sun_hi'], PAL['oxblood_hi'], PAL['linen'], petals=8, lw=1.5)


MURALS['maypole'] = mural_maypole
