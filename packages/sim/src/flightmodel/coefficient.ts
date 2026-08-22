/**
 * Stability-coefficient aerodynamic model (FLT-204).
 *
 * YSFlight-style: lift from a piecewise-linear CL curve with critical-AoA
 * break; drag = cd0 + k*CL^2; restoring torques scale stability constants by
 * angle-off-velocity; control torques scale maneuverability constants by
 * dynamic pressure, capped at qBarCapPa.
 *
 * All quantities deterministic and pure — forces/torques are returned for the
 * caller to accumulate onto a RigidBody.
 */
import { airDensity } from "../physics/atmosphere.js";
import type { AirflowState } from "./airflow.js";

export interface AeroCoeffs {
  wingAreaM2: number;
  /** AoA at which CL would be zero (camber), degrees. */
  clZeroAoADeg: number;
  clSlopePerDeg: number;
  criticalAoAPositiveDeg: number;
  criticalAoANegativeDeg: number;
  /** Fraction of peak CL retained deep in the stall. */
  postStallClFraction: number;
  /** Degrees past critical over which CL falls to the stalled fraction. */
  stallFalloffDeg: number;
  cd0: number;
  inducedDragK: number;
  /** Restoring-torque stability coefficients (YSFlight CPITSTAB/CYAWSTAB style). */
  pitchStab: number;
  yawStab: number;
  /** Control-torque maneuverability coefficients (CPITMANE/CYAWMANE/CROLLMAN style). */
  pitchManeuver: number;
  yawManeuver: number;
  rollManeuver: number;
  /** Dynamic-pressure cap for control authority, Pa. */
  qBarCapPa: number;
}

export interface ControlSurfaces {
  elevator?: number; // -1..1 (+ = nose up)
  aileron?: number; // -1..1
  rudder?: number; // -1..1
}

export interface AeroResult {
  /** Body-frame aero force minus drag component ordering: x right, y up, z back. */
  forceBody: { x: number; y: number; z: number };
  dragN: number;
  liftN: number;
  /** Body-frame torque: x pitch, y yaw, z roll. */
  torqueBody: { x: number; y: number; z: number };
  qBar: number;
  cl: number;
  cd: number;
}

const DEG2RAD = Math.PI / 180;

/** Piecewise-linear CL with post-stall falloff. */
export function liftCoefficient(aoaDeg: number, c: AeroCoeffs): number {
  const clLinear = c.clSlopePerDeg * (aoaDeg - c.clZeroAoADeg);

  if (aoaDeg > c.criticalAoAPositiveDeg) {
    const clAtCrit = c.clSlopePerDeg * (c.criticalAoAPositiveDeg - c.clZeroAoADeg);
    const t = Math.min(1, (aoaDeg - c.criticalAoAPositiveDeg) / c.stallFalloffDeg);
    return clAtCrit * (1 - (1 - c.postStallClFraction) * t);
  }
  if (aoaDeg < c.criticalAoANegativeDeg) {
    const clAtCrit = c.clSlopePerDeg * (c.criticalAoANegativeDeg - c.clZeroAoADeg);
    const t = Math.min(1, (c.criticalAoANegativeDeg - aoaDeg) / c.stallFalloffDeg);
    return clAtCrit * (1 - (1 - c.postStallClFraction) * t);
  }
  return clLinear;
}

export function computeAeroForces(
  airflow: AirflowState,
  altM: number,
  c: AeroCoeffs,
  controls: ControlSurfaces = {},
): AeroResult {
  const rho = airDensity(altM);
  const v = airflow.airspeed;
  const qBarRaw = 0.5 * rho * v * v;
  const qBar = Math.min(qBarRaw, c.qBarCapPa);
  const S = c.wingAreaM2;

  if (v < 1e-6 || qBarRaw < 1e-9) {
    return {
      forceBody: { x: 0, y: 0, z: 0 },
      dragN: 0,
      liftN: 0,
      torqueBody: { x: 0, y: 0, z: 0 },
      qBar: 0,
      cl: 0,
      cd: c.cd0,
    };
  }

  // --- Forces -------------------------------------------------------------
  const aoaRad = airflow.aoaDeg * DEG2RAD;
  const cl = liftCoefficient(airflow.aoaDeg, c);
  const cd = c.cd0 + c.inducedDragK * cl * cl;

  const liftN = qBar * S * cl;
  const dragN = qBar * S * cd;

  // Lift acts along body +Y rotated back by AoA (approximation of the flow
  // axes): sin/cos split into body Y (up) and Z (back) components.
  const liftY = liftN * Math.cos(aoaRad);
  const liftZ = liftN * Math.sin(aoaRad); // positive AoA tilts lift forward(-Z)

  const forceBody = {
    x: 0,
    y: liftY,
    z: liftZ - dragN, // drag always opposes motion along body -Z
  };

  // --- Torques (body frame: x pitch, y yaw, z roll) -----------------------
  const aoaOff = airflow.aoaDeg * DEG2RAD;
  const slipOff = airflow.slipDeg * DEG2RAD;
  const pitchStabTorque = -qBar * c.pitchStab * aoaOff; // +AoA -> nose down
  const yawStabTorque = qBar * c.yawStab * slipOff; // +slip (wind from right) -> yaw right, reduces slip

  const pitchCtrlTorque = qBar * c.pitchManeuver * (controls.elevator ?? 0) * 0.01;
  const rollCtrlTorque = qBar * c.rollManeuver * (controls.aileron ?? 0) * 0.01;
  const yawCtrlTorque = qBar * c.yawManeuver * (controls.rudder ?? 0) * 0.01;

  return {
    forceBody,
    dragN,
    liftN,
    torqueBody: {
      x: pitchStabTorque + pitchCtrlTorque,
      y: yawStabTorque + yawCtrlTorque,
      z: rollCtrlTorque,
    },
    qBar,
    cl,
    cd,
  };
}
