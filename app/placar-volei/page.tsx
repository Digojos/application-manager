"use client";

import { useReducer, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const DEFAULT_CONFIG: MatchConfig = {
  totalSets: 3,
  pointsPerSet: 25,
  tieBreakPoints: 15,
  minAdvantage: 2,
  useTieBreak: true,
};

interface TeamState {
  name: string;
  points: number;
  sets: number;
}

interface MatchConfig {
  totalSets: number;
  pointsPerSet: number;
  tieBreakPoints: number;
  minAdvantage: number;
  useTieBreak: boolean;
}

interface ThemeConfig {
  cardBackgroundColor: string;
  cardFontColor: string;
  teamNameSize: number;
  scoreSize: number;
}

const DEFAULT_THEME: ThemeConfig = {
  cardBackgroundColor: "#ffffff",
  cardFontColor: "#111827",
  teamNameSize: 36,
  scoreSize: 120,
};

const TEAM_NAME_SIZE_MIN = 20;
const TEAM_NAME_SIZE_MAX = 56;
const SCORE_SIZE_MIN = 64;
const SCORE_SIZE_MAX = 240;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTheme(theme: ThemeConfig): ThemeConfig {
  return {
    cardBackgroundColor: theme.cardBackgroundColor,
    cardFontColor: theme.cardFontColor,
    teamNameSize: clamp(theme.teamNameSize, TEAM_NAME_SIZE_MIN, TEAM_NAME_SIZE_MAX),
    scoreSize: clamp(theme.scoreSize, SCORE_SIZE_MIN, SCORE_SIZE_MAX),
  };
}

interface GameState {
  teamA: TeamState;
  teamB: TeamState;
  config: MatchConfig;
  currentSet: number;
  history: SetHistoryEntry[];
  winner: string | null;
}

interface SetHistoryEntry {
  setNumber: number;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  winnerName: string;
}

type Action =
  | { type: "ADD_POINT"; team: "A" | "B" }
  | { type: "REMOVE_POINT"; team: "A" | "B" }
  | { type: "RESET" }
  | { type: "SET_NAME"; team: "A" | "B"; name: string }
  | { type: "SET_CONFIG"; config: MatchConfig };

function normalizeConfig(config: MatchConfig): MatchConfig {
  const sanitizedSets = Math.max(1, Math.min(9, config.totalSets));
  const oddSets = sanitizedSets % 2 === 0 ? sanitizedSets + 1 : sanitizedSets;

  return {
    totalSets: Math.max(1, Math.min(9, oddSets)),
    pointsPerSet: Math.max(1, Math.min(99, config.pointsPerSet)),
    tieBreakPoints: Math.max(1, Math.min(99, config.tieBreakPoints)),
    minAdvantage: Math.max(1, Math.min(10, config.minAdvantage)),
    useTieBreak: config.useTieBreak,
  };
}

function getSetTarget(setIndex: number, config: MatchConfig) {
  const isLastSet = setIndex === config.totalSets - 1;
  return config.useTieBreak && isLastSet ? config.tieBreakPoints : config.pointsPerSet;
}

function resolveMatchWinner(
  teamA: TeamState,
  teamB: TeamState,
  setsToWin: number,
  lastSetWinner: "A" | "B" | null,
) {
  const aReached = teamA.sets >= setsToWin;
  const bReached = teamB.sets >= setsToWin;

  if (aReached && bReached && lastSetWinner) {
    return lastSetWinner === "A" ? teamA.name : teamB.name;
  }

  if (aReached) return teamA.name;
  if (bReached) return teamB.name;
  return null;
}

function initialState(nameA = "Time A", nameB = "Time B", config: MatchConfig = DEFAULT_CONFIG): GameState {
  const safeConfig = normalizeConfig(config);
  return {
    teamA: { name: nameA, points: 0, sets: 0 },
    teamB: { name: nameB, points: 0, sets: 0 },
    config: safeConfig,
    currentSet: 0,
    history: [],
    winner: null,
  };
}

function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "SET_NAME") {
    if (action.team === "A") return { ...state, teamA: { ...state.teamA, name: action.name } };
    return { ...state, teamB: { ...state.teamB, name: action.name } };
  }

  if (action.type === "SET_CONFIG") {
    const nextConfig = normalizeConfig(action.config);
    const nextCurrentSet = Math.min(state.currentSet, nextConfig.totalSets - 1);
    const setsToWin = Math.ceil(nextConfig.totalSets / 2);
    const nextWinner = resolveMatchWinner(state.teamA, state.teamB, setsToWin, null);

    return {
      ...state,
      config: nextConfig,
      currentSet: nextCurrentSet,
      winner: nextWinner,
    };
  }

  if (action.type === "RESET") {
    return initialState(state.teamA.name, state.teamB.name, state.config);
  }

  if (action.type === "ADD_POINT") {
    if (state.winner) return state;

    const setsToWin = Math.ceil(state.config.totalSets / 2);
    const nextA =
      action.team === "A" ? { ...state.teamA, points: state.teamA.points + 1 } : { ...state.teamA };
    const nextB =
      action.team === "B" ? { ...state.teamB, points: state.teamB.points + 1 } : { ...state.teamB };

    const target = getSetTarget(state.currentSet, state.config);
    const diff = Math.abs(nextA.points - nextB.points);
    const reachedTarget = nextA.points >= target || nextB.points >= target;
    const hasMinAdvantage = diff >= state.config.minAdvantage;
    const setWinner: "A" | "B" | null =
      reachedTarget && hasMinAdvantage ? (nextA.points > nextB.points ? "A" : "B") : null;

    if (setWinner) {
      const setWinnerName = setWinner === "A" ? nextA.name : nextB.name;
      const historyEntry: SetHistoryEntry = {
        setNumber: state.currentSet + 1,
        teamAName: nextA.name,
        teamBName: nextB.name,
        teamAScore: nextA.points,
        teamBScore: nextB.points,
        winnerName: setWinnerName,
      };
      const updatedA = { ...nextA, points: 0, sets: nextA.sets + (setWinner === "A" ? 1 : 0) };
      const updatedB = { ...nextB, points: 0, sets: nextB.sets + (setWinner === "B" ? 1 : 0) };
      const matchWinner = resolveMatchWinner(updatedA, updatedB, setsToWin, setWinner);

      return {
        ...state,
        teamA: updatedA,
        teamB: updatedB,
        currentSet: matchWinner ? state.currentSet : Math.min(state.currentSet + 1, state.config.totalSets - 1),
        history: [historyEntry, ...state.history],
        winner: matchWinner,
      };
    }

    return { ...state, teamA: nextA, teamB: nextB };
  }

  if (action.type === "REMOVE_POINT") {
    if (state.winner) return state;

    const nextA =
      action.team === "A" ? { ...state.teamA, points: Math.max(0, state.teamA.points - 1) } : { ...state.teamA };
    const nextB =
      action.team === "B" ? { ...state.teamB, points: Math.max(0, state.teamB.points - 1) } : { ...state.teamB };

    return { ...state, teamA: nextA, teamB: nextB };
  }

  return state;
}

export default function PlacarVolei() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialState());
  const { teamA, teamB, config, currentSet, history, winner } = state;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);

  const [editingName, setEditingName] = useReducerSafe<"A" | "B" | null>(null);
  const [nameInput, setNameInput] = useReducerSafe("");

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

  function addPoint(team: "A" | "B") {
    dispatch({ type: "ADD_POINT", team });
  }

  function removePoint(team: "A" | "B") {
    dispatch({ type: "REMOVE_POINT", team });
  }

  function reset() {
    dispatch({ type: "RESET" });
  }

  function startEditName(team: "A" | "B") {
    setEditingName(team);
    setNameInput(team === "A" ? teamA.name : teamB.name);
  }

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || !editingName) return;
    dispatch({ type: "SET_NAME", team: editingName, name: trimmed });
    setEditingName(null);
  }

  function restoreDefaultSettings() {
    dispatch({ type: "SET_CONFIG", config: DEFAULT_CONFIG });
  }

  function updateConfig(patch: Partial<MatchConfig>) {
    dispatch({ type: "SET_CONFIG", config: { ...config, ...patch } });
  }

  function updateTeamNameSize(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setTheme((prev) => normalizeTheme({ ...prev, teamNameSize: parsed }));
  }

  function updateScoreSize(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setTheme((prev) => normalizeTheme({ ...prev, scoreSize: parsed }));
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore unsupported browsers or blocked fullscreen requests.
    }
  }

  const setTarget = getSetTarget(currentSet, config);
  const setsToWin = Math.ceil(config.totalSets / 2);
  const setsRemainingA = Math.max(0, setsToWin - teamA.sets);
  const setsRemainingB = Math.max(0, setsToWin - teamB.sets);
  const shellClass = isFullscreen
    ? "w-full min-h-screen px-3 py-3 sm:px-6 sm:py-6 flex flex-col"
    : "max-w-6xl mx-auto px-4 py-6";
  const safeTheme = normalizeTheme(theme);
  const pointsClass = "font-bold tabular-nums leading-none";
  const cardPaddingClass = isFullscreen ? "p-4 sm:p-6 md:p-8" : "p-5 md:p-6";
  const pointButtonSizeClass = isFullscreen ? "h-14 w-14 text-2xl" : "h-10 w-10 text-base";

  return (
    <div ref={pageRef} className={shellClass}>
      {!isFullscreen && (
        <>
          <div className="mb-4 sm:mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[220px]">
              <h1 className="text-2xl sm:text-3xl font-bold">Placar de Volei</h1>
              <p className="text-sm mt-1 opacity-80">
                Set {Math.min(currentSet + 1, config.totalSets)} de {config.totalSets} · primeiro a {setTarget} pontos
                com vantagem de {config.minAdvantage}
              </p>
              <p className="text-xs mt-1 opacity-70">Melhor de {config.totalSets} sets (vence quem fizer {setsToWin})</p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Entrar em fullscreen
              </button>
              <Link href="/" className="text-xs sm:text-sm text-gray-500 hover:text-indigo-600 transition-colors">
                ← Voltar
              </Link>
            </div>
          </div>

          <div className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5" style={{ color: "#111827" }}>
            <h2 className="text-sm sm:text-base font-semibold text-gray-800 mb-3">Configuracoes da partida</h2>
            <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
          <label className="text-xs text-gray-600 flex flex-col gap-1">
            Total de sets (impar)
            <select
              value={config.totalSets}
              onChange={(e) =>
                updateConfig({ totalSets: Number(e.target.value) })
              }
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {[1, 3, 5, 7, 9].map((setCount) => (
                <option key={setCount} value={setCount}>
                  {setCount}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 flex flex-col gap-1">
            Pontos por set
            <input
              type="number"
              min={1}
              max={99}
              value={config.pointsPerSet}
              onChange={(e) =>
                updateConfig({ pointsPerSet: Number(e.target.value) })
              }
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="text-xs text-gray-600 flex flex-col gap-1">
            Pontos do tie-break
            <input
              type="number"
              min={1}
              max={99}
              value={config.tieBreakPoints}
              onChange={(e) =>
                updateConfig({ tieBreakPoints: Number(e.target.value) })
              }
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={!config.useTieBreak}
            />
          </label>

          <label className="text-xs text-gray-600 flex flex-col gap-1">
            Vantagem minima
            <input
              type="number"
              min={1}
              max={10}
              value={config.minAdvantage}
              onChange={(e) =>
                updateConfig({ minAdvantage: Number(e.target.value) })
              }
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="text-xs text-gray-600 flex items-center gap-2 pt-6 lg:pt-0 lg:items-end">
            <input
              type="checkbox"
              checked={config.useTieBreak}
              onChange={(e) =>
                updateConfig({ useTieBreak: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Usar tie-break no ultimo set
          </label>
            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Cor do card
              <input
                type="color"
                value={safeTheme.cardBackgroundColor}
                onChange={(e) =>
                  setTheme((prev) => normalizeTheme({ ...prev, cardBackgroundColor: e.target.value }))
                }
                className="h-10 w-full rounded-lg border border-gray-300 bg-white p-1"
              />
            </label>

            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Cor da fonte do card
              <input
                type="color"
                value={safeTheme.cardFontColor}
                onChange={(e) =>
                  setTheme((prev) => normalizeTheme({ ...prev, cardFontColor: e.target.value }))
                }
                className="h-10 w-full rounded-lg border border-gray-300 bg-white p-1"
              />
            </label>

            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Fonte nome ({TEAM_NAME_SIZE_MIN}-{TEAM_NAME_SIZE_MAX}px)
              <input
                type="number"
                min={TEAM_NAME_SIZE_MIN}
                max={TEAM_NAME_SIZE_MAX}
                value={safeTheme.teamNameSize}
                onChange={(e) => updateTeamNameSize(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <label className="text-xs text-gray-600 flex flex-col gap-1">
              Fonte placar ({SCORE_SIZE_MIN}-{SCORE_SIZE_MAX}px)
              <input
                type="number"
                min={SCORE_SIZE_MIN}
                max={SCORE_SIZE_MAX}
                value={safeTheme.scoreSize}
                onChange={(e) => updateScoreSize(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>

          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-900">
            <p className="font-semibold">Como os sets sao gerenciados</p>
            <p className="mt-1">
              O placar controla os sets automaticamente: ao atingir {setTarget} pontos com vantagem minima de {config.minAdvantage},
              o set e fechado e os pontos voltam para 0 para iniciar o proximo set.
            </p>
            <p className="mt-1">
              Em melhor de {config.totalSets}, vence quem fizer {setsToWin} sets. Falta(m): {setsRemainingA} para {teamA.name} e {setsRemainingB} para {teamB.name}.
            </p>
            <p className="mt-1">O placar final de cada set fica registrado no historico abaixo.</p>
            <p className="mt-1 font-medium">As alteracoes acima sao aplicadas imediatamente.</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restoreDefaultSettings}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Restaurar padrao
            </button>
            <button
              type="button"
              onClick={() => setTheme(DEFAULT_THEME)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Restaurar cores
            </button>
          </div>
        </div>
        </>
      )}

      {!isFullscreen && winner && (
        <div className="mb-4 sm:mb-6 rounded-xl bg-indigo-600 px-6 py-5 text-center text-white shadow-lg">
          <p className="text-xl sm:text-2xl font-bold">{winner} venceu a partida</p>
          <button
            onClick={reset}
            className="mt-3 rounded-lg bg-white text-indigo-600 px-5 py-2 text-sm font-medium hover:bg-indigo-50 transition-colors"
          >
            Nova partida
          </button>
        </div>
      )}

      {!isFullscreen && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-sm" style={{ color: "#111827" }}>
          <p>
            Set atual: <strong>{Math.min(currentSet + 1, config.totalSets)}</strong> de <strong>{config.totalSets}</strong>.
            Sets: <strong>{teamA.name} {teamA.sets}</strong> x <strong>{teamB.sets}</strong>.
          </p>
        </div>
      )}

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 ${isFullscreen ? "flex-1" : "mb-6"}`}
      >
        {(["A", "B"] as const).map((team) => {
          const teamState = team === "A" ? teamA : teamB;
          return (
            <div
              key={team}
              className={`rounded-xl border border-gray-200 bg-white shadow-sm ${cardPaddingClass} flex flex-col items-center gap-4 sm:gap-5 ${isFullscreen ? "min-h-[38vh] sm:min-h-[70vh]" : ""}`}
              style={{
                backgroundColor: safeTheme.cardBackgroundColor,
                color: safeTheme.cardFontColor,
              }}
            >
              {editingName === team ? (
                <div className="flex gap-2 w-full">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                    maxLength={30}
                  />
                  <button
                    onClick={saveName}
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-xs text-white font-medium hover:bg-indigo-700"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => startEditName(team)}
                  className="text-xl sm:text-2xl font-bold hover:text-indigo-600 transition-colors"
                  style={{ fontSize: `${safeTheme.teamNameSize}px` }}
                  title="Clique para editar o nome"
                >
                  {teamState.name}
                </button>
              )}

              <div className="w-full flex-1 flex items-center justify-center">
                <div className={pointsClass} style={{ color: safeTheme.cardFontColor, fontSize: `${safeTheme.scoreSize}px` }}>
                  {teamState.points}
                </div>
              </div>

              {!isFullscreen && (
                <>
                  <div className="flex flex-wrap justify-center gap-1">
                    {Array.from({ length: setsToWin }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-full border-2 ${
                          i < teamState.sets ? "bg-indigo-500 border-indigo-500" : "border-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    {teamState.sets} set{teamState.sets !== 1 ? "s" : ""} vencido{teamState.sets !== 1 ? "s" : ""}
                  </p>
                </>
              )}

              <div className="w-full mt-auto pt-6 sm:pt-8 flex items-end justify-center gap-5 sm:gap-6">
                <button
                  onClick={() => removePoint(team)}
                  disabled={!!winner || teamState.points === 0}
                  aria-label={`Remover 1 ponto do ${teamState.name}`}
                  className={`${pointButtonSizeClass} rounded-lg border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-40 transition-all`}
                >
                  -1
                </button>
                <button
                  onClick={() => addPoint(team)}
                  disabled={!!winner}
                  aria-label={`Adicionar 1 ponto ao ${teamState.name}`}
                  className={`${pointButtonSizeClass} rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 active:scale-95 disabled:opacity-40 transition-all`}
                >
                  +1
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!isFullscreen && (
        <div className="flex gap-3 mb-4 sm:mb-6">
          <button
            onClick={reset}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm sm:text-base font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Reiniciar partida
          </button>
        </div>
      )}

      {!isFullscreen && history.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historico set a set</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Set</th>
                  <th className="py-2 pr-3">Placar</th>
                  <th className="py-2 pr-3">Vencedor</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.setNumber} className="border-b border-gray-100 text-gray-700">
                    <td className="py-2 pr-3">{entry.setNumber}</td>
                    <td className="py-2 pr-3">
                      {entry.teamAName} {entry.teamAScore} x {entry.teamBScore} {entry.teamBName}
                    </td>
                    <td className="py-2 pr-3">{entry.winnerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

// Lightweight useState replacement using useReducer to avoid hook-in-hook issues
function useReducerSafe<T>(initial: T): [T, (v: T) => void] {
  const [val, dispatch] = useReducer((_: T, next: T) => next, initial);
  const set = useCallback((v: T) => dispatch(v), []);
  return [val, set];
}
