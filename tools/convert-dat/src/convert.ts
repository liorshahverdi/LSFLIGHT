/**
 * YSFlight .dat -> aircraft JSON converter (FLT-301).
 *
 * Unit policy (all output SI unless field name says otherwise):
 *  - lengths: m (ft converted), meters
 *  - masses: t -> kg
 *  - thrust "t" is tonnes-FORCE -> N via standard gravity g0 = 9.80665
 *  - angles: stored in degrees, field names end in Deg
 * Unknown keys are warned about, never silently dropped.
 */
import { parseDat } from "./parser.js";

const G0 = 9.80665;
const FT2M = 0.3048;

export interface Vec3Json {
  /** Meters. */
  posM: [number, number, number];
}

export interface AircraftJson {
  id: string;
  displayName?: string;
  category?: string;
  schemaVersion: 1;
  sourceFormat: "ysflight-dat";
  mass?: { emptyKg?: number; fuelKg?: number };
  engine?: { militaryThrustN?: number; afterburnerThrustN?: number };
  cockpitPosM?: [number, number, number];
  gear?: { left: Vec3Json; right: Vec3Json; nose: Vec3Json };
  aero?: {
    criticalAoAPositiveDeg?: number;
    criticalAoANegativeDeg?: number;
  };
  stability?: {
    pitchStab?: number;
    pitchManeuver?: number;
    yawStab?: number;
    yawManeuver?: number;
    rollManeuver?: number;
  };
  hardpoints?: { posM: [number, number, number]; weapons: string[] }[];
}

// Keys this converter understands today; everything else warns.
const KNOWN_KEYS = new Set([
  "IDENTIFY",
  "CATEGORY",
  "THRAFTBN",
  "THRMILIT",
  "WEIGHCLN",
  "WEIGFUEL",
  "COCKPITP",
  "LEFTGEAR",
  "RIGHGEAR",
  "WHELGEAR",
  "CRITAOAP",
  "CRITAOAM",
  "CPITSTAB",
  "CPITMANE",
  "CYAWSTAB",
  "CYAWMANE",
  "CROLLMAN",
  "HRDPOINT",
]);

function num(token: string): number {
  const v = parseFloat(token);
  if (Number.isNaN(v)) throw new Error(`convert: cannot parse number from "${token}"`);
  return v;
}

/** Parse a suffixed length token ("4.1m", "3ft") into meters. */
function lengthM(token: string): number {
  if (token.endsWith("ft")) return num(token.slice(0, -2)) * FT2M;
  if (token.endsWith("m")) return num(token.slice(0, -1));
  throw new Error(`convert: unknown length unit in "${token}"`);
}

function vec3m(tokens: string[], context: string): [number, number, number] {
  if (tokens.length < 3) throw new Error(`convert: ${context} needs 3 values`);
  return [
    lengthM(tokens[0] as string),
    lengthM(tokens[1] as string),
    lengthM(tokens[2] as string),
  ];
}

function massKg(token: string): number {
  if (!token.endsWith("t")) throw new Error(`convert: expected mass in tonnes, got "${token}"`);
  return num(token.slice(0, -1)) * 1000;
}

function thrustN(token: string): number {
  // Tonnes-force -> newtons.
  if (!token.endsWith("t")) throw new Error(`convert: expected thrust in t, got "${token}"`);
  return num(token.slice(0, -1)) * 1000 * G0;
}

function angleDeg(token: string): number {
  if (!token.endsWith("deg")) throw new Error(`convert: expected deg, got "${token}"`);
  return num(token.slice(0, -3));
}

function plain(token: string): number {
  if (/^-?\d/.test(token)) return num(token);
  throw new Error(`convert: expected plain number, got "${token}"`);
}

export function convertAircraft(source: string): {
  aircraft: AircraftJson;
  warnings: string[];
} {
  const { single, multi, warnings } = parseDat(source, { knownKeys: KNOWN_KEYS });
  const s = single;
  const a: AircraftJson = {
    id: slug(s.IDENTIFY?.[0] ?? "unknown"),
    displayName: s.IDENTIFY?.[0],
    category: s.CATEGORY?.[0],
    schemaVersion: 1,
    sourceFormat: "ysflight-dat",
  };

  const mass: AircraftJson["mass"] = {};
  if (s.WEIGHCLN) mass.emptyKg = massKg(s.WEIGHCLN[0] as string);
  if (s.WEIGFUEL) mass.fuelKg = massKg(s.WEIGFUEL[0] as string);
  if (Object.keys(mass).length) a.mass = mass;

  const engine: AircraftJson["engine"] = {};
  if (s.THRMILIT) engine.militaryThrustN = thrustN(s.THRMILIT[0] as string);
  if (s.THRAFTBN) engine.afterburnerThrustN = thrustN(s.THRAFTBN[0] as string);
  if (Object.keys(engine).length) a.engine = engine;

  if (s.COCKPITP) a.cockpitPosM = vec3m(s.COCKPITP, "COCKPITP");

  if (s.LEFTGEAR && s.RIGHGEAR && s.WHELGEAR) {
    a.gear = {
      left: { posM: vec3m(s.LEFTGEAR, "LEFTGEAR") },
      right: { posM: vec3m(s.RIGHGEAR, "RIGHGEAR") },
      nose: { posM: vec3m(s.WHELGEAR, "WHELGEAR") },
    };
  }

  const aero: AircraftJson["aero"] = {};
  if (s.CRITAOAP) aero.criticalAoAPositiveDeg = angleDeg(s.CRITAOAP[0] as string);
  if (s.CRITAOAM) aero.criticalAoANegativeDeg = angleDeg(s.CRITAOAM[0] as string);
  if (Object.keys(aero).length) a.aero = aero;

  const stab: AircraftJson["stability"] = {};
  if (s.CPITSTAB) stab.pitchStab = plain(s.CPITSTAB[0] as string);
  if (s.CPITMANE) stab.pitchManeuver = plain(s.CPITMANE[0] as string);
  if (s.CYAWSTAB) stab.yawStab = plain(s.CYAWSTAB[0] as string);
  if (s.CYAWMANE) stab.yawManeuver = plain(s.CYAWMANE[0] as string);
  if (s.CROLLMAN) stab.rollManeuver = plain(s.CROLLMAN[0] as string);
  if (Object.keys(stab).length) a.stability = stab;

  const hps = multi.HRDPOINT ?? [];
  if (hps.length > 0) {
    a.hardpoints = hps.map((values) => ({
      posM: vec3m(values.slice(0, 3), "HRDPOINT"),
      weapons: values.slice(3).filter((t) => !/^(B\d+|B\d+HD)$/i.test(t)).map((t) => t.toUpperCase()),
    }));
  }

  return { aircraft: a, warnings };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
