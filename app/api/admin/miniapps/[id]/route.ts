import { NextResponse } from "next/server";
import { getMiniAppById, updateMiniApp, deleteMiniApp } from "@/lib/miniapps";
import { miniAppUpdateSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const app = await getMiniAppById(numericId);
  if (!app) {
    return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
  }
  return NextResponse.json(app);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await getMiniAppById(numericId);
    if (!existing) {
      return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = miniAppUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    if (parsed.data.path && parsed.data.path !== existing.path) {
      const pathConflict = await prisma.miniApp.findUnique({ where: { path: parsed.data.path } });
      if (pathConflict) {
        return NextResponse.json({ error: "Já existe uma aplicação com esse path" }, { status: 409 });
      }
    }

    const updated = await updateMiniApp(numericId, parsed.data);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar aplicação" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const existing = await getMiniAppById(numericId);
    if (!existing) {
      return NextResponse.json({ error: "Aplicação não encontrada" }, { status: 404 });
    }

    await deleteMiniApp(numericId);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Erro ao excluir aplicação" }, { status: 500 });
  }
}
