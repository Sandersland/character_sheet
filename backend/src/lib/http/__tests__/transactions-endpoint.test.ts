// Unit tests for the shared transactions-endpoint factory. Prisma, access, and
// serialize are mocked so every branch (parse-400, domain-error-400, rethrow,
// path override, respond transform) is exercised without a database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Router } from "express";

vi.mock("@/lib/core/prisma.js", () => ({
  prisma: { character: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth/access.js", () => ({
  assertCharacterAccess: vi.fn(),
}));
vi.mock("@/lib/character-serialize.js", () => ({
  serializeCharacter: vi.fn((row: { id: string }) => ({ id: row.id, serialized: true })),
}));
vi.mock("@/lib/character-include.js", () => ({ characterInclude: { marker: true } }));

import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";
import { prisma } from "@/lib/core/prisma.js";
import { assertCharacterAccess } from "@/lib/auth/access.js";

const findUnique = vi.mocked(prisma.character.findUnique);
const access = vi.mocked(assertCharacterAccess);

class DomainErrorA extends Error {}
class DomainErrorB extends Error {}

// Capture the handler the factory registers on router.post(path, handler).
function register<S extends z.ZodTypeAny, R>(
  config: Omit<Parameters<typeof makeTransactionsEndpoint<S, R>>[0], "router">,
) {
  let path = "";
  let handler!: (req: unknown, res: unknown) => Promise<void>;
  const router = {
    post: (p: string, h: typeof handler) => {
      path = p;
      handler = h;
    },
  } as unknown as Router;
  makeTransactionsEndpoint<S, R>({ router, ...config } as Parameters<
    typeof makeTransactionsEndpoint<S, R>
  >[0]);
  return { path, handler };
}

function makeRes() {
  const res = {
    statusCode: 200,
    status: vi.fn((c: number) => {
      res.statusCode = c;
      return res;
    }),
    json: vi.fn((b: unknown) => {
      res.body = b;
      return res;
    }),
    body: undefined as unknown,
  };
  return res;
}

const schema = z.object({ operations: z.array(z.object({ type: z.literal("go") })).min(1) });
const req = (body: unknown) => ({ user: { id: "u1" }, params: { id: "c1" }, body });

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ id: "c1", ownerId: "u1" });
  findUnique.mockResolvedValue({ id: "c1" } as never);
});

describe("makeTransactionsEndpoint", () => {
  it("defaults the path to /transactions", () => {
    const { path } = register({ schema, apply: vi.fn(), domainErrors: [] });
    expect(path).toBe("/transactions");
  });

  it("honors a path override (experience mounts on /)", () => {
    const { path } = register({ schema, apply: vi.fn(), domainErrors: [], path: "/" });
    expect(path).toBe("/");
  });

  it("happy path: asserts edit access, applies, re-fetches, returns serialized character", async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const { handler } = register({ schema, apply, domainErrors: [] });
    const res = makeRes();

    await handler(req({ operations: [{ type: "go" }] }), res);

    expect(access).toHaveBeenCalledWith(prisma, "u1", "c1", "edit");
    expect(apply).toHaveBeenCalledWith("c1", { operations: [{ type: "go" }] }, "u1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "c1" },
      include: { marker: true },
    });
    expect(res.body).toEqual({ id: "c1", serialized: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("400s on a malformed body without calling apply", async () => {
    const apply = vi.fn();
    const { handler } = register({ schema, apply, domainErrors: [] });
    const res = makeRes();

    await handler(req({ operations: [] }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.body as { error: string }).error).toBe("Invalid request body");
    expect((res.body as { details: unknown }).details).toBeDefined();
    expect(apply).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("maps a listed domain error to 400 { error: message }", async () => {
    const apply = vi.fn().mockRejectedValue(new DomainErrorA("bad op"));
    const { handler } = register({ schema, apply, domainErrors: [DomainErrorA] });
    const res = makeRes();

    await handler(req({ operations: [{ type: "go" }] }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: "bad op" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("matches any error class in the list (multi-error routes)", async () => {
    const apply = vi.fn().mockRejectedValue(new DomainErrorB("also bad"));
    const { handler } = register({ schema, apply, domainErrors: [DomainErrorA, DomainErrorB] });
    const res = makeRes();

    await handler(req({ operations: [{ type: "go" }] }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: "also bad" });
  });

  it("rethrows an unlisted error (no 400, no response)", async () => {
    const apply = vi.fn().mockRejectedValue(new Error("boom"));
    const { handler } = register({ schema, apply, domainErrors: [DomainErrorA] });
    const res = makeRes();

    await expect(handler(req({ operations: [{ type: "go" }] }), res)).rejects.toThrow("boom");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("applies the respond transform (maneuvers { character, results } shape)", async () => {
    const apply = vi.fn().mockResolvedValue([{ roll: 5 }]);
    const { handler } = register({
      schema,
      apply,
      domainErrors: [],
      respond: (character, results) => ({ character, results }),
    });
    const res = makeRes();

    await handler(req({ operations: [{ type: "go" }] }), res);

    expect(res.body).toEqual({
      character: { id: "c1", serialized: true },
      results: [{ roll: 5 }],
    });
  });

  it("propagates an access failure before parsing (never touches apply)", async () => {
    access.mockRejectedValue(new Error("Character not found"));
    const apply = vi.fn();
    const { handler } = register({ schema, apply, domainErrors: [] });
    const res = makeRes();

    await expect(handler(req({ operations: [] }), res)).rejects.toThrow("Character not found");
    expect(apply).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
