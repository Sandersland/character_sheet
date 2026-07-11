import { describe, expect, it } from "vitest";

import { canPromptManeuvers, maneuverPlacement, planManeuverPrompt, resolveDamageSelection } from "@/lib/maneuverPrompt";
import type { ManeuverEntry } from "@/types/character";

const m = (id: string, name: string, placement?: string): ManeuverEntry =>
  ({ id, name, description: "", placement }) as ManeuverEntry;

describe("canPromptManeuvers", () => {
  it("requires a pool with dice remaining and at least one known maneuver", () => {
    const known = [m("1", "Trip Attack", "damageRoll")];
    expect(canPromptManeuvers({ total: 4, remaining: 2 }, known)).toBe(true);
    expect(canPromptManeuvers({ total: 4, remaining: 0 }, known)).toBe(false);
    expect(canPromptManeuvers({ total: 0, remaining: 0 }, known)).toBe(false);
    expect(canPromptManeuvers(null, known)).toBe(false);
    expect(canPromptManeuvers({ total: 4, remaining: 2 }, [])).toBe(false);
  });
});

describe("maneuverPlacement", () => {
  it("defaults legacy/custom entries to damageRoll", () => {
    expect(maneuverPlacement(m("1", "Old Trip"))).toBe("damageRoll");
    expect(maneuverPlacement(m("2", "Precision", "attackRoll"))).toBe("attackRoll");
  });
});

describe("planManeuverPrompt", () => {
  const KNOWN = [
    m("a", "Precision Attack", "attackRoll"),
    m("b", "Trip Attack", "damageRoll"),
    m("c", "Commander's Strike", "attackOption"),
    m("d", "Parry", "reaction"),
    m("e", "Evasive Footwork", "effect"),
  ];

  it("routes only attackRoll/damageRoll maneuvers into the row sections", () => {
    const plan = planManeuverPrompt(KNOWN, true, true);
    expect(plan.attackRollManeuvers.map((x) => x.id)).toEqual(["a"]);
    expect(plan.damageRollManeuvers.map((x) => x.id)).toEqual(["b"]);
    expect(plan.visible).toBe(true);
  });

  it("gates each section on its roll having been made", () => {
    expect(planManeuverPrompt(KNOWN, true, false)).toMatchObject({
      showAttackSection: true,
      showDamageSection: false,
      visible: true,
    });
    expect(planManeuverPrompt(KNOWN, false, false)).toMatchObject({ visible: false });
  });

  it("is invisible when no row-placed maneuver matches a made roll", () => {
    const damageOnly = [m("b", "Trip Attack", "damageRoll")];
    expect(planManeuverPrompt(damageOnly, true, false).visible).toBe(false);
    expect(planManeuverPrompt([m("c", "Commander's Strike", "attackOption")], true, true).visible).toBe(false);
  });
});

describe("resolveDamageSelection", () => {
  const LIST = [m("b", "Trip Attack", "damageRoll"), m("f", "Menacing Attack", "damageRoll")];

  it("keeps a live selection and falls back to the first when stale", () => {
    expect(resolveDamageSelection(LIST, "Menacing Attack")).toBe("Menacing Attack");
    expect(resolveDamageSelection(LIST, "Gone Attack")).toBe("Trip Attack");
    expect(resolveDamageSelection(LIST, "")).toBe("Trip Attack");
    expect(resolveDamageSelection([], "anything")).toBe("");
  });
});
