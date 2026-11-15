"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Alert, Button, Toggle, baseName, cn } from "@toolwright/ui";
import { createStandardMeasurer, editPdf, topForBaseline, EDIT_LIMITS, type Measure } from "@toolwright/core/pdf-edit";
import { displaySize, looksDigitallySigned, readPageGeometry, type PageGeometry } from "@toolwright/core/pdf-sign";
import { DownloadResult, JobError, PdfDrop, PdfLoadStatus, PdfSourceCard, RunButton, useJob, usePdfSource, type PdfSource } from "../../shared/pdf-ui";
import { createThumbnailer, type PageThumbnailer, type SampledTextLine } from "../../shared/pdf-raster";
import { PageThumb, useThumbnails } from "../../shared/pdf-thumbs";
import { SignatureMaker, type Signature } from "../../shared/signature-maker";
import { loadPdfFont } from "../../shared/pdf-fonts";
import { errorMessage } from "../../shared/format";
import { prepareImage } from "./images";
import { CSS_FAMILIES, DEFAULT_STYLE, css, describeItem, moveItem, toEdits, useItemHistory, type ImageItem, type Item, type Style, type TextItem, type ToolId } from "./model";
import { Properties, TOOLS, Toolbar, kindForTool } from "./panels";
import { Stage, defaultBox, newText, placeImage, useBaselineShift, type PageView } from "./stage";

export default function Tool() {
  const pdf = usePdfSource();
  const source = pdf.source;
  return (
    <div className="flex flex-col gap-5">
      {source ? <PdfSourceCard source={source} onRemove={pdf.clear} /> : <PdfDrop onFile={(f) => void pdf.load(f)} onReject={pdf.setError} loading={pdf.loading} />}
      <PdfLoadStatus pdf={pdf} />
      {source ? <Editor key={`${source.file.name}:${source.file.size}:${source.file.lastModified}`} source={source} /> : null}
    </div>
  );
}

const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];
const CREATES: ToolId[] = ["text", "rect", "ellipse", "line", "arrow", "whiteout", "check", "cross", "dot"];
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function Editor({ source }: { source: PdfSource }) {
  const history = useItemHistory();
  const { items } = history;
  const [geometry, setGeometry] = useState<PageGeometry[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setToolState] = useState<ToolId>("select");
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [snapToText, setSnapToText] = useState(true);
  const [lines, setLines] = useState<Map<number, SampledTextLine[] | "loading" | "failed">>(new Map());
  const [notice, setNotice] = useState<{ tone: "info" | "warning" | "error"; text: string } | null>(null);
  const [measurer, setMeasurer] = useState<Awaited<ReturnType<typeof createStandardMeasurer>> | null>(null);
  const [savedItems, setSavedItems] = useState<Item[] | null>(null);
  const job = useJob<Uint8Array>();
  const nextId = useRef(1);
  const root = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const clipboard = useRef<Item[] | null>(null);
  const lastImagePaste = useRef(0);
  const urls = useRef<string[]>([]);
  const signed = useMemo(() => looksDigitallySigned(source.bytes), [source]);
  const pageCount = source.info.pageCount;

  useEffect(() => {
    let live = true;
    readPageGeometry(source.bytes).then(
      (g) => live && setGeometry(g),
      () => live && setNotice({ tone: "error", text: "The pages of this PDF could not be measured." }),
    );
    createStandardMeasurer().then((m) => live && setMeasurer(() => m));
    const made = urls.current;
    return () => {
      live = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [source]);

  const view: PageView = useMemo(() => (geometry?.[pageIndex] ? displaySize(geometry[pageIndex] as PageGeometry) : { width: 612, height: 792 }), [geometry, pageIndex]);

  /* ---------------------------------------------------------------------------------------------- */
  /* Measuring text the way the PDF will                                                            */
  /* ---------------------------------------------------------------------------------------------- */

  const canvasMeasures = useRef(new Map<string, Measure>());
  const measureFor = useCallback(
    (t: Pick<TextItem, "text" | "family" | "bold" | "italic">): Measure => {
      const flat = t.text.replace(/[\r\n\t]+/g, " ");
      if (measurer && measurer(flat, t.family, t.bold, t.italic) !== null) return (s) => measurer(s, t.family, t.bold, t.italic) ?? 0;
      // Text the standard fonts cannot print is saved in Noto Sans; a sans-serif canvas font is close enough for the preview.
      const key = `${t.family}${t.bold}${t.italic}`;
      let m = canvasMeasures.current.get(key);
      if (!m) {
        const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
        if (ctx) ctx.font = `${t.italic ? "italic " : ""}${t.bold ? 700 : 400} 100px ${measurer ? "sans-serif" : CSS_FAMILIES[t.family]}`;
        m = (s) => (ctx ? ctx.measureText(s).width / 100 : s.length * 0.55);
        canvasMeasures.current.set(key, m);
      }
      return m;
    },
    [measurer],
  );

  /** Grows an auto-width text box to fit its longest line, up to the page edge. */
  const fit = useCallback(
    (item: TextItem): TextItem => {
      if (!item.auto) return item;
      const g = geometry?.[item.page];
      const pageWidth = g ? displaySize(g).width : view.width;
      const measure = measureFor(item);
      const natural = Math.max(...item.text.split("\n").map((p) => measure(p.replace(/\t/g, "    ")) * item.size), item.size * 0.6);
      return { ...item, width: Math.max(Math.min(natural + 2, pageWidth - item.left), Math.min(20, pageWidth - item.left), 8) };
    },
    [geometry, view.width, measureFor],
  );

  /* ---------------------------------------------------------------------------------------------- */
  /* Page pictures and text lines                                                                    */
  /* ---------------------------------------------------------------------------------------------- */

  const [renderer, setRenderer] = useState<PageThumbnailer | null>(null);
  const [rendererFailed, setRendererFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: PageThumbnailer | null = null;
    createThumbnailer(source.file, 1600).then(
      (t) => {
        made = t;
        if (live) setRenderer(t);
        else t.dispose();
      },
      () => live && setRendererFailed(true),
    );
    return () => {
      live = false;
      made?.dispose();
    };
  }, [source]);

  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fitScale = useMemo(() => {
    const maxHeight = typeof window !== "undefined" ? Math.max(360, window.innerHeight * 0.78) : 800;
    const width = Math.max(200, frameWidth - 2);
    return Math.min(width / view.width, maxHeight / view.height);
  }, [frameWidth, view]);
  const scale = fitScale * zoom;

  const [picture, setPicture] = useState<{ page: number; url: string } | null>(null);
  const [pictureFailed, setPictureFailed] = useState(false);
  const pixelSide = useMemo(() => {
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    return Math.min(3200, Math.max(600, Math.ceil((Math.max(view.width, view.height) * scale * dpr) / 200) * 200));
  }, [view, scale]);
  useEffect(() => {
    if (!renderer) return;
    let live = true;
    let url: string | null = null;
    setPictureFailed(false);
    const timer = setTimeout(() => {
      renderer.render(pageIndex, pixelSide).then(
        (blob) => {
          if (!live) return;
          url = URL.createObjectURL(blob);
          setPicture({ page: pageIndex, url });
        },
        () => live && setPictureFailed(true),
      );
    }, 80);
    return () => {
      live = false;
      clearTimeout(timer);
      if (url) setTimeout(() => URL.revokeObjectURL(url as string), 1000);
    };
  }, [renderer, pageIndex, pixelSide]);

  const wantsLines = tool === "edit-text" || tool === "highlight";
  const pageLines = lines.get(pageIndex);
  useEffect(() => {
    if (!renderer || !wantsLines || lines.has(pageIndex)) return;
    setLines((m) => new Map(m).set(pageIndex, "loading"));
    renderer.readTextLines(pageIndex).then(
      (found) => setLines((m) => new Map(m).set(pageIndex, found)),
      () => setLines((m) => new Map(m).set(pageIndex, "failed")),
    );
  }, [renderer, wantsLines, pageIndex, lines]);

  /* ---------------------------------------------------------------------------------------------- */
  /* Changing items                                                                                  */
  /* ---------------------------------------------------------------------------------------------- */

  const touched = () => {
    job.reset();
    setNotice(null);
  };

  const setTool = (t: ToolId) => {
    finishEditing();
    setNotice(null);
    if (t === "image") {
      imageInput.current?.click();
      return;
    }
    setToolState(t);
    if (t !== "select") setSelectedId(null);
  };

  const withIds = (made: Item[]) => made.map((item) => ({ ...item, id: nextId.current++ }) as Item);

  const create = (made: Item[], then: "select" | "edit" | "stay") => {
    touched();
    const fresh = withIds(made).map((it) => (it.kind === "text" ? fit(it) : it));
    const last = fresh[fresh.length - 1];
    if (!last) return;
    if (then === "edit" && last.kind === "text" && last.text === "" && !last.cover) {
      // An empty box becomes an undo step only once something is typed into it.
      history.live((current) => [...current, ...fresh]);
    } else {
      history.commit((current) => [...current, ...fresh]);
    }
    setSelectedId(last.id);
    if (then === "edit") setEditingId(last.id);
    if (then === "select") setToolState("select");
  };

  /** Leaves the text field. A new box left empty is removed again, without an undo step. */
  const finishEditing = () => {
    const id = editingId;
    if (id === null) return;
    setEditingId(null);
    const item = items.find((i) => i.id === id);
    if (item?.kind === "text" && item.text.trim() === "" && !item.cover) {
      history.cancelLive();
      history.commit((current) => (current.some((i) => i.id === id) ? current.filter((i) => i.id !== id) : current));
      setSelectedId(null);
    }
  };

  const setText = (id: number, text: string) => {
    touched();
    history.commit((current) => current.map((it) => (it.id === id && it.kind === "text" ? fit({ ...it, text }) : it)), `text:${id}`);
  };

  const selected = selectedId !== null ? (items.find((i) => i.id === selectedId) ?? null) : null;

  /** Applies a change from the properties panel to the selected item and to the style of new items of that kind. */
  const change = (patch: Partial<Item> & Partial<Style>, merge?: string) => {
    const kind = selected?.kind ?? kindForTool(tool);
    const s: Partial<Style> = {};
    const p = patch as Record<string, unknown>;
    if (kind === "text") for (const k of ["color", "size", "family", "bold", "italic", "underline", "align", "opacity"] as const) if (k in p) (s as Record<string, unknown>)[k] = p[k];
    if (kind === "rect" || kind === "ellipse") {
      if (p.stroke) s.color = p.stroke as Style["color"];
      if ("fill" in p) s.fill = p.fill as Style["fill"];
      if ("strokeWidth" in p) s.strokeWidth = p.strokeWidth as number;
    }
    if (kind === "line" && "strokeWidth" in p) s.strokeWidth = p.strokeWidth as number;
    if (kind === "ink" && "strokeWidth" in p) s.penWidth = p.strokeWidth as number;
    if (kind === "mark" && "size" in p) s.markSize = p.size as number;
    if ((kind === "line" || kind === "ink" || kind === "mark") && p.color) s.color = p.color as Style["color"];
    if (kind === "highlight" && p.color) s.highlight = p.color as Style["color"];
    if (kind === "whiteout" && p.color) s.whiteout = p.color as Style["color"];
    if (kind !== "text" && "opacity" in p) s.opacity = p.opacity as number;
    if (Object.keys(s).length) setStyle((cur) => ({ ...cur, ...s }));
    if (!selected) return;
    touched();
    const id = selected.id;
    history.commit(
      (current) =>
        current.map((it) => {
          if (it.id !== id) return it;
          const next = { ...it } as Record<string, unknown>;
          for (const [k, value] of Object.entries(p)) if (k in it) next[k] = value;
          const item = next as unknown as Item;
          return item.kind === "text" ? fit(item) : item;
        }),
      merge,
    );
  };

  const removeSelected = () => {
    if (!selected) return;
    touched();
    const id = selected.id;
    history.commit((current) => current.filter((i) => i.id !== id));
    setSelectedId(null);
    setEditingId(null);
  };

  const duplicate = (list: Item[] = selected ? [selected] : [], offset = 10, page = pageIndex) => {
    if (list.length === 0) return;
    touched();
    const copies = withIds(list.map((it) => ({ ...(it.page === page ? moveItem(it, offset, offset) : it), page })));
    history.commit((current) => [...current, ...copies]);
    setSelectedId(copies[copies.length - 1]?.id ?? null);
    setToolState("select");
  };

  const toEveryPage = () => {
    if (!selected || !geometry) return;
    const others = geometry.flatMap((g, page) => {
      if (page === selected.page) return [];
      const size = displaySize(g);
      const here = displaySize(geometry[selected.page] as PageGeometry);
      // On pages of another size, keep the same distance from the nearer edges.
      const dx = size.width !== here.width ? (size.width - here.width) * (centreX(selected) > here.width / 2 ? 1 : 0) : 0;
      const dy = size.height !== here.height ? (size.height - here.height) * (centreY(selected) > here.height / 2 ? 1 : 0) : 0;
      return [{ ...moveItem(selected, dx, dy), page } as Item];
    });
    touched();
    history.commit((current) => [...current, ...withIds(others)]);
    setNotice({ tone: "info", text: `Copied to the other ${others.length} ${others.length === 1 ? "page" : "pages"}. Each copy can be moved or deleted on its own.` });
  };

  const reorder = (toFront: boolean) => {
    if (!selected) return;
    touched();
    const id = selected.id;
    history.commit((current) => {
      const it = current.find((i) => i.id === id);
      if (!it) return current;
      const rest = current.filter((i) => i.id !== id);
      return toFront ? [...rest, it] : [it, ...rest];
    });
  };

  const addImage = async (file: Blob, at?: { x: number; y: number }, signature?: Signature) => {
    try {
      const img = signature ? { bytes: signature.png, width: signature.width, height: signature.height } : await prepareImage(file);
      const ratio = img.width / Math.max(1, img.height);
      const url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: "image/png" }));
      urls.current.push(url);
      let box = placeImage(view, ratio, at);
      if (signature) {
        const width = Math.min(view.width * 0.3, 180);
        box = { left: view.width * 0.55, top: view.height * 0.78, width, height: width / ratio };
      }
      const item: ImageItem = { id: 0, kind: "image", page: pageIndex, ...box, image: img.bytes, url, ratio, opacity: 1 };
      create([item], "select");
      setNotice(null);
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "That picture could not be added.") });
    }
  };

  const convertLine = (line: SampledTextLine) => {
    const size = Math.min(EDIT_LIMITS.maxFontSize, Math.max(EDIT_LIMITS.minFontSize, Math.round(line.size * 2) / 2));
    const item: TextItem = {
      id: 0,
      kind: "text",
      page: pageIndex,
      left: line.left,
      top: topForBaseline(line.baseline, size, 1.2),
      width: line.width,
      auto: true,
      text: line.text,
      size,
      family: line.family,
      bold: line.bold,
      italic: line.italic,
      underline: false,
      color: line.ink,
      align: "left",
      lineHeight: 1.2,
      opacity: 1,
      cover: { left: line.left - 1, top: line.top - 1, width: line.width + 2, height: line.height + 2, color: line.background },
    };
    create([item], "edit");
  };

  /** For keyboard users: the current tool's object in the middle of the page. */
  const addInMiddle = () => {
    const cx = view.width / 2;
    const cy = view.height / 2;
    const base = { id: 0, page: pageIndex };
    switch (tool) {
      case "text":
        return create([newText({ pageIndex, style, view }, cx - 60, cy - style.size / 2, "Text")], "edit");
      case "rect":
      case "ellipse":
        return create([{ ...base, kind: tool, ...defaultBox(tool, cx, cy), stroke: style.color, fill: style.fill, strokeWidth: style.strokeWidth, opacity: style.opacity }], "select");
      case "whiteout":
        return create([{ ...base, kind: "whiteout", ...defaultBox(tool, cx, cy), color: style.whiteout }], "select");
      case "line":
      case "arrow":
        return create([{ ...base, kind: "line", x1: cx - 60, y1: cy, x2: cx + 60, y2: cy, color: style.color, strokeWidth: style.strokeWidth, opacity: style.opacity, arrow: tool === "arrow" ? "end" : "none" }], "select");
      case "check":
      case "cross":
      case "dot":
        return create([{ ...base, kind: "mark", symbol: tool, left: cx - style.markSize / 2, top: cy - style.markSize / 2, size: style.markSize, color: style.color, opacity: style.opacity }], "select");
    }
  };

  /* ---------------------------------------------------------------------------------------------- */
  /* Keyboard                                                                                        */
  /* ---------------------------------------------------------------------------------------------- */

  const goToPage = (n: number) => {
    const page = Math.min(pageCount - 1, Math.max(0, n));
    if (page === pageIndex) return;
    if (editingId !== null) finishEditing();
    setPageIndex(page);
    setSelectedId(null);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
      setEditingId(null);
      touched();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      history.redo();
      touched();
      return;
    }
    if (mod && key === "d") {
      e.preventDefault();
      duplicate();
      return;
    }
    if (mod && key === "c" && selected) {
      clipboard.current = [selected];
      return;
    }
    if (mod && key === "v" && clipboard.current) {
      const copied = clipboard.current;
      // A picture pasted from outside wins: wait a moment to see whether the paste event brought one.
      setTimeout(() => {
        if (Date.now() - lastImagePaste.current > 300) duplicate(copied, 10, pageIndex);
      }, 40);
      return;
    }
    if (mod) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (e.key === "Escape") {
      if (selectedId !== null) setSelectedId(null);
      else setToolState("select");
      return;
    }
    if (e.key === "Enter" && selected?.kind === "text") {
      e.preventDefault();
      setEditingId(selected.id);
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = arrows[e.key];
    if (arrow && selected) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      touched();
      const id = selected.id;
      history.commit((current) => current.map((it) => (it.id === id ? moveItem(it, arrow[0] * step, arrow[1] * step) : it)), `nudge:${id}`);
      return;
    }
    if (e.key === "PageDown") return goToPage(pageIndex + 1);
    if (e.key === "PageUp") return goToPage(pageIndex - 1);
    const shortcut = TOOLS.find((t) => t.key.toLowerCase() === key);
    if (shortcut && !e.altKey) {
      e.preventDefault();
      setTool(shortcut.id);
    }
  };

  /* ---------------------------------------------------------------------------------------------- */
  /* Saving                                                                                          */
  /* ---------------------------------------------------------------------------------------------- */

  const edits = useMemo(() => toEdits(items), [items]);
  const editedPages = new Set(edits.map((e) => e.page)).size;
  const dirty = edits.length > 0 && savedItems !== items;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    if (editingId !== null) finishEditing();
    const snapshot = items;
    job.run(async () => {
      const data = await editPdf(source.bytes, toEdits(snapshot), { loadFont: loadPdfFont });
      setSavedItems(snapshot);
      return data;
    });
  };

  /* ---------------------------------------------------------------------------------------------- */

  const here = items.filter((i) => i.page === pageIndex);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of edits) m.set(e.page, (m.get(e.page) ?? 0) + 1);
    return m;
  }, [edits]);
  const editing = editingId !== null ? items.find((i) => i.id === editingId) : undefined;
  const toolInfo = TOOLS.find((t) => t.id === tool);
  const lineList = Array.isArray(pageLines) ? pageLines : null;

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="flex flex-col gap-4 outline-none"
      onKeyDown={onKeyDown}
      onPaste={(e) => {
        if (isTyping(e.target)) return;
        const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        lastImagePaste.current = Date.now();
        void addImage(file);
      }}
    >
      {signed ? <Alert tone="warning">This PDF carries a digital signature. Any edit changes the file, so that signature will no longer verify.</Alert> : null}

      <div className="flex flex-col gap-2">
        <Toolbar tool={tool} onTool={setTool} />
        {/* A fixed height, so the page does not jump when the tool changes. */}
        <div className="flex min-h-[2.75rem] flex-wrap items-start gap-x-3 gap-y-2 text-sm">
          <p className="min-w-0 flex-1 text-muted-foreground" aria-live="polite">
            <span className="font-medium text-foreground">{toolInfo?.label}.</span> {toolInfo?.hint}
          </p>
          {CREATES.includes(tool) ? (
            <Button variant="outline" size="sm" onClick={addInMiddle}>
              <Plus aria-hidden /> Add to the middle of the page
            </Button>
          ) : null}
        </div>
      </div>

      {tool === "signature" ? (
        <SignaturePanel
          onPlace={(sig) => {
            void addImage(new Blob(), undefined, sig);
          }}
          onCancel={() => setToolState("select")}
        />
      ) : null}

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a picture to add"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void addImage(file);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous page" disabled={pageIndex === 0} onClick={() => goToPage(pageIndex - 1)}>
              <ChevronLeft aria-hidden />
            </Button>
            <span className="font-mono text-sm" aria-live="polite">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button variant="outline" size="icon" aria-label="Next page" disabled={pageIndex >= pageCount - 1} onClick={() => goToPage(pageIndex + 1)}>
              <ChevronRight aria-hidden />
            </Button>
            <span className="mx-1 h-6 border-l border-border" aria-hidden />
            <Button variant="outline" size="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={() => (history.undo(), setEditingId(null), touched())}>
              <Undo2 aria-hidden />
            </Button>
            <Button variant="outline" size="icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={() => (history.redo(), touched())}>
              <Redo2 aria-hidden />
            </Button>
            <span className="mx-1 h-6 border-l border-border" aria-hidden />
            <Button variant="outline" size="icon" aria-label="Zoom out" disabled={zoom <= (ZOOMS[0] as number)} onClick={() => setZoom((z) => [...ZOOMS].reverse().find((s) => s < z) ?? z)}>
              <ZoomOut aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)} title="Fit the page">
              <span className="font-mono">{Math.round(zoom * 100)}%</span>
              <span className="sr-only">, fit the page</span>
            </Button>
            <Button variant="outline" size="icon" aria-label="Zoom in" disabled={zoom >= (ZOOMS[ZOOMS.length - 1] as number)} onClick={() => setZoom((z) => ZOOMS.find((s) => s > z) ?? z)}>
              <ZoomIn aria-hidden />
            </Button>
          </div>

          <div ref={frame} className="max-h-[82vh] overflow-auto border border-border bg-muted p-0" onPointerDown={() => root.current?.focus({ preventScroll: true })}>
            {geometry ? (
              <div className="p-3" style={{ minWidth: "fit-content" }}>
                <Stage
                  pageIndex={pageIndex}
                  view={view}
                  scale={scale}
                  imageUrl={picture?.page === pageIndex ? picture.url : null}
                  imageFailed={pictureFailed || rendererFailed}
                  items={here}
                  selectedId={selectedId}
                  editingId={editingId}
                  tool={tool}
                  style={style}
                  lines={lineList}
                  snapToText={snapToText}
                  measureFor={measureFor}
                  history={history}
                  select={setSelectedId}
                  setEditing={(id) => (id === null ? finishEditing() : setEditingId(id))}
                  create={create}
                  convertLine={convertLine}
                  dropImage={(file, at) => void addImage(file, at)}
                >
                  {editing?.kind === "text" ? <TextBoxEditor key={editing.id} item={editing} scale={scale} measureFor={measureFor} onChange={(t) => setText(editing.id, t)} onDone={finishEditing} /> : null}
                </Stage>
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">Reading the pages…</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Shortcuts: V select, T text, E edit text, P draw, H highlight, W whiteout, Delete removes, arrow keys nudge (Shift for 10 pt), Ctrl+Z undo, Ctrl+D duplicate, Ctrl+C and Ctrl+V copy to another page. You can also paste or drop a picture onto the page.
          </p>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Edit settings">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          {tool === "highlight" && lineList?.length ? (
            <div className="border border-border bg-card p-4">
              <Toggle label="Fit highlights to the lines of text" checked={snapToText} onCheckedChange={setSnapToText} />
            </div>
          ) : null}
          {tool === "edit-text" ? (
            pageLines === "loading" || pageLines === undefined ? (
              <p className="border border-border bg-card p-4 text-sm text-muted-foreground" aria-live="polite">
                Finding the text on this page…
              </p>
            ) : pageLines === "failed" ? (
              <Alert tone="error">The text on this page could not be read. Use Whiteout and Add text instead.</Alert>
            ) : lineList && lineList.length === 0 ? (
              <Alert tone="info">This page has no selectable text (it may be a scan or a picture). Cover words with Whiteout and type new ones with Add text.</Alert>
            ) : (
              <Alert tone="info">
                {lineList?.length} {lineList?.length === 1 ? "line" : "lines"} of text found on this page. The old words stay in the file under the cover, so search and copy can still find them. To remove words for good, use Redact PDF.
              </Alert>
            )
          ) : null}
          <div className="border border-border bg-card p-4">
            <Properties
              item={selected}
              tool={tool}
              style={style}
              change={change}
              remove={removeSelected}
              duplicate={() => duplicate()}
              toEveryPage={toEveryPage}
              front={() => reorder(true)}
              back={() => reorder(false)}
              pageCount={pageCount}
            />
          </div>
          <div className="border border-border bg-card p-4">
            <p className="label-plate mb-2">On this page</p>
            {here.length === 0 ? (
              <p className="text-sm text-muted-foreground">No edits on page {pageIndex + 1} yet.</p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label={`Edits on page ${pageIndex + 1}`}>
                {[...here].reverse().map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      aria-pressed={it.id === selectedId}
                      onClick={() => {
                        setToolState("select");
                        setSelectedId(it.id);
                      }}
                      className={cn("w-full truncate border px-2 py-1.5 text-left text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring", it.id === selectedId ? "border-foreground bg-marker text-marker-foreground" : "border-border hover:border-foreground")}
                    >
                      {describeItem(it)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {pageCount > 1 ? <PageStrip file={source.file} pageCount={pageCount} pageIndex={pageIndex} counts={counts} onPage={goToPage} /> : null}

      <div className="flex flex-col gap-3">
        <RunButton busy={job.busy} disabled={edits.length === 0 || !geometry} onClick={save}>
          {edits.length === 0 ? "Save PDF" : `Save PDF with ${edits.length} ${edits.length === 1 ? "edit" : "edits"}`}
        </RunButton>
        {edits.length === 0 ? <p className="text-sm text-muted-foreground">Add something to a page first.</p> : null}
      </div>
      <JobError error={job.error} />
      {job.result ? (
        <DownloadResult data={job.result} filename={`${baseName(source.file.name)}-edited.pdf`} note={`${edits.length} ${edits.length === 1 ? "edit" : "edits"} on ${editedPages} ${editedPages === 1 ? "page" : "pages"}`} />
      ) : null}
    </div>
  );
}

const centreX = (item: Item) => (item.kind === "line" ? (item.x1 + item.x2) / 2 : item.kind === "ink" ? (item.points[0] ?? 0) : item.left + (item.kind === "mark" ? item.size : item.width) / 2);
const centreY = (item: Item) => (item.kind === "line" ? (item.y1 + item.y2) / 2 : item.kind === "ink" ? (item.points[1] ?? 0) : item.top + (item.kind === "mark" ? item.size : item.kind === "text" ? item.size : item.height) / 2);

/* ----------------------------------------------------------------------------------------------- */

/** The text field laid over a text box while its words are typed. It uses the same font, size and baseline as the saved text. */
function TextBoxEditor({ item, scale, measureFor, onChange, onDone }: { item: TextItem; scale: number; measureFor: (t: TextItem) => Measure; onChange: (text: string) => void; onDone: () => void }) {
  const family = CSS_FAMILIES[item.family];
  const shift = useBaselineShift(family, item.size, item.lineHeight, scale);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // After the click that opened the field has finished moving focus.
    const timer = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const rows = Math.max(1, measureLines(item, measureFor));
  return (
    <textarea
      ref={ref}
      aria-label="Text on the page"
      placeholder="Type here"
      value={item.text}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          onDone();
        }
      }}
      className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 outline outline-[1.5px] outline-dashed outline-ring placeholder:text-muted-foreground"
      style={{
        left: item.left * scale,
        top: item.top * scale + shift,
        width: item.width * scale + 3,
        height: rows * item.size * item.lineHeight * scale + 2,
        fontFamily: family,
        fontSize: item.size * scale,
        lineHeight: item.lineHeight,
        fontWeight: item.bold ? 700 : 400,
        fontStyle: item.italic ? "italic" : "normal",
        textDecoration: item.underline ? "underline" : "none",
        textAlign: item.align,
        color: css(item.color),
        opacity: item.opacity,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        caretColor: css(item.color),
      }}
    />
  );
}

function measureLines(item: TextItem, measureFor: (t: TextItem) => Measure): number {
  const measure = measureFor(item);
  let rows = 0;
  for (const p of item.text.split("\n")) rows += Math.max(1, Math.ceil((measure(p) * item.size) / Math.max(1, item.width) - 1e-6));
  return rows;
}

/* ----------------------------------------------------------------------------------------------- */

function SignaturePanel({ onPlace, onCancel }: { onPlace: (s: Signature) => void; onCancel: () => void }) {
  const [signature, setSignature] = useState<Signature | null>(null);
  return (
    <section aria-label="Make a signature" className="flex flex-col gap-3 border border-l-4 border-foreground border-l-marker bg-card p-4">
      <SignatureMaker onChange={setSignature} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="md" disabled={!signature} onClick={() => signature && onPlace(signature)}>
          Place signature on the page
        </Button>
        <Button variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">This is a picture of your signature, like signing a printout. It is not a certified digital signature.</p>
    </section>
  );
}

function PageStrip({ file, pageCount, pageIndex, counts, onPage }: { file: File; pageCount: number; pageIndex: number; counts: Map<number, number>; onPage: (n: number) => void }) {
  const { store } = useThumbnails(file);
  return (
    <nav aria-label="Pages" className="flex gap-2 overflow-x-auto border border-border bg-card p-2">
      {Array.from({ length: pageCount }, (_, i) => {
        const count = counts.get(i) ?? 0;
        return (
          <button
            key={i}
            type="button"
            aria-current={i === pageIndex ? "page" : undefined}
            onClick={() => onPage(i)}
            className={cn("flex shrink-0 flex-col items-center gap-1 border p-1 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring", i === pageIndex ? "border-2 border-foreground" : "border-border hover:border-foreground")}
          >
            <PageThumb store={store} pageIndex={i} />
            <span className="sr-only">{`Page ${i + 1}${count ? `, ${count} ${count === 1 ? "edit" : "edits"}` : ""}`}</span>
            <span aria-hidden className="font-mono text-[11px]">
              {i + 1}
              {count ? <span className="ml-1 bg-marker px-1 text-marker-foreground">{count}</span> : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
