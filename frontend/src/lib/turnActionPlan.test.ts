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

  it("attack-picker with serverEffect sends plain (e.g. flurryOfBlows)", () => {
    const plan = planActionClick(resolverFor("flurryOfBlows"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: true, send: "plain" });
  });

  it("heal-roll consumes the slot and rolls the heal spec (Second Wind)", () => {
    const plan = planActionClick(resolverFor("secondWind"), character);
    expect(plan).toEqual({
      consumeSlot: true,
      openResolution: false,
      send: "healRoll",
      healRoll: { count: 1, faces: 10, modifier: 5 },
    });
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

  it("simple-confirm with serverEffect consumes and sends (Rage)", () => {
    const plan = planActionClick(resolverFor("rage"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: false, send: "plain" });
  });

  it("simple-confirm without serverEffect only consumes (Dodge)", () => {
    const plan = planActionClick(resolverFor("dodge"), character);
    expect(plan).toEqual({ consumeSlot: true, openResolution: false, send: "none" });
  });
});
