import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fontFileName, type FontLoader } from "../src/pdf-text";

const FONTS = join(import.meta.dirname, "..", "..", "..", "apps", "web", "node_modules", "@fontsource", "noto-sans", "files");

/** Reads the Noto Sans files from the installed package, the way the browser fetches them from /fonts/noto-sans. */
export const fontsFromDisk: FontLoader = async (subset, weight) => new Uint8Array(readFileSync(join(FONTS, fontFileName(subset, weight))));

/** Text that PDF.js can read back from a page of the saved file. */
export async function readBack(bytes: Uint8Array, pageNumber = 1): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
  await task.destroy();
  return text;
}

export interface ReadItem {
  str: string;
  /** Left end of the text on the unrotated page, in points from the bottom left. */
  x: number;
  y: number;
  width: number;
}

/** The pieces of text PDF.js finds on a page, with where they sit. */
export async function readItems(bytes: Uint8Array, pageNumber = 1): Promise<ReadItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), useWorkerFetch: false, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items = content.items.flatMap((item) => ("str" in item && item.str !== "" ? [{ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number, width: item.width }] : []));
  await task.destroy();
  return items;
}
