import { describe, it, expect } from "vitest";
import { alignVelocity } from "../src/flightmodel/velocity-align.js";
import { vec3 } from "../src/physics/frames.js";

describe("Velocity alignment (speed stability)", () => {
  const forward = vec3(0, 0, -1);

  it("preserves speed magnitude exactly", () => {
    const vel = vec3(30, 40, -58);
    const before = Math.hypot(vel.x, vel.y, vel.z);
    const out = alignVelocity(vel, forward, 2.0, 1 / 60);
    const after = Math.hypot(out.x, out.y, out.z);
    expect(after).toBeCloseTo(before, 6);
  });

  it("reduces the angle between velocity and the reference direction", () => {
    const vel = vec3(20, 0, -60); // ~18 deg off the nose
    const angle = (v: { x: number; y: number; z: number }) => {
      const d = (v.x * forward.x + v.y * forward.y + v.z * forward.z) / Math.hypot(v.x, v.y, v.z);
      return Math.acos(Math.min(1, Math.max(-1, d)));
    };
    const before = angle(vel);
    const out = alignVelocity(vel, forward, 2.0, 1 / 60);
    expect(angle(out)).toBeLessThan(before);
  });

  it("alignment per tick is bounded by the rate (no teleporting)", () => {
    const vel = vec3(60, 0, 0); // 90 deg off
    const out = alignVelocity(vel, forward, 2.0, 1 / 60);
    // One tick at rate 2.0 removes at most ~3.3% of the off-axis component.
    expect(out.x).toBeGreaterThan(55);
  });

  it("aligned velocity stays put", () => {
    const vel = vec3(0, 0, -80);
    const out = alignVelocity(vel, forward, 2.0, 1 / 60);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(-80, 9);
  });
});
