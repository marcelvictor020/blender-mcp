# Anime short — Three.js recreation: guide for shot builders

Goal: recreate a 28.4 s, 8-shot, Shinkai/Ghibli-style 3D anime short (Blender NPR look) in Three.js,
matching each reference shot's **framing, composition, palette, lighting and motion** as closely as possible.

## Layout
- `core.js` — shared engine (do **not** edit; copy & adapt code into your shot file if you need a variant).
- `main.js`, `index.html` — player/timeline/credits (do not edit).
- `shots/shotN.js` — one file per shot. **You own only your shot file.**
- `shots.json` — timeline + reference timestamps (do not edit).
- `ref/sNa.jpg, sNb.jpg, sNc.jpg` — reference frames (1280x720) at start / middle / end of shot N.
- Original video (for extracting more frames): `/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/148f3dbc-ee2b4f2ab0cd127eb40dddb24811df52178a2c65.mov`
  e.g. `ffmpeg -v error -y -ss 5.2 -i "$V" -frames:v 1 -vf scale=1280:-1 out/sN_extra.jpg` or crops with `-vf crop=w:h:x:y` (source is 1920x1080) to study details.

## Workflow (iterate until it matches)
```
cd /home/user/blender-mcp/anime-short
node tools/render.js --shot N --compare        # -> out/cmp_sN.jpg  (top row = reference, bottom = ours, at the 3 ref times)
node tools/render.js --shot N --compare --frame b   # single pair, bigger detail
node tools/render.js --shot N --times 0,1.5,3  # stills -> out/sN/t*.jpg (1280x720) — view them with the Read tool
```
Then `Read` the jpg to look at it. Each compare takes ~10–40 s (software WebGL, other agents share the CPU).
Iterate many times: framing first (camera position/FOV/lookAt so big shapes land on the same pixels),
then major shapes & silhouettes, then palette/values, then lighting/shadows, then details & animation.
Check the console errors printed by render.js — fix any you cause.

## Shot module contract
```js
export default {
  duration: 3.0,                                   // must match shots.json
  credit: { role: 'CONCEPT AND DESIGN', cx: 0.297, ry: 0.51, ny: 0.556 } | null,  // block centre x, role-line y, name-line y (fractions of frame)
  post: { bloom, bloomRadius, bloomThreshold, exposure, contrast, saturation, lift:[r,g,b], gamma:[r,g,b], gain:[r,g,b], vignette, grain, ca, leak, leakPos:[x,y], soft },
  build(core) { ...; return { scene, camera, update(t, core) {} } },   // t = local shot time in seconds (0..duration)
};
```
- Credits are rendered by the page (DOM text) — you only set role + position. Name is a global placeholder.
- `core.shared` uniforms (uTime, uSunDir, uDapple, uDappleScale, uDappleSpeed, uDappleCover, uFog*) are **global across shots**:
  **set every shared value your shot relies on inside `update()`** (not just build), because other shots' builds overwrite them.
  `lightRig()` writes `shared.uSunDir` — re-assert it in update.
- Everything must be deterministic in `t` (use `core.rng(seed)`, never Math.random; animation only from `t`).
- Camera is a `THREE.PerspectiveCamera`; aspect is forced to 16:9. Static cameras unless the reference moves.
- Performance budget: ≤ ~4 s per frame at 1280x720 in this software renderer when uncontended. Keep instance counts sane
  (grass ≤ ~60k blades, foliage ≤ ~20k cards per mesh, a few meshes). No external assets/network: everything procedural
  (canvas-drawn textures via `core.paintTexture`/`canvasTexture`, shaders, primitive geometry).

## Engine building blocks (core.js)
- `toon({color, map, dapple=true, fog=true, side, transparent, emissive...})` — MeshToonMaterial with 3-step ramp, optional
  dappled leaf-shadow cookie (`shared.uDapple` strength 0..1, `uDappleScale`, `uDappleCover` 0..1 fraction shadowed, `uDappleSpeed`), aerial fog.
- `lightRig(scene, {sunDir, sunColor, sunIntensity, sky, ground, hemiIntensity, ambient, ambientIntensity, shadows, shadowBox, target})`.
  Real shadow maps work (`shadows:true`, then set `mesh.castShadow/receiveShadow`).
- `makeSky({zenith, mid, horizon, haze, horizonY})` — gradient dome.
- `makeCloud({w, h, seed, kind:'cumulus'|'stratus'|'wisp', light, mid, shadow, lightDir:[x,y], puffs:[[x,y,r],...], opacity, edge, detail, billboard})`
  — painted cloud on a plane (x in plane-width units −0.5..0.5, y/r in plane-height units). Place far away, face camera.
- `makeFoliage({clumps:[[x,y,z,r],...], density, cardSize, kind:'small'|'broad'|'round'|'needle', dark, mid, light, highlight, wind, fog, fogColor, shell, lightWrap, terminator, sizeJitter, flatten, texSeed, seed})`
  — painterly anime foliage: camera-facing leaf cards lit by spherical clump normals into 4 tones. `kind:'broad'` for big foreground leaves.
- `makeTree({...})`, `makeGrass({x0,x1,z0,z1,y,count,h:[min,max],w,base,tip,dark,light,wind,patch,bend,lean,fog,heightFn})`.
- `makeWire(a, b, {sag, radius, color})`, `box(w,h,d,mat,x,y,z)`, `cyl(rt,rb,h,mat,x,y,z)`.
- `makeMotes({count, box, size, color, opacity})` (floating dust/pollen), `makeButterflies({count, box, size, color, glow})`.
- `leafTexture`, `chainLinkTexture(cells, wire)`, `softDotTexture`, `paintTexture(key,w,h,(g,w,h,rnd)=>{})` for canvas-painted textures
  (signs, vending-machine fronts, windows, wood planks, kanji lanterns, etc.). Use `{srgb:true}` for colour maps (default).
- Helpers: `rng, lerp, clamp, smooth, col, NOISE_GLSL` (hash12/vnoise/fbm/fbm3 GLSL), `THREE`, `mergeGeometries`.
- Colours: pass sRGB hex strings sampled from the reference (they are converted to linear internally); post applies
  sRGB output + grade. Sample reference colours with e.g.
  `python3 -c "from PIL import Image; im=Image.open('ref/s2b.jpg'); print(im.getpixel((640,300)))"` (PIL is available if installed; otherwise use ffmpeg crop + Read).

## Style notes (what makes it read as the reference)
- Painted anime look: flat-ish toon shading with 2–3 value bands, **cool blue/purple shadows**, warm sunlight, crisp silhouettes,
  hand-painted textures with low-frequency colour variation, strong saturated sky gradient, puffy cumulus clouds.
- Foliage is the hero: layered clumps with dark interior, mid, light rim and yellow-green highlights; silhouettes made of leaf shapes.
- Subtle life: leaf sway, dappled shadow drift, floating dust motes/pollen, glowing butterflies, gentle bloom.
- Do not commit or push — the coordinator integrates.

## REALISM PASS (current priority — supersedes the "painted card" approach)
The user's verdict: houses, props, ground and grass look flat/"mid" — painted cards and unlit shaders. The original is a
proper 3D render (Blender): real modelled geometry, physically based materials, real cast shadows + contact shadows,
ambient occlusion in crevices, reflections, textured surfaces with relief. Match THAT, while keeping every shot's framing,
composition, palette and motion exactly as now (do not move the camera; big shapes stay on the same pixels).

Use `pbr.js` (see header) — the same toolkit that rebuilt the cars in shots 4/5 (`vehicles.js` is the worked example):
- `const u = pbrUniforms({ sunDir, leafAmt, leafCover, leafScale, leafSharp, sunGain, rimAmt })` — one uniform block per shot.
- `pbr(u, { color, map, normalMap, roughnessMap, roughness, metalness, envMap, ... })` → MeshPhysicalMaterial with leaf-shadow
  dapple on direct light (set leafAmt>0 for shade under trees), rim light, grime. Use real UVs + `texSet()`/`heightNormalMap()`
  for wood planks, roof tiles, concrete, corrugated metal, asphalt, rust, peeling paint, etc.
- `makeEnvMap(key, {...})` for reflections/ambient; `addSunShadow(scene, {...})` for a shadow-casting sun; set
  `mesh.castShadow = mesh.receiveShadow = true` on modelled geometry. Ground that must show shadows must be a lit material
  (pbr) or use a ShadowMaterial catcher.
- Model real geometry: plank boards (instanced boxes with jitter), kawara roof tiles (instanced curved tiles in rows),
  eaves + rafters, window frames + glass + interiors, lattice slats, corrugated sheets (sine-displaced planes), pipes,
  gutters, poles with crossarms/insulators/transformers, vending machines as boxes with recessed glass, buttons, coin slots,
  product rows behind glass, signs with thickness and bolts, concrete with chamfers and stains, railings as tubes.
- Grass: denser, wider, curved blades with per-blade normals lit by the sun (+ translucency when back-lit),
  darker AO toward the roots, colour variation per clump, tips catching light, wind gusts. It must read as lush real grass
  in the original's painted-anime palette.
- Painterly foliage (makeFoliage) can stay but may be improved (more leaf-shape detail, depth layering).
- Budget: ≤ ~8 s/frame at 1280x720 uncontended. Keep `update()` re-asserting shared uniforms.
- Do NOT touch the vehicles in shots 4 and 5 (they are done) other than to make sure they still sit correctly.
