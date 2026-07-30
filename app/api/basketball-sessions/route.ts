import { NextResponse } from "next/server";
import {
  createBasketballSession,
  createBasketballSessionSchema,
  listBasketballSessions,
  toPublicBasketballSession,
} from "@/lib/basketball-sessions";

export async function GET() {
  try {
    const sessions = await listBasketballSessions();
    return NextResponse.json(sessions.map(toPublicBasketballSession));
  } catch {
    return NextResponse.json({ error: "Erro ao listar sessões" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createBasketballSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const session = await createBasketballSession(parsed.data);
    return NextResponse.json(session, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar sessão" }, { status: 500 });
  }
}
