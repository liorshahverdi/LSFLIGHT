import { describe, it, expect } from "vitest";
import { makeRigidBody, stepRigidBody } from "../src/physics/rigidbody.js";
import { FlatTerrain } from "../src/ground/terrain.js";
import { createGear, stepGearAndContact, type GearConfig } from "../src/ground/gear.js";

const DT = 1 / 60;

const SINGLE_STRUT: GearConfig = {
  struts: [{ name: "nose", posM: { x: 0, y: -1.2, z: -2 }, steering: true }],
  springKNPerM: 40,
  dampingKNsPerM: 6,
  maxTravelM: 0.5,
  rollingResistCoef: 0.02,
  brakeCoef: 0.6,
  lateralGripCoef: 0.7,
  maxSteerDeg: 25,
};

function bodyOnRunway() {
  const b = makeRigidBody(1100);
  b.pos = { x: 0, y: 1.2, z: 0 };
  return b;
}

describe("Landing gear contact (FLT-502)", () => {
  it("no force when wheel above ground", () => {
    const b = bodyOnRunway(); // wheel at 1.2-1.2 = 0 -> just touching
    b.pos.y = 1.5;
    const g = createGear(SINGLE_STRUT);
    stepGearAndContact(b, g, new FlatTerrain({ runways: [] }), DT);
    expect(b.forceAccum.y).toBe(0);
  });

  it("penetration produces upward spring force", () => {
    const b = bodyOnRunway();
    b.pos.y = 1.15; // 5 cm penetration
    const g = createGear(SINGLE_STRUT);
    stepGearAndContact(b, g, new FlatTerrain({ runways: [] }), DT);
    // k*h = 40000*0.05 = 2000 N (minus small damping term from any vy)
    expect(b.forceAccum.y).toBeGreaterThan(1500);
    expect(b.forceAccum.y).toBeLessThan(2600);
  });

  it("static rest: aircraft settles on gear without sinking or jitter", () => {
    const b = makeRigidBody(1100);
    b.inertia = { pitch: 14000, yaw: 20000, roll: 6000 };
    b.pos = { x: 0, y: 1.35, z: 0 }; // dropped slightly
    const g = createGear({
      struts: [
        { name: "left", posM: { x: -1.5, y: -1.2, z: 0.5 } },
        { name: "right", posM: { x: 1.5, y: -1.2, z: 0.5 } },
        { name: "nose", posM: { x: 0, y: -1.1, z: -2 }, steering: true },
      ],
      springKNPerM: 40,
      dampingKNsPerM: 6,
      maxTravelM: 0.5,
      rollingResistCoef: 0.02,
      brakeCoef: 0.6,
      lateralGripCoef: 0.7,
      maxSteerDeg: 25,
    });
    const terrain = new FlatTerrain({ runways: [] });
    let maxYVel = 0;
    for (let i = 0; i < 60 * 5; i++) {
      stepGearAndContact(b, g, terrain, DT, { throttle: 0 });
      b.forceAccum.y -= 9.80665 * b.mass; // gravity is applied by callers
      stepRigidBody(b, DT);
      maxYVel = Math.max(maxYVel, Math.abs(b.vel.y));
    }
    // Settled: resting height stable, no oscillation growth.
    expect(Number.isFinite(b.pos.y)).toBe(true);
    expect(Math.abs(b.vel.y)).toBeLessThan(0.05);
    void maxYVel;
    // Resting height: mains deflect ~135 mm under load -> ~1.06-1.10.
    expect(b.pos.y).toBeGreaterThan(1.0);
    expect(b.pos.y).toBeLessThan(1.2);
  });
});
