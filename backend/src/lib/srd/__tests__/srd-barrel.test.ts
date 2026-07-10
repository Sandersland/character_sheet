import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as alignments from "@/lib/srd/alignments.js";
import * as tools from "@/lib/srd/tools.js";
import * as conditionData from "@/lib/srd/condition-data.js";
import * as itemRarity from "@/lib/srd/item-rarity.js";
import * as fightingStyles from "@/lib/srd/fighting-styles.js";
import * as armorClass from "@/lib/srd/armor-class.js";
import * as movement from "@/lib/srd/movement.js";
import * as extraAttack from "@/lib/srd/extra-attack.js";
import * as spellcastingTables from "@/lib/srd/spellcasting-tables.js";
import * as math from "@/lib/srd/math.js";
import * as advancementSlots from "@/lib/srd/advancement-slots.js";
import * as proficiencies from "@/lib/srd/proficiencies.js";
import * as weaponDamage from "@/lib/srd/weapon-damage.js";
import * as characterDerive from "@/lib/srd/character-derive.js";
import * as feats from "@/lib/srd/feats.js";
import * as barrel from "@/lib/srd/srd.js";

// Pins the #663 decomposition of srd.ts into 15 topical files, each importable
// on its own, with srd.ts kept as a thin re-export barrel (byte-identical
// public API — same object identities, not copies).

describe("srd.ts topical decomposition (#663)", () => {
  it("splits rules data into 15 independently-importable topical files", () => {
    expect(alignments.ALIGNMENTS).toBeDefined();
    expect(tools.TOOLS).toBeDefined();
    expect(conditionData.CONDITIONS).toBeDefined();
    expect(itemRarity.ITEM_RARITIES).toBeDefined();
    expect(fightingStyles.FIGHTING_STYLES).toBeDefined();
    expect(armorClass.deriveArmorClass).toBeInstanceOf(Function);
    expect(movement.deriveUnarmoredMovement).toBeInstanceOf(Function);
    expect(extraAttack.deriveAttacksPerAction).toBeInstanceOf(Function);
    expect(spellcastingTables.deriveSpellcasting).toBeInstanceOf(Function);
    expect(math.abilityModifier).toBeInstanceOf(Function);
    expect(advancementSlots.advancementSlotsForLevel).toBeInstanceOf(Function);
    expect(proficiencies.CLASS_PROFICIENCY_GRANTS).toBeDefined();
    expect(weaponDamage.deriveWeaponDamage).toBeInstanceOf(Function);
    expect(characterDerive.deriveCreatedCharacter).toBeInstanceOf(Function);
    expect(feats.deriveFeatBonuses).toBeInstanceOf(Function);
  });

  it("re-exports every topical symbol from srd.ts by identity, not by copy", () => {
    expect(barrel.ALIGNMENTS).toBe(alignments.ALIGNMENTS);
    expect(barrel.TOOLS).toBe(tools.TOOLS);
    expect(barrel.CONDITIONS).toBe(conditionData.CONDITIONS);
    expect(barrel.ITEM_RARITIES).toBe(itemRarity.ITEM_RARITIES);
    expect(barrel.FIGHTING_STYLES).toBe(fightingStyles.FIGHTING_STYLES);
    expect(barrel.deriveArmorClass).toBe(armorClass.deriveArmorClass);
    expect(barrel.deriveUnarmoredMovement).toBe(movement.deriveUnarmoredMovement);
    expect(barrel.deriveAttacksPerAction).toBe(extraAttack.deriveAttacksPerAction);
    expect(barrel.deriveSpellcasting).toBe(spellcastingTables.deriveSpellcasting);
    expect(barrel.abilityModifier).toBe(math.abilityModifier);
    expect(barrel.advancementSlotsForLevel).toBe(advancementSlots.advancementSlotsForLevel);
    expect(barrel.CLASS_PROFICIENCY_GRANTS).toBe(proficiencies.CLASS_PROFICIENCY_GRANTS);
    expect(barrel.deriveWeaponDamage).toBe(weaponDamage.deriveWeaponDamage);
    expect(barrel.deriveCreatedCharacter).toBe(characterDerive.deriveCreatedCharacter);
    expect(barrel.deriveFeatBonuses).toBe(feats.deriveFeatBonuses);
  });

  it("keeps srd.ts itself a thin barrel rather than a monolith", () => {
    const path = fileURLToPath(new URL("../srd.ts", import.meta.url));
    const lineCount = readFileSync(path, "utf8").split("\n").length;
    expect(lineCount).toBeLessThan(60);
  });
});
