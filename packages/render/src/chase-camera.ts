/**
 * Chase camera pose math (FLT-405). Pure function — no three.js scene needed,
 * returns plain objects the renderer applies to its camera.
 *
 * Desired pose trails the craft along its +Z body axis (behind the -Z nose)
 * and above it, looking ahead of the airframe. Smoothing is exponential.
 */

export interface CamVec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraSubject {
  pos: CamVec3;
  att: { x: number; y: number; z: number; w: number };
}

export interface CameraPose {
  position: CamVec3;
  lookAt: CamVec3;
}

/** Rotate v by unit quaternion q (same math as sim frames). */
function rotate(q: CameraSubject["att"], v: CamVec3): CamVec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

const OFFSET: CamVec3 = { x: 0, y: 3.5, z: 14 }; // behind & above in body frame
const LOOK_AHEAD: CamVec3 = { x: 0, y: 0, z: -12 };
const SMOOTH = 5.0; // exponential smoothing rate (1/s)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function desiredPose(subject: CameraSubject): CameraPose {
  const off = rotate(subject.att, OFFSET);
  const ahead = rotate(subject.att, LOOK_AHEAD);
  return {
    position: {
      x: subject.pos.x + off.x,
      y: subject.pos.y + off.y,
      z: subject.pos.z + off.z,
    },
    lookAt: {
      x: subject.pos.x + ahead.x,
      y: subject.pos.y + ahead.y,
      z: subject.pos.z + ahead.z,
    },
  };
}

export function chaseCameraPose(
  subject: CameraSubject,
  dt: number,
  previous?: CameraPose,
): CameraPose {
  const want = desiredPose(subject);
  if (!previous) return want;
  // Clamp catch-up after long pauses.
  const t = 1 - Math.exp(-SMOOTH * Math.min(dt, 0.25));
  return {
    position: {
      x: lerp(previous.position.x, want.position.x, t),
      y: lerp(previous.position.y, want.position.y, t),
      z: lerp(previous.position.z, want.position.z, t),
    },
    lookAt: want.lookAt,
  };
}
