// Adding a new announce-rider: one descriptor file + one entry in ANNOUNCE_AUGMENTORS; applyAnnounceAugmentors is the only place that folds a payload on.
import type { EffectSpec } from "@/lib/combat/effects.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AvailableAction } from "./actions.js";
import type { SubclassSlug } from "./subclass-slug.js";
import { arcaneChargeAugmentor } from "./arcane-charge.js";
import { deflectAugmentor, deflectEnergyAugmentor } from "@/lib/srd/deflect.js";
import { heightenedFocusAugmentor } from "./heightened-focus.js";
import { improvedShadowStepAugmentor } from "./improved-shadow-step.js";
import { physiciansTouchAugmentor } from "./physicians-touch.js";

// `abilityMods` may be undefined (gate-only callers pass pools: []); an augmentor needing it must treat that as no-op, never throw or default the score.
export interface AugmentorContext {
  slug: SubclassSlug | undefined;
  entryLevel: number;
  edition: RulesEdition;
  abilityMods?: Readonly<Record<string, number>>;
}

// `reminderAppend` is text to ADD, not the final string — the pipeline owns the join.
export type AugmentPayload = {
  reminderAppend?: string;
  count?: number;
  damageTypeClause?: string;
  effect?: EffectSpec;
};

export interface AnnounceAugmentor {
  targetKeys: readonly string[];
  // Total-mapping per #1527 — never `=== "EDITION_…"`.
  appliesTo(ctx: AugmentorContext): boolean;
  augment(action: AvailableAction, ctx: AugmentorContext): AugmentPayload | null;
}

export const ANNOUNCE_AUGMENTORS: readonly AnnounceAugmentor[] = [
  deflectAugmentor,
  arcaneChargeAugmentor,
  deflectEnergyAugmentor,
  heightenedFocusAugmentor,
  improvedShadowStepAugmentor,
  physiciansTouchAugmentor,
];

export function applyAnnounceAugmentors(
  action: AvailableAction,
  ctx: AugmentorContext,
  augmentors: readonly AnnounceAugmentor[] = ANNOUNCE_AUGMENTORS,
): AvailableAction {
  let result = action;
  for (const augmentor of augmentors) {
    if (!augmentor.targetKeys.includes(result.key)) continue;
    if (!augmentor.appliesTo(ctx)) continue;
    const payload = augmentor.augment(result, ctx);
    if (payload) result = foldPayload(result, payload);
  }
  return result;
}

function foldPayload(action: AvailableAction, payload: AugmentPayload): AvailableAction {
  const next = { ...action };
  if (payload.reminderAppend) {
    next.reminder = next.reminder ? `${next.reminder} ${payload.reminderAppend}` : payload.reminderAppend;
  }
  if (payload.count !== undefined) next.count = payload.count;
  if (payload.damageTypeClause !== undefined) next.damageTypeClause = payload.damageTypeClause;
  if (payload.effect !== undefined) next.effect = payload.effect;
  return next;
}
