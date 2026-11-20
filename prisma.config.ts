import { defineConfig } from "prisma/config";

// The same .env the bot reads. The bot never migrates (lrc.notnick.io owns the
// database), so the URL is only for read-only tools like `prisma studio`.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env: `prisma generate` works without a database.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Read directly rather than with `env()`, which throws when it isn't set.
  datasource: { url: process.env.DATABASE_URL },
});
