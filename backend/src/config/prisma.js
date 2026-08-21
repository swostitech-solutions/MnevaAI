import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it to your real PostgreSQL connection string.");
}

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

export async function connectDatabase() {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      await prisma.$connect();
      return prisma;
    } catch (err) {
      lastErr = err;
      if (i < 2) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  console.error('[DB] Could not connect after 3 attempts:', lastErr?.message);
  throw lastErr || new Error('Database connection failed');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
