// Pure view logic for the shared spell picker (#1160) and the in-session cast
// sheet (#1163/#1164): row tri-state, the budget headline, and the row/card
// display lines. No JSX. Wording is single-sourced — effectPillLabel and
// componentsLine delegate to the addSpell/spellMeta helpers so the picker never
// re-encodes it.
import { abilityAbbr, formatModifier } from "@/lib/abilities";
import { catalogEffectLine } from "@/lib/addSpell";
import { damagePillClass } from "@/lib/spellFlavor";
import { componentsLabel, levelLabel } from "@/lib/spellMeta";
import type { EconomySlot } from "@/lib/spellPicker";
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

/** Detail-card CTA label for a row's (state, disabled) pair — the single source
 *  both SpellPicker and level-up's New Spells step (#1158) read from, so the
 *  wording never drifts between the two surfaces. */
export function pickDetailCtaLabel(
  name: string,
  state: SpellPickRowState,
  disabled: boolean,
  cap: number,
  selectedCount: number,
  verb: string,
): string {
  if (state === "known") return `${name} is already known`;
  if (state === "selected") return `Remove ${name}`;
  if (disabled) return `${verb} ${name}`;
  return `${verb} ${name} · ${selectedCount + 1} of ${cap}`;
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

/** The cast sheet's "what happens" line (#1163): roll type + bonus/DC as plain
 *  text (`lead`/`tail`), dice + type as a separately-tinted pill (`dice`/
 *  `diceTint`) so the row can render the dice clause as a badge. No averages —
 *  callers pass the already-rolled-shape preview string (e.g. "3d6 fire"). */
export interface ExpectedRoll {
  lead: string;
  dice: string | null;
  diceTint: string;
  tail: string;
}

export function expectedRollView(
  spell: {
    attackType?: "attack" | "save" | null;
    saveEffect?: "half" | "none" | null;
    effectKind?: "damage" | "heal" | "buff" | null;
    damageType?: string | null;
  },
  opts: { dcLabel: string | null; spellAttackBonus: number; preview: string | null },
): ExpectedRoll {
  const diceTint =
    spell.effectKind === "heal" ? "bg-vitality-100 text-vitality-800" : damagePillClass(spell.damageType);

  if (spell.attackType === "attack") {
    return { lead: `Spell attack ${formatModifier(opts.spellAttackBonus)}`, dice: opts.preview, diceTint, tail: "" };
  }
  if (spell.attackType === "save" && opts.dcLabel) {
    return {
      lead: `Targets make a ${opts.dcLabel}`,
      dice: opts.preview,
      diceTint,
      tail: spell.saveEffect === "half" ? "half on success" : "",
    };
  }
  if (opts.preview) {
    return {
      lead: spell.effectKind === "heal" ? "Heals automatically" : "Hits automatically",
      dice: opts.preview,
      diceTint,
      tail: "",
    };
  }
  return { lead: "No roll", dice: null, diceTint: "", tail: "" };
}

// "Action spent. Bonus action & movement remain." — the post-cast economy
// acknowledgment (#1164): what THIS slot cost, and what's left to spend.
const ECONOMY_SPENT_LINE: Record<EconomySlot, string> = {
  action: "Action spent. Bonus action & movement remain.",
  bonusAction: "Bonus action spent. Action & movement remain.",
  reaction: "Reaction spent.",
};

export function economySpentLine(slot: EconomySlot): string {
  return ECONOMY_SPENT_LINE[slot];
}

/** One line of the turn card's cast tally (#1164): spell + level + total +
 *  damage type, with the save/DC "announce" line folded on when present. */
export function castTallyLine(row: {
  spellName: string;
  level: number;
  total?: number;
  damageType?: string | null;
  announce?: string | null;
}): string {
  const levelPart = row.level > 0 ? ` (L${row.level})` : "";
  const totalPart = row.total !== undefined ? ` — ${row.total}${row.damageType ? ` ${row.damageType}` : ""}` : "";
  const announcePart = row.announce ? ` · announce ${row.announce}` : "";
  return `${row.spellName}${levelPart}${totalPart}${announcePart}`;
}
