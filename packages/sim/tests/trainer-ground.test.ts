import { describe, it, expect } from "vitest";
import { createTrainer } from "../src/aircraft/trainer.js";
import { vec3, quatFromEulerYxzDeg } from "../src/physics/frames.js";

const DT = 1 / 60;

function spawnOnRunway() {
  return createTrainer({
    pos: vec3(0, 1.09, 200),
    att: quatFromEulerYxzDeg({ yaw: 0, pitch: 0, roll: 0 }),
    vel: vec3(),
    onRunway: true,
  });
}

describe("Trainer ground operations & takeoff (Sprint 3)", () => {
  it("full throttle takeoff roll: accelerates and lifts off", () => {
    const ac = spawnOnRunway();
    let airborne = false;
    for (let i = 0; i < 60 * 120 && !airborne; i++) {
      const v = -ac.body.vel.z;
      ac.step(DT, { throttle: 1, elevator: v > 58 ? 0.85 : 0 });
      if (ac.body.pos.y > 3 && ac.body.vel.y > 0.5) airborne = true;
    }
    expect(airborne).toBe(true);
    expect(ac.crashed).toBe(false);
  });

  it("brakes bring the aircraft to a stop on the runway", () => {
    const ac = spawnOnRunway();
    for (let i = 0; i < 300; i++) {
      ac.step(DT, { throttle: 0, brake: 0 }); // sit still
    }
    for (let i = 0; i < 60 * 15; i++) {
      ac.step(DT, { throttle: 1, brake: 0 });
    }
    // Now brake hard.
    for (let i = 0; i < 60 * 20; i++) {
      ac.step(DT, { throttle: 0, brake: 1 });
      if (Math.hypot(ac.body.vel.x, ac.body.vel.z) < 0.1) break;
    }
    expect(Math.hypot(ac.body.vel.x, ac.body.vel.z)).toBeLessThan(0.2);
    expect(ac.crashed).toBe(false);
  });

  it("gentle touchdown rates GOOD, hard impact crashes", () => {
    // Gentle: 2 m/s sink.
    const gentle = createTrainer({
      pos: vec3(0, 6, 200),
      att: quatFromEulerYxzDeg({ yaw: 0, pitch: 2.0, roll: 0 }),
      vel: vec3(0, -2, -55),
      onRunway: true,
    });
    for (let i = 0; i < 60 * 10; i++) gentle.step(DT, { throttle: 0.4 });
    expect(gentle.lastTouchdown.rating).toBe("GOOD");
    expect(gentle.crashed).toBe(false);

    // Brutal: 12 m/s sink with too little airspeed to flare.
    const brutal = createTrainer({
      pos: vec3(0, 30, 200),
      att: quatFromEulerYxzDeg({ yaw: 0, pitch: 2.0, roll: 0 }),
      vel: vec3(0, -12, -15),
      onRunway: true,
    });
    for (let i = 0; i < 60 * 10; i++) brutal.step(DT, { throttle: 0 });
    expect(brutal.lastTouchdown.rating).toBe("CRASH");
    expect(brutal.crashed).toBe(true);
  });

  it("rudder steers while taxiing", () => {
    const ac = spawnOnRunway();
    for (let i = 0; i < 60 * 8; i++) ac.step(DT, { throttle: 0.35 });
    for (let i = 0; i < 60 * 5; i++) ac.step(DT, { throttle: 0.25, rudder: 1 });
    // Heading changed measurably (yaw quaternion y-component grew).
    expect(Math.abs(ac.body.att.y)).toBeGreaterThan(0.05);
  });
});
