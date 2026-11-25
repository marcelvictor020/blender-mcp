"""The overhead ring dance (your reference): concentric rings of white-dressed girls seen from above, hands linked, flower crowns, long shadows
falling down-right across the grass, a garlanded pole with streamers. Painted in gouache + ink so it can hang in the hallway drawing."""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi
SUN_D = np.array([0.60, 0.80], np.float32)           # shadow direction on the ground (down-right)
LIN = (0.96, 0.94, 0.88)
INK = (0.16, 0.10, 0.08)


def grass(w, h, x0=0, seed=3, blades=True):
    n1 = fbm01(x0, 0, w, h, 90, 4, seed)
    n2 = fbm01(x0, 0, w, h, 14, 3, seed + 1)
    n3 = fbm01(x0, 0, w, h, 5, 2, seed + 2, aniso=0.6)
    base = np.array([0.33, 0.41, 0.16], np.float32)
    dry = np.array([0.55, 0.50, 0.24], np.float32)
    k = smoothstep(0.50, 0.85, n1)[..., None]
    col = base * (1 - 0.40 * k) + dry * 0.40 * k
    col = col * (0.82 + 0.30 * n2[..., None]) * (0.92 + 0.14 * n3[..., None])
    yy = np.arange(h, dtype=np.float32)[:, None]; xx = np.arange(w, dtype=np.float32)[None, :]
    stripe = 0.5 + 0.5 * np.sin((xx * 0.55 + yy * 0.40) / 38.0)
    col = col * (0.94 + 0.10 * stripe[..., None])
    if blades:
        br, ba = grass_blades(w, h, seed)
        col = col * (1 - ba[..., None]) + br
    return np.clip(col, 0, 1)


def grass_blades(w, h, seed=3):
    """tens of thousands of single blades laid over the soft lawn tone: dark under-blades, mid greens and a few sun-caught tips, all leaning the same way in the wind"""
    L = Layer(w, h, 0, 0, 1)
    c = L.ctx
    rng = np.random.default_rng(seed + 77)
    n = int(w * h / 34)
    xs = rng.uniform(0, w, n); ys = rng.uniform(0, h, n)
    ang = rng.normal(-2.0, 0.60, n); ln = rng.uniform(5.0, 14.0, n); tone = rng.random(n); wd = 0.8 + 0.9 * rng.random(n)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    for i in range(n):
        t_ = tone[i]
        if t_ < 0.42: c.set_source_rgba(0.09 + 0.10 * t_, 0.19 + 0.12 * t_, 0.05, 0.52)
        elif t_ < 0.86: c.set_source_rgba(0.26 + 0.22 * t_, 0.40 + 0.18 * t_, 0.13, 0.46)
        else: c.set_source_rgba(0.72, 0.76, 0.38, 0.34)
        c.set_line_width(float(wd[i]))
        a = ang[i]; l_ = ln[i]
        c.new_path(); c.move_to(xs[i], ys[i]); c.curve_to(xs[i] + math.cos(a) * l_ * 0.5, ys[i] + math.sin(a) * l_ * 0.5, xs[i] + math.cos(a + 0.35) * l_ * 0.9, ys[i] + math.sin(a + 0.35) * l_ * 0.9, xs[i] + math.cos(a + 0.5) * l_, ys[i] + math.sin(a + 0.5) * l_); c.stroke()
    return L.get()


def flower_scatter(w, h, rng):
    """the lawn seen from above is not bare: poppies, cornflowers, ox-eye daisies, buttercups and clover scattered over it, each with a tiny shadow"""
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    kinds = [((0.86, 0.14, 0.10), (0.10, 0.06, 0.06), 5.6), ((0.30, 0.44, 0.92), (0.22, 0.14, 0.52), 4.4), ((0.98, 0.97, 0.92), (0.96, 0.74, 0.14), 4.8),
             ((0.99, 0.84, 0.14), (0.80, 0.52, 0.06), 4.2), ((0.90, 0.44, 0.66), (0.60, 0.20, 0.40), 4.0)]
    dens = fbm01(0, 0, w, h, 150, 3, int(rng.integers(1, 9999)))
    cand = int(w * h / 4200.0 * 1.9)
    for i in range(cand):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if rng.random() > 0.10 + 0.95 * float(smoothstep(0.38, 0.72, dens[int(min(y, h - 1)), int(min(x, w - 1))])): continue
        col, eye, r = kinds[int(rng.choice(5, p=[0.22, 0.22, 0.26, 0.18, 0.12]))]
        r = r * rng.uniform(0.8, 1.35)
        c.set_source_rgba(0.04, 0.07, 0.02, 0.30); c.new_path(); c.save(); c.translate(x + r * 0.7, y + r * 0.5); c.scale(r * 1.1, r * 0.8); c.arc(0, 0, 1, 0, 2 * math.pi); c.restore(); c.fill()
        n = 5 if col[0] < 0.95 else 11
        for k in range(n):
            a = 2 * math.pi * k / n + x
            c.set_source_rgb(*[v * (0.82 if k % 2 else 1.0) for v in col])
            c.new_path(); c.save(); c.translate(x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55); c.rotate(a); c.scale(r * 0.62, r * (0.34 if n > 5 else 0.5)); c.arc(0, 0, 1, 0, 2 * math.pi); c.restore(); c.fill()
        c.set_source_rgb(*eye); c.new_path(); c.arc(x, y, r * 0.28, 0, 2 * math.pi); c.fill()
    return L.get()


def top_girl(c, x, y, fa, S, dress, hair, rng, nb_hands):
    """one girl seen from above; (x,y) body centre, fa = facing angle (toward the centre of the ring). v axis = facing."""
    fx, fy = math.cos(fa), math.sin(fa)
    tx, ty = -fy, fx
    def P(u, v): return (x + tx * u * S + fx * v * S, y + ty * u * S + fy * v * S)
    # --- flared skirt: soft disc, darker toward the hem, with radial folds
    c.save(); c.translate(*P(0.0, -0.13)); c.rotate(fa); c.scale(0.33 * S, 0.30 * S)
    c.new_path(); c.arc(0, 0, 1, 0, TAU)
    g = cairo.RadialGradient(0.0, 0.25, 0.05, 0.0, 0.0, 1.0)
    g.add_color_stop_rgb(0, *[min(1, v * 1.02) for v in dress]); g.add_color_stop_rgb(0.65, *[v * 0.93 for v in dress]); g.add_color_stop_rgb(1, *[v * 0.70 for v in dress])
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(*INK, 0.50); c.set_line_width(0.05); c.stroke()
    c.restore()
    for k in range(16):
        a = TAU * k / 16 + rng.normal(0, 0.04)
        cx_, cy_ = P(0.0, -0.13)
        c.set_source_rgba(0.40, 0.42, 0.60, 0.24 if k % 2 else 0.10); c.set_line_width(0.011 * S)
        c.new_path(); c.move_to(cx_ + (tx * math.cos(a) + fx * math.sin(a)) * 0.07 * S, cy_ + (ty * math.cos(a) + fy * math.sin(a)) * 0.07 * S)
        c.line_to(cx_ + (tx * math.cos(a) * 0.33 + fx * math.sin(a) * 0.30) * S, cy_ + (ty * math.cos(a) * 0.33 + fy * math.sin(a) * 0.30) * S); c.stroke()
    # --- braid / long hair down the back, over the dress
    hb = P(0.0, 0.10); he = P(0.0, -0.36)
    g2 = cairo.LinearGradient(hb[0], hb[1], he[0], he[1]); g2.add_color_stop_rgb(0, *[min(1, v * 1.05) for v in hair]); g2.add_color_stop_rgb(1, *[v * 0.62 for v in hair])
    c.set_source(g2); c.set_line_width(0.085 * S); c.new_path(); c.move_to(*hb); c.line_to(*he); c.stroke()
    c.set_source_rgba(*[v * 0.45 for v in hair], 0.7); c.set_line_width(0.010 * S)
    for k in range(6):
        t0 = 0.05 + 0.15 * k
        c.new_path(); c.move_to(*P(-0.04, 0.10 - t0 * 0.46)); c.line_to(*P(0.04, 0.10 - (t0 + 0.08) * 0.46)); c.stroke()
    # --- shoulders (ellipse) + puffed sleeves
    c.save(); c.translate(*P(0.0, 0.10)); c.rotate(fa + math.pi / 2); c.scale(0.12 * S, 0.27 * S)
    c.new_path(); c.arc(0, 0, 1, 0, TAU)
    g3 = cairo.LinearGradient(-1, 0, 1, 0); g3.add_color_stop_rgb(0, *[min(1, v * 1.02) for v in dress]); g3.add_color_stop_rgb(1, *[v * 0.84 for v in dress])
    c.set_source(g3); c.fill_preserve(); c.set_source_rgba(*INK, 0.45); c.set_line_width(0.05); c.stroke(); c.restore()
    for sx in (-1, 1):
        sp = P(sx * 0.255, 0.10)
        g4 = cairo.RadialGradient(sp[0] - 2, sp[1] - 2, 1, sp[0], sp[1], 0.11 * S)
        g4.add_color_stop_rgb(0, *[min(1, v * 1.04) for v in dress]); g4.add_color_stop_rgb(1, *[v * 0.78 for v in dress])
        c.set_source(g4); c.new_path(); c.arc(sp[0], sp[1], 0.108 * S, 0, TAU); c.fill_preserve()
        c.set_source_rgba(*INK, 0.5); c.set_line_width(0.012 * S); c.stroke()
        c.set_source_rgba(0.45, 0.46, 0.64, 0.30); c.set_line_width(0.012 * S)                            # elastic cuff line
        c.new_path(); c.arc(sp[0], sp[1], 0.075 * S, 0, TAU); c.stroke()
    # --- head from above: hair dome (centre parting), crown = ring of leaves + flowers
    hp = P(0.0, 0.17)
    r_h = 0.125 * S
    c.set_source_rgba(0.14, 0.28, 0.10, 1)
    for k in range(12):                                                                                 # leaf ring
        a = TAU * k / 12 + 0.2
        lx, ly = hp[0] + math.cos(a) * r_h * 1.02, hp[1] + math.sin(a) * r_h * 1.02
        c.save(); c.translate(lx, ly); c.rotate(a); c.scale(0.062 * S, 0.026 * S); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore()
        c.set_source_rgb(0.16 + 0.10 * (k % 2), 0.32 + 0.10 * (k % 3) / 2, 0.11); c.fill()
    g5 = cairo.RadialGradient(hp[0] - r_h * 0.35, hp[1] - r_h * 0.35, 1, hp[0], hp[1], r_h)
    g5.add_color_stop_rgb(0, *[min(1, v * 1.30 + 0.05) for v in hair]); g5.add_color_stop_rgb(0.6, *hair); g5.add_color_stop_rgb(1, *[v * 0.62 for v in hair])
    c.set_source(g5); c.new_path(); c.arc(hp[0], hp[1], r_h * 0.92, 0, TAU); c.fill_preserve(); c.set_source_rgba(*INK, 0.5); c.set_line_width(0.010 * S); c.stroke()
    c.set_source_rgba(*[v * 0.50 for v in hair], 0.75); c.set_line_width(0.008 * S)
    c.new_path(); c.move_to(*hp); c.line_to(hp[0] + fx * r_h * 0.88, hp[1] + fy * r_h * 0.88); c.stroke()
    for k in range(8):                                                                                  # hair strands from the parting
        for sg in (-1, 1):
            a = fa + sg * (0.35 + 0.28 * k / 8)
            c.new_path(); c.move_to(hp[0] + math.cos(a) * r_h * 0.2, hp[1] + math.sin(a) * r_h * 0.2)
            c.curve_to(hp[0] + math.cos(a + sg * 0.5) * r_h * 0.6, hp[1] + math.sin(a + sg * 0.5) * r_h * 0.6, hp[0] + math.cos(a + sg * 0.9) * r_h * 0.85, hp[1] + math.sin(a + sg * 0.9) * r_h * 0.85, hp[0] + math.cos(a + sg * 1.5) * r_h * 0.9, hp[1] + math.sin(a + sg * 1.5) * r_h * 0.9); c.stroke()
    for k in range(9):
        a = TAU * k / 9 + 0.35 + rng.uniform(-0.08, 0.08)
        px, py = hp[0] + math.cos(a) * r_h * 1.00, hp[1] + math.sin(a) * r_h * 1.00
        col = [(0.97, 0.95, 0.90), (0.72, 0.80, 0.97), (0.98, 0.84, 0.30), (0.96, 0.72, 0.78), (0.97, 0.95, 0.90), (0.90, 0.50, 0.55)][k % 6]
        for p in range(5):
            b = TAU * p / 5 + k
            c.set_source_rgb(*col); c.new_path(); c.arc(px + math.cos(b) * 0.020 * S, py + math.sin(b) * 0.020 * S, 0.020 * S, 0, TAU); c.fill()
        c.set_source_rgb(0.96, 0.70, 0.16); c.new_path(); c.arc(px, py, 0.011 * S, 0, TAU); c.fill()
    return None


def shadow_layer(w, h, items, S, d=None, lenk=1.0, contact=True):
    """figure-shaped long shadows (skirt band, torso band, head blob at the far end, thin arm shadows) along direction d (default: the sun's, down-right);
    plus a soft contact shade round each hem so that they stand ON the grass"""
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    c.set_source_rgba(0, 0, 0, 1)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    d = SUN_D if d is None else np.asarray(d, np.float32)
    for (x, y, fa) in items:
        tx, ty = -math.sin(fa), math.cos(fa)
        c.set_line_width(0.58 * S); c.new_path(); c.move_to(x, y); c.line_to(x + d[0] * 1.25 * S * lenk, y + d[1] * 1.25 * S * lenk); c.stroke()
        c.set_line_width(0.30 * S); c.new_path(); c.move_to(x + d[0] * 1.0 * S * lenk, y + d[1] * 1.0 * S * lenk); c.line_to(x + d[0] * 1.95 * S * lenk, y + d[1] * 1.95 * S * lenk); c.stroke()
        c.new_path(); c.arc(x + d[0] * 2.30 * S * lenk, y + d[1] * 2.30 * S * lenk, 0.135 * S, 0, TAU); c.fill()
        for sx in (-1, 1):
            c.set_line_width(0.07 * S); c.new_path(); c.move_to(x + tx * sx * 0.28 * S + d[0] * 1.5 * S * lenk, y + ty * sx * 0.28 * S + d[1] * 1.5 * S * lenk)
            c.line_to(x + tx * sx * 0.50 * S + d[0] * 1.8 * S * lenk, y + ty * sx * 0.50 * S + d[1] * 1.8 * S * lenk); c.stroke()
    _, a = L.get()
    out = cv2.GaussianBlur(a, (0, 0), 0.045 * S + 1.0)
    if contact:
        Lc = Layer(w, h, 0, 0, 1)
        cc = Lc.ctx; cc.set_source_rgba(0, 0, 0, 1)
        for (x, y, fa) in items:
            cc.new_path(); cc.arc(x, y, 0.50 * S, 0, TAU); cc.fill()
        _, ac = Lc.get()
        out = np.maximum(out, 0.55 * cv2.GaussianBlur(ac, (0, 0), 0.07 * S + 1.0))
    return out


def pole_painting(c, p0, p1, w0, w1, rng, S, hands=None):
    """the maypole seen from directly above, so that it leans away from us toward p1 (its top, nearer the camera): a tapered painted pole with a lit and a
    shaded flank, a spiral garland of leaves and flowers wound round it, a crossbar with its two hoops, and ten silk ribbons that run from its top down
    to the dancers' clasped hands (hands = [(x, y), ...])"""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    # ---- the ribbons first (they hang from the top and fall away from it, so they lie *under* the pole's head but over the grass and shoulders)
    rib_cols = [((0.70, 0.12, 0.16), (0.44, 0.07, 0.10)), ((0.98, 0.80, 0.26), (0.78, 0.56, 0.12)), ((0.30, 0.48, 0.86), (0.18, 0.30, 0.58)),
                ((0.97, 0.94, 0.86), (0.78, 0.74, 0.64)), ((0.32, 0.58, 0.30), (0.20, 0.38, 0.19)), ((0.88, 0.40, 0.46), (0.62, 0.22, 0.30))]
    if hands:
        picks = [hands[int(k * len(hands) / 10.0) % len(hands)] for k in range(10)]
        for k, (hx_, hy_) in enumerate(picks):
            fcol, bcol = rib_cols[k % len(rib_cols)]
            sx0, sy0 = p1[0] - ux * 6 + nx * (k - 4.5) * 2.0, p1[1] - uy * 6 + ny * (k - 4.5) * 2.0
            mx_, my_ = (sx0 + hx_) / 2 + (hy_ - sy0) * 0.06, (sy0 + hy_) / 2 - (hx_ - sx0) * 0.06 + 18
            n = 60
            pts = []
            for q in range(n + 1):
                t = q / n
                x = (1 - t) ** 2 * sx0 + 2 * (1 - t) * t * mx_ + t * t * hx_
                y = (1 - t) ** 2 * sy0 + 2 * (1 - t) * t * my_ + t * t * hy_
                pts.append((x, y))
            hw = 8.6
            for q in range(n):
                tq = q / n
                twist = math.cos(tq * 9.0 + k * 1.3)
                w_ = hw * (0.30 + 0.70 * abs(twist)) * (0.7 + 0.3 * tq)
                a_, b_ = pts[q], pts[q + 1]
                tx, ty = b_[0] - a_[0], b_[1] - a_[1]
                tl = math.hypot(tx, ty) + 1e-6
                tnx, tny = -ty / tl * w_, tx / tl * w_
                col = fcol if twist > 0 else bcol
                c.set_source_rgba(*col, 0.96); c.new_path(); c.move_to(a_[0] + tnx, a_[1] + tny); c.line_to(b_[0] + tnx, b_[1] + tny); c.line_to(b_[0] - tnx, b_[1] - tny); c.line_to(a_[0] - tnx, a_[1] - tny); c.close_path(); c.fill()
            c.set_source_rgba(0.12, 0.08, 0.06, 0.55); c.set_line_width(0.8); c.new_path(); c.move_to(*pts[0]); [c.line_to(*p) for p in pts[1:]]; c.stroke()
    # ---- the pole: tapered bark with a lit flank (left) and a shaded flank
    q0 = (p0[0] + nx * w0 * 0.30, p0[1] + ny * w0 * 0.30); q1 = (p0[0] - nx * w0 * 0.30, p0[1] - ny * w0 * 0.30)
    q2 = (p1[0] - nx * w1 * 0.34, p1[1] - ny * w1 * 0.34); q3 = (p1[0] + nx * w1 * 0.34, p1[1] + ny * w1 * 0.34)
    g = cairo.LinearGradient(p0[0] + nx * w0 * 0.3, p0[1] + ny * w0 * 0.3, p0[0] - nx * w0 * 0.3, p0[1] - ny * w0 * 0.3)
    g.add_color_stop_rgb(0, 0.80, 0.62, 0.36); g.add_color_stop_rgb(0.45, 0.52, 0.36, 0.20); g.add_color_stop_rgb(1, 0.20, 0.13, 0.07)
    c.set_source(g); c.new_path(); c.move_to(*q0); c.line_to(*q3); c.line_to(*q2); c.line_to(*q1); c.close_path(); c.fill()
    c.set_source_rgba(0.10, 0.06, 0.03, 0.7); c.set_line_width(1.2); c.new_path(); c.move_to(*q0); c.line_to(*q3); c.line_to(*q2); c.line_to(*q1); c.close_path(); c.stroke()
    # ---- spiral garland: leaves lit like the trees (gold on the sun side), flowers, a vine
    turns = 7.0
    n = int(L / 2.6)
    prev = None
    for i in range(n + 1):
        t = i / n
        ph = t * turns * TAU
        wd = (w0 * (1 - t) + w1 * t) * 0.5
        off = math.sin(ph) * wd * 0.92
        x, y = p0[0] + dx * t + nx * off, p0[1] + dy * t + ny * off
        front = math.cos(ph) > -0.1                                              # the garland passes behind the pole half the time
        if prev is not None and front:
            c.set_source_rgba(0.12, 0.20, 0.07, 1); c.set_line_width(max(1.6, wd * 0.10)); c.new_path(); c.move_to(*prev); c.line_to(x, y); c.stroke()
        prev = (x, y) if front else None
        if not front: continue
        lit = 0.5 - 0.5 * math.sin(ph)
        for kk in range(2):
            a = math.atan2(uy, ux) + math.sin(ph) * 1.2 + (kk * 2 - 1) * rng.uniform(0.6, 1.4)
            size = rng.uniform(0.55, 1.05) * wd * 0.85
            col = (0.10 + 0.20 * rng.random() + 0.26 * lit, 0.26 + 0.20 * rng.random() + 0.22 * lit, 0.08 + 0.05 * rng.random())
            c.save(); c.translate(x, y); c.rotate(a); c.scale(size, size * 0.40); c.new_path(); c.arc(0.5, 0, 1, 0, TAU); c.restore()
            c.set_source_rgb(*[min(1, v) for v in col]); c.fill_preserve(); c.set_source_rgba(0.05, 0.10, 0.03, 0.5); c.set_line_width(0.6); c.stroke()
        if i % 5 == 0:
            col = [(0.97, 0.95, 0.88), (0.95, 0.78, 0.30), (0.92, 0.52, 0.58), (0.74, 0.80, 0.96), (0.70, 0.18, 0.22)][int(rng.integers(5))]
            r_ = wd * 0.17
            for p in range(5):
                b_ = TAU * p / 5 + t * 9
                c.set_source_rgb(*col); c.new_path(); c.arc(x + math.cos(b_) * r_, y + math.sin(b_) * r_, r_ * 0.95, 0, TAU); c.fill()
            c.set_source_rgb(0.96, 0.70, 0.16); c.new_path(); c.arc(x, y, r_ * 0.55, 0, TAU); c.fill()
    # ---- the crossbar near the top with two hanging hoops (a floral wreath each), seen from above
    bt = 0.80
    bx, by = p0[0] + dx * bt, p0[1] + dy * bt
    bw = 0.16 * L
    c.set_source_rgb(0.40, 0.28, 0.15); c.set_line_width(w1 * 0.20); c.new_path(); c.move_to(bx - nx * bw, by - ny * bw); c.line_to(bx + nx * bw, by + ny * bw); c.stroke()
    for sgn in (-1, 1):
        hx0, hy0 = bx + sgn * nx * bw, by + sgn * ny * bw
        rr = 0.060 * L
        c.set_source_rgb(0.14, 0.26, 0.10); c.set_line_width(rr * 0.34); c.new_path(); c.arc(hx0, hy0, rr, 0, TAU); c.stroke()
        for q in range(18):
            a_ = TAU * q / 18
            col = [(0.97, 0.95, 0.88), (0.95, 0.78, 0.30), (0.92, 0.52, 0.58)][q % 3]
            c.set_source_rgb(*col); c.new_path(); c.arc(hx0 + math.cos(a_) * rr, hy0 + math.sin(a_) * rr, rr * 0.20, 0, TAU); c.fill()
    # ---- the crown on the head of the pole
    c.set_source_rgb(0.14, 0.26, 0.10); c.new_path(); c.arc(p1[0], p1[1], w1 * 0.55, 0, TAU); c.fill()
    for q in range(14):
        a_ = TAU * q / 14
        c.set_source_rgb(*[(0.97, 0.95, 0.88), (0.95, 0.78, 0.30), (0.92, 0.52, 0.58), (0.70, 0.18, 0.22)][q % 4]); c.new_path(); c.arc(p1[0] + math.cos(a_) * w1 * 0.50, p1[1] + math.sin(a_) * w1 * 0.50, w1 * 0.13, 0, TAU); c.fill()
    c.set_source_rgb(0.98, 0.84, 0.36); c.new_path(); c.arc(p1[0], p1[1], w1 * 0.22, 0, TAU); c.fill()


def spiral_path(cx, cy, r_out, r_in, turns, th0, squash=0.92):
    th = np.linspace(th0, th0 + TAU * turns, 8000)
    r = r_out + (r_in - r_out) * (th - th[0]) / (th[-1] - th[0])
    X = cx + r * np.cos(th); Y = cy + r * np.sin(th) * squash
    return th, X, Y


def paste_rot(img, sp, x, y, r_vec, f_vec):
    """composite a top-view sprite (its +x = the person's right, its up = the way she faces) at (x, y), rotated so that she faces f_vec"""
    rgbp, a = sp['rgb'], sp['a']
    Hs, Ws = a.shape
    ox, oy = sp['anchor']
    M = np.array([[r_vec[0], -f_vec[0], x - r_vec[0] * ox + f_vec[0] * oy], [r_vec[1], -f_vec[1], y - r_vec[1] * ox + f_vec[1] * oy]], np.float32)
    cs = np.array([[0, 0, 1], [Ws, 0, 1], [0, Hs, 1], [Ws, Hs, 1]], np.float32) @ M.T
    H_, W_ = img.shape[:2]
    x0, x1 = max(0, int(np.floor(cs[:, 0].min())) - 2), min(W_, int(np.ceil(cs[:, 0].max())) + 2)
    y0, y1 = max(0, int(np.floor(cs[:, 1].min())) - 2), min(H_, int(np.ceil(cs[:, 1].max())) + 2)
    if x1 <= x0 or y1 <= y0: return
    M2 = M.copy(); M2[0, 2] -= x0; M2[1, 2] -= y0
    src = np.dstack([rgbp, a]).astype(np.float32)
    wp = cv2.warpAffine(src, M2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - wp[..., 3:4]) + wp[..., :3]



def _flower_head(c, x, y, r, col, eye, n=5):
    for k in range(n):
        a = TAU * k / n + x * 0.37
        c.set_source_rgb(*[v * (0.84 if k % 2 else 1.0) for v in col])
        c.new_path(); c.save(); c.translate(x + math.cos(a) * r * 0.52, y + math.sin(a) * r * 0.52); c.rotate(a); c.scale(r * 0.62, r * (0.36 if n > 5 else 0.52)); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    c.set_source_rgb(*eye); c.new_path(); c.arc(x, y, r * 0.27, 0, TAU); c.fill()


def feast_table(w, h, c0, ang, Lt, Wt, rng, shadow_dirs=((None, 0.62),)):
    """THE FEAST, laid and waiting: one long table seen from above - white cloth with a red-and-blue folk border, a place for twenty-two (plate, glass, folded napkin,
    a little posy), a runner of leaves and wildflowers with bread, bowls of strawberries, jugs and candles, a plank bench each side. Nobody is sitting down yet.
    Returns (rgb, a, [shadow per light direction], [candle positions]) over the (w, h) canvas."""
    Lp = Layer(w, h, 0, 0, 2); c = Lp.ctx
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda s_, t_: (c0[0] + ca * s_ - sa * t_, c0[1] + sa * s_ + ca * t_)
    candles = []

    def rect_poly(cc, s0, s1, t0, t1, off=(0.0, 0.0)):
        pts = [T(s0, t0), T(s1, t0), T(s1, t1), T(s0, t1)]
        cc.new_path(); cc.move_to(pts[0][0] + off[0], pts[0][1] + off[1])
        for p in pts[1:]: cc.line_to(p[0] + off[0], p[1] + off[1])
        cc.close_path()

    # ---- shadows (swept footprints), table + benches, one map per light direction (the low sun, the moon)
    shs = []
    for dvec, lk in shadow_dirs:
        Ls = Layer(w, h, 0, 0, 2); cs = Ls.ctx
        Dsh = (SUN_D if dvec is None else np.asarray(dvec, np.float32)) * lk * Wt             # a table-top's shadow is as long as the table is high (about 0.75 m)
        cs.set_source_rgba(0, 0, 0, 1)
        for k in range(14):
            f = k / 13.0
            rect_poly(cs, -Lt / 2, Lt / 2, -Wt / 2, Wt / 2, (Dsh[0] * f, Dsh[1] * f)); cs.fill()
        for sd in (-1, 1):
            t0, t1 = sd * (Wt * 0.5 + 0.12 * Wt) - 0.16 * Wt, sd * (Wt * 0.5 + 0.12 * Wt) + 0.16 * Wt
            for k in range(8):
                f = k / 7.0 * 0.58
                rect_poly(cs, -Lt * 0.47, Lt * 0.47, min(t0, t1), max(t0, t1), (Dsh[0] * f, Dsh[1] * f)); cs.fill()
        _, sh_ = Ls.get()
        shs.append(cv2.GaussianBlur(sh_, (0, 0), 0.055 * Wt + 1.0))

    # ---- benches
    for sd in (-1, 1):
        tc = sd * (Wt * 0.5 + 0.12 * Wt)
        rect_poly(c, -Lt * 0.47, Lt * 0.47, tc - 0.16 * Wt, tc + 0.16 * Wt)
        g = cairo.LinearGradient(*T(0, tc - 0.16 * Wt), *T(0, tc + 0.16 * Wt)); g.add_color_stop_rgb(0, 0.76, 0.58, 0.36); g.add_color_stop_rgb(1, 0.60, 0.44, 0.26)
        c.set_source(g); c.fill_preserve(); c.set_source_rgba(*INK, 0.55); c.set_line_width(0.8); c.stroke()
        c.set_source_rgba(0.34, 0.22, 0.12, 0.42); c.set_line_width(0.6)
        for k in range(int(Lt * 0.94 / 74)):                                                  # plank seams
            s_ = -Lt * 0.47 + k * 74.0 + rng.uniform(-5, 5)
            c.new_path(); c.move_to(*T(s_, tc - 0.16 * Wt)); c.line_to(*T(s_, tc + 0.16 * Wt)); c.stroke()
        c.set_source_rgba(0.40, 0.28, 0.16, 0.30)
        for k in range(26):                                                                     # grain
            s_ = rng.uniform(-Lt * 0.46, Lt * 0.40); t_ = tc + rng.uniform(-0.13, 0.13) * Wt
            c.new_path(); c.move_to(*T(s_, t_)); c.line_to(*T(s_ + rng.uniform(30, 90), t_ + rng.normal(0, 0.8))); c.stroke()

    # ---- the cloth
    rect_poly(c, -Lt / 2, Lt / 2, -Wt / 2, Wt / 2)
    g = cairo.LinearGradient(*T(0, -Wt / 2), *T(0, Wt / 2)); g.add_color_stop_rgb(0, 0.97, 0.96, 0.92); g.add_color_stop_rgb(1, 0.90, 0.89, 0.85)
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(*INK, 0.60); c.set_line_width(1.0); c.stroke()
    for sd in (-1, 1):                                                                           # the border: a red band, a blue line with white dots, red zigzag
        tb = sd * Wt * 0.455
        c.set_source_rgba(0.72, 0.15, 0.17, 0.96); c.set_line_width(0.040 * Wt)
        c.new_path(); c.move_to(*T(-Lt / 2 + 6, tb)); c.line_to(*T(Lt / 2 - 6, tb)); c.stroke()
        c.set_source_rgba(0.22, 0.38, 0.72, 0.96); c.set_line_width(0.014 * Wt)
        c.new_path(); c.move_to(*T(-Lt / 2 + 6, tb - sd * 0.040 * Wt)); c.line_to(*T(Lt / 2 - 6, tb - sd * 0.040 * Wt)); c.stroke()
        step = 0.052 * Wt; n_ = int((Lt - 12) / step)
        c.set_source_rgba(0.72, 0.15, 0.17, 0.96); c.set_line_width(0.010 * Wt)
        c.new_path(); c.move_to(*T(-Lt / 2 + 6, tb - sd * 0.075 * Wt))
        for k in range(n_ + 1):
            c.line_to(*T(-Lt / 2 + 6 + k * step, tb - sd * (0.075 + 0.020 * (k % 2)) * Wt))
        c.stroke()
        c.set_source_rgba(0.98, 0.97, 0.94, 0.95)
        for k in range(n_):
            x_, y_ = T(-Lt / 2 + 6 + (k + 0.5) * step, tb); c.new_path(); c.arc(x_, y_, 0.0075 * Wt, 0, TAU); c.fill()
    c.set_source_rgba(0.55, 0.55, 0.62, 0.10)                                                  # linen weave and a few soft creases from the folding
    for k in range(9):
        s_ = -Lt / 2 + (k + 0.5) * Lt / 9 + rng.normal(0, 8)
        c.set_line_width(2.4); c.new_path(); c.move_to(*T(s_, -Wt / 2)); c.line_to(*T(s_ + rng.normal(0, 3), Wt / 2)); c.stroke()

    def drop(x, y, r, a=0.30):
        c.set_source_rgba(0.25, 0.22, 0.20, a); c.new_path(); c.save(); c.translate(x + SUN_D[0] * r * 0.35, y + SUN_D[1] * r * 0.35); c.scale(r * 1.05, r * 0.95); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()

    # ---- the places
    n_ps = 11
    napk = [(0.30, 0.44, 0.80), (0.72, 0.16, 0.18)]
    for k in range(n_ps):
        s_ = -Lt / 2 + 0.085 * Lt + k * (0.83 * Lt / (n_ps - 1))
        for sd in (-1, 1):
            px, py = T(s_, sd * Wt * 0.285)
            rp = 0.112 * Wt
            nx_, ny_ = T(s_ - 0.105 * Wt, sd * Wt * 0.285)
            c.save(); c.translate(nx_, ny_); c.rotate(ang + rng.normal(0, 0.06)); col = napk[(k + (sd > 0)) % 2]
            c.new_path(); c.rectangle(-0.030 * Wt, -0.065 * Wt, 0.060 * Wt, 0.130 * Wt); c.restore()
            c.set_source_rgb(*col); c.fill_preserve(); c.set_source_rgba(*INK, 0.40); c.set_line_width(0.5); c.stroke()
            drop(px, py, rp, 0.30)
            c.set_source_rgb(0.93, 0.92, 0.88); c.new_path(); c.arc(px, py, rp, 0, TAU); c.fill_preserve(); c.set_source_rgba(*INK, 0.40); c.set_line_width(0.6); c.stroke()
            gp = cairo.RadialGradient(px - rp * 0.3, py - rp * 0.3, 1, px, py, rp * 0.78); gp.add_color_stop_rgb(0, 0.99, 0.99, 0.97); gp.add_color_stop_rgb(1, 0.90, 0.89, 0.86)
            c.set_source(gp); c.new_path(); c.arc(px, py, rp * 0.74, 0, TAU); c.fill()
            c.set_source_rgba(0.40, 0.52, 0.80, 0.75); c.set_line_width(0.9); c.new_path(); c.arc(px, py, rp * 0.86, 0, TAU); c.stroke()
            gx_, gy_ = T(s_ + 0.085 * Wt, sd * Wt * 0.42)                                        # the glass
            drop(gx_, gy_, 0.034 * Wt, 0.22)
            c.set_source_rgba(0.70, 0.82, 0.96, 0.60); c.new_path(); c.arc(gx_, gy_, 0.034 * Wt, 0, TAU); c.fill_preserve(); c.set_source_rgba(0.40, 0.50, 0.66, 0.8); c.set_line_width(0.6); c.stroke()
            c.set_source_rgba(1, 1, 1, 0.9); c.new_path(); c.arc(gx_ - 0.010 * Wt, gy_ - 0.010 * Wt, 0.009 * Wt, 0, TAU); c.fill()
            cx2, cy2 = T(s_ + 0.150 * Wt, sd * Wt * 0.285)                                      # cutlery
            c.set_source_rgba(0.66, 0.68, 0.72, 0.95); c.set_line_width(1.2)
            for dd in (-0.020, 0.020):
                c.new_path(); c.move_to(*T(s_ + 0.135 * Wt, sd * Wt * 0.285 + dd * Wt)); c.line_to(*T(s_ + 0.215 * Wt, sd * Wt * 0.285 + dd * Wt)); c.stroke()
            qx, qy = T(s_ - 0.030 * Wt, sd * Wt * 0.145)                                        # a posy of three flowers on the cloth by each plate
            for j, (col2, eye2) in enumerate((((0.98, 0.97, 0.92), (0.96, 0.74, 0.14)), ((0.30, 0.44, 0.92), (0.22, 0.14, 0.52)), ((0.86, 0.14, 0.10), (0.10, 0.06, 0.06)))):
                _flower_head(c, qx + (j - 1) * 0.026 * Wt, qy + (0.010 if j == 1 else -0.006) * Wt, 0.030 * Wt, col2, eye2)

    # ---- the runner down the middle
    for k in range(330):                                                                         # leaves
        s_ = rng.uniform(-Lt / 2 + 0.03 * Lt, Lt / 2 - 0.03 * Lt); t_ = rng.normal(0, 0.075 * Wt)
        x_, y_ = T(s_, t_); a_ = rng.uniform(0, TAU)
        c.set_source_rgba(0.16 + 0.10 * rng.random(), 0.30 + 0.12 * rng.random(), 0.12, 0.96)
        c.new_path(); c.save(); c.translate(x_, y_); c.rotate(a_); c.scale(0.055 * Wt, 0.022 * Wt); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    kinds = [((0.86, 0.14, 0.10), (0.10, 0.06, 0.06), 5), ((0.30, 0.44, 0.92), (0.22, 0.14, 0.52), 5), ((0.98, 0.97, 0.92), (0.96, 0.74, 0.14), 11), ((0.99, 0.84, 0.14), (0.80, 0.52, 0.06), 9), ((0.90, 0.44, 0.66), (0.60, 0.20, 0.40), 5)]
    for k in range(190):
        s_ = rng.uniform(-Lt / 2 + 0.03 * Lt, Lt / 2 - 0.03 * Lt); t_ = rng.normal(0, 0.070 * Wt)
        x_, y_ = T(s_, t_); col, eye, n_p = kinds[int(rng.integers(0, 5))]
        r_ = rng.uniform(0.032, 0.052) * Wt
        c.set_source_rgba(0.04, 0.05, 0.03, 0.22); c.new_path(); c.arc(x_ + r_ * 0.35, y_ + r_ * 0.4, r_ * 0.9, 0, TAU); c.fill()
        _flower_head(c, x_, y_, r_, col, eye, n_p)
    for k in range(7):                                                                           # bread
        x_, y_ = T(-Lt * 0.40 + k * 0.133 * Lt + rng.normal(0, 6), rng.choice([-1, 1]) * rng.uniform(0.07, 0.13) * Wt)
        drop(x_, y_, 0.060 * Wt, 0.32)
        c.save(); c.translate(x_, y_); c.rotate(ang + rng.normal(0, 0.35)); c.scale(0.082 * Wt, 0.050 * Wt)
        gb = cairo.RadialGradient(-0.3, -0.3, 0.05, 0, 0, 1.0); gb.add_color_stop_rgb(0, 0.88, 0.62, 0.30); gb.add_color_stop_rgb(1, 0.58, 0.34, 0.14)
        c.new_path(); c.arc(0, 0, 1, 0, TAU); c.set_source(gb); c.fill_preserve(); c.restore()
        c.set_source_rgba(*INK, 0.40); c.set_line_width(0.6); c.stroke()
        c.save(); c.translate(x_, y_); c.rotate(ang + rng.normal(0, 0.0)); c.set_source_rgba(0.98, 0.88, 0.62, 0.7); c.set_line_width(0.9)
        for j in (-1, 0, 1):
            c.new_path(); c.move_to(j * 0.030 * Wt - 0.010 * Wt, -0.026 * Wt); c.line_to(j * 0.030 * Wt + 0.010 * Wt, 0.026 * Wt); c.stroke()
        c.restore()
    for k in range(5):                                                                           # bowls of strawberries and lemons
        x_, y_ = T(-Lt * 0.34 + k * 0.17 * Lt + rng.normal(0, 8), rng.choice([-1, 1]) * 0.095 * Wt)
        rb = 0.062 * Wt
        drop(x_, y_, rb, 0.34)
        c.set_source_rgb(0.30, 0.42, 0.74); c.new_path(); c.arc(x_, y_, rb, 0, TAU); c.fill_preserve(); c.set_source_rgba(*INK, 0.5); c.set_line_width(0.7); c.stroke()
        c.set_source_rgb(0.90, 0.88, 0.80); c.new_path(); c.arc(x_, y_, rb * 0.82, 0, TAU); c.fill()
        for j in range(11):
            a_ = TAU * j / 11 + k; rr = rb * 0.46 * (0.5 + 0.5 * ((j * 7) % 3) / 2)
            fx_, fy_ = x_ + math.cos(a_) * rr, y_ + math.sin(a_) * rr
            c.set_source_rgb(0.84, 0.12, 0.14) if (k + j) % 5 else c.set_source_rgb(0.98, 0.86, 0.22)
            c.new_path(); c.arc(fx_, fy_, rb * 0.17, 0, TAU); c.fill()
    for k in range(3):                                                                           # jugs with a big bunch of flowers, seen from above
        x_, y_ = T(-Lt * 0.22 + k * 0.29 * Lt, 0.0)
        rj = 0.082 * Wt
        drop(x_, y_, rj * 1.2, 0.36)
        c.set_source_rgb(0.62, 0.70, 0.86); c.new_path(); c.arc(x_, y_, rj, 0, TAU); c.fill_preserve(); c.set_source_rgba(*INK, 0.5); c.set_line_width(0.7); c.stroke()
        for j in range(16):
            a_ = TAU * j / 16 + k; rr = rj * rng.uniform(0.15, 0.95)
            col, eye, n_p = kinds[int(rng.integers(0, 5))]
            _flower_head(c, x_ + math.cos(a_) * rr, y_ + math.sin(a_) * rr, rng.uniform(0.026, 0.040) * Wt, col, eye, n_p)
    for k in range(6):                                                                           # candles in their holders
        x_, y_ = T(-Lt * 0.43 + k * 0.172 * Lt, rng.choice([-1, 1]) * 0.040 * Wt)
        drop(x_, y_, 0.022 * Wt, 0.30)
        candles.append((x_, y_))
        c.set_source_rgb(0.98, 0.96, 0.88); c.new_path(); c.arc(x_, y_, 0.021 * Wt, 0, TAU); c.fill_preserve(); c.set_source_rgba(*INK, 0.5); c.set_line_width(0.5); c.stroke()
        c.set_source_rgb(1.0, 0.84, 0.30); c.new_path(); c.arc(x_ - 0.002 * Wt, y_ - 0.004 * Wt, 0.0085 * Wt, 0, TAU); c.fill()
    # the head of the table: a wreath laid on the cloth
    hx, hy = T(Lt / 2 - 0.040 * Lt, 0.0)
    for j in range(20):
        a_ = TAU * j / 20; col, eye, n_p = kinds[j % 5]
        c.set_source_rgb(0.17, 0.32, 0.12); c.new_path(); c.save(); c.translate(hx + math.cos(a_) * 0.20 * Wt, hy + math.sin(a_) * 0.20 * Wt); c.rotate(a_ + 1.57); c.scale(0.05 * Wt, 0.022 * Wt); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        _flower_head(c, hx + math.cos(a_ + 0.15) * 0.20 * Wt, hy + math.sin(a_ + 0.15) * 0.20 * Wt, 0.040 * Wt, col, eye, n_p)
    for k in range(46):                                                                          # blossoms that fell off the posies onto the grass round the benches
        s_ = rng.uniform(-Lt * 0.55, Lt * 0.55); t_ = rng.choice([-1, 1]) * rng.uniform(0.70, 1.15) * Wt
        x_, y_ = T(s_, t_); col, eye, n_p = kinds[int(rng.integers(0, 5))]
        r_ = rng.uniform(0.026, 0.040) * Wt
        c.set_source_rgba(0.04, 0.07, 0.02, 0.28); c.new_path(); c.arc(x_ + r_ * 0.5, y_ + r_ * 0.55, r_ * 0.95, 0, TAU); c.fill()
        _flower_head(c, x_, y_, r_, col, eye, n_p)
    rgb, a = Lp.get()
    return rgb, a, shs, candles

MOON_D = np.array([-0.86, 0.51], np.float32)          # moonlight comes from the right (the moon is over the next slide): shadows fall left and a little down


TOD_X = [13900.0, 14400.0, 14900.0, 15400.0, 15900.0, 16250.0]          # finished x ...
TOD_T = [0.00, 0.12, 0.34, 0.58, 0.80, 1.00]                           # ... and the hour there: 0 golden, 0.5 dusk, 1 night


def tod_curve(xf, a=None, b=None):
    """time of day along the carousel: 0 = the golden hour outside the house (slide 14), ~0.6 = dusk round the dance (slide 15), 1 = the night of the moon (slide 16)"""
    return np.interp(np.asarray(xf, np.float32), TOD_X, TOD_T).astype(np.float32)


def light_terms(t):
    """ambient sky, low sun and moon light (colour * intensity) for a time of day t (any shape) -> three arrays shaped t.shape + (3,)"""
    t = np.asarray(t, np.float32)[..., None]
    k1, k2 = smoothstep(0.0, 0.50, t), smoothstep(0.45, 1.0, t)
    amb = (np.array([0.36, 0.41, 0.50], np.float32) * (1 - k1) + np.array([0.27, 0.36, 0.56], np.float32) * k1) * (1 - k2) + np.array([0.11, 0.17, 0.33], np.float32) * k2
    ks = (1.0 - smoothstep(0.18, 0.95, t)) ** 1.10
    kc = smoothstep(0.10, 0.65, t)
    sun = (np.array([0.70, 0.62, 0.47], np.float32) * (1 - kc) + np.array([0.72, 0.50, 0.22], np.float32) * kc) * ks
    moon = np.array([0.58, 0.72, 1.0], np.float32) * 0.34 * smoothstep(0.42, 0.95, t)
    return amb, sun, moon


def girl_light(t, rv, f, FG):
    """the light one girl stands in, at her place on the evening: low sun and rising moon mixed, from the directions they really come from.
    White linen is the brightest thing on a dark lawn, so by night it takes the moon's cool white (and a thin cool rim to keep its shape against the grass)."""
    amb, sun, moon = [np.asarray(v, np.float32).reshape(-1) for v in light_terms(np.float32(t))]
    ws, wm = float(sun.mean()), float(moon.mean())
    sun_img = np.array([-0.60, -0.80], np.float32); sun_img /= np.linalg.norm(sun_img)
    moon_img = -MOON_D / np.linalg.norm(MOON_D)
    d2 = sun_img * ws + moon_img * wm * 1.8
    d2 = d2 / (np.linalg.norm(d2) + 1e-9)
    a0, s0, _ = light_terms(np.float32(0.0))
    lit0 = float((a0 + s0).mean())
    lit_t = float((amb + sun + moon).mean())
    night = float(smoothstep(0.40, 0.95, np.float32(t)))
    moon_w = moon / (np.abs(moon).max() + 1e-9) * float(np.abs(moon).max())
    moon_c = moon.mean() * np.array([0.82, 0.90, 1.12], np.float32)                      # the moon's light on linen: cool white, not blue paint
    key = sun * 1.5 + moon_c * (1.5 + 2.2 * night)
    amb_g = amb * (1.0 + 0.45 * night)
    amb_g = amb_g * (1 - 0.45 * night) + amb_g.mean() * np.array([0.90, 0.98, 1.12], np.float32) * (0.45 * night)
    rim_gain = 0.55 * night
    return FG.Light(key_dir=(0.82 * float(d2 @ rv), 0.57, 0.82 * float(d2 @ f)), key_col=tuple(float(v) for v in key), key_gain=1.0, amb_col=tuple(float(v) for v in amb_g), amb_gain=1.0,
                    bounce_col=(0.30, 0.36, 0.13), bounce_gain=0.45 * lit_t / lit0,
                    rim_dir=(0.95 * float(d2 @ rv), 0.25, 0.95 * float(d2 @ f)), rim_col=(0.55, 0.68, 1.0), rim_gain=rim_gain)


def _glow_layer(w, h, items):
    """additive light: items = [(x, y, radius, (r, g, b), strength)] -> (h, w, 3) light to be added in screen mode"""
    L = Layer(w, h, 0, 0, 1)
    c = L.ctx
    c.set_operator(cairo.OPERATOR_ADD)
    for (x, y, r, col, k) in items:
        if k < 0.01: continue
        g = cairo.RadialGradient(x, y, 0, x, y, r)
        g.add_color_stop_rgba(0, col[0], col[1], col[2], min(1.0, k)); g.add_color_stop_rgba(0.35, col[0], col[1], col[2], min(1.0, k) * 0.40); g.add_color_stop_rgba(1, col[0], col[1], col[2], 0)
        c.set_source(g); c.new_path(); c.arc(x, y, r, 0, TAU); c.fill()
    rgb, _ = L.get()
    return np.clip(rgb, 0, 1)


def lantern_top(c, x, y, R):
    """a paper sky-lantern seen from above: a lit disc with ribs, a dark cap, a ring of wire at the rim"""
    g = cairo.RadialGradient(x - R * 0.20, y - R * 0.20, R * 0.08, x, y, R)
    g.add_color_stop_rgb(0, 1.0, 0.97, 0.74); g.add_color_stop_rgb(0.50, 1.0, 0.76, 0.34); g.add_color_stop_rgb(1, 0.80, 0.34, 0.10)
    c.set_source(g); c.new_path(); c.arc(x, y, R, 0, TAU); c.fill()
    c.set_source_rgba(0.34, 0.12, 0.04, 0.38); c.set_line_width(max(0.6, R * 0.05))
    for k in range(8):
        a_ = TAU * k / 8 + 0.2
        c.new_path(); c.move_to(x + math.cos(a_) * R * 0.20, y + math.sin(a_) * R * 0.20); c.line_to(x + math.cos(a_) * R * 0.98, y + math.sin(a_) * R * 0.98); c.stroke()
    c.set_source_rgba(0.40, 0.16, 0.05, 0.70); c.set_line_width(max(0.8, R * 0.08)); c.new_path(); c.arc(x, y, R * 0.97, 0, TAU); c.stroke()
    g2 = cairo.RadialGradient(x, y, 0, x, y, R * 0.55); g2.add_color_stop_rgba(0, 1.0, 0.98, 0.84, 1.0); g2.add_color_stop_rgba(1, 1.0, 0.90, 0.60, 0.0)
    c.set_source(g2); c.new_path(); c.arc(x, y, R * 0.55, 0, TAU); c.fill()


def folk_morph(img, xf, a, b, seed=8):
    """the last stretch before the moon: the lawn is painted on plywood again (flat washes, the grain of the board) so that it meets the folk night without a seam"""
    k = smoothstep(a, b, xf)[None, :, None]
    if float(k.max()) < 0.01: return img
    h, w = img.shape[:2]
    flat = cv2.bilateralFilter(np.ascontiguousarray(img, np.float32), 9, 0.07, 6.0)
    flat = cv2.bilateralFilter(flat, 9, 0.07, 6.0)
    flat = np.round(flat * 14.0) / 14.0 * 0.6 + flat * 0.4
    from folk import plywood
    ply = plywood(int(xf[0]), 0, w, h, seed=seed)
    grain = ply / ply.mean((0, 1))
    flat = np.clip(flat * grain ** 1.25, 0, 1)
    return img * (1 - k) + flat * k


def render_overhead(w, h, seed=7, cx_frac=0.50, cy_frac=0.56, r_out_frac=0.40, r_in_frac=0.085, s_frac=0.0775, turns=2.1, tail=9, wref=None, ribbons=True, th0=0.70 * math.pi, step_k=0.80, fold=1.0, feast=None,
                    tod=None, girls=True, lanterns=()):
    """ONE unbroken line of girls holding hands, spiralling inward round a garlanded pole; its tail leaves the frame at the left
    (the chain that walked in from the lake). Painted in gouache + ink.
    tod = (x_offset_to_finished_coordinates, t_start, t_end): the light changes along the picture from the low golden sun to dusk to the moon of the next slide -
    ground, shadows (sun's down-right, moon's left), candles, lanterns, fireflies and every girl's own lighting follow it."""
    rng = np.random.default_rng(seed)
    img = grass(w, h, 0, seed)
    fl_, fa_ = flower_scatter(w, h, np.random.default_rng(seed + 5))
    img = img * (1 - fa_[..., None]) + fl_
    xs_ = np.arange(w, dtype=np.float32)
    if tod is not None:
        x_off, t_a, t_b = tod
        xf = xs_ + float(x_off)
        tcol = tod_curve(xf, t_a, t_b)
    else:
        xf = xs_; tcol = np.zeros(w, np.float32)
    candles = []
    sh_feast = [None, None]
    if feast is not None:                                                        # the feast table, laid and waiting, before anything stands on the grass
        frgb, fa, fsh, candles = feast_table(w, h, feast[0], feast[1], feast[2], feast[3], np.random.default_rng(seed + 31), shadow_dirs=((None, 0.62), (MOON_D, 0.50)))
        sh_feast = fsh
        img = img * (1 - fa[..., None]) + frgb
    cx, cy = cx_frac * w, cy_frac * h
    S = s_frac * h
    wr = float(wref or w)
    th, X, Y = spiral_path(cx, cy, r_out_frac * wr, r_in_frac * wr, turns, th0)
    seg = np.hypot(np.diff(X), np.diff(Y))
    cum = np.concatenate([[0], np.cumsum(seg)])
    step = step_k * S
    pts = []
    s_ = 0.0
    while s_ < cum[-1]:
        i = min(int(np.searchsorted(cum, s_)), len(th) - 1)
        pts.append((float(X[i]), float(Y[i])))
        s_ += step
    # the tail: the line carries on along the spiral's initial tangent, away from the pole, out of the frame
    tx0, ty0 = X[0] - X[min(40, len(X) - 1)], Y[0] - Y[min(40, len(Y) - 1)]
    nl = math.hypot(tx0, ty0) + 1e-9
    tx0, ty0 = tx0 / nl, ty0 / nl
    tail_pts = [(X[0] + tx0 * step * k - ty0 * 0.55 * step * math.sin(k * 0.42), Y[0] + ty0 * step * k + tx0 * 0.55 * step * math.sin(k * 0.42)) for k in range(1, tail + 1)]
    seq = list(reversed(tail_pts)) + pts                                        # outer tail ... outer end of spiral ... centre
    people = []
    for j, (x, y) in enumerate(seq):
        people.append(dict(x=x, y=y, fa=math.atan2(cy - y, cx - x), j=j, n=len(seq)))
    n_p = len(people)
    for p in people:
        j = p['j']
        if j < tail:                                                              # the procession: they walk, so they face the next girl
            nx_, ny_ = people[min(j + 1, n_p - 1)]['x'], people[min(j + 1, n_p - 1)]['y']
            p['fa'] = math.atan2(ny_ - p['y'], nx_ - p['x'])
    # ---- shadows: the low sun's (long, down-right) and the moon's (short, left); the pole throws one too
    items = [(p['x'], p['y'], p['fa']) for p in people]
    sh_sun = shadow_layer(w, h, items, S)
    sh_moon = shadow_layer(w, h, items, S, d=MOON_D, lenk=0.55)
    Lp = Layer(w, h, 0, 0, 2)
    cc = Lp.ctx
    cc.set_source_rgba(0, 0, 0, 1); cc.set_line_width(0.07 * wr)
    cc.new_path(); cc.move_to(cx, cy); cc.line_to(cx + SUN_D[0] * 0.70 * wr, cy + SUN_D[1] * 0.70 * wr); cc.stroke()
    _, pa = Lp.get()
    sh_sun = np.maximum(sh_sun, cv2.GaussianBlur(pa, (0, 0), 6.0) * 0.9)
    Lp2 = Layer(w, h, 0, 0, 2)
    cc = Lp2.ctx
    cc.set_source_rgba(0, 0, 0, 1); cc.set_line_width(0.07 * wr)
    cc.new_path(); cc.move_to(cx, cy); cc.line_to(cx + MOON_D[0] * 0.40 * wr, cy + MOON_D[1] * 0.40 * wr); cc.stroke()
    _, pa2 = Lp2.get()
    sh_moon = np.maximum(sh_moon, cv2.GaussianBlur(pa2, (0, 0), 6.0) * 0.9)
    if sh_feast[0] is not None:
        sh_sun = np.maximum(sh_sun, sh_feast[0]); sh_moon = np.maximum(sh_moon, sh_feast[1])
    # ---- the ground is lit by the hour: ambient sky + the low sun (shadowed) + the moon (shadowed)
    amb, sun, moon = light_terms(tcol)
    lit = amb[None, :, :] + sun[None, :, :] * (1 - 0.92 * sh_sun)[..., None] + moon[None, :, :] * (1 - 0.85 * sh_moon)[..., None]
    img = img * lit
    # candles on the cloth are lit as the evening comes on
    glow_items = []
    for (x_, y_) in candles:
        tc = float(tcol[int(np.clip(x_, 0, w - 1))])
        g_ = float(smoothstep(0.10, 0.40, tc))
        glow_items.append((x_, y_, 120.0, (1.0, 0.62, 0.26), 0.16 * g_))
        glow_items.append((x_, y_, 30.0, (1.0, 0.74, 0.34), 0.70 * g_))
    glow = _glow_layer(w, h, glow_items)
    img = 1 - (1 - np.clip(img, 0, 1)) * (1 - glow)
    # ---- the girls: real people seen from above, each lit by her own place in the evening
    if girls:
        import body3d as B3
        import fig as FG
        Tg = int(round(S / 0.585))
        HAIRS_ = [(0.82, 0.64, 0.36), (0.64, 0.45, 0.24), (0.48, 0.32, 0.17), (0.90, 0.76, 0.46), (0.38, 0.25, 0.14), (0.72, 0.42, 0.20), (0.24, 0.16, 0.10), (0.70, 0.56, 0.34)]
        SKINS_ = [(0.93, 0.77, 0.66), (0.90, 0.72, 0.60), (0.87, 0.67, 0.56), (0.92, 0.74, 0.62)]
        sun_img = np.array([-0.60, -0.80], np.float32); sun_img /= np.linalg.norm(sun_img)
        for p in sorted(people, key=lambda q: q['y']):
            j = p['j']
            f = np.array([math.cos(p['fa']), math.sin(p['fa'])], np.float32)
            rv = np.array([-math.sin(p['fa']), math.cos(p['fa'])], np.float32)
            arms = []
            for jj in (j - 1, j + 1):
                if 0 <= jj < n_p:
                    q = people[jj]
                    d = np.array([(q['x'] - p['x']) / 2.0, (q['y'] - p['y']) / 2.0], np.float32)
                    k_ = (3.4 - 0.565) / 3.4                                            # the camera is above each girl: undo the perspective so that neighbours' hands meet
                    arms.append((float(d @ rv) / Tg * k_ * 0.80, 0.565, float(d @ f) / Tg * k_ * 0.80))      # the wrist stops short of the midpoint: the two hands meet and clasp there
            free = [(-0.125, 0.455, 0.020), (0.125, 0.455, 0.020)]
            arms = sorted(arms, key=lambda a: a[0])
            if len(arms) == 2: a_l, a_r = arms
            elif len(arms) == 1: a_l, a_r = (arms[0], free[1]) if arms[0][0] < 0 else (free[0], arms[0])
            else: a_l, a_r = free
            a_l = (min(a_l[0], -0.04), a_l[1], a_l[2]); a_r = (max(a_r[0], 0.04), a_r[1], a_r[2])
            sd_ = int(rng.integers(1 << 30))
            pose = dict(view='front', male=False, yaw=float(rng.uniform(-0.5, 0.5)), hair=HAIRS_[sd_ % 8], skin=SKINS_[(sd_ // 7) % 4], dress=tuple(np.clip(np.array(LIN) + rng.normal(0, 0.012, 3), 0, 1)),
                        crown=True, wilt=0.12, feet=False, hem_y=0.05, bow=True, arm_l=(-0.11, 0.5), arm_r=(0.11, 0.5), arm3_l=a_l, arm3_r=a_r, curl_l=0.8, curl_r=0.8, belt=(0.60, 0.68, 0.90), fold=fold)
            tg = float(tcol[int(np.clip(p['x'], 0, w - 1))])
            Ld = girl_light(tg, rv, f, FG)
            sp = B3.render(Tg, pose, Ld, seed=sd_ % 100000, ss=2, top=True)
            paste_rot(img, sp, p['x'], p['y'], rv, f)
    # ---- the pole (seen from above, leaning toward the camera), graded to the hour column by column
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
    hands_pts = []
    for k in range(len(people) - 1):
        p, q = people[k], people[k + 1]
        if k % 2 == 0: hands_pts.append(((p['x'] + q['x']) / 2, (p['y'] + q['y']) / 2))
    hands_pts = [h_ for h_ in hands_pts if math.hypot(h_[0] - cx, h_[1] - cy) < 0.33 * w]
    pole_painting(c, (cx + 6, cy + 10), (cx - 0.20 * wr, cy - 0.58 * h), 0.060 * wr, 0.040 * wr, rng, S, hands=(hands_pts if ribbons else None))
    rgb, a = L.get()
    a0, s0_, _m0 = light_terms(np.float32(0.0))
    mult = (amb + sun + moon) / (a0 + s0_)[None, :]
    rgb = rgb * mult[None, :, :]
    img = img * (1 - a[..., None]) + rgb
    xx = np.arange(w, dtype=np.float32)[None, :]; yy = np.arange(h, dtype=np.float32)[:, None]
    light = 1.0 + 0.16 * np.exp(-((xx / w) ** 2) * 3.0)
    vig = 1 - 0.30 * (((xx / w - 0.5) ** 2 + (yy / h - 0.5) ** 2) * 2.2)
    img = img * (light * vig)[..., None]
    img = img + np.array([0.05, 0.03, 0.0], np.float32) * np.exp(-((xx / w) ** 2) * 2.5)[..., None] * 0.6
    return np.clip(img, 0, 1).astype(np.float32)


def tilt_to_horizon(img, x_off, xa, xm, xb, hz=783, f=900.0, y_h0=-170.0, base=None, seed=5):
    """THE CAMERA TILTS UP. img = the lawn seen from straight above; its first column is finished x = x_off. From finished x = xa the lens pitches up: every column is
    imaged by a camera a little more level than the one before. Between xa and xm the lawn bends (its flowers and shadows squash toward a distant line that is still above
    the frame); from xm the horizon comes down into the picture and at xb it sits on row hz, with the night sky above it. So the dance and the moon are one world,
    not two pictures dissolved into each other. Pixels are looked up in the SAME column (a pushbroom camera): the bottom row stays the bottom row of the lawn, far ground
    is the lawn mirrored on itself, and it fades into haze."""
    h, w = img.shape[:2]
    xs = x_off + np.arange(w, dtype=np.float32)
    cy = hz + f * math.tan(math.radians(6.0))                                # principal row so that, level, the horizon sits on hz  (cy - hz = f tan(theta))
    cy = max(cy, hz + 40.0)
    psi0 = math.atan2(f, cy - y_h0)
    sA = smoothstep(xa, xm, xs)
    sB = smoothstep(xm, xb, xs)
    yh_x = y_h0 + (hz - y_h0) * sB
    psi = np.where(xs < xm, psi0 * sA, np.arctan2(f, cy - yh_x)).astype(np.float32)[None, :]
    u = np.clip(np.maximum(sA * 0.45, 0.45 + 0.55 * sB), 0, 1).astype(np.float32)[None, :]
    sp_, cp_ = np.sin(psi), np.cos(psi)                                      # cos(theta), sin(theta)  with theta = 90deg - psi (theta = pitch below level)
    yy = np.arange(h, dtype=np.float32)[:, None]
    v = cy - yy
    ry = (v / f) * sp_ - cp_
    ground = ry < -1e-3
    ryg = np.where(ground, ry, -1.0)
    t = f / (-ryg)
    d = t * ((v / f) * cp_ + sp_)
    vb = cy - (h - 1)
    ryb = (vb / f) * sp_ - cp_
    db = (f / (-ryb)) * ((vb / f) * cp_ + sp_)
    y_src = (h - 1) + db - d
    P = 2.0 * (h - 1)
    yf = np.mod(y_src, P)
    yf = np.where(yf > (h - 1), P - yf, yf).astype(np.float32)
    # the footprint of an output pixel in the source: its vertical squash and how fast the source row changes from column to column (shear)
    comp = np.maximum(np.abs(np.gradient(y_src, axis=0)), 0.8 * np.abs(np.gradient(y_src, axis=1))).astype(np.float32)
    sig = [0.0, 1.0, 2.2, 4.5, 9.0, 18.0, 36.0]
    levels = [img] + [cv2.GaussianBlur(np.ascontiguousarray(img, np.float32), (0, 0), sigmaX=max(0.7, s_ * 0.45), sigmaY=s_) for s_ in sig[1:]]
    lod = np.clip(np.log2(np.maximum(comp, 1.0)) + 0.7, 0, len(levels) - 1.001)
    i0 = np.floor(lod).astype(np.int32); fr = (lod - i0)[..., None]
    gx = np.ascontiguousarray(np.broadcast_to(np.arange(w, dtype=np.float32)[None, :], (h, w)))
    yfc = np.ascontiguousarray(yf)
    out = np.zeros((h, w, 3), np.float32)
    for li in range(len(levels)):
        m0 = (i0 == li); m1 = (i0 + 1 == li)
        if not (m0.any() or m1.any()): continue
        samp = cv2.remap(levels[li], gx, yfc, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
        out += samp * (m0[..., None] * (1 - fr) + m1[..., None] * fr)
    shear = np.abs(np.gradient(y_src, axis=1)).astype(np.float32)
    wb = np.clip((shear - 0.35) / 2.0, 0, 1)[..., None]
    out = out * (1 - wb) + cv2.GaussianBlur(out, (0, 0), sigmaX=2.2, sigmaY=0.0) * wb
    # ---- atmosphere: the farther the ground, the more it takes the colour of the night horizon (dark teal, a little warm near the line)
    dn = np.where(ground, np.maximum(d - db, 0.0), 0.0)
    y_h = cy - f * (cp_ / np.maximum(sp_, 1e-4))                              # horizon row of each column (far above the frame while looking down)
    hz_amt = np.clip(1.0 - np.exp(-dn / 1900.0), 0, 1) * u * 0.72
    hcol = np.array([0.10, 0.17, 0.22], np.float32)
    near_h = np.exp(-np.clip(yy - y_h, 0, None) / 60.0) * u
    hcol_w = hcol[None, None, :] + near_h[..., None] * np.array([0.20, 0.10, 0.03], np.float32)
    out = out * (1 - hz_amt[..., None]) + hcol_w * hz_amt[..., None]
    # ---- the sky above the horizon: the moon slide's own night gradient, lowered so that its glow sits on THIS horizon
    if base is None:
        from moon_slide import base_night
        base, _ = base_night(int(x_off), w)
    r_eq = np.clip(hz - (y_h - yy), 0, hz - 1).astype(np.int32)
    sky = base[r_eq, np.arange(w)[None, :]]
    skym = (~ground).astype(np.float32)
    skym = cv2.GaussianBlur(skym, (0, 0), sigmaX=15.0, sigmaY=1.3)[..., None]  # a hazy horizon: soft where it is steep, still a line where it is level
    out = out * (1 - skym) + sky * skym
    # the thin line of the last light along the horizon, strongest when level
    lvl = smoothstep(480.0, hz - 10.0, y_h)
    edge = np.exp(-((yy - y_h) / 2.2) ** 2) * lvl
    glowb = np.exp(-((yy - y_h) / 38.0) ** 2) * lvl
    out = out + glowb[..., None] * np.array([0.30, 0.13, 0.04], np.float32) * 0.8
    out = out + edge[..., None] * np.array([0.60, 0.30, 0.07], np.float32) * 0.9
    # ---- stars come out where the sky does
    rng = np.random.default_rng(seed)
    n_st = 520
    sx = rng.integers(0, w, n_st); sy = rng.uniform(0, hz - 30, n_st)
    S_ = np.zeros((h, w), np.float32)
    for xx_, yy_ in zip(sx, sy):
        yh = float(y_h[0, xx_])
        if yy_ > yh - 10: continue
        a_ = float(rng.uniform(0.35, 1.0)) * float(np.clip((yh - yy_) / 140.0, 0, 1))
        xi, yi = int(xx_), int(yy_)
        if 1 <= xi < w - 1 and 1 <= yi < h - 1:
            S_[yi, xi] = max(S_[yi, xi], a_)
            for dx_, dy_ in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                S_[yi + dy_, xi + dx_] = max(S_[yi + dy_, xi + dx_], a_ * 0.4)
    out = out + cv2.GaussianBlur(S_, (0, 0), 0.7)[..., None] * np.array([1.0, 0.97, 0.88], np.float32) * 1.3
    return np.clip(out, 0, 1).astype(np.float32), np.clip(y_h[0], -2000, hz).astype(np.float32)


def night_finish(img, tod, lanterns=(), seed=7, yh=None, lawn_x1=16000.0):
    """after the painterly pass and the tilt: the things that live on the dusk lawn and cross toward the moon - fireflies (only below the horizon of their column) and paper
    lanterns seen from above that the dance sends up (they fade out where the camera has tilted, and are replaced by the lanterns seen from the side, drawn in compose)"""
    h, w = img.shape[:2]
    x_off = float(tod[0])
    xf = np.arange(w, dtype=np.float32) + x_off
    tcol = tod_curve(xf, tod[1], tod[2])
    items = []
    fr = np.random.default_rng(seed + 90)
    for q in range(320):
        x_, y_ = fr.uniform(0, w), fr.uniform(0, h)
        xi = int(np.clip(x_, 0, w - 1))
        if yh is not None and y_ < float(yh[xi]) + 6: continue
        g_ = float(smoothstep(0.35, 0.80, tcol[xi])) * fr.uniform(0.45, 1.0)
        items.append((x_, y_, fr.uniform(4.0, 8.0), (1.0, 0.95, 0.52), 0.85 * g_))
        items.append((x_, y_, fr.uniform(22.0, 40.0), (0.85, 0.95, 0.45), 0.10 * g_))
    keep = []
    for (lx, ly, lr) in lanterns:
        if lx + x_off > lawn_x1: continue
        xi = int(np.clip(lx, 0, w - 1))
        if yh is not None and ly < float(yh[xi]) + 20: continue
        keep.append((lx, ly, lr))
        g_ = float(smoothstep(0.25, 0.65, tcol[xi]))
        items.append((lx, ly, lr * 5.5, (1.0, 0.60, 0.22), 0.38 * g_))
    glow = _glow_layer(w, h, items)
    img = 1 - (1 - np.clip(img, 0, 1)) * (1 - glow)
    if keep:
        Ll = Layer(w, h, 0, 0, 2)
        for (lx, ly, lr) in keep:
            lantern_top(Ll.ctx, lx, ly, lr)
        lr_, la_ = Ll.get()
        dim = 0.60 + 0.40 * smoothstep(0.10, 0.50, tcol)[None, :, None]                      # pale paper by day, a glowing disc by night
        img = img * (1 - la_[..., None]) + lr_ * dim
    return np.clip(img, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    p = render_overhead(2200, 1350, cx_frac=0.62)
    print('overhead', round(time.time() - t, 1), 's')
    save_png(WORK + '/overhead_test.png', cv2.resize(p, None, fx=0.62, fy=0.62, interpolation=cv2.INTER_AREA))
