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
    canvas = np.zeros((H, W, 3), np.float32)
    x0f, folk = cache_load('f_folk')
    x0p, pond = cache_load('f_pond')
    x0g, garden = cache_load('f_garden')
    x0w, flow = cache_load('f_flow')
    x0h, hall = cache_load('f_hall')
    # ---- 1. folk world
    canvas[:, 0:1600] = seg(folk, x0f, 0, 1600)
    # ---- 2. folk -> pond: the painted cloud turns real; the plywood sky becomes a real sky, row by row
    A = seg(folk, x0f, 1600, 3200)
    Bp = seg(pond, x0p, 1600, 3200)
    Bp[:, :max(0, x0p - 1600)] = A[:, :max(0, x0p - 1600)]                   # (the pond has no data left of x=2000: use the folk there)
    canvas[:, 1600:3200] = stagger_blend(A, Bp, 1600, 2640.0, 500.0, seed=5, amp=200.0)
    if verbose: print('folk -> pond')
    # ---- 3. pond, then the flow stage (pond -> garden), then the garden
    canvas[:, 3200:4300] = seg(pond, x0p, 3200, 4300)
    canvas[:, 4300:8700] = seg(flow, x0w, 4300, 8700)
    canvas[:, 8700:12900] = seg(garden, x0g, 8700, 12900)
    if verbose: print('pond / flow / garden placed')
    # ---- 4. garden -> drawing (row-by-row), then the hallway behind its left doorframe
    a, b = 10300, 12900
    G = canvas[:, a:b].copy()
    sk = SK.sketchify(G, line_gain=2.5)
    ypap = fbm(a, 0, b - a, H, 3, 2, 421) * 0.04
    sk = np.clip(sk * (1 + ypap[..., None]), 0, 1)
    mixed = stagger_blend(G, sk, a, 11450.0, 760.0, seed=3, amp=300.0)
    # pencil fan: the temple's plank rows run on, ruled, toward the vanishing point; construction rays radiate from it
    Lr = Layer(b - a, H, a, 0, 2)
    c = Lr.ctx
    rng = np.random.default_rng(81)
    ay, by = TEMPLE['apex_y'], TEMPLE['base_y']
    for yj in np.arange(ay + 20, by, 21.0):
        x_s = float(xB(yj))
        pts = []
        n = 110
        for i in range(n + 1):
            xx = x_s + i * 16.0
            g = ((xx - x_s) / (VPX - x_s)) * float(smoothstep(0, 900, xx - x_s))
            pts.append((xx, yj + (HZ - yj) * g))
        for i in range(n):
            if pts[i + 1][0] > float(jamb_l(pts[i + 1][1])) - 5: break
            al = 0.30 * (1 - i / n) ** 1.0
            c.set_source_rgba(0.24, 0.22, 0.22, al); c.set_line_width(1.2)
            c.new_path(); c.move_to(*pts[i]); c.line_to(*pts[i + 1]); c.stroke()
    for k in range(70):
        ang = rng.uniform(math.pi - 0.95, math.pi + 0.95)
        L_ = rng.uniform(1700, 3700)
        x1, y1 = VPX + L_ * math.cos(ang), HZ + L_ * math.sin(ang)
        steps = 28
        for s_ in range(steps):
            t0, t1 = s_ / steps, (s_ + 1) / steps
            xa, ya = VPX + (x1 - VPX) * t0, HZ + (y1 - HZ) * t0
            xb, yb = VPX + (x1 - VPX) * t1, HZ + (y1 - HZ) * t1
            if xb < 10800: continue
            al = 0.20 * float(smoothstep(10800, 12600, xa)) * (0.55 + 0.45 * rng.random())
            c.set_source_rgba(0.25, 0.26, 0.30, al); c.set_line_width(1.0)
            c.new_path(); c.move_to(xa, ya); c.line_to(xb, yb); c.stroke()
    lr, la = Lr.get()
    mixed = mixed * (1 - la[..., None]) + lr
    canvas[:, a:b] = mixed
    # the hallway: begins at the doorframe's left jamb (the world flips inside out there)
    xs_h = np.arange(x0h, x0h + hall.shape[1], dtype=np.float32)[None, :]
    yy = np.arange(H, dtype=np.float32)[:, None]
    jl = jamb_l(yy)
    Mb = smoothstep(-1.5, 2.5, xs_h - jl + 3.0)
    reg = slice(x0h, x0h + hall.shape[1])
    canvas[:, reg] = canvas[:, reg] * (1 - Mb[..., None]) + hall * Mb[..., None]
    if verbose: print('garden -> drawing -> hall')
    return canvas


def grade(img, seed=1):
    """one mature grade: calmer greens, split-toned shadows (teal) and highlights (gold), a gentle S-curve, a little halation and grain.
    Weighted down on the flat folk paint (slides 1-2) which is meant to stay bold."""
    h, w = img.shape[:2]
    xs = np.arange(w, dtype=np.float32)[None, :]
    wgt = (0.25 + 0.75 * smoothstep(1900, 3300, xs))[..., None]
    hsv = cv2.cvtColor(np.clip(img, 0, 1).astype(np.float32), cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0]
    green = smoothstep(52, 80, hue) * (1 - smoothstep(150, 180, hue))
    hsv[..., 1] = hsv[..., 1] * (1 - 0.18 * green * wgt[..., 0])
    out = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    lum = out.mean(-1, keepdims=True)
    shadows = 1 - smoothstep(0.08, 0.45, lum)
    highs = smoothstep(0.62, 0.95, lum)
    out = out + wgt * (shadows * np.array([-0.012, 0.006, 0.030], np.float32) + highs * np.array([0.040, 0.024, -0.006], np.float32))
    out = np.clip((out - 0.5) * (1 + 0.06 * wgt) + 0.5 + 0.004, 0, 1)
    hi = np.clip(out - 0.80, 0, 1)
    bloom = cv2.GaussianBlur(hi, (0, 0), 22)
    out = 1 - (1 - out) * (1 - 0.35 * wgt * bloom)
    r = np.random.default_rng(seed)
    out = out + (r.random((h, w), dtype=np.float32) - 0.5)[..., None] * (2.2 / 255.0)
    return np.clip(out, 0, 1)


def cut_sheet(img, path):
    tiles = []
    for k in range(1, 16):
        x = k * SL
        t = img[:, x - 220: x + 220].copy()
        t[:, 218:222] = t[:, 218:222] * 0.5 + np.array([1, 0, 0], np.float32) * 0.5
        tiles.append(cv2.resize(t, (220, 675), interpolation=cv2.INTER_AREA))
    rows = [np.concatenate(tiles[i:i + 5], 1) for i in (0, 5, 10)]
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
