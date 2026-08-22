/**
 * Parser: tokenized .dat records -> structured document (FLT-301).
 * Unknown keys are reported as warnings — never silently dropped (guardrail).
 */
import { tokenizeDat, type DatRecord } from "./tokenizer.js";

export interface ParsedDat {
  /** Keys appearing once. */
  single: Record<string, string[]>;
  /** Keys appearing multiple times, in file order. */
  multi: Record<string, string[][]>;
  /** Keys not in the known-key set (or all keys when no known set given). */
  warnings: string[];
}

export interface ParseOptions {
  /** If provided, any key outside this set produces a warning. */
  knownKeys?: Iterable<string>;
}

export function parseDat(source: string, options: ParseOptions = {}): ParsedDat {
  const records: DatRecord[] = tokenizeDat(source);
  const known = options.knownKeys ? new Set(options.knownKeys) : undefined;
  const single: Record<string, string[]> = {};
  const multi: Record<string, string[][]> = {};
  const counts = new Map<string, number>();
  const warnings: string[] = [];

  for (const rec of records) {
    const n = (counts.get(rec.key) ?? 0) + 1;
    counts.set(rec.key, n);
    if (n === 1) single[rec.key] = rec.values;
    else {
      if (n === 2) multi[rec.key] = [single[rec.key] as string[]];
      (multi[rec.key] as string[][]).push(rec.values);
    }
    if (known && !known.has(rec.key)) warnings.push(`unknown key ${rec.key}`);
  }

  return { single, multi, warnings };
}
