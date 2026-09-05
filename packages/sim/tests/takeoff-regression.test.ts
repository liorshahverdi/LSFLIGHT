import { expect, it } from "vitest";
import { createTrainer } from "../src/aircraft/trainer.js";
import { bodyAxes, vec3 } from "../src/physics/frames.js";

it("trainer takeoff remains upright and climbing for 20 seconds after elevator release", () => {
  const ac = createTrainer({ pos: vec3(0, 1.09, 400), vel: vec3(), onRunway: true });
  const dt = 1 / 60;
  let t = 0;
  while (ac.lastAirflow.airspeed < 58 && t < 120) {
    ac.step(dt, { throttle: Math.min(1, t * 0.35) });
    t += dt;
  }
  expect(t).toBeLessThan(120);
  let rotationTime = 0;
  while (ac.body.pos.y < 15 && rotationTime < 15) {
    ac.step(dt, { throttle: 1, elevator: 1 });
    rotationTime += dt;
  }
  expect(rotationTime).toBeLessThan(15);
  const releaseAltitude = ac.body.pos.y;
  const releaseRate = ac.body.angVel.x;
  expect(releaseRate).toBeGreaterThan(0.02); // real pilot-commanded rotation
  for (let i = 0; i < 60 * 20; i++) {
    ac.step(dt, { throttle: 1 });
    const axes = bodyAxes(ac.body.att);
    expect(ac.crashed).toBe(false);
    expect(axes.up.y).toBeGreaterThan(Math.cos(Math.PI / 6)); // <30 degrees, not a loop
    expect(Math.abs(ac.body.angVel.x)).toBeLessThan(0.2);
    expect(ac.body.pos.y).toBeGreaterThan(releaseAltitude);
    expect(ac.body.vel.y).toBeGreaterThan(0);
    expect(ac.lastAirflow.aoaDeg).toBeLessThan(ac.coeffs.criticalAoAPositiveDeg);
    if (i >= 60 * 4) expect(Math.abs(ac.body.angVel.x)).toBeLessThan(releaseRate * 0.2);
  }
  expect(ac.body.pos.y).toBeGreaterThan(150);
});
