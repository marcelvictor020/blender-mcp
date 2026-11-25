"""Master layout of the 16-slide panorama (17280 x 1350, horizon row 783).

Every scene reads its landmarks from here, so a thing that exists in one style (flat folk paint) is drawn at the very same
place in the next style (painterly, then realistic ...). That is what lets details FLOW through the transitions instead of
being swapped out.
"""
import math
import numpy as np
from util import *

# ------------------------------------------------------------------------------------------------ sun, moon, long ray
SUN = (470.0, 330.0, 235.0)                    # a WHOLE sun on slide 1
MOON = (2040.0, 440.0, 165.0)
LONG_TIP = (1900.0, 485.0)                     # the sun's longest ray ends where the moon's concave edge begins
LONG_ANG = math.atan2(LONG_TIP[1] - SUN[1], LONG_TIP[0] - SUN[0])
LONG_LEN = math.hypot(LONG_TIP[0] - SUN[0], LONG_TIP[1] - SUN[1])

# ------------------------------------------------------------------------------------------------ cloud ribbon + sleeping face
FACE = dict(cx=2660.0, cy=395.0, S=500.0)      # a woman's profile lying in the sky; her breath is the ribbon that becomes the mist
RIBBON = [(140, 700), (400, 662), (680, 625), (960, 598), (1240, 585), (1520, 615), (1800, 668), (2080, 700), (2330, 676),
          (2520, 640), (2700, 612), (2880, 626), (3120, 690), (3380, 752), (3660, 786), (4000, 790), (4500, 788), (5200, 787), (6200, 786)]


def ribbon_thick(s):
    """cloud thickness (px) as a function of arc length s along RIBBON: fat folk cloud -> thin breath -> a long flat mist"""
    base = 112 + 26 * math.sin(s / 194.0) * (1 - s / 11000.0)
    k = float(smoothstep(2900, 4400, s))
    return base * (1 - 0.66 * k)


# ------------------------------------------------------------------------------------------------ birds (they never leave the scene)
def _birds():
    rng = np.random.default_rng(404)
    groups = [(700, 1250, 130, 260, 8, 24), (1500, 2050, 190, 300, 5, 21), (2650, 3300, 250, 390, 6, 19), (3850, 4650, 300, 430, 5, 17),
              (5250, 5950, 360, 470, 4, 15), (6500, 7300, 300, 420, 6, 16), (7900, 8700, 250, 360, 5, 17), (9400, 10100, 190, 290, 6, 18),
              (11000, 11800, 300, 400, 4, 16)]
    out = []
    for (xa, xb, ya, yb, n, size) in groups:
        for i in range(n):
            t = i / max(1, n - 1)
            x = xa + (xb - xa) * (0.15 + 0.85 * t) + rng.normal(0, 24)
            y = ya + (yb - ya) * (0.5 + 0.5 * math.sin(t * 3.1 + xa)) + abs(i - n / 2) * 7 + rng.normal(0, 10)
            out.append((float(x), float(y), float(size * rng.uniform(0.85, 1.15)), float(rng.normal(-0.10, 0.10)), int(rng.integers(1 << 30))))
    return out


BIRDS = _birds()


# ------------------------------------------------------------------------------------------------ procession on the far shore
def _procession():
    """small groups of white-robed walkers with gaps between them (never a regular fence); they walk the far shore all the way to the garden"""
    rng = np.random.default_rng(7)
    out = []
    x = 1250.0
    while x < 9800:
        n = int(rng.integers(3, 8))
        for k in range(n):
            if x >= 9800: break
            out.append((float(x + rng.normal(0, 2.5)), float((31 - 8 * smoothstep(1500, 4300, x)) * rng.uniform(0.86, 1.08)), int(rng.integers(1 << 30))))
            x += rng.uniform(22, 36)
        x += rng.uniform(70, 230)
    return out


PROCESSION = _procession()                     # (x, height_px, seed): the little white-robed line that walks the horizon


def _pads():
    rng = np.random.default_rng(31)
    out = []
    while len(out) < 120:
        x = float(rng.uniform(1450, 8300))
        if 3300 < x < 4500: continue                                    # keep the boat's water clear
        out.append((x, float(rng.uniform(900, 1330)), int(rng.integers(1 << 30))))
    return out


PADS = _pads()

# ------------------------------------------------------------------------------------------------ pond / fold / garden / temple
GIRL_X = 3772.0                                # the lantern-bearer in the boat, centre of slide 4
ARCH = dict(left=3338.0, right=4212.0)         # the two ancient trunks
FOLD = (4300.0, 7700.0)                        # sideways flow zone: pond -> garden
TEMPLE = dict(cx=10260.0, base_y=905.0, apex_y=70.0, half=440.0)
RING = dict(cx=9120.0, base_y=1114.0, Z=12.7)   # the maypole + spiral dance: centre on screen and depth (m) for the garden camera


def _reeds():
    rng = np.random.default_rng(14)
    out = []
    for i in range(46):
        x = float(rng.uniform(1150, 2750)); nb = int(rng.integers(3, 6)); cat = bool(rng.random() < .45)
        out.append(dict(x=x, nb=nb, cat=cat, hs=[float(rng.uniform(46, 90)) for _ in range(nb)],
                        sway=[(float(rng.normal(0, 6)), float(rng.normal(0, 9))) for _ in range(nb)],
                        cat_h=float(rng.uniform(70, 110)), cat_dx=float(rng.normal(0, 4))))
    return out


REEDS = _reeds()


# design-space x ranges where nothing small and airborne may sit: the two zones that the finished carousel melts across (see compose2.build)
NO_FLY = [(5040, 5760), (6120, 6840), (11340, 11900), (12420, 12980)]


def no_fly(x):
    return any(a <= x <= b for a, b in NO_FLY)
