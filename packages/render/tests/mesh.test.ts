import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { validateMeshDoc, meshDocToGeometry } from "../src/mesh.js";

it("accepts a well-formed mesh doc", () => {
  expect(
    validateMeshDoc({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      indices: [0, 1, 2],
    }),
  ).toBe(true);
});

it("rejects mismatched index ranges", () => {
  expect(validateMeshDoc({ positions: [0, 0, 0], colors: [1, 1, 1], indices: [0, 1, 9] })).toBe(
    false,
  );
});

const triangle = {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  colors: Array(9).fill(1),
  indices: [0, 1, 2],
};
it.each([NaN, Infinity, "0", null])(
  "rejects nonfinite/nonnumeric coordinates and colors (%s)",
  (value) => {
    expect(
      validateMeshDoc({ ...triangle, positions: [value, ...triangle.positions.slice(1)] }),
    ).toBe(false);
    expect(validateMeshDoc({ ...triangle, colors: [value, ...triangle.colors.slice(1)] })).toBe(
      false,
    );
  },
);
it("rejects missing entries in sparse position/color arrays", () => {
  expect(validateMeshDoc({ ...triangle, positions: new Array(9) })).toBe(false);
  expect(validateMeshDoc({ ...triangle, colors: new Array(9) })).toBe(false);
});
it.each([[0, 1], [0, 1, 1.5], [0, 1, NaN], [0, 1, "2"], []])(
  "rejects incomplete or invalid indices %j",
  (...indices) => {
    expect(validateMeshDoc({ ...triangle, indices })).toBe(false);
  },
);
it.each(["cessna172r", "a10"])("committed %s model is valid and builds finite geometry", (name) => {
  const doc = JSON.parse(
    readFileSync(
      new URL(`../../../assets/generated/models/${name}.mesh.json`, import.meta.url),
      "utf8",
    ),
  );
  expect(doc.source).toBe(`YSFLIGHT/runtime/aircraft/${name}.dnm`);
  expect(doc.sourceFormat).toBe("ysflight-dnm");
  expect(validateMeshDoc(doc)).toBe(true);
  const geo = meshDocToGeometry(doc);
  geo.computeBoundingSphere();
  expect(Number.isFinite(geo.boundingSphere?.radius)).toBe(true);
  expect(geo.index!.count).toBeGreaterThan(100);
});
