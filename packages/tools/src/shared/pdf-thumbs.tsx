"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { createThumbnailer, type PageThumbnailer } from "./pdf-raster";

/** Draws each page once, on demand, and keeps the picture as an object URL until the store is closed. */
export class ThumbStore {
  private readonly urls = new Map<number, Promise<string>>();

  constructor(private readonly thumbnailer: PageThumbnailer) {}

  get(pageIndex: number): Promise<string> {
    let url = this.urls.get(pageIndex);
    if (!url) {
      url = this.thumbnailer.render(pageIndex).then((blob) => URL.createObjectURL(blob));
      this.urls.set(pageIndex, url);
    }
    return url;
  }

  dispose() {
    this.thumbnailer.dispose();
    for (const url of this.urls.values()) url.then((u) => URL.revokeObjectURL(u), () => undefined);
    this.urls.clear();
  }
}

/**
 * Page previews for one PDF. PDF.js is loaded when this mounts (that is, once a file has been dropped), the pictures
 * are drawn only for rows that scroll into view, and everything is released on unmount.
 */
export function useThumbnails(file: File) {
  const [store, setStore] = useState<ThumbStore | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: ThumbStore | null = null;
    createThumbnailer(file).then(
      (thumbnailer) => {
        made = new ThumbStore(thumbnailer);
        if (cancelled) made.dispose();
        else setStore(made);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      made?.dispose();
      setStore(null);
    };
  }, [file]);

  return { store, failed };
}

/** A 64px square (or custom size) holding a page picture, or the page icon until (or unless) the picture is ready. Decorative: the row names the page. */
export function PageThumb({ store, pageIndex, turn = 0, className }: { store: ThumbStore | null; pageIndex: number; turn?: number; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    let live = true;
    const load = () => {
      store.get(pageIndex).then(
        (u) => live && setUrl(u),
        () => undefined,
      );
    };
    const element = box.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        live = false;
      };
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [store, pageIndex]);

  return (
    <span
      ref={box}
      aria-hidden
      className={className ?? "grid size-16 shrink-0 place-items-center overflow-hidden border border-border bg-muted"}
    >
      {url && store ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
        <img src={url} alt="" className="max-h-full max-w-full object-contain transition-transform" style={{ transform: `rotate(${turn}deg)` }} />
      ) : (
        <FileText className="size-5 text-muted-foreground transition-transform" style={{ transform: `rotate(${turn}deg)` }} />
      )}
    </span>
  );
}

/**
 * Page previews for several files at once, keyed by an id per file. A store is made when a file appears and closed
 * when it goes, so each open file has one PDF.js worker. Pass `enabled: false` to close them all.
 */
export function useThumbStores(files: readonly { id: number; file: File }[], enabled = true): Map<number, ThumbStore> {
  const [stores, setStores] = useState<Map<number, ThumbStore>>(() => new Map());
  const made = useRef(new Map<number, Promise<ThumbStore | null>>());
  const key = useMemo(() => (enabled ? files.map((f) => f.id).join(",") : ""), [files, enabled]);

  useEffect(() => {
    const wanted = new Map(enabled ? files.map((f) => [f.id, f.file] as const) : []);
    for (const [id, pending] of made.current) {
      if (wanted.has(id)) continue;
      made.current.delete(id);
      void pending.then((s) => s?.dispose());
      setStores((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
    }
    for (const [id, file] of wanted) {
      if (made.current.has(id)) continue;
      const pending = createThumbnailer(file).then(
        (t) => new ThumbStore(t),
        () => null,
      );
      made.current.set(id, pending);
      void pending.then((store) => {
        if (!store) return;
        if (made.current.get(id) !== pending) return store.dispose();
        setStores((m) => new Map(m).set(id, store));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` lists the files; the array itself changes every render
  }, [key]);

  useEffect(() => {
    const all = made.current;
    return () => {
      for (const pending of all.values()) void pending.then((s) => s?.dispose());
      all.clear();
    };
  }, []);

  return stores;
}
