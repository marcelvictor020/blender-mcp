"""People as light and volume: a small software ray-marcher for human figures.

Each person is a signed-distance body (skull with brow ridge / nose / cheeks / lips / sockets, neck, long linen dress or tunic with real folds that flare toward the
hem, puffed sleeves, two-bone arms with hands, trousers, hair, feet), lit by the scene's key light with soft self-shadows and ambient occlusion, a hemisphere of
sky, a bounce from the ground and a rim: skin gets wrap lighting and a warm terminator, linen a weave, translucency and a grazing sheen, hair an anisotropic
highlight. The face is the very same painted face fig.py draws, projected onto the head. render() has the same signature and the same result layout as
fig.render(), so it is a drop-in replacement: that is how every girl in the picture is now drawn.
"""
import math
import numpy as np
import cv2
import cairo
from util import *

TAU = 2 * math.pi
_CACHE = {}


# ============================================================================================ SDF kit
def _len(v):
    return np.sqrt((v * v).sum(-1))


def sd_ell(P, c, r):
    q = (P - np.asarray(c, np.float32)) / np.asarray(r, np.float32)
    k0 = _len(q)
    k1 = _len(q / np.asarray(r, np.float32))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-5)


def sd_cap(P, a, b, ra, rb):
    a = np.asarray(a, np.float32); b = np.asarray(b, np.float32)
    pa = P - a; ba = b - a
    h = np.clip((pa @ ba) / max(float(ba @ ba), 1e-9), 0, 1)
    return _len(pa - h[:, None] * ba) - (ra + (rb - ra) * h)


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def bounded(P, c, R, fn, margin=0.05):
    """evaluate fn only near its bounding sphere; elsewhere return the (conservative) distance to the sphere"""
    d0 = _len(P - np.asarray(c, np.float32)) - R
    m = d0 < margin
    if not m.any():
        return d0
    out = d0.copy()
    out[m] = fn(P[m])
    return out


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float32)


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float32)


# ============================================================================================ geometry
def two_bone3(S, W, L1, L2, pole):
    S = np.asarray(S, np.float32); W = np.asarray(W, np.float32)
    v = W - S
    d = float(np.linalg.norm(v)) + 1e-9
    d = min(d, (L1 + L2) * 0.999)
    ax = v / (np.linalg.norm(v) + 1e-9)
    W = S + ax * d
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = math.sqrt(max(L1 * L1 - a * a, 0.0))
    pl = np.asarray(pole, np.float32)
    pl = pl - ax * float(pl @ ax)
    pl = pl / (np.linalg.norm(pl) + 1e-9)
    E = S + ax * a + pl * h
    return E, W


PROF_F = dict(y=[0.834, 0.824, 0.810, 0.796, 0.748, 0.702, 0.656, 0.629, 0.562, 0.455, 0.334, 0.205, 0.100, 0.040],
              a=[0.038, 0.048, 0.070, 0.098, 0.092, 0.080, 0.068, 0.062, 0.086, 0.115, 0.152, 0.200, 0.246, 0.272],
              b=[0.032, 0.038, 0.044, 0.050, 0.056, 0.052, 0.046, 0.044, 0.058, 0.086, 0.115, 0.150, 0.186, 0.202])
PROF_M = dict(y=[0.838, 0.828, 0.816, 0.802, 0.790, 0.742, 0.690, 0.640, 0.612, 0.598, 0.575, 0.520, 0.460, 0.420, 0.402],
              a=[0.036, 0.050, 0.080, 0.112, 0.130, 0.126, 0.114, 0.104, 0.096, 0.092, 0.098, 0.110, 0.126, 0.138, 0.142],
              b=[0.034, 0.042, 0.050, 0.058, 0.062, 0.062, 0.058, 0.056, 0.052, 0.050, 0.054, 0.060, 0.066, 0.072, 0.074])


class Body:
    def __init__(self, p, T, rnd):
        self.p = p
        self.T = T
        self.male = bool(p['male'])
        view = p['view']
        fc = 1 if p['facing'] >= 0 else -1
        self.body_yaw = {'front': 0.0, 'back': math.pi, 'side': (math.pi / 2) * fc}.get(view, 0.0)
        self.head_yaw = float(p['yaw']) * (1.0 if view == 'front' else 0.0)
        self.Rb = rot_y(self.body_yaw)                       # model -> world
        self.hem = float(p['hem_y'])
        self.rnd = rnd
        self.hem_y_eff = float(p['hem_y'])
        self.ph = rnd.uniform(0, TAU, 8)
        self.prof = PROF_M if self.male else PROF_F
        self._build_pose()

    # ---------------------------------------------------------------------------------------- pose
    def _build_pose(self):
        p, male = self.p, self.male
        shw = 0.128 if male else 0.110
        shv = 0.795 if male else 0.787
        self.shw, self.shv = shw, shv
        Sm = {'a': np.array([-shw, shv, 0.0], np.float32), 'b': np.array([shw, shv, 0.0], np.float32)}
        Sw = {k: self.Rb @ v for k, v in Sm.items()}
        l_key = 'a' if Sw['a'][0] <= Sw['b'][0] else 'b'
        r_key = 'b' if l_key == 'a' else 'a'
        self.S = {'l': Sw[l_key], 'r': Sw[r_key]}
        L1, L2 = 0.172, 0.150
        zw = 0.030
        self.arms = {}
        for key, tgt in (('l', p['arm_l']), ('r', p['arm_r'])):
            S = self.S[key]
            outward = -1.0 if key == 'l' else 1.0
            if p.get('arm3_%s' % key) is not None:
                t3 = p['arm3_%s' % key]
                W = np.array([t3[0], t3[1], t3[2]], np.float32)
                pole = np.array([0.45 * outward, -0.55, -0.55], np.float32)
            else:
                W = np.array([tgt[0], tgt[1], zw + (0.02 if p['view'] == 'front' else 0.0)], np.float32)
                pole = np.array([0.55 * outward, -0.75, -0.30], np.float32)
            if p.get('elbow_%s' % key) is not None:
                e2 = p['elbow_%s' % key]
                E = np.array([e2[0], e2[1], 0.0], np.float32)
            else:
                E, W = two_bone3(S, W, L1, L2, pole)
            self.arms[key] = (S, E, W)

    # ---------------------------------------------------------------------------------------- parts
    def _dress(self, P):
        prof, male = self.prof, self.male
        y = P[:, 1]
        a = np.interp(y, prof['y'][::-1], prof['a'][::-1]).astype(np.float32)
        b = np.interp(y, prof['y'][::-1], prof['b'][::-1]).astype(np.float32)
        th = np.arctan2(P[:, 2], P[:, 0])
        rho = np.sqrt((P[:, 0] / a) ** 2 + (P[:, 2] / b) ** 2)
        ph = self.ph
        amp_hi = 0.028 if male else 0.050
        A = amp_hi * float(self.p.get('fold', 1.0)) * np.clip((0.66 - y) / 0.50, 0.04, 1.0)
        f = (0.60 * np.sin(7 * th + 2.0 + 1.6 * y + ph[0]) + 0.30 * np.sin(12 * th + 0.7 + 2.4 * y + ph[1]) + 0.35 * np.sin(3 * th + 1.1 - 1.0 * y + ph[2]))
        m = 1.0 + A * f
        d = (rho - m) * np.minimum(a, b) * 0.85
        ytop = 0.838 if self.male else 0.834
        ybot0 = (0.402 if male else self.hem)
        ybot = ybot0 + (0.006 if male else 0.014) * (0.5 + 0.5 * np.sin(5 * th + ph[5])) * (1.0 if not male else 0.6) + 0.004 * np.sin(11 * th + ph[6])
        d = np.maximum(d, np.maximum(y - ytop, ybot - y))
        if not self.male and self.p['view'] != 'back':                                       # scoop neckline: the chest shows
            cut = sd_ell(P, (0, 0.822, 0.054), (0.036, 0.028, 0.046))
            d = smax(d, -cut, 0.008)
        if self.male and self.p['view'] != 'back':                                           # a V at the throat, laced
            cut = sd_ell(P, (0, 0.818, 0.058), (0.026, 0.036, 0.050))
            d = smax(d, -cut, 0.008)
        return d

    def _belt(self, P):
        y0 = 0.634 if not self.male else 0.598
        a = float(np.interp(y0, self.prof['y'][::-1], self.prof['a'][::-1]))
        b = float(np.interp(y0, self.prof['y'][::-1], self.prof['b'][::-1]))
        rho = np.sqrt((P[:, 0] / (a + 0.004)) ** 2 + (P[:, 2] / (b + 0.004)) ** 2)
        d = np.sqrt(((rho - 1.0) * min(a, b)) ** 2 + (P[:, 1] - y0) ** 2) - 0.0062
        return d

    def _trousers(self, P):
        d = None
        for sx in (-1, 1):
            c = sd_cap(P, (sx * 0.056, 0.440, 0.0), (sx * 0.060, 0.225, 0.010), 0.054, 0.040)
            c = smin(c, sd_cap(P, (sx * 0.060, 0.225, 0.010), (sx * 0.066, 0.070, 0.0), 0.040, 0.030), 0.024)
            c = smin(c, sd_ell(P, (sx * 0.064, 0.058, 0.006), (0.036, 0.030, 0.038)), 0.014)                       # the cloth gathers over the shoe
            c = smin(c, sd_ell(P, (sx * 0.062, 0.215, 0.030), (0.038, 0.044, 0.020)), 0.020)                       # a knee
            d = c if d is None else np.minimum(d, c)
        return d

    def _shoes(self, P):
        d = None
        for sx in (-1, 1):
            c = sd_ell(P, (sx * 0.068, 0.024, 0.030), (0.032, 0.026, 0.064))
            c = smin(c, sd_ell(P, (sx * 0.066, 0.040, -0.016), (0.030, 0.034, 0.034)), 0.016)
            d = c if d is None else np.minimum(d, c)
        return d

    def _feet(self, P):
        d = None
        for sx in (-1, 1):
            c = sd_ell(P, (sx * 0.070, 0.013, 0.034), (0.030, 0.014, 0.052))
            d = c if d is None else np.minimum(d, c)
        return d

    def _chest(self, P):
        if self.male:
            return sd_ell(P, (0, 0.760, 0.0), (0.115, 0.062, 0.056))
        return sd_ell(P, (0, 0.768, 0.004), (0.090, 0.056, 0.048))

    def _neck(self, P):
        r0, r1 = (0.027, 0.031) if self.male else (0.021, 0.025)
        return sd_cap(P, (0, 0.866, -0.006), (0, 0.800, 0.0), r0, r1)

    def head_local(self, P):
        """world/model point -> head frame (centre (0,0.912,0), turned by the head yaw about the neck)"""
        piv = np.array([0.0, 0.860, -0.006], np.float32)
        R = rot_y(-self.head_yaw)
        q = (P - piv) @ R.T if self.head_yaw else (P - piv)
        return q + piv - np.array([0.0, 0.912, 0.0], np.float32)

    def _head(self, P):
        Q = self.head_local(P)
        male = self.male
        d = sd_ell(Q, (0, 0.002, -0.004), (0.052, 0.064, 0.057))
        d = smin(d, sd_ell(Q, (0, -0.044, 0.018), (0.034 + (0.004 if male else 0.0), 0.026, 0.036)), 0.020)
        for sx in (-1, 1):
            d = smin(d, sd_ell(Q, (sx * 0.032, -0.020, 0.036), (0.026, 0.026, 0.020)), 0.016)           # the cheeks: full and round
            d = smin(d, sd_ell(Q, (sx * 0.041, -0.036, 0.008), (0.018, 0.024, 0.030)), 0.014)           # the angle of the jaw, softened
            d = smin(d, sd_ell(Q, (sx * 0.050, -0.004, -0.004), (0.006, 0.014, 0.010)), 0.006)            # ears
        d = smin(d, sd_ell(Q, (0, 0.018, 0.046), (0.040, 0.010, 0.016)), 0.010)                           # brow ridge
        d = smin(d, sd_cap(Q, (0, 0.010, 0.050), (0, -0.022, 0.070), 0.0095, 0.0128), 0.010)              # nose
        d = smin(d, sd_ell(Q, (0, -0.040, 0.050), (0.017, 0.006, 0.008)), 0.005)                          # lips
        d = smin(d, sd_ell(Q, (0, -0.049, 0.049), (0.015, 0.0065, 0.0085)), 0.005)
        for sx in (-1, 1):                                                                                # eye sockets
            d = smax(d, -(sd_ell(Q, (sx * 0.023, 0.006, 0.056), (0.014, 0.009, 0.010))), 0.006)
        return d

    def _hair(self, P):
        p = self.p
        Q = self.head_local(P)
        short = self.male or p['hair_style'] == 'short'
        if short:
            cap = sd_ell(Q, (0, 0.012, -0.008), (0.056, 0.064, 0.062))
            face = sd_ell(Q, (0, -0.018, 0.052), (0.046, 0.054, 0.040))
            d = np.maximum(cap, -face)
            d = np.maximum(d, -(Q[:, 1] + 0.030) - 0.0)                       # nothing below the ears
            return d
        cap = sd_ell(Q, (0, 0.014, -0.010), (0.058, 0.070, 0.064))
        face = sd_ell(Q, (0, -0.020, 0.056), (0.047, 0.056, 0.040))
        d = np.maximum(cap, -face)
        d = np.maximum(d, -(Q[:, 1] + 0.050) - 0.0) if False else d
        # back mass: flattened ellipsoids falling from the nape to the lower back (in the BODY frame, so it does not turn with the head)
        db = None
        for k in range(11):
            t = k / 10.0
            yy = 0.905 - 0.305 * t
            rx = 0.062 + 0.016 * math.sin(math.pi * min(1.0, t * 1.1)) - 0.010 * t
            c = sd_ell(P, (0.004 * math.sin(t * 5 + self.ph[4]), yy, -0.046 - 0.004 * t), (rx, 0.030, 0.030 - 0.006 * t))
            db = c if db is None else smin(db, c, 0.034)
        d = smin(d, db, 0.020)
        for sx in (-1, 1):                                                    # locks falling in front of the shoulders: one broad, one thin, tapering, each with its own wave
            ph_ = self.ph[5] + sx
            c = sd_ell(P, (sx * 0.062, 0.835, 0.010), (0.012, 0.070, 0.019))
            c = smin(c, sd_ell(P, (sx * 0.070 + 0.003 * math.sin(ph_), 0.742, 0.025), (0.0135, 0.074, 0.018)), 0.012)
            c = smin(c, sd_ell(P, (sx * 0.076 + 0.006 * math.sin(ph_ + 1.5), 0.672, 0.032), (0.011, 0.042, 0.014)), 0.010)
            c = smin(c, sd_ell(P, (sx * 0.081 + 0.008 * math.sin(ph_ + 2.7), 0.628, 0.036), (0.007, 0.030, 0.010)), 0.008)      # the tapering end
            d = smin(d, c, 0.014)
            t_ = sd_ell(P, (sx * 0.050 - 0.004 * sx, 0.800, 0.026), (0.006, 0.060, 0.012))                                    # a thin loose strand across the blouse
            d = smin(d, t_, 0.006)
        d = d + (0.0013 * np.sin(P[:, 0] * 330.0 + P[:, 1] * 9.0 + self.ph[3]) + 0.0007 * np.sin(P[:, 0] * 760.0 + P[:, 1] * 14.0 + self.ph[4])) * (P[:, 1] < 0.86)      # the grooves between locks (fine)
        return d

    def _arm(self, P, key):
        S, E, W = self.arms[key]
        male = self.male
        r0, r1 = (0.033, 0.026) if male else (0.029, 0.023)
        f0, f1 = (0.025, 0.017) if male else (0.022, 0.015)
        d = np.minimum(sd_cap(P, S, E, r0, r1), sd_cap(P, E, W, f0, f1))
        d = smin(d, sd_ell(P, S, (0.034, 0.034, 0.034)), 0.02)
        return d

    def _hand(self, P, key):
        S, E, W = self.arms[key]
        v = W - E
        v = v / (np.linalg.norm(v) + 1e-9)
        k = 1.12 if self.male else 1.0
        curl = self.p['curl_l'] if key == 'l' else self.p['curl_r']
        palm1 = W + v * 0.040 * k
        d = sd_cap(P, W, palm1, 0.0150 * k, 0.0140 * k)
        up = np.array([0.0, 0.0, 1.0], np.float32)
        side_vec = np.cross(v, up); side_vec = side_vec / (np.linalg.norm(side_vec) + 1e-9)
        for i in range(4):
            off = (i - 1.5) * 0.0074 * k
            base = palm1 + side_vec * off
            dirv = v
            pos = base
            for si, ln in enumerate((0.021, 0.016, 0.012)):
                dirv = dirv * math.cos(curl * (0.35 + 0.35 * si) * 0.6) + up * math.sin(curl * (0.35 + 0.35 * si) * 0.6)
                dirv = dirv / (np.linalg.norm(dirv) + 1e-9)
                nxt = pos + dirv * ln * k * (1.12 if i in (1, 2) else 1.0)
                d = np.minimum(d, sd_cap(P, pos, nxt, (0.0062 - 0.0007 * si) * k, (0.0054 - 0.0007 * si) * k))
                pos = nxt
        sgn = 1.0 if (np.cross(v, np.array([0, 0, 1.0], np.float32))[1] > 0) else -1.0
        tb = W + v * 0.012 + side_vec * 0.013 * (-sgn)
        t1 = tb + (v * 0.8 + side_vec * 0.5 * (-sgn)) * 0.022
        d = np.minimum(d, sd_cap(P, tb, t1, 0.0078 * k, 0.0066 * k))
        return d

    def _sleeve(self, P, key):
        S, E, W = self.arms[key]
        if self.male:                                                         # a loose linen shirt sleeve to the wrist, gathered into a cuff
            d = sd_cap(P, S + np.array([0, -0.006, 0], np.float32), E, 0.037, 0.034)
            d = np.minimum(d, sd_cap(P, E, W - (W - E) * 0.12, 0.034, 0.0275))
            d = smin(d, sd_cap(P, W - (W - E) * 0.16, W - (W - E) * 0.06, 0.0245, 0.0245), 0.010)
            return d
        q = S + 0.52 * (E - S)
        return sd_cap(P, S + np.array([0, 0.004, 0], np.float32), q, 0.040, 0.046)

    def _bow(self, P):
        if self.male or not self.p['bow'] or self.p['view'] == 'front':
            return np.full(len(P), 9.0, np.float32)
        zc = (-0.050 if self.p['view'] == 'back' else 0.050)
        zc = zc if self.p['view'] == 'back' else 9.0
        d = None
        for sx in (-1, 1):
            c = sd_ell(P, (sx * 0.020, 0.634, -0.050), (0.020, 0.010, 0.008))
            c = np.minimum(c, sd_cap(P, (sx * 0.006, 0.628, -0.054), (sx * 0.026, 0.46, -0.058), 0.005, 0.004))
            d = c if d is None else np.minimum(d, c)
        return d

    # ---------------------------------------------------------------------------------------- scene
    def parts(self):
        """(name, fn(P)->dist). P is in the MODEL frame except for arms / hands which live in the WORLD frame (pose targets are screen-space)."""
        pl = []
        male = self.male
        pl.append(('dress', lambda P: bounded(P, (0, 0.62, 0), 0.52, lambda Q: self._dress(Q))))
        pl.append(('belt', lambda P: bounded(P, (0, 0.62, 0), 0.34, lambda Q: self._belt(Q))))
        pl.append(('chest', lambda P: bounded(P, (0, 0.77, 0), 0.16, lambda Q: self._chest(Q))))
        pl.append(('neck', lambda P: bounded(P, (0, 0.83, 0), 0.07, lambda Q: self._neck(Q))))
        pl.append(('head', lambda P: bounded(P, (0, 0.912, 0), 0.115, lambda Q: self._head(Q))))
        pl.append(('hair', lambda P: bounded(P, (0, 0.80, -0.01), 0.30, lambda Q: self._hair(Q))))
        if male:
            pl.append(('legs', lambda P: bounded(P, (0, 0.24, 0), 0.30, lambda Q: self._trousers(Q))))
            pl.append(('shoes', lambda P: bounded(P, (0, 0.03, 0.02), 0.14, lambda Q: self._shoes(Q))))
        if self.p['feet']:
            pl.append(('feet', lambda P: bounded(P, (0, 0.016, 0.03), 0.13, lambda Q: self._feet(Q))))
        pl.append(('bow', lambda P: bounded(P, (0, 0.55, -0.05), 0.14, lambda Q: self._bow(Q))))
        return pl

    def world_parts(self):
        pl = []
        for key in ('l', 'r'):
            S, E, W = self.arms[key]
            cen = (S + W) / 2
            rad = float(np.linalg.norm(W - S)) / 2 + 0.12
            pl.append(('arm', (lambda P, key=key, cen=cen, rad=rad: bounded(P, cen, rad, lambda Q: self._arm(Q, key)))))
            pl.append(('hand', (lambda P, key=key, W=W: bounded(P, W, 0.10, lambda Q: self._hand(Q, key)))))
            pl.append(('sleeve', (lambda P, key=key, cen=cen, rad=rad: bounded(P, cen, rad, lambda Q: self._sleeve(Q, key)))))
        return pl


# ============================================================================================ face texture
def face_texture(T, p, L, rnd, male, ss):
    """the painted face of fig.py on a transparent square in head units, at the sprite's own resolution"""
    import fig as F
    hh = 0.135 * T * ss
    n = int(hh * 1.5) | 1
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, n, n)
    c = cairo.Context(surf)
    c.set_antialias(cairo.ANTIALIAS_BEST)
    c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
    cx, cy = n / 2.0, n / 2.0
    fx = lambda u, v: (cx + u * hh, cy - v * hh)
    F._face(c, fx, hh, p, L, rnd, male)
    surf.flush()
    a = np.frombuffer(surf.get_data(), np.uint8).reshape(n, n, 4).astype(np.float32) / 255.0
    al = a[..., 3]
    rgb = a[..., 2::-1] / np.maximum(al, 1e-4)[..., None]
    return rgb, al, hh, n


def sample_tex(rgb, al, hh, n, qx, qy):
    """bilinear lookup at head-frame coordinates (T-units)"""
    k = hh / 0.135
    mx = (n / 2.0 + qx * k).astype(np.float32)
    my = (n / 2.0 - qy * k).astype(np.float32)
    srcw = np.dstack([rgb * al[..., None], al])
    out = cv2.remap(srcw, mx.reshape(-1, 1), my.reshape(-1, 1), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0).reshape(-1, 4)
    a = out[:, 3]
    return out[:, :3] / np.maximum(a, 1e-4)[:, None], a


def crown_top(c, cx, cy, T, rnd, wilt=0.0):
    """a wreath seen from straight above: an uneven ring of leaves and mixed blossoms round the head, a few stems trailing"""
    n = 22
    R_ = 0.066 * T
    for i in range(n):
        th = TAU * i / n + rnd.uniform(-0.10, 0.10)
        rr = R_ * rnd.uniform(0.88, 1.12)
        x, y = cx + rr * math.cos(th), cy + rr * 0.96 * math.sin(th)
        c.set_source_rgba(0.18 + 0.08 * rnd.random(), 0.32 + 0.10 * rnd.random(), 0.12, 0.96)
        c.save(); c.translate(x, y); c.rotate(th + math.pi / 2 + rnd.normal(0, 0.45)); c.scale(rnd.uniform(0.016, 0.026) * T, 0.0085 * T); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    pal = [(0.96, 0.78, 0.82), (0.70, 0.78, 0.96), (0.98, 0.84, 0.30), (0.92, 0.50, 0.58), (0.97, 0.95, 0.90), (0.80, 0.70, 0.94), (0.98, 0.66, 0.34), (0.90, 0.92, 1.0), (0.86, 0.36, 0.44)]
    for i in range(16):
        th = TAU * (i + rnd.uniform(0.05, 0.95)) / 16
        rr = R_ * rnd.uniform(0.86, 1.14)
        x, y = cx + rr * math.cos(th), cy + rr * 0.96 * math.sin(th)
        col = pal[int(rnd.integers(0, len(pal)))]
        if wilt > 0:
            dead = (0.62, 0.52, 0.34)
            col = tuple(col[k] * (1 - 0.7 * wilt) + dead[k] * 0.7 * wilt for k in range(3))
        r = rnd.uniform(0.009, 0.019) * T
        for k in range(5):
            a = TAU * k / 5 + i
            c.set_source_rgba(col[0] * 0.80, col[1] * 0.80, col[2] * 0.82, 1)
            c.new_path(); c.arc(x + math.cos(a) * r * 0.62 + 0.0015 * T, y + math.sin(a) * r * 0.62 + 0.002 * T, r * 0.60, 0, TAU); c.fill()
        for k in range(5):
            a = TAU * k / 5 + i
            c.set_source_rgba(*col, 1); c.new_path(); c.arc(x + math.cos(a) * r * 0.60, y + math.sin(a) * r * 0.60, r * 0.58, 0, TAU); c.fill()
        c.set_source_rgba(0.96, 0.74, 0.20, 1); c.new_path(); c.arc(x, y, r * 0.30, 0, TAU); c.fill()
    for k in range(2):                                                    # two short ribbons lying on the hair behind the wreath
        c.set_source_rgba(0.70 - 0.2 * k, 0.78, 0.96, 0.9); c.set_line_width(0.0075 * T)
        c.new_path(); c.move_to(cx + (k * 2 - 1) * 0.020 * T, cy + R_ * 0.9)
        c.curve_to(cx + (k * 2 - 1) * 0.030 * T, cy + 0.10 * T, cx + (k * 2 - 1) * 0.012 * T, cy + 0.13 * T, cx + (k * 2 - 1) * 0.034 * T, cy + 0.17 * T); c.stroke()


# ============================================================================================ render
def render(T, pose=None, light=None, seed=0, ss=2, top=False):
    import fig as F
    p = {**F.DEFAULT, **(pose or {})}
    L = light or F.Light()
    key = (int(T), repr(sorted((k, repr(v)) for k, v in p.items())), repr(vars(L)) if hasattr(L, '__dict__') else '', int(seed), int(ss), bool(top))
    if key in _CACHE:
        return _CACHE[key]
    ss = int(min(ss, 3 if T <= 100 else 2))
    rnd = np.random.default_rng(seed)
    male = bool(p['male'])
    view = p['view']
    body = Body(p, T, rnd)
    if top:
        Ws, Hs = int(T * 1.60) | 1, int(T * 1.60) | 1
        ox, oy = Ws / 2.0, Hs / 2.0
    else:
        Ws, Hs = int(T * 1.30) | 1, int(T * 1.16)
        ox, oy = Ws / 2.0, T * 1.06
    ssf = float(ss)
    gw, gh = int(Ws * ssf), int(Hs * ssf)
    jj, ii = np.meshgrid(np.arange(gw, dtype=np.float32), np.arange(gh, dtype=np.float32))
    U = ((jj + 0.5) / ssf - ox) / T
    V = (oy - (ii + 0.5) / ssf) / T
    # active rays: inside the figure's bounding box only
    inb = ((np.abs(V) < 0.78) & (np.abs(U) < 0.78)) if top else ((V > -0.04) & (V < 1.02) & (np.abs(U) < 0.42))
    idx = np.nonzero(inb.ravel())[0]
    Ux, Vx = U.ravel()[idx], V.ravel()[idx]
    z0 = 0.50
    Rb, RbT = body.Rb, body.Rb.T

    mparts = body.parts()
    wparts = body.world_parts()

    def dist_all(Pw, want_ids=False):
        """Pw: (n,3) world points. returns d (and per-part distances if asked)"""
        Pm = Pw @ RbT.T if False else Pw @ Rb                              # world -> model: (Rb^-1 p) = p @ Rb  (row-vector form)
        ds = []
        for name, fn in mparts:
            ds.append(fn(Pm))
        for name, fn in wparts:
            ds.append(fn(Pw))
        D = np.stack(ds, 0)
        return (D.min(0), D) if want_ids else D.min(0)

    # ---- sphere tracing along -z (orthographic)
    n = len(idx)
    t = np.zeros(n, np.float32)
    hit = np.zeros(n, bool)
    act = np.arange(n)
    if top:
        HC_ = 3.4                                                     # a camera 3.4 figure-heights up: heads and shoulders loom a little bigger than the hem
        Dr = np.stack([Ux, np.full_like(Ux, -HC_), Vx], 1); Dr /= np.linalg.norm(Dr, axis=1, keepdims=True)
        Cc = np.array([0.0, HC_, 0.0], np.float32)
        t_start = (HC_ - 1.20) / (-Dr[:, 1])
        t_end = (HC_ + 0.06) / (-Dr[:, 1])
        zt = t_start.astype(np.float32).copy()
        mkP = lambda a, tt: Cc[None, :] + tt[:, None] * Dr[a]
        for it in range(90):
            if len(act) == 0:
                break
            P = mkP(act, zt[act])
            d = dist_all(P)
            h = d < 0.0016
            if h.any():
                hit[act[h]] = True
            mv = (~h) & (zt[act] < t_end[act])
            zt[act[mv]] += np.maximum(d[mv], 0.0016) * 0.82
            act = act[mv]
    else:
        zt = np.full(n, z0, np.float32)
        zend = -0.42
        mkP = lambda a, tt: np.stack([Ux[a], Vx[a], tt], 1)
        for it in range(70):
            if len(act) == 0:
                break
            P = mkP(act, zt[act])
            d = dist_all(P)
            h = d < 0.0016
            if h.any():
                hit[act[h]] = True
            mv = (~h) & (zt[act] > zend)
            zt[act[mv]] -= np.maximum(d[mv], 0.0016) * 0.82
            act = act[mv]
    hidx = np.nonzero(hit)[0]
    nh = len(hidx)
    rgb_full = np.zeros((gh * gw, 3), np.float32)
    alpha_full = np.zeros(gh * gw, np.float32)
    if nh == 0:
        sprite = dict(rgb=np.zeros((Hs, Ws, 3), np.float32), a=np.zeros((Hs, Ws), np.float32), sil=np.zeros((Hs, Ws), np.float32), anchor=(ox, oy), lantern=None, size=(Ws, Hs), T=T,
                      pt=lambda u, v: (ox + u * T, oy - v * T))
        return sprite
    Ph = mkP(hidx, zt[hidx])
    D, DA = dist_all(Ph, True)
    ids = DA.argmin(0)
    names = [nm for nm, _ in mparts] + [nm for nm, _ in wparts]

    def grad(P, eps=0.0022):
        e = np.array([[1, -1, -1], [-1, -1, 1], [-1, 1, -1], [1, 1, 1]], np.float32) * eps
        g = np.zeros_like(P)
        for k in range(4):
            g += e[k] * dist_all(P + e[k])[:, None]
        g /= (np.linalg.norm(g, axis=1, keepdims=True) + 1e-9)
        return g

    N = grad(Ph)
    # ---- light
    Lk = (np.array([L.key[0], L.key[1], L.key[2]], np.float32) if top else np.array([L.key[0], -L.key[1], L.key[2]], np.float32)); Lk /= np.linalg.norm(Lk)
    key_col = np.asarray(L.key_col, np.float32) * float(L.key_gain)
    amb_col = np.asarray(L.amb_col, np.float32) * float(L.amb_gain)
    bnc_col = np.asarray(L.bounce_col, np.float32) * float(L.bounce_gain)
    rim_dir = (np.array([L.rim[0], L.rim[1], L.rim[2]], np.float32) if top else np.array([L.rim[0], -L.rim[1], L.rim[2]], np.float32)); rim_dir /= (np.linalg.norm(rim_dir) + 1e-9)
    rim_col = np.asarray(L.rim_col, np.float32) * float(L.rim_gain)
    V_ = np.array([0, 1.0, 0], np.float32) if top else np.array([0, 0, 1.0], np.float32)
    ndl = N @ Lk
    # ---- soft shadow toward the key light + ambient occlusion
    sh = np.ones(nh, np.float32)
    tt = np.full(nh, 0.012, np.float32)
    for it in range(22):
        Q = Ph + N * 0.004 + Lk[None, :] * tt[:, None]
        dq = dist_all(Q)
        sh = np.minimum(sh, np.clip(7.0 * dq / tt, 0, 1))
        tt = tt + np.clip(dq, 0.006, 0.05)
        if tt.min() > 0.7:
            break
    sh = sh * sh * (3 - 2 * sh)
    ao = np.zeros(nh, np.float32)
    wsum = 0.0
    for k in range(1, 6):
        hk = 0.010 * k
        dq = dist_all(Ph + N * hk)
        ao += (hk - dq) / (1.6 ** k)
        wsum += 1 / (1.6 ** k)
    ao = np.clip(1.0 - 1.6 * ao, 0.35, 1.0)
    # soften the sampled shadow / occlusion across neighbouring pixels (a fixed number of march steps leaves banding on folds)
    sm_sig = max(0.8, 0.0035 * T * ssf)
    hm = np.zeros(gh * gw, np.float32); hm[idx[hidx]] = 1.0
    hm = hm.reshape(gh, gw)
    base_blur = cv2.GaussianBlur(hm, (0, 0), sm_sig) + 1e-4
    for nm_, arr_ in (('sh', sh), ('ao', ao)):
        im_ = np.zeros(gh * gw, np.float32); im_[idx[hidx]] = arr_
        im_ = cv2.GaussianBlur(im_.reshape(gh, gw), (0, 0), sm_sig) / base_blur
        arr_[:] = im_.reshape(-1)[idx[hidx]]
    # ---- materials
    skin_c = np.asarray(p['skin'], np.float32)
    dress_c = np.asarray(p['dress'], np.float32)
    hair_c = np.asarray(p['hair'], np.float32)
    belt_c = np.asarray(p['belt'], np.float32)
    pid = np.array([0 if nm in ('chest', 'neck', 'head', 'feet', 'arm', 'hand') else (1 if nm in ('dress', 'sleeve', 'legs') else (2 if nm == 'hair' else (4 if nm == 'shoes' else 3))) for nm in names], np.int8)[ids]
    is_head = (np.array([nm == 'head' for nm in names])[ids])
    alb = np.zeros((nh, 3), np.float32)
    alb[pid == 0] = skin_c
    alb[pid == 1] = dress_c
    alb[pid == 2] = hair_c
    alb[pid == 3] = belt_c
    alb[pid == 4] = np.array([0.30, 0.19, 0.12], np.float32)
    # folk embroidery on the linen: a red + blue band at the hem, small flowers and a stitched line round the neckline and at the cuffs (model-space pattern)
    Pm_all = Ph @ Rb
    th_ = np.arctan2(Pm_all[:, 2], Pm_all[:, 0]); y_ = Pm_all[:, 1]
    emb = np.zeros(nh, np.float32); embc = np.zeros((nh, 3), np.float32)
    on_dress = (pid == 1) & np.array([nm == 'dress' for nm in names])[ids]
    if not male:
        hb = np.clip(1 - np.abs((y_ - (body.hem_y_eff + 0.034)) / 0.010), 0, 1) * on_dress              # solid red band
        hb2 = np.clip(1 - np.abs((y_ - (body.hem_y_eff + 0.060)) / 0.0045), 0, 1) * on_dress            # thin blue line
        zig = np.clip(1 - np.abs((y_ - (body.hem_y_eff + 0.080 + 0.010 * np.abs(np.sin(th_ * 9)))) / 0.0035), 0, 1) * on_dress
        emb = np.maximum(np.maximum(hb, hb2), zig)
        embc = (hb[:, None] * np.array([0.74, 0.14, 0.16], np.float32) + (hb2 + 0.0)[:, None] * np.array([0.22, 0.38, 0.70], np.float32) + zig[:, None] * np.array([0.74, 0.14, 0.16], np.float32))
        embc = embc / np.maximum(hb + hb2 + zig, 1e-4)[:, None]
        nl = np.clip(1 - np.abs((y_ - 0.805) / 0.006), 0, 1) * on_dress * (Pm_all[:, 2] > -0.01)       # stitched line round the neckline
        dots = np.clip(np.sin(th_ * 46) * 0.5 + 0.5, 0, 1) ** 2
        emb = np.maximum(emb, nl * dots); embc = np.where((nl * dots > 0.1)[:, None], np.array([0.74, 0.14, 0.16], np.float32), embc)
    alb = alb * (1 - 0.88 * emb[:, None]) + embc * (0.88 * emb[:, None]) * 0.95
    # skin: tiny colour mottling + cheeks/knuckles/lips are painted; hands and neck a touch darker toward the shadow side
    nz = fbm(0, 0, 1, 1, 1) if False else None
    rng2 = np.random.default_rng(seed + 5)
    # ---- screen-space fine noise for weave / hair strands (cheap, from a small tiled field)
    tile = cv2.resize(rng2.standard_normal((48, 48)).astype(np.float32), (240, 240), interpolation=cv2.INTER_CUBIC)
    px = (Ux[hidx] * T * 3.1).astype(np.int32) % 240
    py = (Vx[hidx] * T * 3.1).astype(np.int32) % 240
    weave = tile[py, px]
    Pm_h = Ph @ Rb
    ty_ = ((Pm_h[:, 1] * 45.0).astype(np.int32)) % 240                      # long in y: a strand keeps its line for a good length
    tx_ = ((Pm_h[:, 0] * 150.0).astype(np.int32)) % 240
    n1 = tile[ty_, tx_]
    n2 = tile[((Pm_h[:, 1] * 28.0 + 90).astype(np.int32)) % 240, ((Pm_h[:, 0] * 60.0 + 30).astype(np.int32)) % 240]
    ph_v = Pm_h[:, 0] * (300.0 + 70.0 * n2) + 4.5 * n1 + 1.6 * np.sin(Pm_h[:, 1] * 6.0 + 2.0 * n2)          # hanging hair: lines that wander and change pitch
    th_c = np.arctan2(Pm_h[:, 2] + 0.004, Pm_h[:, 0])                         # seen from above the strands radiate from the parting
    ph_r = th_c * 52.0 + 3.0 * n1
    crown = np.clip((Pm_h[:, 1] - 0.940) / 0.030, 0, 1)
    ph_s = ph_v * (1 - crown) + ph_r * crown
    strand = 0.52 * (0.5 + 0.5 * np.sin(ph_s)) + 0.30 * (0.5 + 0.5 * np.sin(ph_s * 2.3 + 1.7 * n1)) + 0.18 * (0.5 + 0.5 * np.sin(ph_s * 0.29 + 2.0 * n2))
    strand = np.clip(strand, 0, 1) ** 1.25
    part = np.exp(-(Pm_h[:, 0] / 0.0042) ** 2) * (Pm_h[:, 2] > -0.012) * crown                                  # the parting: a pale-ish line of scalp
    # ---- hair: strands bend the normal so that the key light skips along them (the highlight breaks up into hairs)
    hair_m = pid == 2
    if hair_m.any():
        pert = (strand[hair_m] - 0.5)[:, None] * np.array([1.0, 0.0, 0.15], np.float32)[None, :] * 0.70
        Nh_ = N[hair_m] + pert
        N[hair_m] = Nh_ / (np.linalg.norm(Nh_, axis=1, keepdims=True) + 1e-9)
        ndl = N @ Lk
    # ---- lighting
    wrap = np.where(pid == 0, 0.40, np.where(pid == 2, 0.25, 0.30)).astype(np.float32)
    diff = np.clip((ndl + wrap) / (1 + wrap), 0, 1) * sh
    sky = np.clip(0.55 + 0.45 * N[:, 1], 0, 1)[:, None]
    ao_eff = np.where(pid == 0, 0.55 + 0.45 * ao, ao)
    col = alb * (amb_col[None, :] * (0.55 + 0.45 * sky) * ao_eff[:, None] + key_col[None, :] * diff[:, None])
    col += alb * bnc_col[None, :] * (np.clip(-N[:, 1], 0, 1) * ao)[:, None]
    # skin: warm terminator + a little spec
    sss = np.asarray(L.sss, np.float32)
    term = np.exp(-((ndl - 0.12) / 0.20) ** 2) * (pid == 0)
    col += alb * sss[None, :] * (0.55 * term)[:, None] * sh[:, None]
    Hv = Lk + V_; Hv = Hv / np.linalg.norm(Hv)
    ndh = np.clip(N @ Hv, 0, 1)
    ndv = N @ V_
    fres = np.clip(1 - ndv, 0, 1) ** 3
    skm = (pid == 0)
    if skm.any():
        mott = tile[(py * 5) % 240, (px * 5 + 31) % 240]
        col[skm] *= (1.0 + 0.020 * mott[skm])[:, None] * np.array([1.0, 0.995, 0.99], np.float32)[None, :]
    spec_skin = (ndh ** 34) * 0.10 * (pid == 0) * sh
    col += (spec_skin[:, None] * np.array([1.0, 0.92, 0.82], np.float32)[None, :]) * key_col.mean()
    # cloth: weave, translucency when lit from behind, a grazing sheen
    cloth = (pid == 1) | (pid == 3)
    col[cloth] *= (1 + 0.016 * weave[cloth])[:, None]
    behind = np.clip(-ndl, 0, 1) * cloth
    col += alb * key_col[None, :] * (0.34 * behind)[:, None] * (0.6 + 0.4 * (1 - ao))[:, None]
    col += (fres * 0.10 * cloth)[:, None] * amb_col[None, :] * 1.4
    # hair: strands + an anisotropic highlight along the fall direction
    hair = pid == 2
    Tg = np.array([0.0, -1.0, 0.0], np.float32)
    tdh = np.abs(Hv @ Tg)
    sinTH = np.sqrt(np.clip(1 - tdh * tdh, 0, 1))
    hl = (sinTH ** 70) * 0.55 * hair * sh * np.clip(ndl + 0.5, 0, 1)
    col[hair] *= (0.70 + 0.46 * strand[hair])[:, None] * (0.86 + 0.20 * np.clip((Pm_h[hair, 1] - 0.60) / 0.30, 0, 1))[:, None]
    col[hair] = col[hair] * (1 - 0.55 * part[hair])[:, None] + np.array([0.55, 0.40, 0.32], np.float32)[None, :] * (0.30 * part[hair])[:, None] * key_col.mean()
    col += hl[:, None] * np.clip(hair_c * 1.4 + 0.25, 0, 1)[None, :] * key_col.mean()
    # rim
    if L.rim_gain > 0:
        rimt = np.clip(N @ rim_dir, 0, 1) ** 2.2
        col += rim_col[None, :] * rimt[:, None]
    if L.rim_fres > 0:
        fr_ = np.clip(1.0 - ndv, 0, 1) ** 2.2
        col += (np.asarray(L.fres_col, np.float32) * float(L.rim_fres))[None, :] * fr_[:, None] * (0.45 + 0.55 * alb)
    # ---- the painted face, projected onto the head
    if view == 'front' and abs(body.head_yaw) < 1.1 and not top:
        Pm = Ph @ Rb
        Q = body.head_local(Pm)
        Nm = N @ Rb
        Nh = Nm @ rot_y(-body.head_yaw).T if body.head_yaw else Nm
        frontal = np.clip((Nh[:, 2] - 0.10) / 0.35, 0, 1) * is_head * (Q[:, 2] > 0.0)
        if frontal.any():
            ftex = face_texture(T, p, L, rnd, male, ss)
            sel = np.nonzero(frontal > 0)[0]
            frgb, fa = sample_tex(ftex[0], ftex[1], ftex[2], ftex[3], Q[sel, 0], Q[sel, 1])
            lit = np.clip(0.50 + 0.55 * (diff[sel] * 0.9 + 0.35 * ao[sel]), 0.35, 1.15)[:, None]
            a_ = (fa * frontal[sel])[:, None]
            col[sel] = col[sel] * (1 - a_) + (frgb * lit) * a_
    col = np.clip(col, 0, 1.2)
    out = np.zeros((gh * gw, 3), np.float32)
    al = np.zeros(gh * gw, np.float32)
    flat = idx[hidx]
    out[flat] = col
    al[flat] = 1.0
    out = out.reshape(gh, gw, 3); al = al.reshape(gh, gw)
    rgbp = out * al[..., None]
    if ss > 1:
        rgbp = cv2.resize(rgbp, (Ws, Hs), interpolation=cv2.INTER_AREA)
        a = cv2.resize(al, (Ws, Hs), interpolation=cv2.INTER_AREA)
    else:
        a = al
    # ---- crown, drawn over the finished body (same painter as fig.py)
    sil = a.copy()
    if p['crown']:
        S = 3
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, Ws * S, Hs * S)
        c = cairo.Context(surf)
        c.scale(S, S)
        c.set_antialias(cairo.ANTIALIAS_BEST)
        c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
        PH = lambda u, v: (ox + u * T, oy - v * T)
        fc = 1 if p['facing'] >= 0 else -1
        hy_turn = body.head_yaw
        if T >= 180 and not top and not male:                                                 # flyaway hair: a few dozen single hairs lifting off the skull, caught by the light
            hr_ = np.random.default_rng(int(seed) + 303)
            hcx, hcy = PH(0.012 * hy_turn, 0.912)
            hc = np.clip(np.asarray(p['hair'], np.float32) * 1.18 + 0.05, 0, 1)
            for q in range(18):
                side_ = -1 if q % 2 else 1
                th_ = (-math.pi * 0.5) + side_ * hr_.uniform(0.62, 1.22) * math.pi * 0.5                 # round the temples and the upper sides only, never over the crown
                r0 = 0.0535 * T * hr_.uniform(0.92, 1.0)
                x0_, y0_ = hcx + math.cos(th_) * r0 * 0.96, hcy + math.sin(th_) * r0 * 1.10
                ln_ = hr_.uniform(0.014, 0.034) * T
                c.set_source_rgba(float(hc[0]), float(hc[1]), float(hc[2]), hr_.uniform(0.18, 0.38))
                c.set_line_width(max(0.5, hr_.uniform(0.0008, 0.0013) * T))
                c.new_path(); c.move_to(x0_, y0_)
                c.curve_to(x0_ + math.cos(th_) * ln_ * 0.5, y0_ + math.sin(th_) * ln_ * 0.4, x0_ + math.cos(th_) * ln_ * 0.9 + side_ * 0.004 * T, y0_ + math.sin(th_) * ln_ * 0.5 + 0.010 * T,
                           x0_ + math.cos(th_) * ln_ * 0.9 + side_ * 0.008 * T, y0_ + 0.026 * T)
                c.stroke()
        if top:
            crown_top(c, ox, oy - 0.004 * T, T, rnd, p['wilt'])
        else:
            F._crown(c, lambda u, v: PH(u + 0.10 * 0.135 * hy_turn * 0.0, v), T, rnd, view == 'back', hy_turn, (0.0 + 0.012 * hy_turn, 0.912), view == 'side', fc, p['wilt'])
        surf.flush()
        det = np.frombuffer(surf.get_data(), np.uint8).reshape(Hs * S, Ws * S, 4).astype(np.float32) / 255.0
        det = cv2.resize(det, (Ws, Hs), interpolation=cv2.INTER_AREA)
        det_rgb, det_a = det[..., 2::-1], det[..., 3]
        rgbp = rgbp * (1 - det_a)[..., None] + det_rgb
        a = np.clip(a * (1 - det_a) + det_a, 0, 1)
        sil = np.clip(np.maximum(sil, det_a), 0, 1)
    sprite = dict(rgb=rgbp, a=a, sil=sil, anchor=(ox, oy), lantern=None, size=(Ws, Hs), T=T)
    lean = p['lean']
    if abs(lean) > 1e-4:
        M = cv2.getRotationMatrix2D((ox, oy), -math.degrees(lean), 1.0)
        for k in ('rgb', 'a', 'sil'):
            sprite[k] = cv2.warpAffine(sprite[k], M, (Ws, Hs), flags=cv2.INTER_LINEAR, borderValue=0)
    cl, sl = math.cos(lean), math.sin(lean)

    def pt(u, v):
        x0, y0 = ox + u * T, oy - v * T
        dx, dy = x0 - ox, y0 - oy
        return ox + dx * cl + dy * sl, oy - dx * sl + dy * cl
    sprite['pt'] = pt
    if len(_CACHE) > 400:
        _CACHE.clear()
    _CACHE[key] = sprite
    return sprite


if __name__ == '__main__':
    import time
    import fig as F
    import chain as CH
    t = time.time()
    light = CH.sun_light()
    pose = dict(view='front', creep=0.0, smile=0.4, soft=0.0, crown=True, wilt=0.25, feet=False, hem_y=0.0, bow=True, curl_l=0.6, curl_r=0.6,
                arm_l=(-0.285, 0.80), arm_r=(0.285, 0.46), lean=0.0, hair=(0.86, 0.66, 0.36), dress=(0.96, 0.94, 0.88), skin=(0.95, 0.80, 0.72), yaw=0.0)
    T = 520
    sp = render(T, pose, light, seed=3, ss=2)
    print('3d', round(time.time() - t, 1), 's')
    sp2 = F.render(T, {**pose}, light, seed=3, ss=2)
    canvas = np.zeros((int(T * 1.3), int(T * 2.7), 3), np.float32); canvas[:] = np.array([0.55, 0.60, 0.40], np.float32)
    for k, s_ in enumerate((sp2, sp)):
        ox, oy = s_['anchor']
        a = s_['a']; rgb = s_['rgb']
        x0 = int(T * 0.65 + k * T * 1.3 - ox); y0 = int(T * 1.20 - oy)
        h, w = a.shape
        canvas[y0:y0 + h, x0:x0 + w] = canvas[y0:y0 + h, x0:x0 + w] * (1 - a)[..., None] + rgb
    save_png(WORK + '/body3d_test.png', np.clip(canvas, 0, 1))
