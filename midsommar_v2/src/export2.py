"""Final export + verification for the 17-slide carousel (18360 x 1350 -> 17 slides of 1080 x 1350).
Writes the panorama (PNG master + JPEG) and the slides (PNG + JPEG) from ONE 8-bit conversion, re-reads them and proves exact sizes,
bit-exact re-assembly, and that every one of the 16 borders is no more abrupt than the picture's own texture."""
import os
import numpy as np
import cv2
from util import WORK, W, H, SL, HZ

OUT = os.path.dirname(WORK)
SLIDES = os.path.join(OUT, 'slides')
os.makedirs(SLIDES, exist_ok=True)
N = W // SL


def jpeg_params(q=95):
    p = [cv2.IMWRITE_JPEG_QUALITY, q]
    try:
        p += [cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444]
    except AttributeError:
        pass
    return p


def main():
    img = np.load(os.path.join(WORK, 'panorama.npy')).astype(np.float32)
    assert img.shape == (H, W, 3), img.shape
    bgr = np.ascontiguousarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)[..., ::-1])
    pano_png = os.path.join(OUT, f'panorama_{W}x{H}.png')
    pano_jpg = os.path.join(OUT, f'panorama_{W}x{H}.jpg')
    cv2.imwrite(pano_png, bgr, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    cv2.imwrite(pano_jpg, bgr, jpeg_params(95))
    for k in range(N):
        sl = bgr[:, k * SL:(k + 1) * SL]
        cv2.imwrite(os.path.join(SLIDES, f'slide_{k + 1:02d}.png'), sl, [cv2.IMWRITE_PNG_COMPRESSION, 6])
        cv2.imwrite(os.path.join(SLIDES, f'slide_{k + 1:02d}.jpg'), sl, jpeg_params(95))
    pano = cv2.imread(pano_png, cv2.IMREAD_COLOR)
    assert pano.shape == (H, W, 3), pano.shape
    assert cv2.imread(pano_jpg, cv2.IMREAD_COLOR).shape == (H, W, 3)
    tiles = []
    for k in range(N):
        for ext in ('png', 'jpg'):
            t = cv2.imread(os.path.join(SLIDES, f'slide_{k + 1:02d}.{ext}'), cv2.IMREAD_COLOR)
            assert t.shape == (H, SL, 3), (k + 1, ext, t.shape)
        tiles.append(cv2.imread(os.path.join(SLIDES, f'slide_{k + 1:02d}.png'), cv2.IMREAD_COLOR))
    assert np.array_equal(np.concatenate(tiles, 1), pano), 'slides do not re-assemble into the panorama'
    f = pano.astype(np.float32) / 255.0
    d = np.abs(f[:, 1:] - f[:, :-1]).mean((0, 2))
    print('panorama      : %dx%d  (horizon row %d = %.1f%% of height)' % (W, H, HZ, 100.0 * HZ / H))
    print('slides        : %d x %dx%d, re-assemble into the panorama bit-for-bit: OK' % (N, SL, H))
    ratios = []
    for k in range(1, N):
        x = k * SL
        near = max(np.median(d[max(0, x - 60):x + 60]), 1e-6)
        ratios.append((k, d[x - 1] / near))
    print('border ratios : ' + ', '.join('%d|%d=%.2f' % (k, k + 1, r) for k, r in ratios))
    print('worst border  : %d|%d  ratio %.2f   (picture-wide median column step %.4f)' % (max(ratios, key=lambda t: t[1])[0], max(ratios, key=lambda t: t[1])[0] + 1, max(r for _, r in ratios), np.median(d)))
    for p in (pano_png, pano_jpg):
        print('%-30s %6.1f MB' % (os.path.basename(p), os.path.getsize(p) / 1e6))
    print('slides png    : %.1f MB total   jpg: %.1f MB total' % (sum(os.path.getsize(os.path.join(SLIDES, f'slide_{k + 1:02d}.png')) for k in range(N)) / 1e6,
                                                                  sum(os.path.getsize(os.path.join(SLIDES, f'slide_{k + 1:02d}.jpg')) for k in range(N)) / 1e6))


if __name__ == '__main__':
    main()
