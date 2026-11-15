# KAGERŌ — character system spec (3D cel-shaded anime characters in Three.js)

Quality bar: the 3D cel-shaded TV-anime look of the style reference crop
`/tmp/claude-0/-home-user-blender-mcp/8229d8c8-aef9-5285-8382-a60e1e4a76e6/scratchpad/refs3/c1.jpg`
(full video: `/root/.claude/uploads/8229d8c8-aef9-5285-8382-a60e1e4a76e6/5fbe28f6-download_25.mp4`, characters at 0–2 s,
8–14 s, 22–34 s). Match the RENDERING STYLE only (never copy those characters):
- flat cel shading: base + one shadow tone (hard terminator, slight soft edge), cool shadow tint, optional rim light
- clean dark outlines on silhouettes (inverted-hull, ~1.5–2.5 px at 1080p, darker tint of the local colour) + drawn
  face lines (eyelids, brows, nose tick, mouth) on a face texture/shader
- BIG anime eyes: dark upper lid line + lashes, iris with vertical gradient, darker ring, pupil, 1–2 white highlights,
  sclera; eyes are on the face (texture or decal geometry), must blink and look left/right
- small nose (single line/tick), small mouth with mouth shapes (closed, open "a", smile), soft blush ovals
- hair = angular clumped spikes/strands (bangs over forehead, side locks, back) with a highlight band; NOT a helmet
- simple readable clothing shapes with fold lines; proportions ~7 heads tall, slim, anime neck/shoulders
- named joints for posing/animation: root, hips, spine, chest, neck, head, shoulderL/R, elbowL/R, wristL/R, hipL/R,
  kneeL/R, ankleL/R; plus hair-sway, blink, eye-look, mouth-shape, eye-colour (for the crimson transformation)

## Characters (original designs)
- **REN 蓮** (17, male): messy black-navy hair (#1c2233, highlight #3a4a6a) with long spiky bangs falling between the
  eyes, a few strands sticking up, longer nape; grey eyes (#7d8a99) — LEFT eye can turn crimson (#d0182a) with a slit
  pupil + glow; pale skin (#f6dccb, shadow #e0aea0); white short-sleeve summer school shirt open over a dark navy tee,
  black trousers, white sneakers; red string bracelet on left wrist; a thin plaster on the cheek.
- **AOI 葵** (17, female): chestnut bob (#5a3424, highlight #8a5636) with straight bangs and a yellow star hair clip;
  teal eyes (#2f9c9a); sailor uniform: white top, navy collar with one white stripe, red neckerchief, navy pleated skirt,
  white socks, brown loafers.
- **THE COLLECTOR 蒐集者** (adult, tall): long charcoal coat (#2a2a30) to the shins, wide-brim black hat, long pale face
  (#e9e2da) with narrow closed eyes and a thin smile, black gloves; holds a glass jar with a swirling black shadow inside
  (animated, faint red glow).

## Deliverables (anime-short/opening/char/)
- `anime_char.js`: `makeCharacter(core, spec) -> { group, joints, setPose(poseObj), setExpression({blink, lookX, lookY,
  mouth, eyeColorL, pupilSlitL, glowL}), update(t) }` + `toonMaterial`, `outline` helpers; spec-driven so all three
  characters come from it. Deterministic, no external assets.
- `cast.js`: exports `makeRen`, `makeAoi`, `makeCollector`.
- `char_view.html` + review renders: a turnaround sheet per character (front, 3/4, side, back at 1280x720) and a face
  close-up (neutral, blink, smile, Ren crimson-eye). Compare against the reference crop side by side; iterate until the
  face, hair and outline quality would pass in a TV anime OP.
