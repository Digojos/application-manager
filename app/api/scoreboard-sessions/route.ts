import { NextResponse } from "next/server";
import {
  createScoreboardSession,
  createScoreboardSessionSchema,
  listScoreboardSessions,
  toPublicScoreboardSession,
} from "@/lib/scoreboard-sessions";

export async function GET() {
  try {
    const sessions = await listScoreboardSessions();
    return NextResponse.json(sessions.map(toPublicScoreboardSession));
  } catch {
    return NextResponse.json({ error: "Erro ao listar sessões" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createScoreboardSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const session = await createScoreboardSession(parsed.data);
    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar sessão" }, { status: 500 });
  }
}
