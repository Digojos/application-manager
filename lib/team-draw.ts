export interface TeamDrawPlayer {
  id: string;
  name: string;
  skill: number;
  role: string | null;
}

export interface TeamDrawSettings {
  teamCount: number;
  playersPerTeam: number;
  balanceByRole: boolean;
}

export interface TeamDrawTeam {
  name: string;
  players: TeamDrawPlayer[];
  totalSkill: number;
}

export interface TeamDrawResult {
  teams: TeamDrawTeam[];
  bench: TeamDrawPlayer[];
  createdAt: string;
  skillSpread: number;
}

export interface TeamDrawState {
  players: TeamDrawPlayer[];
  roleCatalog: string[];
  settings: TeamDrawSettings;
  result: TeamDrawResult | null;
}

export interface TeamDrawPlayerInput {
  name: string;
  skill: number;
  role?: string | null;
}

export type TeamDrawAction =
  | { type: "ADD_PLAYER"; player: TeamDrawPlayerInput }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "CLEAR_PLAYERS" }
  | { type: "IMPORT_PLAYERS"; players: TeamDrawPlayerInput[]; replace?: boolean }
  | { type: "ADD_ROLE"; role: string }
  | { type: "REMOVE_ROLE"; role: string }
  | { type: "SET_ROLE_CATALOG"; roles: string[] }
  | { type: "SET_SETTINGS"; settings: Partial<TeamDrawSettings> }
  | { type: "DRAW_TEAMS" }
  | { type: "MOVE_PLAYER"; playerId: string; fromTeamIndex: number; toTeamIndex: number }
  | { type: "RESET_DRAW" };

const TEAM_COUNT_MIN = 2;
const TEAM_COUNT_MAX = 12;
const PLAYERS_PER_TEAM_MIN = 1;
const PLAYERS_PER_TEAM_MAX = 30;
const SKILL_MIN = 1;
const SKILL_MAX = 10;
const ROLE_MAX_LENGTH = 40;

export const DEFAULT_TEAM_DRAW_SETTINGS: TeamDrawSettings = {
  teamCount: 2,
  playersPerTeam: 5,
  balanceByRole: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRole(role?: string | null): string | null {
  if (!role) return null;
  const nextRole = role.trim().slice(0, ROLE_MAX_LENGTH);
  return nextRole.length > 0 ? nextRole : null;
}

function normalizeName(name: string): string {
  return name.trim().slice(0, 80);
}

function makePlayerId() {
  return crypto.randomUUID();
}

function sanitizeSkill(skill: number): number {
  return clamp(Math.round(skill), SKILL_MIN, SKILL_MAX);
}

export function normalizeTeamDrawSettings(settings: TeamDrawSettings): TeamDrawSettings {
  return {
    teamCount: clamp(Math.round(settings.teamCount), TEAM_COUNT_MIN, TEAM_COUNT_MAX),
    playersPerTeam: clamp(Math.round(settings.playersPerTeam), PLAYERS_PER_TEAM_MIN, PLAYERS_PER_TEAM_MAX),
    balanceByRole: Boolean(settings.balanceByRole),
  };
}

export function normalizeRoleCatalog(roles: string[]): string[] {
  const set = new Set<string>();

  for (const role of roles) {
    const normalized = normalizeRole(role);
    if (!normalized) continue;
    set.add(normalized);
  }

  return Array.from(set);
}

export function normalizePlayer(input: TeamDrawPlayerInput & { id?: string }): TeamDrawPlayer {
  return {
    id: input.id ?? makePlayerId(),
    name: normalizeName(input.name),
    skill: sanitizeSkill(input.skill),
    role: normalizeRole(input.role),
  };
}

export function createInitialTeamDrawState(): TeamDrawState {
  return {
    players: [],
    roleCatalog: [],
    settings: DEFAULT_TEAM_DRAW_SETTINGS,
    result: null,
  };
}

export function normalizeTeamDrawState(state: TeamDrawState): TeamDrawState {
  const settings = normalizeTeamDrawSettings(state.settings ?? DEFAULT_TEAM_DRAW_SETTINGS);

  return {
    players: Array.isArray(state.players)
      ? state.players
          .map((player) => normalizePlayer(player))
          .filter((player) => player.name.length > 0)
      : [],
    roleCatalog: Array.isArray(state.roleCatalog) ? normalizeRoleCatalog(state.roleCatalog) : [],
    settings,
    result: state.result ? normalizeTeamDrawResult(state.result, settings) : null,
  };
}

function normalizeTeamDrawResult(result: TeamDrawResult, settings: TeamDrawSettings): TeamDrawResult {
  const normalizedTeams = result.teams.slice(0, settings.teamCount).map((team, index) => {
    const players = Array.isArray(team.players)
      ? team.players
          .map((player) => normalizePlayer(player))
          .filter((player) => player.name.length > 0)
          .slice(0, settings.playersPerTeam)
      : [];

    return {
      name: team.name || `Time ${index + 1}`,
      players,
      totalSkill: players.reduce((total, player) => total + player.skill, 0),
    };
  });

  while (normalizedTeams.length < settings.teamCount) {
    normalizedTeams.push({
      name: `Time ${normalizedTeams.length + 1}`,
      players: [],
      totalSkill: 0,
    });
  }

  const totals = normalizedTeams.map((team) => team.totalSkill);

  return {
    teams: normalizedTeams,
    bench: Array.isArray(result.bench)
      ? result.bench
          .map((player) => normalizePlayer(player))
          .filter((player) => player.name.length > 0)
      : [],
    createdAt: result.createdAt,
    skillSpread: totals.length > 0 ? Math.max(...totals) - Math.min(...totals) : 0,
  };
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];

  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
}

function roleCount(team: TeamDrawTeam, role: string | null): number {
  if (!role) return 0;
  return team.players.filter((player) => player.role === role).length;
}

function sortCandidatesForDraw(players: TeamDrawPlayer[]) {
  return shuffled(players).sort((a, b) => b.skill - a.skill);
}

function computeSkillSpread(teams: TeamDrawTeam[]) {
  if (teams.length === 0) return 0;
  const totals = teams.map((team) => team.totalSkill);
  return Math.max(...totals) - Math.min(...totals);
}

export function drawBalancedTeams(state: TeamDrawState): TeamDrawState {
  const safeState = normalizeTeamDrawState(state);
  const slots = safeState.settings.teamCount * safeState.settings.playersPerTeam;

  if (safeState.players.length < slots) {
    throw new Error("Jogadores insuficientes para preencher os times.");
  }

  const orderedPlayers = sortCandidatesForDraw(safeState.players);
  const pickedPlayers = orderedPlayers.slice(0, slots);
  const bench = orderedPlayers.slice(slots);

  const teams: TeamDrawTeam[] = Array.from({ length: safeState.settings.teamCount }, (_, index) => ({
    name: `Time ${index + 1}`,
    players: [],
    totalSkill: 0,
  }));

  for (const player of pickedPlayers) {
    const sortedTeamIndexes = teams
      .map((team, index) => ({ team, index }))
      .filter(({ team }) => team.players.length < safeState.settings.playersPerTeam)
      .sort((left, right) => {
        if (left.team.players.length !== right.team.players.length) {
          return left.team.players.length - right.team.players.length;
        }

        if (safeState.settings.balanceByRole) {
          const leftRoleCount = roleCount(left.team, player.role);
          const rightRoleCount = roleCount(right.team, player.role);

          if (leftRoleCount !== rightRoleCount) {
            return leftRoleCount - rightRoleCount;
          }
        }

        if (left.team.totalSkill !== right.team.totalSkill) {
          return left.team.totalSkill - right.team.totalSkill;
        }

        return left.index - right.index;
      });

    const target = sortedTeamIndexes[0];
    if (!target) continue;

    target.team.players.push(player);
    target.team.totalSkill += player.skill;
  }

  return {
    ...safeState,
    result: {
      teams,
      bench,
      createdAt: new Date().toISOString(),
      skillSpread: computeSkillSpread(teams),
    },
  };
}

export function movePlayerBetweenTeams(
  state: TeamDrawState,
  fromTeamIndex: number,
  toTeamIndex: number,
  playerId: string,
): TeamDrawState {
  const safeState = normalizeTeamDrawState(state);
  if (!safeState.result) {
    throw new Error("Não há sorteio para ajustar.");
  }

  const teams = safeState.result.teams.map((team) => ({
    ...team,
    players: [...team.players],
  }));

  const fromTeam = teams[fromTeamIndex];
  const toTeam = teams[toTeamIndex];

  if (!fromTeam || !toTeam) {
    throw new Error("Time de origem ou destino inválido.");
  }

  if (toTeam.players.length >= safeState.settings.playersPerTeam) {
    throw new Error("O time de destino já está completo.");
  }

  const playerIndex = fromTeam.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) {
    throw new Error("Jogador não encontrado no time de origem.");
  }

  const [player] = fromTeam.players.splice(playerIndex, 1);
  toTeam.players.push(player);

  for (const team of teams) {
    team.totalSkill = team.players.reduce((total, current) => total + current.skill, 0);
  }

  return {
    ...safeState,
    result: {
      ...safeState.result,
      teams,
      skillSpread: computeSkillSpread(teams),
      createdAt: new Date().toISOString(),
    },
  };
}

function hasNameConflict(players: TeamDrawPlayer[], name: string): boolean {
  const normalizedName = name.trim().toLocaleLowerCase("pt-BR");
  return players.some((player) => player.name.toLocaleLowerCase("pt-BR") === normalizedName);
}

function applyImportedPlayers(
  currentPlayers: TeamDrawPlayer[],
  imported: TeamDrawPlayerInput[],
  replace: boolean,
): TeamDrawPlayer[] {
  const base = replace ? [] : [...currentPlayers];

  for (const playerInput of imported) {
    if (hasNameConflict(base, playerInput.name)) continue;
    const player = normalizePlayer(playerInput);
    if (!player.name) continue;
    base.push(player);
  }

  return base;
}

export function applyTeamDrawAction(state: TeamDrawState, action: TeamDrawAction): TeamDrawState {
  const safeState = normalizeTeamDrawState(state);

  switch (action.type) {
    case "ADD_PLAYER": {
      const candidate = normalizePlayer(action.player);
      if (!candidate.name) {
        throw new Error("Nome do jogador é obrigatório.");
      }

      if (hasNameConflict(safeState.players, candidate.name)) {
        throw new Error("Jogador com este nome já existe.");
      }

      return {
        ...safeState,
        players: [...safeState.players, candidate],
        result: null,
      };
    }

    case "REMOVE_PLAYER": {
      return {
        ...safeState,
        players: safeState.players.filter((player) => player.id !== action.playerId),
        result: null,
      };
    }

    case "CLEAR_PLAYERS": {
      return {
        ...safeState,
        players: [],
        result: null,
      };
    }

    case "IMPORT_PLAYERS": {
      return {
        ...safeState,
        players: applyImportedPlayers(safeState.players, action.players, Boolean(action.replace)),
        result: null,
      };
    }

    case "ADD_ROLE": {
      return {
        ...safeState,
        roleCatalog: normalizeRoleCatalog([...safeState.roleCatalog, action.role]),
      };
    }

    case "REMOVE_ROLE": {
      const roleCatalog = safeState.roleCatalog.filter((item) => item !== action.role);
      return {
        ...safeState,
        roleCatalog,
        players: safeState.players.map((player) =>
          player.role === action.role ? { ...player, role: null } : player,
        ),
      };
    }

    case "SET_ROLE_CATALOG": {
      const roleCatalog = normalizeRoleCatalog(action.roles);
      return {
        ...safeState,
        roleCatalog,
        players: safeState.players.map((player) =>
          player.role && !roleCatalog.includes(player.role) ? { ...player, role: null } : player,
        ),
      };
    }

    case "SET_SETTINGS": {
      return {
        ...safeState,
        settings: normalizeTeamDrawSettings({
          ...safeState.settings,
          ...action.settings,
        }),
        result: null,
      };
    }

    case "DRAW_TEAMS":
      return drawBalancedTeams(safeState);

    case "MOVE_PLAYER":
      return movePlayerBetweenTeams(
        safeState,
        action.fromTeamIndex,
        action.toTeamIndex,
        action.playerId,
      );

    case "RESET_DRAW": {
      return {
        ...safeState,
        result: null,
      };
    }
  }
}
