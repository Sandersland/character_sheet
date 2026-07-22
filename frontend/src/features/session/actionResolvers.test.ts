/**
 * Parity test: every frontend resolver with serverEffect:true must have a
 * corresponding key in the backend ACTION_EFFECT_FN dispatch table.
 *
 * If this test fails after adding a new action, add the matching entry in
 * the backend ACTION_EFFECT_FN table (and vice versa).
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
  "bonusUnarmedStrike",
  "flurryOfBlows", "patientDefenseFocus", "stepOfTheWindFocus", "stunningStrike",
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
      "heal-roll", "heal-input", "simple-confirm", "loadout-picker",
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

  it("bonusUnarmedStrike reuses the twf-picker economy path, locked-in subtitle (#1218)", () => {
    const r = resolverFor("bonusUnarmedStrike");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("twf-picker");
    expect(r!.slot).toBe("bonusAction");
    expect(r!.serverEffect).toBe(false); // gated at derive time (requiresUnarmored), not spent server-side
    expect(r!.resourceKey).toBeUndefined();
    expect(r!.subtitle).toBe("One Unarmed Strike as a Bonus Action (Dex + Martial Arts die).");
  });

  it("the changeWeapons resolver is a local loadout-picker (no backend effect, #815)", () => {
    const r = resolverFor("changeWeapons");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("loadout-picker");
    expect(r!.serverEffect).toBe(false); // the swap posts inventory transactions, not applyActionTransactions
  });

  it("Shadow Step / Opportunist are economy-only simple-confirm reminders (#440)", () => {
    const step = resolverFor("shadowStep");
    expect(step).toBeDefined();
    expect(step!.kind).toBe("simple-confirm");
    expect(step!.slot).toBe("bonusAction");
    expect(step!.serverEffect).toBe(false); // reminder only — no backend ACTION_EFFECT_FN

    const opp = resolverFor("opportunist");
    expect(opp).toBeDefined();
    expect(opp!.kind).toBe("simple-confirm");
    expect(opp!.slot).toBe("reaction");
    expect(opp!.serverEffect).toBe(false);
  });

  it("Patient Defense / Step of the Wind free variants are economy-only simple-confirm reminders (#1240)", () => {
    const patient = resolverFor("patientDefense");
    expect(patient).toBeDefined();
    expect(patient!.kind).toBe("simple-confirm");
    expect(patient!.slot).toBe("bonusAction");
    expect(patient!.serverEffect).toBe(false); // free variant — no backend ACTION_EFFECT_FN
    expect(patient!.resourceKey).toBeUndefined();

    const step = resolverFor("stepOfTheWind");
    expect(step).toBeDefined();
    expect(step!.kind).toBe("simple-confirm");
    expect(step!.slot).toBe("bonusAction");
    expect(step!.serverEffect).toBe(false);
    expect(step!.resourceKey).toBeUndefined();
  });

  it("Patient Defense / Step of the Wind 1-Focus variants spend the focus pool (#1240)", () => {
    const patientFocus = resolverFor("patientDefenseFocus");
    expect(patientFocus).toBeDefined();
    expect(patientFocus!.serverEffect).toBe(true);
    expect(patientFocus!.resourceKey).toBe("focus");

    const stepFocus = resolverFor("stepOfTheWindFocus");
    expect(stepFocus).toBeDefined();
    expect(stepFocus!.serverEffect).toBe(true);
    expect(stepFocus!.resourceKey).toBe("focus");
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
