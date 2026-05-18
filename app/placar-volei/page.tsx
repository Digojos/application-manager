"use client";

import { Suspense, useReducer, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  DEFAULT_SCOREBOARD_THEME,
  normalizeScoreboardState,
  normalizeScoreboardTheme,
  type ThemeConfig,
} from "@/lib/scoreboard";

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

const TEAM_NAME_SIZE_MIN = 20;
const TEAM_NAME_SIZE_MAX = 56;
const SCORE_SIZE_MIN = 64;
const SCORE_SIZE_MAX = 240;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface GameState {
  teamA: TeamState;
  teamB: TeamState;
  config: MatchConfig;
  display: ThemeConfig;
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
  | { type: "SWAP_POINT"; from: "A" | "B" }
  | { type: "FINISH_SET" }
  | { type: "RESET" }
  | { type: "SET_NAME"; team: "A" | "B"; name: string }
  | { type: "SET_CONFIG"; config: MatchConfig }
  | { type: "SET_THEME"; display: ThemeConfig }
  | { type: "HYDRATE"; state: GameState };

interface ScoreboardSessionResponse {
  id: string;
  title: string;
  state: GameState;
}

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
    display: DEFAULT_SCOREBOARD_THEME,
    currentSet: 0,
    history: [],
    winner: null,
  };
}

function gameReducer(state: GameState, action: Action): GameState {
  if (action.type === "HYDRATE") {
    return action.state;
  }

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

  if (action.type === "SET_THEME") {
    return {
      ...state,
      display: normalizeScoreboardTheme(action.display),
    };
  }

  if (action.type === "RESET") {
    return initialState(state.teamA.name, state.teamB.name, state.config);
  }

  if (action.type === "ADD_POINT") {
    if (state.winner) return state;

    const nextA =
      action.team === "A" ? { ...state.teamA, points: state.teamA.points + 1 } : { ...state.teamA };
    const nextB =
      action.team === "B" ? { ...state.teamB, points: state.teamB.points + 1 } : { ...state.teamB };

    return { ...state, teamA: nextA, teamB: nextB };
  }

  if (action.type === "FINISH_SET") {
    if (state.winner) return state;

    const target = getSetTarget(state.currentSet, state.config);
    const setsToWin = Math.ceil(state.config.totalSets / 2);
    const diffA = state.teamA.points - state.teamB.points;
    const setWinner: "A" | "B" | null =
      state.teamA.points >= target && diffA >= state.config.minAdvantage ? "A"
        : state.teamB.points >= target && -diffA >= state.config.minAdvantage ? "B"
          : null;

    if (!setWinner) return state;

    const setWinnerName = setWinner === "A" ? state.teamA.name : state.teamB.name;
    const historyEntry: SetHistoryEntry = {
      setNumber: state.currentSet + 1,
      teamAName: state.teamA.name,
      teamBName: state.teamB.name,
      teamAScore: state.teamA.points,
      teamBScore: state.teamB.points,
      winnerName: setWinnerName,
    };
    const updatedA = { ...state.teamA, points: 0, sets: state.teamA.sets + (setWinner === "A" ? 1 : 0) };
    const updatedB = { ...state.teamB, points: 0, sets: state.teamB.sets + (setWinner === "B" ? 1 : 0) };
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

  if (action.type === "REMOVE_POINT") {
    if (state.winner) return state;

    const nextA =
      action.team === "A" ? { ...state.teamA, points: Math.max(0, state.teamA.points - 1) } : { ...state.teamA };
    const nextB =
      action.team === "B" ? { ...state.teamB, points: Math.max(0, state.teamB.points - 1) } : { ...state.teamB };

    return { ...state, teamA: nextA, teamB: nextB };
  }

  if (action.type === "SWAP_POINT") {
    if (state.winner) return state;
    if (action.from === "A" && state.teamA.points === 0) return state;
    if (action.from === "B" && state.teamB.points === 0) return state;

    const nextA = action.from === "A"
      ? { ...state.teamA, points: state.teamA.points - 1 }
      : { ...state.teamA, points: state.teamA.points + 1 };
    const nextB = action.from === "B"
      ? { ...state.teamB, points: state.teamB.points - 1 }
      : { ...state.teamB, points: state.teamB.points + 1 };

    return { ...state, teamA: nextA, teamB: nextB };
  }
  return state;
}

function PlacarVoleiContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialState());
  const { teamA, teamB, config, currentSet, history, winner } = state;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isSyncingSession, setIsSyncingSession] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const [editingName, setEditingName] = useReducerSafe<"A" | "B" | null>(null);
  const [nameInput, setNameInput] = useReducerSafe("");

  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      setSessionError(null);
      return;
    }

    let active = true;

    const loadSession = async () => {
      try {
        const response = await fetch(`/api/scoreboard-sessions/${sessionId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Falha ao carregar a sessão");
        }

        const session = (await response.json()) as ScoreboardSessionResponse;
        if (!active) return;

        dispatch({ type: "HYDRATE", state: normalizeScoreboardState(session.state) as GameState });
        setSessionTitle(session.title);
        setSessionError(null);
      } catch {
        if (active) {
          setSessionError("Não foi possível carregar esta sessão.");
        }
      }
    };

    loadSession();

    return () => {
      active = false;
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

  const persistSessionAction = useCallback(
    async (action: Action) => {
      if (!sessionId || action.type === "HYDRATE") return;

      setIsSyncingSession(true);
      setSessionError(null);

      try {
        const response = await fetch(`/api/scoreboard-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Não foi possível sincronizar a sessão");
        }

        const session = (await response.json()) as ScoreboardSessionResponse;
        dispatch({ type: "HYDRATE", state: normalizeScoreboardState(session.state) as GameState });
        setSessionTitle(session.title);
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : "Não foi possível sincronizar a sessão");
      } finally {
        setIsSyncingSession(false);
      }
    },
    [sessionId],
  );

  const applyAction = useCallback(
    (action: Action) => {
      dispatch(action);
      void persistSessionAction(action);
    },
    [persistSessionAction],
  );

  const addPoint = useCallback((team: "A" | "B") => {
    applyAction({ type: "ADD_POINT", team });
  }, [applyAction]);

  const removePoint = useCallback((team: "A" | "B") => {
    applyAction({ type: "REMOVE_POINT", team });
  }, [applyAction]);

  const swapPoint = useCallback((team: "A" | "B") => {
    applyAction({ type: "SWAP_POINT", from: team });
  }, [applyAction]);

  function reset() {
    applyAction({ type: "RESET" });
  }

  function startEditName(team: "A" | "B") {
    setEditingName(team);
    setNameInput(team === "A" ? teamA.name : teamB.name);
  }

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || !editingName) return;
    applyAction({ type: "SET_NAME", team: editingName, name: trimmed });
    setEditingName(null);
  }

  function restoreDefaultSettings() {
    applyAction({ type: "SET_CONFIG", config: DEFAULT_CONFIG });
  }

  function updateConfig(patch: Partial<MatchConfig>) {
    applyAction({ type: "SET_CONFIG", config: { ...config, ...patch } });
  }

  const safeTheme = normalizeScoreboardTheme(state.display);
  // Estado local para sliders de tamanho de fonte
  const [teamNameSizeSlider, setTeamNameSizeSlider] = useState(safeTheme.teamNameSize);
  const [scoreSizeSlider, setScoreSizeSlider] = useState(safeTheme.scoreSize);

  useEffect(() => {
    setTeamNameSizeSlider(safeTheme.teamNameSize);
  }, [safeTheme.teamNameSize]);

  useEffect(() => {
    setScoreSizeSlider(safeTheme.scoreSize);
  }, [safeTheme.scoreSize]);

  function updateTeamNameSizeSlider(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setTeamNameSizeSlider(parsed);
  }

  function commitTeamNameSize() {
    if (teamNameSizeSlider !== safeTheme.teamNameSize) {
      applyAction({ type: "SET_THEME", display: { ...safeTheme, teamNameSize: teamNameSizeSlider } });
    }
  }

  function updateScoreSizeSlider(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    setScoreSizeSlider(parsed);
  }

  function commitScoreSize() {
    if (scoreSizeSlider !== safeTheme.scoreSize) {
      applyAction({ type: "SET_THEME", display: { ...safeTheme, scoreSize: scoreSizeSlider } });
    }
  }

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore unsupported browsers or blocked fullscreen requests.
    }
  }, []);

  const setTarget = getSetTarget(currentSet, config);
  const setsToWin = Math.ceil(config.totalSets / 2);
  const setWonByA = teamA.points >= setTarget && (teamA.points - teamB.points) >= config.minAdvantage;
  const setWonByB = teamB.points >= setTarget && (teamB.points - teamA.points) >= config.minAdvantage;
  const currentSetWinner = setWonByA ? teamA.name : setWonByB ? teamB.name : null;
  const setsRemainingA = Math.max(0, setsToWin - teamA.sets);
  const setsRemainingB = Math.max(0, setsToWin - teamB.sets);
  const shellClass = isFullscreen
    ? "w-full min-h-screen px-3 py-3 sm:px-6 sm:py-6 flex flex-col"
    : "max-w-6xl mx-auto px-4 py-6";
  // safeTheme já está definido acima
  const pointsClass = "font-bold tabular-nums leading-none";
  const cardPaddingClass = isFullscreen ? "p-4 sm:p-6 md:p-8" : "p-5 md:p-6";
  const pointButtonSizeClass = isFullscreen ? "h-14 w-14 text-2xl" : "h-10 w-10 text-base";
  const teamNameFontSize = `clamp(${TEAM_NAME_SIZE_MIN}px, 9vw, ${safeTheme.teamNameSize}px)`;
  const scoreFontSize = `clamp(3.5rem, 24vw, ${safeTheme.scoreSize}px)`;
  const activeSessionLabel = sessionTitle ?? sessionId;

  const buildViewUrl = useCallback(() => {
    if (!sessionId) return null;
    if (typeof window === "undefined") return `/placar-volei/view/${sessionId}`;
    return `${window.location.origin}/placar-volei/view/${sessionId}`;
  }, [sessionId]);

  const copyViewUrl = useCallback(async () => {
    const viewUrl = buildViewUrl();
    if (!viewUrl) return;

    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 2500);
    }
  }, [buildViewUrl]);

  useEffect(() => {
    if (!sessionId) {
      setIsQrOpen(false);
      setQrCodeDataUrl(null);
      setQrStatus("idle");
      return;
    }

    if (!isQrOpen) return;

    let active = true;

    const generateQrCode = async () => {
      const viewUrl = buildViewUrl();
      if (!viewUrl) return;

      setQrStatus("loading");
      try {
        const dataUrl = await QRCode.toDataURL(viewUrl, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (!active) return;
        setQrCodeDataUrl(dataUrl);
        setQrStatus("ready");
      } catch {
        if (!active) return;
        setQrCodeDataUrl(null);
        setQrStatus("error");
      }
    };

    void generateQrCode();

    return () => {
      active = false;
    };
  }, [buildViewUrl, isQrOpen, sessionId]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();

      switch (key) {
        case "e":
          if (!winner && !setWonByA && !setWonByB) addPoint("A");
          break;
        case "w":
          event.preventDefault();
          swapPoint("A");
          break;
        case "q":
          event.preventDefault();
          removePoint("A");
          break;
        case "d":
          event.preventDefault();
          if (!winner && !setWonByA && !setWonByB) addPoint("B");
          break;
        case "s":
          event.preventDefault();
          swapPoint("B");
          break;
        case "a":
          event.preventDefault();
          removePoint("B");
          break;
        case "p":
          event.preventDefault();
          reset();
          break;
        case "f":
          event.preventDefault();
          void toggleFullscreen();
          break;
        case "enter":
          event.preventDefault();
          if (currentSetWinner && !winner) applyAction({ type: "FINISH_SET" });
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addPoint, removePoint, swapPoint, applyAction, toggleFullscreen, winner, setWonByA, setWonByB, currentSetWinner]);

  return (
    <div ref={pageRef} className={shellClass}>
      {!isFullscreen && (
        <>
          {sessionId && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Sessão ativa</p>
                  <p className="mt-1 text-xs text-emerald-800">{activeSessionLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/placar-volei/view/${sessionId}`} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
                    Abrir visualização
                  </Link>
                  <button
                    type="button"
                    onClick={copyViewUrl}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
                    title="Copiar URL da visualização"
                    aria-label="Copiar URL da visualização"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copiar URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
                    title="Mostrar QR Code da visualização"
                    aria-label="Mostrar QR Code da visualização"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                      <path d="M4 4h6v6H4z" />
                      <path d="M14 4h6v6h-6z" />
                      <path d="M4 14h6v6H4z" />
                      <path d="M16 14v2" />
                      <path d="M20 14v6" />
                      <path d="M14 20h2" />
                      <path d="M18 20h2" />
                      <path d="M14 16h2" />
                    </svg>
                    {isQrOpen ? "Ocultar QR" : "QR Code"}
                  </button>
                  <Link href="/placar-volei/sessoes" className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors">
                    Sessões
                  </Link>
                </div>
              </div>
            
              {copyStatus === "copied" && <p className="mt-1 text-xs text-emerald-700">URL da visualização copiada.</p>}
              {copyStatus === "error" && <p className="mt-1 text-xs text-rose-700">Não foi possível copiar automaticamente.</p>}
              {isQrOpen && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                  <p className="text-xs font-semibold text-emerald-900">QR Code da visualização</p>
                  <p className="mt-1 text-xs text-emerald-800">Escaneie para abrir a tela de view desta sessão.</p>
                  <div className="mt-2 flex aspect-square w-full max-w-60 items-center justify-center rounded-md border border-emerald-200 bg-white p-2">
                    {qrStatus === "loading" && <span className="text-xs text-emerald-800">Gerando QR Code...</span>}
                    {qrStatus === "error" && <span className="text-xs text-rose-700">Não foi possível gerar o QR Code.</span>}
                    {qrCodeDataUrl && qrStatus === "ready" && (
                      <img src={qrCodeDataUrl} alt="QR Code da visualização da sessão" className="h-auto w-full max-w-56" />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {!sessionId && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
              Use uma sessão compartilhada em <Link href="/placar-volei/sessoes" className="font-semibold text-indigo-600 hover:text-indigo-700">/placar-volei/sessoes</Link> ou abra esta tela com `?sessionId=`.
            </div>
          )}
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-6 sm:flex-row">
            <div className="w-full min-w-0 sm:min-w-55">
              <h1 className="text-2xl sm:text-3xl font-bold">Placar de Volei</h1>
              <p className="text-sm mt-1 opacity-80">
                Set {Math.min(currentSet + 1, config.totalSets)} de {config.totalSets} · primeiro a {setTarget} pontos
                com vantagem de {config.minAdvantage}
              </p>
              <p className="text-xs mt-1 opacity-70">Melhor de {config.totalSets} sets (vence quem fizer {setsToWin})</p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                  min={0}
                  max={10}
                  value={config.minAdvantage}
                  onChange={(e) =>
                    updateConfig({ minAdvantage: Number(e.target.value) })
                  }
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="text-xs text-gray-600 flex items-center gap-2 sm:pt-6 xl:pt-0 xl:items-end">
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
                  onChange={(e) => applyAction({ type: "SET_THEME", display: { ...safeTheme, cardBackgroundColor: e.target.value } })}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white p-1"
                />
              </label>

              <label className="text-xs text-gray-600 flex flex-col gap-1">
                Cor da fonte do card
                <input
                  type="color"
                  value={safeTheme.cardFontColor}
                  onChange={(e) => applyAction({ type: "SET_THEME", display: { ...safeTheme, cardFontColor: e.target.value } })}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white p-1"
                />
              </label>

              <label className="text-xs text-gray-600 flex flex-col gap-1">
                Fonte nome ({TEAM_NAME_SIZE_MIN}-{TEAM_NAME_SIZE_MAX}px)
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={TEAM_NAME_SIZE_MIN}
                    max={TEAM_NAME_SIZE_MAX}
                    value={teamNameSizeSlider}
                    onChange={(e) => updateTeamNameSizeSlider(e.target.value)}
                    onMouseUp={commitTeamNameSize}
                    onTouchEnd={commitTeamNameSize}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="w-10 text-right tabular-nums">{teamNameSizeSlider}px</span>
                </div>
              </label>

              <label className="text-xs text-gray-600 flex flex-col gap-1">
                Fonte placar ({SCORE_SIZE_MIN}-{SCORE_SIZE_MAX}px)
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={SCORE_SIZE_MIN}
                    max={SCORE_SIZE_MAX}
                    value={scoreSizeSlider}
                    onChange={(e) => updateScoreSizeSlider(e.target.value)}
                    onMouseUp={commitScoreSize}
                    onTouchEnd={commitScoreSize}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="w-14 text-right tabular-nums">{scoreSizeSlider}px</span>
                </div>
              </label>

              <label className="text-xs text-gray-600 flex items-center gap-2 sm:pt-6 xl:pt-0 xl:items-end">
                <input
                  type="checkbox"
                  checked={safeTheme.showTeamNames}
                  onChange={(e) => applyAction({ type: "SET_THEME", display: { ...safeTheme, showTeamNames: e.target.checked } })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Mostrar nome dos times na view
              </label>

              <label className="text-xs text-gray-600 flex items-center gap-2 sm:pt-6 xl:pt-0 xl:items-end">
                <input
                  type="checkbox"
                  checked={safeTheme.showSetDots}
                  onChange={(e) => applyAction({ type: "SET_THEME", display: { ...safeTheme, showSetDots: e.target.checked } })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Mostrar info dos sets na view
              </label>

              <label className="text-xs text-gray-600 flex items-center gap-2 sm:pt-6 xl:pt-0 xl:items-end">
                <input
                  type="checkbox"
                  checked={safeTheme.showSetSummary}
                  onChange={(e) => applyAction({ type: "SET_THEME", display: { ...safeTheme, showSetSummary: e.target.checked } })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Mostrar resumo dos sets na view
              </label>
            </div>

            <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-900">
              <p className="font-semibold">Como os sets sao gerenciados</p>
              <p className="mt-1">
                Ao atingir {setTarget} pontos com vantagem minima de {config.minAdvantage}, o botao "Finalizar set" aparece abaixo do placar.
                Clique nele para registrar o resultado no historico e iniciar o proximo set.
              </p>
              <p className="mt-1">
                Em melhor de {config.totalSets}, vence quem fizer {setsToWin} sets. Falta(m): {setsRemainingA} para {teamA.name} e {setsRemainingB} para {teamB.name}.
              </p>
              <p className="mt-1">O placar final de cada set fica registrado no historico abaixo.</p>
              <p className="mt-1 font-medium">As alteracoes acima sao aplicadas imediatamente.</p>
            </div>

            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
              <p className="font-semibold text-gray-800">Atalhos de teclado</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">E</span> - adicionar 1 ponto ao Time A
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">W</span> - mover 1 ponto do Time A para o outro time
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">Q</span> - remover 1 ponto do Time A
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">D</span> - adicionar 1 ponto ao Time B
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">S</span> - mover 1 ponto do Time B para o outro time
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">A</span> - remover 1 ponto do Time B
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2 sm:col-span-2 lg:col-span-1">
                  <span className="font-semibold">P</span> - reiniciar todos os pontos e sets
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">F</span> - alternar fullscreen
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2">
                  <span className="font-semibold">Enter</span> - finalizar set (quando disponível)
                </div>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Os atalhos sao ignorados enquanto voce estiver digitando em campos de texto, selecao ou edicao de nomes.
              </p>
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
                onClick={() => applyAction({ type: "SET_THEME", display: DEFAULT_SCOREBOARD_THEME })}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Restaurar cores
              </button>
            </div>
          </div>
        </>
      )}

      {!isFullscreen && winner && (
        <div className="mb-4 sm:mb-6 rounded-xl bg-white px-6 py-5 text-center text-black font-bold shadow-lg">
          <p className="text-xl sm:text-2xl">{winner} venceu a partida</p>
          <button
            onClick={reset}
            className="mt-3 rounded-lg bg-white text-black px-8 py-3 text-base font-bold border border-gray-300 shadow hover:bg-indigo-50 transition-colors"
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
                    maxLength={35}
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
                  className="w-full wrap-break-word text-center text-xl font-bold hover:text-indigo-600 transition-colors sm:text-2xl"
                  style={{ fontSize: teamNameFontSize }}
                  title="Clique para editar o nome"
                >
                  {teamState.name}
                </button>
              )}

              <div className="w-full flex-1 flex items-center justify-center">
                <div className={pointsClass} style={{ color: safeTheme.cardFontColor, fontSize: scoreFontSize }}>
                  {teamState.points}
                </div>
              </div>

              <div className="w-full flex flex-col items-center gap-2">
                <div className="flex flex-wrap justify-center gap-1">
                  {Array.from({ length: setsToWin }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-4 h-4 rounded-full border-2 ${i < teamState.sets ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  {teamState.sets} set{teamState.sets !== 1 ? "s" : ""} vencido{teamState.sets !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="mt-auto flex w-full flex-wrap items-end justify-center gap-3 pt-6 sm:gap-6 sm:pt-8">
                <button
                  onClick={() => removePoint(team)}
                  disabled={!!winner || teamState.points === 0}
                  aria-label={`Remover 1 ponto do ${teamState.name}`}
                  className={`${pointButtonSizeClass} rounded-lg border border-gray-300 font-bold text-gray-700 hover:bg-gray-50 active:scale-95 disabled:opacity-40 transition-all`}
                >
                  -1
                </button>
                <button
                  onClick={() => swapPoint(team)}
                  disabled={!!winner || teamState.points === 0}
                  aria-label={`Transferir 1 ponto de ${teamState.name} para o outro time`}
                  title={`Mover ponto de ${teamState.name} para o outro time`}
                  className={`${pointButtonSizeClass} rounded-lg border border-amber-400 text-amber-600 font-bold hover:bg-amber-50 active:scale-95 disabled:opacity-40 transition-all`}
                  style={{ color: safeTheme.cardFontColor, borderColor: safeTheme.cardFontColor }}
                >
                  ⇄
                </button>

                <button
                  onClick={() => addPoint(team)}
                  disabled={!!winner || setWonByA || setWonByB}
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

      {!isFullscreen && currentSetWinner && !winner && (
        <div className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-indigo-800">
            {currentSetWinner} venceu o set {currentSet + 1}!
          </p>
          <button
            type="button"
            onClick={() => applyAction({ type: "FINISH_SET" })}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shrink-0 sm:w-auto"
          >
            Finalizar set
          </button>
        </div>
      )}

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

export default function PlacarVolei() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-6 text-sm text-gray-600">Carregando placar...</div>}>
      <PlacarVoleiContent />
    </Suspense>
  );
}

// Lightweight useState replacement using useReducer to avoid hook-in-hook issues
function useReducerSafe<T>(initial: T): [T, (v: T) => void] {
  const [val, dispatch] = useReducer((_: T, next: T) => next, initial);
  const set = useCallback((v: T) => dispatch(v), []);
  return [val, set];
}
