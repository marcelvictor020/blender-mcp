# Midsummer carousel v9 - sixteen slides, one world

`panorama_17280x1350.png` is the lossless master (`.jpg` for sharing); `slides/slide_01..16.jpg` are the cuts (1080 x 1350, swipe left to right).
`python3 slice_panorama.py` re-cuts PNG slides from the master. `contact_sheet.jpg` shows all sixteen; `border_check.jpg` shows every border
with a red hairline on the cut. Everything is generated in code (numpy + cairo + OpenCV) - no image-generation model, no copied reference.

## What v9 changes (slide 10: it is the house, and we are going in)
Feedback: slide 10 (the invitation) stood in an empty meadow and looked like another scene - where is the house? - the garland detail is good but should be the *house's*
entrance, seen closer, going inside; and the "Christmas lights" needed real detail (beads, red lights).
* **Slide 10 is now the house up close** (`src/invite2.py`, `house.render_house_k`). The same plank house as slide 9, drawn again at 2.8 times the size - every board, joint,
  nail and knot, every window with its glass and shutters, both blue leaves with the painted folk flower, the lit wall lanterns, the steps - not an enlarged picture; the
  same windows are lit and the same flower boxes hang where they hang in the distant view. Eye level (row 783) is 70% of the way up the door, the girls' eyes are on it.
* **The garlanded corridor is the open doorway.** The first of its ten frames IS the door frame: posts wrapped in veined leaves and real flowers (poppy, cornflower, ox-eye,
  buttercup), a wreath at the apex, garlands of **glass beads** (red, gold, pearl, cornflower) looped along the posts and hanging in three strands with tassels, strings of
  little **lamps** (warm white, amber, **red**) wound round every post, a lantern deeper in, bunting between the wall lanterns over the door. Inside: oxblood roof planes,
  a honey floor strewn with petals, lit windows like the hallway's, nine more frames running to the golden light - the corridor of the next slide.
* **The twins stand on the top step at the threshold**, hands clasped, outer hands waving you in, butterflies on them, fireflies in the long grass.
* **Joined both ways.** Slide 9's far house melts row by row into the close one (`compose2`, zone 9400-9960) and one string of bunting runs from the far house's roof edge
  across the border into the close-up's lantern and on over the door. **The wall goes on into slide 11**: it is sketchified (`sketch.sketchify`, graphite + gouache, lifted
  toward paper) and becomes the outdoor side of the hallway's first frame; its plank rows are ruled on as perspective lines to the corridor's vanishing point, so the boards
  of the house become the corridor. The close-up has its own ink-and-gouache finish (the same `ink.finish` as slides 7-9). Slides 1-9 and 12-16 are unchanged.

## What v8 changes (everything must connect - the ending, and the way pictures hand over)
Feedback after v7: the last picture did not blend into the night; the dance should go from the evening outside the house to the night of the moon, still circling;
everything should be joined the way the tree is (one object that really crosses the border), not two pictures dissolved into each other; more realism.
* **The camera tilts up (slides 15-16, `overhead.tilt_to_horizon`).** The dance is seen from straight above on the lawn outside the house. Past the ring every column
  of the picture is imaged by a lens a little more level than the one before: the lawn bends up and squashes toward the distance (its flowers, shadows and haze), the
  horizon comes down into the frame with the last line of light on it, the stars come out, and the night sky of the moon slide *is* that sky (`moon_slide.base_night`
  gradient, lowered so its glow sits on this horizon). The moon's own light crosses the border the other way: long soft shafts run from its petals over the lawn
  (`compose2.moonbeams`), and the sky lanterns the dancers sent up (seen from above on the lawn) drift into the moon's sky as lanterns seen from the side.
* **Evening to night, continuously (`overhead.light_terms`, `tod_curve`).** The golden hour of slide 14 (low sun, long shadows down-right, the laid feast table lit by its
  candles) becomes dusk round the dance and moonlight at the end: ambient sky, low sun and moon are mixed per column, the shadows swing from the sun's direction to the
  moon's, each girl is lit by her own place in the evening (`girl_light`: warm key, cool bounce, a cool rim by night), the candles, fireflies and lanterns come on.
* **More real girls** (`body3d.py`): hair is long wandering strands in clumps that radiate from a parting when seen from above, a smoother back mass, flyaway hairs,
  fine brow hairs, a shaded eyeball with a lid crease, a rounder face; wreaths are irregular, petals are petals; overhead girls look at the pole or past it, their
  hands clasp, their skirts have pleats; the flower meadow clusters the way real meadows do and the lawn is made of single blades.
* **Joins:** every row-by-row melt first matches the two pictures' *colour fields* (`blend.lowfreq_match`; for the folk lake the lake's edge colour is carried left so the
  navy water warms toward it before the border) so that only detail changes, never a step of colour; zones start and end pure (no rectangles); at the moon the sky is one
  gradient in both pictures, so it simply changes hands in a short feather (the moon's petals are never cut) and only the ground melts row by row; one more string of
  bunting runs from the house across the 9|10 border to the gate finial.

## What v7 changed (the final pass)
Feedback: the tree on 4 must blend into 3; fewer girls on the lake; a shorter ribbon and no ribbons held in the overhead dance; no moon page before the house -
end on the moon instead; the sea-of-cloud page is dull - get to the sun at once and give it something to reflect; the overhead dance whole, centred and in
one picture; the girls must look like people; the smile creepier but not forced. What was done:
* **The tree blends into slide 3 as it does into slide 5.** The left bough, its wisteria and blossom now sweep across the 3|4 border and hang over the cloud-face
  lake (`arch2.py` / `pond3.py`: `BR_OUT`, `AX0,AW`); the join is the same row-by-row melt (`blend.stagger_blend`, which now ramps in and out so a zone
  always starts pure A and ends pure B).
* **The sea-of-cloud page is gone** (a 600 px row-by-row melt from the fold straight into the sunset: slide 5 -> 6). The ribbons and the sunset sky are
  untouched; the sun is hidden behind **a far-shore house** (the same plank A-frame, very small, in front of the sunburst) and its **reflection** replaces the
  second sun (`world.far_island_house`). The ribbons are short and arrive at its finial (`ribbons.py`, drawn in finished coordinates, `compose2`).
* **Far fewer girls on the lake**: of the 44-girl chain only 14 remain (`chain.KEEP`) - a few walkers on the water, spaced so none collides with a ribbon, a boat or a border, and five who step ashore into the dance.
* **No moon page before the house.** The invitation (two girls at the gate) melts straight into the first doorframe of the hallway; the carousel ends on
  **THE MOON** (`moon_slide.py`) - slide 1's sun painted again at night with the same plywood, kurbits and star rings. Its face is awake: pale eyes, small
  pupils, the girls' too-wide smile in one even row. Below it the ring dance goes round its pole and one small dancer has stepped out of the ring to look at you.
* **The girls are real volumes** (`src/body3d.py`, signed-distance bodies sphere-traced from front, side, back and from above): key light, soft shadow, ambient
  occlusion, skin wrap, linen weave and translucency, strand-lit hair with locks and a tapering end, a face painted onto a head with cheeks and a jaw, two-bone
  arms with 3D targets, a puffed folk blouse, an embroidered hem. The men were redesigned (belted tunic, tapered trousers, shoes). `fig.render` uses it everywhere.
  Falling petals are petals now (pointed, curled), not beige discs.
* **The twins** (slide 10) hold hands, their outer hands wave you in, their heads lean toward each other, and the smile is held perfectly still: too wide by a third,
  one even row of upper teeth, no crow's feet, eyes wide and level, one brow a hair higher.
* **The overhead dance is one picture** (slide 15, `overhead.py`, `hall2.board`): a spiral of 3D girls seen from above with a wide camera, arms stretched to their
  neighbours, wreaths and long shadows round a garlanded pole; **no ribbons are held**. Slide 14 leads into it with the procession walking out of the house along
  the lawn past **the feast, laid and waiting** (`overhead.feast_table`: cloth with a red-and-blue folk border, twenty-two places, bread, strawberries, jugs of
  wildflowers, a bench each side - nobody is sitting down yet). The night takes over only in the last 300 px (`compose2`).
* **The hallway** was re-centred (vanishing point on the middle of slide 12), the figures are lit 3D people, a ladder-back chair stands in the last doorway
  (`props3d.py`), and the petals on the boards are pointed petals with contact shadows.

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
| 3 | the cloud-face asleep over the dusk lake (folk -> real, row by row); the tree's bough, wisteria and blossom arrive from the right; swans, a candle boat |
| 4 | the cathedral of two trees standing in the lake; lantern girl in a rowboat; laburnum, wisteria, fireflies |
| 5 | the fold: the arch's leaves curl into a vine spiral round a folk flower; five silk ribbons are untied from it |
| 6 | the sunset with its god-rays; the ribbons run to the far-shore house and its reflection; a few girls standing on the water |
| 7-8 | the shore: girls walk out of the lake and wind round the maypole; bear and swan clouds, bunting, the empty boat |
| 9 | the plank A-frame with its lantern-post avenue and bunting; the camera walks up to it (the close view melts in on the right) |
| 10 | the house up close: its garlanded, beaded, lamp-strung doorway is the corridor's first frame; the twins on the step, hands clasped |
| 11 | the wall of the house turns into a graphite drawing and the corridor begins |
| 12-13 | one-point-perspective triangular corridor; the girl who turns back; a ring of young people round nothing; the chair in the last doorway |
| 14-15 | out of the house on to the lawn in the golden hour: the laid feast, the procession, then the whole spiral dance seen from above at dusk; the camera tilts up past the ring |
| 16 | the lawn meets the night horizon; the moon, the sun's twin, awake, its light running across the lawn; the ring dance below, one dancer has stepped out of it |

Horizon row 783 (58 %) throughout. Verified by `src/export2.py`: exact sizes, slides re-assemble into the panorama bit-for-bit, and every one of the 15 borders is
within 1.7x of the picture's own column-to-column texture.

## Known limits
Faces are small at slide scale (zoom in and they are painted, not photographed); hallway figures seen from behind are simple; the bear cloud reads as an animal mainly
by its legs and back; the trees and clouds are painterly-real (leaf dabs, volumetric density), not photographs. The v6 text below describes the 17-slide layout - slide
numbers there are the old ones.
Rebuild: `pip install -r requirements.txt && ./build_all.sh` (~8 min, 4 cores; caches in `work/`, git-ignored).
