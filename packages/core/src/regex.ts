/** Regular-expression testing helpers. */

export interface RegexMatchInfo {
  match: string;
  index: number;
  end: number;
  line: number;
  column: number;
  groups: (string | undefined)[];
  named: Record<string, string | undefined>;
}

export type RegexResult =
  | { ok: true; matches: RegexMatchInfo[]; truncated: boolean; flags: string }
  | { ok: false; error: string };

export const REGEX_FLAGS = [
  { flag: "g", label: "global", description: "Find all matches" },
  { flag: "i", label: "ignore case", description: "Case-insensitive" },
  { flag: "m", label: "multiline", description: "^ and $ match line boundaries" },
  { flag: "s", label: "dotAll", description: ". matches newlines" },
  { flag: "u", label: "unicode", description: "Full Unicode support" },
  { flag: "y", label: "sticky", description: "Match only at lastIndex" },
] as const;

export function compileRegex(pattern: string, flags: string): RegExp {
  const unique = Array.from(new Set(flags.split(""))).join("");
  return new RegExp(pattern, unique);
}

export function testRegex(pattern: string, flags: string, text: string, limit = 1000): RegexResult {
  if (pattern === "") return { ok: true, matches: [], truncated: false, flags };
  let re: RegExp;
  try {
    re = compileRegex(pattern, flags.includes("g") ? flags : `${flags}g`);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const matches: RegexMatchInfo[] = [];
  let truncated = false;
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  for (const m of text.matchAll(re)) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    const index = m.index ?? 0;
    let line = lineStarts.length;
    while (line > 1 && (lineStarts[line - 1] as number) > index) line--;
    matches.push({
      match: m[0],
      index,
      end: index + m[0].length,
      line,
      column: index - (lineStarts[line - 1] as number) + 1,
      groups: m.slice(1),
      named: { ...(m.groups ?? {}) },
    });
  }
  return { ok: true, matches, truncated, flags: re.flags };
}

export function replaceRegex(pattern: string, flags: string, text: string, replacement: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: text.replace(compileRegex(pattern, flags), replacement) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface RegexPreset {
  name: string;
  pattern: string;
  flags: string;
  sample: string;
}

export const REGEX_PRESETS: RegexPreset[] = [
  { name: "Email address", pattern: "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+", flags: "gi", sample: "Contact ada@example.com or grace.hopper@navy.mil today." },
  { name: "URL", pattern: "https?:\\/\\/[^\\s/$.?#].[^\\s]*", flags: "gi", sample: "Docs at https://example.com/docs?page=1 and http://localhost:3000." },
  { name: "IPv4 address", pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b", flags: "g", sample: "Servers: 192.168.0.1, 10.0.0.255 and 999.1.1.1." },
  { name: "Hex color", pattern: "#(?:[0-9a-fA-F]{3}){1,2}\\b", flags: "g", sample: "Colors: #fff, #1a2b3c and #12." },
  { name: "ISO date", pattern: "\\b\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])\\b", flags: "g", sample: "From 2026-01-15 to 2026-12-31, not 2026-13-40." },
  { name: "Phone number (US)", pattern: "\\(?\\b\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}\\b", flags: "g", sample: "Call (555) 123-4567 or 555.987.6543." },
  { name: "Word duplicates", pattern: "\\b(\\w+)\\s+\\1\\b", flags: "gi", sample: "This is is a test of the the system." },
  { name: "Named groups", pattern: "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})", flags: "g", sample: "Released on 2026-10-19." },
];
