"use client";

import { useEffect, useMemo } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Alert, Button, Field, Select, Textarea, useShareableState } from "@toolwright/ui";
import { formatVoiceLabel, normalizePitch, normalizeRate, normalizeVolume, pickDefaultVoice } from "@toolwright/core/text-to-speech";
import { useSpeechSynthesis } from "../../shared/use-speech-synthesis";
import { NumberField, num } from "../../shared/number-field";

const SAMPLE_TEXT =
  "The quick brown fox jumps over the lazy dog. How many pickled peppers did Peter Piper pick?";

export default function Tool() {
  const { state, setState } = useShareableState(
    { text: "", voiceURI: "", rate: "1", pitch: "1", volume: "100" },
    { exclude: [] },
  );

  const { voices, supported, speaking, paused, currentChunk, totalChunks, speak, pause, resume, stop } =
    useSpeechSynthesis();

  // Pick a default voice once voices load if none is selected.
  useEffect(() => {
    if (!supported || voices.length === 0 || state.voiceURI) return;
    const defaultVoice = pickDefaultVoice(
      voices.map((v) => ({ name: v.name, lang: v.lang, default: v.default, localService: v.localService, voiceURI: v.voiceURI })),
      typeof navigator !== "undefined" ? navigator.language : undefined,
    );
    if (defaultVoice) {
      const match = voices.find((v) => v.voiceURI === defaultVoice.voiceURI);
      if (match) setState((s) => ({ ...s, voiceURI: match.voiceURI }));
    }
  }, [supported, voices, state.voiceURI, setState]);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceURI === state.voiceURI) ?? null,
    [voices, state.voiceURI],
  );

  const rate = normalizeRate(num(state.rate));
  const pitch = normalizePitch(num(state.pitch));
  const volume = normalizeVolume(num(state.volume) / 100);

  const canPlay = supported && state.text.trim().length > 0 && voices.length > 0;

  const handlePlay = () => {
    if (!canPlay) return;
    speak(state.text, selectedVoice, rate, pitch, volume);
  };

  const handleSample = () => {
    setState((s) => ({ ...s, text: SAMPLE_TEXT }));
    const voice = selectedVoice ?? voices[0] ?? null;
    speak(SAMPLE_TEXT, voice, rate, pitch, volume);
  };

  return (
    <div className="flex flex-col gap-5">
      {!supported ? (
        <Alert tone="warning" title="Speech synthesis is not available">
          Your browser does not support the Web Speech API, or it is disabled. Text-to-Speech Preview works in most
          modern desktop and mobile browsers.
        </Alert>
      ) : null}

      {supported && voices.length === 0 ? (
        <Alert tone="info">Loading available voices…</Alert>
      ) : null}

      <Field label="Text to speak">
        {(id) => (
          <Textarea
            id={id}
            value={state.text}
            onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
            placeholder="Type or paste the text you want to hear."
            rows={6}
          />
        )}
      </Field>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Voice">
          {(id) => (
            <Select
              id={id}
              value={state.voiceURI}
              onChange={(e) => setState((s) => ({ ...s, voiceURI: e.target.value }))}
              disabled={voices.length === 0}
            >
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {formatVoiceLabel({
                    name: voice.name,
                    lang: voice.lang,
                    default: voice.default,
                    localService: voice.localService,
                    voiceURI: voice.voiceURI,
                  })}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <NumberField label="Speed" suffix="×" value={state.rate} onChange={(v) => setState((s) => ({ ...s, rate: v }))} min={0.1} max={10} step={0.1} hint="0.1 to 10" />
        <NumberField label="Pitch" suffix="×" value={state.pitch} onChange={(v) => setState((s) => ({ ...s, pitch: v }))} min={0} max={2} step={0.1} hint="0 to 2" />
        <NumberField label="Volume" suffix="%" value={state.volume} onChange={(v) => setState((s) => ({ ...s, volume: v }))} min={0} max={100} step={5} hint="0 to 100" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" disabled={!canPlay} onClick={handlePlay}>
          <Play aria-hidden />
          {speaking ? "Restart" : "Speak"}
        </Button>

        {speaking ? (
          <Button variant="secondary" size="md" onClick={paused ? resume : pause}>
            {paused ? (
              <>
                <Play aria-hidden /> Resume
              </>
            ) : (
              <>
                <Pause aria-hidden /> Pause
              </>
            )}
          </Button>
        ) : null}

        {speaking ? (
          <Button variant="ghost" size="md" onClick={stop}>
            <Square aria-hidden /> Stop
          </Button>
        ) : null}

        <Button variant="outline" size="md" disabled={!supported || voices.length === 0} onClick={handleSample}>
          <Volume2 aria-hidden /> Sample
        </Button>
      </div>

      {speaking ? (
        <Alert tone="info">
          {paused
            ? `Paused on chunk ${currentChunk} of ${totalChunks}.`
            : `Speaking chunk ${currentChunk} of ${totalChunks}.`}
        </Alert>
      ) : null}
    </div>
  );
}
