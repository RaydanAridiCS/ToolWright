import { describe, expect, it } from "vitest";
import pkg from "@pdf-lib/upng";
import { ApngMakerError, makeApng } from "../src/apng-maker";

const UPNG = ((pkg as unknown as { default: typeof pkg }).default ?? pkg) as {
  encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[]): ArrayBuffer;
  decode(buffer: ArrayBuffer): { width: number; height: number; frames: { delay: number }[]; tabs?: { acTL?: { num_frames: number; num_plays: number } } };
};

function makePng(w: number, h: number, r: number, g: number, b: number): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer as unknown as ArrayBuffer], w, h, 0));
}

describe("makeApng", () => {
  it("combines two PNG frames into an animated PNG", () => {
    const frames = [makePng(10, 10, 255, 0, 0), makePng(10, 10, 0, 255, 0)];
    const apng = makeApng(frames, { delay: 100, loops: 0 });
    const decoded = UPNG.decode(apng.buffer as ArrayBuffer);
    expect(decoded.width).toBe(10);
    expect(decoded.height).toBe(10);
    expect(decoded.frames.length).toBe(2);
    expect(decoded.tabs?.acTL?.num_plays).toBe(0);
    expect(decoded.frames[0]?.delay).toBe(100);
  });

  it("sets a finite loop count", () => {
    const frames = [makePng(4, 4, 255, 0, 0), makePng(4, 4, 0, 0, 255)];
    const apng = makeApng(frames, { delay: 50, loops: 5 });
    const decoded = UPNG.decode(apng.buffer as ArrayBuffer);
    expect(decoded.tabs?.acTL?.num_plays).toBe(5);
  });

  it("throws for fewer than two frames", () => {
    expect(() => makeApng([makePng(4, 4, 0, 0, 0)], { delay: 100, loops: 0 })).toThrow(ApngMakerError);
  });

  it("throws for mismatched frame sizes", () => {
    const frames = [makePng(10, 10, 0, 0, 0), makePng(12, 12, 0, 0, 0)];
    expect(() => makeApng(frames, { delay: 100, loops: 0 })).toThrow("must be 10 × 10");
  });

  it("throws for a delay below 20 ms", () => {
    const frames = [makePng(4, 4, 0, 0, 0), makePng(4, 4, 0, 0, 0)];
    expect(() => makeApng(frames, { delay: 10, loops: 0 })).toThrow("at least 20 ms");
  });

  it("throws for a corrupt frame", () => {
    const frames = [makePng(4, 4, 0, 0, 0), new Uint8Array([1, 2, 3, 4])];
    expect(() => makeApng(frames, { delay: 100, loops: 0 })).toThrow("could not be read as a PNG");
  });
});
