import { it } from "vitest";
import { convertDnm } from "../src/convert.js";
import { readFileSync } from "node:fs";
it("indices", () => {
  const src = readFileSync(new URL("./fixtures/minimal.dnm", import.meta.url), "utf8");
  console.log("IDX:", JSON.stringify(convertDnm(src).mesh.indices));
});
