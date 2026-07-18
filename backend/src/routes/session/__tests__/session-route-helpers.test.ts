/**
 * Unit tests for the shared session-route helpers (#592): characterId body
 * validation and roll-body parsing. Pure — no DB; a hand-rolled req/res double
 * captures status + body. SessionError/CombatError now carry their own `status`
 * (the central `errorHandler` maps it), covered by domain-error-status.test.ts.
 */

import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { parseRollInput, requireCharacterId } from "@/routes/session/session-route-helpers.js";

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
