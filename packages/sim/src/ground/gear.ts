/**
 * Landing gear contact model (FLT-502..504).
 *
 * Per-strut spring/damper along the ground normal, plus tire friction
 * decomposed into the wheel's longitudinal (rolling/brake) and lateral
 * (grip/steering) axes on the ground plane. Forces are applied at the
 * contact point so they also generate realistic pitch/roll torques.
 */
import type { RigidBody } from "../physics/rigidbody.js";
import type { Vec3 } from "../physics/frames.js";
import type { TerrainProvider } from "./terrain.js";

export interface GearStrut {
  name: string;
  /** Contact-point offset in BODY frame (m). y negative = below CG. */
  posM: Vec3;
  /** Nose wheels steer with the rudder at low speed. */
  steering?: boolean;
}

export interface GearConfig {
  struts: GearStrut[];
  springKNPerM: number;
  dampingKNsPerM: number;
  maxTravelM: number;
  rollingResistCoef: number;
  brakeCoef: number;
  lateralGripCoef: number;
  maxSteerDeg: number;
}

export interface GroundControls {
  throttle?: number;
  brake?: number; // 0..1
  rudder?: number; // -1..1 (steers nosewheel)
}

export interface GearContactInfo {
  anyOnGround: boolean;
  /** Vertical speed (m/s, negative = descending) at first contact this tick. */
  sinkRate: number;
  numWheelsOnGround: number;
}

export function createGear(config: GearConfig): { config: GearConfig; last: GearContactInfo } {
  return {
    config,
    last: { anyOnGround: false, sinkRate: 0, numWheelsOnGround: 0 },
  };
}

function conjRotate(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  return {
    x: q.w * v.x - q.z * v.y + q.y * v.z,
    y: q.z * v.x + q.w * v.y - q.x * v.z,
    z: -q.y * v.x + q.x * v.y + q.w * v.z,
  };
}

const rot = (q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 => {
  // out = v + 2w(q_vec x v) + 2 q_vec x (q_vec x v)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
};

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Advance gear contact for one fixed tick, accumulating forces/torques. */
export function stepGearAndContact(
  body: RigidBody,
  gear: ReturnType<typeof createGear>,
  terrain: TerrainProvider,
  dt: number,
  controls: GroundControls = {},
): void {
  const c = gear.config;
  const info: GearContactInfo = {
    anyOnGround: false,
    sinkRate: 0,
    numWheelsOnGround: 0,
  };

  // World-frame angular velocity for point velocities.
  const omegaW = rot(body.att, body.angVel);
  // Ground speed for steering fade & friction directions.
  const groundSpeed = Math.hypot(body.vel.x, body.vel.z);

  let firstSink = Infinity;
  let totalN = 0;
  const forces: { r: Vec3; f: Vec3 }[] = [];

  for (const strut of c.struts) {
    const rW = rot(body.att, strut.posM); // lever arm, world frame
    const pW = { x: body.pos.x + rW.x, y: body.pos.y + rW.y, z: body.pos.z + rW.z };
    const groundY = terrain.heightAt(pW.x, pW.z);
    const pen = groundY - pW.y;
    if (pen <= 0) continue;

    info.anyOnGround = true;
    info.numWheelsOnGround++;

    // Velocity of the contact point (world).
    const vPoint = {
      x: body.vel.x + (omegaW.y * rW.z - omegaW.z * rW.y),
      y: body.vel.y + (omegaW.z * rW.x - omegaW.x * rW.z),
      z: body.vel.z + (omegaW.x * rW.y - omegaW.y * rW.x),
    };
    if (info.numWheelsOnGround === 1) {
      firstSink = Math.min(firstSink, vPoint.y);
      info.sinkRate = vPoint.y;
    } else {
      firstSink = Math.min(firstSink, vPoint.y);
      info.sinkRate = Math.min(info.sinkRate ?? vPoint.y, vPoint.y);
    }

    // Normal spring/damper.
    const travel = Math.min(pen, c.maxTravelM);
    const vN = vPoint.y; // normal is +Y
    let N = c.springKNPerM * 1000 * travel - c.dampingKNsPerM * 1000 * vN;
    N = Math.max(0, Math.min(N, 250_000));
    totalN += N;

    // Wheel forward direction (steering rotates nose wheel about +Y).
    let fwd = rot(body.att, { x: 0, y: 0, z: -1 });
    if (strut.steering && groundSpeed > 0.1) {
      const fade = Math.max(0, 1 - groundSpeed / 40); // no steering authority in cruise
      const delta = ((controls.rudder ?? 0) * c.maxSteerDeg * fade * Math.PI) / 180;
      const cs = Math.cos(delta);
      const sn = Math.sin(delta);
      fwd = {
        x: fwd.x * cs - fwd.z * sn,
        y: 0,
        z: fwd.x * sn + fwd.z * cs,
      };
    }
    // Project onto ground plane & normalize.
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    fwd = { x: fwd.x / fl, y: 0, z: fwd.z / fl };
    // Lateral axis on ground plane.
    const lat = { x: -fwd.z, y: 0, z: fwd.x };

    const vFwd = dot(vPoint, fwd);
    const vLat = dot(vPoint, lat);

    // Longitudinal: rolling resistance + brakes, opposing motion.
    let FLong = -Math.sign(vFwd) * c.rollingResistCoef * N;
    const brakeCmd = Math.min(1, Math.max(0, controls.brake ?? 0));
    if (brakeCmd > 0 && Math.abs(vFwd) > 0.05) {
      FLong += -Math.sign(vFwd) * brakeCmd * c.brakeCoef * N;
    }
    // Lateral tire grip, opposing sideslip, capped by grip coefficient.
    const latMax = c.lateralGripCoef * N;
    const FLat = Math.max(-latMax, Math.min(latMax, -vLat * 8000));

    const fw = {
      x: lat.x * FLat + fwd.x * FLong,
      y: N,
      z: lat.z * FLat + fwd.z * FLong,
    };
    forces.push({ r: rW, f: fw });
  }

  // Apply accumulated forces at their points.
  for (const { r, f } of forces) {
    body.forceAccum.x += f.x;
    body.forceAccum.y += f.y;
    body.forceAccum.z += f.z;
    const tauW = cross(r, f);
    const tauB = conjRotate(body.att, tauW);
    body.torqueAccum.x += tauB.x;
    body.torqueAccum.y += tauB.y;
    body.torqueAccum.z += tauB.z;
  }

  void totalN;
  void dt;
  if (Number.isFinite(firstSink)) info.sinkRate = firstSink;
  gear.last = info;
}
