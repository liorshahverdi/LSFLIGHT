import { describe, it, expect } from "vitest";
import { RigidBody, stepRigidBody } from "../src/physics/rigidbody.js";
import { vec3, quatIdentity } from "./../src/physics/frames.js";

const DT = 1 / 60;

function body(overrides: Partial<RigidBody> = {}): RigidBody {
  return {
    mass: 1000,
    inertia: { pitch: 10_000, roll: 5_000, yaw: 12_000 },
    pos: vec3(),
    att: quatIdentity(),
    vel: vec3(),
    angVel: vec3(), // body frame rad/s
    forceAccum: vec3(), // world frame
    torqueAccum: vec3(), // body frame
    ...overrides,
  };
}

describe("Rigid body integrator (FLT-201)", () => {
  it("constant world force produces analytic delta-v (semi-implicit Euler)", () => {
    const b = body();
    b.forceAccum = vec3(6000, 0, 0); // N -> a = 6 m/s^2
    const steps = 120; // 2 s
    for (let i = 0; i < steps; i++) {
      b.forceAccum = vec3(6000, 0, 0); // force systems re-add every tick
      stepRigidBody(b, DT);
    }
    // Semi-implicit Euler: v(n) = a*n*dt exactly.
    expect(b.vel.x).toBeCloseTo(6 * steps * DT, 9);
    // Position: sum of arithmetic series = a*dt^2*n(n+1)/2
    const expectedX = 6 * DT * DT * ((steps * (steps + 1)) / 2);
    expect(b.pos.x).toBeCloseTo(expectedX, 6);
  });

  it("gravity-only fall: velocity after 1 s is -g", () => {
    const b = body();
    for (let i = 0; i < 60; i++) {
      b.forceAccum = vec3(0, -9.80665 * b.mass, 0);
      stepRigidBody(b, DT);
    }
    expect(b.vel.y).toBeCloseTo(-9.80665, 2);
  });

  it("body torque spins about the correct axis", () => {
    const b = body();
    b.torqueAccum = vec3(0, 20_000, 0); // yaw torque
    stepRigidBody(b, DT);
    expect(b.angVel.y).toBeCloseTo((20_000 / 12_000) * DT, 12);
    expect(b.angVel.x).toBe(0);
    expect(b.angVel.z).toBe(0);
  });

  it("sustained spin integrates attitude (quaternion stays normalized)", () => {
    const b = body({ inertia: { pitch: 1e9, roll: 1e9, yaw: 1e9 } });
    for (let i = 0; i < 63; i++) {
      b.torqueAccum = vec3(0, 1e9, 0); // alpha = 1 rad/s^2 about yaw
      stepRigidBody(b, DT);
    }
    const n = Math.hypot(b.att.x, b.att.y, b.att.z, b.att.w);
    expect(Math.abs(n - 1)).toBeLessThan(1e-9);
    // After ~1.05 s at avg 0.52 rad/s, yaw rotation should be substantial but < pi/2
    const spinMag = Math.abs(b.angVel.y);
    expect(spinMag).toBeGreaterThan(1);
    expect(spinMag).toBeLessThan(1.1);
  });

  it("accumulators are cleared after each step", () => {
    const b = body();
    b.forceAccum = vec3(1, 2, 3);
    b.torqueAccum = vec3(4, 5, 6);
    stepRigidBody(b, DT);
    expect(b.forceAccum).toEqual(vec3());
    expect(b.torqueAccum).toEqual(vec3());
  });

  it("soak: ballistic drift for 24 h-equivalent ticks never yields NaN", () => {
    const b = body();
    b.forceAccum = vec3(0, -9.80665 * b.mass, 0);
    for (let i = 0; i < 24 * 3600 * 60; i++) {
      stepRigidBody(b, DT);
      if (!Number.isFinite(b.pos.y + b.vel.y)) break;
    }
    expect(Number.isFinite(b.pos.y)).toBe(true);
    expect(Number.isFinite(b.vel.y)).toBe(true);
  });
});
