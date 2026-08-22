/**
 * App shell (visual vertical slice): fixed-timestep sim loop on rAF,
 * keyboard input, chase-cam renderer.
 */
import { createTrainer, SimClock, quatFromEulerYxzDeg, vec3 } from "@lsflight/sim";
import { KeyboardAxes } from "@lsflight/input";
import { FlightRenderer } from "@lsflight/render";

const FIXED_DT = 1 / 60;

// --- Boot ---------------------------------------------------------------
const container = document.getElementById("app")!;
const hud = document.getElementById("hud")!;
const renderer = new FlightRenderer(container);

const ac = createTrainer({
  // Airborne spawn for this slice: trimmed cruise at 1000 m.
  pos: vec3(0, 1000, 0),
  att: quatFromEulerYxzDeg({ yaw: 0, pitch: 2.0, roll: 0 }),
  vel: vec3(0, 0, -58),
});

const clock = new SimClock(FIXED_DT);
const keys = new KeyboardAxes({ isDown: (code) => pressed.has(code) }, { initialThrottle: 0.9 });

const pressed = new Set<string>();
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") e.preventDefault(); // avoid page scroll etc.
  pressed.add(e.code);
});
window.addEventListener("keyup", (e) => pressed.delete(e.code));
window.addEventListener("blur", () => pressed.clear());

// --- Loop ---------------------------------------------------------------
let last = performance.now();
let hudTimer = 0;

function frame(now: number): void {
  const elapsed = Math.min((now - last) / 1000, 0.25); // clamp tab-switch jumps
  last = now;

  const steps = clock.advance(elapsed);
  const axes = keys.sample(elapsed);
  const cmd = {
    elevator: axes.elevator,
    aileron: axes.aileron,
    rudder: axes.rudder,
    throttle: axes.throttle,
  };
  for (let i = 0; i < steps; i++) ac.step(FIXED_DT, cmd);

  renderer.sync(ac.body);

  hudTimer += elapsed;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    const a = ac.lastAirflow;
    const alt = ac.body.pos.y.toFixed(0).padStart(5);
    const ias = a.airspeed.toFixed(0).padStart(3);
    hud.textContent =
      `ALT ${alt} m   IAS ${ias} m/s   AOA ${a.aoaDeg.toFixed(1)}°\n` +
      `THR ${(cmd.throttle * 100).toFixed(0)}%   FUEL ${((ac.engine.fuelKg / 200) * 100).toFixed(0)}%` +
      `   STALL${a.aoaDeg > ac.coeffs.criticalAoAPositiveDeg - 2 ? " <<<" : ""}`;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
