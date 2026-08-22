/**
 * Rigid body + semi-implicit Euler integrator (FLT-201).
 *
 * State conventions (FLT-103):
 *  - pos, vel, forceAccum: world frame
 *  - att: world orientation quaternion (normalized)
 *  - angVel, torqueAccum: BODY frame
 *  - inertia: diagonal approximation (pitch=x, yaw=y, roll=z)
 */
import { quatIdentity, quatMultiply, quatNormalize, type Quat, type Vec3 } from "./frames.js";

export interface RigidBody {
  mass: number;
  /** Diagonal inertia: pitch (x), yaw (y), roll (z) — kg·m². */
  inertia: { pitch: number; roll: number; yaw: number };
  pos: Vec3;
  att: Quat;
  vel: Vec3;
  /** Body-frame angular velocity (rad/s): x=pitch rate, y=yaw rate, z=roll rate. */
  angVel: Vec3;
  /** World-frame force accumulator; cleared each step. */
  forceAccum: Vec3;
  /** Body-frame torque accumulator; cleared each step. */
  torqueAccum: Vec3;
}

const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const clampRate = (r: number): number => Math.min(MAX_ANG_VEL, Math.max(-MAX_ANG_VEL, r));

/** Quaternion for a small body-frame rotation exp(dt/2 * omega). */
function quatFromBodyOmega(omega: Vec3, dt: number): Quat {
  const half = dt / 2;
  return quatNormalize({
    x: omega.x * half,
    y: omega.y * half,
    z: omega.z * half,
    w: 1,
  });
}

/** Safety clamp on body angular rates (rad/s). Prevents numerical blow-ups
 * when the model exits its validity envelope; far beyond any real maneuver. */
const MAX_ANG_VEL = 8;
/** Safety clamp on speed magnitude (m/s). ~Mach 4.4 at sea level. */
const MAX_SPEED = 1500;

/**
 * Advance one fixed timestep. Deterministic: pure arithmetic, no RNG/time.
 * Accumulators are consumed and cleared — systems re-add forces every tick.
 */
export function stepRigidBody(b: RigidBody, dt: number): void {
  // Linear (semi-implicit: velocity first, then position with new velocity).
  const accel = vScale(b.forceAccum, 1 / b.mass);
  b.vel = vAdd(b.vel, vScale(accel, dt));
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  if (speed > MAX_SPEED) {
    const s = MAX_SPEED / speed;
    b.vel = vScale(b.vel, s);
  }
  b.pos = vAdd(b.pos, vScale(b.vel, dt));

  // Angular (body frame, diagonal inertia).
  b.angVel = {
    x: clampRate(b.angVel.x + (b.torqueAccum.x / b.inertia.pitch) * dt),
    y: clampRate(b.angVel.y + (b.torqueAccum.y / b.inertia.yaw) * dt),
    z: clampRate(b.angVel.z + (b.torqueAccum.z / b.inertia.roll) * dt),
  };

  // Attitude: body-frame spin applies on the right.
  b.att = quatNormalize(quatMultiply(b.att, quatFromBodyOmega(b.angVel, dt)));

  // Consume accumulators.
  b.forceAccum = { x: 0, y: 0, z: 0 };
  b.torqueAccum = { x: 0, y: 0, z: 0 };
}

export function makeRigidBody(mass: number): RigidBody {
  return {
    mass,
    inertia: { pitch: 1, roll: 1, yaw: 1 },
    pos: { x: 0, y: 0, z: 0 },
    att: quatIdentity(),
    vel: { x: 0, y: 0, z: 0 },
    angVel: { x: 0, y: 0, z: 0 },
    forceAccum: { x: 0, y: 0, z: 0 },
    torqueAccum: { x: 0, y: 0, z: 0 },
  };
}
