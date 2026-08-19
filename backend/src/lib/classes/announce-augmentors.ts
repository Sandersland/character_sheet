/**
 * Announce-augmentor registry (#1910, epic #1903 decision 2): a feature that
 * augments ANOTHER feature's already-served action (Deflect Attacks' resolved
 * roll spec, Arcane Charge's reminder append) is a descriptor object here,
 * not a bespoke `.map()` bolted onto deriveEntryScopedActions. Adding a new
 * announce-rider is one descriptor file + one line in ANNOUNCE_AUGMENTORS,
 * never a pipeline edit — deriveEntryScopedActions (actions.ts) carries no
 * feature-specific code for any of them.
 *
 * Self-or-announce replaceability (owner, 2026-08-10 — deferred, not never,
 * per #416): a descriptor returns a STRUCTURED payload and never mutates or
 * concatenates onto the action itself — applyAnnounceAugmentors below is the
 * only place that folds a payload onto an action. A future target model
 * attaches at this same registry and consumes the same payload shape.
 *
 * #1912 adds four monk-only descriptors (epic #1903's four R entries):
 * Heightened Focus, Improved Shadow Step, Physician's Touch, Deflect Energy —
 * see ANNOUNCE_AUGMENTORS below for the full six-entry registry.
 */
import type { EffectSpec } from "@/lib/combat/effects.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import type { AvailableAction } from "./actions.js";
import type { SubclassSlug } from "./subclass-slug.js";
import { arcaneChargeAugmentor } from "./arcane-charge.js";
import { deflectAugmentor, deflectEnergyAugmentor } from "@/lib/srd/deflect.js";
import { heightenedFocusAugmentor } from "./heightened-focus.js";
import { improvedShadowStepAugmentor } from "./improved-shadow-step.js";
import { physiciansTouchAugmentor } from "./physicians-touch.js";

/**
 * Per-entry context an augmentor's `appliesTo`/`augment` reads — resolved
 * once per class entry by deriveEntryScopedActions' own per-entry loop,
 * which already has the entry's resolved subclass slug and effective level
 * (the one fold point with both in scope). `abilityMods` is supplied ONLY by
 * buildAvailableActionsView (serialize/classes.ts, which has
 * effectiveScores) — the cast-guard callers (shadow-arts.ts, disciplines.ts,
 * warrior-of-elements.ts) call deriveEntryScopedActions with pools:[] to read
 * gates only, never announce text, and omit it. An augmentor that needs
 * ability modifiers must treat `abilityMods === undefined` as "no-op", never
 * throw or fall back to a default score.
 */
export interface AugmentorContext {
  slug: SubclassSlug | undefined;
  entryLevel: number;
  edition: RulesEdition;
  abilityMods?: Readonly<Record<string, number>>;
}

/**
 * A descriptor's resolved augmentation — folded onto the action by
 * applyAnnounceAugmentors, never applied by the descriptor itself.
 * `reminderAppend` is the text to ADD, not the final combined string; the
 * pipeline owns the "existing ? `${existing} ${addition}` : addition" join.
 */
export type AugmentPayload = {
  reminderAppend?: string;
  count?: number;
  damageTypeClause?: string;
  effect?: EffectSpec;
};

export interface AnnounceAugmentor {
  /** Served action keys this feature may augment — data, greppable. */
  targetKeys: readonly string[];
  /** Gate: subclass slug + entry level + edition (total-mapping per #1527 — no `=== "EDITION_…"`). */
  appliesTo(ctx: AugmentorContext): boolean;
  /** Structured augmentation; null = no change. */
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

/**
 * The ONE fold point (deriveEntryScopedActions, actions.ts): for each
 * registered augmentor whose targetKeys includes this action's key and whose
 * appliesTo(ctx) gate passes, folds the returned payload onto the action —
 * appending reminder text, setting count/damageTypeClause/effect. Descriptors
 * never touch the action directly; this is the only place that happens.
 *
 * `augmentors` defaults to the real ANNOUNCE_AUGMENTORS registry — the
 * production call site never passes it — and exists as a parameter only so
 * announce-augmentors.test.ts can pin the fold semantics against a synthetic
 * augmentor, independent of the two real descriptors' own gates.
 */
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

// Folds one payload onto one action — split out of applyAnnounceAugmentors'
// loop (fallow cognitive-complexity gate) so the loop and the field-by-field
// merge each stay simple on their own.
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
