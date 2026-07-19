import {
  abilityModifier,
  deriveArmorClass,
  deriveArmorClassParts,
  deriveArmoredArmorClassParts,
  deriveFastMovement,
  deriveFeatBonuses,
  deriveImprovisedAttack,
  deriveUnarmedDamageDie,
  deriveUnarmedStrike,
  deriveUnarmoredMovement,
  type BodyArmorCategory,
} from "@/lib/srd/srd.js";
import { exhaustionSpeedPenalty } from "@/lib/srd/condition-data.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import type { TargetModifierMap } from "./effects.js";

// The best equipped body armor snapshot (or null when unarmored) in the shape
// deriveArmorClassParts consumes.
type BestBodyArmor = Parameters<typeof deriveArmorClassParts>[0];

// AC is derived, not persisted: best equipped body armor + Dex (per category)
// + shield. The BODY slot holds one body armor (#565), so "best" is defensive.
// bestArmor/hasShield also feed speed (Unarmored/Fast Movement) and the Monk
// unarmed strike, so they're selected once here and threaded to those builders.
export function selectEquippedBodyArmor(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
): { bestArmor: BestBodyArmor; hasShield: boolean } {
  const equippedArmorDetails = row.inventoryItems
    .filter((i) => i.equippedSlot != null && i.armorDetail)
    .map((i) => ({ name: i.name, ...i.armorDetail! }));
  const hasShield = equippedArmorDetails.some((a) => a.armorCategory === "shield");
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  const bestArmor = equippedArmorDetails
    .filter((a): a is (typeof equippedArmorDetails)[number] & { armorCategory: BodyArmorCategory } => a.armorCategory !== "shield")
    .reduce<BestBodyArmor>((best, a) => {
      const candidate = {
        name: a.name,
        armorCategory: a.armorCategory,
        baseArmorClass: a.baseArmorClass,
        dexModifierMax: a.dexModifierMax,
      };
      if (best === null) return candidate;
      return deriveArmorClass(candidate, false, dexMod) > deriveArmorClass(best, false, dexMod)
        ? candidate
        : best;
    }, null);
  return { bestArmor, hasShield };
}

// AC assembly: labeled addends whose exact sum is armorClass (single source of
// the base formula in srd/srd.ts). Layered in order: base parts (armor/Dex/shield/
// Unarmored Defense/Mage Armor best-of) → Defense Fighting Style feat → feat AC →
// per-source "ac" buffs → the acFloor (Barkskin) reconciling part last.
// The branchiness is inherent to the 5e AC layering (each optional source is a
// conditional addend), not accidental complexity.
// fallow-ignore-next-line complexity -- inherent 5e AC layering (one conditional addend per source), not accidental complexity
export function buildArmorClassView(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  clampedAdvancements: AdvancementEntry[],
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
): { armorClass: number; armorClassBreakdown: ReturnType<typeof deriveArmorClassParts> } {
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  // Feeds Unarmored Defense (Barbarian/Monk) when no body armor is equipped.
  const unarmoredDefense = {
    classNames: row.classEntries.map((e) => e.name),
    conMod: abilityModifier(effectiveScores.constitution ?? 10),
    wisMod: abilityModifier(effectiveScores.wisdom ?? 10),
  };
  // Mage Armor (#363): a spell buff sets the unarmored base to 13 + Dex — the
  // highest-valued `acUnarmoredBase` buff becomes a best-of candidate in the
  // unarmored formula (ignored while wearing body armor; the equip hook true-ends it).
  const mageArmor = (buffTargets.acUnarmoredBase ?? []).reduce<{ label: string; value: number } | undefined>(
    (best, c) => (best && best.value >= c.modifier ? best : { label: c.source, value: c.modifier }),
    undefined,
  );
  // Labeled AC addends; armorClass below is their exact sum (single source in srd/srd.ts).
  const acParts = deriveArmorClassParts(bestArmor, hasShield, dexMod, unarmoredDefense, mageArmor);
  // Defense Fighting Style feat only applies while wearing body armor (SRD 5.2, #1137).
  if (bestArmor !== null) {
    for (const part of deriveArmoredArmorClassParts(clampedAdvancements)) acParts.push(part);
  }
  if (featBonuses.armorClass !== 0) acParts.push({ label: "Feats", value: featBonuses.armorClass });
  // Active-item AC bonuses (#383) + flat AC spell buffs (Shield of Faith +2, #363):
  // each labeled per source. v1 applies only unconditional bonuses; a conditional
  // one surfaces as reminder text (value 0) rather than being silently added.
  for (const c of buffTargets.ac ?? []) {
    if (c.condition) acParts.push({ label: c.source, value: 0, reminder: c.condition });
    else acParts.push({ label: c.source, value: c.modifier });
  }
  // Barkskin (#363): AC can't drop below the floor while active — applied last,
  // stacking over armor/Dex/buffs. Kept in the breakdown as a reconciling part so
  // the labeled parts still sum to armorClass (a 0-value reminder when AC already
  // meets the floor). Highest floor wins if several are active.
  const acFloor = (buffTargets.acFloor ?? []).reduce<{ source: string; value: number } | undefined>(
    (best, c) => (best && best.value >= c.modifier ? best : { source: c.source, value: c.modifier }),
    undefined,
  );
  if (acFloor) {
    const subtotal = acParts.reduce((total, p) => total + p.value, 0);
    if (subtotal < acFloor.value) {
      acParts.push({ label: `${acFloor.source} (floor ${acFloor.value})`, value: acFloor.value - subtotal });
    } else {
      acParts.push({ label: acFloor.source, value: 0, reminder: `floor ${acFloor.value}` });
    }
  }
  return {
    armorClass: acParts.reduce((total, p) => total + p.value, 0),
    armorClassBreakdown: acParts,
  };
}

// Per-class level lookup (0 when the class isn't in the mix) — multiclass-safe
// inputs for the class-level-scaled speed/unarmed terms.
function classEntryLevel(row: CharacterWithRelations, className: string): number {
  return row.classEntries.find((e) => e.name.toLowerCase() === className)?.level ?? 0;
}

// Speed is the persisted racial base plus additive terms only (never merged
// into each other): feat speed bonuses, Monk Unarmored Movement (monk class
// level, unarmored & unshielded), Barbarian Fast Movement (barbarian class
// level 5+, not in heavy armor), and any active "speed"-targeted buff
// (e.g. Boots of Speed, #543), then reduced by exhaustion (−5 ft×level, floored
// at 0 — SRD 5.2).
export function buildSpeedView(
  row: CharacterWithRelations,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
  exhaustionLevel: number,
): number {
  const unarmoredMovementBonus = deriveUnarmoredMovement({
    monkLevel: classEntryLevel(row, "monk"),
    isUnarmored: bestArmor === null,
    hasShield,
  });
  const fastMovementBonus = deriveFastMovement({
    barbarianLevel: classEntryLevel(row, "barbarian"),
    wearingHeavyArmor: bestArmor?.armorCategory === "heavy",
  });
  const sum =
    row.speed +
    featBonuses.speed +
    unarmoredMovementBonus +
    fastMovementBonus +
    (buffTargets["speed"] ?? []).reduce((sum, b) => sum + b.modifier, 0);
  return Math.max(0, sum - exhaustionSpeedPenalty(exhaustionLevel));
}

// Unarmed strike + improvised weapon rows. Derived from the same clamped
// advancements slice so Tavern Brawler's upgrades are automatically excluded
// when the character is over-cap. A Monk (unarmored & unshielded) swaps in
// max(Dex, Str) + the level-scaled Martial Arts die, off the monk class-entry
// level for multiclass correctness.
export function buildUnarmedAttacksView(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  proficiencyBonus: number,
  clampedAdvancements: AdvancementEntry[],
  weaponGrants: ReadonlyArray<{ name: string }>,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
): { unarmedStrike: ReturnType<typeof deriveUnarmedStrike>; improvisedWeapon: ReturnType<typeof deriveImprovisedAttack> } {
  const unarmedDie = deriveUnarmedDamageDie(clampedAdvancements);
  const unarmedStrike = deriveUnarmedStrike(effectiveScores, proficiencyBonus, unarmedDie, {
    level: classEntryLevel(row, "monk"),
    isUnarmored: bestArmor === null,
    hasShield,
  });
  const improvisedProficient = weaponGrants.some((g) => g.name === "Improvised Weapons");
  const improvisedWeapon = deriveImprovisedAttack(
    effectiveScores,
    proficiencyBonus,
    improvisedProficient,
  );
  return { unarmedStrike, improvisedWeapon };
}
