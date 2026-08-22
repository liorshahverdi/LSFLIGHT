/**
 * Tokenizer for YSFlight aircraft `.dat` format (FLT-301).
 *
 * Format rules (reverse-engineered from FsAirplaneProperty parsing and
 * runtime samples):
 *  - One record per line: `KEY value value ...`
 *  - `REM` lines are comments; `#` starts a trailing comment
 *  - Double-quoted strings are single tokens, quotes stripped in values
 *  - Unit suffixes stay attached to numbers ("9.7t", "25deg", "3ft")
 */
export interface DatRecord {
  key: string;
  /** Raw tokens with unit suffixes preserved. */
  values: string[];
}

const KEY_RE = /^[A-Z0-9_]+$/;

export function tokenizeDat(source: string): DatRecord[] {
  const records: DatRecord[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    // Full-line comments.
    if (line.startsWith("REM") && (line.length === 3 || /\s/.test(line[3] ?? ""))) {
      continue;
    }

    // Strip trailing # comment (respecting quotes).
    let work = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      if (ch === "#" && !inQuote) break;
      work += ch;
    }

    // Tokenize: whitespace-separated, quotes group tokens.
    const tokens: string[] = [];
    let token = "";
    inQuote = false;
    let tokenHasQuote = false;
    for (const ch of work) {
      if (ch === '"') {
        inQuote = !inQuote;
        tokenHasQuote = true;
        continue;
      }
      if (/\s/.test(ch) && !inQuote) {
        if (token.length > 0) {
          tokens.push(tokenHasQuote ? token : token);
          token = "";
          tokenHasQuote = false;
        }
        continue;
      }
      token += ch;
    }
    if (token.length > 0) tokens.push(token);

    if (tokens.length === 0) continue;

    const key = tokens[0] as string;
    if (!KEY_RE.test(key)) {
      throw new Error(`tokenizer: expected KEY at start of line, got "${key}"`);
    }
    records.push({ key, values: tokens.slice(1) });
  }

  return records;
}
