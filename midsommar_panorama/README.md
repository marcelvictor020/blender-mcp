# Midsummer carousel: one 10800x1350 panorama, cut into ten 1080x1350 slides

`panorama_10800x1350.png` (lossless master) / `.jpg`, and `slides/slide_01..10.(png|jpg)`.
Swipe order is left to right. Slide 10 closes the loop: its far edge is the left half of the sun whose right half opens slide 1.

Everything is generated procedurally (numpy + cairo + OpenCV). No image-generation model was used and no reference
image is copied; the references only supplied palette values (sampled from the temple / mural photos).

| slides | style | what carries you across the cut |
|---|---|---|
| 1-2 | naive dalmalning on plywood | sun's long ray + painted cloud ribbon (1/2); the ribbon turns volumetric (2/3) |
| 3-4 | painterly realism (stroke-based oil renderer) | mist band and its reflection (3/4); the leaning canopy (4/5) |
| 5 | Zoomquilt-style fold (log-polar spiral of trunks, leaves, vines; a half-scale copy of slide 6 nested in the eye) | a sweeping vine + a jade cloud ribbon (5/6) |
| 6 | golden-hour meadow, A-frame temple | the temple's right roof edge becomes the first inked line; planks become ruled pencil (6/7) |
| 7-10 | one-point-perspective hallway: ink + graphite under gouache, triangular cross-section, ray-cast floor/walls | garland + floorboards (7/8); vanishing point exactly on the 8/9 cut with a Droste doorway; rune circle (9/10); sun (10/1) |

One shared horizon at row 783 (58 % of 1350) and one warm low light run through all of it.

Checks (`src/export.py`): exact sizes, slides re-assemble into the panorama bit-for-bit, and every border (including
the 10 -> 1 loop seam) is no more discontinuous than the picture's own texture. `border_check.jpg` shows each cut with
a red hairline; `contact_sheet.jpg` shows the ten slides in swipe order.

Rebuild: `pip install -r requirements.txt && ./build_all.sh`. Stage caches live in `work/` (git-ignored, ~250 MB).
