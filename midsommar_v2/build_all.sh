#!/usr/bin/env bash
# Rebuild the whole 16-slide carousel from scratch (~8 minutes on 4 cores). Every stage caches its section in work/.
set -euo pipefail
cd "$(dirname "$0")/src"
python3 folk2.py          # slides 1-3  flat folk world: whole sun, cloud-face asleep, moon, spiral-linked dancers (needs nothing)
python3 pond2.py &        # slides 3-7  the same world, painterly-real: cloud-face, boat + lantern girl, arch
python3 garden_scene.py & # slides 7-11 the same lake at golden hour: spiral dance round the maypole, the plank A-frame
wait
python3 flow.py           # slides 5-9  one sideways current carries the pond into the garden (needs pond + garden)
python3 hall2.py          # slides 12-16 one-point-perspective hallway + the overhead spiral dance
python3 compose2.py       # row-by-row joins, garden -> graphite drawing -> hallway, one grade
python3 export2.py        # panorama + slides, with size / re-assembly / border checks
python3 make_sheets.py    # contact sheet + border-check sheet
