"""The twins and the gate-of-frames pieces (poles, lanterns, glow, girls) used by invite2.py.

THE INVITATION itself (slide 10) is built in invite2.py: the house seen close, the twins on the step of its garlanded doorway. This module keeps the shared parts:
draw_pole / draw_lantern (a painted post with a leaf-and-flower garland, a lantern), glow (the golden light at the end of a corridor of frames), frames (the
meadow version of the corridor, no longer drawn), and girls() - the two girls in white, hands clasped, their outer hands curled in the old gesture for *come here*,
smiling far too evenly (fig.py: creep), with long shadows along the sun's perspective fan.
"""
import math
import numpy as np
import cv2
import cairo
from util import *
import fig
from fig import Light
import chain as CH
import meadow as MD
import critters as CR
from trees2 import leaf_col, DECID

TAU = 2 * math.pi
CX = 11340.0
HC = 1.55
FG = 1000.0
T_G = 520
FEET_Y = 1296
SPACING = 0.455 * T_G
KEEP = None


def invite_light():
    return Light(key_dir=(-0.72, -0.16, 0.68), key_col=(1.0, 0.86, 0.62), key_gain=0.92, amb_col=(0.62, 0.66, 0.84), amb_gain=0.70,
                 bounce_col=(0.40, 0.40, 0.16), bounce_gain=0.40, rim_dir=(-0.95, -0.25, 0.0), rim_col=(1.0, 0.86, 0.58), rim_gain=0.70,
                 rim_fres=0.25, fres_col=(1.0, 0.86, 0.60))


def frames():
    out = []
    Z = 5.2
    for i in range(10):
        out.append(dict(i=i, Z=Z, by=HZ + HC * FG / Z, hw=2.0 * FG / Z, ay=HZ - (3.9 - HC) * FG / Z, t=max(2.2, 0.20 * FG / Z)))
        Z *= 1.30
    return out


HAZE = np.array([1.0, 0.86, 0.66], np.float32)


def hz_mix(col, k):
    return tuple(float(v * (1 - k) + HAZE[j] * k) for j, v in enumerate(col))


def draw_pole(c, p0, p1, t, side, haze, rng, garland=True):
    """one slanted post of a frame: a painted pole with a lit and a shaded face, cornflower bands, then a living garland wrapped round it"""
    x0, y0 = p0; x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    pts = [(x0 + nx * t / 2, y0 + ny * t / 2), (x1 + nx * t / 2, y1 + ny * t / 2), (x1 - nx * t / 2, y1 - ny * t / 2), (x0 - nx * t / 2, y0 - ny * t / 2)]
    g = cairo.LinearGradient(x0 - nx * t / 2, y0 - ny * t / 2, x0 + nx * t / 2, y0 + ny * t / 2)
    lit = (0.98, 0.78, 0.30) if side < 0 else (0.80, 0.56, 0.20)
    sh = (0.52, 0.34, 0.12) if side < 0 else (0.34, 0.21, 0.08)
    # the normal points to the viewer's right for the left pole: its left face meets the sun
    a_, b_ = (lit, sh) if nx < 0 else (sh, lit)
    g.add_color_stop_rgb(0, *hz_mix(a_, haze)); g.add_color_stop_rgb(1, *hz_mix(b_, haze))
    c.set_source(g); c.new_path(); c.move_to(*pts[0]); [c.line_to(*q) for q in pts[1:]]; c.close_path(); c.fill_preserve()
    c.set_source_rgba(0.17, 0.11, 0.10, 0.75 * (1 - haze)); c.set_line_width(max(0.6, t * 0.07)); c.stroke()
    n_b = max(2, int(L / (t * 3.2)))
    for k in range(n_b):                                                                  # painted bands
        s = (k + 0.5) / n_b
        cx_, cy_ = x0 + ux * L * s, y0 + uy * L * s
        w_ = t * 0.34
        c.set_source_rgba(*hz_mix((0.30, 0.48, 0.80), haze), 0.95); c.new_path()
        c.move_to(cx_ + nx * t / 2 - ux * w_, cy_ + ny * t / 2 - uy * w_); c.line_to(cx_ + nx * t / 2 + ux * w_, cy_ + ny * t / 2 + uy * w_)
        c.line_to(cx_ - nx * t / 2 + ux * w_, cy_ - ny * t / 2 + uy * w_); c.line_to(cx_ - nx * t / 2 - ux * w_, cy_ - ny * t / 2 - uy * w_); c.close_path(); c.fill()
        c.set_source_rgba(*hz_mix((0.97, 0.92, 0.78), haze), 0.95); c.set_line_width(max(0.5, t * 0.06)); c.new_path()
        c.move_to(cx_ + nx * t / 2 + ux * w_ * 1.3, cy_ + ny * t / 2 + uy * w_ * 1.3); c.line_to(cx_ - nx * t / 2 + ux * w_ * 1.3, cy_ - ny * t / 2 + uy * w_ * 1.3); c.stroke()
    if not garland: return
    # garland: leaves lit like the trees (gold on the sun side), flowers, a vine spiralling round
    ph = rng.uniform(0, TAU)
    for k in range(int(L / max(2.0, t * 0.55))):
        s = (k + rng.random()) / int(L / max(2.0, t * 0.55))
        sp = math.sin(s * 22 + ph) * t * 0.52
        gx_, gy_ = x0 + ux * L * s + nx * sp, y0 + uy * L * s + ny * sp
        sz = t * rng.uniform(0.42, 0.95)
        lam = float(np.clip(0.50 + 0.32 * (-1 if side > 0 else 1) * (sp / (t * 0.62)) * 0.5 + rng.normal(0, 0.14) + (0.12 if side < 0 else -0.06), 0, 1))
        col = hz_mix(leaf_col(DECID, lam, rng, 0.10), haze)
        a = rng.uniform(0, TAU)
        c.set_source_rgb(*col); c.new_path(); c.save(); c.translate(gx_, gy_); c.rotate(a); c.scale(sz, sz * 0.46); c.arc(0.4, 0, 1, 0, TAU); c.restore(); c.fill()
    for k in range(int(L / max(3.0, t * 1.5))):
        s = rng.uniform(0.04, 0.97)
        sp = rng.normal(0, t * 0.42)
        gx_, gy_ = x0 + ux * L * s + nx * sp, y0 + uy * L * s + ny * sp
        r = t * rng.uniform(0.24, 0.40)
        col = [(0.97, 0.94, 0.88), (0.96, 0.58, 0.66), (0.99, 0.84, 0.30), (0.52, 0.64, 0.96), (0.90, 0.20, 0.18)][int(rng.integers(5))]
        col = hz_mix(col, haze)
        for q in range(5):
            aa = TAU * q / 5 + rng.uniform(0, 1)
            c.set_source_rgb(*col); c.new_path(); c.arc(gx_ + math.cos(aa) * r * 0.55, gy_ + math.sin(aa) * r * 0.55, r * 0.46, 0, TAU); c.fill()
        c.set_source_rgb(*hz_mix((0.98, 0.80, 0.24), haze)); c.new_path(); c.arc(gx_, gy_, r * 0.30, 0, TAU); c.fill()


def draw_lantern(c, x, y, S, haze, rng):
    c.set_source_rgba(0.12, 0.08, 0.06, 1 - haze); c.set_line_width(max(0.6, S * 0.06)); c.new_path(); c.move_to(x, y - S * 1.9); c.line_to(x, y - S * 0.9); c.stroke()
    gl = cairo.RadialGradient(x, y, 1, x, y, S * 4.2)
    gl.add_color_stop_rgba(0, 1.0, 0.82, 0.45, 0.60); gl.add_color_stop_rgba(0.35, 1.0, 0.66, 0.28, 0.20); gl.add_color_stop_rgba(1, 1.0, 0.6, 0.2, 0)
    c.set_source(gl); c.new_path(); c.arc(x, y, S * 4.2, 0, TAU); c.fill()
    c.new_path(); c.move_to(x - S * 0.7, y + S * 0.95); c.line_to(x - S * 0.95, y - S * 0.2); c.line_to(x, y - S * 0.95); c.line_to(x + S * 0.95, y - S * 0.2); c.line_to(x + S * 0.7, y + S * 0.95); c.close_path()
    g = cairo.LinearGradient(0, y - S, 0, y + S); g.add_color_stop_rgb(0, 1.0, 0.95, 0.72); g.add_color_stop_rgb(1, 1.0, 0.70, 0.28)
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.17, 0.11, 0.10, 0.85 * (1 - haze)); c.set_line_width(max(0.6, S * 0.07)); c.stroke()


def pergola(x0, w, rng):
    """returns (rgb, a) of the frames + garlands; far frames first"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    c.set_line_join(cairo.LINE_JOIN_ROUND); c.set_line_cap(cairo.LINE_CAP_ROUND)
    fr = frames()
    for f in reversed(fr):
        haze = float(np.clip(1 - math.exp(-(f['Z'] - 5.2) / 38.0), 0, 0.82))
        by, hw, ay, t = f['by'], f['hw'], f['ay'], f['t']
        if not (x0 - 100 < CX < x0 + w + 100): continue
        for side in (-1, 1):
            draw_pole(c, (CX + side * hw, by), (CX, ay), t, side, haze, rng)
        # the rosette at the apex (+ a lantern and streamers on the nearest frame only)
        r0 = t * 0.80
        for q in range(9):
            aa = TAU * q / 9
            c.set_source_rgb(*hz_mix((0.97, 0.94, 0.88), haze)); c.new_path(); c.arc(CX + math.cos(aa) * r0 * 0.9, ay + math.sin(aa) * r0 * 0.9, r0 * 0.5, 0, TAU); c.fill()
        c.set_source_rgb(*hz_mix((0.98, 0.78, 0.24), haze)); c.new_path(); c.arc(CX, ay, r0 * 0.62, 0, TAU); c.fill()
        if f['i'] == 0:
            draw_lantern(c, CX, ay + t * 5.0, max(5.0, t * 0.9), haze, rng)
            for k, col in enumerate(((0.66, 0.12, 0.16), (0.32, 0.48, 0.84), (0.98, 0.79, 0.24))):
                sw = (k - 1) * t * 2.2
                c.set_source_rgba(*hz_mix(col, haze), 0.95); c.set_line_width(max(1.0, t * 0.28))
                dl = 0.50 if k == 1 else 0.62
                c.new_path(); c.move_to(CX + (k - 1) * t * 0.3, ay + r0 * 0.7); c.curve_to(CX + sw * 0.6, ay + t * 4 * dl, CX + sw * 1.1, ay + t * 8 * dl, CX + sw * 1.0, ay + (t * 12 + k * t * 1.2) * dl); c.stroke()
        # flowers at the foot of each pole: a tuft of grass and three real flowers on stems
        for side in (-1, 1):
            for q in range(2 if f['i'] > 1 else 3):
                fx_ = CX + side * hw + rng.normal(0, t * 1.4); fy_ = by + rng.normal(0, t * 0.30)
                rr_ = max(2.2, t * 0.42)
                MD.stem(c, fx_, fy_ + rr_ * 2.2, fy_, rng.normal(0, rr_ * 0.4), max(0.8, rr_ * 0.10))
                [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup][int(rng.integers(4))](c, fx_, fy_, rr_, rng)
    return L.get()


def path_layer(x0, w, rng):
    """the mown path running to the glow: stripes in perspective, edge flowers, long cross-shadows of the frames"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    ys = np.linspace(HZ + 3, H, 60)
    # polygon
    c.new_path()
    pts_l = [(CX - 0.95 * (y - HZ) / HC, y) for y in ys]
    pts_r = [(CX + 0.95 * (y - HZ) / HC, y) for y in ys]
    c.move_to(*pts_l[0]); [c.line_to(*p) for p in pts_l[1:]]; [c.line_to(*p) for p in pts_r[::-1]]; c.close_path()
    g = cairo.LinearGradient(0, HZ, 0, H); g.add_color_stop_rgb(0, 0.95, 0.88, 0.58); g.add_color_stop_rgb(0.25, 0.64, 0.64, 0.26); g.add_color_stop_rgb(1, 0.46, 0.54, 0.18)
    c.set_source(g); c.fill_preserve(); c.clip()
    Zs = np.arange(1.4, 80, 0.55)
    for k, Z in enumerate(Zs):                                                           # mowing stripes
        y0_ = HZ + HC * FG / Z; y1_ = HZ + HC * FG / (Z + 0.55)
        if k % 2 == 0:
            c.set_source_rgba(1.0, 0.96, 0.70, 0.10); c.new_path(); c.rectangle(x0 - 10, y1_, w + 20, y0_ - y1_); c.fill()
    for q in range(400):                                                                  # blades + petals
        Z = 1.6 + rng.random() ** 1.6 * 60
        y = HZ + HC * FG / Z; xx = CX + rng.uniform(-0.95, 0.95) * (y - HZ) / HC
        s = FG / Z
        c.set_source_rgba(*[0.35 + 0.3 * rng.random(), 0.50 + 0.2 * rng.random(), 0.16, 0.7]); c.set_line_width(max(0.6, 0.012 * s)); c.new_path(); c.move_to(xx, y); c.line_to(xx + rng.normal(0, 0.02 * s), y - 0.07 * s); c.stroke()
        if q % 5 == 0:
            col = [(0.97, 0.94, 0.88), (0.96, 0.62, 0.70), (0.99, 0.86, 0.36)][q % 3]
            c.set_source_rgba(*col, 0.9); c.new_path(); c.save(); c.translate(xx, y); c.rotate(rng.uniform(0, 3)); c.scale(0.05 * s, 0.022 * s); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    c.reset_clip()
    rgb, a = L.get()
    # cross-shadows of every frame lie across the path, away from the sun (right, nearly horizontal)
    sh = np.zeros((H, w), np.float32)
    for f in frames():
        for side in (-1, 1):
            bx = CX + side * f['hw'] - x0; by = f['by']
            ux, uy = sun_shadow_dir(bx + x0, by, length=1.0)
            ln = 2.3 * (f['by'] - f['ay'])
            th = max(2.0, 0.85 * f['t'])
            nxp, nyp = -uy, ux
            pts = np.array([[bx - th * nxp, by - th * nyp], [bx + th * nxp, by + th * nyp], [bx + ux * ln + 0.5 * th * nxp, by + uy * ln + 0.5 * th * nyp],
                            [bx + ux * ln - 0.5 * th * nxp, by + uy * ln - 0.5 * th * nyp]], np.float32)
            cv2.fillConvexPoly(sh, (pts * 4).astype(np.int32), 1.0, lineType=cv2.LINE_AA, shift=2)
    return rgb, a, cv2.GaussianBlur(sh, (0, 0), 2.6)


def edge_flowers(x0, w, rng):
    """both sides of the path: poppies, cornflowers, daisies, buttercups, big near the camera, small near the glow"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    pts = []
    for q in range(170):
        Z = 2.0 + rng.random() ** 1.8 * 70
        y = HZ + HC * FG / Z
        side = -1 if rng.random() < 0.5 else 1
        xx = CX + side * rng.uniform(1.05, 3.4) * (y - HZ) / HC
        pts.append((y, xx, Z))
    pts.sort()
    kinds = [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup, MD.clover]
    for (y, xx, Z) in pts:
        if y > 1340 or not (x0 - 40 < xx < x0 + w + 40): continue
        sc = (y - HZ) / 520.0
        r = 4 + 21 * sc ** 1.1 * rng.uniform(0.8, 1.2)
        hgt = r * rng.uniform(1.8, 3.2)
        MD.stem(c, xx, y + hgt, y, rng.normal(0, r * 0.4), max(1.0, r * 0.10))
        MD.leafpair(c, xx, y + hgt * 0.55, r * 1.2, rng)
        kinds[int(rng.integers(5))](c, xx, y, r, rng)
    return L.get()


def glow(x0, w):
    """the light at the end of the corridor: a hot core, a soft halo, a fan of shafts running down the path and through the frames"""
    ys = np.arange(H, dtype=np.float32)[:, None]; xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    dx, dy = xs - CX, ys - (HZ - 2)
    r = np.hypot(dx, dy) + 1e-3
    g = np.exp(-(r / 34.0) ** 1.4) * 0.80 + np.exp(-(r / 190.0) ** 1.2) * 0.36
    th = np.arctan2(dy, dx)
    rr = np.random.default_rng(31).random(720).astype(np.float32)
    rr = np.convolve(np.concatenate([rr, rr[:6]]), np.ones(5, np.float32) / 5, 'same')[:720]
    idx = ((th + math.pi) / TAU) * 719
    ray = np.interp(idx.ravel(), np.arange(720), rr).reshape(th.shape)
    shafts = np.clip((ray - 0.46) * 3.4, 0, 1) ** 1.3 * np.exp(-r / 520.0) * smoothstep(30, 120, r) * (dy > -330)
    col = np.array([1.0, 0.93, 0.72], np.float32)
    return (g * 0.85)[..., None] * col + (shafts * 0.26)[..., None] * np.array([1.0, 0.86, 0.58], np.float32)



def far_house(x0, w):
    """the yellow A-frame again, very small, at the end of the corridor of frames: its door is open and the glow is what comes out of it"""
    L = Layer(w, H, x0, 0, 4)
    c = L.ctx
    by = HZ + 6.0
    hw, hh = 22.0, 52.0
    ap = (CX, by - hh)
    c.new_path(); c.move_to(*ap); c.line_to(CX + hw, by); c.line_to(CX - hw, by); c.close_path()
    g = cairo.LinearGradient(CX - hw, 0, CX + hw, 0); g.add_color_stop_rgb(0, 1.0, 0.86, 0.46); g.add_color_stop_rgb(1, 0.62, 0.42, 0.18)
    c.set_source(g); c.fill_preserve(); c.set_source_rgba(0.28, 0.17, 0.07, 0.9); c.set_line_width(1.3); c.stroke()
    for k in range(1, 9):                                                              # planks
        y = ap[1] + k * hh / 9.0
        half = hw * (y - ap[1]) / hh
        c.set_source_rgba(0.34, 0.20, 0.08, 0.35); c.set_line_width(0.6); c.new_path(); c.move_to(CX - half + 1.0, y); c.line_to(CX + half - 1.0, y); c.stroke()
    for (wx, wy) in ((-8, -30), (8, -30), (-12, -16), (12, -16), (0, -38)):            # tiny lit windows
        c.set_source_rgb(1.0, 0.88, 0.50); c.new_path(); c.rectangle(CX + wx - 2.0, by + wy - 2.6, 4.0, 5.2); c.fill()
    c.new_path(); c.move_to(CX, by - 20); c.line_to(CX + 8, by); c.line_to(CX - 8, by); c.close_path()           # the open door
    gd = cairo.LinearGradient(0, by - 20, 0, by); gd.add_color_stop_rgb(0, 1.0, 0.97, 0.80); gd.add_color_stop_rgb(1, 1.0, 0.80, 0.40)
    c.set_source(gd); c.fill()
    c.set_source_rgba(0.20, 0.30, 0.55, 0.95)                                           # blue door leaves
    for sx in (-1, 1):
        c.new_path(); c.move_to(CX + sx * 8, by); c.line_to(CX + sx * 12.5, by - 2); c.line_to(CX + sx * 12.5, by - 17); c.line_to(CX + sx * 6.5, by - 15); c.close_path(); c.fill()
    return L.get()


def girls(x0, w):
    """the two girls: returns (rgb, a, shadow) full-size"""
    light = invite_light()
    base = dict(view='front', creep=1.0, smile=0.6, soft=1.0, crown=True, wilt=0.25, feet=False, hem_y=0.0, bow=True, curl_l=0.85, curl_r=0.85,
                skin=(0.95, 0.80, 0.72))
    # the twins hold hands (inner arms, elbows tucked in), the outer arm of each waves you in
    poseA = dict(base, arm_l=(-0.285, 0.80), arm_r=(0.170, 0.50), elbow_r=(0.100, 0.625), curl_l=0.88, curl_r=0.30, lean=0.055, hair=(0.86, 0.66, 0.36), dress=(0.96, 0.94, 0.88))
    poseB = dict(base, arm_r=(0.285, 0.80), arm_l=(-0.170, 0.50), elbow_l=(-0.100, 0.625), curl_r=0.88, curl_l=0.30, lean=-0.055, hair=(0.36, 0.23, 0.13), dress=(0.95, 0.93, 0.87))
    canvas = np.zeros((H, w, 3), np.float32); alpha = np.zeros((H, w), np.float32); shadow = np.zeros((H, w), np.float32)
    for (xc, pose, sd) in ((CX - SPACING / 2, poseA, 31), (CX + SPACING / 2, poseB, 32)):
        sp = fig.render(T_G, pose, light, seed=sd, ss=3)
        ox, oy = sp['anchor']
        x0s, y0s = int(round(xc - x0 - ox)), int(round(FEET_Y - oy))
        kx, ky = sun_shadow_dir(xc, FEET_Y, length=1.5)
        sa, pad = fig.cast_shadow(sp, kx=kx, ky=ky, blur=0.022, strength=0.70)
        CH._max_blit(shadow, sa, int(round(xc - x0 - ox - pad)), y0s)
        rgb_s = sp['rgb'] / np.maximum(sp['a'], 1e-4)[..., None]
        CH._over(canvas, alpha, rgb_s, sp['a'], x0s, y0s)
    return canvas, alpha, shadow


def foreground(x0, w, rng):
    """tall grass and a few big flowers in front of the girls' feet (depth)"""
    L = Layer(w, H, x0, 0, 2)
    c = L.ctx
    MD.grass(c, rng, CX - 520, 1040, 1282, 1360, 150, 60, 170)
    for q in range(16):
        xx = CX + rng.uniform(-500, 500); y = rng.uniform(1292, 1346)
        if abs(xx - CX) < 40 and rng.random() < 0.7: continue
        r = rng.uniform(24, 40)
        hgt = r * rng.uniform(1.8, 2.8)
        MD.stem(c, xx, y + hgt, y, rng.normal(0, r * 0.4), max(1.4, r * 0.10))
        [MD.poppy, MD.cornflower, MD.oxeye, MD.buttercup][int(rng.integers(4))](c, xx, y, r, rng)
    MD.grass(c, rng, CX - 520, 1040, 1326, 1366, 70, 90, 210)
    return L.get()


def render(x0, w, img):
    """adds the whole scene to img (the garden raw render) and returns (img, people_alpha, extra_masks)"""
    rng = np.random.default_rng(1111)
    if not (x0 < CX < x0 + w): return img, np.zeros((H, w), np.float32), {}
    xs = np.arange(x0, x0 + w, dtype=np.float32)[None, :]
    pr, pa, sh_path = path_layer(x0, w, rng)
    img = img * (1 - pa[..., None]) + pr
    ef, efa = edge_flowers(x0, w, rng)
    img = img * (1 - efa[..., None]) + ef
    gl = glow(x0, w)
    fh, fha = far_house(x0, w)
    img = img * (1 - fha[..., None]) + fh
    img = 1 - (1 - img) * (1 - np.clip(gl * 0.55, 0, 1))                                  # the glow sits behind the frames
    prg, pga = pergola(x0, w, rng)
    img = img * (1 - pga[..., None]) + prg
    # bunting between the apexes of the nearest frames
    fr = frames()
    xr = CX - x0
    pal = [(0.97, 0.94, 0.86), (0.96, 0.78, 0.24), (0.40, 0.62, 0.90), (0.84, 0.20, 0.18), (0.30, 0.60, 0.34)]
    for a_, b_ in zip(fr[:4], fr[1:5]):
        CR.festoon(img, (xr, a_['ay'] + 4), (xr, b_['ay'] + 4), 0.2 * (a_['ay'] - b_['ay']), 6, rng, fw=max(6, 0.9 * a_['t']), pal=pal)
    gl2 = glow(x0, w)
    img = 1 - (1 - img) * (1 - np.clip(gl2 * 0.40, 0, 1))
    # the girls' shadows fall on path and meadow
    gc, ga, gs = girls(x0, w)
    gs = gs * (1 - 0.0)
    img = img * (1 - 0.58 * gs[..., None]) + np.array([0.07, 0.09, 0.24], np.float32) * (0.58 * gs[..., None])
    sh_p = np.clip(sh_path * pa, 0, 1)
    img = img * (1 - 0.40 * sh_p[..., None]) + np.array([0.07, 0.09, 0.24], np.float32) * (0.40 * sh_p[..., None])
    img = img * (1 - ga[..., None]) + gc * ga[..., None]
    fg, fga = foreground(x0, w, rng)
    img = img * (1 - fga[..., None]) + fg
    return img, ga, dict(pergola=pga, glow=gl)


def living(out, x0, w):
    """crisp touches on the finished picture: fireflies waking round the light, lanterns rising behind the girls, butterflies on their hands"""
    rng = np.random.default_rng(4321)
    CR.fireflies(out, rng, 34, (CX - 420 - x0, CX + 120 - x0), (560, 760), size=(1.4, 3.6), glow=0.95)
    CR.fireflies(out, rng, 16, (CX - 520 - x0, CX - 330 - x0), (760, 1180), size=(1.4, 3.2), glow=0.85)
    for (dx, y, S, wm) in ((-330, 300, 13, 1.0), (-140, 150, 9, 0.9), (110, 330, 7, 0.8), (-440, 470, 8, 0.8), (60, 90, 7, 0.8)):
        CR.sky_lantern(out, CX + dx - x0, y, S, day=0.35, warm=wm)
    items = [(CX - SPACING / 2 - 0.285 * T_G - x0 - 18, FEET_Y - 0.80 * T_G - 36, 22, 0.5, 'monarch', 0.7, 3), (CX + SPACING / 2 + 0.285 * T_G - x0 + 20, FEET_Y - 0.80 * T_G - 30, 20, -0.4, 'white', 0.6, 5),
             (CX - 60 - x0, 640, 18, 0.2, 'yellow', 0.7, 7), (CX + 170 - x0, 720, 16, -0.3, 'blue', 0.8, 9)]
    CR.butterflies(out, items)
    return out
