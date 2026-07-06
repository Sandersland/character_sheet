import { formatRollSpec } from "@/lib/dice";
import type { InventoryItem, WeaponDetail } from "@/types/character";

// "1d6 bludgeoning", plus a "versatile: 1d8" fragment if the weapon has an alt grip die.
function weaponDamageParts(weapon: WeaponDetail): string[] {
  const base = `${formatRollSpec({
    count: weapon.damageDiceCount,
    faces: weapon.damageDiceFaces,
    modifier: weapon.damageModifier,
  })} ${weapon.damageType}`;
  const parts = [base];
  if (weapon.versatileDiceCount && weapon.versatileDiceFaces) {
    parts.push(
      `versatile: ${formatRollSpec({ count: weapon.versatileDiceCount, faces: weapon.versatileDiceFaces })}`
    );
  }
  return parts;
}

// Weapon properties folded into natural language rather than separate badges.
function weaponPropertyTags(weapon: WeaponDetail): string[] {
  const tags = [
    weapon.finesse && "finesse",
    weapon.light && "light",
    weapon.heavy && "heavy",
    weapon.twoHanded && "two-handed",
    weapon.reach && "reach",
    weapon.thrown && "thrown",
    weapon.ammunition && "ammunition",
  ].filter((tag): tag is string => Boolean(tag));
  if (weapon.rangeNormal && weapon.rangeLong) {
    tags.push(`range ${weapon.rangeNormal}/${weapon.rangeLong} ft`);
  }
  return tags;
}

// The dotted summary line under an item's name: quantity, weight, then per-type stats.
export function itemDetailParts(item: InventoryItem): string[] {
  const { weapon, armor, consumable } = item;
  const effectRoll =
    consumable?.effectDiceCount && consumable?.effectDiceFaces
      ? formatRollSpec({
          count: consumable.effectDiceCount,
          faces: consumable.effectDiceFaces,
          modifier: consumable.effectModifier ?? 0,
        })
      : null;

  return [
    item.quantity > 1 ? `${item.quantity}x` : "1x",
    item.weight ? `${item.weight * item.quantity} lb` : null,
    ...(weapon ? weaponDamageParts(weapon) : []),
    ...(weapon ? weaponPropertyTags(weapon) : []),
    armor
      ? `AC ${armor.baseArmorClass}${
          armor.dexModifierApplies
            ? armor.dexModifierMax != null
              ? ` + Dex (max ${armor.dexModifierMax})`
              : " + Dex"
            : ""
        }`
      : null,
    armor?.strengthRequirement ? `Str ${armor.strengthRequirement}` : null,
    armor?.stealthDisadvantage ? "stealth disadvantage" : null,
    effectRoll,
  ].filter((part): part is string => part !== null);
}

// Whether the item has any disclosable prose (description, consumable effect, or notes).
export function hasItemProse(item: InventoryItem): boolean {
  return Boolean(item.description || item.consumable?.effectDescription || item.notes);
}
