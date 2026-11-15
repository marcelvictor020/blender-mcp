# KAGERŌ v2 storyboard (48 s, 160 BPM; beat 0.375 s, bar 1.5 s) — characters in ~70% of shots, motion in every shot

Characters: `opening/char/cast.js` (`makeRen`, `makeAoi`, `makeCollector`; API in the header of `char/anime_char.js`:
setPose / setExpression / update, CHAR_GLOBAL.uRes, U.uLightDir). World: `opening/seg/town.js`, world_* segments, the
original shots (`../shots/shotN.js`), `../vehicles.js`. Timeline: `opening/timeline.js`, FX: `opening/fx.js`.
Style references (check side by side before handing back):
- 3D cel anime OP: `/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/5fbe28f6-download_25.mp4`
- 2000s OP graphics + motion: `/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/bbb3e506-3282886456794155291.mp4`
- Gap list that must be closed: `opening/REVIEW.md`.

| time | id | shot (all with camera motion) | owner |
|---|---|---|---|
| 0–1.5 | g_coldopen | keep | — |
| 1.5–6 | s_crossing | dusk railway crossing (gate arms down, lamps flashing, NO train). Slow pan-UP from Ren's & Aoi's shoes to their faces (Bleach pan-up), they stand side by side; Ren looks up toward the bell; 16:44 overlay | STORY |
| 6–7.5 | s_aoi_hears | Aoi close-up 3/4, hair + collar blowing, eyes widen (she hears the bell), slow push-in, lamp flash on her face | STORY |
| 7.5–9 | s_shadow_moves | low angle on asphalt: Ren's long dusk shadow raises its hand while Ren (legs in frame) stays still; shadow ripples | STORY |
| 9–10.5 | s_collector_car | night: white coupe pop-up headlights ignite; camera dollies to the windscreen: the Collector's smile, jar glinting red on the dash | STORY |
| 10.5–12 | s_whip | Ren turns his head sharply (look-back) + whip-pan smear into the title | STORY |
| 12–13.5 | g_title | keep | — |
| 13.5–15 | c_ren | 3D Ren posed on the red halftone card: slide-in from the right + pan-up feet→face, crimson eye glint, kanji 蓮 | CARDS |
| 15–16.5 | c_aoi | 3D Aoi on bicycle pose sliding left across the teal rings card, kanji 葵 | CARDS |
| 16.5–18 | c_collector + grid | 3D Collector raising the jar on the cream grid card (0.75 s), then a 3x2 Warhol pop-art grid of cast portraits whose colour schemes swap on every beat (0.75 s) | CARDS |
| 18–21 | world_blood_sky | keep, but cut contrast: night-blue base + black + red accent | CLASH |
| 21–24 | s_ghost_platform | ghost train passes; Ren and Aoi in the foreground (backs to camera, cel-lit by the red windows), Aoi grips Ren's sleeve | STORY |
| 24–27 | s_giant | kagerō giant redone as a SOLID dark heat-haze mass with readable silhouette, glowing eyes, embers, refraction; town in front for scale; slow tilt-up | CLASH |
| 27–30 | s_eye | real Ren face: extreme close-up of the left eye neutral→turning→crimson (cracks, angry brows), chain-link shadow drifting, push-in, snare glitches | CLASH |
| 30–42 | clash | 8 cuts on the beat: Ren leap pose with horned aura on the overpass vs the giant; Aoi reaching out (crying, wind); the Collector raising the jar under red sky; impact frames, speed lines, smears; credit cards between (keep g_credit) | CLASH |
| 42–45 | world_meadow_birds | keep | — |
| 45–48 | g_logo | keep | — |

Rules: deterministic in t; ≤ ~8 s/frame at 1280x720; segments export `default { build(core, ctx) => { scene, camera, update(lt, core, seg), post?, fx?(lt) } }`
(see opening/main.js loader); register new segments in timeline.js only for your own rows. Save early and often; never commit.
Before handing back: render ≥3 frames per shot, put each next to a style-reference frame, list what is worse, fix, repeat (≥3 rounds).
