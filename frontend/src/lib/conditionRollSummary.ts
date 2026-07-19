// Pure presenter for the ConditionRollBanner (#984). Turns the character's
// derived `rollModifiers` (condition/exhaustion/buff-sourced advantage &
// disadvantage grants — see backend buildRollModifiers) into ONE plain-English
// line per source, e.g. "Poisoned → Disadvantage on attack rolls and ability
// checks". This is the single home for the "why" the sheet used to stamp under
// every ability box and all 18 skill rows; `resolveRollMode` still resolves the
// mode per roll (unchanged). No JSX here — the banner component consumes this.

import { abilityLabel } from "@/lib/abilities";
import type { FlatRollEffect, RollModifier } from "@/types/character";

/** One roll-modifying state, summarized for the banner. */
export interface ConditionRollSummary {
  /** Provenance label, e.g. "Poisoned", "Rage", "Exhaustion". */
  source: string;
  /** Overall tone — `mixed` when a source grants more than one direction; `penalty` for a flat modifier (#1136). */
  tone: "advantage" | "disadvantage" | "mixed" | "penalty";
  /** e.g. "Disadvantage on attack rolls and ability checks" or "−4 on d20 Tests". */
  effect: string;
}

// Read order for the roll categories so a source's clause always lists them the
// same way (attack → check → save → initiative), matching the PHB phrasing
// "Disadvantage on attack rolls and ability checks".
const KIND_ORDER: Record<RollModifier["kind"], number> = {
  attack: 0,
  check: 1,
  save: 2,
  initiative: 3,
};

// The noun phrase for one grant. Ability-scoped grants (Rage → Strength checks,
// Restrained → Dexterity saving throws) name the ability via abilityLabel so we
// never render a raw lowercase key.
function categoryPhrase(mod: RollModifier): string {
  switch (mod.kind) {
    case "attack":
      return "attack rolls";
    case "initiative":
      return "initiative";
    case "check":
      return mod.ability ? `${abilityLabel(mod.ability)} checks` : "ability checks";
    case "save":
      return mod.ability ? `${abilityLabel(mod.ability)} saving throws` : "saving throws";
  }
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

function clause(mode: "advantage" | "disadvantage", mods: RollModifier[]): string {
  const ordered = [...mods].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  const phrases = [...new Set(ordered.map(categoryPhrase))];
  const label = mode === "advantage" ? "Advantage" : "Disadvantage";
  return `${label} on ${joinPhrases(phrases)}`;
}

// Signed display for a flat modifier, e.g. "+2" / "−4" (Unicode minus).
function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// Flat-modifier clause (#1136): a single value hitting attack + check + save
// collapses to "−N on d20 Tests" (Initiative is a Dex check, so it's subsumed);
// any narrower coverage lists the categories explicitly. Distinct values (rare)
// each get their own "; "-joined clause.
function flatClause(mods: FlatRollEffect[]): string {
  const byValue = new Map<number, RollModifier["kind"][]>();
  for (const m of mods) {
    const kinds = byValue.get(m.modifier) ?? [];
    if (!kinds.includes(m.kind)) kinds.push(m.kind);
    byValue.set(m.modifier, kinds);
  }
  return [...byValue.entries()]
    .map(([value, kinds]) => {
      const kindSet = new Set(kinds);
      if (kindSet.has("attack") && kindSet.has("check") && kindSet.has("save")) {
        return `${formatSigned(value)} on d20 Tests`;
      }
      const ordered = [...kinds].sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b]);
      const phrases = [...new Set(ordered.map((kind) => categoryPhrase({ kind } as RollModifier)))];
      return `${formatSigned(value)} on ${joinPhrases(phrases)}`;
    })
    .join("; ");
}

/**
 * Collapse the flat `rollModifiers` list into one summary per source, preserving
 * first-appearance order. A source that grants both advantage and disadvantage
 * (rare, but legal) gets both clauses joined with "; " and a `mixed` tone.
 */
export function summarizeRollModifiers(modifiers: RollModifier[]): ConditionRollSummary[] {
  const order: string[] = [];
  const bySource = new Map<string, RollModifier[]>();
  for (const mod of modifiers) {
    const existing = bySource.get(mod.source);
    if (existing) {
      existing.push(mod);
    } else {
      bySource.set(mod.source, [mod]);
      order.push(mod.source);
    }
  }

  return order.map((source) => {
    const mods = bySource.get(source)!;
    const adv = mods.filter((m) => m.mode === "advantage");
    const dis = mods.filter((m) => m.mode === "disadvantage");
    const flat = mods.filter((m): m is RollModifier & FlatRollEffect => m.mode === "flat");
    const clauses: string[] = [];
    if (adv.length) clauses.push(clause("advantage", adv));
    if (dis.length) clauses.push(clause("disadvantage", dis));
    if (flat.length) clauses.push(flatClause(flat));
    const directions = [adv.length > 0, dis.length > 0, flat.length > 0].filter(Boolean).length;
    const tone: ConditionRollSummary["tone"] =
      directions > 1 ? "mixed" : adv.length ? "advantage" : dis.length ? "disadvantage" : "penalty";
    return { source, tone, effect: clauses.join("; ") };
  });
}
