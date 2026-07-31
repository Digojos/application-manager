"use client";

import { Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  DEFAULT_BASKETBALL_CONFIG,
  DEFAULT_BASKETBALL_DISPLAY,
  basketballReducer,
  createInitialBasketballState,
  formatGameClock,
  formatShotClock,
  isAtFoulLimit,
  normalizeBasketballState,
  periodLabel,
  timeoutAllowance,
  type BasketballAction,
  type BasketballDisplayConfig,
  type BasketballMatchConfig,
  type BasketballState,
  type TeamKey,
} from "@/lib/basketball";
import { useClockExpiry, useLiveClocks, useServerClock } from "./use-basketball-clock";
import { clearSavedBasketballPreferences, saveBasketballPreferences } from "./saved-preferences";

// ---------------------------------------------------------------------------
// Envelope local: mantém o reducer do React puro (§7.8 do plano) — "agora" só entra
// via `nowIso` capturado no handler, nunca via Date.now() dentro do reducer.
// ---------------------------------------------------------------------------

type ControlMessage =
  | { kind: "hydrate"; state: BasketballState }
  | { kind: "apply"; action: BasketballAction; nowIso: string };

function controlReducer(state: BasketballState, message: ControlMessage): BasketballState {
  if (message.kind === "hydrate") return message.state;
  return basketballReducer(state, message.action, message.nowIso);
}

interface SessionResponse {
  id: string;
  title: string;
  state: BasketballState;
  canUndo: boolean;
  serverNow: string;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function formatClockInput(ms: number) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function parseClockInput(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]?\d)$/.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return (minutes * 60 + seconds) * 1000;
}

function formatDeltaLabel(ms: number) {
  return ms >= 60_000 ? "1min" : `${ms / 1000}s`;
}

// Padrão anti-tremida (commits 24fb6bd/36e15c7): texto local espelhado, gate regex no
// onChange, clamp + commit só no blur. Reaproveitado nos 7 campos numéricos de config.
function useNumericField(value: number, commit: (n: number) => void, min: number, max: number) {
  const [prevValue, setPrevValue] = useState(value);
  const [text, setText] = useState(String(value));

  // Ajuste de estado durante o render (padrão oficial do React para "resync quando um
  // valor externo muda") em vez de useEffect — evita o round-trip extra de render.
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  const onChange = (raw: string) => {
    if (/^\d*$/.test(raw)) setText(raw);
  };

  const onBlur = () => {
    let n = parseInt(text, 10);
    if (!Number.isFinite(n)) n = min;
    n = Math.max(min, Math.min(max, n));
    setText(String(n));
    if (n !== value) commit(n);
  };

  return { text, onChange, onBlur };
}

// Mesma ideia para os sliders de tamanho: estado local, commit só ao soltar.
function useSliderField(value: number, commit: (n: number) => void) {
  const [prevValue, setPrevValue] = useState(value);
  const [slider, setSlider] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setSlider(value);
  }

  const onChange = (raw: string) => {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) setSlider(parsed);
  };

  const onCommit = () => {
    if (slider !== value) commit(slider);
  };

  return { slider, onChange, onCommit };
}

// O input mm:ss só é editável com o relógio parado (evita brigar com o tique); resync
// vem de state.gameClock.remainingMs (estável), não do valor tiquetaqueando.
function useClockTextField(remainingMs: number, commit: (ms: number) => void) {
  const [prevRemainingMs, setPrevRemainingMs] = useState(remainingMs);
  const [text, setText] = useState(formatClockInput(remainingMs));

  if (remainingMs !== prevRemainingMs) {
    setPrevRemainingMs(remainingMs);
    setText(formatClockInput(remainingMs));
  }

  const onChange = (raw: string) => {
    if (/^[0-9:]*$/.test(raw)) setText(raw);
  };

  const onBlur = () => {
    const parsed = parseClockInput(text);
    if (parsed === null) {
      setText(formatClockInput(remainingMs));
      return;
    }
    setText(formatClockInput(parsed));
    if (parsed !== remainingMs) commit(parsed);
  };

  return { text, onChange, onBlur };
}

const CONFIG_TOGGLES: Array<{ key: keyof BasketballMatchConfig; label: string }> = [
  { key: "useOvertime", label: "Usar prorrogação" },
  { key: "useFouls", label: "Usar faltas" },
  { key: "resetFoulsEachPeriod", label: "Zerar faltas a cada período" },
  { key: "useShotClock", label: "Usar cronômetro de posse (24s)" },
  { key: "autoStartShotClockWithGameClock", label: "Iniciar posse junto com o relógio" },
  { key: "resetShotClockOnScore", label: "Cesta reseta a posse de 24s" },
  { key: "flipPossessionOnScore", label: "Cesta inverte a posse" },
  { key: "pauseClocksOnFoul", label: "Falta pausa os cronômetros" },
  { key: "flipPossessionOnShotClockViolation", label: "Estourar a posse (24s) troca o time na hora" },
  { key: "resetShotClockOnPossessionChange", label: "Trocar a posse manualmente reseta a posse pros 24s" },
];

const DISPLAY_TOGGLES: Array<{ key: keyof BasketballDisplayConfig; label: string }> = [
  { key: "showTeamNames", label: "Nomes dos times na view" },
  { key: "showPeriod", label: "Período (view e controle)" },
  { key: "showGameClock", label: "Cronômetro de jogo na view" },
  { key: "showShotClock", label: "Cronômetro de posse na view" },
  { key: "showFouls", label: "Faltas (view e controle)" },
  { key: "showTimeouts", label: "Tempos técnicos (view e controle)" },
  { key: "showPossession", label: "Posse de bola (view e controle)" },
  { key: "showPeriodSummary", label: "Resumo por período (view e controle)" },
  { key: "showTenths", label: "Décimos de segundo" },
  { key: "soundAlertsEnabled", label: "Alarme sonoro na view (fim de período / estouro da posse)" },
];

const CLOCK_ADJUST_STEPS = [-60_000, -10_000, -1_000, 1_000, 10_000, 60_000];

function PlacarBasqueteContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [state, dispatch] = useReducer(controlReducer, undefined, () => createInitialBasketballState());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [editingName, setEditingName] = useState<TeamKey | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [savePrefsStatus, setSavePrefsStatus] = useState<"idle" | "saved">("idle");

  const { syncServerNow, nowMs } = useServerClock();

  const seqRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const inFlightRef = useRef(0);
  const lastActionRef = useRef<BasketballAction | null>(null);

  const { teamA, teamB, config, display, currentPeriod, possession, history, status, winner } = state;

  // --- carregamento inicial da sessão ---
  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      setSyncError(null);
      return;
    }

    let active = true;
    const seq = ++seqRef.current;

    const load = async () => {
      try {
        const response = await fetch(`/api/basketball-sessions/${sessionId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Falha ao carregar a sessão");

        const session = (await response.json()) as SessionResponse;
        if (!active || seq !== seqRef.current) return;

        syncServerNow(session.serverNow);
        dispatch({ kind: "hydrate", state: normalizeBasketballState(session.state) });
        setSessionTitle(session.title);
        setCanUndo(session.canUndo);
        setSyncError(null);
      } catch {
        if (active) setSyncError("Não foi possível carregar esta sessão.");
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [sessionId, syncServerNow]);

  // --- fullscreen ---
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await pageRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Ignora navegadores que bloqueiam fullscreen.
    }
  }, []);

  // --- persistência serializada (no máx. 1 PATCH em voo por sessão) ---
  const persistAction = useCallback(
    (action: BasketballAction) => {
      if (!sessionId) return;

      queueRef.current = queueRef.current.then(async () => {
        const seq = ++seqRef.current;
        inFlightRef.current += 1;
        setIsSyncing(true);

        try {
          const response = await fetch(`/api/basketball-sessions/${sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error ?? "Não foi possível sincronizar a sessão");
          }

          const session = (await response.json()) as SessionResponse;
          syncServerNow(session.serverNow);

          if (seq === seqRef.current) {
            dispatch({ kind: "hydrate", state: normalizeBasketballState(session.state) });
            setSessionTitle(session.title);
            setCanUndo(session.canUndo);
          }
          setSyncError(null);
        } catch (error) {
          lastActionRef.current = action;
          setSyncError(error instanceof Error ? error.message : "Não foi possível sincronizar a sessão");
        } finally {
          inFlightRef.current = Math.max(0, inFlightRef.current - 1);
          setIsSyncing(inFlightRef.current > 0);
        }
      });
    },
    [sessionId, syncServerNow],
  );

  // --- desfazer última ação: swap com o `previousState` guardado no servidor a cada
  // mutação (ver applyBasketballSessionAction) — não dá pra computar isso localmente, por
  // isso não passa por `applyAction`/dispatch otimista como as demais ações.
  const undoLastAction = useCallback(() => {
    if (!sessionId) return;

    queueRef.current = queueRef.current.then(async () => {
      const seq = ++seqRef.current;
      inFlightRef.current += 1;
      setIsSyncing(true);

      try {
        const response = await fetch(`/api/basketball-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: { type: "UNDO" } }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Não foi possível desfazer a última ação");
        }

        const session = (await response.json()) as SessionResponse;
        syncServerNow(session.serverNow);

        if (seq === seqRef.current) {
          dispatch({ kind: "hydrate", state: normalizeBasketballState(session.state) });
          setSessionTitle(session.title);
          setCanUndo(session.canUndo);
        }
        setSyncError(null);
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Não foi possível desfazer a última ação");
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        setIsSyncing(inFlightRef.current > 0);
      }
    });
  }, [sessionId, syncServerNow]);

  const applyAction = useCallback(
    (action: BasketballAction) => {
      const nowIso = new Date().toISOString();
      dispatch({ kind: "apply", action, nowIso });
      persistAction(action);
    },
    [persistAction],
  );

  const retryLastAction = useCallback(() => {
    if (lastActionRef.current) applyAction(lastActionRef.current);
  }, [applyAction]);

  // --- SSE: segundo controle (celular + notebook) fica em sincronia ---
  useEffect(() => {
    if (!sessionId) return;

    const eventSource = new EventSource(`/api/basketball-sessions/${sessionId}/stream`);

    eventSource.addEventListener("session", (event) => {
      if (inFlightRef.current > 0) return; // eco do próprio PATCH em voo
      const session = JSON.parse((event as MessageEvent).data) as SessionResponse;
      syncServerNow(session.serverNow);
      dispatch({ kind: "hydrate", state: normalizeBasketballState(session.state) });
      setSessionTitle(session.title);
      setCanUndo(session.canUndo);
    });

    eventSource.addEventListener("clock-sync", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { serverNow: string };
      syncServerNow(payload.serverNow);
    });

    return () => eventSource.close();
  }, [sessionId, syncServerNow]);

  // --- relógio: tique local + detecção de zero ---
  const { gameMs, shotMs } = useLiveClocks(state, nowMs);

  const handleExpire = useCallback(
    (clock: "game" | "shot") => {
      applyAction({ type: "EXPIRE_CLOCK", clock });
    },
    [applyAction],
  );

  useClockExpiry({ state, nowMs, enabled: Boolean(sessionId), onExpire: handleExpire });

  // --- ações ---
  const addPoints = useCallback((team: TeamKey, points: 1 | 2 | 3) => applyAction({ type: "ADD_POINTS", team, points }), [applyAction]);
  const removePoints = useCallback((team: TeamKey, points: 1 | 2 | 3) => applyAction({ type: "REMOVE_POINTS", team, points }), [applyAction]);
  const resetTeamPoints = useCallback(
    (team: TeamKey, teamName: string) => {
      if (window.confirm(`Zerar o placar de ${teamName}?`)) applyAction({ type: "RESET_TEAM_POINTS", team });
    },
    [applyAction],
  );
  const addFoul = useCallback((team: TeamKey) => applyAction({ type: "ADD_FOUL", team }), [applyAction]);
  const removeFoul = useCallback((team: TeamKey) => applyAction({ type: "REMOVE_FOUL", team }), [applyAction]);
  const addTimeout = useCallback((team: TeamKey) => applyAction({ type: "ADD_TIMEOUT", team }), [applyAction]);
  const removeTimeout = useCallback((team: TeamKey) => applyAction({ type: "REMOVE_TIMEOUT", team }), [applyAction]);
  const togglePossession = useCallback(() => applyAction({ type: "TOGGLE_POSSESSION" }), [applyAction]);
  const setPossession = useCallback((team: TeamKey) => applyAction({ type: "SET_POSSESSION", team }), [applyAction]);
  const toggleGameClock = useCallback(() => applyAction({ type: "TOGGLE_GAME_CLOCK" }), [applyAction]);
  const adjustGameClock = useCallback((deltaMs: number) => applyAction({ type: "ADJUST_GAME_CLOCK", deltaMs }), [applyAction]);
  const resetShotClockTo = useCallback((seconds: number) => applyAction({ type: "RESET_SHOT_CLOCK", seconds }), [applyAction]);
 

  const resetGameClock = useCallback(() => {
    if (window.confirm("Zerar o cronômetro do período atual?")) applyAction({ type: "RESET_GAME_CLOCK" });
  }, [applyAction]);

  const hasNextRegularPeriod = currentPeriod < config.totalPeriods - 1;
  const tied = teamA.points === teamB.points;
  const goingToOvertime = !hasNextRegularPeriod && tied && config.useOvertime;
  const isFinalAdvance = !hasNextRegularPeriod && !goingToOvertime;
  const periodEnded = status === "live" && !state.gameClock.isRunning && gameMs === 0;

  const advancePeriod = useCallback(() => {
    const label = goingToOvertime ? "ir para a prorrogação" : isFinalAdvance ? "encerrar a partida" : "avançar o período";
    if (window.confirm(`Confirma ${label}?`)) applyAction({ type: "ADVANCE_PERIOD" });
  }, [applyAction, goingToOvertime, isFinalAdvance]);

  const previousPeriod = useCallback(() => {
    if (window.confirm("Voltar ao período anterior? Isso restaura faltas e tempos técnicos.")) {
      applyAction({ type: "PREVIOUS_PERIOD" });
    }
  }, [applyAction]);

  const finishGame = useCallback(() => {
    if (window.confirm("Encerrar a partida agora?")) applyAction({ type: "FINISH_GAME" });
  }, [applyAction]);

  const reopenGame = useCallback(() => applyAction({ type: "REOPEN_GAME" }), [applyAction]);

  const resetMatch = useCallback(() => {
    if (window.confirm("Reiniciar a partida do zero? Isso apaga placar, faltas, tempos e histórico.")) {
      applyAction({ type: "RESET" });
    }
  }, [applyAction]);

  const updateConfig = useCallback((patch: Partial<BasketballMatchConfig>) => applyAction({ type: "SET_CONFIG", config: patch }), [applyAction]);
  const updateTheme = useCallback(
    (patch: Partial<BasketballDisplayConfig>) => applyAction({ type: "SET_THEME", display: { ...display, ...patch } }),
    [applyAction, display],
  );
  const restoreDefaultConfig = useCallback(() => applyAction({ type: "SET_CONFIG", config: DEFAULT_BASKETBALL_CONFIG }), [applyAction]);
  const restoreDefaultTheme = useCallback(() => applyAction({ type: "SET_THEME", display: DEFAULT_BASKETBALL_DISPLAY }), [applyAction]);

  // --- preferência do operador (localStorage, por navegador — não é a sessão) ---
  const saveAsDefaultPreferences = useCallback(() => {
    saveBasketballPreferences(config, display);
    setSavePrefsStatus("saved");
    window.setTimeout(() => setSavePrefsStatus("idle"), 2500);
  }, [config, display]);

  const resetConfigCompletely = useCallback(() => {
    if (
      !window.confirm(
        "Restaurar configuração e cores padrão nesta sessão, e apagar a preferência salva neste navegador?",
      )
    ) {
      return;
    }
    applyAction({ type: "SET_CONFIG", config: DEFAULT_BASKETBALL_CONFIG });
    applyAction({ type: "SET_THEME", display: DEFAULT_BASKETBALL_DISPLAY });
    clearSavedBasketballPreferences();
  }, [applyAction]);

  function startEditName(team: TeamKey) {
    setEditingName(team);
    setNameInput(team === "A" ? teamA.name : teamB.name);
  }

  function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || !editingName) return;
    applyAction({ type: "SET_NAME", team: editingName, name: trimmed });
    setEditingName(null);
  }

  // --- campos numéricos de configuração (padrão anti-tremida) ---
  const periodMinutesField = useNumericField(config.periodMinutes, (n) => updateConfig({ periodMinutes: n }), 1, 60);
  const overtimeMinutesField = useNumericField(config.overtimeMinutes, (n) => updateConfig({ overtimeMinutes: n }), 1, 30);
  const foulsForBonusField = useNumericField(config.foulsForBonus, (n) => updateConfig({ foulsForBonus: n }), 1, 20);
  const timeoutsPerTeamField = useNumericField(config.timeoutsPerTeam, (n) => updateConfig({ timeoutsPerTeam: n }), 0, 20);
  const overtimeTimeoutsField = useNumericField(config.overtimeTimeoutsPerTeam, (n) => updateConfig({ overtimeTimeoutsPerTeam: n }), 0, 10);
  const shotClockSecondsField = useNumericField(config.shotClockSeconds, (n) => updateConfig({ shotClockSeconds: n }), 5, 60);
  const shotClockResetSecondsField = useNumericField(config.shotClockResetSeconds, (n) => updateConfig({ shotClockResetSeconds: n }), 1, 60);

  const teamNameSizeField = useSliderField(display.teamNameSize, (n) => updateTheme({ teamNameSize: n }));
  const scoreSizeField = useSliderField(display.scoreSize, (n) => updateTheme({ scoreSize: n }));
  const clockSizeField = useSliderField(display.clockSize, (n) => updateTheme({ clockSize: n }));

  const clockTextField = useClockTextField(state.gameClock.remainingMs, (ms) => applyAction({ type: "SET_GAME_CLOCK", remainingMs: ms }));

  // --- QR code / copiar URL da view ---
  const buildViewUrl = useCallback(() => {
    if (!sessionId) return null;
    if (typeof window === "undefined") return `/placar-basquete/view/${sessionId}`;
    return `${window.location.origin}/placar-basquete/view/${sessionId}`;
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
        const dataUrl = await QRCode.toDataURL(viewUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" });
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

  // --- atalhos de teclado ---
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key === " ") {
        event.preventDefault();
        toggleGameClock();
        return;
      }

      switch (event.key.toLowerCase()) {
        case "q": event.preventDefault(); addPoints("A", 1); break;
        case "w": event.preventDefault(); addPoints("A", 2); break;
        case "e": event.preventDefault(); addPoints("A", 3); break;
        case "a": event.preventDefault(); addPoints("B", 1); break;
        case "s": event.preventDefault(); addPoints("B", 2); break;
        case "d": event.preventDefault(); addPoints("B", 3); break;
        case "z": event.preventDefault(); removePoints("A", 1); break;
        case "x": event.preventDefault(); removePoints("B", 1); break;
        case "c": event.preventDefault(); addFoul("A"); break;
        case "v": event.preventDefault(); addFoul("B"); break;
        case "1": event.preventDefault(); resetShotClockTo(config.shotClockSeconds); break;
        case "2": event.preventDefault(); resetShotClockTo(config.shotClockResetSeconds); break;
        case "b": event.preventDefault(); togglePossession(); break;
        case "r": event.preventDefault(); resetGameClock(); break;
        case "n": event.preventDefault(); advancePeriod(); break;
        case "p": event.preventDefault(); resetMatch(); break;
        case "f": event.preventDefault(); void toggleFullscreen(); break;
        case "u": event.preventDefault(); undoLastAction(); break;
        default: break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addPoints,
    removePoints,
    addFoul,
    resetShotClockTo,
    togglePossession,
    resetGameClock,
    advancePeriod,
    resetMatch,
    toggleFullscreen,
    toggleGameClock,
    undoLastAction,
    config.shotClockSeconds,
    config.shotClockResetSeconds,
  ]);

  // --- derivados de layout ---
  const teamAAtLimit = isAtFoulLimit(teamA, config);
  const teamBAtLimit = isAtFoulLimit(teamB, config);
  const allowance = timeoutAllowance(state);
  const locked = status === "finished";
  const shellClass = isFullscreen
    ? "w-full min-h-screen px-3 py-3 sm:px-6 sm:py-6 flex flex-col"
    : "max-w-6xl mx-auto px-4 py-6";
  const activeSessionLabel = sessionTitle ?? sessionId;
  const advanceButtonLabel = goingToOvertime ? "Ir para a prorrogação" : isFinalAdvance ? "Encerrar partida" : "Avançar período";

  return (
    <div ref={pageRef} className={shellClass}>
      {!isFullscreen && (
        <>
          {sessionId && (
            <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Sessão ativa</p>
                  <p className="mt-1 text-xs text-orange-800">{activeSessionLabel}</p>
                  {/* {isSyncing && <p className="mt-1 text-xs text-orange-700">Sincronizando…</p>} */}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/placar-basquete/view/${sessionId}`} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 transition-colors">
                    Abrir visualização
                  </Link>
                  <button
                    type="button"
                    onClick={copyViewUrl}
                    className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 transition-colors"
                  >
                    Copiar URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrOpen((prev) => !prev)}
                    className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 transition-colors"
                  >
                    QR Code
                  </button>
                  <Link href="/placar-basquete/sessoes" className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 transition-colors">
                    Sessões
                  </Link>
                </div>
              </div>

              {copyStatus === "copied" && <p className="mt-2 text-xs text-orange-700">URL copiada.</p>}
              {copyStatus === "error" && <p className="mt-2 text-xs text-red-700">Não foi possível copiar a URL.</p>}

              {isQrOpen && (
                <div className="mt-3 flex items-center gap-3">
                  {qrStatus === "loading" && <p className="text-xs text-orange-700">Gerando QR Code…</p>}
                  {qrStatus === "error" && <p className="text-xs text-red-700">Não foi possível gerar o QR Code.</p>}
                  {qrStatus === "ready" && qrCodeDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrCodeDataUrl} alt="QR Code da visualização" width={160} height={160} className="rounded-lg border border-orange-200" />
                  )}
                </div>
              )}
            </div>
          )}

          {!sessionId && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Use uma sessão compartilhada em{" "}
              <Link href="/placar-basquete/sessoes" className="font-semibold text-orange-600 hover:text-orange-700">
                /placar-basquete/sessoes
              </Link>{" "}
              ou abra esta tela com `?sessionId=`.
            </div>
          )}

          {syncError && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <span>{syncError}</span>
              <button type="button" onClick={retryLastAction} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold hover:bg-rose-100">
                Tentar novamente
              </button>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Placar de Basquete</h1>
              {display.showPeriod && <p className="text-sm text-gray-500">{periodLabel(currentPeriod, config)}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void toggleFullscreen()} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                Fullscreen
              </button>
              <Link href="/" className="text-sm text-gray-500 hover:text-orange-600">
                ← Voltar
              </Link>
            </div>
          </div>
        </>
      )}

      {isFullscreen && (
        <div className="mb-2 flex items-center justify-between px-1">
          {display.showPeriod ? (
            <p className="text-sm font-semibold text-white">{periodLabel(currentPeriod, config)}</p>
          ) : (
            <span />
          )}
          <button type="button" onClick={() => void toggleFullscreen()} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
            Sair do fullscreen
          </button>
        </div>
      )}

      {/* Painel do relógio — sempre visível, inclusive em fullscreen. Cores/fonte seguem o
          tema da sessão (mesmo esquema da view/TV), pra refletir o que o público vê. */}
      <div
        className="mb-4 rounded-2xl border border-white/10 p-4 sm:p-6"
        style={{ backgroundColor: display.cardBackgroundColor, color: display.cardFontColor }}
      >
        <div className="flex flex-wrap items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-gray-400">Cronômetro</p>
            <p
              className="mt-1 text-6xl sm:text-7xl font-black tabular-nums font-seven-segment"
              style={{ color: display.accentColor }}
            >
              {formatGameClock(gameMs, display.showTenths)}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={toggleGameClock} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                {state.gameClock.isRunning ? "Pausar" : "Iniciar"}
              </button>
              <button type="button" onClick={resetGameClock} className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">
                Zerar
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
              {CLOCK_ADJUST_STEPS.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => adjustGameClock(delta)}
                  className="rounded border border-white/20 px-2 py-1 text-xs font-medium hover:bg-white/10"
                >
                  {delta > 0 ? "+" : "−"}{formatDeltaLabel(Math.abs(delta))}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={clockTextField.text}
                disabled={state.gameClock.isRunning}
                onChange={(e) => clockTextField.onChange(e.target.value)}
                onBlur={clockTextField.onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-20 rounded border text-white px-2 py-1 text-center text-sm text-gray-900 disabled:opacity-50"
                aria-label="Definir cronômetro (mm:ss)"
              />
              <span className="text-xs text-white">mm:ss</span>
            </div>
          </div>

          {config.useShotClock && (
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-gray-400">Posse (24s)</p>
              <p
                className="mt-1 text-5xl sm:text-6xl font-black tabular-nums font-seven-segment"
                style={{ color: display.accentColor }}
              >
                {formatShotClock(shotMs, display.showTenths)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={() => resetShotClockTo(config.shotClockSeconds)} className="rounded-lg bg-orange-100 px-4 py-2 text-sm font-bold text-orange-800 hover:bg-orange-200">
                  {config.shotClockSeconds}
                </button>
                <button type="button" onClick={() => resetShotClockTo(config.shotClockResetSeconds)} className="rounded-lg bg-orange-100 px-4 py-2 text-sm font-bold text-orange-800 hover:bg-orange-200">
                  {config.shotClockResetSeconds}
                </button>
              </div>
            </div>
          )}

          {display.showPossession && (
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-gray-400">Posse de bola</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPossession("A")}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${possession === "A" ? "border-orange-500 bg-orange-500 text-white" : "border-white/20 hover:bg-white/10"}`}
                >
                  ◀ {teamA.name}
                </button>
                <button type="button" onClick={togglePossession} className="rounded-lg border border-white/20 px-2 py-2 text-sm hover:bg-white/10">
                  ⇄
                </button>
                <button
                  type="button"
                  onClick={() => setPossession("B")}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${possession === "B" ? "border-orange-500 bg-orange-500 text-white" : "border-white/20 hover:bg-white/10"}`}
                >
                  {teamB.name} ▶
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {periodEnded && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="font-semibold">Fim do {periodLabel(currentPeriod, config)}</p>
          <button type="button" onClick={advancePeriod} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            {advanceButtonLabel}
          </button>
        </div>
      )}

      {locked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
          <p className="font-semibold">{winner ? `${winner} venceu a partida` : "Partida encerrada em empate"}</p>
          <button type="button" onClick={reopenGame} className="rounded-lg border border-emerald-400 px-4 py-2 text-sm font-semibold hover:bg-emerald-100">
            Reabrir partida
          </button>
        </div>
      )}

      {/* Cards dos times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((team) => {
          const teamState = team === "A" ? teamA : teamB;
          const atLimit = team === "A" ? teamAAtLimit : teamBAtLimit;
          const opponentAtLimit = team === "A" ? teamBAtLimit : teamAAtLimit;

          return (
            <div
              key={team}
              className="rounded-2xl border border-white/10 p-5"
              style={{ backgroundColor: display.cardBackgroundColor, color: display.cardFontColor }}
            >
              {editingName === team ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    maxLength={35}
                    autoFocus
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                    }}
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-lg font-bold text-gray-900"
                  />
                  <button type="button" onClick={saveName} className="rounded bg-orange-600 px-3 py-1 text-sm font-semibold text-white hover:bg-orange-700">
                    OK
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => startEditName(team)} className="text-2xl font-black hover:text-orange-600 transition-colors">
                  {teamState.name}
                </button>
              )}

              <p
                className="mt-2 text-6xl font-black tabular-nums font-seven-segment"
                style={{ color: display.accentColor }}
              >
                {teamState.points}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {[1, 2, 3].map((points) => (
                  <button
                    key={`add-${points}`}
                    type="button"
                    disabled={locked}
                    onClick={() => addPoints(team, points as 1 | 2 | 3)}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40"
                  >
                    +{points}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {[1, 2, 3].map((points) => (
                  <button
                    key={`remove-${points}`}
                    type="button"
                    disabled={locked}
                    onClick={() => removePoints(team, points as 1 | 2 | 3)}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
                  >
                    −{points}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={locked || teamState.points === 0}
                  onClick={() => resetTeamPoints(team, teamState.name)}
                  className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  Zerar placar
                </button>
              </div>

              {config.useFouls && display.showFouls && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm font-semibold">Faltas: {teamState.fouls}</span>
                  <button type="button" disabled={locked} onClick={() => addFoul(team)} className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10 disabled:opacity-40">
                    +
                  </button>
                  <button type="button" onClick={() => removeFoul(team)} className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10">
                    −
                  </button>
                  {atLimit && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">LIMITE DE FALTAS</span>}
                  {opponentAtLimit && !atLimit && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">BÔNUS</span>}
                </div>
              )}

              {display.showTimeouts && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    Tempos: {teamState.timeoutsUsed}/{allowance}
                  </span>
                  <button
                    type="button"
                    disabled={locked || teamState.timeoutsUsed >= allowance}
                    onClick={() => addTimeout(team)}
                    className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10 disabled:opacity-40"
                  >
                    +
                  </button>
                  <button type="button" onClick={() => removeTimeout(team)} className="rounded border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10">
                    −
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fluxo de período */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!canUndo}
          onClick={undoLastAction}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          title="Desfazer última ação (U)"
        >
          ↩ Desfazer
        </button>
        <button type="button" disabled={currentPeriod === 0 || history.length === 0} onClick={previousPeriod} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40">
          Voltar período
        </button>
        <button type="button" disabled={locked} onClick={advancePeriod} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40">
          Avançar período
        </button>
        <button type="button" disabled={locked} onClick={finishGame} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-40">
          Encerrar partida
        </button>
        <button type="button" onClick={resetMatch} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
          Reiniciar partida
        </button>
      </div>

      {!isFullscreen && (
        <>
        {/* Atalhos de teclado */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
            <h2 className="text-lg font-bold text-gray-900">Atalhos de teclado</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <p><b>Espaço</b> — liga/pausa</p>
              <p><b>Q/W/E</b> — Time A +1/+2/+3</p>
              <p><b>A/S/D</b> — Time B +1/+2/+3</p>
              <p><b>Z/X</b> — −1 A/B</p>
              <p><b>C/V</b> — falta A/B</p>
              <p><b>1/2</b> — posse 24s/14s</p>
              <p><b>B</b> — inverte posse</p>
              <p><b>R</b> — zera cronômetro</p>
              <p><b>N</b> — avança período</p>
              <p><b>P</b> — reinicia partida</p>
              <p><b>F</b> — fullscreen</p>
              <p><b>U</b> — desfazer última ação</p>
            </div>
          </div>
          
          {/* Configuração da partida */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-bold text-gray-900">Configurações da partida</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm text-gray-600">
                Total de períodos
                <select
                  value={config.totalPeriods}
                  onChange={(e) => updateConfig({ totalPeriods: Number(e.target.value) })}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Minutos por período
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={periodMinutesField.text}
                  onChange={(e) => periodMinutesField.onChange(e.target.value)}
                  onBlur={periodMinutesField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Minutos de prorrogação
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={overtimeMinutesField.text}
                  onChange={(e) => overtimeMinutesField.onChange(e.target.value)}
                  onBlur={overtimeMinutesField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Faltas para o bônus
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={foulsForBonusField.text}
                  onChange={(e) => foulsForBonusField.onChange(e.target.value)}
                  onBlur={foulsForBonusField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Tempos técnicos por time
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={timeoutsPerTeamField.text}
                  onChange={(e) => timeoutsPerTeamField.onChange(e.target.value)}
                  onBlur={timeoutsPerTeamField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Tempos técnicos na prorrogação
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={overtimeTimeoutsField.text}
                  onChange={(e) => overtimeTimeoutsField.onChange(e.target.value)}
                  onBlur={overtimeTimeoutsField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Modo de reset dos tempos técnicos
                <select
                  value={config.timeoutsResetMode}
                  onChange={(e) => updateConfig({ timeoutsResetMode: e.target.value as BasketballMatchConfig["timeoutsResetMode"] })}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                >
                  <option value="match">Pote único (NBA)</option>
                  <option value="half">Por tempo (1º/2º tempo)</option>
                  <option value="period">Por período</option>
                </select>
              </label>

              <label className="text-sm text-gray-600">
                Posse de 24s
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={shotClockSecondsField.text}
                  onChange={(e) => shotClockSecondsField.onChange(e.target.value)}
                  onBlur={shotClockSecondsField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>

              <label className="text-sm text-gray-600">
                Reset secundário da posse
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={shotClockResetSecondsField.text}
                  onChange={(e) => shotClockResetSecondsField.onChange(e.target.value)}
                  onBlur={shotClockResetSecondsField.onBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CONFIG_TOGGLES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={Boolean(config[key])}
                    onChange={(e) => updateConfig({ [key]: e.target.checked } as Partial<BasketballMatchConfig>)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="text-sm text-gray-600">
                Cor de fundo do card
                <input
                  type="color"
                  value={display.cardBackgroundColor}
                  onChange={(e) => updateTheme({ cardBackgroundColor: e.target.value })}
                  className="mt-1 block h-9 w-full rounded border border-gray-300"
                />
              </label>
              <label className="text-sm text-gray-600">
                Cor da fonte do card
                <input
                  type="color"
                  value={display.cardFontColor}
                  onChange={(e) => updateTheme({ cardFontColor: e.target.value })}
                  className="mt-1 block h-9 w-full rounded border border-gray-300"
                />
              </label>
              <label className="text-sm text-gray-600">
                Cor de destaque (bônus, posse)
                <input
                  type="color"
                  value={display.accentColor}
                  onChange={(e) => updateTheme({ accentColor: e.target.value })}
                  className="mt-1 block h-9 w-full rounded border border-gray-300"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="text-sm text-gray-600">
                Tamanho do nome do time ({teamNameSizeField.slider}px)
                <input
                  type="range"
                  min={20}
                  max={56}
                  value={teamNameSizeField.slider}
                  onChange={(e) => teamNameSizeField.onChange(e.target.value)}
                  onMouseUp={teamNameSizeField.onCommit}
                  onTouchEnd={teamNameSizeField.onCommit}
                  className="mt-1 block w-full"
                />
              </label>
              <label className="text-sm text-gray-600">
                Tamanho do placar ({scoreSizeField.slider}px)
                <input
                  type="range"
                  min={64}
                  max={320}
                  value={scoreSizeField.slider}
                  onChange={(e) => scoreSizeField.onChange(e.target.value)}
                  onMouseUp={scoreSizeField.onCommit}
                  onTouchEnd={scoreSizeField.onCommit}
                  className="mt-1 block w-full"
                />
              </label>
              <label className="text-sm text-gray-600">
                Tamanho dos cronômetros e do período ({clockSizeField.slider}px)
                <input
                  type="range"
                  min={48}
                  max={320}
                  value={clockSizeField.slider}
                  onChange={(e) => clockSizeField.onChange(e.target.value)}
                  onMouseUp={clockSizeField.onCommit}
                  onTouchEnd={clockSizeField.onCommit}
                  className="mt-1 block w-full"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {DISPLAY_TOGGLES.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={Boolean(display[key])}
                    onChange={(e) => updateTheme({ [key]: e.target.checked } as Partial<BasketballDisplayConfig>)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={restoreDefaultConfig} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                Restaurar padrão
              </button>
              <button type="button" onClick={restoreDefaultTheme} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold hover:bg-gray-50">
                Restaurar cores
              </button>
              <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" />
              <button
                type="button"
                onClick={saveAsDefaultPreferences}
                title="Salva a configuração e o tema atuais neste navegador — sessões novas criadas aqui já nascem assim."
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                Salvar como padrão
              </button>
              <button
                type="button"
                onClick={resetConfigCompletely}
                title="Restaura configuração e cores de fábrica nesta sessão, e apaga a preferência salva neste navegador."
                className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Resetar configuração
              </button>
              {savePrefsStatus === "saved" && (
                <p className="text-xs text-emerald-700">Salvo neste navegador — sessões novas já nascem assim.</p>
              )}
            </div>
          </div>

          

          {/* Histórico por período */}
          {display.showPeriodSummary && history.length > 0 && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-bold text-gray-900">Histórico por período</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-400">
                      <th className="py-2 pr-4">Período</th>
                      <th className="py-2 pr-4">Pontos no período</th>
                      <th className="py-2 pr-4">Placar acumulado</th>
                      <th className="py-2 pr-4">Faltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.periodNumber} className="border-b border-gray-100 text-gray-700">
                        <td className="py-2 pr-4">{entry.isOvertime ? "Prorrogação" : `${entry.periodNumber}º Período`}</td>
                        <td className="py-2 pr-4">{entry.teamAPeriodPoints} x {entry.teamBPeriodPoints}</td>
                        <td className="py-2 pr-4">{entry.teamAName} {entry.teamAPoints} x {entry.teamBPoints} {entry.teamBName}</td>
                        <td className="py-2 pr-4">{entry.teamAFouls} x {entry.teamBFouls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PlacarBasquete() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-6">Carregando placar...</div>}>
      <PlacarBasqueteContent />
    </Suspense>
  );
}
