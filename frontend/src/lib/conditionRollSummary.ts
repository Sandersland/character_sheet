// Turns the character's derived rollModifiers (see backend buildRollModifiers) into one plain-English line per source; resolveRollMode still resolves the mode per roll.

import { abilityLabel } from "@/lib/abilities";
import type { FlatRollEffect, RollModifier } from "@/types/character";

export interface ConditionRollSummary {
  source: string;
  /** `mixed` when a source grants more than one direction; `penalty` for a flat modifier. */
  tone: "advantage" | "disadvantage" | "mixed" | "penalty";
  effect: string;
}

// Fixed order (attack → check → save → initiative) matching the PHB phrasing "Disadvantage on attack rolls and ability checks".
const KIND_ORDER: Record<RollModifier["kind"], number> = {
  attack: 0,
  check: 1,
  save: 2,
  initiative: 3,
};

// Takes just kind/ability, not a full RollModifier, so flat entries can be phrased without a lossy cast.
function categoryPhrase(mod: { kind: RollModifier["kind"]; ability?: string }): string {
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

// Uses a Unicode minus, not a hyphen, for negative values.
function formatSigned(n: number): string {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

// The collapse to "d20 Tests" (SRD 5.2) fires only when all four are covered, so a future attack+check+save-only modifier lists its categories instead of silently claiming Initiative too.
const ALL_D20_KINDS: RollModifier["kind"][] = ["attack", "check", "save", "initiative"];

// Grouped as full entries, not bare kinds, so an ability-scoped flat modifier still names its ability; distinct values (rare) each get a "; "-joined clause.
function flatClause(mods: FlatRollEffect[]): string {
  const byValue = new Map<number, FlatRollEffect[]>();
  for (const m of mods) {
    const entries = byValue.get(m.modifier) ?? [];
    entries.push(m);
    byValue.set(m.modifier, entries);
  }
  return [...byValue.entries()]
    .map(([value, entries]) => {
      const kindSet = new Set(entries.map((e) => e.kind));
      if (ALL_D20_KINDS.every((k) => kindSet.has(k))) {
        return `${formatSigned(value)} on d20 Tests`;
      }
      const ordered = [...entries].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
      const phrases = [...new Set(ordered.map(categoryPhrase))];
      return `${formatSigned(value)} on ${joinPhrases(phrases)}`;
    })
    .join("; ");
}

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
