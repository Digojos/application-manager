import { NextResponse } from "next/server";
import { listActiveBasketballSessions } from "@/lib/basketball-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await listActiveBasketballSessions();

    return NextResponse.json(
      sessions.map((session) => ({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        viewPath: `/placar-basquete/view/${session.id}`,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Erro ao listar sessões ativas" }, { status: 500 });
  }
}
