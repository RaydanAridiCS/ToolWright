/**
 * The editor's state: the objects placed on pages (with an id each), the drawing style new objects get, the undo
 * history, and the conversion to what `editPdf` saves. No React here except the history hook.
 */
import { useCallback, useRef, useState } from "react";
import type { EditObject, FontFamily, ImageEdit, MarkSymbol, Rgb, TextAlign, TextEdit } from "@toolwright/core/pdf-edit";

export type TextItem = TextEdit & { id: number; /** The box grows with the text until the user sets a width. */ auto: boolean };
export type ImageItem = ImageEdit & { id: number; /** Object URL for showing the picture; kept until the editor closes, so undo can bring it back. */ url: string; /** Width over height. */ ratio: number };
export type Item = TextItem | ImageItem | (Exclude<EditObject, TextEdit | ImageEdit> & { id: number });

export type ToolId = "select" | "text" | "edit-text" | "pen" | "highlight" | "whiteout" | "rect" | "ellipse" | "line" | "arrow" | "check" | "cross" | "dot" | "image" | "signature";

export interface Style {
  color: Rgb;
  fill: Rgb | null;
  strokeWidth: number;
  opacity: number;
  size: number;
  family: FontFamily;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  highlight: Rgb;
  whiteout: Rgb;
  penWidth: number;
  markSize: number;
}

export const DEFAULT_STYLE: Style = {
  color: { r: 0, g: 0, b: 0 },
  fill: null,
  strokeWidth: 2,
  opacity: 1,
  size: 14,
  family: "sans",
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  highlight: hex("#fde047"),
  whiteout: { r: 1, g: 1, b: 1 },
  penWidth: 2,
  markSize: 14,
};

/** Ink colours offered as swatches. Any other colour can be picked with the colour field. */
export const INK_SWATCHES: { name: string; hex: string }[] = [
  { name: "Black", hex: "#111111" },
  { name: "Dark grey", hex: "#555555" },
  { name: "Red", hex: "#c62828" },
  { name: "Blue", hex: "#1a4fb8" },
  { name: "Green", hex: "#0b6b55" },
  { name: "White", hex: "#ffffff" },
];

export const HIGHLIGHT_SWATCHES: { name: string; hex: string }[] = [
  { name: "Yellow", hex: "#fde047" },
  { name: "Green", hex: "#86efac" },
  { name: "Blue", hex: "#93c5fd" },
  { name: "Pink", hex: "#f9a8d4" },
];

export const MARKS: Record<"check" | "cross" | "dot", MarkSymbol> = { check: "check", cross: "cross", dot: "dot" };

export function hex(value: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1] as string, 16) / 255, g: parseInt(m[2] as string, 16) / 255, b: parseInt(m[3] as string, 16) / 255 };
}

export function toHex(c: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`;
}

export const css = (c: Rgb) => toHex(c);

/** CSS font stacks whose widths match the standard PDF fonts (Arial was drawn to Helvetica's widths, and so on). */
export const CSS_FAMILIES: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif',
  mono: '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", monospace',
};

export const FAMILY_LABELS: Record<FontFamily, string> = { sans: "Helvetica (sans serif)", serif: "Times (serif)", mono: "Courier (fixed width)" };

export const KIND_LABELS: Record<Item["kind"], string> = {
  text: "Text",
  rect: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  ink: "Drawing",
  highlight: "Highlight",
  whiteout: "Whiteout",
  image: "Picture",
  mark: "Mark",
};

/** A short description of an item for the list of edits. */
export function describeItem(item: Item): string {
  switch (item.kind) {
    case "text": {
      const words = item.text.trim().replace(/\s+/g, " ");
      const label = item.cover ? "Edited text" : "Text";
      return words ? `${label}: “${words.length > 32 ? `${words.slice(0, 32)}…` : words}”` : `${label} (empty)`;
    }
    case "line":
      return item.arrow === "none" ? "Line" : "Arrow";
    case "mark":
      return item.symbol === "check" ? "Check mark" : item.symbol === "cross" ? "Cross" : "Dot";
    default:
      return KIND_LABELS[item.kind];
  }
}

/** The objects to save: the editor's extra fields dropped, empty new text boxes left out. */
export function toEdits(items: readonly Item[]): EditObject[] {
  return items.flatMap((item): EditObject[] => {
    if (item.kind === "text") {
      if (item.text.trim() === "" && !item.cover) return [];
      const { id: _id, auto: _auto, ...rest } = item;
      return [rest];
    }
    if (item.kind === "image") {
      const { id: _id, url: _url, ratio: _ratio, ...rest } = item;
      return [rest];
    }
    const { id: _id, ...rest } = item;
    return [rest as EditObject];
  });
}

/** Move an item by (dx, dy) points. */
export function moveItem<T extends Item>(item: T, dx: number, dy: number): T {
  switch (item.kind) {
    case "line":
      return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    case "ink":
      return { ...item, points: item.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) };
    case "text":
      return { ...item, left: item.left + dx, top: item.top + dy, cover: item.cover };
    default:
      return { ...item, left: (item as { left: number }).left + dx, top: (item as { top: number }).top + dy };
  }
}

/* ----------------------------------------------------------------------------------------------- */
/* Undo history                                                                                     */
/* ----------------------------------------------------------------------------------------------- */

interface History {
  past: Item[][];
  present: Item[];
  future: Item[][];
}

const LIMIT = 200;
const MERGE_MS = 1200;

/**
 * Items with undo and redo. `commit` records a step; passing the same `merge` key again within a moment (typing in
 * one text box, dragging a slider) folds into that step. `live` changes the items without a step (while dragging),
 * and the next `commit` records the whole drag as one step from where it started.
 */
export function useItemHistory() {
  const [history, setHistory] = useState<History>({ past: [], present: [], future: [] });
  const lastMerge = useRef<{ key: string; at: number } | null>(null);
  const liveBase = useRef<Item[] | null>(null);

  const commit = useCallback((next: Item[] | ((current: Item[]) => Item[]), merge?: string) => {
    // Refs are read here, not inside the updater, so the updater stays pure (React may run it twice).
    const dragBase = liveBase.current;
    liveBase.current = null;
    const now = Date.now();
    const folds = !dragBase && merge !== undefined && lastMerge.current?.key === merge && now - lastMerge.current.at < MERGE_MS;
    lastMerge.current = merge !== undefined ? { key: merge, at: now } : null;
    setHistory((h) => {
      const value = typeof next === "function" ? next(h.present) : next;
      if (value === h.present && !dragBase) return h;
      if (folds && h.past.length > 0) return { past: h.past, present: value, future: [] };
      return { past: [...h.past, dragBase ?? h.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const live = useCallback((next: (current: Item[]) => Item[]) => {
    setHistory((h) => {
      if (!liveBase.current) liveBase.current = h.present;
      return { ...h, present: next(h.present) };
    });
  }, []);

  /** Throw away a drag that did not change anything. */
  const cancelLive = useCallback(() => {
    const base = liveBase.current;
    liveBase.current = null;
    if (base) setHistory((h) => ({ ...h, present: base }));
  }, []);

  const undo = useCallback(() => {
    lastMerge.current = null;
    setHistory((h) => {
      const previous = h.past[h.past.length - 1];
      if (!previous) return h;
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastMerge.current = null;
    setHistory((h) => {
      const next = h.future[0];
      if (!next) return h;
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);

  const reset = useCallback(() => {
    lastMerge.current = null;
    liveBase.current = null;
    setHistory({ past: [], present: [], future: [] });
  }, []);

  return { items: history.present, canUndo: history.past.length > 0, canRedo: history.future.length > 0, commit, live, cancelLive, undo, redo, reset };
}

export type ItemHistory = ReturnType<typeof useItemHistory>;
