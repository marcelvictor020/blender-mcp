"""The realistic garden turns into the hand-drawn hallway drawing: flat gouache colour on warm paper + graphite lines.
sketchify() makes the 'drawing' version of any image; compose blends it in sideways, row by row (blend.smear_blend)."""
import math
import numpy as np
import cv2
from util import *

PAPER = np.array([0.95, 0.91, 0.82], np.float32)
GRAPH = np.array([0.22, 0.22, 0.27], np.float32)


def sketchify(img, line_gain=1.0, flat_sigma=14, work_scale=0.5):
    h, w = img.shape[:2]
    u8 = np.clip(img * 255, 0, 255).astype(np.uint8)
    sm = cv2.resize(u8, None, fx=work_scale, fy=work_scale, interpolation=cv2.INTER_AREA)
    flat = cv2.pyrMeanShiftFiltering(np.ascontiguousarray(sm[..., ::-1]), sp=flat_sigma, sr=26)[..., ::-1]
    flat = cv2.resize(flat, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    b1 = cv2.GaussianBlur(g, (0, 0), 1.2)
    b2 = cv2.GaussianBlur(g, (0, 0), 2.8)
    d = b1 - 0.97 * b2
    lines = np.clip(-d * 20.0 - 0.10, 0, 1) * line_gain
    # hatching: a second, softer layer of darker areas in diagonal strokes (hand-drawn tone)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    hatch = 0.5 + 0.5 * np.sin((xx * 0.7 + yy * 0.7) / 3.2)
    tone = np.clip((0.42 - cv2.GaussianBlur(g, (0, 0), 3.0)) * 2.2, 0, 1) * (hatch > 0.62)
    # gouache: desaturate a little, lift toward paper, add pigment mottling
    gray = flat.mean(-1, keepdims=True)
    col = gray + (flat - gray) * 0.82
    col = col * 0.82 + PAPER[None, None, :] * 0.18
    mott = 0.5 + 0.3 * fbm(0, 0, 1, 1, 1) if False else 0
    out = col * (1 - 0.70 * lines)[..., None] + GRAPH[None, None, :] * (0.70 * lines)[..., None]
    out = out * (1 - 0.25 * tone)[..., None] + GRAPH[None, None, :] * (0.25 * tone)[..., None] * 0.5
    return np.clip(out, 0, 1).astype(np.float32)


if __name__ == '__main__':
    import time
    x0, img = cache_load('f_garden')
    crop = img[:, 10200 - x0: 11800 - x0]
    t = time.time()
    sk = sketchify(crop)
    print('sketch', round(time.time() - t, 1), 's')
    both = np.concatenate([crop, sk], 1)
    save_png(WORK + '/sketch_test.png', cv2.resize(both, None, fx=0.55, fy=0.55, interpolation=cv2.INTER_AREA))
