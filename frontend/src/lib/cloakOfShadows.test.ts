import { describe, expect, it } from "vitest";

import { cloakOfShadowsView } from "@/lib/cloakOfShadows";
import type { AvailableAction, Character, ConditionEntry } from "@/types/character";

const WARRIOR_OF_SHADOW_ACTION: AvailableAction = {
  key: "cloakOfShadows",
  name: "Cloak of Shadows",
  cost: "action",
  enabled: true,
  reminder: "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible…",
};

const WAY_OF_SHADOW_ACTION: AvailableAction = {
  key: "cloakOfShadows",
  name: "Cloak of Shadows",
  cost: "action",
  enabled: true,
  reminder: "While in dim light or darkness, use your action to become invisible… No ki cost, no duration cap.",
};

function makeCharacter(
  action: AvailableAction | undefined,
  active: ConditionEntry[] = [],
): Character {
  return {
    id: "char-1",
    conditions: { active, exhaustion: 0 },
    availableActions: action ? [action] : [],
  } as unknown as Character;
}

describe("cloakOfShadowsView (#1738)", () => {
  it("reads the served reminder and enabled state verbatim", () => {
    const view = cloakOfShadowsView(makeCharacter(WARRIOR_OF_SHADOW_ACTION));
    expect(view.reminder).toBe(WARRIOR_OF_SHADOW_ACTION.reminder);
    expect(view.canActivate).toBe(true);
    expect(view.isInvisible).toBe(false);
  });

  it("is always activatable for the 2014 no-cost row", () => {
    const view = cloakOfShadowsView(makeCharacter(WAY_OF_SHADOW_ACTION));
    expect(view.canActivate).toBe(true);
    expect(view.reminder).toContain("No ki cost, no duration cap");
  });

  it("surfaces the server's disabledReason when the row reports not enough focus", () => {
    const view = cloakOfShadowsView(
      makeCharacter({ ...WARRIOR_OF_SHADOW_ACTION, enabled: false, disabledReason: "Need 3 focus, have 2" }),
    );
    expect(view.canActivate).toBe(false);
    expect(view.disabledTitle).toBe("Need 3 focus, have 2");
  });

  it("falls back to a generic disabled title when the row omits disabledReason", () => {
    const view = cloakOfShadowsView(makeCharacter({ ...WARRIOR_OF_SHADOW_ACTION, enabled: false }));
    expect(view.disabledTitle).toBe("Cannot activate");
  });

  it("reports isInvisible from the active conditions list, matched by source", () => {
    const invisible: ConditionEntry = { key: "invisible", source: "Cloak of Shadows", appliedAt: new Date().toISOString() };
    expect(cloakOfShadowsView(makeCharacter(WARRIOR_OF_SHADOW_ACTION, [invisible])).isInvisible).toBe(true);
  });

  it("does not report isInvisible for invisibility applied by a different source", () => {
    const invisibleFromSpell: ConditionEntry = { key: "invisible", source: "Invisibility", appliedAt: new Date().toISOString() };
    const view = cloakOfShadowsView(makeCharacter(WARRIOR_OF_SHADOW_ACTION, [invisibleFromSpell]));
    expect(view.isInvisible).toBe(false);
    expect(view.canActivate).toBe(true);
  });

  it("defaults safely when the action row is absent", () => {
    const view = cloakOfShadowsView(makeCharacter(undefined));
    expect(view.reminder).toBeUndefined();
    expect(view.canActivate).toBe(false);
  });
});
