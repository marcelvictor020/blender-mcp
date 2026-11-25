"""Slides 3-8, rebuilt: the dusk lake (shared WORLD sky / shore / water), the cathedral of two ancient trees standing IN the water, the lantern girl in her boat,
the sleeping woman's cloud, the lily pads and the white-robed walkers on the far shore. Everything is lit by three lights (blue sky, rose afterglow, lantern)."""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
import water as W
import boat as BT
import sculpt as SC
import pond2 as P2
import arch2 as AR
import critters as CR
from folk import Z

X0, X1 = 2000, 8200
CW = X1 - X0
AX0, AW = 3000, 2100


def embed(sub, sx0, x0, w):
    """place a sub-canvas (cols sx0..sx0+sw) into a full (…,w) array"""
    sw = sub.shape[1]
    out = np.zeros((sub.shape[0], w) + sub.shape[2:], np.float32)
    a, b = max(sx0, x0), min(sx0 + sw, x0 + w)
    out[:, a - x0:b - x0] = sub[:, a - sx0:b - sx0]
    return out


def vapour(img, x0, w):
    """the ribbon's breath pours down to the lake and lies on it as a long pearl mist (colours follow the dusk)"""
    h = img.shape[0]
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    ys = np.arange(h, dtype=np.float32)[:, None]
    cy = W.centre_y(xs)
    below = ys - (cy + 38)
    streak = fbm01(x0, 0, w, h, 190, 3, 51, aniso=0.045, gain=0.5)
    ramp = smoothstep(2650, 3350, xs) * (1 - smoothstep(3600, 4500, xs) * 0.35)
    curt = np.clip(below / 150.0, 0, 6)
    curtain = ramp * np.exp(-curt * 1.2) * (0.25 + 0.95 * streak) * smoothstep(0, 24, below) * 0.80 * (1 - smoothstep(HZ + 20, HZ + 130, ys))
    dist = np.abs(ys - (HZ + 6))
    sig = 24 + 46 * smoothstep(2400, 3500, xs) * (1 - 0.30 * smoothstep(3900, 4400, xs))
    band = np.exp(-(dist / sig) ** 2) * (0.35 + 0.65 * fbm01(x0, 0, w, h, 130, 4, 61, aniso=8.0))
    band = band * smoothstep(2650, 3250, xs) * (1 - 0.55 * smoothstep(4300, 5600, xs))
    low = np.exp(-((ys - (HZ + 90)) / 120.0) ** 2) * (0.25 + 0.75 * fbm01(x0, 0, w, h, 190, 4, 71, aniso=6.0)) * 0.26 * smoothstep(2700, 3400, xs) * (1 - 0.6 * smoothstep(4800, 6600, xs))
    m = np.clip(curtain + band * 0.70 + low, 0, 0.82)
    glow = np.exp(-((ys - HZ) / 70.0) ** 2)
    col = np.array([0.72, 0.64, 0.86], np.float32) * (1 - 0.35 * glow)[..., None] + np.array([1.0, 0.64, 0.52], np.float32) * (0.35 * glow)[..., None]
    k = smoothstep(3400, 5200, xs)[..., None]
    col = col * (1 - 0.40 * k) + np.array([0.92, 0.80, 0.82], np.float32) * (0.40 * k)
    return img * (1 - m[..., None]) + col * m[..., None]



def shore_strip(x0, w):
    """the far shore the white-robed walkers actually stand on: a thin dark-olive bank at the horizon with a lit rim, grass tufts and its reflection"""
    L = Layer(w, 90, x0, HZ - 14, 3)
    c = L.ctx
    xs = np.arange(x0 - 10, x0 + w + 10, 3.0)
    top = HZ - 1.5 + 1.5 * np.sin(xs / 37.0) + 1.1 * np.sin(xs / 13.0 + 1)
    bot = HZ + 11 + 1.4 * np.sin(xs / 29.0 + 2)
    c.new_path(); c.move_to(xs[0], bot[0])
    for x_, y_ in zip(xs, top): c.line_to(float(x_), float(y_))
    for x_, y_ in zip(xs[::-1], bot[::-1]): c.line_to(float(x_), float(y_))
    c.close_path()
    g = cairo.LinearGradient(0, HZ - 3, 0, HZ + 12)
    g.add_color_stop_rgb(0, 0.46, 0.40, 0.46); g.add_color_stop_rgb(0.35, 0.20, 0.22, 0.20); g.add_color_stop_rgb(1, 0.07, 0.10, 0.10)
    c.set_source(g); c.fill()
    r = np.random.default_rng(31)
    for _ in range(int(w / 2.2)):
        x = r.uniform(x0, x0 + w); k = int(np.clip((x - (x0 - 10)) / 3.0, 0, len(xs) - 1))
        c.set_source_rgba(0.30 + 0.2 * r.random(), 0.34 + 0.15 * r.random(), 0.22, 0.8); c.set_line_width(0.9)
        c.new_path(); c.move_to(x, top[k] + 1.2); c.line_to(x + r.normal(0, 0.9), top[k] - r.uniform(1.5, 5.0)); c.stroke()
    rgb, a = L.get()
    fade = (1 - smoothstep(7300, 8000, np.arange(x0, x0 + w, dtype=np.float32)))[None, :]
    rgb = rgb * fade[..., None]; a = a * fade
    full_rgb = np.zeros((H, w, 3), np.float32); full_a = np.zeros((H, w), np.float32)
    full_rgb[HZ - 14:HZ + 76] = rgb; full_a[HZ - 14:HZ + 76] = a
    rr = np.zeros((H, w, 3), np.float32); ra = np.zeros((H, w), np.float32)
    seg_rgb, seg_a = rgb[:30][::-1], a[:30][::-1]                          # reflection: rows just above the bank line, flipped under it
    y0 = HZ + 13
    rr[y0:y0 + 30] = seg_rgb * 0.55; ra[y0:y0 + 30] = seg_a * 0.45 * np.linspace(1, 0, 30)[:, None]
    rr = cv2.GaussianBlur(rr, (0, 0), sigmaX=2.0, sigmaY=1.2); ra = cv2.GaussianBlur(ra, (0, 0), sigmaX=2.0, sigmaY=1.2)
    return full_rgb, full_a, rr, ra


def render_pond(x0=X0, w=CW, paint_it=True, verbose=True):
    import time
    from paint import paint
    t0 = time.time()
    wx0, world = cache_load('f_world')
    img = world[:, x0 - wx0:x0 - wx0 + w].copy()
    sr_, sa_, srr, sra = shore_strip(x0, w)
    img = img * (1 - sra[..., None]) + srr
    img = img * (1 - sa_[..., None]) + sr_
    img = vapour(img, x0, w)
    br, ba = P2.bank_layer(x0, w)
    img = img * (1 - ba[..., None]) + br
    pr, pa = P2.pads_layer(x0, w)
    img = img * (1 - pa[..., None]) + pr
    boat_rgb, boat_a = P2.render_boat2()                                   # (this also moves BT.LANTERN to the girl's real lamp)
    lm = W.lantern_mist(x0, w)
    img = img * (1 - lm[..., None]) + np.array([1.0, 0.72, 0.42], np.float32) * lm[..., None]
    A = AR.render_arch(AX0, AW, verbose=verbose)
    wood, wa = embed(A['wood'], AX0, x0, w), embed(A['wa'], AX0, x0, w)
    rb, ab = embed(A['B'][0], AX0, x0, w), embed(A['B'][1], AX0, x0, w)
    rc, ac = embed(A['C'][0], AX0, x0, w), embed(A['C'][1], AX0, x0, w)
    trr, tra = AR.trunk_reflection(wood * wa[..., None], wa, x0, w)
    img = img * (1 - tra[..., None]) + trr
    rr, ra = W.boat_reflection(boat_rgb, boat_a, x0, w)
    WL = int(BT.WATERLINE); ox = BT.BX0 - x0
    sl = img[WL:, ox:ox + BT.BW]
    img[WL:, ox:ox + BT.BW] = sl * (1 - ra[..., None]) + rr
    sr, sa = W.water_streak(x0, w)
    img = img * (1 - sa[..., None]) + sr
    rg, rga = W.ripple_rings(x0, w)
    img = img * (1 - rga[..., None]) + rg
    img = img * (1 - ab[..., None]) + rb
    oy = BT.BY0
    img[oy:oy + BT.BH, ox:ox + BT.BW] = img[oy:oy + BT.BH, ox:ox + BT.BW] * (1 - boat_a[..., None]) + boat_rgb
    img = img * (1 - wa[..., None]) + wood * wa[..., None]
    yy_, xx_ = np.mgrid[0:H, 0:w]
    clear = np.clip(1.5 * np.exp(-(((xx_ + x0 - (GIRL_X + 22)) / 118.0) ** 2 + ((yy_ - 700) / 160.0) ** 2)), 0, 1) * (1 - wa)
    rc = rc * (1 - clear)[..., None]; ac = ac * (1 - clear)
    img = img * (1 - ac[..., None]) + rc
    wr, wra = AR.water_rings(AX0, AW)
    wr, wra = embed(wr, AX0, x0, w), embed(wra, AX0, x0, w)
    img = img * (1 - wra[..., None]) + wr
    sp_r, sp_a = AR.shed_petals(x0, w)
    img = img * (1 - sp_a[..., None]) + sp_r
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
    gx0 = int(GIRL_X - 140 - x0); detail[600:970, gx0:gx0 + 330] = 1.0
    fx0 = int(FACE['cx'] - 0.50 * FACE['S'] - x0); fy0 = int(FACE['cy'] - 0.62 * FACE['S'])
    detail[fy0:fy0 + int(1.15 * FACE['S']), fx0:fx0 + int(0.95 * FACE['S'])] = 1.0
    fine_hard = detail > 0.9
    fine_soft = cv2.GaussianBlur(detail, (0, 0), 6.0)
    detail = np.clip(detail + edges + 0.55 * (ac > 0.5), 0, 1)
    out, n = paint(img, passes=((11, 1.0, 0.0), (6.5, 1.0, 0.025), (3.8, 1.0, 0.03), (2.2, 1.1, 0.04), (1.4, 1.3, 0.06)),
                   default_flow=0.0, default_w=0.55, detail=detail, seed=7, struct_keep=0.30 + 0.40 * fine_soft, verbose=verbose, fine_mask=fine_hard)
    if verbose: print('painted', n, round(time.time() - t0, 1))
    # ---- crisp post layers
    out = SC.face_paint_real(out, x0, FACE['cx'], FACE['cy'], FACE['S'], strength=1.0)
    bfr, bfa = P2.bark_face_layer(x0, w)
    out = out * (1 - bfa[..., None]) + bfr
    pc, pa_, prc, pra = P2.procession_layer(x0, w)
    out = out * (1 - pra[..., None]) + prc * pra[..., None]
    out = out * (1 - 0.82 * pa_[..., None]) + 0.78 * pc
    brd, bra = P2.birds_layer(x0, w)
    out = out * (1 - bra[..., None]) + brd
    rng = np.random.default_rng(99)
    # lanterns rising from the girl's boat through the skylight of the arch, then fireflies in the leaves and over the water
    for (lx, ly, S, wm) in ((3905, 575, 10.5, 1.0), (3838, 452, 9.5, 1.0), (3942, 352, 8.0, 0.9), (3795, 240, 7.0, 0.9), (3880, 150, 6.0, 0.8), (3820, 60, 5.0, 0.7)):
        CR.sky_lantern(out, lx - x0, ly, S, day=0.0, warm=wm)
    CR.swan_family(out, 2430 - x0, 1222, 140, rng)
    CR.flower_boat(out, 2960 - x0, 1085, 74, 21, pal=1)
    CR.fireflies(out, rng, 70, (3120 - x0, 4560 - x0), (260, 1000), size=(1.4, 3.6), glow=1.0)
    CR.fireflies(out, rng, 36, (3300 - x0, 4400 - x0), (880, 1250), size=(1.2, 2.8), glow=0.8, color=(1.0, 0.86, 0.50))
    # gold-leaf flecks near the lantern
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
    save_png(WORK + '/f_s3.png', img[:, 2160 - X0:3240 - X0])
    save_png(WORK + '/f_s4.png', img[:, 3240 - X0:4320 - X0])
