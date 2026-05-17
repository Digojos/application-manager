export interface ScoreboardTeamState {
  name: string;
  points: number;
  sets: number;
}

export interface ScoreboardMatchConfig {
  totalSets: number;
  pointsPerSet: number;
  tieBreakPoints: number;
  minAdvantage: number;
  useTieBreak: boolean;
}

export interface ThemeConfig {
  cardBackgroundColor: string;
  cardFontColor: string;
  teamNameSize: number;
  scoreSize: number;
  showTeamNames: boolean;
  showSetDots: boolean;
  showSetSummary: boolean;
}

export interface ScoreboardHistoryEntry {
  setNumber: number;
  teamAName: string;
  teamBName: string;
  teamAScore: number;
  teamBScore: number;
  winnerName: string;
}

export interface ScoreboardState {
  teamA: ScoreboardTeamState;
  teamB: ScoreboardTeamState;
  config: ScoreboardMatchConfig;
  display: ThemeConfig;
  currentSet: number;
  history: ScoreboardHistoryEntry[];
  winner: string | null;
}

export type ScoreboardAction =
  | { type: "ADD_POINT"; team: "A" | "B" }
  | { type: "REMOVE_POINT"; team: "A" | "B" }
  | { type: "SWAP_POINT"; from: "A" | "B" }
  | { type: "FINISH_SET" }
  | { type: "RESET" }
  | { type: "SET_NAME"; team: "A" | "B"; name: string }
  | { type: "SET_CONFIG"; config: ScoreboardMatchConfig }
  | { type: "SET_THEME"; display: ThemeConfig };

export const DEFAULT_SCOREBOARD_CONFIG: ScoreboardMatchConfig = {
  totalSets: 3,
  pointsPerSet: 25,
  tieBreakPoints: 15,
  minAdvantage: 2,
  useTieBreak: true,
};

export const DEFAULT_SCOREBOARD_THEME: ThemeConfig = {
  cardBackgroundColor: "#ffffff",
  cardFontColor: "#111827",
  teamNameSize: 36,
  scoreSize: 120,
  showTeamNames: true,
  showSetDots: true,
  showSetSummary: true,
};

const TEAM_NAME_SIZE_MIN = 20;
const TEAM_NAME_SIZE_MAX = 56;
const SCORE_SIZE_MIN = 64;
const SCORE_SIZE_MAX = 240;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeScoreboardTheme(theme: ThemeConfig): ThemeConfig {
  return {
    cardBackgroundColor: theme.cardBackgroundColor,
    cardFontColor: theme.cardFontColor,
    teamNameSize: clamp(theme.teamNameSize, TEAM_NAME_SIZE_MIN, TEAM_NAME_SIZE_MAX),
    scoreSize: clamp(theme.scoreSize, SCORE_SIZE_MIN, SCORE_SIZE_MAX),
    showTeamNames: theme.showTeamNames ?? true,
    showSetDots: Boolean(theme.showSetDots),
    showSetSummary: Boolean(theme.showSetSummary),
  };
}

export function normalizeScoreboardConfig(config: ScoreboardMatchConfig): ScoreboardMatchConfig {
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

export function normalizeScoreboardState(state: ScoreboardState): ScoreboardState {
  return {
    ...state,
    teamA: {
      ...state.teamA,
      points: Math.max(0, state.teamA.points),
      sets: Math.max(0, state.teamA.sets),
    },
    teamB: {
      ...state.teamB,
      points: Math.max(0, state.teamB.points),
      sets: Math.max(0, state.teamB.sets),
    },
    config: normalizeScoreboardConfig(state.config),
    display: normalizeScoreboardTheme(state.display ?? DEFAULT_SCOREBOARD_THEME),
    currentSet: Math.max(0, state.currentSet),
    history: Array.isArray(state.history) ? state.history : [],
    winner: typeof state.winner === "string" ? state.winner : null,
  };
}

export function createInitialScoreboardState(
  nameA = "Time A",
  nameB = "Time B",
  config: ScoreboardMatchConfig = DEFAULT_SCOREBOARD_CONFIG,
  display: ThemeConfig = DEFAULT_SCOREBOARD_THEME
): ScoreboardState {
  return {
    teamA: { name: nameA, points: 0, sets: 0 },
    teamB: { name: nameB, points: 0, sets: 0 },
    config: normalizeScoreboardConfig(config),
    display: normalizeScoreboardTheme(display),
    currentSet: 0,
    history: [],
    winner: null,
  };
}

export function getSetTarget(setIndex: number, config: ScoreboardMatchConfig) {
  const isLastSet = setIndex === config.totalSets - 1;
  return config.useTieBreak && isLastSet ? config.tieBreakPoints : config.pointsPerSet;
}

export function resolveMatchWinner(
  teamA: ScoreboardTeamState,
  teamB: ScoreboardTeamState,
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

export function scoreboardReducer(state: ScoreboardState, action: ScoreboardAction): ScoreboardState {
  if (action.type === "SET_NAME") {
    if (action.team === "A") return { ...state, teamA: { ...state.teamA, name: action.name } };
    return { ...state, teamB: { ...state.teamB, name: action.name } };
  }

  if (action.type === "SET_CONFIG") {
    const nextConfig = normalizeScoreboardConfig(action.config);
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
    return createInitialScoreboardState(state.teamA.name, state.teamB.name, state.config, state.display);
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
    const historyEntry = {
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

export function normalizeTeamNameSize(value: number) {
  return clamp(value, TEAM_NAME_SIZE_MIN, TEAM_NAME_SIZE_MAX);
}

export function normalizeScoreSize(value: number) {
  return clamp(value, SCORE_SIZE_MIN, SCORE_SIZE_MAX);
}
