"""Assemble the single 10800x1350 world: melt every scene into the next, grade, check the cuts, slice into 10 slides."""
import math, os, sys
import numpy as np
import cv2
import cairo
from util import *
from shared import RIBBON, TEMPLE

TAU = 2 * math.pi


def section(name):
    x0, a = cache_load(name)
    return x0, a


def folk_to_water_mask(xs, ys):
    """flat folk -> volumetric: tight around the cloud ribbon (left of the cut = flat paint, right = real vapour),
    broad everywhere else (sky, pond)"""
    X, Y = np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))
    rx, ry = zip(*RIBBON)
    yc = np.interp(X, rx, ry)
    dist = np.abs(Y - yc)
    wcl = smoothstep(70, 300, dist)
    wcl = np.where(Y > HZ + 6, 1.0, wcl)
    n = fbm(int(xs[0]), 0, len(xs), H, 90, 3, 211) * 70
    xa = 2090 - 120 * wcl; xb = 2250 + 470 * wcl
    return smoothstep(xa, xb, X + n)


def xB(y):
    cx, ay, half, by = TEMPLE['cx'], TEMPLE['apex_y'], TEMPLE['half'], TEMPLE['base_y']
    return cx + (np.asarray(y, np.float32) - ay) / ((by - ay) / half)


def build(verbose=True):
    canvas = np.zeros((H, W, 3), np.float32)
    # ---- slides 1-2 : folk mural
    x0, a = section('s12')
    if x0 < 0: a, x0 = a[:, -x0:], 0                      # the part left of x = 0 lives on the loop board of slide 10
    canvas[:, x0:x0 + a.shape[1]] = a
    # ---- slides 3-4(+) : painterly realism, melted in
    x0, b = section('s34')
    xs = np.arange(2000, 2900)
    M = folk_to_water_mask(xs, np.arange(H))[..., None]
    sl = slice(2000, 2900)
    wat = b[:, 2000 - x0: 2900 - x0]
    canvas[:, sl] = canvas[:, sl] * (1 - M) + wat * M
    canvas[:, 2900:x0 + b.shape[1]] = b[:, 2900 - x0:]
    if verbose: print('folk -> water done')
    # ---- the meadow (slide 6 exterior) from its own left edge onward
    x6, m = section('s6')
    canvas[:, 5100:x6 + m.shape[1]] = m[:, 5100 - x6:]
    # ---- slide 5 fold, feathered into both neighbours
    x5, f = section('s5')
    xs5 = np.arange(x5, x5 + f.shape[1], dtype=np.float32)
    wgt = smoothstep(4150, 4420, xs5) * (1 - smoothstep(5780, 5950, xs5))
    canvas[:, x5:x5 + f.shape[1]] = canvas[:, x5:x5 + f.shape[1]] * (1 - wgt[None, :, None]) + f * wgt[None, :, None]
    if verbose: print('fold done')
    # ---- hallway: the outside turns inside out at the THRESHOLD - the portal's left jamb is where the world flips.
    #      Left of it the meadow / temple side carries on; right of it the corridor begins.
    import hall as HL
    x7, hl = section('s7')
    X, Y = np.meshgrid(np.arange(x7, x7 + hl.shape[1], dtype=np.float32), np.arange(H, dtype=np.float32))
    jl = HL.VPX - (Y - (HZ - HL.S0 * (HL.HC - HL.HE))) / HL.AS            # outer edge of the portal rib, left side
    Mb = smoothstep(-1.5, 2.5, X - jl + 3.0)
    seg = slice(x7, x7 + hl.shape[1])
    canvas[:, seg] = canvas[:, seg] * (1 - Mb[..., None]) + hl * Mb[..., None]
    if verbose: print('meadow -> hall done')
    # ---- ink: the roof edge becomes the first inked perspective line; the planks turn into ruled pencil lines
    #      that fan toward the vanishing point across the open air, until they meet the portal
    L = Layer(1900, H, 5900, 0, ss=2)
    c = L.ctx
    c.set_source_rgba(0.14, 0.08, 0.06, 0.95); c.set_line_width(3.6)
    c.new_path(); c.move_to(float(xB(-40)), -40); c.line_to(float(xB(H + 40)), H + 40); c.stroke()
    c.set_source_rgba(0.30, 0.30, 0.34, 0.45); c.set_line_width(1.2)
    c.new_path(); c.move_to(float(xB(-40)) + 7, -40); c.line_to(float(xB(H + 40)) + 7, H + 40); c.stroke()
    ay, by = TEMPLE['apex_y'], TEMPLE['base_y']
    jl_f = lambda yy: HL.VPX - (yy - (HZ - HL.S0 * (HL.HC - HL.HE))) / HL.AS
    for yj in np.arange(ay + 20, by, 21.0):
        x_s = float(xB(yj))
        c.set_line_width(1.1)
        n = 90
        pts = []
        for i in range(n + 1):
            xx = x_s + i * 14.0
            g = ((xx - x_s) / (VPX - x_s)) * float(smoothstep(0, 700, xx - x_s))
            pts.append((xx, yj + (HZ - yj) * g))
        for i in range(n):
            if pts[i + 1][0] > jl_f(pts[i + 1][1]) - 4: break
            a_ = 0.55 * (1 - i / n) ** 1.1
            c.set_source_rgba(0.26, 0.22, 0.18, a_); c.new_path(); c.move_to(*pts[i]); c.line_to(*pts[i + 1]); c.stroke()
    ir, ia = L.get()
    canvas[:, 5900:7800] = canvas[:, 5900:7800] * (1 - ia[..., None]) + ir
    return canvas


def finish(img, seed=1):
    """one global grade so the whole world shares light: warm lift in the highlights, deeper shadows, subtle grain,
    a few gold-leaf glints along the brightest warm edges, dither"""
    out = img.copy()
    luma = out.mean(-1, keepdims=True)
    out = out * 1.0 + (out - luma) * 0.06                              # a touch more chroma
    hi = np.clip((luma - 0.62) * 2.2, 0, 1)
    out = out + hi * np.array([0.045, 0.030, 0.000], np.float32)       # warm highlights
    lo = np.clip((0.30 - luma) * 2.5, 0, 1)
    out = out - lo * np.array([0.015, 0.010, 0.000], np.float32) + lo * np.array([0.0, 0.004, 0.012], np.float32)
    out = np.clip(out, 0, 1)
    out = np.clip((out - 0.5) * 1.035 + 0.5 + 0.004, 0, 1)             # slight S
    r = np.random.default_rng(seed)
    out = out + (r.random(out.shape[:2], dtype=np.float32) - 0.5)[..., None] * (1.5 / 255.0)
    return np.clip(out, 0, 1)


def cut_sheet(img, path):
    """strip of the 9 cuts (+ the loop seam), each 520 px wide centred on the cut, to check continuity"""
    tiles = []
    for k in range(1, 11):
        x = (k * SL) % W
        idx = (np.arange(x - 260, x + 260)) % W
        t = img[:, idx]
        t = t.copy(); t[:, 258:262] = t[:, 258:262] * 0.5 + np.array([1, 0, 0], np.float32) * 0.5     # red hairline at the cut
        tiles.append(cv2.resize(t, (260, 675), interpolation=cv2.INTER_AREA))
    sheet = np.concatenate([np.concatenate(tiles[:5], 1), np.concatenate(tiles[5:], 1)], 0)
    save_png(path, sheet)


def slice_and_save(img, outdir):
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for k in range(10):
        sl = img[:, k * SL:(k + 1) * SL]
        p = os.path.join(outdir, f'slide_{k + 1:02d}.png')
        save_png(p, sl); paths.append(p)
        a = np.clip(sl * 255 + .5, 0, 255).astype(np.uint8)
        cv2.imwrite(os.path.join(outdir, f'slide_{k + 1:02d}.jpg'), a[..., ::-1], [cv2.IMWRITE_JPEG_QUALITY, 95])
    return paths


if __name__ == '__main__':
    import time
    t = time.time()
    img = build()
    print('assembled', round(time.time() - t, 1))
    img = finish(img)
    np.save(os.path.join(WORK, 'panorama.npy'), img.astype(np.float16))
    preview(img, WORK + '/pano_preview.png', 2700)
    cut_sheet(img, WORK + '/cuts.png')
    print('saved previews', round(time.time() - t, 1))
