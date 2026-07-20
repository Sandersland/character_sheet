// Pure view logic for the shared spell picker (#1160): row tri-state, the budget
// headline, and the row/card display lines. No JSX. Wording is single-sourced —
// effectPillLabel and componentsLine delegate to the addSpell/spellMeta helpers
// so the picker never re-encodes it.
import { abilityAbbr } from "@/lib/abilities";
import { catalogEffectLine } from "@/lib/addSpell";
import { componentsLabel, levelLabel } from "@/lib/spellMeta";
import type { SpellComponents } from "@/types/character";

export type SpellPickRowState = "known" | "selected" | "select";

// Tri-state of one catalog row (lifted from catalogRowState in NewSpellsStep): an
// already-known spell is disabled, a picked one stays pressed and toggleable even
// at cap, and an unpicked one disables once the cap is reached.
export function pickRowState(
  spell: { id: string },
  knownIds: ReadonlySet<string>,
  selectedIds: string[],
  atCap: boolean,
): { state: SpellPickRowState; disabled: boolean } {
  if (knownIds.has(spell.id)) return { state: "known", disabled: true };
  const selected = selectedIds.includes(spell.id);
  return { state: selected ? "selected" : "select", disabled: !selected && atCap };
}

export interface BudgetGroup {
  label: string;
  selected: number;
  cap: number;
}

/** "Cantrips 1/2 · Spells 0/2" — zero-cap groups drop out; a lone group has no
 *  separator. */
export function budgetHeadline(groups: BudgetGroup[]): string {
  return groups
    .filter((g) => g.cap > 0)
    .map((g) => `${g.label} ${g.selected}/${g.cap}`)
    .join(" · ");
}

/** "Cantrip · 1 action · 60 ft." / "Level 2 · Bonus action · Self" — the row meta. */
export function pickerMetaLine(spell: { level: number; castingTime: string; range: string }): string {
  return `${levelLabel(spell.level)} · ${spell.castingTime} · ${spell.range}`;
}

/** The effect pill text ("fire damage — 8d6" / "Healing — 2d4"), null when diceless. */
export function effectPillLabel(spell: {
  effectKind?: "damage" | "heal" | "buff" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  damageType?: string | null;
  effectModifier?: number | null;
}): string | null {
  return catalogEffectLine(spell);
}

/** "V, S, M" for the detail card's stat grid, null when components are absent. */
export function componentsLine(spell: { components?: SpellComponents | null }): string | null {
  return componentsLabel(spell)?.replace(/ /g, ", ") ?? null;
}

/** How the spell resolves ("DEX save · half on success" / "Spell attack"), null
 *  when it neither attacks nor forces a save. Ability shown via abilityAbbr. */
export function spellResolutionLabel(spell: {
  attackType?: "attack" | "save" | null;
  saveAbility?: string | null;
  saveEffect?: "half" | "none" | null;
}): string | null {
  if (spell.attackType === "save" && spell.saveAbility) {
    return `${abilityAbbr(spell.saveAbility)} save${spell.saveEffect === "half" ? " · half on success" : ""}`;
  }
  if (spell.attackType === "attack") return "Spell attack";
  return null;
}
