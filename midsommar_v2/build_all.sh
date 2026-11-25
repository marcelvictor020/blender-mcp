#!/usr/bin/env bash
# Rebuild the whole 16-slide carousel from scratch (~15 minutes on 4 cores). Every stage caches its section in work/.
set -euo pipefail
cd "$(dirname "$0")/src"
python3 folk2.py          # slides 1-3  flat folk world: whole sun, cloud-face asleep, moon, spiral-linked dancers (needs nothing)
python3 world.py          # slides 3-12 ONE sky + far shore + mirrored lake for the pond, the current and the garden (needs nothing)
python3 pond3.py &        # slides 3-8  dusk lake: cloud-face, cathedral of two trees, boat + lantern girl, swans (needs world)
python3 garden_scene.py & # slides 7-12 golden hour: maypole spiral, the plank A-frame, bunting, meadow, deer (needs world)
python3 hall2.py &        # slides 12-16 one-point-perspective hallway + the overhead spiral dance
wait
python3 flow.py           # slides 5-9  one sideways current carries the pond into the garden (needs pond + garden)
python3 compose2.py       # row-by-row joins, garden -> graphite drawing -> hallway, one grade
python3 export2.py        # panorama + slides, with size / re-assembly / border checks
python3 make_sheets.py    # contact sheet + border-check sheet
