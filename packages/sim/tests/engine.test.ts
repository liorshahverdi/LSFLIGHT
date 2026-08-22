import { describe, it, expect } from "vitest";
import { JetEngine, createJetEngine, stepEngine } from "../src/flightmodel/engine.js";

const DT = 1 / 60;

function makeJet(): JetEngine {
  return createJetEngine({
    militaryThrustN: 20_000,
    afterburnerThrustN: 32_000,
    fuelCapacityKg: 1_000,
    fuelBurnMilitaryKgS: 0.5,
    fuelBurnAfterburnerKgS: 1.8,
  });
}

describe("Jet engine model (FLT-206)", () => {
  it("full throttle at sea level produces military thrust", () => {
    const e = makeJet();
    const t = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT);
    expect(t.thrustN).toBeCloseTo(20_000, 6);
  });

  it("throttle scales thrust linearly", () => {
    const e = makeJet();
    expect(stepEngine(e, { throttle: 0.5, afterburner: false }, 0, DT).thrustN).toBeCloseTo(
      10_000,
      6,
    );
    expect(stepEngine(e, { throttle: 0, afterburner: false }, 0, DT).thrustN).toBeCloseTo(0, 6);
  });

  it("thrust lapses with altitude (density ratio)", () => {
    const e = makeJet();
    const sea = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT).thrustN;
    const high = stepEngine(makeJet(), { throttle: 1, afterburner: false }, 10_000, DT).thrustN;
    expect(high).toBeLessThan(sea);
    // ~31% of sea level at 10 km (sigma^0.85 with ISA sigma=0.313)
    expect(high / sea).toBeGreaterThan(0.25);
    expect(high / sea).toBeLessThan(0.4);
  });

  it("afterburner boosts thrust beyond military rating", () => {
    const e = makeJet();
    const mil = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT).thrustN;
    const ab = stepEngine(e, { throttle: 1, afterburner: true }, 0, DT).thrustN;
    expect(ab).toBeGreaterThan(mil);
    expect(ab).toBeCloseTo(32_000, 6);
  });

  it("afterburner requires high throttle", () => {
    const e = makeJet();
    const t = stepEngine(e, { throttle: 0.4, afterburner: true }, 0, DT);
    expect(t.afterburnerLit).toBe(false);
    expect(t.thrustN).toBeCloseTo(8_000, 6);
  });

  it("burns fuel at the configured rate; dry tank kills thrust", () => {
    const e = makeJet();
    let last = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT);
    for (let i = 0; i < 1200; i++) {
      // 20 s -> 10 kg burned
      last = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT);
    }
    expect(e.fuelKg).toBeCloseTo(990, 1); // 1201 ticks incl. pre-loop call
    // Drain the tank completely.
    for (let i = 0; i < 60 * 4000; i++) {
      last = stepEngine(e, { throttle: 1, afterburner: false }, 0, DT);
      if (last.thrustN === 0) break;
    }
    expect(e.fuelKg).toBe(0);
    expect(last.thrustN).toBe(0);
  });

  it("speed falloff (prop-like): thrust decreases with airspeed", () => {
    const mk = () =>
      createJetEngine({
        militaryThrustN: 20_000,
        fuelCapacityKg: 1_000_000,
        fuelBurnMilitaryKgS: 0.001,
        thrustFalloffVPerS: 120,
      });
    const t0 = stepEngine(mk(), { throttle: 1, afterburner: false }, 0, DT, 0).thrustN;
    const t60 = stepEngine(mk(), { throttle: 1, afterburner: false }, 0, DT, 60).thrustN;
    const t120 = stepEngine(mk(), { throttle: 1, afterburner: false }, 0, DT, 120).thrustN;
    expect(t0).toBeCloseTo(20_000, 6);
    expect(t60).toBeCloseTo(10_000, 6);
    expect(t120).toBe(0);
    expect(t60).toBeLessThan(t0);
  });

  it("AB burns fuel much faster than military power", () => {
    const a = makeJet();
    for (let i = 0; i < 600; i++) stepEngine(a, { throttle: 1, afterburner: true }, 0, DT);
    const b = makeJet();
    for (let i = 0; i < 600; i++) stepEngine(b, { throttle: 1, afterburner: false }, 0, DT);
    expect(a.fuelKg).toBeLessThan(b.fuelKg);
  });
});
