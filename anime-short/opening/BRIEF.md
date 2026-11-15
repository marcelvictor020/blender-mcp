# 陽炎 KAGERŌ — original anime opening / trailer (48 s, Three.js)

## Premise (original IP — no existing characters, logos or names)
Hinode-chō, a sleepy rail town where summer never ends. Every day at **4:44 PM** the railway crossing bell rings
with no train coming. Whoever hears it sees their shadow move on its own. *Kagerō* (heat-haze spirits) wear the
shadows of ordinary things — vending machines, trains, the white coupe — and hunt people at dusk.
- **REN 蓮** (17) — works at his grandmother's old shop-house (the one with the 串焼 lantern). His shadow devours a
  kagerō; his LEFT eye turns crimson and his shadow becomes a horned "kage-oni" form.
- **AOI 葵** (17) — rides the yellow bicycle; the only one who can see the bell ring. Bob hair, school uniform.
- **THE COLLECTOR 蒐集者** — drives the white 80s coupe; long coat, wide hat; collects people's shadows in jars.
Tone: summer nostalgia that curdles into dark horror (Chainsaw-Man/Tokyo-Ghoul-like intensity: eye close-ups, red
cracks, fence shadows over faces, blood-red skies) cut with a loud, fun, graphic-design opening style (pop colour
blocks, diagonal stripes, giant kanji, character cards, logo slam) — like a classic 2000s OP played on a CRT.
Characters are shown as **stylised silhouettes / graphic shapes** (flat colour, rim light, hair/coat shapes) and
**procedural anime eye close-ups** — no detailed faces needed.

## Timeline — 160 BPM, 1 bar = 1.5 s, 32 bars = 48.0 s (cuts land on beats)
| bars | time | section | content |
|---|---|---|---|
| 1–4 | 0–6 | COLD OPEN | black; crossing bell "kan-kan"; small text `16:44`. High new angle over the golden-hour railway town, train crossing the viaduct (shot 1 world, new camera). Cicadas. Sad music-box motif. |
| 5–8 | 6–12 | WORLD | beat-cut montage of the town from NEW angles: vending-machine row from the side at dusk; meadow at grass level with the white egret taking off; the shop-house lantern flickering on at blue hour; the white coupe's headlights popping up at night. Riser. |
| 9–12 | 12–18 | DROP + TITLE | band hits. Diagonal stripe wipes (red/cream/teal), title card **陽炎 KAGERŌ** slams in, impact flash, then 3 character cards (REN / AOI / THE COLLECTOR) as bold silhouettes on loud patterned backgrounds (dots, stripes, grids) with big kanji names, 1 bar each. |
| 13–20 | 18–30 | THE TURN | sky floods blood red; the vending machine's shadow peels off the ground into a tendrilled creature; a black ghost train with red windows passes over the viaduct; crossing gate arms come down; extreme close-up of Ren's eye — iris bleeds to crimson, pupil splits, red cracks spread; chain-link fence shadow across the eye; glitch/chromatic hits on snares. |
| 21–28 | 30–42 | CLASH | Ren's silhouette on the overpass, horned shadow aura erupting; a giant heat-haze kagerō towering over the town; speed lines, impact frames (black/white inverted single frames), fast cuts every 2 beats; credits in pop typography on colour blocks. |
| 29–32 | 42–48 | OUTRO | sudden quiet: top-down meadow, one white bird and one black bird flying apart (callback); final logo **陽炎 KAGERŌ** with a red sun, CRT power-off. |

## Tech
- New folder `anime-short/opening/` (its own `index.html`, `main.js`, segments). Reuse the existing engine
  (`../core.js`, `../pbr.js`, `../vehicles.js`) and **reuse existing world shots** by importing `../shots/shotN.js`,
  calling `build(core)` and then replacing/moving the camera to a NEW angle (plus new lighting/grade: dusk, night, red).
  Choose angles where painted cards don't break; add geometry/fog where needed.
- Timeline = list of segments `{ start, dur, kind, ... }` in seconds aligned to the 160 BPM grid; each segment renders a
  3D scene or a 2D graphic card. Deterministic in t. Fixed 1920x1080 output; render with a copy of `../tools/render.js`.
- Post FX available to every segment: grade presets (golden, dusk, night, blood), chromatic aberration, glitch slices,
  impact frame (invert / pure black-white), speed lines, film grain, CRT scanlines + curvature (outro / title).
- 2D graphics: canvas textures + shaders on fullscreen quads; fonts: Montserrat (`../fonts/`) + bold system CJK fallback.
- Music: `opening/audio/theme.wav` — original dark J-rock opening (see agent brief), 48.0 s, cut-synced SFX.
- Keep each frame ≤ ~8 s to render at 1280x720 in SwiftShader. Save work early and often. Never commit.
