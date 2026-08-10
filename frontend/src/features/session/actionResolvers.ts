/**
 * Frontend action-resolver registry.
 *
 * Mirrors the backend ACTION_EFFECT_FN dispatch table key-for-key. Each entry
 * describes:
 *   - Which inline tool to render when the player picks this action (kind).
 *   - Which economy slot it consumes (slot).
 *   - Whether the action fires applyActionTransactions server-side (serverEffect).
 *   - Optional resource spend metadata (resourceKey/resourceAmount) used by
 *     the TurnHub orchestrator to pass the right ops.
 *   - healRoll: a function producing the dice spec for fixed-dice self-heals
 *     (Second Wind). healInput: true for Lay on Hands (numeric pool draw, no die).
 *
 * Adding a new action = one row here + the matching ACTION_EFFECT_FN entry.
 * ⚑ Keep in sync with the backend ACTION_EFFECT_FN table.
 */

import { abilityModifier } from "@/lib/abilities";
import type { AvailableAction, Character } from "@/types/character";
import type { RollSpec } from "@/lib/dice";

/**
 * What inline tool the TurnHub renders when this action is selected.
 *  attack-picker  — equipped weapons + Unarmed + Improvised, with Attack/Damage rolls.
 *  flurry-picker  — Unarmed Strike only, no weapon choice (2024 Flurry of Blows, #1217).
 *  spell-picker   — prepared/known spells, slot-gated cast surface.
 *  item-picker    — consumable inventory items with heal rolls.
 *  heal-roll      — single self-heal dice roll (Second Wind: 1d10+level).
 *  heal-input     — numeric pool draw (Lay on Hands: choose amount up to pool).
 *  loadout-picker — per-hand weapon-swap picker (a held swap costs the Action).
 *  simple-confirm — no tool; just consume the slot (Dodge, Dash, etc.).
 *  toggle         — same send shape as simple-confirm, served for a
 *                   row-declared while-active buff's activate/end pair
 *                   (#1686, e.g. Rage/End Rage) — a distinct kind (not
 *                   simple-confirm) only because it's the row-served value
 *                   `resolverFromRow` receives, not a hand-authored one.
 *  slot-picker    — the player picks a spell-slot level to expend on a
 *                   `{costKind:"slot"}` row-driven ability (#1687's UI,
 *                   deferred to its first real consumer, Bladesinger's Song
 *                   of Defense, #1676); commits at use-time like heal-input,
 *                   sending the chosen level as `slotLevel`.
 */
export type ResolutionKind =
  | "attack-picker"
  | "twf-picker"
  | "flurry-picker"
  | "spell-picker"
  | "item-picker"
  | "heal-roll"
  | "heal-input"
  | "loadout-picker"
  | "simple-confirm"
  | "toggle"
  | "slot-picker";

// Runtime membership list for ResolutionKind, used only to validate a
// row-served `AvailableAction.resolverKind` string (isResolutionKind below) —
// the type itself stays the documented union above. A ResolutionKind added to
// the union without a matching entry here fails typecheck (mirrors registry.ts's
// EXTRAS_FIELDS latch), which is what keeps the two from silently drifting.
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

/**
 * Type guard for a served `resolverKind` string (#1528). Without this,
 * `resolverFromRow` used to do a bare `as ResolutionKind` cast behind only a
 * truthiness check — any non-empty string passed, `partitionClassActions` kept
 * the action, and `planActionClick`'s switch (exhaustive only at compile time
 * over the real union) fell through with no runtime default, returning
 * `undefined` and crashing `useTurnActions` on click. Validating here makes an
 * unknown kind behave like "no resolver at all" (filtered out by
 * `partitionClassActions`), never a silent runtime type violation.
 */
function isResolutionKind(kind: string): kind is ResolutionKind {
  return (RESOLUTION_KINDS as readonly string[]).includes(kind);
}

export type SlotCost = "action" | "bonusAction" | "reaction" | "free" | "special";

export interface ActionResolver {
  /** Matches AvailableAction.key and ACTION_EFFECT_FN key in the backend. */
  key: string;
  kind: ResolutionKind;
  slot: SlotCost;
  /** Resource pool key spent server-side (omit for slot-only / no-server-effect actions). */
  resourceKey?: string;
  /** Number of pool units spent (default 1). */
  resourceAmount?: number;
  /**
   * For heal-roll kind: produces the dice spec to roll for the heal total.
   * e.g. Hand of Healing → Martial Arts die + Wisdom modifier. Every surviving
   * user scales off an ability modifier, never a level — a level-scaled heal
   * (Second Wind's `1d10 + Fighter level`) is server-rolled off its
   * ClassFeature row instead, precisely because the client cannot see which
   * class entry granted the feature and a multiclass character's total level
   * is the wrong number.
   */
  healRoll?: (character: Character) => RollSpec;
  /**
   * Static option-card subtitle for economy-only actions with fixed rule text
   * (Bonus Unarmed Strike). Takes priority over the backend AvailableAction's
   * `reminder` in classActionOption — unlike Shadow Step/Opportunist, this
   * action opens a picker, so its rule text belongs on the card, not an
   * on-click toast (which `reminder` would also trigger).
   */
  subtitle?: string;
  /**
   * Whether this resolver fires applyActionTransactions after resolution.
   * false = ephemeral only (attack economy bookkeeping, Dodge, Reckless Attack).
   * true  = hits the backend to spend resources / heal / consume items.
   */
  serverEffect: boolean;
}

export const ACTION_RESOLVERS: Record<string, ActionResolver> = {
  attack:            { key: "attack",            kind: "attack-picker",  slot: "action",      serverEffect: false },
  castSpell:         { key: "castSpell",         kind: "spell-picker",   slot: "action",      serverEffect: false },
  castSpellBonus:    { key: "castSpellBonus",    kind: "spell-picker",   slot: "bonusAction", serverEffect: false },
  castSpellReaction: { key: "castSpellReaction", kind: "spell-picker",   slot: "reaction",    serverEffect: false },
  useObject:         { key: "useObject",         kind: "item-picker",    slot: "action",      serverEffect: true  },
  // Mid-turn weapon change (#815) — the picker itself owns the Action economy
  // (a held-item swap spends it; a free-hand draw/stow is free), so no slot is
  // consumed on open and no server executeAction fires.
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
  // Two-Weapon Fighting off-hand bonus attack (#732) — economy-only, like `attack`.
  twf:               { key: "twf",               kind: "twf-picker",     slot: "bonusAction", serverEffect: false },

  // rage/endRage retired from this table (#1686): row-driven now (a "toggle"
  // resolverKind ClassFeature row), served via AvailableAction.resolverKind —
  // resolverFor's fallback path (below) synthesizes the resolver from the
  // wire instead of a hand-authored entry here, same as Second Wind/Action
  // Surge's own #1528 retirement.
  recklessAttack:    { key: "recklessAttack",    kind: "simple-confirm", slot: "free",        serverEffect: false },

  bardicInspiration: { key: "bardicInspiration", kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "bardicInspiration" },

  // One row for both granting classes — the backend merged the two CD rows
  // into one, PHB'14 p.164 (#1340).
  channelDivinity: { key: "channelDivinity", kind: "simple-confirm", slot: "action", serverEffect: true, resourceKey: "channelDivinity" },

  wildShape:         { key: "wildShape",         kind: "simple-confirm", slot: "action",      serverEffect: true,  resourceKey: "wildShape" },

  // Second Wind / Action Surge retired from this table (#1528): both are
  // row-driven now, served via AvailableAction.resolverKind — resolverFor's
  // fallback path (below) synthesizes their ActionResolver from the wire
  // instead of a hand-authored entry here. Second Wind's heal is also
  // server-rolled now (was client `healRoll`, #1528) — see resolverFromRow.

  // Eldritch Knight Weapon Bond (2014, #1854) — narrated only, like
  // recklessAttack: bonding/unbonding a weapon is its own separate flow
  // (the inventory row's Bond toggle), not this action. Summoning just
  // consumes the bonus action; `enabled` (server-computed from the bonded
  // count) already gates whether the option is clickable.
  summonBondedWeapon: { key: "summonBondedWeapon", kind: "simple-confirm", slot: "bonusAction", serverEffect: false },

  // Martial Arts Bonus Unarmed Strike (#1218) — reuses the twf-picker economy
  // path (single bonusAction-source swing), locked to the Unarmed Strike
  // profile. Gated server-side by requiresUnarmored, not a resource pool.
  bonusUnarmedStrike: { key: "bonusUnarmedStrike", kind: "twf-picker", slot: "bonusAction", serverEffect: false, subtitle: "One Unarmed Strike as a Bonus Action (Dex + Martial Arts die)." },
  // Dispatched via its own handleFlurryAction (like twf), not planActionClick —
  // Flurry is Unarmed Strikes only (both editions, #1217/#1500), so it never
  // opens the weapon picker. `resourceKey: "focus"` is cosmetic ONLY (the
  // pool-badge lookup in turnOptions.ts poolBadgeFor) — the served
  // AvailableAction carries no resourceKey on the wire, so this static table
  // can't fork per edition; a 2014 monk's card falls back to
  // classActionOption's flurrySpendLabel special case instead, which checks
  // both "focus" and "ki" directly against the character's own pools.
  flurryOfBlows:     { key: "flurryOfBlows",     kind: "flurry-picker",  slot: "bonusAction", serverEffect: true,  resourceKey: "focus", resourceAmount: 1 },
  // Patient Defense / Step of the Wind — 2024 free vs 1-Focus variants (#1240),
  // each its own menu entry (mirrors rage/endRage). The free entries are
  // economy-only, like Shadow Step: no backend ACTION_EFFECT_FN, so
  // serverEffect:false and no resourceKey.
  patientDefense:      { key: "patientDefense",      kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  patientDefenseFocus: { key: "patientDefenseFocus", kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  stepOfTheWind:       { key: "stepOfTheWind",       kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  stepOfTheWindFocus:  { key: "stepOfTheWindFocus",  kind: "simple-confirm", slot: "bonusAction", serverEffect: true,  resourceKey: "focus" },
  // 2014 (SRD 5.1, #1500) — ONE row apiece (flat 1-ki, no free variant),
  // distinct keys from the 2024 pair above (see actions.ts's own comment on
  // why patientDefense/stepOfTheWind can't be reused).
  patientDefenseKi: { key: "patientDefenseKi", kind: "simple-confirm", slot: "bonusAction", serverEffect: true, resourceKey: "ki" },
  stepOfTheWindKi:  { key: "stepOfTheWindKi",  kind: "simple-confirm", slot: "bonusAction", serverEffect: true, resourceKey: "ki" },
  // Stunning Strike (L5) has no resolver here — it's a post-hit rider rendered
  // by StunningStrikeSection (mirrors SneakAttackSection), not a selectable
  // action (#1242 supersedes the #392 bare-spend stub formerly here).
  // Deflect Attacks (#1241, SRD 5.2 L3) — reminder-only reaction like shadowStep
  // below; the dynamic 1d10+Dex+level roll is computed by useTurnActions'
  // bespoke handleDeflectAttacks, not this generic dispatch.
  deflectAttacks:    { key: "deflectAttacks",    kind: "simple-confirm", slot: "reaction",    serverEffect: false },
  // Redirect rider — a "free" decision within the same reaction (not its own
  // slot), spending 1 Focus server-side once a ranged hit is reduced to 0.
  deflectAttacksRedirect: { key: "deflectAttacksRedirect", kind: "simple-confirm", slot: "free", serverEffect: true, resourceKey: "focus" },
  // 2014 (SRD 5.1, #1500) — Deflect Missiles: same reminder-only-reaction
  // shape as deflectAttacks (no bespoke roll math wired yet — #1501-#1503
  // follow-up), and its throw-back mirrors deflectAttacksRedirect's shape.
  deflectMissiles:      { key: "deflectMissiles",      kind: "simple-confirm", slot: "reaction", serverEffect: false },
  deflectMissilesThrow: { key: "deflectMissilesThrow", kind: "simple-confirm", slot: "free",     serverEffect: true, resourceKey: "ki" },
  // Warrior of Shadow reminder action (2024 rewrite, #1246) — economy-only, like
  // twf; no backend effect fn. Opportunist (2014 L17) is retired — Cloak of
  // Shadows (L17) is a real cast now, wired through ClassResourceBlocks'
  // shadow-arts transactions, not this reaction-slot registry.
  shadowStep:        { key: "shadowStep",        kind: "simple-confirm", slot: "bonusAction", serverEffect: false },
  // Warrior of the Open Hand (#1245): Open Hand Technique / Quivering Palm have
  // no resolver here — they're post-hit riders rendered by their own sections
  // (OpenHandTechniqueSection / QuiveringPalmSection), mirroring how Stunning
  // Strike bypasses this registry (#1242). Wholeness of Body reuses the
  // heal-roll kind (Second Wind's shape): Martial Arts die + Wis modifier.
  wholenessOfBody: {
    key: "wholenessOfBody",
    kind: "heal-roll",
    slot: "bonusAction",
    serverEffect: true,
    resourceKey: "wholenessOfBody",
    healRoll: (c) => ({ count: 1, faces: c.unarmedStrike.damage.faces, modifier: abilityModifier(c.abilityScores.wisdom) }),
  },
  // Fleet Step (L11) is a pure reminder (cost:"free", no server effect), like
  // Reckless Attack/Metamagic — see the DERIVED_ACTIONS comment in actions.ts.
  fleetStep: { key: "fleetStep", kind: "simple-confirm", slot: "free", serverEffect: false },
  // Way of the Open Hand's 2014 Wholeness of Body (#1501) — SRD 5.1's shape
  // is a flat "3 x monk level" heal with NO die roll at all (unlike 2024's
  // Martial Arts die + Wis mod above), so it needs its own key AND its own
  // healRoll: `{ count: 0, ... }` rolls zero dice (rollSpec sums an empty
  // array), leaving the modifier as the entire total — exactly 3 x monk
  // level, deterministic. This is a DELIBERATE, narrow exception to this
  // file's own "every surviving healRoll user scales off an ability
  // modifier, never a level" doc comment above (which exists because the
  // client can't generally see which class entry granted a feature for a
  // multiclass character): Wholeness of Body is gated behind the Way of the
  // Open Hand SUBCLASS, and 5e forbids taking one class twice, so there is
  // always exactly one unambiguous "the monk entry" to read `.level` from —
  // the same guarantee openHandMonkEntry relies on server-side.
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
  // Tranquility (L11, #1501) — gained passively at the end of a long rest;
  // no die roll, no resource spend, just the reminder text.
  tranquility: { key: "tranquility", kind: "simple-confirm", slot: "free", serverEffect: false },
  // Warrior of Mercy (#1248): Hand of Harm / Hand of Ultimate Mercy have no
  // resolver here — they're their own dedicated verticals (mirrors Stunning
  // Strike / Quivering Palm's bypass above). Hand of Healing reuses Wholeness
  // of Body's heal-roll shape (Martial Arts die + Wis mod); the Flurry-
  // replacement variant heals the same but spends no Focus of its own
  // (Flurry's own flurryOfBlows action already paid it).
  handOfHealing: {
    key: "handOfHealing",
    kind: "heal-roll",
    slot: "action",
    serverEffect: true,
    resourceKey: "focus",
    healRoll: (c) => ({ count: 1, faces: c.unarmedStrike.damage.faces, modifier: abilityModifier(c.abilityScores.wisdom) }),
  },
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
  // Thief's Fast Hands (#1431) — economy-only, like the Patient Defense / Step
  // of the Wind free variants: no backend ACTION_EFFECT_FN entry, so
  // serverEffect:false and no resourceKey. Without a row here
  // partitionClassActions filters the backend's fastHands out and no card
  // renders at all. It spends the SAME Bonus Action as Cunning Action (both
  // editions), which the backend reminder says — the economy model has no way
  // to express two cards sharing one slot, and consuming the bonus action once
  // per click is already the correct accounting.
  fastHands:         { key: "fastHands",         kind: "simple-confirm", slot: "bonusAction", serverEffect: false },

  metamagic:         { key: "metamagic",         kind: "simple-confirm", slot: "free",        serverEffect: true,  resourceKey: "sorceryPoints" },
};

// A row-driven action's resolver, synthesized from the wire (#1528) — the
// ONLY fallback path resolverFor falls to, and ONLY when no keyed entry
// above exists. `resourceKey: action.key` is a scoped assumption (true for
// Second Wind/Action Surge, the only two rows populating `resolverKind`
// today, since a Fighter action's key IS its own pool key) — never assumed
// for the keyed ACTION_RESOLVERS table above, several of whose entries
// (flurryOfBlows, metamagic, …) spend a DIFFERENT pool than their own key.
// `healRoll` is deliberately absent: Second Wind's heal is now rolled
// server-side (`effectModifierSource: "classLevel"`, backend/effects.ts) and
// reported back via ExecuteActionResult, not computed here — the served
// `action.reminder` (built server-side from the same row) is the subtitle
// classActionOption falls back to when `healRoll` is unset.
function resolverFromRow(action: AvailableAction, kind: ResolutionKind): ActionResolver {
  return {
    key: action.key,
    kind,
    slot: action.cost,
    serverEffect: true,
    resourceKey: action.key,
  };
}

/**
 * Returns the resolver for the given action key, or undefined if
 * unrecognized. `action` is optional context for the fallback path (#1528):
 * when no keyed ACTION_RESOLVERS entry exists but the served action carries
 * a `resolverKind` that names a real ResolutionKind, one is synthesized from
 * the wire instead of a hand-authored entry. A served `resolverKind` that
 * doesn't match any ResolutionKind (unknown class feature retab, server/client
 * skew) falls through to `undefined` here — same as no resolver at all — rather
 * than reaching `planActionClick`'s switch with a value outside its exhaustive
 * union. Every existing call site keeps working key-only (undefined action).
 */
export function resolverFor(key: string, action?: AvailableAction): ActionResolver | undefined {
  const known = ACTION_RESOLVERS[key];
  if (known) return known;
  if (!action?.resolverKind || !isResolutionKind(action.resolverKind)) return undefined;
  return resolverFromRow(action, action.resolverKind);
}

/**
 * Keys of every resolver that fires a server effect.
 * Used by tests to assert parity with the backend ACTION_EFFECT_FN table.
 */
export const SERVER_EFFECT_KEYS = Object.values(ACTION_RESOLVERS)
  .filter((r) => r.serverEffect)
  .map((r) => r.key);
