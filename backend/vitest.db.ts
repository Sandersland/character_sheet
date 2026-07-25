import { execFile } from "node:child_process";
import { availableParallelism } from "node:os";
import { promisify } from "node:util";

import pg from "pg";

const execFileAsync = promisify(execFile);

// One number, two consumers: vitest.config.ts pins `maxWorkers` to it and the
// global setup clones exactly this many databases, so the two can never
// disagree. Capped at 6 because every worker holds its own pg.Pool (default
// max: 10) against a server whose default max_connections is 100 (#1269).
export const TEST_WORKER_COUNT =
  Number(process.env.VITEST_MAX_WORKERS) || Math.min(6, Math.max(1, availableParallelism() - 1));

// Workers overwrite their own DATABASE_URL with their clone's URL, so the
// ambient value has to survive under a second name — re-deriving from a
// rewritten DATABASE_URL would compound the suffix on the worker's next file.
export function baseDatabaseUrl(): string {
  const url = process.env.TEST_BASE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set to run the backend tests");
  return url;
}

function withDatabase(base: string, name: string): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  return `"${name}"`;
}

function databasePrefix(base: string): string {
  return process.env.TEST_DB_PREFIX ?? decodeURIComponent(new URL(base).pathname.slice(1));
}

// Maintenance database, so the setup can create and drop the others without
// being connected to any of them.
function adminUrl(base: string): string {
  return withDatabase(base, "postgres");
}

export function templateDatabaseName(base: string): string {
  return `${databasePrefix(base)}_test_template`;
}

export function workerDatabaseName(base: string, poolId: number): string {
  return `${databasePrefix(base)}_test_w${poolId}`;
}

export function workerDatabaseUrl(base: string, poolId: number): string {
  return withDatabase(base, workerDatabaseName(base, poolId));
}

// Runs before anything is created, so an interrupted run that never reached
// teardown self-heals instead of leaving ~20 MB orphans per worker.
export async function dropTestDatabases(client: pg.Client, base: string): Promise<void> {
  const prefix = `${databasePrefix(base)}_test_`;
  const { rows } = await client.query<{ datname: string }>("SELECT datname FROM pg_database");

  for (const { datname } of rows.filter((r) => r.datname.startsWith(prefix))) {
    await client.query(`DROP DATABASE ${quoteIdent(datname)} WITH (FORCE)`);
  }
}

// Child processes rather than an in-process Prisma call: process exit is the
// only reliable guarantee that no session still holds the template open when
// CREATE DATABASE ... TEMPLATE runs, which fails outright if one does.
export async function buildTemplate(base: string): Promise<void> {
  const url = withDatabase(base, templateDatabaseName(base));

  for (const args of [
    ["prisma", "migrate", "deploy"],
    ["prisma", "db", "seed"],
  ]) {
    try {
      await execFileAsync("npx", args, {
        env: { ...process.env, DATABASE_URL: url },
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (cause) {
      const { stderr } = cause as { stderr?: string };
      throw new Error(`Building the test template failed: npx ${args.join(" ")}\n${stderr ?? ""}`, {
        cause,
      });
    }
  }
}

// Belt and braces against R1 (CREATE DATABASE ... TEMPLATE aborts if any
// session is connected to the template): ALLOW_CONNECTIONS false makes it
// structurally impossible for the rest of the run — the same mechanism that
// lets template0 serve as a template — and the terminate sweeps anything that
// connected before the flag flipped. Deliberately NOT `is_template`, which
// would block the next run's DROP.
export async function lockTemplate(client: pg.Client, base: string): Promise<void> {
  const template = templateDatabaseName(base);

  await client.query(`ALTER DATABASE ${quoteIdent(template)} WITH ALLOW_CONNECTIONS false`);
  await client.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [template]
  );
}

export async function cloneWorkerDatabases(client: pg.Client, base: string): Promise<void> {
  const template = quoteIdent(templateDatabaseName(base));

  for (let poolId = 1; poolId <= TEST_WORKER_COUNT; poolId += 1) {
    await client.query(
      `CREATE DATABASE ${quoteIdent(workerDatabaseName(base, poolId))} TEMPLATE ${template}`
    );
  }
}

export async function connectAsAdmin(base: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: adminUrl(base) });
  await client.connect();
  return client;
}
