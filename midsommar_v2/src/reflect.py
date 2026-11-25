"""Reflections of what hangs in the sky. The lake is mirrored once in world.py; anything added to the sky afterwards (ribbons, lanterns, butterflies, birds)
is mirrored here the same way - same ripple slicing - and added to the water only where the water is really visible, a little darker than its source
(water is almost always darker than what it mirrors) and softer."""
import numpy as np
from util import *
import water as W


def add_reflections(out, before, x0, w, water_mask, strength=0.74, seed=17):
    wc = np.zeros((1, w, 3), np.float32)
    a = W.mirror_water(out.astype(np.float32), x0, w, wc, seed=seed)
    b = W.mirror_water(before.astype(np.float32), x0, w, wc, seed=seed)
    delta = (a[HZ:] - b[HZ:]) * (np.clip(water_mask[HZ:], 0, 1)[..., None] * strength)
    res = out.copy()
    res[HZ:] = np.clip(res[HZ:] + delta, 0, 1)
    return res
