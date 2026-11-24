# Mareva Amphibia: interactive amphibious hypercar

A Three.js / WebGL 2 exhibition of three original amphibious hypercars on a
Mediterranean coastline. Every car mechanically transforms from road car to
foiling watercraft. You can drive it on the coast road, take it down the
marina slipway into the sea, and foil along the cliffs.

No build step and no binary assets. All geometry, textures and materials are
generated procedurally at start-up. Three.js r170 is loaded from jsDelivr
through an import map.

```
node tools/serve.mjs 8080      # then open http://localhost:8080
```

Any static file server works (for example `python3 -m http.server`). The page
needs a WebGL 2 capable browser.

## The three designs

| | Thalassa GT | Nereid R | Halcyon S |
|---|---|---|---|
| Layout | front-mid V12 grand tourer | mid-engine hybrid V8 | electric speedster |
| Doors | dihedral | scissor | butterfly |
| Roof | retractable hardtop stows under the rear deck | sliding glass bubble canopy | carbon targa panel |
| Details | louvred bonnet, Kamm tail | glass louvred engine cover, active wing that folds flush at sea | teak rear deck, twin headrest fairings |

## How the transformation works

All motion is driven by scalar states, so the sequence can be paused, scrubbed
and reversed at any point. Each subsystem can also be cycled on its own.

1. **Seal.** Doors, bonnet and deck close. Nereid's wing folds flush.
2. **Sponsons.** The lower body sills are real body panels cut from the same
   lofted surface as the shell. Multi-stage telescopic struts push them out and
   roll them so their flat inner faces become teak decks. The deck plane comes
   from the panel's mean normal, so it ends up exactly level. Opening them
   exposes the carbon bays behind.
3. **Arms.** Each wheel sits on a three-stage telescopic arm that pivots on the
   carbon spine. The arm extends from 0.55 m to 1.55 m. A hydraulic ram with a
   coil spring, which is also the active suspension on land, drives it, and a
   braided line and an orange HV cable follow it.
4. **Pods.** The hub carrier yaws 90°, so the wheel's axle points along the
   direction of travel.
5. **Impellers.** The spokes are variable-pitch blades. They twist into
   impeller pitch, and the tyre and rim become the duct of a rim-shrouded
   thruster. A titanium sleeve with stator vanes slides aft to lengthen the
   duct, a spinner telescopes forward, and a tail cone extends from the hub
   motor.
6. **Foils.** Telescoping hydrofoils extend from root stubs under each pod.
   When the car is fast enough, the arms extend further. The flight
   controller holds the foils about 0.45 m deep, so the hull rises clear of
   the water. The trailing-edge flaps visibly follow the controller.

The car transforms automatically when it floats off the slipway, and turns
back into a car when it reaches the shallows. Above about 18 kn the foils
deploy automatically. Both behaviours can be switched off in **Systems**.

## Physics

`js/physics/vehicle-physics.js` integrates a 6-DOF rigid body at 120 Hz.

- **Land:** four spring/damper wheels raycast against the terrain, road,
  quay and slipway, with a friction-circle tyre model, speed-sensitive
  steering, AWD drive, aero drag and downforce.
- **Water:** 44 buoyancy columns are sampled against the *same* Gerstner
  surface the GPU renders, plus the deployed sponsons, so swell pitches and
  rolls the car. Hull drag is anisotropic and uses the waves' orbital water
  velocity. Hull resistance includes a wave-making hump. Planing lift, keel
  yaw damping, and vectored and differential pod thrust are also modelled.
- **Foils:** lift is 0.5ρv²S·C_L and is lost to ventilation near the surface.
  Each foil has its own depth controller and banks into turns. Induced and
  profile drag are included.

## Water

`js/env/ocean.js` renders a camera-centred polar grid. The Gerstner swell has
per-wave distance fades, and the waves shoal and are sheltered by the depth
and breakwater (data baked from the terrain). The shader adds:

- planar reflections;
- screen-space refraction with Beer–Lambert absorption along the true view
  path through the water, which gives turquoise shallows and deep blue
  offshore;
- subsurface glow in backlit crests;
- sun glitter;
- shoreline and hull-contact foam from scene depth, and whitecaps from the
  surface Jacobian.

From below, the surface shows Snell's window and total internal reflection.
Sunlight caustics animate on the sea bed.

`js/fx/wake.js` runs a vehicle-centred GPU wave-equation height field. The
moving hull, sponsons, pods and foil struts force it. The V-shaped wake
emerges from the finite wave speed and narrows as speed rises. Wake foam and
propeller turbulence decay over time. `js/fx/spray.js` adds bow spray, mist,
the pods' rooster tails, foil-strut sheets, splashes when the car enters the
water, and bubbles.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | drive |
| Space | brake / handbrake |
| Shift | boost |
| T | transform (toggle direction) |
| F | hydrofoils |
| C / V | cycle camera / cockpit |
| R | reset the vehicle upright |
| P | return to the display plinth |
| H | headlights |
| 1 2 3 | switch design |
| U | hide the interface |

The right-hand panel holds:

- **Configure:** paint, finish, wheel style and finish, leather, trim, light
  colour.
- **Inspect:** doors, bonnet, deck, roof, cutaway section, exploded view,
  X-ray skin, labels.
- **Systems:** individual mechanisms and sequence speed.
- **Scene:** time of day, sea state, water clarity, quality.

**Auto tour** runs the whole show hands-free: a display-lift demonstration,
the drive to the slipway, the launch, and foiling along the coast under the
cinematic camera.

## Layout

```
js/env      sky + time of day, terrain/road, waves (shared CPU/GPU), ocean, marina/village
js/vehicle  lofted body generator, panels, wheel/pod assembly, rig, chassis, cockpit, designs
js/physics  vehicle dynamics
js/fx       wake simulation, spray
js/app      renderer/post, cameras, UI, orchestration
tools       static server, artifact build
```
