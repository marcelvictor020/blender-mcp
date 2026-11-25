"""Silk ribbons: five ribbons (oxblood, cornflower, sunflower, linen, moss) untied from the folk flower at the heart of the fold (slide 5) stream to the right on the
same pull as everything else, twist so that you see first their front and then their back, and are tied to the finial of the yellow house standing against the
setting sun (slide 6). Coordinates are FINAL (the 16-slide canvas). Drawn the way an illustrator would: flat colour, a darker back face, a thin ink edge."""
import math
import numpy as np
import cairo
from util import *
from trees import catmull

TAU = 2 * math.pi
END = (6250.0, 612.0)                       # the finial of the far house (design x 7330 = final 6250)
COLS = [((0.66, 0.12, 0.16), (0.44, 0.07, 0.10)), ((0.32, 0.48, 0.84), (0.20, 0.31, 0.60)), ((0.98, 0.79, 0.24), (0.80, 0.58, 0.12)),
        ((0.97, 0.94, 0.86), (0.80, 0.76, 0.66)), ((0.36, 0.56, 0.30), (0.22, 0.38, 0.19))]
INKC = (0.17, 0.11, 0.10)


def paths():
    rng = np.random.default_rng(88)
    out = []
    for i in range(5):
        x0, y0 = 5176.0 + 10 * i, 330.0 + (i - 2) * 9.0                          # untied from the folk flower at the heart of the fold (slide 5)
        t = np.linspace(0, 1, 11)
        xs = x0 + (END[0] - 4 + 2 * (i - 2) - x0) * t
        base = y0 + (END[1] + (i - 2) * 2.5 - y0) * t ** 1.15
        wav = (62 + 26 * i) * np.sin(t * TAU * 1.20 + i * 1.15) * np.sin(math.pi * t) ** 0.85
        P = catmull(np.stack([xs, base + wav], 1), 36)
        out.append(P)
    return out


def ribbon_layer(x0, w, ss=2):
    """each ribbon is drawn as one flat polygon per face (front, then back after the twist), a thin ink edge, a pale silk highlight and a fold line at each turn"""
    L = Layer(w, H, x0, 0, ss)
    c = L.ctx
    c.set_line_join(cairo.LINE_JOIN_ROUND); c.set_line_cap(cairo.LINE_CAP_ROUND)
    for i, P in enumerate(paths()):
        n = len(P)
        tang = np.gradient(P, axis=0); tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-6
        nor = np.stack([-tang[:, 1], tang[:, 0]], 1)
        seg = np.hypot(*np.diff(P, axis=0).T)
        s = np.concatenate([[0], np.cumsum(seg)])
        lam = 600.0 + 85 * i
        tau = TAU * s / lam + i * 1.7
        cs = np.cos(tau)
        tt_ = s / max(float(s[-1]), 1.0)
        hw = 12.0 * (0.14 + 0.86 * np.abs(cs)) * np.clip(s / 160.0, 0.05, 1.0) * (0.30 + 0.70 * (1 - tt_ ** 3))       # pointed where it leaves the flower, narrowing to the knot at the finial
        front, back = COLS[i]
        left = P + nor * hw[:, None]; right = P - nor * hw[:, None]
        runs, k0 = [], 0
        for k in range(1, n):
            if (cs[k] > 0) != (cs[k - 1] > 0):
                runs.append((k0, k)); k0 = k
        runs.append((k0, n - 1))
        for (a, b) in runs:
            if b - a < 1 or P[b, 0] < x0 - 100 or P[a, 0] > x0 + w + 100: continue
            col = front if cs[(a + b) // 2] > 0 else back
            c.new_path(); c.move_to(*left[a])
            for k in range(a + 1, b + 1): c.line_to(*left[k])
            for k in range(b, a - 1, -1): c.line_to(*right[k])
            c.close_path(); c.set_source_rgb(*col); c.fill()
            c.set_source_rgba(1, 1, 1, 0.22); c.set_line_width(1.2)                      # silk highlight
            c.new_path(); c.move_to(*(P[a] + nor[a] * hw[a] * 0.35))
            for k in range(a + 1, b + 1): c.line_to(*(P[k] + nor[k] * hw[k] * 0.35))
            c.stroke()
            c.set_source_rgba(*INKC, 0.85); c.set_line_width(1.5)
            for edge in (left, right):
                c.new_path(); c.move_to(*edge[a])
                for k in range(a + 1, b + 1): c.line_to(*edge[k])
                c.stroke()
            if b < n - 2:                                                                 # the fold where it turns over
                c.set_source_rgba(*INKC, 0.55); c.set_line_width(1.1); c.new_path(); c.move_to(*left[b]); c.line_to(*right[b]); c.stroke()
    return L.get()
