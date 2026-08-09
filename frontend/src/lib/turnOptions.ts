/**
 * turnOptions.ts — pure render models for the TurnHub option-card sheets.
 *
 * No React, no JSX, no side effects. Composes the existing derivations
 * (attackMath, spellPicker, resource pools, resolver metadata) into the
 * display strings the Action / Bonus Action / Reaction pickers render, so
 * the sheet components stay presentational and this logic stays unit-testable.
 *
 * Icons deliberately live in the components (key → IconType maps), not here.
 */

import { buildAttackEntries, buildOffHandEntry } from "@/lib/attackMath";
import { formatRollSpec } from "@/lib/dice";
import { effectPreview } from "@/lib/spellMeta";
import {
  availableArcanaLevels,
  availableSlotLevels,
  filterCastableSpells,
  sortSpells,
  spellRestrictionFlags,
  type SpellCastThisTurn,
} from "@/lib/spellPicker";
import { resolverFor, type ActionResolver } from "@/features/session/actionResolvers";
import type { AvailableAction, Character, ResourcePool, UniversalActionOption } from "@/types/character";

/** "Longsword · +7 to hit · 1d8 + 4 slashing" for the first attack row
 *  (first equipped weapon, falling back naturally to Unarmed Strike). */
export function mainWeaponSummary(character: Character): string {
  const entry = buildAttackEntries(character)[0];
  return `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}`;
}

/** Off-hand (TWF) equivalent, or null when the loadout can't dual-wield. */
export function offHandSummary(character: Character): string | null {
  const entry = buildOffHandEntry(character);
  return entry ? `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}` : null;
}

/** Total consumable quantity in the pack — the "×N" badge on Use an item. */
export function consumableCount(character: Character): number {
  return character.inventory
    .filter((item) => item.category === "consumable")
    .reduce((sum, item) => sum + item.quantity, 0);
}

/** Resource-pool badge for a class action, e.g. "1 / rest", or undefined
 *  when the action spends no pool (or the pool isn't on the character). */
export function poolBadgeFor(
  resourceKey: string | undefined,
  pools: ResourcePool[] | undefined,
): string | undefined {
  if (!resourceKey) return undefined;
  const pool = pools?.find((p) => p.key === resourceKey);
  if (!pool) return undefined;
  switch (pool.recharge) {
    case "shortRest":
    case "short-or-long":
      return `${pool.remaining} / rest`;
    case "longRest":
      return `${pool.remaining} / long rest`;
    default:
      return `×${pool.remaining}`;
  }
}

/** Render model for one class-action option card. */
export interface ClassActionOption {
  key: string;
  title: string;
  enabled: boolean;
  disabledReason?: string;
  /** e.g. "Regain 1d10 + 3 HP" for heal-roll resolvers; undefined otherwise. */
  subtitle?: string;
  /** Pool badge, e.g. "1 / rest". */
  badge?: string;
  /** True for self-heal resolvers — the card renders in the vitality tone. */
  heal: boolean;
  /**
   * Names of the universal actions this class row re-costs (#1431), resolved
   * from the served rows for the character's edition. Absent when the row
   * regrants nothing OR when nothing resolved — an unresolved key is dropped
   * silently, because the reference query is simply not in yet on first paint;
   * the seed/route drift tests are the gate against a genuinely bogus key, not
   * this renderer.
   */
  regrantNames?: string[];
}

/**
 * Flurry of Blows spends "focus" (2024) or "ki" (2014, #1500) — the served
 * AvailableAction carries no resourceKey on the wire (only a row-driven
 * action does), so the client can't read the edition-correct pool key off
 * anything server-sent; it looks for whichever of the two the character
 * actually has instead (a monk only ever has one).
 */
function monkFlurryPool(pools: ResourcePool[] | undefined): ResourcePool | undefined {
  return pools?.find((p) => p.key === "focus" || p.key === "ki");
}

/**
 * "Spend 1 Focus Points" / "Spend 1 Ki Points" caption for Flurry of Blows —
 * its card otherwise shows only the pool's REMAINING total (the badge),
 * never the per-use cost (#1217). Reads the pool's own `label` (never the
 * raw resourceKey) so this never renders a bare camelCase key in the UI.
 * Undefined when neither pool is on the character (e.g. a non-monk somehow
 * seeing this action).
 */
function flurrySpendLabel(pools: ResourcePool[] | undefined): string | undefined {
  const pool = monkFlurryPool(pools);
  return pool ? `Spend 1 ${pool.label}` : undefined;
}

/**
 * Pool badge for one class action — split out of classActionOption to keep
 * that function's own branching budget low (fallow's complexity gate).
 * Flurry of Blows (#1500) is the one exception to "read resolver.resourceKey":
 * it resolves off whichever monk pool the character actually has (see
 * monkFlurryPool) rather than the static ACTION_RESOLVERS table's hardcoded
 * "focus" — a 2014 monk's card would otherwise show no badge at all.
 */
function classActionBadge(action: AvailableAction, resolver: ActionResolver | undefined, character: Character): string | undefined {
  const pools = character.resources?.pools;
  const resourceKey = action.key === "flurryOfBlows" ? monkFlurryPool(pools)?.key : resolver?.resourceKey;
  return poolBadgeFor(resourceKey, pools);
}

/**
 * Subtitle for one class action — split out of classActionOption for the
 * same complexity-budget reason as classActionBadge above. Heal-roll actions
 * preview their heal; a resolver-level static subtitle (Bonus Unarmed
 * Strike, #1218) wins next; Flurry surfaces its Focus/Ki cost (#1217/#1500,
 * singled out rather than generalized to every resource-costing action — a
 * broader "spend N" caption is a separate design call); every other
 * reminder-only action (e.g. Shadow Step) shows its rule text.
 */
function classActionSubtitle(action: AvailableAction, resolver: ActionResolver | undefined, character: Character): string | undefined {
  if (resolver?.kind === "heal-roll" && resolver.healRoll) {
    return `Regain ${formatRollSpec(resolver.healRoll(character))} HP`;
  }
  if (resolver?.subtitle) return resolver.subtitle;
  if (action.key === "flurryOfBlows") return flurrySpendLabel(character.resources?.pools);
  return action.reminder;
}

/** Enrich a backend AvailableAction with resolver-derived subtitle + pool badge. */
export function classActionOption(
  action: AvailableAction,
  resolver: ActionResolver | undefined,
  character: Character,
  // The rows GET /api/reference served for this character's edition (#1430) —
  // the only place a regranted key's display name exists, since one key can
  // resolve to two names across editions.
  universalActions: UniversalActionOption[],
): ClassActionOption {
  const regrantNames = (action.regrants ?? [])
    .map((key) => universalActions.find((u) => u.key === key)?.name)
    .filter((name): name is string => name !== undefined);
  const heal = resolver?.kind === "heal-roll" || resolver?.kind === "heal-input";
  const badge = classActionBadge(action, resolver, character);
  const subtitle = classActionSubtitle(action, resolver, character);
  return {
    key: action.key,
    title: action.name,
    enabled: action.enabled,
    ...(action.disabledReason ? { disabledReason: action.disabledReason } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(badge ? { badge } : {}),
    heal,
    ...(regrantNames.length > 0 ? { regrantNames } : {}),
  };
}

/** The three turn-hub menu partitions of `character.availableActions`. */
export interface ClassActionPartitions {
  classActions: AvailableAction[];
  classBonusActions: AvailableAction[];
  classReactions: AvailableAction[];
}

/**
 * Partitions `availableActions` by action-economy cost for the three TurnHub
 * menus. Only actions with a registered ACTION_RESOLVERS entry are included —
 * a DERIVED_ACTIONS row with no resolver (e.g. Shadow Arts/Cloak of
 * Shadows/Elemental Burst, #1315: cast through their own dedicated
 * /abilities/* endpoints + Class-tab sections, not this generic dispatch)
 * would otherwise render a clickable card whose click just consumes the slot
 * and does nothing (planActionClick's no-resolver fallback is
 * `{consumeSlot:true, send:"none"}`).
 */
export function partitionClassActions(
  availableActions: AvailableAction[],
  raging: boolean,
): ClassActionPartitions {
  // resolverFor(a.key, a) — passing the action itself (#1528) so a row-driven
  // key (Second Wind/Action Surge, no ACTION_RESOLVERS entry anymore) still
  // resolves via its served `resolverKind` instead of being filtered out here
  // silently (the exact "vanishes with no test failure" hazard the ordering
  // matters for).
  const withResolver = availableActions.filter((a) => resolverFor(a.key, a) !== undefined);
  return {
    classActions: withResolver.filter((a) => a.cost === "action"),
    // While raging, swap the Rage affordance for End Rage (both are bonus actions).
    classBonusActions: withResolver.filter(
      (a) => a.cost === "bonusAction" && a.key !== (raging ? "rage" : "endRage"),
    ),
    classReactions: withResolver.filter((a) => a.cost === "reaction"),
  };
}

/** Render model for one castable bonus-action spell card. */
export interface BonusSpellOption {
  /** Spellbook entry id (Spell.id) — passed to the pre-selected cast flow. */
  spellId: string;
  name: string;
  /** "Bonus-action cast · 1d4 + 3 healing" (effect preview when derivable). */
  subtitle: string;
  /** "at will" for cantrips, "L1 slot" etc. for leveled spells. */
  badge: string;
}

/**
 * Castable bonus-action spells for the Bonus Action sheet. Mirrors
 * InlineSpellPicker's own deriveSpellList filtering argument-for-argument
 * (same pure spellPicker.ts predicates, castingTimeFilter "1 bonus action")
 * so the card list and the picker that opens from it can never disagree.
 */
export function bonusSpellOptions(
  character: Character,
  spellCastThisTurn: SpellCastThisTurn,
): BonusSpellOption[] {
  const spellcasting = character.spellcasting;
  if (!spellcasting) return [];
  const slotLevels = availableSlotLevels(spellcasting.slots ?? []);
  const arcanaLevels = availableArcanaLevels(spellcasting.arcana ?? []);
  const { bonusActionBlockedByActionSpell, actionLimitedToCantrips } = spellRestrictionFlags(
    "bonusAction",
    spellCastThisTurn,
  );
  const castable = filterCastableSpells(spellcasting.spells ?? [], {
    castingTimeFilter: "1 bonus action",
    slotLevels,
    arcanaLevels,
    bonusActionBlockedByActionSpell,
    actionLimitedToCantrips,
  });
  return sortSpells(castable).map((spell) => {
    const preview = effectPreview(spell);
    return {
      spellId: spell.id,
      name: spell.name,
      subtitle: preview ? `Bonus-action cast · ${preview}` : "Bonus-action cast",
      badge: spell.level === 0 ? "at will" : `L${spell.level} slot`,
    };
  });
}

/**
 * Whether the served off-hand / Two-Weapon Fighting affordance is enabled
 * (#1435) — the eligibility rule (both equipped weapons Light) is resolved
 * server-side onto the `offHandAttack` action row; the client reads the flag,
 * never re-derives it from inventory. False when the row isn't served yet.
 */
export function offHandAttackEnabled(character: Character): boolean {
  return character.availableActions?.find((a) => a.key === "offHandAttack")?.enabled ?? false;
}

/**
 * Footer hint for the Bonus Action sheet when TWF is unavailable. Names a
 * concrete owned light-weapon pair when one exists ("equip Two Shortswords…"),
 * else falls back to the generic requirement. Null when TWF is already live.
 * The eligibility comes off the served row (offHandAttackEnabled); the
 * item-name suggestion below stays client-side chrome (issue #1435 decision).
 */
export function twfHint(character: Character): string | null {
  if (offHandAttackEnabled(character)) return null;
  const lightWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.weapon?.light === true,
  );
  if (lightWeapons.length < 2) {
    return "Off-hand attack needs two light weapons equipped.";
  }
  const [first, second] = lightWeapons;
  // Same-name pair: "Two Shortswords" — but an s-ending name (custom items)
  // can't take the naive plural, so fall back to "a pair of Cutlass".
  const samePair = first.name.endsWith("s") ? `a pair of ${first.name}` : `Two ${first.name}s`;
  const pair = first.name === second.name ? samePair : `${first.name} & ${second.name}`;
  return `Off-hand attack needs two light weapons — equip ${pair} to enable it.`;
}

/** Which universal actions render as primary rich cards on the Action sheet;
 *  everything else falls into the "More actions" disclosure grid.
 *
 *  Keys, not names, so this survives the 2024 renames (Magic / Utilize) — and
 *  this set plus MICRO_CAPTIONS are the two client-side key lists that would
 *  silently not cover a future 2014-ONLY universal action. No such action
 *  exists in either SRD; every fork today is a rename or a 2024 addition. */
export const PRIMARY_ACTION_KEYS: ReadonlySet<string> = new Set([
  "attack",
  "castSpell",
  "useObject",
  "dash",
  "dodge",
]);

/** Micro-captions for the compact card variants (Dash/Dodge pair + More grid).
 *  `search`'s caption stays edition-neutral: SRD 5.1 offers Perception OR
 *  Investigation, SRD 5.2 a Wisdom check the GM picks a skill for. */
export const MICRO_CAPTIONS: Record<string, string> = {
  dash: "×2 move",
  dodge: "defensive",
  disengage: "no OA",
  help: "adv. ally",
  hide: "stealth",
  search: "notice",
  ready: "trigger",
  grapple: "grab",
  shove: "push/prone",
  study: "recall",
  influence: "persuade",
};

/** Collapsed-row preview line: "Disengage · Hide · Help · …" (CSS truncates). */
export function moreActionsPreview(actions: UniversalActionOption[]): string {
  return actions.map((a) => a.name).join(" · ");
}

/** Sheet models built in useTurnActions, consumed by the sheet bodies. */
export interface ActionSheetModel {
  attackSummary: string;
  /** Universal actions for the requested edition, served by GET /api/reference
   *  (#1430) and threaded through the model so the sheet bodies stay
   *  presentational — they never call the hook themselves. Empty until the
   *  reference query resolves. */
  universalActions: UniversalActionOption[];
  consumableCount: number;
  hasSpellcasting: boolean;
  classActionOptions: ClassActionOption[];
  /** Current hands summary for the "Change weapons" card (#815). */
  loadoutLabel: string;
  /** Free interaction units left this turn (#1165) — gates the Change weapons card independent of the Action. */
  interactionBudgetRemaining: number;
}

export interface BonusSheetModel {
  classBonusOptions: ClassActionOption[];
  bonusSpells: BonusSpellOption[];
  twfHintText: string | null;
  offHandSummary: string | null;
}

export interface ReactionSheetModel {
  attackSummary: string;
  /** See ActionSheetModel.universalActions. */
  universalActions: UniversalActionOption[];
  hasSpellcasting: boolean;
  classReactionOptions: ClassActionOption[];
}
