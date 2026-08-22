Here's the reading order, most important first:

## 1. Start here — project intent
- **`docs/plan.md`** (55KB, the big one) — the roadmap/plan. This tells you what the other agent is *supposed* to be building and what's done vs. pending.
- **`docs/ysflight-review.md`** (5.5KB) — review of the original YSFlight codebase; explains the design rationale.

## 2. Core simulation (the heart of the project)
Read in this order, since they build on each other:
- `packages/sim/src/physics/rigidbody.ts` — rigid body dynamics
- `packages/sim/src/physics/frames.ts` — coordinate frames
- `packages/sim/src/physics/atmosphere.ts` — atmosphere model
- `packages/sim/src/flightmodel/controls.ts` → `coefficient.ts` → `airflow.ts` → `engine.ts` → `velocity-align.ts` — the flight model pipeline
- `packages/sim/src/aircraft/trainer.ts` — the concrete aircraft built on the model

## 3. Simulation orchestration
- `packages/sim/src/core/world.ts` — world/state container
- `packages/sim/src/core/clock.ts`, `snapshot.ts`, `logging.ts`
- `packages/sim/src/random/rng.ts`

## 4. Other packages
- `packages/input/src/keyboard.ts` — input handling
- `packages/render/src/chase-camera.ts` — camera logic
- `tools/convert-dat/src/parser.ts`, `tokenizer.ts`, `convert.ts` — YSFlight `.dat` file converter

## 5. Tests (skim to understand intended behavior)
- `packages/sim/tests/` — especially `trainer.test.ts`, `energy-guardrail.test.ts`, `fuselage-drag.test.ts` (these encode tricky invariants)
- `tools/convert-dat/tests/`

## Skip
- `YSFLIGHT/` — that's the cloned upstream C++ repo, reference material only
- Anything under `dist/`, `*.tsbuildinfo`, `package-lock.json`

**One caution:** since another agent is actively working here, avoid editing files until you've checked `git status`/recent commits to see what's in flight — and `docs/plan.md` likely tracks their current task.
