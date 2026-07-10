// Local union (not ArmorCategoryName from inventory.ts) to avoid a srd↔inventory import cycle.
// Shields are handled via hasShield, never passed as body armor, so they're excluded here.
export type BodyArmorCategory = "light" | "medium" | "heavy";

// One labeled addend of the derived AC; the wire shape for armorClassBreakdown.
// reminder carries condition text for an addend not auto-applied (value 0, #383).
export type ArmorClassPart = { label: string; value: number; reminder?: string };

type UnarmoredDefense = { classNames: string[]; conMod: number; wisMod: number };

const sumParts = (parts: ArmorClassPart[]) => parts.reduce((total, p) => total + p.value, 0);

// Candidate part-lists for the unarmored formulas; the highest total wins (ties keep base).
// `unarmoredBaseOverride` (Mage Armor, #363) adds a `override + Dex` candidate — a
// spell-granted unarmored base that competes best-of with 10+Dex and Unarmored Defense.
function bestUnarmoredParts(
  hasShield: boolean,
  dexMod: number,
  ud?: UnarmoredDefense,
  unarmoredBaseOverride?: { label: string; value: number },
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
): ArmorClassPart[] {
  if (armor === null) return bestUnarmoredParts(hasShield, dexMod, unarmoredDefense, unarmoredBaseOverride);
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
): number {
  return sumParts(deriveArmorClassParts(armor, hasShield, dexMod, unarmoredDefense, unarmoredBaseOverride));
}
