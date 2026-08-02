import http from "node:http";

import { afterAll } from "vitest";

import { createApp } from "@/app.js";

// One listening HTTP server per test FILE, shared by every supertest call in it.
//
// supertest's Test constructor wraps a non-listening app in a fresh http.Server,
// and its serverAddress calls listen(0) whenever that server has no address — so
// `supertest(createApp())` bound a NEW ephemeral port on every single request,
// on the order of 10,000 bind/close cycles per full run. The implicitly-bound
// socket carries SO_REUSEADDR, so it can collide with anything else binding in
// the ephemeral range; the collisions surfaced as `Parse Error: Expected HTTP/…`
// or `socket hang up` on 3 of every 10 full runs (#1600). Never as an assertion
// failure and never in a fixed test — the victim is whichever request loses the
// race, which is why ten different tests across nine files were seen to fail.
// Handing supertest an already-listening server is its documented contract (the
// implicit bind is conditional on the server not already listening) and takes a
// whole file from ~100 binds to 1.
//
// Sharing one app across a file is behaviour-neutral: createApp() only assembles
// module-level singletons — the routers from routeManifest, and both rate
// limiters, which are no-op passthroughs under VITEST — so a per-request app was
// never buying isolation. A suite that needs an app built under DIFFERENT env is
// the one real exception and must keep constructing its own; the CORS suite does.
const server = http.createServer(createApp());

// Top-level await, so importers get a server that is ALREADY listening and can
// keep using `app` synchronously. A lazy async accessor would force `await` into
// every call site, and the sync helpers that return a chainable supertest Test
// cannot become async without changing what they return.
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

// unref so a server that somehow outlives its teardown can never hold the
// worker's event loop open — a teardown bug should not become a hung run.
server.unref();

// Teardown lives here rather than in vitest.setup.ts (alongside the Prisma pool
// it otherwise resembles) for two reasons: that setup file runs for all ~300
// test files, so reaching this module from there would drag the whole app graph
// into files that never make an HTTP request; and it could only reach it by
// dynamic import, which is a DIFFERENT module instance if the resolved ids ever
// diverge — silently leaking the listening socket instead of closing it.
// Registering the hook at import time binds it to the importing file's suite, so
// only files that actually use a server pay for one, and it is provably the
// same server.
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

export const app = server;
