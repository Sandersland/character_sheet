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
 *   (prisma/seed.ts's ACTIONS array + the DB Action table it populates are
 *   NOT consumed by any route — routes/character/actions.ts's own header
 *   confirms the catalog is read client-side via actionResolvers, not from
 *   the DB — so DERIVED_ACTIONS here is the actual single source; #1315
 *   found the seed array had already drifted out of sync on 6 pre-existing
 *   rows before this file added 4 more, without anything breaking.)
 *
 * 3. `ACTION_CAST_FN` — cast-core actions that route through `castAbilityInTx`
 *    (pay pool cost → self-apply) instead of the op-list dispatch. Second Wind
 *    (#420) is the first: the fighter spends its Second Wind pool and self-heals
 *    1d10 + level via the shared cast core's self-apply heal path. Action Surge
 *    intentionally stays an `ACTION_EFFECT_FN` counter — its extra-action grant
 *    is a client-side economy effect with no server state to apply.
 */

import type { ActiveBuff } from "@/lib/combat/active-effects.js";
import type { AbilityCost } from "@/lib/spellcasting/ability-cost.js";
import type { EffectSpec } from "@/lib/combat/effects.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { resolveSubclassSlug, type SubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";

export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

// An op referencing an actionKey in neither dispatch table. status → the 400 the
// central `errorHandler` maps, so the actions route needs no try/catch.
export class UnknownActionError extends Error {
  status = 400;
}

/** Rage's melee-damage bonus by barbarian level (+2 / +3 / +4). */
export function rageMeleeDamageBonus(barbarianLevel: number): number {
  return barbarianLevel >= 16 ? 4 : barbarianLevel >= 9 ? 3 : 2;
}

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
// `slug` arrives already resolved (FK-or-name, never substring) from
// deriveActions via resolveSubclassSlug.
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
}

/** Resource pool shape — typed subset of what serializeCharacter builds. */
export interface ResourcePool {
  key: string;
  remaining: number;
}

// The single source of truth for the action catalog — see the file header's
// "Adding a new mechanical action" note (#1315): prisma/seed.ts's ACTIONS
// array is NOT consumed by any route and doesn't need to stay in sync.
const DERIVED_ACTIONS: DerivedActionRecord[] = [
  // Universal actions are intentionally NOT included in `availableActions` on the
  // character because TurnHub already renders them from the client-side
  // UNIVERSAL_ACTIONS list — including them here would duplicate them. Only
  // class-specific (non-universal) actions go in availableActions.

  // Barbarian
  { key: "rage", name: "Rage", cost: "bonusAction", grantClass: "barbarian", grantLevel: 1, resourceKey: "rage", resourceAmount: 1 },
  { key: "endRage", name: "End Rage", cost: "bonusAction", grantClass: "barbarian", grantLevel: 1 },
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

  // Fighter
  { key: "secondWind", name: "Second Wind", cost: "bonusAction", grantClass: "fighter", grantLevel: 1, resourceKey: "secondWind", resourceAmount: 1 },
  { key: "actionSurge", name: "Action Surge", cost: "special", grantClass: "fighter", grantLevel: 2, resourceKey: "actionSurge", resourceAmount: 1 },

  // Monk
  // Martial Arts (#1218): a free Unarmed Strike as a Bonus Action from L1 — no
  // resource cost, gated only on the Martial Arts blanket condition (no armor
  // or Shield), not on the Attack action. Distinct from Flurry of Blows (#1217,
  // the two-strike Focus version).
  { key: "bonusUnarmedStrike", name: "Bonus Unarmed Strike", cost: "bonusAction", grantClass: "monk", grantLevel: 1, requiresUnarmored: true },
  { key: "flurryOfBlows", name: "Flurry of Blows", cost: "bonusAction", grantClass: "monk", grantLevel: 2, resourceKey: "focus", resourceAmount: 1 },
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
  { key: "patientDefense", name: "Patient Defense", cost: "bonusAction", grantClass: "monk", grantLevel: 2, reminder: "Disengage (free bonus action)." },
  {
    key: "patientDefenseFocus",
    name: "Patient Defense (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    reminder: (level) =>
      level >= 10
        ? "Disengage + Dodge (spend 1 Focus). Heightened Focus (L10): also gain temporary hit points equal to two Martial Arts die rolls."
        : "Disengage + Dodge (spend 1 Focus).",
  },
  { key: "stepOfTheWind", name: "Step of the Wind", cost: "bonusAction", grantClass: "monk", grantLevel: 2, reminder: "Dash (free bonus action)." },
  {
    key: "stepOfTheWindFocus",
    name: "Step of the Wind (1 Focus)",
    cost: "bonusAction",
    grantClass: "monk",
    grantLevel: 2,
    resourceKey: "focus",
    resourceAmount: 1,
    reminder: (level) =>
      level >= 10
        ? "Disengage + Dash, jump distance doubled this turn (spend 1 Focus). Heightened Focus (L10): also bring one willing creature within 5 ft along with you, moving it up to your Speed — it doesn't provoke opportunity attacks."
        : "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
  },
  // Stunning Strike (L5) is NOT a selectable action — it's a post-hit rider
  // (spend + Con save + fail/success outcome), built as its own dedicated
  // vertical in stunning-strike.ts, exactly like Sneak Attack bypasses this
  // catalog entirely (#1242 supersedes the #392 bare-spend stub formerly here).
  // Deflect Attacks (#1241, SRD 5.2 L3, renamed from 2014 Deflect Missiles): the base
  // reduction (1d10 + Dex + monk level) costs nothing, so — like the Warrior of Shadow
  // reminders below — it carries no resourceKey and the client rolls it directly (see
  // ACTION_EFFECT_FN comment). Deflect Energy (L13) just widens the damage-type clause
  // in the reminder text; it isn't a separate action key.
  {
    key: "deflectAttacks",
    name: "Deflect Attacks",
    cost: "reaction",
    grantClass: "monk",
    grantLevel: 3,
    reminder:
      "Reaction: when hit by a melee or ranged attack dealing bludgeoning, piercing, or slashing damage (any damage type at L13, Deflect Energy), reduce the damage by 1d10 + Dex modifier + monk level.",
  },
  // Redirect rider: only meaningful once a ranged hit is reduced to 0 — a "free"
  // follow-up decision within the same reaction (mirrors Stunning Strike's shape),
  // not its own action-economy slot. Spends the persisted Focus resource, unlike
  // the free base reduction above.
  { key: "deflectAttacksRedirect", name: "Deflect Attacks — Redirect", cost: "free", grantClass: "monk", grantLevel: 3, resourceKey: "focus", resourceAmount: 1 },
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
  // Warrior of the Open Hand for monk) two Focus-spending session actions
  // (#1315, migrated off a pair of DerivedClassInfo availability booleans) —
  // the real ops live in warrior-of-elements.ts's own endpoint, so neither row
  // gets an ACTION_EFFECT_FN entry. Elemental Attunement is explicitly "no
  // action"; Elemental Burst is a Magic action.
  {
    key: "elementalAttunement",
    name: "Elemental Attunement",
    cost: "free",
    grantClass: "monk",
    grantSubclassSlugs: ["monk-warrior-of-the-elements"],
    grantLevel: 3,
    resourceKey: "focus",
    resourceAmount: 1,
    reminder: "No action, start of your turn: spend 1 focus to imbue yourself with elemental energy for 10 minutes (or until incapacitated). Unarmed Strike reach +10 ft; once per hit, deal Acid/Cold/Fire/Lightning/Thunder damage instead of the normal type, forcing a Strength save (focus DC) to move the target up to 10 ft on a failure.",
  },
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

  // Paladin
  { key: "divineSense", name: "Divine Sense", cost: "action", grantClass: "paladin", grantLevel: 1, resourceKey: "divineSense", resourceAmount: 1 },
  { key: "layOnHands", name: "Lay on Hands", cost: "action", grantClass: "paladin", grantLevel: 1, resourceKey: "layOnHands", resourceAmount: 5 },
  // Channel Divinity is a single cross-class row — see channelDivinity above (PHB'14 p.164).

  // Rogue
  { key: "cunningAction", name: "Cunning Action", cost: "bonusAction", grantClass: "rogue", grantLevel: 2 },

  // Sorcerer
  { key: "metamagic", name: "Metamagic", cost: "free", grantClass: "sorcerer", grantLevel: 3, resourceKey: "sorceryPoints", resourceAmount: 1 },
];

// Class/subclass/level gate for one DERIVED_ACTIONS row — no pool/enabled state.
// The ONE predicate both deriveActions' filter and deriveEntryScopedActions
// (below, which both `availableActions[]` and shadow-arts.ts's cast guards
// resolve through) key off, so a level gate can never drift into two
// independent copies (#1315 — CLAUDE.md's level-gated-registry rule).
function matchesActionGate(
  a: DerivedActionRecord,
  cls: string,
  slug: SubclassSlug | undefined,
  level: number,
): boolean {
  // Only include class-specific actions here (universal handled client-side).
  if (a.universal) return false;

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
 * Returns only CLASS-SPECIFIC actions (not universal ones — those are rendered
 * by TurnHub from the client-side UNIVERSAL_ACTIONS list in turnRules.ts
 * to avoid double-rendering).
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
  unarmoredUnshielded = true,
): AvailableAction[] {
  const cls = (className ?? "").toLowerCase();

  const poolMap = new Map(pools.map((p) => [p.key, p.remaining]));

  return DERIVED_ACTIONS
    .filter((a) => matchesActionGate(a, cls, subclassSlug, level))
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
      };
    });
}

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
export function deriveEntryScopedActions(
  classEntries: (SubclassIdentityInput & { name: string; level: number })[],
  totalLevel: number,
  pools: ResourcePool[],
  unarmoredUnshielded = true,
): AvailableAction[] {
  const seenKeys = new Set<string>();
  const actions: AvailableAction[] = [];
  for (const entry of classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const slug = resolveSubclassSlug(entry.name, entry);
    for (const action of deriveActions(entry.name, slug, effLevel, pools, unarmoredUnshielded)) {
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
export function actionGrantLevel(key: string): number | undefined {
  const row = DERIVED_ACTIONS.find((a) => a.key === key);
  if (!row) return undefined;
  // Min across gates so a row two classes grant (channelDivinity) reports the
  // earliest level any of them grants it, rather than undefined.
  const levels = classGatesOf(row).map((g) => g.minLevel).filter((l) => l > 0);
  return levels.length > 0 ? Math.min(...levels) : undefined;
}

// One action row's enabled/disabledReason — pulled out of the `.map()` above to
// keep that callback's complexity low. Resource-pool gate first, then the
// Martial Arts unarmored/unshielded gate (mutually exclusive today, but a
// future action could carry both — resource wins the reason if so).
function resolveEnablement(
  a: DerivedActionRecord,
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
//    via its own ctx field, same shape as `rageDamageBonus` below.
//  - Use ONLY existing op types (spendResource, adjustQuantity, heal, tempHp,
//    applyBuff, clearBuff).

interface ActionContext {
  /** Arbitrary dice roll total supplied by the client (e.g. potion healing). */
  roll?: number;
  /** ID of the inventory item to consume (e.g. healing potion). */
  inventoryItemId?: string;
  /** Level-derived Rage melee-damage bonus, computed by the route from barbarian level. */
  rageDamageBonus?: number;
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
type ActionOp = SpendResourceOp | AdjustQuantityOp | HealOp | TempHpOp | ApplyBuffOp | ClearBuffOp;

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
  // Rage applies a durable while-active meleeDamage buff (auto-ends via the
  // session turn-hook / long rest / 0 HP) and spends a rage use.
  rage: (ctx) => [
    {
      type: "applyBuff",
      buff: {
        key: "rage",
        target: "meleeDamage",
        modifier: ctx.rageDamageBonus ?? 2,
        source: "Rage",
        duration: "while-active",
        resistDamageTypes: ["bludgeoning", "piercing", "slashing"],
        rollEffects: [
          { mode: "advantage", kind: "check", ability: "strength" },
          { mode: "advantage", kind: "save", ability: "strength" },
        ],
      },
    },
    { type: "spendResource", key: "rage" },
  ],
  // Manual end (bonus action) — the same clear the turn-hook fires automatically.
  endRage: () => [{ type: "clearBuff", key: "rage", reason: "Rage ended" }],
  recklessAttack: () => [], // ephemeral — advantage/disadvantage is tracked by the table

  // Bard
  bardicInspiration: () => [{ type: "spendResource", key: "bardicInspiration" }],

  // Cleric / Paladin — one merged row (see the DERIVED_ACTIONS comment above).
  channelDivinity: () => [{ type: "spendResource", key: "channelDivinity" }],

  // Druid
  wildShape: () => [{ type: "spendResource", key: "wildShape" }],

  // Fighter
  // secondWind is a cast-core action — see ACTION_CAST_FN below.
  // actionSurge stays a pure counter: the extra-action grant is client-side.
  actionSurge: () => [{ type: "spendResource", key: "actionSurge" }],

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
// (pool key + base spend + the self-heal effect); the die value is the client roll.

/** A cast-core action's cost + effect, resolved from the client roll. */
export interface ActionCastSpec {
  name: string;
  cost: AbilityCost;
  effect: EffectSpec;
  apply?: { target: "self"; kind: "heal" | "damage" | "tempHp"; amount: number };
}

// Second Wind's self-heal effect: 1d10 + fighter level (the client rolls the total).
const secondWindEffect: EffectSpec = {
  effectType: "heal",
  dice: { count: 1, faces: 10 },
  scaling: { mode: "none" },
};

export const ACTION_CAST_FN: Record<string, (ctx: ActionContext) => ActionCastSpec> = {
  secondWind: (ctx) => ({
    name: "Second Wind",
    cost: { kind: "pool", key: "secondWind", base: 1 },
    effect: secondWindEffect,
    ...(ctx.roll !== undefined && ctx.roll > 0
      ? { apply: { target: "self" as const, kind: "heal" as const, amount: ctx.roll } }
      : {}),
  }),
};
