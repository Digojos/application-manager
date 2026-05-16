import { NextResponse } from "next/server";
import { listActiveScoreboardSessions } from "@/lib/scoreboard-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await listActiveScoreboardSessions();

    return NextResponse.json(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        viewPath: `/placar-volei/view/${session.id}`,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Erro ao listar sessões ativas" }, { status: 500 });
  }
}
