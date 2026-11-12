"use client";

import { useEffect, useState } from "react";
import { createThumbnailer, type PageThumbnailer } from "./pdf-raster";

/**
 * Draws one page of a PDF as a picture for a preview. `side` is the longer side in pixels. The picture is kept as a Blob
 * (so it can also be measured) and as an object URL that is released when the page or file changes.
 */
export function usePagePreview(file: File | null, pageIndex: number, side = 640) {
  const [thumbnailer, setThumbnailer] = useState<PageThumbnailer | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let made: PageThumbnailer | null = null;
    setFailed(false);
    createThumbnailer(file, side).then(
      (t) => {
        made = t;
        if (cancelled) t.dispose();
        else setThumbnailer(t);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
      made?.dispose();
      setThumbnailer(null);
      setBlob(null);
    };
  }, [file, side]);

  useEffect(() => {
    if (!thumbnailer) return;
    let live = true;
    thumbnailer.render(pageIndex).then(
      (b) => live && setBlob(b),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [thumbnailer, pageIndex]);

  useEffect(() => {
    if (!blob) return setUrl(null);
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);

  return { blob, url, failed };
}
