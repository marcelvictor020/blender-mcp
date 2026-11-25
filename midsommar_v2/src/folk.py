"""Naive Swedish folk-mural toolkit (dalmalning / kurbits) + slides 1-2 of the carousel.

Four cairo layers (paint / shade / ink / light) are composited over plywood with hand-made
mis-registration, edge darkening and pigment mottling so the result reads as gouache on plywood.
All drawing functions only use the restricted ctx API so they also work through util.PCtx
(murals painted on the perspective walls of the hallway).
"""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi
INK = PAL['ink']
INK_R = (0.36, 0.15, 0.09)          # warm red-brown ink used on the sun / flowers
Z = np.random.default_rng


class Folk:
    def __init__(self, x0, w, ss=2, proj=None):
        self.x0, self.w, self.proj = x0, w, proj
        self.paint, self.shade = Layer(w, H, x0, 0, ss), Layer(w, H, x0, 0, ss)
        self.ink, self.light = Layer(w, H, x0, 0, ss), Layer(w, H, x0, 0, ss)
        wrap = (lambda c: PCtx(c, proj)) if proj else (lambda c: c)
        self.P, self.S, self.I, self.L = (wrap(l.ctx) for l in (self.paint, self.shade, self.ink, self.light))

    def shape(self, build, fill=None, ink=None, lw=2.4, a=1.0, shade=None, sa=0.35):
        """build(ctx) must create the path. fill->paint layer, ink->ink layer (stroke), shade->shade layer."""
        if fill is not None:
            build(self.P); self.P.set_source_rgba(*fill, a); self.P.fill()
        if shade is not None:
            build(self.S); self.S.set_source_rgba(*shade, sa); self.S.fill()
        if ink is not None:
            build(self.I); self.I.set_source_rgba(*ink, 1.0); self.I.set_line_width(lw); self.I.stroke()


# ----------------------------------------------------------------------------- path builders
def P_circle(cx, cy, r):
    def b(c): c.new_path(); c.arc(cx, cy, r, 0, TAU); c.close_path()
    return b


def P_ellipse(cx, cy, rx, ry, rot=0.0):
    def b(c):
        c.save(); c.translate(cx, cy); c.rotate(rot); c.scale(rx, ry)
        c.new_path(); c.arc(0, 0, 1, 0, TAU); c.close_path(); c.restore()
    return b


def P_poly(pts, closed=True):
    def b(c):
        c.new_path(); c.move_to(*pts[0])
        for p in pts[1:]: c.line_to(*p)
        if closed: c.close_path()
    return b


def P_smooth(pts, closed=True, k=0.5):
    """Catmull-Rom style smooth closed/open curve through points."""
    n = len(pts)

    def b(c):
        c.new_path(); c.move_to(*pts[0])
        rng_ = range(n) if closed else range(n - 1)
        for i in rng_:
            p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[0]
            p1 = pts[i]; p2 = pts[(i + 1) % n]
            p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
            c1 = (p1[0] + (p2[0] - p0[0]) * k / 3 * 2, p1[1] + (p2[1] - p0[1]) * k / 3 * 2)
            c2 = (p2[0] - (p3[0] - p1[0]) * k / 3 * 2, p2[1] - (p3[1] - p1[1]) * k / 3 * 2)
            c.curve_to(*c1, *c2, *p2)
        if closed: c.close_path()
    return b


def polar(cx, cy, r, th): return (cx + r * math.cos(th), cy + r * math.sin(th))


def soft_disc(ctx, cx, cy, r, col, a):
    """soft radial blob (alpha a at centre -> 0 at the rim)"""
    if isinstance(ctx, cairo.Context):
        g = cairo.RadialGradient(cx, cy, 0, cx, cy, r)
        g.add_color_stop_rgba(0, *col, a); g.add_color_stop_rgba(.55, *col, a * .55); g.add_color_stop_rgba(1, *col, 0)
        ctx.set_source(g); ctx.new_path(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill()
    else:
        for k in range(5):
            ctx.set_source_rgba(*col, a * .28); ctx.new_path(); ctx.arc(cx, cy, r * (1 - k * .17), 0, TAU); ctx.fill()


def tint_night(c, t):
    """grade a colour toward moonlit cornflower night, t in 0..1"""
    n = mixc(c, (0.12, 0.17, 0.42), 0.55)
    n = tuple(v * 0.78 for v in n)
    return mixc(c, n, t)


# ----------------------------------------------------------------------------- the sun
def ray_shape(cx, cy, th, r0, r1, hw, bend):
    def b(c):
        L = r1 - r0
        a = [polar(cx, cy, r0, th - hw), polar(cx, cy, r0 + .30 * L, th - hw * 1.30),
             polar(cx, cy, r0 + .72 * L, th - hw * .38 + bend * .5), polar(cx, cy, r1, th + bend)]
        d = [polar(cx, cy, r0 + .72 * L, th + hw * .38 + bend * .5), polar(cx, cy, r0 + .30 * L, th + hw * 1.30),
             polar(cx, cy, r0, th + hw)]
        c.new_path(); c.move_to(*a[0]); c.curve_to(*a[1], *a[2], *a[3]); c.curve_to(*d[0], *d[1], *d[2]); c.close_path()
    return b


def sun(F, cx, cy, R, eyes_closed=False, seed=1, skip=None):
    P, I, S, L = F.P, F.I, F.S, F.L
    lw = max(1.6, 0.0085 * R)
    # pale painted halo rings
    soft_disc(P, cx, cy, R * 2.25, PAL['cream'], 0.55)
    n = 22
    for ring in (0, 1):                                  # outer long rays, inner short rays
        for i in range(n):
            th = TAU * i / n + (math.pi / n if ring else 0.0)
            if skip and abs(((th - skip[0] + math.pi) % TAU) - math.pi) < skip[1]: continue
            tip = (1.50 if ring else 1.92) + 0.07 * math.sin(i * 2.3 + ring)
            col = PAL['sun_hi'] if ring else PAL['sun']
            hw = (0.082 if ring else 0.070) * (22 / n) * 1.6
            sh = ray_shape(cx, cy, th, R * 1.012, R * tip, hw, 0.075)
            F.shape(sh, fill=col, ink=INK_R, lw=lw * 1.15, shade=PAL['amber'], sa=0.0)
            # orange wash on the lower half of each petal + rib line
            x0, y0 = polar(cx, cy, R * 1.02, th); x1, y1 = polar(cx, cy, R * (tip - 0.12), th + 0.05)
            I.set_source_rgba(*PAL['orange'], 0.75); I.set_line_width(lw * 0.8)
            I.new_path(); I.move_to(x0, y0); I.line_to(x1, y1); I.stroke()
            for k in range(3):                                  # hatch ticks
                t = 0.28 + 0.2 * k
                xa, ya = polar(cx, cy, R * (1.0 + (tip - 1.0) * t), th - hw * (1 - t) * 0.9)
                xb, yb = polar(cx, cy, R * (1.0 + (tip - 1.0) * (t + 0.08)), th - hw * (1 - t) * 0.2)
                I.set_source_rgba(*PAL['orange'], 0.55); I.set_line_width(lw * 0.7)
                I.new_path(); I.move_to(xa, ya); I.line_to(xb, yb); I.stroke()
    # disc: layered brushed rings
    F.shape(P_circle(cx, cy, R), fill=PAL['amber'], ink=INK_R, lw=lw * 1.5)
    F.shape(P_circle(cx, cy, R * 0.955), fill=PAL['sun'])
    F.shape(P_circle(cx, cy, R * 0.80), fill=PAL['sun_hi'], a=0.95)
    for k in range(34):                                    # brushed radial strokes
        th = TAU * k / 34; r0, r1 = R * (0.86 + 0.02 * (k % 3)), R * 0.99
        x0, y0 = polar(cx, cy, r0, th); x1, y1 = polar(cx, cy, r1, th)
        I.set_source_rgba(*PAL['orange'], 0.55); I.set_line_width(lw * 0.9)
        I.new_path(); I.move_to(x0, y0); I.line_to(x1, y1); I.stroke()
    for k in range(60):                                    # bead ring
        th = TAU * k / 60
        x, y = polar(cx, cy, R * 1.025, th)
        P.set_source_rgba(*PAL['oxblood_hi'], 1); P.new_path(); P.arc(x, y, R * 0.011, 0, TAU); P.fill()
    sun_face(F, cx, cy, R, eyes_closed)


def sun_face(F, cx, cy, R, eyes_closed=False):
    P, I, S, L = F.P, F.I, F.S, F.L
    lw = max(1.4, 0.0075 * R)
    # cheeks & forehead wash
    for s in (-1, 1):
        soft_disc(S, cx + s * .43 * R, cy + .24 * R, .20 * R, PAL['rose'], 0.55)
    S.set_source_rgba(*PAL['amber'], 0.28)
    S.new_path(); S.arc(cx, cy + .62 * R, .55 * R, 0, TAU); S.fill()          # soft chin shadow
    # brows
    for s in (-1, 1):
        def brow(c, s=s):
            c.new_path(); c.move_to(cx + s * .13 * R, cy - .20 * R)
            c.curve_to(cx + s * .28 * R, cy - .34 * R, cx + s * .47 * R, cy - .34 * R, cx + s * .60 * R, cy - .22 * R)
            c.curve_to(cx + s * .47 * R, cy - .29 * R, cx + s * .28 * R, cy - .28 * R, cx + s * .13 * R, cy - .20 * R)
            c.close_path()
        brow(I); I.set_source_rgba(*INK_R, 1); I.fill()
    # eyes
    for s in (-1, 1):
        ex, ey = cx + s * .35 * R, cy - .09 * R
        def eye(c, s=s, ex=ex, ey=ey):
            c.new_path(); c.move_to(ex - s * .21 * R, ey + .01 * R)
            c.curve_to(ex - s * .10 * R, ey - .13 * R, ex + s * .12 * R, ey - .15 * R, ex + s * .24 * R, ey + .02 * R)
            c.curve_to(ex + s * .12 * R, ey + .09 * R, ex - s * .08 * R, ey + .08 * R, ex - s * .21 * R, ey + .01 * R)
            c.close_path()
        if not eyes_closed:
            eye(P); P.set_source_rgb(*PAL['linen']); P.fill()
            P.save(); eye(P); P.clip()
            P.set_source_rgb(0.36, 0.52, 0.30); P.new_path(); P.arc(ex + s * .02 * R, ey - .005 * R, .080 * R, 0, TAU); P.fill()
            P.set_source_rgb(0.10, 0.12, 0.08); P.new_path(); P.arc(ex + s * .02 * R, ey - .005 * R, .038 * R, 0, TAU); P.fill()
            P.set_source_rgb(1, 1, 0.9); P.new_path(); P.arc(ex + s * .02 * R + .03 * R, ey - .03 * R, .014 * R, 0, TAU); P.fill()
            P.restore()
            # heavy lid wash (calm half-lidded look)
            S.set_source_rgba(*PAL['rose'], .6)
            S.new_path(); S.move_to(ex - s * .22 * R, ey); S.curve_to(ex - s * .10 * R, ey - .15 * R, ex + s * .12 * R, ey - .17 * R, ex + s * .25 * R, ey)
            S.curve_to(ex + s * .10 * R, ey - .08 * R, ex - s * .08 * R, ey - .08 * R, ex - s * .22 * R, ey); S.fill()
            eye(I); I.set_source_rgba(*INK_R, 1); I.set_line_width(lw); I.stroke()
        # upper lid: heavy; if eyes_closed -> a downward curved lid line
        I.set_source_rgba(*INK_R, 1); I.set_line_width(lw * 2.1)
        I.new_path()
        if eyes_closed:
            I.move_to(ex - s * .21 * R, ey); I.curve_to(ex - s * .08 * R, ey + .09 * R, ex + s * .12 * R, ey + .10 * R, ex + s * .24 * R, ey + .01 * R)
        else:
            I.move_to(ex - s * .21 * R, ey + .01 * R); I.curve_to(ex - s * .10 * R, ey - .13 * R, ex + s * .12 * R, ey - .15 * R, ex + s * .24 * R, ey + .02 * R)
        I.stroke()
        for k in range(4):                                           # lashes at outer corner
            ax, ay = ex + s * (.18 + .02 * k) * R, ey - (.005 - .02 * k) * R
            I.set_line_width(lw * .8); I.new_path(); I.move_to(ax, ay); I.line_to(ax + s * .05 * R, ay - .04 * R + .01 * R * k); I.stroke()
    # nose: long, calm, with shaded right flank
    I.set_source_rgba(*INK_R, 1); I.set_line_width(lw * 1.2)
    I.new_path(); I.move_to(cx - .015 * R, cy - .14 * R)
    I.curve_to(cx - .03 * R, cy + .02 * R, cx - .06 * R, cy + .12 * R, cx - .09 * R, cy + .21 * R); I.stroke()
    I.new_path(); I.move_to(cx - .10 * R, cy + .22 * R)
    I.curve_to(cx - .02 * R, cy + .30 * R, cx + .05 * R, cy + .30 * R, cx + .12 * R, cy + .21 * R); I.stroke()
    I.set_line_width(lw * 0.9)
    for s in (-1, 1):
        I.new_path(); I.arc(cx + s * .075 * R, cy + .22 * R, .035 * R, 0.1, 2.9); I.stroke()
    S.set_source_rgba(*PAL['amber'], .35)
    S.new_path(); S.move_to(cx, cy - .12 * R); S.curve_to(cx + .05 * R, cy, cx + .10 * R, cy + .14 * R, cx + .13 * R, cy + .22 * R)
    S.line_to(cx + .02 * R, cy + .20 * R); S.curve_to(cx + .01 * R, cy + .10 * R, cx, cy, cx, cy - .12 * R); S.fill()
    # mouth: soft even smile
    def lips(c):
        c.new_path(); c.move_to(cx - .27 * R, cy + .385 * R)
        c.curve_to(cx - .11 * R, cy + .50 * R, cx + .11 * R, cy + .50 * R, cx + .27 * R, cy + .385 * R)
        c.curve_to(cx + .12 * R, cy + .415 * R, cx - .12 * R, cy + .415 * R, cx - .27 * R, cy + .385 * R); c.close_path()
    lips(P); P.set_source_rgb(*PAL['brick']); P.fill()
    lips(I); I.set_source_rgba(*INK_R, 1); I.set_line_width(lw * 1.1); I.stroke()
    for s in (-1, 1):                                                 # dimples
        I.new_path(); I.arc(cx + s * .30 * R, cy + .37 * R, .03 * R, -1.2 if s > 0 else 1.9, -.2 if s > 0 else 2.9); I.stroke()
    # gold-leaf specks on brow bone / cheeks
    r = Z(5)
    for _ in range(26):
        a = r.uniform(0, TAU); d = R * math.sqrt(r.uniform(0.05, 0.9))
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        L.set_source_rgba(*PAL['leafgold_hi'], r.uniform(.25, .7)); L.new_path()
        L.arc(x, y, r.uniform(0.7, 1.9) * max(1, R / 220), 0, TAU); L.fill()


def long_ray(F, cx, cy, R, ang, length, w0):
    """one enormous petal ray, the sun 'handing over' the light"""
    lw = max(1.8, 0.0085 * R)
    n = 70
    side_a, side_b = [], []
    for i in range(n + 1):
        t = i / n
        hw = w0 * ((1 - t ** 0.85) ** 1.05) * (1 + 0.22 * math.sin(t * 7.0)) + 0.6
        s = R * 0.95 + t * (length - R * 0.95)
        bend = 0.018 * length * math.sin(t * math.pi)
        side_a.append((s, -hw + bend)); side_b.append((s, hw + bend))
    pts = side_a + side_b[::-1]
    ca, sa = math.cos(ang), math.sin(ang)
    g = [(cx + s * ca - n_ * sa, cy + s * sa + n_ * ca) for s, n_ in pts]
    F.shape(P_poly(g), fill=PAL['sun'], ink=INK_R, lw=lw * 1.3)
    def _bend(s): return 0.018 * length * math.sin(((s - R * 0.95) / (length - R * 0.95)) * math.pi)
    mid = [(cx + s * ca - _bend(s) * sa, cy + s * sa + _bend(s) * ca) for s in np.linspace(R * 1.0, length * 0.985, 60)]
    I = F.I
    I.set_source_rgba(*PAL['orange'], 0.8); I.set_line_width(lw)
    I.new_path(); I.move_to(*mid[0]); [I.line_to(*p) for p in mid[1:]]; I.stroke()
    r = Z(11)
    for k in range(34):                                              # beads along the ray
        t = 0.04 + 0.92 * k / 34
        s = R + t * (length - R); hw = w0 * 0.45 * (1 - t ** 0.85) ** 1.05
        off = r.choice([-1, 1]) * hw * 0.55
        x = cx + s * ca - off * sa; y = cy + s * sa + off * ca
        F.P.set_source_rgba(*PAL['oxblood_hi'], .9); F.P.new_path(); F.P.arc(x, y, max(1.4, hw * 0.12), 0, TAU); F.P.fill()
    for k in range(60):                                              # gold flecks
        t = r.uniform(0.02, 0.97); s = R + t * (length - R); hw = w0 * (1 - t ** 0.85) ** 1.05 * 0.8
        off = r.uniform(-hw, hw)
        x = cx + s * ca - off * sa; y = cy + s * sa + off * ca
        F.L.set_source_rgba(*PAL['leafgold_hi'], r.uniform(.3, .8)); F.L.new_path(); F.L.arc(x, y, r.uniform(.8, 2.1), 0, TAU); F.L.fill()
    return mid


# ----------------------------------------------------------------------------- moon + stars
def star8(F, x, y, r, col, a=1.0, ink=None, rot=0.0):
    P = F.P
    def b(c):
        c.new_path()
        for i in range(16):
            rr = r if i % 2 == 0 else r * 0.42
            px, py = polar(x, y, rr, rot + TAU * i / 16 - math.pi / 2)
            (c.move_to if i == 0 else c.line_to)(px, py)
        c.close_path()
    if ink is not None:
        b(P); P.set_source_rgba(*ink, 0.9); P.set_line_width(max(0.9, r * 0.14)); P.stroke()
    b(P); P.set_source_rgba(*col, a); P.fill()


def moon(F, cx, cy, R):
    """pale crescent (horns pointing right); its concave edge carries a sleeping profile:
    forehead, brow, closed eye, nose, lips, chin."""
    P, I, S, L = F.P, F.I, F.S, F.L
    lw = max(1.5, 0.011 * R)
    ic = (cx + .36 * R, cy - .06 * R); rin = .84 * R
    dx, dy = ic[0] - cx, ic[1] - cy; d = math.hypot(dx, dy)
    a_ = (R * R - rin * rin + d * d) / (2 * d); h_ = math.sqrt(R * R - a_ * a_)
    ux, uy = dx / d, dy / d
    mx_, my_ = cx + a_ * ux, cy + a_ * uy
    Lp = (mx_ - h_ * uy, my_ + h_ * ux); Up = (mx_ + h_ * uy, my_ - h_ * ux)          # lower / upper horn tips
    if Lp[1] < Up[1]: Lp, Up = Up, Lp
    phL = math.atan2(Lp[1] - ic[1], Lp[0] - ic[0]) % TAU                              # ~ +65 deg  (lower)
    phU = math.atan2(Up[1] - ic[1], Up[0] - ic[0]) % TAU                              # ~ 276 deg (upper)
    aL = math.atan2(Lp[1] - cy, Lp[0] - cx) % TAU; aU = math.atan2(Up[1] - cy, Up[0] - cx) % TAU
    def bump(u):      # u>0 = up the face. radial push of the body into the cavity
        g = lambda c, w: math.exp(-((u - c) / w) ** 2)
        return (0.020 * g(.80, .10) + 0.045 * g(.62, .09) - 0.028 * g(.45, .055) + 0.040 * g(.30, .05)
                + 0.150 * g(.14, .07) + 0.030 * g(.02, .05) + 0.050 * g(-.11, .045) + 0.042 * g(-.23, .045)
                + 0.075 * g(-.41, .09))
    prof = []
    nseg = 140
    for i in range(nseg + 1):
        ph = phU + (phL - phU) * i / nseg if phL < phU else phU + (phL + TAU - phU) * i / nseg
        u = (ph - math.pi) % TAU
        u = u - TAU if u > math.pi else u                   # >0 = above the horizontal axis
        env = math.sin(math.pi * i / nseg) ** 0.35           # horns stay on the circle
        prof.append(polar(ic[0], ic[1], rin * (1 - bump(u) * env), ph))
    # profile runs upper horn -> lower horn through the left; but ph decreases through pi (leftmost point)
    def crescent(c):
        c.new_path(); c.move_to(*prof[0])
        for p in prof[1:]: c.line_to(*p)
        steps = 90
        a0 = aL; a1 = aU if aU > aL else aU + TAU            # outer arc clockwise from lower tip round the left to upper tip
        for i in range(steps + 1):
            c.line_to(*polar(cx, cy, R, a0 + (a1 - a0) * i / steps))
        c.close_path()
    F.shape(crescent, fill=PAL['cream'], ink=(0.12, 0.16, 0.34), lw=lw * 1.4)
    # cool rim shadow (outer-left), kept off the face
    S.save(); crescent(S); S.clip()
    S.set_source_rgba(0.40, 0.50, 0.82, 0.40)
    S.new_path(); S.rectangle(cx - 2 * R, cy - 2 * R, 4 * R, 4 * R); S.new_sub_path() if hasattr(S, 'new_sub_path') else None
    S.arc(cx + .10 * R, cy + .0 * R, R * 0.80, 0, TAU)
    S.set_fill_rule(cairo.FILL_RULE_EVEN_ODD); S.fill(); S.set_fill_rule(cairo.FILL_RULE_WINDING); S.restore()
    # closed eye, lashes, brow
    ex, ey = polar(ic[0], ic[1], rin * 1.16, math.pi + .40)
    I.set_source_rgba(0.12, 0.16, 0.34, 1); I.set_line_width(lw * 1.5)
    I.new_path(); I.move_to(ex - .075 * R, ey - .012 * R); I.curve_to(ex - .03 * R, ey + .06 * R, ex + .04 * R, ey + .06 * R, ex + .085 * R, ey - .012 * R); I.stroke()
    I.set_line_width(lw)
    for k in range(4):
        ax = ex - .055 * R + k * .045 * R
        I.new_path(); I.move_to(ax, ey + .035 * R); I.line_to(ax - .012 * R, ey + .072 * R); I.stroke()
    I.new_path(); I.move_to(ex - .10 * R, ey - .07 * R); I.curve_to(ex - .03 * R, ey - .115 * R, ex + .05 * R, ey - .105 * R, ex + .10 * R, ey - .055 * R); I.stroke()
    mx2, my2 = polar(ic[0], ic[1], rin * 1.06, math.pi - .19)
    I.new_path(); I.move_to(mx2 - .03 * R, my2 - .004 * R); I.curve_to(mx2 + .01 * R, my2 + .022 * R, mx2 + .045 * R, my2 + .02 * R, mx2 + .07 * R, my2 - .012 * R); I.stroke()
    bx, by = polar(ic[0], ic[1], rin * 1.22, math.pi + .0)
    S.set_source_rgba(*PAL['rose'], .55); S.new_path(); S.arc(bx, by, .07 * R, 0, TAU); S.fill()
    r = Z(21)
    for _ in range(10):                                   # painted craters on the outer rim
        a = r.uniform(math.pi * .60, math.pi * 1.40); dd = r.uniform(.84, .97) * R
        x, y = polar(cx, cy, dd, a)
        if math.hypot(x - ic[0], y - ic[1]) < rin * 1.12: continue
        S.set_source_rgba(0.45, 0.55, 0.85, .38); S.new_path(); S.arc(x, y, r.uniform(.02, .05) * R, 0, TAU); S.fill()
    for _ in range(46):                                   # gold-leaf / moon-dust glints
        a = r.uniform(math.pi * .55, math.pi * 1.45); dd = r.uniform(.5, .98) * R
        x, y = polar(cx, cy, dd, a)
        if math.hypot(x - ic[0], y - ic[1]) < rin * 1.05: continue
        L.set_source_rgba(1, .95, .75, r.uniform(.25, .7)); L.new_path(); L.arc(x, y, r.uniform(.8, 2.0), 0, TAU); L.fill()
    return ic, rin


def star_rings(F, cx, cy, R, rings=4):
    r = Z(8)
    for k in range(rings):
        rr = R * (1.50 + 0.43 * k)
        n = int(11 + 7.5 * k)
        size = R * (0.092 - 0.016 * k)
        # faint guide ring
        F.I.set_source_rgba(0.82, 0.88, 1.0, 0.22); F.I.set_line_width(1.1); F.I.new_path(); F.I.arc(cx, cy, rr, 0, TAU); F.I.stroke()
        for i in range(n):
            th = TAU * i / n + (0.0 if k % 2 == 0 else math.pi / n)
            x, y = polar(cx, cy, rr, th)
            col = PAL['cream'] if (i % 3) else PAL['sun_hi']
            soft_disc(F.P, x, y, size * 2.1, (1, .96, .8), 0.30)
            star8(F, x, y, size, col, ink=(0.12, 0.16, 0.34), rot=th)


# ----------------------------------------------------------------------------- kurbits
def kurb_leaf(F, x, y, L_, ang, col, ink=INK_R, lw=2.0, curl=0.25):
    def b(c):
        c.save(); c.translate(x, y); c.rotate(ang)
        c.new_path(); c.move_to(0, 0)
        c.curve_to(L_ * .25, -L_ * (.34 + curl * .2), L_ * .70, -L_ * (.30 - curl), L_, -L_ * curl * .4)
        c.curve_to(L_ * .70, L_ * (.20 + curl * .2), L_ * .30, L_ * .30, 0, 0); c.close_path(); c.restore()
    F.shape(b, fill=col, ink=ink, lw=lw)
    F.I.save(); F.I.translate(x, y); F.I.rotate(ang)
    F.I.set_source_rgba(*ink, .55); F.I.set_line_width(lw * .7); F.I.new_path(); F.I.move_to(L_ * .06, 0)
    F.I.curve_to(L_ * .35, -L_ * .05, L_ * .65, -L_ * .08, L_ * .93, -L_ * curl * .35); F.I.stroke(); F.I.restore()


def kurb_flower(F, x, y, r, c1, c2, c3, rot=0.0, petals=8, ink=INK_R, lw=2.0, profile=False):
    """layered dalmalning rosette: broad rounded petals, comma-stroke highlights, bead centre.
    outline is laid UNDER each fill so the silhouette stays clean."""
    P, I = F.P, F.I
    lw = max(0.8, lw)
    for ring, (rr, n, col) in enumerate(((1.0, petals, c1), (0.68, max(5, petals - 2), c2))):
        for i in range(n):
            a = rot + TAU * i / n + (math.pi / n if ring else 0)
            px, py = polar(x, y, r * rr * .56, a)
            def pet(c, px=px, py=py, a=a, rr=rr):
                c.save(); c.translate(px, py); c.rotate(a); c.scale(r * rr * .50, r * rr * .36)
                c.new_path(); c.arc(0, 0, 1, 0, TAU); c.close_path(); c.restore()
            pet(P); P.set_source_rgba(*ink, 1); P.set_line_width(lw * 2.1); P.stroke()
            shade = mixc(col, (0.15, 0.04, 0.05), 0.22 if ring == 0 else 0.15)
            pet(P); P.set_source_rgba(*mixc(col, shade, (i % 3) * 0.25), 1); P.fill()
            # comma-stroke highlight (the brush-stroke signature of dalmalning)
            hx, hy = polar(px, py, r * rr * .20, a + .5)
            P.save(); P.translate(hx, hy); P.rotate(a + .3)
            P.set_source_rgba(*mixc(col, (1, .96, .86), .55), .9); P.set_line_width(max(.9, r * rr * .07))
            P.new_path(); P.move_to(-r * rr * .20, r * rr * .05); P.curve_to(-r * rr * .05, -r * rr * .12, r * rr * .12, -r * rr * .12, r * rr * .22, -r * rr * .02)
            P.stroke(); P.restore()
    P.set_source_rgba(*ink, 1); P.new_path(); P.arc(x, y, r * .30, 0, TAU); P.fill()
    P.set_source_rgba(*c3, 1); P.new_path(); P.arc(x, y, r * .25, 0, TAU); P.fill()
    for i in range(8):
        a = TAU * i / 8; px, py = polar(x, y, r * .145, a)
        P.set_source_rgba(*PAL['oxblood'], 1); P.new_path(); P.arc(px, py, r * .034, 0, TAU); P.fill()
    P.set_source_rgba(*mixc(c3, (1, 1, .9), .6), .9); P.new_path(); P.arc(x - r * .06, y - r * .07, r * .05, 0, TAU); P.fill()


def kurb_scroll(F, x, y, R0, turns, direction, stem, flower=None, leaves=None, lw=2.2, phase=0.0, taper=True):
    """spiral stem with leaves, ending in a bloom. direction=+1 clockwise on screen."""
    P = F.P
    pts = []
    n = 140
    for i in range(n + 1):
        t = i / n
        rr = R0 * (1 - 0.93 * t ** 0.9)
        a = phase + direction * turns * TAU * t
        pts.append(polar(x, y, rr, a))
    if leaves:
        for k, t in enumerate(np.linspace(0.08, 0.78, len(leaves) * 2)):
            i = int(t * n); p = pts[i]; q = pts[min(n, i + 2)]
            ang = math.atan2(q[1] - p[1], q[0] - p[0]) + (1.0 if k % 2 else -1.0) * 0.95
            kurb_leaf(F, p[0], p[1], R0 * 0.40 * (1 - 0.55 * t), ang, leaves[k % len(leaves)], lw=lw, curl=.3)
    for (col, wmul, extra) in ((INK_R, 1.0, 2.6 * lw), (stem, 1.0, 0.0)):
        P.set_source_rgba(*col, 1)
        for i in range(n):
            t = i / n
            w = R0 * 0.052 * (1 - 0.72 * t) + extra
            P.set_line_width(w); P.new_path(); P.move_to(*pts[i]); P.line_to(*pts[i + 1]); P.stroke()
    if flower:
        fx, fy = pts[-1]
        kurb_flower(F, fx, fy, R0 * 0.30, *flower, rot=phase, lw=lw)


# ----------------------------------------------------------------------------- birds, ribbon
def bird(F, x, y, s, ang=0.0, flip=False, col=(0.10, 0.07, 0.08)):
    def b(c):
        c.save(); c.translate(x, y); c.rotate(ang); c.scale(-s if flip else s, s)
        c.new_path(); c.move_to(1.0, 0.0)
        c.curve_to(.85, -.14, .6, -.17, .35, -.12); c.curve_to(-.1, -.16, -.5, -.08, -.72, -.05)
        c.line_to(-1.2, -.22); c.line_to(-1.0, -.03); c.line_to(-1.22, .17); c.line_to(-.70, .08)
        c.curve_to(-.3, .16, .2, .16, .45, .10); c.curve_to(.7, .08, .9, .05, 1.0, 0.0); c.close_path()
        c.new_path() if False else None
        c.restore()
    F.shape(b, fill=col)
    def wing(c):
        c.save(); c.translate(x, y); c.rotate(ang); c.scale(-s if flip else s, s)
        c.new_path(); c.move_to(.3, -.10); c.curve_to(.1, -.55, -.35, -.95, -.85, -1.0)
        c.curve_to(-.55, -.62, -.35, -.3, -.5, -.06); c.close_path(); c.restore()
    F.shape(wing, fill=col)


def ribbon_puffs(ctrl, thick, seed=3, puff=0.58):
    """deterministic puff circles [(x,y,r)] of a scalloped ribbon cloud; thick(s_px) -> thickness"""
    r = Z(seed)
    pts = np.array(ctrl, np.float32)
    m = 400
    def cr(p0, p1, p2, p3, t):
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
    pp = np.vstack([pts[0], pts, pts[-1]])
    samples = []
    per = m // (len(pts) - 1)
    for i in range(len(pts) - 1):
        for k in range(per):
            samples.append(cr(pp[i], pp[i + 1], pp[i + 2], pp[i + 3], k / per))
    samples = np.array(samples)
    seg = np.hypot(*np.diff(samples, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
    puffs = []
    s = 0.0
    while s < cum[-1]:
        th = thick(s)
        i = min(np.searchsorted(cum, s), len(samples) - 1)
        cx, cy = samples[i]
        rad = th * puff * r.uniform(.85, 1.15)
        puffs.append((cx + r.normal(0, th * .06), cy + r.normal(0, th * .10), rad))
        for sgn in (-1, 1):
            j = min(i + 1, len(samples) - 1); dx, dy = samples[j] - samples[max(i - 1, 0)]
            nl = math.hypot(dx, dy) + 1e-6; nx, ny = -dy / nl, dx / nl
            rr = rad * r.uniform(.45, .7)
            puffs.append((cx + sgn * nx * th * .46, cy + sgn * ny * th * .46, rr))
        s += max(10.0, th * r.uniform(.45, .8))
    return puffs, samples, cum


def cloud_ribbon(F, ctrl, thick, seed=3, tone=0.0, outline=INK, lw=2.4, puff=0.58, extra=None):
    """painted scalloped ribbon cloud (flat folk paint). ctrl: [(x,y),...] centre line; thick(s)->px"""
    r = Z(seed + 1000)
    puffs, _, _ = ribbon_puffs(ctrl, thick, seed, puff)
    if extra:
        puffs = list(puffs) + list(extra)
    pass
    c = F.P
    c.set_source_rgba(*outline, 1)
    for (x, y, rad) in puffs:
        c.new_path(); c.arc(x, y, rad + lw, 0, TAU); c.fill()
    base = mixc(PAL['cream'], (0.6, 0.7, 0.95), tone * .5)
    for (x, y, rad) in puffs:
        c.set_source_rgba(*base, 1); c.new_path(); c.arc(x, y, rad, 0, TAU); c.fill()
    # painted swirl lines + soft cool underside shading, kept inside the paint layer
    for (x, y, rad) in puffs[::2]:
        a0 = r.uniform(0.15, 0.9) * math.pi
        c.set_source_rgba(0.40, 0.46, 0.74, .16 + .10 * tone); c.set_line_width(rad * .30)
        c.new_path(); c.arc(x + rad * .04, y + rad * .06, rad * .86, 0.15 * math.pi, 0.85 * math.pi); c.stroke()
    for (x, y, rad) in puffs[::3]:
        a0 = r.uniform(0, TAU)
        c.set_source_rgba(*mixc((0.45, 0.50, 0.75), outline, 0.25), .55); c.set_line_width(lw * .7)
        c.new_path(); c.arc(x, y, rad * .60, a0, a0 + r.uniform(1.3, 2.2)); c.stroke()
    return puffs


# ----------------------------------------------------------------------------- people, houses
def dancer(F, x, y, h, dress=None, hair=None, crown=True, face=True, arms=None, seed=0, eyes_closed=False, skirt=1.0):
    """tiny/medium naive figure in linen dress. (x,y)=feet centre; h=height px."""
    r = Z(seed)
    dress = dress or PAL['linen']; hair = hair or r.choice([PAL['hair_l'], PAL['hair_b'], PAL['hair_d']])
    P, I, S = F.P, F.I, F.S
    lw = max(0.9, h * 0.028)
    sh_y = y - h * .80
    def body(c):
        c.new_path(); c.move_to(x - h * .105, sh_y)
        c.curve_to(x - h * .14, y - h * .5, x - h * .24 * skirt, y - h * .25, x - h * .25 * skirt, y - h * .06)
        c.line_to(x + h * .25 * skirt, y - h * .06)
        c.curve_to(x + h * .24 * skirt, y - h * .25, x + h * .14, y - h * .5, x + h * .105, sh_y); c.close_path()
    F.shape(body, fill=dress, ink=INK, lw=lw, shade=PAL['linen_sh'], sa=0.0)
    S.set_source_rgba(0.52, .58, .8, .35)                                    # cool shade on right side
    S.new_path(); S.move_to(x + h * .02, sh_y); S.curve_to(x + h * .06, y - h * .5, x + h * .12, y - h * .25, x + h * .25 * skirt, y - h * .06)
    S.line_to(x + h * .02, y - h * .06); S.close_path(); S.fill()
    for dx in (-.07, .07):                                                   # feet
        P.set_source_rgb(*PAL['skin_sh']); P.new_path(); P.arc(x + dx * h, y - h * .035, h * .035, 0, TAU); P.fill()
    if arms:                                                                 # list of hand target points
        for (hx, hy) in arms:
            I.set_source_rgba(*INK, 1); I.set_line_width(max(1.0, lw * 2.4)); I.new_path()
            I.move_to(x + (h * .1 if hx > x else -h * .1), sh_y + h * .04); I.line_to(hx, hy); I.stroke()
            I.set_source_rgba(*dress, 1); I.set_line_width(max(0.7, lw * 1.5)); I.new_path()
            I.move_to(x + (h * .1 if hx > x else -h * .1), sh_y + h * .04); I.line_to(hx, hy); I.stroke()
    hy_ = y - h * .90
    F.shape(P_circle(x, hy_, h * .095), fill=PAL['skin'], ink=INK, lw=lw)
    F.shape(P_ellipse(x, hy_ - h * .025, h * .105, h * .08), fill=hair, ink=INK, lw=lw * .8)
    if face and h > 30:
        if eyes_closed:
            for s in (-1, 1):
                I.set_source_rgba(*INK, 1); I.set_line_width(max(.7, lw * .7)); I.new_path()
                I.arc(x + s * h * .03, hy_ + h * .005, h * .017, 0.2, 2.9); I.stroke()
        else:
            for s in (-1, 1):
                P.set_source_rgb(*INK); P.new_path(); P.arc(x + s * h * .033, hy_ + h * .004, h * .01, 0, TAU); P.fill()
        I.set_source_rgba(*INK_R, 1); I.set_line_width(max(.6, lw * .6)); I.new_path(); I.arc(x, hy_ + h * .02, h * .03, 0.4, 2.7); I.stroke()
    if crown:
        cols = [PAL['oxblood_hi'], PAL['sun_hi'], PAL['linen'], PAL['corn_hi']]
        for i in range(7):
            a = math.pi * (1.05 + 0.9 * i / 6)
            px, py = polar(x, hy_ - h * .005, h * .105, a)
            P.set_source_rgb(*cols[i % 4]); P.new_path(); P.arc(px, py, max(.9, h * .022), 0, TAU); P.fill()


def cottage(F, x, y, w, tone=0.0):
    """falu-red cottage with white corner trim and a lit window"""
    h = w * .52
    red = tint_night(PAL['falu'], tone); roof = tint_night((0.16, 0.12, 0.12), tone)
    lw = max(1.0, w * .035)
    F.shape(P_poly([(x - w / 2, y), (x - w / 2, y - h), (x + w / 2, y - h), (x + w / 2, y)]), fill=red, ink=INK, lw=lw)
    F.shape(P_poly([(x - w * .58, y - h), (x, y - h - w * .30), (x + w * .58, y - h)]), fill=roof, ink=INK, lw=lw)
    for sx in (-1, 1):
        F.shape(P_poly([(x + sx * w * .5, y), (x + sx * w * .5, y - h), (x + sx * w * .44, y - h), (x + sx * w * .44, y)]), fill=tint_night(PAL['linen'], tone))
    wcol = mixc(PAL['sun_hi'], (0.2, 0.2, 0.4), tone * .0)
    for sx in (-.2, .2):
        F.shape(P_poly([(x + sx * w - w * .07, y - h * .75), (x + sx * w + w * .07, y - h * .75), (x + sx * w + w * .07, y - h * .35), (x + sx * w - w * .07, y - h * .35)]), fill=wcol, ink=tint_night(PAL['linen'], tone), lw=lw)
    F.shape(P_poly([(x + w * .30, y - h - w * .15), (x + w * .30, y - h - w * .30), (x + w * .38, y - h - w * .30), (x + w * .38, y - h - w * .12)]), fill=red, ink=INK, lw=lw * .8)


def pine(F, x, y, h, tone=0.0, col=None):
    col = col or tint_night(PAL['leaf'], tone)
    lw = max(0.9, h * .02)
    F.shape(P_poly([(x - h * .02, y), (x - h * .02, y - h * .18), (x + h * .02, y - h * .18), (x + h * .02, y)]), fill=(0.25, 0.15, 0.10), ink=INK, lw=lw)
    for k in range(4):
        w = h * (.30 - .06 * k); y0 = y - h * (.12 + .21 * k); y1 = y0 - h * .30
        F.shape(P_poly([(x - w, y0), (x, y1), (x + w, y0)]), fill=mixc(col, (0.9, 0.9, 0.5), .0 + .07 * k), ink=INK, lw=lw)


def maypole(F, x, y, h, tone=0.0):
    lw = max(1.0, h * .018)
    F.shape(P_poly([(x - h * .015, y), (x - h * .015, y - h), (x + h * .015, y - h), (x + h * .015, y)]), fill=tint_night(PAL['moss'], tone), ink=INK, lw=lw)
    F.shape(P_poly([(x - h * .22, y - h * .86), (x + h * .22, y - h * .86), (x + h * .22, y - h * .835), (x - h * .22, y - h * .835)]), fill=tint_night(PAL['moss'], tone), ink=INK, lw=lw)
    for sx in (-.2, 0, .2):
        F.shape(P_circle(x + sx * h, y - h * .86 + (h * .0 if sx else -h * .0), h * .028), fill=[PAL['oxblood_hi'], PAL['sun_hi'], PAL['corn_hi']][int(sx * 5) % 3], ink=INK, lw=lw * .8)
    for k, col in enumerate((PAL['oxblood_hi'], PAL['sun_hi'], PAL['corn_hi'], PAL['linen'])):    # ribbons
        a = -0.6 + 0.4 * k
        x1, y1 = x + math.sin(a) * h * .36, y - h * .16
        F.I.set_source_rgba(*col, 1); F.I.set_line_width(max(1.0, h * .012)); F.I.new_path(); F.I.move_to(x, y - h * .95)
        F.I.curve_to(x + math.sin(a) * h * .1, y - h * .7, x1, y - h * .5, x1, y1); F.I.stroke()


RUNES = [  # elder-futhark-like staves in a 0..1 box (vertical stave + branches); decorative only, never forming words
    [[(.5, 0), (.5, 1)], [(.5, .08), (.82, .28), (.5, .48)]],
    [[(.28, 1), (.28, 0), (.72, .22), (.28, .45)]],
    [[(.5, 0), (.5, 1)], [(.5, .15), (.85, .35), (.5, .55)], [(.5, .55), (.85, .75)]],
    [[(.3, 0), (.3, 1)], [(.3, .1), (.8, .32), (.3, .55)]],
    [[(.5, 0), (.5, 1)], [(.5, .5), (.85, .15)], [(.5, .5), (.15, .15)]],
    [[(.22, 0), (.78, 1)], [(.78, 0), (.22, 1)]],
    [[(.3, 0), (.3, 1)], [(.7, 0), (.7, 1)], [(.3, .25), (.7, .6)]],
    [[(.5, 0), (.5, 1)], [(.2, .3), (.5, .55), (.8, .3)]],
    [[(.25, 1), (.25, 0), (.75, .5), (.25, 1)]],
    [[(.5, 0), (.5, 1)], [(.5, .3), (.82, .62)], [(.5, .3), (.18, .62)]],
    [[(.3, 0), (.7, .5), (.3, 1)], [(.7, 0), (.3, .5), (.7, 1)]],
    [[(.5, 0), (.2, .25), (.5, .5), (.8, .25), (.5, 0)], [(.5, .5), (.5, 1)]],
]


def rune(F, cx, cy, size, idx, col=PAL['oxblood'], lw=None, layer='I'):
    c = F.I if layer == 'I' else F.P
    lw = lw or max(1.2, size * .09)
    c.set_source_rgba(*col, 1); c.set_line_width(lw)
    for stroke in RUNES[idx % len(RUNES)]:
        c.new_path()
        for k, (px, py) in enumerate(stroke):
            X, Y = cx + (px - .5) * size * .7, cy + (py - .5) * size
            (c.move_to if k == 0 else c.line_to)(X, Y)
        c.stroke()


def draw_cloud_puffs(F, puffs, tone=0.0, outline=INK, lw=2.4, seed=1):
    """flat folk cloud from an explicit list of puffs (x, y, r): ink ring under a cream fill, soft cool belly, painted curls"""
    r = Z(seed + 1000)
    c = F.P
    c.set_source_rgba(*outline, 1)
    for (x, y, rad) in puffs:
        c.new_path(); c.arc(x, y, rad + lw, 0, TAU); c.fill()
    base = mixc(PAL['cream'], (0.6, 0.7, 0.95), tone * .5)
    for (x, y, rad) in puffs:
        c.set_source_rgba(*base, 1); c.new_path(); c.arc(x, y, rad, 0, TAU); c.fill()
    for (x, y, rad) in puffs[::2]:
        c.set_source_rgba(0.40, 0.46, 0.74, .16 + .10 * tone); c.set_line_width(rad * .30)
        c.new_path(); c.arc(x + rad * .04, y + rad * .06, rad * .86, 0.15 * math.pi, 0.85 * math.pi); c.stroke()
    for (x, y, rad) in puffs[::3]:
        a0 = r.uniform(0, TAU)
        c.set_source_rgba(*mixc((0.45, 0.50, 0.75), outline, 0.25), .55); c.set_line_width(lw * .7)
        c.new_path(); c.arc(x, y, rad * .60, a0, a0 + r.uniform(1.3, 2.2)); c.stroke()
