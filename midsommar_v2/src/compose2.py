"""Assemble the 16-slide world (17280 x 1350). Every join is a row-by-row smear (sideways wet-paint blend), never a hard cut:
folk -> pond (the cloud turns real), pond -> garden (the flow stage), garden -> drawing -> hallway (the world is redrawn in graphite and
gouache; pencil lines fan out of the temple's planks toward the vanishing point), then one grade."""
import math, os
import numpy as np
import cv2
import cairo
from util import *
from blend import smear_blend, stagger_blend, lowfreq_match
import sketch as SK
from shared import TEMPLE
from hall import S0, HC, HE, AS

TAU = 2 * math.pi


def jamb_l(y):
    return VPX - (np.asarray(y, np.float32) - (HZ - S0 * (HC - HE))) / AS


def xB(y):
    cx, ay, half, by = TEMPLE['cx'], TEMPLE['apex_y'], TEMPLE['half'], TEMPLE['base_y']
    return cx + (np.asarray(y, np.float32) - ay) / ((by - ay) / half)


def seg(arr, x0, a, b):
    """columns [a,b) of a cached stage whose first column is x0; columns outside the stage replicate its edge"""
    xs = np.clip(np.arange(a, b) - x0, 0, arr.shape[1] - 1)
    return arr[:, xs]


def build(verbose=True):
    """design space (18360 px, 17 slides) -> the finished carousel (17280 px, 16 slides).

    Design space holds every stage at the position it was authored. Two design slides are never shown: the dull sea-of-cloud slide (design 6, the lake is
    simply cut from the fold straight into the sunset, with a row-by-row melt across 600 px) and the moon page between the invitation and the hallway (the
    invitation melts into the drawing of the same meadow, and the hallway starts). The moon ends the carousel instead, melting out of the overhead dance."""
    from blend import stagger_blend, lowfreq_match
    canvas = np.zeros((H, W, 3), np.float32)
    x0f, folk = cache_load('f_folk')
    x0p, pond = cache_load('f_pond')
    x0g, garden = cache_load('f_garden')
    x0w, flow = cache_load('f_flow')
    x0h, hall = cache_load('f_hall')
    # ---- 1. folk world, folk -> pond (the painted cloud turns real, row by row), pond, the flow stage, the garden
    canvas[:, 0:1600] = seg(folk, x0f, 0, 1600)
    A = seg(folk, x0f, 1600, 3200)
    Bp = seg(pond, x0p, 1600, 3200)
    Bp[:, :max(0, x0p - 1600)] = A[:, :max(0, x0p - 1600)]
    cut = max(0, x0p - 1600)                                                       # the lake's own image starts at x0p: the join starts there too (no hard edge where it begins)
    Bt = Bp.copy()                                                                 # the colour the lake will have at its first column, carried leftward: the folk picture warms toward it before the border
    if cut > 0:
        edge = cv2.GaussianBlur(np.ascontiguousarray(Bp[:, cut:cut + 160].mean(1, keepdims=True)), (0, 0), sigmaX=0.1, sigmaY=30.0)
        Bt[:, :cut] = edge
    A2 = lowfreq_match(A, Bt, 1600, 1740.0, 1600 + cut + 40.0, sigma=55.0, strength=0.97)
    canvas[:, 1600:1600 + cut] = A2[:, :cut]
    canvas[:, 1600 + cut:3200] = stagger_blend(A2[:, cut:], Bp[:, cut:], 1600 + cut, 2640.0, 560.0, seed=5, amp=200.0, soft_min=0.25, fine=0.7)
    canvas[:, 3200:4300] = seg(pond, x0p, 3200, 4300)
    canvas[:, 4300:8700] = seg(flow, x0w, 4300, 8700)
    canvas[:, 8700:12900 + SHIFT] = seg(garden, x0g, 8700, 12900 + SHIFT)
    if verbose: print('design placed')
    # ---- 2. the DRAWING version of the meadow (graphite + gouache), with pencil construction lines, and the hallway behind its left doorframe
    a2 = x0h                                                       # 12000: where the hall image starts
    b2 = 12900 + SHIFT
    G = canvas[:, a2:b2].copy()
    xc0, close = cache_load('f_close')                             # slide 10 is the house seen close (own stage); its wall goes on across the border and is DRAWN there
    cf0 = xc0 - 1080                                                # finished x of the close-up's first column
    d0, d1 = max(a2, cf0 + 2160), min(b2, cf0 + close.shape[1] + 2160)
    Gc = close[:, d0 - 2160 - cf0:d1 - 2160 - cf0]
    Lm_ = cv2.GaussianBlur(np.ascontiguousarray(Gc.mean(-1)), (0, 0), 80)                  # a drawing is evenly lit: the lamp-light, the vignette and the dapple of the painted wall are divided out ...
    Gc = np.clip(Gc * np.clip(0.62 / np.maximum(Lm_, 0.12), 0.9, 1.9)[..., None], 0, 1)
    Gc = np.clip(Gc * 1.06 + 0.03, 0, 1) ** 0.88                                              # ... and it is lifted toward paper: the shade is a wash, not a hatch
    G[:, d0 - a2:d1 - a2] = Gc
    sk = SK.sketchify(G, line_gain=2.5)
    ypap = fbm(a2, 0, b2 - a2, H, 3, 2, 421) * 0.04
    sk = np.clip(sk * (1 + ypap[..., None]), 0, 1)
    Lr = Layer(b2 - a2, H, a2, 0, 2)
    c = Lr.ctx
    rng = np.random.default_rng(81)
    for k_ in range(70):                                           # construction rays radiate from the vanishing point
        ang = rng.uniform(math.pi - 0.95, math.pi + 0.95)
        L_ = rng.uniform(1700, 3700)
        x1, y1 = VPX + L_ * math.cos(ang), HZ + L_ * math.sin(ang)
        steps = 28
        for s_ in range(steps):
            t0, t1 = s_ / steps, (s_ + 1) / steps
            xa, ya = VPX + (x1 - VPX) * t0, HZ + (y1 - HZ) * t0
            xb, yb = VPX + (x1 - VPX) * t1, HZ + (y1 - HZ) * t1
            if xb < a2: continue
            al = 0.20 * float(smoothstep(12100, 13700, xa)) * (0.55 + 0.45 * rng.random())
            c.set_source_rgba(0.25, 0.26, 0.30, al); c.set_line_width(1.0)
            c.new_path(); c.move_to(xa, ya); c.line_to(xb, yb); c.stroke()
    for kk in range(1, 46):                                        # the ground plane is drawn too: transversals cross the orthogonals
        y = HZ + 9.0 * 1.19 ** kk
        if y > H - 4: break
        xr = float(jamb_l(y)) - 6
        x_a = a2 + 20 + 34 * kk
        if xr <= x_a: continue
        press = rng.uniform(0.5, 1.0)
        xx = x_a
        while xx < xr:
            seg_l = rng.uniform(60, 320)
            if rng.random() < 0.10: xx += rng.uniform(8, 26); continue
            xe = min(xr, xx + seg_l)
            al = 0.24 * press * float(smoothstep(12100, 12900, xx)) * (1 - 0.7 * float(smoothstep(13300, 13700, xx)))
            if al > 0.01:
                c.set_source_rgba(0.24, 0.23, 0.25, al); c.set_line_width(0.9 + 0.5 * press)
                c.new_path(); c.move_to(xx, y + rng.normal(0, 0.35)); c.line_to(xe, y + rng.normal(0, 0.35)); c.stroke()
            xx = xe
    lr, la = Lr.get()
    sk = sk * (1 - la[..., None]) + lr
    skh = np.zeros((H, W - a2, 3), np.float32)
    skh[:, :b2 - a2] = sk
    xs_h = np.arange(x0h, x0h + hall.shape[1], dtype=np.float32)[None, :]
    yy = np.arange(H, dtype=np.float32)[:, None]
    jl = jamb_l(yy)
    Mb = smoothstep(-1.5, 2.5, xs_h - jl + 3.0)
    skh = skh * (1 - Mb[..., None]) + hall * Mb[..., None]
    # the overhead lawn: tilt the camera up, finish the night (hall2.finish_board), and lay it in beyond the last doorframe (the part past the canvas is the extension under the moon slide)
    import hall2 as H2
    xb0, pre = cache_load('f_board_pre')                           # first column = design x 15560
    bw = H2.HX1 - xb0
    brd_full = H2.finish_board(pre)
    brd = brd_full[:, :bw]; ext = brd_full[:, bw:]
    yy2, xx2 = np.mgrid[0:H, 0:bw]
    jb = H2.jamb_x(yy2) - 3.0
    mjb = smoothstep(-1.5, 2.5, (xx2 + xb0) - jb)
    brd = brd * (0.55 + 0.45 * np.clip(((xx2 + xb0) - jb) / 70.0, 0, 1))[..., None]
    sl_ = slice(xb0 - a2, xb0 - a2 + bw)
    skh[:, sl_] = skh[:, sl_] * (1 - mjb[..., None]) + brd * mjb[..., None]
    del brd_full, pre, brd, yy2, xx2, jb, mjb
    if verbose: print('drawing + hallway + board')
    # ---- 3. the finished carousel
    Wf = W - 2 * SL
    fin = np.zeros((H, Wf, 3), np.float32)
    fin[:, :5100] = canvas[:, :5100]
    fin[:, 5100:5700] = stagger_blend(lowfreq_match(canvas[:, 5100:5700], canvas[:, 6180:6780], 5100, 5120.0, 5400.0), canvas[:, 6180:6780], 5100, 5400.0, 460.0, seed=17, amp=110.0, soft_min=0.30, fine=0.6)
    # slide 10 is the house seen close (its own stage, f_close: design x 10380.. = finished 9300..). Three joins, none of them a smear:
    #  9|10   the old tree (trunk9) stands ON the border: behind its trunk the far view simply ends and the close view begins - a cut hidden by an object, like the lake tree on 3|4;
    #  10|11  the wall goes on into slide 11 as a drawing of itself: painted -> drawn is a multi-band blend of two ALIGNED pictures (no ghosts, no step of shade);
    #         the hallway's frame is a crisp object that stands BEHIND the things in front of it (the door leaf, the garland, the tall meadow plants).
    zS = 9700
    fin[:, 5700:zS] = canvas[:, 5700 + 1080:zS + 1080]
    zC0, zC1 = 10400, 10960
    fin[:, zS:zC0] = close[:, zS - cf0:zC0 - cf0]
    import blend as BL
    xm_, cmasks = cache_load('f_close_masks')
    Mw = 240
    xa_, xb_ = zC0 - Mw, zC1 + Mw
    P_ = close[:, xa_ - cf0:xb_ - cf0]
    D_ = sk[:, xa_ + 2160 - a2:xb_ + 2160 - a2]
    W_ = BL.mband_blend(P_, D_, xa_, BL.wave_boundary(H, 10690.0, 24.0, seed=31))
    Mh_ = Mb[:, xa_ + 2160 - x0h:xb_ + 2160 - x0h]
    Hh_ = hall[:, xa_ + 2160 - x0h:xb_ + 2160 - x0h]
    Xw_ = (np.arange(xa_, xb_, dtype=np.float32))[None, :]
    occ_ = cmasks[:, xa_ - cf0:xb_ - cf0, 0:3].max(-1) * smoothstep(10880, 10790, Xw_)
    keep_ = (Mh_ * (1 - occ_))[..., None]
    Z_ = W_ * (1 - keep_) + Hh_ * keep_
    fin[:, zC0:zC1] = Z_[:, Mw:Mw + (zC1 - zC0)]
    fin[:, zC1:] = skh[:, zC1 + 2160 - a2:W - a2]
    # the meadow plants at the lower right of the doorway are a PAINTED layer in front of everything (a plant is never turned into a drawing): the hallway's frame stands behind them
    xs_, cluster = cache_load('f_close_cluster')
    cx_a, cx_b = 10400, 11010
    cl_rgb = cluster[:, cx_a - cf0:cx_b - cf0, :3]; cl_a = cluster[:, cx_a - cf0:cx_b - cf0, 3]
    from ink import paper as _paper
    pap_ = _paper(H, cx_b - cx_a, 17)
    fin[:, cx_a:cx_b] = fin[:, cx_a:cx_b] * (1 - cl_a[..., None]) + cl_rgb * pap_[..., None]
    if verbose: print('cut + joined')
    # ---- 4. silk ribbons from the fold to the far house (drawn in finished coordinates, so they are one continuous object)
    import ribbons as RB
    rx0, rw = 4900, 1500
    rr, ra = RB.ribbon_layer(rx0, rw)
    fin[:, rx0:rx0 + rw] = fin[:, rx0:rx0 + rw] * (1 - ra[..., None]) + rr
    # ---- 4b. bunting from the far house's right roof edge, across the 9|10 border, to the lantern beside the door in the close view (and on over the door)
    import critters as CR
    rb_ = np.random.default_rng(404)
    sub_ = fin[:, 9300:9900]
    CR.festoon(sub_, (9338 - 9300, 366), (9795 - 9300, 333), 46, 16, rb_, fw=22)
    fin[:, 9300:9900] = sub_
    import trunk9 as TK
    fin = TK.apply_trunk(fin, verbose=verbose)
    # ---- 5. the moon, the sun's twin, melts out of the overhead dance
    import moon_slide as MS
    xm0, moon = cache_load('f_moon')                                # first column = finished x 15700
    out = np.zeros((H, W_FINAL, 3), np.float32)
    fin_ext = np.concatenate([fin, ext], 1)                          # the lawn keeps bending up past the end of the hallway canvas (finished x 16200 ..)
    # the camera has levelled on the horizon by 16320. The SKY is one gradient in both pictures, so it simply changes hands at 16340 (a short feather): the moon's petals are never cut.
    # The GROUND (the dark lawn in haze / the painted folk meadow) is one aligned multi-band blend across a smooth wandering line: the colours first (low frequencies), then the detail.
    zb = 16340
    gx0, gx1 = 16120, 16700
    out[:, :gx0] = fin_ext[:, :gx0]
    A_ = fin_ext[:, gx0:gx1]; B_ = moon[:, gx0 - xm0:gx1 - xm0]
    import blend as BL
    Ag_ = lowfreq_match(A_, B_, gx0, 16150, 16430, sigma=60.0, strength=0.92)           # ground only: the lawn's haze takes the meadow's night colours first ...
    gr_ = BL.mband_blend(Ag_, B_, gx0, BL.wave_boundary(H, 16380.0, 22.0, seed=23))    # ... then its detail changes hands across a smooth wandering line
    Xr = (np.arange(gx0, gx1, dtype=np.float32))[None, :]
    yy_ = np.arange(H, dtype=np.float32)[:, None]
    ms = smoothstep(zb - 18, zb + 18, Xr)
    sky_ = A_ * (1 - ms[..., None]) + B_ * ms[..., None]
    wsky = 1.0 - smoothstep(HZ - 5, HZ + 9, yy_)
    out[:, gx0:gx1] = sky_ * wsky[..., None] + gr_ * (1 - wsky[..., None])
    out[:, gx1:] = moon[:, gx1 - xm0:]
    out = moonbeams(out)
    # the lanterns the dance sent up (seen from above on the lawn) drift on into the moon's sky, now seen from the side: the same drifting lanterns as the whole journey
    import critters as CR
    rl = np.random.default_rng(55)
    for (lx, ly, ls) in LANT_END:
        CR.sky_lantern(out[:, 15900:17280], lx - 15900, ly, ls, day=0.0, warm=1.0)
    if verbose: print('moon joined', out.shape)
    return out


LANT_END = [(16190, 640, 13.0), (16262, 560, 11.5), (16171, 470, 10.5), (16318, 395, 10.0), (16236, 300, 9.0), (16402, 520, 9.5), (16452, 242, 8.0), (16388, 150, 7.5),
            (16505, 330, 8.0), (16548, 640, 8.5), (16196, 170, 7.0), (17128, 190, 7.5), (17195, 470, 8.0), (17160, 640, 9.0), (17240, 300, 6.5), (16120, 700, 12.5)]


def moonbeams(img, cx=16810.0, cy=362.0, R=245.0, x_a=15000):
    """the moon's own petal rays do not stop at its slide: they go on as long soft shafts of moonlight over the dusk lawn, touching the dancers - one object that
    crosses the border (the way the tree's bough does), instead of two pictures joined"""
    import cairo
    x_b = img.shape[1]
    wreg = x_b - x_a
    h = img.shape[0]
    L = Layer(wreg, h, x_a, 0, 1)
    c = L.ctx
    c.set_operator(cairo.OPERATOR_ADD)
    n = 13
    for k in range(n):
        phi = math.pi + (k - (n - 1) / 2.0) * 0.150 + 0.03 * math.sin(k * 2.1)
        dx, dy = math.cos(phi), math.sin(phi)
        nx, ny = -dy, dx
        r0, r1 = 2.00 * R, 2.00 * R + 1900.0
        hw0, hw1 = 8.0, 150.0 + 40.0 * math.sin(k * 1.7)
        ax, ay = cx + dx * r0, cy + dy * r0
        bx, by = cx + dx * r1, cy + dy * r1
        g = cairo.LinearGradient(ax, ay, bx, by)
        A = 0.20 * (0.75 + 0.25 * math.sin(k * 1.3 + 0.4))
        g.add_color_stop_rgba(0.0, 0.62, 0.74, 1.0, A)
        g.add_color_stop_rgba(0.35, 0.62, 0.74, 1.0, A * 0.42)
        g.add_color_stop_rgba(1.0, 0.62, 0.74, 1.0, 0.0)
        c.set_source(g)
        c.new_path(); c.move_to(ax + nx * hw0, ay + ny * hw0); c.line_to(bx + nx * hw1, by + ny * hw1); c.line_to(bx - nx * hw1, by - ny * hw1); c.line_to(ax - nx * hw0, ay - ny * hw0); c.close_path(); c.fill()
    rgb, _ = L.get()
    rgb = cv2.GaussianBlur(np.clip(rgb, 0, 1), (0, 0), 7.0)
    reg = img[:, x_a:x_b]
    img[:, x_a:x_b] = 1 - (1 - reg) * (1 - np.clip(rgb, 0, 1))
    return img


def grade(img, seed=1):
    """one mature grade: calmer greens, split-toned shadows (teal) and highlights (gold), a gentle S-curve, a little halation and grain.
    Weighted down on the flat folk paint (slides 1-2) which is meant to stay bold."""
    h, w = img.shape[:2]
    xs = np.arange(w, dtype=np.float32)[None, :]
    wgt = (0.25 + 0.75 * smoothstep(1900, 3300, xs))[..., None]
    hsv = cv2.cvtColor(np.clip(img, 0, 1).astype(np.float32), cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0]
    green = smoothstep(52, 80, hue) * (1 - smoothstep(150, 180, hue))
    hsv[..., 1] = np.clip(hsv[..., 1] * (1 - 0.10 * green * wgt[..., 0]) * (1 + 0.07 * wgt[..., 0]), 0, 1)
    out = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    lum = out.mean(-1, keepdims=True)
    shadows = 1 - smoothstep(0.08, 0.45, lum)
    highs = smoothstep(0.62, 0.95, lum)
    out = out + wgt * (shadows * np.array([0.010, 0.006, 0.040], np.float32) + highs * np.array([0.040, 0.024, -0.006], np.float32))
    out = np.clip((out - 0.5) * (1 + 0.06 * wgt) + 0.5 + 0.004, 0, 1)
    hi = np.clip(out - 0.80, 0, 1)
    bloom = cv2.GaussianBlur(hi, (0, 0), 22)
    out = 1 - (1 - out) * (1 - 0.35 * wgt * bloom)
    r = np.random.default_rng(seed)
    out = out + (r.random((h, w), dtype=np.float32) - 0.5)[..., None] * (2.2 / 255.0)
    return np.clip(out, 0, 1)


def cut_sheet(img, path):
    tiles = []
    for k in range(1, N_FINAL):
        x = k * SL
        t = img[:, x - 220: x + 220].copy()
        t[:, 218:222] = t[:, 218:222] * 0.5 + np.array([1, 0, 0], np.float32) * 0.5
        tiles.append(cv2.resize(t, (220, 675), interpolation=cv2.INTER_AREA))
    while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
    rows = [np.concatenate(tiles[i:i + 4], 1) for i in range(0, len(tiles), 4)]
    save_png(path, np.concatenate(rows, 0))


if __name__ == '__main__':
    import time
    t = time.time()
    img = build()
    print('assembled', round(time.time() - t, 1))
    img = grade(img)
    np.save(os.path.join(WORK, 'panorama.npy'), img.astype(np.float16))
    preview(img, WORK + '/pano_preview.png', 3200)
    cut_sheet(img, WORK + '/cuts.png')
    print('saved previews', round(time.time() - t, 1))
