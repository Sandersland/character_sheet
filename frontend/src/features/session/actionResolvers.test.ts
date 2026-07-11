/**
 * Parity test: every frontend resolver with serverEffect:true must have a
 * corresponding key in the backend ACTION_EFFECT_FN dispatch table.
 *
 * If this test fails after adding a new action, add the matching entry in
 * backend/src/lib/actions.ts ACTION_EFFECT_FN (and vice versa).
 */

import { describe, it, expect } from "vitest";
import { SERVER_EFFECT_KEYS, resolverFor, ACTION_RESOLVERS } from "./actionResolvers";

// The backend ACTION_EFFECT_FN keys, copied here as a stable reference list.
// Update this list when adding new actions to the backend.
const BACKEND_ACTION_EFFECT_KEYS = new Set([
  "attack", "castSpell", "dodge", "dash", "disengage", "help", "hide",
  "search", "ready", "grapple", "opportunityAttack", "castSpellReaction",
  "useObject",
  "rage", "endRage", "recklessAttack",
  "bardicInspiration",
  "channelDivinityCleric",
  "wildShape",
  "secondWind", "actionSurge",
  "flurryOfBlows", "patientDefense", "stepOfTheWind", "stunningStrike",
  "divineSense", "layOnHands", "channelDivinityPaladin",
  "cunningAction",
  "metamagic",
]);

describe("actionResolvers", () => {
  it("every serverEffect:true key exists in the backend ACTION_EFFECT_FN", () => {
    const missing = SERVER_EFFECT_KEYS.filter((k) => !BACKEND_ACTION_EFFECT_KEYS.has(k));
    expect(missing).toEqual([]);
  });

  it("every backend ACTION_EFFECT_FN key has a frontend resolver", () => {
    const missing = [...BACKEND_ACTION_EFFECT_KEYS].filter((k) => !resolverFor(k));
    expect(missing).toEqual([]);
  });

  it("all resolvers have a valid kind", () => {
    const VALID_KINDS = new Set([
      "attack-picker", "twf-picker", "spell-picker", "item-picker",
      "heal-roll", "heal-input", "simple-confirm",
    ]);
    for (const r of Object.values(ACTION_RESOLVERS)) {
      expect(VALID_KINDS.has(r.kind), `${r.key} has invalid kind: ${r.kind}`).toBe(true);
    }
  });

  it("the twf off-hand resolver is an economy-only bonus-action picker (#732)", () => {
    const r = resolverFor("twf");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("twf-picker");
    expect(r!.slot).toBe("bonusAction");
    expect(r!.serverEffect).toBe(false); // local roll, like `attack` — not in backend ACTION_EFFECT_FN
  });

  it("all resolvers have a valid slot", () => {
    const VALID_SLOTS = new Set(["action", "bonusAction", "reaction", "free", "special"]);
    for (const r of Object.values(ACTION_RESOLVERS)) {
      expect(VALID_SLOTS.has(r.slot), `${r.key} has invalid slot: ${r.slot}`).toBe(true);
    }
  });

  it("heal-roll resolvers have a healRoll function", () => {
    for (const r of Object.values(ACTION_RESOLVERS)) {
      if (r.kind === "heal-roll") {
        expect(typeof r.healRoll, `${r.key} missing healRoll`).toBe("function");
      }
    }
  });

  it("secondWind healRoll produces correct spec at level 5", () => {
    const resolver = resolverFor("secondWind");
    expect(resolver).toBeDefined();
    const healRoll = resolver!.healRoll!;
    const spec = healRoll({ level: 5 } as Parameters<typeof healRoll>[0]);
    expect(spec).toEqual({ count: 1, faces: 10, modifier: 5 });
  });

  it("resolverFor returns undefined for unknown keys", () => {
    expect(resolverFor("notAnAction")).toBeUndefined();
    expect(resolverFor("")).toBeUndefined();
  });
});
