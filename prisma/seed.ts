import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@admin.com";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const name = process.env.ADMIN_NAME ?? "Administrador";
  const teamDrawPath = "/sorteio-times";
  const basketballPath = "/placar-basquete";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin já existe: ${email}`);
  } else {
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, password: hashed, name } });
    console.log(`Admin criado com sucesso!`);
    console.log(`  Email: ${email}`);
    console.log(`  Senha: ${password}`);
  }

  const existingMiniApp = await prisma.miniApp.findUnique({ where: { path: teamDrawPath } });
  if (!existingMiniApp) {
    await prisma.miniApp.create({
      data: {
        title: "Sorteio de Times",
        path: teamDrawPath,
        description: "Monte times equilibrados por habilidade com funcoes dinamicas por esporte.",
        active: true,
      },
    });
    console.log("Miniapp Sorteio de Times cadastrado no catalogo.");
  }

  const existingBasketball = await prisma.miniApp.findUnique({ where: { path: basketballPath } });
  if (!existingBasketball) {
    await prisma.miniApp.create({
      data: {
        title: "Placar de Basquete",
        path: basketballPath,
        description: "Placar de basquete com cronometro de jogo, posse de 24s, faltas, tempos tecnicos e posse de bola.",
        active: true,
      },
    });
    console.log("Miniapp Placar de Basquete cadastrado no catalogo.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
