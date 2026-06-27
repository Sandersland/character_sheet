import { afterAll } from "vitest";

import { prisma, pool } from "./src/lib/prisma.js";

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
  await prisma.$disconnect();
  await pool.end();
});
