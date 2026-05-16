import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SCOREBOARD_CONFIG,
  createInitialScoreboardState,
  normalizeScoreboardState,
  scoreboardReducer,
  type ScoreboardAction,
  type ScoreboardMatchConfig,
  type ScoreboardState,
} from "@/lib/scoreboard";

const scoreboardSessionDb = prisma as typeof prisma & {
  scoreboardSession: any;
};

export const createScoreboardSessionSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  teamAName: z.string().trim().min(1).max(60).optional(),
  teamBName: z.string().trim().min(1).max(60).optional(),
  config: z
    .object({
      totalSets: z.number().int().min(1).max(9).optional(),
      pointsPerSet: z.number().int().min(1).max(99).optional(),
      tieBreakPoints: z.number().int().min(1).max(99).optional(),
      minAdvantage: z.number().int().min(1).max(10).optional(),
      useTieBreak: z.boolean().optional(),
    })
    .partial()
    .optional(),
});

export const scoreboardMutationSchema = z.object({
  controlToken: z.string().trim().min(1).optional(),
  action: z.union([
    z.object({ type: z.literal("ADD_POINT"), team: z.union([z.literal("A"), z.literal("B")]) }),
    z.object({ type: z.literal("REMOVE_POINT"), team: z.union([z.literal("A"), z.literal("B")]) }),
    z.object({ type: z.literal("SWAP_POINT"), from: z.union([z.literal("A"), z.literal("B")]) }),
    z.object({ type: z.literal("FINISH_SET") }),
    z.object({ type: z.literal("RESET") }),
    z.object({ type: z.literal("SET_NAME"), team: z.union([z.literal("A"), z.literal("B")]), name: z.string().trim().min(1).max(60) }),
    z.object({
      type: z.literal("SET_CONFIG"),
      config: z
        .object({
          totalSets: z.number().int().min(1).max(9).optional(),
          pointsPerSet: z.number().int().min(1).max(99).optional(),
          tieBreakPoints: z.number().int().min(1).max(99).optional(),
          minAdvantage: z.number().int().min(1).max(10).optional(),
          useTieBreak: z.boolean().optional(),
        })
        .partial(),
    }),
    z.object({
      type: z.literal("SET_THEME"),
      display: z.object({
        cardBackgroundColor: z.string().trim().min(1),
        cardFontColor: z.string().trim().min(1),
        teamNameSize: z.number().int(),
        scoreSize: z.number().int(),
        showTeamNames: z.boolean(),
        showSetDots: z.boolean(),
        showSetSummary: z.boolean(),
      }),
    }),
  ]).optional(),
  state: z.custom<ScoreboardState>().optional(),
});

type ScoreboardSessionRecord = {
  id: string;
  title: string;
  controlToken: string;
  state: Prisma.JsonValue;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicScoreboardSessionRecord = Omit<ScoreboardSessionRecord, "controlToken">;

export type ActiveScoreboardSessionRecord = Pick<PublicScoreboardSessionRecord, "id" | "title" | "updatedAt">;

export function toPublicScoreboardSession(session: ScoreboardSessionRecord): PublicScoreboardSessionRecord {
  const { controlToken: _controlToken, ...publicSession } = session;
  return publicSession;
}

function toJsonValue(value: ScoreboardState): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function readState(state: Prisma.JsonValue): ScoreboardState {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return createInitialScoreboardState();
  }

  return normalizeScoreboardState(state as unknown as ScoreboardState);
}

export async function listScoreboardSessions(): Promise<PublicScoreboardSessionRecord[]> {
  return scoreboardSessionDb.scoreboardSession.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function listActiveScoreboardSessions(): Promise<ActiveScoreboardSessionRecord[]> {
  const sessions: PublicScoreboardSessionRecord[] = await scoreboardSessionDb.scoreboardSession.findMany({
    where: { archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });

  return sessions
    .filter((session) => {
      const state = readState(session.state);
      return !state.winner;
    })
    .map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
    }));
}

export async function getScoreboardSessionById(id: string) {
  return scoreboardSessionDb.scoreboardSession.findUnique({ where: { id } });
}

export async function createScoreboardSession(input: z.infer<typeof createScoreboardSessionSchema>) {
  const parsed = createScoreboardSessionSchema.parse(input);
  const title = parsed.title ?? "Placar de Vôlei";
  const teamAName = parsed.teamAName ?? "Time A";
  const teamBName = parsed.teamBName ?? "Time B";
  const config = {
    ...DEFAULT_SCOREBOARD_CONFIG,
    ...(parsed.config ?? {}),
  } satisfies ScoreboardMatchConfig;

  return scoreboardSessionDb.scoreboardSession.create({
    data: {
      title,
      state: toJsonValue(createInitialScoreboardState(teamAName, teamBName, config)),
    },
  });
}

export async function archiveScoreboardSession(id: string) {
  return scoreboardSessionDb.scoreboardSession.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
}

export async function deleteScoreboardSession(id: string) {
  const result = await scoreboardSessionDb.scoreboardSession.deleteMany({ where: { id } });
  return result.count > 0;
}

export async function applyScoreboardSessionAction(
  id: string,
  mutation: z.infer<typeof scoreboardMutationSchema>,
) {
  const session = await scoreboardSessionDb.scoreboardSession.findUnique({ where: { id } });
  if (!session) return null;

  const parsed = scoreboardMutationSchema.parse(mutation);
  const currentState = readState(session.state);
  const nextState = parsed.state ? normalizeScoreboardState(parsed.state) : parsed.action ? scoreboardReducer(currentState, parsed.action as ScoreboardAction) : currentState;

  const nextSession = await scoreboardSessionDb.scoreboardSession.update({
    where: { id },
    data: {
      state: toJsonValue(nextState),
    },
  });

  return nextSession;
}

export async function assertScoreboardControlToken(sessionId: string, controlToken?: string) {
  const session = await scoreboardSessionDb.scoreboardSession.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false as const, status: 404, message: "Sessão não encontrada" };

  if (controlToken && session.controlToken !== controlToken) {
    return { ok: false as const, status: 403, message: "Token de controle inválido" };
  }

  return { ok: true as const, session };
}

export type { ScoreboardSessionRecord };
