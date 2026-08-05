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
// Update this list when adding new actions to the backend. secondWind/
// actionSurge are row-driven now (#1528) — dispatched via
// routes/character/actions.ts's row-driven path, not this table, so they're
// deliberately absent here too (parity would otherwise falsely fail).
// rage/endRage joined that same row-driven set (#1686, a "toggle"
// resolverKind row) — also deliberately absent.
const BACKEND_ACTION_EFFECT_KEYS = new Set([
  "attack", "castSpell", "dodge", "dash", "disengage", "help", "hide",
  "search", "ready", "grapple", "opportunityAttack", "castSpellReaction",
  "useObject",
  "recklessAttack",
  "bardicInspiration",
  "channelDivinity",
  "wildShape",
  "bonusUnarmedStrike",
  "flurryOfBlows", "patientDefenseFocus", "stepOfTheWindFocus",
  "patientDefenseKi", "stepOfTheWindKi", // 2014 (#1500)
  "deflectAttacksRedirect",
  "deflectMissilesThrow", // 2014 (#1500)
  "wholenessOfBody",
  "wholenessOfBodyAction", // 2014 (#1501)
  "handOfHealing", "handOfHealingFlurry",
  "divineSense", "layOnHands",
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
      "attack-picker", "twf-picker", "flurry-picker", "spell-picker", "item-picker",
      "heal-roll", "heal-input", "simple-confirm", "loadout-picker",
    ]);
    for (const r of Object.values(ACTION_RESOLVERS)) {
      expect(VALID_KINDS.has(r.kind), `${r.key} has invalid kind: ${r.kind}`).toBe(true);
    }
  });

  it("Flurry of Blows resolves Unarmed Strikes only for 1 Focus, not the weapon attack-picker (#1217)", () => {
    const r = resolverFor("flurryOfBlows");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("flurry-picker");
    expect(r!.slot).toBe("bonusAction");
    expect(r!.resourceKey).toBe("focus");
    expect(r!.resourceAmount).toBe(1);
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

  it("Stunning Strike has no resolver — it's a post-hit rider, not a selectable action (#1242)", () => {
    expect(resolverFor("stunningStrike")).toBeUndefined();
  });

  it("Shadow Step is an economy-only simple-confirm reminder (2024 rewrite, #1246)", () => {
    const step = resolverFor("shadowStep");
    expect(step).toBeDefined();
    expect(step!.kind).toBe("simple-confirm");
    expect(step!.slot).toBe("bonusAction");
    expect(step!.serverEffect).toBe(false); // reminder only — no backend ACTION_EFFECT_FN
  });

  it("has no opportunist resolver (2014 L17 feature retired — Cloak of Shadows is L17 now)", () => {
    expect(resolverFor("opportunist")).toBeUndefined();
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

  it("Deflect Attacks base reduction is a reaction reminder; the redirect is a real Focus spend (#1241)", () => {
    const deflect = resolverFor("deflectAttacks");
    expect(deflect).toBeDefined();
    expect(deflect!.kind).toBe("simple-confirm");
    expect(deflect!.slot).toBe("reaction");
    expect(deflect!.serverEffect).toBe(false); // reminder only — the dynamic roll is bespoke in useTurnActions

    const redirect = resolverFor("deflectAttacksRedirect");
    expect(redirect).toBeDefined();
    expect(redirect!.kind).toBe("simple-confirm");
    expect(redirect!.slot).toBe("free"); // decided within the same reaction, not its own slot
    expect(redirect!.serverEffect).toBe(true);
    expect(redirect!.resourceKey).toBe("focus");
  });

  it("Warrior of the Open Hand: Wholeness of Body is a heal-roll bonus action (#1245)", () => {
    const r = resolverFor("wholenessOfBody");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("heal-roll");
    expect(r!.slot).toBe("bonusAction");
    expect(r!.serverEffect).toBe(true);
    expect(r!.resourceKey).toBe("wholenessOfBody");
    expect(r!.healRoll).toBeDefined();
  });

  it("Warrior of the Open Hand: Fleet Step is a pure free-cost reminder (#1245)", () => {
    const r = resolverFor("fleetStep");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("simple-confirm");
    expect(r!.slot).toBe("free");
    expect(r!.serverEffect).toBe(false);
  });

  it("Open Hand Technique / Quivering Palm have no resolver — post-hit riders with their own sections (#1245)", () => {
    expect(resolverFor("openHandTechnique")).toBeUndefined();
    expect(resolverFor("quiveringPalm")).toBeUndefined();
  });

  it("Way of the Open Hand (2014): Wholeness of Body is a heal-roll ACTION, a distinct key from the 2024 bonusAction shape (#1501)", () => {
    const r = resolverFor("wholenessOfBodyAction");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("heal-roll");
    expect(r!.slot).toBe("action");
    expect(r!.serverEffect).toBe(true);
    expect(r!.resourceKey).toBe("wholenessOfBody");
    expect(r!.healRoll).toBeDefined();
  });

  it("Way of the Open Hand (2014): wholenessOfBodyAction healRoll is a FLAT 3 x monk level, no dice (#1501)", () => {
    const resolver = resolverFor("wholenessOfBodyAction");
    expect(resolver).toBeDefined();
    const healRoll = resolver!.healRoll!;
    const mock = {
      classes: [{ id: "1", name: "monk", level: 6, needsSubclass: false, subclassUnavailable: false }],
    } as Parameters<typeof healRoll>[0];
    expect(healRoll(mock)).toEqual({ count: 0, faces: 1, modifier: 18 });
  });

  it("Way of the Open Hand (2014): Tranquility is a pure free-cost reminder (#1501)", () => {
    const r = resolverFor("tranquility");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("simple-confirm");
    expect(r!.slot).toBe("free");
    expect(r!.serverEffect).toBe(false);
  });

  // Without this entry partitionClassActions filters the backend's fastHands row
  // out and no card renders at all — the resolver registry is the gate, not the
  // payload (#1431).
  it("Thief's Fast Hands is an economy-only bonus-action confirm (#1431)", () => {
    const r = resolverFor("fastHands");
    expect(r).toBeDefined();
    expect(r!.kind).toBe("simple-confirm");
    expect(r!.slot).toBe("bonusAction");
    expect(r!.serverEffect).toBe(false); // no backend ACTION_EFFECT_FN, like patientDefense
    expect(r!.resourceKey).toBeUndefined();
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

  it("secondWind has no ACTION_RESOLVERS entry — it resolves via the row-driven fallback now (#1528)", () => {
    expect(ACTION_RESOLVERS.secondWind).toBeUndefined();
    expect(resolverFor("secondWind")).toBeUndefined(); // no `action` context → no fallback
  });

  it("secondWind's fallback resolver (#1528) is synthesized from the served action, with no client healRoll — the server rolls it", () => {
    const action = { key: "secondWind", name: "Second Wind", cost: "bonusAction" as const, enabled: true, resolverKind: "heal-roll" };
    const resolver = resolverFor("secondWind", action);
    expect(resolver).toEqual({
      key: "secondWind",
      kind: "heal-roll",
      slot: "bonusAction",
      serverEffect: true,
      resourceKey: "secondWind",
    });
    expect(resolver!.healRoll).toBeUndefined();
  });

  it("wholenessOfBody healRoll produces Martial Arts die + Wis modifier (#1245)", () => {
    const resolver = resolverFor("wholenessOfBody");
    expect(resolver).toBeDefined();
    const healRoll = resolver!.healRoll!;
    const mock = {
      unarmedStrike: { damage: { faces: 8 } },
      abilityScores: { wisdom: 14 },
    } as Parameters<typeof healRoll>[0];
    expect(healRoll(mock)).toEqual({ count: 1, faces: 8, modifier: 2 });
  });

  it("resolverFor returns undefined for unknown keys", () => {
    expect(resolverFor("notAnAction")).toBeUndefined();
    expect(resolverFor("")).toBeUndefined();
  });

  it("resolverFor's row-driven fallback rejects a resolverKind outside ResolutionKind (#1528 finding 4) — never synthesizes a bogus resolver", () => {
    // A served resolverKind that names no real ResolutionKind (a future class
    // retab shipping a typo, or client/server skew) must be treated exactly
    // like "no resolver" — partitionClassActions filters the action out —
    // rather than reaching planActionClick's switch with a value outside its
    // exhaustive union (that used to crash useTurnActions on click).
    const action = { key: "unknownRowAction", name: "Unknown Row Action", cost: "action" as const, enabled: true, resolverKind: "not-a-real-kind" };
    expect(resolverFor("unknownRowAction", action)).toBeUndefined();
  });
});
