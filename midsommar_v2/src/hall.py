"""Slides 7-10: THE INFINITE HALLWAY - one single one-point-perspective drawing (ink + graphite under gouache).
Vanishing point (8640, 783) sits exactly on cut 8|9.  Corridor cross-section = A-frame triangle (the temple's shape)."""
import math
import numpy as np
import cv2
import cairo
from util import *
from folk import *
from murals import *
from trees import leaf

TAU = 2 * math.pi
F_ = 2200.0                                  # focal length (px)
WC, HC, HE = 6.4, 6.0, 1.6                   # floor width, ridge height, eye height (m): a temple-shaped triangle
AS = 2 * HC / WC
LWALL = math.hypot(WC / 2, HC)
COSP, SINP = (WC / 2) / LWALL, HC / LWALL
S0, RHO, NF = 700.0, 0.82, 28                # portal scale, geometric ratio, number of ribs
HX0, HX1 = 6000, 10800
HW = HX1 - HX0
GOLD = np.array([1.0, 0.89, 0.64], np.float32)
INKB = (0.16, 0.09, 0.07)
R_ = np.random.default_rng


def s_of(k): return S0 * RHO ** k
def jamb_x(y): return VPX + (np.asarray(y, np.float32) - (HZ - S0 * (HC - HE))) / AS      # right edge of the portal rib
def fog_amt(z): return 1 - np.exp(-(np.asarray(z, np.float32) / 46.0) ** 1.12)


def P3(X, Y, Z):
    s = F_ / Z
    return VPX + s * X, HZ - s * (Y - HE)


def hash01(a):
    return (np.sin(a * 12.9898 + 78.233) * 43758.5453) % 1.0


# ----------------------------------------------------------------------------- ray-cast base
def raycast(x0, w):
    xs = (np.arange(x0, x0 + w, dtype=np.float32) + 0.5)[None, :]
    ys = (np.arange(H, dtype=np.float32) + 0.5)[:, None]
    dx = (xs - VPX) / F_; dy = (HZ - ys) / F_
    inf = np.float32(1e9)
    with np.errstate(divide='ignore', invalid='ignore'):
        tf = np.where(dy < -1e-6, HE / (-dy), inf)
        tf = np.where(np.abs(tf * dx) <= WC / 2, tf, inf)
        den = dy - AS * dx
        tl = np.where(den > 1e-6, (HC - HE) / np.maximum(den, 1e-6), inf)
        tl = np.where(((tl * dx) >= -WC / 2) & ((tl * dx) <= 0), tl, inf)
        den = dy + AS * dx
        tr = np.where(den > 1e-6, (HC - HE) / np.maximum(den, 1e-6), inf)
        tr = np.where(((tr * dx) <= WC / 2) & ((tr * dx) >= 0), tr, inf)
    t = np.minimum(np.minimum(tf, tl), tr)
    surf = np.where(t == tf, 0, np.where(t == tl, 1, 2)).astype(np.int8)
    X = t * dx
    return t.astype(np.float32), surf, X.astype(np.float32)


def base_color(x0, w):
    t, surf, X = raycast(x0, w)
    Z = np.minimum(t, 3000.0)
    s = F_ / Z
    out = np.zeros((H, w, 3), np.float32)
    # ---- floor: scrubbed pine boards
    fl = surf == 0
    Xf = np.where(fl, X, 0.0); Zf = np.where(fl, Z, 10.0)
    bw = 0.30
    u = (Xf + WC / 2) / bw; bid = np.floor(u); fu = u - bid
    tone = 0.86 + 0.26 * hash01(bid)
    sf = F_ / Zf
    grain = 0.5 + 0.5 * np.sin(TAU * (Xf * 36.0 + 2.4 * np.sin(Zf * 0.8 + bid * 3.7) + 0.4 * np.sin(Zf * 4.6 + bid)))
    gfade = np.exp(-Zf / 22.0)
    pine = np.array([0.83, 0.66, 0.42], np.float32)
    col = pine[None, None, :] * (tone * (1 - 0.10 * gfade * grain))[..., None]
    col = col * (1 + 0.14 * np.exp(-(Xf / 1.15) ** 2))[..., None]                 # scrubbed-pale walking line
    col = col * (0.93 + 0.12 * (0.5 + 0.5 * np.sin(Xf * 0.9 + 1.3 * np.sin(Zf * 0.21))))[..., None]
    dpx = np.minimum(fu, 1 - fu) * bw * sf
    col = col * (1 - 0.55 * np.clip(1.25 - dpx, 0, 1) * smoothstep(1.5, 5.0, bw * sf))[..., None]                 # board seams
    jz = (Zf + hash01(bid + 5.0) * 2.4) % 2.4
    dj = np.minimum(jz, 2.4 - jz) * (sf * HE / Zf)
    col = col * (1 - 0.40 * np.clip(1.2 - dj, 0, 1) * smoothstep(1.5, 5.0, 2.4 * sf * HE / Zf))[..., None]                   # butt joints
    out = np.where(fl[..., None], col, out)
    # ---- walls: oxblood paint over plank, mottled, seamed
    wl = ~fl
    side = np.where(surf == 1, -1.0, 1.0)
    v = np.where(surf == 1, (X + WC / 2) / COSP, (WC / 2 - X) / COSP)
    Zw = np.where(wl, Z, 10.0)
    mott = 0.5 + 0.25 * np.sin(Zw * 1.9 + 1.7 * np.sin(v * 3.1)) + 0.25 * np.sin(v * 6.3 + Zw * 0.63)
    base = np.array([0.40, 0.088, 0.095], np.float32)
    cw = base[None, None, :] * (1 + 0.40 * (mott - 0.5) * 2 * np.exp(-Zw / 6.0))[..., None]
    vb = v / 0.20; vfr = vb - np.floor(vb)
    sw = F_ / Zw
    dseam = np.minimum(vfr, 1 - vfr) * 0.20 * sw
    cw = cw * (1 - 0.40 * np.clip(1.2 - dseam, 0, 1) * smoothstep(1.5, 5.0, 0.20 * sw))[..., None]
    ao = 0.70 + 0.30 * smoothstep(0.0, 1.4, v)
    cw = cw * ao[..., None]
    cw = cw * (0.86 + 0.34 * np.exp(-((v - 3.0) / 1.5) ** 2))[..., None]
    cw = cw + np.array([0.20, 0.07, 0.01], np.float32) * np.exp(-(v / 0.9) ** 2)[..., None]       # warm floor bounce
    out = np.where(wl[..., None], cw, out)
    return out, Z, surf, v


def wall_proj(side, z0, v_top, scale=U):
    def proj(u, w_):
        z = max(z0 + u / scale, 0.6)
        v = v_top - w_ / scale
        X = -WC / 2 + v * COSP if side < 0 else WC / 2 - v * COSP
        Y = v * SINP
        s = F_ / z
        return VPX + s * X, HZ - s * (Y - HE)
    return proj


# ----------------------------------------------------------------------------- wall decoration
def place(Fk, side, kind, z0, z1, v_lo, v_hi, idx, closed):
    wl = (z1 - z0) * U; hl = (v_hi - v_lo) * U
    pen = Pen(Fk, wall_proj(side, z0, v_hi))
    if kind == 'door':
        doorway_chair(pen, wl, hl)
    elif kind == 'circle':
        rune_circle(pen, wl, hl, idx, closed)
    else:
        MURALS[kind](pen, wl, hl, closed)


LEFT = [(1.7, 2.9, 'circle', 1.15, 2.45), (3.3, 4.8, 'flying', 0.55, 2.95), (5.2, 6.8, 'circle', 1.1, 2.7), (7.2, 9.0, 'bear', 0.6, 3.1),
        (9.5, 11.0, 'circle', 1.2, 2.8), (11.6, 13.6, 'dance', 0.7, 3.2), (14.2, 16.0, 'circle', 1.2, 2.9), (16.6, 18.8, 'sun', 0.8, 3.3)]
RIGHT = [(3.75, 5.45, 'circle', 1.1, 2.9), (5.9, 7.6, 'door', 0.35, 2.75), (8.0, 9.5, 'circle', 1.15, 2.75),
         (10.0, 11.8, 'dance', 0.6, 3.1), (12.2, 14.0, 'bear', 0.7, 3.1), (14.5, 16.0, 'circle', 1.2, 2.8), (16.6, 18.6, 'flying', 0.8, 3.2)]


def far_sequence(z_start, side_closed):
    seq = []
    z = z_start; k = 0
    kinds = ['circle', 'sun', 'circle', 'dance', 'circle', 'bear', 'circle', 'flying']
    while z < 130:
        L = max(1.6, 0.12 * z)
        kind = kinds[k % 8] if L < 2.9 else 'circle'
        seq.append((z, z + L, kind, 0.9, 3.0 if kind != 'circle' else 2.8))
        z += L + max(0.5, 0.05 * z); k += 1
    return seq


def doorway_chair(pen, w, h):
    """A-frame doorway cut into the wall; inside it an empty wooden chair facing the wall (we see its back)"""
    f = [(w * .06, h), (w * .5, h * .02), (w * .94, h)]
    pen.shape(P_poly(f), fill=PAL['pine'], ink=(0.05, 0.03, 0.02), lw=2.4)
    d = [(w * .15, h), (w * .5, h * .14), (w * .85, h)]
    pen.shape(P_poly(d), fill=(0.05, 0.03, 0.025))
    gl = [(w * .20, h), (w * .5, h * .24), (w * .80, h)]
    pen.shape(P_poly(gl), fill=(0.20, 0.12, 0.06), a=0.55)
    cx, cb = w * 0.5, h * 0.97
    cw, ch = w * 0.40, h * 0.60
    wood, wood_d, wood_h = (0.50, 0.33, 0.17), (0.34, 0.21, 0.10), (0.72, 0.50, 0.26)
    for sx in (-1, 1):                                                       # back posts + legs
        pen.shape(P_poly([(cx + sx * cw * .5 - 7, cb - ch * .42), (cx + sx * cw * .5 + 7, cb - ch * .42), (cx + sx * cw * .5 + 7, cb - ch), (cx + sx * cw * .5 - 7, cb - ch)]), fill=wood, ink=INK, lw=1.4)
        pen.shape(P_poly([(cx + sx * cw * .5 - 6, cb), (cx + sx * cw * .5 + 6, cb), (cx + sx * cw * .5 + 6, cb - ch * .42), (cx + sx * cw * .5 - 6, cb - ch * .42)]), fill=wood_d, ink=INK, lw=1.4)
    for j in range(3):                                                       # ladder slats
        yy = cb - ch * (0.62 + 0.13 * j)
        pen.shape(P_poly([(cx - cw * .5, yy), (cx + cw * .5, yy), (cx + cw * .5, yy + ch * .07), (cx - cw * .5, yy + ch * .07)]), fill=wood_h, ink=INK, lw=1.3)
    pen.shape(P_poly([(cx - cw * .56, cb - ch * .42), (cx + cw * .56, cb - ch * .42), (cx + cw * .56, cb - ch * .50), (cx - cw * .56, cb - ch * .50)]), fill=wood_h, ink=INK, lw=1.5)   # seat edge
    F_pen_light = pen.L
    F_pen_light.set_source_rgba(1.0, .8, .45, .20); F_pen_light.new_path(); F_pen_light.move_to(cx - cw, cb); F_pen_light.line_to(cx + cw, cb); F_pen_light.line_to(cx, cb - ch * 1.1); F_pen_light.close_path(); F_pen_light.fill()


def draw_walls(Fk):
    for side, lst, closed, st in ((-1, LEFT, False, 19.4), (1, RIGHT, True, 19.9)):
        for i, (z0, z1, kind, vlo, vhi) in enumerate(lst + far_sequence(st, closed)):
            place(Fk, side, kind, z0, z1, vlo, vhi, i, closed)
    # windows in a row along both walls, between the ribs: framed, with muntins and a soft glow
    for side in (-1, 1):
        for k in range(3, NF - 4):
            za, zb = F_ / s_of(k + 0.12), F_ / s_of(k + 0.88)
            za, zb = min(za, zb), max(za, zb)
            zc = 0.5 * (za + zb); wz = min(0.30 * (zb - za), 0.17 + 0.008 * zc)
            hv = (0.46 + 0.012 * zc)
            pj = wall_proj(side, zc - wz, 3.75)
            ww, hh = 2 * wz * U, hv * U
            q4 = lambda a0, b0, a1, b1: [pj(a0, b0), pj(a1, b0), pj(a1, b1), pj(a0, b1)]
            outer = q4(-0.10 * ww, -0.10 * hh, 1.10 * ww, 1.10 * hh)
            pts = q4(0, 0, ww, hh)
            Fk.P.set_source_rgb(*PAL['pine']); Fk.P.new_path(); Fk.P.move_to(*outer[0]); [Fk.P.line_to(*p) for p in outer[1:]]; Fk.P.close_path(); Fk.P.fill()
            Fk.P.set_source_rgb(1.0, 0.93, 0.70); Fk.P.new_path(); Fk.P.move_to(*pts[0]); [Fk.P.line_to(*p) for p in pts[1:]]; Fk.P.close_path(); Fk.P.fill()
            Fk.I.set_source_rgba(*INKB, .95); Fk.I.set_line_width(1.8)
            for poly in (outer, pts):
                Fk.I.new_path(); Fk.I.move_to(*poly[0]); [Fk.I.line_to(*p) for p in poly[1:]]; Fk.I.close_path(); Fk.I.stroke()
            for (a0, b0, a1, b1) in ((0.5 * ww, 0, 0.5 * ww, hh), (0, 0.5 * hh, ww, 0.5 * hh)):
                p0, p1 = pj(a0, b0), pj(a1, b1)
                Fk.I.new_path(); Fk.I.move_to(*p0); Fk.I.line_to(*p1); Fk.I.stroke()
            cx = sum(p[0] for p in pts) / 4; cy = sum(p[1] for p in pts) / 4
            rr = max(4.0, 1.2 * abs(pts[1][0] - pts[0][0]) + 18)
            g = cairo.RadialGradient(cx, cy, 1, cx, cy, rr)
            g.add_color_stop_rgba(0, 1, .90, .55, .45); g.add_color_stop_rgba(1, 1, .8, .4, 0)
            cl = Fk.L.c if isinstance(Fk.L, PCtx) else Fk.L
            cl.set_source(g); cl.new_path(); cl.arc(cx, cy, rr, 0, TAU); cl.fill()


# ----------------------------------------------------------------------------- ribs, figures, garland ...
def rib_pts(s):
    """outer triangle of rib at scale s, and incenter inset"""
    A = (VPX, HZ - s * (HC - HE)); BL = (VPX - s * WC / 2, HZ + s * HE); BR = (VPX + s * WC / 2, HZ + s * HE)
    return A, BL, BR


def inset(tri, s, q):
    r_in = (WC * HC / 2) / (WC / 2 + math.hypot(WC / 2, HC))
    ic = (VPX, HZ - s * (r_in - HE))
    f = max(0.0, 1 - q / r_in)
    return [(ic[0] + (p[0] - ic[0]) * f, ic[1] + (p[1] - ic[1]) * f) for p in tri]


def draw_rib(ctx, ink, k):
    s = s_of(k); z = F_ / s
    q = 0.20 if k == 0 else 0.040 + 0.04 * 0.55 ** k
    A, BL, BR = rib_pts(s)
    out = [A, BR, BL]
    inn = inset(out, s, q)
    fg = float(fog_amt(z)) * 0.8
    wood = tuple(mixc((0.80, 0.58, 0.28), tuple(GOLD), fg))
    wood_hi = tuple(mixc((0.95, 0.76, 0.42), tuple(GOLD), fg))
    dark = tuple(mixc((0.34, 0.20, 0.09), tuple(GOLD), fg * .9))
    # beam depth: the inner face between this rib's inner edge and the same edge 0.16 m deeper
    s2 = F_ / (z + 0.10)
    A2, BL2, BR2 = rib_pts(s2)
    inn2 = inset([A2, BR2, BL2], s2, q)
    ctx.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
    ctx.new_path(); [ctx.move_to(*out[0]) if i == 0 else ctx.line_to(*p) for i, p in enumerate(out)]; ctx.close_path()
    ctx.move_to(*inn[0]); [ctx.line_to(*p) for p in inn[1:]]; ctx.close_path()
    g = cairo.LinearGradient(VPX - s * WC / 2, 0, VPX + s * WC / 2, 0)
    g.add_color_stop_rgb(0, *wood_hi); g.add_color_stop_rgb(0.5, *wood); g.add_color_stop_rgb(1, *dark)
    ctx.set_source(g); ctx.fill()
    # inner faces (soffit): darker sliver between inner triangle and the deeper one
    ctx.new_path(); [ctx.move_to(*inn[0]) if i == 0 else ctx.line_to(*p) for i, p in enumerate(inn)]; ctx.close_path()
    ctx.move_to(*inn2[0]); [ctx.line_to(*p) for p in inn2[1:]]; ctx.close_path()
    ctx.set_source_rgba(*dark, 0.95); ctx.fill()
    ctx.set_fill_rule(cairo.FILL_RULE_WINDING)
    lw = max(0.9, 0.006 * s * 2.4)
    for poly in (out, inn):
        ink.set_source_rgba(*INKB, 0.95 if k < 18 else 0.6); ink.set_line_width(lw)
        # ruled lines overshoot the corners a little (drafting)
        n = len(poly)
        for i in range(n):
            p, q_ = poly[i], poly[(i + 1) % n]
            dx_, dy_ = q_[0] - p[0], q_[1] - p[1]; L_ = math.hypot(dx_, dy_) + 1e-6
            ov = min(14.0, 0.02 * L_ + 2)
            ink.new_path(); ink.move_to(p[0] - dx_ / L_ * ov, p[1] - dy_ / L_ * ov); ink.line_to(q_[0] + dx_ / L_ * ov, q_[1] + dy_ / L_ * ov); ink.stroke()


def dried_bloom(ctx, x, y, r, col, r_):
    ctx.set_source_rgba(*col, 1)
    for k in range(5):
        a = TAU * k / 5 + r_.uniform(0, 1)
        ctx.new_path(); ctx.save(); ctx.translate(x + math.cos(a) * r * .5, y + math.sin(a) * r * .5); ctx.rotate(a); ctx.scale(r * .55, r * .36); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
    ctx.set_source_rgba(0.45, 0.30, 0.12, 1); ctx.new_path(); ctx.arc(x, y, r * .25, 0, TAU); ctx.fill()


def garland(ctx, zs, ze, v, sag=0.30, hook=2.1, seed=2):
    """dried-flower garland running along the left wall in perspective, sagging between hooks; elements shrink with distance"""
    r_ = R_(seed)
    z = zs
    cols = [(0.74, 0.56, 0.26), (0.70, 0.44, 0.42), (0.86, 0.76, 0.46), (0.52, 0.60, 0.72), (0.42, 0.42, 0.20), (0.62, 0.50, 0.30)]
    items = []
    while z < ze:
        ph = ((z - zs) % hook) / hook
        dy = -sag * 4 * ph * (1 - ph) * (1 + 0.06 * z / 10)                     # catenary-ish dip (y down => minus)
        X = -WC / 2 + v * COSP + 0.16; Y = v * SINP + dy
        x, y = P3(X, Y, z)
        s = F_ / z
        items.append((z, x, y, s))
        z += max(0.045, 0.014 * z)
    for (z, x, y, s) in items:
        fg = float(fog_amt(z)) * .7
        for j in range(2):
            col = cols[r_.integers(len(cols))]
            col = tuple(mixc(col, tuple(GOLD), fg))
            ox, oy = r_.normal(0, 0.05 * s), r_.normal(0, 0.05 * s)
            if r_.random() < .55:
                leaf(ctx, x + ox, y + oy, 0.17 * s * r_.uniform(.7, 1.2), r_.uniform(0, TAU), tuple(mixc((0.26, 0.30, 0.12), tuple(GOLD), fg)))
            else:
                dried_bloom(ctx, x + ox, y + oy, 0.075 * s * r_.uniform(.7, 1.2), col, r_)


def floor_ivy(ctx, zs, ze, seed=3):
    r_ = R_(seed)
    z = zs
    while z < ze:
        X = -WC / 2 + 0.10 + 0.10 * math.sin(z * 1.3) + r_.normal(0, .03)
        x, y = P3(X, 0.02, z); s = F_ / z
        fg = float(fog_amt(z)) * .7
        for j in range(3):
            c_ = tuple(mixc(r_.choice([(0.16, 0.30, 0.10), (0.22, 0.38, 0.12), (0.32, 0.44, 0.14), (0.40, 0.40, 0.14)]), tuple(GOLD), fg))
            leaf(ctx, x + r_.normal(0, .06 * s), y + r_.normal(0, .03 * s), 0.19 * s * r_.uniform(.7, 1.2), r_.uniform(-1.2, 1.2) + r_.choice([0, math.pi]), c_)
        z += max(0.05, 0.017 * z)


def petals(ctx, n=1500, seed=4):
    r_ = R_(seed)
    pts = []
    for i in range(n):
        Z = 6.4 + (80 - 6.4) * r_.uniform(0, 1) ** 1.9
        X = r_.uniform(-2.95, 2.95) * (0.96 if r_.random() < .85 else 0.5)
        pts.append((Z, X))
    for Z, X in sorted(pts, reverse=True):
        x, y = P3(X, 0.0, Z); s = F_ / Z
        wilt = float(smoothstep(8, 55, Z))
        fresh = [(0.98, 0.94, 0.88), (0.96, 0.78, 0.80), (0.98, 0.84, 0.30), (0.62, 0.72, 0.95)][r_.integers(4)]
        dead = (0.52, 0.38, 0.20)
        col = tuple(mixc(fresh, dead, wilt * 0.85))
        col = tuple(mixc(col, tuple(GOLD), float(fog_amt(Z)) * .6))
        rx = 0.055 * s * r_.uniform(.7, 1.3); ry = rx * HE / Z * 1.6 + 0.4
        ctx.save(); ctx.translate(x, y); ctx.rotate(r_.normal(0, .5)); ctx.scale(rx, max(ry, .5))
        ctx.new_path(); ctx.arc(0, 0, 1, 0, TAU); ctx.restore()
        ctx.set_source_rgba(*col, 0.95); ctx.fill()


# ---- people --------------------------------------------------------------------------------------------------
LINEN, LINEN_L, LINEN_S = (0.93, 0.89, 0.80), (1.0, 0.93, 0.78), (0.64, 0.66, 0.76)


def _cr(ctx, pts, closed=True, k=0.5):
    n = len(pts)
    ctx.new_path(); ctx.move_to(*pts[0])
    for i in (range(n) if closed else range(n - 1)):
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[0]
        p1 = pts[i]; p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        ctx.curve_to(p1[0] + (p2[0] - p0[0]) * k / 3 * 2, p1[1] + (p2[1] - p0[1]) * k / 3 * 2, p2[0] - (p3[0] - p1[0]) * k / 3 * 2, p2[1] - (p3[1] - p1[1]) * k / 3 * 2, *p2)
    if closed: ctx.close_path()


def figure(ctx, x, y, s, seed, woman=True, front=False, turned=False, bow=0.0, fogc=0.0):
    """white-linen young person standing with feet at (x,y); scale s px/m; eyes exactly on the horizon (head centre at 1.64 m)."""
    r_ = R_(seed)
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    lw = max(0.8 / s, 0.0065)
    fc = lambda c: tuple(mixc(c, tuple(GOLD), fogc))
    hairs = [(0.80, 0.62, 0.32), (0.56, 0.37, 0.19), (0.31, 0.20, 0.11), (0.88, 0.74, 0.44), (0.42, 0.27, 0.14), (0.66, 0.46, 0.24)]
    hair = hairs[r_.integers(len(hairs))]
    skin = (0.90, 0.72, 0.60)
    # bare feet
    ctx.set_source_rgba(*fc((0.84, 0.68, 0.56)), 1)
    for dxf in (-0.075, 0.075):
        ctx.new_path(); ctx.save(); ctx.translate(dxf, -0.022); ctx.scale(0.058, 0.026); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
    # body: rounded shoulders, A-line dress (women) or tunic + trousers (men)
    if woman:
        pts = [(0, -1.505), (-0.075, -1.49), (-0.175, -1.44), (-0.205, -1.36), (-0.165, -1.22), (-0.125, -1.06), (-0.150, -0.82), (-0.215, -0.50), (-0.315, -0.10),
               (-0.12, -0.075), (0.0, -0.085), (0.12, -0.075), (0.315, -0.10), (0.215, -0.50), (0.150, -0.82), (0.125, -1.06), (0.165, -1.22), (0.205, -1.36), (0.175, -1.44), (0.075, -1.49)]
        _cr(ctx, pts)
    else:
        pts = [(0, -1.505), (-0.085, -1.49), (-0.195, -1.44), (-0.225, -1.34), (-0.19, -1.14), (-0.185, -0.92), (-0.235, -0.68), (-0.175, -0.60), (-0.165, -0.06), (-0.015, -0.055), (-0.01, -0.58),
               (0.01, -0.58), (0.015, -0.055), (0.165, -0.06), (0.175, -0.60), (0.235, -0.68), (0.185, -0.92), (0.19, -1.14), (0.225, -1.34), (0.195, -1.44), (0.085, -1.49)]
        _cr(ctx, pts)
    g = cairo.LinearGradient(-0.32, 0, 0.32, 0)
    g.add_color_stop_rgb(0, *fc((1.0, 0.95, 0.80))); g.add_color_stop_rgb(0.30, *fc(LINEN)); g.add_color_stop_rgb(0.70, *fc((0.82, 0.80, 0.78))); g.add_color_stop_rgb(1, *fc(LINEN_S))
    ctx.set_source(g); ctx.fill_preserve(); ctx.set_source_rgba(*INKB, 0.85); ctx.set_line_width(lw); ctx.stroke()
    for fx in (-0.13, -0.05, 0.03, 0.11):                                       # soft vertical folds, wider toward the hem
        ctx.set_source_rgba(0.42, 0.44, 0.60, 0.20); ctx.set_line_width(lw * 1.7); ctx.new_path(); ctx.move_to(fx * .45, -1.02); ctx.curve_to(fx * .8, -0.7, fx * 1.4, -0.4, fx * 1.9, -0.11); ctx.stroke()
    ctx.set_source_rgba(1.0, 0.93, 0.78, 0.30); ctx.set_line_width(lw * 2.6)           # window light along the left edge
    ctx.new_path(); ctx.move_to(-0.17, -1.38); ctx.curve_to(-0.15, -1.1, -0.2, -0.6, -0.30, -0.12); ctx.stroke()
    # sleeves (soft, to the elbow) and forearms
    for sx in (-1, 1):
        ctx.set_source_rgba(*fc(LINEN if sx < 0 else (0.86, 0.84, 0.82)), 1); ctx.set_line_width(0.085); ctx.new_path(); ctx.move_to(sx * 0.20, -1.40); ctx.curve_to(sx * 0.235, -1.30, sx * 0.245, -1.2, sx * 0.24, -1.13); ctx.stroke()
        ctx.set_source_rgba(*INKB, 0.55); ctx.set_line_width(lw); ctx.new_path(); ctx.move_to(sx * 0.243, -1.40); ctx.curve_to(sx * 0.27, -1.3, sx * 0.285, -1.2, sx * 0.28, -1.13); ctx.stroke()
        ctx.set_source_rgba(*fc(skin), 1); ctx.set_line_width(0.056); ctx.new_path(); ctx.move_to(sx * 0.24, -1.13); ctx.curve_to(sx * 0.235, -1.0, sx * 0.225, -0.9, sx * 0.215, -0.79); ctx.stroke()
        ctx.new_path(); ctx.save(); ctx.translate(sx * 0.215, -0.77); ctx.scale(0.034, 0.045); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
    # neck + head
    ctx.set_source_rgba(*fc((0.84, 0.66, 0.54)), 1); ctx.new_path(); ctx.rectangle(-0.033, -1.52, 0.066, 0.10); ctx.fill()
    hy = -1.64 + bow * 0.07
    ctx.save(); ctx.translate(0.0, hy); ctx.rotate(bow * 0.3); ctx.scale(0.088, 0.112)
    ctx.new_path(); ctx.arc(0, 0, 1, 0, TAU); ctx.restore()
    if front or turned:
        ctx.set_source_rgb(*fc((0.94, 0.77, 0.63))); ctx.fill_preserve()
    else:
        ctx.set_source_rgb(*fc(hair)); ctx.fill_preserve()
    ctx.set_source_rgba(*INKB, 0.8); ctx.set_line_width(lw); ctx.stroke()
    if front or turned:
        ctx.set_source_rgb(*fc(hair)); ctx.new_path(); ctx.move_to(-0.093, hy + 0.025); ctx.curve_to(-0.105, hy - 0.16, 0.105, hy - 0.16, 0.093, hy + 0.025)
        ctx.curve_to(0.06, hy - 0.075, -0.06, hy - 0.075, -0.093, hy + 0.025); ctx.fill()
        for ex in (-0.034, 0.034):
            ctx.set_source_rgba(0.10, 0.06, 0.05, 1); ctx.new_path(); ctx.save(); ctx.translate(ex, hy + 0.012); ctx.scale(0.0115, 0.0075); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
        ctx.set_source_rgba(0.62, 0.22, 0.22, 1); ctx.set_line_width(lw * 1.2)
        ctx.new_path(); ctx.arc(0, hy + 0.042, 0.028, 0.35, 2.78); ctx.stroke()           # calm, even smile
        ctx.set_source_rgba(0.9, 0.5, 0.45, .35); ctx.new_path(); ctx.arc(-0.055, hy + 0.04, 0.02, 0, TAU); ctx.fill(); ctx.new_path(); ctx.arc(0.055, hy + 0.04, 0.02, 0, TAU); ctx.fill()
    else:                                                                    # back of the head: full hair cap + fall
        ctx.set_source_rgb(*fc(hair))
        ctx.new_path(); ctx.save(); ctx.translate(0, hy - 0.012); ctx.scale(0.098, 0.122); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
        if woman:
            ctx.new_path(); ctx.move_to(-0.092, hy); ctx.curve_to(-0.11, hy + 0.20, -0.075, hy + 0.36, -0.035, hy + 0.43); ctx.line_to(0.035, hy + 0.43)
            ctx.curve_to(0.075, hy + 0.36, 0.11, hy + 0.20, 0.092, hy); ctx.close_path(); ctx.fill()
        ctx.set_source_rgba(1, .95, .75, .28); ctx.set_line_width(lw * 3); ctx.new_path(); ctx.move_to(-0.05, hy - 0.08); ctx.curve_to(-0.07, hy + 0.05, -0.06, hy + 0.2, -0.04, hy + (0.38 if woman else 0.08)); ctx.stroke()
        ctx.set_source_rgba(0.18, 0.10, 0.05, .35); ctx.set_line_width(lw); ctx.new_path(); ctx.move_to(0, hy - 0.11); ctx.curve_to(0.012, hy + 0.1, -0.012, hy + 0.3, 0, hy + (0.43 if woman else 0.10)); ctx.stroke()
    # wilting flower crown: drooping blooms + a few petals falling
    for i in range(11):
        a = math.pi * (1.0 + i / 10.0)
        fx, fy = 0.098 * math.cos(a), hy - 0.078 + 0.040 * math.sin(a) - 0.014
        col = fc([(0.93, 0.90, 0.80), (0.84, 0.66, 0.62), (0.80, 0.70, 0.40), (0.66, 0.60, 0.50)][i % 4])
        ctx.set_source_rgba(0.28, 0.32, 0.14, 1); ctx.new_path(); ctx.save(); ctx.translate(fx, fy + 0.014); ctx.scale(0.029, 0.012); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
        ctx.set_source_rgba(*col, 1); ctx.new_path(); ctx.save(); ctx.translate(fx, fy + 0.014 * (i % 3)); ctx.scale(0.020, 0.025); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
    for i in range(3):
        ctx.set_source_rgba(*fc((0.90, 0.84, 0.74)), .8); ctx.new_path(); ctx.save(); ctx.translate(0.10 + 0.04 * i, hy + 0.10 + 0.20 * i); ctx.rotate(i); ctx.scale(0.015, 0.008); ctx.arc(0, 0, 1, 0, TAU); ctx.restore(); ctx.fill()
    ctx.restore()


# ----------------------------------------------------------------------------- lights, lines, Droste doorway
def light_shafts(Ls, Lp):
    """warm dusty shafts from the left windows to the sunlit patches on the right wall; additive"""
    for k in range(3, 12):
        za, zb = F_ / s_of(k + 0.12), F_ / s_of(k + 0.88)
        za, zb = min(za, zb), max(za, zb)
        zc = 0.5 * (za + zb); wz = 0.36 * (zb - za)
        # window corners on the left wall (v 4.35..3.5)
        win = []
        for (zz, vv) in ((zc - wz, 3.5), (zc + wz, 3.5), (zc + wz, 4.35), (zc - wz, 4.35)):
            Xw = -WC / 2 + vv * COSP; Yw = vv * SINP
            win.append((Xw, Yw, zz))
        # shaft direction (sun low at the left, a little ahead): hits right wall
        d = np.array([1.0, -0.55, 0.50]); d = d / np.linalg.norm(d)
        pat = []
        for (Xw, Yw, zz) in win:
            # right wall plane: Y = AS*(WC/2 - X)
            tt = (AS * (WC / 2 - Xw) - Yw) / (d[1] + AS * d[0])
            pat.append((Xw + tt * d[0], Yw + tt * d[1], zz + tt * d[2]))
        pw = [P3(*p) for p in win]; pp = [P3(*p) for p in pat]
        zf = float(fog_amt(zc))
        a_ = 0.22 * (1 - 0.55 * zf)
        # volumetric shaft (translucent gradient)
        hull = cv2.convexHull(np.array(pw + pp, np.float32)).reshape(-1, 2)
        g = cairo.LinearGradient(pw[0][0], pw[0][1], pp[0][0], pp[0][1])
        g.add_color_stop_rgba(0, 1.0, .88, .55, a_ * .62); g.add_color_stop_rgba(0.6, 1.0, .82, .48, a_ * .22); g.add_color_stop_rgba(1, 1.0, .80, .45, a_ * .05)
        Ls.set_source(g); Ls.new_path(); Ls.move_to(*hull[0]); [Ls.line_to(*p) for p in hull[1:]]; Ls.close_path(); Ls.fill()
        # sunlit patch on the right wall: it shows the window's own panes - the dark cross of the muntins - and fades with distance
        def lerp2(A, B, t): return (A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t)
        pa_, pb_, pc_, pd_ = pp[0], pp[1], pp[2], pp[3]
        for rr in range(3):
            for cc in range(2):
                u0, u1 = cc / 2 + 0.035, (cc + 1) / 2 - 0.035
                v0, v1 = rr / 3 + 0.030, (rr + 1) / 3 - 0.030
                def P_(u, v):
                    b = lerp2(pa_, pb_, u); t = lerp2(pd_, pc_, u)
                    return lerp2(b, t, v)
                quad = [P_(u0, v0), P_(u1, v0), P_(u1, v1), P_(u0, v1)]
                Lp.set_source_rgba(1.0, .84, .48, a_ * 1.55); Lp.new_path(); Lp.move_to(*quad[0]); [Lp.line_to(*p) for p in quad[1:]]; Lp.close_path(); Lp.fill()


def graphite(ink_ctx):
    """faint pencil construction: radials from the vanishing point, the horizon, the axis, parallels to the frame edges"""
    r_ = R_(8)
    ink_ctx.set_source_rgba(0.25, 0.26, 0.30, 0.17); ink_ctx.set_line_width(1.0)
    for i in range(110):
        ang = r_.uniform(0, TAU)
        L_ = 5200
        ink_ctx.new_path(); ink_ctx.move_to(VPX, HZ); ink_ctx.line_to(VPX + L_ * math.cos(ang), HZ + L_ * math.sin(ang)); ink_ctx.stroke()
    ink_ctx.set_source_rgba(0.22, 0.24, 0.30, 0.28); ink_ctx.set_line_width(1.2)
    ink_ctx.new_path(); ink_ctx.move_to(HX0 - 100, HZ); ink_ctx.line_to(HX1 + 100, HZ); ink_ctx.stroke()
    ink_ctx.new_path(); ink_ctx.move_to(VPX, -50); ink_ctx.line_to(VPX, H + 50); ink_ctx.stroke()
    for k in range(-12, 13):                                                # parallels to the frame edges
        for sg in (-1, 1):
            x_top = VPX + k * 210
            ink_ctx.set_source_rgba(0.25, 0.26, 0.30, 0.11); ink_ctx.new_path()
            ink_ctx.move_to(x_top, -20); ink_ctx.line_to(x_top + sg * 1000 / AS, 1000); ink_ctx.stroke()
    # small crosshair + tick marks at the vanishing point
    ink_ctx.set_source_rgba(0.20, 0.2, 0.25, 0.55); ink_ctx.set_line_width(1.1)
    for d_ in (-26, 26):
        ink_ctx.new_path(); ink_ctx.move_to(VPX + d_, HZ - 5); ink_ctx.line_to(VPX + d_, HZ + 5); ink_ctx.stroke()


def wall_edge_lines(ink):
    """floor/wall junctions, ridge axis: long ruled ink lines running into the VP"""
    ink.set_source_rgba(*INKB, 0.95); ink.set_line_width(2.8)
    for sg in (-1, 1):
        ink.new_path(); ink.move_to(VPX, HZ)
        ink.line_to(VPX + sg * 3000, HZ + 3000 * (HE / (WC / 2)))
        ink.stroke()
    ink.new_path(); ink.move_to(VPX, HZ); ink.line_to(VPX, -20); ink.stroke()


def droste(ctx, ink, meadow_crop, boat_crop):
    """the glowing open doorway exactly at the vanishing point: inside it, microscopically, the temple again and a lantern on dark water"""
    s = 6.6
    A, BL, BR = rib_pts(s)
    cx, cy = VPX, (A[1] + BL[1]) / 2
    g = cairo.RadialGradient(cx, cy, 1, cx, cy, 90); g.add_color_stop_rgba(0, 1, .96, .78, .85); g.add_color_stop_rgba(1, 1, .86, .5, 0)
    ctx.set_source(g); ctx.new_path(); ctx.arc(cx, cy, 90, 0, TAU); ctx.fill()
    ctx.new_path(); ctx.move_to(*A); ctx.line_to(*BR); ctx.line_to(*BL); ctx.close_path()
    ctx.set_source_rgb(1.0, 0.95, 0.80); ctx.fill_preserve(); ctx.set_source_rgba(*INKB, 1); ctx.set_line_width(1.0); ctx.stroke()
    return A, BL, BR


def edge_board(x0=9840, w=960, ss=2):
    """the far-right board: slide 1's folk world seen from the other side of the loop - the LEFT half of the sun, its
    kurbits orbit, the hills - taken from the very same render (so the seam at x = 10800 -> 0 cannot differ), with a big
    naive maypole-ring medallion painted over the meadow.  Returns (rgb, plywood)."""
    import scene12 as S12
    xs0 = x0 - 10800                                    # the same pixels expressed next to slide 1 (frame x <= 0)
    cx0, cache = cache_load('s12')
    assert cx0 <= xs0, 'scene12 must be rendered from x <= %d' % xs0
    base = cache[:, xs0 - cx0: xs0 - cx0 + w].copy()
    ply = plywood(xs0, 0, w, H, seed=3)
    Fe = Folk(xs0, w, ss)
    pen = Pen(Fe, lambda u, v: (xs0 + 288 + u, 706 + v))
    mural_maypole(pen, 600, 600, medallion=True)       # outer ring ends at frame x = -57: 57 px before the seam
    return S12.composite(Fe, base, ply, seed=11), ply


def render_hall(x0=HX0, w=HW, verbose=True):
    import time
    t0 = time.time()
    base, Z, surf, v = base_color(x0, w)
    # --- painted wall decoration (projective folk art)
    Fk = Folk(x0, w, ss=2)
    draw_walls(Fk)
    garland(Fk.P, 2.0, 46.0, 2.2, seed=2)
    floor_ivy(Fk.P, 2.2, 28.0)
    petals(Fk.P)
    pr, pa = Fk.paint.get(); sr, sa = Fk.shade.get(); ir, ia = Fk.ink.get(); lr, la = Fk.light.get()
    if verbose: print('decor', round(time.time() - t0, 1))
    img = base * (1 - pa[..., None]) + pr
    sc = sr / np.maximum(sa, 1e-4)[..., None]
    img = img * (1 - sa[..., None] + sc * sa[..., None])
    img = img * (1 - ia[..., None]) + ir
    img = 1 - (1 - img) * (1 - np.clip(lr, 0, 1))
    fz = fog_amt(Z)[..., None]
    img = img * (1 - fz * 0.85) + GOLD[None, None, :] * fz * 0.85
    del Fk
    # --- the loop board at the far right (flat painting), clipped by the portal's right jamb
    brd, ply_b = edge_board()
    bx0 = 9840
    yy, xx = np.mgrid[0:H, 0:brd.shape[1]]
    jamb = jamb_x(yy) - 3.0                                   # exactly the portal rib's outer edge
    m = smoothstep(-1.5, 2.5, (xx + bx0) - jamb)
    img[:, bx0 - x0:bx0 - x0 + brd.shape[1]] = img[:, bx0 - x0:bx0 - x0 + brd.shape[1]] * (1 - m[..., None]) + brd * m[..., None]
    board_mask = np.zeros((H, w), np.float32); board_mask[:, bx0 - x0:bx0 - x0 + brd.shape[1]] = m
    if verbose: print('board', round(time.time() - t0, 1))
    # --- ribs + figures, painter's algorithm (far -> near)
    OV = Layer(w, H, x0, 0, ss=2); IK = Layer(w, H, x0, 0, ss=1)
    wall_edge_lines(IK.ctx)
    graphite(IK.ctx)
    gr_, ga_ = IK.get()
    dxg, dyg = wobble_field(x0, 0, w, H, amp=0.8, cell=80, seed=33)
    gr_, ga_ = warp(gr_, dxg, dyg), warp(ga_, dxg, dyg)
    gfade = (1 - smoothstep(10250, 10650, np.arange(x0, x0 + w, dtype=np.float32)))[None, :]      # pencil lines never reach the loop edge
    gr_, ga_ = gr_ * gfade[..., None], ga_ * gfade
    img = img * (1 - ga_[..., None]) + gr_
    items = []
    for k in range(NF):
        items.append((F_ / s_of(k), 'rib', k))
    figs = []
    xs_ = [-1.25, -0.30, -1.35, -0.45, -0.60, -1.45, -0.50, -0.30, -1.15, -0.42, -1.0, -0.30, -0.9, -0.25]
    ss_ = [340 * 0.885 ** i for i in range(14)]
    for i, (s_, X_) in enumerate(zip(ss_, xs_)):
        figs.append(dict(s=s_, X=X_, woman=(i % 3 != 2 or i == 5), turned=(i == 5), bow=(0.35 if i % 4 == 1 and i != 5 else 0.0), seed=100 + i, front=False))
    # a few more standing right of the axis, further down the corridor (slide 9)
    for i, (s_, X_) in enumerate(((118, 0.55), (92, 0.9), (70, 0.45), (54, 0.8))):
        figs.append(dict(s=s_, X=X_, woman=(i % 2 == 0), turned=False, bow=0.2, seed=300 + i, front=False))
    # ring of young people holding hands round nothing
    Zc, Xc, rr = 8.8, 0.62, 0.95
    ring = []
    for i in range(7):
        th = TAU * i / 7 + 0.4
        X_, Z_ = Xc + rr * math.cos(th), Zc + rr * math.sin(th)
        figs.append(dict(s=F_ / Z_, X=X_, woman=(i % 2 == 0), turned=False, bow=0.25, seed=200 + i, front=(math.sin(th) > 0.15), ring=True))
        ring.append((X_, Z_))
    for f in figs:
        items.append((F_ / f['s'], 'fig', f))
    items.sort(key=lambda t: -t[0])
    for z_, kind, d in items:
        if kind == 'rib':
            draw_rib(OV.ctx, OV.ctx, d)
        else:
            x_, y_ = VPX + d['s'] * d['X'], HZ + d['s'] * HE
            figure(OV.ctx, x_, y_, d['s'], d['seed'], d['woman'], d['front'], d['turned'], d['bow'], fogc=float(fog_amt(F_ / d['s'])) * 0.8)
    # hands joined around the ring
    c = OV.ctx
    for i in range(7):
        (Xa, Za), (Xb, Zb) = ring[i], ring[(i + 1) % 7]
        xa, ya = VPX + F_ / Za * Xa, HZ + F_ / Za * (HE - 0.82); xb, yb = VPX + F_ / Zb * Xb, HZ + F_ / Zb * (HE - 0.82)
        c.set_source_rgba(0.86, 0.70, 0.58, 1); c.set_line_width(max(1.5, 0.03 * F_ / Za)); c.new_path(); c.move_to(xa, ya); c.curve_to(xa, ya + 4, xb, yb + 4, xb, yb); c.stroke()
    if verbose: print('figures', round(time.time() - t0, 1))
    orr, oa = OV.get()
    dxo, dyo = wobble_field(x0, 0, w, H, amp=0.55, cell=90, seed=34)
    orr, oa = warp(orr, dxo, dyo), warp(oa, dxo, dyo)
    img = img * (1 - oa[..., None]) + orr
    # --- light: dusty shafts + sunlit patches (screen)
    Ls = Layer(w, H, x0, 0, ss=1); Lp = Layer(w, H, x0, 0, ss=1)
    light_shafts(Ls.ctx, Lp.ctx)
    sr_, sa_ = Ls.get(); pr_, pa_ = Lp.get()
    dust = 0.5 + 0.25 * fbm(x0, 0, w, H, 14, 2, 95, aniso=3.0)
    img = 1 - (1 - img) * (1 - np.clip(sr_ * (0.85 + 0.30 * dust[..., None]), 0, 1))
    img = 1 - (1 - img) * (1 - np.clip(pr_ * 0.9, 0, 1))
    # --- the glowing open doorway exactly on the vanishing point, with the temple + lantern inside it
    img = droste_pixels(img, x0)
    # --- plywood tooth + paper grain (the drawing lives on a board)
    ply = plywood(x0, 0, w, H, seed=5)
    gr = ply / ply.mean((0, 1))
    gr = gr - cv2.GaussianBlur(gr, (0, 0), 25) + 1.0
    img = img * (1 + (gr - 1) * 0.55 * (1 - board_mask)[..., None])      # (the board already carries slide 1's own plywood)
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('hall done', round(time.time() - t0, 1))
    return img


def droste_pixels(img, x0):
    """glowing open doorway exactly on the vanishing point; inside it, microscopically: the yellow temple on its meadow,
    and beside it a speck of lantern light on dark water (the picture contains itself)"""
    s = 6.8
    A, BL, BR = rib_pts(s)
    cx, cy = int(round(VPX - x0)), int(round((A[1] + BL[1]) / 2))
    yy, xx = np.mgrid[cy - 60:cy + 60, cx - 60:cx + 60]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    glow = np.exp(-d2 / (2 * 22.0 ** 2)) * 0.80 + np.exp(-d2 / (2 * 7.0 ** 2)) * 0.45
    reg = img[cy - 60:cy + 60, cx - 60:cx + 60]
    reg[:] = 1 - (1 - reg) * (1 - np.clip(glow[..., None] * np.array([1.0, 0.92, 0.68], np.float32), 0, 1))
    ox, oy = int(VPX - 30), int(A[1] - 8)
    L = Layer(60, 60, ox, oy, ss=10)
    c = L.ctx
    c.new_path(); c.move_to(*A); c.line_to(*BR); c.line_to(*BL); c.close_path(); c.clip_preserve()
    g = cairo.LinearGradient(0, A[1], 0, BL[1]); g.add_color_stop_rgb(0, 0.40, 0.66, 0.80); g.add_color_stop_rgb(0.55, 0.92, 0.88, 0.74); g.add_color_stop_rgb(0.56, 0.48, 0.62, 0.30); g.add_color_stop_rgb(1, 0.36, 0.52, 0.22)
    c.set_source(g); c.fill()
    wdt = BR[0] - BL[0]; hgt = BL[1] - A[1]
    split = BL[0] + wdt * 0.60                                           # right 40 %: night pond
    c.new_path(); c.rectangle(split, A[1] - 2, wdt, hgt + 4); c.set_source_rgb(0.04, 0.09, 0.12); c.fill()
    tx, tb = BL[0] + wdt * 0.29, BL[1] - hgt * 0.08                       # the temple
    c.new_path(); c.move_to(tx, tb - hgt * 0.74); c.line_to(tx + wdt * 0.26, tb); c.line_to(tx - wdt * 0.26, tb); c.close_path(); c.set_source_rgb(0.84, 0.62, 0.26); c.fill()
    c.new_path(); c.move_to(tx, tb - hgt * 0.24); c.line_to(tx + wdt * 0.06, tb); c.line_to(tx - wdt * 0.06, tb); c.close_path(); c.set_source_rgb(0.06, 0.05, 0.06); c.fill()
    for dx_, dy_ in ((-0.10, 0.32), (0.10, 0.32), (0.0, 0.50)):
        c.new_path(); c.arc(tx + wdt * dx_, tb - hgt * dy_, 0.45, 0, TAU); c.set_source_rgb(0.12, 0.09, 0.08); c.fill()
    lx, ly = split + wdt * 0.20, A[1] + hgt * 0.50                       # the lantern speck + its reflection on the water
    rg = cairo.RadialGradient(lx, ly, 0.1, lx, ly, 3.2); rg.add_color_stop_rgba(0, 1, .9, .55, 1); rg.add_color_stop_rgba(1, 1, .7, .3, 0)
    c.set_source(rg); c.new_path(); c.arc(lx, ly, 3.2, 0, TAU); c.fill()
    c.set_source_rgba(1.0, 0.72, 0.30, 0.8); c.set_line_width(0.9); c.new_path(); c.move_to(lx, ly + 1.2); c.line_to(lx, ly + hgt * 0.34); c.stroke()
    c.reset_clip()
    c.new_path(); c.move_to(*A); c.line_to(*BR); c.line_to(*BL); c.close_path(); c.set_source_rgba(*INKB, 1); c.set_line_width(0.9); c.stroke()
    rr, aa = L.get()
    sl = img[oy:oy + 60, ox - x0:ox - x0 + 60]
    img[oy:oy + 60, ox - x0:ox - x0 + 60] = sl * (1 - aa[..., None]) + rr
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_hall()
    print('done', round(time.time() - t, 1))
    cache_save('s7', HX0, img)
    preview(img, WORK + '/hall_full.png', 2400)
    for k in range(4):
        save_png(WORK + f'/hall_slide{7 + k}.png', img[:, 6480 + 1080 * k - HX0: 6480 + 1080 * (k + 1) - HX0])
