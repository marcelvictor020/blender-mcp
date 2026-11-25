"""Slides 3-5: the REAL pond - the same world as the folk scene, now painterly-realistic (x 2000..5300).

Everything that was flat folk paint is here again at the same coordinates: the flock, the white-robed procession on the far
shore, the lily pads and lotuses, the reeds along the shore, the cloud ribbon - and the sleeping cloud-face whose breath it is.
The lantern girl is drawn with the painted-figure engine and lit by her own lamp.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
import water as W
import boat as BT
import trees as TR
import fig
from fig import Light
from folk import ribbon_puffs, Z
import sculpt as SC
from scene12 import shore_y

TAU = 2 * math.pi
X0, X1 = 2000, 8200
CW = X1 - X0


# ============================================================================================ small realistic things
def draw_bird_real(c, x, y, s, ang, seed, phase):
    """gull-like silhouette in flight, wings raised/lowered by phase; drawn on a cairo context in canvas coords"""
    c.save()
    c.translate(x, y)
    c.rotate(ang)
    c.scale(s, s)
    up = math.sin(phase)
    for side, sh in ((1, 1.0), (-1, 0.82)):                                # near wing, far wing
        wy = -1.05 * up * sh
        c.new_path()
        c.move_to(0.30, 0.0)
        c.curve_to(0.15, -0.30 * sh, -0.20, wy * 0.65 - 0.2 * sh, -0.78, wy - 0.06)
        c.curve_to(-0.62, wy * 0.45 + 0.05, -0.30, -0.02, -0.06, 0.13)
        c.close_path()
        c.set_source_rgba(0.045, 0.060, 0.105, 0.92 if side == 1 else 0.70)
        c.fill()
    c.new_path(); c.save(); c.scale(1.0, 0.24); c.arc(0.05, 0, 0.78, 0, TAU); c.restore()
    c.set_source_rgba(0.04, 0.05, 0.09, 0.95); c.fill()
    c.new_path(); c.arc(0.86, -0.04, 0.17, 0, TAU); c.fill()
    c.new_path(); c.move_to(1.0, -0.06); c.line_to(1.22, -0.01); c.line_to(1.0, 0.04); c.close_path(); c.fill()
    c.new_path(); c.move_to(-0.64, 0.0); c.line_to(-1.02, -0.10); c.line_to(-1.02, 0.10); c.close_path(); c.fill()
    c.restore()


def birds_layer(x0, w):
    L = Layer(w, H, x0, 0, ss=2)
    for (bx, by, bs, ba, seed) in BIRDS:
        if bx < 2300: continue
        if FACE['cx'] - 0.55 * FACE['S'] < bx < FACE['cx'] + 0.50 * FACE['S'] and FACE['cy'] - 0.65 * FACE['S'] < by < FACE['cy'] + 0.60 * FACE['S']: continue
        draw_bird_real(L.ctx, bx, by, bs * 0.95, ba * 0.7, seed, (seed % 100) * 0.4 + bx * 0.011)
    rgb, a = L.get()
    a = cv2.GaussianBlur(a, (0, 0), 0.7)
    return rgb, a


def procession_layer(x0, w):
    """the white-robed walkers on the far shore + their reflections in the water (same x as the folk procession)"""
    canvas = np.zeros((H, w, 3), np.float32)
    alpha = np.zeros((H, w), np.float32)
    ref_c = np.zeros((H, w, 3), np.float32)
    ref_a = np.zeros((H, w), np.float32)
    moonL = Light(key_dir=(-0.35, -0.55, 0.70), key_col=(0.62, 0.70, 0.95), key_gain=0.85, amb_col=(0.34, 0.34, 0.52), amb_gain=0.55,
                  bounce_col=(0.20, 0.16, 0.14), bounce_gain=0.2, rim_dir=(0.9, -0.2, 0.1), rim_col=(1.0, 0.62, 0.35), rim_gain=0.55)
    for i, (x, h, sd) in enumerate(PROCESSION):
        if not (x0 - 20 < x < x0 + w + 20) or x < 2150: continue
        T = max(14, int(h * 1.15))
        sp = fig.render(T, dict(view='front' if i % 2 else 'side', facing=1 if i % 3 else -1, arm_l=(-0.118, 0.47), arm_r=(0.118, 0.47), crown=(i % 3 == 0),
                                 feet=False, hair=(0.40, 0.28, 0.16), lantern=('r' if i % 4 == 0 else None)), moonL, seed=sd, ss=2)
        ox, oy = sp['anchor']
        y_feet = HZ + 8
        x0s, y0s = int(round(x - x0 - ox)), int(round(y_feet - oy))
        a_ = sp['a']; rgb = sp['rgb']
        hh, ww = a_.shape
        ya, yb = max(0, y0s), min(H, y0s + hh)
        xa, xb = max(0, x0s), min(w, x0s + ww)
        if ya >= yb or xa >= xb: continue
        sl = (slice(ya - y0s, yb - y0s), slice(xa - x0s, xb - x0s))
        canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - a_[sl][..., None]) + rgb[sl]
        alpha[ya:yb, xa:xb] = np.maximum(alpha[ya:yb, xa:xb], a_[sl])
        # reflection: the same sprite flipped below the shore line, soft + dim
        fl_rgb, fl_a = rgb[::-1], a_[::-1]
        ry0 = int(round(y_feet + 2))
        ya2, yb2 = max(0, ry0), min(H, ry0 + hh)
        if ya2 < yb2:
            ref_c[ya2:yb2, xa:xb] = ref_c[ya2:yb2, xa:xb] * (1 - fl_a[:yb2 - ya2, xa - x0s:xb - x0s][..., None]) + fl_rgb[:yb2 - ya2, xa - x0s:xb - x0s]
            ref_a[ya2:yb2, xa:xb] = np.maximum(ref_a[ya2:yb2, xa:xb], fl_a[:yb2 - ya2, xa - x0s:xb - x0s])
        if i % 4 == 0:                                                       # their little lanterns: warm points + reflected streaks
            lx, ly = x + 0.22 * T, y_feet - 0.50 * T
            cv2.circle(canvas, (int(lx - x0), int(ly)), 1, (1.0, 0.76, 0.40), -1)
    ref_a = cv2.GaussianBlur(ref_a, (0, 0), sigmaX=2.0, sigmaY=1.1) * 0.28
    ref_c = cv2.GaussianBlur(ref_c, (0, 0), sigmaX=2.0, sigmaY=1.1)
    return canvas, alpha, ref_c, ref_a


def pads_layer(x0, w):
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    r = Z(5)
    for i, (x, y, sd) in enumerate(PADS):
        if not (x0 - 60 < x < x0 + w + 60): continue
        if y < shore_y(x) + 28: continue
        s = 0.5 + (y - HZ) / 380.0
        rx, ry = 34 * s, 10 * s
        # reflection / contact shadow
        c.set_source_rgba(0.0, 0.03, 0.04, 0.45)
        c.new_path(); c.save(); c.translate(x + 2 * s, y + 3 * s); c.scale(rx * 1.04, ry * 1.1); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        g = cairo.RadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, rx)
        g.add_color_stop_rgba(0, 0.36, 0.46, 0.22, 1); g.add_color_stop_rgba(0.7, 0.14, 0.27, 0.16, 1); g.add_color_stop_rgba(1, 0.06, 0.15, 0.12, 1)
        c.new_path(); c.save(); c.translate(x, y); c.scale(rx, ry); c.arc(0, 0, 1, math.radians(18), math.radians(342)); c.line_to(0, 0); c.close_path(); c.restore()
        c.set_source(g); c.fill()
        c.set_source_rgba(0.70, 0.82, 0.55, 0.45); c.set_line_width(max(0.8, 1.0 * s))
        c.new_path(); c.save(); c.translate(x, y); c.scale(rx * 0.98, ry * 0.95); c.arc(0, 0, 1, math.radians(200), math.radians(335)); c.restore(); c.stroke()
        if i % 4 == 0:                                                       # lotus
            fx, fy = x - 6 * s, y - 8 * s
            for k, (rad, col) in enumerate(((16 * s, (0.78, 0.55, 0.62)), (12 * s, (0.92, 0.80, 0.82)))):
                for p in range(8 if k == 0 else 6):
                    a_ = TAU * p / (8 if k == 0 else 6) + k * 0.3
                    c.save(); c.translate(fx + math.cos(a_) * rad * 0.45, fy + math.sin(a_) * rad * 0.26); c.rotate(a_)
                    c.scale(rad * 0.62, rad * 0.30); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore()
                    c.set_source_rgba(col[0], col[1], col[2], 0.95); c.fill()
            c.set_source_rgba(0.96, 0.78, 0.30, 1); c.new_path(); c.arc(fx, fy, 3.0 * s, 0, TAU); c.fill()
    return L.get()


def bank_layer(x0, w):
    """the lake's meadow bank (land between the horizon and the shore curve), blue-hour, with the same reeds as the folk scene"""
    L = Layer(w, H, x0, 0, ss=2)
    c = L.ctx
    xs = np.arange(max(x0 - 20, 1000), min(x0 + w + 20, 3300), 6.0)
    ys = shore_y(xs)
    mask_x = xs < 3200
    xs, ys = xs[mask_x], ys[mask_x]
    c.new_path(); c.move_to(xs[0], HZ)
    for x_ in xs: c.line_to(float(x_), HZ)
    for x_, y_ in zip(xs[::-1], ys[::-1]): c.line_to(float(x_), float(y_))
    c.close_path()
    g = cairo.LinearGradient(0, HZ, 0, 1000)
    g.add_color_stop_rgba(0, 0.07, 0.14, 0.14, 1); g.add_color_stop_rgba(1, 0.10, 0.20, 0.16, 1)
    c.set_source(g); c.fill_preserve()
    c.save(); c.clip()
    r = Z(44)
    for i in range(900):
        x = r.uniform(xs[0], xs[-1]); y = r.uniform(HZ, 1000)
        if y > float(shore_y(x)): continue
        c.set_source_rgba(0.22 + 0.2 * r.random(), 0.34 + 0.2 * r.random(), 0.22, r.uniform(0.15, 0.4))
        c.set_line_width(1.3); c.new_path(); c.move_to(x, y); c.line_to(x + r.normal(0, 2), y - r.uniform(5, 14)); c.stroke()
    c.restore()
    c.set_source_rgba(0.80, 0.88, 0.95, 0.35); c.set_line_width(2.2)
    c.new_path(); c.move_to(float(xs[0]), float(ys[0]) + 3)
    for x_, y_ in zip(xs, ys): c.line_to(float(x_), float(y_) + 3)
    c.stroke()
    for rd in REEDS:
        x = rd['x']; y = float(shore_y(x)) + 3
        if y < HZ + 25 or not (x0 - 30 < x < x0 + w + 30): continue
        sc = 0.6 + (y - HZ) / 420.0
        for k in range(rd['nb']):
            xo = x + (k - 2) * 5 * sc
            hh = rd['hs'][k] * sc
            sw1, sw2 = rd['sway'][k]
            c.set_source_rgba(0.05, 0.10, 0.07, 1); c.set_line_width(3.2 * sc)
            c.new_path(); c.move_to(xo, y); c.curve_to(xo + 2 * sc, y - hh * .5, xo + sw1 * sc, y - hh * .8, xo + sw2 * sc, y - hh); c.stroke()
            c.set_source_rgba(0.38, 0.46, 0.22, 0.85); c.set_line_width(1.5 * sc)
            c.new_path(); c.move_to(xo + 0.8 * sc, y); c.curve_to(xo + 2.8 * sc, y - hh * .5, xo + sw1 * sc + 0.8, y - hh * .8, xo + sw2 * sc + 0.8, y - hh); c.stroke()
        if rd['cat']:
            c.set_source_rgba(0.20, 0.12, 0.08, 1)
            c.new_path(); c.save(); c.translate(x + rd['cat_dx'] * sc, y - rd['cat_h'] * sc); c.scale(4.6 * sc, 13 * sc); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    return L.get()


def bark_face_layer(x0, w):
    """an old face in the bark of the right-hand trunk, looking at the lantern: eyes, brows, nose ridge, a moss beard"""
    L = Layer(w, H, x0, 0, ss=3)
    c = L.ctx
    fx, fy = 4160.0, 900.0                                                # on the trunk, a little under the arch
    s = 1.0
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    for sx in (-1, 1):
        ex, ey = fx + sx * 24 * s, fy
        g = cairo.RadialGradient(ex, ey, 0, ex, ey, 14 * s)
        g.add_color_stop_rgba(0, 0.0, 0.0, 0.0, 0.85); g.add_color_stop_rgba(1, 0.0, 0.0, 0.0, 0)
        c.set_source(g); c.new_path(); c.save(); c.translate(ex, ey); c.scale(1.0, 0.66); c.arc(0, 0, 14 * s, 0, TAU); c.restore(); c.fill()
        c.set_source_rgba(1.0, 0.72, 0.36, 0.55)                          # a glint of lantern light in the hollow
        c.new_path(); c.arc(ex - sx * 3 * s, ey - 2 * s, 1.8 * s, 0, TAU); c.fill()
        c.set_source_rgba(0.02, 0.02, 0.02, 0.75); c.set_line_width(5 * s)                               # heavy brow
        c.new_path(); c.move_to(ex - sx * 14 * s, ey - 14 * s); c.curve_to(ex - sx * 4 * s, ey - 22 * s, ex + sx * 8 * s, ey - 20 * s, ex + sx * 18 * s, ey - 9 * s); c.stroke()
    c.set_source_rgba(0.62, 0.50, 0.36, 0.32); c.set_line_width(8 * s)                                   # nose ridge
    c.new_path(); c.move_to(fx - 2 * s, fy - 6 * s); c.curve_to(fx + 4 * s, fy + 14 * s, fx + 2 * s, fy + 30 * s, fx - 2 * s, fy + 40 * s); c.stroke()
    c.set_source_rgba(0.01, 0.01, 0.01, 0.80); c.set_line_width(4 * s)                                   # mouth crack
    c.new_path(); c.move_to(fx - 26 * s, fy + 62 * s); c.curve_to(fx - 8 * s, fy + 74 * s, fx + 12 * s, fy + 72 * s, fx + 28 * s, fy + 58 * s); c.stroke()
    r = Z(3)
    for i in range(60):                                                                                  # moss beard
        c.set_source_rgba(0.20 + 0.15 * r.random(), 0.34 + 0.15 * r.random(), 0.13, r.uniform(0.35, 0.75))
        px, py = fx + r.normal(0, 18) * s, fy + 78 * s + abs(r.normal(0, 16)) * s
        c.new_path(); c.arc(px, py, r.uniform(2, 5) * s, 0, TAU); c.fill()
    rgb, a = L.get()
    return rgb, cv2.GaussianBlur(a, (0, 0), 1.4) * 0.62


def star_mask_fade(x0, w):
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    return 1.0 - smoothstep(4700, 6200, xs)


# ============================================================================================ the boat + girl
def render_boat2():
    """hull back -> lantern girl (figure engine, lit by her own lamp) -> hull front, in the boat's own layer"""
    L1 = Layer(BT.BW, BT.BH, BT.BX0, BT.BY0, 3)
    BT.draw_hull_back(L1.ctx)
    hb_rgb, hb_a = L1.get()
    L2 = Layer(BT.BW, BT.BH, BT.BX0, BT.BY0, 3)
    BT.draw_hull_front(L2.ctx)
    hf_rgb, hf_a = L2.get()
    T = 336
    lamp = (1.0, 0.64, 0.28)
    light = Light(key_dir=(0.80, 0.18, 0.58), key_col=lamp, key_gain=0.95, amb_col=(0.30, 0.38, 0.60), amb_gain=0.48,
                  bounce_col=(0.34, 0.24, 0.12), bounce_gain=0.35, rim_dir=(-0.9, -0.25, 0.2), rim_col=(0.42, 0.55, 0.92), rim_gain=0.55)
    pose = dict(view='front', yaw=-0.22, arm_r=(0.215, 0.605), elbow_r=(0.150, 0.655), lantern='r', arm_l=(-0.118, 0.470),
                smile=0.18, hair=(0.46, 0.29, 0.15), dress=(0.93, 0.90, 0.82), skin=(0.90, 0.72, 0.62), feet=False, hem_y=0.0,
                plights=[(0.225, 0.560, 0.13, lamp, 1.15, 0.30)])
    sp = fig.render(T, pose, light, seed=21)
    gx, gy = GIRL_X, 952.0
    ox, oy = sp['anchor']
    X0s, Y0s = int(round(gx - ox - BT.BX0)), int(round(gy - oy - BT.BY0))
    rgb = hb_rgb.copy(); a = hb_a.copy()
    sa, srgb = sp['a'], sp['rgb']
    h, ww = sa.shape
    ya, yb = max(0, Y0s), min(BT.BH, Y0s + h)
    xa, xb = max(0, X0s), min(BT.BW, X0s + ww)
    sl = (slice(ya - Y0s, yb - Y0s), slice(xa - X0s, xb - X0s))
    rgb[ya:yb, xa:xb] = rgb[ya:yb, xa:xb] * (1 - sa[sl][..., None]) + srgb[sl]
    a[ya:yb, xa:xb] = a[ya:yb, xa:xb] * (1 - sa[sl]) + sa[sl]
    rgb = rgb * (1 - hf_a[..., None]) + hf_rgb
    a = np.clip(a * (1 - hf_a) + hf_a, 0, 1)
    lx, ly = sp['lantern']
    BT.LANTERN = (gx - ox + lx, gy - oy + ly)                             # all the lamp light below follows the new lantern
    return rgb, a


# ============================================================================================ assembly
def render_pond(x0=X0, w=CW, paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    W._PUFFS = ribbon_puffs(RIBBON, ribbon_thick, seed=7, puff=0.55)[0]
    W.EXTRA_HEIGHT = lambda x0_, w_, h_: SC.face_height(x0_, w_, h_, FACE['cx'], FACE['cy'], FACE['S'])
    W.tiny_procession = lambda x0_, w_: (np.zeros((60, w_, 3), np.float32), np.zeros((60, w_), np.float32))
    T = TR.render_trees(x0, w)
    base = W.render_scene3(x0, w, layerA=(T['A'][0], T['A'][1]))
    # the bank first (land is not water: it hides the mirror), then pads sit on the water
    br, ba = bank_layer(x0, w)
    base = base * (1 - ba[..., None]) + br
    pr, pa = pads_layer(x0, w)
    base = base * (1 - pa[..., None]) + pr
    if verbose: print('base', round(time.time() - t0, 1))
    boat_rgb, boat_a = render_boat2()
    img = base.copy()
    lm = W.lantern_mist(x0, w)
    img = img * (1 - lm[..., None]) + np.array([1.0, 0.72, 0.42], np.float32) * lm[..., None]
    rr, ra = W.boat_reflection(boat_rgb, boat_a, x0, w)
    WL = int(BT.WATERLINE); ox = BT.BX0 - x0
    sl = img[WL:, ox:ox + BT.BW]
    img[WL:, ox:ox + BT.BW] = sl * (1 - ra[..., None]) + rr
    sr, sa = W.water_streak(x0, w)
    img = img * (1 - sa[..., None]) + sr
    rg, rga = W.ripple_rings(x0, w)
    img = img * (1 - rga[..., None]) + rg
    oy = BT.BY0
    img[oy:oy + BT.BH, ox:ox + BT.BW] = img[oy:oy + BT.BH, ox:ox + BT.BW] * (1 - boat_a[..., None]) + boat_rgb
    rc, ac = T['C']
    rb, ab = T['B']
    mask = T['M']
    yy_, xx_ = np.mgrid[0:H, 0:w]                                         # no ivy over her face: she is the heart of the picture
    clear = np.clip(1.5 * np.exp(-(((xx_ + x0 - (GIRL_X + 22)) / 118.0) ** 2 + ((yy_ - 700) / 160.0) ** 2)), 0, 1) * (1 - mask)
    rc = rc * (1 - clear)[..., None]; ac = ac * (1 - clear)
    rb = rb * (1 - clear)[..., None]; ab = ab * (1 - clear)
    bark = TR.bark_relief(x0, w, mask)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    inner = np.clip(1 - np.abs(xs - 3800) / 560.0, 0, 1)
    rc = rc + (mask * np.clip(bark - 0.80, 0, 1.2) ** 1.5 * 0.040 * (0.15 + inner))[..., None] * np.array([0.85, 0.62, 0.38], np.float32)
    rc = rc + (mask * np.clip(1.15 - bark, 0, 1) * 0.02)[..., None] * np.array([0.5, 1.0, 0.4], np.float32)
    img = img * (1 - ac[..., None]) + rc
    img = img * (1 - ab[..., None]) + rb
    gl, g = W.lantern_light(x0, w)
    edge = np.clip(ac - cv2.GaussianBlur(ac, (0, 0), 3.0), 0, 1)
    img = 1 - (1 - img) * (1 - np.clip(gl, 0, 1))
    img = img + (edge * g * 0.9)[..., None] * np.array([1.0, 0.6, 0.25], np.float32)
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it:
        return img
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 2.0, 0, 1)
    detail = np.zeros((H, w), np.float32)
    gx0 = int(GIRL_X - 140 - x0); detail[600:970, gx0:gx0 + 330] = 1.0                      # the girl, lantern, boat: fine strokes only
    fx0 = int(FACE['cx'] - 0.50 * FACE['S'] - x0); fy0 = int(FACE['cy'] - 0.62 * FACE['S'])
    detail[fy0:fy0 + int(1.15 * FACE['S']), fx0:fx0 + int(0.95 * FACE['S'])] = 1.0                 # the sleeping face: fine strokes only
    fine_hard = detail > 0.9
    fine_soft = cv2.GaussianBlur(detail, (0, 0), 6.0)
    detail = np.clip(detail + edges, 0, 1)
    out, n = paint(img, passes=((13, 1.0, 0.0), (7.5, 1.0, 0.025), (4.2, 1.0, 0.03), (2.2, 1.1, 0.04), (1.4, 1.3, 0.06)),
                   default_flow=0.0, default_w=0.55, detail=detail, seed=7, struct_keep=0.22 + 0.40 * fine_soft, verbose=verbose,
                   fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    # --- crisp post layers: face in the cloud, bark face, stars, birds, procession, rain, lantern sparks
    out = SC.face_paint_real(out, x0, FACE['cx'], FACE['cy'], FACE['S'], strength=1.0)
    bfr, bfa = bark_face_layer(x0, w)
    out = out * (1 - bfa[..., None]) + bfr
    open_sky = np.clip(1 - ac - ab * 0.9, 0, 1) * (np.arange(H, dtype=np.float32)[:, None] < 680) * star_mask_fade(x0, w)
    st = W.star_field(x0, w, open_sky)
    out = 1 - (1 - out) * (1 - np.clip(st, 0, 1))
    pc, pa_, prc, pra = procession_layer(x0, w)
    out = out * (1 - pra[..., None]) + prc * pra[..., None]
    out = out * (1 - 0.82 * pa_[..., None]) + 0.78 * pc
    brd, bra = birds_layer(x0, w)
    out = out * (1 - bra[..., None]) + brd
    dr, dra = W.drizzle(x0, w)
    fade = (0.35 + 0.65 * (1 - smoothstep(4400, 5300, np.arange(x0, x0 + w, dtype=np.float32)[None, :]))).astype(np.float32)
    out = out * (1 - dra * fade)[..., None] + dr * fade[..., None]
    out = np.clip(out, 0, 1)
    r = Z(99)
    sp_ = np.zeros((H, w), np.float32)
    prob = (g ** 2.4) * 0.0035
    hits = r.random((H, w)) < prob
    sp_[hits] = r.uniform(.4, 1, hits.sum())
    sp_ = cv2.GaussianBlur(sp_, (0, 0), 0.8) * 5
    out = np.clip(out + sp_[..., None] * np.array([1.0, 0.82, 0.45], np.float32), 0, 1)
    return out.astype(np.float32)


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_pond()
    print('pond', round(time.time() - t, 1), 's')
    cache_save('f_pond', X0, img)
    preview(img, WORK + '/f_pond_preview.png', 2000)
    save_png(WORK + '/f_s4.png', img[:, 3240 - X0:4320 - X0])
