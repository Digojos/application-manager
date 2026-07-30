"use client";

import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "basketball-view-sound-muted";
const BUZZER_SRC = "/sounds/buzzer.mp3";

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredMuted(muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Ignora navegadores com localStorage bloqueado (modo privado etc.)
  }
}

/**
 * Buzina tocada a partir de `public/sounds/buzzer.mp3` — mesmo arquivo para fim de período
 * e estouro da posse de 24s. Mute é salvo por dispositivo (localStorage), não pela sessão —
 * cada TV decide por si.
 */
export function useClockBuzzer() {
  const [muted, setMutedState] = useState(readStoredMuted);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getAudio = useCallback((): HTMLAudioElement | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      audioRef.current = new Audio(BUZZER_SRC);
      audioRef.current.preload = "auto";
    }
    return audioRef.current;
  }, []);

  // Navegadores só liberam áudio depois de um gesto do usuário — chamar isso a partir do
  // clique no botão de mute/unmute "destrava" o elemento de áudio pro resto da sessão.
  const unlock = useCallback(() => {
    const audio = getAudio();
    if (!audio) return;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {
        // Navegador ainda bloqueou; tenta de novo no próximo play() real.
      });
  }, [getAudio]);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeStoredMuted(next);
  }, []);

  const toggleMuted = useCallback(() => {
    unlock();
    setMuted(!muted);
  }, [muted, setMuted, unlock]);

  const play = useCallback(() => {
    if (muted) return;
    const audio = getAudio();
    if (!audio) return;

    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Ignora bloqueio de autoplay — o usuário ainda não interagiu com a página.
    });
  }, [muted, getAudio]);

  return { muted, toggleMuted, play, unlock };
}
