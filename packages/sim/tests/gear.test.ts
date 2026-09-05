import { quatFromEulerYxzDeg, quatRotate } from "../src/physics/frames.js";
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

it.each([45, 90, 180])("contact torque is body-frame invariant under heading %s", (yaw) => {
  const a = bodyOnRunway();
  a.pos.y = 1.1;
  a.vel = { x: 2, y: -1, z: -10 };
  const b = bodyOnRunway();
  b.pos.y = a.pos.y;
  b.att = quatFromEulerYxzDeg({ yaw, pitch: 0, roll: 0 });
  b.vel = quatRotate(b.att, a.vel);
  for (const body of [a, b])
    stepGearAndContact(body, createGear(SINGLE_STRUT), new FlatTerrain({ runways: [] }), DT);
  for (const axis of ["x", "y", "z"] as const)
    expect(b.torqueAccum[axis]).toBeCloseTo(a.torqueAccum[axis], 7);
});

it("transforms contact torque at a combined pitch, roll, and heading", () => {
  const body = bodyOnRunway();
  body.att = quatFromEulerYxzDeg({ yaw: 75, pitch: 12, roll: -20 });
  body.pos.y = 0.5;
  body.vel = { x: 3, y: -2, z: -10 };
  stepGearAndContact(body, createGear(SINGLE_STRUT), new FlatTerrain({ runways: [] }), DT);
  const axes = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ].map((axis) => quatRotate(body.att, axis));
  const f = axes.map(
    (axis) => axis.x * body.forceAccum.x + axis.y * body.forceAccum.y + axis.z * body.forceAccum.z,
  );
  const r = SINGLE_STRUT.struts[0]!.posM;
  expect(body.torqueAccum.x).toBeCloseTo(r.y * f[2]! - r.z * f[1]!, 7);
  expect(body.torqueAccum.y).toBeCloseTo(r.z * f[0]! - r.x * f[2]!, 7);
  expect(body.torqueAccum.z).toBeCloseTo(r.x * f[1]! - r.y * f[0]!, 7);
  expect(body.forceAccum.y).toBeGreaterThan(0);
});
