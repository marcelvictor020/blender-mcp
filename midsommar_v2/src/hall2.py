"""Slides 12-16: THE INFINITE HALLWAY - one single one-point-perspective drawing (ink + graphite under gouache); the vanishing point sits
exactly on the 13|14 cut (x = 14040, horizon row 783). The corridor's cross-section is the temple's own triangle.

People are drawn with the figure engine: eyes on the horizon, lit by the dusty window light from the left with a golden contre-jour rim
from the glowing end of the corridor; one girl halfway down has turned back to us; a ring of young people holds hands around nothing.
Beyond the last doorframe, on the right, hangs the overhead ring dance - the picture the corridor's circles echo."""
import math
import numpy as np
import cv2
import cairo
from util import *
import hall as HL
from hall import (F_, WC, HC, HE, AS, S0, RHO, NF, GOLD, INKB, s_of, jamb_x, fog_amt, P3, base_color, draw_walls, rib_pts, draw_rib, garland,
                  floor_ivy, petals, light_shafts, graphite, wall_edge_lines, droste_pixels)
from folk import Folk
import fig
from fig import Light
import overhead as OV

TAU = 2 * math.pi
HX0, HX1 = 12000, W
HW = HX1 - HX0


def hall_light():
    return Light(key_dir=(-0.62, -0.28, 0.72), key_col=(1.0, 0.84, 0.58), key_gain=0.95, amb_col=(0.60, 0.46, 0.44), amb_gain=0.50,
                 bounce_col=(0.42, 0.30, 0.14), bounce_gain=0.45, rim_dir=(-0.5, -0.3, 0.0), rim_col=(1.0, 0.85, 0.55), rim_gain=0.25,
                 rim_fres=0.55, fres_col=(1.0, 0.86, 0.58))


DRESS = [(0.95, 0.92, 0.85), (0.94, 0.93, 0.89), (0.92, 0.90, 0.86), (0.96, 0.93, 0.86), (0.93, 0.92, 0.90)]
HAIR_F = [(0.80, 0.62, 0.34), (0.55, 0.37, 0.19), (0.34, 0.22, 0.12), (0.88, 0.74, 0.44), (0.20, 0.13, 0.09), (0.64, 0.34, 0.16), (0.72, 0.52, 0.28)]
SKIN = [(0.93, 0.76, 0.66), (0.90, 0.72, 0.60), (0.87, 0.67, 0.56), (0.92, 0.74, 0.62)]


def standing_list():
    """the young people standing down the corridor: (s px/m, lateral X m, id)"""
    out = []
    xs_ = [-1.25, -0.30, -1.35, -0.45, -0.60, -1.45, -0.50, -0.30, -1.15, -0.42, -1.0, -0.30, -0.9, -0.25]
    for i, X in enumerate(xs_):
        out.append(dict(s=340 * 0.885 ** i, X=X, i=i))
    for j, (s, X) in enumerate(((118, 0.55), (92, 0.9), (70, 0.45), (54, 0.8))):
        out.append(dict(s=s, X=X, i=100 + j))
    return out


def stand_pose(f):
    """relaxed, individual: nobody stands like a mannequin. Weight on one leg (a lean), the head a little turned or bowed, and four ways to hold the arms."""
    i = f['i']
    r = np.random.default_rng(500 + i)
    male = (i % 3 == 1) or (i >= 100 and i % 2 == 1)
    turned = (i == 5)
    view = 'front' if turned else 'back'
    zf = 1.0 if view == 'front' else -1.0                                      # which way "in front of her body" points on the screen's z axis
    style = i % 5
    if turned:
        arm_l, arm_r = (-0.118, 0.53), (0.118, 0.53)
        a3 = {'arm3_l': (-0.060, 0.560, 0.105), 'arm3_r': (0.060, 0.560, 0.105)}                       # hands lightly folded at the waist, she has turned to look back at us
    elif style == 0:
        arm_l, arm_r = (-0.124, 0.49), (0.124, 0.49); a3 = {}
    elif style == 1:
        arm_l, arm_r = (-0.118, 0.52), (0.118, 0.52)
        a3 = {'arm3_l': (-0.040, 0.540, 0.115 * zf), 'arm3_r': (0.040, 0.540, 0.115 * zf)}              # hands clasped in front of her
    elif style == 2:
        arm_l, arm_r = (-0.178, 0.50), (0.124, 0.48)
        a3 = {'arm3_l': (-0.178, 0.500, 0.012)}                                                            # a hand on the hip, the elbow out
    elif style == 3:
        arm_l, arm_r = (-0.124, 0.49), (0.150, 0.50)
        a3 = {'arm3_r': (0.150, 0.520, 0.085 * zf)}                                                        # one hand reaching a little forward
    else:
        arm_l, arm_r = (-0.122, 0.505), (0.122, 0.505)
        a3 = {'arm3_l': (-0.100, 0.505, -0.050 * zf), 'arm3_r': (0.100, 0.505, -0.050 * zf)}             # hands behind the back
    pose = dict(view=view, yaw=(0.55 if turned else r.uniform(-0.30, 0.30)), male=male, hair_style='short' if male else 'long',
                hair=HAIR_F[int(r.integers(len(HAIR_F)))], dress=DRESS[int(r.integers(len(DRESS)))], skin=SKIN[int(r.integers(len(SKIN)))],
                arm_l=arm_l, arm_r=arm_r, smile=(0.18 if turned else 0.30), feet=True,
                hem_y=0.05, bow=(r.random() < 0.7), wilt=0.35 + 0.5 * min(1.0, i / 12.0), belt=[(0.60, 0.68, 0.90), (0.90, 0.62, 0.62), (0.92, 0.78, 0.36), (0.58, 0.76, 0.56)][int(r.integers(4))],
                lean=(0.034 if i % 2 else -0.030) * (1 if i % 3 else -1) + r.normal(0, 0.008), crown=True, curl_l=0.55, curl_r=0.55, fold=1.0 + 0.5 * r.random(), **a3)
    if i % 4 == 1 and not turned:
        pose['yaw'] = 0.0                                                      # some bow their heads
    return pose


def ring_girls():
    """six young people holding hands in a ring round nothing: wide enough that every pair of clasped hands reads"""
    Zc, Xc, rr, n = 10.6, 1.30, 1.06, 6
    out = []
    for i in range(n):
        th = TAU * i / n + 0.55
        X, Z = Xc + rr * math.cos(th), Zc + rr * math.sin(th)
        s = F_ / Z
        out.append(dict(i=200 + i, s=s, X=X, Z=Z, th=th, x=VPX + s * X, y=HZ + HE * s, T=int(1.72 * s)))
    return out


def ring_pose(g, prv, nxt):
    r = np.random.default_rng(g['i'])
    c_, s_ = math.cos(g['th']), math.sin(g['th'])
    if abs(c_) > 0.80: view, facing = 'side', (-1 if c_ > 0 else 1)
    elif s_ > 0: view, facing = 'front', 1
    else: view, facing = 'back', 1
    T = g['T']

    def tgt(q):
        mx = (g['x'] + q['x']) / 2
        my = ((g['y'] - 0.56 * T) + (q['y'] - 0.56 * q['T'])) / 2
        u, v = (mx - g['x']) / T, (g['y'] - my) / T
        sx = 0.11 if u > 0 else -0.11
        d = math.hypot(u - sx, v - 0.787)
        if d > 0.30:
            k = 0.30 / d
            u = sx + (u - sx) * k; v = 0.787 + (v - 0.787) * k
        return (u, v)
    left, right = sorted([tgt(prv), tgt(nxt)], key=lambda t: t[0])
    return dict(view=view, facing=facing, yaw=0.3 * c_, arm_l=left, arm_r=right, male=(g['i'] % 3 == 2), hair_style='short' if (g['i'] % 3 == 2) else 'long',
                hair=HAIR_F[int(r.integers(len(HAIR_F)))], dress=DRESS[int(r.integers(len(DRESS)))], skin=SKIN[int(r.integers(len(SKIN)))],
                smile=0.12, eyes_closed=True, feet=True, hem_y=0.05, wilt=0.7, bow=True, lean=0.0, crown=True, curl_l=0.8, curl_r=0.8, fold=1.3)


def chair_spec():
    Z, X = 7.7, 2.20                                       # between two doorframes, near the right wall, turned to face it
    s = F_ / Z
    return dict(Z=Z, s=s, X=X, x=VPX + s * X, y=HZ + HE * s, T=int(round(1.05 * s)))


def hall_items():
    """everything that stands in the corridor, far -> near: ribs and people with their depth"""
    items = []
    for k in range(NF):
        items.append((F_ / s_of(k), 'rib', k))
    for f in standing_list():
        items.append((F_ / f['s'], 'fig', f))
    ring = ring_girls()
    for k, g in enumerate(ring):
        items.append((F_ / g['s'], 'ring', (g, ring[(k - 1) % len(ring)], ring[(k + 1) % len(ring)])))
    cs = chair_spec()
    items.append((cs['Z'], 'chair', cs))
    items.sort(key=lambda t: -t[0])
    return items


def board(x0, w):
    """the overhead ring dance on a plywood board beyond the last doorframe; returns (rgb, mask) over the hall's canvas rect"""
    bx0 = 15560
    bw = HX1 - bx0
    paint = OV.render_overhead(bw, H, seed=7, cx_frac=(17790 - bx0) / bw, cy_frac=0.55, r_out_frac=0.262, r_in_frac=0.080, turns=1.8, wref=1330, ribbons=False, th0=-0.76 * math.pi, tail=12, step_k=1.25, fold=1.0, feast=((1040.0, 500.0), -0.82, 820.0, 132.0))
    from paint import paint as _paint
    paint, _ = _paint(paint, passes=((6.0, 1.0, 0.0), (3.4, 1.0, 0.03), (2.0, 1.1, 0.04)), default_flow=0.0, default_w=0.4, seed=17, struct_keep=0.50, relief=0.30, verbose=False)
    yy, xx = np.mgrid[0:H, 0:bw]
    jamb = jamb_x(yy) - 3.0
    m = smoothstep(-1.5, 2.5, (xx + bx0) - jamb)
    # a plywood rim along the doorframe and a soft contact shadow
    edge = np.clip(((xx + bx0) - jamb) / 70.0, 0, 1)
    paint = paint * (0.55 + 0.45 * edge)[..., None]
    full = np.zeros((H, w, 3), np.float32); fm = np.zeros((H, w), np.float32)
    full[:, bx0 - x0:bx0 - x0 + bw] = paint
    fm[:, bx0 - x0:bx0 - x0 + bw] = m
    return full, fm


def render_hall(x0=HX0, w=HW, verbose=True, paint_base=True):
    import time
    from paint import paint
    t0 = time.time()
    base, Z, surf, v = base_color(x0, w)
    if paint_base:
        base, _ = paint(base, passes=((11, 1.0, 0.0), (6.5, 1.0, 0.03), (3.8, 1.0, 0.04), (2.2, 1.1, 0.05)), default_flow=0.0, default_w=0.4, seed=5, struct_keep=0.38, relief=0.22, verbose=False)
    if verbose: print('base', round(time.time() - t0, 1))
    Fk = Folk(x0, w, ss=2)
    draw_walls(Fk)
    garland(Fk.P, 2.0, 46.0, 2.2, seed=2)
    floor_ivy(Fk.P, 2.2, 28.0)
    petals(Fk.P)
    pr, pa = Fk.paint.get(); sr, sa = Fk.shade.get(); ir, ia = Fk.ink.get(); lr, la = Fk.light.get()
    img = base * (1 - pa[..., None]) + pr
    sc = sr / np.maximum(sa, 1e-4)[..., None]
    img = img * (1 - sa[..., None] + sc * sa[..., None])
    img = img * (1 - ia[..., None]) + ir
    img = 1 - (1 - img) * (1 - np.clip(lr, 0, 1))
    fz = fog_amt(Z)[..., None]
    img = img * (1 - fz * 0.85) + GOLD[None, None, :] * fz * 0.85
    del Fk
    if verbose: print('decor', round(time.time() - t0, 1))
    # graphite construction + the long ruled lines on the walls (they live ON the walls: figures stand in front of them)
    IK = Layer(w, H, x0, 0, 1)
    wall_edge_lines(IK.ctx); graphite(IK.ctx)
    gr_, ga_ = IK.get()
    dxg, dyg = wobble_field(x0, 0, w, H, amp=0.8, cell=80, seed=33)
    gr_, ga_ = warp(gr_, dxg, dyg), warp(ga_, dxg, dyg)
    img = img * (1 - ga_[..., None]) + gr_
    # the overhead board beyond the last doorframe
    brd, bm = board(x0, w)
    img = img * (1 - bm[..., None]) + brd * bm[..., None]
    if verbose: print('board', round(time.time() - t0, 1))
    # ribs + people, far -> near (runs of ribs share one cairo layer)
    light = hall_light()
    run = None
    def flush(run):
        if run is None: return
        rr, ra = run.get()
        nonlocal img
        img = img * (1 - ra[..., None]) + rr
    for (z, kind, d) in hall_items():
        if kind == 'rib':
            if run is None: run = Layer(w, H, x0, 0, ss=2)
            draw_rib(run.ctx, run.ctx, d)
            continue
        flush(run); run = None
        if kind == 'fig':
            s, X = d['s'], d['X']
            T = int(1.72 * s)
            sp = fig.render(T, stand_pose(d), light, seed=900 + d['i'])
            fig.composite(img, sp, VPX + s * X - x0, HZ + HE * s, shadow=True, shadow_col=(0.16, 0.08, 0.05), sh_kw=dict(kx=0.95, ky=0.30, strength=0.5))
        elif kind == 'chair':
            import props3d as PR
            sp = PR.render_chair(d['T'], 1.15, light)
            fig.composite(img, sp, d['x'] - x0, d['y'], shadow=True, shadow_col=(0.16, 0.08, 0.05), sh_kw=dict(kx=0.95, ky=0.30, strength=0.5))
        else:
            g, prv, nxt = d
            sp = fig.render(g['T'], ring_pose(g, prv, nxt), light, seed=950 + g['i'])
            fig.composite(img, sp, g['x'] - x0, g['y'], shadow=True, shadow_col=(0.16, 0.08, 0.05), sh_kw=dict(kx=0.95, ky=0.30, strength=0.5))
    flush(run)
    if verbose: print('ribs+people', round(time.time() - t0, 1))
    Ls = Layer(w, H, x0, 0, ss=1); Lp = Layer(w, H, x0, 0, ss=1)
    light_shafts(Ls.ctx, Lp.ctx)
    sr_, sa_ = Ls.get(); pr_, pa_ = Lp.get()
    sr_ = cv2.GaussianBlur(sr_, (0, 0), 5.0)                                   # a shaft of light through dusty air has no hard edge
    pr_ = cv2.GaussianBlur(pr_, (0, 0), 1.7)
    dust = 0.5 + 0.25 * fbm(x0, 0, w, H, 14, 2, 95, aniso=3.0)
    img = 1 - (1 - img) * (1 - np.clip(sr_ * (0.85 + 0.30 * dust[..., None]), 0, 1))
    img = 1 - (1 - img) * (1 - np.clip(pr_ * 0.9, 0, 1))
    img = droste_pixels(img, x0)
    img = np.clip(img, 0, 1).astype(np.float32)
    if verbose: print('hall done', round(time.time() - t0, 1))
    return img


if __name__ == '__main__':
    import time
    t = time.time()
    img = render_hall()
    print('hall', round(time.time() - t, 1), 's')
    cache_save('f_hall', HX0, img)
    preview(img, WORK + '/f_hall_preview.png', 2400)
    for k in range(5):
        save_png(WORK + f'/f_hall_s{13 + k}.png', img[:, 13040 + 1080 * k - HX0: 13040 + 1080 * (k + 1) - HX0])
