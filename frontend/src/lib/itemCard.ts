// Pure detail-row derivation for the Codex item card — extracted from
// features/entities/CampaignItemCard.tsx (#687). No JSX; the component maps
// these rows to its DetailRow primitive.
import type { CampaignItem } from "@/types/character";

export interface ItemDetailRow {
  label: string;
  value: string;
}

// "2d4 + 2" / "1d8 - 1" / null when count or faces is missing.
export function diceLabel(count?: number, faces?: number, modifier?: number): string | null {
  if (!count || !faces) return null;
  const mod = modifier ? (modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`) : "";
  return `${count}d${faces}${mod}`;
}

function weaponRows(weapon: NonNullable<CampaignItem["weapon"]>): ItemDetailRow[] {
  const rows: ItemDetailRow[] = [];
  const dice = diceLabel(weapon.damageDiceCount, weapon.damageDiceFaces, weapon.damageModifier);
  if (dice) rows.push({ label: "Damage", value: `${dice} ${weapon.damageType}` });
  if (weapon.finesse) rows.push({ label: "Property", value: "Finesse" });
  if (weapon.versatileDiceFaces)
    rows.push({ label: "Versatile", value: `${weapon.versatileDiceCount ?? 1}d${weapon.versatileDiceFaces}` });
  return rows;
}

function armorRows(armor: NonNullable<CampaignItem["armor"]>): ItemDetailRow[] {
  const rows: ItemDetailRow[] = [
    { label: "Armor class", value: `${armor.baseArmorClass}` },
    { label: "Armor type", value: armor.armorCategory },
  ];
  if (armor.stealthDisadvantage) rows.push({ label: "Stealth", value: "Disadvantage" });
  return rows;
}

function consumableRows(consumable: NonNullable<CampaignItem["consumable"]>): ItemDetailRow[] {
  const dice = diceLabel(consumable.effectDiceCount, consumable.effectDiceFaces, consumable.effectModifier);
  if (!dice && !consumable.effectDescription) return [];
  return [{ label: "Effect", value: [dice, consumable.effectDescription].filter(Boolean).join(" — ") }];
}

/** Every row the card's mechanical-detail box shows, in display order. */
export function itemDetailRows(item: CampaignItem): ItemDetailRow[] {
  const rows: ItemDetailRow[] = [];
  if (item.weight !== undefined) rows.push({ label: "Weight", value: `${item.weight} lb` });
  if (item.cost?.gp !== undefined) rows.push({ label: "Value", value: `${item.cost.gp} gp` });
  if (item.weapon) rows.push(...weaponRows(item.weapon));
  if (item.armor) rows.push(...armorRows(item.armor));
  if (item.consumable) rows.push(...consumableRows(item.consumable));
  return rows;
}
