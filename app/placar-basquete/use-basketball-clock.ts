"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clockRemainingMs, type BasketballState } from "@/lib/basketball";

const OFFSET_DEADBAND_MS = 250;

/**
 * Calibra o offset entre o relógio deste dispositivo e o `serverNow` recebido em todo
 * GET/PATCH/evento SSE. Zona morta de 250ms para o segundo exibido não engasgar a cada
 * push, mas ainda absorver um salto real (notebook voltando do sleep, NTP). Ver
 * lib/basketball.ts para o porquê dessa escolha em vez do servidor reescrever o estado.
 */
export function useServerClock() {
  const offsetRef = useRef<number | null>(null);

  const syncServerNow = useCallback((serverNowIso: string) => {
    const server = Date.parse(serverNowIso);
    if (!Number.isFinite(server)) return;

    const next = server - Date.now();
    if (offsetRef.current === null || Math.abs(next - offsetRef.current) > OFFSET_DEADBAND_MS) {
      offsetRef.current = next;
    }
  }, []);

  const nowMs = useCallback(() => Date.now() + (offsetRef.current ?? 0), []);

  return { syncServerNow, nowMs };
}

function quantize(ms: number): number {
  return ms >= 60_000 ? Math.floor(ms / 1000) * 1000 : Math.floor(ms / 100) * 100;
}

/**
 * Tique 100% client-side: nenhuma escrita de rede. Sem intervalo quando os dois
 * relógios estão parados; setInterval(100) quando algum roda; o valor quantizado só
 * muda de referência quando o segundo/décimo exibido de fato muda, para o React não
 * re-renderizar a cada 100ms sem necessidade (importa em hardware fraco de TV).
 */
export function useLiveClocks(state: BasketballState | null, nowMs: () => number) {
  const [ticks, setTicks] = useState({ gameMs: 0, shotMs: 0 });

  useEffect(() => {
    if (!state) return;

    const compute = () => {
      const now = nowMs();
      const rawGameMs = clockRemainingMs(state.gameClock, now);
      const rawShotMs = clockRemainingMs(state.shotClock, now);
      const gameMs = quantize(rawGameMs);
      // A posse nunca deve aparentar mais tempo do que resta de período — se o jogo
      // acabar antes dela zerar, não há violação de posse (só o fim do período importa).
      // Puramente visual: o cronômetro de posse por baixo continua contando normalmente.
      const shotMs = quantize(state.config.useShotClock ? Math.min(rawShotMs, rawGameMs) : rawShotMs);

      // Updater funcional: lê o valor mais recente sem precisar de um ref mutado
      // durante o render, e devolve a MESMA referência quando nada mudou para o
      // React desistir do re-render (Object.is bail-out).
      setTicks((prev) => (prev.gameMs === gameMs && prev.shotMs === shotMs ? prev : { gameMs, shotMs }));
    };

    compute();

    const anyRunning = state.gameClock.isRunning || state.shotClock.isRunning;
    if (!anyRunning) return;

    const interval = setInterval(compute, 100);
    return () => clearInterval(interval);
  }, [state, nowMs]);

  return ticks;
}

/**
 * Detecta quando um relógio chegou a zero (checagem a cada 100ms) e dispara `onExpire`
 * exatamente uma vez por corrida — a trava é reaberta assim que o relógio correspondente
 * volta a rodar. O controle usa isto para disparar `EXPIRE_CLOCK` via PATCH (efeito de
 * rede). A view também usa este hook, mas só para tocar o alarme sonoro local — nunca faz
 * PATCH (ver lib/basketball.ts, "Quem manda no zerou"); múltiplas TVs detectando o zero e
 * tocando som cada uma na sua não tem race condition porque não escreve estado nenhum.
 */
export function useClockExpiry(options: {
  state: BasketballState | null;
  nowMs: () => number;
  enabled: boolean;
  onExpire: (clock: "game" | "shot") => void;
}) {
  const { state, nowMs, enabled, onExpire } = options;
  const firedRef = useRef({ game: false, shot: false });

  useEffect(() => {
    if (!enabled || !state) return;

    if (state.gameClock.isRunning) firedRef.current.game = false;
    if (state.shotClock.isRunning) firedRef.current.shot = false;

    const check = () => {
      const now = nowMs();

      if (state.gameClock.isRunning && clockRemainingMs(state.gameClock, now) <= 0 && !firedRef.current.game) {
        firedRef.current.game = true;
        onExpire("game");
      }

      if (
        state.config.useShotClock &&
        state.shotClock.isRunning &&
        clockRemainingMs(state.shotClock, now) <= 0 &&
        !firedRef.current.shot
      ) {
        firedRef.current.shot = true;
        onExpire("shot");
      }
    };

    check();

    const anyRunning = state.gameClock.isRunning || state.shotClock.isRunning;
    if (!anyRunning) return;

    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [state, nowMs, enabled, onExpire]);
}
