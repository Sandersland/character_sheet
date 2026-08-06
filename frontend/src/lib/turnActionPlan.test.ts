import { describe, it, expect } from "vitest";

import { planActionClick } from "@/lib/turnActionPlan";
import { resolverFor } from "@/features/session/actionResolvers";
import type { Character } from "@/types/character";

const character = { level: 5 } as Character;

describe("planActionClick", () => {
  it("consumes the slot only for an unknown action (no resolver)", () => {
    expect(planActionClick(undefined, character)).toEqual({
      consumeSlot: true,
      openResolution: false,
      send: "none",
    });
  });

  it("attack-picker opens the picker, consumes the slot, no server send when ephemeral", () => {
    const plan = planActionClick(resolverFor("attack"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: true, send: "none" });
  });

  it("flurry-picker shares the attack-picker send shape (unreachable at runtime — Flurry actually dispatches via handleFlurryAction, #1217)", () => {
    const plan = planActionClick(resolverFor("flurryOfBlows"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: true, send: "plain" });
  });

  it("heal-roll consumes the slot and rolls the heal spec (Wholeness of Body — a still-client-rolled heal-roll resolver)", () => {
    const plan = planActionClick(resolverFor("wholenessOfBody"), { ...character, unarmedStrike: { damage: { faces: 8 } }, abilityScores: { wisdom: 14 } } as unknown as Character);
    expect(plan.consumeSlot).toBe(true);
    expect(plan.openResolution).toBe(false);
    expect(plan.send).toBe("healRoll");
    expect(plan.healRoll).toBeDefined();
  });

  it("heal-roll with no client healRoll (Second Wind, #1528 — server-rolled now) sends plain instead of healRoll", () => {
    const secondWindResolver = {
      key: "secondWind", kind: "heal-roll" as const, slot: "bonusAction" as const, serverEffect: true, resourceKey: "secondWind",
    };
    const plan = planActionClick(secondWindResolver, character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: false, send: "plain" });
  });

  it("heal-input does NOT consume the slot (committed on heal, #765)", () => {
    const plan = planActionClick(resolverFor("layOnHands"), character);
    expect(plan).toEqual({ consumeSlot: false, openResolution: true, send: "none" });
  });

  it("item-picker does NOT consume the slot (committed on use, #765)", () => {
    const plan = planActionClick(resolverFor("useObject"), character);
    expect(plan).toEqual({ consumeSlot: false, openResolution: true, send: "none" });
  });

  it("spell-picker does NOT consume the slot (committed on cast)", () => {
    const plan = planActionClick(resolverFor("castSpell"), character);
    expect(plan).toEqual({ consumeSlot: false, openResolution: true, send: "none" });
  });

  it("simple-confirm with serverEffect consumes and sends (Bardic Inspiration)", () => {
    const plan = planActionClick(resolverFor("bardicInspiration"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: false, send: "plain" });
  });

  it("toggle shares simple-confirm's exact send shape (Rage, #1686 — row-driven now, no ACTION_RESOLVERS entry)", () => {
    const rageResolver = {
      key: "rage", kind: "toggle" as const, slot: "bonusAction" as const, serverEffect: true, resourceKey: "rage",
    };
    expect(planActionClick(rageResolver, character)).toEqual({ consumeSlot: true, openResolution: false, send: "plain" });

    const endRageResolver = { key: "endRage", kind: "toggle" as const, slot: "bonusAction" as const, serverEffect: true };
    expect(planActionClick(endRageResolver, character)).toEqual({ consumeSlot: true, openResolution: false, send: "plain" });
  });

  it("simple-confirm without serverEffect only consumes (Dodge)", () => {
    const plan = planActionClick(resolverFor("dodge"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: false, send: "none" });
  });

  it("loadout-picker opens the picker without spending the slot (the swap owns the Action)", () => {
    const plan = planActionClick(resolverFor("changeWeapons"), character);
    expect(plan).toEqual({ consumeSlot: false, openResolution: true, send: "none" });
  });
});
