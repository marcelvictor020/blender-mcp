#!/usr/bin/env bash
# Rebuild the whole carousel from scratch (~5 minutes on 4 cores). Each stage caches its section in work/.
set -euo pipefail
cd "$(dirname "$0")/src"
python3 scene12.py   # slides 1-2 (rendered from x=-960, so the far side of the sun is the loop board on slide 10)
python3 water.py     # slides 3-4 (+ the vapour and canopy that cross into slide 5)
python3 meadow.py    # slide 6 (+ the open meadow seen beside the portal on slide 7)
python3 fold.py      # slide 5  (needs water + meadow)
python3 hall.py      # slides 7-10 (needs scene12 for the loop board)
python3 compose.py   # melt every section into the next, grade, border-check sheet
python3 export.py    # panorama + slides, with size / re-assembly / seam checks
