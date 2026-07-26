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

// #1235: the combat-log decomposition fields — swingId/verdict/crit flags/
// structured mode sources/decomposed components — round-trip through the same
// hand-rolled style as the pre-existing fields (zod for the nested objects only).
describe("parseRollInput — #1235 combat-log fields", () => {
  const valid = { kind: "attack", source: "Longsword", total: 17 };
  const modeSource = { mode: "disadvantage", kind: "attack", source: "Poisoned" };
  const attackComponents = { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0 };
  const damageComponents = { abilityMod: 3, meleeDamageBonus: 2 };

  it("carries swingId/verdict/nat20/nat1/crit/modeSources/components through", () => {
    const res = mockRes();
    const roll = parseRollInput(
      reqWith({
        ...valid,
        swingId: "swing-1",
        verdict: "crit",
        nat20: true,
        nat1: false,
        crit: true,
        modeSources: [modeSource],
        attackComponents,
      }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBeUndefined();
    expect(roll?.swingId).toBe("swing-1");
    expect(roll?.verdict).toBe("crit");
    expect(roll?.nat20).toBe(true);
    expect(roll?.nat1).toBe(false);
    expect(roll?.crit).toBe(true);
    expect(roll?.modeSources).toEqual([modeSource]);
    expect(roll?.attackComponents).toEqual(attackComponents);
  });

  it("carries damageComponents through on a damage roll", () => {
    const res = mockRes();
    const roll = parseRollInput(
      reqWith({ kind: "damage", source: "Longsword", total: 9, damageType: "slashing", swingId: "swing-1", damageComponents }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBeUndefined();
    expect(roll?.damageComponents).toEqual(damageComponents);
  });

  it("all #1235 fields are optional — omitting them all is still valid", () => {
    const res = mockRes();
    const roll = parseRollInput(reqWith(valid), res as unknown as Response);
    expect(res.statusCode).toBeUndefined();
    expect(roll?.swingId).toBeUndefined();
    expect(roll?.verdict).toBeUndefined();
    expect(roll?.modeSources).toBeUndefined();
    expect(roll?.attackComponents).toBeUndefined();
    expect(roll?.damageComponents).toBeUndefined();
  });

  it("400s on an invalid verdict", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, verdict: "dodged" }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "verdict must be one of hit, miss, crit" });
  });

  it("400s on a non-boolean nat20", () => {
    const res = mockRes();
    expect(parseRollInput(reqWith({ ...valid, nat20: "yes" }), res as unknown as Response)).toBeNull();
    expect(res.body).toEqual({ error: "nat20 must be a boolean" });
  });

  it("400s on a malformed modeSources entry (missing required field)", () => {
    const res = mockRes();
    expect(
      parseRollInput(reqWith({ ...valid, modeSources: [{ mode: "disadvantage", kind: "attack" }] }), res as unknown as Response),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s on a malformed attackComponents (wrong field type)", () => {
    const res = mockRes();
    expect(
      parseRollInput(
        reqWith({ ...valid, attackComponents: { ...attackComponents, abilityMod: "three" } }),
        res as unknown as Response,
      ),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s on a malformed damageComponents", () => {
    const res = mockRes();
    expect(
      parseRollInput(reqWith({ ...valid, damageComponents: { abilityMod: 3 } }), res as unknown as Response),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("never carries target/outcome through, even when the caller sends them — no producer populates these reserved fields (#1235)", () => {
    const res = mockRes();
    const roll = parseRollInput(
      reqWith({ ...valid, target: { name: "Goblin" }, outcome: "dropped" }),
      res as unknown as Response,
    ) as unknown as Record<string, unknown>;
    expect(res.statusCode).toBeUndefined();
    expect(roll).not.toHaveProperty("target");
    expect(roll).not.toHaveProperty("outcome");
  });

  // Nested #1235 objects persist verbatim into a durable, write-once,
  // non-undoable event log — an unknown/oversized key must 400, never ride along.
  it("400s on a modeSources entry carrying an unknown key (e.g. an injected script payload)", () => {
    const res = mockRes();
    expect(
      parseRollInput(
        reqWith({
          ...valid,
          modeSources: [{ ...modeSource, evil: "<script>alert(1)</script>" }],
        }),
        res as unknown as Response,
      ),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s on an unknown key in attackComponents", () => {
    const res = mockRes();
    expect(
      parseRollInput(
        reqWith({ ...valid, attackComponents: { ...attackComponents, extra: "nope" } }),
        res as unknown as Response,
      ),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s on an unknown key in damageComponents", () => {
    const res = mockRes();
    expect(
      parseRollInput(
        reqWith({ ...valid, damageComponents: { ...damageComponents, extra: "nope" } }),
        res as unknown as Response,
      ),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("400s on a swingId over 100 characters", () => {
    const res = mockRes();
    expect(
      parseRollInput(reqWith({ ...valid, swingId: "s".repeat(101) }), res as unknown as Response),
    ).toBeNull();
    expect(res.body).toEqual({ error: "swingId must be a non-empty string of at most 100 characters" });
  });

  it("accepts a swingId at exactly the 100-character bound", () => {
    const res = mockRes();
    const roll = parseRollInput(reqWith({ ...valid, swingId: "s".repeat(100) }), res as unknown as Response);
    expect(res.statusCode).toBeUndefined();
    expect(roll?.swingId).toHaveLength(100);
  });

  it("400s on a modeSources array over 20 entries", () => {
    const res = mockRes();
    const tooMany = Array.from({ length: 21 }, () => modeSource);
    expect(
      parseRollInput(reqWith({ ...valid, modeSources: tooMany }), res as unknown as Response),
    ).toBeNull();
    expect(res.body).toEqual({ error: "modeSources must be an array of at most 20 valid roll-mode source objects" });
  });

  it("accepts a modeSources array at exactly the 20-entry bound", () => {
    const res = mockRes();
    const exactlyTwenty = Array.from({ length: 20 }, () => modeSource);
    const roll = parseRollInput(reqWith({ ...valid, modeSources: exactlyTwenty }), res as unknown as Response);
    expect(res.statusCode).toBeUndefined();
    expect(roll?.modeSources).toHaveLength(20);
  });

  it("400s on a modeSources entry's source string over 200 characters", () => {
    const res = mockRes();
    expect(
      parseRollInput(
        reqWith({ ...valid, modeSources: [{ ...modeSource, source: "x".repeat(201) }] }),
        res as unknown as Response,
      ),
    ).toBeNull();
    expect(res.statusCode).toBe(400);
  });

  it("persists the SAFEPARSE'd object, not the raw body — unknown keys never survive even on an otherwise-valid nested object", () => {
    const res = mockRes();
    const roll = parseRollInput(
      reqWith({ ...valid, attackComponents, damageComponents, modeSources: [modeSource] }),
      res as unknown as Response,
    );
    expect(res.statusCode).toBeUndefined();
    expect(Object.keys(roll?.attackComponents ?? {}).sort()).toEqual(
      ["abilityMod", "attackRollBonus", "proficiencyBonus", "rangedBonus"],
    );
    expect(Object.keys(roll?.damageComponents ?? {}).sort()).toEqual(["abilityMod", "meleeDamageBonus"]);
    expect(Object.keys(roll?.modeSources?.[0] ?? {}).sort()).toEqual(["kind", "mode", "source"]);
  });
});
