import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const login = process.env.SEED_ADMIN_LOGIN || "admin";
  const email = process.env.SEED_ADMIN_EMAIL || "ykhokage@yandex.ru";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin";

  const hashed = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findFirst({
    where: { OR: [{ login }, { email }] },
  });

  if (existing) {
    // ✅ если админ уже есть — гарантируем, что почта подтверждена
    if (!existing.emailVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          emailVerified: true,
          emailCodeHash: null,
          emailCodeExp: null,
        },
      });
      console.log("Admin existed; emailVerified was false -> set to true:", {
        id: existing.id,
        login: existing.login,
      });
    } else {
      console.log("Admin already exists:", { id: existing.id, login: existing.login });
    }
    return;
  }

  const admin = await prisma.user.create({
    data: {
      login,
      email,
      password: hashed,
      role: "admin",
      emailVerified: true, // ✅ чтобы сразу можно было логиниться
      emailCodeHash: null,
      emailCodeExp: null,
      profile: { create: { city: "Самара" } },
    },
    select: { id: true, login: true, email: true, role: true, emailVerified: true },
  });

  console.log("Admin created:", { id: admin.id, login, password, emailVerified: admin.emailVerified });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });