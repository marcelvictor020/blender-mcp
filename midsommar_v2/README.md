# Midsummer carousel v2 - sixteen slides, one world

`panorama_17280x1350.png` is the lossless master; `slides/slide_01..16.jpg` are the ten-and-six cuts (1080 x 1350, swipe left to right).
`python3 slice_panorama.py` re-cuts PNG slides from the master. `contact_sheet.jpg` shows all sixteen; `border_check.jpg` shows every border
with a red hairline on the cut. Everything is generated in code (numpy + cairo + OpenCV) - no image-generation model, no copied reference.

## What changed from v1, and why
* **Sideways, line by line.** Every join is a row-by-row changeover (`src/blend.py: stagger_blend`): each scanline switches scene at its own x,
  nothing is blurred away, so both renderings of the same thing interleave in streaks. v1's slide 5 was a head-on vortex; that is gone.
* **Same scene, not new scenes.** The birds, the white-robed walkers on the far shore, the lily pads, the reeds and the cloud-face are one shared
  list (`src/shared.py`) drawn in every style, so they flow through the joins instead of being swapped out.
* **The sun is whole** (slide 1) - no half-sun at the edges, no loop.
* **Clouds become a face and animals** (`src/sculpt.py`): a sleeping woman whose breath runs on as the ribbon -> mist, a bear and a swan.
  One silhouette, two renderings (flat ink-and-cream puffs <-> lit volumetric cloud).
* **Girls in a spiral** (`src/chain.py`, `src/overhead.py`): one line of linked hands walks in from the pond's arch, crosses the water, steps ashore and
  winds in around the garlanded maypole; the final slide is the same spiral from above, tail leaving the frame.
* **Painted figures** (`src/fig.py`): skeleton + two-bone arms, pseudo-3D shading, folds, hair strands, flower crown (wilting in the hallway), lantern
  point-light, rim light, ground shadows - lit gold in the garden, blue by the pond.

## Slides
| | |
|---|---|
| 1-2 | flat dalmalning on plywood: whole sun, kurbits swirls, birds, ring dance, sun's long ray handing over to the moon, star rings |
| 3 | the cloud-face asleep; folk -> real, row by row (her breath is the ribbon that becomes the mist) |
| 4 | painterly pond under arching trees; lantern girl in a rowboat |
| 5-8 | one current to the right: bark ribbons -> vines -> spirals, leaves night-teal -> gold, the chain of girls walking the water |
| 9-11 | the same lake at golden hour: spiral dance round the maypole, bear and swan clouds, the plank A-frame (ivy, doors open, a woman in white) |
| 11-12 | the garden is redrawn in graphite + gouache; the temple's planks run on as ruled pencil toward the vanishing point |
| 12-16 | one-point-perspective triangular corridor; vanishing point exactly on the 13|14 cut with a Droste doorway; the girl who turns back; a ring of young people round nothing; the overhead spiral dance |

Horizon row 783 (58 %) throughout. Verified by `src/export2.py`: exact sizes, slides re-assemble into the panorama bit-for-bit, and every border is
within 1.7x of the picture's own column-to-column texture.

## Known limits
Faces are small and stylised at slide scale; the near hallway figures are a little mannequin-like from behind; the bear reads best as a back-and-head
over the treeline (the firs hide its legs); the v1 Zoomquilt "portal" (a half-scale copy of the next scene nested in the vortex) was dropped with the vortex.
Rebuild: `pip install -r requirements.txt && ./build_all.sh` (~8 min, 4 cores; caches in `work/`, git-ignored).
