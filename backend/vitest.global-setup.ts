import {
  baseDatabaseUrl,
  buildTemplate,
  cloneWorkerDatabases,
  connectAsAdmin,
  dropTestDatabases,
  lockTemplate,
  templateDatabaseName,
} from "./vitest.db.js";

// Gives every vitest worker its own database, cloned from one migrated+seeded
// template, so test files no longer have to keep out of each other's way on a
// single shared Postgres (#1269).
//
// Throwing here aborts the run before any coverage is written, which CI reports
// as a missing artifact — so keep the SQL idempotent and the errors specific.
export default async function setup(): Promise<() => Promise<void>> {
  const base = baseDatabaseUrl();

  let admin = await connectAsAdmin(base);
  try {
    await dropTestDatabases(admin, base);
    await admin.query(`CREATE DATABASE "${templateDatabaseName(base)}"`);
  } finally {
    await admin.end();
  }

  await buildTemplate(base);

  admin = await connectAsAdmin(base);
  try {
    await lockTemplate(admin, base);
    await cloneWorkerDatabases(admin, base);
  } finally {
    await admin.end();
  }

  return async () => {
    const client = await connectAsAdmin(base);
    try {
      await dropTestDatabases(client, base);
    } finally {
      await client.end();
    }
  };
}
