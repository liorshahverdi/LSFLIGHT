import { describe, it, expect } from "vitest";
import { makeRigidBody, stepRigidBody } from "../src/physics/rigidbody.js";
import { FlatTerrain } from "../src/ground/terrain.js";
import { createGear, stepGearAndContact, type GearConfig } from "../src/ground/gear.js";

const DT = 1 / 60;

const GEAR: GearConfig = {
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
};

function aircraftOnRunway(vz = 0) {
  const b = makeRigidBody(1100);
  b.inertia = { pitch: 14000, yaw: 20000, roll: 6000 };
  b.pos = { x: 0, y: 1.09, z: 0 };
  b.vel = { x: 0, y: 0, z: -vz };
  return b;
}

const terrain = new FlatTerrain({ runways: [] });

describe("Ground operations (FLT-503/504)", () => {
  it("rolling: low decel with no brakes", () => {
    const b = aircraftOnRunway(30);
    for (let i = 0; i < 300; i++) {
      stepGearAndContact(b, createGear(GEAR), terrain, DT);
      b.forceAccum.y -= 9.80665 * b.mass; // caller applies gravity
      stepRigidBody(b, DT);
    }
    const v = Math.hypot(b.vel.x, b.vel.z);
    expect(v).toBeGreaterThan(22); // lost < ~27% over 5 s
  });

  it("brakes stop the aircraft quickly", () => {
    const b = aircraftOnRunway(30);
    for (let i = 0; i < 60 * 8; i++) {
      stepGearAndContact(b, createGear(GEAR), terrain, DT, { brake: 1 });
      b.forceAccum.y -= 9.80665 * b.mass;
      stepRigidBody(b, DT);
      if (Math.hypot(b.vel.x, b.vel.z) < 0.1) break;
    }
    expect(Math.hypot(b.vel.x, b.vel.z)).toBeLessThan(0.1);
  });

  it("lateral grip kills sideslip", () => {
    const b = aircraftOnRunway(20);
    b.vel.x = 8; // sliding sideways
    for (let i = 0; i < 120; i++) {
      stepGearAndContact(b, createGear(GEAR), terrain, DT);
      b.forceAccum.y -= 9.80665 * b.mass; // caller applies gravity
      stepRigidBody(b, DT);
    }
    expect(Math.abs(b.vel.x)).toBeLessThan(0.5);
  });

  it("rudder steers the nosewheel at taxi speed", () => {
    const b = aircraftOnRunway(8);
    let maxHeadingRate = 0;
    for (let i = 0; i < 180; i++) {
      stepGearAndContact(b, createGear(GEAR), terrain, DT, { rudder: 1 });
      b.forceAccum.y -= 9.80665 * b.mass;
      stepRigidBody(b, DT);
      maxHeadingRate = Math.max(maxHeadingRate, Math.abs(b.angVel.y));
    }
    expect(maxHeadingRate).toBeGreaterThan(0.05); // visible yaw response
  });
});
