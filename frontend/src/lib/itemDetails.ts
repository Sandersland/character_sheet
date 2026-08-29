import { formatRollSpec } from "@/lib/dice";
import type { InventoryItem, WeaponDetail } from "@/types/character";

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

export function hasItemProse(item: InventoryItem): boolean {
  return Boolean(item.description || item.consumable?.effectDescription || item.notes);
}
