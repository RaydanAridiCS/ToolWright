"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkText, isSpeechSynthesisSupported } from "@toolwright/core/text-to-speech";

export interface SpeechSynthesisState {
  /** Voices reported by the browser. Empty until the engine loads them. */
  voices: SpeechSynthesisVoice[];
  /** Whether the browser exposes a usable speech-synthesis API. */
  supported: boolean;
  /** Currently speaking (including while paused). */
  speaking: boolean;
  /** The queue is paused. */
  paused: boolean;
  /** 1-based index of the chunk being spoken. */
  currentChunk: number;
  /** Total number of chunks the current text was split into. */
  totalChunks: number;
  /** Start or restart speaking. */
  speak: (text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number, volume: number) => void;
  /** Pause the current utterance. */
  pause: () => void;
  /** Resume a paused utterance. */
  resume: () => void;
  /** Stop speaking and clear the queue. */
  stop: () => void;
}

/**
 * A thin wrapper around the Web Speech API for Toolwright's Text-to-Speech tool.
 * Keeps the queue, pause/resume state and current chunk index in React state.
 */
export function useSpeechSynthesis(): SpeechSynthesisState {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const chunksRef = useRef<string[]>([]);
  const indexRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!isSpeechSynthesisSupported(synth)) return;

    synthRef.current = synth;
    setSupported(true);

    const loadVoices = () => setVoices(synth.getVoices());
    loadVoices();

    // Some browsers fire onvoiceschanged, some already have voices on first call.
    synth.onvoiceschanged = loadVoices;

    return () => {
      synth.cancel();
      synth.onvoiceschanged = null;
    };
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    setSpeaking(false);
    setPaused(false);
    setCurrentChunk(0);
    setTotalChunks(0);
    chunksRef.current = [];
    indexRef.current = 0;
  }, []);

  const speak = useCallback(
    (text: string, voice: SpeechSynthesisVoice | null, rate: number, pitch: number, volume: number) => {
      const synth = synthRef.current;
      if (!synth || !text.trim()) return;

      synth.cancel();
      const chunks = chunkText(text);
      if (chunks.length === 0) return;

      chunksRef.current = chunks;
      indexRef.current = 0;
      setTotalChunks(chunks.length);
      setCurrentChunk(1);
      setSpeaking(true);
      setPaused(false);

      const speakNext = () => {
        if (indexRef.current >= chunksRef.current.length) {
          setSpeaking(false);
          setPaused(false);
          setCurrentChunk(0);
          return;
        }

        setCurrentChunk(indexRef.current + 1);
        const utter = new SpeechSynthesisUtterance(chunksRef.current[indexRef.current]);
        if (voice) utter.voice = voice;
        utter.rate = rate;
        utter.pitch = pitch;
        utter.volume = volume;

        utter.onend = () => {
          indexRef.current++;
          speakNext();
        };

        utter.onerror = (event) => {
          // "canceled" and "interrupted" are expected when the user stops or changes options.
          if (event.error !== "canceled" && event.error !== "interrupted") {
            console.error("Speech synthesis error:", event.error);
          }
          setSpeaking(false);
          setPaused(false);
        };

        synth.speak(utter);
      };

      speakNext();
    },
    [],
  );

  const pause = useCallback(() => {
    synthRef.current?.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    synthRef.current?.resume();
    setPaused(false);
  }, []);

  return { voices, supported, speaking, paused, currentChunk, totalChunks, speak, pause, resume, stop };
}
