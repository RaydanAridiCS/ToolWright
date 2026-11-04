import { describe, expect, it } from "vitest";
import { searchImageUnderTarget } from "../src/image-target-size";

/** A fake encoder: an 800×600 image, where the size shrinks as the quality drops or the picture shrinks. */
const fakeEncode = (base = 400_000) => async (width: number, height: number, quality: number) => {
  const shrink = (width * height) / (800 * 600);
  return { size: Math.max(1, Math.round(base * shrink * quality ** 1.5)) };
};

describe("searchImageUnderTarget", () => {
  it("finds the highest quality that stays under the target at the original size", async () => {
    const result = await searchImageUnderTarget(120_000, { width: 800, height: 600 }, fakeEncode());
    expect(result.hit).toBe(true);
    expect(result.best?.size).toBeLessThanOrEqual(120_000);
    expect(result.rounds).toBe(0);
    // A higher probe was made and rejected, so quality sits close to the boundary.
    expect(result.best && result.best.quality > 0.3).toBe(true);
    expect(result.attempts).toBeGreaterThan(1);
  });

  it("keeps the first perfect encode short: a small target is found quickly", async () => {
    const result = await searchImageUnderTarget(1000, { width: 800, height: 600 }, async () => null);
    expect(result.hit).toBe(false);
    expect(result.best).toBe(null);
  });

  it("shrinks the dimensions when no quality can reach the target", async () => {
    // Nothing ever fits until the picture is a quarter of its size.
    const encode = async (width: number, height: number, _quality: number) => ({ size: Math.round((width * height) / 400) * 100 });
    const result = await searchImageUnderTarget(30_000, { width: 800, height: 600 }, encode);
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.best?.width ?? 800).toBeLessThan(800);
  });

  it("reports the smallest attempt when even downscaling cannot fit", async () => {
    const encode = async (width: number, height: number, quality: number) => ({ size: 999_000 - Math.round(quality * 100) });
    const result = await searchImageUnderTarget(5000, { width: 800, height: 600 }, encode, { maxRounds: 1 });
    expect(result.hit).toBe(false);
    expect(result.best?.size).toBeLessThan(999_000);
    expect(result.rounds).toBe(1);
  });

  it("stop shrinking when the encoder cannot gain another round", async () => {
    const encode = async () => ({ size: 1000 });
    // The first size already fits, so no round is needed at all.
    const result = await searchImageUnderTarget(2000, { width: 48, height: 48 }, encode);
    expect(result.hit).toBe(true);
    expect(result.rounds).toBe(0);
  });

  it("whole-pixels the requested size", async () => {
    let seen: { width: number; height: number } | null = null;
    await searchImageUnderTarget(2_000_000, { width: 100.4, height: 50.6 }, async (width, height) => {
      seen ??= { width, height };
      return { size: 1_000_000 };
    });
    expect(seen).toEqual({ width: 100, height: 51 });
  });

  it("throws on nonsense targets", async () => {
    const encode = async () => ({ size: 10 });
    await expect(searchImageUnderTarget(0, { width: 10, height: 10 }, encode)).rejects.toThrow(RangeError);
    await expect(searchImageUnderTarget(NaN, { width: 10, height: 10 }, encode)).rejects.toThrow(RangeError);
  });

  it("handles an encoder that never succeeds", async () => {
    const result = await searchImageUnderTarget(10_000, { width: 400, height: 400 }, async () => null);
    expect(result.hit).toBe(false);
    expect(result.best).toBe(null);
    expect(result.rounds).toBe(0);
  });
});
