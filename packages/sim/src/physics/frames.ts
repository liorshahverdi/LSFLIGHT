/**
 * Frames & transforms (FLT-103).
 *
 * Convention (matches three.js): right-handed, Y-up, -Z forward.
 * Units: meters, seconds, radians internally; degree helpers at the edges.
 * Quaternions are {x,y,z,w}; callers must keep them normalized
 * (quatNormalize after every multiply).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface EulerYxzDeg {
  yaw: number;
  pitch: number;
  roll: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  if (n === 0) return quatIdentity();
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Intrinsic YXZ rotation (yaw about Y, then pitch about X', then roll about Z''). */
export function quatFromEulerYxzDeg(e: EulerYxzDeg): Quat {
  const cy = Math.cos((e.yaw * DEG2RAD) / 2);
  const sy = Math.sin((e.yaw * DEG2RAD) / 2);
  const cp = Math.cos((e.pitch * DEG2RAD) / 2);
  const sp = Math.sin((e.pitch * DEG2RAD) / 2);
  const cr = Math.cos((e.roll * DEG2RAD) / 2);
  const sr = Math.sin((e.roll * DEG2RAD) / 2);
  // three.js Euler 'YXZ' composition.
  return quatNormalize({
    x: sp * cy * cr + cp * sy * sr,
    y: cp * sy * cr - sp * cy * sr,
    z: cp * cy * sr - sp * sy * cr,
    w: cp * cy * cr + sp * sy * sr,
  });
}

export function quatToEulerYxzDeg(q: Quat): EulerYxzDeg {
  const n = quatNormalize(q);
  // YXZ extraction (same as three.js Euler.setFromQuaternion("YXZ")).
  const sp = Math.min(1, Math.max(-1, 2 * (n.w * n.x - n.y * n.z)));
  const pitch = Math.asin(sp);
  let yaw: number;
  let roll: number;
  if (Math.abs(sp) < 0.9999) {
    yaw = Math.atan2(2 * (n.w * n.y + n.x * n.z), 1 - 2 * (n.y * n.y + n.x * n.x));
    roll = Math.atan2(2 * (n.w * n.z + n.x * n.y), 1 - 2 * (n.z * n.z + n.x * n.x));
  } else {
    // Gimbal lock: fold roll into yaw.
    yaw = 2 * Math.atan2(n.z, n.w) * Math.sign(sp);
    roll = 0;
  }
  return { yaw: yaw * RAD2DEG, pitch: pitch * RAD2DEG, roll: roll * RAD2DEG };
}

/** Rotate a body-frame vector into world frame by attitude q. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export interface BodyAxes {
  forward: Vec3; // -Z
  up: Vec3; // +Y
  right: Vec3; // +X
}

export function bodyAxes(q: Quat): BodyAxes {
  return {
    forward: quatRotate(q, vec3(0, 0, -1)),
    up: quatRotate(q, vec3(0, 1, 0)),
    right: quatRotate(q, vec3(1, 0, 0)),
  };
}
