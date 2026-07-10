/**
 * Unit tests for the shared session-route helpers (#592): characterId body
 * validation, SessionError/CombatError status mapping, and the catch wrapper.
 * Pure — no DB; a hand-rolled req/res double captures status + body.
 */

import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { CombatError, SessionError } from "@/lib/session/sessions.js";
import {
  parseRollInput,
  requireCharacterId,
  sessionErrorStatus,
  withSessionErrors,
} from "@/routes/session/session-route-helpers.js";

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

describe("sessionErrorStatus", () => {
  it("maps a not-found message to 404", () => {
    expect(sessionErrorStatus("Session not found: abc")).toBe(404);
  });

  it("maps any other message to 409", () => {
    expect(sessionErrorStatus("Character is not part of this campaign")).toBe(409);
  });
});

describe("parseRollInput", () => {
  const valid = { kind: "attack", source: "Longsword", total: 17 };

  it("returns the normalized input for a minimal valid body", () => {
    const res = mockRes();
    const roll = parseRollInput(reqWith(valid), res as unknown as Response);
    expect(res.statusCode).toBeUndefined();
    expect(roll).toEqual({
      kind: "attack",
      source: "Longsword",
      total: 17,
      specLabel: undefined,
      damageType: undefined,
      faces: undefined,
      ability: undefined,
      skill: undefined,
      dc: undefined,
      rollMode: undefined,
    });
  });

  it("trims source and carries optional fields through", () => {
    const res = mockRes();
    const roll = parseRollInput(
      reqWith({ ...valid, source: "  Fireball  ", faces: [6, 6], dc: 15, rollMode: "advantage", skill: "arcana" }),
      res as unknown as Response,
    );
    expect(roll?.source).toBe("Fireball");
    expect(roll?.faces).toEqual([6, 6]);
    expect(roll?.dc).toBe(15);
    expect(roll?.rollMode).toBe("advantage");
    expect(roll?.skill).toBe("arcana");
  });

  it("400s on an unknown kind", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, kind: "nope" }), res as unknown as Response)).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "kind must be one of attack, damage, check, save, initiative" });
  });

  it("400s on a blank source", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, source: "  " }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "source must be a non-empty string" });
  });

  it("400s on a non-finite total", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, total: Number.NaN }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "total must be a finite number" });
  });

  it("400s when faces contains a non-positive or non-integer value", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, faces: [6, 0] }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "faces must be an array of positive integers" });
  });

  it("accepts an undefined faces (optional)", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid }), res as unknown as Response)?.faces).toBeUndefined();
    expect(res.statusCode).toBeUndefined();
  });

  it("400s on a non-finite dc", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, dc: Infinity }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "dc must be a finite number" });
  });

  it("400s on an invalid rollMode", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, rollMode: "sideways" }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "rollMode must be one of normal, advantage, disadvantage" });
  });
});

describe("withSessionErrors", () => {
  it("passes through when the handler resolves", async () => {
    const res = mockRes();
    let ran = false;
    await withSessionErrors(async (_req, r) => {
      ran = true;
      (r as unknown as ReturnType<typeof mockRes>).status(201).json({ ok: true });
    })(reqWith({}), res as unknown as Response);
    expect(ran).toBe(true);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it("maps a not-found SessionError to 404 { error }", async () => {
    const res = mockRes();
    await withSessionErrors(async () => {
      throw new SessionError("Session not found: xyz");
    })(reqWith({}), res as unknown as Response);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Session not found: xyz" });
  });

  it("maps a non-not-found SessionError to 409 { error }", async () => {
    const res = mockRes();
    await withSessionErrors(async () => {
      throw new SessionError("A session is already active");
    })(reqWith({}), res as unknown as Response);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "A session is already active" });
  });

  it("maps CombatError the same way (404 for not found)", async () => {
    const res = mockRes();
    await withSessionErrors(async () => {
      throw new CombatError("Session not found: xyz");
    })(reqWith({}), res as unknown as Response);
    expect(res.statusCode).toBe(404);
  });

  it("maps a non-not-found CombatError to 409", async () => {
    const res = mockRes();
    await withSessionErrors(async () => {
      throw new CombatError("Not an active participant");
    })(reqWith({}), res as unknown as Response);
    expect(res.statusCode).toBe(409);
  });

  it("re-throws any non-session error to the terminal handler", async () => {
    const res = mockRes();
    await expect(
      withSessionErrors(async () => {
        throw new Error("boom");
      })(reqWith({}), res as unknown as Response),
    ).rejects.toThrow("boom");
    expect(res.statusCode).toBeUndefined();
  });
});
