/**
 * Action catalog: derive-at-read + effect dispatch table.
 *
 * `actionsFromRows` + `castSpecFromRow` — the general path, post-#1522 retab.
 * A ClassFeature row with `activationCost` (+ `resourceKey`) populated becomes
 * an AvailableAction directly; a row with an `effectKind` rolls its die
 * server-side here rather than trusting a client roll.
 *
 * `DERIVED_ACTIONS` + `deriveActions` — a hardcoded list with exactly one
 * permanent holdout, summonBondedWeapon (see its own comment below for why).
 *
 * `ACTION_EFFECT_FN` — dispatch table keyed by action `key`, returning op
 * arrays (spendResource, adjustQuantity, heal, tempHp, applyBuff, clearBuff)
 * for the actions transactions endpoint. Reached from a row's own
 * `resourceKey` (or its toggle end-key) or a seeded universal Action row; the
 * DERIVED_ACTIONS holdout is a permitted but unused reachability path today —
 * summonBondedWeapon's key sits in NO_DISPATCH_ACTION_KEYS instead.
 *
 * Adding a new mechanical action: give the ClassFeature row an
 * `activationCost` (+ `resourceKey`, `effectKind` if server-rolled) —
 * DERIVED_ACTIONS is for the one case no row descriptor can express, not a
 * general fallback. A row-driven action always resolves through its own
 * `resourceKey` (spendResource at minimum, via applyRowDrivenActionInTx) —
 * add an ACTION_EFFECT_FN entry only when it needs a richer effect (heal,
 * tempHp, …). NO_DISPATCH_ACTION_KEYS is for the other case only: a seeded
 * universal Action row or the DERIVED_ACTIONS holdout with no ClassFeature-row
 * fallback to reach — never a row-driven key, which the seed-side
 * ACTION_EFFECT_FN parity test's orphan check rejects. No migration needed for
 * a new action; only a new column does.
 */

import type { RulesEdition } from "@character-sheet/shared-types";

import type { ActiveBuff } from "@/lib/combat/active-effects.js";
import { readAbilityCost, type AbilityCost } from "@/lib/spellcasting/ability-cost.js";
import { readEffectSpec, resolveEffectSpec, type EffectSpec } from "@/lib/combat/effects.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { resolveSubclassSlug, type SubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";
import { effectBuffsFromRow, type ClassFeatureRow, type ClassFeatureRowsCarrier, type ResourceTotalContext } from "./class-feature-rows.js";
import { monkPoolKey } from "./ki-focus.js";
import { applyAnnounceAugmentors, type AugmentorContext } from "./announce-augmentors.js";
import { DEFAULT_RULES_EDITION } from "@/lib/rules/edition.js";

export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

// An op referencing an actionKey in neither dispatch table. status → the 400 the
// central `errorHandler` maps, so the actions route needs no try/catch.
export class UnknownActionError extends Error {
  status = 400;
}

interface ActionClassGate {
  className: string; // lowercase
  minLevel: number;
}

interface DerivedActionRecord {
  key: string;
  name: string;
  cost: ActionCost;
  universal?: boolean;
  /**
   * Absent means valid in both editions (the default). A row whose mechanics
   * genuinely differ between PHB'14 and PHB'24 is tagged for the edition it
   * describes; matchesActionGate filters on it, the same rule featuresFromRows
   * applies to ClassFeature rows. Most rows are edition-invariant — tag only
   * when the mechanics actually differ or don't exist in the other edition.
   */
  edition?: RulesEdition;
  grantClass?: string;   // lowercase class name
  grantLevel?: number;   // min level for this action
  /**
   * Class/level gates for a row TWO classes grant as ONE feature — matched
   * when ANY gate matches. Channel Divinity is the case: cleric 2 and
   * paladin 3 both grant it as one feature, one pool (PHB'14 p.164).
   * Mutually exclusive with grantClass/grantLevel; both normalize through
   * classGatesOf.
   */
  grantClasses?: ActionClassGate[];
  /**
   * Accepted subclass slugs, resolved via resolveSubclassSlug (FK preferred,
   * exact normalized name as fallback), never a substring match. A list so
   * one row can serve two slugs when the mechanics are genuinely shared.
   */
  grantSubclassSlugs?: SubclassSlug[];
  resourceKey?: string;  // pool key to check for `enabled`
  resourceAmount?: number; // pool units required
  /**
   * In-play rule text for no-server-effect reminder actions. A function form
   * (Heightened Focus, monk L10) lets patientDefenseFocus/stepOfTheWindFocus
   * swap in their L10 rider text without a second row.
   */
  reminder?: string | ((level: number) => string);
  /**
   * A resolved numeric fact the client renders verbatim — today only Flurry
   * of Blows' strike count (flat 2 in SRD 5.1; 2, 3 at Heightened Focus L10,
   * in SRD 5.2). Generic name so a future action can reuse this field; the
   * frontend must never recompute this from a level.
   */
  count?: number | ((level: number) => number);
  /**
   * Deflect Attacks' damage-type clause, resolved from the L13 Deflect
   * Energy threshold so the client never re-derives it: "bludgeoning,
   * piercing, or slashing damage" below L13, "any damage type" at L13+. SRD
   * 5.1's Deflect Missiles carries no such clause.
   */
  damageTypeClause?: string | ((level: number) => string);
  // Martial Arts' blanket condition (Bonus Unarmed Strike) — gates on
  // `unarmoredUnshielded` instead of/alongside a resource pool. Generic so any
  // future Martial-Arts-conditioned action can reuse the same gate.
  requiresUnarmored?: boolean;
  /**
   * Universal action keys this class feature RE-COSTS rather than shadows —
   * Cunning Action buys Dash/Disengage/Hide for a Bonus Action. Gates
   * nothing, consumes nothing extra; the served universal rows keep their
   * own `cost: "action"`.
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
  enabled: boolean;
  disabledReason?: string;
  /** In-play rule text surfaced as the card subtitle + on-use reminder. */
  reminder?: string;
  /**
   * Universal action keys this row re-costs — see DerivedActionRecord.regrants.
   * The client resolves each against GET /api/reference's universalActions
   * for its own edition; it never knows what a key means.
   */
  regrants?: string[];
  /** Resolved numeric fact — see DerivedActionRecord.count. */
  count?: number;
  /** Resolved damage-type clause — see DerivedActionRecord.damageTypeClause. */
  damageTypeClause?: string;
  /**
   * A resolved roll spec for this action, reused from ManeuverEntry.effect
   * rather than a second bespoke field. Attached by buildAvailableActionsView:
   * the Deflect Attacks/Missiles base row carries its reduction spec, the
   * redirect/throw-back row its own, both resolved server-side so the client
   * never re-derives them.
   */
  effect?: EffectSpec;
  /**
   * Which inline resolution tool the client renders for this action — served
   * only for a row-driven action (`actionsFromRows` below); a DERIVED_ACTIONS
   * row leaves this undefined, and the frontend's own ACTION_RESOLVERS table
   * (keyed by actionKey) still owns those. Values mirror the frontend's
   * ResolutionKind enum (actionResolvers.ts).
   */
  resolverKind?: string;
}

/** Resource pool shape — typed subset of what serializeCharacter builds. */
export interface ResourcePool {
  key: string;
  remaining: number;
}

// summonBondedWeapon is the one row that stays TS permanently: its `enabled`
// reads a synthetic "weaponBond" pool built from a LIVE COUNT of
// `weaponBonded` inventory rows — no ClassFeature descriptor column expresses
// a live-inventory gate, so it has no row-driven destination to move to.
// Exported so the seed-side ACTION_EFFECT_FN parity test can check its key
// against the dispatch table without a second hardcoded copy of "summonBondedWeapon".
export const DERIVED_ACTIONS: DerivedActionRecord[] = [
  // Fighter / Eldritch Knight — Weapon Bond (2014, PHB'14 p.75). 2014-only:
  // 2024 Eldritch Knight text is unverified/parked, so this stays 2014 until that lands.
  {
    key: "summonBondedWeapon",
    name: "Summon Bonded Weapon",
    cost: "bonusAction",
    grantClass: "fighter",
    grantLevel: 3,
    grantSubclassSlugs: ["fighter-eldritch-knight"],
    resourceKey: "weaponBond",
    resourceAmount: 1,
    edition: "EDITION_2014",
    reminder: "Drop what you're holding and summon one bonded weapon into your hand. Bonded weapons can't be disarmed.",
  },
];

// Class/subclass/level gate for one DERIVED_ACTIONS row — the one predicate
// both deriveActions and deriveEntryScopedActions key off, so a level gate
// can never drift into two copies. Exported only so the `universal` guard
// below can be tested against a synthetic record: with no real row setting
// that field, deleting the guard would otherwise be undetectable.
export function matchesActionGate(
  a: DerivedActionRecord,
  cls: string,
  slug: SubclassSlug | undefined,
  level: number,
  edition: RulesEdition,
): boolean {
  // Only class-specific actions ride the character payload; universal rows
  // are served separately by referenceRouter. No row sets `universal` today —
  // this guard stays as the structural latch against double-rendering a future one.
  if (a.universal) return false;

  // Edition gate, mirrors featuresFromRows' edition filter: absent `edition`
  // means both editions; a row tagged for the OTHER edition is filtered out
  // before the class/subclass gates below ever see it.
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
 * each with `enabled` from current resource pool `remaining` values. Returns
 * only class-specific actions — universal ones come from GET /api/reference's
 * universalActions instead, so including them here would double-render them.
 * Pure — safe to call inside synchronous serializeCharacter.
 */
export function deriveActions(
  className: string,
  subclassSlug: SubclassSlug | undefined,
  level: number,
  pools: ResourcePool[],
  // Martial Arts blanket condition. Defaults to true (permissive) since only
  // requiresUnarmored actions read it; `edition` sits after this defaulted
  // param (mirrors subclassGateLevel), so a caller needing edition must also
  // pass this explicitly.
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
      const count = typeof a.count === "function" ? a.count(level) : a.count;
      const damageTypeClause = typeof a.damageTypeClause === "function" ? a.damageTypeClause(level) : a.damageTypeClause;
      return {
        key: a.key,
        name: a.name,
        cost: a.cost,
        enabled,
        ...(disabledReason ? { disabledReason } : {}),
        ...(reminder ? { reminder } : {}),
        ...(a.regrants ? { regrants: [...a.regrants] } : {}),
        ...(count !== undefined ? { count } : {}),
        ...(damageTypeClause !== undefined ? { damageTypeClause } : {}),
      };
    });
}

/**
 * Every universal action key any DERIVED_ACTIONS row re-costs, deduped.
 * Exported so the seed-side drift gate can assert each resolves to a seeded
 * `universal: true`, `cost: action` row in BOTH editions — a different check
 * from matchesActionGate's class-row-vs-seed drift gate.
 */
export const REGRANTED_UNIVERSAL_KEYS: readonly string[] = [
  ...new Set(DERIVED_ACTIONS.flatMap((a) => a.regrants ?? [])),
];

/**
 * Entry-scoped `availableActions` derivation: each class entry's own
 * DERIVED_ACTIONS rows at THAT entry's own effective level, deduped by `key`
 * with the PRIMARY entry winning ties — so a secondary entry's gated action
 * surfaces even when that class isn't the primary one. The SAME function
 * shadow-arts.ts's cast guards call, so the wire value and the guard can
 * never independently drift.
 */
export function deriveEntryScopedActions<E extends SubclassIdentityInput & { name: string; level: number }>(
  classEntries: E[],
  totalLevel: number,
  pools: ResourcePool[],
  unarmoredUnshielded = true,
  edition: RulesEdition,
  // Optional: a caller with FEATURE_ROWS_ENTRY_SELECT loaded passes
  // featureRowsOf so a Fighter entry's row-driven actions surface here too.
  getFeatureRows?: (entry: E) => ClassFeatureRowsCarrier | undefined,
  // Supplied only by buildAvailableActionsView (which has effectiveScores);
  // the cast-guard callers read gates only and omit it.
  abilityMods?: Readonly<Record<string, number>>,
): AvailableAction[] {
  const poolMap = new Map(pools.map((p) => [p.key, p.remaining]));
  const seenKeys = new Set<string>();
  const actions: AvailableAction[] = [];
  for (const entry of classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const slug = resolveSubclassSlug(entry.name, entry);
    const rows = getFeatureRows?.(entry);
    const ctx: AugmentorContext = { slug, entryLevel: effLevel, edition, abilityMods };
    const entryActions = [
      ...deriveActions(entry.name, slug, effLevel, pools, unarmoredUnshielded, edition),
      ...actionsFromRows(rows?.classRows ?? [], effLevel, edition, poolMap, unarmoredUnshielded),
      ...actionsFromRows(rows?.subclassRows ?? [], effLevel, edition, poolMap, unarmoredUnshielded),
    ].map((action) => applyAnnounceAugmentors(action, ctx));
    for (const action of entryActions) {
      if (seenKeys.has(action.key)) continue;
      seenKeys.add(action.key);
      actions.push(action);
    }
  }
  return actions;
}

/**
 * A row's own grant level (undefined if the key doesn't resolve to anything)
 * — lets a caller building error text read the single source of truth
 * instead of hardcoding the number again. Checks DERIVED_ACTIONS first, then
 * falls back to a ClassFeature row whose own resourceKey matches `key` for
 * the right edition.
 */
export function actionGrantLevel(
  key: string,
  edition: RulesEdition,
  rows?: readonly ClassFeatureRow[],
): number | undefined {
  // Filters on edition before find — a no-op today (no key is duplicated
  // across editions) but guards against a future same-key row per edition.
  const row = DERIVED_ACTIONS.find((a) => a.key === key && (a.edition === undefined || a.edition === edition));
  if (row) {
    // Min across gates so a row two classes grant (channelDivinity) reports
    // the earliest level any of them grants it, rather than undefined.
    const levels = classGatesOf(row).map((g) => g.minLevel).filter((l) => l > 0);
    return levels.length > 0 ? Math.min(...levels) : undefined;
  }
  const featureRow = rows?.find((r) => r.edition === edition && r.resourceKey === key);
  return featureRow?.level;
}

// The subset resolveEnablement needs, narrowed to three fields so a
// row-driven caller can build a plain object literal instead of a lying cast
// to the full DerivedActionRecord.
type EnablementInput = Pick<DerivedActionRecord, "resourceKey" | "resourceAmount" | "requiresUnarmored">;

// Resource-pool gate first, then the Martial Arts unarmored/unshielded gate
// (mutually exclusive today; resource wins the reason if an action ever needs both).
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

// Keyed by action `key`. Each fn receives an execution context and returns an
// array of op objects the orchestrator dispatches within a single Prisma
// transaction. Convention: return op arrays, never side-effect directly; a
// client-side roll arrives via ctx.roll and is validated, not recomputed; a
// server-rolled value with no client input is precomputed by the route and
// passed through its own ctx field. Use only the existing op types below.
//
// A while-active BUFF-GRANTING feature does not belong in this table — author
// it as a ClassFeature row with resolverKind "toggle" + effectBuffs instead
// (toggleActionsFromRow/toggleRowOps below); this table is for actions with
// no buff to grant.

interface ActionContext {
  /** Arbitrary dice roll total supplied by the client (e.g. potion healing). */
  roll?: number;
  /** ID of the inventory item to consume (e.g. healing potion). */
  inventoryItemId?: string;
  /**
   * Heightened Focus (monk L10, PHB'24 p.98/SRD 5.2): temp HP for Patient
   * Defense's Focus variant, rolled server-side by the route before dispatch.
   * Undefined/0 below L10, so patientDefenseFocus simply omits the tempHp op.
   */
  heightenedFocusTempHp?: number;
  /**
   * The character's rules edition — read by any effect fn whose spend
   * targets an edition-forked pool key under the SAME action key (Flurry of
   * Blows: "focus" for a 2024 monk, "ki" for a 2014 monk, via monkPoolKey).
   * Optional so existing unit-test call sites exercising unrelated keys don't
   * need to thread it; the real route always supplies it.
   */
  edition?: RulesEdition;
}

type SpendResourceOp = { type: "spendResource"; key: string; amount?: number };
type AdjustQuantityOp = { type: "adjustQuantity"; inventoryItemId: string; delta: number };
type HealOp = { type: "heal"; amount: number };
type TempHpOp = { type: "tempHp"; amount: number };
type ApplyBuffOp = { type: "applyBuff"; buff: Omit<ActiveBuff, "id"> };
type ClearBuffOp = { type: "clearBuff"; key: string; reason: string };
// Exported so toggleRowOps below and the routes/character/actions.ts
// dispatcher share this exact union instead of a second, equal copy.
export type ActionOp = SpendResourceOp | AdjustQuantityOp | HealOp | TempHpOp | ApplyBuffOp | ClearBuffOp;

type EffectFn = (ctx: ActionContext) => ActionOp[];

// Universal Action rows and the DERIVED_ACTIONS holdout with no ACTION_EFFECT_FN
// entry and no ClassFeature-row fallback (they aren't row-driven, so
// eligibleRowActions can never resolve them either) — dispatching any of these
// would be the runtime UnknownActionError the module doc above warns about.
// Two different frontend mechanisms keep that from ever happening. castSpellBonus/
// shove/summonBondedWeapon have a real ACTION_RESOLVERS entry (actionResolvers.ts)
// marked serverEffect: false, so planActionClick never sends. study/influence have
// NO ACTION_RESOLVERS entry at all — and, as universal actions, never appear in
// availableActions either — so resolverFor(key, undefined) returns undefined and
// useTurnActions' own no-resolver fallback sends nothing. That's a thinner latch
// than the other three: a future universal row served with its own resolverKind
// would flip study/influence into resolverFromRow's serverEffect: true default
// and start dispatching them for real. Read only by the seed-side
// action-effect-parity test; not consulted by the dispatcher itself.
export const NO_DISPATCH_ACTION_KEYS: readonly string[] = [
  // App affordance, not a distinct action — renders nowhere today, dead
  // content until #1431/#1439.
  "castSpellBonus",
  // Narrated only — no target-combatant model to apply a contest outcome to
  // (self-or-announce).
  "shove",
  // SRD 5.2-only reminder actions (ability-check prompts), no server state.
  "study",
  "influence",
  // The DERIVED_ACTIONS holdout documented above — reminder-only, never sent
  // to actions/transactions.
  "summonBondedWeapon",
];

export const ACTION_EFFECT_FN: Record<string, EffectFn> = {
  // Generic no-op actions — ephemeral only, no server effect needed.
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

  recklessAttack: () => [], // ephemeral — advantage/disadvantage is tracked by the table

  bardicInspiration: () => [{ type: "spendResource", key: "bardicInspiration" }],

  // Cleric / Paladin share one row (channelDivinity).
  channelDivinity: () => [{ type: "spendResource", key: "channelDivinity" }],

  wildShape: () => [{ type: "spendResource", key: "wildShape" }],

  // bonusUnarmedStrike is economy-only, like `attack`/`twf` — no server state
  // to spend, the gate is already applied at derive time (requiresUnarmored).
  bonusUnarmedStrike: () => [],
  // ONE function serves BOTH editions' flurryOfBlows row — the pool key
  // itself forks (monkPoolKey), so this resolves it from ctx.edition rather
  // than hardcoding "focus" the way every other monk spend below safely can
  // (their action keys are edition-exclusive; this one key is shared).
  flurryOfBlows: (ctx) => [{ type: "spendResource", key: monkPoolKey(ctx.edition ?? DEFAULT_RULES_EDITION) }],
  // patientDefense / stepOfTheWind (the free 2024 variants) have no entry
  // here — economy-only, like Shadow Step/Opportunist; a serverEffect:false
  // resolver never calls send(), so no dispatch entry is needed.
  patientDefenseFocus: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "focus" }];
    // Heightened Focus (monk L10): the route pre-rolls two Martial Arts die
    // rolls into ctx.heightenedFocusTempHp (0/undefined below L10), so the
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
  // SRD 5.1: flat 1-ki cost, no free variant — its own distinct keys rather
  // than reusing patientDefense/stepOfTheWind (those are pinned
  // serverEffect:false in the frontend). Both keys are 2014-exclusive, so
  // hardcoding "ki" here is safe.
  patientDefenseKi: () => [{ type: "spendResource", key: "ki" }],
  stepOfTheWindKi: () => [{ type: "spendResource", key: "ki" }],
  // stunningStrike is not here — it's a post-hit rider in stunning-strike.ts.
  // Wholeness of Body mirrors layOnHands' shape (spend the pool, heal the
  // client-rolled amount) but spends a flat 1 use, not a variable HP-pool
  // draw. Open Hand Technique / Quivering Palm have their own dedicated
  // verticals, not an entry here.
  wholenessOfBody: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "wholenessOfBody" }];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  // 2014's Wholeness of Body — a thin duplicate of wholenessOfBody's
  // spend+heal shape, registered under its own key because the two editions'
  // rows are separate.
  // fallow-ignore-next-line code-duplication -- deliberately identical to wholenessOfBody; ACTION_EFFECT_FN is keyed by action key, and the two keys must stay distinct
  wholenessOfBodyAction: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "wholenessOfBody" }];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  // fleetStep/tranquility have no entry — pure reminders, no server state to
  // spend. Hand of Healing applies to the acting character only (no
  // cross-character heal path exists); the client-rolled amount already
  // includes the Martial Arts die + Wis mod. Physician's Touch's
  // condition-cure is reminder text only.
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
  // deflectAttacks (the base reduction) has no entry here — it's a pure
  // reminder action like shadowStep: the client rolls 1d10 + Dex + monk
  // level and never calls the transactions endpoint. Only the redirect
  // below is real, persisted state.
  deflectAttacksRedirect: () => [{ type: "spendResource", key: "focus" }],
  // deflectMissiles (2014 base reduction) has no entry here either, same
  // reasoning. The throw-back is the persisted 1-ki spend (its own damage
  // roll is client-rolled and narrated only — no target-combatant model to
  // apply it to).
  deflectMissilesThrow: () => [{ type: "spendResource", key: "ki" }],
  // emptyBody / emptyBodyAstralProjection have no entry here — like
  // shadowArts/cloakOfShadows, they're gating + reminder rows only
  // (resourceKey/resourceAmount drive the enabled/disabled display); no
  // ACTION_RESOLVERS entry exists either, so neither renders a clickable
  // card yet.

  divineSense: () => [{ type: "spendResource", key: "divineSense" }],
  layOnHands: (ctx) => {
    const amount = ctx.roll ?? 0;
    const ops: ActionOp[] = [{ type: "spendResource", key: "layOnHands", amount }];
    if (amount > 0) {
      ops.push({ type: "heal", amount });
    }
    return ops;
  },

  cunningAction: () => [], // bonus action consumed ephemerally; no server effect

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
 * One row's AvailableAction, or null when it declares no activation
 * (`activationCost` absent) or the grant level isn't reached. Data-gated:
 * only a row with BOTH `activationCost` and `resourceKey` populated
 * contributes. `enabled`/`disabledReason` reuse `resolveEnablement` so a
 * row's gate can never diverge from a DERIVED_ACTIONS row's.
 */
// The row-driven gate: right edition, grant level reached, and the two
// fields that make a row an action at all. Split out to keep actionFromRow's
// own cyclomatic count low (fallow's complexity gate).
// Must stay identical to eligibleRowActions' own gate (routes/character/actions.ts)
// and action-effect-parity.test.ts's CLASS_FEATURE_ROW_KEYS — update all three together.
function rowIsAnAvailableAction(row: ClassFeatureRow, level: number, edition: RulesEdition): boolean {
  return row.edition === edition && row.level <= level && Boolean(row.activationCost) && Boolean(row.resourceKey);
}

// The optional AvailableAction fields a row may populate — isolated from
// buildRowAction so that function's own branching budget covers only the
// gate/reminder logic (fallow's complexity gate).
function optionalRowActionFields(
  row: ClassFeatureRow,
  reminder: string | undefined,
  disabledReason: string | undefined,
): Pick<AvailableAction, "disabledReason" | "reminder" | "resolverKind" | "regrants" | "count"> {
  return {
    ...(disabledReason ? { disabledReason } : {}),
    ...(reminder ? { reminder } : {}),
    ...(row.resolverKind ? { resolverKind: row.resolverKind } : {}),
    ...(row.regrants && row.regrants.length > 0 ? { regrants: [...row.regrants] } : {}),
    // A level-gated bump (Heightened Focus) folds in afterward via an
    // announce-augmentor payload, never a second row.
    ...(row.count !== undefined && row.count !== null ? { count: row.count } : {}),
  };
}

// Assembles the AvailableAction object once enablement is known — pulled out
// of actionFromRow to keep its own branching budget for the gate check.
function buildRowAction(
  row: ClassFeatureRow,
  level: number,
  enabled: boolean,
  disabledReason: string | undefined,
): AvailableAction {
  // Derived heal text wins over the row's own static `reminder` column — a
  // row with an effectKind (Second Wind) keeps its computed "Regain NdM HP"
  // subtitle; a row with no derived text (Lay on Hands, Metamagic, …) falls
  // through to `row.reminder`.
  const reminder = describeRowReminder(row, level) ?? row.reminder ?? undefined;
  return {
    key: row.resourceKey as string,
    name: row.name,
    cost: row.activationCost as ActionCost,
    enabled,
    ...optionalRowActionFields(row, reminder, disabledReason),
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
  // Gates on the COST pool (cost.key/cost.base), not row.resourceKey (the
  // row's IDENTITY) — they coincide for an identity==pool row (Second Wind)
  // but diverge for Metamagic (resourceKey "metamagic" serves the card,
  // costPoolKey "sorceryPoints" is what's spent); reading resourceKey here
  // would check a pool that doesn't exist and permanently disable the
  // action. `row.resourceKey` still supplies the SERVED action key
  // (buildRowAction), unaffected by this gate.
  const record: EnablementInput = {
    resourceKey: cost.kind === "pool" ? cost.key : undefined,
    resourceAmount: cost.kind === "pool" ? cost.base : undefined,
    requiresUnarmored: row.requiresUnarmored ?? false,
  };
  const { enabled, disabledReason } = resolveEnablement(record, poolMap, unarmoredUnshielded);
  return buildRowAction(row, level, enabled, disabledReason);
}

// "rage" -> "endRage" — this exact string is load-bearing:
// DURABLE_BUFF_END_CONDITIONS (frontend/src/lib/turnHooks.ts) hardcodes
// "endRage" as the auto-end action keyed by the "rage" buff. Must keep
// producing that string for Rage forever, not merely today.
export function endActionKey(activateKey: string): string {
  return `end${activateKey.charAt(0).toUpperCase()}${activateKey.slice(1)}`;
}

/**
 * A "toggle" row's own AvailableAction PAIR: synthesizes an activate entry
 * (key = row.resourceKey) and an end entry (key = endActionKey(activateKey))
 * from ONE row. Enablement checks the row's own cost pool
 * (costPoolKey/costBase), not resourceKey/resourceAmount: resourceKey is
 * this row's IDENTITY, not necessarily the pool it draws from (Elemental
 * Attunement's identity is "elementalAttunement" but its cost draws from the
 * shared "focus" pool; they coincide only when a feature spends its OWN
 * dedicated pool, Rage's case). The end action is always enabled — clearing
 * an inactive buff is already a safe no-op.
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
 * The generic "toggle" effect handler: instantiates a row's `effectBuffs` as
 * ActiveBuff ops on activation, or clears them by key on end. `ctx.level` is
 * the granting class entry's OWN effective level, never the character's
 * total level — the level effectBuffsFromRow uses for both a buff entry's
 * own minLevel gate and a tiered modifier's evaluation. Activation also pays
 * the row's own cost, omitting `amount` when it's 1 to match every existing
 * hand-authored spend's shape.
 */
export function toggleRowOps(row: ClassFeatureRow, ctx: ResourceTotalContext, isEnd: boolean): ActionOp[] {
  const buffs = effectBuffsFromRow(row, ctx);
  if (isEnd) {
    return buffs.map((b) => ({ type: "clearBuff", key: b.key, reason: `${row.name} ended` }));
  }
  // Fail loud rather than silently spend the pool for nothing — this only
  // happens for a misauthored row or one whose every buff is gated above ctx.level.
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
      ...(b.clearOn ? { clearOn: b.clearOn } : {}),
      ...(b.resistDamageTypes ? { resistDamageTypes: b.resistDamageTypes } : {}),
      ...(b.conditionImmunities ? { conditionImmunities: b.conditionImmunities } : {}),
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
 * from the row's own effect columns — the level-scaled modifier is resolved
 * here since the row only knows its grant level, not the character's
 * current one. Undefined for a non-heal or dice-less row (Action Surge).
 */
function describeRowReminder(row: ClassFeatureRow, level: number): string | undefined {
  if (row.effectKind !== "heal" || !row.effectDiceCount || !row.effectDiceFaces) return undefined;
  const modifier = row.effectModifierSource === "classLevel" ? level : 0;
  return `Regain ${row.effectDiceCount}d${row.effectDiceFaces}${modifier > 0 ? ` + ${modifier}` : ""} HP`;
}

/**
 * Every row-driven action declared across a class/subclass's rows, at one
 * character level — the row-driven counterpart to `deriveActions`. Called
 * once per class-rows and once per subclass-rows by deriveEntryScopedActions.
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
    // A "toggle" row synthesizes an activate/end PAIR, never a single
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
 * server-side. `rollDie` is injected so this stays a pure function.
 *
 * The `{ ...row, level: 0 }` adapter matters: `EffectRow.level` decides the
 * SCALING axis (cantrip/upcast), which a ClassFeature row has no use for —
 * `row.level` here is the CHARACTER level the feature is GRANTED at, a
 * different number entirely. Passing it through unadapted would let
 * resolveEffectScaling reinterpret a grant level as a spell level. Level 0
 * with no cantripScaling/upcastDicePerLevel lands on `{ mode: "none" }`, the
 * only scaling mode a ClassFeature row can ever resolve to.
 */
export function castSpecFromRow(
  row: ClassFeatureRow,
  classLevel: number,
  rollDie: (faces: number) => number,
): { spec: ActionCastSpec; roll: number } {
  const cost = readAbilityCost(row);
  const effect = readEffectSpec({ ...row, level: 0 });
  // Both level axes get the GRANTING ENTRY's level, not the character total:
  // classLevel because modifierSource: "classLevel" means it (Second Wind is
  // "1d10 + your Fighter level"); characterLevel because that axis (cantrip
  // scaling) is unreachable from a ClassFeature row, pinned to "none" above.
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
