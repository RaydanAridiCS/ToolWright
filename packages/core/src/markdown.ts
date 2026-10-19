/** Markdown helpers. HTML returned here is NOT sanitized: sanitize before inserting into the DOM. */

import { marked } from "marked";

export function markdownToHtml(markdown: string, options: { gfm?: boolean; breaks?: boolean } = {}): string {
  return marked.parse(markdown, { async: false, gfm: options.gfm ?? true, breaks: options.breaks ?? false }) as string;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = (m[2] as string).replace(/[*_`[\]]/g, "").replace(/\(.*?\)/g, "").trim();
    let slug = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count) slug = `${slug}-${count}`;
    headings.push({ level: (m[1] as string).length, text, slug });
  }
  return headings;
}

/** Build a nested Markdown table of contents from headings. */
export function tableOfContents(markdown: string, options: { minLevel?: number; maxLevel?: number } = {}): string {
  const { minLevel = 1, maxLevel = 4 } = options;
  const headings = extractHeadings(markdown).filter((h) => h.level >= minLevel && h.level <= maxLevel);
  if (headings.length === 0) return "";
  const base = Math.min(...headings.map((h) => h.level));
  return headings.map((h) => `${"  ".repeat(h.level - base)}- [${h.text}](#${h.slug})`).join("\n");
}

/** Strip Markdown syntax to leave readable plain text. */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```.*\n?|```$/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Horizontal whitespace only: `\s` would swallow the blank lines between paragraphs.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]*([-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    .trim();
}
