# Summer Overpass — Three.js anime short

A 28.4 s, 8-shot anime-style summer short (railway viaduct at golden hour, vending machines, flower garden,
rural farmhouse, old shop-house, car interior, meadow with egrets) built entirely procedurally in Three.js:
painterly foliage, shader clouds and grass, toon lighting with drifting leaf-shadow dapple, bloom/grade post.

## Watch
- Open `index.html` through any static server (`npx serve .`), or the published player page.
- `?shot=N` plays a single shot; `?name=JANE%20DOE` sets the credit name.

## Render to video (headless, software WebGL)
```
cd tools && npm i && cd ..
tools/make_video.sh 1920 1080 "YOUR NAME"     # -> out/anime-short.mp4 (+ side-by-side if REF_VIDEO is set)
node tools/render.js --shot 3 --times 0,1.5,3  # stills
```

## Layout
- `core.js` engine (materials, foliage, clouds, grass, post), `main.js` timeline/credits, `shots/shot1..8.js` scenes.
- `player.html` is the published-page variant of `index.html`.
- `AGENTS.md` is the brief used by the per-shot builder agents.
