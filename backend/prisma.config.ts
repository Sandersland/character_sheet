import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 dropped Prisma 6's implicit .env loading, and `env("DATABASE_URL")`
// below is resolved when the CLI LOADS this file — so without this every
// host-run prisma command dies before it reaches a database (#1463). Absent
// file is the normal case in containers and CI, which inject DATABASE_URL
// directly; loadEnvFile never overrides an already-set variable, so they keep
// winning. Relative to cwd because the CLI already requires being run from
// backend/ (`schema` below is relative too).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
