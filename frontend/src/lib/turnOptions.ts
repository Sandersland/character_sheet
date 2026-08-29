import { buildAttackEntries, buildOffHandEntry } from "@/lib/attackMath";
import { formatRollSpec } from "@/lib/dice";
import { effectPreview } from "@/lib/spellMeta";
import {
  availableArcanaLevels,
  availableSlotLevels,
  filterCastableSpells,
  restrictionFlagsForSlot,
  sortSpells,
} from "@/lib/spellPicker";
import { resolverFor, type ActionResolver } from "@/features/session/actionResolvers";
import type {
  AvailableAction,
  Character,
  ResourcePool,
  SpellEconomyState,
  UniversalActionOption,
} from "@/types/character";

export function mainWeaponSummary(character: Character): string {
  const entry = buildAttackEntries(character)[0];
  return `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}`;
}

export function offHandSummary(character: Character): string | null {
  const entry = buildOffHandEntry(character);
  return entry ? `${entry.name} · ${entry.attackLabel} to hit · ${entry.damageLabel}` : null;
}

export function consumableCount(character: Character): number {
  return character.inventory
    .filter((item) => item.category === "consumable")
    .reduce((sum, item) => sum + item.quantity, 0);
}

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

export interface ClassActionOption {
  key: string;
  title: string;
  enabled: boolean;
  disabledReason?: string;
  subtitle?: string;
  badge?: string;
  heal: boolean;
  // regrantNames omits unresolved keys silently (#1431) — first-paint races the
  // reference query; seed/route drift tests, not this renderer, catch a
  // genuinely bad key.
  regrantNames?: string[];
}

// Flurry's served action carries no resourceKey on the wire, so this reads
// whichever edition-specific pool ("focus" 2024 / "ki" 2014, #1500) the
// character actually has instead.
function monkFlurryPool(pools: ResourcePool[] | undefined): ResourcePool | undefined {
  return pools?.find((p) => p.key === "focus" || p.key === "ki");
}

// Shows the per-use cost (#1217), unlike the badge which shows only the pool's
// remaining total; reads the pool's own `label`, never the raw resourceKey.
function flurrySpendLabel(pools: ResourcePool[] | undefined): string | undefined {
  const pool = monkFlurryPool(pools);
  return pool ? `Spend 1 ${pool.label}` : undefined;
}

// Split out of classActionOption to keep its complexity under fallow's gate.
function classActionBadge(action: AvailableAction, resolver: ActionResolver | undefined, character: Character): string | undefined {
  const pools = character.resources?.pools;
  const resourceKey = action.key === "flurryOfBlows" ? monkFlurryPool(pools)?.key : resolver?.resourceKey;
  return poolBadgeFor(resourceKey, pools);
}

// Split out of classActionOption for the same complexity-budget reason as
// classActionBadge above.
function classActionSubtitle(action: AvailableAction, resolver: ActionResolver | undefined, character: Character): string | undefined {
  if (resolver?.kind === "heal-roll" && resolver.healRoll) {
    return `Regain ${formatRollSpec(resolver.healRoll(character))} HP`;
  }
  if (resolver?.subtitle) return resolver.subtitle;
  if (action.key === "flurryOfBlows") return flurrySpendLabel(character.resources?.pools);
  return action.reminder;
}

export function classActionOption(
  action: AvailableAction,
  resolver: ActionResolver | undefined,
  character: Character,
  // The rows GET /api/reference served for this edition (#1430) — the only
  // place a regranted key's display name exists, since one key can name
  // differently across editions.
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

export interface ClassActionPartitions {
  classActions: AvailableAction[];
  classBonusActions: AvailableAction[];
  classReactions: AvailableAction[];
}

// Drops any AvailableAction row with no registered resolver (e.g. Shadow
// Arts/Cloak of Shadows/Elemental Burst, #1315, which cast through their own
// dedicated endpoints) — otherwise it would render a card whose click just
// burns the slot via planActionClick's no-resolver fallback.
export function partitionClassActions(
  availableActions: AvailableAction[],
  raging: boolean,
): ClassActionPartitions {
  // Passes the action itself (#1528) so a row-driven key (Second Wind, no
  // ACTION_RESOLVERS entry) resolves via its served resolverKind instead of
  // silently vanishing from this filter.
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

export interface BonusSpellOption {
  /** Spellbook entry id (Spell.id) — passed to the pre-selected cast flow. */
  spellId: string;
  name: string;
  subtitle: string;
  badge: string;
}

// Shares InlineSpellPicker's deriveSpellList filtering via the same
// spellPicker.ts predicates (incl. restrictionFlagsForSlot's server-resolved
// interlock, #1439) so the card list and the picker it opens can never
// disagree; economy is the served SpellEconomyState, never re-derived.
export function bonusSpellOptions(
  character: Character,
  economy: SpellEconomyState,
): BonusSpellOption[] {
  const spellcasting = character.spellcasting;
  if (!spellcasting) return [];
  const slotLevels = availableSlotLevels(spellcasting.slots ?? []);
  const arcanaLevels = availableArcanaLevels(spellcasting.arcana ?? []);
  const { bonusActionBlockedByActionSpell, actionLimitedToCantrips } = restrictionFlagsForSlot(
    "bonusAction",
    economy,
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

// Eligibility (#1435, both equipped weapons Light) is resolved server-side
// onto the offHandAttack row; this only reads the served flag.
export function offHandAttackEnabled(character: Character): boolean {
  return character.availableActions?.find((a) => a.key === "offHandAttack")?.enabled ?? false;
}

// Names a concrete owned light-weapon pair when one exists, else the generic
// requirement; item-name suggestion is client-side chrome (#1435), eligibility
// itself comes from offHandAttackEnabled.
export function twfHint(character: Character): string | null {
  if (offHandAttackEnabled(character)) return null;
  const lightWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.weapon?.light === true,
  );
  if (lightWeapons.length < 2) {
    return "Off-hand attack needs two light weapons equipped.";
  }
  const [first, second] = lightWeapons;
  // An s-ending name (custom items) can't take the naive plural ("Two Cutlasss"),
  // so that case falls back to "a pair of Cutlass".
  const samePair = first.name.endsWith("s") ? `a pair of ${first.name}` : `Two ${first.name}s`;
  const pair = first.name === second.name ? samePair : `${first.name} & ${second.name}`;
  return `Off-hand attack needs two light weapons — equip ${pair} to enable it.`;
}

// Keyed, not named, to survive 2024 renames (Magic/Utilize); this set plus
// MICRO_CAPTIONS are the two client-side lists a future 2014-only universal
// action would need added to.
export const PRIMARY_ACTION_KEYS: ReadonlySet<string> = new Set([
  "attack",
  "castSpell",
  "useObject",
  "dash",
  "dodge",
]);

// search's caption stays edition-neutral: SRD 5.1 offers Perception OR
// Investigation, SRD 5.2 a GM-picked Wisdom check.
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

export function moreActionsPreview(actions: UniversalActionOption[]): string {
  return actions.map((a) => a.name).join(" · ");
}

export interface ActionSheetModel {
  attackSummary: string;
  // Served by GET /api/reference (#1430); threaded through so sheet bodies
  // stay presentational and never call the hook themselves. Empty until the
  // query resolves.
  universalActions: UniversalActionOption[];
  consumableCount: number;
  hasSpellcasting: boolean;
  classActionOptions: ClassActionOption[];
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
  // See ActionSheetModel.universalActions.
  universalActions: UniversalActionOption[];
  hasSpellcasting: boolean;
  classReactionOptions: ClassActionOption[];
}
