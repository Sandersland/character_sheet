import { ITEM_CATEGORY_OPTIONS } from "@/lib/items";
import type {
  ArmorCategory,
  ArmorDetail,
  AttunementPrereqKind,
  CampaignItem,
  CampaignItemInput,
  Currency,
  EquipSlot,
  Item,
  ItemCapability,
  ItemCategory,
  ItemRarity,
  WeaponClass,
  WeaponDetail,
  WeaponRange,
} from "@/types/character";

export const WEAPON_FLAGS = ["finesse", "light", "heavy", "twoHanded", "reach", "thrown", "ammunition"] as const;
export type WeaponFlag = (typeof WEAPON_FLAGS)[number];
export const flagLabel = (flag: WeaponFlag) => (flag === "twoHanded" ? "two-handed" : flag);

export const CATEGORY_OPTIONS = ITEM_CATEGORY_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
export const WEAPON_CLASS_OPTIONS: readonly { value: WeaponClass | ""; label: string }[] = [
  { value: "", label: "Unclassified" },
  { value: "simple", label: "Simple" },
  { value: "martial", label: "Martial" },
];
export const WEAPON_RANGE_OPTIONS: readonly { value: WeaponRange | ""; label: string }[] = [
  { value: "", label: "Unclassified" },
  { value: "melee", label: "Melee" },
  { value: "ranged", label: "Ranged" },
];
export const ARMOR_CATEGORY_OPTIONS: readonly { value: ArmorCategory; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
  { value: "shield", label: "Shield" },
];

export type CurrencyUnit = "cp" | "sp" | "gp" | "pp";
export const CURRENCY_UNITS: readonly CurrencyUnit[] = ["cp", "sp", "gp", "pp"];
export const COST_KEYS: Record<CurrencyUnit, "costCp" | "costSp" | "costGp" | "costPp"> = {
  cp: "costCp",
  sp: "costSp",
  gp: "costGp",
  pp: "costPp",
};

export interface FormState {
  name: string;
  category: ItemCategory;
  slot: EquipSlot | "";
  rarity: ItemRarity | "";
  requiresAttunement: boolean;
  attunementPrereqKind: AttunementPrereqKind | "";
  attunementPrereqValue: string;
  capabilities: ItemCapability[];
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

export const emptyForm: FormState = {
  name: "",
  category: "weapon",
  slot: "",
  rarity: "",
  requiresAttunement: false,
  attunementPrereqKind: "",
  attunementPrereqValue: "",
  capabilities: [],
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

export const num = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() === "" || Number.isNaN(n) ? undefined : n;
};

export const str = (n: number | undefined): string => (n === undefined ? "" : n.toString());

// Map a persisted detail block back onto the string/boolean FormState slice.
function currencyFields(cost: Currency | undefined) {
  return {
    costCp: str(cost?.cp),
    costSp: str(cost?.sp),
    costGp: str(cost?.gp),
    costPp: str(cost?.pp),
  };
}

function weaponFlagFields(w: WeaponDetail | undefined): Record<WeaponFlag, boolean> {
  return Object.fromEntries(WEAPON_FLAGS.map((flag) => [flag, w?.[flag] ?? false])) as Record<WeaponFlag, boolean>;
}

export function weaponFields(w: WeaponDetail | undefined) {
  return {
    damageDiceCount: str(w?.damageDiceCount) || emptyForm.damageDiceCount,
    damageDiceFaces: str(w?.damageDiceFaces) || emptyForm.damageDiceFaces,
    damageModifier: str(w?.damageModifier) || emptyForm.damageModifier,
    damageType: w?.damageType ?? emptyForm.damageType,
    versatile: Boolean(w?.versatileDiceCount || w?.versatileDiceFaces),
    versatileDiceCount: str(w?.versatileDiceCount),
    versatileDiceFaces: str(w?.versatileDiceFaces),
    ...weaponFlagFields(w),
    rangeNormal: str(w?.rangeNormal),
    rangeLong: str(w?.rangeLong),
    weaponClass: (w?.weaponClass ?? "") as WeaponClass | "",
    weaponRange: (w?.weaponRange ?? "") as WeaponRange | "",
  };
}

function armorFields(a: ArmorDetail | undefined) {
  if (!a) {
    return {
      armorCategory: emptyForm.armorCategory,
      baseArmorClass: "",
      dexModifierApplies: true,
      dexModifierMax: "",
      stealthDisadvantage: false,
      strengthRequirement: "",
    };
  }
  return {
    armorCategory: a.armorCategory ?? emptyForm.armorCategory,
    baseArmorClass: str(a.baseArmorClass),
    dexModifierApplies: a.dexModifierApplies ?? true,
    dexModifierMax: str(a.dexModifierMax),
    stealthDisadvantage: a.stealthDisadvantage ?? false,
    strengthRequirement: str(a.strengthRequirement),
  };
}

// Prefill the from-scratch form from a chosen catalog Item (clone path):
// category/weight/cost/description + the matching detail block.
export function formFromCatalog(item: Item): FormState {
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
export function formFromItem(item: CampaignItem): FormState {
  return {
    ...emptyForm,
    name: item.name,
    category: item.category,
    slot: item.slot ?? "",
    rarity: item.rarity ?? "",
    requiresAttunement: item.requiresAttunement,
    attunementPrereqKind: item.attunementPrereqKind ?? "",
    attunementPrereqValue: item.attunementPrereqValue ?? "",
    capabilities: item.capabilities ?? [],
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
export const hasRange = (f: FormState): boolean => f.weaponRange === "ranged" || f.thrown;

// Highest populated denomination, so the single Value field faithfully shows an
// existing cost on edit (e.g. {sp:50} → "sp"). Defaults to gp for a blank cost.
const UNIT_ORDER: readonly CurrencyUnit[] = ["pp", "gp", "sp", "cp"];
export function unitForCost(cost: Currency | undefined): CurrencyUnit {
  if (!cost) return "gp";
  return UNIT_ORDER.find((u) => (cost[u] ?? 0) > 0) ?? "gp";
}

// The four-denomination cost, or undefined when every field is blank.
export function currencyFromForm(f: FormState): Currency | undefined {
  const cp = num(f.costCp);
  const sp = num(f.costSp);
  const gp = num(f.costGp);
  const pp = num(f.costPp);
  if (![cp, sp, gp, pp].some((v) => v !== undefined)) return undefined;
  return { cp: cp ?? 0, sp: sp ?? 0, gp: gp ?? 0, pp: pp ?? 0 };
}

// Versatile/range only persist when their gate is on — mirror the hidden-field
// rule so a melee weapon can't keep phantom values.
function versatileValues(f: FormState) {
  return {
    versatileDiceCount: f.versatile ? num(f.versatileDiceCount) : undefined,
    versatileDiceFaces: f.versatile ? num(f.versatileDiceFaces) : undefined,
  };
}

function rangeValues(f: FormState) {
  const active = hasRange(f);
  return {
    rangeNormal: active ? num(f.rangeNormal) : undefined,
    rangeLong: active ? num(f.rangeLong) : undefined,
  };
}

function buildWeapon(f: FormState): CampaignItemInput["weapon"] {
  return {
    damageDiceCount: num(f.damageDiceCount) ?? 1,
    damageDiceFaces: num(f.damageDiceFaces) ?? 6,
    damageModifier: num(f.damageModifier),
    damageType: f.damageType.trim() || "bludgeoning",
    ...versatileValues(f),
    finesse: f.finesse,
    light: f.light,
    heavy: f.heavy,
    twoHanded: f.twoHanded,
    reach: f.reach,
    thrown: f.thrown,
    ammunition: f.ammunition,
    ...rangeValues(f),
    weaponClass: f.weaponClass || undefined,
    weaponRange: f.weaponRange || undefined,
  };
}

function buildArmor(f: FormState): CampaignItemInput["armor"] {
  return {
    armorCategory: f.armorCategory as ArmorCategory,
    baseArmorClass: num(f.baseArmorClass) ?? 10,
    dexModifierApplies: f.dexModifierApplies,
    dexModifierMax: num(f.dexModifierMax),
    stealthDisadvantage: f.stealthDisadvantage,
    strengthRequirement: num(f.strengthRequirement),
  };
}

function buildConsumable(f: FormState): CampaignItemInput["consumable"] {
  const effect = {
    effectDiceCount: num(f.effectDiceCount),
    effectDiceFaces: num(f.effectDiceFaces),
    effectModifier: num(f.effectModifier),
    effectDescription: f.effectDescription.trim() || undefined,
  };
  return Object.values(effect).some((v) => v !== undefined) ? effect : undefined;
}

// Prereq only meaningful for an attunable magic item; a value-bearing kind
// without a value degrades to null (attunable by anyone).
function attunementFields(f: FormState, attunable: boolean) {
  const kind = attunable && f.attunementPrereqKind ? f.attunementPrereqKind : null;
  const value = kind && kind !== "spellcaster" ? f.attunementPrereqValue.trim() || null : null;
  return { attunementPrereqKind: kind, attunementPrereqValue: value };
}

// Base fields common to every category; attunement/unique only apply to a magic
// item — gate them like versatile/range so a mundane item can't carry stale flags.
function buildBase(f: FormState): CampaignItemInput {
  const magic = f.rarity !== "";
  const attunable = magic && f.requiresAttunement;
  return {
    name: f.name.trim(),
    category: f.category,
    // Slot only rides on gear; null clears it for everything else (backend #571).
    slot: f.category === "gear" ? f.slot || null : null,
    rarity: f.rarity || undefined,
    requiresAttunement: attunable,
    ...attunementFields(f, attunable),
    capabilities: magic ? f.capabilities : [],
    isUnique: magic && f.isUnique,
    weight: num(f.weight),
    cost: currencyFromForm(f),
    description: f.description.trim() || undefined,
    dmNotes: f.dmNotes.trim() || undefined,
  };
}

export function buildInput(f: FormState): CampaignItemInput {
  const base = buildBase(f);
  if (f.category === "weapon") base.weapon = buildWeapon(f);
  else if (f.category === "armor") base.armor = buildArmor(f);
  else if (f.category === "consumable") base.consumable = buildConsumable(f);
  return base;
}
