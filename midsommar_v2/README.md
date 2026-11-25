# Midsummer carousel v4 - sixteen slides, one world

`panorama_17280x1350.png` is the lossless master; `slides/slide_01..16.jpg` are the cuts (1080 x 1350, swipe left to right).
`python3 slice_panorama.py` re-cuts PNG slides from the master. `contact_sheet.jpg` shows all sixteen; `border_check.jpg` shows every border
with a red hairline on the cut. Everything is generated in code (numpy + cairo + OpenCV) - no image-generation model, no copied reference.

## What v4 changes (after the feedback "creative, beautiful, well drawn - not a weird paint")
* **Ink and gouache, not an oil-paint filter** (`src/ink.py`). Studying John Bauer's *Princess Tuvstarr* (big simple shapes, flat washes, one thin confident dark
  contour, almost-mirror water, a few tiny precise details) and modern Scandinavian folk-pattern illustration (calm sun with a face, bows, wisteria, tidy symmetry),
  the stroke-simulating paint pass was replaced by: bilateral flattening into gouache washes, pigment pooling at colour edges, an ink contour drawn round the
  shapes the scenes *know* (house, trunks, boat, figures - not found by edge detection), a pixel of misregistration between ink and colour, and paper grain.
* **Nothing is longer than it can be** (`src/flow3.py`, `src/ribbons.py`). The 4000 px bough is gone. Slides 5-8 are four different pictures that turn into
  one another: **5 the fold** - the arch's own leaves curl into a vine spiral round a flat folk flower and the picture twists inside the spiral, mist lifts off the
  pond into it; **6 the sea** - clouds condense out of the mirror, lump by lump and row by row, the lake becomes a sea of cloud and the girls take shape out of the
  mist (ghosts at the left border, solid at the right); **7 the gold** - the cloud settles back into the lake; **8 the shore** - the water ends at the meadow.
  What does cross the borders is what could: five silk ribbons untied from the folk flower that stream right, twist, and arrive at the top of the maypole in slide 9.
* Everything from v3 (shared world sky and lake, the cathedral of two trees, the A-frame, meadow, swans, boats, lanterns, deer) is kept; the canopy now thins
  toward slide 3 instead of ending in a wall and has shed blossom petals onto that lake.

## What v3 changed (the "realistic" slides, 3-12)
v2 had the right structure but the realistic slides were dark, flat and green. v3 rebuilds them:
* **One continuous lake and sky** (`src/world.py`). The pond, the current and the garden no longer have three separate skies: the sky, the far shore
  and the mirrored water are rendered once for x = 2000..12900 and sliced. The sun goes down at x = 7330 as one whole disc; left of it the sky is dusk
  (indigo, rose, lilac, first stars), right of it golden hour. Clouds are volumetric (`src/clouds3.py`: density fields marched toward the sun, dark
  bellies, bright shoulders, under-glow, god-rays) - and the sleeping woman, her breath and the bear / swan clouds are sculpted into the same sky.
* **Real trees** (`src/trees2.py`): tapered limbs and crowns built from thousands of sphere-lit leaf dabs (gold on the sun side, blue-green in shade,
  translucent rims), firs as drooping sprays, birches, haze between tiers; islands and hills fade into the dusk, a gold-lit forest closes the garden.
* **The cathedral of two ancient trees** (`src/arch2.py`, `src/pond3.py`): bark shaded per pixel (cylinder normals + relief + moss + lichen) and lit by the lantern,
  the afterglow and the sky; roots stand in the water and are reflected; the canopy carries laburnum, wisteria, hawthorn blossom, ivy, fireflies and
  lanterns rising through the skylight over the girl - colour instead of a green mass.
* **The plank A-frame as a building** (`src/house.py`): weathered boards, shuttered attic window, 24 windows with flower boxes, painted blue doors, steps,
  pots, lanterns, ivy, a woman in white in the nested doorway; bunting with painted folk flowers runs from the maypole to its apex and down its roof edges.
* **Life in every slide** (`src/critters.py`, `src/meadow.py`, `src/flow.py`): swans with cygnets, candle boats heaped with flowers, sky lanterns that drift
  the whole length of the journey, butterflies, fireflies, a doe and her fawn, a seven-flower meadow (poppy, cornflower, ox-eye daisy, buttercup, red clover,
  harebell, foxglove), leaves of many colours on the current, and folk kurbits flowers that start flat and inked and turn real as they flow right.
* Hallway and overhead dance are as in v2 (oxblood corridor, gouache + ink), with the lawn from above now strewn with flowers.

## What v2 changed from v1 (still true)
* **Sideways, line by line.** Every join is a row-by-row changeover (`src/blend.py: stagger_blend`): each scanline switches scene at its own x, nothing is
  blurred away, so both renderings of the same thing interleave in streaks.
* **Same scene, not new scenes.** The birds, the white-robed walkers, the lily pads, the reeds and the cloud-face are one shared list (`src/shared.py`)
  drawn in every style, so they flow through the joins instead of being swapped out.
* **The sun is whole** (slide 1). **Girls in a spiral** (`src/chain.py`, `src/overhead.py`): one line of linked hands walks in from the arch, crosses the water,
  steps ashore and winds round the garlanded maypole; the last slide is the same spiral from above, tail leaving the frame.
* **Painted figures** (`src/fig.py`): skeleton + two-bone arms, pseudo-3D shading, folds, hair strands, flower crown, lantern point-light, rim light, shadows.

## Slides
| | |
|---|---|
| 1-2 | flat dalmalning on plywood: whole sun, kurbits swirls, birds, ring dance, sun's long ray handing over to the moon, star rings |
| 3 | the cloud-face asleep over the dusk lake (folk -> real, row by row); swans, a candle boat, lily pads, walkers on the far shore |
| 4 | the cathedral of two trees standing in the lake; lantern girl in a rowboat; laburnum, wisteria, fireflies |
| 5-8 | the fold (leaf spiral round a folk flower) -> sea of cloud, girls condensing out of mist -> gold lake -> shore; five silk ribbons run from the fold to the maypole |
| 9-11 | the same lake at golden hour: spiral dance round the maypole, bear and swan clouds, the plank A-frame, bunting, wildflower meadow, deer |
| 11-12 | the garden is redrawn in graphite + gouache; the house's planks run on as ruled pencil toward the vanishing point |
| 12-16 | one-point-perspective triangular corridor; vanishing point exactly on the 13|14 cut with a Droste doorway; the girl who turns back; a ring of young people round nothing; the overhead spiral dance |

Horizon row 783 (58 %) throughout. Verified by `src/export2.py`: exact sizes, slides re-assemble into the panorama bit-for-bit, and every border is
within 1.7x of the picture's own column-to-column texture.

## Known limits
Faces are small and stylised at slide scale; the near hallway figures are a little mannequin-like from behind; the bear cloud reads as an animal mainly
by its legs and back; the trees and clouds are painterly-real (leaf dabs, volumetric density), not photographs.
Rebuild: `pip install -r requirements.txt && ./build_all.sh` (~6 min, 4 cores; caches in `work/`, git-ignored).
