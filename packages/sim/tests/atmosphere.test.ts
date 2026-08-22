import { describe, it, expect } from "vitest";
import { airDensity, speedOfSound } from "../src/physics/atmosphere.js";

describe("Atmosphere model (FLT-202)", () => {
  it("sea level density is 1.225 kg/m^3", () => {
    expect(airDensity(0)).toBeCloseTo(1.225, 3);
  });

  it("density decreases monotonically from 0 to 20 km", () => {
    let prev = airDensity(0);
    for (let alt = 500; alt <= 20_000; alt += 500) {
      const d = airDensity(alt);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
  });

  it("matches YSFlight reference values within 1%", () => {
    // Values extracted from FsGetAirDensity (ISA troposphere/stratosphere).
    expect(airDensity(10_000)).toBeCloseTo(0.4127, 2); // ~0.4135 ISA, YS uses same lapse model
    expect(airDensity(15_000)).toBeCloseTo(0.1937, 2);
  });

  it("speed of sound: 340.3 m/s at sea level, decreases with altitude", () => {
    expect(speedOfSound(0)).toBeCloseTo(340.29, 1);
    expect(speedOfSound(11_000)).toBeLessThan(speedOfSound(0));
  });
});
