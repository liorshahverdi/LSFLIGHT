# YSFlight-Inspired Web Flight Simulator v0.1 — Roadmap

> Supersedes the previous roadmap. Pivot: instead of building from scratch against an abstract plan,
> we re-implement the *design* of YSFlight (https://github.com/captainys/YSFLIGHT, BSD-3) as a **web app**,
> and harvest its proven content library via format converters. See `docs/ysflight-review.md`.

---

# 1. Project Goal

Build a browser-based, YSFlight-inspired flight-combat sandbox:

- TypeScript simulation core that runs headless (Node) and in-browser from the same code
- YSFlight-style **stability-coefficient flight model** (not full CFD-style aerodynamics)
- Data-driven aircraft, weapons, maps, and scenarios loaded from JSON
- AI pilots that output only normal player control inputs
- Takeoff, landing, taxiing, stalling, crashing, guns, guided missiles
- Scenario/mission authoring entirely through data files
- Deterministic fixed-timestep headless mode for automated testing

The reference for behavior and content is the actual YSFlight codebase and `runtime/` assets,
converted to web-friendly formats.

---

# 2. Locked Technical Decisions (FLT-000)

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Web-native; shares types between sim/render/UI |
| Rendering | Three.js (WebGL2) | Mature, glTF-native, large community |
| Math | three.js math classes inside renderer only; sim uses its own tiny `Vec3`/`Quat` module | Keeps sim DOM/renderer-free |
| Integration | Semi-implicit Euler, fixed timestep 60 Hz, accumulator loop on rAF | Stable, simple, deterministic same-machine |
| Orientation | Quaternions internally; YXZ Euler only at UI boundaries | No gimbal lock |
| Coordinate frame | Right-handed, Y-up, −Z forward (three.js convention) | Matches renderer, avoids conversions |
| Data formats | JSON everywhere; glTF/GLB for models | Native to web/three.js |
| Headless runtime | Same sim package run under Node (`sim-cli`) | One codebase, two hosts |
| Input | Keyboard/mouse + Web Gamepad API | Covers FLT-402/403 cheaply |
| Persistence | localStorage (settings/bindings); export/import as JSON file | Zero-backend v0.1 |
| Testing | Vitest; regression scenarios run headless | Matches sim determinism goals |
| Build/tooling | Vite (app) + tsup/tsup-esm or Vite lib mode (sim package); ESLint + Prettier; `npm run check` | Standard, fast |
| Deployment | Static build → GitHub Pages / Cloudflare Pages per merge to `release` branch | Web distribution |
| Determinism scope | Same-machine, same-browser determinism required; cross-platform bit-exactness is NOT claimed | Float math differs across engines |
| Browser support | Latest Chrome/Firefox/Safari desktop; WebGL2 required; mobile out of scope v0.1 | Focus |

Changing any decision above requires updating this section first.

---

# 3. Product Principles

1. **Simulation before presentation.** The sim core has zero imports from rendering/DOM/input packages.
2. **YSFlight is the behavioral spec.** When unsure how something should behave, consult the YSFlight source (`YSFLIGHT/src/...` — see review doc §4 for the file map) before inventing.
3. **Data over code.** Aircraft/weapon/map/scenario differences live in JSON, never `if aircraft === "f16"`.
4. **AI uses player controls.** Autopilots emit `ControlInput`; they may not teleport or set state directly.
5. **Content comes from YSFlight where possible.** Convert rather than recreate; respect BSD-3 attribution (keep NOTICE entry crediting Soji Yamakawa).
6. **Determinism within a machine.** Fixed seed, no unseeded randomness in sim, no reliance on wall-clock time inside the sim.

---

# 4. Definition of v0.1

A player can:

1. Open the site, pick a scenario
2. Spawn on a runway
3. Taxi, take off, fly (pitch/roll/yaw/throttle/flaps/gear/brake)
4. Stall and recover
5. Land, crash, respawn/restart
6. Switch cameras
7. Engage AI aircraft with gun and heat-seeking missile
8. Complete or fail a mission objective, then restart or exit

Shipped content minimums:

- ≥ 6 aircraft (converted from YSFlight `.dat`, incl. one trainer)
- ≥ 2 maps converted from YSFlight `.fld`
- ≥ 4 airports total across maps
- ≥ 4 AI behaviors (waypoint route, intercept, dogfight, formation)
- ≥ 5 playable scenarios
- Headless CLI that runs any scenario and exports telemetry
- CI green: build, lint, typecheck, unit tests, 5 regression simulations

---

# 5. Non-Goals for v0.1

Multiplayer, ATC, radar subsystems, carriers, aerial refueling, weather/clouds beyond static sky/fog,
VR, mobile/touch, clickable cockpits, realistic avionics, campaign/economy, global real-world terrain,
cross-browser bit-exact determinism, modding SDK.

Post-v0.1 backlog lives in §14.

---

# 6. Repository Layout

```text
packages/
  sim/            # pure simulation: no DOM, no three.js imports
    src/
      core/       # clock, world, entity registry, events
      physics/    # vec3/quat, integrator, air property
      flightmodel/# coefficient-based aircraft dynamics
      ground/     # gear, friction, steering, collision queries
      weapons/
      ai/         # autopilot base + behaviors
      mission/
      telemetry/
  render/         # three.js renderer consuming read-only sim snapshots
  input/          # keyboard/gamepad -> ControlInput
  audio/          # WebAudio engine/wind/gun/explosion
  ui/             # HUD, menus (HTML/CSS overlay)
  app/            # Vite entry, game loop wiring, scenario select
  cli/            # sim-cli: headless runner + telemetry export
tools/
  convert-dat/    # YSFlight .dat -> JSON
  convert-dnm/    # YSFlight .dnm -> GLB
  convert-fld/    # YSFlight .fld/.stp -> heightmap+JSON
assets/
  generated/     # converter output (committed)
tests/
  unit/ integration/ simulation/regressions/
```

---

# 7. Epic Overview

| Epic | Name | Target |
|---|---|---|
| FLT-000 | Technical Decisions & Foundation | Sprint 1 |
| FLT-100 | Sim Core Package (deterministic kernel) | Sprint 1 |
| FLT-200 | YSFlight-Style Flight Model | Sprint 1–2 |
| FLT-300 | Content Pipeline (.dat/.dnm/.fld converters) | Sprint 1–2 (parallel) |
| FLT-400 | Player Controls & Cameras | Sprint 2 |
| FLT-500 | Ground Operations & Landing | Sprint 2–3 |
| FLT-600 | World: Terrain, Airports, Scenery | Sprint 3 |
| FLT-700 | AI Autopilot Framework | Sprint 3–4 |
| FLT-800 | Combat & Weapons | Sprint 4 |
| FLT-900 | Missions & Scenarios | Sprint 4–5 |
| FLT-1000 | HUD & Gameplay UI | Sprint 5 |
| FLT-1100 | Audio & Feedback | Sprint 5 |
| FLT-1200 | Headless Harness, Regression Tests, CI | Throughout |
| FLT-1300 | Performance, Polish, Release | Sprint 6 |

---

# EPIC FLT-000 — Technical Decisions & Foundation

## FLT-001 — Ratify Technical Decisions Record

**Type:** Task · **Priority:** Highest · **Estimate:** 1 pt

### Goal
Make §2 binding and visible to every contributor/agent.

### Deliverables
- §2 of this document reviewed and committed
- ADR stubs in `docs/adr/` (one per row that might change)

### Acceptance Criteria
- Every ticket below can reference a decision without ambiguity
- README links to this plan

## FLT-002 — Monorepo Skeleton and Workspace Tooling

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Goal
Create the layout in §6 so multiple agents can work without coupling.

### Deliverables
- npm workspaces with all packages stubbed
- Root `package.json` scripts: `dev`, `build`, `test`, `lint`, `format`, `typecheck`, `check`
- `README.md` with architecture summary and setup steps

### Acceptance Criteria
- `npm install && npm run check` passes from clean checkout
- `packages/sim` builds standalone with **no** dependency on DOM/three.js types (enforced by lint rule `no-restricted-imports`)

### Tests
- Placeholder test runs in each package

## FLT-003 — Lint, Format, Typecheck, Single Check Command

**Type:** Task · **Priority:** Highest · **Estimate:** 2 pts

### Deliverables
- ESLint (strict TS), Prettier, `tsc --noEmit` per package
- `npm run check` = format-check + lint + typecheck + test, exit non-zero on any failure

### Acceptance Criteria
- Deliberately introduced error fails `npm run check`

## FLT-004 — CI Pipeline

**Type:** Story · **Priority:** High · **Estimate:** 2 pts

### Deliverables
- GitHub Actions: on PR → `npm run check`; nightly → regression suite incl. headless sims

### Acceptance Criteria
- Red PR blocks merge (branch protection documented)
- Regression job uploads telemetry artifacts on failure

## FLT-005 — Structured Logging Service

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- `sim/logging.ts`: `{ t, level, system, entityId, scenarioId, msg }`
- Pluggable sink (console in dev, ring buffer in tests, file in CLI)

### Acceptance Criteria
- No direct `console.*` calls inside `packages/sim/src` (lint-enforced)

## FLT-006 — License Compliance & Attribution

**Type:** Task · **Priority:** High · **Estimate:** 1 pt

### Deliverables
- `NOTICE.md` crediting YSFlight / Soji Yamakawa (BSD-3)
- License headers policy documented; converter output metadata includes `"source": "YSFLIGHT runtime/<path>"`

### Acceptance Criteria
- Any shipped build containing converted assets includes the notice

---

# EPIC FLT-100 — Sim Core Package (Deterministic Kernel)

## FLT-101 — Fixed-Timestep Simulation Clock

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Goal
Simulation advances in fixed 60 Hz steps independent of frame rate.

### Deliverables
- `SimClock`: `step(dtFixed)`, accumulator API for rAF hosts, tick counter
- Documented rule: renderer never passes variable dt into sim

### Acceptance Criteria
- Running 3600 ticks twice yields identical final state (deep-equal snapshot hash)
- Host FPS (30 vs 144 simulated) does not change physics results

### Tests
- Snapshot-hash equality test over 60 s scripted run

## FLT-102 — Entity Registry and Lifecycle

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Deliverables
- `World` with typed registries for `Aircraft`, `Projectile`, `Missile`, `GroundObject`, `Explosion`
- spawn/query/update/remove by id; stable iteration order (insertion-sorted by id) for determinism

### Acceptance Criteria
- Entities fully usable with no renderer present
- Removal during iteration is safe and order-stable

### Tests
- Registry lifecycle unit tests; iteration-order determinism test

## FLT-103 — Transform, Units, and Frame Convention

**Type:** Task · **Priority:** Highest · **Estimate:** 2 pts

### Deliverables
- `Transform { position: Vec3; attitude: Quat }`; body-frame helpers (`forward()`, `up()`, `right()`)
- `docs/frames.md`: Y-up right-handed, −Z forward, meters/kg/newtons/radians, NED↔frame notes

### Acceptance Criteria
- Convention matches three.js exactly (renderer consumes transforms with zero conversion)
- Round-trip quat→euler(YXZ)→quat preserves identity within 1e-9

## FLT-104 — Seeded RNG Service

**Type:** Task · **Priority:** High · **Estimate:** 1 pt

### Deliverables
- xoshiro/mulberry32-based `SimRng(seed)` injected into `World`

### Acceptance Criteria
- Lint rule forbids `Math.random()` anywhere in `packages/sim`

### Tests
- Same seed → identical sequences across two instances

## FLT-105 — Simulation Snapshot & Hash

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Goal
Enable determinism assertions and future replays.

### Deliverables
- `snapshot(): SimSnapshot` (plain serializable object) and `hash(snapshot): string` (FNV-1a over canonical serialization)

### Acceptance Criteria
- Hash is stable across runs on the same machine
- Snapshot round-trips through JSON without loss for all numeric fields (use explicit precision policy: store doubles, serialize with `Number.toString()`)

### Tests
- Round-trip equality; identical-run hash equality test

---

# EPIC FLT-200 — YSFlight-Style Flight Model

> Reference implementation: `FsAirplaneProperty` constants + `FsSimulation::SimulateOneStep` force application.
> Model shape: forces/torques computed from stability & maneuverability coefficients scaled by dynamic pressure —
> deliberately simpler than CL/CD curves.

## FLT-201 — Rigid Body State & Integrator

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- `BodyState { mass, inertia (scalar diag approx), pos, att, vel (world), angVel (body) }`
- Semi-implicit Euler integrator: accumulate forces/torques → integrate velocity → integrate pose

### Acceptance Criteria
- Constant force produces expected Δv after N ticks (analytic check ±0.1%)
- Torque about each body axis spins the craft correctly; quaternion stays normalized (renormalize each step)

### Tests
- Analytic ballistic test; spin test per axis; 24 h-equivalent tick soak with no NaN

## FLT-202 — Atmosphere Model

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Deliverables
- `airDensity(alt)`, speed-of-sound approximation (port `fsairproperty.cpp` logic)

### Acceptance Criteria
- Density decreases monotonically 0→20 km; matches YSFlight values at sea level / 10 km within 1%

### Tests
- Table-driven comparison against values extracted from `fsairproperty.cpp`

## FLT-203 — Relative Wind, AoA, Sideslip

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- Compute velocity in body frame → `airspeed`, `aoa`, `slip`, Mach number

### Acceptance Criteria
- Values exposed to flight model, telemetry, HUD, AI via a single `AirflowState`
- Correct sign conventions documented (positive AoA = nose above velocity vector)

### Tests
- Pure vertical wind case; level-flight cruise case (AoA ≈ trim value); sideslip on lateral gust

## FLT-204 — Stability-Coefficient Force Model

**Type:** Story · **Priority:** Highest · **Estimate:** 8 pts

### Goal
Reproduce YSFlight's feel: pitch/yaw/roll **stability** constants restore the nose toward the velocity
vector; **maneuverability** constants scale control response with dynamic pressure; lift is derived from
AoA-relative flow with critical-AoA break.

### Deliverables
- Per-axis: stabilizing torque ∝ coefficient × q̄ × angle-off-velocity
- Lift ∝ f(AoA) piecewise-linear with post-critical falloff (parameters: `CRITAOAP/CRITAOAM` analogues)
- Induced + parasite drag term
- All coefficients come from aircraft JSON (see FLT-601 schema mirroring `.dat` keys)

### Acceptance Criteria
- Trimmed straight-and-level flight holds altitude ±15 m over 60 s without input
- Releasing stick returns nose toward velocity vector (static stability) at rate proportional to stability constant
- Control authority grows with airspeed up to a cap; zero authority near zero airspeed
- Behavior visually comparable to YSFlight flying the same `.dat` aircraft (side-by-side manual comparison checklist recorded)

### Tests
- Trim convergence test; stick-release return-to-weathervane test; authority-vs-speed sweep test

## FLT-205 — Stall Behavior

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- Beyond critical AoA: lift falls off, drag spikes, stability constants degrade (nose-drop + wing-drop tendency via small seeded random torque)

### Acceptance Criteria
- Holding AoA past critical: altitude loss, buffet telemetry flag, recoverable by lowering nose
- No forced orientation changes ("stall mode") — everything emerges from forces

### Tests
- Regression: enter stall, assert max AoA exceeded, then recovery to controlled flight within 20 s

## FLT-206 — Engine Thrust (jet + prop abstraction)

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Jet: military thrust, optional afterburner with fuel-flow rates (`THRMILIT/THRAFTBN/FUELMILI/FUELABRN` analogues), thrust lapse with altitude
- Prop: simplified power-to-thrust with fixed-pitch approximation
- Fuel tank consumption; thrust → 0 at empty fuel

### Acceptance Criteria
- Full-throttle acceleration curve plausible for class of aircraft (recorded baseline numbers)
- Afterburner increases thrust and fuel burn; dry tank cuts thrust

### Tests
- Fuel-integration test; thrust-lapse table test

## FLT-207 — Control Surfaces Mapping

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Map `ControlInput` (elevator/aileron/rudder −1..1, throttle 0..1) to maneuverability torques with rate limiting (surface deflection speed)

### Acceptance Criteria
- Sustained full elevator produces bounded, speed-dependent pitch rate matching configured max rate ±20%
- Rate limiter prevents instant full deflection

### Tests
- Max-rate sweep at 3 airspeeds; rate-limiter step-response test

## FLT-208 — Flight Envelope Telemetry

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- Per-aircraft telemetry struct: IAS/TAS/GS, altitude MSL/AGL, VS, AoA, g-load, heading/pitch/bank, throttle, fuel %, stall flag
- Exposed to HUD, debug overlay, and CLI exporter

### Acceptance Criteria
- g-load computed from lift accel; bank/pitch derived from quaternion consistently

### Tests
- Level turn at known bank/speed yields expected g within 5%

## FLT-209 — Baseline Trainer Aircraft Tuning

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Goal
One forgiving piston/trainer aircraft that makes the whole model shippable.

### Deliverables
- `trainer.json` tuned by hand + regression numbers recorded in `tests/simulation/baselines/`

### Acceptance Criteria
- Takeoff, climb, cruise, 360° turn, stall + recovery, approach, land, stop — all achievable with keyboard
- Recorded takeoff roll distance and stall speed within stated tolerances across 3 consecutive runs (deterministic)

### Tests
- Takeoff + stall + landing regressions (FLT-1204..1206) pass with trainer

---

# EPIC FLT-300 — Content Pipeline (YSFlight Converters)

> Everything here is Node tooling under `tools/`. Output is committed under `assets/generated/`.
> Formats reverse-engineered from `yssceneryio.cpp`, `fsairplaneproperty.cpp`, `runtime/document/`.

## FLT-301 — `.dat` Aircraft Converter

**Type:** Story · **Priority:** Highest · **Estimate:** 8 pts

### Goal
Convert every parseable YSFlight aircraft definition to our JSON schema.

### Deliverables
- `tools/convert-dat`: tokenizer → AST → JSON mapper; report of unhandled keys
- Output: `assets/generated/aircraft/<id>.json` + conversion manifest

### Acceptance Criteria
- ≥ 6 aircraft convert cleanly (incl. a trainer-class and 2 fighters)
- Unknown keys are reported, never silently dropped
- Unit mapping verified (tons→kg, degrees→radians stored in degrees-in-JSON with declared units, etc.)

### Tests
- Golden-file tests: given sample `.dat`, byte-stable JSON output
- Schema validation pass on every generated file

## FLT-302 — Aircraft JSON Schema + Validator

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Deliverables
- Zod/JSON-schema describing all fields (identity, mass/inertia, coefficients, gear points, hardpoints, visual ref)
- Human-readable validation errors (file, path, expected vs found)
- Schema version field + migration note policy

### Acceptance Criteria
- Invalid file produces actionable error naming the offending key
- Loader refuses unversioned files

### Tests
- Negative tests for ≥ 10 malformed inputs

## FLT-303 — `.dnm` Polygon → glTF Converter

**Type:** Story · **Priority:** High · **Estimate:** 8 pts

### Goal
Reuse YSFlight aircraft/ground models in three.js.

### Deliverables
- Parse `.dnm` vertices/faces/materials → indexed GLB; optional coarse/collision variant selection
- Handle texture references (bitmap/ directory) and material colors

### Acceptance Criteria
- ≥ 6 aircraft + 1 ground object render correctly in a three.js viewer harness
- Scale/orientation match `.dat` coordinate expectations (verify gear/hardpoint positions align with model)

### Tests
- Vertex-count and bounding-box sanity checks vs source; visual screenshot smoke test (manual sign-off recorded)

## FLT-304 — `.fld` Terrain + `.stp` Scenery Converter

**Type:** Story · **Priority:** High · **Estimate:** 8 pts

### Deliverables
- `.fld` → heightfield grid (PNG16 heightmap + JSON meta: extent, spacing, sea level) + water plane spec
- `.stp` subset → JSON scenery objects (runways, airports, trees/buildings as instanced primitives)

### Acceptance Criteria
- 1 map converts end-to-end: heights sampled at airports match runway elevations
- Runway rects exported with heading, dimensions, surface type

### Tests
- Round-trip spot checks: N sample points, converter output height equals library-interpreted value (verified once against YSFlight-rendered values)

## FLT-305 — Weapon Definitions Extraction

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- Hand-authored `weapons.json` for AIM9-like IR missile, gun, bombs-lite, transcribed from YSFlight weapon tables (`fsweapon.cpp` defaults)

### Acceptance Criteria
- Each weapon validated against weapon schema (FLT-802)

---

# EPIC FLT-400 — Player Controls & Cameras

## FLT-401 — Logical ControlInput Contract

**Type:** Story · **Priority:** Highest · **Estimate:** 2 pts

### Deliverables
- `ControlInput { pitch, roll, yaw ∈ [−1,1]; throttle [0,1]; flapStep; brake bool; gearToggle event; spoiler; firePrimary; fireSecondary; targetNext event }`
- Identical type consumed by human input layer AND AI autopilots

### Acceptance Criteria
- Sim accepts controls only via this contract (lint/architecture test)

## FLT-402 — Keyboard Mapping (default scheme)

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Deliverables
- W/S pitch, A/D roll, Q/E yaw, Shift/Ctrl throttle, G gear, F flaps cycle, B wheel-brake, Space fire primary, Enter fire secondary, Tab next target, C camera
- Smoothed key axes (attack/release ramps) so keyboard feels analog

### Acceptance Criteria
- Playable free-flight with keyboard only
- Key repeat does not double-toggle gear/flaps

### Tests
- Input-mapper unit tests (event stream → ControlInput stream)

## FLT-403 — Bindings Config & Persistence

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Bindings JSON (action → keys), editable via UI later (FLT-1007); persisted to localStorage; import/export file

### Acceptance Criteria
- Remap survives reload; conflicts detected and flagged

## FLT-404 — Gamepad Support

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Web Gamepad API mapping: sticks → pitch/roll/yaw, triggers/buttons → throttle/fire/gear
- Deadzone + sensitivity config per axis

### Acceptance Criteria
- Analog control demonstrably smoother than keyboard in chase view
- Works in Chrome and Firefox

## FLT-405 — Chase Camera

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Smoothed follow cam with configurable offset/damping; reads only sim snapshot

### Acceptance Criteria
- No jitter at 60 Hz; camera lags naturally during maneuvers; never mutates sim state

## FLT-406 — Cockpit & Fly-By Cameras

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Fixed cockpit viewpoint from aircraft JSON `cockpitPos`; simple fly-by camera (world-fixed tripodal)

### Acceptance Criteria
- Both usable mid-dogfight; switching instant

## FLT-407 — Camera Cycling & Free Orbit Cam

**Type:** Story · **Priority:** Low · **Estimate:** 2 pts

### Deliverables
- C cycles chase→cockpit→flyby→free-orbit; free orbit drags/zooms around player craft

### Acceptance Criteria
- Cycle order stable; free cam useful for debugging gear contact

---

# EPIC FLT-500 — Ground Operations & Landing

## FLT-501 — Terrain Collision Query Interface

**Type:** Story · **Priority:** Highest · **Estimate:** 3 pts

### Deliverables
- In sim package: `heightAt(x,z)`, `normalAt(x,z)`, `surfaceAt(x,z)` backed by pluggable heightfield provider (converted map data)

### Acceptance Criteria
- O(1)-ish bilinear sampling from heightmap; works headless with no renderer
- Water regions report surface type `WATER` (contact = crash in v0.1)

### Tests
- Known-height sampling tests against converted fixture

## FLT-502 — Landing Gear Contact Points & Suspension

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- Three-point gear from aircraft JSON (left/right/nose positions like `.dat` LEFTGEAR/RIGHGEAR/WHELGEAR)
- Spring/damper suspension per strut; ground reaction force + normal friction applied to rigid body

### Acceptance Criteria
- Aircraft rests statically on gear without sinking/jitter (24 h soak)
- Gear compression telemetry available

### Tests
- Static rest test; drop test from 1 m settles within 3 s

## FLT-503 — Rolling, Braking, Lateral Friction

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Separate rolling resistance, brake force, and high lateral grip so wheels resist sideways slide but allow steering

### Acceptance Criteria
- Aircraft rolls freely at idle, stops with brakes in plausible distance, doesn't ice-skate sideways during taxi turns

### Tests
- Brake-distance regression; lateral-slip test during taxi circle

## FLT-504 — Nosewheel Steering

**Type:** Story · **Priority:** High · **Estimate:** 2 pts

### Deliverables
- Rudder-linked steering gain active at low speed, fading out above transition speed

### Acceptance Criteria
- Taxi S-turns controllable with keyboard; steering authority ~0 in cruise

## FLT-505 — Gear Extension/Retraction State Machine

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- UP / TRANSIT_DOWN / DOWN / TRANSIT_UP with timed transit; drag penalty while extended; no landing if not DOWN

### Acceptance Criteria
- Gear-up landing classified as crash/belly per impact rules; transit time from aircraft config

### Tests
- State-machine unit tests incl. toggle spam safety

## FLT-506 — Touchdown Classification

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- On gear contact classify: GOOD / HARD / DAMAGING / CRASH from descent rate, bank/pitch tolerance, gear state

### Acceptance Criteria
- Thresholds configurable; HUD shows rating message; DAMAGING applies structural damage

### Tests
- Synthetic touchdown matrix test (rate × attitude grid)

## FLT-507 — Crash Detection & Destroyed State

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Crash on: terrain hit at speed, water contact, excessive touchdown, structure failure, collision with object
- Destroyed aircraft spawns explosion entity, removes from active control

### Acceptance Criteria
- All four trigger paths covered by tests; explosion visible in renderer

---

# EPIC FLT-600 — World: Terrain, Airports, Scenery

## FLT-601 — Heightfield Terrain Renderer

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Chunked terrain mesh from heightmap PNG + color ramp (grass/rock/snow by slope+altitude); fog for distance

### Acceptance Criteria
- Rendered surface matches `heightAt()` sampling within visual tolerance (overlay debug mode shows wireframe alignment)
- 100 km-class map streams without frame hitches at default zoom

## FLT-602 — Large-World Precision Strategy

**Type:** Task · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Camera-relative rendering: sim keeps world coords (doubles in JS are fine ≤ ~1e7 m for our use), render pipeline subtracts camera origin before handing floats to GPU
- Documented precision budget

### Acceptance Criteria
- No visible vertex jitter at 50 km from origin

### Tests
- Automated far-from-origin jitter probe (screenshot diff) manual-signoff

## FLT-603 — Airport & Runway Entities

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Airport JSON (from `.stp` conversion): id, name, position, elevation, runways[{heading, length, width, surface}], spawnPoints[{runway, parking, airborne}]
- Renderer draws runway strips + centerline markings; sim treats runway rect as flat paved surface overriding terrain query

### Acceptance Criteria
- Player spawns aligned with runway heading; runway visually flush with terrain
- ≥ 4 airports across shipped maps

## FLT-604 — Static Scenery Objects

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Instanced buildings/trees/towers from converted scenery JSON; coarse cylinder/box colliders registered as GroundObjects

### Acceptance Criteria
- Colliding with a building crashes the aircraft; draw calls stay bounded via instancing (budget: < 300 draw calls scene-wide)

## FLT-605 — Sky, Sun, Fog Presentation

**Type:** Task · **Priority:** Low · **Estimate:** 2 pts

### Deliverables
- Static sky gradient, directional sun light, exponential fog matched to YSFlight-ish palette; simple ocean shader

### Acceptance Criteria
- Consistent art direction across both shipped maps

---

# EPIC FLT-700 — AI Autopilot Framework

> Design copied from YSFlight: `FsAutopilot` base class hierarchy. Autopilots emit `ControlInput` only.
> Inner-loop PID-ish controllers (altitude/heading/speed) composed by outer behaviors.

## FLT-701 — Autopilot Base Class & Controller Kit

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- `Autopilot` abstract: `control(self, perception, dt): ControlInput`
- Controllers: `AltitudeHold`, `SpeedHold`, `HeadingHold`, `BankAngleHold` (tunable gains, shared clamp utilities)

### Acceptance Criteria
- Controllers drive the *real* flight model in headless tests to setpoint tolerances:
  - altitude ±25 m steady-state; heading ±3°; speed ±5 kt
- No direct writes to kinematic state anywhere in `ai/` (architecture test)

### Tests
- Step-response unit tests per controller on trainer aircraft

## FLT-702 — Waypoint Route Behavior

**Type:** Story · **Priority**: High · **Estimate:** 5 pts

### Deliverables
- Ordered waypoint list w/ arrival radius, leg speed/altitude; loops optional; waypoint JSON schema

### Acceptance Criteria
- AI completes 5-waypoint circuit within tolerance each waypoint (regression scenario)

## FLT-703 — Takeoff Autopilot

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Phases: hold brakes → full throttle → directional tracking on runway → rotate at Vr → gear up → climb-out handoff to waypoint/behavior

### Acceptance Criteria
- AI takes off from converted airport on ≥ 2 aircraft types without leaving runway bounds

## FLT-704 — Landing Autopilot (best-effort)

**Type:** Story · **Priority:** Medium · **Estimate:** 8 pts

### Goal
Straight-in approach to a runway: capture glidepath (≈3°), flare, rollout, brakes. May ship rough;
architecture must allow improvement without redesign.

### Deliverables
- APPROACH/GLIDESLOPE/FLARE/ROLLOUT phases; abort-to-climbout fallback if unstable

### Acceptance Criteria
- AI lands trainer intact in ≥ 50% of seeded regression seeds; never crashes pre-threshold due to controller bug (tracked metric)

## FLT-705 — Intercept & Pursuit Geometry

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Lead-pursuit intercept controller (bearing + closure management), pure-pursuit option, standoff range parameter

### Acceptance Criteria
- AI closes a target flying predictable course to within gun parameters in regression scenario

## FLT-706 — Dogfight State Machine

**Type:** Story · **Priority:** High · **Estimate:** 8 pts

### Deliverables
- States: SEARCH → INTERCEPT → ATTACK → OVERSHOOT_RECOVERY → DEFEND(break turn) → DISENGAGE
- Skill profile scales: reaction delay, aim error, max g, aggression, fire-solution strictness

### Acceptance Criteria
- 1v1 vs medium AI sustains engagement > 60 s without either side NaN/exploding; easy AI beatable by novice (playtest sign-off)
- State transitions logged via structured logging

### Tests
- Seeded dogfight regression (FLT-1208) reproducible hash-bounded

## FLT-707 — Formation Flight

**Type:** Story · **Priority:** Medium · **Estimate:** 5 pts

### Deliverables
- Leader-relative offset station-keeping (echelon/finger-four offsets from JSON), join/depart transitions

### Acceptance Criteria
- 3-ship formation holds offsets ±30 m in gentle turns for 5-minute regression

---

# EPIC FLT-800 — Combat & Weapons

## FLT-801 — Team/IFF & Targeting Model

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Deliverables
- Faction enum (friendly/hostile/neutral) on entities; target cycling service (player Tab; AI uses own selection)

### Acceptance Criteria
- Target cycling skips dead/off-screen rules as configured; deterministic order

## FLT-802 — Weapon Schema & Inventory

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Weapon defs: `{ id, kind: GUN|MISSILE_IR|ROCKET|BOMB, muzzleVelocity|thrust, turnRate, range, minLaunchParams, damage, ammo, reload }`
- Hardpoints from aircraft JSON; selected-weapon state; ammo accounting

### Acceptance Criteria
- Loading aircraft resolves hardpoint→weapon refs; unknown ref = validation error

## FLT-803 — Gun & Projectile Simulation

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Projectile entities: inherit aircraft velocity + muzzle velocity, gravity + drag, lifetime TTL
- Fire-rate limiter, tracer flag for renderer

### Acceptance Criteria
- Projectiles simulate headless; pool bounded (< 500 live); deterministic spread from seeded RNG

### Tests
- Ballistic drop analytic test; TTL cleanup test

## FLT-804 — Hit Detection & Damage

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Sphere/AABB bounding volumes from aircraft JSON (`HTRADIUS` analogue + collider boxes from converter)
- Sweep test per projectile per tick (no tunneling); damage application → health, subsystem degradation (engine thrust %, control authority %)

### Acceptance Criteria
- No tunneling at max projectile speed × dt; damage states NORMAL/DAMAGED/CRITICAL/DESTROYED drive visible effects (smoke at CRITICAL)

### Tests
- Tunneling sweep test; damage-threshold matrix test

## FLT-805 — IR Missile Entity

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Launch constraints: target within seeker cone + range band + generally tail-aspect bias; lock tone state exposed to HUD/audio
- Guidance: proportional-navigation approximation; motor burn time then coast; proximity fuse + self-destruct timer

### AcceptanceCriteria
- Missile hits maneuvering-but-not-evading target in majority of seeded shots; evading hard-AI target frequently defeats it (both directions tested)
- No guidance after motor-out beyond residual maneuver energy

### Tests
- PN guidance convergence test on straight target; fuse radius test

## FLT-806 — AI Weapons Employment

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Fire-control gating inside dogfight state machine: gun when lead solution < threshold & range band; missile when lock params satisfied & skill permits

### Acceptance Criteria
- AI kills player-capable target in regression; friendly-fire incidents = 0 across regression corpus

## FLT-807 — Explosions & Debris Feedback

**Type:** Story · **Priority:** Low · **Estimate:** 3 pts

### Deliverables
- Explosion entity (flash, particle burst, smoke puffs) consumed by renderer/audio; damage smoke emitters on CRITICAL aircraft

### Acceptance Criteria
- Bounded particle counts; destruction readable at gameplay distances

---

# EPIC FLT-900 — Missions & Scenarios

## FLT-901 — Scenario Schema & Validator

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- Scenario JSON: `{ id, title, description, difficulty, tags, map, weather?, player:{aircraft, spawn}, units:[{id, aircraft, team, spawn, behavior}], objectives[], victoryRules }`
- Validation errors: unknown aircraft/map id, bad spawn, dangling objective targets, duplicate unit ids

### Acceptance Criteria
- Authoring a new scenario requires zero source changes
- Errors name file + JSON path

### Tests
- Negative validation suite

## FLT-902 — Spawn Resolution

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Spawn kinds: `runway:<airport>/<rwu>`, `parking:<airport>/<spot>`, `airborne:{pos, heading, speed}`, plus `onCarrier`-style reserved field (unused v0.1)

### Acceptance Criteria
- Deterministic spawn pose; airborne spawns start trimmed & stable (regression asserts no tumble in first 10 s)

## FLT-903 — Objective Interface & Core Objectives

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- `Objective { status(), progress(), onComplete, onFail }`; implementations: DESTROY (target/unit-list), SURVIVE(duration), REACH_WAYPOINT(radius), LAND_AT(airport)

### Acceptance Criteria
- Objective state drives victory/failure evaluator; progress shown in HUD

### Tests
- Unit-test each objective against scripted sim runs

## FLT-904 — Victory/Failure Evaluator & Restart

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Rule evaluation each tick (all-objectives / any-objective / timeout modes); result screen; full deterministic restart (fresh World from seed)

### Acceptance Criteria
- Restart reproduces identical first-N-tick hash as original launch

## FLT-905 — Scenario Select Menu

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- HTML overlay listing scenarios with title/description/difficulty/tags; remembers last played

### Acceptance Criteria
- Launch → loading → flying with one click; ESC pause menu (resume/restart/settings/exit-to-menu)

---

# EPIC FLT-1000 — HUD & Gameplay UI

## FLT-1001 — Core HUD

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- HTML/CSS overlay: IAS, altitude, heading tape, VSI, throttle %, gear/flap state, fuel, g-load, stall warning flasher

### Acceptance Criteria
- Updates at render rate from latest snapshot; zero layout jank (no per-frame DOM allocs; text nodes updated in place)

## FLT-1002 — Target & Flight-Path Indicators

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Flight-path marker (velocity vector projected), target box with range + closure rate, off-screen target arrow

### Acceptance Criteria
- Projection correct in all cameras; occluded targets still boxed (v0.1 simplification, documented)

## FLT-1003 — Weapon HUD

**Type:** Story · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- Selected weapon, ammo counts, IR lock state (SEARCHING/LOCKED/IN-RANGE), gun cross

### Acceptance Criteria
- Lock state changes audible+visible (audio hook in FLT-1100)

## FLT-1004 — Message/Event Feed & Mission Panel

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- Timed messages (YSFlight-style "touchdown GOOD", objective updates), objectives panel with progress

### Acceptance Criteria
- Messages auto-expire; panel reflects objective interface directly

## FLT-1005 — Pause Menu & Settings Screens

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Pause: resume/restart/settings/exit. Settings: graphics quality (pixel ratio, draw distance), audio volumes, bindings editor, invert axes

### Acceptance Criteria
- Settings persist (localStorage) and apply immediately; bindings editor writes FLT-403 config

## FLT-1006 — Debug Overlay

**Type:** Task · **Priority:** Low · **Estimate:** 2 pts

### Deliverables
- Toggleable: FPS, tick, entity count, AoA/CL-proxy/lift/drag/thrust, AI states, terrain query cost

### Acceptance Criteria
- Zero cost when disabled; invaluable during tuning (used to produce baselines)

---

# EPIC FLT-1100 — Audio & Feedback

## FLT-1101 — Audio Manager & Engine Sound

**Type:** Story · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- WebAudio manager (master/sfx buses, mute); engine loop with pitch/volume mapped to RPM/throttle; needs CC0 or YSFlight-compatible sound sources (documented sourcing task)

### Acceptance Criteria
- Autoplay-policy compliant (starts on first user gesture); no clicks on loop seams

## FLT-1102 — Wind, Gun, Missile, Explosion Sounds

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Wind noise scaled with dynamic pressure; gunfire burst; missile launch whoosh; explosion boom with distance attenuation

### Acceptance Criteria
- Audible cues correspond 1:1 to sim events via event bus; volume settings respected

## FLT-1103 — Stall & Warning Cues

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- Stall buzzer + HUD flash tied to stall telemetry flag; gear warning (low alt, low speed, gear up)

### Acceptance Criteria
- Fires exactly when telemetry flags assert (shared source of truth)

---

# EPIC FLT-1200 — Headless Harness, Regressions, CI

## FLT-1201 — sim-cli Headless Runner

**Type:** Story · **Priority:** Highest · **Estimate:** 5 pts

### Deliverables
- `cli`: `run <scenario.json> --duration s --seed n --telemetry out.jsonl --assert asserts.json`
- Telemetry JSONL rows: `{t, id, pos, att, vel, angVel, ias, aoa, health, aiState}` at configurable sample rate
- Assertion DSL: `{ t: 30, entity: "player", metric: "alt", op: ">", value: 1000 }`

### Acceptance Criteria
- Runs every shipped scenario to completion in Node; exit code reflects assertion results
- Same seed + scenario ⇒ identical telemetry file hash (same machine)

### Tests
- Self-hosted: CLI runs its own fixture scenario in CI

## FLT-1202 — Regression: Takeoff (trainer)

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Assertions
Full throttle → rotate → alt > 100 m by t=60 s; heading drift < 10°; no stall flag before rotation.

## FLT-1203 — Regression: Cruise Trim

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Assertions
Trimmed at cruise: altitude loss < 30 m over 120 s, |bank| < 2°, fuel decreasing monotonically.

## FLT-1204 — Regression: Stall & Recovery

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Assertions
maxAoA > critical; altitude loss occurs; recovery script restores controlled flight (VS > −5 m/s, AoA < critical) within 25 s.

## FLT-1205 — Regression: Landing

**Type:** Task · **Priority:** High · **Estimate:** 3 pts

### Assertions
Scripted approach profile ends with touchdown classification ≥ GOOD on runway rect, |final bank| < 5°, stopped on runway.

## FLT-1206 — Regression: AI Waypoint Circuit

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Assertions
All waypoints reached within tolerance; completion time within ±10% of baseline; no NaN.

## FLT-1207 — Regression: Intercept & Kill

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Assertions
AI intercepts co-altitude target and scores ≥ 1 kill within 180 s (seeded).

## FLT-1208 — Regression: Seeded Dogfight Stability

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Assertions
1v1 dogfight 120 s: no NaN/Inf, entity count sane, telemetry hash matches golden (update via explicit baseline-refresh procedure).

## FLT-1209 — Numerical Soak Test

**Type:** Task · **Priority:** High · **Estimate:** 3 pts

### Assertions
4-hour simulated soak (fast headless): zero NaN/Inf, kinetic+potential energy bounded (no runaway), memory of sim heap stable.

## FLT-1210 — Performance Benchmark

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Bench script: headless ticks/sec for 1/10/50/100 aircraft; renderer FPS capture for standard scene

### Acceptance Criteria
- Baselines recorded in `docs/perf.md`; budget: 100-aircraft headless ≥ 10× realtime; renderer ≥ 60 FPS mid-spec laptop (2020 integrated GPU) with 10 entities

## FLT-1211 — Architecture Enforcement Tests

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Deliverables
- Automated checks: sim imports nothing from render/ui/input/audio; no `Math.random` in sim; renderer never writes sim state (snapshot type is readonly-deep)

### Acceptance Criteria
- Violations fail CI

---

# EPIC FLT-1300 — App Shell, Performance, Polish, Release

## FLT-1301 — App Shell: Boot → Menu → Flight Loop Wiring

**Type:** Story · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Asset preload (manifest-driven), progress screen, worker-friendly sim host (main-thread first; Worker migration allowed if profiling demands), fixed-step accumulator glue, pause/resume on visibilitychange (auto-pause, never fast-forward)

### Acceptance Criteria
- Cold load to cockpit < 10 s on broadband; tab-switch causes no physics jump; 30-min session leak-free (heap snapshots compared)

## FLT-1302 — Rendering Perf Pass

**Type:** Task · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Instancing audit, frustum culling verification, LOD for distant scenery, pixel-ratio caps, quality presets

### Acceptance Criteria
- Meets FLT-1210 budgets on target hardware; profiler evidence recorded in `docs/perf.md`

## FLT-1303 — Aircraft Differentiation Pass

**Type:** Task · **Priority:** High · **Estimate:** 5 pts

### Deliverables
- Tune all shipped aircraft so trainer/light-fighter/heavy-fighter feel distinctly different (roll rates, stall margins, climb)

### Acceptance Criteria
- Blind playtest notes confirm differentiation; each aircraft passes takeoff/stall/land regressions

## FLT-1304 — AI Difficulty Pass

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Acceptance Criteria
- Easy: beatable by first-session player; Medium: credible pursuit; Hard: challenging without violating "AI uses controls" rule (audited by architecture test + telemetry review)

## FLT-1305 — Weapon Balance Pass

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Gun hit probabilities, missile PK vs evasion tuned; recorded in balance sheet doc

### Acceptance Criteria
- Regression kill-rates within stated bands; no one-shot-meta complaints in playtest notes

## FLT-1306 — Crash/Effects Polish

**Type:** Task · **Priority:** Low · **Estimate:** 3 pts

### Deliverables
- Better explosion, ground scorch decal (optional), screen shake, touchdown feedback

## FLT-1307 — Production Build & Deploy

**Type:** Story · **Priority:** High · **Estimate:** 3 pts

### Deliverables
- Vite production build, asset hashing, gzip/brotli, deploy pipeline to GitHub/Cloudflare Pages on release branch; version stamp visible in menu

### Acceptance Criteria
- Public URL serves the game; Lighthouse perf ≥ 70; bundle budget: initial JS ≤ 3 MB gzipped (assets excluded)

## FLT-1308 — Player Documentation

**Type:** Task · **Priority:** Medium · **Estimate:** 2 pts

### Deliverables
- In-game help + README: install/run locally, controls table, scenario guide, aircraft roster, known limitations

## FLT-1309 — Developer Architecture Guide

**Type:** Task · **Priority:** Medium · **Estimate:** 3 pts

### Deliverables
- Docs: package boundaries, sim loop, flight-model math, converter usage, "add an aircraft" / "add a scenario" tutorials, determinism policy, baseline-refresh procedure

### Acceptance Criteria
- A new agent can add an aircraft and a scenario using docs alone (validated by trial run)

## FLT-1310 — v0.1 Release Checklist & Tag

**Type:** Task · **Priority:** High · **Estimate:** 2 pts

### Checklist
All regressions green · success metrics (§12) measured and recorded · attribution notice ships · tag `v0.1` · announcement draft

---

# 8. Recommended Sprint Sequence

## Sprint 1 — Kernel & Pipeline Kickoff
FLT-001, FLT-002, FLT-003, FLT-004, FLT-005, FLT-006, FLT-101, FLT-102, FLT-103, FLT-104, FLT-105, FLT-201, FLT-202, *(parallel)* FLT-301 started

**Exit:** deterministic body integrates headless; CI red/green working; first `.dat` parses to JSON.

## Sprint 2 — First Flyable Aircraft
FLT-203, FLT-204, FLT-205, FLT-206, FLT-207, FLT-208, FLT-209, FLT-302, FLT-303 (started), FLT-401, FLT-402, FLT-405

**Exit:** trainer flies in free space via keyboard with chase cam.

## Sprint 3 — Ground Ops & World
FLT-501..507, FLT-304, FLT-601, FLT-602, FLT-603, FLT-605, FLT-403

**Exit:** spawn → taxi → takeoff → circuit → land → stop on a converted YSFlight map. *First true milestone.*

## Sprint 4 — AI & Combat
FLT-701, FLT-702, FLT-703, FLT-705, FLT-706, FLT-801..806, FLT-1201, FLT-1202, FLT-1204, FLT-1206

**Exit:** player dogfights AI with gun + missile; headless regressions running in CI.

## Sprint 5 — Missions, HUD, Audio
FLT-901..905, FLT-1001..1005, FLT-1101..1103, FLT-704 (landing AI attempt), FLT-707, FLT-807, FLT-1006

**Exit:** authored-data scenarios playable end-to-end with objectives.

## Sprint 6 — Content, Polish, Release
FLT-1301, FLT-1302, FLT-1303, FLT-1304, FLT-1305, FLT-1306, FLT-1203, FLT-1207..1211, remaining FLT-306/305 converter coverage, FLT-1307..1310

**Exit:** deployed public v0.1 meeting success metrics.

---

# 9. Critical Dependency Chain

```text
Clock/Registry/Transform (FLT-101..104)
      ↓
Rigid Body + Integrator (FLT-201)
      ↓
Airflow + Coefficient Model (FLT-203, 204)
      ↓
Controls → Trainer Flies (FLT-401/402/405, FLT-209)
      ↓
Terrain Query + Gear (FLT-501, 502) ←── Map Conversion (FLT-304)
      ↓
Takeoff/Landing Loop
      ↓
AI Controllers (FLT-701+) ←── Aircraft Schema (FLT-301/302)
      ↓
Weapons/Damage (FLT-803..805)
      ↓
Scenarios (FLT-901+)
      ↓
HUD/Audio/Polish → v0.1
```

Vertical slice to validate before depth (mirrors YSFlight core loop):
**spawn → takeoff → fly a circuit → stall/recover → land → stop.**

---

# 10. Agentic Development Rules

1. **One subsystem per ticket.** Ticket text lists allowed modules (see example below); touching others requires a new ticket.
2. **Tests are part of the ticket.** Not done until `npm run check` passes including new tests.
3. **Observable outcomes only.** No "improve physics" tickets.
4. **No hidden aircraft-specific branches.** Differences live in JSON.
5. **Physics changes require regressions.** Any change to FLT-204/205/207 code must re-run FLT-1202..1205 and record baseline deltas.
6. **Consult YSFlight source before inventing behavior.** File map in `docs/ysflight-review.md`.
7. **Baseline refreshes are explicit.** Changing a golden hash requires a PR note explaining why determinism changed.

Example ticket constraint block:

```text
Implement FLT-204.
Allowed modules: packages/sim/src/flightmodel/, packages/sim/src/physics/
Do not modify: render, input, ui, audio
Required tests: trim, stick-release stability, authority-vs-speed sweep
```

---

# 11. Architectural Guardrails (review-reject list)

Forbidden unless explicitly justified in the PR:

- `import ... from "render"|"ui"|"input"|"audio"` inside `packages/sim`
- Renderer mutating simulation state
- AI writing kinematic state directly
- Variable render delta entering the physics step
- `Math.random()` or `Date.now()` inside the sim
- Unseeded gameplay randomness anywhere
- Weapons bypassing the collision/damage services
- Scenario files executing arbitrary code (data-only, always)
- Silent dropping of unknown keys in converters

---

# 12. v0.1 Success Metrics

**Stability**
- 30-min continuous browser session: no NaN, no memory growth > 20%
- Headless regressions reproduce bit-identically (same machine)

**Flight**
- Takeoff/land possible on keyboard alone; stalls predictable and recoverable; coordinated turns achievable
- Trainer takeoff roll and stall speeds within recorded baseline ±5%

**AI**
- Waypoints, intercept, sustained dogfight all demonstrated via regressions
- Zero direct-state-write violations (architecture tests)

**Combat**
- Gun kills and missile hits occur in seeded regressions; AI uses ≥ 1 weapon

**Content**
- ≥ 6 converted aircraft, ≥ 2 maps, ≥ 4 airports, ≥ 5 scenarios, all data-only

**Web delivery**
- Deployed URL, initial JS ≤ 3 MB gzip, 60 FPS on 2020 integrated-GPU laptop with 10 entities

**Extensibility**
- New aircraft = drop JSON + GLB, zero core edits (proven by tutorial run)

---

# 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `.dnm`/`.fld` format edge cases | Converter stalls | Timebox exploration; fall back to hand-built primitive models/maps; formats documented in `runtime/document/` |
| Coefficient model feels wrong | Rework churn | Early vertical-slice playtest end of Sprint 2; tune constants, not architecture |
| three.js perf on big terrain | Missed FPS budget | Chunking + LOD designed in from FLT-601; benchmark early (FLT-1210 in Sprint 4, not 6) |
| Cross-agent merge conflicts | Slowness | Package boundaries + allowed-modules blocks on every ticket |
| Sound asset licensing | Audio epic blocked | Source CC0 set first (task inside FLT-1101); ship silent-mode fallback |
| AI landing too hard | Scope slip | FLT-704 marked best-effort; architecture permits iteration post-v0.1 |

---

# 14. Post-v0.1 Backlog (do not start before release)

Worker-based sim threading · multiplayer (YSFlight fsnetwork.cpp as design reference) · radar/radar missiles/countermeasures · SAMs/ships/ground vehicles · carrier ops · aerial refuel · dynamic weather/time-of-day · replay system from snapshots · graphical scenario editor · joystick/HOTAS refinement · mobile touch · RL pilot experiments (headless harness is the hook) · procedural/LLM-generated scenarios

---

# 15. Final Product Target

Not a tech-demo aerodynamics engine, and not a YSFlight clone in code — a compact, browser-installed
flight-combat sandbox that *feels* like lunch-break YSFlight: distinct aircraft, satisfying flight,
credible AI opposition, working guns and missiles, and new aircraft/missions added purely by editing data.
