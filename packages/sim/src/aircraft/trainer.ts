/**
 * Baseline trainer aircraft (FLT-209) — the first flyable entity.
 *
 * Composes rigid body + coefficient aero + jet engine (stand-in until the
 * prop model lands) + control surfaces. One `step(dt, cmd)` drives the full
 * physics tick: airflow -> forces -> integrate.
 */
import { makeRigidBody, stepRigidBody, type RigidBody } from "../physics/rigidbody.js";
import { computeAirflow, type AirflowState } from "../flightmodel/airflow.js";
import { computeAeroForces, type AeroCoeffs } from "../flightmodel/coefficient.js";
import { createJetEngine, stepEngine, type JetEngine } from "../flightmodel/engine.js";
import { createControlSurfaceState, stepControlSurfaces } from "../flightmodel/controls.js";
import { quatRotate, bodyAxes, vec3, type Quat, type Vec3 } from "../physics/frames.js";
import { alignVelocity } from "../flightmodel/velocity-align.js";
import { createGear, stepGearAndContact } from "../ground/gear.js";
import { FlatTerrain, type TerrainProvider } from "../ground/terrain.js";

export interface FlightCommand {
  throttle?: number;
  elevator?: number;
  aileron?: number;
  rudder?: number;
  afterburner?: boolean;
  /** Wheel brakes 0..1. */
  brake?: number;
}

export type TouchdownRating = "GOOD" | "HARD" | "DAMAGING" | "CRASH";

/** Fixed tricycle gear for the trainer (FLT-502). -Z forward. */
const TRAINER_GEAR_CONFIG = {
  struts: [
    { name: "left", posM: { x: -1.5, y: -1.2, z: 0.25 } },
    { name: "right", posM: { x: 1.5, y: -1.2, z: 0.25 } },
    { name: "nose", posM: { x: 0, y: -1.1, z: -2 }, steering: true },
  ],
  springKNPerM: 40,
  dampingKNsPerM: 6,
  maxTravelM: 0.5,
  rollingResistCoef: 0.02,
  brakeCoef: 0.6,
  lateralGripCoef: 0.7,
  maxSteerDeg: 25,
};

export function classifyTouchdown(sinkRate: number): TouchdownRating {
  const s = Math.abs(sinkRate);
  if (s < 3) return "GOOD";
  if (s < 6) return "HARD";
  if (s < 8) return "DAMAGING";
  return "CRASH";
}

/** Default development world: flat with a runway at the origin. */
export const DEV_TERRAIN: TerrainProvider = new FlatTerrain({
  runways: [
    {
      id: "27",
      center: { x: 0, z: 0 },
      widthM: 45,
      lengthM: 1200,
      headingDeg: 180,
    },
  ],
});

export interface TrainerAircraft {
  body: RigidBody;
  engine: JetEngine;
  readonly coeffs: AeroCoeffs;
  lastAirflow: AirflowState;
  /** True once a crash condition has triggered; thrust is then disabled. */
  crashed: boolean;
  lastTouchdown: { rating: TouchdownRating; sinkRate: number; t: number };
  terrain: TerrainProvider;
  step(dt: number, cmd?: FlightCommand): void;
}

/** Trainer aerodynamics: forgiving, docile, matches the tuning baselines. */
export const TRAINER_AERO: AeroCoeffs = {
  wingAreaM2: 16,
  clZeroAoADeg: -2,
  clSlopePerDeg: 0.09,
  criticalAoAPositiveDeg: 16,
  criticalAoANegativeDeg: -12,
  postStallClFraction: 0.4,
  stallFalloffDeg: 10,
  cd0: 0.025,
  inducedDragK: 0.04,
  pitchStab: 2.0,
  yawStab: 3.0,
  /** Trimmed to hold ~1.75 deg AoA at cruise (level flight @ 60 m/s / 1000 m). */
  trimAoADeg: 1.745,
  pitchManeuver: 15.0,
  yawManeuver: 15.0,
  rollManeuver: 3.0,
  pitchDamp: 8.0,
  yawDamp: 10.0,
  rollDamp: 5.0,
  qBarCapPa: 15_000,
};

const TRAINER_MASS_EMPTY_KG = 900;
const TRAINER_INERTIA = { pitch: 14_000, yaw: 20_000, roll: 6_000 };
/** Static thrust; prop-style falloff gives T(v) = 1900*(1 - v/120) at full throttle. */
const TRAINER_THRUST_N = 2_600;
/** Prop falloff speed: zero thrust at this airspeed. */
const TRAINER_FALLOFF_V = 120;
/** Full-throttle equilibrium is ~55-60 m/s; cruise trim near there. */
const TRAINER_CRUISE_THROTTLE = 0.71;
const TRAINER_FUEL_CAPACITY_KG = 200;
const TRAINER_FUEL_BURN_KGS = 0.02; // ~2.8 h endurance at full throttle

export function createTrainer(spawn?: {
  pos?: Vec3;
  att?: Quat;
  vel?: Vec3;
  fuelKg?: number;
  /** Spawn parked on the dev runway at rest height. */
  onRunway?: boolean;
  terrain?: TerrainProvider;
}): TrainerAircraft {
  const body = makeRigidBody(TRAINER_MASS_EMPTY_KG + (spawn?.fuelKg ?? TRAINER_FUEL_CAPACITY_KG));
  body.inertia = TRAINER_INERTIA;
  body.pos = spawn?.pos ?? vec3(0, 1000, 0);
  body.att = spawn?.att ?? {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
  };
  body.vel = spawn?.vel ?? vec3(0, 0, -60);

  const engine = createJetEngine({
    militaryThrustN: TRAINER_THRUST_N,
    thrustFalloffVPerS: TRAINER_FALLOFF_V,
    fuelCapacityKg: TRAINER_FUEL_CAPACITY_KG,
    fuelBurnMilitaryKgS: TRAINER_FUEL_BURN_KGS,
  });
  if (spawn?.fuelKg !== undefined) engine.fuelKg = spawn.fuelKg;

  const ac: TrainerAircraft = {
    body,
    engine,
    crashed: false,
    lastTouchdown: { rating: "GOOD", sinkRate: 0, t: 0 },
    terrain: spawn?.terrain ?? DEV_TERRAIN,
    coeffs: TRAINER_AERO,
    lastAirflow: {
      airspeed: 0,
      aoaDeg: 0,
      slipDeg: 0,
      mach: 0,
      velBody: { x: 0, y: 0, z: 0 },
    },
    step(dt, cmd = {}) {
      // 0. Crashed aircraft is dead in the water.
      if (ac.crashed) {
        body.vel = { x: 0, y: 0, z: 0 };
        return;
      }

      // 1. Engine
      const engineOut = stepEngine(
        engine,
        {
          throttle: cmd.throttle ?? TRAINER_CRUISE_THROTTLE,
          afterburner: cmd.afterburner ?? false,
        },
        body.pos.y,
        dt,
        ac.lastAirflow.airspeed,
      );

      // 2. Control surfaces (rate limited)
      stepControlSurfaces(
        surfaces,
        {
          elevator: cmd.elevator ?? 0,
          aileron: cmd.aileron ?? 0,
          rudder: cmd.rudder ?? 0,
        },
        dt,
      );

      // 3. Velocity alignment: fuselage side-force straightens the flight
      // path onto the nose at a bounded rate (energy-preserving rotation).
      body.vel = alignVelocity(body.vel, bodyAxes(body.att).forward, 0.6, dt);

      // 4. Airflow
      const airflow = computeAirflow({
        pos: body.pos,
        att: body.att,
        vel: body.vel,
        altM: body.pos.y,
        wind: vec3(),
      });
      ac.lastAirflow = airflow;

      // 5. Forces: aero + thrust + gravity
      const aero = computeAeroForces(
        airflow,
        body.pos.y,
        TRAINER_AERO,
        {
          elevator: surfaces.elevator,
          aileron: surfaces.aileron,
          rudder: surfaces.rudder,
        },
        {
          pitchRateRadS: body.angVel.x,
          yawRateRadS: body.angVel.y,
          rollRateRadS: body.angVel.z,
        },
      );
      const thrustForce = quatRotate(body.att, vec3(0, 0, -engineOut.thrustN));
      const gravity = vec3(0, -9.80665 * body.mass, 0);
      body.forceAccum = {
        x: aero.forceBody.x + thrustForce.x + gravity.x,
        y: aero.forceBody.y + thrustForce.y + gravity.y,
        z: aero.forceBody.z + thrustForce.z + gravity.z,
      };
      body.torqueAccum = aero.torqueBody;

      // 4b. Ground contact (gear) — no-op while airborne.
      stepGearAndContact(body, gear, ac.terrain, dt, {
        brake: cmd.brake ?? 0,
        rudder: cmd.rudder ?? 0,
      });
      if (gear.last.anyOnGround && !wasOnGround && ac.lastTouchdown.t === 0) {
        // First touchdown event latches (bounces don't rewrite history).
        const rating = classifyTouchdown(gear.last.sinkRate);
        ac.lastTouchdown = { rating, sinkRate: gear.last.sinkRate, t: tickTime };
        if (rating === "CRASH") ac.crashed = true;
      }
      wasOnGround = gear.last.anyOnGround;
      tickTime += dt;

      // 6. Integrate; keep mass current with fuel state.
      body.mass = TRAINER_MASS_EMPTY_KG + engine.fuelKg;
      stepRigidBody(body, dt);
    },
  };

  const surfaces = createControlSurfaceState();
  const gear = createGear(TRAINER_GEAR_CONFIG);
  let wasOnGround = false;
  let tickTime = 0;

  // Spawned resting height on gear (only when no explicit altitude given).
  if (spawn?.onRunway && spawn?.pos === undefined) {
    body.pos.y = 1.09;
  }
  return ac;
}
