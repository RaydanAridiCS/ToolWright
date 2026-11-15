"use client";

import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  BringToFront,
  Check,
  Circle,
  CircleDot,
  Copy,
  Eraser,
  Files,
  Highlighter,
  ImagePlus,
  Italic,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  SendToBack,
  Signature,
  Square,
  TextCursorInput,
  Trash2,
  Type,
  Underline,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button, Field, Select, SegmentedControl, Textarea, cn } from "@toolwright/ui";
import { EDIT_LIMITS, type FontFamily, type Rgb } from "@toolwright/core/pdf-edit";
import { NumberField, num } from "../../shared/number-field";
import { FAMILY_LABELS, HIGHLIGHT_SWATCHES, INK_SWATCHES, KIND_LABELS, describeItem, hex, toHex, type Item, type Style, type ToolId } from "./model";

/* ----------------------------------------------------------------------------------------------- */
/* Toolbar                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

export const TOOLS: { id: ToolId; label: string; icon: LucideIcon; key: string; hint: string }[] = [
  { id: "select", label: "Select and move", icon: MousePointer2, key: "V", hint: "Click an edit to select it, drag to move it, and drag the squares to resize it. Double-click text to change it." },
  { id: "text", label: "Add text", icon: Type, key: "T", hint: "Click where the text should start, then type. Click an existing text box to change its words." },
  { id: "edit-text", label: "Edit existing text", icon: TextCursorInput, key: "E", hint: "Click a line of the PDF's own text to change it. The old words are covered and your new ones written on top." },
  { id: "pen", label: "Draw", icon: PenLine, key: "P", hint: "Drag to draw freehand." },
  { id: "highlight", label: "Highlight", icon: Highlighter, key: "H", hint: "Drag across the words to highlight, or click a line. Text pages get highlights that fit the lines." },
  { id: "whiteout", label: "Whiteout", icon: Eraser, key: "W", hint: "Drag over anything to cover it with a box in the page colour." },
  { id: "rect", label: "Rectangle", icon: Square, key: "R", hint: "Drag to draw a rectangle. Hold Shift for a square." },
  { id: "ellipse", label: "Ellipse", icon: Circle, key: "O", hint: "Drag to draw an ellipse. Hold Shift for a circle." },
  { id: "line", label: "Line", icon: Minus, key: "L", hint: "Drag to draw a line. Hold Shift to keep it level, upright or at 45°." },
  { id: "arrow", label: "Arrow", icon: MoveUpRight, key: "A", hint: "Drag from the tail to the point. Hold Shift for straight angles." },
  { id: "check", label: "Check mark", icon: Check, key: "K", hint: "Click to place a check mark, for example in a box on a form." },
  { id: "cross", label: "Cross", icon: X, key: "X", hint: "Click to place a cross." },
  { id: "dot", label: "Dot", icon: CircleDot, key: "D", hint: "Click to place a dot." },
  { id: "image", label: "Add a picture", icon: ImagePlus, key: "I", hint: "Choose a picture (PNG, JPEG, WebP or GIF), or drop or paste one onto the page." },
  { id: "signature", label: "Add a signature", icon: Signature, key: "S", hint: "Draw, type or upload your signature, then place it and drag it into position." },
];

export function Toolbar({ tool, onTool }: { tool: ToolId; onTool: (t: ToolId) => void }) {
  return (
    <div role="toolbar" aria-label="Editing tools" aria-orientation="horizontal" className="flex flex-wrap gap-1 border border-border bg-card p-1.5">
      {TOOLS.map((t, i) => {
        const Icon = t.icon;
        const gap = i === 1 || i === 3 || i === 6 || i === 10 || i === 13;
        return (
          <span key={t.id} className={cn("flex", gap && "ml-1.5 border-l border-border pl-1.5")}>
            <Button
              variant={tool === t.id ? "primary" : "ghost"}
              size="icon"
              aria-label={t.label}
              aria-pressed={tool === t.id}
              aria-keyshortcuts={t.key}
              title={`${t.label} (${t.key})`}
              data-tool={t.id}
              onClick={() => onTool(t.id)}
            >
              <Icon aria-hidden />
            </Button>
          </span>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Colours                                                                                          */
/* ----------------------------------------------------------------------------------------------- */

export function ColorPicker({ label, value, onChange, swatches = INK_SWATCHES, allowNone }: { label: string; value: Rgb | null; onChange: (c: Rgb | null) => void; swatches?: { name: string; hex: string }[]; allowNone?: boolean }) {
  const current = value ? toHex(value) : null;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowNone ? (
          <button
            type="button"
            aria-label={`${label}: none`}
            aria-pressed={current === null}
            onClick={() => onChange(null)}
            className={cn("relative size-7 border bg-card focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring", current === null ? "border-2 border-foreground" : "border-border")}
          >
            <span aria-hidden className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-danger" />
          </button>
        ) : null}
        {swatches.map((s) => (
          <button
            key={s.hex}
            type="button"
            aria-label={`${label}: ${s.name}`}
            aria-pressed={current === s.hex}
            title={s.name}
            onClick={() => onChange(hex(s.hex))}
            className={cn("size-7 border focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring", current === s.hex ? "border-2 border-foreground" : "border-border")}
            style={{ background: s.hex }}
          />
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="color" aria-label={`${label}: any colour`} value={current ?? "#000000"} onChange={(e) => onChange(hex(e.target.value))} className="h-7 w-9 cursor-pointer border border-border bg-card p-0.5" />
          Other
        </label>
      </div>
    </fieldset>
  );
}

function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      <span className="flex justify-between">
        {label}
        <span className="font-mono text-xs text-muted-foreground">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
    </label>
  );
}

function Pressed({ label, pressed, onClick, children }: { label: string; pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant={pressed ? "primary" : "outline"} size="icon" aria-label={label} aria-pressed={pressed} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

/* ----------------------------------------------------------------------------------------------- */
/* Properties: of the selected edit, or of new ones                                                  */
/* ----------------------------------------------------------------------------------------------- */

export interface PropertiesProps {
  /** The selected edit, or null to set the style of new ones for the current tool. */
  item: Item | null;
  tool: ToolId;
  style: Style;
  /** Changes the selected edit (and the style of new ones like it). `merge` folds quick changes into one undo step. */
  change: (patch: Partial<Item> & Partial<Style>, merge?: string) => void;
  remove: () => void;
  duplicate: () => void;
  toEveryPage: () => void;
  front: () => void;
  back: () => void;
  pageCount: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const pts = (v: number) => `${v} pt`;

export function Properties({ item, tool, style, change, remove, duplicate, toEveryPage, front, back, pageCount }: PropertiesProps) {
  const kind = item?.kind ?? kindForTool(tool);
  if (!kind) return <p className="text-sm text-muted-foreground">Select an edit on the page to change it, or pick a tool above to add something.</p>;
  const merge = (k: string) => (item ? `${k}:${item.id}` : undefined);
  const v = <K extends keyof Style>(key: K, fromItem?: unknown): Style[K] => (fromItem !== undefined ? (fromItem as Style[K]) : style[key]);

  const text = item?.kind === "text" ? item : null;
  const fontSize = v("size", text?.size);
  const color = v("color", item && "color" in item ? item.color : undefined);

  return (
    <div className="flex flex-col gap-4" role="group" aria-label={item ? `Selected: ${describeItem(item)}` : `New ${KIND_LABELS[kind].toLowerCase()}`}>
      <p className="label-plate">{item ? describeItem(item) : `New ${KIND_LABELS[kind].toLowerCase()}`}</p>

      {kind === "text" ? (
        <>
          {text ? (
            <Field label="Text">{(id) => <Textarea id={id} mono={false} spellCheck rows={3} value={text.text} maxLength={EDIT_LIMITS.maxTextLength} onChange={(e) => change({ text: e.target.value }, merge("text"))} />}</Field>
          ) : null}
          <Field label="Font">
            {(id) => (
              <Select id={id} value={v("family", text?.family)} onChange={(e) => change({ family: e.target.value as FontFamily })}>
                {(Object.keys(FAMILY_LABELS) as FontFamily[]).map((f) => (
                  <option key={f} value={f}>
                    {FAMILY_LABELS[f]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              className="w-28"
              label="Size"
              suffix="pt"
              min={EDIT_LIMITS.minFontSize}
              max={EDIT_LIMITS.maxFontSize}
              step={1}
              value={String(fontSize)}
              onChange={(raw) => {
                const n = num(raw);
                if (Number.isFinite(n) && n >= EDIT_LIMITS.minFontSize && n <= EDIT_LIMITS.maxFontSize) change({ size: n }, merge("size"));
              }}
            />
            <div className="flex gap-1" role="group" aria-label="Text style">
              <Pressed label="Bold" pressed={v("bold", text?.bold)} onClick={() => change({ bold: !v("bold", text?.bold) })}>
                <Bold aria-hidden />
              </Pressed>
              <Pressed label="Italic" pressed={v("italic", text?.italic)} onClick={() => change({ italic: !v("italic", text?.italic) })}>
                <Italic aria-hidden />
              </Pressed>
              <Pressed label="Underline" pressed={v("underline", text?.underline)} onClick={() => change({ underline: !v("underline", text?.underline) })}>
                <Underline aria-hidden />
              </Pressed>
            </div>
            <div className="flex gap-1" role="group" aria-label="Alignment">
              {(
                [
                  ["left", "Align left", AlignLeft],
                  ["center", "Centre", AlignCenter],
                  ["right", "Align right", AlignRight],
                ] as const
              ).map(([a, label, Icon]) => (
                <Pressed key={a} label={label} pressed={v("align", text?.align) === a} onClick={() => change({ align: a })}>
                  <Icon aria-hidden />
                </Pressed>
              ))}
            </div>
          </div>
          <ColorPicker label="Text colour" value={color} onChange={(c) => c && change({ color: c })} />
          {text?.cover ? <ColorPicker label="Cover colour" value={text.cover.color} swatches={[{ name: "White", hex: "#ffffff" }]} onChange={(c) => c && change({ cover: { ...text.cover!, color: c } } as Partial<Item>)} /> : null}
        </>
      ) : null}

      {kind === "rect" || kind === "ellipse" ? (
        <>
          <ColorPicker label="Outline" allowNone value={item && "stroke" in item ? item.stroke : style.color} onChange={(c) => change({ stroke: c, ...(c ? { color: c } : {}) } as Partial<Item>)} />
          <ColorPicker label="Fill" allowNone value={item && "fill" in item ? item.fill : style.fill} onChange={(c) => change({ fill: c })} />
          <Range label="Line width" min={0.5} max={20} step={0.5} value={v("strokeWidth", item && "strokeWidth" in item ? item.strokeWidth : undefined)} format={pts} onChange={(n) => change({ strokeWidth: n }, merge("width"))} />
        </>
      ) : null}

      {kind === "line" || kind === "ink" || kind === "mark" ? <ColorPicker label="Colour" value={color} onChange={(c) => c && change({ color: c })} /> : null}
      {kind === "line" ? (
        <>
          <Range label="Line width" min={0.5} max={20} step={0.5} value={v("strokeWidth", item?.kind === "line" ? item.strokeWidth : undefined)} format={pts} onChange={(n) => change({ strokeWidth: n }, merge("width"))} />
          <SegmentedControl
            label="Arrow heads"
            value={item?.kind === "line" ? item.arrow : tool === "arrow" ? "end" : "none"}
            onValueChange={(a) => item && change({ arrow: a } as Partial<Item>)}
            options={[
              { value: "none", label: "None" },
              { value: "end", label: "At the end" },
              { value: "both", label: "Both ends" },
            ]}
          />
        </>
      ) : null}
      {kind === "ink" ? <Range label="Pen width" min={0.5} max={20} step={0.5} value={item?.kind === "ink" ? item.strokeWidth : style.penWidth} format={pts} onChange={(n) => change({ strokeWidth: n, penWidth: n }, merge("width"))} /> : null}
      {kind === "mark" ? (
        <>
          {item?.kind === "mark" ? (
            <SegmentedControl
              label="Mark"
              value={item.symbol}
              onValueChange={(s) => change({ symbol: s } as Partial<Item>)}
              options={[
                { value: "check", label: "Check" },
                { value: "cross", label: "Cross" },
                { value: "dot", label: "Dot" },
              ]}
            />
          ) : null}
          <Range label="Size" min={6} max={72} step={1} value={item?.kind === "mark" ? round1(item.size) : style.markSize} format={pts} onChange={(n) => change({ size: n, markSize: n } as Partial<Item>, merge("mark-size"))} />
        </>
      ) : null}
      {kind === "highlight" ? <ColorPicker label="Highlight colour" swatches={HIGHLIGHT_SWATCHES} value={item?.kind === "highlight" ? item.color : style.highlight} onChange={(c) => c && change({ color: c, highlight: c } as Partial<Item>)} /> : null}
      {kind === "whiteout" ? (
        <ColorPicker
          label="Cover colour"
          swatches={[
            { name: "White", hex: "#ffffff" },
            { name: "Paper", hex: "#f5f1e6" },
            { name: "Black", hex: "#111111" },
          ]}
          value={item?.kind === "whiteout" ? item.color : style.whiteout}
          onChange={(c) => c && change({ color: c, whiteout: c } as Partial<Item>)}
        />
      ) : null}

      {kind !== "whiteout" && kind !== "highlight" ? <Range label="Opacity" min={0.1} max={1} step={0.05} value={item && "opacity" in item ? item.opacity : style.opacity} format={pct} onChange={(n) => change({ opacity: n }, merge("opacity"))} /> : null}

      {item ? <Placement item={item} change={change} /> : null}

      {item ? (
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={duplicate} title="Duplicate (Ctrl+D)">
            <Copy aria-hidden /> Duplicate
          </Button>
          {pageCount > 1 ? (
            <Button variant="outline" size="sm" onClick={toEveryPage}>
              <Files aria-hidden /> Copy to every page
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={front}>
            <BringToFront aria-hidden /> To front
          </Button>
          <Button variant="outline" size="sm" onClick={back}>
            <SendToBack aria-hidden /> To back
          </Button>
          <Button variant="danger" size="sm" onClick={remove} title="Delete (Del)">
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Exact position and size, for keyboard users and for lining things up. */
function Placement({ item, change }: { item: Item; change: PropertiesProps["change"] }) {
  const field = (label: string, value: number, apply: (n: number) => Partial<Item> | null, key: string) => (
    <NumberField
      label={label}
      suffix="pt"
      step={1}
      value={String(round1(value))}
      onChange={(raw) => {
        const n = num(raw);
        const patch = Number.isFinite(n) ? apply(n) : null;
        if (patch) change(patch, `${key}:${item.id}`);
      }}
    />
  );
  if (item.kind === "line") {
    return (
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Position">
        {field("Start, from left", item.x1, (n) => ({ x1: n }) as Partial<Item>, "x1")}
        {field("Start, from top", item.y1, (n) => ({ y1: n }) as Partial<Item>, "y1")}
        {field("End, from left", item.x2, (n) => ({ x2: n }) as Partial<Item>, "x2")}
        {field("End, from top", item.y2, (n) => ({ y2: n }) as Partial<Item>, "y2")}
      </div>
    );
  }
  if (item.kind === "ink") return null;
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Position and size">
      {field("From left", item.left, (n) => ({ left: n }), "left")}
      {field("From top", item.top, (n) => ({ top: n }), "top")}
      {item.kind === "mark"
        ? field("Size", item.size, (n) => (n >= 4 ? ({ size: n } as Partial<Item>) : null), "size")
        : field("Width", item.width, (n) => (n >= 2 ? ({ width: n, ...(item.kind === "text" ? { auto: false } : {}), ...(item.kind === "image" ? { height: n / item.ratio } : {}) } as Partial<Item>) : null), "width")}
      {item.kind !== "mark" && item.kind !== "text" ? field("Height", item.height, (n) => (n >= 2 ? ({ height: n, ...(item.kind === "image" ? { width: n * item.ratio } : {}) } as Partial<Item>) : null), "height") : null}
    </div>
  );
}

export function kindForTool(tool: ToolId): Item["kind"] | null {
  switch (tool) {
    case "text":
      return "text";
    case "pen":
      return "ink";
    case "highlight":
    case "whiteout":
    case "rect":
    case "ellipse":
      return tool;
    case "line":
    case "arrow":
      return "line";
    case "check":
    case "cross":
    case "dot":
      return "mark";
    default:
      return null;
  }
}
