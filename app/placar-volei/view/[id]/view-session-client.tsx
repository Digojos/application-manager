"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeScoreboardState,
  normalizeScoreboardTheme,
  type ScoreboardState,
} from "@/lib/scoreboard";
import type { PublicScoreboardSessionRecord } from "@/lib/scoreboard-sessions";

interface ViewSessionClientProps {
  sessionId: string;
}

type SessionResponse = Omit<PublicScoreboardSessionRecord, "state"> & { state: ScoreboardState };

function formatSetSummary(state: ScoreboardState) {
  return `${state.teamA.name} ${state.teamA.sets} x ${state.teamB.sets} ${state.teamB.name}`;
}

export function ViewSessionClient({ sessionId }: ViewSessionClientProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | null = null;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/scoreboard-sessions/${sessionId}`, { cache: "no-store" });
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
          setSession({ ...data, state: normalizeScoreboardState(data.state) });
          setIsUnavailable(false);
          setError(null);
        }

        eventSource = new EventSource(`/api/scoreboard-sessions/${sessionId}/stream`);

        eventSource.addEventListener("session", (event) => {
          const nextSession = JSON.parse((event as MessageEvent).data) as SessionResponse;
          if (active) {
            setSession({ ...nextSession, state: normalizeScoreboardState(nextSession.state) });
            setIsUnavailable(false);
            setError(null);
          }
        });

        eventSource.addEventListener("error", () => {
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
  }, [sessionId]);

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
      // Ignore browsers that block fullscreen.
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
  const safeTheme = normalizeScoreboardTheme(state.display);
  const currentSetTarget = state.config.useTieBreak && state.currentSet === state.config.totalSets - 1
    ? state.config.tieBreakPoints
    : state.config.pointsPerSet;
  const shellClass = isFullscreen
    ? "w-full min-h-screen overflow-hidden px-3 py-3 sm:px-6 sm:py-6 flex flex-col"
    : "min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-4 sm:py-6 text-white flex flex-col";
  const cardPaddingClass = isFullscreen ? "p-5 sm:p-6 md:p-8" : "p-6 sm:p-7 md:p-8";
  const scoreClass = isFullscreen
    ? "text-[clamp(6rem,20vw,15rem)]"
    : "text-[clamp(5rem,22vw,14rem)]";
  const teamNameFontSize = `clamp(1.75rem, 9vw, ${safeTheme.teamNameSize}px)`;
  const viewScoreFontSize = `clamp(4.5rem, 24vw, ${safeTheme.scoreSize}px)`;

  return (
    <div ref={pageRef} className={shellClass}>
      <div className={`mx-auto flex w-full flex-1 ${isFullscreen ? "max-w-none flex-col gap-3 overflow-y-auto" : "max-w-none flex-col gap-4"}`}>
        <div className={`rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur ${isFullscreen ? "hidden sm:block" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Visualização</p>
              <h1 className="mt-1 text-2xl font-bold">Placar de Vôlei</h1>
            </div>
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

        <div className="grid flex-1 grid-cols-1 gap-4 landscape:grid-cols-2 lg:grid-cols-2">
          {(["A", "B"] as const).map((team) => {
            const teamState = team === "A" ? state.teamA : state.teamB;
            // Troféu se for o vencedor
            const isWinner = state.winner && state.winner === teamState.name;
            return (
              <section
                key={team}
                className={`rounded-3xl border border-white/10 shadow-2xl backdrop-blur ${cardPaddingClass} flex flex-col min-h-[42vh] sm:min-h-[48vh] lg:min-h-0${isWinner ? " ring-4 ring-amber-400/80" : ""}`}
                style={{ backgroundColor: safeTheme.cardBackgroundColor, color: safeTheme.cardFontColor }}
              >
                {safeTheme.showTeamNames && (
                  <div className="mb-4 w-full">
                    <h2
                      className={`wrap-break-word text-center font-black ${isFullscreen ? "text-4xl sm:text-5xl" : "text-3xl"}`}
                      style={{ fontSize: teamNameFontSize }}
                    >
                      {teamState.name} {isWinner && <span title="Vencedor" className="inline-block align-middle ml-2 text-amber-400 text-2xl">🏆</span>}
                    </h2>
                  </div>
                )}

                <div className={`mt-8 flex flex-1 items-center justify-center ${isFullscreen ? "py-12 sm:py-16" : "py-10"}`}>
                  <span className={`${scoreClass} font-black tabular-nums leading-none`} style={{ color: safeTheme.cardFontColor, fontSize: viewScoreFontSize }}>
                    {teamState.points}
                  </span>
                </div>

                {safeTheme.showSetDots && (
                  <>
                    <div className="mt-6 flex flex-wrap justify-center gap-1">
                      {Array.from({ length: Math.ceil(state.config.totalSets / 2) }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-4 w-4 rounded-full border-2 ${i < teamState.sets ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-center" style={{ color: safeTheme.cardFontColor }}>
                      {teamState.sets} set{teamState.sets !== 1 ? "s" : ""} vencido{teamState.sets !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </section>
            );
          })}
        </div>

        {safeTheme.showSetSummary && (
          <div className="grid gap-4 landscape:grid-cols-2 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-2xl border border-white/10 p-5" style={{ backgroundColor: safeTheme.cardBackgroundColor, color: safeTheme.cardFontColor }}>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Set atual</p>
              <p className="mt-2 text-2xl font-semibold">{Math.min(state.currentSet + 1, state.config.totalSets)} de {state.config.totalSets}</p>
              <p className="mt-1 text-sm text-slate-300">Primeiro a {currentSetTarget} pontos com vantagem mínima de {state.config.minAdvantage}</p>
              <p className="mt-3 text-base text-slate-200">Melhor de {state.config.totalSets} sets. Vence quem chegar a {Math.ceil(state.config.totalSets / 2)} sets.</p>
              {state.winner && <p className="mt-4 text-xl font-bold text-emerald-300">{state.winner} venceu a partida</p>}
            </div>

            <div className="rounded-2xl border border-white/10 p-5" style={{ backgroundColor: safeTheme.cardBackgroundColor, color: safeTheme.cardFontColor }}>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Resumo</p>
              <p className="mt-2 text-lg font-semibold">{formatSetSummary(state)}</p>
              <p className="mt-2 text-sm text-slate-300">Atualizando em tempo real enquanto a sessão estiver aberta.</p>
            </div>
          </div>
        )}

        {state.history.length > 0 && (
          <div className="rounded-2xl border border-white/10 p-5" style={{ backgroundColor: safeTheme.cardBackgroundColor, color: safeTheme.cardFontColor }}>
            <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Histórico</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-400">
                    <th className="py-2 pr-4">Set</th>
                    <th className="py-2 pr-4">Placar</th>
                    <th className="py-2 pr-4">Vencedor</th>
                  </tr>
                </thead>
                <tbody>
                  {state.history.map((entry) => (
                    <tr key={entry.setNumber} className="border-b border-white/5 text-slate-200">
                      <td className="py-2 pr-4">{entry.setNumber}</td>
                      <td className="py-2 pr-4">{entry.teamAName} {entry.teamAScore} x {entry.teamBScore} {entry.teamBName}</td>
                      <td className="py-2 pr-4">{entry.winnerName}</td>
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
