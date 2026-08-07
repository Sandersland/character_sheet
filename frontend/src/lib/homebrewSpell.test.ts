import { describe, expect, it } from "vitest";

import {
  BLANK_HOMEBREW_SPELL,
  buildHomebrewSpellPayload,
  ownedHomebrewSpells,
  toHomebrewSpellInput,
  validateHomebrewSpellDraft,
} from "@/lib/homebrewSpell";
import type { CatalogSpell, HomebrewSpellInput } from "@/types/character";

describe("buildHomebrewSpellPayload", () => {
  it("trims text fields and carries the core fields + classes", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "  Zap  ", castingTime: " 1 action ", classes: ["wizard"] },
      false,
    );
    expect(payload.name).toBe("Zap");
    expect(payload.castingTime).toBe("1 action");
    expect(payload.classes).toEqual(["wizard"]);
    expect(payload.effectKind).toBeUndefined();
  });

  it("omits effect fields when hasEffect is false even if set on the draft", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Zap", effectKind: "damage", effectDiceCount: 4, effectDiceFaces: 6 },
      false,
    );
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("omits effect fields when hasEffect is true but no effectKind chosen", () => {
    const payload = buildHomebrewSpellPayload({ ...BLANK_HOMEBREW_SPELL, name: "Zap", effectDiceCount: 4 }, true);
    expect(payload.effectKind).toBeUndefined();
    expect(payload.effectDiceCount).toBeUndefined();
  });

  it("includes dice/modifier fields when hasEffect is true and a kind is chosen", () => {
    const payload = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Zap", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, effectModifier: 1 },
      true,
    );
    expect(payload.effectKind).toBe("heal");
    expect(payload.effectDiceCount).toBe(2);
    expect(payload.effectDiceFaces).toBe(4);
    expect(payload.effectModifier).toBe(1);
  });

  it("includes damage type + attack type only for effectKind 'damage'", () => {
    const heal = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Cure", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, damageType: "fire", attackType: "attack" },
      true,
    );
    expect(heal.damageType).toBeUndefined();
    expect(heal.attackType).toBeUndefined();

    const damage = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "damage", effectDiceCount: 8, effectDiceFaces: 6, damageType: "fire", attackType: "attack" },
      true,
    );
    expect(damage.damageType).toBe("fire");
    expect(damage.attackType).toBe("attack");
  });

  it("includes saveAbility/saveEffect only when attackType is 'save'", () => {
    const attack = buildHomebrewSpellPayload(
      {
        ...BLANK_HOMEBREW_SPELL,
        name: "Bolt",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        attackType: "attack",
        saveAbility: "dexterity",
      },
      true,
    );
    expect(attack.saveAbility).toBeUndefined();
    expect(attack.saveEffect).toBeUndefined();

    const save = buildHomebrewSpellPayload(
      {
        ...BLANK_HOMEBREW_SPELL,
        name: "Fireball",
        effectKind: "damage",
        effectDiceCount: 8,
        effectDiceFaces: 6,
        attackType: "save",
        saveAbility: "dexterity",
        saveEffect: "half",
      },
      true,
    );
    expect(save.saveAbility).toBe("dexterity");
    expect(save.saveEffect).toBe("half");
  });

  it("includes upcastDicePerLevel when set, omits it when blank", () => {
    const withUpcast = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4, upcastDicePerLevel: 1 },
      true,
    );
    expect(withUpcast.upcastDicePerLevel).toBe(1);

    const withoutUpcast = buildHomebrewSpellPayload(
      { ...BLANK_HOMEBREW_SPELL, name: "Bolt", effectKind: "heal", effectDiceCount: 2, effectDiceFaces: 4 },
      true,
    );
    expect(withoutUpcast.upcastDicePerLevel).toBeUndefined();
  });
});

describe("validateHomebrewSpellDraft", () => {
  const base: HomebrewSpellInput = {
    ...BLANK_HOMEBREW_SPELL,
    name: "Bolt",
    description: "A bolt of arcane energy.",
    classes: [],
  };

  it("requires a name", () => {
    expect(validateHomebrewSpellDraft({ ...base, name: "  " }, false)).toMatch(/name/i);
  });

  it("requires a description", () => {
    expect(validateHomebrewSpellDraft({ ...base, description: "  " }, false)).toMatch(/description/i);
  });

  it("requires level between 0 and 9", () => {
    expect(validateHomebrewSpellDraft({ ...base, level: 10 }, false)).toMatch(/level/i);
    expect(validateHomebrewSpellDraft({ ...base, level: -1 }, false)).toMatch(/level/i);
    expect(validateHomebrewSpellDraft({ ...base, level: 9 }, false)).toBeNull();
  });

  it("passes for a utility spell with no effect enabled", () => {
    expect(validateHomebrewSpellDraft(base, false)).toBeNull();
  });

  it("requires dice count + faces when an effect is enabled with a kind", () => {
    expect(validateHomebrewSpellDraft({ ...base, effectKind: "damage" }, true)).toMatch(/dice/i);
    expect(
      validateHomebrewSpellDraft({ ...base, effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 6 }, true),
    ).toBeNull();
  });

  it("requires saveAbility when attackType is 'save'", () => {
    expect(
      validateHomebrewSpellDraft(
        { ...base, effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 6, attackType: "save" },
        true,
      ),
    ).toMatch(/save ability/i);
    expect(
      validateHomebrewSpellDraft(
        {
          ...base,
          effectKind: "damage",
          effectDiceCount: 1,
          effectDiceFaces: 6,
          attackType: "save",
          saveAbility: "wisdom",
        },
        true,
      ),
    ).toBeNull();
  });

  it("ignores effect fields entirely when hasEffect is false", () => {
    expect(validateHomebrewSpellDraft({ ...base, effectKind: "damage" }, false)).toBeNull();
  });
});

function catalogSpell(over: Partial<CatalogSpell> = {}): CatalogSpell {
  return {
    id: "s1",
    name: "Test Bolt",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "A bolt of test energy.",
    concentration: false,
    ritual: false,
    classes: ["wizard"],
    cantripScaling: false,
    ...over,
  };
}

describe("ownedHomebrewSpells", () => {
  it("keeps only rows with an ownerId, dropping seeded rows", () => {
    const seeded = catalogSpell({ id: "seeded", ownerId: undefined });
    const homebrew = catalogSpell({ id: "own", ownerId: "u1" });
    expect(ownedHomebrewSpells([seeded, homebrew])).toEqual([homebrew]);
  });

  it("returns an empty list when the catalog has no homebrew", () => {
    expect(ownedHomebrewSpells([catalogSpell({ ownerId: undefined })])).toEqual([]);
  });

  // #1808 leak-fix, epic #1795 8/9 combined-state review: a DM's CAMPAIGN-
  // scope fork has no ownerId (its CatalogEntry.ownerUserId is null, scope
  // CAMPAIGN, #1796) but IS manageable BY ITS DM — gated on the server-
  // computed `catalog.editable` (isCatalogEntryEditable, lib/catalog/
  // entitlement.ts), never on scope alone: #1811's campaign-aware picker
  // serves a CAMPAIGN row to every campaign member, not just its DM.
  it("keeps a CAMPAIGN-scope row with no ownerId when catalog.editable is true (the DM's own fork)", () => {
    const campaignFork = catalogSpell({
      id: "campaign-fork",
      ownerId: undefined,
      catalog: { entryId: "entry-1", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: true },
    });
    expect(ownedHomebrewSpells([campaignFork])).toEqual([campaignFork]);
  });

  // The leak this gate exists to close: a non-DM member's picker also gets
  // this row (#1811) but with editable: false — it must never enter the
  // caller's OWN manage list, or the Edit/Delete buttons it feeds would 403.
  it("drops a CAMPAIGN-scope row when catalog.editable is false (a fellow, non-DM member)", () => {
    const notMyFork = catalogSpell({
      id: "campaign-fork",
      ownerId: undefined,
      catalog: { entryId: "entry-1", scope: "CAMPAIGN", isFork: true, forkedFromId: "entry-origin", editable: false },
    });
    expect(ownedHomebrewSpells([notMyFork])).toEqual([]);
  });

  it("still drops a GLOBAL row with no ownerId", () => {
    const seededGlobal = catalogSpell({
      id: "seeded",
      ownerId: undefined,
      catalog: { entryId: "entry-2", scope: "GLOBAL", isFork: false, forkedFromId: null, editable: false },
    });
    expect(ownedHomebrewSpells([seededGlobal])).toEqual([]);
  });
});

describe("toHomebrewSpellInput", () => {
  it("maps a served CatalogSpell into an editable draft", () => {
    const spell = catalogSpell({
      ownerId: "u1",
      name: "Ember Bolt",
      level: 2,
      components: { verbal: true, somatic: true, material: false },
      classes: ["wizard", "sorcerer"],
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 6,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
    });

    expect(toHomebrewSpellInput(spell)).toEqual({
      name: "Ember Bolt",
      level: 2,
      school: "evocation",
      castingTime: "1 action",
      range: "60 feet",
      duration: "Instantaneous",
      description: "A bolt of test energy.",
      concentration: false,
      ritual: false,
      components: { verbal: true, somatic: true, material: false },
      classes: ["wizard", "sorcerer"],
      effectKind: "damage",
      effectDiceCount: 3,
      effectDiceFaces: 6,
      effectModifier: undefined,
      damageType: "fire",
      attackType: "save",
      saveAbility: "dexterity",
      saveEffect: "half",
      upcastDicePerLevel: undefined,
    });
  });

  it("defaults components to all-false-but-verbal when the row has none", () => {
    const spell = catalogSpell({ ownerId: "u1", components: undefined });
    expect(toHomebrewSpellInput(spell).components).toEqual({ verbal: true, somatic: false, material: false });
  });
});
