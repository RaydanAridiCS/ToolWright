import { fontFileName, type FontLoader } from "@toolwright/core/pdf-text";

const files = new Map<string, Promise<Uint8Array>>();

/**
 * Fetches a Noto Sans file from this site (copied to /fonts/noto-sans by scripts/copy-font-assets.mjs) when a PDF tool
 * needs to print text the standard PDF fonts cannot. Each file is fetched once; the service worker keeps it for offline use.
 */
export const loadPdfFont: FontLoader = (subset, weight) => {
  const name = fontFileName(subset, weight);
  let file = files.get(name);
  if (!file) {
    file = fetch(`/fonts/noto-sans/${name}`).then(async (response) => {
      if (!response.ok) throw new Error(`Font ${name} could not be loaded (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    });
    files.set(name, file);
    file.catch(() => files.delete(name));
  }
  return file;
};
