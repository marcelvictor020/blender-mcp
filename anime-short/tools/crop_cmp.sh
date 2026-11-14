#!/usr/bin/env bash
# Close-up compare: tools/crop_cmp.sh SHOT LOCAL_T CROP(w:h:x:y in 1920x1080) OUT.jpg
set -e; cd "$(dirname "$0")/.."
S=$1; T=$2; C=$3; O=$4
REF="${REF_VIDEO:-/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/148f3dbc-ee2b4f2ab0cd127eb40dddb24811df52178a2c65.mov}"
START=$(python3 -c "import json;print(json.load(open('shots.json'))['shots'][$S-1]['start'])")
GT=$(python3 -c "print($START+$T)")
node tools/render.js --shot $S --times $T --w 1920 --h 1080 --out out/crop_s$S 2>&1 | grep -iE "error|ms ->" | head -5
F=out/crop_s$S/t$(python3 -c "print('%.3f'%$T)").jpg
ffmpeg -v error -y -ss $GT -i "$REF" -frames:v 1 -vf "crop=$C" out/_refcrop.jpg
ffmpeg -v error -y -i "$F" -vf "crop=$C" out/_ourcrop.jpg
ffmpeg -v error -y -i out/_refcrop.jpg -i out/_ourcrop.jpg -filter_complex "[0][1]vstack" -q:v 3 "$O"
echo "$O (top = original, bottom = ours)"
