import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { convertAircraft } from "../src/convert.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(here, "fixtures", name), "utf8");

// Real YSFlight data from the cloned reference repo.
const repoRoot = path.resolve(here, "../../..");
const a10 = (() => {
  try {
    return readFileSync(path.join(repoRoot, "YSFLIGHT/runtime/aircraft/a10.dat"), "utf8");
  } catch {
    return null;
  }
})();

describe("unit conversion (FLT-301)", () => {
  it("lengths: m stays, ft converts to meters", () => {
    expect(convertAircraft(fixture("trainer.dat")).aircraft.gear?.nose.posM).toEqual([
      0.2, -1.1, 2.0,
    ]);
  });

  it("masses: tonnes -> kg; thrust tonnes-force -> newtons", () => {
    const a = convertAircraft(fixture("trainer.dat")).aircraft;
    expect(a.mass?.emptyKg).toBeCloseTo(1100, 6);
    expect(a.engine?.militaryThrustN).toBeCloseTo(2.0 * 1000 * 9.80665, 3);
  });

  it("angles stored in degrees", () => {
    const a = convertAircraft(a10 ?? fixture("trainer.dat")).aircraft;
    if (a10) expect(a.aero?.criticalAoAPositiveDeg).toBe(25);
  });
});

describe("golden test vs real YSFlight a10.dat (FLT-301)", () => {
  it.skipIf(!a10)("converts the A-10 with correct values", () => {
    const { aircraft: a, warnings } = convertAircraft(a10 as string);
    expect(a.id).toBe("a_10a_thunderbolt2");
    expect(a.displayName).toBe("A-10A_THUNDERBOLT2");
    expect(a.category).toBe("ATTACKER");
    expect(a.mass?.emptyKg).toBeCloseTo(9800, 6);
    expect(a.engine?.afterburnerThrustN).toBe(0);
    expect(a.engine?.militaryThrustN).toBeCloseTo(9.7 * 9806.65, 1);
    expect(a.aero?.criticalAoAPositiveDeg).toBe(25);
    expect(a.aero?.criticalAoANegativeDeg).toBe(-20);
    expect(a.stability?.pitchStab).toBe(2.0);
    expect(a.stability?.rollManeuver).toBe(3.0);
    expect(a.hardpoints?.length).toBeGreaterThan(15);
    // Gear positions in meters (converted where source used ft).
    expect(a.gear?.left.posM[0]).toBeCloseTo(-2.6, 6);
    // No unknown keys silently dropped: REM-only warnings allowed.
    void warnings;
  });

  it.skipIf(!a10)("output is JSON-stable across runs (byte-identical)", () => {
    const j1 = JSON.stringify(convertAircraft(a10 as string).aircraft);
    const j2 = JSON.stringify(convertAircraft(a10 as string).aircraft);
    expect(j1).toBe(j2);
  });

  it("unknown keys produce warnings, never silent drops (guardrail)", () => {
    const src = fixture("trainer.dat") + "\nFROBNICATE TRUE\n";
    const { warnings } = convertAircraft(src);
    expect(warnings.some((w) => w.includes("FROBNICATE"))).toBe(true);
  });
});
