"""Stroke-based painterly renderer (Hertzmann-style layered brush strokes + impasto relief).

paint(target) -> image that looks hand-painted: coarse underpainting, then ever finer strokes that follow the
image structure and are only laid where the canvas still differs from the target.  Pure numpy + cairo.
"""
import math
import numpy as np
import cv2
import cairo
from util import *


def flow_field(ref, sigma, default=None, default_w=0.6):
    """stroke direction field (radians): along edges where structure is strong, `default` elsewhere"""
    g = cv2.cvtColor(ref, cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    jxx = cv2.GaussianBlur(gx * gx, (0, 0), sigma); jyy = cv2.GaussianBlur(gy * gy, (0, 0), sigma)
    jxy = cv2.GaussianBlur(gx * gy, (0, 0), sigma)
    tr = jxx + jyy + 1e-7
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / tr
    strength = np.clip(tr * 90.0, 0, 1)                      # ignore flat regions
    along = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + math.pi / 2
    vx = np.cos(2 * along) * coh * strength * 2.2
    vy = np.sin(2 * along) * coh * strength * 2.2
    if default is not None:
        d = default if np.ndim(default) else np.full(g.shape, default, np.float32)
        vx = vx + default_w * np.cos(2 * d); vy = vy + default_w * np.sin(2 * d)
    else:
        vx = vx + 1e-4
    return (0.5 * np.arctan2(vy, vx)).astype(np.float32)


def _samp(img, p):
    h, w = img.shape[:2]
    x = np.clip(p[:, 0].astype(np.int32), 0, w - 1); y = np.clip(p[:, 1].astype(np.int32), 0, h - 1)
    return img[y, x]


def paint(target, passes=((22, 1.0, 0.0), (11, 1.0, 0.035), (6, 1.0, 0.045), (3.2, 1.2, 0.055)),
          default_flow=0.0, default_w=0.6, detail=None, seed=1, relief=0.38, bristle=True, alpha=0.93,
          length_mul=1.0, jitter_col=0.010, under_sigma=12, verbose=False, struct_keep=0.0, fine_mask=None, fine_R=2.8):
    """target: float32 (h,w,3) in 0..1.   detail: optional (h,w) 0..1 -> forces fine strokes where high.
    passes: (brush radius px, spacing factor, error threshold)."""
    target = np.ascontiguousarray(target, dtype=np.float32)
    h, w = target.shape[:2]
    r = np.random.default_rng(seed)
    under = cv2.GaussianBlur(target, (0, 0), under_sigma)
    buf = np.zeros((h, w, 4), np.uint8)
    buf[..., 0] = np.clip(under[..., 2] * 255, 0, 255); buf[..., 1] = np.clip(under[..., 1] * 255, 0, 255)
    buf[..., 2] = np.clip(under[..., 0] * 255, 0, 255); buf[..., 3] = 255
    surf = cairo.ImageSurface.create_for_data(buf, cairo.FORMAT_ARGB32, w, h, w * 4)
    ctx = cairo.Context(surf)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND); ctx.set_line_join(cairo.LINE_JOIN_ROUND); ctx.set_antialias(cairo.ANTIALIAS_GRAY)
    hbuf = np.zeros((h, w), np.uint8)
    hsurf = cairo.ImageSurface.create_for_data(hbuf, cairo.FORMAT_A8, w, h, w)
    hctx = cairo.Context(hsurf)
    hctx.set_line_cap(cairo.LINE_CAP_ROUND); hctx.set_line_join(cairo.LINE_JOIN_ROUND)
    canvas = under.copy()
    nstroke = 0
    for pi, (R, sp, thr) in enumerate(passes):
        ref = cv2.GaussianBlur(target, (0, 0), max(0.6, R * 0.45))
        ang = flow_field(ref, max(2.0, R * 1.4), default_flow, default_w)
        err = np.abs(canvas - ref).mean(-1)
        err = cv2.GaussianBlur(err, (0, 0), max(1.0, R * 0.5))
        if detail is not None:
            err = err + detail * 0.2 * (pi >= 2)
        g = max(1.2, R * sp)
        gy_, gx_ = np.meshgrid(np.arange(g / 2, h, g), np.arange(g / 2, w, g), indexing='ij')
        pts = np.stack([gx_.ravel(), gy_.ravel()], 1).astype(np.float32)
        pts += r.uniform(-g * .5, g * .5, pts.shape).astype(np.float32)
        pts[:, 0] = np.clip(pts[:, 0], 0, w - 1); pts[:, 1] = np.clip(pts[:, 1], 0, h - 1)
        keep = _samp(err[..., None], pts)[:, 0] > thr if thr > 0 else np.ones(len(pts), bool)
        pts = pts[keep]
        if fine_mask is not None and R > fine_R and len(pts):
            blocked = _samp(fine_mask[..., None].astype(np.float32), pts)[:, 0] > 0.5
            pts = pts[~blocked]
        if len(pts) == 0: continue
        r.shuffle(pts)
        N = len(pts)
        nsteps = int(max(3, round(5 * length_mul)))
        step = R * 0.62
        P = np.zeros((N, nsteps + 1, 2), np.float32); P[:, 0] = pts
        c0 = _samp(ref, pts)
        alive = np.ones(N, bool); ln = np.zeros(N, np.int32)
        sign = r.choice([-1.0, 1.0], N).astype(np.float32)
        pd = None
        tol = 0.16 + 0.03 * R / 10
        for k in range(nsteps):
            p = P[:, k]
            a = _samp(ang[..., None], p)[:, 0]
            d = np.stack([np.cos(a), np.sin(a)], 1) * sign[:, None]
            if pd is not None:
                flip = (d * pd).sum(1) < 0; d[flip] *= -1
            newp = p + d * step
            newp[:, 0] = np.clip(newp[:, 0], 0, w - 1); newp[:, 1] = np.clip(newp[:, 1], 0, h - 1)
            diff = np.abs(_samp(ref, newp) - c0).sum(1)
            ok = alive & (diff < tol)
            P[:, k + 1] = np.where(ok[:, None], newp, p)
            alive &= ok; ln += ok; pd = d
        cend = _samp(ref, P[np.arange(N), ln])
        for i in range(N):
            c = np.clip(c0[i] + r.normal(0, jitter_col, 3), 0, 1)
            pl = P[i, :ln[i] + 1]
            if ln[i] >= 1:
                ce = np.clip(cend[i] + r.normal(0, jitter_col, 3), 0, 1)
                gpat = cairo.LinearGradient(pl[0][0], pl[0][1], pl[-1][0], pl[-1][1])
                gpat.add_color_stop_rgba(0, c[0], c[1], c[2], alpha); gpat.add_color_stop_rgba(1, ce[0], ce[1], ce[2], alpha)
                ctx.set_source(gpat)
            else:
                ctx.set_source_rgba(c[0], c[1], c[2], alpha)
            ctx.set_line_width(2 * R * r.uniform(.85, 1.1))
            ctx.new_path(); ctx.move_to(*pl[0])
            if len(pl) == 1: ctx.line_to(pl[0][0] + .1, pl[0][1])
            for q in pl[1:]: ctx.line_to(*q)
            ctx.stroke()
            hv = r.uniform(.25, 1.0)
            hctx.set_source_rgba(0, 0, 0, hv); hctx.set_line_width(2 * R * .9)
            hctx.new_path(); hctx.move_to(*pl[0])
            if len(pl) == 1: hctx.line_to(pl[0][0] + .1, pl[0][1])
            for q in pl[1:]: hctx.line_to(*q)
            hctx.stroke()
            if bristle and R >= 3 and len(pl) > 1:
                dv = pl[-1] - pl[0]; L_ = math.hypot(*dv) + 1e-6
                nx, ny = -dv[1] / L_, dv[0] / L_
                for off in (-.55, .1, .6):
                    lc = np.clip(c * (1 + r.uniform(-.09, .09)), 0, 1)
                    ctx.set_source_rgba(lc[0], lc[1], lc[2], .42); ctx.set_line_width(max(.9, R * .28))
                    ctx.new_path(); ctx.move_to(pl[0][0] + nx * off * R, pl[0][1] + ny * off * R)
                    for q in pl[1:]: ctx.line_to(q[0] + nx * off * R, q[1] + ny * off * R)
                    ctx.stroke()
        nstroke += N
        surf.flush()
        canvas = buf[..., 2::-1].astype(np.float32) / 255.0
        if verbose: print(f'  pass R={R}: {N} strokes')
    surf.flush(); hsurf.flush()
    out = buf[..., 2::-1].astype(np.float32) / 255.0
    hmap = cv2.GaussianBlur(hbuf.astype(np.float32) / 255.0, (0, 0), 1.1)
    emb = cv2.filter2D(hmap, -1, np.array([[-1, -1, 0], [-1, 0, 1], [0, 1, 1]], np.float32) * 0.5)
    out = out * (1 + relief * emb)[..., None]
    sk = np.asarray(struct_keep, np.float32)
    if sk.ndim == 2: sk = sk[..., None]
    if sk.max() > 0:                               # keep some of the underlying structure (fine edges, gradients)
        out = out * (1 - sk) + cv2.GaussianBlur(target, (0, 0), 0.7) * sk
    return np.clip(out, 0, 1), nstroke
