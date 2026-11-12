// The side-effect import of express-async-errors is what makes async throws reach errorHandler at all — exercised here directly.
import "express-async-errors";

import express from "express";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "@/http/error-handler.js";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/lib/core/errors.js";

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

const hoisted = vi.hoisted(() => ({ isProd: false }));
vi.mock("@/lib/core/config.js", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/core/config.js")>();
  return {
    ...actual,
    get config() {
      return { ...actual.config, isProd: hoisted.isProd };
    },
  };
});

describe("global error handler", () => {
  afterEach(() => {
    hoisted.isProd = false;
  });

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

  it.each([
    ["ValidationError", () => new ValidationError("bad op"), 400],
    ["NotFoundError", () => new NotFoundError("gone"), 404],
    ["ConflictError", () => new ConflictError("clash"), 409],
    ["AuthorizationError", () => new AuthorizationError("nope"), 403],
  ])("maps a %s to its status with the standard { error } body", async (_name, make, status) => {
    const app = appThatThrows(() => {
      throw make();
    });
    const res = await supertest(app).get("/async");
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: (make() as Error).message });
  });

  it("maps a Prisma P2002 (unique violation) to a masked 409", async () => {
    const app = appThatThrows(() => {
      throw Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), { code: "P2002" });
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "That already exists" });
  });

  it("keeps a body-parser style { status: 400 } error at 400", async () => {
    const app = appThatThrows(() => {
      throw Object.assign(new SyntaxError("Unexpected token"), { status: 400, statusCode: 400, type: "entity.parse.failed" });
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Unexpected token" });
  });

  it("does not leak the error message on a 500 in production", async () => {
    hoisted.isProd = true;
    const app = appThatThrows(() => {
      throw new Error("secret internal detail");
    });
    const res = await supertest(app).get("/sync");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(res.body)).not.toContain("secret internal detail");
  });
});
