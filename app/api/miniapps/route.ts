import { NextResponse } from "next/server";
import { listMiniApps } from "@/lib/miniapps";

export async function GET() {
  try {
    const apps = await listMiniApps(true);
    return NextResponse.json(apps);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar aplicações" }, { status: 500 });
  }
}
