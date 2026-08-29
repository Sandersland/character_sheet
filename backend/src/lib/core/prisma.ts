import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "@/generated/prisma/client.js";

// prisma.$disconnect() does not end an externally-supplied pg.Pool; tests must end `pool` explicitly in teardown or its sockets linger.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });
