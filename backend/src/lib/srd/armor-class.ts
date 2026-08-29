import type { RulesEdition } from "@character-sheet/shared-types";

import type { ArmorCategory } from "@/lib/inventory/item-detail-inputs.js";

export type BodyArmorCategory = Exclude<ArmorCategory, "shield">;

export type ArmorClassPart = { label: string; value: number; reminder?: string };

type UnarmoredDefense = { classNames: string[]; conMod: number; wisMod: number };

const sumParts = (parts: ArmorClassPart[]) => parts.reduce((total, p) => total + p.value, 0);

// Draconic Resilience: 13 + Dex, no shield restriction (PHB'14 p.106, #1122); SRD 5.2 forks to a different addend shape at Sorcerer L3 (PHB'24 p.978) — out of scope here.
export function draconicResilienceBase(edition: RulesEdition): { label: string; value: number } | undefined {
  switch (edition) {
    case "EDITION_2014":
      return { label: "Draconic Resilience", value: 13 };
    case "EDITION_2024":
      return undefined;
    default: {
      const exhaustive: never = edition;
      throw new Error(`draconicResilienceBase: unhandled edition ${String(exhaustive)}`);
    }
  }
}

// unarmoredBaseOverride and draconicResilience are separate candidate slots since both
// can be active on the same character at once (#363, #1122).
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
  // Monk Unarmored Defense is unusable while wielding a shield (PHB'14 pp.76-79 / PHB'24 pp.87-89 — Unarmored Defense is edition-invariant).
  if (ud && !hasShield && classes.includes("monk")) {
    candidates.push([
      { label: "Unarmored Defense", value: 10 },
      ...dexPart,
      ...(ud.wisMod !== 0 ? [{ label: "Wis", value: ud.wisMod }] : []),
    ]);
  }
  return candidates.reduce((best, c) => (sumParts(c) > sumParts(best) ? c : best));
}

// Sums exactly to deriveArmorClass; zero-value optional parts are omitted.
export function deriveArmorClassParts(
  armor: { name?: string; armorCategory: BodyArmorCategory; baseArmorClass: number; dexModifierMax?: number | null } | null,
  hasShield: boolean,
  dexMod: number,
  unarmoredDefense?: UnarmoredDefense,
  // Mage Armor (#363): unarmored-only base override; donning body armor suppresses it here.
  unarmoredBaseOverride?: { label: string; value: number },
  // Draconic Resilience (#1122): suppressed the moment body armor is worn.
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
