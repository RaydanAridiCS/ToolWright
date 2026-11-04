/** Logic for the Text-to-Speech Preview tool. Keep this file free of React, the DOM and the network. */

/** A minimal, serialisable subset of `SpeechSynthesisVoice` so the core stays environment-agnostic. */
export interface SpeechVoiceLike {
  name: string;
  lang: string;
  default: boolean;
  localService?: boolean;
  voiceURI: string;
}

export interface TextToSpeechOptions {
  /** Speaking rate from 0.1 (slowest) to 10 (fastest). Default 1. */
  rate?: number;
  /** Voice pitch from 0 (lowest) to 2 (highest). Default 1. */
  pitch?: number;
  /** Volume from 0 to 1. Default 1. */
  volume?: number;
}

const DEFAULT_CHUNK_MAX = 240;
const SENTENCE_END = /[.!?。؟！？]+(?:\s+|$)/;

/**
 * Split text into chunks short enough for smooth speech synthesis and reliable pause/resume.
 * Tries to break at sentence boundaries, then words, then characters, never exceeding `maxLength`.
 */
export function chunkText(text: string, maxLength = DEFAULT_CHUNK_MAX): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  if (trimmed.length <= maxLength) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining.trim());
      break;
    }

    // Prefer splitting after a sentence end.
    const slice = remaining.slice(0, maxLength + 1);
    let lastSentenceEnd = -1;
    let match: RegExpExecArray | null;
    const regex = new RegExp(SENTENCE_END.source, "g");
    while ((match = regex.exec(slice)) !== null) {
      lastSentenceEnd = match.index + match[0].length;
    }

    if (lastSentenceEnd > 0) {
      chunks.push(remaining.slice(0, lastSentenceEnd).trim());
      remaining = remaining.slice(lastSentenceEnd).trim();
      continue;
    }

    // Fall back to the last whitespace in the window.
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 0) {
      chunks.push(remaining.slice(0, lastSpace).trim());
      remaining = remaining.slice(lastSpace).trim();
      continue;
    }

    // Hard break at maxLength as a last resort.
    chunks.push(remaining.slice(0, maxLength).trim());
    remaining = remaining.slice(maxLength).trim();
  }

  return chunks.filter((c) => c.length > 0);
}

/** Build a readable label for a voice. */
export function formatVoiceLabel(voice: SpeechVoiceLike): string {
  const parts = [voice.name, displayLanguage(voice.lang)];
  if (voice.localService === false) parts.push("network");
  return parts.join(" · ");
}

/** Convert a BCP-47 tag into a human-readable language name. */
function displayLanguage(tag: string): string {
  try {
    const primary = tag.split("-")[0];
    if (!primary) return tag;
    const display = new Intl.DisplayNames(["en"], { type: "language" }).of(primary);
    return display ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Choose a sensible default voice.
 * Prefers a voice marked `default`, then a local voice matching `preferredLang`,
 * then any local voice, then any voice at all.
 */
export function pickDefaultVoice(voices: SpeechVoiceLike[], preferredLang?: string): SpeechVoiceLike | null {
  if (voices.length === 0) return null;

  const defaultVoice = voices.find((v) => v.default);
  if (defaultVoice) return defaultVoice;

  const prefLang = normalizeLang(preferredLang ?? (typeof navigator !== "undefined" ? navigator.language : undefined));

  const local = voices.filter((v) => v.localService !== false);
  const pool = local.length > 0 ? local : voices;

  if (prefLang) {
    const exact = pool.find((v) => normalizeLang(v.lang) === prefLang);
    if (exact) return exact;
    const prefix = pool.find((v) => normalizeLang(v.lang)?.startsWith(prefLang.split("-")[0] ?? ""));
    if (prefix) return prefix;
  }

  return pool[0] ?? voices[0] ?? null;
}

function normalizeLang(lang: string | undefined): string | undefined {
  if (!lang) return undefined;
  return lang.toLowerCase().replace(/_/g, "-");
}

/** Clamp a speaking rate to the range the Web Speech API accepts. */
export function normalizeRate(rate: number): number {
  return clamp(rate, 0.1, 10);
}

/** Clamp a voice pitch to the range the Web Speech API accepts. */
export function normalizePitch(pitch: number): number {
  return clamp(pitch, 0, 2);
}

/** Clamp a volume to the range the Web Speech API accepts. */
export function normalizeVolume(volume: number): number {
  return clamp(volume, 0, 1);
}

/** Validate and normalise all TTS options. */
export function normalizeTextToSpeechOptions(options: TextToSpeechOptions = {}): Required<TextToSpeechOptions> {
  return {
    rate: normalizeRate(options.rate ?? 1),
    pitch: normalizePitch(options.pitch ?? 1),
    volume: normalizeVolume(options.volume ?? 1),
  };
}

/** Check whether a speech-synthesis implementation looks usable. */
export function isSpeechSynthesisSupported(synth?: SpeechSynthesis | null): boolean {
  return typeof synth !== "undefined" && synth !== null && typeof synth.speak === "function";
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
