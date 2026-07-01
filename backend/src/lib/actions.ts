/**
 * Action catalog: derive-at-read + effect dispatch table.
 *
 * Two concerns live here:
 *
 * 1. `DERIVED_ACTIONS` + `deriveActions` — hardcoded TS list of all known
 *    actions (same data as the prisma/seed.ts ACTIONS array) and a pure
 *    derive function that filters it for a character's class/level/subclass,
 *    cross-referencing derived resource pools to set `enabled`.
 *    Called from `serializeCharacter` — sync, no DB access. Mirrors the
 *    CLASS_RESOURCE_FN / deriveResources pattern from class-features.ts.
 *
 * 2. `ACTION_EFFECT_FN` — hardcoded TS dispatch table keyed by action `key`.
 *    Returns existing op types (spendResource, adjustQuantity, heal) for the
 *    Phase-C orchestrator endpoint (POST /actions/transactions). This is the
 *    `CLASS_RESOURCE_FN` analog — no interpreted JSON engine.
 *
 * Adding a new mechanical action:
 *   • Append a row to ACTIONS in `prisma/seed.ts` (display + gating data for
 *     the GET /api/actions catalog picker).
 *   • Append the matching entry to DERIVED_ACTIONS here (for serializeCharacter).
 *   • Add the effect fn to ACTION_EFFECT_FN (for the POST orchestrator).
 *   No migration needed for new actions; only new *columns* need one.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionCost = "action" | "bonusAction" | "reaction" | "free" | "special";

/** Record in the DERIVED_ACTIONS table — mirrors the Prisma Action model but is pure TS. */
interface DerivedActionRecord {
  key: string;
  name: string;
  cost: ActionCost;
  universal?: boolean;
  grantClass?: string;   // lowercase class name
  grantSubclass?: string; // substring-matched against the character's subclass
  grantLevel?: number;   // min level for this action
  resourceKey?: string;  // pool key to check for `enabled`
  resourceAmount?: number; // pool units required
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
}

/** Resource pool shape — typed subset of what serializeCharacter builds. */
interface ResourcePool {
  key: string;
  remaining: number;
}

// ── DERIVED_ACTIONS ────────────────────────────────────────────────────────────
// Mirrors prisma/seed.ts ACTIONS array. Keep in sync when adding new actions.

const DERIVED_ACTIONS: DerivedActionRecord[] = [
  // ── Universal actions ──────────────────────────────────────────────────────
  // These are intentionally NOT included in `availableActions` on the character
  // because TurnHub already renders them from the client-side UNIVERSAL_ACTIONS
  // list (lib/turnRules.ts). Including them here would duplicate them.
  // Only class-specific (non-universal) actions go in availableActions.

  // ── Barbarian ─────────────────────────────────────────────────────────────
  { key: "rage", name: "Rage", cost: "bonusAction", grantClass: "barbarian", grantLevel: 1, resourceKey: "rage", resourceAmount: 1 },
  { key: "recklessAttack", name: "Reckless Attack", cost: "free", grantClass: "barbarian", grantLevel: 2 },

  // ── Bard ──────────────────────────────────────────────────────────────────
  { key: "bardicInspiration", name: "Bardic Inspiration", cost: "bonusAction", grantClass: "bard", grantLevel: 1, resourceKey: "bardicInspiration", resourceAmount: 1 },

  // ── Cleric ────────────────────────────────────────────────────────────────
  { key: "channelDivinityCleric", name: "Channel Divinity", cost: "action", grantClass: "cleric", grantLevel: 2, resourceKey: "channelDivinity", resourceAmount: 1 },

  // ── Druid ─────────────────────────────────────────────────────────────────
  { key: "wildShape", name: "Wild Shape", cost: "action", grantClass: "druid", grantLevel: 2, resourceKey: "wildShape", resourceAmount: 1 },

  // ── Fighter ───────────────────────────────────────────────────────────────
  { key: "secondWind", name: "Second Wind", cost: "bonusAction", grantClass: "fighter", grantLevel: 1, resourceKey: "secondWind", resourceAmount: 1 },
  { key: "actionSurge", name: "Action Surge", cost: "special", grantClass: "fighter", grantLevel: 2, resourceKey: "actionSurge", resourceAmount: 1 },

  // ── Monk ──────────────────────────────────────────────────────────────────
  { key: "flurryOfBlows", name: "Flurry of Blows", cost: "bonusAction", grantClass: "monk", grantLevel: 2, resourceKey: "ki", resourceAmount: 2 },
  { key: "patientDefense", name: "Patient Defense", cost: "bonusAction", grantClass: "monk", grantLevel: 2, resourceKey: "ki", resourceAmount: 1 },
  { key: "stepOfTheWind", name: "Step of the Wind", cost: "bonusAction", grantClass: "monk", grantLevel: 2, resourceKey: "ki", resourceAmount: 1 },
  { key: "stunningStrike", name: "Stunning Strike", cost: "free", grantClass: "monk", grantLevel: 5, resourceKey: "ki", resourceAmount: 1 },

  // ── Paladin ───────────────────────────────────────────────────────────────
  { key: "divineSense", name: "Divine Sense", cost: "action", grantClass: "paladin", grantLevel: 1, resourceKey: "divineSense", resourceAmount: 1 },
  { key: "layOnHands", name: "Lay on Hands", cost: "action", grantClass: "paladin", grantLevel: 1, resourceKey: "layOnHands", resourceAmount: 5 },
  { key: "channelDivinityPaladin", name: "Channel Divinity", cost: "action", grantClass: "paladin", grantLevel: 3, resourceKey: "channelDivinity", resourceAmount: 1 },

  // ── Rogue ─────────────────────────────────────────────────────────────────
  { key: "cunningAction", name: "Cunning Action", cost: "bonusAction", grantClass: "rogue", grantLevel: 2 },

  // ── Sorcerer ─────────────────────────────────────────────────────────────
  { key: "metamagic", name: "Metamagic", cost: "free", grantClass: "sorcerer", grantLevel: 3, resourceKey: "sorceryPoints", resourceAmount: 1 },
];

// ── deriveActions ─────────────────────────────────────────────────────────────

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
  subclass: string | undefined,
  level: number,
  pools: ResourcePool[],
): AvailableAction[] {
  const cls = (className ?? "").toLowerCase();
  const sub = (subclass ?? "").toLowerCase();

  const poolMap = new Map(pools.map((p) => [p.key, p.remaining]));

  return DERIVED_ACTIONS
    .filter((a) => {
      // Only include class-specific actions here (universal handled client-side).
      if (a.universal) return false;

      // Class gate.
      if (a.grantClass && a.grantClass.toLowerCase() !== cls) return false;

      // Subclass gate (substring match, case-insensitive).
      if (a.grantSubclass && !sub.includes(a.grantSubclass.toLowerCase())) return false;

      // Level gate.
      if (a.grantLevel && level < a.grantLevel) return false;

      return true;
    })
    .map((a): AvailableAction => {
      let enabled = true;
      let disabledReason: string | undefined;

      if (a.resourceKey && a.resourceAmount) {
        const remaining = poolMap.get(a.resourceKey) ?? 0;
        if (remaining < a.resourceAmount) {
          enabled = false;
          disabledReason =
            remaining === 0
              ? `No ${a.resourceKey} remaining`
              : `Need ${a.resourceAmount} ${a.resourceKey}, have ${remaining}`;
        }
      }

      return {
        key: a.key,
        name: a.name,
        cost: a.cost,
        enabled,
        ...(disabledReason ? { disabledReason } : {}),
      };
    });
}

// ── ACTION_EFFECT_FN ──────────────────────────────────────────────────────────
// Keyed by action `key`. Each function receives an execution context and returns
// an array of existing op objects that the Phase-C orchestrator dispatches to
// the appropriate domain handlers within a single Prisma transaction.
//
// Convention (mirrors CLASS_RESOURCE_FN in class-features.ts):
//  - Return op arrays, never side-effect directly.
//  - If a roll was performed client-side, receive it via `ctx.roll`; validate
//    range server-side rather than recomputing (same pattern as castSpell.roll).
//  - Use ONLY existing op types (spendResource, adjustQuantity, heal).

export interface ActionContext {
  /** Arbitrary dice roll total supplied by the client (e.g. potion healing). */
  roll?: number;
  /** ID of the inventory item to consume (e.g. healing potion). */
  inventoryItemId?: string;
}

export type SpendResourceOp = { type: "spendResource"; key: string; amount?: number };
export type AdjustQuantityOp = { type: "adjustQuantity"; inventoryItemId: string; delta: number };
export type HealOp = { type: "heal"; amount: number };
export type ActionOp = SpendResourceOp | AdjustQuantityOp | HealOp;

type EffectFn = (ctx: ActionContext) => ActionOp[];

export const ACTION_EFFECT_FN: Record<string, EffectFn> = {
  // ── Generic no-op actions (ephemeral only — no server effect needed) ───────
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

  // ── Use Object (drink a healing potion, etc.) ─────────────────────────────
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

  // ── Barbarian ─────────────────────────────────────────────────────────────
  rage: () => [{ type: "spendResource", key: "rage" }],
  recklessAttack: () => [], // ephemeral — advantage/disadvantage is tracked by the table

  // ── Bard ──────────────────────────────────────────────────────────────────
  bardicInspiration: () => [{ type: "spendResource", key: "bardicInspiration" }],

  // ── Cleric ────────────────────────────────────────────────────────────────
  channelDivinityCleric: () => [{ type: "spendResource", key: "channelDivinity" }],

  // ── Druid ─────────────────────────────────────────────────────────────────
  wildShape: () => [{ type: "spendResource", key: "wildShape" }],

  // ── Fighter ───────────────────────────────────────────────────────────────
  secondWind: (ctx) => {
    const ops: ActionOp[] = [{ type: "spendResource", key: "secondWind" }];
    if (ctx.roll !== undefined && ctx.roll > 0) {
      ops.push({ type: "heal", amount: ctx.roll });
    }
    return ops;
  },
  actionSurge: () => [{ type: "spendResource", key: "actionSurge" }],

  // ── Monk ──────────────────────────────────────────────────────────────────
  flurryOfBlows: () => [{ type: "spendResource", key: "ki", amount: 2 }],
  patientDefense: () => [{ type: "spendResource", key: "ki" }],
  stepOfTheWind: () => [{ type: "spendResource", key: "ki" }],
  stunningStrike: () => [{ type: "spendResource", key: "ki" }],

  // ── Paladin ───────────────────────────────────────────────────────────────
  divineSense: () => [{ type: "spendResource", key: "divineSense" }],
  layOnHands: (ctx) => {
    const amount = ctx.roll ?? 0;
    const ops: ActionOp[] = [{ type: "spendResource", key: "layOnHands", amount }];
    if (amount > 0) {
      ops.push({ type: "heal", amount });
    }
    return ops;
  },
  channelDivinityPaladin: () => [{ type: "spendResource", key: "channelDivinity" }],

  // ── Rogue ─────────────────────────────────────────────────────────────────
  cunningAction: () => [], // bonus action consumed ephemerally; no server effect

  // ── Sorcerer ─────────────────────────────────────────────────────────────
  metamagic: (ctx) => {
    const amount = ctx.roll ?? 1;
    return [{ type: "spendResource", key: "sorceryPoints", amount }];
  },
};
