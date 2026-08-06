import type { RulesEdition } from "@character-sheet/shared-types";

import type { ArmorCategory } from "@/lib/inventory/item-detail-inputs.js";

// Body armor excludes shields (handled via hasShield, never passed as body armor).
export type BodyArmorCategory = Exclude<ArmorCategory, "shield">;

// One labeled addend of the derived AC; the wire shape for armorClassBreakdown.
// reminder carries condition text for an addend not auto-applied (value 0, #383).
export type ArmorClassPart = { label: string; value: number; reminder?: string };

type UnarmoredDefense = { classNames: string[]; conMod: number; wisMod: number };

const sumParts = (parts: ArmorClassPart[]) => parts.reduce((total, p) => total + p.value, 0);

// Draconic Resilience (Draconic Bloodline L1, PHB'14 p.106, #1122): "When you
// aren't wearing armor, your AC equals 13 + your Dexterity modifier." No
// shield restriction — bestUnarmoredParts still stacks the shield part on top.
// SRD 5.2 forks this to 10 + Dex + Cha at Sorcerer L3 (PHB'24 p.978), a
// different addend shape (an extra ability part, not just a base swap) that
// is out of scope here (#1122) — `undefined` withholds the override rather
// than guessing at that shape. Edition last, mirroring subclassGateLevel
// (#1499), so the 2024 fork slots in later without reshaping callers.
export function draconicResilienceBase(edition: RulesEdition): { label: string; value: number } | undefined {
  return edition === "EDITION_2014" ? { label: "Draconic Resilience", value: 13 } : undefined;
}

// Candidate part-lists for the unarmored formulas; the highest total wins (ties keep base).
// `unarmoredBaseOverride` (Mage Armor, #363) and `draconicResilience` (#1122) both add an
// `override + Dex` candidate — kept as separate slots (not merged into one) because their
// sources are independent and both can be active on the same character at once: a buff
// (unarmoredBaseOverride, read off active effects) and a permanent subclass feature
// (draconicResilience, read off the class/subclass selection). Either, neither, or both
// compete best-of with 10+Dex and Unarmored Defense.
function bestUnarmoredParts(
  hasShield: boolean,
  dexMod: number,
  ud?: UnarmoredDefense,
  unarmoredBaseOverride?: { label: string; value: number },
  draconicResilience?: { label: string; value: number },
): ArmorClassPart[] {
  const dexPart = dexMod !== 0 ? [{ label: "Dex", value: dexMod }] : [];
  const shieldPart = hasShield ? [{ label: "Shield", value: 2 }] : [];
  const candidates: ArmorClassPart[][] = [[{ label: "Unarmored", value: 10 }, ...dexPart, ...shieldPart]];
  if (unarmoredBaseOverride) {
    candidates.push([
      { label: unarmoredBaseOverride.label, value: unarmoredBaseOverride.value },
      ...dexPart,
      ...shieldPart,
    ]);
  }
  if (draconicResilience) {
    candidates.push([
      { label: draconicResilience.label, value: draconicResilience.value },
      ...dexPart,
      ...shieldPart,
    ]);
  }
  const classes = ud?.classNames.map((n) => n.toLowerCase()) ?? [];
  if (ud && classes.includes("barbarian")) {
    candidates.push([
      { label: "Unarmored Defense", value: 10 },
      ...dexPart,
      ...(ud.conMod !== 0 ? [{ label: "Con", value: ud.conMod }] : []),
      ...shieldPart,
    ]);
  }
  // Monk Unarmored Defense is unusable while wielding a shield (PHB p.78).
  if (ud && !hasShield && classes.includes("monk")) {
    candidates.push([
      { label: "Unarmored Defense", value: 10 },
      ...dexPart,
      ...(ud.wisMod !== 0 ? [{ label: "Wis", value: ud.wisMod }] : []),
    ]);
  }
  return candidates.reduce((best, c) => (sumParts(c) > sumParts(best) ? c : best));
}

// Labeled AC parts from body armor (null = unarmored) + Dex (per category) + shield;
// unarmored, Unarmored Defense applies (Barbarian 10+Dex+Con, Monk 10+Dex+Wis, highest wins).
// Ordered, summing exactly to deriveArmorClass; zero-value optional parts are omitted.
export function deriveArmorClassParts(
  armor: { name?: string; armorCategory: BodyArmorCategory; baseArmorClass: number; dexModifierMax?: number | null } | null,
  hasShield: boolean,
  dexMod: number,
  unarmoredDefense?: UnarmoredDefense,
  // Mage Armor (#363): a spell-granted unarmored base (label + value, e.g. 13),
  // applied only while unarmored — donning body armor suppresses it here and the
  // equip hook true-ends the buff.
  unarmoredBaseOverride?: { label: string; value: number },
  // Draconic Resilience (#1122): a subclass-granted unarmored base (13+Dex,
  // draconicResilienceBase), likewise suppressed the moment body armor is worn.
  draconicResilience?: { label: string; value: number },
): ArmorClassPart[] {
  if (armor === null) return bestUnarmoredParts(hasShield, dexMod, unarmoredDefense, unarmoredBaseOverride, draconicResilience);
  const parts: ArmorClassPart[] = [{ label: armor.name ?? "Armor", value: armor.baseArmorClass }];
  if (armor.armorCategory !== "heavy") {
    const cap = armor.armorCategory === "medium" ? (armor.dexModifierMax ?? 2) : null;
    const capped = cap !== null && dexMod > cap;
    const applied = capped ? cap : dexMod;
    if (applied !== 0) parts.push({ label: capped ? `Dex (max +${cap})` : "Dex", value: applied });
  }
  if (hasShield) parts.push({ label: "Shield", value: 2 });
  return parts;
}

// Base AC from equipped body armor (null = unarmored) + Dex mod (capped by armor) + shield.
export function deriveArmorClass(
  armor: Parameters<typeof deriveArmorClassParts>[0],
  hasShield: boolean,
  dexMod: number,
  unarmoredDefense?: UnarmoredDefense,
  unarmoredBaseOverride?: { label: string; value: number },
  draconicResilience?: { label: string; value: number },
): number {
  return sumParts(deriveArmorClassParts(armor, hasShield, dexMod, unarmoredDefense, unarmoredBaseOverride, draconicResilience));
}
