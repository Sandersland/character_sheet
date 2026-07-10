import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "@/generated/prisma/client.js";

// Pass an explicit Pool so a single shared pool is used across all requests
// rather than creating a new Pool on every adapter connect() call, which
// avoids the pg "client already executing" DeprecationWarning in pg >=8.
// Exported so tests can close it in teardown (see backend/vitest.setup.ts):
// prisma.$disconnect() does NOT end an externally-supplied pg.Pool, so the pool
// must be ended explicitly or its sockets linger after a worker's tests finish.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
