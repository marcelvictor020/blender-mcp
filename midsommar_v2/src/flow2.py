"""LIBRARY for flow3.py (the slides 5-8 stage): cloud_sea / sea_alpha (the lake turning into a sea of cloud, row by row), rising_mist, drag (the sideways
line-by-line pull), petals2, critters2. bough_layers() is an unused, REJECTED experiment (one branch running across four slides is not credible) - the long
object that does cross the borders is a set of silk ribbons (ribbons.py).

Slides 5-8, rebuilt as a real metamorphosis (x 4300..8700) - four different pictures that turn into one another, not one picture recoloured.

  * the TREE keeps going: the arch's own bough leaves the canopy in the same painted bark and leaves, carries blossom, sheds petals, and its light turns
    golden as it nears the sun - it ends in a coil, no pasted garland;
  * the POND rises: columns of mist lift off the water into the canopy, then the lake turns into a SEA OF CLOUD (clouds condense out of the mirror, lump by
    lump, row by row) that settles back into the lake as the sun gets low - so the water visibly stops being water and starts again at the shore;
  * the GIRLS are not there at first: they condense out of that mist (ghosts on the left, solid on the right), walk the cloud, and step ashore;
  * the whole scene is dragged sideways, line by line, toward the clearing.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
from trees import catmull
import garden as G
from garden import vnoise
import chain as CH
import arch2 as AR
import critters as CR
import flow as F
from blend import stagger_blend

TAU = 2 * math.pi
FX0, FX1 = F.FX0, F.FX1
FW = FX1 - FX0
LANTERN = (3862.0, 812.0)
SUN_X = 7330.0


def row_noise(seed, cell=70, octaves=3):
    return fbm(0, 0, 1, H, cell, octaves, seed)[:, 0].astype(np.float32)


# ------------------------------------------------------------------------------------------------------------- sideways drag
def drag(img, x0, w):
    """every scanline slides to the right by its own amount (the fold's single pull toward the clearing)"""
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    A = 85.0 * smoothstep(4450, 5700, xs) * (1 - smoothstep(6900, 8300, xs))
    D = A * (0.30 + 0.70 * np.clip(0.5 + 1.0 * row_noise(7)[:, None], 0, 1.3))
    yy = np.arange(H, dtype=np.float32)[:, None]
    D = D * (1 - np.exp(-(((yy - HZ) / 55.0) ** 2)))                       # the horizon (and the walkers standing on it) stays put
    mx = (np.arange(w, dtype=np.float32)[None, :] - D).astype(np.float32)
    my = np.broadcast_to(np.arange(H, dtype=np.float32)[:, None], (H, w)).astype(np.float32).copy()
    return cv2.remap(img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


# ------------------------------------------------------------------------------------------------------------- the sea of cloud
def cloud_sea(x0, w, seed=5):
    """a sea of cumulus seen from just above it, drawn the way painters build sunset cloud: cauliflower crests (ridged billows), dark cool creases, a warm
    rim on every crest, the sun-facing slopes lighter than the viewer-facing ones, flat bases that crowd toward the horizon in true ground-plane perspective
    (octaves that would alias are faded per pixel, so the distance melts into haze). returns (rgb, h) for rows HZ..H; h in 0..1 is the billow height."""
    nh = H - HZ
    k = np.arange(1, nh + 1, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    cx = 6300.0
    U = (xs - cx) / k
    V = 1000.0 / k
    foot = np.maximum(1.0 / k, 1000.0 / (k * k))
    wU = 0.30 * (vnoise(U * 1.5, V * 1.5, seed + 40) - 0.5)
    wV = 0.30 * (vnoise(U * 1.5 + 9.1, V * 1.5 + 4.3, seed + 41) - 0.5)
    Uw, Vw = U + wU, V + wV

    def field(u, v, f0, sd, octs=6):
        acc = np.zeros_like(u); tot = np.zeros_like(u)
        for o in range(octs):
            f = f0 * (2.0 ** o)
            wo = np.clip((0.5 - f * foot) / 0.25, 0, 1)
            amp = 0.55 ** o
            acc += wo * amp * vnoise(u * f, v * f, sd + o * 7)
            tot += wo * amp
        return acc / np.maximum(tot, 1e-4)

    def height(u, v):
        n = field(u, v, 0.80, seed, 4)
        r = field(u + 3.3, v + 1.7, 1.7, seed + 90, 3)
        ridge = 1.0 - np.abs(2.0 * r - 1.0)
        return np.clip((0.66 * n + 0.34 * ridge - 0.30) * 1.9, 0, 1)

    h = height(Uw, Vw)
    sgn = np.where(xs < SUN_X, 1.0, -1.0).astype(np.float32)
    eps = 0.14
    h2 = height(Uw + eps * 0.40 * sgn, Vw + eps * 0.92)
    d = h - h2                                                                     # >0: the slope falls away toward the sun (it faces the light)
    h = h.astype(np.float32); d = d.astype(np.float32)
    hb = cv2.GaussianBlur(h, (0, 0), 1.2)
    gm = np.hypot(cv2.Sobel(hb, cv2.CV_32F, 1, 0), cv2.Sobel(hb, cv2.CV_32F, 0, 1))
    top = smoothstep(0.30, 0.86, h)
    lit = np.clip(0.30 + 0.58 * top + 0.28 * np.clip(0.5 + 3.0 * d, 0, 1) - 0.12, 0, 1)
    ao = 0.72 + 0.28 * smoothstep(0.10, 0.60, h)                                   # creases between the billows are the darkest, coolest part
    rim = np.clip(gm * 7.0, 0, 1) * smoothstep(0.35, 0.85, h)
    t = smoothstep(5200, 7400, xs)[..., None]
    sh = np.array([0.50, 0.44, 0.72], np.float32) * (1 - t) + np.array([0.70, 0.58, 0.70], np.float32) * t
    li = np.array([1.00, 0.84, 0.80], np.float32) * (1 - t) + np.array([1.00, 0.93, 0.72], np.float32) * t
    rm = np.array([1.00, 0.88, 0.70], np.float32) * (1 - t) + np.array([1.00, 0.96, 0.78], np.float32) * t
    rgb = (sh * (1 - lit[..., None]) + li * lit[..., None]) * ao[..., None]
    rgb = rgb + rim[..., None] * rm * 0.55
    hz = np.array([0.90, 0.74, 0.80], np.float32) * (1 - t) + np.array([1.0, 0.86, 0.62], np.float32) * t
    haze = np.exp(-k / 75.0)[..., None]
    rgb = rgb * (1 - 0.85 * haze) + hz * 0.85 * haze
    return np.clip(rgb, 0, 1).astype(np.float32), (0.22 + 0.78 * h).astype(np.float32)


def sea_alpha(x0, w, n):
    nh = n.shape[0]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    rn = row_noise(13, 50)[HZ:HZ + nh][:, None]
    xr = xs + 380.0 * rn
    e = smoothstep(4750, 5950, xr) * (1 - smoothstep(7050, 8000, xr))
    thr = 1.0 - e
    a = smoothstep(thr - 0.16, thr + 0.24, n)
    kk = np.arange(1, nh + 1, dtype=np.float32)[:, None]
    a = a * smoothstep(6, 46, kk)
    return a.astype(np.float32), e.astype(np.float32)


def rising_mist(x0, w):
    """pearl columns of vapour lifting off the pond into the canopy, leaning with the pull"""
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    base = cv2.GaussianBlur(fbm01(x0, 0, w, H, 420, 3, 71, aniso=0.34), (0, 0), 6.0)
    mx = (np.arange(w, dtype=np.float32)[None, :] - 0.38 * (HZ - ys)).astype(np.float32)
    my = np.broadcast_to(ys, (H, w)).astype(np.float32).copy()
    base = cv2.remap(base.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    env = smoothstep(4350, 4950, xs) * (1 - smoothstep(6000, 6900, xs))
    vert = smoothstep(HZ + 150, HZ - 15, ys) * (1 - 0.8 * smoothstep(60, 520, HZ - ys))
    a = np.clip((base - 0.40) * 1.9, 0, 1) * env * vert * 0.55
    t = smoothstep(4400, 6600, xs)[..., None]
    col = np.array([0.86, 0.78, 0.94], np.float32) * (1 - t) + np.array([0.96, 0.86, 0.80], np.float32) * t
    return col * a[..., None], a


# ------------------------------------------------------------------------------------------------------------- the tree goes on
def bough_layers(x0, w, seed=31, verbose=True):
    """the arch's own bough: shaded bark + sphere-lit leaves + blossom + hanging laburnum / wisteria + kurbits, with forks and bare stretches, ending in a coil"""
    import time
    t0 = time.time()
    rng = np.random.default_rng(seed)
    main = [(4860, 222), (5060, 188), (5330, 196), (5650, 250), (6020, 330), (6420, 400), (6860, 450), (7300, 464), (7760, 440), (8150, 400), (8420, 374),
            (8600, 394), (8660, 452), (8610, 506), (8530, 500), (8500, 452), (8540, 428)]
    forks = [([(5500, 228), (5580, 168), (5700, 118), (5860, 92)], 10, 2.6, 'up'), ([(6100, 344), (6190, 412), (6262, 500), (6292, 592)], 9, 2.6, 'down'),
             ([(6700, 452), (6800, 402), (6940, 360), (7110, 336)], 8, 2.4, 'up'), ([(7350, 466), (7440, 532), (7500, 612)], 7, 2.4, 'down'),
             ([(7900, 424), (8000, 352), (8120, 300)], 6, 2.2, 'up'), ([(5200, 192), (5290, 140), (5420, 110)], 7, 2.2, 'up')]
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    sets = []
    for k, (pts, r0, r1, kind) in enumerate(forks):
        sets.append((AR.enc_bough(c, pts, r0, r1, 40 + k), kind, 'fork'))
    sets.append((AR.enc_bough(c, main, 26, 2.6, 9), 'main', 'main'))
    rgb, a = L.get()
    enc = rgb / np.maximum(a, 1e-3)[..., None]
    wood, bh = AR.shade_wood(x0, w, enc, a, LANTERN, seed=11)
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    gold = smoothstep(6300, 8000, xs)[..., None]
    wood = wood * (1 + 0.30 * gold) + gold * np.array([0.05, 0.03, -0.01], np.float32)
    wa = a * smoothstep(4930, 5170, xs)
    if verbose: print('bough wood', round(time.time() - t0, 1))
    LC = Layer(w, H, x0, 0, 1)
    cc = LC.ctx
    gold_fn = lambda x: float(smoothstep(6300, 8000, x)) * 0.9
    P, R = sets[-1][0]
    n = len(P)
    for ((Pk, Rk), kind, role) in sets:
        step = 3 if role == 'main' else 2
        for k in range(0, len(Pk), step):
            x, y = float(Pk[k][0]), float(Pk[k][1])
            if x < 4880: continue
            d = 1.0 if x < 7400 else float(1 - 0.78 * smoothstep(7400, 8500, x))
            bare = 0.5 + 0.5 * math.sin(x / 210.0 + 1.3) * math.sin(x / 83.0)          # a few bare stretches of bark between the leaf masses
            if role == 'main' and bare < 0.18 and x < 8300: continue
            tipk = 1.3 if (role == 'fork' and k > len(Pk) * 0.55) else 1.0                # forks end in a thick tuft of leaves
            for _ in range(2 if role == 'main' else 3):
                if rng.random() > d: continue
                ox, oy = rng.normal(0, 24), rng.normal(0, 22)
                r_ = rng.uniform(18, 50) * (0.75 + 0.35 * d) * tipk
                AR.clump(cc, x + ox, y + oy - 5, r_, r_ * 0.85, int(r_ * r_ * 0.10), rng, LANTERN, size=(11, 21), hole=False, gold_fn=gold_fn)
    for ((Pk, Rk), kind, role) in sets:                                            # dangling leaves
        for k in range(0, len(Pk), 4):
            x, y = float(Pk[k][0]), float(Pk[k][1])
            if x < 4980 or x > 8300 or rng.random() > 0.5: continue
            AR.hanging_leaves(cc, x + rng.normal(0, 6), y + float(Rk[k]) * rng.uniform(0.3, 1.0), rng.uniform(40, 140), rng, LANTERN)
    kinds = 0
    for k in range(0, n, 6):                                                        # the arch's laburnum and wisteria go on, thinning out
        x, y = float(P[k][0]), float(P[k][1])
        if not (4960 < x < 5800) or rng.random() > 0.7: continue
        AR.chain_flowers(cc, x + rng.normal(0, 7), y + float(R[k]) * 0.9, rng.uniform(80, 180), rng, LANTERN, 'lab' if kinds % 2 == 0 else 'wist'); kinds += 1
    for ((Pk, Rk), kind, role) in sets:                                            # blossom: more and more as it nears the clearing
        for k in range(len(Pk)):
            x, y = float(Pk[k][0]), float(Pk[k][1])
            pr = 0.65 * float(smoothstep(4950, 6200, x)) * (1 - float(smoothstep(7700, 8600, x)))
            if rng.random() > pr: continue
            AR.blossom(cc, x + rng.normal(0, 30), y + rng.normal(0, 26), rng.uniform(3.6, 7.0), [(0.98, 0.95, 0.90), (0.97, 0.80, 0.84), (0.99, 0.90, 0.70)][int(rng.integers(3))], rng)
    tips = [(5860, 92, 40), (7110, 336, 46), (8120, 300, 36), (5420, 110, 34), (6292, 592, 38)]   # folk kurbits flowers open at twig ends: flat + inked at first, real by the clearing
    for (x, y, r_) in tips:
        F.kurbits(cc, x + rng.normal(0, 4), y - 10, r_, float(smoothstep(5000, 7300, x)), rng)
    rc, ac = LC.get()
    fade = smoothstep(4900, 5200, xs)
    rc = rc * fade[..., None]; ac = ac * fade
    if verbose: print('bough foliage', round(time.time() - t0, 1))
    return wood, wa, rc, ac, P, R


# ------------------------------------------------------------------------------------------------------------- petals shed by the bough
def petals2(x0, w, seed=3, n=1100):
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(seed)
    placed = 0
    while placed < n:
        x = rng.uniform(5000, FX1 - 150)
        bell = math.exp(-((x - 6700) / 1700.0) ** 2)
        if rng.random() > bell: continue
        y = rng.uniform(160, 1000) if rng.random() < 0.75 else rng.uniform(780, 1250)
        a = float(F.flow_angle(x, y)) + rng.normal(0, 0.3)
        sz = rng.uniform(4.0, 9.0) * (0.7 + 0.6 * bell)
        col = [(0.98, 0.96, 0.92), (0.97, 0.82, 0.86), (0.99, 0.90, 0.72)][int(rng.integers(3))]
        tail = sz * rng.uniform(2.5, 5.0)
        gr = cairo.LinearGradient(x, y, x - math.cos(a) * tail, y - math.sin(a) * tail)
        gr.add_color_stop_rgba(0, *col, 0.45); gr.add_color_stop_rgba(1, *col, 0)
        c.set_source(gr); c.set_line_width(sz * 0.6); c.new_path(); c.move_to(x, y); c.line_to(x - math.cos(a) * tail, y - math.sin(a) * tail); c.stroke()
        if y > HZ + 24:                                                         # on the water / cloud: a contact shadow, so it sits in the picture
            c.set_source_rgba(0.04, 0.03, 0.10, 0.28); c.new_path(); c.save(); c.translate(x + 1.6, y + 2.2); c.rotate(a); c.scale(sz, sz * 0.5); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        c.set_source_rgba(*col, 0.96); c.new_path(); c.save(); c.translate(x, y); c.rotate(a); c.scale(sz, sz * 0.5); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
        placed += 1
    return L.get()


# ------------------------------------------------------------------------------------------------------------- critters (only where there is water)
def critters2(out, x0):
    rng = np.random.default_rng(1717)
    out = np.ascontiguousarray(out)
    CR.swan_family(out, 4760 - x0, 1236, 132, rng)
    CR.flower_boat(out, 4990 - x0, 1296, 116, 11, pal=0)
    CR.swan_family(out, 7740 - x0, 1046, 70, rng, tint=(1.0, 0.97, 0.93))
    CR.flower_boat(out, 8060 - x0, 962, 54, 13, pal=2)
    for (lx, ly, S) in CR.lantern_flock():
        if x0 + 40 < lx < x0 + FW - 40 and lx < 8750:
            CR.sky_lantern(out, lx - x0, ly, S, day=float(smoothstep(6800, 8400, lx)) * 0.55, warm=1.0)
    items = []
    kinds_dusk = ['blue', 'white', 'yellow']; kinds_gold = ['monarch', 'yellow', 'admiral', 'white']
    for i in range(18):
        x = rng.uniform(5100, 8350); y = rng.uniform(140, 700)
        if abs(x - SUN_X) < 160 and abs(y - 766) < 200: continue
        kind = (kinds_dusk if x < 6300 else kinds_gold)[i % (3 if x < 6300 else 4)]
        items.append((x - x0, y, rng.uniform(15, 25), float(F.flow_angle(x, y)) + math.pi / 2 + rng.normal(0, 0.4), kind, rng.uniform(0.35, 0.95), int(rng.integers(1 << 20))))
    CR.butterflies(out, items)
    CR.fireflies(out, rng, 70, (4450 - x0, 5300 - x0), (740, 1320), size=(1.3, 3.4), glow=0.95)
    CR.fireflies(out, rng, 26, (7000 - x0, 8200 - x0), (700, 1100), size=(1.2, 2.4), glow=0.55, color=(1.0, 0.90, 0.55))
    return out


# ------------------------------------------------------------------------------------------------------------- the stage
def render_flow2(paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    px0, A = cache_load('f_pond')
    gx0, B = cache_load('f_garden')
    x0, w = FX0, FW
    xs_i = np.arange(x0, x0 + w)
    a_img = A[:, np.clip(xs_i - px0, 0, A.shape[1] - 1)]
    b_img = B[:, np.clip(xs_i - gx0, 0, B.shape[1] - 1)]
    base = stagger_blend(a_img, b_img, x0, 7500.0, 1250.0, seed=11, amp=300.0)
    xsf = xs_i.astype(np.float32)[None, :]
    ys = np.arange(H, dtype=np.float32)[:, None]
    img = drag(base, x0, w)
    # --- the lake turns to cloud, and back
    cs_rgb, cs_n = cloud_sea(x0, w)
    a_sea, e_sea = sea_alpha(x0, w, cs_n)
    img[HZ:] = img[HZ:] * (1 - a_sea[..., None]) + cs_rgb * a_sea[..., None]
    A_full = np.zeros((H, w), np.float32); A_full[HZ:] = a_sea
    if verbose: print('cloud sea', round(time.time() - t0, 1))
    mr, ma = F.mist_streams(x0, w)
    ma = cv2.GaussianBlur(ma, (0, 0), 1.6); mr = cv2.GaussianBlur(mr, (0, 0), 1.6)
    img = img * (1 - 0.45 * ma[..., None]) + mr * 0.45
    rm_c, rm_a = rising_mist(x0, w)
    img = img * (1 - rm_a[..., None]) + rm_c
    # --- the tree goes on
    wood, wa, rc, ac, P, R = bough_layers(x0, w, verbose=verbose)
    img = img * (1 - wa[..., None]) + wood * wa[..., None]
    img = img * (1 - ac[..., None]) + rc
    # --- the girls condense out of the mist
    ch = CH.render_chain(x0, w, 4700, 8750, verbose=verbose)
    form = smoothstep(4850, 6500, xsf)
    ghost = 0.10 + 0.90 * form
    ga = ch['alpha'] * ghost
    gblur = cv2.GaussianBlur(ga, (0, 0), 2.2)
    ga = ga * form + gblur * (1 - form)
    mist_c = np.array([0.93, 0.89, 0.97], np.float32)
    gc = ch['canvas'] * (0.30 + 0.70 * form)[..., None] + mist_c * (0.70 * (1 - form))[..., None]
    gc = gc * form[..., None] + cv2.GaussianBlur(gc, (0, 0), 2.2) * (1 - form)[..., None]
    ra_ = ch['refl_a'] * ghost * (1 - A_full)
    img = img * (1 - ra_[..., None]) + ch['refl'] * ra_[..., None]
    img = img * (1 - ga[..., None]) + gc * ga[..., None]
    veil = (1 - form) * np.exp(-(((ys - (HZ + 110)) / 190.0) ** 2)) * (0.35 + 0.65 * fbm01(x0, 0, w, H, 170, 4, 83, aniso=2.2)) * 0.62
    img = img * (1 - veil[..., None]) + np.array([0.90, 0.84, 0.95], np.float32) * veil[..., None]
    if verbose: print('girls', round(time.time() - t0, 1))
    pr, pa = petals2(x0, w)
    img = img * (1 - pa[..., None]) + pr
    bloom = np.exp(-(((xsf - G.SUN_G[0]) / 2300.0) ** 2 + ((ys - 700) / 520.0) ** 2))
    img = 1 - (1 - img) * (1 - bloom[..., None] * np.array([0.20, 0.11, 0.02], np.float32))
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it: return img
    ang = F.flow_angle(np.broadcast_to(xsf, (H, w)), np.broadcast_to(ys, (H, w))).astype(np.float32)
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = np.clip(np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)) * 1.6, 0, 1)
    detail = np.clip(edges + (ch['alpha'] > 0.5) * 0.7 + (ac > 0.4) * 0.5 + (wa > 0.4) * 0.4, 0, 1)
    fine_hard = (ch['alpha'] > 0.5) | (ac > 0.5)
    sk = 0.20 + 0.45 * cv2.GaussianBlur((ch['alpha'] > 0.3).astype(np.float32), (0, 0), 4.0)
    out, n = paint(img, passes=((13, 1.0, 0.0), (7.5, 1.0, 0.025), (4.2, 1.0, 0.03), (2.3, 1.1, 0.04), (1.4, 1.3, 0.06)),
                   default_flow=ang, default_w=0.80, detail=detail, seed=21, struct_keep=sk, verbose=verbose, fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    mL = smoothstep(4380, 5050, xsf); mR = 1 - smoothstep(8250, 8700, xsf)
    out = a_img * (1 - mL[..., None]) + out * mL[..., None]
    out = out * mR[..., None] + b_img * (1 - mR[..., None])
    cache_save('f_flow_base', x0, out)
    out = critters2(out, x0)
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time, os
    t = time.time()
    if os.environ.get('FLOW_REUSE') == '1':
        _, base_ = cache_load('f_flow_base')
        img = np.clip(critters2(base_, FX0), 0, 1).astype(np.float32)
    else:
        img = render_flow2()
    print('flow2', round(time.time() - t, 1), 's')
    cache_save('f_flow', FX0, img)
    preview(img, WORK + '/f_flow_preview.png', 2200)
