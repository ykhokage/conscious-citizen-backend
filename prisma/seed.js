import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const login = process.env.SEED_ADMIN_LOGIN || "admin";
  const email = process.env.SEED_ADMIN_EMAIL || "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin";

  const hashed = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ login }, { email }] },
  });

  if (existing) {
    console.log("Admin already exists:", { id: existing.id, login: existing.login });
    return;
  }

  const admin = await prisma.user.create({
    data: {
      login,
      email,
      password: hashed,
      role: "admin",
      profile: { create: { city: "Самара" } },
    },
  });

  console.log("Admin created:", { id: admin.id, login, password });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
