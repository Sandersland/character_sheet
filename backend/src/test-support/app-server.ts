import http from "node:http";

import { afterAll } from "vitest";

import { createApp } from "@/app.js";

// One listening HTTP server per test FILE, shared by every supertest call in it: an unlistening app makes supertest bind a new ephemeral port per request, which caused rare port collisions under load (#1600).
// createApp() only assembles module-level singletons, so sharing one app across a file is behaviour-neutral; a suite needing an app built under a different env (the CORS suite) must still construct its own.
const server = http.createServer(createApp());

// Top-level await so importers get an already-listening server usable synchronously — the sync supertest helpers can't become async.
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

// unref so a server that outlives its teardown can't hold the worker's event loop open.
server.unref();

// Registered here, not vitest.setup.ts, so only files that use this server pay for the afterAll, and a dynamic import from setup can't resolve a different module instance and leak the socket.
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

export const app = server;
