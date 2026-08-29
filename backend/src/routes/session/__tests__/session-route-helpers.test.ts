import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { requireCharacterId } from "@/routes/session/session-route-helpers.js";

function mockRes() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function reqWith(body: unknown): Request {
  return { body } as unknown as Request;
}

describe("requireCharacterId", () => {
  it("returns the raw id (untrimmed) for a valid value", () => {
    const res = mockRes();
    const id = requireCharacterId(reqWith({ characterId: " abc " }), res as unknown as Response);
    expect(id).toBe(" abc ");
    expect(res.statusCode).toBeUndefined();
  });

  it("400s with the exact body when characterId is missing", () => {
    const res = mockRes();
    const id = requireCharacterId(reqWith({}), res as unknown as Response);
    expect(id).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "characterId is required" });
  });

  it("400s for an empty string", () => {
    const res = mockRes();
    const id = requireCharacterId(reqWith({ characterId: "" }), res as unknown as Response);
    expect(id).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s for a whitespace-only string", () => {
    const res = mockRes();
    const id = requireCharacterId(reqWith({ characterId: "   " }), res as unknown as Response);
    expect(id).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s for a non-string value", () => {
    const res = mockRes();
    const id = requireCharacterId(reqWith({ characterId: 42 }), res as unknown as Response);
    expect(id).toBeNull();
    expect(res.statusCode).toBe(400);
  });
});
