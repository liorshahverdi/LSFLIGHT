# YSFlight Repo Review — Using It as a Reference for a Web App

## YSFlight Repo Review

**License:** BSD 3-clause — you can freely reference, port, and even reuse code with attribution. Huge green light.

**Codebase stats (~200k lines C++, last commit Aug 2022):**

| Module                           | Size      | What it is                                                                                                                                                     |
| -------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/`                          | 83k lines | The simulator: `FsSimulation::SimulateOneStep` (fixed-step loop), entities (`fsexistence`), weapons, HUD, ATC, network (**fsnetwork.cpp alone is 248k chars**) |
| `dynamics/`                      | 1.1k      | Air density model, **realistic** propeller/jet physics                                                                                                         |
| `vehicle/`                       | 17k       | Aircraft/ground property parsing — `fsairplaneproperty.cpp` is a 227k-char monster                                                                             |
| `autopilot/`                     | 23k       | AI as composable autopilots: TakeOff, Landing, Dogfight, Formation, GroundAttack, Airshow — all output through normal flight controls                          |
| `scenery/`                       | 25k       | World/scenery format + renderers for OpenGL1/2/D3D                                                                                                             |
| `graphics/`, `gui/`, `platform/` | ~29k      | Rendering & the custom GUI library; author himself calls platform "Nightmare" and graphics "nearly dead"                                                       |

**Key takeaways from the code:**

1. **The architecture validates the original plan.** YSFlight already does what docs/plan.md proposed: sim core independent of rendering, data-driven aircraft (`.dat` text format), AI via autopilot classes emitting control inputs, headless server mode (`main_consvr`).
2. **The flight model is _simplified_, not real aerodynamics.** Aircraft `.dat` files use maneuverability/stability constants (`CPITSTAB 2.0`, `CROLLMAN 3.0`) rather than CL/CD curves. This is actually _great_ for a web port — much easier to port to JS than a full 6DOF aero model.
3. **All content ships in `runtime/`:** 100+ aircraft `.dat` files, `.dnm` polygon models, `.fld` terrain, `.stp` scenery, missions. It's a ready-made content library under permissive terms.
4. **The mess is concentrated where we don't want to go:** rendering backends, the custom GUI lib, iOS remnants, home-rolled containers instead of STL, and monolithic 100–330k-char files. The README admits it was released uncleaned.
5. There's a plugin API, replay system, and mission/sim-extension system (`fssimextension_*` — intercept, racing, CAS) worth mining for design patterns.

## How to Use It as a Reference for a Web App

**Strategy: don't fork the C++; re-implement the design and harvest the content.**

### 1. Port the simulation design, not the code

docs/plan.md is already ~80% aligned with how YSFlight actually works. Refine it with these learnings:

- Adopt the **simplified stability-coefficient flight model** (like `.dat`'s `CPITSTAB`/`CROLLMAN`) for v0.1 instead of the plan's CL/CD curve work (FLT-305/306/604). Faster to build, easier to tune, authentic YSFlight feel.
- Copy the **autopilot class hierarchy** (`FsAutopilot` base → TakeOff/Landing/GotoPosition/Dogfight subclasses) — it maps directly onto the FLT-800 epic and enforces the "AI uses normal controls" principle.
- Reuse the `.dat` aircraft parameter schema as the starting point for the YAML/JSON schema — it's field-proven over 25 years.

### 2. Convert runtime/ content into web assets

Write converters (a Node script) that transform:

- `aircraft/*.dat` → JSON aircraft definitions
- `*.dnm` polygons → glTF/GLB
- `*.fld` terrain → heightmap PNG + JSON metadata
- Missions → scenario JSON

This instantly provides "3+ aircraft, maps, scenarios" that the plan requires — with real YSFlight content.

### 3. Web stack recommendation

- **TypeScript + Three.js (or Babylon.js)** for rendering; keep sim in plain TS modules with no DOM dependencies so it runs headless in Node for tests (matching FLT-1300).
- Fixed timestep accumulator loop driven by `requestAnimationFrame` (the plan's determinism goal, minus cross-browser bit-exactness claims — test same-machine determinism only).
- Web Gamepad API covers FLT-403 nearly for free.

### 4. Files to mine when implementing

- `core/fssimulation.cpp` → `SimulateOneStep` ordering of updates (input → AI → physics → weapons → collisions → events)
- `vehicle/fsairplaneproperty.*` → complete aircraft parameter list
- `autopilot/fsdogfightautopilot.cpp` → dogfight state machine logic
- `core/fscontrol.cpp` → input mapping incl. joystick handling
- `main_consvr/` → what a minimal headless sim needs
- `runtime/document/` → file-format documentation

## Suggested Next Steps

1. Decide TS+Three.js stack; update docs/plan.md with a "FLT-000 Technical Decisions" ticket and swap the aero-model epics for the YSFlight-style coefficient model.
2. Write the `.dat`→JSON converter first (it forces understanding of the schema before building the engine around it).
3. Then start Sprint 1 as planned.
