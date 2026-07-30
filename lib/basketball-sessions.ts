import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_BASKETBALL_CONFIG,
  DEFAULT_BASKETBALL_DISPLAY,
  basketballReducer,
  createInitialBasketballState,
  normalizeBasketballState,
  type BasketballDisplayConfig,
  type BasketballMatchConfig,
  type BasketballState,
} from "@/lib/basketball";

const teamKeySchema = z.enum(["A", "B"]);
const pointsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const basketballConfigPatchSchema = z
  .object({
    totalPeriods: z.number().int().min(1).max(12),
    periodMinutes: z.number().int().min(1).max(60),
    overtimeMinutes: z.number().int().min(1).max(30),
    useOvertime: z.boolean(),
    useFouls: z.boolean(),
    foulsForBonus: z.number().int().min(1).max(20),
    resetFoulsEachPeriod: z.boolean(),
    timeoutsPerTeam: z.number().int().min(0).max(20),
    overtimeTimeoutsPerTeam: z.number().int().min(0).max(10),
    timeoutsResetMode: z.enum(["match", "half", "period"]),
    useShotClock: z.boolean(),
    shotClockSeconds: z.number().int().min(5).max(60),
    shotClockResetSeconds: z.number().int().min(1).max(60),
    autoStartShotClockWithGameClock: z.boolean(),
    resetShotClockOnScore: z.boolean(),
    flipPossessionOnScore: z.boolean(),
    pauseClocksOnFoul: z.boolean(),
    flipPossessionOnShotClockViolation: z.boolean(),
    resetShotClockOnPossessionChange: z.boolean(),
  })
  .partial();

const basketballDisplaySchema = z.object({
  cardBackgroundColor: z.string().trim().min(1),
  cardFontColor: z.string().trim().min(1),
  accentColor: z.string().trim().min(1),
  teamNameSize: z.number().int(),
  scoreSize: z.number().int(),
  clockSize: z.number().int(),
  showTeamNames: z.boolean(),
  showPeriod: z.boolean(),
  showGameClock: z.boolean(),
  showShotClock: z.boolean(),
  showFouls: z.boolean(),
  showTimeouts: z.boolean(),
  showPossession: z.boolean(),
  showPeriodSummary: z.boolean(),
  showTenths: z.boolean(),
  soundAlertsEnabled: z.boolean(),
});

export const createBasketballSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  teamAName: z.string().trim().min(1).max(60).optional(),
  teamBName: z.string().trim().min(1).max(60).optional(),
  config: basketballConfigPatchSchema.optional(),
  display: basketballDisplaySchema.partial().optional(),
});

const basketballActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_POINTS"), team: teamKeySchema, points: pointsSchema }),
  z.object({ type: z.literal("REMOVE_POINTS"), team: teamKeySchema, points: pointsSchema }),
  z.object({ type: z.literal("RESET_TEAM_POINTS"), team: teamKeySchema }),
  z.object({ type: z.literal("ADD_FOUL"), team: teamKeySchema }),
  z.object({ type: z.literal("REMOVE_FOUL"), team: teamKeySchema }),
  z.object({ type: z.literal("ADD_TIMEOUT"), team: teamKeySchema }),
  z.object({ type: z.literal("REMOVE_TIMEOUT"), team: teamKeySchema }),
  z.object({ type: z.literal("SET_POSSESSION"), team: z.union([teamKeySchema, z.null()]) }),
  z.object({ type: z.literal("TOGGLE_POSSESSION") }),
  z.object({ type: z.literal("START_GAME_CLOCK") }),
  z.object({ type: z.literal("PAUSE_GAME_CLOCK") }),
  z.object({ type: z.literal("TOGGLE_GAME_CLOCK") }),
  z.object({ type: z.literal("RESET_GAME_CLOCK") }),
  z.object({ type: z.literal("ADJUST_GAME_CLOCK"), deltaMs: z.number().int().min(-600_000).max(600_000) }),
  z.object({ type: z.literal("SET_GAME_CLOCK"), remainingMs: z.number().int().min(0).max(99 * 60 * 1000) }),
  z.object({ type: z.literal("RESET_SHOT_CLOCK"), seconds: z.number().int().min(1).max(99).optional() }),
  z.object({ type: z.literal("START_SHOT_CLOCK") }),
  z.object({ type: z.literal("PAUSE_SHOT_CLOCK") }),
  z.object({ type: z.literal("EXPIRE_CLOCK"), clock: z.enum(["game", "shot"]) }),
  z.object({ type: z.literal("ADVANCE_PERIOD") }),
  z.object({ type: z.literal("PREVIOUS_PERIOD") }),
  z.object({ type: z.literal("FINISH_GAME") }),
  z.object({ type: z.literal("REOPEN_GAME") }),
  z.object({ type: z.literal("SET_NAME"), team: teamKeySchema, name: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("SET_CONFIG"), config: basketballConfigPatchSchema }),
  z.object({ type: z.literal("SET_THEME"), display: basketballDisplaySchema }),
  z.object({ type: z.literal("RESET") }),
  // Não é uma BasketballAction do reducer puro — tratada à parte em applyBasketballSessionAction,
  // que restaura o `previousState` salvo no servidor (a cada mutação bem-sucedida).
  z.object({ type: z.literal("UNDO") }),
]);

export const basketballMutationSchema = z.object({
  controlToken: z.string().trim().min(1).optional(),
  action: basketballActionSchema,
});

export type BasketballSessionRecord = {
  id: string;
  title: string;
  controlToken: string;
  state: Prisma.JsonValue;
  previousState: Prisma.JsonValue | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicBasketballSessionRecord = Omit<BasketballSessionRecord, "controlToken" | "previousState">;
export type ActiveBasketballSessionRecord = Pick<PublicBasketballSessionRecord, "id" | "title" | "updatedAt">;

export function toPublicBasketballSession(session: BasketballSessionRecord): PublicBasketballSessionRecord {
  const { controlToken: _controlToken, previousState: _previousState, ...publicSession } = session;
  return publicSession;
}

/**
 * Envelope usado pelo GET de [id], pela resposta do PATCH e pelo evento SSE `session`.
 * `serverNow` é irmão de `state`, não faz parte do estado persistido — existe só para o
 * cliente calibrar o offset entre o relógio dele e o do servidor (ver lib/basketball.ts).
 * `canUndo` deriva de `previousState`, mas o conteúdo dele nunca vai pro cliente — o UNDO
 * é resolvido inteiramente no servidor (ver applyBasketballSessionAction).
 */
export function toBasketballSessionPayload(session: BasketballSessionRecord) {
  return {
    ...toPublicBasketballSession(session),
    canUndo: session.previousState !== null,
    serverNow: new Date().toISOString(),
  };
}

function toJsonValue(value: BasketballState): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function readState(state: Prisma.JsonValue): BasketballState {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return createInitialBasketballState();
  }

  return normalizeBasketballState(state as unknown as BasketballState);
}

export async function listBasketballSessions(): Promise<BasketballSessionRecord[]> {
  return prisma.basketballSession.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function listActiveBasketballSessions(): Promise<ActiveBasketballSessionRecord[]> {
  const sessions = await prisma.basketballSession.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
  }));
}

export async function getBasketballSessionById(id: string) {
  return prisma.basketballSession.findUnique({ where: { id } });
}

export async function createBasketballSession(input: z.infer<typeof createBasketballSessionSchema>) {
  const parsed = createBasketballSessionSchema.parse(input);
  const title = parsed.title ?? "Placar de Basquete";
  const teamAName = parsed.teamAName ?? "Time A";
  const teamBName = parsed.teamBName ?? "Time B";
  const config = {
    ...DEFAULT_BASKETBALL_CONFIG,
    ...(parsed.config ?? {}),
  } satisfies BasketballMatchConfig;
  const display = {
    ...DEFAULT_BASKETBALL_DISPLAY,
    ...(parsed.display ?? {}),
  } satisfies BasketballDisplayConfig;

  return prisma.basketballSession.create({
    data: {
      title,
      state: toJsonValue(createInitialBasketballState(teamAName, teamBName, config, display)),
    },
  });
}

export async function archiveBasketballSession(id: string) {
  return prisma.basketballSession.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

export async function deleteBasketballSession(id: string) {
  const result = await prisma.basketballSession.deleteMany({ where: { id } });
  return result.count > 0;
}

/**
 * Núcleo da persistência: a action é reaplicada contra o estado do BANCO (não o do
 * cliente), com `nowIso` carimbado pelo SERVIDOR — essa é a única fonte de "agora" que
 * importa para o relógio (ver lib/basketball.ts, seção do reducer). Se a action for
 * idempotente (ex: EXPIRE_CLOCK numa sessão já parada), o reducer devolve a MESMA
 * referência e nenhuma escrita acontece.
 *
 * UNDO é tratado à parte, fora do reducer puro: cada mutação bem-sucedida guarda o estado
 * ANTERIOR em `previousState`; desfazer troca os dois campos de lugar. Isso dá, de graça,
 * um "refazer" — apertar Desfazer de novo restaura o que acabou de ser desfeito.
 */
export async function applyBasketballSessionAction(
  id: string,
  mutation: z.infer<typeof basketballMutationSchema>,
) {
  const session = await prisma.basketballSession.findUnique({ where: { id } });
  if (!session) return null;

  const parsed = basketballMutationSchema.parse(mutation);

  if (parsed.action.type === "UNDO") {
    if (session.previousState === null) return session;

    return prisma.basketballSession.update({
      where: { id },
      data: {
        state: session.previousState as Prisma.InputJsonValue,
        previousState: session.state as Prisma.InputJsonValue,
      },
    });
  }

  const currentState = readState(session.state);
  const nowIso = new Date().toISOString();
  const nextState = basketballReducer(currentState, parsed.action, nowIso);

  if (nextState === currentState) return session;

  return prisma.basketballSession.update({
    where: { id },
    data: {
      state: toJsonValue(nextState),
      previousState: session.state as Prisma.InputJsonValue,
    },
  });
}

export async function assertBasketballControlToken(sessionId: string, controlToken?: string) {
  const session = await prisma.basketballSession.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false as const, status: 404, message: "Sessão não encontrada" };

  if (controlToken && session.controlToken !== controlToken) {
    return { ok: false as const, status: 403, message: "Token de controle inválido" };
  }

  return { ok: true as const, session };
}
