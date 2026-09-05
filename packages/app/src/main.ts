/**
 * App shell (visual vertical slice): fixed-timestep sim loop on rAF,
 * keyboard input, chase-cam renderer.
 *
 * Ground ops slice: spawn parked on the runway, start engine, taxi, take off.
 */
import {
  createTrainer,
  SimClock,
  quatFromEulerYxzDeg,
  vec3,
  HeightfieldTerrain,
} from "@lsflight/sim";
import { KeyboardAxes } from "@lsflight/input";
import { FlightRenderer } from "@lsflight/render";

const FIXED_DT = 1 / 60;

// --- Boot ---------------------------------------------------------------
const container = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
let renderer: FlightRenderer | undefined;
let modelStatus = "MODEL: loading";
try {
  renderer = new FlightRenderer(container);
} catch (err) {
  // Headless/CI may lack WebGL; HUD-only mode keeps the sim testable.
  container.dataset.modelState = "unavailable";
  modelStatus = "MODEL: WebGL unavailable (HUD only)";
  console.warn("WebGL unavailable, running HUD-only", err);
}
// Vite serves publicDir at BASE_URL, not at its repository path.
if (renderer) {
  const modelRenderer = renderer;
  container.dataset.modelState = "loading";
  fetch(`${import.meta.env.BASE_URL}models/cessna172r.mesh.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`model HTTP ${r.status}`);
      return r.json();
    })
    .then((doc: unknown) => {
      if (!modelRenderer.setModel(doc)) throw new Error("invalid mesh document");
      container.dataset.modelState = "ready";
      modelStatus = "MODEL: Cessna 172R";
    })
    .catch((err: unknown) => {
      container.dataset.modelState = "failed";
      modelStatus = "MODEL: load failed (placeholder)";
      console.error("Aircraft model load failed; using placeholder", err);
    });
}

// Parked on the runway, cold-ish: idle throttle, brakes on until released.
const ac = createTrainer({
  pos: vec3(0, 1.09, 400),
  att: quatFromEulerYxzDeg({ yaw: 0, pitch: 0, roll: 0 }),
  vel: vec3(),
  onRunway: true,
});

// Converted YSFlight terrain (FLT-601 slice): render + collide.
fetch(`${import.meta.env.BASE_URL}scenery/naha.fld.json`)
  .then((r) => r.json())
  .then((doc) => {
    const grids = (doc.terrains ?? []) as {
      nx: number;
      nz: number;
      xWidM: number;
      zWidM: number;
      origin: { x: number; z: number };
      elevationsM: number[];
    }[];
    if (grids.length === 0) return;
    renderer?.setHeightfield(grids);
    ac.terrain = new HeightfieldTerrain({ grids });
    console.info(`Loaded ${grids.length} terrain grids from naha.fld`);
  })
  .catch(() => console.warn("terrain not loaded; using flat world"));

const clock = new SimClock(FIXED_DT);
let parkingBrake = true;
const keys = new KeyboardAxes({ isDown: (code) => pressed.has(code) }, { initialThrottle: 0 });

const pressed = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault();
  // B toggles the brake (press once to release, again to set).
  if (e.code === "KeyB" && !e.repeat) parkingBrake = !parkingBrake;
  pressed.add(e.code);
});
window.addEventListener("keyup", (e) => pressed.delete(e.code));
window.addEventListener("blur", () => pressed.clear());

// --- Loop ---------------------------------------------------------------
let last = performance.now();
let hudTimer = 0;
let airborneTime = 0;

function frame(now: number): void {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  const steps = clock.advance(elapsed);
  const axes = keys.sample(elapsed);
  const cmd = {
    elevator: axes.elevator,
    aileron: axes.aileron,
    rudder: axes.rudder,
    throttle: axes.throttle,
    brake: parkingBrake ? 1 : 0,
  };
  for (let i = 0; i < steps; i++) ac.step(FIXED_DT, cmd);
  if (!ac.body.vel.x && !ac.body.vel.y && !ac.body.vel.z && ac.crashed) {
    /* crashed state freezes; keep rendering */
  }
  const flying = ac.body.pos.y > 2.5 && Math.abs(ac.body.vel.y) > 0.4;
  airborneTime = flying ? airborneTime + elapsed : 0;

  renderer?.sync(ac.body);

  hudTimer += elapsed;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    const a = ac.lastAirflow;
    const alt = ac.body.pos.y.toFixed(0).padStart(5);
    const ias = a.airspeed.toFixed(0).padStart(3);
    const stall = a.aoaDeg > ac.coeffs.criticalAoAPositiveDeg - 2 ? "   STALL <<<" : "";
    const td =
      ac.lastTouchdown !== null
        ? `\nTOUCHDOWN: ${ac.lastTouchdown.rating} (${ac.lastTouchdown.sinkRate.toFixed(1)} m/s)`
        : "";
    const status = ac.crashed
      ? "\n*** CRASHED — reload page to restart ***"
      : flying || airborneTime > 0
        ? ""
        : parkingBrake
          ? "\nBRAKES SET — press B to release"
          : "";
    hud.textContent =
      `ALT ${alt} m   IAS ${ias} m/s   AOA ${a.aoaDeg.toFixed(1)}°\n` +
      `THR ${(cmd.throttle * 100).toFixed(0)}%   FUEL ${((ac.engine.fuelKg / 200) * 100).toFixed(0)}%` +
      `   ${parkingBrake ? "BRAKES" : "ROLLING"}${stall}${td}${status}\n${modelStatus}`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
