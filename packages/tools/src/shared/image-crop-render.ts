/** Canvas drawing for the Crop, Rotate & Flip tool. The maths lives in `@toolwright/core/image-crop`; this file only draws. */

import { cropMatrix, normalizeMask, turnMatrix, turnedSize, type Mask, type Rect, type Turn } from "@toolwright/core/image-crop";
import type { LoadedImage, OutputFormat, RenderedImage } from "./image";

/** Draws the turned picture (flipped, turned, straightened) into `canvas`, at most `maxSide` pixels on its longer side. Returns the scale used. */
export function drawTurned(canvas: HTMLCanvasElement, image: LoadedImage, turn: Turn, maxSide = 1200): number {
  const size = { width: image.width, height: image.height };
  const turned = turnedSize(size, turn);
  const scale = Math.min(1, maxSide / Math.max(turned.width, turned.height));
  canvas.width = Math.max(1, Math.round(turned.width * scale));
  canvas.height = Math.max(1, Math.round(turned.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser does not support canvas, which this tool needs.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const m = cropMatrix(turnMatrix(size, turn), { x: 0, y: 0, width: turned.width, height: turned.height }, scale);
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(image.source, 0, 0);
  return scale;
}

export interface CropRenderOptions {
  type: OutputFormat;
  /** 0 to 1, for JPEG, WebP and AVIF. */
  quality: number;
  /** Colour behind transparent or empty areas. Always used for JPEG, which has no transparency. */
  background: string | null;
  /** The shape cut out of the crop box. Default: the plain rectangle. */
  mask?: Mask;
}

/** Draws the outline of `mask` inside a box's `ctx` with its top-left corner at (0, 0). */
function traceMask(ctx: CanvasRenderingContext2D, width: number, height: number, mask: Mask): void {
  ctx.beginPath();
  if (mask.kind === "oval") {
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    return;
  }
  // buildPath traces a rounded rectangle by hand, so old canvas engines need nothing special.
  const r = Math.max(0, Math.min(mask.radius, Math.floor(Math.min(width, height) / 2)));
  ctx.moveTo(r, 0);
  ctx.arcTo(width, 0, width, height, r);
  ctx.arcTo(width, height, 0, height, r);
  ctx.arcTo(0, height, 0, 0, r);
  ctx.arcTo(0, 0, width, 0, r);
  ctx.closePath();
}

/** Clips the canvas to the mask shape. With "rect" nothing is done, so every pixel of the box is kept. */
function clipToMask(ctx: CanvasRenderingContext2D, crop: Rect, mask: Mask): void {
  const normal = normalizeMask(mask.kind, mask.radius, crop);
  if (normal.kind === "rect" || (normal.kind === "rounded" && normal.radius < 1)) return;
  traceMask(ctx, crop.width, crop.height, normal);
  ctx.clip();
}

/**
 * SVG path data that covers everything OUTSIDE the mask within `bounds`: the outline of the picture
 * followed by the outline of the shape, filled with the even-odd rule. Used for the preview overlay.
 */
export function maskSilhouette(crop: Rect, mask: Mask, bounds: SizeBounds, radius: number): string {
  const hole = mask.kind === "oval" ? ovalPath(crop) : roundPath(crop, radius);
  return `M0,0H${bounds.width}V${bounds.height}H0Z ${hole}`;
}

function ovalPath(box: Rect): string {
  const rx = box.width / 2;
  const ry = box.height / 2;
  const cx = box.x + rx;
  const cy = box.y + ry;
  return `M${cx - rx},${cy}A${rx},${ry} 0 1,0 ${cx + rx},${cy}A${rx},${ry} 0 1,0 ${cx - rx},${cy}Z`;
}

function roundPath(box: Rect, radius: number): string {
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(box.width, box.height) / 2)));
  const l = box.x;
  const t = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return `M${l + r},${t}H${right - r}A${r},${r} 0 0 1 ${right},${t + r}V${bottom - r}A${r},${r} 0 0 1 ${right - r},${bottom}H${l + r}A${r},${r} 0 0 1 ${l},${bottom - r}V${t + r}A${r},${r} 0 0 1 ${l + r},${t}Z`;
}

type SizeBounds = { width: number; height: number };

/** Cuts `crop` out of the turned picture at full size and encodes it. */
export async function renderCropped(image: LoadedImage, turn: Turn, crop: Rect, options: CropRenderOptions): Promise<RenderedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser does not support canvas, which this tool needs.");
  const background = options.background ?? (options.type === "image/jpeg" ? "#ffffff" : null);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, crop.width, crop.height);
  }
  const mask = normalizeMask(options.mask?.kind ?? "rect", options.mask?.radius ?? 0, crop);
  clipToMask(ctx, crop, { kind: mask.kind, radius: mask.radius });
  const m = cropMatrix(turnMatrix({ width: image.width, height: image.height }, turn), crop);
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(image.source, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, options.type, options.quality));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("The picture could not be saved. It may be too large for this browser.");
  return { blob, width: crop.width, height: crop.height, fellBack: blob.type !== options.type };
}
