import type { RulesEdition } from "@character-sheet/shared-types";

import {
  abilityModifier,
  deriveArmorClass,
  deriveArmorClassParts,
  deriveArmoredArmorClassParts,
  deriveDragonWingsFlySpeed,
  deriveFastMovement,
  deriveFeatBonuses,
  deriveImprovisedAttack,
  deriveUnarmedDamageDie,
  deriveUnarmedStrike,
  deriveUnarmoredMovement,
  draconicResilienceBase,
  type BodyArmorCategory,
} from "@/lib/srd/srd.js";
import { exhaustionSpeedPenalty } from "@/lib/srd/condition-data.js";
import type { AdvancementEntry } from "@/lib/classes/resources.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";
import { editionOf } from "@/lib/rules/edition.js";
import { draconicBloodlineEntry, draconicBloodlineLevel } from "@/lib/classes/draconic-bloodline.js";
import type { TargetModifierMap } from "./effects.js";

type BestBodyArmor = Parameters<typeof deriveArmorClassParts>[0];

// The BODY slot holds one body armor (#565), so "best" is defensive. bestArmor/hasShield also feed speed (Unarmored/Fast Movement) and the Monk unarmed strike, so they're selected once here and threaded to those builders.
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

// draconicBloodlineEntry is the one slug-gated resolution this, draconicWingsFlySpeed below, and draconicResilienceMaxHpTerm all share. No level gate here: the seeded subclassLevel gate (isSubclassActive, #1576) already gates when the subclass itself becomes choosable, and the AC clause carries no separate one.
function draconicResilienceOverride(
  classEntries: CharacterWithRelations["classEntries"],
  edition: RulesEdition,
): { label: string; value: number } | undefined {
  return draconicBloodlineEntry(classEntries) ? draconicResilienceBase(edition) : undefined;
}

// draconicBloodlineLevel is the SAME entry+level resolution draconicResilienceMaxHpTerm uses — XP-derived, not the raw classEntry.level column, which can lag behind a pending level-up ceremony and would otherwise let the HP bonus and flySpeed disagree about whether L14 has been reached.
function draconicWingsFlySpeed(
  classEntries: CharacterWithRelations["classEntries"],
  isUnarmored: boolean,
  walkingSpeed: number,
  totalLevel: number,
  edition: RulesEdition,
): number | undefined {
  const resolved = draconicBloodlineLevel(classEntries, totalLevel);
  if (!resolved) return undefined;
  return deriveDragonWingsFlySpeed({ draconicLevel: resolved.level, isUnarmored, walkingSpeed }, edition);
}

// Labeled AC addends whose exact sum is armorClass, layered: base parts (armor/Dex/shield/Unarmored Defense/Mage Armor/Draconic Resilience best-of) → Defense Fighting Style feat → feat AC → per-source "ac" buffs → acFloor (Barkskin) last.
// fallow-ignore-next-line complexity -- inherent 5e AC layering (one conditional addend per source), not accidental complexity
export function buildArmorClassView(
  row: CharacterWithRelations,
  effectiveScores: Record<string, number>,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  clampedAdvancements: AdvancementEntry[],
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
  edition: RulesEdition,
): { armorClass: number; armorClassBreakdown: ReturnType<typeof deriveArmorClassParts> } {
  const dexMod = abilityModifier(effectiveScores.dexterity ?? 10);
  const unarmoredDefense = {
    classNames: row.classEntries.map((e) => e.name),
    conMod: abilityModifier(effectiveScores.constitution ?? 10),
    wisMod: abilityModifier(effectiveScores.wisdom ?? 10),
  };
  // Mage Armor (#363): the highest-valued acUnarmoredBase buff becomes a best-of candidate in the unarmored formula; ignored while wearing body armor.
  const mageArmor = (buffTargets.acUnarmoredBase ?? []).reduce<{ label: string; value: number } | undefined>(
    (best, c) => (best && best.value >= c.modifier ? best : { label: c.source, value: c.modifier }),
    undefined,
  );
  const draconicResilience = draconicResilienceOverride(row.classEntries, edition);
  const acParts = deriveArmorClassParts(bestArmor, hasShield, dexMod, unarmoredDefense, mageArmor, draconicResilience);
  // Defense Fighting Style feat only applies while wearing body armor (SRD 5.2, #1137).
  if (bestArmor !== null) {
    for (const part of deriveArmoredArmorClassParts(clampedAdvancements)) acParts.push(part);
  }
  if (featBonuses.armorClass !== 0) acParts.push({ label: "Feats", value: featBonuses.armorClass });
  // v1 applies only unconditional AC bonuses; a conditional one surfaces as reminder text (value 0) rather than being silently added.
  for (const c of buffTargets.ac ?? []) {
    if (c.condition) acParts.push({ label: c.source, value: 0, reminder: c.condition });
    else acParts.push({ label: c.source, value: c.modifier });
  }
  // Barkskin acFloor is applied last as a reconciling part so labeled parts still sum to armorClass; highest floor wins if several are active.
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

function classEntryLevel(row: CharacterWithRelations, className: string): number {
  return row.classEntries.find((e) => e.name.toLowerCase() === className)?.level ?? 0;
}

// Speed is racial base plus additive terms only (feat bonuses, Monk Unarmored Movement, Barbarian Fast Movement, active speed buffs), then reduced by exhaustion — 2024: −5 ft×level (SRD 5.2); 2014: halved at levels 2-4, floored to 0 at level 5+ (PHB'14 p. 291) — floored at 0 here either way.
// flySpeed (#1123) equals the character's own final walking speed (post-exhaustion) — never a second independent derivation.
export function buildSpeedView(
  row: CharacterWithRelations,
  bestArmor: BestBodyArmor,
  hasShield: boolean,
  featBonuses: ReturnType<typeof deriveFeatBonuses>,
  buffTargets: TargetModifierMap,
  exhaustionLevel: number,
  totalLevel: number,
  edition: RulesEdition,
): { speed: number; flySpeed?: number } {
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
  const speed = Math.max(0, sum - exhaustionSpeedPenalty(exhaustionLevel, sum, edition));
  const flySpeed = draconicWingsFlySpeed(row.classEntries, bestArmor === null, speed, totalLevel, edition);
  return { speed, flySpeed };
}

// Derived from the same clamped advancements slice so Tavern Brawler's upgrades are automatically excluded when the character is over-cap.
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
  const unarmedStrike = deriveUnarmedStrike(
    effectiveScores,
    proficiencyBonus,
    unarmedDie,
    {
      level: classEntryLevel(row, "monk"),
      isUnarmored: bestArmor === null,
      hasShield,
    },
    editionOf(row),
  );
  const improvisedProficient = weaponGrants.some((g) => g.name === "Improvised Weapons");
  const improvisedWeapon = deriveImprovisedAttack(
    effectiveScores,
    proficiencyBonus,
    improvisedProficient,
  );
  return { unarmedStrike, improvisedWeapon };
}
