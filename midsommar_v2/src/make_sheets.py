"""Contact sheet (all slides in swipe order, rows of six) + border-check sheet (every border, 440 px wide, red hairline on the cut)."""
import os
import numpy as np
import cv2
from util import WORK, W, H, SL

OUT = os.path.dirname(WORK)
N = W // SL


def grid(tiles, per_row):
    blank = np.full_like(tiles[0], 10)
    while len(tiles) % per_row: tiles.append(blank.copy())
    rows = [np.concatenate(tiles[i:i + per_row], 1) for i in range(0, len(tiles), per_row)]
    sep = np.full((6, rows[0].shape[1], 3), 10, np.uint8)
    out = rows[0]
    for r in rows[1:]: out = np.concatenate([out, sep, r], 0)
    return out


def main():
    tiles = []
    for k in range(1, N + 1):
        t = cv2.imread(os.path.join(OUT, 'slides', f'slide_{k:02d}.png'))
        t = cv2.resize(t, (300, 375), interpolation=cv2.INTER_AREA)
        tiles.append(cv2.copyMakeBorder(t, 0, 0, 3, 3, cv2.BORDER_CONSTANT, value=(10, 10, 10)))
    sheet = grid(tiles, 6)
    cv2.imwrite(os.path.join(OUT, 'contact_sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 93])
    pano = cv2.imread(os.path.join(OUT, f'panorama_{W}x{H}.png'))
    cuts = []
    for k in range(1, N):
        x = k * SL
        t = pano[:, x - 220:x + 220].copy()
        t[:, 218:222] = (0.5 * t[:, 218:222] + 0.5 * np.array([0, 0, 255])).astype(np.uint8)
        cuts.append(cv2.resize(t, (220, 675), interpolation=cv2.INTER_AREA))
    cs = grid(cuts, 8)
    cv2.imwrite(os.path.join(OUT, 'border_check.jpg'), cs, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print('contact sheet', sheet.shape, ' border check', cs.shape)


if __name__ == '__main__':
    main()
