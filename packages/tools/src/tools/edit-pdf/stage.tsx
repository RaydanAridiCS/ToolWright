"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { arrowHead, inkPath, layoutText, markPath, objectBounds, simplifyPoints, TEXT_ASCENT, UNDERLINE_OFFSET, UNDERLINE_THICKNESS, type Measure } from "@toolwright/core/pdf-edit";
import type { SampledTextLine } from "../../shared/pdf-raster";
import { CSS_FAMILIES, css, describeItem, moveItem, type ImageItem, type Item, type ItemHistory, type Style, type TextItem, type ToolId } from "./model";

export interface PageView {
  width: number;
  height: number;
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "p1" | "p2";

type Gesture =
  | { type: "move"; id: number; x: number; y: number; moved: boolean }
  | { type: "resize"; id: number; handle: Handle; x: number; y: number; origin: Item }
  | { type: "box"; tool: ToolId; x0: number; y0: number; x1: number; y1: number }
  | { type: "line"; tool: ToolId; x0: number; y0: number; x1: number; y1: number }
  | { type: "pen"; points: number[] };

export interface StageProps {
  pageIndex: number;
  view: PageView;
  /** Pixels per point on screen. */
  scale: number;
  imageUrl: string | null;
  imageFailed: boolean;
  items: Item[];
  selectedId: number | null;
  editingId: number | null;
  tool: ToolId;
  style: Style;
  lines: SampledTextLine[] | null;
  snapToText: boolean;
  measureFor: (item: Pick<TextItem, "text" | "family" | "bold" | "italic">) => Measure;
  history: ItemHistory;
  select: (id: number | null) => void;
  setEditing: (id: number | null) => void;
  /** Adds new items (already on this page). `then` says what happens next. */
  create: (items: Item[], then: "select" | "edit" | "stay") => void;
  convertLine: (line: SampledTextLine) => void;
  dropImage: (file: File, at: { x: number; y: number }) => void;
  children?: ReactNode;
}

const MIN_DRAG = 3;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The page, its picture and every edit on it, with the pointer gestures that make and change them. */
export function Stage(props: StageProps) {
  const { view, scale, items, selectedId, editingId, tool, style, lines, history } = props;
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Gesture | null>(null);
  const [hoverLine, setHoverLine] = useState<number | null>(null);
  const px = 1 / scale;

  const point = (e: { clientX: number; clientY: number }) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * view.width, y: ((e.clientY - rect.top) / rect.height) * view.height };
  };

  const byId = (id: number) => items.find((i) => i.id === id);

  /* ---------------------------------------------------------------------------------------------- */

  function startOnPage(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || editingId !== null) {
      if (editingId !== null) props.setEditing(null);
      return;
    }
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    switch (tool) {
      case "select":
        props.select(null);
        return;
      case "text": {
        const item = newText(props, p.x, p.y - style.size * 0.75);
        props.create([item], "edit");
        return;
      }
      case "check":
      case "cross":
      case "dot": {
        const size = style.markSize;
        props.create([{ id: 0, kind: "mark", page: props.pageIndex, symbol: tool, left: p.x - size / 2, top: p.y - size / 2, size, color: style.color, opacity: style.opacity }], "stay");
        return;
      }
      case "pen":
        gesture.current = { type: "pen", points: [p.x, p.y] };
        break;
      case "line":
      case "arrow":
        gesture.current = { type: "line", tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        break;
      case "rect":
      case "ellipse":
      case "highlight":
      case "whiteout":
        gesture.current = { type: "box", tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        break;
      default:
        return;
    }
    setDraft(gesture.current);
  }

  function startOnItem(e: ReactPointerEvent<SVGElement>, item: Item) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if ((tool === "text" || tool === "edit-text") && item.kind === "text") {
      props.select(item.id);
      props.setEditing(item.id);
      return;
    }
    if (tool !== "select") return;
    if (editingId !== null && editingId !== item.id) props.setEditing(null);
    props.select(item.id);
    const p = point(e);
    svg.current?.setPointerCapture(e.pointerId);
    gesture.current = { type: "move", id: item.id, x: p.x, y: p.y, moved: false };
  }

  function startResize(e: ReactPointerEvent<SVGElement>, item: Item, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = point(e);
    svg.current?.setPointerCapture(e.pointerId);
    gesture.current = { type: "resize", id: item.id, handle, x: p.x, y: p.y, origin: item };
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.type === "move") {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      if (!g.moved && Math.hypot(dx, dy) * scale < 2) return;
      g.moved = true;
      g.x = p.x;
      g.y = p.y;
      history.live((current) => current.map((it) => (it.id === g.id ? moveItem(it, dx, dy) : it)));
      return;
    }
    if (g.type === "resize") {
      const next = resized(g.origin, g.handle, p.x - g.x, p.y - g.y, e.shiftKey);
      history.live((current) => current.map((it) => (it.id === g.id ? next : it)));
      return;
    }
    if (g.type === "pen") {
      const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const q = point(ev);
        g.points.push(q.x, q.y);
      }
      setDraft({ type: "pen", points: [...g.points] });
      return;
    }
    let x1 = p.x;
    let y1 = p.y;
    if (e.shiftKey && g.type === "line") {
      const angle = Math.round(Math.atan2(y1 - g.y0, x1 - g.x0) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x1 - g.x0, y1 - g.y0);
      x1 = g.x0 + Math.cos(angle) * len;
      y1 = g.y0 + Math.sin(angle) * len;
    } else if (e.shiftKey && g.type === "box") {
      const side = Math.max(Math.abs(x1 - g.x0), Math.abs(y1 - g.y0));
      x1 = g.x0 + Math.sign(x1 - g.x0 || 1) * side;
      y1 = g.y0 + Math.sign(y1 - g.y0 || 1) * side;
    }
    g.x1 = x1;
    g.y1 = y1;
    setDraft({ ...g });
  }

  function onUp() {
    const g = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (!g) return;
    if (g.type === "move") {
      if (g.moved) history.commit((current) => current);
      return;
    }
    if (g.type === "resize") {
      history.commit((current) => current);
      return;
    }
    if (g.type === "pen") {
      const points = simplifyPoints(g.points, 0.6 / scale);
      props.create([{ id: 0, kind: "ink", page: props.pageIndex, points, color: style.color, strokeWidth: style.penWidth, opacity: style.opacity }], "stay");
      return;
    }
    if (g.type === "line") {
      const { y0 } = g;
      let { x0, x1, y1 } = g;
      if (Math.hypot(x1 - x0, y1 - y0) * scale < MIN_DRAG * 2) {
        x0 -= 50;
        x1 = x0 + 100;
        y1 = y0;
      }
      props.create([{ id: 0, kind: "line", page: props.pageIndex, x1: x0, y1: y0, x2: x1, y2: y1, color: style.color, strokeWidth: style.strokeWidth, opacity: style.opacity, arrow: g.tool === "arrow" ? "end" : "none" }], "select");
      return;
    }
    // A box.
    const left = Math.min(g.x0, g.x1);
    const top = Math.min(g.y0, g.y1);
    const width = Math.abs(g.x1 - g.x0);
    const height = Math.abs(g.y1 - g.y0);
    const click = width * scale < MIN_DRAG && height * scale < MIN_DRAG;
    if (g.tool === "highlight") {
      const snapped = props.snapToText && lines?.length ? snapHighlights(lines, g) : [];
      const boxes = snapped.length ? snapped : click ? [] : [{ left, top, width, height }];
      if (boxes.length) props.create(boxes.map((b) => ({ id: 0, kind: "highlight", page: props.pageIndex, ...b, color: style.highlight, opacity: 1 })), "stay");
      return;
    }
    const box = click ? defaultBox(g.tool, g.x0, g.y0) : { left, top, width, height };
    if (g.tool === "whiteout") props.create([{ id: 0, kind: "whiteout", page: props.pageIndex, ...box, color: style.whiteout }], click ? "select" : "stay");
    else if (g.tool === "rect" || g.tool === "ellipse") props.create([{ id: 0, kind: g.tool, page: props.pageIndex, ...box, stroke: style.color, fill: style.fill, strokeWidth: style.strokeWidth, opacity: style.opacity }], "select");
  }

  function cancel() {
    if (gesture.current?.type === "move" || gesture.current?.type === "resize") history.cancelLive();
    gesture.current = null;
    setDraft(null);
  }

  /* ---------------------------------------------------------------------------------------------- */

  const covered = useMemo(() => {
    const covers = items.flatMap((i) => (i.kind === "text" && i.cover ? [i.cover] : []));
    return (line: SampledTextLine) => covers.some((c) => Math.abs(c.left - (line.left - 1)) < 0.6 && Math.abs(c.top - (line.top - 1)) < 0.6);
  }, [items]);

  const selected = selectedId !== null ? byId(selectedId) : undefined;
  const itemsActive = tool === "select" || tool === "text" || tool === "edit-text";
  const cursor = tool === "select" ? "default" : tool === "text" ? "text" : tool === "edit-text" ? "default" : "crosshair";

  return (
    <div
      className="relative mx-auto select-none bg-card shadow-md"
      style={{ width: view.width * scale, height: view.height * scale }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file" && i.type.startsWith("image/"))) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        props.dropImage(file, point(e));
      }}
    >
      {props.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this tab; next/image cannot optimise it
        <img src={props.imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full" />
      ) : (
        <p className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted-foreground">
          {props.imageFailed ? "This page could not be drawn, but you can still add to it." : "Drawing the page…"}
        </p>
      )}
      <svg
        ref={svg}
        data-testid="edit-surface"
        className="absolute inset-0 size-full touch-none overflow-hidden"
        viewBox={`0 0 ${view.width} ${view.height}`}
        style={{ cursor }}
        onPointerDown={startOnPage}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={cancel}
        onDoubleClick={(e) => {
          if (tool !== "select") return;
          const target = (e.target as Element).closest("[data-item]");
          const id = target ? Number(target.getAttribute("data-item")) : NaN;
          const item = byId(id);
          if (item?.kind === "text") props.setEditing(item.id);
        }}
        aria-hidden
      >
        {items.map((item) =>
          item.kind === "text" && item.cover ? <rect key={`cover-${item.id}`} x={item.cover.left} y={item.cover.top} width={item.cover.width} height={item.cover.height} fill={css(item.cover.color)} pointerEvents="none" /> : null,
        )}
        {items.map((item) => (
          <g
            key={item.id}
            data-item={item.id}
            data-kind={item.kind}
            style={{ pointerEvents: itemsActive && (tool === "select" || item.kind === "text") ? "auto" : "none", cursor: tool === "select" ? "move" : tool === "text" ? "text" : undefined }}
            onPointerDown={(e) => startOnItem(e, item)}
          >
            <ItemShape item={item} measureFor={props.measureFor} hidden={item.id === editingId} px={px} />
          </g>
        ))}

        {tool === "edit-text" && lines
          ? lines.map((line, i) =>
              covered(line) ? null : (
                <rect
                  key={i}
                  data-testid="text-line"
                  x={line.left - 1}
                  y={line.top - 1}
                  width={line.width + 2}
                  height={line.height + 2}
                  fill={hoverLine === i ? "rgba(11,107,85,0.14)" : "transparent"}
                  stroke="var(--ring)"
                  strokeWidth={hoverLine === i ? 1.6 * px : px}
                  strokeDasharray={`${3 * px} ${2 * px}`}
                  style={{ cursor: "text", pointerEvents: "all" }}
                  onPointerEnter={() => setHoverLine(i)}
                  onPointerLeave={() => setHoverLine((h) => (h === i ? null : h))}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setHoverLine(null);
                    props.convertLine(line);
                  }}
                />
              ),
            )
          : null}

        {selected && selected.id !== editingId ? <Selection item={selected} px={px} measureFor={props.measureFor} onHandle={startResize} /> : null}
        {selected && selected.id === editingId && selected.kind === "text" && selected.cover ? (
          <rect x={selected.cover.left} y={selected.cover.top} width={selected.cover.width} height={selected.cover.height} fill="none" stroke="var(--ring)" strokeWidth={px} strokeDasharray={`${2 * px} ${2 * px}`} pointerEvents="none" />
        ) : null}

        {draft ? <Draft draft={draft} style={style} px={px} lines={props.snapToText ? lines : null} /> : null}
      </svg>
      {props.children}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Drawing items (the same geometry the PDF gets)                                                   */
/* ----------------------------------------------------------------------------------------------- */

function ItemShape({ item, measureFor, hidden, px }: { item: Item; measureFor: StageProps["measureFor"]; hidden: boolean; px: number }) {
  const hit = Math.max(10 * px, 0);
  switch (item.kind) {
    case "text": {
      const layout = layoutText(item, measureFor(item));
      return (
        <>
          <rect x={item.left} y={item.top} width={item.width} height={Math.max(layout.height, item.size)} fill="transparent" />
          {hidden
            ? null
            : layout.lines.map((line, i) =>
                line.text ? (
                  <g key={i} opacity={item.opacity}>
                    <text
                      x={line.x}
                      y={line.baseline}
                      fontSize={item.size}
                      fontFamily={CSS_FAMILIES[item.family]}
                      fontWeight={item.bold ? 700 : 400}
                      fontStyle={item.italic ? "italic" : "normal"}
                      fill={css(item.color)}
                      // The PDF's own widths: hinting can make small screen text a little wider than the saved line.
                      textLength={line.width > 0 ? line.width : undefined}
                      lengthAdjust="spacing"
                      textRendering="geometricPrecision"
                      style={{ whiteSpace: "pre" }}
                    >
                      {line.text}
                    </text>
                    {item.underline ? <rect x={line.x} y={line.baseline + item.size * (UNDERLINE_OFFSET - UNDERLINE_THICKNESS / 2)} width={line.width} height={item.size * UNDERLINE_THICKNESS} fill={css(item.color)} /> : null}
                  </g>
                ) : null,
              )}
        </>
      );
    }
    case "whiteout":
      return <rect x={item.left} y={item.top} width={item.width} height={item.height} fill={css(item.color)} />;
    case "highlight":
      return <rect x={item.left} y={item.top} width={item.width} height={item.height} fill={css(item.color)} fillOpacity={item.opacity} style={{ mixBlendMode: "multiply" }} />;
    case "rect":
    case "ellipse": {
      const common = {
        fill: item.fill ? css(item.fill) : "transparent",
        fillOpacity: item.fill ? item.opacity : 1,
        stroke: item.stroke && item.strokeWidth > 0 ? css(item.stroke) : "none",
        strokeOpacity: item.opacity,
        strokeWidth: item.strokeWidth,
      };
      return item.kind === "rect" ? (
        <rect x={item.left} y={item.top} width={item.width} height={item.height} {...common} />
      ) : (
        <ellipse cx={item.left + item.width / 2} cy={item.top + item.height / 2} rx={item.width / 2} ry={item.height / 2} {...common} />
      );
    }
    case "image":
      return <image href={item.url} x={item.left} y={item.top} width={item.width} height={item.height} preserveAspectRatio="none" opacity={item.opacity} />;
    case "ink":
      return (
        <>
          <path d={inkPath(item.points)} fill="none" stroke="transparent" strokeWidth={Math.max(hit, item.strokeWidth)} strokeLinecap="round" strokeLinejoin="round" />
          <path d={inkPath(item.points)} fill="none" stroke={css(item.color)} strokeOpacity={item.opacity} strokeWidth={item.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "line":
      return <LineShape item={item} hit={hit} />;
    case "mark": {
      const mark = markPath(item.symbol, item.left, item.top, item.size);
      return (
        <>
          <rect x={item.left} y={item.top} width={item.size} height={item.size} fill="transparent" />
          {mark.stroke ? <path d={mark.d} fill="none" stroke={css(item.color)} strokeOpacity={item.opacity} strokeWidth={mark.stroke} strokeLinecap="round" strokeLinejoin="round" /> : <path d={mark.d} fill={css(item.color)} fillOpacity={item.opacity} />}
        </>
      );
    }
  }
}

function LineShape({ item, hit }: { item: Extract<Item, { kind: "line" }>; hit: number }) {
  let { x1, y1, x2, y2 } = item;
  const heads: string[] = [];
  if (item.arrow !== "none") {
    const end = arrowHead(x1, y1, x2, y2, item.strokeWidth);
    heads.push(end.d);
    if (item.arrow === "both") {
      const start = arrowHead(x2, y2, x1, y1, item.strokeWidth);
      heads.push(start.d);
      x1 = start.stopX;
      y1 = start.stopY;
    }
    x2 = end.stopX;
    y2 = end.stopY;
  }
  return (
    <>
      <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="transparent" strokeWidth={Math.max(hit, item.strokeWidth)} strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={css(item.color)} strokeOpacity={item.opacity} strokeWidth={item.strokeWidth} strokeLinecap="round" />
      {heads.map((d, i) => (d ? <path key={i} d={d} fill={css(item.color)} fillOpacity={item.opacity} /> : null))}
    </>
  );
}

function Draft({ draft, style, px, lines }: { draft: Gesture; style: Style; px: number; lines: SampledTextLine[] | null }) {
  if (draft.type === "pen") return <path d={inkPath(draft.points)} fill="none" stroke={css(style.color)} strokeOpacity={style.opacity} strokeWidth={style.penWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />;
  if (draft.type === "line") {
    const item = { id: -1, kind: "line" as const, page: 0, x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1, color: style.color, strokeWidth: style.strokeWidth, opacity: style.opacity, arrow: draft.tool === "arrow" ? ("end" as const) : ("none" as const) };
    return (
      <g pointerEvents="none">
        <LineShape item={item} hit={0} />
      </g>
    );
  }
  if (draft.type !== "box") return null;
  const left = Math.min(draft.x0, draft.x1);
  const top = Math.min(draft.y0, draft.y1);
  const width = Math.abs(draft.x1 - draft.x0);
  const height = Math.abs(draft.y1 - draft.y0);
  if (draft.tool === "highlight") {
    const snapped = lines?.length ? snapHighlights(lines, draft) : [];
    const boxes = snapped.length ? snapped : [{ left, top, width, height }];
    return (
      <g pointerEvents="none">
        {boxes.map((b, i) => (
          <rect key={i} x={b.left} y={b.top} width={b.width} height={b.height} fill={css(style.highlight)} style={{ mixBlendMode: "multiply" }} />
        ))}
      </g>
    );
  }
  if (draft.tool === "whiteout") return <rect x={left} y={top} width={width} height={height} fill={css(style.whiteout)} stroke="var(--ring)" strokeWidth={px} strokeDasharray={`${3 * px} ${2 * px}`} pointerEvents="none" />;
  const common = { fill: style.fill ? css(style.fill) : "transparent", fillOpacity: style.opacity, stroke: css(style.color), strokeOpacity: style.opacity, strokeWidth: style.strokeWidth, pointerEvents: "none" as const };
  return draft.tool === "ellipse" ? <ellipse cx={left + width / 2} cy={top + height / 2} rx={width / 2} ry={height / 2} {...common} /> : <rect x={left} y={top} width={width} height={height} {...common} />;
}

/* ----------------------------------------------------------------------------------------------- */
/* Selection and resizing                                                                           */
/* ----------------------------------------------------------------------------------------------- */

function handlesFor(item: Item): Handle[] {
  if (item.kind === "line") return ["p1", "p2"];
  if (item.kind === "text") return ["w", "e"];
  if (item.kind === "mark" || item.kind === "image") return ["nw", "ne", "se", "sw"];
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
}

function Selection({ item, px, measureFor, onHandle }: { item: Item; px: number; measureFor: StageProps["measureFor"]; onHandle: (e: ReactPointerEvent<SVGElement>, item: Item, h: Handle) => void }) {
  const b = objectBounds(item, item.kind === "text" ? measureFor(item) : undefined);
  const height = item.kind === "text" ? Math.max(b.height, item.size) : b.height;
  const size = 9 * px;
  const at = (h: Handle): [number, number] => {
    if (item.kind === "line") return h === "p1" ? [item.x1, item.y1] : [item.x2, item.y2];
    const x = h.includes("w") ? b.left : h.includes("e") ? b.left + b.width : b.left + b.width / 2;
    const y = h.includes("n") ? b.top : h.includes("s") ? b.top + height : b.top + height / 2;
    return [x, y];
  };
  const cursors: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", p1: "move", p2: "move" };
  return (
    <g data-testid="selection" aria-label={describeItem(item)}>
      {item.kind !== "line" ? <rect x={b.left} y={b.top} width={b.width} height={height} fill="none" stroke="var(--ring)" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" /> : null}
      {handlesFor(item).map((h) => {
        const [x, y] = at(h);
        return (
          <rect
            key={h}
            data-handle={h}
            x={x - size / 2}
            y={y - size / 2}
            width={size}
            height={size}
            fill="var(--card)"
            stroke="var(--ring)"
            strokeWidth={1.5 * px}
            style={{ cursor: cursors[h], pointerEvents: "all" }}
            onPointerDown={(e) => onHandle(e, item, h)}
          />
        );
      })}
    </g>
  );
}

/** The item after dragging one of its handles by (dx, dy) from where the drag started. */
export function resized(origin: Item, handle: Handle, dx: number, dy: number, shift: boolean): Item {
  if (origin.kind === "line") {
    let x = (handle === "p1" ? origin.x1 : origin.x2) + dx;
    let y = (handle === "p1" ? origin.y1 : origin.y2) + dy;
    if (shift) {
      const ox = handle === "p1" ? origin.x2 : origin.x1;
      const oy = handle === "p1" ? origin.y2 : origin.y1;
      const angle = Math.round(Math.atan2(y - oy, x - ox) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x - ox, y - oy);
      x = ox + Math.cos(angle) * len;
      y = oy + Math.sin(angle) * len;
    }
    return handle === "p1" ? { ...origin, x1: x, y1: y } : { ...origin, x2: x, y2: y };
  }
  if (origin.kind === "text") {
    const min = Math.max(8, origin.size);
    if (handle === "e") return { ...origin, width: Math.max(min, origin.width + dx), auto: false };
    const width = Math.max(min, origin.width - dx);
    return { ...origin, left: origin.left + origin.width - width, width, auto: false };
  }
  const b = objectBounds(origin);
  let left = b.left;
  let top = b.top;
  let right = b.left + b.width;
  let bottom = b.top + b.height;
  if (handle.includes("w")) left = Math.min(right - 2, left + dx);
  if (handle.includes("e")) right = Math.max(left + 2, right + dx);
  if (handle.includes("n")) top = Math.min(bottom - 2, top + dy);
  if (handle.includes("s")) bottom = Math.max(top + 2, bottom + dy);
  const keepRatio = origin.kind === "mark" || (origin.kind === "image" ? !shift : shift && handle.length === 2);
  if (keepRatio && handle.length === 2) {
    const ratio = origin.kind === "image" ? origin.ratio : b.width / Math.max(b.height, 1e-6);
    const w = right - left;
    const h = bottom - top;
    // Follow whichever side moved more, and grow the other from the fixed corner.
    if (w / ratio > h) {
      const nh = w / ratio;
      if (handle.includes("n")) top = bottom - nh;
      else bottom = top + nh;
    } else {
      const nw = h * ratio;
      if (handle.includes("w")) left = right - nw;
      else right = left + nw;
    }
  }
  const width = right - left;
  const height = bottom - top;
  if (origin.kind === "mark") return { ...origin, left, top, size: Math.max(4, Math.max(width, height)) };
  if (origin.kind === "ink") {
    const sx = width / Math.max(b.width, 1e-6);
    const sy = height / Math.max(b.height, 1e-6);
    return { ...origin, points: origin.points.map((v, i) => (i % 2 === 0 ? left + (v - b.left) * sx : top + (v - b.top) * sy)) };
  }
  return { ...(origin as Exclude<Item, { kind: "line" | "text" | "mark" | "ink" }>), left, top, width, height };
}

/* ----------------------------------------------------------------------------------------------- */
/* Helpers                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

export function newText(props: Pick<StageProps, "pageIndex" | "style" | "view">, left: number, top: number, text = ""): TextItem {
  const { style, view } = props;
  const l = clampN(left, 0, Math.max(0, view.width - 20));
  return {
    id: 0,
    kind: "text",
    page: props.pageIndex,
    left: l,
    top: clampN(top, 0, Math.max(0, view.height - style.size)),
    width: Math.max(20, Math.min(view.width - l, 40)),
    auto: true,
    text,
    size: style.size,
    family: style.family,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    color: style.color,
    align: style.align,
    lineHeight: 1.2,
    opacity: style.opacity,
  };
}

/** A sensible size for a shape placed with a click instead of a drag. */
export function defaultBox(tool: ToolId, x: number, y: number) {
  const [width, height] = tool === "whiteout" ? [120, 20] : tool === "ellipse" ? [100, 70] : [120, 70];
  return { left: x - width / 2, top: y - height / 2, width, height };
}

/**
 * Highlights that hug the text lines a drag crossed, like selecting text: the first line from where the drag
 * started, the last up to where it ended, the ones between in full. A click on a line highlights that line.
 */
export function snapHighlights(lines: readonly SampledTextLine[], g: { x0: number; y0: number; x1: number; y1: number }) {
  const [a, b] = g.y0 <= g.y1 ? [{ x: g.x0, y: g.y0 }, { x: g.x1, y: g.y1 }] : [{ x: g.x1, y: g.y1 }, { x: g.x0, y: g.y0 }];
  const xMin = Math.min(g.x0, g.x1);
  const xMax = Math.max(g.x0, g.x1);
  const click = Math.abs(g.x1 - g.x0) < 2 && Math.abs(g.y1 - g.y0) < 2;
  const hit = lines.filter((l) => l.top <= b.y && l.top + l.height >= a.y && l.left <= xMax + 2 && l.left + l.width >= xMin - 2);
  if (hit.length === 0) return [];
  if (click) return hit.slice(0, 1).map((l) => ({ left: l.left - 1, top: l.top, width: l.width + 2, height: l.height }));
  const sorted = [...hit].sort((p, q) => p.top - q.top);
  if (sorted.length === 1) {
    const l = sorted[0] as SampledTextLine;
    const left = Math.max(l.left - 1, xMin);
    const right = Math.min(l.left + l.width + 1, xMax);
    return right - left > 1 ? [{ left, top: l.top, width: right - left, height: l.height }] : [];
  }
  return sorted.flatMap((l, i) => {
    const first = i === 0;
    const last = i === sorted.length - 1;
    const left = first ? clampN(a.x, l.left - 1, l.left + l.width + 1) : l.left - 1;
    const right = last ? clampN(b.x, l.left - 1, l.left + l.width + 1) : l.left + l.width + 1;
    return right - left > 1 ? [{ left, top: l.top, width: right - left, height: l.height }] : [];
  });
}

/** Keeps the picture's shape and fits it inside 40% of the page. */
export function placeImage(view: PageView, ratio: number, at?: { x: number; y: number }): { left: number; top: number; width: number; height: number } {
  let width = view.width * 0.4;
  let height = width / ratio;
  if (height > view.height * 0.4) {
    height = view.height * 0.4;
    width = height * ratio;
  }
  const cx = at?.x ?? view.width / 2;
  const cy = at?.y ?? view.height / 2;
  return { left: clampN(cx - width / 2, 0, view.width - width), top: clampN(cy - height / 2, 0, view.height - height), width, height };
}

export type { ImageItem };

/** Where the CSS font puts its first baseline in a line box, compared with the PDF layout, so the text field lines up with the saved text. */
export function useBaselineShift(family: string, size: number, lineHeight: number, scale: number): number {
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const px = size * scale;
    ctx.font = `${px}px ${family}`;
    const m = ctx.measureText("Hg");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    if (!(ascent > 0) || !(descent >= 0)) return setShift(0);
    const cssBaseline = (lineHeight * px - (ascent + descent)) / 2 + ascent;
    const pdfBaseline = px * ((lineHeight - 1) / 2 + TEXT_ASCENT);
    setShift(pdfBaseline - cssBaseline);
  }, [family, size, lineHeight, scale]);
  return shift;
}
