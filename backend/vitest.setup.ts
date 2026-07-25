import { afterAll } from "vitest";

import { baseDatabaseUrl, workerDatabaseUrl } from "./vitest.db.js";

// `prisma` and `pool` snapshot DATABASE_URL into a pg.Pool when their module is
// first evaluated, so this assignment has to land before that happens — hence
// the dynamic import. A static import is hoisted above the assignment and would
// silently bind every worker to the ambient shared database instead of its own
// clone, with the whole suite still passing (#1269). The current_database()
// assertion in the per-worker-database suite is the guard against that.
process.env.DATABASE_URL = workerDatabaseUrl(
  baseDatabaseUrl(),
  Number(process.env.VITEST_POOL_ID)
);
const { prisma, pool } = await import("./src/lib/core/prisma.js");

// Per-file teardown. Vitest runs each test file in its own isolated module
// context (default `isolate: true`), so this file's `lib/prisma` — and its
// module-level pg.Pool — is unique to the file; ending it here closes only this
// file's connections, not a sibling worker's.
//
// Without this, the pooled TCP connections linger after a file's tests finish,
// which under parallel load has surfaced as an intermittent "socket hang up".
// prisma.$disconnect() does not end an externally-supplied pg.Pool, so end the
// pool explicitly too.
afterAll(async () => {
  // try/finally so the pool is ended even if $disconnect() throws — otherwise
  // the very leak this file fixes would silently return on an error path.
  try {
    await prisma.$disconnect();
  } finally {
    await pool.end();
  }
});
