// Pure builder for the level-up Review step's change ledger (#891): reads the
// staged draft into ordered before→after rows. Kept sync/pure — the ReviewStep
// injects catalog id→name lookups as `resolvers` so this never fetches.

import { abilityLabel, abilityModifier, formatModifier } from "@/lib/abilities";
import { averageHitPointGain, dieFaces } from "@/lib/hitDice";
import type { LevelUpDraft } from "@/lib/levelUpSteps";
import type {
  Character,
  LearnSubclassChoiceOperation,
  LevelUpPlanResponse,
  SpellSchool,
  TakeFeatOperation,
} from "@/types/character";

export type LedgerRowVariant = "delta" | "note" | "list" | "grantedSpells";

export interface LedgerRow {
  label: string;
  /** Struck-through prior value (delta rows). */
  before?: string;
  /** New value (delta rows). */
  after?: string;
  /** Small subtitle — a modifier delta, or the recalculated-abilities list. */
  note?: string;
  /** Resolved display names (list rows). */
  items?: string[];
  /** Per-spell name/level/school (grantedSpells rows only — #1159 unlock card). */
  grantedSpells?: { name: string; level: number; school: SpellSchool }[];
  variant: LedgerRowVariant;
}

/** Catalog id→name lookups injected by the ReviewStep so the builder stays pure. */
export interface LedgerResolvers {
  maneuver: (id: string) => string | undefined;
  discipline: (id: string) => string | undefined;
  spell: (id: string) => string | undefined;
  feat: (id: string) => string | undefined;
}

/** Custom name wins; else the catalog lookup; else the raw id as a last resort. */
function resolvedName(
  id: string | undefined,
  custom: { name: string } | undefined,
  lookup: (id: string) => string | undefined,
): string {
  if (custom) return custom.name;
  if (id) return lookup(id) ?? id;
  return "Unknown";
}

// HP is applied before the ASI on the backend, so it uses the PRE-level Con mod —
// an ASI that bumps Con this same level must not retroactively raise the gain.
function hpGain(hp: NonNullable<LevelUpDraft["hp"]>, character: Character): number {
  const conMod = abilityModifier(character.abilityScores.constitution);
  if (hp.method === "roll") return Math.max(1, (hp.roll ?? 0) + conMod);
  return averageHitPointGain(dieFaces(character.hitDice.die), conMod);
}

function abilityRow(ability: string, before: number, amount: number): LedgerRow {
  const after = before + amount;
  const modBefore = abilityModifier(before);
  const modAfter = abilityModifier(after);
  const note =
    modBefore === modAfter ? undefined : `modifier ${formatModifier(modBefore)} → ${formatModifier(modAfter)}`;
  return { label: abilityLabel(ability), before: String(before), after: String(after), note, variant: "delta" };
}

function featRows(
  op: TakeFeatOperation,
  scores: Record<string, number>,
  resolvers: LedgerResolvers,
): { rows: LedgerRow[]; affected: string[] } {
  const name = op.custom?.name ?? (op.featId ? resolvers.feat(op.featId) ?? "New feat" : "New feat");
  const rows: LedgerRow[] = [{ label: "Feat", after: name, variant: "delta" }];
  const affected: string[] = [];
  if (op.abilityChoice) {
    const amount = op.custom?.abilityIncrease ?? 1;
    rows.push(abilityRow(op.abilityChoice, scores[op.abilityChoice] ?? 0, amount));
    affected.push(abilityLabel(op.abilityChoice));
  }
  return { rows, affected };
}

function advancementRows(
  character: Character,
  advancement: LevelUpDraft["advancement"],
  resolvers: LedgerResolvers,
): { rows: LedgerRow[]; affected: string[] } {
  if (!advancement) return { rows: [], affected: [] };
  const scores = character.abilityScores as unknown as Record<string, number>;
  if (advancement.type === "takeAsi") {
    return {
      rows: advancement.increases.map((inc) => abilityRow(inc.ability, scores[inc.ability] ?? 0, inc.amount)),
      affected: advancement.increases.map((inc) => abilityLabel(inc.ability)),
    };
  }
  return featRows(advancement, scores, resolvers);
}

// Full option-name resolution for subclass features is out of scope — no
// catalog-by-source endpoint exists — so a non-custom pick shows its step label.
function subclassChoiceName(op: LearnSubclassChoiceOperation, plan: LevelUpPlanResponse): string {
  if (op.custom) return op.custom.name;
  const step = plan.steps.find((s) => s.kind === "subclassChoice" && s.meta?.key === op.choiceKey);
  const label = step?.meta?.label;
  return typeof label === "string" ? label : op.choiceKey;
}

function listRow(label: string, items: string[]): LedgerRow | null {
  return items.length ? { label, items, variant: "list" } : null;
}

// Auto-granted subclass spells get their own card variant (#1159) rather than the
// bare name-list `listRow` — Review needs each spell's level + school to render
// the unlock-card treatment, not just a resolved display string.
function grantedSpellsRow(plan: LevelUpPlanResponse): LedgerRow | null {
  if (!plan.grantedSpells.length) return null;
  return {
    label: plan.target.subclass ? `Granted by ${plan.target.subclass}` : "Granted Spells",
    grantedSpells: plan.grantedSpells,
    variant: "grantedSpells",
  };
}

// #1101: a forgotten spell is a per-character ENTRY id, so its name resolves from
// the character's own spellbook — not resolvers.spell (which is catalog-id space).
function forgottenNames(draft: LevelUpDraft, character: Character): string[] {
  const book = character.spellcasting?.spells ?? [];
  return (draft.spellsForgotten ?? []).map((op) => book.find((s) => s.id === op.entryId)?.name ?? op.entryId);
}

function learnedListRows(
  draft: LevelUpDraft,
  plan: LevelUpPlanResponse,
  r: LedgerResolvers,
  character: Character,
): LedgerRow[] {
  const rows = [
    listRow("Maneuvers", (draft.maneuvers ?? []).map((op) => resolvedName(op.maneuverId, op.custom, r.maneuver))),
    listRow(
      "Disciplines",
      (draft.disciplines ?? []).map((op) => resolvedName(op.disciplineId, op.custom, r.discipline)),
    ),
    listRow("Tool Proficiencies", (draft.toolProficiencies ?? []).map((op) => op.name)),
    listRow("Subclass Features", (draft.subclassChoices ?? []).map((op) => subclassChoiceName(op, plan))),
    listRow("Forgotten", forgottenNames(draft, character)),
    // #1157: cantrips get their own row above New Spells, same catalog as spells.
    listRow("New Cantrips", (draft.cantripsLearned ?? []).map((op) => resolvedName(op.spellId, op.custom, r.spell))),
    listRow("New Spells", (draft.spellsLearned ?? []).map((op) => resolvedName(op.spellId, op.custom, r.spell))),
  ];
  return rows.filter((row): row is LedgerRow => row !== null);
}

/** Ordered ledger rows for the draft; absent draft fields drop their rows. */
export function buildLevelUpLedger(
  character: Character,
  draft: LevelUpDraft,
  plan: LevelUpPlanResponse,
  resolvers: LedgerResolvers,
): LedgerRow[] {
  const advancement = advancementRows(character, draft.advancement, resolvers);
  const max = character.hitPoints.max;
  const { total, die } = character.hitDice;
  const rows: (LedgerRow | null)[] = [
    // `character.level` is the XP-derived level (already the post-up value while a
    // level-up is pending); the applied "before" is one below the target.
    { label: "Level", before: String(plan.target.newLevel - 1), after: String(plan.target.newLevel), variant: "delta" },
    draft.hp
      ? { label: "Maximum HP", before: String(max), after: String(max + hpGain(draft.hp, character)), variant: "delta" }
      : null,
    ...advancement.rows,
    advancement.affected.length ? { label: "Recalculated", note: advancement.affected.join(", "), variant: "note" } : null,
    { label: "Hit Dice", before: `${total}${die}`, after: `${total + 1}${die}`, variant: "delta" },
    draft.subclassId ? { label: "Subclass", after: plan.target.subclass ?? "New subclass", variant: "delta" } : null,
    draft.fightingStyleFeat
      ? {
          label: "Fighting Style",
          after: resolvedName(draft.fightingStyleFeat.featId, draft.fightingStyleFeat.custom, resolvers.feat),
          variant: "delta",
        }
      : null,
    ...learnedListRows(draft, plan, resolvers, character),
    // Auto-granted subclass spells are derived on the plan, not the draft — surface
    // them so Review's "applied together" claim covers them too (#1139).
    grantedSpellsRow(plan),
  ];
  return rows.filter((row): row is LedgerRow => row !== null);
}
