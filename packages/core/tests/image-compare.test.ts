import { describe, expect, it } from "vitest";
import { diffPixels } from "../src/image-compare";

const rgba = (values: number[]) => new Uint8ClampedArray(values);

/** A 2×2 solid image in one call. */
const solid = (r: number, g: number, b: number, a = 255) => rgba([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);

describe("diffPixels", () => {
  const BASE = solid(200, 200, 200);

  it("count identical images as fully the same", () => {
    const result = diffPixels(BASE, solid(200, 200, 200), 2, 2);
    expect(result.same).toBe(4);
    expect(result.different).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.averageDelta).toBe(0);
    expect(result.maxDelta).toBe(0);
  });

  it("counts pixels that differ by more than the threshold", () => {
    const changed = solid(200, 200, 200);
    changed[4] = 100; // second pixel: a big red change
    const result = diffPixels(BASE, changed, 2, 2, { threshold: 8 });
    expect(result.different).toBe(1);
    expect(result.percent).toBe(0.25);
    expect(result.maxDelta).toBe(100);
    expect(result.averageDelta).toBe(25);
  });

  it("applies the threshold to every channel, alpha included", () => {
    const faded = solid(200, 200, 200, 250);
    // Alpha only differs by 5: under the default threshold of 8 this is the same picture.
    expect(diffPixels(BASE, faded, 2, 2).different).toBe(0);
    expect(diffPixels(BASE, faded, 2, 2, { threshold: 4 }).different).toBe(4);
  });

  it("marks changed pixels red in the mask", () => {
    const changed = solid(200, 200, 200);
    changed[8] = 255;
    changed[9] = 255;
    changed[10] = 255;
    const result = diffPixels(BASE, changed, 2, 2, { withMask: true });
    expect(result.mask).toBeDefined();
    const mask = result.mask!;
    // Pixel 2 (bytes 8..11) changed, so its mask is red; unchanged ones are transparent.
    expect(mask[8]).toBe(255);
    expect(mask[11]).toBe(255);
    expect(mask[0]).toBe(0);
    expect(mask[3]).toBe(0);
  });

  it("works on wider buffers from a real canvas", () => {
    // A canvas ImageData can be larger than needed; extra bytes are ignored.
    const a = new Uint8ClampedArray(3 * 4 * 2).fill(10);
    const b = new Uint8ClampedArray(3 * 4 * 2).fill(10);
    b[4] = 10;
    expect(() => diffPixels(a, b, 3, 2)).not.toThrow();
  });

  it("throws on impossible sizes", () => {
    expect(() => diffPixels(BASE, BASE, 0, 2)).toThrow(RangeError);
    expect(() => diffPixels(BASE, BASE, 2, 2.5)).toThrow(RangeError);
    expect(() => diffPixels(new Uint8ClampedArray(4), BASE, 2, 2)).toThrow(RangeError);
  });
});
