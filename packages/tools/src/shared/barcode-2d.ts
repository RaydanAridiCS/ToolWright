"use client";

import type { RenderOptions } from "bwip-js/browser";

export type Barcode2dType = "datamatrix" | "pdf417";

export interface Barcode2dOptions {
  text: string;
  type: Barcode2dType;
  scale?: number;
  width?: number;
  height?: number;
}

export interface Barcode2dResult {
  svg: string;
  width: number;
  height: number;
}

/**
 * Generate a 2D barcode (Data Matrix or PDF417) as an SVG string.
 * bwip-js is loaded on demand so the main tool chunk does not pay for it until used.
 */
export async function generate2dBarcode(options: Barcode2dOptions): Promise<Barcode2dResult> {
  const { toSVG } = await import("bwip-js/browser");
  const opts: RenderOptions = {
    bcid: options.type,
    text: options.text,
    scale: options.scale ?? 4,
    includetext: false,
  };
  if (options.width != null) opts.width = options.width;
  if (options.height != null) opts.height = options.height;
  const svg = toSVG(opts);

  const widthMatch = /width="([0-9.]+)"/.exec(svg);
  const heightMatch = /height="([0-9.]+)"/.exec(svg);

  return {
    svg,
    width: widthMatch ? Number(widthMatch[1]) : 0,
    height: heightMatch ? Number(heightMatch[1]) : 0,
  };
}
