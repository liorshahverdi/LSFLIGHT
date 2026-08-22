import { describe, it, expect } from "vitest";
import { tokenizeDat } from "../src/tokenizer.js";
import { parseDat } from "../src/parser.js";

const SAMPLE = `REM A-10A THUNDERBOLT2
IDENTIFY "A-10A_THUNDERBOLT2"
CATEGORY ATTACKER
AFTBURNR FALSE                #HAVE AFTERBURNER?
THRMILIT  9.7t                #THRUST AT MILITARY POWER
WEIGHCLN  9.8t                #WEIGHT CLEAN
COCKPITP  0.0m  1.15m  3.80m  #COCKPIT POSITION
CRITAOAP  25deg               #CRITICAL AOA POSITIVE
HRDPOINT  4.1m -1.2m -1.5m AGM65 B500 B250 B500HD
POSITION 0m 3ft 0m           #POSITION
`;

describe("tokenizeDat (FLT-301)", () => {
  it("splits records into key + raw value tokens, stripping REM lines and # comments", () => {
    const records = tokenizeDat(SAMPLE);
    const keys = records.map((r) => r.key);
    expect(keys).toEqual([
      "IDENTIFY",
      "CATEGORY",
      "AFTBURNR",
      "THRMILIT",
      "WEIGHCLN",
      "COCKPITP",
      "CRITAOAP",
      "HRDPOINT",
      "POSITION",
    ]);
  });

  it("preserves quoted strings as single tokens and strips surrounding quotes", () => {
    const records = tokenizeDat(SAMPLE);
    const identify = records[0];
    expect(identify?.values).toEqual(["A-10A_THUNDERBOLT2"]);
  });

  it("keeps unit suffixes attached to numbers for later unit conversion", () => {
    const records = tokenizeDat(SAMPLE);
    const thrust = records.find((r) => r.key === "THRMILIT");
    expect(thrust?.values).toEqual(["9.7t"]);
    const cockpit = records.find((r) => r.key === "COCKPITP");
    expect(cockpit?.values).toEqual(["0.0m", "1.15m", "3.80m"]);
    const aoa = records.find((r) => r.key === "CRITAOAP");
    expect(aoa?.values).toEqual(["25deg"]);
    const pos = records.find((r) => r.key === "POSITION");
    expect(pos?.values).toEqual(["0m", "3ft", "0m"]); // ft must convert later!
  });

  it("records multi-token hardpoints intact", () => {
    const records = tokenizeDat(SAMPLE);
    const hp = records.find((r) => r.key === "HRDPOINT");
    expect(hp?.values).toEqual([
      "4.1m",
      "-1.2m",
      "-1.5m",
      "AGM65",
      "B500",
      "B250",
      "B500HD",
    ]);
  });
});

describe("parseDat (FLT-301)", () => {
  it("groups repeated keys (e.g. HRDPOINT) into arrays and singles into scalars", () => {
    const parsed = parseDat(SAMPLE + "HRDPOINT -4.1m 1.2m 1.5m AIM9\n");
    expect(parsed.single.CATEGORY).toEqual(["ATTACKER"]);
    expect(parsed.multi.HRDPOINT).toHaveLength(2);
    expect(parsed.multi.HRDPOINT?.[1]).toEqual(["-4.1m", "1.2m", "1.5m", "AIM9"]);
  });

  it("reports unknown keys instead of silently dropping them (guardrail)", () => {
    const src = "FROBNICATE TRUE\nCATEGORY ATTACKER\n";
    const result = parseDat(src, { knownKeys: ["CATEGORY"] });
    expect(result.warnings).toContain("unknown key FROBNICATE");
    expect(result.single.CATEGORY).toEqual(["ATTACKER"]);
  });
});
