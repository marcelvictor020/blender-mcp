#!/usr/bin/env bash
# Render the full short to MP4 and build a side-by-side comparison with the reference.
# usage: tools/make_video.sh [W] [H] [NAME]   (default 1920 1080 "YOUR NAME")
set -euo pipefail
cd "$(dirname "$0")/.."
W=${1:-1920}; H=${2:-1080}; NAME=${3:-YOUR NAME}
REF="${REF_VIDEO:-/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/148f3dbc-ee2b4f2ab0cd127eb40dddb24811df52178a2c65.mov}"
OUT=out/frames_${W}
mkdir -p "$OUT"
# render in 4 parallel chunks (one browser each)
TOTAL=28.375; N=4
for i in $(seq 0 $((N-1))); do
  FROM=$(python3 -c "print($TOTAL*$i/$N)"); TO=$(python3 -c "print($TOTAL*($i+1)/$N)")
  node tools/render.js --w $W --h $H --fps 24 --from $FROM --to $TO --out "$OUT" --name "$NAME" --resume > out/render_chunk$i.log 2>&1 &
done
wait
ffmpeg -v error -y -framerate 24 -i "$OUT/f%05d.jpg" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart out/anime-short.mp4
if [ -f "$REF" ]; then
  ffmpeg -v error -y -i "$REF" -i out/anime-short.mp4 -filter_complex "[0:v]scale=960:540,setsar=1[a];[1:v]scale=960:540,setsar=1[b];[a][b]hstack[v]" -map "[v]" -map 0:a? -c:v libx264 -crf 20 -pix_fmt yuv420p -shortest out/compare_side_by_side.mp4
fi
ls -la out/*.mp4
