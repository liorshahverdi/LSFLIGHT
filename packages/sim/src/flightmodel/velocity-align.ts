/**
 * Velocity alignment (speed-stability helper for the coefficient model).
 *
 * Rotates the velocity vector toward the aircraft's forward axis at a bounded
 * rate while preserving speed exactly. This models fuselage/side-force drag
 * straightening the flight path onto the nose WITHOUT injecting or removing
 * energy — quadratic side-drag forces proved unstable in this role.
 */
import type { Vec3 } from "../physics/frames.js";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * @param vel world-frame velocity
 * @param dirUnit unit vector to align toward (body forward in world frame)
 * @param ratePerSec alignment rate (1/s); fraction of remaining misalignment
 *        resolved per second
 * @param dt fixed timestep
 */
export function alignVelocity(vel: Vec3, dirUnit: Vec3, ratePerSec: number, dt: number): Vec3 {
  const speed = Math.hypot(vel.x, vel.y, vel.z);
  if (speed < 1e-9) return { ...vel };

  // Fraction of remaining misalignment to resolve this tick.
  const f = clamp01(ratePerSec * dt);
  const keepPerp = 1 - f;

  const along = vel.x * dirUnit.x + vel.y * dirUnit.y + vel.z * dirUnit.z;
  // Decompose.
  const ax = along * dirUnit.x;
  const ay = along * dirUnit.y;
  const az = along * dirUnit.z;
  const px = vel.x - ax;
  const py = vel.y - ay;
  const pz = vel.z - az;

  const raw = {
    x: ax + px * keepPerp,
    y: ay + py * keepPerp,
    z: az + pz * keepPerp,
  };
  // Rescale so alignment rotates velocity instead of slowing it.
  const newSpeed = Math.hypot(raw.x, raw.y, raw.z);
  if (newSpeed < 1e-12) return { ...vel };
  const s = speed / newSpeed;
  return { x: raw.x * s, y: raw.y * s, z: raw.z * s };
}
