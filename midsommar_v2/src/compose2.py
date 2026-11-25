"""Assemble the 16-slide world (17280 x 1350). Every join is a row-by-row smear (sideways wet-paint blend), never a hard cut:
folk -> pond (the cloud turns real), pond -> garden (the flow stage), garden -> drawing -> hallway (the world is redrawn in graphite and
gouache; pencil lines fan out of the temple's planks toward the vanishing point), then one grade."""
import math, os
import numpy as np
import cv2
import cairo
from util import *
from blend import smear_blend, stagger_blend
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
    from blend import stagger_blend
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
    canvas[:, 1600:3200] = stagger_blend(A, Bp, 1600, 2640.0, 500.0, seed=5, amp=200.0)
    canvas[:, 3200:4300] = seg(pond, x0p, 3200, 4300)
    canvas[:, 4300:8700] = seg(flow, x0w, 4300, 8700)
    canvas[:, 8700:12900 + SHIFT] = seg(garden, x0g, 8700, 12900 + SHIFT)
    if verbose: print('design placed')
    # ---- 2. the DRAWING version of the meadow (graphite + gouache), with pencil construction lines, and the hallway behind its left doorframe
    a2 = x0h                                                       # 12000: where the hall image starts
    b2 = 12900 + SHIFT
    G = canvas[:, a2:b2].copy()
    sk = SK.sketchify(G, line_gain=2.5)
    ypap = fbm(a2, 0, b2 - a2, H, 3, 2, 421) * 0.04
    sk = np.clip(sk * (1 + ypap[..., None]), 0, 1)
    Lr = Layer(b2 - a2, H, a2, 0, 2)
    c = Lr.ctx
    rng = np.random.default_rng(81)
    ay, by = TEMPLE['apex_y'], TEMPLE['base_y']
    for yj in np.arange(ay + 20, by, 21.0):                        # the plank rows of the house run on, ruled, toward the vanishing point
        x_s = float(xB(yj))
        wob = rng.uniform(0, 6.28)
        pts = []
        n = 330
        for i in range(n + 1):
            xx = x_s + i * 16.0
            g = ((xx - x_s) / (VPX - x_s)) * float(smoothstep(0, 900, xx - x_s))
            pts.append((xx, yj + (HZ - yj) * g + 0.9 * math.sin(i * 0.37 + wob) * min(1.0, i / 40.0)))
        press = rng.uniform(0.55, 1.0)
        gaps = rng.uniform(0, 1, n) < 0.035
        for i in range(n):
            if pts[i + 1][0] > float(jamb_l(pts[i + 1][1])) - 5: break
            if pts[i][0] < a2 - 20 or pts[i][0] > b2 + 20 or gaps[i]: continue
            xm = pts[i][0]
            al = 0.30 * press * float(smoothstep(12100, 12800, xm)) * (1 - 0.6 * float(smoothstep(13200, 14000, xm)))
            if al < 0.01: continue
            c.set_source_rgba(0.24, 0.22, 0.22, al); c.set_line_width(0.8 + 0.7 * press)
            c.new_path(); c.move_to(*pts[i]); c.line_to(*pts[i + 1]); c.stroke()
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
    if verbose: print('drawing + hallway')
    # ---- 3. the finished carousel
    Wf = W - 2 * SL
    fin = np.zeros((H, Wf, 3), np.float32)
    fin[:, :5100] = canvas[:, :5100]
    fin[:, 5100:5700] = stagger_blend(canvas[:, 5100:5700], canvas[:, 6180:6780], 5100, 5400.0, 440.0, seed=17, amp=120.0)
    fin[:, 5700:10300] = canvas[:, 6780:11380]
    fin[:, 10300:10800] = stagger_blend(canvas[:, 11380:11880], skh[:, 12460 - a2:12960 - a2], 10300, 10560.0, 420.0, seed=19, amp=70.0)
    fin[:, 10800:] = skh[:, 12960 - a2:W - a2]
    if verbose: print('cut + joined')
    # ---- 4. silk ribbons from the fold to the far house (drawn in finished coordinates, so they are one continuous object)
    import ribbons as RB
    rx0, rw = 4900, 1500
    rr, ra = RB.ribbon_layer(rx0, rw)
    fin[:, rx0:rx0 + rw] = fin[:, rx0:rx0 + rw] * (1 - ra[..., None]) + rr
    # ---- 5. the moon, the sun's twin, melts out of the overhead dance
    import moon_slide as MS
    xm0, moon = cache_load('f_moon')                                # first column = finished x 15700
    out = np.zeros((H, W_FINAL, 3), np.float32)
    zb = 15900                                                      # the ring dance sits whole in its own slide; the night takes over only in the last 300 px
    out[:, :zb] = fin[:, :zb]
    out[:, zb:zb + 300] = stagger_blend(fin[:, zb:zb + 300], moon[:, zb - xm0:zb - xm0 + 300], zb, zb + 150.0, 240.0, seed=23, amp=46.0)
    out[:, zb + 300:] = moon[:, zb + 300 - xm0:]
    if verbose: print('moon joined', out.shape)
    return out


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
