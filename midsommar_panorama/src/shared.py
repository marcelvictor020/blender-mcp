"""Geometry shared by several scenes so continuity objects line up exactly across cuts."""
import math
from util import *

# the painted cloud ribbon of slides 1-2 -> volumetric vapour of slide 3 -> long mist band lying on the pond
RIBBON = [(70, 668), (330, 618), (600, 600), (860, 548), (1080, 528), (1330, 598), (1620, 688), (1900, 668),
          (2160, 632), (2480, 650), (2790, 702), (3040, 752), (3260, 784), (3520, 792), (3800, 788), (4150, 786)]


def ribbon_thick(s):
    """cloud thickness in px as a function of arc length s (px) along RIBBON"""
    base = 112 + 28 * math.sin(s / 194.0) * (1 - s / 11000.0)
    k = float(smoothstep(2900, 4300, s))
    return base * (1 - 0.62 * k)


# slide-6 temple geometry (global px) used by meadow + hallway transition
TEMPLE = dict(cx=6130.0, base_y=905.0, apex_y=85.0, half=400.0)
