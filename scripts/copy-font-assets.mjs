#!/usr/bin/env node
/**
 * Copies the Noto Sans files that PDF tools use for text the standard PDF fonts cannot print (Cyrillic, Greek,
 * Polish, Vietnamese…) into apps/web/public/fonts/noto-sans/, so they are served from this site (the Content
 * Security Policy forbids fetching them elsewhere). A tool fetches a file only when the text needs it.
 *
 * Noto Sans is licensed under the SIL Open Font License 1.1; the licence text is copied next to the fonts.
 * The output is generated and git-ignored. Run automatically before `dev` and `build`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps", "web", "package.json"));
const source = dirname(require.resolve("@fontsource/noto-sans/package.json"));
const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
const target = join(root, "apps", "web", "public", "fonts", "noto-sans");
const stamp = join(target, ".version");

// Keep in step with FONT_SUBSETS and FontWeight in packages/core/src/pdf-text.ts.
const SUBSETS = ["latin", "latin-ext", "vietnamese", "cyrillic", "cyrillic-ext", "greek", "greek-ext"];
const WEIGHTS = [400, 700];

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const subset of SUBSETS) {
  for (const weight of WEIGHTS) {
    const name = `noto-sans-${subset}-${weight}-normal.woff2`;
    cpSync(join(source, "files", name), join(target, name));
  }
}
cpSync(join(source, "LICENSE"), join(target, "LICENSE"));
writeFileSync(stamp, version);
console.log(`@fontsource/noto-sans ${version}: ${SUBSETS.length * WEIGHTS.length} font files copied to apps/web/public/fonts/noto-sans`);
