// Pure presenter for the ConditionRollBanner (#984). Turns the character's
// derived `rollModifiers` (condition/exhaustion/buff-sourced advantage &
// disadvantage grants — see backend buildRollModifiers) into ONE plain-English
// line per source, e.g. "Poisoned → Disadvantage on attack rolls and ability
// checks". This is the single home for the "why" the sheet used to stamp under
// every ability box and all 18 skill rows; `lib/rollMode.ts` still resolves the
// mode per roll (unchanged). No JSX here — the banner component consumes this.

import { abilityLabel } from "@/lib/abilities";
import type { RollModifier } from "@/types/character";

/** One roll-modifying state, summarized for the banner. */
export interface ConditionRollSummary {
  /** Provenance label, e.g. "Poisoned", "Rage", "Exhaustion". */
  source: string;
  /** Overall tone — a source is `mixed` only if it grants both directions. */
  tone: "advantage" | "disadvantage" | "mixed";
  /** e.g. "Disadvantage on attack rolls and ability checks". */
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
    const clauses: string[] = [];
    if (adv.length) clauses.push(clause("advantage", adv));
    if (dis.length) clauses.push(clause("disadvantage", dis));
    const tone: ConditionRollSummary["tone"] =
      adv.length && dis.length ? "mixed" : adv.length ? "advantage" : "disadvantage";
    return { source, tone, effect: clauses.join("; ") };
  });
}
