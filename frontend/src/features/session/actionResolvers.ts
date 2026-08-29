// Mirrors the backend ACTION_EFFECT_FN dispatch table key-for-key; keep the two in sync.

import { abilityModifier } from "@/lib/abilities";
import type { AvailableAction, Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";
import type { ResolutionKind } from "@character-sheet/shared-types";

// Re-exported for existing importers (e.g. useTurnActions.ts). Mirrored on the backend by
// RESOLVER_KIND_VALUES, which `satisfies` the same ResolutionKind — a two-way compile
// latch, not the old prose-only mirror.
export type { ResolutionKind };

// Adding a ResolutionKind member without a matching entry here fails typecheck (mirrors registry.ts's EXTRAS_FIELDS latch), keeping the two from drifting.
const RESOLUTION_KINDS = [
  "attack-picker",
  "twf-picker",
  "flurry-picker",
  "spell-picker",
  "item-picker",
  "heal-roll",
  "heal-input",
  "loadout-picker",
  "simple-confirm",
  "toggle",
  "slot-picker",
] as const satisfies readonly ResolutionKind[];
type _ResolutionKindsCoverResolutionKind = ResolutionKind extends (typeof RESOLUTION_KINDS)[number] ? true : never;
const _resolutionKindsCoverResolutionKind: _ResolutionKindsCoverResolutionKind = true;
void _resolutionKindsCoverResolutionKind;

// Validates a served resolverKind so an unrecognized value behaves like no resolver at all, rather than reaching planActionClick's exhaustive switch with a value outside its union.
function isResolutionKind(kind: string): kind is ResolutionKind {
  return (RESOLUTION_KINDS as readonly string[]).includes(kind);
}

export type SlotCost = "action" | "bonusAction" | "reaction" | "free" | "special";

export interface ActionResolver {
  /** Matches AvailableAction.key and ACTION_EFFECT_FN key in the backend. */
  key: string;
  kind: ResolutionKind;
  slot: SlotCost;
  resourceKey?: string;
  resourceAmount?: number;
  /** Every surviving healRoll scales off an ability modifier, never a level — a level-scaled heal is rolled server-side instead, since the client can't tell which class entry granted the feature for a multiclass character. */
  healRoll?: (character: Character) => RollSpec;
  /** Takes priority over the backend AvailableAction's `reminder` in classActionOption — this action opens a picker, so its rule text belongs on the card, not an on-click toast. */
  subtitle?: string;
  serverEffect: boolean;
}

export const ACTION_RESOLVERS: Record<string, ActionResolver> = {
  attack:            { key: "attack",            kind: "attack-picker",  slot: "action",      serverEffect: false },
  castSpell:         { key: "castSpell",         kind: "spell-picker",   slot: "action",      serverEffect: false },
  castSpellBonus:    { key: "castSpellBonus",    kind: "spell-picker",   slot: "bonusAction", serverEffect: false },
  castSpellReaction: { key: "castSpellReaction", kind: "spell-picker",   slot: "reaction",    serverEffect: false },
  useObject:         { key: "useObject",         kind: "item-picker",    slot: "action",      serverEffect: true  },
  // The picker itself owns the Action economy (a held-item swap spends it; a free-hand draw/stow is free) — no slot is consumed on open and no server effect fires.
  changeWeapons:     { key: "changeWeapons",     kind: "loadout-picker", slot: "action",      serverEffect: false },
  dodge:             { key: "dodge",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  dash:              { key: "dash",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  disengage:         { key: "disengage",         kind: "simple-confirm", slot: "action",      serverEffect: false },
  help:              { key: "help",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  hide:              { key: "hide",              kind: "simple-confirm", slot: "action",      serverEffect: false },
  search:            { key: "search",            kind: "simple-confirm", slot: "action",      serverEffect: false },
  ready:             { key: "ready",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  grapple:           { key: "grapple",           kind: "simple-confirm", slot: "action",      serverEffect: false },
  shove:             { key: "shove",             kind: "simple-confirm", slot: "action",      serverEffect: false },
  opportunityAttack: { key: "opportunityAttack", kind: "attack-picker",  slot: "reaction",    serverEffect: false },
  twf:               { key: "twf",               kind: "twf-picker",     slot: "bonusAction", serverEffect: false },

  // rage/endRage are row-driven via resolverFor's fallback path, not a hand-authored entry here.
  recklessAttack:    { key: "recklessAttack",    kind: "simple-confirm", slot: "free",        serverEffect: false },

  bardicInspiration: { key: "bardicInspiration", kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "bardicInspiration" },

  // One row for both granting classes — the backend merges the two CD rows into one (PHB'14 p.164).
  channelDivinity: { key: "channelDivinity", kind: "simple-confirm", slot: "action", serverEffect: true, resourceKey: "channelDivinity" },

  wildShape:         { key: "wildShape",         kind: "simple-confirm", slot: "action",      serverEffect: true,  resourceKey: "wildShape" },

  // Second Wind / Action Surge are row-driven via resolverFor's fallback path, not hand-authored here; Second Wind's heal is rolled server-side too.

  summonBondedWeapon: { key: "summonBondedWeapon", kind: "simple-confirm", slot: "bonusAction", serverEffect: false },

  bonusUnarmedStrike: { key: "bonusUnarmedStrike", kind: "twf-picker", slot: "bonusAction", serverEffect: false, subtitle: "One Unarmed Strike as a Bonus Action (Dex + Martial Arts die)." },
  // resourceKey here is cosmetic only (badge lookup) — the served AvailableAction carries no resourceKey on the wire, so a 2014 monk's card resolves its spend label from classActionOption's flurrySpendLabel special case instead.
  flurryOfBlows:     { key: "flurryOfBlows",     kind: "flurry-picker",  slot: "bonusAction", serverEffect: true,  resourceKey: "focus", resourceAmount: 1 },
  patientDefense:      { key: "patientDefense",      kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  patientDefenseFocus: { key: "patientDefenseFocus", kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  stepOfTheWind:       { key: "stepOfTheWind",       kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  stepOfTheWindFocus:  { key: "stepOfTheWindFocus",  kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  // 2014 (SRD 5.1) — flat 1-ki, no free variant; distinct keys from the 2024 pair above.
  patientDefenseKi: { key: "patientDefenseKi", kind: "simple-confirm", slot: "bonusAction", serverEffect: true, resourceKey: "ki" },
  stepOfTheWindKi:  { key: "stepOfTheWindKi",  kind: "simple-confirm", slot: "bonusAction", serverEffect: true, resourceKey: "ki" },
  // Stunning Strike has no resolver here — it's a post-hit rider rendered by StunningStrikeSection, not a selectable action.
  // SRD 5.2 L3 — reminder-only reaction; the dynamic 1d10+Dex+level roll is computed by useTurnActions' handleDeflectAttacks, not this generic dispatch.
  deflectAttacks:    { key: "deflectAttacks",    kind: "simple-confirm", slot: "reaction",    serverEffect: false },
  // A "free" decision within the same reaction (not its own slot); spends 1 Focus server-side once a ranged hit is reduced to 0.
  deflectAttacksRedirect: { key: "deflectAttacksRedirect", kind: "simple-confirm", slot: "free", serverEffect: true, resourceKey: "focus" },
  // SRD 5.1 — same reminder-only-reaction shape as deflectAttacks; no bespoke roll math wired yet.
  deflectMissiles:      { key: "deflectMissiles",      kind: "simple-confirm", slot: "reaction", serverEffect: false },
  deflectMissilesThrow: { key: "deflectMissilesThrow", kind: "simple-confirm", slot: "free",     serverEffect: true, resourceKey: "ki" },
  // Cloak of Shadows (L17) is a real cast now, wired through ClassResourceBlocks' shadow-arts transactions, not this reaction-slot registry.
  shadowStep:        { key: "shadowStep",        kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  // Open Hand Technique / Quivering Palm have no resolver here — they're post-hit riders rendered by OpenHandTechniqueSection / QuiveringPalmSection.
  wholenessOfBody: {
    key: "wholenessOfBody",
    kind: "heal-roll",
    slot: "bonusAction",
    serverEffect: true,
    resourceKey: "wholenessOfBody",
    healRoll: (c) => ({ count: 1, faces: c.unarmedStrike.damage.faces, modifier: abilityModifier(c.abilityScores.wisdom) }),
  },
  fleetStep: { key: "fleetStep", kind: "simple-confirm", slot: "free", serverEffect: false },
  // DELIBERATE exception to the healRoll rule above: Wholeness of Body is gated behind a single class+subclass combo (5e forbids taking one class twice), so there's always exactly one unambiguous monk level to read — count:0 rolls no dice, leaving the modifier (3 x monk level) as the entire total.
  wholenessOfBodyAction: {
    key: "wholenessOfBodyAction",
    kind: "heal-roll",
    slot: "action",
    serverEffect: true,
    resourceKey: "wholenessOfBody",
    healRoll: (c) => {
      const monkLevel = c.classes?.find((cls) => cls.name.toLowerCase() === "monk")?.level ?? 0;
      return { count: 0, faces: 1, modifier: 3 * monkLevel };
    },
  },
  tranquility: { key: "tranquility", kind: "simple-confirm", slot: "free", serverEffect: false },
  // Hand of Harm / Hand of Ultimate Mercy have no resolver here — they're their own dedicated verticals, like Stunning Strike / Quivering Palm.
  handOfHealing: {
    key: "handOfHealing",
    kind: "heal-roll",
    slot: "action",
    serverEffect: true,
    resourceKey: "focus",
    healRoll: (c) => ({ count: 1, faces: c.unarmedStrike.damage.faces, modifier: abilityModifier(c.abilityScores.wisdom) }),
  },
  // No resourceKey: the Flurry-replacement variant heals for free since flurryOfBlows already paid the Focus.
  handOfHealingFlurry: {
    key: "handOfHealingFlurry",
    kind: "heal-roll",
    slot: "bonusAction",
    serverEffect: true,
    healRoll: (c) => ({ count: 1, faces: c.unarmedStrike.damage.faces, modifier: abilityModifier(c.abilityScores.wisdom) }),
  },

  divineSense:       { key: "divineSense",       kind: "simple-confirm", slot: "action",      serverEffect: true,  resourceKey: "divineSense" },
  layOnHands:        { key: "layOnHands",        kind: "heal-input",     slot: "action",      serverEffect: true,  resourceKey: "layOnHands" },

  cunningAction:     { key: "cunningAction",     kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  // Without this row, partitionClassActions filters fastHands out entirely; it shares the same bonus action as Cunning Action (correct to consume once per click, not a double-spend bug).
  fastHands:         { key: "fastHands",         kind: "simple-confirm", slot: "bonusAction", serverEffect: false },

  metamagic:         { key: "metamagic",         kind: "simple-confirm", slot: "free",        serverEffect: true,  resourceKey: "sorceryPoints" },
};

// resourceKey: action.key is a scoped assumption valid only for Second Wind/Action Surge (a Fighter action's key is its own pool key) — several ACTION_RESOLVERS entries like flurryOfBlows/metamagic spend a different pool than their key.
// healRoll is deliberately absent — Second Wind's heal is rolled server-side and reported via ExecuteActionResult; classActionOption falls back to the served action.reminder as the subtitle when healRoll is unset.
function resolverFromRow(action: AvailableAction, kind: ResolutionKind): ActionResolver {
  return {
    key: action.key,
    kind,
    slot: action.cost,
    serverEffect: true,
    resourceKey: action.key,
  };
}

export function resolverFor(key: string, action?: AvailableAction): ActionResolver | undefined {
  const known = ACTION_RESOLVERS[key];
  if (known) return known;
  if (!action?.resolverKind || !isResolutionKind(action.resolverKind)) return undefined;
  return resolverFromRow(action, action.resolverKind);
}

// Used by tests to assert parity with the backend ACTION_EFFECT_FN table.
export const SERVER_EFFECT_KEYS = Object.values(ACTION_RESOLVERS)
  .filter((r) => r.serverEffect)
  .map((r) => r.key);
