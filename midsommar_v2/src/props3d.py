"""Small solid props as signed-distance shapes, lit like the figures (key light, soft shadow, ambient occlusion, a bounce), for things that must sit in a picture
as real objects: the empty wooden chair in the hallway doorway.

chair(): a ladder-back chair of scrubbed pine, front toward +x, standing on y=0, about 0.95 m tall.
render_chair(T, yaw, light): orthographic ray-march along -z of the chair turned by `yaw` about the vertical; returns the same sprite dict as fig.render().
"""
import math
import numpy as np
import cv2
from util import *
from body3d import sd_cap, sd_ell, smin, smax, rot_y


def sd_box(P, c, h, r=0.0):
    q = np.abs(P - np.asarray(c, np.float32)) - (np.asarray(h, np.float32) - r)
    out = np.sqrt((np.maximum(q, 0) ** 2).sum(-1)) + np.minimum(np.maximum(np.maximum(q[:, 0], q[:, 1]), q[:, 2]), 0) - r
    return out


def chair_sdf(P):
    d = sd_box(P, (0.0, 0.452, 0.0), (0.225, 0.020, 0.225), 0.008)                         # seat (slightly dished)
    for sx in (-1, 1):
        for sz in (-1, 1):
            if sx < 0:                                                                       # back legs run on up into the back posts
                leg = sd_cap(P, (sx * 0.200, 0.0, sz * 0.200), (sx * 0.205, 0.965, sz * 0.190), 0.024, 0.019)
            else:
                leg = sd_cap(P, (sx * 0.205, 0.0, sz * 0.205), (sx * 0.200, 0.450, sz * 0.200), 0.023, 0.027)
            d = np.minimum(d, leg)
    for yy in (0.18, 0.26):                                                                  # stretchers
        for sz in (-1, 1):
            d = np.minimum(d, sd_cap(P, (-0.20, yy, sz * 0.20), (0.20, yy, sz * 0.20), 0.011, 0.011))
        d = np.minimum(d, sd_cap(P, (-0.20, yy, -0.20), (-0.20, yy, 0.20), 0.011, 0.011))
        d = np.minimum(d, sd_cap(P, (0.20, yy, -0.20), (0.20, yy, 0.20), 0.011, 0.011))
    for k, yy in enumerate((0.60, 0.72, 0.84)):                                              # ladder-back slats, each a little curved
        sl = sd_box(P, (-0.205 + 0.010 * (k == 1), yy, 0.0), (0.012, 0.030, 0.190), 0.006)
        d = np.minimum(d, sl)
    d = np.minimum(d, sd_cap(P, (-0.205, 0.965, -0.190), (-0.205, 0.965, 0.190), 0.016, 0.016))   # top rail
    for sx in (-1, 1):                                                                       # turned finials on the back posts
        d = np.minimum(d, sd_ell(P, (-0.205, 0.985, sx * 0.190), (0.022, 0.030, 0.022)))
    return d


def render_chair(T, yaw=1.15, light=None, seed=3, ss=2, tilt=0.0):
    import fig as F
    L = light or F.Light()
    R = rot_y(yaw)
    Ws, Hs = int(T * 1.30) | 1, int(T * 1.20)
    ox, oy = Ws / 2.0, T * 1.08
    ssf = float(ss)
    gw, gh = int(Ws * ssf), int(Hs * ssf)
    jj, ii = np.meshgrid(np.arange(gw, dtype=np.float32), np.arange(gh, dtype=np.float32))
    U = ((jj + 0.5) / ssf - ox) / (T / 1.05)
    V = (oy - (ii + 0.5) / ssf) / (T / 1.05)
    inb = (V > -0.05) & (V < 1.10) & (np.abs(U) < 0.45)
    idx = np.nonzero(inb.ravel())[0]
    Ux, Vx = U.ravel()[idx], V.ravel()[idx]
    n = len(idx)
    dist = lambda Pw: chair_sdf(Pw @ R)                                                      # world -> model (row-vector form)
    zt = np.full(n, 0.6, np.float32)
    hit = np.zeros(n, bool)
    act = np.arange(n)
    for it in range(80):
        if len(act) == 0: break
        P = np.stack([Ux[act], Vx[act], zt[act]], 1)
        d = dist(P)
        h = d < 0.0012
        if h.any(): hit[act[h]] = True
        mv = (~h) & (zt[act] > -0.6)
        zt[act[mv]] -= np.maximum(d[mv], 0.0012) * 0.8
        act = act[mv]
    hidx = np.nonzero(hit)[0]
    out = np.zeros((gh * gw, 3), np.float32); al = np.zeros(gh * gw, np.float32)
    if len(hidx):
        Ph = np.stack([Ux[hidx], Vx[hidx], zt[hidx]], 1)
        e = np.array([[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]], np.float32) * 0.0018
        N = np.zeros_like(Ph)
        for k in range(4): N += e[k] * dist(Ph + e[k])[:, None]
        N /= (np.linalg.norm(N, axis=1, keepdims=True) + 1e-9)
        Lk = np.array([L.key[0], -L.key[1], L.key[2]], np.float32); Lk /= np.linalg.norm(Lk)
        sh = np.ones(len(hidx), np.float32); tt = np.full(len(hidx), 0.012, np.float32)
        for it in range(24):
            dq = dist(Ph + N * 0.004 + Lk[None, :] * tt[:, None])
            sh = np.minimum(sh, np.clip(8.0 * dq / tt, 0, 1)); tt = tt + np.clip(dq, 0.006, 0.05)
            if tt.min() > 0.9: break
        sh = sh * sh * (3 - 2 * sh)
        ao = np.zeros(len(hidx), np.float32)
        for k in range(1, 6):
            hk = 0.012 * k
            ao += (hk - dist(Ph + N * hk)) / (1.6 ** k)
        ao = np.clip(1 - 1.7 * ao, 0.30, 1.0)
        Pm = Ph @ R
        # scrubbed pine: pale, with long grain along the rails and a darker end-grain at the cuts
        gx = np.sin(Pm[:, 1] * 90 + 3 * np.sin(Pm[:, 0] * 23 + Pm[:, 2] * 17)) * 0.5 + 0.5
        alb = np.array([0.86, 0.74, 0.55], np.float32)[None, :] * (0.94 + 0.08 * gx)[:, None]
        wrap = 0.30
        diff = np.clip((N @ Lk + wrap) / (1 + wrap), 0, 1) * sh
        sky = np.clip(0.55 + 0.45 * N[:, 1], 0, 1)[:, None]
        amb = np.asarray(L.amb_col, np.float32) * float(L.amb_gain)
        key = np.asarray(L.key_col, np.float32) * float(L.key_gain)
        bnc = np.asarray(L.bounce_col, np.float32) * float(L.bounce_gain)
        col = alb * (amb[None, :] * (0.55 + 0.45 * sky) * ao[:, None] + key[None, :] * diff[:, None]) + alb * bnc[None, :] * (np.clip(-N[:, 1], 0, 1) * ao)[:, None]
        if L.rim_gain > 0:
            rd = np.array([L.rim[0], -L.rim[1], L.rim[2]], np.float32); rd /= (np.linalg.norm(rd) + 1e-9)
            col += np.asarray(L.rim_col, np.float32)[None, :] * float(L.rim_gain) * (np.clip(N @ rd, 0, 1) ** 2.2)[:, None]
        flat = idx[hidx]
        out[flat] = np.clip(col, 0, 1.2); al[flat] = 1.0
    out = out.reshape(gh, gw, 3); al = al.reshape(gh, gw)
    rgbp = out * al[..., None]
    if ss > 1:
        rgbp = cv2.resize(rgbp, (Ws, Hs), interpolation=cv2.INTER_AREA); a = cv2.resize(al, (Ws, Hs), interpolation=cv2.INTER_AREA)
    else:
        a = al
    return dict(rgb=rgbp, a=a, sil=a.copy(), anchor=(ox, oy), lantern=None, size=(Ws, Hs), T=T)


if __name__ == '__main__':
    import time
    import fig as F
    from hall2 import hall_light
    t = time.time()
    sp = render_chair(260, 1.15, hall_light())
    print('chair', round(time.time() - t, 1), sp['rgb'].shape)
    c = np.zeros(sp['a'].shape + (3,), np.float32); c[:] = np.array([0.45, 0.14, 0.12], np.float32)
    c = c * (1 - sp['a'])[..., None] + sp['rgb']
    save_png(WORK + '/chair_test.png', np.clip(c, 0, 1))
