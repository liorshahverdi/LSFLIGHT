import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseFld, parseTerrMesh } from "../src/parser.js";
import { convertFld, sampleElevation } from "../src/convert.js";
import { tokenize } from "../src/tokenizer.js";

const fixture = readFileSync(
  fileURLToPath(new URL("./fixtures/testisle.fld", import.meta.url)),
  "utf8",
);

describe("fld tokenizer", () => {
  it("splits args and honors quotes", () => {
    expect(tokenize('PCK "my file.ter" 45')).toEqual(["PCK", "my file.ter", "45"]);
    expect(tokenize("BLO 12.50 L 1 95 131 37 0 46 112 10")).toHaveLength(11);
  });
});

describe("fld parser (FLT-304)", () => {
  it("reads field metadata", () => {
    const doc = parseFld(fixture);
    expect(doc.name).toBe("TESTISLE");
    expect(doc.groundColorRGB).toEqual([0, 0, 160]);
    expect(doc.skyColorRGB).toEqual([0, 128, 192]);
    expect(doc.baseElevationM).toBeCloseTo(10);
  });

  it("parses the inline TerrMesh grid", () => {
    const doc = parseFld(fixture);
    const ter = doc.items.find((it) => it.kind === "ter");
    expect(ter).toBeDefined();
    const grid = ter!.kind === "ter" ? ter!.grid : null;
    expect(grid).not.toBeNull();
    expect(grid!.nx).toBe(4);
    expect(grid!.nz).toBe(4);
    expect(grid!.y).toHaveLength((4 + 1) * (4 + 1));
    // First BLO is node (0,0), second row starts at index nx+1=5.
    expect(grid!.y[0]).toBeCloseTo(0);
    expect(grid!.y[5]).toBeCloseTo(5);
    expect(grid!.y[11]).toBeCloseTo(40); // z=2, x=3
    expect(grid!.lup[0]).toBe(true);
    expect(grid!.lup[1]).toBe(false);
  });

  it("rejects grids whose node count mismatches NBL", () => {
    const bad = ["TerrMesh", "NBL 4 4", "TMS 10 10"];
    for (let i = 0; i < 20; i++) bad.push(`BLO ${i} R 1 0 0 0 0 0 0`);
    bad.push("END");
    expect(parseTerrMesh(bad)).toBeNull();
  });

  it("captures unhandled item types", () => {
    const conv = convertFld(fixture);
    expect(conv.unhandledItemTypes).toContain("PC2");
  });

  it("positions items via their TER/PC2 sections", () => {
    const doc = parseFld(fixture);
    const pc2 = doc.items.filter((it) => it.kind === "unhandled");
    expect(pc2.length).toBeGreaterThanOrEqual(1);
    expect(pc2[0].posM).toEqual([100, 0, 200]);
  });
});

describe("fld conversion output", () => {
  it("produces true-altitude heightfields with POS offset applied", () => {
    const conv = convertFld(fixture, "runtime/scenery/testisle.fld");
    expect(conv.format).toBe("ysflight-fld");
    expect(conv.name).toBe("TESTISLE");
    expect(conv.terrains).toHaveLength(1);

    const t = conv.terrains[0];
    // TER item POS (-500, 25, 300): origin x/z from POS, y adds 25 m.
    expect(t.origin).toEqual({ x: -500, z: 300 });
    // Node (0,0): BLO 0 + item Y 25 + base elevation 10.
    expect(t.elevationsM[0]).toBeCloseTo(35);
    expect(t.elevationsM[11]).toBeCloseTo(75); // BLO 40 + 25 + 10
  });
});

describe("elevation sampling", () => {
  it("returns exact values at grid nodes and interpolates within blocks", () => {
    const conv = convertFld(fixture);
    const t = conv.terrains[0];
    const nx1 = t.nx + 1;

    // Node (1,1): BLO 5 + item Y 25 + base 10 = 40.
    expect(sampleElevation(t, t.origin.x + t.xWidM, t.origin.z + t.zWidM)).toBeCloseTo(
      t.elevationsM[nx1 + 1],
    );
    // Block center interpolation between nodes.
    const mid = sampleElevation(t, t.origin.x + 150, t.origin.z + 100)!;
    expect(mid).toBeGreaterThan(35);
    expect(mid).toBeLessThan(60);
    // Outside the grid -> null.
    expect(sampleElevation(t, -9999, 0)).toBeNull();
    expect(sampleElevation(t, 5000, 5000)).toBeNull();
  });
});
