import { useState } from "react";

import type { Currency, CustomItemInput, InventoryOperation, Item, ItemCategory } from "@/types/character";

interface AddItemPanelProps {
  items: Item[];
  pending: boolean;
  onSubmit: (operations: InventoryOperation[]) => Promise<void>;
  onClose: () => void;
}

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
const CATEGORIES: ItemCategory[] = ["weapon", "armor", "consumable", "gear"];

function scaleCurrency(cost: Currency | undefined, quantity: number): Currency {
  if (!cost) return ZERO_CURRENCY;
  return { cp: cost.cp * quantity, sp: cost.sp * quantity, gp: cost.gp * quantity, pp: cost.pp * quantity };
}

function isNonzero(currency: Currency): boolean {
  return currency.cp !== 0 || currency.sp !== 0 || currency.gp !== 0 || currency.pp !== 0;
}

const inputClass =
  "rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-sm";
const labelClass = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-parchment-500";

/**
 * Inline panel (no modal/dialog component exists anywhere in this app —
 * AbilityScoreEditor's method-tab pattern is the precedent) for gaining a
 * new InventoryItem: either picked from the catalog or fully homebrew.
 * Both submit a single `acquire` operation; cost is just an optional field
 * (0 = free, matching the "Add vs Buy" merge) prefilled from the selected
 * catalog item's cost but always editable.
 */
export default function AddItemPanel({ items, pending, onSubmit, onClose }: AddItemPanelProps) {
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");
  const [quantity, setQuantity] = useState("1");
  const [equipped, setEquipped] = useState(false);
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState<Currency>(ZERO_CURRENCY);

  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");

  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState<ItemCategory>("gear");
  const [weaponDiceCount, setWeaponDiceCount] = useState("1");
  const [weaponDiceFaces, setWeaponDiceFaces] = useState("6");
  const [weaponDamageType, setWeaponDamageType] = useState("");
  const [armorBaseAC, setArmorBaseAC] = useState("10");
  const [armorCategory, setArmorCategory] = useState<"light" | "medium" | "heavy" | "shield">("light");

  function selectCatalogItem(itemId: string) {
    setSelectedItemId(itemId);
    const item = items.find((candidate) => candidate.id === itemId);
    setCost(scaleCurrency(item?.cost, Number(quantity) || 1));
  }

  function changeQuantity(value: string) {
    setQuantity(value);
    if (tab === "catalog") {
      const item = items.find((candidate) => candidate.id === selectedItemId);
      setCost(scaleCurrency(item?.cost, Number(value) || 1));
    }
  }

  async function submit() {
    const parsedQuantity = Number(quantity) || 1;
    const currencyDelta = isNonzero(cost) ? cost : undefined;

    if (tab === "catalog") {
      if (!selectedItemId) return;
      await onSubmit([
        {
          type: "acquire",
          itemId: selectedItemId,
          quantity: parsedQuantity,
          equipped,
          notes: notes || undefined,
          currencyDelta,
        },
      ]);
      return;
    }

    if (!customName.trim()) return;
    let custom: CustomItemInput;
    if (customCategory === "weapon") {
      custom = {
        name: customName,
        category: "weapon",
        weapon: {
          damageDiceCount: Number(weaponDiceCount) || 1,
          damageDiceFaces: Number(weaponDiceFaces) || 4,
          damageType: weaponDamageType || "bludgeoning",
        },
      };
    } else if (customCategory === "armor") {
      custom = {
        name: customName,
        category: "armor",
        armor: { armorCategory, baseArmorClass: Number(armorBaseAC) || 10 },
      };
    } else {
      custom = { name: customName, category: customCategory };
    }

    await onSubmit([
      {
        type: "acquire",
        custom,
        quantity: parsedQuantity,
        equipped,
        notes: notes || undefined,
        currencyDelta,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
      <div className="flex gap-2">
        {(["catalog", "custom"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-control border px-3 py-1 text-xs font-semibold transition-colors ${
              tab === value
                ? "border-arcane-500 bg-arcane-50 text-arcane-800"
                : "border-parchment-300 text-parchment-600"
            }`}
          >
            {value === "catalog" ? "From catalog" : "Custom"}
          </button>
        ))}
      </div>

      {tab === "catalog" ? (
        <label className={labelClass}>
          Item
          <select
            className={inputClass}
            value={selectedItemId}
            onChange={(e) => selectCatalogItem(e.target.value)}
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="flex flex-wrap gap-3">
          <label className={labelClass}>
            Name
            <input
              className={`${inputClass} w-48`}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Category
            <select
              className={inputClass}
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value as ItemCategory)}
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          {customCategory === "weapon" && (
            <>
              <label className={labelClass}>
                Damage
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-14 tabular-nums`}
                    value={weaponDiceCount}
                    onChange={(e) => setWeaponDiceCount(e.target.value)}
                  />
                  d
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} w-14 tabular-nums`}
                    value={weaponDiceFaces}
                    onChange={(e) => setWeaponDiceFaces(e.target.value)}
                  />
                </span>
              </label>
              <label className={labelClass}>
                Damage type
                <input
                  className={`${inputClass} w-28`}
                  placeholder="bludgeoning"
                  value={weaponDamageType}
                  onChange={(e) => setWeaponDamageType(e.target.value)}
                />
              </label>
            </>
          )}
          {customCategory === "armor" && (
            <>
              <label className={labelClass}>
                Armor type
                <select
                  className={inputClass}
                  value={armorCategory}
                  onChange={(e) => setArmorCategory(e.target.value as typeof armorCategory)}
                >
                  {(["light", "medium", "heavy", "shield"] as const).map((category) => (
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
                  value={armorBaseAC}
                  onChange={(e) => setArmorBaseAC(e.target.value)}
                />
              </label>
            </>
          )}
          <p className="w-full text-xs text-parchment-500">
            Other weapon/armor/consumable details can be refined afterward via Edit.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className={labelClass}>
          Quantity
          <input
            type="number"
            min={1}
            className={`${inputClass} w-20 tabular-nums`}
            value={quantity}
            onChange={(e) => changeQuantity(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-parchment-700">
          <input type="checkbox" checked={equipped} onChange={(e) => setEquipped(e.target.checked)} />
          Equipped
        </label>
        <label className={labelClass}>
          Notes
          <input className={`${inputClass} w-40`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <span className={labelClass.replace("flex flex-col gap-1 ", "")}>Cost (0 = free)</span>
        {(["pp", "gp", "sp", "cp"] as const).map((denomination) => (
          <label key={denomination} className={labelClass}>
            {denomination}
            <input
              type="number"
              min={0}
              className={`${inputClass} w-16 tabular-nums`}
              value={cost[denomination]}
              onChange={(e) => setCost({ ...cost, [denomination]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
