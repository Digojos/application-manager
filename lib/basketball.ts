export type TeamKey = "A" | "B";

// ---------------------------------------------------------------------------
// Relógio — modelado como âncora (remainingMs + startedAt), não como contador.
// Só start/pause/ajuste tocam o banco; o tique é inteiramente client-side.
// ---------------------------------------------------------------------------

export interface BasketballClockState {
  isRunning: boolean;
  remainingMs: number; // valor exato capturado na última pausa/âncora
  startedAt: string | null; // ISO do SERVIDOR, setado no start, null quando pausado
}

export const MAX_CLOCK_MS = 99 * 60 * 1000;

export function clockRemainingMs(clock: BasketballClockState, nowMs: number): number {
  if (!clock.isRunning || !clock.startedAt) return Math.max(0, clock.remainingMs);

  const startedMs = Date.parse(clock.startedAt);
  if (!Number.isFinite(startedMs)) return Math.max(0, clock.remainingMs);

  return Math.max(0, clock.remainingMs - (nowMs - startedMs));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeClock(clock: BasketballClockState, fallbackRemainingMs: number): BasketballClockState {
  const remainingMs = clamp(Math.round(numberOr(clock?.remainingMs, fallbackRemainingMs)), 0, MAX_CLOCK_MS);
  const startedAt = typeof clock?.startedAt === "string" ? clock.startedAt : null;
  const startedAtValid = startedAt !== null && Number.isFinite(Date.parse(startedAt));
  const isRunning = Boolean(clock?.isRunning) && startedAtValid;

  return {
    isRunning,
    remainingMs,
    startedAt: isRunning ? startedAt : null,
  };
}

function materializeClock(clock: BasketballClockState, nowMs: number): BasketballClockState {
  return { isRunning: false, remainingMs: clockRemainingMs(clock, nowMs), startedAt: null };
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

/** M:SS acima de 1 min, décimos abaixo disso (arredondando para baixo). */
export function formatGameClock(ms: number, showTenths = true): string {
  const safe = Math.max(0, ms);

  if (safe >= 60_000 || !showTenths) {
    const totalSeconds = Math.floor(safe / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const tenths = Math.floor(safe / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

/** Inteiro arredondando para cima (tem que ler "24" no instante do reset), décimos abaixo de 5s. */
export function formatShotClock(ms: number, showTenths = true): string {
  const safe = Math.max(0, ms);

  if (safe < 5_000 && showTenths) {
    const tenths = Math.floor(safe / 100);
    return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  }

  return String(Math.ceil(safe / 1000));
}

// ---------------------------------------------------------------------------
// Configuração da partida (padrão NBA, tudo editável no controle)
// ---------------------------------------------------------------------------

export type TimeoutsResetMode = "match" | "half" | "period";

export interface BasketballMatchConfig {
  totalPeriods: number; // 4        (1–12)
  periodMinutes: number; // 12       (1–60)
  overtimeMinutes: number; // 5        (1–30)
  useOvertime: boolean; // true
  useFouls: boolean; // true     — desliga faltas por completo
  foulsForBonus: number; // 5        (1–20)
  resetFoulsEachPeriod: boolean; // true     (NBA: zera por quarto)
  timeoutsPerTeam: number; // 7        (0–20)
  overtimeTimeoutsPerTeam: number; // 2        (0–10)
  timeoutsResetMode: TimeoutsResetMode; // "match"  (NBA: pote único no jogo)
  useShotClock: boolean; // true
  shotClockSeconds: number; // 24       (5–60)
  shotClockResetSeconds: number; // 14       (1–60) botão secundário
  autoStartShotClockWithGameClock: boolean; // true
  resetShotClockOnScore: boolean; // true     — automação: cesta reseta a posse
  flipPossessionOnScore: boolean; // true     — automação: cesta inverte a posse
  pauseClocksOnFoul: boolean; // true     — automação: falta pausa os relógios
  flipPossessionOnShotClockViolation: boolean; // true — automação: estourar a posse (24s) troca a posse e reseta o cronômetro na hora
  resetShotClockOnPossessionChange: boolean; // true — automação: trocar a posse manualmente reseta a posse pros 24s
}

export const DEFAULT_BASKETBALL_CONFIG: BasketballMatchConfig = {
  totalPeriods: 4,
  periodMinutes: 12,
  overtimeMinutes: 5,
  useOvertime: true,
  useFouls: true,
  foulsForBonus: 5,
  resetFoulsEachPeriod: true,
  timeoutsPerTeam: 7,
  overtimeTimeoutsPerTeam: 2,
  timeoutsResetMode: "match",
  useShotClock: true,
  shotClockSeconds: 24,
  shotClockResetSeconds: 14,
  autoStartShotClockWithGameClock: true,
  resetShotClockOnScore: true,
  flipPossessionOnScore: true,
  pauseClocksOnFoul: true,
  flipPossessionOnShotClockViolation: true,
  resetShotClockOnPossessionChange: true,
};

export function normalizeBasketballConfig(config: BasketballMatchConfig): BasketballMatchConfig {
  const timeoutsResetMode: TimeoutsResetMode =
    config?.timeoutsResetMode === "half" || config?.timeoutsResetMode === "period"
      ? config.timeoutsResetMode
      : "match";

  return {
    totalPeriods: clamp(Math.round(numberOr(config?.totalPeriods, DEFAULT_BASKETBALL_CONFIG.totalPeriods)), 1, 12),
    periodMinutes: clamp(Math.round(numberOr(config?.periodMinutes, DEFAULT_BASKETBALL_CONFIG.periodMinutes)), 1, 60),
    overtimeMinutes: clamp(
      Math.round(numberOr(config?.overtimeMinutes, DEFAULT_BASKETBALL_CONFIG.overtimeMinutes)),
      1,
      30,
    ),
    useOvertime: boolOr(config?.useOvertime, true),
    useFouls: boolOr(config?.useFouls, true),
    foulsForBonus: clamp(Math.round(numberOr(config?.foulsForBonus, DEFAULT_BASKETBALL_CONFIG.foulsForBonus)), 1, 20),
    resetFoulsEachPeriod: boolOr(config?.resetFoulsEachPeriod, true),
    timeoutsPerTeam: clamp(
      Math.round(numberOr(config?.timeoutsPerTeam, DEFAULT_BASKETBALL_CONFIG.timeoutsPerTeam)),
      0,
      20,
    ),
    overtimeTimeoutsPerTeam: clamp(
      Math.round(numberOr(config?.overtimeTimeoutsPerTeam, DEFAULT_BASKETBALL_CONFIG.overtimeTimeoutsPerTeam)),
      0,
      10,
    ),
    timeoutsResetMode,
    useShotClock: boolOr(config?.useShotClock, true),
    shotClockSeconds: clamp(
      Math.round(numberOr(config?.shotClockSeconds, DEFAULT_BASKETBALL_CONFIG.shotClockSeconds)),
      5,
      60,
    ),
    shotClockResetSeconds: clamp(
      Math.round(numberOr(config?.shotClockResetSeconds, DEFAULT_BASKETBALL_CONFIG.shotClockResetSeconds)),
      1,
      60,
    ),
    autoStartShotClockWithGameClock: boolOr(config?.autoStartShotClockWithGameClock, true),
    resetShotClockOnScore: boolOr(config?.resetShotClockOnScore, true),
    flipPossessionOnScore: boolOr(config?.flipPossessionOnScore, true),
    pauseClocksOnFoul: boolOr(config?.pauseClocksOnFoul, true),
    flipPossessionOnShotClockViolation: boolOr(config?.flipPossessionOnShotClockViolation, true),
    resetShotClockOnPossessionChange: boolOr(config?.resetShotClockOnPossessionChange, true),
  };
}

// ---------------------------------------------------------------------------
// Tema / display
// ---------------------------------------------------------------------------

const TEAM_NAME_SIZE_MIN = 20;
const TEAM_NAME_SIZE_MAX = 56;
const SCORE_SIZE_MIN = 64;
const SCORE_SIZE_MAX = 320;
const CLOCK_SIZE_MIN = 48;
const CLOCK_SIZE_MAX = 320;

export interface BasketballDisplayConfig {
  cardBackgroundColor: string;
  cardFontColor: string;
  accentColor: string; // bônus, posse, alerta da posse de 24s
  teamNameSize: number;
  scoreSize: number;
  clockSize: number;
  showTeamNames: boolean;
  showPeriod: boolean;
  showGameClock: boolean;
  showShotClock: boolean;
  showFouls: boolean;
  showTimeouts: boolean;
  showPossession: boolean;
  showPeriodSummary: boolean;
  showTenths: boolean;
  soundAlertsEnabled: boolean; // true — chave mestra: TV toca buzina no fim de período/estouro da posse; mute fica salvo por dispositivo (view)
}

export const DEFAULT_BASKETBALL_DISPLAY: BasketballDisplayConfig = {
  cardBackgroundColor: "#000000",
  cardFontColor: "#ffffff", // nome dos times
  accentColor: "#ff0000", // números: cronômetro de jogo, posse (24s) e placar
  teamNameSize: 36,
  scoreSize: 140,
  clockSize: 120,
  showTeamNames: true,
  showPeriod: true,
  showGameClock: true,
  showShotClock: true,
  showFouls: true,
  showTimeouts: true,
  showPossession: true,
  showPeriodSummary: true,
  showTenths: true,
  soundAlertsEnabled: true,
};

export function normalizeBasketballDisplay(display: BasketballDisplayConfig): BasketballDisplayConfig {
  return {
    cardBackgroundColor: stringOr(display?.cardBackgroundColor, DEFAULT_BASKETBALL_DISPLAY.cardBackgroundColor),
    cardFontColor: stringOr(display?.cardFontColor, DEFAULT_BASKETBALL_DISPLAY.cardFontColor),
    accentColor: stringOr(display?.accentColor, DEFAULT_BASKETBALL_DISPLAY.accentColor),
    teamNameSize: clamp(
      Math.round(numberOr(display?.teamNameSize, DEFAULT_BASKETBALL_DISPLAY.teamNameSize)),
      TEAM_NAME_SIZE_MIN,
      TEAM_NAME_SIZE_MAX,
    ),
    scoreSize: clamp(
      Math.round(numberOr(display?.scoreSize, DEFAULT_BASKETBALL_DISPLAY.scoreSize)),
      SCORE_SIZE_MIN,
      SCORE_SIZE_MAX,
    ),
    clockSize: clamp(
      Math.round(numberOr(display?.clockSize, DEFAULT_BASKETBALL_DISPLAY.clockSize)),
      CLOCK_SIZE_MIN,
      CLOCK_SIZE_MAX,
    ),
    showTeamNames: boolOr(display?.showTeamNames, true),
    showPeriod: boolOr(display?.showPeriod, true),
    showGameClock: boolOr(display?.showGameClock, true),
    showShotClock: boolOr(display?.showShotClock, true),
    showFouls: boolOr(display?.showFouls, true),
    showTimeouts: boolOr(display?.showTimeouts, true),
    showPossession: boolOr(display?.showPossession, true),
    showPeriodSummary: boolOr(display?.showPeriodSummary, true),
    showTenths: boolOr(display?.showTenths, true),
    soundAlertsEnabled: boolOr(display?.soundAlertsEnabled, true),
  };
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export interface BasketballTeamState {
  name: string;
  points: number;
  fouls: number; // faltas do time no período ATUAL
  timeoutsUsed: number; // usados, não restantes — sobrevive a baixar a cota na config
}

export interface BasketballPeriodHistoryEntry {
  periodNumber: number; // 1-based
  isOvertime: boolean;
  teamAName: string;
  teamBName: string;
  teamAPoints: number; // cumulativo ao final do período
  teamBPoints: number;
  teamAPeriodPoints: number; // pontos marcados dentro do período
  teamBPeriodPoints: number;
  teamAFouls: number;
  teamBFouls: number;
  teamATimeoutsUsed: number; // presente para o PREVIOUS_PERIOD restaurar exatamente
  teamBTimeoutsUsed: number;
}

export interface BasketballState {
  teamA: BasketballTeamState;
  teamB: BasketballTeamState;
  config: BasketballMatchConfig;
  display: BasketballDisplayConfig;
  currentPeriod: number; // 0-indexed, espelha o currentSet do vôlei
  gameClock: BasketballClockState;
  shotClock: BasketballClockState;
  possession: TeamKey | null;
  history: BasketballPeriodHistoryEntry[]; // mais recente primeiro
  status: "live" | "finished";
  winner: string | null; // NOME do time; null + "finished" = empate
}

function normalizeTeamState(team: BasketballTeamState, fallbackName: string): BasketballTeamState {
  return {
    name: stringOr(team?.name, fallbackName),
    points: Math.max(0, Math.floor(numberOr(team?.points, 0))),
    fouls: Math.max(0, Math.floor(numberOr(team?.fouls, 0))),
    timeoutsUsed: Math.max(0, Math.floor(numberOr(team?.timeoutsUsed, 0))),
  };
}

function normalizeHistoryEntry(entry: BasketballPeriodHistoryEntry): BasketballPeriodHistoryEntry {
  return {
    periodNumber: Math.max(1, Math.floor(numberOr(entry?.periodNumber, 1))),
    isOvertime: Boolean(entry?.isOvertime),
    teamAName: stringOr(entry?.teamAName, "Time A"),
    teamBName: stringOr(entry?.teamBName, "Time B"),
    teamAPoints: Math.max(0, Math.floor(numberOr(entry?.teamAPoints, 0))),
    teamBPoints: Math.max(0, Math.floor(numberOr(entry?.teamBPoints, 0))),
    teamAPeriodPoints: Math.max(0, Math.floor(numberOr(entry?.teamAPeriodPoints, 0))),
    teamBPeriodPoints: Math.max(0, Math.floor(numberOr(entry?.teamBPeriodPoints, 0))),
    teamAFouls: Math.max(0, Math.floor(numberOr(entry?.teamAFouls, 0))),
    teamBFouls: Math.max(0, Math.floor(numberOr(entry?.teamBFouls, 0))),
    teamATimeoutsUsed: Math.max(0, Math.floor(numberOr(entry?.teamATimeoutsUsed, 0))),
    teamBTimeoutsUsed: Math.max(0, Math.floor(numberOr(entry?.teamBTimeoutsUsed, 0))),
  };
}

export function normalizeBasketballState(state: BasketballState): BasketballState {
  const config = normalizeBasketballConfig(state?.config);
  const display = normalizeBasketballDisplay(state?.display);
  const currentPeriod = Math.max(0, Math.floor(numberOr(state?.currentPeriod, 0)));

  return {
    teamA: normalizeTeamState(state?.teamA, "Time A"),
    teamB: normalizeTeamState(state?.teamB, "Time B"),
    config,
    display,
    currentPeriod,
    gameClock: normalizeClock(state?.gameClock, getPeriodLengthMs(currentPeriod, config)),
    shotClock: normalizeClock(state?.shotClock, config.shotClockSeconds * 1000),
    possession: state?.possession === "A" || state?.possession === "B" ? state.possession : null,
    history: Array.isArray(state?.history) ? state.history.map(normalizeHistoryEntry) : [],
    status: state?.status === "finished" ? "finished" : "live",
    winner: typeof state?.winner === "string" ? state.winner : null,
  };
}

export function createInitialBasketballState(
  nameA = "Time A",
  nameB = "Time B",
  config: BasketballMatchConfig = DEFAULT_BASKETBALL_CONFIG,
  display: BasketballDisplayConfig = DEFAULT_BASKETBALL_DISPLAY,
): BasketballState {
  const normalizedConfig = normalizeBasketballConfig(config);
  const normalizedDisplay = normalizeBasketballDisplay(display);

  return {
    teamA: { name: nameA, points: 0, fouls: 0, timeoutsUsed: 0 },
    teamB: { name: nameB, points: 0, fouls: 0, timeoutsUsed: 0 },
    config: normalizedConfig,
    display: normalizedDisplay,
    currentPeriod: 0,
    gameClock: { isRunning: false, remainingMs: getPeriodLengthMs(0, normalizedConfig), startedAt: null },
    shotClock: { isRunning: false, remainingMs: normalizedConfig.shotClockSeconds * 1000, startedAt: null },
    possession: null,
    history: [],
    status: "live",
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// Derivado (não armazenado)
// ---------------------------------------------------------------------------

export function isOvertime(state: BasketballState): boolean {
  return state.currentPeriod >= state.config.totalPeriods;
}

export function getPeriodLengthMs(periodIndex: number, config: BasketballMatchConfig): number {
  return (periodIndex >= config.totalPeriods ? config.overtimeMinutes : config.periodMinutes) * 60_000;
}

/** "1º Quarto"…"4º Quarto" quando totalPeriods === 4; senão "Nº Período"; OT → "Prorrogação N". */
export function periodLabel(periodIndex: number, config: BasketballMatchConfig): string {
  if (periodIndex >= config.totalPeriods) {
    return `Prorrogação ${periodIndex - config.totalPeriods + 1}`;
  }

  if (config.totalPeriods === 4) {
    const ordinals = ["1º", "2º", "3º", "4º"];
    return `${ordinals[periodIndex] ?? `${periodIndex + 1}º`} Quarto`;
  }

  return `${periodIndex + 1}º Período`;
}

export function timeoutAllowance(state: BasketballState): number {
  return isOvertime(state) ? state.config.overtimeTimeoutsPerTeam : state.config.timeoutsPerTeam;
}

/** O time com `fouls >= foulsForBonus` está no limite; o ADVERSÁRIO está em bônus. */
export function isAtFoulLimit(team: BasketballTeamState, config: BasketballMatchConfig): boolean {
  return config.useFouls && team.fouls >= config.foulsForBonus;
}

export function getCurrentPeriodPoints(state: BasketballState): { teamA: number; teamB: number } {
  const previousA = state.history[0]?.teamAPoints ?? 0;
  const previousB = state.history[0]?.teamBPoints ?? 0;

  return {
    teamA: Math.max(0, state.teamA.points - previousA),
    teamB: Math.max(0, state.teamB.points - previousB),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BasketballAction =
  // pontuação
  | { type: "ADD_POINTS"; team: TeamKey; points: 1 | 2 | 3 }
  | { type: "REMOVE_POINTS"; team: TeamKey; points: 1 | 2 | 3 }
  | { type: "RESET_TEAM_POINTS"; team: TeamKey }
  // faltas
  | { type: "ADD_FOUL"; team: TeamKey }
  | { type: "REMOVE_FOUL"; team: TeamKey }
  // tempos técnicos
  | { type: "ADD_TIMEOUT"; team: TeamKey }
  | { type: "REMOVE_TIMEOUT"; team: TeamKey }
  // posse de bola
  | { type: "SET_POSSESSION"; team: TeamKey | null }
  | { type: "TOGGLE_POSSESSION" }
  // cronômetro de jogo
  | { type: "START_GAME_CLOCK" }
  | { type: "PAUSE_GAME_CLOCK" }
  | { type: "TOGGLE_GAME_CLOCK" }
  | { type: "RESET_GAME_CLOCK" }
  | { type: "ADJUST_GAME_CLOCK"; deltaMs: number }
  | { type: "SET_GAME_CLOCK"; remainingMs: number }
  // cronômetro de posse (shot clock)
  | { type: "RESET_SHOT_CLOCK"; seconds?: number }
  | { type: "START_SHOT_CLOCK" }
  | { type: "PAUSE_SHOT_CLOCK" }
  // zerou
  | { type: "EXPIRE_CLOCK"; clock: "game" | "shot" }
  // fluxo de períodos
  | { type: "ADVANCE_PERIOD" }
  | { type: "PREVIOUS_PERIOD" }
  | { type: "FINISH_GAME" }
  | { type: "REOPEN_GAME" }
  // meta
  | { type: "SET_NAME"; team: TeamKey; name: string }
  | { type: "SET_CONFIG"; config: Partial<BasketballMatchConfig> }
  | { type: "SET_THEME"; display: BasketballDisplayConfig }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function updateTeam(
  state: BasketballState,
  team: TeamKey,
  updater: (team: BasketballTeamState) => BasketballTeamState,
): BasketballState {
  if (team === "A") return { ...state, teamA: updater(state.teamA) };
  return { ...state, teamB: updater(state.teamB) };
}

function startGameClock(state: BasketballState, nowMs: number, nowIso: string): BasketballState {
  if (state.status === "finished") return state;
  if (state.gameClock.isRunning) return state;

  const effective = clockRemainingMs(state.gameClock, nowMs);
  if (effective <= 0) return state;

  const nextGameClock: BasketballClockState = { isRunning: true, remainingMs: effective, startedAt: nowIso };
  let nextShotClock = state.shotClock;

  if (state.config.useShotClock && state.config.autoStartShotClockWithGameClock) {
    const shotEffective = clockRemainingMs(state.shotClock, nowMs);
    if (shotEffective > 0) {
      nextShotClock = { isRunning: true, remainingMs: shotEffective, startedAt: nowIso };
    }
  }

  return { ...state, gameClock: nextGameClock, shotClock: nextShotClock };
}

function pauseGameClock(state: BasketballState, nowMs: number): BasketballState {
  return {
    ...state,
    gameClock: materializeClock(state.gameClock, nowMs),
    shotClock: materializeClock(state.shotClock, nowMs),
  };
}

function resetShotClockState(
  state: BasketballState,
  nowMs: number,
  nowIso: string,
  seconds?: number,
): BasketballState {
  if (!state.config.useShotClock) return state;

  const secondsValue = clamp(Math.round(seconds ?? state.config.shotClockSeconds), 1, 99);
  const isRunning = state.gameClock.isRunning && clockRemainingMs(state.gameClock, nowMs) > 0;

  return {
    ...state,
    shotClock: {
      isRunning,
      remainingMs: secondsValue * 1000,
      startedAt: isRunning ? nowIso : null,
    },
  };
}

function buildHistoryEntry(state: BasketballState): BasketballPeriodHistoryEntry {
  const periodPoints = getCurrentPeriodPoints(state);

  return {
    periodNumber: state.currentPeriod + 1,
    isOvertime: isOvertime(state),
    teamAName: state.teamA.name,
    teamBName: state.teamB.name,
    teamAPoints: state.teamA.points,
    teamBPoints: state.teamB.points,
    teamAPeriodPoints: periodPoints.teamA,
    teamBPeriodPoints: periodPoints.teamB,
    teamAFouls: state.teamA.fouls,
    teamBFouls: state.teamB.fouls,
    teamATimeoutsUsed: state.teamA.timeoutsUsed,
    teamBTimeoutsUsed: state.teamB.timeoutsUsed,
  };
}

function resolveLeaderName(state: BasketballState): string | null {
  if (state.teamA.points === state.teamB.points) return null;
  return state.teamA.points > state.teamB.points ? state.teamA.name : state.teamB.name;
}

export function basketballReducer(
  state: BasketballState,
  action: BasketballAction,
  nowIso: string,
): BasketballState {
  const nowMs = Date.parse(nowIso);
  const locked = state.status === "finished";

  switch (action.type) {
    case "ADD_POINTS": {
      if (locked) return state;

      let nextState = updateTeam(state, action.team, (team) => ({
        ...team,
        points: team.points + action.points,
      }));

      if (state.config.resetShotClockOnScore) {
        nextState = resetShotClockState(nextState, nowMs, nowIso);
      }

      if (state.config.flipPossessionOnScore) {
        nextState = { ...nextState, possession: action.team === "A" ? "B" : "A" };
      }

      return nextState;
    }

    case "REMOVE_POINTS": {
      if (locked) return state;
      return updateTeam(state, action.team, (team) => ({
        ...team,
        points: Math.max(0, team.points - action.points),
      }));
    }

    case "RESET_TEAM_POINTS": {
      if (locked) return state;
      return updateTeam(state, action.team, (team) => ({ ...team, points: 0 }));
    }

    case "ADD_FOUL": {
      if (locked || !state.config.useFouls) return state;

      let nextState = updateTeam(state, action.team, (team) => ({
        ...team,
        fouls: Math.min(99, team.fouls + 1),
      }));

      if (state.config.pauseClocksOnFoul) {
        nextState = pauseGameClock(nextState, nowMs);
      }

      return nextState;
    }

    case "REMOVE_FOUL": {
      if (!state.config.useFouls) return state;
      return updateTeam(state, action.team, (team) => ({ ...team, fouls: Math.max(0, team.fouls - 1) }));
    }

    case "ADD_TIMEOUT": {
      if (locked) return state;

      const team = action.team === "A" ? state.teamA : state.teamB;
      if (team.timeoutsUsed >= timeoutAllowance(state)) return state;

      const nextState = updateTeam(state, action.team, (t) => ({ ...t, timeoutsUsed: t.timeoutsUsed + 1 }));
      return pauseGameClock(nextState, nowMs);
    }

    case "REMOVE_TIMEOUT": {
      return updateTeam(state, action.team, (team) => ({
        ...team,
        timeoutsUsed: Math.max(0, team.timeoutsUsed - 1),
      }));
    }

    case "SET_POSSESSION": {
      const nextState: BasketballState = { ...state, possession: action.team };
      if (action.team !== null && state.config.useShotClock && state.config.resetShotClockOnPossessionChange) {
        return resetShotClockState(nextState, nowMs, nowIso);
      }
      return nextState;
    }

    case "TOGGLE_POSSESSION": {
      const next: TeamKey = state.possession === "A" ? "B" : "A";
      const nextState: BasketballState = { ...state, possession: next };
      if (state.config.useShotClock && state.config.resetShotClockOnPossessionChange) {
        return resetShotClockState(nextState, nowMs, nowIso);
      }
      return nextState;
    }

    case "START_GAME_CLOCK":
      return startGameClock(state, nowMs, nowIso);

    case "PAUSE_GAME_CLOCK":
      return pauseGameClock(state, nowMs);

    case "TOGGLE_GAME_CLOCK":
      return state.gameClock.isRunning
        ? pauseGameClock(state, nowMs)
        : startGameClock(state, nowMs, nowIso);

    case "RESET_GAME_CLOCK": {
      return {
        ...state,
        gameClock: {
          isRunning: false,
          remainingMs: getPeriodLengthMs(state.currentPeriod, state.config),
          startedAt: null,
        },
        shotClock: { isRunning: false, remainingMs: state.config.shotClockSeconds * 1000, startedAt: null },
      };
    }

    case "ADJUST_GAME_CLOCK": {
      const effective = clockRemainingMs(state.gameClock, nowMs);
      const nextRemaining = clamp(effective + action.deltaMs, 0, MAX_CLOCK_MS);

      return {
        ...state,
        gameClock: {
          isRunning: state.gameClock.isRunning,
          remainingMs: nextRemaining,
          startedAt: state.gameClock.isRunning ? nowIso : null,
        },
      };
    }

    case "SET_GAME_CLOCK": {
      return {
        ...state,
        gameClock: { isRunning: false, remainingMs: clamp(action.remainingMs, 0, MAX_CLOCK_MS), startedAt: null },
        shotClock: materializeClock(state.shotClock, nowMs),
      };
    }

    case "RESET_SHOT_CLOCK":
      return resetShotClockState(state, nowMs, nowIso, action.seconds);

    case "START_SHOT_CLOCK": {
      if (!state.config.useShotClock || state.shotClock.isRunning) return state;

      const effective = clockRemainingMs(state.shotClock, nowMs);
      if (effective <= 0) return state;

      return { ...state, shotClock: { isRunning: true, remainingMs: effective, startedAt: nowIso } };
    }

    case "PAUSE_SHOT_CLOCK": {
      if (!state.shotClock.isRunning) return state;
      return { ...state, shotClock: materializeClock(state.shotClock, nowMs) };
    }

    case "EXPIRE_CLOCK": {
      if (action.clock === "game") {
        if (!state.gameClock.isRunning) return state;

        return {
          ...state,
          gameClock: { isRunning: false, remainingMs: 0, startedAt: null },
          shotClock: materializeClock(state.shotClock, nowMs),
        };
      }

      if (!state.config.useShotClock || !state.shotClock.isRunning) return state;

      // Estouro da posse é virada de bola: se a automação estiver ligada e houver um time
      // de posse definido, troca na hora (não espera o cronômetro de jogo ser retomado) e já
      // deixa a posse de 24s cheia pro time novo, pausada junto com o jogo.
      const flipsPossession = state.config.flipPossessionOnShotClockViolation && state.possession !== null;

      return {
        ...state,
        shotClock: flipsPossession
          ? { isRunning: false, remainingMs: state.config.shotClockSeconds * 1000, startedAt: null }
          : { isRunning: false, remainingMs: 0, startedAt: null },
        gameClock: materializeClock(state.gameClock, nowMs),
        possession: flipsPossession ? (state.possession === "A" ? "B" : "A") : state.possession,
      };
    }

    case "ADVANCE_PERIOD": {
      if (locked) return state;

      const historyEntry = buildHistoryEntry(state);
      const history = [historyEntry, ...state.history];
      const tied = state.teamA.points === state.teamB.points;
      const hasNextRegularPeriod = state.currentPeriod < state.config.totalPeriods - 1;

      if (hasNextRegularPeriod) {
        const nextPeriod = state.currentPeriod + 1;
        const halfBoundary = Math.ceil(state.config.totalPeriods / 2);
        const resetTimeouts =
          state.config.timeoutsResetMode === "period" ||
          (state.config.timeoutsResetMode === "half" && nextPeriod === halfBoundary);

        return {
          ...state,
          currentPeriod: nextPeriod,
          teamA: {
            ...state.teamA,
            fouls: state.config.resetFoulsEachPeriod ? 0 : state.teamA.fouls,
            timeoutsUsed: resetTimeouts ? 0 : state.teamA.timeoutsUsed,
          },
          teamB: {
            ...state.teamB,
            fouls: state.config.resetFoulsEachPeriod ? 0 : state.teamB.fouls,
            timeoutsUsed: resetTimeouts ? 0 : state.teamB.timeoutsUsed,
          },
          gameClock: { isRunning: false, remainingMs: getPeriodLengthMs(nextPeriod, state.config), startedAt: null },
          shotClock: { isRunning: false, remainingMs: state.config.shotClockSeconds * 1000, startedAt: null },
          history,
        };
      }

      if (tied && state.config.useOvertime) {
        const nextPeriod = state.currentPeriod + 1;

        return {
          ...state,
          currentPeriod: nextPeriod,
          teamA: {
            ...state.teamA,
            fouls: state.config.resetFoulsEachPeriod ? 0 : state.teamA.fouls,
            timeoutsUsed: 0,
          },
          teamB: {
            ...state.teamB,
            fouls: state.config.resetFoulsEachPeriod ? 0 : state.teamB.fouls,
            timeoutsUsed: 0,
          },
          gameClock: { isRunning: false, remainingMs: getPeriodLengthMs(nextPeriod, state.config), startedAt: null },
          shotClock: { isRunning: false, remainingMs: state.config.shotClockSeconds * 1000, startedAt: null },
          history,
        };
      }

      return {
        ...state,
        status: "finished",
        winner: tied ? null : resolveLeaderName(state),
        gameClock: materializeClock(state.gameClock, nowMs),
        shotClock: materializeClock(state.shotClock, nowMs),
        history,
      };
    }

    case "PREVIOUS_PERIOD": {
      if (state.currentPeriod === 0 || state.history.length === 0) return state;

      const [entry, ...restHistory] = state.history;

      return {
        ...state,
        currentPeriod: state.currentPeriod - 1,
        teamA: { ...state.teamA, fouls: entry.teamAFouls, timeoutsUsed: entry.teamATimeoutsUsed },
        teamB: { ...state.teamB, fouls: entry.teamBFouls, timeoutsUsed: entry.teamBTimeoutsUsed },
        gameClock: { isRunning: false, remainingMs: 0, startedAt: null },
        shotClock: materializeClock(state.shotClock, nowMs),
        history: restHistory,
      };
    }

    case "FINISH_GAME": {
      if (locked) return state;

      const alreadyRecorded = state.history[0]?.periodNumber === state.currentPeriod + 1;
      const history = alreadyRecorded ? state.history : [buildHistoryEntry(state), ...state.history];

      return {
        ...state,
        status: "finished",
        winner: resolveLeaderName(state),
        gameClock: materializeClock(state.gameClock, nowMs),
        shotClock: materializeClock(state.shotClock, nowMs),
        history,
      };
    }

    case "REOPEN_GAME": {
      return { ...state, status: "live", winner: null };
    }

    case "SET_NAME": {
      return updateTeam(state, action.team, (team) => ({ ...team, name: action.name }));
    }

    case "SET_CONFIG": {
      const nextConfig = normalizeBasketballConfig({ ...state.config, ...action.config });
      const wasOvertime = isOvertime(state);
      const nextCurrentPeriod = wasOvertime
        ? state.currentPeriod
        : Math.min(state.currentPeriod, nextConfig.totalPeriods - 1);

      let nextGameClock = state.gameClock;
      if (!nextGameClock.isRunning) {
        const oldLength = getPeriodLengthMs(state.currentPeriod, state.config);
        if (nextGameClock.remainingMs === oldLength) {
          nextGameClock = { ...nextGameClock, remainingMs: getPeriodLengthMs(nextCurrentPeriod, nextConfig) };
        }
      }

      let nextShotClock = state.shotClock;
      if (!nextShotClock.isRunning) {
        const oldFull = state.config.shotClockSeconds * 1000;
        if (nextShotClock.remainingMs === oldFull) {
          nextShotClock = { ...nextShotClock, remainingMs: nextConfig.shotClockSeconds * 1000 };
        }
      }

      return {
        ...state,
        config: nextConfig,
        currentPeriod: nextCurrentPeriod,
        gameClock: nextGameClock,
        shotClock: nextShotClock,
      };
    }

    case "SET_THEME":
      return { ...state, display: normalizeBasketballDisplay(action.display) };

    case "RESET":
      return createInitialBasketballState(state.teamA.name, state.teamB.name, state.config, state.display);

    default:
      return state;
  }
}
