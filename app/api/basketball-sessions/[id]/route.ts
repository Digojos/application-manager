import { NextResponse } from "next/server";
import {
  applyBasketballSessionAction,
  assertBasketballControlToken,
  deleteBasketballSession,
  getBasketballSessionById,
  basketballMutationSchema,
  toBasketballSessionPayload,
} from "@/lib/basketball-sessions";
import { publishBasketballSessionUpdate } from "@/lib/basketball-stream";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getBasketballSessionById(id);

  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  return NextResponse.json(toBasketballSessionPayload(session));
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = basketballMutationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const auth = await assertBasketballControlToken(id, parsed.data.controlToken);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const session = await applyBasketballSessionAction(id, parsed.data);
    if (session) {
      publishBasketballSessionUpdate(session);
    }
    return NextResponse.json(session ? toBasketballSessionPayload(session) : session);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar sessão" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const deleted = await deleteBasketballSession(id);

    if (!deleted) {
      return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao excluir sessão" }, { status: 500 });
  }
}
