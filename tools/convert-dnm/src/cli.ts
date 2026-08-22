import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { convertDnm } from "./convert.js";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("usage: convert-dnm <input.dnm> <output.mesh.json>");
  process.exit(1);
}

const src = readFileSync(input, "utf8");
const { mesh, warnings } = convertDnm(src);
mkdirSync(dirname(output), { recursive: true });
const doc = {
  schemaVersion: 1,
  sourceFormat: "ysflight-dnm",
  source: input,
  ...mesh,
};
writeFileSync(output, JSON.stringify(doc));
console.log(
  `converted ${input}: ${mesh.positions.length / 3} verts, ${mesh.indices.length / 3} tris, ${warnings.length} warnings`,
);
for (const w of warnings.slice(0, 10)) console.log("  warn:", w);
