import { useState } from "react";

import type { ArmorCategory, InventoryItem, InventoryOperation } from "@/types/character";

interface InventoryEditFormProps {
  item: InventoryItem;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
}

const ARMOR_CATEGORIES: ArmorCategory[] = ["light", "medium", "heavy", "shield"];

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-600";
const checkboxLabelClass = "flex items-center gap-1.5 text-xs text-parchment-700";
const linkButtonClass =
  "text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40 disabled:no-underline";

// The inline edit form for one inventory row: name/qty/equipped/notes plus the per-type sub-form.
export default function InventoryEditForm({ item, pending, onCancel, onSubmit }: InventoryEditFormProps) {
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
