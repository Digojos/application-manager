import { NextResponse } from "next/server";
import { listMiniApps, createMiniApp } from "@/lib/miniapps";
import { miniAppSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const apps = await listMiniApps(false);
    return NextResponse.json(apps);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar aplicações" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = miniAppSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    const existing = await prisma.miniApp.findUnique({ where: { path: parsed.data.path } });
    if (existing) {
      return NextResponse.json({ error: "Já existe uma aplicação com esse path" }, { status: 409 });
    }

    const app = await createMiniApp(parsed.data);
    return NextResponse.json(app, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar aplicação" }, { status: 500 });
  }
}
