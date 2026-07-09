import type { Dispatch, SetStateAction } from "react";

import { type DiceValue } from "@/components/ui/DiceInput";
import { COST_KEYS, type CurrencyUnit, type FormState } from "@/lib/campaignItemForm";
import type { ItemCategory } from "@/types/character";

type SetForm = Dispatch<SetStateAction<FormState>>;

// The form's controlled-input setters, factored out of CampaignItemForm.
export function buildFormSetters(setForm: SetForm) {
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Changing category away from gear drops any authored slot (mirrors backend #571).
  function setCategory(next: ItemCategory) {
    setForm((f) => ({ ...f, category: next, slot: next === "gear" ? f.slot : "" }));
  }

  // Single "Value" field writes one denomination and clears the rest.
  function setSingleValue(amount: string) {
    setForm((f) => ({ ...f, costCp: "", costSp: "", costGp: "", costPp: "", [COST_KEYS[f.valueUnit]]: amount }));
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
    setForm((f) => ({ ...f, effectDiceCount: v.count, effectDiceFaces: v.faces, effectModifier: v.modifier ?? "" }));
  }

  return { set, setCategory, setSingleValue, setValueUnit, setDamage, setVersatileDie, toggleVersatile, setEffect };
}

export type FormSetters = ReturnType<typeof buildFormSetters>;
