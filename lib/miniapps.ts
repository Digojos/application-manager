import { prisma } from "@/lib/prisma";
import type { MiniAppInput, MiniAppUpdateInput } from "@/lib/validations";

export async function listMiniApps(onlyActive = false) {
  return prisma.miniApp.findMany({
    where: onlyActive ? { active: true } : undefined,
    orderBy: { title: "asc" },
  });
}

export async function getMiniAppById(id: number) {
  return prisma.miniApp.findUnique({ where: { id } });
}

export async function getMiniAppByPath(path: string) {
  return prisma.miniApp.findUnique({ where: { path } });
}

export async function createMiniApp(data: MiniAppInput) {
  return prisma.miniApp.create({ data });
}

export async function updateMiniApp(id: number, data: MiniAppUpdateInput) {
  return prisma.miniApp.update({ where: { id }, data });
}

export async function deleteMiniApp(id: number) {
  return prisma.miniApp.delete({ where: { id } });
}
