/**
 * Combat wire types: derived attacks, conditions, buffs, roll modifiers, and HP operations.
 */
// ConditionKey is used below (ConditionEntry.key) as well as re-exported (the
// `export type` block further down) — a bare `export … from` doesn't bind a
// local name, so it needs its own `import type` too.
import type { ConditionKey } from "@character-sheet/contracts";

/**
 * A derived attack row — unarmed strike or improvised weapon — computed
 * server-side and surfaced on the character so `AttacksPanel` can render them
 * without reproducing combat rules on the client.
 */
export interface DerivedAttack {
  attackBonus: number;
  /** Strike counts as magical (Monk Empowered Strikes at level 6+). */
  magical?: boolean;
  damage: {
    count: number;
    faces: number;
    modifier: number;
    damageType: string;
  };
}

/** DerivedAttack extended with a proficiency flag (for improvised weapons). */
export interface DerivedImprovisedAttack extends DerivedAttack {
  proficient: boolean;
}

/** One labeled addend of the derived AC; rendered verbatim, never interpreted. */
export interface ArmorClassPart {
  label: string;
  value: number;
}

// Condition ops and the 14-key ConditionKey are derived from the route zod
// schemas in @character-sheet/contracts (#1390) — `import type` only, so zod
// never enters the client bundle. Sent as
// `{ operations: ConditionOperation[] }` to
// POST /api/characters/:id/conditions/transactions. removeCondition/
// setExhaustion don't forward: they have no frontend call site, and a
// forwarded-only name is a dead export under the fallow gate.
export type { ApplyConditionOperation, ConditionKey, ConditionOperation } from "@character-sheet/contracts";

export interface ConditionEntry {
  key: ConditionKey;
  /** Optional provenance, e.g. "Hold Person". Null when not supplied. */
  source?: string | null;
  appliedAt: string;
}

export interface ConditionsState {
  active: ConditionEntry[];
  /** Exhaustion level, 0–6 (6 = death). Special case, not part of `active`. */
  exhaustion: number;
}

/**
 * Active effects (buffs) — mirror of `ActiveBuff`.
 *
 * Duration axis (#455). Absent on the wire means "concentration" (byte-parity
 * with #438). while-active / until-rest are durable self-buffs (e.g. Rage).
 */
export type BuffDuration = "concentration" | "while-active" | "until-rest";

export interface ActiveBuff {
  id: string;
  key: string;
  target: string; // skill/ability/stat key, or "meleeDamage"
  modifier: number;
  source: string;
  sourceEntryId?: string;
  // Always present on the API response — the backend normalizer defaults absent
  // wire values to "concentration" before serializing, so the frontend never
  // sees an undefined duration.
  duration: BuffDuration;
  restType?: "short" | "long";
  // Damage types this buff makes the character resistant to (halved on take) (#456).
  resistDamageTypes?: string[];
  // State-driven advantage/disadvantage grants (#486), e.g. Rage's advantage on Strength checks & saves.
  rollEffects?: RollEffect[];
}

export interface ActiveEffectsState {
  buffs: ActiveBuff[];
}

/**
 * State-driven roll modifiers (#486) — mirror of `RollEffect` / `RollModifier`.
 * The four d20 roll categories a state can bind advantage/disadvantage to.
 */
export type RollModeKind = "attack" | "check" | "save" | "initiative";

/** One advantage/disadvantage grant; `ability` (lowercase key) narrows it to a single ability. */
export interface AdvantageRollEffect {
  mode: "advantage" | "disadvantage";
  kind: RollModeKind;
  ability?: string;
}

/** A flat numeric d20 modifier, e.g. 2024 exhaustion's −2×level (SRD 5.2). */
export interface FlatRollEffect {
  mode: "flat";
  modifier: number;
  kind: RollModeKind;
  ability?: string;
}

/** A state-driven grant on a class of d20 roll: adv/dis or a flat modifier. */
export type RollEffect = AdvantageRollEffect | FlatRollEffect;

/** A RollEffect resolved with its provenance label (e.g. "Rage", "Poisoned", "Exhaustion"). Derived on read. */
export type RollModifier = RollEffect & { source: string };

// HP ops are derived from the route zod schemas in @character-sheet/contracts
// (#1390) — `import type` only, so zod never enters the client bundle. Sent as
// `{ operations: HitPointOperation[] }` to POST /api/characters/:id/hp. Only the
// two names this tier consumes forward: the nine member types have zero
// frontend call sites, and a forwarded-only name is a dead export under the
// fallow gate. LevelUpTarget also reaches ./leveling through this re-export.
export type { HitPointOperation, LevelUpTarget } from "@character-sheet/contracts";

/**
 * Result of the concentration check the server makes when a concentrating
 * character takes damage (issue #41). Returned by the HP endpoint alongside the
 * updated character.
 * - `status: "resolved"` — the save was rolled or skipped; `held` is final.
 *   `reason: "death"` means concentration ended unconditionally (dropped to 0
 *   HP) with no save — `roll`/`saveBonus`/`total`/`dc` are then null.
 * - `status: "pending"` — a manual save is deferred to the client (issue #76):
 *   `dc`/`saveBonus` are populated, `held`/`roll`/`total` are null, and the
 *   client must follow up with a `ConcentrationSaveOperation` keyed by `entryId`.
 */
export interface ConcentrationCheck {
  status: "resolved" | "pending";
  entryId: string;
  spellName: string;
  reason: "damage" | "death";
  held: boolean | null;
  roll: number | null;
  saveBonus: number | null;
  total: number | null;
  dc: number | null;
  damage: number;
}
