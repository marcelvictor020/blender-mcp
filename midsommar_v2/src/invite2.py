"""Slide 10, THE INVITATION - at the door of the house.

The house of slide 9, much closer: we have walked up the avenue and stand at its steps. The plank wall fills the picture (the same boards, windows, shutters, lanterns and
blue leaves with the folk flower, drawn again at 2.8 times the size - not enlarged), and the open doorway is the mouth of the garlanded corridor: its first frame IS the
door frame, wrapped in leaves, blossom, ribbons and strings of little lamps (warm white, amber, red); nine more frames run in to a golden light, and that corridor is the
hallway of the next slide. The two girls stand on the top step at the threshold, hands clasped, and smile at us; the horizon passes through their eyes.

Everything is in design coordinates (slide 10 = x 10800..11880, centre 11340); the canvas starts 420 px to the left of the slide so that slide 9 can melt into it.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
import fig
import chain as CH
import meadow as MD
import critters as CR
import house as HS
import invitation as INV

TAU = 2 * math.pi
CX = INV.CX
K = 2.8
DOOR_Y = 1175.0                               # slide row of the door's base: eye level (row 783) is 70% of the way up a 2.2 m door
X0C, WC = 10380, 2640                         # canvas in design coordinates (slide 10 = 10800..11880; 420 px more on the left, then the wall goes on to the right: it is drawn in slide 11)
RX0 = HS.CXG - (CX - X0C) / K                 # house-space x of the canvas' first column
RY0 = HS.BASE_Y - DOOR_Y / K                  # house-space y of its first row
INV.T_G, INV.FEET_Y, INV.SPACING = 420, 1203, 0.455 * 420
N_FR = 10


def frames():
    """the corridor: ten identical A-frames, the nearest being the door frame itself (330 px half-width at row 1175, apex at row 615), each 1.3 times farther than the last"""
    out = []
    for i in range(N_FR):
        r = 1.30 ** i
        out.append(dict(i=i, r=r, Z=3.0 * r, by=HZ + (DOOR_Y - HZ) / r, hw=HS.DW * K / r, ay=HZ - (HZ - (DOOR_Y - HS.DH * K)) / r, t=max(2.2, 56.0 / r)))
    return out


# ------------------------------------------------------------------------------------------------------------------ string lights
def bulbs(c, p0, p1, t, haze, rng):
    """a string of little lamps wound round a pole: a dark wire zig-zagging across it, glass beads in warm white, amber and red, each with a hot core and a halo"""
    x0, y0 = p0; x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    n = max(3, int(L / max(7.0, t * 1.05)))
    cols = [(1.0, 0.95, 0.74), (1.0, 0.72, 0.28), (0.96, 0.14, 0.12), (1.0, 0.95, 0.74), (1.0, 0.58, 0.18), (0.96, 0.14, 0.12)]
    pts = []
    for k in range(n):
        s = (k + 0.5) / n
        side = 1 if k % 2 == 0 else -1
        pts.append((x0 + ux * L * s + nx * side * t * 0.62, y0 + uy * L * s + ny * side * t * 0.62, cols[(k + int(rng.integers(0, 2))) % len(cols)]))
    c.set_source_rgba(0.10, 0.07, 0.05, 0.85 * (1 - haze)); c.set_line_width(max(0.6, t * 0.035)); c.new_path()
    for k, (bx, by, _) in enumerate(pts):
        (c.move_to if k == 0 else c.line_to)(bx, by)
    c.stroke()
    rb = max(1.3, t * 0.15)
    for (bx, by, col) in pts:
        g = cairo.RadialGradient(bx, by, 0, bx, by, rb * 4.2)
        g.add_color_stop_rgba(0, col[0], col[1], col[2], 0.55 * (1 - 0.5 * haze)); g.add_color_stop_rgba(0.4, col[0], col[1], col[2], 0.16 * (1 - 0.5 * haze)); g.add_color_stop_rgba(1, col[0], col[1], col[2], 0)
        c.set_source(g); c.new_path(); c.arc(bx, by, rb * 4.2, 0, TAU); c.fill()
        c.set_source_rgba(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1); c.new_path(); c.arc(bx, by, rb, 0, TAU); c.fill()
        c.set_source_rgba(1.0, 1.0, 0.92, 0.95); c.new_path(); c.arc(bx - rb * 0.18, by - rb * 0.2, rb * 0.48, 0, TAU); c.fill()



def draw_pole_big(c, p0, p1, t, side, haze, rng):
    """a post of one of the near frames, as a garland you could touch: the painted post, then a living wrap of real leaves (veined, shaded), ivy tendrils and flowers"""
    from fold import leaf2
    from trees2 import leaf_col, DECID
    x0, y0 = p0; x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    INV.draw_pole(c, p0, p1, t, side, haze, rng, garland=False)
    ph = rng.uniform(0, TAU)
    n_l = int(L / max(2.0, t * 0.24))
    for k in range(n_l):
        s = (k + rng.random()) / n_l
        sp = math.sin(s * 19 + ph) * t * 0.55 + rng.normal(0, t * 0.10)
        gx_, gy_ = x0 + ux * L * s + nx * sp, y0 + uy * L * s + ny * sp
        sz = t * rng.uniform(0.50, 0.95)
        lam = float(np.clip(0.50 + 0.30 * (sp / (t * 0.62)) * 0.5 * (-1 if side > 0 else 1) + rng.normal(0, 0.14) + (0.12 if side < 0 else -0.06), 0, 1))
        base = leaf_col(DECID, lam, rng, 0.10)
        c0 = INV.hz_mix(base, haze)
        c1 = tuple(min(1.0, v * 1.55 + 0.10) for v in c0)
        a = math.atan2(uy, ux) + (1 if k % 2 else -1) * rng.uniform(0.5, 1.3) + rng.normal(0, 0.25)
        c.set_source_rgba(0.02, 0.04, 0.01, 0.28); c.new_path(); c.save(); c.translate(gx_ + 1.5, gy_ + 2.2); c.rotate(a); c.scale(sz * 0.55, sz * 0.33); c.arc(0.55, 0, 1, 0, TAU); c.restore(); c.fill()
        leaf2(c, gx_, gy_, sz, a, c0, c1, vein=sz > 14)
    n_f = int(L / max(3.0, t * 0.62))
    kinds = [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup, MD.clover]
    for k in range(n_f):
        s = rng.uniform(0.03, 0.97)
        sp = rng.normal(0, t * 0.40)
        gx_, gy_ = x0 + ux * L * s + nx * sp, y0 + uy * L * s + ny * sp
        r = t * rng.uniform(0.20, 0.36)
        kinds[int(rng.integers(5))](c, gx_, gy_, r, rng)



def bead_string(c, pts, R, cols, rng, thread=(0.10, 0.07, 0.05)):
    """a thread of glossy glass beads through the points pts (a polyline): each bead is a little sphere with a highlight, a shaded underside and a contact shadow"""
    P = np.array(pts, np.float64)
    seg = np.hypot(*(np.diff(P, axis=0).T))
    cum = np.concatenate([[0], np.cumsum(seg)])
    c.set_source_rgba(*thread, 0.9); c.set_line_width(max(0.6, R * 0.14)); c.new_path(); c.move_to(*P[0])
    for p in P[1:]: c.line_to(*p)
    c.stroke()
    step = R * 2.15
    k = 0
    d = step * 0.5
    while d < cum[-1]:
        i = int(np.searchsorted(cum, d))
        i = min(max(i, 1), len(P) - 1)
        f_ = (d - cum[i - 1]) / max(cum[i] - cum[i - 1], 1e-6)
        x, y = P[i - 1] + (P[i] - P[i - 1]) * f_
        col = cols[k % len(cols)]
        rr = R * rng.uniform(0.92, 1.06)
        c.set_source_rgba(0.04, 0.02, 0.02, 0.32); c.new_path(); c.arc(x + rr * 0.20, y + rr * 0.28, rr * 1.02, 0, TAU); c.fill()
        g = cairo.RadialGradient(x - rr * 0.36, y - rr * 0.40, rr * 0.08, x, y, rr)
        g.add_color_stop_rgb(0, *[min(1.0, v * 1.45 + 0.22) for v in col]); g.add_color_stop_rgb(0.45, *col); g.add_color_stop_rgb(1, *[v * 0.42 for v in col])
        c.set_source(g); c.new_path(); c.arc(x, y, rr, 0, TAU); c.fill()
        c.set_source_rgba(1, 1, 1, 0.88); c.new_path(); c.arc(x - rr * 0.34, y - rr * 0.38, rr * 0.20, 0, TAU); c.fill()
        c.set_source_rgba(1, 1, 1, 0.22); c.new_path(); c.arc(x + rr * 0.30, y + rr * 0.34, rr * 0.30, 0, TAU); c.fill()
        d += step
        k += 1


def bead_swags(c, f, haze, rng):
    """garlands of beads looped along the inside of the door frame, and three short strands with tassels hanging from the rosette: red, gold, pearl, cornflower"""
    cols = [(0.78, 0.07, 0.10), (0.78, 0.07, 0.10), (0.96, 0.78, 0.26), (0.96, 0.94, 0.88), (0.78, 0.07, 0.10), (0.34, 0.52, 0.90), (0.96, 0.78, 0.26)]
    by, hw, ay, t = f['by'], f['hw'], f['ay'], f['t']
    for side in (-1, 1):
        base = np.array([CX + side * hw, by]); apex = np.array([CX, ay])
        d = (apex - base); Ln = float(np.hypot(*d)); d = d / Ln
        nrm = np.array([-d[1], d[0]]); nrm = nrm if nrm[0] * (-side) > 0 else -nrm            # toward the middle of the doorway
        ss = [0.10, 0.34, 0.58, 0.82]
        for a_, b_ in zip(ss[:-1], ss[1:]):
            p0 = base + d * Ln * a_ + nrm * t * 0.78
            p1 = base + d * Ln * b_ + nrm * t * 0.78
            mid = (p0 + p1) / 2 + nrm * t * 0.9 + np.array([0.0, 1.0]) * 0.0
            pts = []
            for q in range(25):
                u = q / 24.0
                pts.append(tuple((1 - u) ** 2 * p0 + 2 * (1 - u) * u * (mid + np.array([0, t * 0.55])) + u * u * p1))
            bead_string(c, pts, max(3.2, t * 0.115), cols, rng)
    # three short strands from the rosette
    r0 = t * 0.80
    for k, sw in enumerate((-1, 0, 1)):
        x_a, y_a = CX + sw * t * 0.35, ay + r0 * 0.7
        ln = t * (2.5 + 0.9 * (k == 1))
        pts = [(x_a + sw * t * 0.7 * math.sin(u * 1.3), y_a + ln * u) for u in np.linspace(0, 1, 18)]
        bead_string(c, pts, max(3.0, t * 0.095), cols[k::2] + cols[:k], rng)
        tx, ty = pts[-1]
        c.set_source_rgb(0.78, 0.07, 0.10); c.new_path(); c.move_to(tx - t * 0.12, ty); c.line_to(tx + t * 0.12, ty); c.line_to(tx + t * 0.07, ty + t * 0.46); c.line_to(tx - t * 0.07, ty + t * 0.46); c.close_path(); c.fill()
        c.set_source_rgb(0.96, 0.78, 0.26); c.new_path(); c.rectangle(tx - t * 0.13, ty - t * 0.02, t * 0.26, t * 0.07); c.fill()



def wreath(c, cx, cy, t, haze, rng):
    """the crown of the door frame: a ring of veined leaves with poppies, cornflowers, daisies and buttercups set in it, a bow of silk behind"""
    from fold import leaf2
    R = t * 0.92
    for k in range(2):                                                                   # silk tails
        sx = -1 if k == 0 else 1
        c.set_source_rgba(0.66, 0.12, 0.16, 0.95); c.new_path(); c.move_to(cx + sx * 4, cy + R * 0.3)
        c.curve_to(cx + sx * R * 0.9, cy + R * 0.9, cx + sx * R * 0.5, cy + R * 1.8, cx + sx * R * 1.2, cy + R * 2.5); c.line_to(cx + sx * R * 0.8, cy + R * 2.45)
        c.curve_to(cx + sx * R * 0.2, cy + R * 1.7, cx + sx * R * 0.6, cy + R * 0.8, cx + sx * 1, cy + R * 0.2); c.close_path(); c.fill()
    for q in range(14):
        a = TAU * q / 14 + 0.2
        px, py = cx + math.cos(a) * R, cy + math.sin(a) * R * 0.92
        c0 = (0.12 + 0.10 * rng.random(), 0.30 + 0.14 * rng.random(), 0.09); c1 = tuple(min(1.0, v * 1.7 + 0.1) for v in c0)
        leaf2(c, px, py, R * 0.62, a + math.pi / 2 + rng.normal(0, 0.3), c0, c1, vein=True)
    kinds = [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup, MD.poppy, MD.oxeye]
    for q in range(10):
        a = TAU * q / 10 + 0.1
        px, py = cx + math.cos(a) * R, cy + math.sin(a) * R * 0.92
        kinds[q % len(kinds)](c, px, py, R * 0.30, rng)
    for q in range(5):
        a = TAU * (q + 0.5) / 5
        px, py = cx + math.cos(a) * R * 0.62, cy + math.sin(a) * R * 0.58
        MD.oxeye(c, px, py, R * 0.20, rng)


def pergola(x0, w, rng, i_lo=0, i_hi=N_FR - 1):
    """the garlanded frames i_lo..i_hi (far first) in one layer"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    c.set_line_join(cairo.LINE_JOIN_ROUND); c.set_line_cap(cairo.LINE_CAP_ROUND)
    for f in reversed(frames()):
        if not (i_lo <= f['i'] <= i_hi): continue
        haze = float(np.clip(1 - math.exp(-(f['Z'] - 3.0) / 40.0), 0, 0.82))
        by, hw, ay, t = f['by'], f['hw'], f['ay'], f['t']
        for side in (-1, 1):
            (draw_pole_big if t >= 22 else INV.draw_pole)(c, (CX + side * hw, by), (CX, ay), t, side, haze, rng)
        if f['i'] <= 6:
            for side in (-1, 1):
                bulbs(c, (CX + side * hw, by), (CX, ay), t, haze, rng)
        r0 = t * 0.80
        if t >= 22:
            wreath(c, CX, ay, t, haze, rng)
        else:
            for q in range(9):
                aa = TAU * q / 9
                c.set_source_rgb(*INV.hz_mix((0.97, 0.94, 0.88), haze)); c.new_path(); c.arc(CX + math.cos(aa) * r0 * 0.9, ay + math.sin(aa) * r0 * 0.9, r0 * 0.5, 0, TAU); c.fill()
            c.set_source_rgb(*INV.hz_mix((0.98, 0.78, 0.24), haze)); c.new_path(); c.arc(CX, ay, r0 * 0.62, 0, TAU); c.fill()
        if f['i'] in (1, 3, 5):
            INV.draw_lantern(c, CX, ay + t * 4.2, max(5.0, t * 0.9), haze, rng)
        if f['i'] == 0:
            bead_swags(c, f, haze, rng)
        for side in (-1, 1):                                                          # blossoms and a tuft of grass at the foot of each pole
            for q in range(2 if f['i'] > 1 else 4):
                fx_ = CX + side * hw + rng.normal(0, t * 1.0); fy_ = by + rng.normal(0, t * 0.22) - (4 if f['i'] == 0 else 0)
                rr_ = max(2.2, t * 0.34)
                MD.stem(c, fx_, fy_ + rr_ * 2.2, fy_, rng.normal(0, rr_ * 0.4), max(0.8, rr_ * 0.10))
                [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup][int(rng.integers(4))](c, fx_, fy_, rr_, rng)
    return L.get()


# ------------------------------------------------------------------------------------------------------------------ the inside

def glow_core(x0, w):
    """the light at the end of the corridor: a hot core and a halo (no shafts: the shafts belong to the open air)"""
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    r = np.hypot(xs - CX, ys - (HZ - 2)) + 1e-3
    g = np.exp(-(r / 30.0) ** 1.4) * 0.85 + np.exp(-(r / 120.0) ** 1.2) * 0.34
    return (g * 0.9)[..., None] * np.array([1.0, 0.90, 0.66], np.float32)


def interior(x0, w, rng):
    """what the open door shows: one-point perspective, an A-frame corridor - two roof planes of oxblood boards, a honey floor of boards strewn with petals, a few lit windows -
    and the golden light at its end. Returns an (H, w, 3) picture of the whole corridor (the caller uses it only inside the door)."""
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    ys = np.arange(H, dtype=np.float32)[:, None]
    dx, dy = xs - CX, ys - HZ
    f0 = frames()[0]
    ex, ey = -f0['hw'], f0['by'] - HZ                                   # VP -> left base corner
    fx_, fy_ = f0['hw'], f0['ay'] - f0['by']                             # base corner -> apex  (left pole direction)
    den = ex * fy_ - ey * fx_
    h1 = lambda a: np.sin(a * 12.9898 + 4.1) * 43758.5453 % 1.0
    floor = (dy > 0) & (np.abs(dx) * ey < -ex * dy)
    lam_f = np.maximum(dy, 1e-3) / ey                                    # 1 at the door, 0 at the light
    u_f = dx / np.maximum(lam_f, 1e-4) / f0['hw']
    adx = np.abs(dx)                                                      # the right wall is the mirror of the left
    lam_w = (adx * fy_ - dy * fx_) / den
    mu_w = (ex * dy - ey * adx) / den
    lam_w = np.maximum(lam_w, 1e-4)
    v_w = np.clip(mu_w / lam_w, 0, 1.2)
    lam = np.where(floor, lam_f, lam_w)
    r = 1.0 / np.maximum(lam, 1e-4)
    lr = np.log(np.maximum(r, 1.0)) / math.log(1.3)                       # depth in frame units
    # ---- the floor: honey boards running to the light, butt joints staggered, a little worn, the glow on it
    jb = np.floor((u_f + 1.0) * 6.0)
    fb = (u_f + 1.0) * 6.0 - jb
    jt = h1(jb * 3.1)
    seam = np.exp(-(np.minimum(fb, 1 - fb) / (0.035 + 0.02 * lam)) ** 2)
    jn = np.exp(-((np.minimum(np.mod(lr * 1.7 + jt * 3.0, 1.0), 1 - np.mod(lr * 1.7 + jt * 3.0, 1.0))) / (0.05)) ** 2) * (lam > 0.12)
    honey = np.array([0.78, 0.58, 0.32], np.float32) * (0.82 + 0.26 * jt)[..., None] * (1 - 0.40 * seam[..., None]) * (1 - 0.30 * jn[..., None])
    gr = fbm(x0, 0, w, H, 40, 3, 411, aniso=8.0)
    honey = honey * (1 + 0.10 * gr[..., None])
    # ---- the walls: oxblood boards along the corridor, lighter bevel, dark seam
    nb = 15.0
    wb = np.floor(v_w * nb)
    wf = v_w * nb - wb
    wt = h1(wb * 5.3 + 1.0)
    wseam = np.exp(-(np.minimum(wf, 1 - wf) / (0.05 + 0.03 * lam)) ** 2)
    wj = np.exp(-((np.minimum(np.mod(lr * 1.3 + wt * 2.0, 1.0), 1 - np.mod(lr * 1.3 + wt * 2.0, 1.0))) / 0.06) ** 2) * (lam > 0.12)
    oxb = np.array([0.50, 0.10, 0.12], np.float32) * (0.78 + 0.34 * wt)[..., None]
    oxb = oxb * (1 + 0.32 * np.exp(-((wf - 0.12) / 0.10) ** 2)[..., None]) * (1 - 0.46 * wseam[..., None]) * (1 - 0.32 * wj[..., None])
    side_l = (dx < 0)
    base = np.where(floor[..., None], honey, oxb)
    # ---- light: dark near the door, glowing toward the end; the floor takes the glow as a bright road
    far = np.clip(1.0 - lam, 0, 1)
    shade = 0.20 + 0.80 * far ** 1.25
    col = base * shade[..., None]
    road = np.exp(-(u_f / 0.55) ** 2) * floor * far ** 0.8
    col = col + road[..., None] * np.array([0.60, 0.42, 0.18], np.float32) * 0.8
    col = col + glow_core(x0, w) * 1.0
    col = 1 - (1 - np.clip(col, 0, 1)) * (1 - np.clip(far[..., None] ** 3.2 * np.array([0.85, 0.62, 0.30], np.float32) * 0.50, 0, 1))
    # ---- lit windows on both roof planes (cream panes with mullions, like the hallway's), petals on the floor
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    ex2, ey2 = ex, ey
    def wallpt(sd, rr, v):
        px, py = (ex2 + v * fx_) / rr, (ey2 + v * fy_) / rr
        return CX + sd * px, HZ + py
    for sd in (-1, 1):
        for (ra, rb_) in ((1.55, 2.05), (2.65, 3.25), (4.2, 5.0)):
            for (va, vb) in ((0.36, 0.66),):
                q = [wallpt(sd, ra, va), wallpt(sd, rb_, va), wallpt(sd, rb_, vb), wallpt(sd, ra, vb)]
                haze = float(np.clip(1 - math.exp(-(ra - 1.0) / 3.5), 0, 0.7))
                c.new_path(); c.move_to(*q[0]); [c.line_to(*p) for p in q[1:]]; c.close_path()
                c.set_source_rgba(*INV.hz_mix((1.0, 0.93, 0.74), haze * 0.5), 0.95); c.fill_preserve()
                c.set_source_rgba(0.30, 0.18, 0.08, 0.9); c.set_line_width(max(1.2, 3.2 / ra)); c.stroke()
                for fr_ in (0.5,):
                    a_ = ((q[0][0] + (q[1][0] - q[0][0]) * fr_), (q[0][1] + (q[1][1] - q[0][1]) * fr_)); b_ = ((q[3][0] + (q[2][0] - q[3][0]) * fr_), (q[3][1] + (q[2][1] - q[3][1]) * fr_))
                    c.move_to(*a_); c.line_to(*b_); c.stroke()
                a_ = ((q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2); b_ = ((q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2)
                c.move_to(*a_); c.line_to(*b_); c.stroke()
    for q in range(260):                                                    # petals on the floor, in perspective
        rr = 1.0 + 9.0 * rng.random() ** 1.5
        uu = rng.uniform(-0.95, 0.95)
        px, py = CX + uu * f0['hw'] / rr, HZ + (f0['by'] - HZ) / rr
        s = 1.0 / rr
        col_ = [(0.98, 0.94, 0.88), (0.96, 0.78, 0.80), (0.98, 0.84, 0.30), (0.62, 0.72, 0.95)][int(rng.integers(4))]
        c.set_source_rgba(*col_, 0.92); c.new_path(); c.save(); c.translate(px, py); c.rotate(rng.uniform(0, 3)); c.scale(7.0 * s + 0.8, 3.0 * s + 0.4); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    rr_, ra_ = L.get()
    col = col * (1 - ra_[..., None]) + rr_
    return np.clip(col, 0, 1).astype(np.float32)


# ------------------------------------------------------------------------------------------------------------------ ground, wall-foot meadow, steps' light
def ground(x0, w, rng):
    """what is behind and below the house: the dusk sky of slide 9 at the top (only seen at the very corners), the meadow with the mown path below the wall's foot"""
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    sky_t = smoothstep(0, HZ + 40, ys)
    sky = np.array([0.42, 0.46, 0.76], np.float32) * (1 - sky_t)[..., None] + np.array([0.98, 0.72, 0.58], np.float32) * sky_t[..., None]
    t = smoothstep(DOOR_Y - 10, H, ys)
    col = np.array([0.40, 0.46, 0.15], np.float32) * (1 - t)[..., None] + np.array([0.24, 0.34, 0.10], np.float32) * t[..., None]
    n = fbm01(x0, 0, w, H, 30, 4, 413, aniso=1.4)
    col = col * (0.82 + 0.34 * n[..., None])
    land = smoothstep(HZ + 30, HZ + 90, ys)[..., None]
    col = sky * (1 - land) + col * land
    dyy = np.maximum(ys - HZ, 1.0)
    pw = 0.78 * dyy / 1.55                                              # the path is 1.5 m wide: edges run to the vanishing point
    onp = np.clip(1 - (np.abs(xs - CX) - pw) / 14.0, 0, 1) * (ys > DOOR_Y)
    stripe = 0.5 + 0.5 * np.sin(dyy * 0.19)
    path = np.array([0.80, 0.72, 0.40], np.float32) * (0.90 + 0.12 * stripe[..., None])
    col = col * (1 - 0.82 * onp[..., None]) + path * 0.82 * onp[..., None]
    return col


def wallfoot(x0, w, rng):
    """tall grass, poppies, cornflowers and daisies standing against the foot of the wall on the LEFT of the steps (the plants on the right are the cluster sprite)"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    MD.grass(c, rng, CX - 760, 430, DOOR_Y - 30, DOOR_Y + 70, 190, 40, 120)
    kinds = [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup, MD.clover]
    pts = []
    for q in range(26):
        xx = CX - rng.uniform(300, 760)
        y = rng.uniform(DOOR_Y + 8, DOOR_Y + 150)
        pts.append((y, xx))
    pts.sort()
    for (y, xx) in pts:
        r = 12 + 22 * (y - DOOR_Y) / 150.0 * rng.uniform(0.8, 1.2)
        hgt = r * rng.uniform(1.8, 3.0)
        MD.stem(c, xx, y + hgt, y, rng.normal(0, r * 0.4), max(1.0, r * 0.10))
        MD.leafpair(c, xx, y + hgt * 0.55, r * 1.2, rng)
        kinds[int(rng.integers(5))](c, xx, y, r, rng)
    MD.grass(c, rng, CX - 760, 330, DOOR_Y + 40, DOOR_Y + 130, 120, 30, 90)
    return L.get()


def cluster(x0, w, rng):
    """the plants close to the camera at the lower right of the doorway: poppies, ox-eye daisies, cornflowers and buttercups on tall stems among long grass, low beside the twins
    and rising to the right, thinning out into the hallway's threshold. It is its own painted layer (never turned into a drawing): the hallway's frame stands behind it."""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    xa = CX + 150
    for (u0, u1, hlo, hhi, n) in ((xa, xa + 190, 50, 150, 90), (xa + 190, xa + 380, 80, 230, 130), (xa + 380, xa + 560, 90, 270, 110), (xa + 560, xa + 700, 70, 200, 40)):
        MD.grass(c, rng, u0, u1 - u0, 1262, 1362, n, hlo, hhi)
    kinds = [MD.poppy, MD.oxeye, MD.cornflower, MD.buttercup, MD.poppy, MD.oxeye]
    pts = []
    for q in range(22):
        xx = rng.uniform(xa + 30, xa + 560)
        yy = rng.uniform(1210, 1345)
        pts.append((yy, xx))
    pts.sort()
    for (yy, xx) in pts:
        r = 20 + 20 * (yy - 1210) / 135.0 * rng.uniform(0.8, 1.2)
        hgt = r * rng.uniform(2.6, 4.6) * (0.7 + 0.5 * (xx - xa) / 560.0)
        MD.stem(c, xx, yy + hgt, yy, rng.normal(0, r * 0.5), max(1.2, r * 0.10))
        MD.leafpair(c, xx, yy + hgt * 0.55, r * 1.3, rng)
        kinds[int(rng.integers(len(kinds)))](c, xx, yy, r, rng)
    MD.grass(c, rng, xa, 560, 1334, 1368, 90, 60, 170)
    return L.get()


def foreground(x0, w, rng):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    MD.grass(c, rng, CX - 700, 1120, 1312, 1362, 120, 24, 78)
    for q in range(16):
        xx = CX + rng.uniform(-640, 400); y = rng.uniform(1300, 1346)
        if abs(xx - CX) < 70 and rng.random() < 0.8: continue
        r = rng.uniform(24, 40)
        hgt = r * rng.uniform(1.8, 2.8)
        MD.stem(c, xx, y + hgt, y, rng.normal(0, r * 0.4), max(1.4, r * 0.10))
        [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup][int(rng.integers(4))](c, xx, y, r, rng)
    MD.grass(c, rng, CX - 700, 1120, 1338, 1368, 50, 46, 120)
    return L.get()



def wall_light(img, ha, x0, w):
    """golden-hour light on the planks: raking from the upper left, falling off to the lower right, with the dapple of the trees that stand beside us"""
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    u = np.clip((xs - (CX - 540)) / 1080.0, 0, 1)
    v = np.clip(ys / 1350.0, 0, 1)
    ramp = 1.10 - 0.30 * (0.60 * u + 0.40 * v)
    n = fbm01(x0, 0, w, H, 70, 3, 521, aniso=1.0)
    diag = 0.5 + 0.5 * np.sin((xs * 0.55 + ys * 0.83) / 210.0 + 1.2 * fbm(x0, 0, w, H, 120, 2, 522))
    dap = cv2.GaussianBlur(smoothstep(0.46, 0.74, n * 0.70 + diag * 0.34), (0, 0), 7.0)
    k = 1.0 - 0.10 * dap * np.clip((1.05 - v), 0, 1)
    light = (ramp * k)[..., None] * np.array([1.0, 0.97, 0.92], np.float32)
    m = ha[..., None] * (ys < DOOR_Y + 6)[..., None]
    return img * (1 - m) + img * light * m

# ------------------------------------------------------------------------------------------------------------------ the picture
def render_close(with_girls=True, verbose=True):
    """-> (img (H, WC, 3), masks dict)  - the finished close-up in design coordinates, x0 = X0C"""
    import time
    t0 = time.time()
    rng = np.random.default_rng(1111)
    x0, w = X0C, WC
    img = ground(x0, w, rng)
    hrgb, ha, door, deco = HS.render_house_k(K, RX0, RY0, w, H, wide_x=150.0)
    inner = interior(x0, w, rng)
    img = img * (1 - door[..., None]) + inner * door[..., None]
    pb, pba = pergola(x0, w, rng, 1, N_FR - 1)                              # the frames inside the corridor
    pb, pba = pb * door[..., None], pba * door
    img = img * (1 - pba[..., None]) + pb
    # festoons of bunting between the apexes of the first frames, and the glow once more over the corridor
    fr = frames()
    pal = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    inner_only = np.zeros_like(img)
    for a_, b_ in zip(fr[:4], fr[1:5]):
        sub = img.copy()
        CR.festoon(sub, (CX - x0, a_['ay'] + 4), (CX - x0, b_['ay'] + 4), 0.2 * (a_['ay'] - b_['ay']), 6, rng, fw=max(6, 0.9 * a_['t']), pal=pal)
        img = img * (1 - door[..., None]) + sub * door[..., None]
    gl = glow_core(x0, w)
    img = 1 - (1 - img) * (1 - np.clip(gl * 0.35, 0, 1) * door[..., None])
    if verbose: print('inside', round(time.time() - t0, 1))
    img = img * (1 - ha[..., None]) + hrgb                                  # the house, with the door open
    # the light of the corridor spills over the steps and the threshold
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    spill = np.exp(-(((xs - CX) / 330.0) ** 2 + ((ys - (DOOR_Y + 70)) / 120.0) ** 2)) * (ys > DOOR_Y - 4)
    img = 1 - (1 - img) * (1 - 0.46 * spill[..., None] * np.array([1.0, 0.74, 0.36], np.float32))
    pf, pfa = pergola(x0, w, rng, 0, 0)                                      # the door frame itself, garlanded
    img = img * (1 - pfa[..., None]) + pf
    wf, wfa = wallfoot(x0, w, rng)
    img = img * (1 - wfa[..., None]) + wf
    m_foot = wfa
    img = wall_light(img, ha, x0, w)
    # bunting between the two wall lanterns, over the door
    lx_a = (HS.CXG - 168 - RX0) * K; lx_b = (HS.CXG + 168 - RX0) * K; ly = (HS.BASE_Y - 290 - RY0) * K - 30
    pal = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    CR.festoon(img, (lx_a + 6, ly), (lx_b - 6, ly), 175, 30, rng, fw=34, pal=pal)
    if verbose: print('house', round(time.time() - t0, 1))
    people = np.zeros((H, w), np.float32)
    if with_girls:
        gc, ga, gs = INV.girls(x0, w)
        img = img * (1 - 0.55 * gs[..., None]) + np.array([0.07, 0.09, 0.24], np.float32) * (0.55 * gs[..., None])
        img = img * (1 - ga[..., None]) + gc * ga[..., None]
        people = ga
        if verbose: print('girls', round(time.time() - t0, 1))
    fg, fga = foreground(x0, w, rng)
    img = img * (1 - fga[..., None]) + fg
    cl_, cla = cluster(x0, w, rng)
    m_fg = fga
    # golden-hour light on everything: warm from the left, a soft vignette, a little bloom round the lamps
    bright = np.clip(img - 0.78, 0, 1)
    img = 1 - (1 - img) * (1 - 0.30 * cv2.GaussianBlur(bright, (0, 0), 18))
    vig = 1 - 0.22 * (((xs - CX) / 700.0) ** 2 + ((ys - 760) / 900.0) ** 2)
    img = img * vig[..., None]
    return np.clip(img, 0, 1).astype(np.float32), dict(house=ha, people=people, door=door, pergola=pfa, foot=m_foot, fg=m_fg, deco=deco, cluster=(cl_, cla))


def living(out, x0, w):
    """crisp touches on the finished picture: fireflies waking in the grass, butterflies on the twins' hands"""
    rng = np.random.default_rng(4321)
    CR.fireflies(out, rng, 22, (CX - 560 - x0, CX + 560 - x0), (1180, 1300), size=(1.4, 3.4), glow=0.95)
    CR.fireflies(out, rng, 16, (CX - 330 - x0, CX + 330 - x0), (700, 1000), size=(1.2, 3.0), glow=0.7)
    items = [(CX - INV.SPACING / 2 - 0.285 * INV.T_G - x0 - 14, INV.FEET_Y - 0.80 * INV.T_G - 30, 20, 0.5, 'monarch', 0.7, 3), (CX + INV.SPACING / 2 + 0.285 * INV.T_G - x0 + 16, INV.FEET_Y - 0.80 * INV.T_G - 26, 18, -0.4, 'white', 0.6, 5)]
    CR.butterflies(out, items)
    return out


def finished(with_girls=True, verbose=True):
    import ink as INK
    img, m = render_close(with_girls=with_girls, verbose=verbose)
    ha, people = m['house'], m['people']
    keep = np.clip(0.55 * (ha > 0.5) + 0.65 * (people > 0.5) + 0.60 * (m['pergola'] > 0.2) + 0.75 * (m['foot'] > 0.3) + 0.75 * (m['fg'] > 0.3) + 0.50 * (m['door'] > 0.5), 0, 1).astype(np.float32)
    keep = cv2.GaussianBlur(keep, (0, 0), 2.0)
    out = INK.finish(img, lines=[(ha > 0.5, 2.6, 0.95), (people > 0.5, 1.6, 0.85)], keep=keep, seed=9, light_x=-1.0)
    out = living(out, X0C, WC)
    return np.clip(out, 0, 1).astype(np.float32), m


if __name__ == '__main__':
    import sys, time
    t = time.time()
    quick = len(sys.argv) > 1 and sys.argv[1] == 'nogirls'
    out, m = finished(with_girls=not quick)
    print('close', round(time.time() - t, 1), 's')
    if not quick:
        cache_save('f_close', X0C, out)
        masks = np.stack([m['people'], m['pergola'], m['deco'], np.maximum(m['foot'], m['fg'])], -1)           # who stands in front of what: the compose puts the hallway frame BEHIND these
        cache_save('f_close_masks', X0C, masks)
        cl_, cla = m['cluster']
        cache_save('f_close_cluster', X0C, np.concatenate([cl_, cla[..., None]], -1))                           # the plants at the lower right: a painted layer composited last
    save_png(WORK + '/close_test.png', out[:, int(CX - 540 - X0C):int(CX + 540 - X0C)])
