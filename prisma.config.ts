import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 reads migration/introspection connection details from here (the
// schema no longer holds a `url`). The Prisma CLI does not auto-load .env, so
// load it manually (Node 20.12+ ships process.loadEnvFile).
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional (e.g. on Vercel where vars are injected directly).
}

// Schema changes (migrate deploy / db push) prefer the direct, unpooled
// connection when the host provides one (Vercel Postgres / Neon sets
// DATABASE_URL_UNPOOLED); the app itself uses the pooled DATABASE_URL.
// Read process.env directly so `prisma generate` never fails just because a
// database isn't attached yet.
const url =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: { url },
});
