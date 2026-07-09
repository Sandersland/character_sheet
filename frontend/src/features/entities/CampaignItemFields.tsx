import type { Dispatch, SetStateAction } from "react";

import ChipGroup from "@/components/ui/ChipGroup";
import ChipToggle from "@/components/ui/ChipToggle";
import DiceInput from "@/components/ui/DiceInput";
import Disclosure from "@/components/ui/Disclosure";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import CapabilityEditor from "@/features/entities/CapabilityEditor";
import type { FormSetters } from "@/features/entities/campaignItemFormSetters";
import { ATTUNEMENT_PREREQ_OPTIONS } from "@/lib/capabilities";
import {
  ARMOR_CATEGORY_OPTIONS,
  CATEGORY_OPTIONS,
  COST_KEYS,
  CURRENCY_UNITS,
  currencyFromForm,
  flagLabel,
  formFromCatalog,
  hasRange,
  WEAPON_CLASS_OPTIONS,
  WEAPON_FLAGS,
  WEAPON_RANGE_OPTIONS,
  type CurrencyUnit,
  type FormState,
} from "@/lib/campaignItemForm";
import { formatCurrency, fromCopper, toCopper } from "@/lib/currency";
import { allowedSlotsForItem, equipSlotLabel, WORN_SLOTS, wornSlotItemKindLabel } from "@/lib/paperDoll";
import { RARITY_OPTIONS, rarityValueHint } from "@/lib/rarity";
import type {
  ArmorCategory,
  AttunementPrereqKind,
  EquipSlot,
  InventoryItem,
  Item,
  ItemRarity,
} from "@/types/character";

const legendCls = "text-sm font-semibold text-parchment-800";
const fieldsetCls =
  "flex min-w-0 flex-col gap-3 border-t border-parchment-200 pt-3 first:border-t-0 first:pt-0";
const pairGridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2";

interface FieldsProps {
  form: FormState;
  setters: FormSetters;
}

type SetField = FormSetters["set"];

function WeaponClassRangeFields({ form, set }: { form: FormState; set: SetField }) {
  return (
    <div className={pairGridCls}>
      <Field label="Weapon class">
        <Segmented
          label="Weapon class"
          options={WEAPON_CLASS_OPTIONS}
          value={form.weaponClass}
          onChange={(v) => set("weaponClass", v)}
        />
      </Field>
      <Field label="Weapon range">
        <Segmented
          label="Weapon range"
          options={WEAPON_RANGE_OPTIONS}
          value={form.weaponRange}
          onChange={(v) => set("weaponRange", v)}
        />
      </Field>
    </div>
  );
}

function WeaponRangeInputs({ form, set }: { form: FormState; set: SetField }) {
  return (
    <div className={pairGridCls}>
      <Field label="Range (normal)" htmlFor="item-range-normal">
        <Input
          id="item-range-normal"
          type="number"
          placeholder="—"
          value={form.rangeNormal}
          onChange={(e) => set("rangeNormal", e.target.value)}
        />
      </Field>
      <Field label="Range (long)" htmlFor="item-range-long">
        <Input
          id="item-range-long"
          type="number"
          placeholder="—"
          value={form.rangeLong}
          onChange={(e) => set("rangeLong", e.target.value)}
        />
      </Field>
    </div>
  );
}

function WeaponFieldGroup({ form, setters }: FieldsProps) {
  const { set, setDamage, setVersatileDie, toggleVersatile } = setters;
  return (
    <div className="flex flex-col gap-3">
      <DiceInput
        label="Damage"
        idPrefix="item-damage"
        showModifier
        showType
        value={{
          count: form.damageDiceCount,
          faces: form.damageDiceFaces,
          modifier: form.damageModifier,
          type: form.damageType,
        }}
        onChange={setDamage}
      />

      <WeaponClassRangeFields form={form} set={set} />

      <ChipGroup label="Weapon properties">
        {WEAPON_FLAGS.map((flag) => (
          <ChipToggle key={flag} pressed={form[flag]} onChange={(v) => set(flag, v)}>
            {flagLabel(flag)}
          </ChipToggle>
        ))}
        <ChipToggle pressed={form.versatile} onChange={toggleVersatile}>
          versatile
        </ChipToggle>
      </ChipGroup>

      {form.versatile && (
        <DiceInput
          label="Versatile damage"
          idPrefix="item-versatile"
          value={{ count: form.versatileDiceCount, faces: form.versatileDiceFaces }}
          onChange={setVersatileDie}
        />
      )}

      {hasRange(form) && <WeaponRangeInputs form={form} set={set} />}
    </div>
  );
}

function ArmorFieldGroup({ form, setters }: FieldsProps) {
  const { set } = setters;
  return (
    <div className="flex flex-col gap-3">
      <Field label="Armor type">
        <Segmented
          label="Armor type"
          options={ARMOR_CATEGORY_OPTIONS}
          value={form.armorCategory as ArmorCategory}
          onChange={(v) => set("armorCategory", v)}
        />
      </Field>
      <div className={pairGridCls}>
        <Field label="Base AC" htmlFor="item-base-ac">
          <Input
            id="item-base-ac"
            type="number"
            value={form.baseArmorClass}
            onChange={(e) => set("baseArmorClass", e.target.value)}
          />
        </Field>
        <Field label="Max Dex bonus" htmlFor="item-dex-max">
          <Input
            id="item-dex-max"
            type="number"
            placeholder="—"
            value={form.dexModifierMax}
            onChange={(e) => set("dexModifierMax", e.target.value)}
          />
        </Field>
        <Field label="Strength requirement" htmlFor="item-str-req">
          <Input
            id="item-str-req"
            type="number"
            placeholder="—"
            value={form.strengthRequirement}
            onChange={(e) => set("strengthRequirement", e.target.value)}
          />
        </Field>
      </div>
      <ChipGroup label="Armor properties">
        <ChipToggle pressed={form.dexModifierApplies} onChange={(v) => set("dexModifierApplies", v)}>
          Dex applies
        </ChipToggle>
        <ChipToggle pressed={form.stealthDisadvantage} onChange={(v) => set("stealthDisadvantage", v)}>
          Stealth disadvantage
        </ChipToggle>
      </ChipGroup>
    </div>
  );
}

function ConsumableFieldGroup({ form, setters }: FieldsProps) {
  const { set, setEffect } = setters;
  return (
    <div className="flex flex-col gap-3">
      <DiceInput
        label="Effect"
        idPrefix="item-effect"
        showModifier
        value={{ count: form.effectDiceCount, faces: form.effectDiceFaces, modifier: form.effectModifier }}
        onChange={setEffect}
      />
      <Field label="Effect description" htmlFor="item-effect-desc">
        <Input
          id="item-effect-desc"
          value={form.effectDescription}
          onChange={(e) => set("effectDescription", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function IdentityFieldset({ form, setters }: FieldsProps) {
  const { set, setCategory } = setters;
  return (
    <fieldset className={fieldsetCls}>
      <legend className={legendCls}>Identity</legend>
      <Field label="Name" htmlFor="item-name" required>
        <Input id="item-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Category">
        <Segmented label="Category" options={CATEGORY_OPTIONS} value={form.category} onChange={setCategory} />
      </Field>
    </fieldset>
  );
}

export function CategoryDetailsFieldset({ form, setters }: FieldsProps) {
  const { set } = setters;
  // Weapon/armor placement is derived from detail data — show it read-only so the
  // DM sees where it lands without a picker. Reuses the backend-mirroring rule.
  const equipsToSlots = allowedSlotsForItem({
    category: form.category,
    weapon: form.category === "weapon" ? { twoHanded: form.twoHanded } : undefined,
    armor: form.category === "armor" ? { armorCategory: form.armorCategory as ArmorCategory } : undefined,
  } as InventoryItem);

  return (
    <fieldset className={fieldsetCls}>
      <legend className={legendCls}>Category details</legend>

      {form.category === "gear" && (
        <Field label="Slot" htmlFor="item-slot" hint="Where this gear sits on the paper doll when worn.">
          <Select id="item-slot" value={form.slot} onChange={(e) => set("slot", e.target.value as EquipSlot | "")}>
            <option value="">Carried (not worn)</option>
            {WORN_SLOTS.map((s) => (
              <option key={s} value={s}>
                {wornSlotItemKindLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {(form.category === "weapon" || form.category === "armor") && (
        <p className="text-xs text-parchment-500">Equips to: {equipsToSlots.map(equipSlotLabel).join(" / ")}</p>
      )}

      {form.category === "weapon" && <WeaponFieldGroup form={form} setters={setters} />}
      {form.category === "armor" && <ArmorFieldGroup form={form} setters={setters} />}
      {form.category === "consumable" && <ConsumableFieldGroup form={form} setters={setters} />}
    </fieldset>
  );
}

function AttunementPrereqFields({ form, set }: { form: FormState; set: SetField }) {
  const showPrereqValue = form.attunementPrereqKind !== "" && form.attunementPrereqKind !== "spellcaster";
  return (
    <div className={pairGridCls}>
      <Field label="Attunement requires" htmlFor="item-prereq-kind">
        <Select
          id="item-prereq-kind"
          value={form.attunementPrereqKind}
          onChange={(e) => set("attunementPrereqKind", e.target.value as AttunementPrereqKind | "")}
        >
          {ATTUNEMENT_PREREQ_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {showPrereqValue && (
        <Field label="Prerequisite value" htmlFor="item-prereq-value">
          <Input
            id="item-prereq-value"
            placeholder="e.g. Wizard"
            value={form.attunementPrereqValue}
            onChange={(e) => set("attunementPrereqValue", e.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

export function MagicFieldset({ form, setters }: FieldsProps) {
  const { set } = setters;
  const isMagic = form.rarity !== "";
  const rarityHint = rarityValueHint(form.rarity || undefined, { isConsumable: form.category === "consumable" });

  return (
    <fieldset className={fieldsetCls}>
      <legend className={legendCls}>Magic</legend>
      <Field label="Rarity" htmlFor="item-rarity" hint={isMagic ? rarityHint : undefined}>
        <Select id="item-rarity" value={form.rarity} onChange={(e) => set("rarity", e.target.value as ItemRarity | "")}>
          <option value="">Mundane (none)</option>
          {RARITY_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {isMagic && (
        <ChipGroup label="Magic properties">
          <ChipToggle pressed={form.requiresAttunement} onChange={(v) => set("requiresAttunement", v)}>
            Requires attunement
          </ChipToggle>
          <ChipToggle pressed={form.isUnique} onChange={(v) => set("isUnique", v)}>
            Unique
          </ChipToggle>
        </ChipGroup>
      )}
      {isMagic && form.requiresAttunement && <AttunementPrereqFields form={form} set={set} />}
      {isMagic && (
        <CapabilityEditor
          capabilities={form.capabilities}
          onChange={(capabilities) => set("capabilities", capabilities)}
          spellcasterAttunable={form.requiresAttunement && form.attunementPrereqKind === "spellcaster"}
        />
      )}
    </fieldset>
  );
}

const COIN_FIELDS = [
  ["costCp", "Value (cp)"],
  ["costSp", "Value (sp)"],
  ["costGp", "Value (gp)"],
  ["costPp", "Value (pp)"],
] as const;

export function ValueWeightFieldset({ form, setters }: FieldsProps) {
  const { set, setSingleValue, setValueUnit } = setters;
  const cost = currencyFromForm(form);

  return (
    <fieldset className={fieldsetCls}>
      <legend className={legendCls}>Value &amp; weight</legend>
      <div className={pairGridCls}>
        <Field label="Value" htmlFor="item-value" hint={cost ? formatCurrency(cost) : undefined}>
          <div className="flex min-w-0 gap-1.5">
            <Input
              id="item-value"
              type="number"
              className="text-parchment-900"
              value={form[COST_KEYS[form.valueUnit]]}
              onChange={(e) => setSingleValue(e.target.value)}
            />
            <Select
              aria-label="Value unit"
              className="w-20"
              value={form.valueUnit}
              onChange={(e) => setValueUnit(e.target.value as CurrencyUnit)}
            >
              {CURRENCY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </Field>
        <Field label="Weight (lb)" htmlFor="item-weight">
          <Input id="item-weight" type="number" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
        </Field>
      </div>
      <Disclosure summary="Coin breakdown">
        <div className={pairGridCls}>
          {COIN_FIELDS.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`item-${key}`}>
              <Input
                id={`item-${key}`}
                type="number"
                className="text-parchment-900"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        {cost && (
          <p className="mt-2 text-xs text-parchment-500">Total: {formatCurrency(fromCopper(toCopper(cost)))}</p>
        )}
      </Disclosure>
    </fieldset>
  );
}

interface CloneFromCatalogProps {
  catalog: Item[];
  setForm: Dispatch<SetStateAction<FormState>>;
}

export function CloneFromCatalog({ catalog, setForm }: CloneFromCatalogProps) {
  return (
    <Field label="Clone from catalog (optional)" htmlFor="item-clone">
      <Select
        id="item-clone"
        value=""
        onChange={(e) => {
          const chosen = catalog.find((c) => c.id === e.target.value);
          if (chosen) setForm(formFromCatalog(chosen));
        }}
      >
        <option value="">Start from scratch…</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function DescriptionFieldset({ form, setters }: FieldsProps) {
  const { set } = setters;
  return (
    <fieldset className={fieldsetCls}>
      <legend className={legendCls}>Description &amp; DM notes</legend>
      <Field label="Description" htmlFor="item-description">
        <Textarea
          id="item-description"
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <Field label="DM notes (hidden from players)" htmlFor="item-dmnotes">
        <Textarea
          id="item-dmnotes"
          rows={2}
          value={form.dmNotes}
          onChange={(e) => set("dmNotes", e.target.value)}
        />
      </Field>
    </fieldset>
  );
}
