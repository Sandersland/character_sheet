// effectPillLabel and componentsLine delegate to the addSpell/spellMeta helpers
// so wording stays single-sourced and the picker never re-encodes it.
import { abilityAbbr, formatModifier } from "@/lib/abilities";
import { catalogEffectLine } from "@/lib/addSpell";
import { damagePillClass } from "@/lib/spellFlavor";
import { componentsLabel, levelLabel } from "@/lib/spellMeta";
import type { EconomySlot } from "@/lib/spellPicker";
import type { SpellComponents } from "@/types/character";

export type SpellPickRowState = "known" | "selected" | "select";

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

export function budgetHeadline(groups: BudgetGroup[]): string {
  return groups
    .filter((g) => g.cap > 0)
    .map((g) => `${g.label} ${g.selected}/${g.cap}`)
    .join(" · ");
}

// Single source both SpellPicker and level-up's New Spells step (#1158) read
// from, so the wording never drifts between the two surfaces.
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

export function pickerMetaLine(spell: { level: number; castingTime: string; range: string }): string {
  return `${levelLabel(spell.level)} · ${spell.castingTime} · ${spell.range}`;
}

export function effectPillLabel(spell: {
  effectKind?: "damage" | "heal" | "buff" | null;
  effectDiceCount?: number | null;
  effectDiceFaces?: number | null;
  damageType?: string | null;
  effectModifier?: number | null;
  instanceCount?: number | null;
}): string | null {
  return catalogEffectLine(spell);
}

export function componentsLine(spell: { components?: SpellComponents | null }): string | null {
  return componentsLabel(spell)?.replace(/ /g, ", ") ?? null;
}

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

// lead/tail carry the roll type + bonus/DC as plain text; dice/diceTint are
// split out so the row can render the dice clause as its own tinted pill (#1163).
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

const ECONOMY_SPENT_LINE: Record<EconomySlot, string> = {
  action: "Action spent. Bonus action & movement remain.",
  bonusAction: "Bonus action spent. Action & movement remain.",
  reaction: "Reaction spent.",
};

export function economySpentLine(slot: EconomySlot): string {
  return ECONOMY_SPENT_LINE[slot];
}

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
