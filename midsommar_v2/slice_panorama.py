"""Re-cut the lossless panorama into the 16 slides of 1080 x 1350 (no render caches needed).  python3 slice_panorama.py [out_dir]"""
import os, sys
import cv2
HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'slides')
os.makedirs(out, exist_ok=True)
pano = cv2.imread(os.path.join(HERE, 'panorama_17280x1350.png'), cv2.IMREAD_COLOR)
assert pano.shape == (1350, 17280, 3), pano.shape
for k in range(16):
    cv2.imwrite(os.path.join(out, f'slide_{k + 1:02d}.png'), pano[:, k * 1080:(k + 1) * 1080])
print('wrote 16 slides to', out)
