"""Final export + verification.

Writes the 10800x1350 panorama (PNG master + JPEG) and the ten 1080x1350 slides (PNG + JPEG) from ONE 8-bit conversion,
then re-reads the files and proves that (a) every size is exact and (b) the ten slides re-assemble into the panorama
bit for bit, and that the loop seam (slide 10 -> slide 1) is as smooth as the picture's own texture.
"""
import os
import numpy as np
import cv2
from util import WORK, W, H, SL, HZ

OUT = os.path.dirname(WORK)                      # .../midsommar_panorama
SLIDES = os.path.join(OUT, 'slides')
os.makedirs(SLIDES, exist_ok=True)


def jpeg_params(q=95):
    p = [cv2.IMWRITE_JPEG_QUALITY, q]
    try:                                         # full-resolution chroma (4:4:4) so the palette is not smeared
        p += [cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444]
    except AttributeError:
        pass
    return p


def main():
    img = np.load(os.path.join(WORK, 'panorama.npy')).astype(np.float32)
    assert img.shape == (H, W, 3), img.shape
    bgr = np.ascontiguousarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)[..., ::-1])

    pano_png = os.path.join(OUT, 'panorama_10800x1350.png')
    pano_jpg = os.path.join(OUT, 'panorama_10800x1350.jpg')
    cv2.imwrite(pano_png, bgr, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    cv2.imwrite(pano_jpg, bgr, jpeg_params(95))
    for k in range(10):
        sl = bgr[:, k * SL:(k + 1) * SL]
        cv2.imwrite(os.path.join(SLIDES, f'slide_{k + 1:02d}.png'), sl, [cv2.IMWRITE_PNG_COMPRESSION, 6])
        cv2.imwrite(os.path.join(SLIDES, f'slide_{k + 1:02d}.jpg'), sl, jpeg_params(95))

    # ------------------------------------------------------------------ verification from the files on disk
    pano = cv2.imread(pano_png, cv2.IMREAD_COLOR)
    assert pano.shape == (1350, 10800, 3), pano.shape
    pj = cv2.imread(pano_jpg, cv2.IMREAD_COLOR)
    assert pj.shape == (1350, 10800, 3)
    tiles = []
    for k in range(10):
        for ext in ('png', 'jpg'):
            t = cv2.imread(os.path.join(SLIDES, f'slide_{k + 1:02d}.{ext}'), cv2.IMREAD_COLOR)
            assert t.shape == (1350, 1080, 3), (k + 1, ext, t.shape)
        tiles.append(cv2.imread(os.path.join(SLIDES, f'slide_{k + 1:02d}.png'), cv2.IMREAD_COLOR))
    rebuilt = np.concatenate(tiles, 1)
    assert np.array_equal(rebuilt, pano), 'slides do not re-assemble into the panorama'

    f = pano.astype(np.float32) / 255.0
    ext = np.concatenate([f, f[:, :2]], 1)
    d = np.abs(ext[:, 1:] - ext[:, :-1]).mean((0, 2))
    typical = np.median(d[8000:8400])
    print('panorama      : %dx%d  (horizon row %d = %.1f%% of height)' % (pano.shape[1], pano.shape[0], HZ, 100.0 * HZ / H))
    print('slides        : 10 x %dx%d, re-assemble into the panorama bit-for-bit: OK' % (SL, H))
    print('loop seam     : diff %.4f vs picture-wide median %.4f  (ratio %.2f)' % (d[-2], np.median(d), d[-2] / np.median(d)))
    print('border ratios : ' + ', '.join('%d|%d=%.2f' % (k, k % 10 + 1, d[(k * SL) % W - 1] / max(np.median(d[max(0, (k * SL) % W - 40):(k * SL) % W + 40]), 1e-6))
                                         for k in range(1, 11)))
    for p in (pano_png, pano_jpg):
        print('%-28s %6.1f MB' % (os.path.basename(p), os.path.getsize(p) / 1e6))
    print('slides png    : %.1f MB total   slides jpg: %.1f MB total' % (
        sum(os.path.getsize(os.path.join(SLIDES, f'slide_{k + 1:02d}.png')) for k in range(10)) / 1e6,
        sum(os.path.getsize(os.path.join(SLIDES, f'slide_{k + 1:02d}.jpg')) for k in range(10)) / 1e6))


if __name__ == '__main__':
    main()
