/**
 * "Continue with…": passes a finished PDF straight into the next tool, so nobody has to download a file and
 * drop it in again.
 *
 * The file is held in a module variable for one client-side navigation and nothing else. It is never written
 * to storage, never put in the URL and never sent anywhere. A full page reload drops it, which is the point.
 */
import { useEffect, useRef } from "react";

export interface PdfHandoff {
  /** Slug of the tool that should receive the file. */
  to: string;
  name: string;
  bytes: Uint8Array;
}

type Navigate = (href: string) => void;

let pending: PdfHandoff | null = null;
let navigate: Navigate | null = null;

/** Tools that take one PDF as input and can pick up a handed-off file. Order is the order shown to people. */
export const HANDOFF_TARGETS: readonly { slug: string; label: string }[] = [
  { slug: "compress-pdf", label: "Compress" },
  { slug: "edit-pdf", label: "Edit" },
  { slug: "sign-pdf", label: "Sign" },
  { slug: "pdf-organizer", label: "Organize pages" },
  { slug: "merge-pdf", label: "Merge with more PDFs" },
  { slug: "pdf-watermark", label: "Add watermark" },
  { slug: "pdf-page-numbers", label: "Add page numbers" },
  { slug: "pdf-header-footer", label: "Add header and footer" },
  { slug: "rotate-pdf", label: "Rotate pages" },
  { slug: "crop-pdf", label: "Crop" },
  { slug: "resize-pdf", label: "Resize pages" },
  { slug: "pdf-n-up", label: "Pages per sheet" },
  { slug: "pdf-booklet", label: "Make a booklet" },
  { slug: "split-pdf", label: "Split" },
  { slug: "delete-pdf-pages", label: "Delete pages" },
  { slug: "extract-pdf-pages", label: "Extract pages" },
  { slug: "remove-blank-pages", label: "Remove blank pages" },
  { slug: "redact-pdf", label: "Redact" },
  { slug: "protect-pdf", label: "Add a password" },
  { slug: "fill-pdf-form", label: "Fill form" },
  { slug: "pdf-metadata-editor", label: "Edit metadata" },
  { slug: "pdf-to-images", label: "Convert to images" },
  { slug: "pdf-to-text", label: "Copy the text" },
  { slug: "extract-pdf-images", label: "Extract images" },
];

/** Called once by the site with its router, so a hand-off keeps the page's memory (no full reload). */
export function registerToolNavigator(fn: Navigate | null): void {
  navigate = fn;
}

export function canHandOff(): boolean {
  return navigate !== null;
}

/** Holds the file for `to` and moves there. Returns false when the site has not registered a navigator. */
export function handOffPdf(to: string, name: string, bytes: Uint8Array): boolean {
  if (!navigate) return false;
  pending = { to, name, bytes };
  navigate(`/tools/${to}`);
  return true;
}

/** Takes the waiting file if it is meant for `slug`. It can be taken once. */
export function takePdfHandoff(slug: string): PdfHandoff | null {
  if (!pending || pending.to !== slug) return null;
  const taken = pending;
  pending = null;
  return taken;
}

/** The slug of the tool page the visitor is on, or null outside /tools/<slug> (for example the home page bench). */
export function currentToolSlug(): string | null {
  if (typeof window === "undefined") return null;
  const match = /^\/tools\/([a-z0-9-]+)\/?$/.exec(window.location.pathname);
  return match?.[1] ?? null;
}

/** Calls `receive` once with a handed-off PDF, if one is waiting for the current tool page. */
export function usePdfHandoff(receive: (file: File) => void): void {
  const receiveRef = useRef(receive);
  useEffect(() => {
    receiveRef.current = receive;
  });
  useEffect(() => {
    const slug = currentToolSlug();
    const handoff = slug ? takePdfHandoff(slug) : null;
    if (handoff) receiveRef.current(new File([handoff.bytes as Uint8Array<ArrayBuffer>], handoff.name, { type: "application/pdf" }));
  }, []);
}
