# Midsummer carousel v6 - seventeen slides, one world

`panorama_18360x1350.png` is the lossless master; `slides/slide_01..17.jpg` are the cuts (1080 x 1350, swipe left to right).
`python3 slice_panorama.py` re-cuts PNG slides from the master. `contact_sheet.jpg` shows all sixteen; `border_check.jpg` shows every border
with a red hairline on the cut. Everything is generated in code (numpy + cairo + OpenCV) - no image-generation model, no copied reference.

## What v5 changes (more realism: reflections, perspective, real shade)
Studied what painters do to make a picture read as real - lost-and-found edges, a core shadow and reflected light inside every shadow, cast shadows with
soft penumbras, water darker and softer than what it mirrors, atmospheric perspective, cumulus built from cauliflower crests with dark creases and
warm rims - and applied it:
* **Shadows obey perspective** (`util.sun_shadow_dir`, `chain.py`, `garden_scene.py`): shadow lines are parallel in 3D, so in the picture they radiate from the point
  on the horizon under the sun. Every girl, the maypole and the avenue posts cast long, soft, blue-violet shadows along those lines - over the sea of cloud
  in slide 7, over the meadow and across the mown path in slides 9-10 (they also darken the flowers and grass tips they fall on).
* **A one-point-perspective avenue** (`garden_scene.lantern_posts`): painted oxblood posts with lanterns and bunting run to the door, spaced by the same
  ground-plane mapping as the path and the meadow.
* **Reflections** (`src/reflect.py`): ribbons, lanterns and butterflies are mirrored into the lake with the same ripple slicing as the sky; the lake is
  darker and softer than the sky it mirrors; water keeps its ripples through the ink finish.
* **Lost-and-found edges** (`ink.py`): the ink contour is drawn on the shadow side of a shape and fades out on the lit side, in a dark tone of what it encloses;
  the finish flattens less (0.66) so skies keep their gradations.
* **Sea of cloud** (`flow2.cloud_sea`): large billows with ridged crests, cool creases, warm rim light and haze toward the horizon.
* **Girls** are rendered at 3x supersampling with an unsharp pass where solid, are paler and bluer with distance, and outlined only on their shadow side;
  birds always show their wings (no more dark beans).

## What v6 changes (a new slide, a house that is not paper, one unique thing per slide)
* **Slide 11, THE INVITATION (new).** The house is behind us. In the same meadow, under the same sky and forest, two girls in white stand hands clasped in front of
  a garlanded A-frame gate - the first of ten nested triangular frames (the hallway's own shape, still outdoors, lit by painted posts, bunting and flowers) that
  run away to a golden light on the horizon, where the yellow house waits very small with its blue doors open. Their smiles are far too wide and even, their pale
  eyes do not blink, one brow a hair higher (`fig.py: creep`); their outer hands curl in the old gesture for *come here*; long blue-violet shadows run from their
  feet along the sun's perspective fan. `src/invitation.py`. The garden grew by one slide, so the drawing and the hallway moved right by 1080 px (`util.SHIFT`).
* **The house looks like wood and glass** (`src/house.py`): every board has its own tone, grain, bevel, butt joints, nail pairs with rust runs and the odd knot;
  every window is set *into* the wall - drip cap, bevelled casing, dark left reveal and sunlit right reveal, sloping sill, flower box with geraniums, louvred
  blue shutters with a heart - and the glass shows a room (lamp, beam, shelf, curtains lit from behind, in two windows a pale girl standing very still), the sky,
  clouds and the dark tree-line mirrored in it, diagonal sun glare, a hot spot and flare on the sunward windows, and a spill of lamp-light on the boards. Every
  overlay casts a soft shadow on the planks; the doors have brush streaks, a gloss band and chipped paint; the doorway's light pools on the steps. No two windows overlap.
* **One unique thing per slide:** 1 the whole sun with a face; 2 the sleeping moon and star rings; 3 the sleeping woman in the cloud, blossom petals on the lake;
  4 the cathedral of two trees with wisteria and fireflies; 5 the fold - leaves curl into a spiral round a folk flower, five silk ribbons are untied from it;
  6 the lake becomes a sea of cloud and the girls condense out of the mist; 7 the whole setting sun, its glitter path, the girls walking on the cloud;
  8 the lantern girl's own boat, empty, moored where the water ends, and flowers where each girl stepped ashore; 9 the maypole, the ribbons arriving, bunting,
  the bear cloud; 10 the house; 11 the invitation; 12 an open-eyed moon being drawn with compass and ruler as the world turns into a drawing; 13 the half-drawn meadow
  and the first doorframe; 14-16 the hallway (its light patches now show the window's panes and soften with distance); 17 the maypole from above, its ten
  ribbons running to the dancers' hands.
* The sun is drawn last (`clouds3.sun_overlay`, `compose2`) so no blend or drag can bend it: one round disc.

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
| 9-10 | the same lake at golden hour: spiral dance round the maypole, bear and swan clouds, bunting, wildflower meadow; the plank A-frame with its lantern-post avenue |
| 11 | the invitation: two smiling girls at a garlanded gate whose frames run to a golden light (the same background as the house) |
| 12-13 | the meadow is redrawn in graphite + gouache (open-eyed moon, ruled transversals and orthogonals to the vanishing point), then the first doorframe |
| 13-17 | one-point-perspective triangular corridor; vanishing point exactly on the 14|15 cut with a Droste doorway; the girl who turns back; a ring of young people round nothing; the overhead spiral dance |

Horizon row 783 (58 %) throughout. Verified by `src/export2.py`: exact sizes, slides re-assemble into the panorama bit-for-bit, and every one of the 16 borders is
within 1.7x of the picture's own column-to-column texture.

## Known limits
Faces are small and stylised at slide scale; the near hallway figures are a little mannequin-like from behind; the bear cloud reads as an animal mainly
by its legs and back; the trees and clouds are painterly-real (leaf dabs, volumetric density), not photographs.
Rebuild: `pip install -r requirements.txt && ./build_all.sh` (~6 min, 4 cores; caches in `work/`, git-ignored).
