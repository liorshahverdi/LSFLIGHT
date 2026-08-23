/**
 * Minimal YSFlight .fld tokenizer (FLT-304).
 *
 * Splits a line into whitespace-separated arguments, honoring double-quoted
 * strings. Mirrors YsString::Arguments closely enough for .fld/.ter content:
 * comments (# prefix) are handled by the parser, not here.
 */
export function tokenize(line: string): string[] {
  const args: string[] = [];
  let cur = "";
  let inQuote = false;
  let hasContent = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (inQuote) {
      if (ch === '"') {
        inQuote = false;
        args.push(cur);
        cur = "";
        hasContent = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
      hasContent = true;
    } else if (/\s/.test(ch)) {
      if (hasContent || cur.length > 0) {
        args.push(cur);
        cur = "";
        hasContent = false;
      }
    } else {
      cur += ch;
      hasContent = true;
    }
  }
  if (inQuote || hasContent || cur.length > 0) {
    args.push(cur);
  }
  return args;
}

/** YSFlight keyword matching capitalizes the command word. */
export function commandOf(args: string[]): string {
  return (args[0] ?? "").toUpperCase();
}
