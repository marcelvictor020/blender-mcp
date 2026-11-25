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


def grass(w, h, x0=0, seed=3):
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
    return np.clip(col, 0, 1)


def flower_scatter(w, h, rng):
    """the lawn seen from above is not bare: poppies, cornflowers, ox-eye daisies, buttercups and clover scattered over it, each with a tiny shadow"""
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    kinds = [((0.86, 0.14, 0.10), (0.10, 0.06, 0.06), 5.6), ((0.30, 0.44, 0.92), (0.22, 0.14, 0.52), 4.4), ((0.98, 0.97, 0.92), (0.96, 0.74, 0.14), 4.8),
             ((0.99, 0.84, 0.14), (0.80, 0.52, 0.06), 4.2), ((0.90, 0.44, 0.66), (0.60, 0.20, 0.40), 4.0)]
    for i in range(int(w * h / 4200.0)):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
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


def shadow_layer(w, h, items, S):
    """figure-shaped long shadows down-right (skirt band, torso band, head blob at the far end, thin arm shadows)"""
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    c.set_source_rgba(0, 0, 0, 1)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    d = SUN_D
    for (x, y, fa) in items:
        tx, ty = -math.sin(fa), math.cos(fa)
        c.set_line_width(0.58 * S); c.new_path(); c.move_to(x, y); c.line_to(x + d[0] * 1.25 * S, y + d[1] * 1.25 * S); c.stroke()
        c.set_line_width(0.30 * S); c.new_path(); c.move_to(x + d[0] * 1.0 * S, y + d[1] * 1.0 * S); c.line_to(x + d[0] * 1.95 * S, y + d[1] * 1.95 * S); c.stroke()
        c.new_path(); c.arc(x + d[0] * 2.30 * S, y + d[1] * 2.30 * S, 0.135 * S, 0, TAU); c.fill()
        for sx in (-1, 1):
            c.set_line_width(0.07 * S); c.new_path(); c.move_to(x + tx * sx * 0.28 * S + d[0] * 1.5 * S, y + ty * sx * 0.28 * S + d[1] * 1.5 * S)
            c.line_to(x + tx * sx * 0.50 * S + d[0] * 1.8 * S, y + ty * sx * 0.50 * S + d[1] * 1.8 * S); c.stroke()
    _, a = L.get()
    return cv2.GaussianBlur(a, (0, 0), 0.045 * S + 1.0)


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


def render_overhead(w, h, seed=7, cx_frac=0.50, cy_frac=0.56, r_out_frac=0.40, r_in_frac=0.085, s_frac=0.0775, turns=2.1, tail=9):
    """ONE unbroken line of girls holding hands, spiralling inward round a garlanded pole; its tail leaves the frame at the left
    (the chain that walked in from the lake). Painted in gouache + ink, long shadows down-right."""
    rng = np.random.default_rng(seed)
    img = grass(w, h, 0, seed)
    fl_, fa_ = flower_scatter(w, h, np.random.default_rng(seed + 5))
    img = img * (1 - fa_[..., None]) + fl_
    cx, cy = cx_frac * w, cy_frac * h
    S = s_frac * h
    th, X, Y = spiral_path(cx, cy, r_out_frac * w, r_in_frac * w, turns, 0.70 * math.pi)
    seg = np.hypot(np.diff(X), np.diff(Y))
    cum = np.concatenate([[0], np.cumsum(seg)])
    step = 0.80 * S
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
    tail_pts = [(X[0] + tx0 * step * k, Y[0] + ty0 * step * k + 0.10 * step * k * math.sin(k * 0.7)) for k in range(1, tail + 1)]
    seq = list(reversed(tail_pts)) + pts                                        # outer tail ... outer end of spiral ... centre
    people = []
    for j, (x, y) in enumerate(seq):
        people.append(dict(x=x, y=y, fa=math.atan2(cy - y, cx - x), j=j, n=len(seq)))
    sh = shadow_layer(w, h, [(p['x'], p['y'], p['fa']) for p in people], S)
    Lp = Layer(w, h, 0, 0, 2)
    cc = Lp.ctx
    cc.set_source_rgba(0, 0, 0, 1); cc.set_line_width(0.07 * w)
    cc.new_path(); cc.move_to(cx, cy); cc.line_to(cx + SUN_D[0] * 0.70 * w, cy + SUN_D[1] * 0.70 * w); cc.stroke()
    _, pa = Lp.get()
    sh = np.maximum(sh, cv2.GaussianBlur(pa, (0, 0), 6.0) * 0.9)
    img = img * (1 - 0.55 * sh[..., None]) + np.array([0.04, 0.09, 0.10], np.float32) * (0.55 * sh[..., None])
    L = Layer(w, h, 0, 0, 2)
    c = L.ctx
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
    for k in range(len(people) - 1):                                           # hands first (under sleeves): p's CCW-side shoulder to q's CW-side shoulder
        p, q = people[k], people[k + 1]
        fx, fy = math.cos(p['fa']), math.sin(p['fa']); tx, ty = -fy, fx
        qfx, qfy = math.cos(q['fa']), math.sin(q['fa']); qtx, qty = -qfy, qfx
        a = (p['x'] + fx * 0.07 * S + tx * 0.255 * S, p['y'] + fy * 0.07 * S + ty * 0.255 * S)
        b = (q['x'] + qfx * 0.07 * S - qtx * 0.255 * S, q['y'] + qfy * 0.07 * S - qty * 0.255 * S)
        m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        for (s0, e0) in ((a, m), (b, m)):
            c.set_source_rgba(*INK, 0.7); c.set_line_width(0.075 * S); c.new_path(); c.move_to(*s0); c.line_to(*e0); c.stroke()
            c.set_source_rgb(0.92, 0.74, 0.62); c.set_line_width(0.058 * S); c.new_path(); c.move_to(*s0); c.line_to(*e0); c.stroke()
        c.set_source_rgb(0.90, 0.70, 0.58); c.new_path(); c.arc(m[0], m[1], 0.045 * S, 0, TAU); c.fill()
    for p in sorted(people, key=lambda p: p['y']):
        dress = tuple(np.clip(np.array(LIN) + rng.normal(0, 0.012, 3), 0, 1))
        hair = [(0.80, 0.62, 0.34), (0.55, 0.37, 0.19), (0.34, 0.22, 0.12), (0.88, 0.74, 0.44), (0.20, 0.13, 0.09), (0.64, 0.34, 0.16)][int(rng.integers(6))]
        top_girl(c, p['x'], p['y'], p['fa'], S, dress, hair, rng, 2)
    hands_pts = []
    for k in range(len(people) - 1):
        p, q = people[k], people[k + 1]
        if k % 2 == 0: hands_pts.append(((p['x'] + q['x']) / 2, (p['y'] + q['y']) / 2))
    hands_pts = [h_ for h_ in hands_pts if math.hypot(h_[0] - cx, h_[1] - cy) < 0.33 * w]
    pole_painting(c, (cx + 6, cy + 10), (cx - 0.20 * w, cy - 0.58 * h), 0.060 * w, 0.040 * w, rng, S, hands=hands_pts)
    rgb, a = L.get()
    img = img * (1 - a[..., None]) + rgb
    xx = np.arange(w, dtype=np.float32)[None, :]; yy = np.arange(h, dtype=np.float32)[:, None]
    light = 1.0 + 0.16 * np.exp(-((xx / w) ** 2) * 3.0)
    vig = 1 - 0.30 * (((xx / w - 0.5) ** 2 + (yy / h - 0.5) ** 2) * 2.2)
    img = img * (light * vig)[..., None]
    img = img + np.array([0.05, 0.03, 0.0], np.float32) * np.exp(-((xx / w) ** 2) * 2.5)[..., None] * 0.6
    return np.clip(img, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    p = render_overhead(2200, 1350, cx_frac=0.62)
    print('overhead', round(time.time() - t, 1), 's')
    save_png(WORK + '/overhead_test.png', cv2.resize(p, None, fx=0.62, fy=0.62, interpolation=cv2.INTER_AREA))
