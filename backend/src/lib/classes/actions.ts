/**
 * Action catalog: derive-at-read + effect dispatch table.
 *
 * Two concerns live here:
 *
 * 1. `DERIVED_ACTIONS` + `deriveActions` — hardcoded TS list of all known
 *    actions and a pure derive function that filters it for a character's
 *    class/level/subclass, cross-referencing derived resource pools to set
 *    `enabled`. Called from `serializeCharacter` — sync, no DB access. Mirrors
 *    the CLASS_RESOURCE_FN / deriveResources pattern from class-features.ts.
 *
 * 2. `ACTION_EFFECT_FN` — hardcoded TS dispatch table keyed by action `key`.
 *    Returns existing op types (spendResource, adjustQuantity, heal, tempHp,
 *    applyBuff, clearBuff) for the Phase-C orchestrator endpoint (POST
 *    /actions/transactions). This is the `CLASS_RESOURCE_FN` analog — no
 *    interpreted JSON engine.
 *
 * Adding a new mechanical action:
 *   • Append the entry to DERIVED_ACTIONS here (for serializeCharacter).
 *   • Add the effect fn to ACTION_EFFECT_FN (for the POST orchestrator).
 *   No migration needed for new actions; only new *columns* need one.
 *   (ACTIONS' `universal: true` rows ARE consumed since #1430 — referenceRouter
 *   serves them per edition — but its CLASS rows still are not: DERIVED_ACTIONS
 *   here is the single source for those, because they carry gates, reminder
 *   functions and effect dispatch that no seed column can express. #1315 found
 *   the seed array had already drifted out of sync on 6 pre-existing rows before
 *   this file added 4 more, without anything breaking; #1431 closes that drift.)
 *
 * 3. Row-driven actions (`actionsFromRows` + `castSpecFromRow`, #1528) — a
 *    `ClassFeature` row whose `activationCost` column is populated becomes an
 *    `AvailableAction` directly, no `DERIVED_ACTIONS` entry needed; casting one
 *    with an `effectKind` set routes through `castAbilityInTx` the same way the
 *    (retired) `ACTION_CAST_FN` table used to — the difference is the die is
 *    now rolled HERE, server-side, from the row's effect columns
 *    (`castManeuver`, maneuvers.ts, is the server-roll precedent), not supplied
 *    by the client. A row with no `effectKind` (Action Surge — a pure counter,
 *    the extra-action grant is client-side) spends its pool directly instead.
 *    Today only Fighter's rows populate `activationCost`; every other class
 *    still goes through `DERIVED_ACTIONS`/`ACTION_EFFECT_FN` until its own
 *    wave-2 retab (#1134).
 */

import type { RulesEdition } from "@character-sheet/shared-types";

import type { ActiveBuff } from "@/lib/combat/active-effects.js";
import { readAbilityCost, type AbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { readEffectSpec, resolveEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { resolveSubclassSlug, type SubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";
import { effectBuffsFromRow, type ClassFeatureRow, type ClassFeatureRowsCarrier, type ResourceTotalContext } from "./class-feature-rows.js";

export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

// An op referencing an actionKey in neither dispatch table. status → the 400 the
// central `errorHandler` maps, so the actions route needs no try/catch.
export class UnknownActionError extends Error {
  status = 400;
}

// rageMeleeDamageBonus retired (#1686) — the +2/+3/+4 progression now lives
// as a tiered `modifier` on Rage's own effectBuffs entry
// (barbarian-features.ts), evaluated by evaluateBuffModifier
// (class-feature-rows.ts) instead of a hardcoded closure here.

/** One class/level gate: this class grants the row from this class level up. */
interface ActionClassGate {
  className: string; // lowercase
  minLevel: number;
}

/** Record in the DERIVED_ACTIONS table — mirrors the Prisma Action model but is pure TS. */
interface DerivedActionRecord {
  key: string;
  name: string;
  cost: ActionCost;
  universal?: boolean;
  /**
   * Absent means valid in both editions (the default — mirrors
   * `AuthoredFeature.edition`, #1374/#1499; DERIVED_ACTIONS stays hand-rolled
   * TS, so it keeps the "optional = both editions" shape `DerivedFeature`
   * itself moved off of when #1524 switched feature TEXT to seeded rows). A
   * row whose mechanics genuinely differ between PHB'14 and PHB'24 is tagged
   * for the edition it describes; `matchesActionGate` filters on it the same
   * way `featuresFromRows` filters `ClassFeature` rows
   * (lib/classes/class-feature-rows.ts) — the one place THAT rule lives. A
   * blanket tagging pass is not wanted: only a row whose 2014 shape doesn't
   * exist or differs enough to need its own row gets tagged (see the seven
   * monk rows below); most rows (e.g. Second Wind, Rage) are edition-invariant.
   */
  edition?: RulesEdition;
  grantClass?: string;   // lowercase class name
  grantLevel?: number;   // min level for this action
  /**
   * Class/level gates for a row TWO classes grant as ONE feature — matched when
   * ANY gate matches. Channel Divinity is the case: cleric 2 and paladin 3 both
   * grant it, and PHB'14 p.164 makes it one feature drawing on one pool, so it
   * must be one row (deriveEntryScopedActions dedupes by key ⇒ one card).
   * Mutually exclusive with grantClass/grantLevel; both normalize through
   * classGatesOf so matchesActionGate keeps a single class-gate code path.
   */
  grantClasses?: ActionClassGate[];
  /**
   * Accepted subclass slugs (#1277) — resolved via resolveSubclassSlug (FK
   * preferred, exact normalized name as fallback), never a substring. A list
   * so one row can serve two slugs when the mechanics genuinely are shared.
   * Was `grantSubclasses?: string[]` matched by exact display name (#1339,
   * which fixed this ONE gate's substring bleed — a 2014 "Way of Shadow" monk
   * inheriting 2024 "Warrior of Shadow" mechanics, #1322/#1331); #1277
   * generalizes the same discipline to the other six substring sites
   * (isWarriorOfTheOpenHand, isWarriorOfMercy, openHandMonkEntry,
   * attacksForClass) via the shared slug vocabulary instead of a second
   * exact-name table. matchesSubclassGate is still the one normalization
   * matchesActionGate goes through per axis.
   */
  grantSubclassSlugs?: SubclassSlug[];
  resourceKey?: string;  // pool key to check for `enabled`
  resourceAmount?: number; // pool units required
  // In-play rule text for no-server-effect reminder actions. A function form
  // (Heightened Focus, monk L10, #1244) lets patientDefenseFocus/
  // stepOfTheWindFocus swap in their L10 rider text without a second row.
  reminder?: string | ((level: number) => string);
  // Martial Arts' blanket condition (Bonus Unarmed Strike, #1218): gates on
  // `unarmoredUnshielded` instead of/alongside a resource pool. Generic so any
  // future Martial-Arts-conditioned action can reuse the same gate.
  requiresUnarmored?: boolean;
  /**
   * Universal action keys this class feature RE-COSTS rather than shadows
   * (#1431) — Cunning Action buys Dash/Disengage/Hide for a Bonus Action. Pure
   * display + provenance: it gates nothing, consumes nothing extra, and the
   * served universal rows keep their own `cost: "action"` (they are never
   * rewritten per character).
   *
   * Keys, never names: the name forks per edition (Use an Object / Utilize),
   * so only the row referenceRouter serves for THIS character's edition can
   * name it. REGRANTED_UNIVERSAL_KEYS is the drift gate that every key here
   * still resolves to a seeded `universal: true`, `cost: "action"` row.
   */
  regrants?: readonly string[];
}

// The row's class/level gate as a list — the one normalization both the legacy
// grantClass/grantLevel shape and the grantClasses shape resolve through, so
// matchesActionGate/actionGrantLevel each keep a single class-gate code path.
function classGatesOf(a: DerivedActionRecord): ActionClassGate[] {
  return a.grantClasses ?? [{ className: a.grantClass ?? "", minLevel: a.grantLevel ?? 0 }];
}

function matchesClassGate(gate: ActionClassGate, cls: string, level: number): boolean {
  if (gate.className && gate.className.toLowerCase() !== cls) return false;
  return level >= gate.minLevel;
}

// Slug equality against the row's accepted slugs; an ungated row matches
// every subclass (including `undefined` — a homebrew/off-catalog subclass).
// `slug` arrives already resolved (FK-or-name, never substring) — the
// resolution happens per class entry in deriveEntryScopedActions, which is the
// only caller that has the entry's subclassRef in scope.
function matchesSubclassGate(a: DerivedActionRecord, slug: SubclassSlug | undefined): boolean {
  if (!a.grantSubclassSlugs) return true;
  return slug !== undefined && a.grantSubclassSlugs.includes(slug);
}

/** Available action shape serialized onto the character. */
export interface AvailableAction {
  key: string;
  name: string;
  cost: ActionCost;
  /** True when the character has enough resources to use this action right now. */
  enabled: boolean;
  /** Human-readable reason the action is disabled, if `enabled` is false. */
  disabledReason?: string;
  /** In-play rule text surfaced as the card subtitle + on-use reminder. */
  reminder?: string;
  /** Universal action keys this row re-costs — see DerivedActionRecord.regrants
   *  (#1431). The client resolves each against GET /api/reference's
   *  universalActions for its edition-correct name; it never knows what a key
   *  means. */
  regrants?: string[];
  /**
   * Which inline resolution tool the client renders for this action (#1528) —
   * served only for a row-driven action (`actionsFromRows` below); a
   * DERIVED_ACTIONS row leaves this undefined, and the frontend's
   * ACTION_RESOLVERS table (keyed by actionKey, not this) still owns those.
   * Values mirror the frontend's own ResolutionKind enum
   * (frontend/src/features/session/actionResolvers.ts) — e.g. "heal-roll",
   * "simple-confirm" — moved here as the wire-served vocabulary a row can
   * name, retiring the frontend's per-key mirror one row at a time (#1383).
   */
  resolverKind?: string;
}

/** Resource pool shape — typed subset of what serializeCharacter builds. */
export interface ResourcePool {
  key: string;
  remaining: number;
}

// The single source of truth for the CLASS action catalog — see the file
// header's "Adding a new mechanical action" note (#1315): prisma/seed.ts's
// ACTIONS class rows are not consumed by any route and don't need to stay in
// sync (its universal rows are, via referenceRouter).
const DERIVED_ACTIONS: DerivedActionRecord[] = [
  // Universal actions are intentionally NOT included in `availableActions` on the
  // character: TurnHub gets them from GET /api/reference's universalActions,
  // resolved per edition (#1430), so including them here would duplicate them —
  // and would put ~105 lines of static rules copy on every character payload.
  // Only class-specific (non-universal) actions go in availableActions.

  // Barbarian
  // Rage/endRage retired from this table (#1686) — row-driven now
  // (barbarian-features.ts's Rage rows, resolverKind "toggle"), synthesized
  // by toggleActionsFromRow instead of a hand-authored pair here — mirrors
  // Second Wind/Action Surge's own #1528 retirement.
  { key: "recklessAttack", name: "Reckless Attack", cost: "free", grantClass: "barbarian", grantLevel: 2 },

  // Bard
  { key: "bardicInspiration", name: "Bardic Inspiration", cost: "bonusAction", grantClass: "bard", grantLevel: 1, resourceKey: "bardicInspiration", resourceAmount: 1 },

  // Cleric / Paladin — ONE Channel Divinity row for both classes, not one per
  // class. PHB'14 p.164 (multiclassing): gaining the feature from a second
  // class grants that class's effects but no additional uses — so cleric 2 and
  // paladin 3 share one pool (SHARED_POOL_MERGE, registry.ts) and one
  // affordance. deriveEntryScopedActions dedupes by key, so a Cleric/Paladin
  // multiclass surfaces exactly one card (#1340).
  {
    key: "channelDivinity",
    name: "Channel Divinity",
    cost: "action",
    grantClasses: [
      { className: "cleric", minLevel: 2 },
      { className: "paladin", minLevel: 3 },
    ],
    resourceKey: "channelDivinity",
    resourceAmount: 1,
    reminder:
      "Spend 1 use for any Channel Divinity effect you have — a Cleric's Turn Undead and Divine Domain options and a Paladin's Oath options all draw on this one pool.",
  },

  // Druid
  { key: "wildShape", name: "Wild Shape", cost: "action", grantClass: "druid", grantLevel: 2, resourceKey: "wildShape", resourceAmount: 1 },

  // Fighter — Second Wind / Action Surge retired from this table (#1528):
  // both are now row-driven (actionsFromRows below), read off Fighter's own
  // ClassFeature rows (activationCost/resolverKind/cost*/effect* columns,
  // prisma/seed/fighter-features.ts) instead of a DERIVED_ACTIONS entry.

  // Monk
  // Martial Arts (#1218): a free Unarmed Strike as a Bonus Action from L1 — no
  // resource cost, gated only on the Martial Arts blanket condition (no armor
  // or Shield). SRD 5.2 / PHB'24 p.88 grants this with no Attack-action
  // prerequisite; SRD 5.1 / PHB'14 p.78 DOES require the Attack action first —
  // this comment used to assert the 2024 reading as if it were universal
  // (corrected by #1499). The row stays SHARED across editions regardless:
  // both editions gate on the identical unarmored/no-shield condition, and the
  // Attack-action difference is reminder TEXT, not a gate — `reminder` here is
  // `(level) => string`, not edition-parameterized, so forking the wording is
  // #1500's work, not this slice's. Distinct from Flurry of Blows (#1217, the
  // two-strike Focus version, tagged EDITION_2024 below — SRD 5.1's Flurry
  // costs 1 ki for two strikes into the "ki" pool (monkPoolKey), a different
  // resource key from this row's "focus").
  { key: "bonusUnarmedStrike", name: "Bonus Unarmed Strike", cost: "bonusAction", grantClass: "monk", grantLevel: 1, requiresUnarmored: true },
  { key: "flurryOfBlows", name: "Flurry of Blows", cost: "bonusAction", grantClass: "monk", grantLevel: 2, resourceKey: "focus", resourceAmount: 1, edition: "EDITION_2024" },
  // Patient Defense / Step of the Wind (PHB'24 p.98, SRD 5.2, #1240) each grant
  // TWO menu entries — a free variant and a 1-Focus variant — rather than the
  // 2014 SRD's flat "always costs 1 ki" shape. Both compete for the same bonus
  // action, so both are cost:"bonusAction"; the free entry has no resourceKey
  // (always enabled, like Dodge/Dash themselves) while the Focus entry gates
  // on the focus pool like any other spend. Heightened Focus (monk L10,
  // #1244) upgrades both *Focus entries without touching the free ones:
  // patientDefenseFocus's reminder + ACTION_EFFECT_FN entry gain a level-gated
  // temp-HP roll; stepOfTheWindFocus's reminder gains a narrated move-a-
  // willing-creature rider (no server state — this app has no ally/NPC
  // combatant model to move).
  // These four rows' `regrants` (#1431) is data ONLY — deliberately unrendered,
  // and the curated reminders above/below stay the card subtitle. All four are
  // now tagged edition: "EDITION_2024" (#1499): SRD 5.1 Patient Defense buys
  // DODGE for a flat 1 ki (no free variant), and SRD 5.1 Step of the Wind buys
  // Disengage-or-Dash for a flat 1 ki the same way — neither 2014 shape is
  // these two-menu-entries-per-feature rows, so serving them to a 2014 monk
  // would be wrong, not merely unnamed. #1500 authors the 2014-keyed
  // equivalents under monkPoolKey's "ki" pool. Naming the regrant on the card
  // remains future work regardless of edition — Rogue's Cunning Action and
  // Thief's Fast Hands are invariant in both editions and DO render theirs.
  { key: "patientDefense", name: "Patient Defense", cost: "bonusAction", grantClass: "monk", grantLevel: 2, regrants: ["disengage"], reminder: "Disengage (free bonus action).", edition: "EDITION_2024" },
  {
    key: "patientDefenseFocus",
    name: "Patient Defense (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    regrants: ["disengage", "dodge"],
    reminder: (level) =>
      level >= 10
        ? "Disengage + Dodge (spend 1 Focus). Heightened Focus (L10): also gain temporary hit points equal to two Martial Arts die rolls."
        : "Disengage + Dodge (spend 1 Focus).",
    edition: "EDITION_2024",
  },
  { key: "stepOfTheWind", name: "Step of the Wind", cost: "bonusAction", grantClass: "monk", grantLevel: 2, regrants: ["dash"], reminder: "Dash (free bonus action).", edition: "EDITION_2024" },
  {
    key: "stepOfTheWindFocus",
    name: "Step of the Wind (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    regrants: ["disengage", "dash"],
    reminder: (level) =>
      level >= 10
        ? "Disengage + Dash, jump distance doubled this turn (spend 1 Focus). Heightened Focus (L10): also bring one willing creature within 5 ft along with you, moving it up to your Speed — it doesn't provoke opportunity attacks."
        : "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
    edition: "EDITION_2024",
  },
  // Stunning Strike (L5) is NOT a selectable action — it's a post-hit rider
  // (spend + Con save + fail/success outcome), built as its own dedicated
  // vertical in stunning-strike.ts, exactly like Sneak Attack bypasses this
  // catalog entirely (#1242 supersedes the #392 bare-spend stub formerly here).
  // Deflect Attacks (#1241, SRD 5.2 L3, renamed from 2014 Deflect Missiles): the base
  // reduction (1d10 + Dex + monk level) costs nothing, so — like the Warrior of Shadow
  // reminders below — it carries no resourceKey and the client rolls it directly (see
  // ACTION_EFFECT_FN comment). Deflect Energy (L13) just widens the damage-type clause
  // in the reminder text; it isn't a separate action key. Tagged EDITION_2024 (#1499):
  // PHB'14's Deflect Missiles is ranged-weapon-attacks-only, a materially different
  // feature under a different name, not a text variant of this one — #1500 authors it
  // as its own row rather than forking this one.
  {
    key: "deflectAttacks",
    name: "Deflect Attacks",
    cost: "reaction",
    grantClass: "monk",
    grantLevel: 3,
    reminder:
      "Reaction: when hit by a melee or ranged attack dealing bludgeoning, piercing, or slashing damage (any damage type at L13, Deflect Energy), reduce the damage by 1d10 + Dex modifier + monk level.",
    edition: "EDITION_2024",
  },
  // Redirect rider: only meaningful once a ranged hit is reduced to 0 — a "free"
  // follow-up decision within the same reaction (mirrors Stunning Strike's shape),
  // not its own action-economy slot. Spends the persisted Focus resource, unlike
  // the free base reduction above. Tagged EDITION_2024 alongside deflectAttacks —
  // PHB'14's Deflect Missiles has no redirect rider at all.
  { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", grantClass: "monk", grantLevel: 3, resourceKey: "focus", resourceAmount: 1, edition: "EDITION_2024" },

  // Every row below (Warrior of Shadow / Warrior of the Elements / Warrior of
  // the Open Hand / Warrior of Mercy) is subclass-gated via grantSubclassSlugs
  // and deliberately left UNTAGGED (#1499) even though all four subclasses are
  // 2024-only content: SUBCLASS_SLUGS (subclass-slug.ts) contains no 2014 monk
  // subclass, so matchesSubclassGate already excludes every one of these rows
  // for a 2014 monk (no slug can ever resolve) — an edition tag would add no
  // observable behaviour. Tagging wholenessOfBody in particular would also
  // pre-decide a content question that belongs to #1500 (PHB'14 Way of the
  // Open Hand has its own Wholeness of Body at a different level).
  // Warrior of Shadow reminder action (2024 rewrite, #1246) — no resourceKey, no
  // server effect; reminder is the deliverable. Improved Shadow Step (L11)
  // upgrades the SAME bonus action (ignore the dim/dark destination requirement
  // for 1 focus) rather than adding a competing catalog row — mirrors how
  // Heightened Focus upgrades patientDefenseFocus/stepOfTheWindFocus in place.
  // Opportunist (2014 L17 reaction) is retired — replaced by Cloak of Shadows
  // (shadow-arts.ts activateCloakOfShadows), a real resourceKey-gated cast, not
  // a catalog reminder.
  {
    key: "shadowStep",
    name: "Shadow Step",
    cost: "bonusAction",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-shadow"],
    grantLevel: 6,
    reminder: (level) =>
      level >= 11
        ? "Teleport up to 60 ft between areas of dim light or darkness (or, for 1 focus, ignore the dim/dark destination requirement); advantage on your first melee attack before the end of this turn. Make one unarmed strike immediately after teleporting."
        : "Teleport up to 60 ft between areas of dim light or darkness; advantage on your first melee attack before the end of this turn. Make one unarmed strike immediately after teleporting.",
  },
  // Warrior of Shadow (PHB'24 p.91 — not in SRD 5.2, which ships only Warrior
  // of the Open Hand for monk) Shadow Arts (L3) / Cloak of Shadows (L17) —
  // migrated off a pair of DerivedClassInfo availability booleans onto rows
  // here (#1315), same as shadowStep above: the actual cast/activate stays in
  // the dedicated shadow-arts.ts vertical (its own transactions endpoint), so
  // neither row gets an ACTION_EFFECT_FN entry. Darkness's normal casting
  // time is an action (SRD 5.2 — Darkness itself IS core-rules content);
  // Cloak of Shadows (PHB'24 p.91) is explicitly a Magic action (also
  // "action" here — this app doesn't distinguish Magic action from a bare
  // action in the cost enum).
  {
    key: "shadowArts",
    name: "Shadow Arts (Darkness)",
    cost: "action",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-shadow"],
    grantLevel: 3,
    resourceKey: "focus",
    resourceAmount: 1,
    reminder: "Spend 1 focus to cast Darkness without material components; you can see through it and move it up to 30 ft as a bonus action while it persists.",
  },
  {
    key: "cloakOfShadows",
    name: "Cloak of Shadows",
    cost: "action",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-shadow"],
    grantLevel: 17,
    resourceKey: "focus",
    resourceAmount: 3,
    reminder: "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible and move through creatures/objects as difficult terrain for 1 minute (or until incapacitated, or you end your turn in bright light). Flurry of Blows costs no focus while it lasts.",
  },

  // Warrior of the Elements (PHB'24 p.90 — not in SRD 5.2, which ships only
  // Warrior of the Open Hand for monk). Elemental Attunement retired from
  // this table (#1686) — row-driven now (monk.ts's AuthoredFeature entry,
  // resolverKind "toggle"), synthesizing its own "elementalAttunement"/
  // "endElementalAttunement" pair via toggleActionsFromRow; the buff/spend
  // ops route through the generic toggle dispatcher
  // (routes/character/actions.ts), NOT warrior-of-elements.ts's own endpoint
  // any more. Elemental Burst stays here and in that endpoint — it's a
  // save-DC damage op, not a buff.
  {
    key: "elementalBurst",
    name: "Elemental Burst",
    cost: "action",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-the-elements"],
    grantLevel: 6,
    resourceKey: "focus",
    resourceAmount: 2,
    reminder: "Magic action, 2 focus: 20-ft-radius sphere within 120 ft, chosen damage type. Each creature makes a Dexterity save (focus DC) — 3 Martial Arts dice on a failure, half as much on a success.",
  },

  // Warrior of the Open Hand (#1245): Open Hand Technique (Flurry-hit rider)
  // and Quivering Palm (set/trigger) are post-hit riders with their own
  // dedicated verticals (open-hand-technique.ts / quivering-palm.ts), exactly
  // like Stunning Strike bypasses this catalog — neither is a selectable action.
  // Wholeness of Body IS a selectable action: a Bonus Action heal, spending the
  // #1228 wholenessOfBody pool (Martial Arts die + Wis mod, client-rolled).
  { key: "wholenessOfBody", name: "Wholeness of Body", cost: "bonusAction", grantClass: "monk", grantSubclassSlugs: ["monk-warrior-of-the-open-hand"], grantLevel: 6, resourceKey: "wholenessOfBody", resourceAmount: 1 },
  // Fleet Step (L11): not a discrete action — it lets you ALSO take Step of the
  // Wind after any OTHER bonus action, so it carries no resourceKey/slot (like
  // Reckless Attack/Metamagic's cost:"free" reminders) rather than competing
  // with Wholeness of Body/Flurry/Bonus Unarmed Strike for the same bonus
  // action. Full automation of "which bonus action did you just take" is heavy
  // for a one-line rider — the reminder is the deliverable (ticket #1245).
  {
    key: "fleetStep",
    name: "Fleet Step",
    cost: "free",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-the-open-hand"],
    grantLevel: 11,
    reminder: "When you take a bonus action other than Step of the Wind, you can also take Step of the Wind immediately afterward (no extra cost).",
  },
  // Warrior of Mercy (#1248): Hand of Healing is a Magic-action heal spending
  // 1 Focus (mirrors Wholeness of Body's shape) plus a free Flurry-strike
  // replacement variant. Hand of Harm and Hand of Ultimate Mercy are their
  // own dedicated verticals (hand-of-harm.ts / hand-of-ultimate-mercy.ts) —
  // like Stunning Strike / Quivering Palm — since they carry once-per-turn /
  // once-per-long-rest mechanics this catalog doesn't model.
  {
    key: "handOfHealing",
    name: "Hand of Healing",
    cost: "action",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-mercy"],
    grantLevel: 3,
    resourceKey: "focus",
    resourceAmount: 1,
    reminder: (level) =>
      level >= 6
        ? "Magic action: expend 1 Focus to heal a creature you touch (Martial Arts die + Wis mod). Physician's Touch (L6): also ends one of Blinded/Deafened/Paralyzed/Poisoned/Stunned."
        : "Magic action: expend 1 Focus to heal a creature you touch (Martial Arts die + Wis mod).",
  },
  // The Flurry-replacement variant swaps in for one of Flurry of Blows' own
  // unarmed strikes, so it costs no Focus of its own (Flurry already spent
  // its 1 Focus via the separate flurryOfBlows action) — hence no resourceKey.
  {
    key: "handOfHealingFlurry",
    name: "Hand of Healing (Flurry replacement)",
    cost: "bonusAction",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-mercy"],
    grantLevel: 3,
    reminder: "Replace one Unarmed Strike from Flurry of Blows with Hand of Healing at no extra Focus cost. Flurry of Healing and Harm (L11): replace every strike this way.",
  },

  // Paladin — divineSense is EDITION_2014-only (#1229): 2024 removed Divine
  // Sense as its own resource pool/action (see paladin.ts's resourceFn); its
  // job moves to the "Channel Divinity: Divine Sense" catalog option
  // (channel-divinity.ts), which spends the channelDivinity pool through the
  // ability-cast path, not this actions dispatch. Untagging this row would
  // leave it permanently `enabled: false` on every 2024 Paladin's sheet
  // ("No divineSense remaining") since the pool it checks no longer exists.
  { key: "divineSense", name: "Divine Sense", cost: "action", grantClass: "paladin", grantLevel: 1, resourceKey: "divineSense", resourceAmount: 1, edition: "EDITION_2014" },
  // Lay on Hands' cost forks to a Bonus Action in 2024 (SRD 5.2) — same-key
  // edition fork, mirroring Metamagic's/Flurry of Blows' own shape above.
  {
    key: "layOnHands",
    name: "Lay on Hands",
    cost: "action",
    grantClass: "paladin",
    grantLevel: 1,
    resourceKey: "layOnHands",
    resourceAmount: 5,
    edition: "EDITION_2014",
    reminder: "Touch a creature to restore HP; alternatively, spend 5 HP to cure one disease or neutralize one poison.",
  },
  {
    key: "layOnHands",
    name: "Lay on Hands",
    cost: "bonusAction",
    grantClass: "paladin",
    grantLevel: 1,
    resourceKey: "layOnHands",
    resourceAmount: 5,
    edition: "EDITION_2024",
    reminder: "Touch a creature to restore HP; alternatively, spend 5 HP to remove the Poisoned condition instead of healing.",
  },
  // Channel Divinity is a single cross-class row — see channelDivinity above (PHB'14 p.164).

  // Rogue
  // Cunning Action carries no reminder on purpose: its `regrants` ARE the rule,
  // and the three names are identical in SRD 5.1 and SRD 5.2 (Dash, Disengage,
  // Hide), so the client can name them from the served rows for either edition
  // without the caveat the monk rows above carry (#1431).
  { key: "cunningAction", name: "Cunning Action", cost: "bonusAction", grantClass: "rogue", grantLevel: 2, regrants: ["dash", "disengage", "hide"] },
  // Thief's Fast Hands (SRD 5.1 / SRD 5.2, Thief: Fast Hands) — a MODE of
  // Cunning Action, not a second Bonus Action: both editions spend "the Bonus
  // Action granted by your Cunning Action", so a Thief L3 sees two sibling
  // bonus-action cards that compete for the one slot. The reminder says so,
  // because nothing in the action economy can express "these two share a slot".
  // The object-use grant is the edition-invariant half and is the `regrants`
  // link; the reminder deliberately does not NAME that action, since SRD 5.1
  // calls it Use an Object and SRD 5.2 Utilize. #1240's edition-blind service
  // of this row is why the name has to come off the wire, not out of here.
  // The prose feature description stays in rogue.ts's THIEF_FEATURES — that is
  // the feature; this is the action.
  {
    key: "fastHands",
    name: "Fast Hands",
    cost: "bonusAction",
    grantClass: "rogue",
    grantSubclassSlugs: ["rogue-thief"],
    grantLevel: 3,
    regrants: ["useObject"],
    // Kept under ~90 chars so it does not ellipsis-clip in the card subtitle
    // (OptionCard truncates to one line). The lock/trap detail and the
    // object-use option are the THIEF_FEATURES prose and the `regrants` link
    // respectively — neither is lost by leaving them out of the in-play prompt.
    reminder: "Uses Cunning Action's Bonus Action, not an extra one — Sleight of Hand or Thieves' Tools.",
  },

  // Sorcerer — SRD 5.2 grants Metamagic at level 2, not PHB'14's level 3
  // (#1232 commit 2b), so this is a same-key edition fork (ActionSeed's own
  // comment sanctions the shape) rather than one row.
  { key: "metamagic", name: "Metamagic", cost: "free", grantClass: "sorcerer", grantLevel: 3, resourceKey: "sorceryPoints", resourceAmount: 1, edition: "EDITION_2014" },
  { key: "metamagic", name: "Metamagic", cost: "free", grantClass: "sorcerer", grantLevel: 2, resourceKey: "sorceryPoints", resourceAmount: 1, edition: "EDITION_2024" },
];

// Class/subclass/level gate for one DERIVED_ACTIONS row — no pool/enabled state.
// The ONE predicate both deriveActions' filter and deriveEntryScopedActions
// (below, which both `availableActions[]` and shadow-arts.ts's cast guards
// resolve through) key off, so a level gate can never drift into two
// independent copies (#1315 — CLAUDE.md's level-gated-registry rule).
// Exported ONLY so the `universal` latch below can be tested against a
// synthetic record (#1431): with no real row setting the field, deleting the
// guard is otherwise undetectable through any observable output.
export function matchesActionGate(
  a: DerivedActionRecord,
  cls: string,
  slug: SubclassSlug | undefined,
  level: number,
  edition: RulesEdition,
): boolean {
  // Only class-specific actions ride the character payload; universal rows are
  // served per edition by referenceRouter (#1430). No DERIVED_ACTIONS row sets
  // `universal` today — this guard is the structural latch that keeps a future
  // one out of availableActions[] instead of double-rendering it, which is why
  // it stays even though the field is unset (#1431).
  if (a.universal) return false;

  // Edition gate (#1499) — mirrors featuresFromRows' edition filter
  // (lib/classes/class-feature-rows.ts, #1524, retired from this file's own
  // featureAppliesToEdition precedent): absent `edition` means both editions;
  // a row tagged for the OTHER edition is filtered out here, before the
  // class/subclass gates below ever see it.
  if (a.edition !== undefined && a.edition !== edition) return false;

  // Class + level gate (single-class grantClass/grantLevel or a multi-class
  // grantClasses list — matched when ANY gate matches; see classGatesOf).
  if (!classGatesOf(a).some((g) => matchesClassGate(g, cls, level))) return false;

  // Subclass gate (slug equality, ANY accepted slug; see grantSubclassSlugs).
  if (!matchesSubclassGate(a, slug)) return false;

  return true;
}

/**
 * Filter DERIVED_ACTIONS for a character's class/subclass/level and annotate
 * each with `enabled` based on current resource pool `remaining` values.
 *
 * Returns only CLASS-SPECIFIC actions (not universal ones — TurnHub gets those
 * from GET /api/reference's universalActions, #1430, so including them here
 * would double-render them).
 *
 * Pure function — no DB access. Safe to call in synchronous serializeCharacter.
 */
export function deriveActions(
  className: string,
  subclassSlug: SubclassSlug | undefined,
  level: number,
  pools: ResourcePool[],
  // Martial Arts blanket condition (bestArmor == null && !hasShield, #1218).
  // Defaults to true (permissive) since only requiresUnarmored actions read it.
  // `edition` must sit AFTER this defaulted parameter (mirrors subclassGateLevel),
  // which means the default can no longer be skipped by a caller that also
  // needs to pass edition — every such call site now passes both explicitly.
  unarmoredUnshielded = true,
  edition: RulesEdition,
): AvailableAction[] {
  const cls = (className ?? "").toLowerCase();

  const poolMap = new Map(pools.map((p) => [p.key, p.remaining]));

  return DERIVED_ACTIONS
    .filter((a) => matchesActionGate(a, cls, subclassSlug, level, edition))
    .map((a): AvailableAction => {
      const { enabled, disabledReason } = resolveEnablement(a, poolMap, unarmoredUnshielded);
      const reminder = typeof a.reminder === "function" ? a.reminder(level) : a.reminder;
      return {
        key: a.key,
        name: a.name,
        cost: a.cost,
        enabled,
        ...(disabledReason ? { disabledReason } : {}),
        ...(reminder ? { reminder } : {}),
        ...(a.regrants ? { regrants: [...a.regrants] } : {}),
      };
    });
}

/**
 * Every universal action key any DERIVED_ACTIONS row re-costs (#1431), deduped.
 * Exported instead of DERIVED_ACTIONS itself so the seed-side drift gate can
 * assert "each of these resolves to a seeded `universal: true`, `cost: action`
 * row in BOTH editions" without the whole class catalog becoming public API.
 * The gate closes a different gap from #1315's (which was class-row-vs-seed
 * drift): here it is class row → served UNIVERSAL row.
 */
export const REGRANTED_UNIVERSAL_KEYS: readonly string[] = [
  ...new Set(DERIVED_ACTIONS.flatMap((a) => a.regrants ?? [])),
];

/**
 * Entry-scoped `availableActions` derivation (#1206/#1315): each class entry's
 * own DERIVED_ACTIONS rows at THAT entry's own effective level, deduped by
 * `key` with the PRIMARY entry winning ties (mirrors mergeLayers/
 * collectEntryScopedFeatures' base-wins policy) — so a secondary Warrior of
 * Shadow monk's shadowArts/cloakOfShadows (or any other class's gated action)
 * surface even when that class isn't the primary entry, instead of only ever
 * reading the primary entry at total character level. This is the SAME
 * function shadow-arts.ts's cast guards call, so the wire value and the guard
 * can never independently drift on the gate.
 */
// `getFeatureRows` is optional (#1528 chunk 0) — mirrors registry.ts's
// GetFeatureRows convention: a caller with FEATURE_ROWS_ENTRY_SELECT loaded
// passes `featureRowsOf` so a Fighter entry's row-driven actions (Second
// Wind/Action Surge) surface here too; absent for a caller with no such
// relation (shadow-arts.ts / warrior-of-elements.ts's `pools: []` callers —
// harmless, since only monk-gated keys matter to them and no monk row
// populates `activationCost`).
export function deriveEntryScopedActions<E extends SubclassIdentityInput & { name: string; level: number }>(
  classEntries: E[],
  totalLevel: number,
  pools: ResourcePool[],
  unarmoredUnshielded = true,
  edition: RulesEdition,
  getFeatureRows?: (entry: E) => ClassFeatureRowsCarrier | undefined,
): AvailableAction[] {
  const poolMap = new Map(pools.map((p) => [p.key, p.remaining]));
  const seenKeys = new Set<string>();
  const actions: AvailableAction[] = [];
  for (const entry of classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const slug = resolveSubclassSlug(entry.name, entry);
    const rows = getFeatureRows?.(entry);
    const entryActions = [
      ...deriveActions(entry.name, slug, effLevel, pools, unarmoredUnshielded, edition),
      ...actionsFromRows(rows?.classRows ?? [], effLevel, edition, poolMap, unarmoredUnshielded),
      ...actionsFromRows(rows?.subclassRows ?? [], effLevel, edition, poolMap, unarmoredUnshielded),
    ];
    for (const action of entryActions) {
      if (seenKeys.has(action.key)) continue;
      seenKeys.add(action.key);
      actions.push(action);
    }
  }
  return actions;
}

/**
 * A DERIVED_ACTIONS row's `grantLevel` (undefined if the key doesn't exist or
 * carries none) — lets a caller building "level N+" error text (e.g.
 * warrior-of-elements.ts's assertWarriorOfElements) read the single source of
 * truth instead of hardcoding the number a second time, which is exactly the
 * kind of drift deriveEntryScopedActions itself exists to prevent (#1315).
 */
export function actionGrantLevel(key: string, edition: RulesEdition): number | undefined {
  // Filters on edition BEFORE find (#1499) — a no-op today since no key is
  // duplicated across editions, but written this way anyway: #1500 adds
  // same-key 2014 monk rows, and a lookup that's only silently correct
  // because no collision exists yet is exactly what breaks then.
  const row = DERIVED_ACTIONS.find((a) => a.key === key && (a.edition === undefined || a.edition === edition));
  if (!row) return undefined;
  // Min across gates so a row two classes grant (channelDivinity) reports the
  // earliest level any of them grants it, rather than undefined.
  const levels = classGatesOf(row).map((g) => g.minLevel).filter((l) => l > 0);
  return levels.length > 0 ? Math.min(...levels) : undefined;
}

// The subset of a DERIVED_ACTIONS row (or a row-driven action, actionFromRow
// above) resolveEnablement needs — narrowed to exactly these three fields so
// a row-driven caller can build a plain object literal instead of a
// structurally-lying cast to the full (key/name/cost-requiring) DerivedActionRecord.
type EnablementInput = Pick<DerivedActionRecord, "resourceKey" | "resourceAmount" | "requiresUnarmored">;

// One action row's enabled/disabledReason — pulled out of the `.map()` above to
// keep that callback's complexity low. Resource-pool gate first, then the
// Martial Arts unarmored/unshielded gate (mutually exclusive today, but a
// future action could carry both — resource wins the reason if so).
function resolveEnablement(
  a: EnablementInput,
  poolMap: Map<string, number>,
  unarmoredUnshielded: boolean,
): { enabled: boolean; disabledReason?: string } {
  if (a.resourceKey && a.resourceAmount) {
    const remaining = poolMap.get(a.resourceKey) ?? 0;
    if (remaining < a.resourceAmount) {
      return {
        enabled: false,
        disabledReason:
          remaining === 0
            ? `No ${a.resourceKey} remaining`
            : `Need ${a.resourceAmount} ${a.resourceKey}, have ${remaining}`,
      };
    }
  }
  if (a.requiresUnarmored && !unarmoredUnshielded) {
    return { enabled: false, disabledReason: "Requires no armor or Shield" };
  }
  return { enabled: true };
}

// Keyed by action `key`. Each function receives an execution context and returns
// an array of existing op objects that the Phase-C orchestrator dispatches to
// the appropriate domain handlers within a single Prisma transaction.
//
// Convention (mirrors CLASS_RESOURCE_FN in class-features.ts):
//  - Return op arrays, never side-effect directly.
//  - If a roll was performed client-side, receive it via `ctx.roll`; validate
//    range server-side rather than recomputing (same pattern as castSpell.roll).
//  - A roll made server-side with no client input (e.g. Heightened Focus's
//    temp-HP roll) is precomputed by the route before dispatch and passed in
//    via its own ctx field, same shape as `heightenedFocusTempHp` below.
//  - Use ONLY existing op types (spendResource, adjustQuantity, heal, tempHp,
//    applyBuff, clearBuff).
//
// A while-active BUFF-GRANTING feature (Rage was the last one here) does NOT
// belong in this table any more (#1686): author it as a ClassFeature/
// GrantedAbility row with resolverKind "toggle" + an `effectBuffs` list
// instead (toggleActionsFromRow/toggleRowOps below) — Rage's own migration
// (barbarian-features.ts) is the worked example, including the level-tiered
// modifier and resistDamageTypes/rollEffects passthrough this table's
// closures used to hand-roll. This table stays for actions with NO buff to
// grant (spend/heal/tempHp/no-op).

interface ActionContext {
  /** Arbitrary dice roll total supplied by the client (e.g. potion healing). */
  roll?: number;
  /** ID of the inventory item to consume (e.g. healing potion). */
  inventoryItemId?: string;
  /**
   * Heightened Focus (monk L10, PHB'24 p.98/SRD 5.2, #1244): temp HP for
   * Patient Defense's Focus variant, rolled server-side (two Martial Arts die
   * rolls, no client input) by the route before dispatch. Undefined/0 below
   * L10, so patientDefenseFocus simply omits the tempHp op.
   */
  heightenedFocusTempHp?: number;
}

type SpendResourceOp = { type: "spendResource"; key: string; amount?: number };
type AdjustQuantityOp = { type: "adjustQuantity"; inventoryItemId: string; delta: number };
type HealOp = { type: "heal"; amount: number };
type TempHpOp = { type: "tempHp"; amount: number };
type ApplyBuffOp = { type: "applyBuff"; buff: Omit<ActiveBuff, "id"> };
type ClearBuffOp = { type: "clearBuff"; key: string; reason: string };
// Exported so toggleRowOps below (the #1686 generic toggle handler) and the
// routes/character/actions.ts dispatcher share this exact union instead of a
// second, structurally-equal copy.
export type ActionOp = SpendResourceOp | AdjustQuantityOp | HealOp | TempHpOp | ApplyBuffOp | ClearBuffOp;

type EffectFn = (ctx: ActionContext) => ActionOp[];

export const ACTION_EFFECT_FN: Record<string, EffectFn> = {
  // Generic no-op actions (ephemeral only — no server effect needed)
  attack: () => [],
  castSpell: () => [],
  dodge: () => [],
  dash: () => [],
  disengage: () => [],
  help: () => [],
  hide: () => [],
  search: () => [],
  ready: () => [],
  grapple: () => [],
  opportunityAttack: () => [],
  castSpellReaction: () => [],

  // Use Object (drink a healing potion, etc.)
  useObject: (ctx) => {
    const ops: ActionOp[] = [];
    if (ctx.inventoryItemId) {
      ops.push({ type: "adjustQuantity", inventoryItemId: ctx.inventoryItemId, delta: -1 });
      if (ctx.roll !== undefined && ctx.roll > 0) {
        ops.push({ type: "heal", amount: ctx.roll });
      }
    }
    return ops;
  },

  // Barbarian
  // Rage/endRage retired from this table (#1686) — row-driven now
  // (barbarian-features.ts's Rage rows carry resolverKind "toggle" + a
  // tiered effectBuffs entry), dispatched through toggleRowOps
  // (routes/character/actions.ts) instead of a hand-authored closure here.
  recklessAttack: () => [], // ephemeral — advantage/disadvantage is tracked by the table

  // Bard
  bardicInspiration: () => [{ type: "spendResource", key: "bardicInspiration" }],

  // Cleric / Paladin — one merged row (see the DERIVED_ACTIONS comment above).
  channelDivinity: () => [{ type: "spendResource", key: "channelDivinity" }],

  // Druid
  wildShape: () => [{ type: "spendResource", key: "wildShape" }],

  // Fighter — secondWind/actionSurge retired from this table (#1528): both
  // are row-driven now (routes/character/actions.ts's row-driven dispatch),
  // which decides the cast-core-vs-spend-only split per row itself (a row
  // with an `effectKind` routes through castAbilityInTx; one without, like
  // Action Surge — a pure counter, the extra-action grant is client-side —
  // spends its pool directly).

  // Monk
  // bonusUnarmedStrike is economy-only, like `attack`/`twf` — no server state
  // to spend, the gate is already applied at derive time (requiresUnarmored).
  bonusUnarmedStrike: () => [],
  // SRD 5.2 Focus: Flurry expends 1 Focus Point to make two Unarmed Strikes
  // (#1217 — was miscoded at 2 Focus, a 2014-rules holdover).
  flurryOfBlows: () => [{ type: "spendResource", key: "focus" }],
  // patientDefense / stepOfTheWind (the FREE variants) have no ACTION_EFFECT_FN
  // entry — like Shadow Step/Opportunist, they're economy-only (consume the
  // bonus action, spend nothing); planActionClick never calls send() for a
  // serverEffect:false resolver, so no dispatch entry is needed here.
  patientDefenseFocus: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "focus" }];
    // Heightened Focus (monk L10, #1244): the route pre-rolls two Martial Arts
    // die rolls into ctx.heightenedFocusTempHp (0/undefined below L10), so the
    // tempHp op is simply omitted rather than pushed at amount 0.
    if (ctx.heightenedFocusTempHp) {
      ops.push({ type: "tempHp", amount: ctx.heightenedFocusTempHp });
    }
    return ops;
  },
  // stepOfTheWindFocus's Heightened Focus rider (move a willing creature) has
  // no server state to apply — this app has no NPC/ally combatant model — so
  // it's surfaced only via the level-gated reminder text above, not here.
  stepOfTheWindFocus: () => [{ type: "spendResource", key: "focus" }],
  // stunningStrike is not here — it's a post-hit rider in stunning-strike.ts (#1242).
  // Warrior of the Open Hand (#1245): Wholeness of Body mirrors layOnHands'
  // shape (spend the pool, heal the client-rolled amount) but spends a flat 1
  // use rather than a variable HP-pool draw. Open Hand Technique / Quivering
  // Palm have no entry here — see the DERIVED_ACTIONS comment above.
  wholenessOfBody: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "wholenessOfBody" }];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  // fleetStep has no entry here — it's a pure reminder (cost:"free") like
  // recklessAttack/metamagic: no server state to spend.
  // Warrior of Mercy (#1248): Hand of Healing's rule text is "touch a
  // creature", but — like layOnHands/wholenessOfBody above — this app has no
  // cross-character heal path via the actions endpoint, so it applies to the
  // acting character only; the client-rolled amount already includes the
  // Martial Arts die + Wis mod. Physician's Touch's condition-cure (L6+) is
  // narrated via the reminder text only (no persisted target condition).
  handOfHealing: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "focus" }];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  // Flurry-replacement variant: no Focus spend (Flurry's own flurryOfBlows
  // action already paid it) — just the same client-rolled heal.
  handOfHealingFlurry: (ctx) => {
    const ops: ActionOp[] = [];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  // deflectAttacks (the base reduction) has no entry here — it's a pure reminder
  // action like shadowStep: the client rolls 1d10 + Dex + monk level and never
  // calls the transactions endpoint (nothing persisted). Only the redirect
  // below is real, persisted state.
  deflectAttacksRedirect: () => [{ type: "spendResource", key: "focus" }],

  // Paladin
  divineSense: () => [{ type: "spendResource", key: "divineSense" }],
  layOnHands: (ctx) => {
    const amount = ctx.roll ?? 0;
    const ops: ActionOp[] = [{ type: "spendResource", key: "layOnHands", amount }];
    if (amount > 0) {
      ops.push({ type: "heal", amount });
    }
    return ops;
  },

  // Rogue
  cunningAction: () => [], // bonus action consumed ephemerally; no server effect

  // Sorcerer
  metamagic: (ctx) => {
    const amount = ctx.roll ?? 1;
    return [{ type: "spendResource", key: "sorceryPoints", amount }];
  },
};

// Cast-core actions: the orchestrator routes these through castAbilityInTx (pay
// pool cost → self-apply heal), not the op-list dispatch. The 5e rule lives here
// (pool key + base spend + the self-heal effect).

/** A cast-core action's cost + effect + resolved self-apply, if any. */
export interface ActionCastSpec {
  name: string;
  cost: AbilityCost;
  effect: EffectSpec;
  apply?: { target: "self"; kind: "heal" | "damage" | "tempHp"; amount: number };
}

/**
 * One row's AvailableAction, or null when the row declares no activation
 * (`activationCost` absent) or the character hasn't reached its grant level.
 * Data-gated like `poolsFromRows` (class-feature-rows.ts): only a row with
 * BOTH `activationCost` and `resourceKey` populated contributes — today, only
 * Fighter's Second Wind/Action Surge rows (#1528). `enabled`/`disabledReason`
 * reuse `resolveEnablement` so a row's gate can never diverge from a
 * DERIVED_ACTIONS row's.
 */
// The row-driven gate: right edition, grant level reached, and the two
// fields that make a row an action at all (activationCost + resourceKey —
// see actionFromRow's own comment). Split out so actionFromRow's own
// cyclomatic count stays low (the fallow health gate).
function rowIsAnAvailableAction(row: ClassFeatureRow, level: number, edition: RulesEdition): boolean {
  return row.edition === edition && row.level <= level && Boolean(row.activationCost) && Boolean(row.resourceKey);
}

// Assembles the AvailableAction object once enablement is known — pulled out
// of actionFromRow to keep its own branching budget for the gate check
// (fallow's cyclomatic/CRAP gate; the four conditional-spread fields below
// are what pushed this over as one function).
function buildRowAction(
  row: ClassFeatureRow,
  level: number,
  enabled: boolean,
  disabledReason: string | undefined,
): AvailableAction {
  const reminder = describeRowReminder(row, level);
  return {
    key: row.resourceKey as string,
    name: row.name,
    cost: row.activationCost as ActionCost,
    enabled,
    ...(disabledReason ? { disabledReason } : {}),
    ...(reminder ? { reminder } : {}),
    ...(row.resolverKind ? { resolverKind: row.resolverKind } : {}),
    ...(row.regrants && row.regrants.length > 0 ? { regrants: [...row.regrants] } : {}),
  };
}

function actionFromRow(
  row: ClassFeatureRow,
  level: number,
  edition: RulesEdition,
  poolMap: Map<string, number>,
  unarmoredUnshielded: boolean,
): AvailableAction | null {
  if (!rowIsAnAvailableAction(row, level, edition)) return null;
  const cost = readAbilityCost(row);
  const record: EnablementInput = {
    resourceKey: row.resourceKey as string,
    resourceAmount: cost.kind === "pool" ? cost.base : undefined,
    requiresUnarmored: row.requiresUnarmored ?? false,
  };
  const { enabled, disabledReason } = resolveEnablement(record, poolMap, unarmoredUnshielded);
  return buildRowAction(row, level, enabled, disabledReason);
}

// The synthesized "end" action key for a toggle row's own activate key
// (#1686) — "rage" -> "endRage", matching the pre-migration DERIVED_ACTIONS
// endRage key byte-for-byte, which is load-bearing:
// DURABLE_BUFF_END_CONDITIONS (frontend/src/lib/turnHooks.ts) hardcodes
// "endRage" as the auto-end action it invokes, keyed by the "rage" buff —
// this function must keep producing that exact string for Rage forever, not
// merely today.
export function endActionKey(activateKey: string): string {
  return `end${activateKey.charAt(0).toUpperCase()}${activateKey.slice(1)}`;
}

/**
 * A "toggle" row's own AvailableAction PAIR (#1686) — synthesizes an activate
 * entry (key = row.resourceKey, the same "click key = identity" convention
 * buildRowAction uses) and an end entry (key = endActionKey(activateKey))
 * from ONE row, replacing a hand-authored DERIVED_ACTIONS pair (Rage/endRage).
 * Enablement checks the row's own ABILITY COST (costPoolKey/costBase — "cost
 * columns already exist"), not resourceKey/resourceAmount: resourceKey is
 * this row's IDENTITY here, not necessarily the pool it draws from (Elemental
 * Attunement's identity is "elementalAttunement" but its cost draws from the
 * shared "focus" pool; they coincide only when a feature spends its OWN
 * dedicated pool, Rage's case, where costPoolKey === resourceKey === "rage").
 * The end action is always enabled — same as the retired endRage
 * DERIVED_ACTIONS row (no server-tracked "is this active" gate); clearing an
 * inactive buff is already a safe no-op (clearBuffByKeyInTx).
 */
function toggleActionsFromRow(
  row: ClassFeatureRow,
  level: number,
  edition: RulesEdition,
  poolMap: Map<string, number>,
  unarmoredUnshielded: boolean,
): AvailableAction[] {
  if (row.edition !== edition || row.level > level || !row.activationCost || !row.resourceKey) return [];
  const cost = readAbilityCost(row);
  const record: EnablementInput = {
    resourceKey: cost.kind === "pool" ? cost.key : undefined,
    resourceAmount: cost.kind === "pool" ? cost.base : undefined,
    requiresUnarmored: row.requiresUnarmored ?? false,
  };
  const { enabled, disabledReason } = resolveEnablement(record, poolMap, unarmoredUnshielded);
  const activateKey = row.resourceKey;
  return [
    {
      key: activateKey,
      name: row.name,
      cost: row.activationCost as ActionCost,
      enabled,
      ...(disabledReason ? { disabledReason } : {}),
      resolverKind: "toggle",
    },
    {
      key: endActionKey(activateKey),
      name: `End ${row.name}`,
      cost: row.activationCost as ActionCost,
      enabled: true,
      resolverKind: "toggle",
    },
  ];
}

/**
 * The generic "toggle" effect handler (#1686): instantiates a row's
 * `effectBuffs` as ActiveBuff ops on activation, or clears them by key on
 * end — the row-driven counterpart to a hand-authored ACTION_EFFECT_FN pair
 * (Rage's retired `rage`/`endRage` functions). `ctx.level` is the granting
 * class entry's OWN effective level (mirrors the retired
 * computeRageDamageBonus's barbarian-level lookup, never the character's
 * total level) — the same level effectBuffsFromRow uses for both a buff
 * entry's own `minLevel` gate and a tiered `modifier`'s evaluation.
 * Activation also pays the row's own ability cost (costPoolKey/costBase —
 * "cost columns already exist") via a spendResource op, omitting `amount`
 * when it's 1 to match every existing hand-authored spend's byte shape
 * (`{ type: "spendResource", key: "rage" }`, no `amount` field).
 */
export function toggleRowOps(row: ClassFeatureRow, ctx: ResourceTotalContext, isEnd: boolean): ActionOp[] {
  const buffs = effectBuffsFromRow(row, ctx);
  if (isEnd) {
    return buffs.map((b) => ({ type: "clearBuff", key: b.key, reason: `${row.name} ended` }));
  }
  // Activation with no buff to apply would still spend the pool below — a
  // silent drain. That only happens for a misauthored row (null/empty
  // effectBuffs) or one whose every buff is gated above ctx.level; fail loud
  // rather than charge the resource for nothing (#1686 review).
  if (buffs.length === 0) {
    throw new Error(`Toggle row "${row.name}" has no active effectBuffs at level ${ctx.level}`);
  }
  const ops: ActionOp[] = buffs.map((b) => ({
    type: "applyBuff",
    buff: {
      key: b.key,
      target: b.target,
      modifier: b.modifier,
      source: row.name,
      duration: b.duration,
      ...(b.resistDamageTypes ? { resistDamageTypes: b.resistDamageTypes } : {}),
      ...(b.rollEffects ? { rollEffects: b.rollEffects } : {}),
    },
  }));
  const cost = readAbilityCost(row);
  if (cost.kind === "pool") {
    ops.push({ type: "spendResource", key: cost.key, ...(cost.base !== 1 ? { amount: cost.base } : {}) });
  }
  return ops;
}

/**
 * A dynamic subtitle for a row-driven heal (e.g. "Regain 1d10 + 3 HP") built
 * from the row's own effect columns rather than a second hand-authored
 * string — the level-scaled modifier (`effectModifierSource: "classLevel"`)
 * is resolved here since the row itself only knows the grant level, not the
 * character's current one. Undefined for a non-heal or dice-less row (Action
 * Surge).
 */
function describeRowReminder(row: ClassFeatureRow, level: number): string | undefined {
  if (row.effectKind !== "heal" || !row.effectDiceCount || !row.effectDiceFaces) return undefined;
  const modifier = row.effectModifierSource === "classLevel" ? level : 0;
  return `Regain ${row.effectDiceCount}d${row.effectDiceFaces}${modifier > 0 ? ` + ${modifier}` : ""} HP`;
}

/**
 * Every row-driven action declared across a class/subclass's rows, at one
 * character level — the row-driven counterpart to `deriveActions`' filter
 * over `DERIVED_ACTIONS`. Called once per class-rows and once per
 * subclass-rows by `deriveEntryScopedActions` below (mirrors
 * `deriveBaseLayer`/`deriveSubclassLayer`'s split in registry.ts).
 */
function actionsFromRows(
  rows: readonly ClassFeatureRow[],
  level: number,
  edition: RulesEdition,
  poolMap: Map<string, number>,
  unarmoredUnshielded: boolean,
): AvailableAction[] {
  const actions: AvailableAction[] = [];
  for (const row of rows) {
    // A "toggle" row synthesizes an activate/end PAIR (#1686), never a single
    // actionFromRow entry — branched before that gate so a toggle row's
    // resourceKey/activationCost never falls through to the cast-core/spend
    // path below.
    if (row.resolverKind === "toggle") {
      actions.push(...toggleActionsFromRow(row, level, edition, poolMap, unarmoredUnshielded));
      continue;
    }
    const action = actionFromRow(row, level, edition, poolMap, unarmoredUnshielded);
    if (action) actions.push(action);
  }
  return actions;
}

/**
 * Builds a row-driven cast-core action's spec AND rolls its effect
 * server-side (#1528) — the row-driven counterpart to the retired
 * `ACTION_CAST_FN` table. Unlike that table (whose die value was the client
 * roll), the roll happens HERE: `castManeuver` (maneuvers.ts) is the
 * server-authoritative-roll precedent this mirrors. `rollDie` is injected
 * (not imported directly) so this stays a pure function the route's own
 * `rollDie` (lib/core/dice.ts) is threaded into, same as
 * computeHeightenedFocusTempHp's pattern one file over.
 *
 * The `{ ...row, level: 0 }` adapter is the #1528 EffectRow landmine fix:
 * `EffectRow`'s `level` decides the SCALING axis (cantrip/upcast), which a
 * ClassFeature row has no use for — `row.level` here is the CHARACTER level
 * the feature is GRANTED at, a different number entirely. Passing it through
 * unadapted would let `resolveEffectScaling` reinterpret Second Wind's grant
 * level as a spell level. Level 0 with no `cantripScaling`/`upcastDicePerLevel`
 * (never authored on this row shape — see ClassFeatureRow's own comment)
 * lands on `{ mode: "none" }`, the only scaling mode any Fighter descriptor
 * can ever resolve to (pinned by a dedicated test).
 */
export function castSpecFromRow(
  row: ClassFeatureRow,
  classLevel: number,
  rollDie: (faces: number) => number,
): { spec: ActionCastSpec; roll: number } {
  const cost = readAbilityCost(row);
  const effect = readEffectSpec({ ...row, level: 0 });
  // Both level axes get the GRANTING ENTRY's level, not the character total:
  // `classLevel` because that is what `modifierSource: "classLevel"` means
  // (Second Wind is `1d10 + your Fighter level`), and `characterLevel` because
  // the only axis reading it — cantrip scaling — is unreachable from a
  // ClassFeature row, whose scaling mode is pinned to "none" by the adapter
  // above and its dedicated test. If a row ever CAN scale by cantrip level,
  // this call has to start threading the character total separately.
  const resolved = resolveEffectSpec(effect, 0, { characterLevel: classLevel, classLevel });
  let roll = 0;
  if (resolved) {
    for (let i = 0; i < resolved.count; i++) roll += rollDie(resolved.faces);
    roll += resolved.modifier;
  }
  const apply =
    effect.effectType === "heal" && roll > 0
      ? ({ target: "self", kind: "heal", amount: roll } as const)
      : undefined;
  return { spec: { name: row.name, cost, effect, apply }, roll };
}
