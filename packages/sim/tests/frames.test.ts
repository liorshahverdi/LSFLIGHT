import { describe, it, expect } from "vitest";
import {
  vec3,
  quatIdentity,
  quatFromEulerYxzDeg,
  quatToEulerYxzDeg,
  quatMultiply,
  quatNormalize,
  quatRotate,
  bodyAxes,
} from "../src/physics/frames.js";

describe("Frames & transforms (FLT-103)", () => {
  // Convention: right-handed, Y-up, -Z forward (three.js compatible).

  it("identity attitude has -Z forward, +Y up, +X right", () => {
    const q = quatIdentity();
    const { forward, up, right } = bodyAxes(q);
    expect(forward).toEqual(vec3(0, 0, -1));
    expect(up).toEqual(vec3(0, 1, 0));
    expect(right).toEqual(vec3(1, 0, 0));
  });

  it("+90° yaw turns nose to -X", () => {
    const q = quatFromEulerYxzDeg({ yaw: 90, pitch: 0, roll: 0 });
    expect(bodyAxes(q).forward.x).toBeCloseTo(-1, 9);
    expect(bodyAxes(q).forward.z).toBeCloseTo(0, 9);
  });

  it("+90° pitch points nose up (+Y)", () => {
    const q = quatFromEulerYxzDeg({ yaw: 0, pitch: 90, roll: 0 });
    expect(bodyAxes(q).forward.y).toBeCloseTo(1, 9);
  });

  it("quatRotate applies attitude to a body-frame vector", () => {
    const q = quatFromEulerYxzDeg({ yaw: 90, pitch: 0, roll: 0 });
    const world = quatRotate(q, vec3(0, 0, -1)); // nose direction
    expect(world.x).toBeCloseTo(-1, 9);
  });

  it("round-trips euler(YXZ)->quat->euler within 1e-6 degrees", () => {
    const cases = [
      { yaw: 30, pitch: -12.5, roll: 77 },
      { yaw: -179, pitch: 42, roll: -3 },
      { yaw: 0.001, pitch: 0.002, roll: 0.003 },
      { yaw: 359.999, pitch: -89, roll: 180 },
    ];
    const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
    for (const e of cases) {
      const q = quatFromEulerYxzDeg(e);
      const back = quatToEulerYxzDeg(q);
      expect(wrap(back.yaw - e.yaw)).toBeCloseTo(0, 5);
      expect(wrap(back.pitch - e.pitch)).toBeCloseTo(0, 5);
      expect(wrap(back.roll - e.roll)).toBeCloseTo(0, 5);
    }
  });

  it("stays normalized across many multiplications (no drift)", () => {
    let q = quatIdentity();
    const step = quatFromEulerYxzDeg({ yaw: 0.01, pitch: 0.02, roll: 0.03 });
    for (let i = 0; i < 100_000; i++) {
      q = quatNormalize(quatMultiply(q, step));
      if (i % 20_000 === 19_999) {
        const n = Math.hypot(q.x, q.y, q.z, q.w);
        expect(Math.abs(n - 1)).toBeLessThan(1e-9);
      }
    }
  });
});
