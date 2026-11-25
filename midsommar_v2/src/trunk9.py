"""The old tree beside the house - the object that carries slide 9 into slide 10.

A big trunk stands exactly on the 9|10 border (x = 9700), in front of both pictures: the far view of the house ends behind its left side, the close view of the wall begins behind
its right side, so the cut is hidden by a real thing with a crisp silhouette (the way the lake tree carries 3|4 and 4|5) and nothing has to be smeared. Its roots spread into the
meadow, two boughs reach out over slide 9's sky and over slide 10's wall, hung with laburnum and wisteria and ivy, lit by the same low sun from the left as the house (gold rim
on the left, blue-violet shade and the meadow's green bounce on the right).

The bark is the lake tree's bark (cylinder normals from the bough geometry + vertical fissures + moss + lichen, arch2.py) lit by a directional sun instead of a lantern.
render_trunk() -> dict(rgb, a, x0, w, shadow): premultiplied colour, alpha, and the soft dapple the crown throws on the wall to its right.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from trees import catmull, sample_radius, leaf
from arch2 import enc_bough, blossom
import meadow as MD

TAU = 2 * math.pi
X0T, WT = 9170, 1180                                   # the layer covers finished x 9170 .. 10350
TX = 9700.0                                            # the trunk's axis on the border
SUN = np.array([-0.80, -0.34, 0.50], np.float32); SUN /= np.linalg.norm(SUN)    # toward the light: left, a little up, toward the viewer

TRUNK = [(TX + 5, 1450), (TX + 7, 1180), (TX, 880), (TX - 9, 600), (TX - 5, 330), (TX + 4, 60), (TX + 9, -120)]
ROOTS = [[(TX - 8, 1196), (TX - 74, 1262), (TX - 150, 1318), (TX - 236, 1346)],
         [(TX + 2, 1230), (TX - 40, 1300), (TX - 98, 1350), (TX - 150, 1372)],
         [(TX + 16, 1190), (TX + 92, 1256), (TX + 176, 1312), (TX + 262, 1344)],
         [(TX + 10, 1232), (TX + 54, 1300), (TX + 112, 1350), (TX + 170, 1372)]]
BOUGH_L = [(TX - 4, 360), (TX - 46, 262), (TX - 130, 190), (TX - 238, 150), (TX - 352, 132), (TX - 450, 150)]          # over slide 9's sky
BOUGH_R = [(TX + 4, 250), (TX + 74, 176), (TX + 176, 128), (TX + 300, 104), (TX + 430, 100), (TX + 540, 124)]          # over slide 10's wall
BOUGH_R2 = [(TX + 6, 560), (TX + 62, 508), (TX + 138, 486), (TX + 214, 500)]
BOUGH_L2 = [(TX - 8, 520), (TX - 66, 476), (TX - 128, 470), (TX - 190, 492)]


def shade_sun(x0, w, enc, a, seed=5):
    """per-pixel bark: the same normals / relief / moss / lichen as the lake tree, lit by the low sun from the left, blue sky from above, green bounce from the meadow"""
    h = H
    p = enc[..., 0]; nxa = enc[..., 1] * 2 - 1; nya = enc[..., 2] * 2 - 1
    s = np.clip(1 - 2 * p, -0.97, 0.97)
    nz = np.sqrt(1 - s * s)
    nx, ny = s * nxa, s * nya
    horiz = cv2.GaussianBlur((np.abs(nya) > 0.62).astype(np.float32), (0, 0), 3.0)
    hv = 0.55 * fbm(x0, 0, w, h, 150, 4, seed, aniso=0.07) + 0.35 * fbm(x0, 0, w, h, 40, 3, seed + 1, aniso=0.09) + 0.20 * fbm(x0, 0, w, h, 9, 3, seed + 9)
    hh = 0.55 * fbm(x0, 0, w, h, 150, 4, seed + 4, aniso=14.0) + 0.35 * fbm(x0, 0, w, h, 40, 3, seed + 5, aniso=11.0) + 0.20 * fbm(x0, 0, w, h, 9, 3, seed + 9)
    bh = hv * (1 - horiz) + hh * horiz
    gx = cv2.Sobel(bh, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(bh, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    k = 11.0
    N = np.stack([nx - k * gx, ny - k * gy, nz + 0.30], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    X = (np.arange(x0, x0 + w, dtype=np.float32))[None, :] * np.ones((h, 1), np.float32)
    Y = np.arange(h, dtype=np.float32)[:, None] * np.ones((1, w), np.float32)
    ndl = (N * SUN).sum(-1)
    wrap = np.clip((ndl + 0.30) / 1.30, 0, 1)
    sun = (wrap ** 1.15)[..., None] * np.array([1.0, 0.74, 0.40], np.float32) * 1.30
    up = np.clip(-N[..., 1], 0, 1); dn = np.clip(N[..., 1], 0, 1)
    amb = up[..., None] * np.array([0.30, 0.34, 0.58], np.float32) * 0.62 + np.array([0.20, 0.17, 0.30], np.float32)[None, None, :] * 0.40 + dn[..., None] * np.array([0.34, 0.38, 0.14], np.float32) * 0.62
    ridge = np.clip(0.5 + 0.9 * bh, 0, 1)
    alb = np.array([0.13, 0.095, 0.072], np.float32) * (1 - ridge[..., None]) + np.array([0.50, 0.40, 0.30], np.float32) * ridge[..., None]
    moss_n = fbm01(x0, 0, w, h, 120, 4, seed + 21, aniso=0.5)
    low = smoothstep(560, 1300, Y)
    moss = smoothstep(0.50, 0.70, moss_n) * np.clip(0.20 + 0.55 * low + 0.50 * (1 - np.clip(wrap * 1.6, 0, 1)), 0, 1)
    alb = alb * (1 - 0.80 * moss[..., None]) + np.array([0.11, 0.26, 0.07], np.float32) * (0.80 * moss[..., None]) * (0.7 + 0.8 * ridge[..., None])
    lich = smoothstep(0.80, 0.90, fbm01(x0, 0, w, h, 14, 3, seed + 31)) * (1 - moss) * 0.6
    alb = alb * (1 - lich[..., None]) + np.array([0.60, 0.66, 0.50], np.float32) * lich[..., None]
    ao = np.clip(0.50 + 0.95 * ridge, 0.22, 1.0)[..., None]
    col = alb * (amb + sun) * ao
    rim = ((1 - nz) ** 2.2 * np.clip(-nx, 0, 1))[..., None] * np.array([1.0, 0.82, 0.46], np.float32) * 0.55           # the sun grazes the left silhouette
    col = col + rim
    hv_ = (np.clip(ndl, 0, 1) ** 12)[..., None] * np.array([1.0, 0.8, 0.5], np.float32) * 0.10 * (0.4 + 0.6 * ridge[..., None])
    col = col + hv_
    contact = np.exp(-((1330.0 - Y) / 70.0) ** 2) * (Y < 1362)                                                               # the roots go down into the grass
    col = col * (1 - 0.45 * contact[..., None])
    return np.clip(col, 0, 1.2).astype(np.float32), bh


def leaf_col(n, rng, gold=0.0):
    """a leaf lit by the low sun: shade -> green -> sun-lit yellow-green -> gold highlight, the shade side taking the blue of the sky"""
    sunl = max(0.0, float(n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]))
    sky = max(0.0, -float(n[1]))
    t = float(np.clip(0.10 + 0.82 * sunl ** 0.85 + 0.10 * sky, 0, 1))
    SH, MDc, LT, HI = np.array([0.040, 0.100, 0.075]), np.array([0.130, 0.270, 0.100]), np.array([0.420, 0.520, 0.130]), np.array([0.880, 0.800, 0.320])
    if t < 0.40: col = SH + (MDc - SH) * t / 0.40
    elif t < 0.80: col = MDc + (LT - MDc) * (t - 0.40) / 0.40
    else: col = LT + (HI - LT) * (t - 0.80) / 0.20
    col = col + np.array([0.05, 0.04, 0.10]) * (1 - t) * 0.5
    j = 1 + rng.normal(0, 0.09)
    col = col * j * np.array([1 + rng.normal(0, 0.05), 1, 1 + rng.normal(0, 0.07)])
    if rng.random() < 0.05: col = col + np.array([0.20, 0.13, -0.03])               # a few leaves already turning
    if gold > 0: col = col * (1 + 0.5 * gold * np.array([0.9, 0.35, -0.4])) + 0.04 * gold
    return tuple(float(np.clip(v, 0, 1)) for v in col)


def clump(c, cx, cy, rx, ry, n, rng, size=(11, 22), skew=0.0):
    for _ in range(n):
        th = rng.uniform(0, TAU); rad = math.sqrt(rng.random())
        u, v = rad * math.cos(th), rad * math.sin(th)
        if rad > 0.82 and rng.random() < 0.38: continue
        nz = math.sqrt(max(0.0, 1 - u * u * 0.8 - v * v * 0.8))
        nn = (u * 0.9 + skew, v * 0.9, nz)
        leaf(c, cx + u * rx, cy + v * ry, rng.uniform(*size), rng.uniform(0, TAU), leaf_col(nn, rng))


def hanging(c, ax, ay, length, rng):
    """a strand of leaves hanging from a bough, lit by the sun from the left"""
    n = max(3, int(length / 9))
    ph = rng.uniform(0, 6.28); sw = rng.uniform(0.4, 1.4)
    for k in range(n):
        t = k / n
        x = ax + math.sin(ph + t * 3.0) * sw * 12 * t * (1 + t); y = ay + t * length
        s = 14.0 * (1 - 0.40 * t) * rng.uniform(0.8, 1.25)
        for side in (-1, 1):
            nn = (side * rng.uniform(0.2, 0.8), rng.uniform(-0.2, 0.5), rng.uniform(0.3, 0.8))
            leaf(c, x + side * s * 0.12, y, s * 1.5, 1.5707 + side * rng.uniform(0.5, 1.25) + math.sin(ph + t * 3) * 0.2, leaf_col(nn, rng))


def raceme(c, ax, ay, length, rng, kind):
    """laburnum (gold) or wisteria (lilac): a hanging chain of little flowers on a green thread; the sun side is brighter"""
    n = int(length / 4.4)
    ph = rng.uniform(0, 6.28); sw = rng.uniform(0.5, 1.4)
    c.set_source_rgba(0.06, 0.15, 0.06, 0.9); c.set_line_width(1.5)
    c.new_path()
    for k in range(n + 1):
        t = k / n
        x = ax + math.sin(ph + t * 2.4) * sw * 11 * t; y = ay + t * length
        (c.move_to if k == 0 else c.line_to)(x, y)
    c.stroke()
    for k in range(n):
        t = k / n
        x = ax + math.sin(ph + t * 2.4) * sw * 11 * t; y = ay + t * length
        width = (1.0 - t) ** 0.8 if kind == 'wist' else (0.45 + 0.5 * (1 - t))
        for side in (-1, 1):
            if rng.random() < 0.15: continue
            bx = x + side * rng.uniform(1.5, 7.5) * width * (1.4 if kind == 'wist' else 1.0); by = y + rng.normal(0, 1.2)
            sz = (5.0 if kind == 'wist' else 4.2) * (1 - 0.40 * t) * rng.uniform(0.8, 1.25)
            base, hi = ((0.95, 0.76, 0.10), (1.0, 0.93, 0.50)) if kind == 'lab' else ((0.54, 0.40, 0.84), (0.84, 0.72, 0.98))
            m = (0.35 + 0.6 * (side < 0)) * rng.uniform(0.7, 1.1)                    # the sun comes from the left: the left flowers catch it
            col = tuple(float(np.clip(base[i] * (1 - m * 0.5) + hi[i] * m * 0.5, 0, 1)) for i in range(3))
            c.set_source_rgba(*col, 1.0)
            c.new_path(); c.save(); c.translate(bx, by); c.rotate(rng.uniform(-0.7, 0.7)); c.scale(sz * 0.80, sz * 1.15); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def ivy_up(c, x, y, length, rng, side):
    """an ivy runner climbing the trunk"""
    px, py = x, y
    ang = -math.pi / 2 + rng.normal(0, 0.18)
    for k in range(int(length / 10)):
        a = ang + rng.normal(0, 0.22)
        px += math.cos(a) * 10; py += math.sin(a) * 10
        c.set_source_rgba(0.05, 0.10, 0.04, 1); c.set_line_width(1.8)
        c.new_path(); c.move_to(px - math.cos(a) * 10, py - math.sin(a) * 10); c.line_to(px, py); c.stroke()
        for sd in (-1, 1):
            if rng.random() < 0.72:
                nn = (rng.uniform(-0.6, 0.3), rng.uniform(-0.3, 0.4), rng.uniform(0.4, 0.9))
                leaf(c, px, py, rng.uniform(13, 24), a + sd * rng.uniform(0.7, 1.5), leaf_col(nn, rng))


def render_trunk(seed=909, verbose=True):
    import time
    t0 = time.time()
    rng = np.random.default_rng(seed)
    x0, w = X0T, WT
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    PS = {}
    for k, pts in enumerate(ROOTS): PS['r%d' % k] = enc_bough(c, pts, 52 - 8 * (k % 2), 8, 20 + k)
    PS['bl'] = enc_bough(c, BOUGH_L, 26, 4, 61)
    PS['br'] = enc_bough(c, BOUGH_R, 24, 4, 62)
    PS['bl2'] = enc_bough(c, BOUGH_L2, 13, 3, 63)
    PS['br2'] = enc_bough(c, BOUGH_R2, 13, 3, 64)
    PS['T'] = enc_bough(c, TRUNK, 80, 52, 1)
    rgb, a = L.get()
    enc = rgb / np.maximum(a, 1e-3)[..., None]
    wood, bh = shade_sun(x0, w, enc, a)
    if verbose: print('trunk wood', round(time.time() - t0, 1))
    # ---- foliage, blossom, hanging flowers, ivy
    LB = Layer(w, H, x0, 0, 1)                                                       # far leaves, behind the wood (darker, give the crown depth)
    cb = LB.ctx
    for key in ('bl', 'br'):
        P, R = PS[key]
        for k in range(0, len(P), 5):
            if rng.random() < 0.6: continue
            clump(cb, float(P[k][0]) + rng.normal(0, 30), float(P[k][1]) + rng.normal(0, 22) - 10, rng.uniform(40, 70), rng.uniform(34, 60), int(rng.uniform(70, 140)), rng, size=(14, 26))
    rb_, ab_ = LB.get()
    rb_ = rb_ * 0.72
    LC = Layer(w, H, x0, 0, 1)
    c = LC.ctx
    for key, spread in (('bl', 1.0), ('br', 1.0), ('bl2', 0.6), ('br2', 0.6)):
        P, R = PS[key]
        n = len(P)
        for k in range(0, n, 3):
            x_, y_ = float(P[k][0]), float(P[k][1])
            tip = k / n
            if rng.random() > 0.20 + 0.80 * (1 - 0.35 * tip): continue
            for _ in range(2):
                ox, oy = rng.normal(0, 22), rng.normal(0, 16)
                r_ = rng.uniform(20, 48) * spread * (0.70 + 0.30 * (1 - tip))
                clump(c, x_ + ox, y_ + oy - 4, r_, r_ * 0.85, int(r_ * r_ * 0.10), rng, size=(10, 20), skew=-0.15 if ox > 0 else 0.15)
    # the crown at the top of the trunk
    for _ in range(26):
        cx_, cy_ = TX + rng.normal(0, 70), rng.uniform(-60, 120)
        r_ = rng.uniform(40, 78)
        clump(c, cx_, cy_, r_, r_ * 0.8, int(r_ * r_ * 0.10), rng, size=(11, 22))
    # hanging strands of leaves, laburnum over the sky, wisteria over the wall
    for key, kind in (('bl', 'lab'), ('br', 'wist')):
        P, R = PS[key]
        for k in range(8, len(P) - 6, 5):
            x_, y_ = float(P[k][0]), float(P[k][1])
            if rng.random() < 0.18: continue
            raceme(c, x_ + rng.normal(0, 5), y_ + float(R[k]) * 0.8, rng.uniform(80, 210), rng, kind if rng.random() < 0.78 else ('lab' if kind == 'wist' else 'wist'))
        for k in range(6, len(P) - 4, 4):
            x_, y_ = float(P[k][0]), float(P[k][1])
            if rng.random() < 0.35: continue
            hanging(c, x_ + rng.normal(0, 5), y_ + float(R[k]) * rng.uniform(0.3, 1.0), rng.uniform(40, 130), rng)
    for key in ('bl', 'br'):
        P, R = PS[key]
        for k in range(0, len(P), 2):
            if rng.random() > 0.5: continue
            blossom(c, float(P[k][0]) + rng.normal(0, 24), float(P[k][1]) + rng.normal(0, 20), rng.uniform(3.4, 6.2), [(0.98, 0.95, 0.90), (0.97, 0.80, 0.84), (0.99, 0.90, 0.70)][int(rng.integers(3))], rng)
    for j in range(7):                                                                  # ivy runners up the trunk
        ivy_up(c, TX + rng.uniform(-60, 58), 1230 - rng.uniform(0, 160), rng.uniform(180, 560), rng, 1)
    rc, ac = LC.get()
    if verbose: print('trunk foliage', round(time.time() - t0, 1))
    # ---- composite: far leaves, the wood, the near foliage
    out_rgb = rb_ * 1.0
    out_a = ab_.copy()
    out_rgb = out_rgb * (1 - a[..., None]) + wood * a[..., None]
    out_a = np.clip(out_a * (1 - a) + a, 0, 1)
    out_rgb = out_rgb * (1 - ac[..., None]) + rc
    out_a = np.clip(out_a * (1 - ac) + ac, 0, 1)
    # the soft dapple the crown throws on the wall (to its right and down: the sun is low and on the left)
    crown_a = np.maximum(ac, ab_ * 0.8)
    M = np.float32([[1, 0, 70], [0, 1, 46]])
    sh = cv2.warpAffine(crown_a, M, (w, H), flags=cv2.INTER_LINEAR, borderValue=0)
    sh = cv2.GaussianBlur(sh, (0, 0), 13.0) * (np.arange(H, dtype=np.float32)[:, None] < 640)
    sh = sh * (1 - smoothstep(520, 640, np.arange(H, dtype=np.float32)))[:, None]
    return dict(rgb=out_rgb.astype(np.float32), a=out_a.astype(np.float32), x0=x0, w=w, shadow=sh.astype(np.float32), wood_a=a.astype(np.float32))



def apply_trunk(fin, verbose=True):
    """put the old tree on the 9|10 border of the finished picture: crown dapple on the wall, the tree, the same ink-and-gouache finish as its neighbours (lost-and-found outline on
    the shadow side, pigment pooling, paper), and tall grass and flowers standing in front of its roots"""
    import ink as INK
    d = render_trunk(verbose=verbose)
    x0, w = d['x0'], d['w']
    reg = fin[:, x0:x0 + w].copy()
    X = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    wall = smoothstep(TX - 5, TX + 40, X)
    reg = reg * (1 - 0.30 * d['shadow'] * wall)[..., None] + np.array([0.05, 0.04, 0.12], np.float32)[None, None, :] * (0.30 * d['shadow'] * wall)[..., None] * 0.6
    reg = reg * (1 - d['a'][..., None]) + d['rgb']
    a_t = d['a']
    m = cv2.GaussianBlur(cv2.dilate((a_t > 0.02).astype(np.float32), np.ones((5, 5), np.uint8)), (0, 0), 1.2)
    keep = np.clip(1.0 - m, 0, 1)
    f = INK.finish(reg, lines=[(a_t > 0.5, 2.2, 0.85)], keep=keep, flat=0.52, pool=0.10, grain=0.0, seed=7, light_x=-1.0)
    pap = INK.paper(H, w, 11)
    f = f * pap[..., None]
    reg = reg * (1 - m[..., None]) + f * m[..., None]
    # tall grass and wildflowers in front of the roots (they stand IN the meadow)
    rng = np.random.default_rng(515)
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    MD.grass(c, rng, TX - 330, 660, 1262, 1362, 200, 60, 210)
    kinds = [MD.poppy, MD.oxeye, MD.cornflower, MD.buttercup]
    pts = sorted((rng.uniform(1250, 1346), rng.uniform(TX - 290, TX + 300)) for _ in range(13))
    for (yy, xx) in pts:
        r = 16 + 22 * (yy - 1240) / 110.0 * rng.uniform(0.8, 1.2)
        hgt = r * rng.uniform(2.2, 4.2)
        MD.stem(c, xx, yy + hgt, yy, rng.normal(0, r * 0.4), max(1.2, r * 0.10))
        MD.leafpair(c, xx, yy + hgt * 0.55, r * 1.2, rng)
        kinds[int(rng.integers(len(kinds)))](c, xx, yy, r, rng)
    MD.grass(c, rng, TX - 330, 660, 1338, 1368, 90, 70, 190)
    gr, ga = L.get()
    gr = gr * pap[..., None]
    reg = reg * (1 - ga[..., None]) + gr
    fin[:, x0:x0 + w] = np.clip(reg, 0, 1)
    return fin

if __name__ == '__main__':
    import time
    t = time.time()
    d = render_trunk()
    print('trunk', round(time.time() - t, 1), 's')
    pano = cv2.imread(WORK + '/../panorama_17280x1350.png')[..., ::-1].astype(np.float32) / 255.0
    bg = pano[:, d['x0']:d['x0'] + d['w']]
    img = bg * (1 - d['a'][..., None]) + d['rgb']
    save_png(WORK + '/trunk_test.png', np.clip(img, 0, 1))
