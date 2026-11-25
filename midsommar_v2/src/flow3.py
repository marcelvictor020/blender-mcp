"""Slides 5-8 (x 4300..8700): four different pictures, one turning into the next - and no object longer than it can be.

  5  THE FOLD   the arch's own leaves curl up into a spiral vine round a folk flower and the picture itself twists inside the spiral; the pond lifts off the
                water as mist into it; five silk ribbons are untied from the canopy and begin to stream to the right;
  6  THE SEA    the lake has stopped being water: clouds condense out of the mirror (lump by lump, row by row) into a sea of cloud, jade smoke winds through it,
                and the girls take shape out of the mist - ghosts at the left border, solid at the right;
  7  THE GOLD   the cloud settles back into a lake in the low gold light; the girls walk it; petals fall on it;
  8  THE SHORE  the water ends at the meadow's edge, the girls step ashore, the ribbons run on to the maypole in slide 9.
The whole scene is dragged sideways, line by line, toward the clearing. The finish is ink and gouache (ink.py), not a paint filter."""
import math
import numpy as np
import cv2
import cairo
from util import *
from shared import *
import garden as G
import chain as CH
import arch2 as AR
import flow as F
import flow2 as F2
import ribbons as RB
import ink as INK
import reflect as RF
import clouds3 as CL3
import meadow as MD
import critters as CRT
from blend import stagger_blend

TAU = 2 * math.pi
FX0, FX1 = F.FX0, F.FX1
FW = FX1 - FX0
SC = (5120.0, 330.0, 380.0)
SUN_X_ = 7330.0                      # centre + radius of the fold


def swirl(img, x0, cx, cy, R, twist):
    """the picture turns inside itself: rotate the image about (cx,cy) by an angle that grows toward the centre"""
    h, w = img.shape[:2]
    xa, xb = int(max(0, cx - R - x0)), int(min(w, cx + R - x0 + 1))
    ya, yb = int(max(0, cy - R)), int(min(h, cy + R + 1))
    gx, gy = np.meshgrid(np.arange(xa, xb, dtype=np.float32) + x0, np.arange(ya, yb, dtype=np.float32))
    dx, dy = gx - cx, gy - cy
    r = np.hypot(dx, dy)
    f = np.clip(1 - r / R, 0, 1)
    phi = twist * f * f
    ang = np.arctan2(dy, dx) + phi
    sx = (cx + r * np.cos(ang) - x0).astype(np.float32)
    sy = (cy + r * np.sin(ang)).astype(np.float32)
    inside = (r < R)
    sx = np.where(inside, sx, gx - x0).astype(np.float32); sy = np.where(inside, sy, gy).astype(np.float32)
    patch = cv2.remap(img, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    out = img.copy()
    out[ya:yb, xa:xb] = patch
    return out


def leaf_ink(c, x, y, size, ang, col):
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda u, v: (x + u * ca - v * sa, y + u * sa + v * ca)
    c.new_path(); c.move_to(*T(0, 0))
    c.curve_to(*T(size * .3, -size * .36), *T(size * .75, -size * .30), *T(size, 0))
    c.curve_to(*T(size * .75, size * .28), *T(size * .3, size * .34), *T(0, 0)); c.close_path()
    c.set_source_rgb(*col); c.fill_preserve(); c.set_source_rgba(*INK.INK, 0.55); c.set_line_width(max(0.7, size * 0.045)); c.stroke()
    c.set_source_rgba(*INK.INK, 0.35); c.set_line_width(max(0.6, size * 0.03)); c.new_path(); c.move_to(*T(0, 0)); c.line_to(*T(size * 0.85, 0)); c.stroke()


def spiral_vine(x0, w, seed=61):
    """the canopy curls up: a leafy vine winding in about a folk flower, made of the arch's own leaves"""
    cx, cy, R = SC
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(seed)
    th = np.linspace(0, TAU * 2.3, 460)
    r = (R * 0.92) * (0.075 ** (th / th[-1]))
    ang = math.pi + th
    X, Y = cx + r * np.cos(ang), cy + 0.94 * r * np.sin(ang)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    for k in range(len(th) - 1):                                                  # the stem, thinner as it winds in
        wd = 5.2 * (1 - 0.8 * k / len(th))
        c.set_source_rgba(*INK.INK, 1.0); c.set_line_width(wd + 1.6); c.new_path(); c.move_to(X[k], Y[k]); c.line_to(X[k + 1], Y[k + 1]); c.stroke()
        c.set_source_rgb(0.34, 0.24, 0.15); c.set_line_width(wd); c.new_path(); c.move_to(X[k], Y[k]); c.line_to(X[k + 1], Y[k + 1]); c.stroke()
    for k in range(4, len(th) - 6, 5):
        tx, ty = X[k + 3] - X[k - 3], Y[k + 3] - Y[k - 3]
        a0 = math.atan2(ty, tx)
        size = 30 * (1 - 0.62 * k / len(th)) * rng.uniform(0.85, 1.15)
        for sd in (-1, 1):
            sky = rng.uniform(0.25, 0.85)
            col = AR.leaf_rgb(sky, 0.20 * (sd > 0), 0.0, rng)
            col = tuple(min(1.0, v * 1.35 + 0.03) for v in col)                  # drawn leaves are lighter than the dark painted canopy: they catch the afterglow
            leaf_ink(c, X[k], Y[k], size, a0 + sd * rng.uniform(0.55, 1.05), col)
        if rng.random() < 0.34:
            AR.blossom(c, X[k] + rng.normal(0, 9), Y[k] + rng.normal(0, 9), rng.uniform(4.5, 7.5), [(0.98, 0.95, 0.90), (0.97, 0.80, 0.84)][int(rng.integers(2))], rng)
    F.kurbits(c, cx, cy, 58.0, 0.0, rng)                                         # the folk flower at the heart of the fold: flat, inked, still folk
    return L.get()


def render_flow3(paint_it=True, verbose=True):
    import time
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
    img = F2.drag(base, x0, w)
    cs_rgb, cs_n = F2.cloud_sea(x0, w)
    a_sea, e_sea = F2.sea_alpha(x0, w, cs_n)
    img[HZ:] = img[HZ:] * (1 - a_sea[..., None]) + cs_rgb * a_sea[..., None]
    A_full = np.zeros((H, w), np.float32); A_full[HZ:] = a_sea
    if verbose: print('cloud sea', round(time.time() - t0, 1))
    mr, ma = F.mist_streams(x0, w)
    ma = cv2.GaussianBlur(ma, (0, 0), 1.8); mr = cv2.GaussianBlur(mr, (0, 0), 1.8)
    img = img * (1 - 0.40 * ma[..., None]) + mr * 0.40
    rm_c, rm_a = F2.rising_mist(x0, w)
    img = img * (1 - rm_a[..., None]) + rm_c
    img = swirl(img, x0, *SC, 2.7)                                                # the fold
    sv_rgb, sv_a = spiral_vine(x0, w)
    img = img * (1 - sv_a[..., None]) + sv_rgb
    ch = CH.render_chain(x0, w, 4700, 8750, verbose=verbose, shadow_dir=lambda gx, gy: sun_shadow_dir(gx, gy, length=1.25), shadows_all=True, ss=3, shadow_blur=0.022, shadow_strength=0.60)
    form = smoothstep(4850, 6500, xsf)
    lake_y = G.lake_y(xsf)
    land = ((ys > lake_y) & (xsf > 6900)).astype(np.float32)
    surf = np.clip(np.maximum(A_full, land), 0, 1)                                 # shadows fall on cloud and on grass, not on open water (there: reflections)
    sh = np.clip(ch['shadow'] * surf, 0, 1) * (0.55 + 0.20 * smoothstep(5200, 7400, xsf))
    img = img * (1 - sh[..., None]) + np.array([0.22, 0.16, 0.34], np.float32) * sh[..., None]
    ghost = 0.24 + 0.76 * form
    ga = ch['alpha'] * ghost
    ga = ga * form + cv2.GaussianBlur(ga, (0, 0), 2.2) * (1 - form)
    mist_c = np.array([0.93, 0.89, 0.97], np.float32)
    gc = ch['canvas'] * (0.30 + 0.70 * form)[..., None] + mist_c * (0.70 * (1 - form))[..., None]
    gc = gc * form[..., None] + cv2.GaussianBlur(gc, (0, 0), 2.2) * (1 - form)[..., None]
    gsharp = gc + 0.75 * (gc - cv2.GaussianBlur(gc, (0, 0), 1.1))                    # faces and hands: crisp where the figure is solid
    gc = np.where((ga > 0.45)[..., None], gsharp, gc)
    hz_amt = (0.34 * np.exp(-np.maximum(ys - HZ, 0) / 150.0))[..., None]              # aerial perspective: the far girls are paler and bluer
    hz_col = np.array([0.86, 0.76, 0.88], np.float32) * (1 - smoothstep(5200, 7400, xsf))[..., None] + np.array([1.0, 0.88, 0.70], np.float32) * smoothstep(5200, 7400, xsf)[..., None]
    gc = gc * (1 - hz_amt) + hz_col * hz_amt
    gc = np.clip(gc, 0, 1)
    ra_ = ch['refl_a'] * ghost * (1 - A_full)
    img = img * (1 - ra_[..., None]) + ch['refl'] * ra_[..., None]
    img = img * (1 - ga[..., None]) + gc * ga[..., None]
    veil = (1 - form) * np.exp(-(((ys - (HZ + 110)) / 190.0) ** 2)) * (0.35 + 0.65 * fbm01(x0, 0, w, H, 170, 4, 83, aniso=2.2)) * 0.62
    img = img * (1 - veil[..., None]) + np.array([0.90, 0.84, 0.95], np.float32) * veil[..., None]
    if verbose: print('girls', round(time.time() - t0, 1))
    pr, pa = F2.petals2(x0, w, n=700)
    img = img * (1 - pa[..., None]) + pr
    bloom = np.exp(-(((xsf - G.SUN_G[0]) / 2300.0) ** 2 + ((ys - 700) / 520.0) ** 2))
    img = 1 - (1 - img) * (1 - bloom[..., None] * np.array([0.14, 0.08, 0.02], np.float32))
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('composited', round(time.time() - t0, 1))
    if not paint_it: return img
    water_keep = ((ys > HZ + 2) & (ys < lake_y) | ((ys > HZ + 2) & (xsf < 6900))).astype(np.float32) * (1 - A_full)
    keep = np.clip(0.55 * (ga > 0.4) + 0.80 * (pa > 0.3) + 0.8 * (sv_a > 0.5) + 0.85 * water_keep, 0, 1).astype(np.float32)
    keep[HZ - 48:HZ + 14, :] = np.maximum(keep[HZ - 48:HZ + 14, :], 0.85)                     # the walkers on the far shore stay figures, not fins
    keep = cv2.GaussianBlur(keep, (0, 0), 1.6)
    lx = np.where(xsf < SUN_X_, 1.0, -1.0).astype(np.float32)
    out = INK.finish(img, lines=[(ch['alpha'] > 0.4, 1.3, 0.80 * form), (sv_a > 0.5, 1.2, 0.5)], keep=keep, seed=21, light_x=lx)
    mL = smoothstep(4380, 5050, xsf); mR = 1 - smoothstep(8250, 8700, xsf)
    out = a_img * (1 - mL[..., None]) + out * mL[..., None]
    out = out * mR[..., None] + b_img * (1 - mR[..., None])
    cache_save('f_flow_base', x0, out)
    lake = ((ys < lake_y) | (xsf < 6900)).astype(np.float32) * (1 - A_full) * (1 - np.clip(ch['alpha'] * 2, 0, 1))
    np.save(WORK + '/flow_water_mask.npy', lake.astype(np.float16))
    return post(out, x0, w, lake)


def footprints(out, x0, w):
    """every girl who steps ashore leaves flowers where her feet were: sparse at the water's edge, thicker toward the dance"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    rng = np.random.default_rng(909)
    kinds = [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup, MD.clover]
    for g in CH.build_chain():
        if g['spiral'] or CH.on_water(g) or not (x0 + 30 < g['x'] < x0 + w - 30): continue
        n = 3 + int(5 * smoothstep(8000, 8700, g['x']))
        for q in range(n):
            fx = g['x'] + rng.normal(0, 0.22 * g['T']); fy = g['y'] + rng.uniform(-0.03, 0.05) * g['T']
            r = max(3.0, 0.060 * g['T'] * rng.uniform(0.7, 1.2))
            MD.stem(c, fx, fy + r * 2.4, fy, rng.normal(0, r * 0.4), max(0.8, r * 0.10))
            kinds[int(rng.integers(5))](c, fx, fy, r, rng)
    rgb, a = L.get()
    return out * (1 - a[..., None]) + rgb


def post(out, x0, w, water_mask=None):
    """crisp things drawn on the finished picture: the ribbons, then the living details - and their reflections in the lake"""
    if water_mask is None:
        water_mask = np.load(WORK + '/flow_water_mask.npy').astype(np.float32)
    before = out.copy()
    out = footprints(out, x0, w)
    rr, ra = RB.ribbon_layer(x0, w)
    out = out * (1 - ra[..., None]) + rr
    out = F2.critters2(out, x0)
    out = RF.add_reflections(out, before, x0, w, water_mask)
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time, os
    t = time.time()
    if os.environ.get('FLOW_REUSE') == '1':
        _, base_ = cache_load('f_flow_base')
        img = post(base_, FX0, FW)
    else:
        img = render_flow3()
    print('flow3', round(time.time() - t, 1), 's')
    cache_save('f_flow', FX0, img)
    preview(img, WORK + '/f_flow_preview.png', 2200)
