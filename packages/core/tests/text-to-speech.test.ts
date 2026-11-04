import { describe, expect, it } from "vitest";
import {
  chunkText,
  formatVoiceLabel,
  isSpeechSynthesisSupported,
  normalizePitch,
  normalizeRate,
  normalizeTextToSpeechOptions,
  normalizeVolume,
  pickDefaultVoice,
  type SpeechVoiceLike,
} from "../src/text-to-speech";

const voice = (overrides: Partial<SpeechVoiceLike> = {}): SpeechVoiceLike => ({
  name: "Alex",
  lang: "en-US",
  default: false,
  localService: true,
  voiceURI: "com.apple.speech.synthesis.voice.Alex",
  ...overrides,
});

describe("chunkText", () => {
  it("returns an empty array for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText("\n\t  ")).toEqual([]);
  });

  it("returns a single chunk when text is within the limit", () => {
    expect(chunkText("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits at sentence boundaries when possible", () => {
    const input = "First sentence. Second sentence! Third one? Fourth and last.";
    const chunks = chunkText(input, 30);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(input);
    expect(chunks.every((c) => c.length <= 30)).toBe(true);
  });

  it("falls back to word boundaries when no sentence end fits", () => {
    const input = "one two three four five six seven eight";
    const chunks = chunkText(input, 12);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 12)).toBe(true);
    expect(chunks.join(" ")).toBe(input);
  });

  it("hard-breaks at maxLength for a single long word", () => {
    const input = "a".repeat(100);
    const chunks = chunkText(input, 30);
    expect(chunks.every((c) => c.length <= 30)).toBe(true);
    expect(chunks.join("")).toBe(input);
  });

  it("trims leading and trailing whitespace from chunks", () => {
    const input = "Hello.   World.  ";
    expect(chunkText(input, 10)).toEqual(["Hello.", "World."]);
  });
});

describe("formatVoiceLabel", () => {
  it("includes the voice name and language", () => {
    expect(formatVoiceLabel(voice({ name: "Samantha", lang: "en-US" }))).toContain("Samantha");
    expect(formatVoiceLabel(voice({ name: "Samantha", lang: "en-US" }))).toContain("English");
  });

  it("marks network voices", () => {
    expect(formatVoiceLabel(voice({ name: "Zoe", lang: "fr-FR", localService: false }))).toContain("network");
  });
});

describe("pickDefaultVoice", () => {
  it("returns null for an empty list", () => {
    expect(pickDefaultVoice([])).toBeNull();
  });

  it("prefers the voice marked default", () => {
    const voices = [voice({ name: "A" }), voice({ name: "B", default: true }), voice({ name: "C" })];
    expect(pickDefaultVoice(voices)?.name).toBe("B");
  });

  it("prefers a local voice matching the requested language", () => {
    const voices = [
      voice({ name: "A", lang: "en-US", localService: false }),
      voice({ name: "B", lang: "fr-FR" }),
      voice({ name: "C", lang: "de-DE" }),
    ];
    expect(pickDefaultVoice(voices, "fr-FR")?.name).toBe("B");
  });

  it("falls back to the first local voice when no language matches", () => {
    const voices = [
      voice({ name: "A", lang: "en-US", localService: false }),
      voice({ name: "B", lang: "fr-FR" }),
      voice({ name: "C", lang: "de-DE" }),
    ];
    expect(pickDefaultVoice(voices, "es-ES")?.name).toBe("B");
  });

  it("falls back to any voice if no local voices exist", () => {
    const voices = [voice({ name: "A", lang: "en-US", localService: false })];
    expect(pickDefaultVoice(voices)?.name).toBe("A");
  });
});

describe("normalisers", () => {
  it("clamps rate to [0.1, 10]", () => {
    expect(normalizeRate(1)).toBe(1);
    expect(normalizeRate(0)).toBe(0.1);
    expect(normalizeRate(20)).toBe(10);
    expect(normalizeRate(Number.NaN)).toBe(0.1);
  });

  it("clamps pitch to [0, 2]", () => {
    expect(normalizePitch(1)).toBe(1);
    expect(normalizePitch(-1)).toBe(0);
    expect(normalizePitch(3)).toBe(2);
  });

  it("clamps volume to [0, 1]", () => {
    expect(normalizeVolume(1)).toBe(1);
    expect(normalizeVolume(-0.5)).toBe(0);
    expect(normalizeVolume(1.5)).toBe(1);
  });

  it("normalises an option object", () => {
    expect(normalizeTextToSpeechOptions({ rate: 1.5, pitch: 0.8, volume: 0.9 })).toEqual({
      rate: 1.5,
      pitch: 0.8,
      volume: 0.9,
    });
    expect(normalizeTextToSpeechOptions({})).toEqual({ rate: 1, pitch: 1, volume: 1 });
  });
});

describe("isSpeechSynthesisSupported", () => {
  it("returns true for a mock speech synthesis object", () => {
    expect(isSpeechSynthesisSupported({ speak: () => {} } as unknown as SpeechSynthesis)).toBe(true);
  });

  it("returns false for null, undefined or non-objects", () => {
    expect(isSpeechSynthesisSupported(null)).toBe(false);
    expect(isSpeechSynthesisSupported(undefined)).toBe(false);
    expect(isSpeechSynthesisSupported({} as unknown as SpeechSynthesis)).toBe(false);
  });
});
