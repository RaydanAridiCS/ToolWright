/**
 * Draws and reads PDF pages with PDF.js: for Compress PDF's "Smallest file" mode (rebuild a PDF from page pictures),
 * for the page previews in the PDF Page Organizer, and for PDF to Images and PDF to Text.
 *
 * This is the only file that may mention `pdfjs-dist` (a test enforces it), and PDF.js is imported only when a
 * file is actually drawn, so nothing from it reaches the shared bundles or the page chunks. The renderer, its worker,
 * fonts and character maps are all served from this site (see scripts/copy-pdfjs-assets.mjs); nothing is fetched elsewhere.
 */
import { COMPRESS_LIMITS, CompressCancelled, createImagePdfBuilder, planRaster, type CompressProgress, type CompressSettings } from "@toolwright/core/pdf-compress";
import { PdfError } from "@toolwright/core/pdf";
import { PdfCancelled, PAGE_IMAGE_LIMITS, formatInfo, normalizeQuality, overBudget, planPageImage, type PageImageFormat } from "@toolwright/core/pdf-to-images";
import { TEXT_LIMITS, assemblePage, toPieces, type TextOptions } from "@toolwright/core/pdf-to-text";
import { QUALITIES, REDACT_LIMITS, boxPixelRects, matchBoxes, type RasterPage, type RedactBox, type RedactQuality, type SearchSpec, type ShareOfPiece } from "@toolwright/core/redact-pdf";

export interface RasterResult {
  data: Uint8Array;
  pages: number;
  /** Pages drawn at a lower resolution than asked, to stay under the canvas size limit. */
  cappedPages: number;
}

export interface RasterOptions {
  onProgress?: (progress: CompressProgress) => void;
  signal?: AbortSignal;
}

const ASSETS = "/pdfjs/";

type Pdfjs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>;

interface OpenPdf {
  pdfjs: Pdfjs;
  pdf: PdfDocument;
  /** Frees the document and stops PDF.js's worker. Safe to call more than once. */
  close(): Promise<void>;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The page could not be encoded."))), type, quality));
}

/** Loads PDF.js (once per page load, cached by the module system) and opens a file in a fresh worker. */
async function openPdf(file: File): Promise<OpenPdf> {
  if (typeof Worker === "undefined") throw new PdfError("This browser cannot draw pages.");
  // Loaded here and nowhere else: this is what keeps ~1.7 MB of PDF.js out of everything that does not need it.
  // The minified build has no type declarations of its own; it exports the same API as the main entry.
  // @ts-expect-error TS7016: no declaration file for the .min.mjs build
  const pdfjs: Pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");

  // The worker is a plain file served from this site, not bundled: the bundler rewrites worker entries into a
  // classic-script wrapper, and PDF.js's worker never completes its handshake inside that wrapper.
  const worker = new Worker(`${ASSETS}pdf.worker.min.mjs`, { type: "module" });
  let loading: ReturnType<Pdfjs["getDocument"]> | null = null;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await loading?.destroy().catch(() => undefined);
    worker.terminate();
  };

  try {
    const origin = window.location.origin;
    loading = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      // The declared type of `port` is too narrow; PDF.js accepts any Worker here.
      worker: new pdfjs.PDFWorker({ port: worker as never }),
      // The production Content Security Policy has no 'wasm-unsafe-eval', so the JavaScript decoders are used.
      useWasm: false,
      wasmUrl: `${origin}${ASSETS}wasm/`,
      cMapUrl: `${origin}${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${origin}${ASSETS}standard_fonts/`,
      enableXfa: false,
    });
    const pdf = await loading.promise.catch((err: unknown) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "PasswordException") throw new PdfError("This PDF is password-protected. Remove the password first.");
      throw new PdfError("This PDF could not be read. It may be corrupted or not a PDF.");
    });
    return { pdfjs, pdf, close };
  } catch (err) {
    await close();
    throw err;
  }
}

export async function rasterizePdf(file: File, settings: CompressSettings, options: RasterOptions = {}): Promise<RasterResult> {
  const { onProgress, signal } = options;
  const cancelled = () => signal?.aborted === true;
  if (cancelled()) throw new CompressCancelled();

  const canvas = document.createElement("canvas");
  let rendering: { cancel(): void } | null = null;
  const onAbort = () => rendering?.cancel();
  signal?.addEventListener("abort", onAbort);
  let open: OpenPdf | null = null;

  try {
    open = await openPdf(file);
    const { pdfjs, pdf } = open;
    if (cancelled()) throw new CompressCancelled();

    if (pdf.numPages > COMPRESS_LIMITS.maxSmallestPages) {
      throw new PdfError(`This PDF has ${pdf.numPages} pages. Smallest file is limited to ${COMPRESS_LIMITS.maxSmallestPages}. Split the file first, or use Keep text.`);
    }

    const metadata = await pdf.getMetadata().catch(() => null);
    const info = (metadata?.info ?? {}) as { Title?: unknown; Author?: unknown };
    const builder = await createImagePdfBuilder();
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new PdfError("This browser cannot draw pages.");
    let cappedPages = 0;

    for (let number = 1; number <= pdf.numPages; number++) {
      if (cancelled()) throw new CompressCancelled();
      onProgress?.({ done: number - 1, total: pdf.numPages });
      try {
        const page = await pdf.getPage(number);
        const plan = planRaster(page.view as [number, number, number, number], page.rotate, settings.maxDpi);
        if (plan.capped) cappedPages++;
        const viewport = page.getViewport({ scale: plan.scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        // JPEG has no transparency: paint paper first, or empty areas would turn black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE });
        rendering = task;
        await task.promise;
        rendering = null;
        const blob = await toBlob(canvas, "image/jpeg", settings.quality / 100);
        await builder.addPage(new Uint8Array(await blob.arrayBuffer()), plan.widthPt, plan.heightPt);
        page.cleanup();
      } catch (err) {
        if (cancelled()) throw new CompressCancelled();
        if (err instanceof PdfError) throw err;
        throw new PdfError(`Page ${number} could not be drawn. Your original file is untouched.`);
      }
    }
    onProgress?.({ done: pdf.numPages, total: pdf.numPages });
    const data = await builder.finish({ title: typeof info.Title === "string" ? info.Title : undefined, author: typeof info.Author === "string" ? info.Author : undefined });
    return { data, pages: pdf.numPages, cappedPages };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    canvas.width = canvas.height = 0;
    await open?.close();
  }
}

export interface PageThumbnailer {
  pageCount: number;
  /** Draws one page (zero-based) as a JPEG with its longer side `maxSide` pixels (default: the size given to `createThumbnailer`), turned the way the PDF itself says. Draws happen one at a time. */
  render(pageIndex: number, maxSide?: number): Promise<Blob>;
  dispose(): void;
}

/** Opens a PDF for previews. `maxSide` is the longer side of each thumbnail in pixels. */
export async function createThumbnailer(file: File, maxSide = 160): Promise<PageThumbnailer> {
  const open = await openPdf(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    await open.close();
    throw new PdfError("This browser cannot draw pages.");
  }
  let queue: Promise<unknown> = Promise.resolve();
  let disposed = false;

  return {
    pageCount: open.pdf.numPages,
    render(pageIndex, size = maxSide) {
      const job = queue.then(async () => {
        if (disposed) throw new Error("The previews were closed.");
        const page = await open.pdf.getPage(pageIndex + 1);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: size / Math.max(natural.width, natural.height) });
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport, annotationMode: open.pdfjs.AnnotationMode.ENABLE }).promise;
        const blob = await toBlob(canvas, "image/jpeg", size > 400 ? 0.9 : 0.8);
        page.cleanup();
        return blob;
      });
      queue = job.catch(() => undefined);
      return job;
    },
    dispose() {
      disposed = true;
      canvas.width = canvas.height = 0;
      void open.close();
    },
  };
}

/* ----------------------------------------------------------------------------------------------- */
/* PDF to Images                                                                                    */
/* ----------------------------------------------------------------------------------------------- */

export interface PageImage {
  /** Zero-based page number. */
  pageIndex: number;
  blob: Blob;
  width: number;
  height: number;
  /** Drawn at a lower resolution than asked, to stay under the canvas size limit. */
  capped: boolean;
}

export interface PageImagesOptions {
  /** Zero-based pages to draw, in order. */
  pageIndexes: number[];
  dpi: number;
  format: PageImageFormat;
  /** 40 to 100, for JPG and WebP. */
  quality: number;
  signal?: AbortSignal;
  onProgress?: (progress: CompressProgress) => void;
  /** Called with each finished picture, so the page can show progress as it happens. */
  onPage?: (image: PageImage) => void;
}

export interface PageImagesResult {
  images: PageImage[];
  pageCount: number;
  /** The run stopped early because the pictures together grew too large to keep in memory. */
  stoppedEarly: boolean;
}

/** Draws the chosen pages one at a time as PNG, JPG or WebP pictures. Nothing leaves the tab. */
export async function renderPagesToImages(file: File, options: PageImagesOptions): Promise<PageImagesResult> {
  const { pageIndexes, dpi, signal, onProgress, onPage } = options;
  const cancelled = () => signal?.aborted === true;
  if (cancelled()) throw new PdfCancelled();
  const info = formatInfo(options.format);
  const quality = normalizeQuality(options.quality);

  const canvas = document.createElement("canvas");
  let rendering: { cancel(): void } | null = null;
  const onAbort = () => rendering?.cancel();
  signal?.addEventListener("abort", onAbort);
  let open: OpenPdf | null = null;

  try {
    open = await openPdf(file);
    const { pdfjs, pdf } = open;
    if (cancelled()) throw new PdfCancelled();
    if (pageIndexes.some((i) => !Number.isInteger(i) || i < 0 || i >= pdf.numPages)) throw new PdfError("A selected page does not exist in this PDF.");
    if (pageIndexes.length > PAGE_IMAGE_LIMITS.maxPages) throw new PdfError(`At most ${PAGE_IMAGE_LIMITS.maxPages} pages can be drawn in one run.`);

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new PdfError("This browser cannot draw pages.");
    const images: PageImage[] = [];
    let totalBytes = 0;
    let stoppedEarly = false;

    for (const [position, pageIndex] of pageIndexes.entries()) {
      if (cancelled()) throw new PdfCancelled();
      if (overBudget(totalBytes)) {
        stoppedEarly = true;
        break;
      }
      onProgress?.({ done: position, total: pageIndexes.length });
      try {
        const page = await pdf.getPage(pageIndex + 1);
        const plan = planPageImage(page.view as [number, number, number, number], page.rotate, dpi);
        const viewport = page.getViewport({ scale: plan.scale });
        // A tiny rounding error (792 × 150 ÷ 72 is 1650.0000000000002) must not add a stray row of pixels.
        canvas.width = Math.max(1, Math.ceil(viewport.width - 1e-4));
        canvas.height = Math.max(1, Math.ceil(viewport.height - 1e-4));
        // PDF pages have no paper of their own: paint it, or JPG would turn black where nothing is drawn.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE });
        rendering = task;
        await task.promise;
        rendering = null;
        const blob = await toBlob(canvas, info.mime, quality);
        page.cleanup();
        const image: PageImage = { pageIndex, blob, width: canvas.width, height: canvas.height, capped: plan.capped };
        totalBytes += blob.size;
        images.push(image);
        onPage?.(image);
      } catch (err) {
        if (cancelled()) throw new PdfCancelled();
        if (err instanceof PdfError) throw err;
        throw new PdfError(`Page ${pageIndex + 1} could not be drawn. Your original file is untouched.`);
      }
    }
    onProgress?.({ done: images.length, total: pageIndexes.length });
    return { images, pageCount: pdf.numPages, stoppedEarly };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    canvas.width = canvas.height = 0;
    await open?.close();
  }
}

/* ----------------------------------------------------------------------------------------------- */
/* PDF to Text                                                                                      */
/* ----------------------------------------------------------------------------------------------- */

export interface PdfTextOptions extends TextOptions {
  signal?: AbortSignal;
  onProgress?: (progress: CompressProgress) => void;
}

export interface PdfTextResult {
  /** One string per page, in page order. */
  pages: string[];
  pageCount: number;
  /** Reading stopped because the text passed the size limit. */
  truncated: boolean;
}

/** Reads the text layer of every page. Pictures of text (scans) give empty pages; there is no OCR. */
export async function extractPdfText(file: File, options: PdfTextOptions): Promise<PdfTextResult> {
  const { signal, onProgress } = options;
  const cancelled = () => signal?.aborted === true;
  if (cancelled()) throw new PdfCancelled();
  let open: OpenPdf | null = null;
  try {
    open = await openPdf(file);
    const { pdf } = open;
    if (pdf.numPages > TEXT_LIMITS.maxPages) throw new PdfError(`This PDF has ${pdf.numPages} pages. At most ${TEXT_LIMITS.maxPages} can be read at once; split it first.`);
    const pages: string[] = [];
    let characters = 0;
    let truncated = false;
    for (let number = 1; number <= pdf.numPages; number++) {
      if (cancelled()) throw new PdfCancelled();
      onProgress?.({ done: number - 1, total: pdf.numPages });
      if (characters > TEXT_LIMITS.maxCharacters) {
        truncated = true;
        break;
      }
      try {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const text = assemblePage(toPieces(content.items as unknown[]), { joinHyphens: options.joinHyphens });
        characters += text.length;
        pages.push(text);
        page.cleanup();
      } catch {
        if (cancelled()) throw new PdfCancelled();
        throw new PdfError(`The text on page ${number} could not be read. Your original file is untouched.`);
      }
    }
    onProgress?.({ done: pages.length, total: pdf.numPages });
    return { pages, pageCount: pdf.numPages, truncated };
  } finally {
    await open?.close();
  }
}

/* ----------------------------------------------------------------------------------------------- */
/* Redact PDF                                                                                       */
/* ----------------------------------------------------------------------------------------------- */

export interface FoundText extends RedactBox {
  /** The text that was found inside the box. */
  text: string;
}

export interface FindTextResult {
  found: FoundText[];
  pageCount: number;
  /** Pages with no text layer at all (scans and pictures), which a search cannot see into. */
  pagesWithoutText: number[];
}

/** Searches the text layer of every page and returns a box around each match, in points on the page as shown. */
export async function findTextBoxes(file: File, spec: SearchSpec, options: { signal?: AbortSignal; onProgress?: (progress: CompressProgress) => void } = {}): Promise<FindTextResult> {
  const { signal, onProgress } = options;
  if (signal?.aborted) throw new PdfCancelled();
  let open: OpenPdf | null = null;
  try {
    open = await openPdf(file);
    const { pdf, pdfjs } = open;
    if (pdf.numPages > TEXT_LIMITS.maxPages) throw new PdfError(`This PDF has ${pdf.numPages} pages. At most ${TEXT_LIMITS.maxPages} can be searched at once.`);
    const canvas = document.createElement("canvas");
    const found: FoundText[] = [];
    const pagesWithoutText: number[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      if (signal?.aborted) throw new PdfCancelled();
      onProgress?.({ done: number - 1, total: pdf.numPages });
      try {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items = (content.items as unknown[]).flatMap((item) => {
          const it = item as { str?: unknown; transform?: unknown; width?: unknown; dir?: unknown; fontName?: unknown };
          return typeof it.str === "string" && Array.isArray(it.transform) && typeof it.width === "number"
            ? [{ str: it.str, transform: it.transform as number[], width: it.width, dir: typeof it.dir === "string" ? it.dir : undefined, font: typeof it.fontName === "string" ? it.fontName : undefined }]
            : [];
        });
        if (!items.some((i) => i.str.trim() !== "")) pagesWithoutText.push(number - 1);
        else {
          const measure = await letterMeasurer(page, pdfjs, canvas);
          for (const box of matchBoxes(items, viewport.transform, 1, spec, 1.5, measure)) found.push({ page: number - 1, left: box.left, top: box.top, width: box.width, height: box.height, text: box.text });
        }
        page.cleanup();
      } catch {
        if (signal?.aborted) throw new PdfCancelled();
        throw new PdfError(`The text on page ${number} could not be read.`);
      }
    }
    onProgress?.({ done: pdf.numPages, total: pdf.numPages });
    canvas.width = canvas.height = 0;
    return { found, pageCount: pdf.numPages, pagesWithoutText };
  } finally {
    await open?.close();
  }
}

type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

/**
 * Where inside a piece of text each letter sits. Splitting a piece in proportion to its letter count is wrong for ordinary
 * fonts (an "i" is narrower than an "m"), and a box that stops short leaves the end of a word readable. So the page is drawn
 * once, tiny, which makes PDF.js load its fonts; then the real letters of the real font are measured on a canvas, and
 * the result is scaled to the width PDF.js reports for the whole piece (which already counts letter and word spacing).
 * When a piece's font cannot be found, or the text runs right to left, the whole piece is covered.
 */
async function letterMeasurer(page: PdfPage, pdfjs: Pdfjs, canvas: HTMLCanvasElement): Promise<ShareOfPiece> {
  const natural = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 16 / Math.max(natural.width, natural.height, 1) });
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return () => null;
  try {
    await page.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
  } catch {
    return () => null;
  }
  const loaded = new Set<string>();
  for (const face of document.fonts) if (face.status === "loaded") loaded.add(face.family.replace(/^["']|["']$/g, ""));
  const families = new Map<string, string | null>();
  const familyOf = (fontName: string | undefined): string | null => {
    if (!fontName) return null;
    if (!families.has(fontName)) {
      let family: string | null = null;
      try {
        const loadedName = (page.commonObjs.get(fontName) as { loadedName?: unknown } | undefined)?.loadedName;
        if (typeof loadedName === "string" && loaded.has(loadedName)) family = loadedName;
      } catch {
        family = null;
      }
      families.set(fontName, family);
    }
    return families.get(fontName) ?? null;
  };
  const measuring = document.createElement("canvas").getContext("2d");
  if (!measuring) return () => null;

  return (item, from, to) => {
    const family = familyOf(item.font);
    if (!family || item.str.length === 0) return null;
    measuring.font = `100px "${family}"`;
    // One letter at a time: PDF.js places letters by their advance widths, with no kerning or ligatures.
    const edges = new Array<number>(item.str.length + 1).fill(0);
    let at = 0;
    for (const ch of item.str) {
      const w = measuring.measureText(ch).width;
      const base = edges[at] as number;
      for (let k = 0; k < ch.length; k++) edges[at + k + 1] = base + (w * (k + 1)) / ch.length;
      at += ch.length;
    }
    const total = edges[item.str.length] as number;
    if (!(total > 0)) return null;
    return [(edges[from] as number) / total, (edges[to] as number) / total];
  };
}

export interface RedactRenderOptions {
  /** Zero-based pages to draw as pictures. */
  pageIndexes: number[];
  boxes: readonly RedactBox[];
  quality: RedactQuality;
  signal?: AbortSignal;
  onProgress?: (progress: CompressProgress) => void;
}

export interface RedactRenderResult {
  pages: Map<number, RasterPage>;
  /** Pages drawn at a lower resolution than asked, to stay under the canvas size limit. */
  cappedPages: number;
}

/** Draws each page, paints its boxes solid black into the pixels, and encodes the result. Nothing else of the page survives. */
export async function renderRedactedPages(file: File, options: RedactRenderOptions): Promise<RedactRenderResult> {
  const { pageIndexes, boxes, quality, signal, onProgress } = options;
  const cancelled = () => signal?.aborted === true;
  if (cancelled()) throw new PdfCancelled();
  const info = QUALITIES[quality];
  if (pageIndexes.length > REDACT_LIMITS.maxRasterPages) throw new PdfError(`${pageIndexes.length} pages would be drawn as pictures. At most ${REDACT_LIMITS.maxRasterPages} can be done at once; mark fewer pages or split the file first.`);

  const canvas = document.createElement("canvas");
  let rendering: { cancel(): void } | null = null;
  const onAbort = () => rendering?.cancel();
  signal?.addEventListener("abort", onAbort);
  let open: OpenPdf | null = null;
  try {
    open = await openPdf(file);
    const { pdfjs, pdf } = open;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new PdfError("This browser cannot draw pages.");
    const pages = new Map<number, RasterPage>();
    let cappedPages = 0;
    for (const [position, pageIndex] of pageIndexes.entries()) {
      if (cancelled()) throw new PdfCancelled();
      onProgress?.({ done: position, total: pageIndexes.length });
      try {
        if (pageIndex < 0 || pageIndex >= pdf.numPages) throw new PdfError(`Page ${pageIndex + 1} does not exist in this PDF.`);
        const page = await pdf.getPage(pageIndex + 1);
        const plan = planRaster(page.view as [number, number, number, number], page.rotate, info.dpi);
        if (plan.capped) cappedPages++;
        const viewport = page.getViewport({ scale: plan.scale });
        canvas.width = Math.max(1, Math.ceil(viewport.width - 1e-4));
        canvas.height = Math.max(1, Math.ceil(viewport.height - 1e-4));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvas, canvasContext: context, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE });
        rendering = task;
        await task.promise;
        rendering = null;
        // Paint last, over everything, in pure black and with no transparency.
        context.fillStyle = "#000000";
        for (const r of boxPixelRects(boxes.filter((b) => b.page === pageIndex), { width: plan.widthPt, height: plan.heightPt }, canvas.width, canvas.height)) {
          context.fillRect(r.x, r.y, r.width, r.height);
        }
        const blob = await toBlob(canvas, info.format === "png" ? "image/png" : "image/jpeg", info.jpeg);
        pages.set(pageIndex, { image: new Uint8Array(await blob.arrayBuffer()), kind: info.format, widthPt: plan.widthPt, heightPt: plan.heightPt });
        page.cleanup();
      } catch (err) {
        if (cancelled()) throw new PdfCancelled();
        if (err instanceof PdfError) throw err;
        throw new PdfError(`Page ${pageIndex + 1} could not be drawn. Your original file is untouched.`);
      }
    }
    onProgress?.({ done: pageIndexes.length, total: pageIndexes.length });
    return { pages, cappedPages };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    canvas.width = canvas.height = 0;
    await open?.close();
  }
}
