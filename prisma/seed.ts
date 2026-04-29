import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@admin.com";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const name = process.env.ADMIN_NAME ?? "Administrador";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin já existe: ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, password: hashed, name } });
  console.log(`Admin criado com sucesso!`);
  console.log(`  Email: ${email}`);
  console.log(`  Senha: ${password}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
