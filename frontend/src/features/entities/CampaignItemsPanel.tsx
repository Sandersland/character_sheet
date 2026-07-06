import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ChipGroup from "@/components/ui/ChipGroup";
import ChipToggle from "@/components/ui/ChipToggle";
import DiceInput, { type DiceValue } from "@/components/ui/DiceInput";
import Disclosure from "@/components/ui/Disclosure";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { GiKnapsack, Lock, Plus } from "@/components/ui/icons";
import {
  awardCampaignItem,
  createCampaignItem,
  deleteCampaignItem,
  fetchCampaignItems,
  fetchItems,
  revokeCampaignItem,
  updateCampaignItem,
  updateEntity,
} from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { formatCurrency, fromCopper, toCopper } from "@/lib/currency";
import { ITEM_CATEGORY_OPTIONS, itemCategoryLabel } from "@/lib/items";
import { RARITY_OPTIONS, rarityLabel, rarityTone, rarityValueHint } from "@/lib/rarity";
import type {
  ArmorCategory,
  ArmorDetail,
  CampaignItem,
  CampaignItemInput,
  Currency,
  Item,
  ItemCategory,
  ItemRarity,
  WeaponClass,
  WeaponDetail,
  WeaponRange,
} from "@/types/character";

interface CampaignItemsPanelProps {
  campaignId: string;
  /** Member characters, so the DM can pick an award target. */
  characters: { id: string; name: string; ownerId: string }[];
}

const legendCls = "text-sm font-semibold text-parchment-800";
const fieldsetCls = "flex min-w-0 flex-col gap-3 border-t border-parchment-200 pt-3 first:border-t-0 first:pt-0";
const pairGridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2";

const WEAPON_FLAGS = ["finesse", "light", "heavy", "twoHanded", "reach", "thrown", "ammunition"] as const;
type WeaponFlag = (typeof WEAPON_FLAGS)[number];
const flagLabel = (flag: WeaponFlag) => (flag === "twoHanded" ? "two-handed" : flag);

const CATEGORY_OPTIONS = ITEM_CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
const WEAPON_CLASS_OPTIONS: readonly { value: WeaponClass | ""; label: string }[] = [
  { value: "", label: "Unclassified" },
  { value: "simple", label: "Simple" },
  { value: "martial", label: "Martial" },
];
const WEAPON_RANGE_OPTIONS: readonly { value: WeaponRange | ""; label: string }[] = [
  { value: "", label: "Unclassified" },
  { value: "melee", label: "Melee" },
  { value: "ranged", label: "Ranged" },
];
const ARMOR_CATEGORY_OPTIONS: readonly { value: ArmorCategory; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
  { value: "shield", label: "Shield" },
];

type CurrencyUnit = "cp" | "sp" | "gp" | "pp";
const CURRENCY_UNITS: readonly CurrencyUnit[] = ["cp", "sp", "gp", "pp"];
const COST_KEYS: Record<CurrencyUnit, "costCp" | "costSp" | "costGp" | "costPp"> = {
  cp: "costCp",
  sp: "costSp",
  gp: "costGp",
  pp: "costPp",
};

interface FormState {
  name: string;
  category: ItemCategory;
  rarity: ItemRarity | "";
  requiresAttunement: boolean;
  isUnique: boolean;
  weight: string;
  costCp: string;
  costSp: string;
  costGp: string;
  costPp: string;
  valueUnit: CurrencyUnit;
  description: string;
  dmNotes: string;
  // weapon
  damageDiceCount: string;
  damageDiceFaces: string;
  damageModifier: string;
  damageType: string;
  versatile: boolean;
  versatileDiceCount: string;
  versatileDiceFaces: string;
  finesse: boolean;
  light: boolean;
  heavy: boolean;
  twoHanded: boolean;
  reach: boolean;
  thrown: boolean;
  ammunition: boolean;
  rangeNormal: string;
  rangeLong: string;
  weaponClass: WeaponClass | "";
  weaponRange: WeaponRange | "";
  // armor
  armorCategory: string;
  baseArmorClass: string;
  dexModifierApplies: boolean;
  dexModifierMax: string;
  stealthDisadvantage: boolean;
  strengthRequirement: string;
  // consumable
  effectDiceCount: string;
  effectDiceFaces: string;
  effectModifier: string;
  effectDescription: string;
}

const emptyForm: FormState = {
  name: "",
  category: "weapon",
  rarity: "",
  requiresAttunement: false,
  isUnique: false,
  weight: "",
  costCp: "",
  costSp: "",
  costGp: "",
  costPp: "",
  valueUnit: "gp",
  description: "",
  dmNotes: "",
  damageDiceCount: "1",
  damageDiceFaces: "6",
  damageModifier: "0",
  damageType: "bludgeoning",
  versatile: false,
  versatileDiceCount: "",
  versatileDiceFaces: "",
  finesse: false,
  light: false,
  heavy: false,
  twoHanded: false,
  reach: false,
  thrown: false,
  ammunition: false,
  rangeNormal: "",
  rangeLong: "",
  weaponClass: "",
  weaponRange: "",
  armorCategory: "light",
  baseArmorClass: "",
  dexModifierApplies: true,
  dexModifierMax: "",
  stealthDisadvantage: false,
  strengthRequirement: "",
  effectDiceCount: "",
  effectDiceFaces: "",
  effectModifier: "",
  effectDescription: "",
};

const num = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() === "" || Number.isNaN(n) ? undefined : n;
};

const str = (n: number | undefined): string => (n === undefined ? "" : n.toString());

// Map a persisted detail block back onto the string/boolean FormState slice.
function currencyFields(cost: Currency | undefined) {
  return {
    costCp: str(cost?.cp),
    costSp: str(cost?.sp),
    costGp: str(cost?.gp),
    costPp: str(cost?.pp),
  };
}

function weaponFields(w: WeaponDetail | undefined) {
  return {
    damageDiceCount: str(w?.damageDiceCount) || emptyForm.damageDiceCount,
    damageDiceFaces: str(w?.damageDiceFaces) || emptyForm.damageDiceFaces,
    damageModifier: str(w?.damageModifier) || emptyForm.damageModifier,
    damageType: w?.damageType ?? emptyForm.damageType,
    versatile: Boolean(w?.versatileDiceCount || w?.versatileDiceFaces),
    versatileDiceCount: str(w?.versatileDiceCount),
    versatileDiceFaces: str(w?.versatileDiceFaces),
    finesse: w?.finesse ?? false,
    light: w?.light ?? false,
    heavy: w?.heavy ?? false,
    twoHanded: w?.twoHanded ?? false,
    reach: w?.reach ?? false,
    thrown: w?.thrown ?? false,
    ammunition: w?.ammunition ?? false,
    rangeNormal: str(w?.rangeNormal),
    rangeLong: str(w?.rangeLong),
    weaponClass: (w?.weaponClass ?? "") as WeaponClass | "",
    weaponRange: (w?.weaponRange ?? "") as WeaponRange | "",
  };
}

function armorFields(a: ArmorDetail | undefined) {
  return {
    armorCategory: a?.armorCategory ?? emptyForm.armorCategory,
    baseArmorClass: str(a?.baseArmorClass),
    dexModifierApplies: a?.dexModifierApplies ?? true,
    dexModifierMax: str(a?.dexModifierMax),
    stealthDisadvantage: a?.stealthDisadvantage ?? false,
    strengthRequirement: str(a?.strengthRequirement),
  };
}

// Prefill the from-scratch form from a chosen catalog Item (clone path):
// category/weight/cost/description + the matching detail block.
function formFromCatalog(item: Item): FormState {
  return {
    ...emptyForm,
    name: item.name,
    category: item.category,
    weight: item.weight?.toString() ?? "",
    ...currencyFields(item.cost),
    valueUnit: unitForCost(item.cost),
    description: item.description ?? "",
    ...weaponFields(item.weapon),
    ...armorFields(item.armor),
    effectDiceCount: item.consumable?.effectDiceCount?.toString() ?? "",
    effectDiceFaces: item.consumable?.effectDiceFaces?.toString() ?? "",
    effectModifier: item.consumable?.effectModifier?.toString() ?? "",
    effectDescription: item.consumable?.effectDescription ?? "",
  };
}

// Prefill the shared form from an existing campaign item (edit path):
// every base field + the matching detail block, so a save re-sends the full item.
function formFromItem(item: CampaignItem): FormState {
  return {
    ...emptyForm,
    name: item.name,
    category: item.category,
    rarity: item.rarity ?? "",
    requiresAttunement: item.requiresAttunement,
    isUnique: item.isUnique,
    weight: item.weight?.toString() ?? "",
    ...currencyFields(item.cost),
    valueUnit: unitForCost(item.cost),
    description: item.description ?? "",
    dmNotes: item.dmNotes ?? "",
    ...weaponFields(item.weapon),
    ...armorFields(item.armor),
    effectDiceCount: item.consumable?.effectDiceCount?.toString() ?? "",
    effectDiceFaces: item.consumable?.effectDiceFaces?.toString() ?? "",
    effectModifier: item.consumable?.effectModifier?.toString() ?? "",
    effectDescription: item.consumable?.effectDescription ?? "",
  };
}

// Range is shown/sent only for a ranged or thrown weapon.
const hasRange = (f: FormState): boolean => f.weaponRange === "ranged" || f.thrown;

// Highest populated denomination, so the single Value field faithfully shows an
// existing cost on edit (e.g. {sp:50} → "sp"). Defaults to gp for a blank cost.
const UNIT_ORDER: readonly CurrencyUnit[] = ["pp", "gp", "sp", "cp"];
function unitForCost(cost: Currency | undefined): CurrencyUnit {
  if (!cost) return "gp";
  return UNIT_ORDER.find((u) => (cost[u] ?? 0) > 0) ?? "gp";
}

// The four-denomination cost, or undefined when every field is blank.
function currencyFromForm(f: FormState): Currency | undefined {
  const cp = num(f.costCp);
  const sp = num(f.costSp);
  const gp = num(f.costGp);
  const pp = num(f.costPp);
  if (![cp, sp, gp, pp].some((v) => v !== undefined)) return undefined;
  return { cp: cp ?? 0, sp: sp ?? 0, gp: gp ?? 0, pp: pp ?? 0 };
}

function buildInput(f: FormState): CampaignItemInput {
  const base: CampaignItemInput = {
    name: f.name.trim(),
    category: f.category,
    rarity: f.rarity || undefined,
    requiresAttunement: f.requiresAttunement,
    isUnique: f.isUnique,
    weight: num(f.weight),
    cost: currencyFromForm(f),
    description: f.description.trim() || undefined,
    dmNotes: f.dmNotes.trim() || undefined,
  };
  if (f.category === "weapon") {
    base.weapon = {
      damageDiceCount: num(f.damageDiceCount) ?? 1,
      damageDiceFaces: num(f.damageDiceFaces) ?? 6,
      damageModifier: num(f.damageModifier),
      damageType: f.damageType.trim() || "bludgeoning",
      versatileDiceCount: f.versatile ? num(f.versatileDiceCount) : undefined,
      versatileDiceFaces: f.versatile ? num(f.versatileDiceFaces) : undefined,
      finesse: f.finesse,
      light: f.light,
      heavy: f.heavy,
      twoHanded: f.twoHanded,
      reach: f.reach,
      thrown: f.thrown,
      ammunition: f.ammunition,
      // Range only applies (and is only editable) when ranged or thrown — mirror
      // the versatile gate so a melee weapon can't keep phantom hidden range.
      rangeNormal: hasRange(f) ? num(f.rangeNormal) : undefined,
      rangeLong: hasRange(f) ? num(f.rangeLong) : undefined,
      weaponClass: f.weaponClass || undefined,
      weaponRange: f.weaponRange || undefined,
    };
  } else if (f.category === "armor") {
    base.armor = {
      armorCategory: f.armorCategory as ArmorCategory,
      baseArmorClass: num(f.baseArmorClass) ?? 10,
      dexModifierApplies: f.dexModifierApplies,
      dexModifierMax: num(f.dexModifierMax),
      stealthDisadvantage: f.stealthDisadvantage,
      strengthRequirement: num(f.strengthRequirement),
    };
  } else if (f.category === "consumable") {
    const effect = {
      effectDiceCount: num(f.effectDiceCount),
      effectDiceFaces: num(f.effectDiceFaces),
      effectModifier: num(f.effectModifier),
      effectDescription: f.effectDescription.trim() || undefined,
    };
    if (Object.values(effect).some((v) => v !== undefined)) base.consumable = effect;
  }
  return base;
}

// Owner-only Manage-tab panel (#380): authors DM campaign items via two paths —
// clone-from-SRD-catalog (pre-fills the form from a chosen Item) and from-scratch
// with category-conditional detail fields. The shared form is recomposed (#542)
// into labelled fieldsets with progressive disclosure. Each create auto-registers
// a HIDDEN ITEM entity; reveal/edit/delete here keep the shared Codex cache in sync.
export default function CampaignItemsPanel({ campaignId, characters }: CampaignItemsPanelProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [creating, setCreating] = useState(false);
  // Non-null while editing an existing item; drives the shared form's mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item chosen award target (character id).
  const [awardTarget, setAwardTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetchCampaignItems(campaignId)
      .then((list) => active && setItems(list))
      .catch(() => active && setError("Failed to load campaign items."));
    fetchItems()
      .then((list) => active && setCatalog(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaignId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Single "Value" field writes one denomination and clears the rest.
  function setSingleValue(amount: string) {
    setForm((f) => ({
      ...f,
      costCp: "",
      costSp: "",
      costGp: "",
      costPp: "",
      [COST_KEYS[f.valueUnit]]: amount,
    }));
  }

  // Switching the unit carries the current amount to the new denomination.
  function setValueUnit(unit: CurrencyUnit) {
    setForm((f) => ({
      ...f,
      costCp: "",
      costSp: "",
      costGp: "",
      costPp: "",
      valueUnit: unit,
      [COST_KEYS[unit]]: f[COST_KEYS[f.valueUnit]],
    }));
  }

  function setDamage(v: DiceValue) {
    setForm((f) => ({
      ...f,
      damageDiceCount: v.count,
      damageDiceFaces: v.faces,
      damageModifier: v.modifier ?? "",
      damageType: v.type ?? "",
    }));
  }

  function setVersatileDie(v: DiceValue) {
    setForm((f) => ({ ...f, versatileDiceCount: v.count, versatileDiceFaces: v.faces }));
  }

  function toggleVersatile(on: boolean) {
    setForm((f) => ({
      ...f,
      versatile: on,
      versatileDiceCount: on ? f.versatileDiceCount || "1" : "",
      versatileDiceFaces: on ? f.versatileDiceFaces || "10" : "",
    }));
  }

  function setEffect(v: DiceValue) {
    setForm((f) => ({
      ...f,
      effectDiceCount: v.count,
      effectDiceFaces: v.faces,
      effectModifier: v.modifier ?? "",
    }));
  }

  function revealInCache(entityId: string, visibility: "HIDDEN" | "REVEALED") {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, visibility } : e)),
      );
    }
  }

  // Mirror a saved rename onto the fronting entity in the shared Codex cache.
  function renameInCache(entityId: string, name: string) {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, name } : e)),
      );
    }
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setCreating((c) => !c);
  }

  function startEdit(item: CampaignItem) {
    setEditingId(item.id);
    setForm(formFromItem(item));
    setCreating(false);
    setError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit() {
    if (form.name.trim() === "") return;
    const editing = editingId !== null;
    setBusyId(editing ? editingId : "new");
    setError(null);
    try {
      if (editing) {
        const updated = await updateCampaignItem(campaignId, editingId, buildInput(form));
        setItems((prev) =>
          prev
            .map((i) => (i.id === updated.id ? { ...updated, holders: i.holders ?? [] } : i))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        if (updated.entity) renameInCache(updated.entity.id, updated.entity.name);
      } else {
        const created = await createCampaignItem(campaignId, buildInput(form));
        setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (created.entity) primeCampaignEntities(campaignId, [...entities, { id: created.entity.id, campaignId, type: "ITEM", name: created.entity.name, aliases: [], notes: null, visibility: created.entity.visibility, createdAt: created.createdAt, updatedAt: created.updatedAt }]);
      }
      setForm(emptyForm);
      setCreating(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : editing ? "Failed to update item." : "Failed to create item.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleReveal(item: CampaignItem) {
    if (!item.entity) return;
    setBusyId(item.id);
    setError(null);
    try {
      const next = item.entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      const updated = await updateEntity(campaignId, item.entity.id, { visibility: next });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id && i.entity ? { ...i, entity: { ...i.entity, visibility: updated.visibility } } : i,
        ),
      );
      revealInCache(item.entity.id, updated.visibility);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CampaignItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteCampaignItem(campaignId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (item.entity) {
        primeCampaignEntities(campaignId, entities.filter((e) => e.id !== item.entity!.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAward(item: CampaignItem) {
    // The Award button is disabled until a recipient is picked, so awardTarget
    // is always set here; the guard is a defensive backstop, not a fallback.
    const characterId = awardTarget[item.id];
    if (!characterId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const { holders } = await awardCampaignItem(campaignId, item.id, { characterId });
      // Award reveals the fronting entity — reflect it locally + in the cache.
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, holders, entity: i.entity ? { ...i.entity, visibility: "REVEALED" } : i.entity }
            : i,
        ),
      );
      if (item.entity) revealInCache(item.entity.id, "REVEALED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to award item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(item: CampaignItem, characterId: string) {
    setBusyId(item.id);
    setError(null);
    try {
      const { holders } = await revokeCampaignItem(campaignId, item.id, { characterId });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, holders } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke item.");
    } finally {
      setBusyId(null);
    }
  }

  const isMagic = form.rarity !== "";
  const rarityHint = rarityValueHint(form.rarity || undefined, {
    isConsumable: form.category === "consumable",
  });
  const cost = currencyFromForm(form);
  const showRange = hasRange(form);

  return (
    <Card
      title="Campaign items"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-expanded={creating}
          onClick={startCreate}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          New item
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {(creating || editingId !== null) && (
          <div className="flex flex-col gap-4 rounded-control border border-parchment-200 bg-parchment-100 p-3">
            {editingId === null && (
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
            )}

            <fieldset className={fieldsetCls}>
              <legend className={legendCls}>Identity</legend>
              <Field label="Name" htmlFor="item-name" required>
                <Input id="item-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Category">
                <Segmented
                  label="Category"
                  options={CATEGORY_OPTIONS}
                  value={form.category}
                  onChange={(v) => set("category", v)}
                />
              </Field>
            </fieldset>

            <fieldset className={fieldsetCls}>
              <legend className={legendCls}>Category details</legend>

              {form.category === "gear" && (
                <p className="text-xs text-parchment-500">Gear has no extra mechanics.</p>
              )}

              {form.category === "weapon" && (
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

                  {showRange && (
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
                  )}
                </div>
              )}

              {form.category === "armor" && (
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
                    <ChipToggle
                      pressed={form.dexModifierApplies}
                      onChange={(v) => set("dexModifierApplies", v)}
                    >
                      Dex applies
                    </ChipToggle>
                    <ChipToggle
                      pressed={form.stealthDisadvantage}
                      onChange={(v) => set("stealthDisadvantage", v)}
                    >
                      Stealth disadvantage
                    </ChipToggle>
                  </ChipGroup>
                </div>
              )}

              {form.category === "consumable" && (
                <div className="flex flex-col gap-3">
                  <DiceInput
                    label="Effect"
                    idPrefix="item-effect"
                    showModifier
                    value={{
                      count: form.effectDiceCount,
                      faces: form.effectDiceFaces,
                      modifier: form.effectModifier,
                    }}
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
              )}
            </fieldset>

            <fieldset className={fieldsetCls}>
              <legend className={legendCls}>Magic</legend>
              <Field label="Rarity" htmlFor="item-rarity" hint={isMagic ? rarityHint : undefined}>
                <Select
                  id="item-rarity"
                  value={form.rarity}
                  onChange={(e) => set("rarity", e.target.value as ItemRarity | "")}
                >
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
                  <ChipToggle
                    pressed={form.requiresAttunement}
                    onChange={(v) => set("requiresAttunement", v)}
                  >
                    Requires attunement
                  </ChipToggle>
                  <ChipToggle pressed={form.isUnique} onChange={(v) => set("isUnique", v)}>
                    Unique
                  </ChipToggle>
                </ChipGroup>
              )}
              {/* Structural slot for the #526 magic-item capabilities editor. */}
            </fieldset>

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
                  <Input
                    id="item-weight"
                    type="number"
                    value={form.weight}
                    onChange={(e) => set("weight", e.target.value)}
                  />
                </Field>
              </div>
              <Disclosure summary="Coin breakdown">
                <div className={pairGridCls}>
                  {(
                    [
                      ["costCp", "Value (cp)"],
                      ["costSp", "Value (sp)"],
                      ["costGp", "Value (gp)"],
                      ["costPp", "Value (pp)"],
                    ] as const
                  ).map(([key, label]) => (
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
                  <p className="mt-2 text-xs text-parchment-500">
                    Total: {formatCurrency(fromCopper(toCopper(cost)))}
                  </p>
                )}
              </Disclosure>
            </fieldset>

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

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId !== null || form.name.trim() === ""}
                onClick={handleSubmit}
                className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
              >
                {editingId !== null
                  ? busyId === editingId
                    ? "Saving…"
                    : "Save changes"
                  : busyId === "new"
                    ? "Creating…"
                    : "Create item"}
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<GiKnapsack />}
            title="No campaign items yet"
            description="Author magic items and loot here. Each starts hidden — reveal it to drop it into your players' Codex."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {items.map((item) => {
              const hidden = item.entity?.visibility === "HIDDEN";
              const holders = item.holders ?? [];
              const held = item.isUnique && holders.length > 0;
              return (
                <li key={item.id} className="flex flex-col gap-2 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.entity ? (
                      <Link
                        to={`/campaigns/${campaignId}/entities/${item.entity.id}`}
                        className="text-sm font-semibold text-parchment-900 hover:underline"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-parchment-900">{item.name}</span>
                    )}
                    <Badge tone="gold">{itemCategoryLabel(item.category)}</Badge>
                    {item.rarity && <Badge tone={rarityTone(item.rarity)}>{rarityLabel(item.rarity)}</Badge>}
                    {item.isUnique && <Badge tone="arcane">Unique</Badge>}
                    {hidden && (
                      <Badge tone="neutral">
                        <Lock aria-hidden="true" className="h-3 w-3" />
                        Hidden
                      </Badge>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busyId === item.id || !item.entity}
                        onClick={() => toggleReveal(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        {hidden ? "Reveal" : "Hide"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => startEdit(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => handleDelete(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </span>
                  </div>

                  {holders.length > 0 && (
                    <ul className="flex flex-col gap-1 pl-1 text-xs text-parchment-700">
                      {holders.map((h) => (
                        <li key={h.characterId} className="flex items-center gap-2">
                          <span>
                            Held by <span className="font-semibold">{h.characterName}</span>
                            {h.quantity > 1 ? ` ×${h.quantity}` : ""}
                          </span>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleRevoke(item, h.characterId)}
                            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {characters.length > 0 && !held && (
                    <div className="flex items-center gap-2 pl-1">
                      <label htmlFor={`award-${item.id}`} className="text-xs text-parchment-600">
                        Award to
                      </label>
                      <select
                        id={`award-${item.id}`}
                        className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900"
                        value={awardTarget[item.id] ?? ""}
                        onChange={(e) =>
                          setAwardTarget((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      >
                        <option value="">Choose character…</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === item.id || !(awardTarget[item.id] ?? "")}
                        onClick={() => handleAward(item)}
                        className="rounded-control bg-garnet-600 px-2 py-1 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
                      >
                        Award
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
