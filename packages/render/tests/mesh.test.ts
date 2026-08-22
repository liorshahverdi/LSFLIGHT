import { it, expect } from "vitest";
import { validateMeshDoc } from "../src/mesh.js";

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
