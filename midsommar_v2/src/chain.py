"""THE CHAIN - one line of girls holding hands.

It starts small on the lake beside the pond's arch, walks across the water (with reflections), steps ashore at the garden's
shore and winds inward in a spiral around the maypole - the overhead ring-dance reference, as one continuous shape.
The same list of girls is rendered by the flow stage (the part on the water) and by the garden stage (the part on the lawn).
"""
import math
import numpy as np
import cv2
from util import *
from shared import *
import fig
from fig import Light
import garden as G

TAU = 2 * math.pi

DRESSES = [(0.94, 0.91, 0.83), (0.96, 0.93, 0.88), (0.91, 0.91, 0.93), (0.96, 0.91, 0.86), (0.92, 0.94, 0.90), (0.95, 0.92, 0.84), (0.90, 0.92, 0.97), (0.97, 0.90, 0.88), (0.96, 0.95, 0.82)]
BELTS = [(0.60, 0.68, 0.90), (0.90, 0.62, 0.62), (0.92, 0.78, 0.36), (0.58, 0.76, 0.56), (0.80, 0.66, 0.88), (0.95, 0.95, 0.90)]
HAIRS = [(0.86, 0.72, 0.42), (0.55, 0.38, 0.20), (0.40, 0.26, 0.14), (0.18, 0.12, 0.09), (0.62, 0.30, 0.14), (0.74, 0.54, 0.28), (0.48, 0.30, 0.16), (0.92, 0.82, 0.58), (0.30, 0.20, 0.12)]
SKINS = [(0.93, 0.76, 0.66), (0.90, 0.72, 0.60), (0.87, 0.67, 0.56), (0.92, 0.74, 0.62)]

RING_R_OUT, RING_R_IN, RING_TURNS = 4.7, 1.25, 2.25
SPACING_M = 1.42
TH0 = 1.25 * math.pi                                  # the chain steps into the spiral at its near-left point


def sun_light(gain=1.0):
    """low sun on the LEFT and a little behind: gold on the left edges, cool sky fill, warm grass bounce, strong gold rim"""
    return Light(key_dir=(-0.80, -0.18, 0.55), key_col=(1.0, 0.84, 0.58), key_gain=1.10 * gain, amb_col=(0.52, 0.62, 0.76), amb_gain=0.58,
                 bounce_col=(0.36, 0.38, 0.14), bounce_gain=0.42, rim_dir=(-0.95, -0.25, 0.0), rim_col=(1.0, 0.86, 0.58), rim_gain=0.60)


def ring_geometry():
    Zc = G.HCAM * G.FG / (RING['base_y'] - HZ)
    Xc = (RING['cx'] - G.CXG) * Zc / G.FG
    return Xc, Zc


def spiral_points(step_m=SPACING_M):
    """ground-plane points (X,Z) along the spiral at equal arc length, outer end first"""
    Xc, Zc = ring_geometry()
    th = np.linspace(TH0, TH0 + TAU * RING_TURNS, 4000)
    r = RING_R_OUT + (RING_R_IN - RING_R_OUT) * (th - th[0]) / (th[-1] - th[0])
    X = Xc + r * np.cos(th); Z = Zc + r * np.sin(th)
    seg = np.hypot(np.diff(X), np.diff(Z))
    cum = np.concatenate([[0], np.cumsum(seg)])
    pts = []
    s = 0.0
    while s < cum[-1]:
        i = int(np.searchsorted(cum, s)); i = min(i, len(th) - 1)
        pts.append((float(X[i]), float(Z[i]), float(th[i]), float(r[i])))
        s += step_m
    return pts


def build_chain():
    """list of girls (dicts) from the far end on the lake to the spiral's centre"""
    rng = np.random.default_rng(1212)
    sp = spiral_points()
    gx0, gy0, gs0 = G.gpt(sp[0][0], sp[0][1])
    ctrl = [(4780.0, 852.0), (5500.0, 882.0), (6150.0, 916.0), (6800.0, 952.0), (7400.0, 996.0), (7850.0, 1060.0), (8150.0, 1138.0), (float(gx0), float(gy0))]
    from trees import catmull
    P = catmull(ctrl, 60)
    seg = np.hypot(*np.diff(P, axis=0).T)
    cum = np.concatenate([[0], np.cumsum(seg)])
    girls = []
    s_lo, s_hi = 62.0, float(gs0)
    u = 0.0
    while True:
        frac = u / cum[-1]
        if frac >= 0.985: break
        sc = s_lo + (s_hi - s_lo) * frac ** 1.15
        i = int(np.searchsorted(cum, u)); i = min(i, len(P) - 2)
        x, y = P[i]
        t = P[min(i + 4, len(P) - 1)] - P[max(i - 4, 0)]
        girls.append(dict(x=float(x), y=float(y), s=sc, spiral=False, th=None, tang=math.atan2(t[1], t[0])))
        u += SPACING_M * sc
    for (X, Z, th, r) in sp:
        x, y, s = G.gpt(X, Z)
        girls.append(dict(x=float(x), y=float(y), s=float(s), spiral=True, th=float(th), tang=None, X=X, Z=Z))
    for k, g in enumerate(girls):
        g['k'] = k
        g['seed'] = int(rng.integers(1 << 30))
        g['dress'] = DRESSES[int(rng.integers(len(DRESSES)))]
        g['hair'] = HAIRS[int(rng.integers(len(HAIRS)))]
        g['skin'] = SKINS[int(rng.integers(len(SKINS)))]
        g['belt'] = BELTS[int(rng.integers(len(BELTS)))]
        g['T'] = int(1.66 * g['s'])
    return girls


def pose_for(g, girls):
    k = g['k']
    prv = girls[k - 1] if k > 0 else None
    nxt = girls[k + 1] if k + 1 < len(girls) else None
    T = g['T']
    r = np.random.default_rng(g['seed'])
    if g['spiral']:
        c_, s_ = math.cos(g['th']), math.sin(g['th'])
        if abs(c_) > 0.80: view, facing = 'side', (-1 if c_ > 0 else 1)
        elif s_ > 0: view, facing = 'front', 1
        else: view, facing = 'back', 1
        yaw = 0.35 * c_ + 0.5 * (r.random() - 0.5)
    else:
        view, facing = 'front', 1
        yaw = 0.45 + 0.4 * (r.random() - 0.5)

    def tgt(q):
        if q is None: return (0.128 * (1 if r.random() < 0.5 else -1), 0.40)
        mx = (g['x'] + q['x']) / 2
        my = ((g['y'] - 0.56 * T) + (q['y'] - 0.56 * q['T'])) / 2
        u, v = (mx - g['x']) / T, (g['y'] - my) / T
        sx = 0.11 if u > 0 else -0.11
        d = math.hypot(u - sx, v - 0.787)
        if d > 0.31:
            kk = 0.31 / d
            u = sx + (u - sx) * kk; v = 0.787 + (v - 0.787) * kk
        return (u, v)
    t1, t2 = tgt(prv), tgt(nxt)
    left, right = sorted([t1, t2], key=lambda t: t[0])
    pose = dict(view=view, facing=facing, yaw=yaw, arm_l=left, arm_r=right,
                lean=(0.03 + 0.06 * r.random()) * (1 if (k % 2) else -1) * (0.5 + 0.5 * (abs(math.sin(g['th'])) if g['spiral'] else 0.6)),
                hair=g['hair'], dress=g['dress'], skin=g['skin'], smile=0.25 + 0.55 * r.random(), feet=True, hem_y=0.045 + 0.02 * r.random(),
                hair_style='long', curl_l=0.7, curl_r=0.7, belt=g['belt'], crown=True)
    return pose


def _over(canvas, alpha, rgb, a, x0, y0):
    h, w = a.shape
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(canvas.shape[1], x0 + w), min(canvas.shape[0], y0 + h)
    if xa >= xb or ya >= yb: return
    sa = a[ya - y0:yb - y0, xa - x0:xb - x0]
    sc = rgb[ya - y0:yb - y0, xa - x0:xb - x0]
    canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sa)[..., None] + sc * sa[..., None]
    alpha[ya:yb, xa:xb] = alpha[ya:yb, xa:xb] * (1 - sa) + sa


def _max_blit(dst, src, x0, y0):
    h, w = src.shape
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(dst.shape[1], x0 + w), min(dst.shape[0], y0 + h)
    if xa >= xb or ya >= yb: return
    dst[ya:yb, xa:xb] = np.maximum(dst[ya:yb, xa:xb], src[ya - y0:yb - y0, xa - x0:xb - x0])


def on_water(g):
    return g['x'] < 10100 and g['y'] < float(G.lake_y(g['x'])) + 1.0


def render_chain(x0, w, xmin, xmax, verbose=False, split_y=None, shadow_kx=1.15, shadows_all=False, ss=2, shadow_dir=None, shadow_blur=0.009, shadow_strength=0.66):
    """sprites for girls with xmin <= x < xmax; returns dict(canvas, alpha, shadow, refl, refl_a) in (H,w) canvas coords"""
    girls = build_chain()
    light = sun_light()
    out = dict(canvas=np.zeros((H, w, 3), np.float32), alpha=np.zeros((H, w), np.float32), shadow=np.zeros((H, w), np.float32),
               refl=np.zeros((H, w, 3), np.float32), refl_a=np.zeros((H, w), np.float32),
               canvas_b=np.zeros((H, w, 3), np.float32), alpha_b=np.zeros((H, w), np.float32))
    sel = [g for g in girls if xmin <= g['x'] < xmax]
    sel.sort(key=lambda g: g['y'])
    for g in sel:
        sp = fig.render(g['T'], pose_for(g, girls), light, seed=g['seed'], ss=ss)
        ox, oy = sp['anchor']
        x0s, y0s = int(round(g['x'] - x0 - ox)), int(round(g['y'] - oy))
        a_ = sp['a']
        kx_ = shadow_kx(g['x']) if callable(shadow_kx) else shadow_kx
        ky_ = 0.52
        if shadow_dir is not None:
            kx_, ky_ = shadow_dir(g['x'], g['y'])
        if shadows_all:
            sa_, pad_ = fig.cast_shadow(sp, kx=kx_, ky=ky_, blur=shadow_blur, strength=shadow_strength)
            _max_blit(out['shadow'], sa_, int(round(g['x'] - x0 - ox - pad_)), y0s)
        if on_water(g):                                                    # reflection: flipped, soft, dim; ripples at the feet
            fl_rgb, fl_a = sp['rgb'][::-1], a_[::-1]
            ry0 = int(round(g['y'] + 2))
            h_ = a_.shape[0]
            ys = slice(max(0, ry0), min(H, ry0 + h_))
            sub_rgb = fl_rgb[ys.start - ry0:ys.stop - ry0]; sub_a = fl_a[ys.start - ry0:ys.stop - ry0]
            _over(out['refl'], out['refl_a'], cv2.GaussianBlur(sub_rgb / np.maximum(sub_a, 1e-4)[..., None], (0, 0), 1.6), cv2.GaussianBlur(sub_a, (0, 0), sigmaX=2.0, sigmaY=1.2) * 0.42, x0s, ys.start)
        else:
            if not shadows_all:
                sa, pad = fig.cast_shadow(sp, kx=kx_, ky=ky_, blur=shadow_blur, strength=shadow_strength)
                _max_blit(out['shadow'], sa, int(round(g['x'] - x0 - ox - pad)), y0s)
    for g in sel:
        sp = fig.render(g['T'], pose_for(g, girls), light, seed=g['seed'], ss=ss)
        ox, oy = sp['anchor']
        x0s, y0s = int(round(g['x'] - x0 - ox)), int(round(g['y'] - oy))
        a_ = sp['a']
        rgb_s = sp['rgb'] / np.maximum(a_, 1e-4)[..., None]
        if split_y is not None and g['y'] < split_y:
            _over(out['canvas_b'], out['alpha_b'], rgb_s, a_, x0s, y0s)
        else:
            _over(out['canvas'], out['alpha'], rgb_s, a_, x0s, y0s)
    if verbose: print('chain girls rendered', len(sel), 'of', len(girls))
    return out


if __name__ == '__main__':
    gs = build_chain()
    print(len(gs), 'girls;', sum(1 for g in gs if g['spiral']), 'in the spiral; first', (round(gs[0]['x']), round(gs[0]['y']), gs[0]['T']), 'last', (round(gs[-1]['x']), round(gs[-1]['y']), gs[-1]['T']))
    xs = [g['x'] for g in gs if not g['spiral']]
    print('tail x range', round(min(xs)), round(max(xs)), ' T range', min(g['T'] for g in gs), max(g['T'] for g in gs))
