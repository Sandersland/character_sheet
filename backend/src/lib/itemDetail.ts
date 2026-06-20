// Shared serialization for the optional weapon/armor/consumable detail rows
// that hang off both the Item catalog and per-character InventoryItem rows
// (see schema.prisma's comment on Item/InventoryItem for why they're
// separate detail tables rather than columns). `routes/characters.ts`
// (inventory rows) and `routes/items.ts` (the catalog) both need the same
// nested `weapon`/`armor`/`consumable` shape on the wire, so it lives here
// once rather than twice.
//
// Parameter types are minimal structural interfaces (not Prisma's generated
// ItemWeaponDetail/InventoryWeaponDetail etc.) so either side's row — which
// only differ in their owning FK (itemId vs. inventoryItemId), not in any
// field used here — satisfies them without a cast.

interface WeaponDetailFields {
  damageDiceCount: number;
  damageDiceFaces: number;
  damageModifier: number;
  damageType: string;
  versatileDiceCount: number | null;
  versatileDiceFaces: number | null;
  finesse: boolean;
  light: boolean;
  heavy: boolean;
  twoHanded: boolean;
  reach: boolean;
  thrown: boolean;
  ammunition: boolean;
  rangeNormal: number | null;
  rangeLong: number | null;
  weaponClass: string | null;
  weaponRange: string | null;
}

interface ArmorDetailFields {
  armorCategory: string;
  baseArmorClass: number;
  dexModifierApplies: boolean;
  dexModifierMax: number | null;
  stealthDisadvantage: boolean;
  strengthRequirement: number | null;
}

interface ConsumableDetailFields {
  effectDiceCount: number | null;
  effectDiceFaces: number | null;
  effectModifier: number | null;
  effectDescription: string | null;
}

export function serializeWeaponDetail(detail: WeaponDetailFields) {
  return {
    damageDiceCount: detail.damageDiceCount,
    damageDiceFaces: detail.damageDiceFaces,
    damageModifier: detail.damageModifier,
    damageType: detail.damageType,
    versatileDiceCount: detail.versatileDiceCount ?? undefined,
    versatileDiceFaces: detail.versatileDiceFaces ?? undefined,
    finesse: detail.finesse,
    light: detail.light,
    heavy: detail.heavy,
    twoHanded: detail.twoHanded,
    reach: detail.reach,
    thrown: detail.thrown,
    ammunition: detail.ammunition,
    rangeNormal: detail.rangeNormal ?? undefined,
    rangeLong: detail.rangeLong ?? undefined,
    weaponClass: detail.weaponClass ?? undefined,
    weaponRange: detail.weaponRange ?? undefined,
  };
}

export function serializeArmorDetail(detail: ArmorDetailFields) {
  return {
    armorCategory: detail.armorCategory,
    baseArmorClass: detail.baseArmorClass,
    dexModifierApplies: detail.dexModifierApplies,
    dexModifierMax: detail.dexModifierMax ?? undefined,
    stealthDisadvantage: detail.stealthDisadvantage,
    strengthRequirement: detail.strengthRequirement ?? undefined,
  };
}

export function serializeConsumableDetail(detail: ConsumableDetailFields) {
  return {
    effectDiceCount: detail.effectDiceCount ?? undefined,
    effectDiceFaces: detail.effectDiceFaces ?? undefined,
    effectModifier: detail.effectModifier ?? undefined,
    effectDescription: detail.effectDescription ?? undefined,
  };
}
