import { describe, it, expect } from "vitest";
import { chaseCameraPose } from "../src/chase-camera.js";
import { quatFromEulerYxzDeg } from "@lsflight/sim";

describe("Chase camera (FLT-405)", () => {
  it("sits behind (+Z) and above the craft at identity attitude", () => {
    const pose = chaseCameraPose(
      { pos: { x: 0, y: 100, z: 0 }, att: { x: 0, y: 0, z: 0, w: 1 } },
      1 / 60,
    );
    expect(pose.position.z).toBeGreaterThan(12); // behind: +Z of forward -Z
    expect(pose.position.y).toBeGreaterThan(103); // above
    // Looks ahead of the craft.
    expect(pose.lookAt.z).toBeLessThan(-5);
  });

  it("rotates with the craft's yaw", () => {
    const q = quatFromEulerYxzDeg({ yaw: 90, pitch: 0, roll: 0 });
    const pose = chaseCameraPose({ pos: { x: 0, y: 100, z: 0 }, att: q }, 1 / 60);
    // Nose points -X; camera trails at +X.
    expect(pose.position.x).toBeGreaterThan(10);
  });

  it("smooths toward the desired pose (no teleporting)", () => {
    const cam = chaseCameraPose(
      { pos: { x: 0, y: 100, z: 0 }, att: { x: 0, y: 0, z: 0, w: 1 } },
      1 / 60,
    );
    const target = chaseCameraPose(
      { pos: { x: 0, y: 1100, z: 0 }, att: { x: 0, y: 0, z: 0, w: 1 } },
      1 / 60,
      cam,
    );
    // After one frame the camera has moved partway, not all the way.
    expect(target.position.y).toBeGreaterThan(cam.position.y);
    expect(target.position.y).toBeLessThan(1103);
  });
});
