import { useState } from "react";

import { formatRollSpec } from "@/lib/dice";
import { isEquippable } from "@/lib/items";
import type {
  ArmorCategory,
  InventoryItem,
  InventoryOperation,
  ItemCategory,
  WeaponDetail,
} from "@/types/character";
import Badge from "@/components/ui/Badge";

interface InventoryRowProps {
  item: InventoryItem;
  mode: "view" | "edit";
  pending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

const CATEGORY_TONE: Record<ItemCategory, "garnet" | "arcane" | "gold" | "neutral"> = {
  weapon: "garnet",
  armor: "arcane",
  consumable: "gold",
  gear: "neutral",
};

const ARMOR_CATEGORIES: ArmorCategory[] = ["light", "medium", "heavy", "shield"];

/** "1d6 bludgeoning", plus a "versatile: 1d8" fragment if the weapon has an alt grip die. */
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

/** Weapon properties folded into natural language rather than separate badges. */
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

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600";
const checkboxLabelClass = "flex items-center gap-1.5 text-xs text-parchment-700";
const linkButtonClass =
  "text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40 disabled:no-underline";

/**
 * One inventory row, in one of two modes: read-only display, or an inline
 * edit form (cosmetic fields + quantity + the matching weapon/armor/
 * consumable detail, if any — the "Club +1" path). Equip/Edit/Remove are
 * low-emphasis text links rather than icon buttons, matching the existing
 * "← All characters" link style — no icon-button row exists elsewhere in
 * this app to match instead. Selling is handled by the bulk-sell flow and
 * per-item history by the Activity log, so neither lives on the row.
 */
export default function InventoryRow({
  item,
  mode,
  pending,
  onEdit,
  onCancel,
  onSubmit,
}: InventoryRowProps) {
  const { weapon, armor, consumable } = item;

  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [equipped, setEquipped] = useState(item.equipped);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [weaponEdit, setWeaponEdit] = useState(weapon);
  const [armorEdit, setArmorEdit] = useState(armor);
  const [consumableEdit, setConsumableEdit] = useState(consumable);

  async function submitEdit() {
    const operations: InventoryOperation[] = [
      {
        type: "update",
        inventoryItemId: item.id,
        name,
        notes: notes || null,
        equipped,
        weapon: weaponEdit,
        armor: armorEdit,
        consumable: consumableEdit,
      },
    ];
    const delta = Number(quantity) - item.quantity;
    if (delta !== 0) {
      operations.push({ type: "adjustQuantity", inventoryItemId: item.id, delta });
    }
    await onSubmit(operations);
  }

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 py-3">
        <div className="flex flex-wrap gap-3">
          <label className={labelClass}>
            Name
            <input className={`${inputClass} w-48`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={labelClass}>
            Quantity
            <input
              type="number"
              min={0}
              className={`${inputClass} w-20 tabular-nums`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className={checkboxLabelClass}>
            <input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} />
            Equipped
          </label>
        </div>

        <label className={labelClass}>
          Notes
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {weaponEdit && (
          <div className="flex flex-col gap-2 rounded-control bg-parchment-100 p-3">
            <div className="flex flex-wrap gap-3">
              <label className={labelClass}>
                Damage
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-14 tabular-nums`}
                    value={weaponEdit.damageDiceCount}
                    onChange={(e) => setWeaponEdit({ ...weaponEdit, damageDiceCount: Number(e.target.value) })}
                  />
                  d
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-14 tabular-nums`}
                    value={weaponEdit.damageDiceFaces}
                    onChange={(e) => setWeaponEdit({ ...weaponEdit, damageDiceFaces: Number(e.target.value) })}
                  />
                  +
                  <input
                    type="number"
                    className={`${inputClass} w-14 tabular-nums`}
                    value={weaponEdit.damageModifier}
                    onChange={(e) => setWeaponEdit({ ...weaponEdit, damageModifier: Number(e.target.value) })}
                  />
                </span>
              </label>
              <label className={labelClass}>
                Damage type
                <input
                  className={`${inputClass} w-28`}
                  value={weaponEdit.damageType}
                  onChange={(e) => setWeaponEdit({ ...weaponEdit, damageType: e.target.value })}
                />
              </label>
              <label className={labelClass}>
                Versatile die
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} w-14 tabular-nums`}
                    placeholder="—"
                    value={weaponEdit.versatileDiceCount ?? ""}
                    onChange={(e) =>
                      setWeaponEdit({
                        ...weaponEdit,
                        versatileDiceCount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  d
                  <input
                    type="number"
                    min={0}
                    className={`${inputClass} w-14 tabular-nums`}
                    placeholder="—"
                    value={weaponEdit.versatileDiceFaces ?? ""}
                    onChange={(e) =>
                      setWeaponEdit({
                        ...weaponEdit,
                        versatileDiceFaces: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </span>
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              {(["finesse", "light", "heavy", "twoHanded", "reach", "thrown", "ammunition"] as const).map(
                (flag) => (
                  <label key={flag} className={checkboxLabelClass}>
                    <input
                      type="checkbox"
                      checked={weaponEdit[flag]}
                      onChange={(e) => setWeaponEdit({ ...weaponEdit, [flag]: e.target.checked })}
                    />
                    {flag === "twoHanded" ? "two-handed" : flag}
                  </label>
                )
              )}
            </div>
          </div>
        )}

        {armorEdit && (
          <div className="flex flex-wrap gap-3 rounded-control bg-parchment-100 p-3">
            <label className={labelClass}>
              Armor type
              <select
                className={inputClass}
                value={armorEdit.armorCategory}
                onChange={(e) =>
                  setArmorEdit({ ...armorEdit, armorCategory: e.target.value as ArmorCategory })
                }
              >
                {ARMOR_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Base AC
              <input
                type="number"
                className={`${inputClass} w-16 tabular-nums`}
                value={armorEdit.baseArmorClass}
                onChange={(e) => setArmorEdit({ ...armorEdit, baseArmorClass: Number(e.target.value) })}
              />
            </label>
            <label className={checkboxLabelClass}>
              <input
                type="checkbox"
                checked={armorEdit.dexModifierApplies}
                onChange={(e) => setArmorEdit({ ...armorEdit, dexModifierApplies: e.target.checked })}
              />
              Dex applies
            </label>
            <label className={checkboxLabelClass}>
              <input
                type="checkbox"
                checked={armorEdit.stealthDisadvantage}
                onChange={(e) => setArmorEdit({ ...armorEdit, stealthDisadvantage: e.target.checked })}
              />
              Stealth disadvantage
            </label>
          </div>
        )}

        {consumableEdit !== undefined && (
          <div className="flex flex-wrap gap-3 rounded-control bg-parchment-100 p-3">
            <label className={labelClass}>
              Effect roll
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  className={`${inputClass} w-14 tabular-nums`}
                  placeholder="—"
                  value={consumableEdit?.effectDiceCount ?? ""}
                  onChange={(e) =>
                    setConsumableEdit({
                      ...consumableEdit,
                      effectDiceCount: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
                d
                <input
                  type="number"
                  min={0}
                  className={`${inputClass} w-14 tabular-nums`}
                  placeholder="—"
                  value={consumableEdit?.effectDiceFaces ?? ""}
                  onChange={(e) =>
                    setConsumableEdit({
                      ...consumableEdit,
                      effectDiceFaces: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
                +
                <input
                  type="number"
                  className={`${inputClass} w-14 tabular-nums`}
                  placeholder="0"
                  value={consumableEdit?.effectModifier ?? ""}
                  onChange={(e) =>
                    setConsumableEdit({
                      ...consumableEdit,
                      effectModifier: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </span>
            </label>
            <label className={labelClass}>
              Effect description
              <input
                className={`${inputClass} w-56`}
                value={consumableEdit?.effectDescription ?? ""}
                onChange={(e) => setConsumableEdit({ ...consumableEdit, effectDescription: e.target.value })}
              />
            </label>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={submitEdit}
            className="rounded-control bg-arcane-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-arcane-800 disabled:opacity-50"
          >
            Save
          </button>
          <button type="button" disabled={pending} onClick={onCancel} className={linkButtonClass}>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  const effectRoll =
    consumable?.effectDiceCount && consumable?.effectDiceFaces
      ? formatRollSpec({
          count: consumable.effectDiceCount,
          faces: consumable.effectDiceFaces,
          modifier: consumable.effectModifier ?? 0,
        })
      : null;

  const details = [
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

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-parchment-900">
          {item.name}
          <Badge tone={CATEGORY_TONE[item.category]} className="ml-2">
            {item.category}
          </Badge>
          {item.equipped && (
            <Badge tone="vitality" className="ml-1.5">
              Equipped
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-xs text-parchment-600">{details.join(" · ")}</p>
        {item.description && (
          <p className="mt-1 text-xs text-parchment-600">{item.description}</p>
        )}
        {consumable?.effectDescription && (
          <p className="mt-1 text-xs text-parchment-600">{consumable.effectDescription}</p>
        )}
        {item.notes && <p className="mt-1 text-xs italic text-parchment-600">{item.notes}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isEquippable(item.category) && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onSubmit([{ type: "setEquipped", inventoryItemId: item.id, equipped: !item.equipped }])
              }
              className={linkButtonClass}
            >
              {item.equipped ? "Unequip" : "Equip"}
            </button>
            <span className="text-parchment-300">·</span>
          </>
        )}
        <button type="button" disabled={pending} onClick={onEdit} className={linkButtonClass}>
          Edit
        </button>
        <span className="text-parchment-300">·</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSubmit([{ type: "remove", inventoryItemId: item.id }])}
          className={linkButtonClass}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
