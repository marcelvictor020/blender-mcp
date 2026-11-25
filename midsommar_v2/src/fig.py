"""Painted figure engine.

Each figure is built from a small skeleton (two-bone IK arms), one mask per body part, a pseudo-3D height field per part
(distance transform + blurred) so every part has volume, cloth folds baked in as a bump map, a warm key light with a cool
fill + warm ground bounce + rim, subsurface warmth on skin, ambient-occlusion where parts overlap, hair strands, a painted
face and a flower crown.  render() returns a premultiplied RGBA sprite; cast_shadow() makes the matching ground shadow.
"""
import math
import numpy as np
import cv2
import cairo

TAU = 2 * math.pi


# ============================================================================================ small helpers
class Mask:
    """supersampled A8 mask painter"""

    def __init__(self, w, h, ss=2):
        self.w, self.h, self.ss = w, h, ss
        stride = cairo.ImageSurface.format_stride_for_width(cairo.FORMAT_A8, w * ss)
        self.buf = np.zeros((h * ss, stride), np.uint8)
        self.surf = cairo.ImageSurface.create_for_data(self.buf, cairo.FORMAT_A8, w * ss, h * ss, stride)
        self.c = cairo.Context(self.surf)
        self.c.scale(ss, ss)
        self.c.set_antialias(cairo.ANTIALIAS_BEST)
        self.c.set_line_cap(cairo.LINE_CAP_ROUND)
        self.c.set_line_join(cairo.LINE_JOIN_ROUND)
        self.c.set_source_rgba(0, 0, 0, 1)

    def get(self):
        self.surf.flush()
        return cv2.resize(np.ascontiguousarray(self.buf[:, :self.w * self.ss]), (self.w, self.h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0

    # --- primitives
    def curve(self, pts, closed=True, k=0.5, fill=True, lw=None, alpha=1.0):
        c = self.c
        n = len(pts)
        c.new_path()
        c.move_to(*pts[0])
        for i in (range(n) if closed else range(n - 1)):
            p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[0]
            p1 = pts[i]
            p2 = pts[(i + 1) % n]
            p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
            c.curve_to(p1[0] + (p2[0] - p0[0]) * k / 3 * 2, p1[1] + (p2[1] - p0[1]) * k / 3 * 2,
                       p2[0] - (p3[0] - p1[0]) * k / 3 * 2, p2[1] - (p3[1] - p1[1]) * k / 3 * 2, *p2)
        if closed:
            c.close_path()
        c.set_source_rgba(0, 0, 0, alpha)
        if fill:
            c.fill()
        else:
            c.set_line_width(lw or 1.0)
            c.stroke()

    def ellipse(self, cx, cy, rx, ry, rot=0.0, alpha=1.0):
        c = self.c
        c.save()
        c.translate(cx, cy)
        c.rotate(rot)
        c.scale(max(rx, 1e-3), max(ry, 1e-3))
        c.new_path()
        c.arc(0, 0, 1, 0, TAU)
        c.restore()
        c.set_source_rgba(0, 0, 0, alpha)
        c.fill()

    def limb(self, a, b, ra, rb):
        c = self.c
        c.set_source_rgba(0, 0, 0, 1)
        c.new_path(); c.arc(a[0], a[1], ra, 0, TAU); c.fill()
        c.new_path(); c.arc(b[0], b[1], rb, 0, TAU); c.fill()
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) + 1e-9
        nx, ny = -dy / L, dx / L
        c.new_path()
        c.move_to(a[0] + nx * ra, a[1] + ny * ra); c.line_to(b[0] + nx * rb, b[1] + ny * rb)
        c.line_to(b[0] - nx * rb, b[1] - ny * rb); c.line_to(a[0] - nx * ra, a[1] - ny * ra)
        c.close_path(); c.fill()

    def stroke(self, pts, lw, alpha=1.0):
        c = self.c
        c.set_source_rgba(0, 0, 0, alpha)
        c.set_line_width(lw)
        c.new_path()
        c.move_to(*pts[0])
        if len(pts) == 4:
            c.curve_to(*pts[1], *pts[2], *pts[3])
        else:
            for p in pts[1:]:
                c.line_to(*p)
        c.stroke()


class Light:
    """key = direction TO the light in image space (x right, y down, z toward viewer)"""

    def __init__(self, key_dir=(-0.55, -0.35, 0.76), key_col=(1.0, 0.80, 0.55), key_gain=1.0,
                 amb_col=(0.40, 0.46, 0.62), amb_gain=0.55, bounce_col=(0.34, 0.27, 0.16), bounce_gain=0.30,
                 rim_dir=(0.85, -0.2, 0.0), rim_col=(0.0, 0.0, 0.0), rim_gain=0.0, sss=(0.55, 0.16, 0.10), rim_fres=0.0, fres_col=(1.0, 0.86, 0.60)):
        v = np.array(key_dir, np.float32)
        self.key = v / np.linalg.norm(v)
        r = np.array(rim_dir, np.float32)
        self.rim = r / (np.linalg.norm(r) + 1e-9)
        self.key_col, self.key_gain = np.array(key_col, np.float32), key_gain
        self.amb_col, self.amb_gain = np.array(amb_col, np.float32), amb_gain
        self.bounce_col, self.bounce_gain = np.array(bounce_col, np.float32), bounce_gain
        self.rim_col, self.rim_gain = np.array(rim_col, np.float32), rim_gain
        self.sss = np.array(sss, np.float32)
        self.rim_fres, self.fres_col = rim_fres, np.array(fres_col, np.float32)


def shade(mask, albedo, light, T, *, cap=0.05, bump=None, bump_amp=0.020, wrap=0.22, skin=False, relief=0.9, plights=None):
    """pseudo-3D shading of one part. mask (h,w) float; albedo colour tuple or (h,w,3); returns (h,w,3)"""
    m8 = (mask > 0.5).astype(np.uint8)
    dt = cv2.distanceTransform(m8, cv2.DIST_L2, 5).astype(np.float32)
    hgt = np.minimum(dt, cap * T)
    hgt = cv2.GaussianBlur(hgt, (0, 0), 0.012 * T + 0.6)
    if bump is not None:
        hgt = hgt + bump * (bump_amp * T)
    gx = cv2.Sobel(hgt, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(hgt, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    n = np.stack([-gx * relief, -gy * relief, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    ndl = (n * light.key).sum(-1)
    diff = np.clip((ndl + wrap) / (1 + wrap), 0, 1)
    alb = np.asarray(albedo, np.float32)
    if alb.ndim == 1:
        alb = alb[None, None, :]
    col = alb * (light.amb_col * light.amb_gain + light.key_col * (light.key_gain * diff)[..., None])
    col = col + alb * light.bounce_col * (light.bounce_gain * np.clip(n[..., 1], 0, 1))[..., None]
    if plights:                                                        # nearby lamps: per-pixel direction + falloff
        Hh, Ww = mask.shape
        X, Y = np.meshgrid(np.arange(Ww, dtype=np.float32), np.arange(Hh, dtype=np.float32))
        for (lx, ly, lz, pcol, pgain, prad) in plights:
            d3 = np.stack([lx - X, ly - Y, lz - hgt], -1)
            dist = np.linalg.norm(d3, axis=-1, keepdims=True) + 1e-3
            Ld = d3 / dist
            nd = np.clip(((n * Ld).sum(-1) + wrap) / (1 + wrap), 0, 1)
            att = 1.0 / (1.0 + (dist[..., 0] / prad) ** 2)
            col = col + alb * (np.asarray(pcol, np.float32) * (pgain * nd * att)[..., None])
    if light.rim_gain > 0:
        rimt = np.clip((n * light.rim).sum(-1), 0, 1) ** 2.2
        col = col + (light.rim_col * (light.rim_gain * rimt)[..., None])
    if light.rim_fres > 0:
        fr_ = np.clip(1.0 - n[..., 2], 0, 1) ** 2.2
        col = col + (light.fres_col * (light.rim_fres * fr_)[..., None]) * (0.45 + 0.55 * alb)
    if skin:
        term = np.exp(-((ndl - 0.12) / 0.20) ** 2)                       # warm red band near the terminator
        col = col + (light.sss * (0.55 * term)[..., None]) * alb
    return col


def shift(a, dx, dy):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR, borderValue=0)


def two_bone(S, Wt, L1, L2, outward):
    """elbow position for shoulder S, wrist target Wt (model coords, v up). outward = -1 left / +1 right bend"""
    dx, dy = Wt[0] - S[0], Wt[1] - S[1]
    d = min(math.hypot(dx, dy), (L1 + L2) * 0.998)
    ang = math.atan2(dy, dx)
    cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d + 1e-9)
    A = math.acos(max(-1, min(1, cosA)))
    cands = [(S[0] + L1 * math.cos(ang + s * A), S[1] + L1 * math.sin(ang + s * A)) for s in (1, -1)]
    cands.sort(key=lambda e: -outward * e[0] + 0.4 * e[1])           # prefer outward + downward elbow
    W2 = (S[0] + d * math.cos(ang), S[1] + d * math.sin(ang))
    return cands[0], W2


# ============================================================================================ the figure
DEFAULT = dict(view='front', facing=1, yaw=0.0, lean=0.0, male=False, arm_l=(-0.128, 0.486), arm_r=(0.128, 0.486),
               lantern=None, crown=True, hair=(0.46, 0.30, 0.16), dress=(0.94, 0.91, 0.83), skin=(0.91, 0.73, 0.63),
               hair_style='long', eyes_closed=False, smile=0.35, feet=True, hem_y=0.045, blush=0.35, plights=None,
               curl_l=0.40, curl_r=0.40, belt=(0.60, 0.68, 0.90), bow=True, elbow_l=None, elbow_r=None, wilt=0.0, creep=0.0, soft=0.0)


def _rot(d, a):
    c, s_ = math.cos(a), math.sin(a)
    return (d[0] * c - d[1] * s_, d[0] * s_ + d[1] * c)


def _hand(mk, P, Wr, Ee, curl, sx, T, male):
    """palm + four fingers + thumb in model coords (v up), drawn into mask mk (pixel space via P)"""
    dx, dy = Wr[0] - Ee[0], Wr[1] - Ee[1]
    L = math.hypot(dx, dy) + 1e-9
    d = (dx / L, dy / L)
    n = (-d[1], d[0])
    k = 1.12 if male else 1.0
    palm0 = Wr
    palm1 = (Wr[0] + d[0] * 0.040 * k, Wr[1] + d[1] * 0.040 * k)
    mk.limb(P(*palm0), P(*palm1), 0.0150 * T * k, 0.0138 * T * k)
    for i in range(4):
        off = (i - 1.5) * 0.0074 * k
        base = (palm1[0] + n[0] * off, palm1[1] + n[1] * off)
        lens = (0.021, 0.016, 0.012)
        ang = (i - 1.5) * 0.07 + curl * (0.55 + 0.12 * (i == 3))
        dirv = d
        pos = base
        for si, ln in enumerate(lens):
            dirv = _rot(dirv, ang * (0.5 if si == 0 else 1.0) * (1 if sx > 0 else -1) * -1)
            nxt = (pos[0] + dirv[0] * ln * k * (1.12 if i in (1, 2) else 1.0), pos[1] + dirv[1] * ln * k * (1.12 if i in (1, 2) else 1.0))
            r0 = (0.0062 - 0.0007 * si) * T * k
            mk.limb(P(*pos), P(*nxt), r0, r0 * 0.88)
            pos = nxt
    # thumb on the inner side
    tb = (Wr[0] + d[0] * 0.012 + n[0] * 0.013 * sx * -1, Wr[1] + d[1] * 0.012 + n[1] * 0.013 * sx * -1)
    td = _rot(d, 0.55 * sx * -1 * -1)
    t1 = (tb[0] + td[0] * 0.022, tb[1] + td[1] * 0.022)
    t2 = (t1[0] + _rot(td, 0.25 * sx)[0] * 0.016, t1[1] + _rot(td, 0.25 * sx)[1] * 0.016)
    mk.limb(P(*tb), P(*t1), 0.0078 * T * k, 0.0066 * T * k)
    mk.limb(P(*t1), P(*t2), 0.0066 * T * k, 0.0056 * T * k)


def render(T, pose=None, light=None, seed=0, ss=2):
    """-> dict(rgb premult (h,w,3), a (h,w), sil (h,w), anchor=(ox,oy), pt=callable(u,v)->(x,y), lantern=(x,y) or None)"""
    p = {**DEFAULT, **(pose or {})}
    L = light or Light()
    rnd = np.random.default_rng(seed)
    Ws, Hs = int(T * 1.30) | 1, int(T * 1.16)
    ox, oy = Ws / 2.0, T * 1.06
    male = p['male']
    view = p['view']
    back = (view == 'back')
    side = (view == 'side')
    fc = 1 if p['facing'] >= 0 else -1
    yaw = float(p['yaw'])
    ws = 0.62 if side else 1.0                                    # torso is narrower seen from the side
    P = lambda u, v: (ox + u * ws * T, oy - v * T)               # body
    PH = lambda u, v: (ox + u * T, oy - v * T)                   # head (as wide in profile as in front)

    shw = 0.128 if male else 0.110
    shv = 0.795 if male else 0.787
    Sl, Sr = (-shw, shv), (shw, shv)
    L1, L2 = 0.172, 0.150
    El, Wl = two_bone(Sl, p['arm_l'], L1, L2, -1)
    Er, Wr_ = two_bone(Sr, p['arm_r'], L1, L2, +1)
    if p['elbow_l'] is not None: El, Wl = tuple(p['elbow_l']), tuple(p['arm_l'])      # foreshortened: elbow given, forearm shortened by perspective
    if p['elbow_r'] is not None: Er, Wr_ = tuple(p['elbow_r']), tuple(p['arm_r'])
    arm_r0 = (0.033, 0.026) if male else (0.029, 0.023)           # upper arm radii at shoulder / elbow
    fore_r0 = (0.025, 0.017) if male else (0.022, 0.015)

    m = {}
    hem = p['hem_y']

    # --- dress / tunic -------------------------------------------------------------------------------------------
    d = Mask(Ws, Hs, ss)
    if not male:
        left = [(-0.044, 0.808), (-0.078, 0.801), (-0.104, 0.791), (-0.093, 0.748), (-0.081, 0.702), (-0.069, 0.656), (-0.063, 0.629),
                (-0.086, 0.562), (-0.114, 0.455), (-0.152, 0.334), (-0.200, 0.205), (-0.246, 0.100), (-0.270, hem + 0.014)]
        hemp = [(-0.14, hem - 0.012), (-0.05, hem - 0.001), (0.05, hem - 0.004), (0.14, hem - 0.010)]
    else:
        left = [(-0.050, 0.814), (-0.100, 0.807), (-0.130, 0.795), (-0.124, 0.742), (-0.111, 0.672), (-0.095, 0.612), (-0.100, 0.540),
                (-0.112, 0.478), (-0.126, 0.432)]
        hemp = [(-0.06, 0.424), (0.0, 0.428), (0.06, 0.424)]
    right = [(-u, v) for (u, v) in left[::-1]]
    d.curve([P(*q) for q in left + hemp + right], closed=True, k=0.5)
    # sleeves: puffed over the upper arm
    qL = (Sl[0] + 0.52 * (El[0] - Sl[0]), Sl[1] + 0.52 * (El[1] - Sl[1]))
    qR = (Sr[0] + 0.52 * (Er[0] - Sr[0]), Sr[1] + 0.52 * (Er[1] - Sr[1]))
    sl_r = (0.037, 0.043) if not male else (0.040, 0.046)
    sleeve = Mask(Ws, Hs, ss)
    sleeve.limb(P(Sl[0], Sl[1] + 0.004), P(*qL), sl_r[0] * T, sl_r[1] * T)
    sleeve.limb(P(Sr[0], Sr[1] + 0.004), P(*qR), sl_r[0] * T, sl_r[1] * T)
    m['sleeve'] = sleeve.get()
    d.limb(P(Sl[0], Sl[1] + 0.004), P(*qL), sl_r[0] * T, sl_r[1] * T)
    d.limb(P(Sr[0], Sr[1] + 0.004), P(*qR), sl_r[0] * T, sl_r[1] * T)
    if not back:                                                  # scoop neckline: chest skin shows through
        d.c.set_operator(cairo.OPERATOR_CLEAR)
        d.ellipse(*P(0, 0.821), (0.037 if not male else 0.032) * T, (0.040 if not male else 0.030) * T)
        d.c.set_operator(cairo.OPERATOR_OVER)
    m['dress'] = d.get()

    # --- trousers (male) / feet --------------------------------------------------------------------------------------
    if male:
        t = Mask(Ws, Hs, ss)
        for sx in (-1, 1):
            t.limb(P(sx * 0.050, 0.46), P(sx * 0.058, 0.040), 0.046 * T, 0.028 * T)
        m['legs'] = t.get()
    f = Mask(Ws, Hs, ss)
    if p['feet']:
        for sx in (-1, 1):
            f.ellipse(*P(sx * 0.070, 0.011), 0.029 * T, 0.0115 * T, sx * 0.10)
    m['feet'] = f.get()

    # --- arms + hands ---------------------------------------------------------------------------------------------------
    arms = {}
    for key, S, E, Wr, sx, curl in (('l', Sl, El, Wl, -1, p['curl_l']), ('r', Sr, Er, Wr_, 1, p['curl_r'])):
        a_ = Mask(Ws, Hs, ss)
        a_.limb(P(*S), P(*E), arm_r0[0] * T, arm_r0[1] * T)
        a_.limb(P(*E), P(*Wr), fore_r0[0] * T, fore_r0[1] * T)
        _hand(a_, P, Wr, E, curl if not (p['lantern'] == key) else 1.4, sx, T, male)
        arms[key] = np.clip(a_.get() * (1 - 0.0), 0, 1)
    m['arm_l'], m['arm_r'] = arms['l'], arms['r']

    # --- neck + chest ---------------------------------------------------------------------------------------------------
    nk = Mask(Ws, Hs, ss)
    nr = (0.029, 0.025) if male else (0.024, 0.020)
    nk.limb(P(0, 0.800), P(0, 0.852), nr[0] * T, nr[1] * T)
    nk.ellipse(*P(0, 0.808), 0.042 * T, 0.036 * T)
    m['neck'] = nk.get()

    # --- head -----------------------------------------------------------------------------------------------------------------
    hd = Mask(Ws, Hs, ss)
    if side:
        prof = [(0.0, 0.979), (0.040, 0.966), (0.052, 0.944), (0.053, 0.924), (0.066, 0.903), (0.052, 0.892), (0.054, 0.880), (0.050, 0.868),
                (0.038, 0.850), (0.010, 0.844), (-0.016, 0.858), (-0.050, 0.904), (-0.056, 0.940), (-0.040, 0.972)]
        hd.curve([PH(u * fc, v) for u, v in prof], closed=True, k=0.5)
    else:
        jaw = 0.0 if not male else 0.006
        hl = [(0, 0.979), (-0.030, 0.973), (-0.048, 0.950), (-0.053, 0.918), (-0.048 - jaw, 0.888), (-0.036 - jaw, 0.863), (-0.018, 0.848), (0, 0.844)]
        hr = [(-u, v) for (u, v) in hl[1:-1][::-1]]
        hd.curve([PH(*q) for q in hl + hr], closed=True, k=0.5)
    m['head'] = hd.get()
    head_c = (0.0, 0.912)

    # --- hair ---------------------------------------------------------------------------------------------------------------
    hb, hf = Mask(Ws, Hs, ss), Mask(Ws, Hs, ss)
    style = p['hair_style']
    if male or style == 'short':
        if side:
            hf.curve([PH(u * fc, v) for u, v in [(0.0, 0.992), (0.040, 0.982), (0.054, 0.958), (0.050, 0.948), (0.030, 0.952), (0.0, 0.946), (-0.040, 0.930),
                                                (-0.058, 0.930), (-0.060, 0.965), (-0.040, 0.988)]], closed=True, k=0.5)
        elif back:
            hf.ellipse(*PH(0, 0.944), 0.060 * T, 0.060 * T)
        else:
            hf.curve([PH(*q) for q in [(0, 0.996), (-0.040, 0.988), (-0.058, 0.960), (-0.058, 0.922), (-0.048, 0.936), (-0.034, 0.958), (-0.012, 0.966),
                                      (0.014, 0.962), (0.034, 0.954), (0.048, 0.936), (0.058, 0.922), (0.058, 0.960), (0.040, 0.988)]], closed=True, k=0.5)
    else:
        if back:
            hb.curve([PH(*q) for q in [(0, 0.996), (-0.050, 0.985), (-0.066, 0.935), (-0.082, 0.850), (-0.092, 0.740), (-0.082, 0.640), (-0.046, 0.588),
                                      (0.0, 0.602), (0.046, 0.588), (0.082, 0.640), (0.092, 0.740), (0.082, 0.850), (0.066, 0.935), (0.050, 0.985)]], closed=True, k=0.5)
        elif side:
            hb.curve([PH(u * fc, v) for u, v in [(0.040, 0.988), (-0.040, 0.988), (-0.064, 0.940), (-0.076, 0.860), (-0.082, 0.760), (-0.074, 0.680), (-0.040, 0.648),
                                                (-0.012, 0.700), (0.0, 0.800), (0.010, 0.880), (0.026, 0.930), (0.046, 0.952), (0.054, 0.962)]], closed=True, k=0.5)
        else:
            hb.curve([PH(*q) for q in [(0, 0.990), (-0.056, 0.972), (-0.068, 0.920), (-0.080, 0.830), (-0.087, 0.730), (-0.076, 0.650), (-0.040, 0.640),
                                      (0.0, 0.700), (0.040, 0.640), (0.076, 0.650), (0.087, 0.730), (0.080, 0.830), (0.068, 0.920), (0.056, 0.972)]], closed=True, k=0.5)
            part = 0.012 * yaw
            for sx in (-1, 1):
                hf.curve([PH(*q) for q in [(part, 0.994), (sx * 0.040, 0.986), (sx * 0.057, 0.956), (sx * 0.062, 0.912), (sx * 0.076, 0.836), (sx * 0.083, 0.756),
                                          (sx * 0.077, 0.700), (sx * 0.062, 0.690), (sx * 0.057, 0.760), (sx * 0.050, 0.840), (sx * 0.047, 0.900),
                                          (sx * 0.040, 0.940), (sx * 0.020, 0.962), (part, 0.966)]], closed=True, k=0.5)
    m['hair_b'], m['hair_f'] = hb.get(), hf.get()

    # --- cloth folds (bump map): irregular, longer + stronger toward the hem -----------------------------------------
    ridge, valley = Mask(Ws, Hs, ss), Mask(Ws, Hs, ss)
    nf = 12 if not male else 5
    ts = np.sort(rnd.uniform(-1, 1, nf)) if not male else np.linspace(-0.85, 0.85, nf)
    hem_w = 0.262 if not male else 0.118
    top_w = 0.064 if not male else 0.10
    for i, t in enumerate(ts):
        w0 = top_w * t
        wh = hem_w * t * rnd.uniform(0.92, 1.06)
        top = (w0, 0.640 if not male else 0.60)
        mid1 = (w0 * 1.35 + rnd.normal(0, 0.007), 0.50 + rnd.normal(0, 0.02))
        mid2 = (wh * 0.78 + rnd.normal(0, 0.012), 0.26 + rnd.normal(0, 0.03))
        bot = (wh, hem + 0.025)
        tgt = ridge if i % 2 == 0 else valley
        tgt.stroke([P(*top), P(*mid1), P(*mid2), P(*bot)], rnd.uniform(0.016, 0.030) * T, alpha=rnd.uniform(0.6, 1.0))
    bump = cv2.GaussianBlur(ridge.get(), (0, 0), 0.011 * T + 0.5) - cv2.GaussianBlur(valley.get(), (0, 0), 0.011 * T + 0.5)

    # --- shading -------------------------------------------------------------------------------------------------------------
    dress_col = np.array(p['dress'], np.float32)
    skin_c = np.array(p['skin'], np.float32)
    hair_c = np.array(p['hair'], np.float32)
    pl = []
    for (u, v, z, col, gain, rad) in (p['plights'] or []):          # lamps given in model units
        x_, y_ = P(u, v)
        pl.append((x_, y_, z * T, col, gain, rad * T))
    arm_vis_l = np.clip(m['arm_l'] * (1 - m['sleeve']), 0, 1)
    arm_vis_r = np.clip(m['arm_r'] * (1 - m['sleeve']), 0, 1)
    arms_u = np.clip(arm_vis_l + arm_vis_r, 0, 1)
    ao_arm = cv2.GaussianBlur(shift(arms_u, 0.010 * T, 0.016 * T), (0, 0), 0.014 * T + 0.5)
    ao_head = cv2.GaussianBlur(shift(m['head'], 0.004 * T, 0.028 * T), (0, 0), 0.016 * T + 0.5)
    ao_hair = cv2.GaussianBlur(shift(np.clip(m['hair_f'] + m['hair_b'], 0, 1), 0.0, 0.010 * T), (0, 0), 0.012 * T + 0.5)

    layers = []

    def add(mask, col):
        layers.append((col, mask))

    if m['hair_b'].max() > 0:
        add(m['hair_b'], shade(m['hair_b'], hair_c, L, T, cap=0.045, relief=0.8, plights=pl) * 0.82)
    if male:
        add(m['legs'], shade(m['legs'], dress_col * 0.97, L, T, cap=0.03, plights=pl))
    add(m['feet'], shade(m['feet'], skin_c * 0.86, L, T, cap=0.02, skin=True, plights=pl) * 0.82)
    sft = float(p.get('soft', 0.0))
    ncol = shade(m['neck'], skin_c, L, T, cap=0.025, skin=True, plights=pl) * (1 - (0.50 - 0.30 * sft) * np.clip(ao_head, 0, 1))[..., None]
    ncol = ncol * (1 - 0.30 * np.clip(ao_hair, 0, 1))[..., None]
    ncol = np.clip(ncol * (1 + 0.30 * sft), 0, 1.3)
    add(m['neck'], ncol)
    dcol = shade(m['dress'], dress_col, L, T, cap=0.06, bump=bump, bump_amp=0.026, wrap=0.30, plights=pl)
    dcol = dcol * (1 - 0.40 * np.clip(ao_arm, 0, 1))[..., None]
    yy = np.arange(Hs, dtype=np.float32)[:, None]
    dcol = dcol * (1 - 0.20 * smooth(yy, oy - 0.30 * T, oy - 0.02 * T))[..., None]
    dcol = dcol * (1 - 0.25 * np.clip(ao_head, 0, 1) * (np.arange(Hs)[:, None] < oy - 0.74 * T))[..., None]
    add(m['dress'], dcol)
    for k, vis in (('l', arm_vis_l), ('r', arm_vis_r)):
        add(vis, shade(np.clip(m['arm_' + k], 0, 1), skin_c, L, T, cap=0.022, skin=True, plights=pl))
    add(m['head'], shade(m['head'], skin_c, L, T, cap=0.058, skin=True, wrap=0.20 + 0.28 * sft, relief=1.25 - 0.45 * sft, plights=pl))
    if m['hair_f'].max() > 0:
        add(m['hair_f'], shade(m['hair_f'], hair_c, L, T, cap=0.030, relief=0.9, plights=pl) * 1.05)

    rgb = np.zeros((Hs, Ws, 3), np.float32)
    a = np.zeros((Hs, Ws), np.float32)
    for col, mk in layers:
        rgb = rgb * (1 - mk)[..., None] + col * mk[..., None]
        a = a * (1 - mk) + mk
    sil = np.clip(a, 0, 1)

    # --- painted detail ---------------------------------------------------------------------------------------------------
    S = 3
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, Ws * S, Hs * S)
    c = cairo.Context(surf)
    c.scale(S, S)
    c.set_antialias(cairo.ANTIALIAS_BEST)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    hx, hy = PH(*head_c)
    hh = 0.135 * T

    def fxy(uu, vv):
        return hx + uu * hh + yaw * 0.10 * hh, hy - vv * hh

    excl = np.clip(m['head'] + m['neck'] + m['dress'] + arm_vis_l + arm_vis_r, 0, 1)
    if side:
        sc_ = [hair_c * 0.62, hair_c * 0.85, hair_c * 1.12, np.minimum(hair_c * 1.45 + 0.05, 1)]
        _strands(c, np.clip(m['hair_b'] + m['hair_f'], 0, 1) * (1 - 0.0 * excl), PH, T, rnd, sc_, front=False, male=male, n=52)
        _face_side(c, hx, hy, hh, fc, p, rnd)
    elif back:
        sc_ = [hair_c * 0.55, hair_c * 0.80, hair_c * 1.10, np.minimum(hair_c * 1.5 + 0.06, 1)]
        _strands(c, np.clip(m['hair_b'] + m['hair_f'], 0, 1) * (1 - np.clip(m['dress'] + arm_vis_l + arm_vis_r, 0, 1)), PH, T, rnd, sc_,
                 front=False, male=male or style == 'short', n=80)
    else:
        sc_ = [hair_c * 0.62, hair_c * 0.85, hair_c * 1.12, np.minimum(hair_c * 1.45 + 0.05, 1)]
        _strands(c, m['hair_f'], PH, T, rnd, sc_, front=True, male=male or style == 'short', n=34)
        _face(c, fxy, hh, p, L, rnd, male)
        if m['hair_b'].max() > 0:
            _strands(c, m['hair_b'] * (1 - excl), PH, T, rnd, [hair_c * 0.5, hair_c * 0.72, hair_c * 0.95], front=False, male=False, n=26)
    if not male:
        _fold_lines(c, P, T, hem, rnd, male, L, ts)
        # waist ribbon with a bow
        bc = p['belt']
        c.set_source_rgba(bc[0], bc[1], bc[2], 0.85)
        c.set_line_width(0.0105 * T)
        c.new_path(); c.move_to(*P(-0.066, 0.640)); c.curve_to(*P(-0.03, 0.628), *P(0.03, 0.628), *P(0.066, 0.640)); c.stroke()
        c.set_source_rgba(1, 1, 1, 0.35); c.set_line_width(0.0035 * T)
        c.new_path(); c.move_to(*P(-0.066, 0.644)); c.curve_to(*P(-0.03, 0.632), *P(0.03, 0.632), *P(0.066, 0.644)); c.stroke()
        if p['bow'] and not side:
            bx, by = P(0.030 if back else 0.0, 0.634)
            for sx in (-1, 1):
                c.set_source_rgba(bc[0] * 0.92, bc[1] * 0.92, bc[2] * 0.95, 0.95)
                c.new_path(); c.save(); c.translate(bx + sx * 0.016 * T, by); c.rotate(sx * -0.4); c.scale(0.018 * T, 0.009 * T); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
                c.set_line_width(0.006 * T)
                c.new_path(); c.move_to(bx, by); c.curve_to(bx + sx * 0.01 * T, by + 0.06 * T, bx + sx * 0.02 * T, by + 0.12 * T, bx + sx * 0.03 * T, by + 0.18 * T); c.stroke()
        for sx in (-1, 1):                                              # elastic cuffs on the puffed sleeves
            Q = qL if sx < 0 else qR
            Sx, Ex = (Sl, El) if sx < 0 else (Sr, Er)
            ang = math.atan2(-(Ex[1] - Sx[1]), Ex[0] - Sx[0])
            cx_, cy_ = P(*Q)
            c.set_source_rgba(0.40, 0.42, 0.58, 0.40)
            c.set_line_width(0.0065 * T)
            c.new_path(); c.save(); c.translate(cx_, cy_); c.rotate(ang + math.pi / 2); c.scale(0.044 * T, 0.011 * T); c.arc(0, 0, 1, 0.1, math.pi - 0.1); c.restore(); c.stroke()
    if p['crown']:
        _crown(c, PH, T, rnd, back, yaw, head_c, side, fc, p['wilt'])
    lant = None
    if p['lantern']:
        wr = Wr_ if p['lantern'] == 'r' else Wl
        lant = P(wr[0] + 0.004 * (1 if p['lantern'] == 'r' else -1), wr[1] - 0.052)
        _lantern(c, lant, T)
    surf.flush()
    det = np.frombuffer(surf.get_data(), np.uint8).reshape(Hs * S, Ws * S, 4).astype(np.float32) / 255.0
    det = cv2.resize(det, (Ws, Hs), interpolation=cv2.INTER_AREA)
    det_rgb, det_a = det[..., 2::-1], det[..., 3]
    rgb = rgb * (1 - det_a)[..., None] + det_rgb
    a = np.clip(a * (1 - det_a) + det_a, 0, 1)
    sil = np.clip(np.maximum(sil, det_a), 0, 1)

    out = dict(rgb=rgb, a=a, sil=sil, anchor=(ox, oy), lantern=lant, size=(Ws, Hs))
    lean = p['lean']
    if abs(lean) > 1e-4:
        M = cv2.getRotationMatrix2D((ox, oy), -math.degrees(lean), 1.0)
        for k in ('rgb', 'a', 'sil'):
            out[k] = cv2.warpAffine(out[k], M, (Ws, Hs), flags=cv2.INTER_LINEAR, borderValue=0)
        if lant is not None:
            out['lantern'] = tuple(M @ np.array([lant[0], lant[1], 1.0]))
    cl, sl = math.cos(lean), math.sin(lean)

    def pt(u, v):
        x0, y0 = P(u, v)
        dx, dy = x0 - ox, y0 - oy
        return ox + dx * cl + dy * sl, oy - dx * sl + dy * cl
    out['pt'] = pt
    out['T'] = T
    return out


def smooth(x, e0, e1):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


# ============================================================================================ painted details
def _strands(c, mask, P, T, rnd, cols, front, male, n):
    """thin curved hair strokes inside a mask (rejection-sampled), flowing downward with a slight wave"""
    ys, xs = np.nonzero(mask > 0.6)
    if len(ys) < 20:
        return
    ymin = ys.min()
    for i in range(n):
        j = rnd.integers(len(ys))
        x0, y0 = xs[j], ys[j]
        ln = rnd.uniform(0.03 if male else 0.05, 0.05 if male else 0.16) * T
        sway = rnd.normal(0, 0.012) * T
        col = cols[rnd.integers(len(cols))]
        c.set_source_rgba(float(col[0]), float(col[1]), float(col[2]), rnd.uniform(0.35, 0.75))
        c.set_line_width(rnd.uniform(0.0030, 0.0055) * T)
        c.new_path()
        c.move_to(x0, y0)
        # follow the mask downwards while it stays inside
        x, y = float(x0), float(y0)
        steps = max(3, int(ln / (0.012 * T)))
        c.move_to(x, y)
        for s in range(steps):
            ny = y + 0.012 * T
            nx = x + sway / steps + 0.004 * T * math.sin(s * 0.9 + i)
            ix, iy = int(round(nx)), int(round(ny))
            if iy >= mask.shape[0] or ix < 0 or ix >= mask.shape[1] or mask[iy, ix] < 0.5:
                break
            c.line_to(nx, ny)
            x, y = nx, ny
        c.stroke()


def _fold_lines(c, P, T, hem, rnd, male, L, ts):
    for i, t in enumerate(ts):
        w0 = 0.056 * t
        wh = 0.238 * t + rnd.normal(0, 0.006)
        c.set_source_rgba(0.34, 0.36, 0.52, 0.17)
        c.set_line_width(rnd.uniform(0.0035, 0.0060) * T)
        c.new_path()
        c.move_to(*P(w0, 0.60)); c.curve_to(*P(w0 * 1.4, 0.46), *P(wh * 0.78, 0.26), *P(wh, hem + 0.025)); c.stroke()
        c.set_source_rgba(1.0, 0.95, 0.82, 0.13)
        c.set_line_width(0.0028 * T)
        c.new_path()
        c.move_to(*P(w0 + 0.008, 0.60)); c.curve_to(*P(w0 * 1.4 + 0.008, 0.46), *P(wh * 0.78 + 0.010, 0.26), *P(wh + 0.012, hem + 0.025)); c.stroke()
    # gathers under the waistband
    c.set_source_rgba(0.34, 0.36, 0.52, 0.14)
    c.set_line_width(0.0030 * T)
    for k in range(-4, 5):
        c.new_path(); c.move_to(*P(k * 0.0135, 0.626)); c.curve_to(*P(k * 0.0150, 0.60), *P(k * 0.0175, 0.585), *P(k * 0.0195 + 0.002, 0.56)); c.stroke()
    # hem: soft wavy shadow line
    c.set_source_rgba(0.30, 0.30, 0.42, 0.22)
    c.set_line_width(0.0058 * T)
    c.new_path()
    c.move_to(*P(-0.262, hem + 0.004))
    for k in range(1, 13):
        u = -0.262 + k * 0.524 / 12
        c.line_to(*P(u, hem - 0.012 + 0.007 * math.sin(k * 1.9) + 0.024 * (1 - abs(u) / 0.262)))
    c.stroke()


def _face_side(c, hx, hy, hh, fc, p, rnd):
    """profile face (facing +x * fc): eye, brow, nostril, lips, cheek"""
    hair_c = np.array(p['hair'], np.float32)
    fxp = lambda u, v: (hx + fc * u * hh, hy - v * hh)
    x, y = fxp(0.12, -0.02)
    g = cairo.RadialGradient(x, y, 0, x, y, 0.20 * hh)
    g.add_color_stop_rgba(0, 0.88, 0.40, 0.38, p['blush'] * 0.5); g.add_color_stop_rgba(1, 0.88, 0.40, 0.38, 0)
    c.set_source(g); c.new_path(); c.arc(x, y, 0.20 * hh, 0, TAU); c.fill()
    ex, ey = fxp(0.27, 0.06)
    w_, h_ = 0.12 * hh, 0.055 * hh
    c.new_path(); c.move_to(ex - w_ * 0.5 * fc, ey + h_ * 0.1)
    c.curve_to(ex - w_ * 0.2 * fc, ey - h_ * 0.9, ex + w_ * 0.2 * fc, ey - h_ * 0.9, ex + w_ * 0.5 * fc, ey + h_ * 0.1)
    c.curve_to(ex + w_ * 0.2 * fc, ey + h_ * 0.7, ex - w_ * 0.2 * fc, ey + h_ * 0.7, ex - w_ * 0.5 * fc, ey + h_ * 0.1)
    c.set_source_rgba(0.97, 0.93, 0.90, 1); c.fill()
    c.set_source_rgba(0.14, 0.09, 0.06, 1); c.new_path(); c.arc(ex + 0.016 * hh * fc, ey, 0.046 * hh, 0, TAU); c.fill()
    c.set_source_rgba(1, 1, 1, 0.9); c.new_path(); c.arc(ex + 0.030 * hh * fc, ey - 0.016 * hh, 0.011 * hh, 0, TAU); c.fill()
    c.set_source_rgba(0.12, 0.07, 0.06, 0.95); c.set_line_width(0.024 * hh)
    c.new_path(); c.move_to(ex - w_ * 0.52 * fc, ey + h_ * 0.05); c.curve_to(ex - w_ * 0.2 * fc, ey - h_ * 1.1, ex + w_ * 0.2 * fc, ey - h_ * 1.1, ex + w_ * 0.52 * fc, ey + h_ * 0.05); c.stroke()
    bc = hair_c * 0.55
    c.set_source_rgba(float(bc[0]), float(bc[1]), float(bc[2]), 0.62); c.set_line_width(0.030 * hh)
    bx, by = fxp(0.26, 0.17)
    c.new_path(); c.move_to(bx - 0.10 * hh * fc, by + 0.015 * hh); c.curve_to(bx - 0.04 * hh * fc, by - 0.04 * hh, bx + 0.05 * hh * fc, by - 0.045 * hh, bx + 0.11 * hh * fc, by + 0.01 * hh); c.stroke()
    nx, ny = fxp(0.50, -0.12)
    c.set_source_rgba(0.40, 0.20, 0.18, 0.60); c.new_path(); c.save(); c.translate(nx - 0.05 * hh * fc, ny); c.scale(0.028 * hh, 0.020 * hh); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    mx, my = fxp(0.37, -0.285)
    c.set_source_rgba(0.55, 0.20, 0.20, 0.95); c.set_line_width(0.026 * hh)
    c.new_path(); c.move_to(mx + 0.02 * hh * fc, my); c.curve_to(mx - 0.06 * hh * fc, my + 0.02 * hh, mx - 0.12 * hh * fc, my + 0.015 * hh, mx - 0.16 * hh * fc, my - 0.015 * hh); c.stroke()
    c.set_source_rgba(0.80, 0.38, 0.38, 0.8); c.new_path(); c.save(); c.translate(mx - 0.02 * hh * fc, my + 0.045 * hh); c.scale(0.075 * hh, 0.030 * hh); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


def _face(c, fx, hh, p, L, rnd, male):
    yaw = float(p['yaw'])
    s = 1.0
    hair_c = np.array(p['hair'], np.float32)
    # cheeks + soft planes
    for sx in (-1, 1):
        x, y = fx(sx * 0.27, -0.12)
        g = cairo.RadialGradient(x, y, 0, x, y, 0.20 * hh)
        g.add_color_stop_rgba(0, 0.88, 0.40, 0.38, p['blush'] * 0.55)
        g.add_color_stop_rgba(1, 0.88, 0.40, 0.38, 0)
        c.set_source(g); c.new_path(); c.arc(x, y, 0.20 * hh, 0, TAU); c.fill()
    # shadow under the brow ridge / eye sockets
    for sx in (-1, 1):
        x, y = fx(sx * 0.215, 0.015)
        g = cairo.RadialGradient(x, y, 0, x, y, 0.17 * hh)
        g.add_color_stop_rgba(0, 0.52, 0.30, 0.30, 0.20)
        g.add_color_stop_rgba(1, 0.52, 0.30, 0.30, 0)
        c.set_source(g); c.new_path(); c.arc(x, y, 0.17 * hh, 0, TAU); c.fill()
    # nose: shaded side + tip highlight + nostrils
    nx0, ny0 = fx(0.0, 0.06)
    nx1, ny1 = fx(0.0, -0.14)
    side = -1 if L.key[0] > 0 else 1                                        # shadow falls away from the light
    c.set_source_rgba(0.46, 0.26, 0.24, 0.30)
    c.set_line_width(0.045 * hh)
    c.new_path(); c.move_to(nx0 + side * 0.040 * hh, ny0); c.curve_to(nx0 + side * 0.070 * hh, ny0 + 0.08 * hh, nx1 + side * 0.075 * hh, ny1 - 0.02 * hh, nx1 + side * 0.040 * hh, ny1); c.stroke()
    c.set_source_rgba(1.0, 0.92, 0.82, 0.30)
    c.set_line_width(0.030 * hh)
    c.new_path(); c.move_to(nx0 - side * 0.01 * hh, ny0 + 0.02 * hh); c.line_to(nx1 - side * 0.01 * hh, ny1 - 0.03 * hh); c.stroke()
    c.set_source_rgba(0.34, 0.16, 0.16, 0.55)
    for sx in (-1, 1):
        x, y = fx(sx * 0.060, -0.145)
        c.new_path(); c.save(); c.translate(x, y); c.scale(0.030 * hh, 0.020 * hh); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    # eyes
    cr = float(p.get('creep', 0.0))
    for sx in (-1, 1):
        ex, ey = fx(sx * 0.215, 0.028)
        w_, h_ = (0.150 + 0.020 * cr) * hh, (0.060 + 0.026 * cr) * hh
        shape = lambda: _almond(c, ex, ey, w_, h_, sx)
        if not p['eyes_closed']:
            shape(); c.set_source_rgba(0.97, 0.93, 0.90, 1); c.fill_preserve()
            c.save(); c.clip()
            ix = ex - sx * 0.006 * hh + yaw * 0.014 * hh
            ir = (0.056 - 0.008 * cr) * hh
            g = cairo.RadialGradient(ix, ey, 0, ix, ey, ir + 0.004 * hh)
            if cr > 0:                                                                  # a pale, glassy iris that does not blink: grey-green with a dark limbal ring
                g.add_color_stop_rgba(0, 0.12, 0.13, 0.10, 1); g.add_color_stop_rgba(0.35, 0.50, 0.58, 0.46, 1); g.add_color_stop_rgba(0.82, 0.34, 0.42, 0.34, 1); g.add_color_stop_rgba(1, 0.10, 0.12, 0.10, 1)
            else:
                g.add_color_stop_rgba(0, 0.18, 0.12, 0.08, 1); g.add_color_stop_rgba(0.55, 0.30, 0.22, 0.12, 1); g.add_color_stop_rgba(1, 0.12, 0.10, 0.08, 1)
            c.set_source(g); c.new_path(); c.arc(ix, ey, ir, 0, TAU); c.fill()
            c.set_source_rgba(0.04, 0.03, 0.03, 1); c.new_path(); c.arc(ix, ey, (0.024 - 0.010 * cr) * hh, 0, TAU); c.fill()
            c.set_source_rgba(1, 1, 1, 0.95); c.new_path(); c.arc(ix + 0.020 * hh, ey - 0.020 * hh, 0.012 * hh, 0, TAU); c.fill()
            if cr > 0:
                c.set_source_rgba(1, 1, 1, 0.55); c.new_path(); c.arc(ix - 0.018 * hh, ey + 0.016 * hh, 0.006 * hh, 0, TAU); c.fill()
            c.restore()
            c.set_source_rgba(0.42, 0.26, 0.24, 0.45)                           # upper-lid shadow
            c.save(); shape(); c.clip()
            c.set_line_width(0.05 * hh); c.new_path(); c.move_to(ex - w_ * 0.5, ey - h_ * 0.5); c.curve_to(ex - w_ * 0.2, ey - h_ * 0.95, ex + w_ * 0.2, ey - h_ * 0.95, ex + w_ * 0.5, ey - h_ * 0.5); c.stroke()
            c.restore()
        # lid line + lashes
        c.set_source_rgba(0.12, 0.07, 0.06, 0.95)
        c.set_line_width(0.026 * hh)
        c.new_path()
        if p['eyes_closed']:
            c.move_to(ex - w_ * 0.5, ey); c.curve_to(ex - w_ * 0.2, ey + h_ * 0.9, ex + w_ * 0.2, ey + h_ * 0.9, ex + w_ * 0.5, ey)
        else:
            c.move_to(ex - w_ * 0.52, ey + h_ * 0.05); c.curve_to(ex - w_ * 0.22, ey - h_ * 1.15, ex + w_ * 0.22, ey - h_ * 1.15, ex + w_ * 0.52, ey + h_ * 0.05)
        c.stroke()
        c.set_line_width(0.014 * hh)                                           # outer lashes
        for k in range(3):
            c.new_path(); c.move_to(ex + sx * w_ * (0.40 + 0.06 * k), ey - h_ * (0.70 - 0.12 * k)); c.line_to(ex + sx * w_ * (0.56 + 0.07 * k), ey - h_ * (1.05 - 0.10 * k)); c.stroke()
        c.set_source_rgba(0.45, 0.28, 0.26, 0.35 + 0.25 * cr)                  # lower lid (a visible rim of white beneath the iris when she stares)
        c.set_line_width(0.012 * hh)
        c.new_path(); c.move_to(ex - w_ * 0.4, ey + h_ * 0.55); c.curve_to(ex - w_ * 0.1, ey + h_ * 0.9, ex + w_ * 0.1, ey + h_ * 0.9, ex + w_ * 0.4, ey + h_ * 0.55); c.stroke()
        # brow (raised, one a hair higher than the other when she is not quite right)
        bx, by = fx(sx * 0.225, 0.150 + (0.030 + (0.012 if sx > 0 else 0.0)) * cr)
        bc = hair_c * 0.55
        c.set_source_rgba(float(bc[0]), float(bc[1]), float(bc[2]), 0.85 if male else 0.62)
        c.set_line_width((0.050 if male else 0.032) * hh)
        c.new_path(); c.move_to(bx - sx * 0.12 * hh * -1, by + 0.02 * hh)
        c.move_to(bx + sx * -0.115 * hh * -1 * -1, by + 0.02 * hh)
        c.curve_to(bx - sx * 0.06 * hh, by - (0.035 + 0.020 * cr) * hh, bx + sx * 0.06 * hh, by - (0.050 + 0.025 * cr) * hh, bx + sx * 0.130 * hh, by + 0.012 * hh); c.stroke()
    # mouth
    mx, my = fx(0.0, -0.285)
    sm = p['smile']
    if cr > 0.01:
        # the grin: far too wide, perfectly even, corners pulled up into the cheeks, a bar of identical teeth, nothing moving - the eyes do not join in
        mw = (0.17 + 0.145 * cr) * hh
        lift = (0.060 + 0.045 * cr) * hh
        for sx in (-1, 1):                                                                  # creases from nose to the corners, apples of the cheeks
            c.set_source_rgba(0.42, 0.22, 0.20, 0.34 * cr); c.set_line_width(0.016 * hh)
            c.new_path(); c.move_to(*fx(sx * 0.105, -0.165)); c.curve_to(*fx(sx * 0.215, -0.200), *fx(sx * 0.300, -0.240), *fx(sx * 0.335, -0.292 + 0.05 * cr)); c.stroke()
            gx_, gy_ = fx(sx * 0.255, -0.045)
            g = cairo.RadialGradient(gx_, gy_, 0, gx_, gy_, 0.13 * hh); g.add_color_stop_rgba(0, 1.0, 0.90, 0.80, 0.30 * cr); g.add_color_stop_rgba(1, 1.0, 0.90, 0.80, 0)
            c.set_source(g); c.new_path(); c.arc(gx_, gy_, 0.13 * hh, 0, TAU); c.fill()
        up = lambda t: (mx + (t * 2 - 1) * mw, my - lift * (1 - (2 * t - 1) ** 2) * -1 - lift * (2 * t - 1) ** 2 * 0.0)
        # upper lip curve (smile: ends up, centre down) and lower lip curve
        c.new_path(); c.move_to(mx - mw, my - lift)
        c.curve_to(mx - mw * 0.55, my + 0.040 * hh, mx + mw * 0.55, my + 0.040 * hh, mx + mw, my - lift)
        c.curve_to(mx + mw * 0.55, my + 0.115 * hh * (0.6 + 0.4 * cr), mx - mw * 0.55, my + 0.115 * hh * (0.6 + 0.4 * cr), mx - mw, my - lift)
        c.close_path()
        c.save(); c.clip_preserve()
        c.set_source_rgba(0.20, 0.06, 0.07, 1); c.paint()                                   # the dark of the mouth
        c.set_source_rgba(0.97, 0.95, 0.90, 1)                                              # teeth: one white bar
        c.new_path(); c.move_to(mx - mw * 0.93, my - lift * 0.82)
        c.curve_to(mx - mw * 0.55, my + 0.044 * hh, mx + mw * 0.55, my + 0.044 * hh, mx + mw * 0.93, my - lift * 0.82)
        c.line_to(mx + mw * 0.90, my - lift * 0.82 + 0.052 * hh)
        c.curve_to(mx + mw * 0.55, my + 0.092 * hh, mx - mw * 0.55, my + 0.092 * hh, mx - mw * 0.90, my - lift * 0.82 + 0.052 * hh)
        c.close_path(); c.fill()
        c.set_source_rgba(0.55, 0.50, 0.46, 0.50); c.set_line_width(0.006 * hh)
        for k in range(-5, 6):
            tx_ = mx + k * mw * 0.165
            c.new_path(); c.move_to(tx_, my + 0.040 * hh - lift * 0.3 * (abs(k) / 5.0) ** 2 * 0 + 0.0); c.line_to(tx_, my + 0.092 * hh); c.stroke()
        c.restore()
        c.set_source_rgba(0.62, 0.22, 0.24, 1); c.set_line_width(0.020 * hh)                    # thin lips
        c.new_path(); c.move_to(mx - mw, my - lift); c.curve_to(mx - mw * 0.55, my + 0.040 * hh, mx + mw * 0.55, my + 0.040 * hh, mx + mw, my - lift); c.stroke()
        c.set_source_rgba(0.72, 0.30, 0.30, 0.95); c.set_line_width(0.024 * hh)
        c.new_path(); c.move_to(mx - mw * 0.97, my - lift + 0.004 * hh); c.curve_to(mx - mw * 0.55, my + 0.115 * hh * (0.6 + 0.4 * cr), mx + mw * 0.55, my + 0.115 * hh * (0.6 + 0.4 * cr), mx + mw * 0.97, my - lift + 0.004 * hh); c.stroke()
        c.set_source_rgba(1, 0.92, 0.88, 0.35); c.set_line_width(0.010 * hh)
        c.new_path(); c.move_to(mx - mw * 0.30, my + 0.122 * hh * (0.6 + 0.4 * cr)); c.line_to(mx + mw * 0.30, my + 0.122 * hh * (0.6 + 0.4 * cr)); c.stroke()
        for sx in (-1, 1):                                                                  # dimples at the corners
            c.set_source_rgba(0.38, 0.18, 0.16, 0.5); c.set_line_width(0.014 * hh)
            c.new_path(); c.move_to(mx + sx * (mw + 0.030 * hh), my - lift - 0.030 * hh); c.curve_to(mx + sx * (mw + 0.050 * hh), my - lift, mx + sx * (mw + 0.045 * hh), my - lift + 0.035 * hh, mx + sx * (mw + 0.020 * hh), my - lift + 0.050 * hh); c.stroke()
        c.set_source_rgba(0.46, 0.26, 0.24, 0.25)
        c.set_line_width(0.030 * hh)
        c.new_path(); c.move_to(mx, my - 0.07 * hh); c.line_to(mx, my - 0.015 * hh); c.stroke()
        return
    mw = 0.17 * hh
    c.set_source_rgba(0.55, 0.20, 0.20, 1)
    c.set_line_width(0.026 * hh)
    c.new_path(); c.move_to(mx - mw, my - sm * 0.015 * hh); c.curve_to(mx - mw * 0.4, my + 0.02 * hh + sm * 0.04 * hh, mx + mw * 0.4, my + 0.02 * hh + sm * 0.04 * hh, mx + mw, my - sm * 0.015 * hh); c.stroke()
    c.set_source_rgba(0.80, 0.38, 0.38, 0.85)                                  # lower lip
    c.new_path(); c.move_to(mx - mw * 0.62, my + 0.012 * hh)
    c.curve_to(mx - mw * 0.3, my + 0.075 * hh, mx + mw * 0.3, my + 0.075 * hh, mx + mw * 0.62, my + 0.012 * hh)
    c.curve_to(mx + mw * 0.3, my + 0.040 * hh, mx - mw * 0.3, my + 0.040 * hh, mx - mw * 0.62, my + 0.012 * hh); c.fill()
    c.set_source_rgba(1, 0.92, 0.88, 0.40)
    c.set_line_width(0.012 * hh)
    c.new_path(); c.move_to(mx - mw * 0.25, my + 0.050 * hh); c.line_to(mx + mw * 0.25, my + 0.050 * hh); c.stroke()
    c.set_source_rgba(0.46, 0.26, 0.24, 0.25)                                  # philtrum + chin shade
    c.set_line_width(0.030 * hh)
    c.new_path(); c.move_to(mx, my - 0.07 * hh); c.line_to(mx, my - 0.015 * hh); c.stroke()


def _almond(c, x, y, w, h, sx):
    c.new_path()
    c.move_to(x - w * 0.5, y + h * 0.1)
    c.curve_to(x - w * 0.22, y - h * 0.95, x + w * 0.22, y - h * 0.95, x + w * 0.5, y + h * 0.1)
    c.curve_to(x + w * 0.22, y + h * 0.80, x - w * 0.22, y + h * 0.80, x - w * 0.5, y + h * 0.1)
    c.close_path()


def _crown(c, P, T, rnd, back, yaw, head_c, side=False, fc=1, wilt=0.0):
    """ring of small flowers + leaves around the head, a few ribbons trailing"""
    cx, cy = P(head_c[0] + 0.0, 0.962)
    rx, ry = (0.056 if not side else 0.045) * T, 0.016 * T
    n = 15
    pal = [(0.97, 0.95, 0.90), (0.70, 0.78, 0.96), (0.98, 0.84, 0.30), (0.96, 0.78, 0.80), (0.97, 0.95, 0.90), (0.88, 0.92, 1.0)]
    order = []
    for i in range(n):
        th = TAU * i / n
        front = math.sin(th) > -0.05 if not back else math.sin(th) < 0.05
        order.append((th, front))
    for th, front in order:
        if not front:
            continue
        x = cx + rx * math.cos(th)
        y = cy + ry * math.sin(th) * (1 if not back else -1) - 0.004 * T
        c.set_source_rgba(0.22, 0.34, 0.14, 0.95)
        c.save(); c.translate(x, y); c.rotate(th + math.pi / 2); c.scale(0.018 * T, 0.0075 * T); c.new_path(); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    for i, (th, front) in enumerate(order):
        if not front:
            continue
        x = cx + rx * math.cos(th)
        y = cy + ry * math.sin(th) * (1 if not back else -1) - 0.006 * T
        col = pal[i % len(pal)]
        if wilt > 0:
            dead = (0.62, 0.52, 0.34)
            col = tuple(col[k] * (1 - 0.75 * wilt) + dead[k] * 0.75 * wilt for k in range(3))
            y += 0.006 * T * wilt * (1 + (i % 3))
        r = (0.0125 + 0.004 * rnd.random()) * T * (1 - 0.18 * wilt)
        for k in range(5):
            a = TAU * k / 5 + i
            c.set_source_rgba(col[0] * 0.80, col[1] * 0.80, col[2] * 0.82, 1)
            c.new_path(); c.arc(x + math.cos(a) * r * 0.62 + 0.002 * T, y + math.sin(a) * r * 0.62 + 0.003 * T, r * 0.60, 0, TAU); c.fill()
        for k in range(5):
            a = TAU * k / 5 + i
            c.set_source_rgba(*col, 1)
            c.new_path(); c.arc(x + math.cos(a) * r * 0.58, y + math.sin(a) * r * 0.58, r * 0.56, 0, TAU); c.fill()
        c.set_source_rgba(0.96, 0.70, 0.16, 1)
        c.new_path(); c.arc(x, y, r * 0.30, 0, TAU); c.fill()
    if wilt > 0:                                                         # a few petals already falling
        for k in range(int(3 + 4 * wilt)):
            px, py = cx + rnd.normal(0, rx * 0.9), cy + rnd.uniform(0.02, 0.30) * T
            c.set_source_rgba(0.88, 0.80, 0.66, 0.75); c.new_path(); c.save(); c.translate(px, py); c.rotate(rnd.uniform(0, 6)); c.scale(0.012 * T, 0.007 * T); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()
    # trailing ribbons
    for sx in (-1, 1):
        c.set_source_rgba(0.80, 0.84, 0.95, 0.75)
        c.set_line_width(0.006 * T)
        c.new_path(); x0, y0 = cx + sx * rx * 0.95, cy + ry * 0.5
        c.move_to(x0, y0); c.curve_to(x0 + sx * 0.02 * T, y0 + 0.08 * T, x0 + sx * 0.012 * T, y0 + 0.16 * T, x0 + sx * 0.03 * T, y0 + 0.24 * T); c.stroke()


def _lantern(c, pos, T):
    x, y = pos
    s = 0.034 * T
    c.set_source_rgba(0.07, 0.05, 0.04, 1)
    c.set_line_width(0.003 * T)
    c.new_path(); c.arc(x, y - s * 1.55, s * 0.30, 0, TAU); c.stroke()                  # carrying ring
    c.new_path(); c.move_to(x - s * 0.70, y - s * 1.05); c.line_to(x - s * 0.40, y - s * 1.40); c.line_to(x + s * 0.40, y - s * 1.40); c.line_to(x + s * 0.70, y - s * 1.05); c.close_path(); c.fill()
    g = cairo.RadialGradient(x, y - s * 0.1, 0, x, y - s * 0.1, s * 1.1)
    g.add_color_stop_rgba(0, 1.0, 0.98, 0.84, 1); g.add_color_stop_rgba(0.45, 1.0, 0.80, 0.38, 1); g.add_color_stop_rgba(1, 0.92, 0.50, 0.12, 1)
    c.set_source(g)
    c.new_path(); c.move_to(x - s * 0.70, y - s * 1.05); c.line_to(x + s * 0.70, y - s * 1.05); c.line_to(x + s * 0.58, y + s * 0.95); c.line_to(x - s * 0.58, y + s * 0.95); c.close_path(); c.fill()
    c.set_source_rgba(0.09, 0.06, 0.04, 1)
    c.set_line_width(0.0030 * T)
    for fxp in (-0.33, 0.0, 0.33):
        c.new_path(); c.move_to(x + fxp * s * 1.25, y - s * 1.05); c.line_to(x + fxp * s * 1.0, y + s * 0.95); c.stroke()
    c.new_path(); c.move_to(x - s * 0.74, y + s * 0.95); c.line_to(x + s * 0.74, y + s * 0.95); c.line_to(x + s * 0.55, y + s * 1.25); c.line_to(x - s * 0.55, y + s * 1.25); c.close_path(); c.fill()
    c.set_source_rgba(1, 1, 0.92, 1)
    c.new_path(); c.save(); c.translate(x, y - s * 0.15); c.scale(s * 0.17, s * 0.40); c.arc(0, 0, 1, 0, TAU); c.restore(); c.fill()


# ============================================================================================ shadows & compositing
def cast_shadow(sprite, kx=1.4, ky=0.22, blur=0.012, strength=0.55):
    """ground shadow of a standing sprite: height z above the feet maps to (+kx*z, +ky*z) on the ground. returns (h,w) alpha
    in a canvas twice as wide so long shadows fit; also returns the new anchor x offset"""
    sil = sprite['sil']
    Hs, Ws = sil.shape
    ox, oy = sprite['anchor']
    pad = int(abs(kx) * Hs * 0.95)
    big = np.zeros((Hs + int(ky * Hs) + 4, Ws + 2 * pad), np.float32)
    big[:Hs, pad:pad + Ws] = sil
    M = np.float32([[1, -kx, kx * oy], [0, -ky, oy * (1 + ky)]])
    sh = cv2.warpAffine(big, M, (big.shape[1], big.shape[0]), flags=cv2.INTER_LINEAR, borderValue=0)
    # the shadow blurs and fades with distance from the feet
    xs = np.arange(big.shape[1], dtype=np.float32)[None, :]
    sh = cv2.GaussianBlur(sh, (0, 0), blur * sprite['T'] + 1.0)
    return np.clip(sh * strength, 0, 1), pad


def composite(canvas, sprite, x, y_feet, shadow=None, shadow_col=(0.05, 0.08, 0.16), sh_kw=None, glow=None):
    """paste a sprite with its feet at (x, y_feet) onto canvas (h,w,3); optionally lay its cast shadow first"""
    H, Wc = canvas.shape[:2]
    ox, oy = sprite['anchor']
    if shadow is not False:
        sa, pad = cast_shadow(sprite, **(sh_kw or {}))
        x0, y0 = int(round(x - ox - pad)), int(round(y_feet - oy))
        _blit(canvas, np.zeros(sa.shape + (3,), np.float32) + np.array(shadow_col, np.float32), sa, x0, y0)
    x0, y0 = int(round(x - ox)), int(round(y_feet - oy))
    a = sprite['a']
    rgb_straight = sprite['rgb'] / np.maximum(a, 1e-4)[..., None]
    _blit(canvas, rgb_straight, a, x0, y0)


def _blit(canvas, rgb, a, x0, y0):
    H, Wc = canvas.shape[:2]
    h, w = a.shape
    xa, ya = max(0, x0), max(0, y0)
    xb, yb = min(Wc, x0 + w), min(H, y0 + h)
    if xa >= xb or ya >= yb:
        return
    sa = a[ya - y0:yb - y0, xa - x0:xb - x0][..., None]
    sc = rgb[ya - y0:yb - y0, xa - x0:xb - x0]
    canvas[ya:yb, xa:xb] = canvas[ya:yb, xa:xb] * (1 - sa) + sc * sa
