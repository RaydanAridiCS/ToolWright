# Roadmap

Ideas we'd love help with, roughly ordered by value. Vote on the [request board](https://toolwright.com/requests) or open an issue to claim one. Anything here must keep the core promise: **no tool input leaves the device**.

## Tools people ask for

- **Audio and video** — trim, convert and compress in the browser (WebAssembly FFmpeg). Must be bundled locally (the CSP forbids loading it from a CDN) and lazy-loaded.
- **Image background remover** — a small on-device model.
- **JSON** — JSON diff, three-way JSON merge, the JSON Schema generator, the JSON Schema validator (drafts 4–2020-12, via `@cfworker/json-schema`) and the JSONPath tester are built.
- **HEIC → JPG**, **APNG tools**. The favicon pack generator, the Mermaid diagram editor, the animated GIF maker and editor, and eleven SVG tools (optimizer, editor, sanitizer, data URI, React, paths, recolor, shapes, image tracing) are built. Still open for SVG: an icon-sprite builder and SVG to PDF/ICO.
- **OCR** — text from images and scanned PDFs with a local engine.
- **Text** — text-to-speech preview using the Web Speech API is built. Readability scores and HTML → Markdown are built; Markdown → HTML is the Markdown Previewer's HTML tab.
- **Developer** — GraphQL formatter, Dockerfile linter, YAML validator, fetch → cURL, the XML formatter and converter, the IP and subnet calculator, the JSON Schema validator, the TOML validator and the GraphQL query-against-schema validator are built. Still open: a `docker-compose` / Kubernetes manifest checker (needs schemas bundled locally) and XSD validation for XML.
- **Image editing** — Crop, Rotate & Flip (including a circular or rounded cut for avatars), Compress to Target Size (quality bisection under a kilobyte limit, with downscale rounds) and Compare Two Images (overlay, side by side and difference map) are built. Still open: perspective correction and adding text or shapes.
- **Generators** — the Barcode Generator (Code 128, EAN-13, EAN-8, UPC-A, Code 39, Interleaved 2 of 5, ITF-14), the Data Matrix generator and the PDF417 generator are built. Still open: UPC-E, Code 93 and Codabar.
- **Calculators** — unit price comparison, BMI (with honest caveats), the meeting time planner, mortgage affordability and the salary/hourly converter are built.
- **PDF** — Sign PDF (visual signatures), PDF to Images and PDF to Text are built. Still open: extracting the pictures embedded in a PDF (as opposed to snapshots of its pages), and OCR so scanned PDFs have text to read (needs WebAssembly). A certificate-based digital signature is a separate, larger job that needs a security review. Compress PDF follow-ups: recompress lossless images that are clearly photographs, and let Smallest file keep selectable text with an invisible text layer (needs OCR). Page previews could also come to Split PDF and Extract PDF Pages, using the same renderer.

## Search and discovery

Queries people type where Toolwright has a tool with thin coverage, or no tool. None of these is built; each would need a page that is accurate and better than what exists.

- **No tool yet:** HEIC to JPG, PDF unlock and PDF protect (password), PDF to Word and Word to PDF, OCR for scans (the commonest reason PDF to Text finds nothing), image background remover, and audio and video conversion. Text-to-speech preview, Data Matrix and PDF417 codes are built.
- **Features searchers ask for that exist less than they should:** compress to a target size ("compress PDF to 100 KB") — Compress to Target Size now covers it for images; for PDFs, Compress PDF has strengths but no size target, and the guides say so.
- **More guides worth writing when they can be made accurate:** how to sign a PDF without uploading it, how to convert PDF pages to images and what DPI to use, how to read a JWT safely, regex cheat sheet for the JavaScript engine.
- **Internationalisation:** hreflang and translated pages are deliberately not started. A later opportunity once the English pages have settled.
- **After launch:** replace the estimated volume and difficulty in `docs/keyword-map.md` with real queries from Search Console and Bing Webmaster Tools, and rewrite the titles of pages that get impressions but few clicks.

## Platform improvements

- Publish `@toolwright/core` to npm as a standalone, tree-shakeable library with its own README and examples.
- Nonce-based CSP to drop `'unsafe-inline'` from `script-src`.
- Precache every tool chunk for fully-offline use after install (opt-in, with a size indicator).
- Keyboard shortcut help dialog and per-tool shortcuts.
- Localized UI and tool help text (i18n).
- Embeddable tool widgets (`<iframe>`-free, web-component based) for blogs and docs.
- Visual regression tests (Playwright screenshots) for the highest-traffic tools.
- Tool usage ideas surfaced locally ("Because you used X…") using only on-device data.

## Quality

- More real-world fixtures for the image-metadata and PDF tools (rotated JPEGs, encrypted PDFs, huge files).
- Streaming/worker-based processing for very large files to keep the UI responsive (Web Workers).
- Screen-reader walkthroughs documented per tool category.
- Performance budgets: fail CI if a tool's JS exceeds an agreed size.

## Not planned

- User accounts, cloud storage or server-side processing of user files.
- Advertising or third-party tracking.
- Features that require sending user input to an API.
