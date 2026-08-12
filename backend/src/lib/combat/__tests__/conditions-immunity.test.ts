// #1121: deriveImmuneConditions is the ONE shared rule function the
// conditions write-guard (resolveApplyCondition) and character-serialize.ts's
// wire `immuneConditions` both call — pure-function coverage here (no DB),
// mirroring class-feature-rows.test.ts's `row()`-helper style.
// `ImmuneConditionEntryRows` (classRows/subclassRows/effLevel) is deliberately
// a plain shape, not the raw Prisma payload — its own header explains why:
// this keeps the function directly testable with literals. Integration
// coverage (the real Mindless Rage/Beguiling Defenses/Nature's Ward seed rows
// through the real routes) lives in routes/character/__tests__/
// actions-rage-mindless.test.ts and conditions-immunity-features.test.ts.
import { describe, expect, it } from "vitest";

import { deriveImmuneConditions, type ImmuneConditionEntryRows } from "@/lib/combat/conditions.js";
import type { ActiveEffectsMutableState } from "@/lib/combat/active-effects.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";

function classFeature(overrides: Partial<ClassFeatureRow> = {}): ClassFeatureRow {
  return { name: "Test Feature", level: 1, description: "test", edition: "EDITION_2014", ...overrides };
}

function entry(overrides: Partial<ImmuneConditionEntryRows> = {}): ImmuneConditionEntryRows {
  return { classRows: [], subclassRows: [], effLevel: 10, ...overrides };
}

const noEffects: ActiveEffectsMutableState = { buffs: [] };

describe("deriveImmuneConditions (#1121)", () => {
  it("returns nothing for a character with no immunity-granting buffs or rows", () => {
    expect(deriveImmuneConditions([entry()], "EDITION_2024", noEffects)).toEqual([]);
  });

  it("includes a buff-declared immunity (activeImmuneConditions half — mirrors resistDamageTypes' consumer)", () => {
    const effects: ActiveEffectsMutableState = {
      buffs: [{ id: "1", key: "x", target: "athletics", modifier: 0, source: "X", duration: "while-active", conditionImmunities: ["blinded"] }],
    };
    expect(deriveImmuneConditions([], "EDITION_2024", effects)).toEqual(["blinded"]);
  });

  it("includes an unconditional subclass-row immunity (Beguiling Defenses/Nature's Ward's shape) once its own level gate is met", () => {
    const row = classFeature({ name: "Nature's Ward", level: 10, edition: "EDITION_2024", conditionImmunities: ["poisoned"] });
    expect(deriveImmuneConditions([entry({ subclassRows: [row], effLevel: 9 })], "EDITION_2024", noEffects)).toEqual([]);
    expect(deriveImmuneConditions([entry({ subclassRows: [row], effLevel: 10 })], "EDITION_2024", noEffects)).toEqual(["poisoned"]);
  });

  it("includes a buff-gated subclass-row immunity ONLY while the gating buff is active (Mindless Rage's shape)", () => {
    const mindlessRage = classFeature({
      name: "Mindless Rage",
      level: 6,
      edition: "EDITION_2024",
      conditionImmunities: ["charmed", "frightened"],
      conditionImmunitiesRequireActiveBuff: "rage",
    });
    const entries = [entry({ subclassRows: [mindlessRage], effLevel: 6 })];
    expect(deriveImmuneConditions(entries, "EDITION_2024", noEffects)).toEqual([]);
    const raging: ActiveEffectsMutableState = {
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active" }],
    };
    expect(deriveImmuneConditions(entries, "EDITION_2024", raging)).toEqual(["charmed", "frightened"]);
  });

  it("a level-down that drops below the gating row's level removes the immunity on read (derive, don't persist)", () => {
    const mindlessRage = classFeature({
      name: "Mindless Rage",
      level: 6,
      edition: "EDITION_2024",
      conditionImmunities: ["charmed", "frightened"],
      conditionImmunitiesRequireActiveBuff: "rage",
    });
    const raging: ActiveEffectsMutableState = {
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active" }],
    };
    // Below L6 (e.g. a reconciled level-down), Mindless Rage no longer applies
    // even though the character is still raging.
    expect(deriveImmuneConditions([entry({ subclassRows: [mindlessRage], effLevel: 5 })], "EDITION_2024", raging)).toEqual([]);
  });

  it("only the matching edition's row contributes — never falls back", () => {
    const row = classFeature({ name: "Beguiling Defenses", level: 10, edition: "EDITION_2014", conditionImmunities: ["charmed"] });
    const entries = [entry({ subclassRows: [row], effLevel: 10 })];
    expect(deriveImmuneConditions(entries, "EDITION_2024", noEffects)).toEqual([]);
    expect(deriveImmuneConditions(entries, "EDITION_2014", noEffects)).toEqual(["charmed"]);
  });

  it("unions buff-declared and row-declared sources, deduped", () => {
    const row = classFeature({ name: "Nature's Ward", level: 10, edition: "EDITION_2024", conditionImmunities: ["poisoned"] });
    const entries = [entry({ subclassRows: [row], effLevel: 10 })];
    const effects: ActiveEffectsMutableState = {
      buffs: [{ id: "1", key: "x", target: "athletics", modifier: 0, source: "X", duration: "while-active", conditionImmunities: ["poisoned", "blinded"] }],
    };
    expect(new Set(deriveImmuneConditions(entries, "EDITION_2024", effects))).toEqual(new Set(["blinded", "poisoned"]));
  });

  it("base class rows contribute too, not only subclass rows", () => {
    const row = classFeature({ name: "Some Base Feature", level: 1, edition: "EDITION_2024", conditionImmunities: ["blinded"] });
    expect(deriveImmuneConditions([entry({ classRows: [row], effLevel: 1 })], "EDITION_2024", noEffects)).toEqual(["blinded"]);
  });

  it("multiclass: each entry carries its own already-resolved effLevel independently", () => {
    const mindlessRage = classFeature({
      name: "Mindless Rage",
      level: 6,
      edition: "EDITION_2024",
      conditionImmunities: ["charmed", "frightened"],
      conditionImmunitiesRequireActiveBuff: "rage",
    });
    const entries = [entry({ subclassRows: [mindlessRage], effLevel: 6 }), entry({ effLevel: 2 })];
    const raging: ActiveEffectsMutableState = {
      buffs: [{ id: "r", key: "rage", target: "meleeDamage", modifier: 2, source: "Rage", duration: "while-active" }],
    };
    // The caller (immuneConditionEntryRows) resolves each entry's own
    // effLevel via effectiveEntryLevel BEFORE this function ever sees it —
    // this function just trusts whatever effLevel it's handed per entry.
    expect(deriveImmuneConditions(entries, "EDITION_2024", raging)).toEqual(["charmed", "frightened"]);
  });
});
