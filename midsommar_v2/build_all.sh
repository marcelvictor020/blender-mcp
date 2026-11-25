#!/usr/bin/env bash
# Rebuild the whole 16-slide carousel from scratch (~8 minutes on 4 cores). Every stage caches its section in work/.
set -euo pipefail
cd "$(dirname "$0")/src"
python3 folk2.py          # slides 1-3  flat folk world: whole sun, cloud-face asleep, moon, spiral-linked dancers (needs nothing)
python3 world.py          # slides 3-12 ONE sky + far shore + mirrored lake for the pond, the current and the garden (needs nothing)
python3 pond3.py &        # slides 3-8  dusk lake: cloud-face, cathedral of two trees, boat + lantern girl, swans (needs world)
python3 garden_scene.py & # slides 7-12 golden hour: maypole spiral, the plank A-frame, bunting, meadow, deer (needs world)
python3 hall2.py &        # slides 11-15 one-point-perspective hallway, the feast + the overhead spiral dance (3D girls from above)
wait
python3 invite2.py        # slide 10   the house up close: garlanded doorway, the twins at the threshold (needs nothing)
python3 flow3.py          # slides 5-8  the fold, the sunset and the far-shore house, the shore (needs pond + garden)
python3 moon_slide.py     # slide 16    the moon, the sun's night twin
python3 compose2.py       # row-by-row joins, cuts, ribbons to the far house, invitation -> hallway, overhead -> moon, one grade
python3 export2.py        # panorama + slides, with size / re-assembly / border checks
python3 make_sheets.py    # contact sheet + border-check sheet
