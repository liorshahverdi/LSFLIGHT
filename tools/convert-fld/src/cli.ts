#!/usr/bin/env node
/**
 * convert-fld CLI (FLT-304): YSFlight .fld -> heightfield JSON.
 *
 * Usage: node dist/cli.js <input.fld> [output.json]
 * Writes JSON next to the input when output is omitted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { convertFld } from "./convert.js";

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("Usage: convert-fld <input.fld> [output.json]");
  process.exit(1);
}

const inPath = resolve(input);
const text = readFileSync(inPath, "utf8");
const relSource = inPath.includes("YSFLIGHT")
  ? "YSFLIGHT/" + inPath.slice(inPath.indexOf("YSFLIGHT") + "YSFLIGHT/".length)
  : null;

const json = JSON.stringify(convertFld(text, relSource), null, 2) + "\n";
const outPath = output ? resolve(output) : inPath.replace(/\.fld$/i, ".fld.json");
if (!output) {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dirname(outPath), { recursive: true });
}
writeFileSync(outPath, json);
console.log(`Wrote ${outPath}`);
