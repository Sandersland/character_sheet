/**
 * Global error-handler tests (lib/core/error-handler.ts).
 *
 * Verifies the terminal middleware turns uncaught route errors into a consistent
 * JSON 500 — never HTML, never a hang — and preserves intentional HTTP status
 * codes. No Postgres needed: these mount the handler on a throwaway Express app
 * with synthetic throwing routes, so they run without the DB fixture setup.
 *
 * The side-effect import of express-async-errors is what makes async throws
 * reach the handler at all (see app.ts) — exercised here directly.
 */
import "express-async-errors";

import express from "express";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { errorHandler } from "@/lib/core/error-handler.js";

function appThatThrows(thrower: () => void) {
  const app = express();
  app.get("/sync", () => {
    thrower();
  });
  app.get("/async", async () => {
    await Promise.resolve();
    thrower();
  });
  app.use(errorHandler);
  return app;
}

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("global error handler", () => {
  it("returns a JSON 500 (not HTML, not a hang) for an unexpected sync throw", async () => {
    const app = appThatThrows(() => {
      throw new Error("boom");
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(500);
    expect(res.type).toMatch(/json/);
    expect(res.body).toHaveProperty("error");
  });

  it("catches an async throw and returns a JSON 500", async () => {
    const app = appThatThrows(() => {
      throw new Error("async boom");
    });
    const res = await supertest(app).get("/async");
    expect(res.status).toBe(500);
    expect(res.type).toMatch(/json/);
    expect(res.body).toHaveProperty("error");
  });

  it("preserves an intentional HTTP status carried on the error, with its message", async () => {
    const app = appThatThrows(() => {
      const err = Object.assign(new Error("bad input"), { status: 400 });
      throw err;
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad input" });
  });

  it("maps a Prisma P2025 (record-not-found) to a clean 404", async () => {
    // A second query racing a delete (e.g. findUniqueOrThrow/update/delete after
    // an access check) throws P2025 with no `.status`. It must surface as 404,
    // not 500, and must not leak Prisma's verbose internal message.
    const app = appThatThrows(() => {
      throw Object.assign(new Error("No Character found for the given where"), {
        name: "PrismaClientKnownRequestError",
        code: "P2025",
      });
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("does not leak the error message on a 500 in production", async () => {
    process.env.NODE_ENV = "production";
    const app = appThatThrows(() => {
      throw new Error("secret internal detail");
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });
});
