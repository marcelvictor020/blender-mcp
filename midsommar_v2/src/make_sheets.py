"""Contact sheet (16 slides in swipe order, 2 rows of 8) + border-check sheet (every one of the 15 borders, 440 px wide, red hairline on the cut)."""
import os
import numpy as np
import cv2
from util import WORK, W, H, SL

OUT = os.path.dirname(WORK)
N = W // SL


def main():
    tiles = []
    for k in range(1, N + 1):
        t = cv2.imread(os.path.join(OUT, 'slides', f'slide_{k:02d}.png'))
        t = cv2.resize(t, (300, 375), interpolation=cv2.INTER_AREA)
        tiles.append(cv2.copyMakeBorder(t, 0, 0, 3, 3, cv2.BORDER_CONSTANT, value=(10, 10, 10)))
    rows = [np.concatenate(tiles[i:i + 8], 1) for i in (0, 8)]
    sheet = np.concatenate([rows[0], np.full((6, rows[0].shape[1], 3), 10, np.uint8), rows[1]], 0)
    cv2.imwrite(os.path.join(OUT, 'contact_sheet.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 93])
    pano = cv2.imread(os.path.join(OUT, f'panorama_{W}x{H}.png'))
    cuts = []
    for k in range(1, N):
        x = k * SL
        t = pano[:, x - 220:x + 220].copy()
        t[:, 218:222] = (0.5 * t[:, 218:222] + 0.5 * np.array([0, 0, 255])).astype(np.uint8)
        cuts.append(cv2.resize(t, (220, 675), interpolation=cv2.INTER_AREA))
    cuts.append(np.zeros_like(cuts[0]))
    rows = [np.concatenate(cuts[i:i + 8], 1) for i in (0, 8)]
    cv2.imwrite(os.path.join(OUT, 'border_check.jpg'), np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 92])
    print('contact sheet', sheet.shape, ' border check', np.concatenate(rows, 0).shape)


if __name__ == '__main__':
    main()
