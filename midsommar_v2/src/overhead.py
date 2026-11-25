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


def feast_table(w, h, c0, ang, Lt, Wt, rng):
    """THE FEAST, laid and waiting: one long table seen from above - white cloth with a red-and-blue folk border, a place for twenty-two (plate, glass, folded napkin,
    a little posy), a runner of leaves and wildflowers with bread, bowls of strawberries, jugs and candles, a plank bench each side. Nobody is sitting down yet.
    Returns (rgb, a, shadow) over the (w, h) canvas."""
    Ls = Layer(w, h, 0, 0, 2); cs = Ls.ctx
    Lp = Layer(w, h, 0, 0, 2); c = Lp.ctx
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda s_, t_: (c0[0] + ca * s_ - sa * t_, c0[1] + sa * s_ + ca * t_)
    Dsh = SUN_D * 0.62 * Wt                                                                    # a table-top's shadow is as long as the table is high (about 0.75 m)

    def rect_poly(cc, s0, s1, t0, t1, off=(0.0, 0.0)):
        pts = [T(s0, t0), T(s1, t0), T(s1, t1), T(s0, t1)]
        cc.new_path(); cc.move_to(pts[0][0] + off[0], pts[0][1] + off[1])
        for p in pts[1:]: cc.line_to(p[0] + off[0], p[1] + off[1])
        cc.close_path()

    # ---- shadows (swept footprints), table + benches
    cs.set_source_rgba(0, 0, 0, 1)
    for k in range(14):
        f = k / 13.0
        rect_poly(cs, -Lt / 2, Lt / 2, -Wt / 2, Wt / 2, (Dsh[0] * f, Dsh[1] * f)); cs.fill()
    for sd in (-1, 1):
        t0, t1 = sd * (Wt * 0.5 + 0.12 * Wt) - 0.16 * Wt, sd * (Wt * 0.5 + 0.12 * Wt) + 0.16 * Wt
        for k in range(8):
            f = k / 7.0 * 0.58
            rect_poly(cs, -Lt * 0.47, Lt * 0.47, min(t0, t1), max(t0, t1), (Dsh[0] * f, Dsh[1] * f)); cs.fill()
    _, sh = Ls.get()
    sh = cv2.GaussianBlur(sh, (0, 0), 0.055 * Wt + 1.0)

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
    return rgb, a, sh

def render_overhead(w, h, seed=7, cx_frac=0.50, cy_frac=0.56, r_out_frac=0.40, r_in_frac=0.085, s_frac=0.0775, turns=2.1, tail=9, wref=None, ribbons=True, th0=0.70 * math.pi, step_k=0.80, fold=1.0, feast=None):
    """ONE unbroken line of girls holding hands, spiralling inward round a garlanded pole; its tail leaves the frame at the left
    (the chain that walked in from the lake). Painted in gouache + ink, long shadows down-right."""
    rng = np.random.default_rng(seed)
    img = grass(w, h, 0, seed)
    fl_, fa_ = flower_scatter(w, h, np.random.default_rng(seed + 5))
    img = img * (1 - fa_[..., None]) + fl_
    if feast is not None:                                                        # the feast table, laid and waiting, before anything stands on the grass
        frgb, fa, fsh = feast_table(w, h, feast[0], feast[1], feast[2], feast[3], np.random.default_rng(seed + 31))
        img = img * (1 - 0.50 * fsh[..., None]) + np.array([0.04, 0.09, 0.10], np.float32) * (0.50 * fsh[..., None])
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
    sh = shadow_layer(w, h, [(p['x'], p['y'], p['fa']) for p in people], S)
    Lp = Layer(w, h, 0, 0, 2)
    cc = Lp.ctx
    cc.set_source_rgba(0, 0, 0, 1); cc.set_line_width(0.07 * wr)
    cc.new_path(); cc.move_to(cx, cy); cc.line_to(cx + SUN_D[0] * 0.70 * wr, cy + SUN_D[1] * 0.70 * wr); cc.stroke()
    _, pa = Lp.get()
    sh = np.maximum(sh, cv2.GaussianBlur(pa, (0, 0), 6.0) * 0.9)
    img = img * (1 - 0.55 * sh[..., None]) + np.array([0.04, 0.09, 0.10], np.float32) * (0.55 * sh[..., None])
    # ---- the girls: real people seen from straight above (signed-distance bodies, lit by the low sun, rotated to face the pole or the way they walk)
    import body3d as B3
    import fig as FG
    Tg = int(round(S / 0.585))
    sun_img = np.array([-0.60, -0.80], np.float32); sun_img /= np.linalg.norm(sun_img)
    HAIRS_ = [(0.80, 0.62, 0.34), (0.55, 0.37, 0.19), (0.34, 0.22, 0.12), (0.88, 0.74, 0.44), (0.20, 0.13, 0.09), (0.64, 0.34, 0.16)]
    SKINS_ = [(0.93, 0.77, 0.66), (0.90, 0.72, 0.60), (0.87, 0.67, 0.56), (0.92, 0.74, 0.62)]
    n_p = len(people)
    for p in people:
        j = p['j']
        if j < tail:                                                              # the procession: they walk, so they face the next girl
            nx_, ny_ = people[min(j + 1, n_p - 1)]['x'], people[min(j + 1, n_p - 1)]['y']
            p['fa'] = math.atan2(ny_ - p['y'], nx_ - p['x'])
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
                arms.append((float(d @ rv) / Tg * k_, 0.565, float(d @ f) / Tg * k_))
        free = [(-0.125, 0.455, 0.020), (0.125, 0.455, 0.020)]
        arms = sorted(arms, key=lambda a: a[0])
        if len(arms) == 2: a_l, a_r = arms
        elif len(arms) == 1: a_l, a_r = (arms[0], free[1]) if arms[0][0] < 0 else (free[0], arms[0])
        else: a_l, a_r = free
        a_l = (min(a_l[0], -0.04), a_l[1], a_l[2]); a_r = (max(a_r[0], 0.04), a_r[1], a_r[2])
        sd_ = int(rng.integers(1 << 30))
        pose = dict(view='front', male=False, hair=HAIRS_[sd_ % 6], skin=SKINS_[(sd_ // 7) % 4], dress=tuple(np.clip(np.array(LIN) + rng.normal(0, 0.012, 3), 0, 1)),
                    crown=True, wilt=0.12, feet=False, hem_y=0.05, bow=True, arm_l=(-0.11, 0.5), arm_r=(0.11, 0.5), arm3_l=a_l, arm3_r=a_r, curl_l=0.8, curl_r=0.8, belt=(0.60, 0.68, 0.90), fold=fold)
        Ld = FG.Light(key_dir=(0.82 * float(sun_img @ rv), 0.57, 0.82 * float(sun_img @ f)), key_col=(1.0, 0.86, 0.60), key_gain=1.05, amb_col=(0.55, 0.64, 0.80), amb_gain=0.62,
                      bounce_col=(0.30, 0.36, 0.13), bounce_gain=0.45, rim_dir=(0.0, 0.0, 0.0), rim_col=(0, 0, 0), rim_gain=0.0)
        sp = B3.render(Tg, pose, Ld, seed=sd_ % 100000, ss=2, top=True)
        paste_rot(img, sp, p['x'], p['y'], rv, f)
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
