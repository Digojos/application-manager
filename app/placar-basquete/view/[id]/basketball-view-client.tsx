"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatGameClock,
  formatShotClock,
  isAtFoulLimit,
  normalizeBasketballState,
  timeoutAllowance,
  type BasketballState,
} from "@/lib/basketball";
import type { PublicBasketballSessionRecord } from "@/lib/basketball-sessions";
import { useClockExpiry, useLiveClocks, useServerClock } from "../../use-basketball-clock";
import { useClockBuzzer } from "./use-clock-buzzer";

interface BasketballViewClientProps {
  sessionId: string;
}

type SessionResponse = Omit<PublicBasketballSessionRecord, "state"> & {
  state: BasketballState;
  serverNow: string;
};

export function BasketballViewClient({ sessionId }: BasketballViewClientProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { syncServerNow, nowMs } = useServerClock();

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/basketball-sessions/${sessionId}`, { cache: "no-store" });
        if (response.status === 404) {
          if (active) {
            setSession(null);
            setIsUnavailable(true);
            setError(null);
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Falha ao carregar a sessão");
        }

        const data = (await response.json()) as SessionResponse;
        if (active) {
          syncServerNow(data.serverNow);
          setSession({ ...data, state: normalizeBasketballState(data.state) });
          setIsUnavailable(false);
          setError(null);
        }

        eventSource = new EventSource(`/api/basketball-sessions/${sessionId}/stream`);

        eventSource.addEventListener("session", (event) => {
          const nextSession = JSON.parse((event as MessageEvent).data) as SessionResponse;
          if (active) {
            syncServerNow(nextSession.serverNow);
            setSession({ ...nextSession, state: normalizeBasketballState(nextSession.state) });
            setIsUnavailable(false);
            setError(null);
          }
        });

        eventSource.addEventListener("clock-sync", (event) => {
          const payload = JSON.parse((event as MessageEvent).data) as { serverNow: string };
          if (active) syncServerNow(payload.serverNow);
        });

        eventSource.addEventListener("error", () => {
          // Engolido de propósito: o reconnect nativo do EventSource assume e o último
          // placar conhecido continua na tela em vez de sumir por causa de uma rede instável.
          if (active) {
            setError(null);
          }
        });
      } catch {
        if (active) {
          setIsUnavailable(false);
          setError("Não foi possível carregar a visualização desta sessão.");
        }
      }
    };

    void loadSession();

    return () => {
      active = false;
      eventSource?.close();
    };
  }, [sessionId, syncServerNow]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignora navegadores que bloqueiam fullscreen.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  const { gameMs, shotMs } = useLiveClocks(session?.state ?? null, nowMs);

  const { muted, toggleMuted, play, unlock } = useClockBuzzer();
  const soundAlertsEnabled = session?.state.display.soundAlertsEnabled ?? false;

  // O navegador só libera áudio depois de um gesto real do usuário — sem isso, a primeira
  // buzina automática (disparada pelo estouro do cronômetro, sem clique nenhum) toca em
  // silêncio. Qualquer clique/toque/tecla na página já destrava, não só o botão de mute.
  useEffect(() => {
    if (!soundAlertsEnabled) return;

    const handleFirstInteraction = () => {
      unlock();
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };

    window.addEventListener("pointerdown", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);

    return () => {
      window.removeEventListener("pointerdown", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [soundAlertsEnabled, unlock]);

  useClockExpiry({
    state: session?.state ?? null,
    nowMs,
    enabled: Boolean(session) && soundAlertsEnabled,
    onExpire: play,
  });

  if (isUnavailable) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 flex items-center justify-center">
        <div className="mx-auto max-w-4xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6">
          <p className="text-lg font-semibold text-amber-200">Sessão indisponível</p>
          <p className="mt-2 text-sm text-amber-100/90">
            Essa sessão não existe mais ou foi removida. Crie uma nova sessão para continuar a visualização.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 flex items-center justify-center">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-lg font-semibold">Visualização do placar</p>
          <p className="mt-2 text-sm text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 flex items-center justify-center">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-lg font-semibold">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  const state = session.state;
  const display = state.display;
  const teamAAtLimit = isAtFoulLimit(state.teamA, state.config);
  const teamBAtLimit = isAtFoulLimit(state.teamB, state.config);
  const allowance = timeoutAllowance(state);
  const shellClass = isFullscreen
    ? "w-full min-h-screen overflow-hidden px-3 py-3 sm:px-6 sm:py-6 flex flex-col"
    : "min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-4 sm:py-6 text-white flex flex-col";
  const cardPaddingClass = isFullscreen ? "p-5 sm:p-6 md:p-8" : "p-6 sm:p-7 md:p-8";
  const scoreClass = isFullscreen ? "text-[clamp(6rem,20vw,15rem)]" : "text-[clamp(5rem,22vw,14rem)]";
  const teamNameFontSize = `clamp(1.5rem, 7vw, ${display.teamNameSize}px)`;
  const scoreFontSize = `clamp(4.5rem, 22vw, ${display.scoreSize}px)`;
  const clockFontSize = `clamp(3rem, 14vw, ${display.clockSize}px)`;
  const shotClockUrgent = state.config.useShotClock && shotMs > 0 && shotMs < 5_000;

  return (
    <div ref={pageRef} className={shellClass}>
      {isFullscreen && soundAlertsEnabled && (
        <button
          type="button"
          onClick={toggleMuted}
          className="fixed top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/60 transition-colors"
          aria-label={muted ? "Ativar som" : "Silenciar som"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}

      <div className={`mx-auto flex w-full flex-1 ${isFullscreen ? "max-w-none flex-col gap-3 overflow-y-auto" : "max-w-none flex-col gap-4"}`}>
        <div className={`rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur ${isFullscreen ? "hidden" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Visualização</p>
              <h1 className="mt-1 text-2xl font-bold">Placar de Basquete</h1>
            </div>
            <div className="flex items-center gap-2">
              {soundAlertsEnabled && (
                <button
                  type="button"
                  onClick={toggleMuted}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition-colors"
                  aria-label={muted ? "Ativar som" : "Silenciar som"}
                >
                  {muted ? "🔇" : "🔊"} {muted ? "Mudo" : "Som"}
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                  <path d="M8 3H3v5" />
                  <path d="M16 3h5v5" />
                  <path d="M8 21H3v-5" />
                  <path d="M16 21h5v-5" />
                </svg>
                {isFullscreen ? "Sair do fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>
        </div>

        {state.status === "finished" && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4 text-center">
            <p className="text-xl font-bold text-amber-200">
              {state.winner ? `${state.winner} venceu a partida` : "Empate"}
            </p>
          </div>
        )}

        <div
          className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl backdrop-blur"
          style={{ backgroundColor: display.cardBackgroundColor, color: display.cardFontColor }}
        >
          <div className="flex flex-wrap items-center justify-center gap-6 border-b border-white/10 px-5 py-4 sm:gap-10">
            {display.showPeriod && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Período</p>
                <p className="mt-1 text-4xl font-bold" style={{ color: display.accentColor }}>
                  <span className="font-seven-segment">{state.currentPeriod + 1}</span>
                  <span className="align-top text-xl">º</span>
                </p>
              </div>
            )}

            {display.showGameClock && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Cronômetro</p>
                <p
                  className="mt-1 font-black tabular-nums leading-none font-seven-segment"
                  style={{ fontSize: clockFontSize, color: display.accentColor }}
                >
                  {formatGameClock(gameMs, display.showTenths)}
                </p>
              </div>
            )}

            {display.showShotClock && state.config.useShotClock && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Posse</p>
                <p
                  className={`mt-1 font-black tabular-nums leading-none font-seven-segment ${shotClockUrgent ? "animate-pulse text-red-400" : ""}`}
                  style={shotClockUrgent ? { fontSize: clockFontSize } : { fontSize: clockFontSize, color: display.accentColor }}
                >
                  {formatShotClock(shotMs, display.showTenths)}
                </p>
              </div>
            )}

            {display.showPossession && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Posse de bola</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: display.accentColor }}>
                  {state.possession === "A" ? `◀ ${state.teamA.name}` : state.possession === "B" ? `${state.teamB.name} ▶` : "—"}
                </p>
              </div>
            )}
          </div>

          <div className="grid flex-1 grid-cols-1 divide-y divide-white/10 landscape:grid-cols-2 landscape:divide-y-0 landscape:divide-x lg:grid-cols-2 lg:divide-y-0 lg:divide-x">
            {(["A", "B"] as const).map((team) => {
              const teamState = team === "A" ? state.teamA : state.teamB;
              const atLimit = team === "A" ? teamAAtLimit : teamBAtLimit;
              const opponentAtLimit = team === "A" ? teamBAtLimit : teamAAtLimit;
              const isWinner = state.status === "finished" && state.winner === teamState.name;

              return (
                <section
                  key={team}
                  className={`${cardPaddingClass} flex flex-col min-h-[42vh] sm:min-h-[48vh] lg:min-h-0${isWinner ? " ring-4 ring-inset ring-amber-400/80" : ""}`}
                >
                  {display.showTeamNames && (
                    <div className="mb-2 w-full">
                      <h2
                        className="wrap-break-word text-center font-black"
                        style={{ fontSize: teamNameFontSize }}
                      >
                        {teamState.name}
                        {isWinner && <span title="Vencedor" className="inline-block align-middle ml-2 text-amber-400 text-2xl">🏆</span>}
                      </h2>
                    </div>
                  )}

                  <div className="flex flex-1 items-center justify-center py-6">
                    <span
                      className={`${scoreClass} font-black tabular-nums leading-none font-seven-segment`}
                      style={{ fontSize: scoreFontSize, color: display.accentColor }}
                    >
                      {teamState.points}
                    </span>
                  </div>

                  {(display.showFouls && state.config.useFouls) || display.showTimeouts ? (
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-sm">
                      {display.showFouls && state.config.useFouls && (
                        <div className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5">
                          <span className="font-semibold">Faltas: {teamState.fouls}</span>
                          {atLimit && (
                            <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-xs font-bold text-white">
                              LIMITE DE FALTAS
                            </span>
                          )}
                          {opponentAtLimit && !atLimit && (
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                              style={{ backgroundColor: display.accentColor }}
                            >
                              BÔNUS
                            </span>
                          )}
                        </div>
                      )}

                      {display.showTimeouts && (
                        <div className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5">
                          <span className="font-semibold">
                            Tempos: {teamState.timeoutsUsed}/{allowance}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
            );
          })}
          </div>
        </div>

        {display.showPeriodSummary && state.history.length > 0 && (
          <div
            className="rounded-2xl border border-white/10 p-5"
            style={{ backgroundColor: display.cardBackgroundColor, color: display.cardFontColor }}
          >
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Histórico por período</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-400">
                    <th className="py-2 pr-4">Período</th>
                    <th className="py-2 pr-4">Pontos no período</th>
                    <th className="py-2 pr-4">Placar acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.history.map((entry) => (
                    <tr key={entry.periodNumber} className="border-b border-white/5 text-slate-200">
                      <td className="py-2 pr-4">
                        {entry.isOvertime ? `Prorrogação` : `${entry.periodNumber}º Período`}
                      </td>
                      <td className="py-2 pr-4">
                        {entry.teamAPeriodPoints} x {entry.teamBPeriodPoints}
                      </td>
                      <td className="py-2 pr-4">
                        {entry.teamAName} {entry.teamAPoints} x {entry.teamBPoints} {entry.teamBName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
