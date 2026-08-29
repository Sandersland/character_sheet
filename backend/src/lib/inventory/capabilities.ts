import { PROFICIENCY_KINDS, type SnapshotCapability } from "@character-sheet/contracts";

import { casterFractionFor, type SubclassCasterRef } from "@/lib/srd/srd.js";
import type {
  ActivatedDurationKind,
  ActivationType,
  AdvantageOn,
  AttunementPrereqKind,
  CapabilityKind,
  CapabilityOp,
  CapabilityTarget,
  CastResource,
  CastStatMode,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemProficiencyGrant,
  ItemResourceKind,
  ItemResourcePeriod,
  ProficiencyKind,
  SerializedCapability,
} from "@character-sheet/shared-types";

// #1273: re-exported so the ~8 backend modules importing it from here keep resolving it unchanged.
export type {
  ActivatedDurationKind,
  ActivationType,
  AdvantageOn,
  AttunementPrereqKind,
  CapabilityKind,
  CapabilityOp,
  CapabilityTarget,
  CastResource,
  CastStatMode,
  ChargeTrigger,
  GrantType,
  GrantValueKind,
  ItemAdvantageGrant,
  ItemProficiencyGrant,
  ItemResourceKind,
  ItemResourcePeriod,
  SerializedCapability,
};

// #1647: moved to @character-sheet/contracts, a leaf zone the snapshot schema validates against; re-exported so backend importers keep resolving unchanged. CAPABILITY_KINDS is new (not moved), so it isn't re-exported here — consumers reach it via contracts directly.
export {
  ADVANTAGE_ON,
  ATTUNEMENT_PREREQ_KINDS,
  CAPABILITY_OPS,
  CAPABILITY_TARGETS,
  CAST_RESOURCES,
  CAST_STAT_MODES,
  CHARGE_TRIGGERS,
  GRANT_TYPES,
  GRANT_VALUE_KINDS,
} from "@character-sheet/contracts";
// Imported above (not just re-exported) because collectProficiencyGrant below needs a local binding — `export { X } from` alone doesn't introduce one.
export { PROFICIENCY_KINDS };

// valueDamageType is a nullable column, so this stays nullable where the wire CapabilityDice is not — serializePassiveBonus drops the null on the way out.
interface CapabilityDiceColumns {
  count: number;
  faces: number;
  damageType?: string | null;
}

export interface PassiveBonusCapability {
  kind: "passiveBonus";
  target: CapabilityTarget;
  op: CapabilityOp;
  value: number;
  targetKey?: string | null;
  condition?: string | null;
  description?: string | null;
  dice?: CapabilityDiceColumns | null;
}

// #528: DC/attack are either fixed item values or resolve to the wielder's.
export interface CastSpellCapability {
  kind: "castSpell";
  spellId: string;
  spellName: string;
  spellLevel: number;
  castLevel: number;
  resource: CastResource;
  uses: number;
  concentration: boolean;
  dcMode: CastStatMode;
  dcValue?: number | null;
  attackMode: CastStatMode;
  attackValue?: number | null;
  // Pool charges spent per cast when resource is "charges" (#555); 1 when unset.
  chargeCost: number;
  description?: string | null;
}

// #543: the inline self-buff reuses the passiveBonus target/op/value shape.
export interface ActivatedEffectCapability {
  kind: "activatedEffect";
  activation: ActivationType;
  target: CapabilityTarget;
  op: CapabilityOp;
  value: number;
  targetKey?: string | null;
  duration: ActivatedDurationKind;
  resourceKind: ItemResourceKind;
  resourcePeriod?: ItemResourcePeriod | null;
  resourceCharges: number;
  // Pool charges spent per activation when resourceKind is "charges" (#555).
  chargeCost: number;
  durationText?: string | null;
  description?: string | null;
}

// #529: grantOn is advantage-only; grantValue is null for whole-axis advantage (e.g. all initiative rolls).
export interface GrantCapability {
  kind: "grant";
  grantType: GrantType;
  grantOn?: AdvantageOn | null;
  grantValueKind?: GrantValueKind | null;
  grantValue?: string | null;
  cantBeSurprised: boolean;
  description?: string | null;
}

// #555: at most one per item. remaining = maxCharges − the row's `used` counter (derived, never stored). Null recharge dice = full refill on the trigger.
export interface ChargesCapability {
  kind: "charges";
  maxCharges: number;
  rechargeTrigger: ChargeTrigger;
  rechargeDice?: { count: number; faces: number } | null;
  rechargeBonus?: number | null;
  description?: string | null;
}

// All five kinds are materialized, so the Exclude<> is `never` — no well-formed row lands here, and the fallback cast in readCapability is the single escape hatch. Kept literal so discriminant narrowing on Capability.kind stays sound.
export interface OpaqueCapability {
  kind: Exclude<CapabilityKind, "passiveBonus" | "castSpell" | "activatedEffect" | "grant" | "charges">;
  description?: string | null;
}

export type Capability =
  | PassiveBonusCapability
  | CastSpellCapability
  | ActivatedEffectCapability
  | GrantCapability
  | ChargesCapability
  | OpaqueCapability;

// atWill is unlimited (Infinity); every other resource defaults to 1 when uses is unset.
export function castUsesTotal(cap: CastSpellCapability): number {
  if (cap.resource === "atWill") return Infinity;
  return cap.uses > 0 ? cap.uses : 1;
}

// charges spends the item's shared pool — the POOL recharges via rechargeItemChargePoolsOnRest, never the capability's own counter.
export function castResourceRechargesOn(resource: string, rest: "short" | "long"): boolean {
  if (resource === "atWill" || resource === "charges") return false;
  if (resource === "perRestShort") return true;
  return rest === "long";
}

// Same short/long convention as castResourceRechargesOn.
export function chargeTriggerRechargesOn(trigger: ChargeTrigger, rest: "short" | "long"): boolean {
  if (trigger === "short") return true;
  return rest === "long";
}

// The flat columns shared by ItemCapability and InventoryCapability.
export interface CapabilityColumns {
  kind: string;
  description?: string | null;
  target?: string | null;
  op?: string | null;
  value?: number | null;
  targetKey?: string | null;
  condition?: string | null;
  valueDiceCount?: number | null;
  valueDiceFaces?: number | null;
  valueDamageType?: string | null;
  spellId?: string | null;
  spellName?: string | null;
  spellLevel?: number | null;
  castLevel?: number | null;
  castResource?: string | null;
  castUses?: number | null;
  castConcentration?: boolean | null;
  dcMode?: string | null;
  dcValue?: number | null;
  attackMode?: string | null;
  attackValue?: number | null;
  activation?: string | null;
  activatedDuration?: string | null;
  resourceKind?: string | null;
  resourcePeriod?: string | null;
  resourceCharges?: number | null;
  durationText?: string | null;
  grantType?: string | null;
  grantOn?: string | null;
  grantValueKind?: string | null;
  grantValue?: string | null;
  cantBeSurprised?: boolean | null;
  maxCharges?: number | null;
  rechargeDiceCount?: number | null;
  rechargeDiceFaces?: number | null;
  rechargeBonus?: number | null;
  rechargeTrigger?: string | null;
  chargeCost?: number | null;
}

// A call, not a `??` operator, so it keeps the per-kind readers' field defaulting out of their branch count (each `??` is a cyclomatic branch).
function orElse<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function readDicePair(count?: number | null, faces?: number | null): { count: number; faces: number } | null {
  return count && faces ? { count, faces } : null;
}

// Each returns null when the row is malformed for its kind, so readCapability falls through to opaque rather than throwing.
function readCastSpellRow(row: CapabilityColumns): CastSpellCapability | null {
  if (!row.spellId) return null;
  return {
    kind: "castSpell",
    spellId: row.spellId,
    spellName: orElse(row.spellName, ""),
    spellLevel: orElse(row.spellLevel, 0),
    castLevel: orElse(row.castLevel, orElse(row.spellLevel, 0)),
    resource: orElse(row.castResource as CastResource | null, "perDayDawn"),
    uses: orElse(row.castUses, 1),
    concentration: orElse(row.castConcentration, false),
    dcMode: orElse(row.dcMode as CastStatMode | null, "fixed"),
    dcValue: orElse(row.dcValue, null),
    attackMode: orElse(row.attackMode as CastStatMode | null, "fixed"),
    attackValue: orElse(row.attackValue, null),
    chargeCost: orElse(row.chargeCost, 1),
    description: orElse(row.description, null),
  };
}

function readChargesRow(row: CapabilityColumns): ChargesCapability | null {
  if (row.maxCharges == null) return null;
  return {
    kind: "charges",
    maxCharges: row.maxCharges,
    rechargeTrigger: orElse(row.rechargeTrigger as ChargeTrigger | null, "dawn"),
    rechargeDice: readDicePair(row.rechargeDiceCount, row.rechargeDiceFaces),
    rechargeBonus: orElse(row.rechargeBonus, null),
    description: orElse(row.description, null),
  };
}

function readGrantRow(row: CapabilityColumns): GrantCapability | null {
  if (!row.grantType) return null;
  return {
    kind: "grant",
    grantType: row.grantType as GrantType,
    grantOn: orElse(row.grantOn as AdvantageOn | null, null),
    grantValueKind: orElse(row.grantValueKind as GrantValueKind | null, null),
    grantValue: orElse(row.grantValue, null),
    cantBeSurprised: orElse(row.cantBeSurprised, false),
    description: orElse(row.description, null),
  };
}

function readPassiveBonusRow(row: CapabilityColumns): PassiveBonusCapability | null {
  if (!row.target || !row.op) return null;
  const base = readDicePair(row.valueDiceCount, row.valueDiceFaces);
  const dice = base ? { ...base, damageType: orElse(row.valueDamageType, null) } : null;
  return {
    kind: "passiveBonus",
    target: row.target as CapabilityTarget,
    op: row.op as CapabilityOp,
    value: orElse(row.value, 0),
    targetKey: orElse(row.targetKey, null),
    condition: orElse(row.condition, null),
    description: orElse(row.description, null),
    dice,
  };
}

function readActivatedEffectRow(row: CapabilityColumns): ActivatedEffectCapability | null {
  if (!row.activation || !row.target || !row.op) return null;
  return {
    kind: "activatedEffect",
    activation: row.activation as ActivationType,
    target: row.target as CapabilityTarget,
    op: row.op as CapabilityOp,
    value: orElse(row.value, 0),
    targetKey: orElse(row.targetKey, null),
    duration: row.activatedDuration === "untilRest" ? "untilRest" : "whileActive",
    resourceKind: orElse(row.resourceKind as ItemResourceKind | null, "atWill"),
    resourcePeriod: orElse(row.resourcePeriod as ItemResourcePeriod | null, null),
    resourceCharges: orElse(row.resourceCharges, 1),
    chargeCost: orElse(row.chargeCost, 1),
    durationText: orElse(row.durationText, null),
    description: orElse(row.description, null),
  };
}

const CAPABILITY_READERS: Record<string, ((row: CapabilityColumns) => Capability | null) | undefined> = {
  castSpell: readCastSpellRow,
  charges: readChargesRow,
  grant: readGrantRow,
  passiveBonus: readPassiveBonusRow,
  activatedEffect: readActivatedEffectRow,
};

export function readCapability(row: CapabilityColumns): Capability {
  return (
    CAPABILITY_READERS[row.kind]?.(row) ?? { kind: row.kind as OpaqueCapability["kind"], description: row.description ?? null }
  );
}

// Mirrors readCastSpellRow/readChargesRow/etc.'s per-kind-reader shape for the reverse direction, keeping each function's own complexity low.
function passiveBonusColumns(cap: Extract<SnapshotCapability, { kind: "passiveBonus" }>) {
  return {
    target: cap.target,
    op: cap.op,
    value: cap.value,
    targetKey: cap.targetKey ?? null,
    condition: cap.condition ?? null,
    valueDiceCount: cap.dice?.count ?? null,
    valueDiceFaces: cap.dice?.faces ?? null,
    valueDamageType: cap.dice?.damageType ?? null,
  };
}

function castSpellColumns(cap: Extract<SnapshotCapability, { kind: "castSpell" }>) {
  return {
    spellId: cap.spellId,
    spellName: cap.spellName,
    spellLevel: cap.spellLevel,
    castLevel: cap.castLevel,
    castResource: cap.resource,
    castUses: cap.uses,
    castConcentration: cap.concentration,
    dcMode: cap.dcMode,
    dcValue: cap.dcValue ?? null,
    attackMode: cap.attackMode,
    attackValue: cap.attackValue ?? null,
    chargeCost: cap.chargeCost,
  };
}

function activatedEffectColumns(cap: Extract<SnapshotCapability, { kind: "activatedEffect" }>) {
  return {
    activation: cap.activation,
    target: cap.target,
    op: cap.op,
    value: cap.value,
    targetKey: cap.targetKey ?? null,
    activatedDuration: cap.duration,
    resourceKind: cap.resourceKind,
    resourcePeriod: cap.resourcePeriod ?? null,
    resourceCharges: cap.resourceCharges,
    chargeCost: cap.chargeCost,
    durationText: cap.durationText ?? null,
  };
}

function grantColumns(cap: Extract<SnapshotCapability, { kind: "grant" }>) {
  return {
    grantType: cap.grantType,
    grantOn: cap.grantOn ?? null,
    grantValueKind: cap.grantValueKind ?? null,
    grantValue: cap.grantValue ?? null,
    cantBeSurprised: cap.cantBeSurprised,
  };
}

function chargesColumns(cap: Extract<SnapshotCapability, { kind: "charges" }>) {
  return {
    maxCharges: cap.maxCharges,
    rechargeDiceCount: cap.rechargeDice?.count ?? null,
    rechargeDiceFaces: cap.rechargeDice?.faces ?? null,
    rechargeBonus: cap.rechargeBonus ?? null,
    rechargeTrigger: cap.rechargeTrigger,
  };
}

// #1649: the inverse of readCapability. Maps a snapshot capability (+ its InventoryCapabilityUse `used` counter) back onto the flat CapabilityColumns shape every existing consumer is written against, keyed by `key` (the old InventoryCapability row's id, preserved verbatim), rather than rewriting every consumer to a second parallel code path.
export function capabilityColumnsFromSnapshot(
  cap: SnapshotCapability,
  used: number,
): CapabilityColumns & { id: string; used: number } {
  const base = { id: cap.key, used, kind: cap.kind, description: cap.description ?? null };
  switch (cap.kind) {
    case "passiveBonus":
      return { ...base, ...passiveBonusColumns(cap) };
    case "castSpell":
      return { ...base, ...castSpellColumns(cap) };
    case "activatedEffect":
      return { ...base, ...activatedEffectColumns(cap) };
    case "grant":
      return { ...base, ...grantColumns(cap) };
    case "charges":
      return { ...base, ...chargesColumns(cap) };
  }
}

// The `satisfies` below rejects a key that is NOT on CapabilityColumns, but nothing catches one that is MISSING: a column added to the capability tables and not added here is silently dropped from every copy, surfacing later as a schema parse failure far from the cause. Add the column in both places.
const CAPABILITY_COLUMN_KEYS = [
  "kind", "description", "target", "op", "value", "targetKey", "condition",
  "valueDiceCount", "valueDiceFaces", "valueDamageType",
  "spellId", "spellName", "spellLevel", "castLevel", "castResource", "castUses", "castConcentration",
  "dcMode", "dcValue", "attackMode", "attackValue",
  "activation", "activatedDuration", "resourceKind", "resourcePeriod", "resourceCharges", "durationText",
  "grantType", "grantOn", "grantValueKind", "grantValue", "cantBeSurprised",
  "maxCharges", "rechargeDiceCount", "rechargeDiceFaces", "rechargeBonus", "rechargeTrigger", "chargeCost",
] as const satisfies readonly (keyof CapabilityColumns)[];

// Shared by snapshotInventoryItemForUndo (adds `used` back verbatim) and snapshotCampaignItemCapabilityCreates (`used` excluded — an awarded pool starts full). Generic over T so a caller passing a live Prisma row keeps its literal column types, required for the result to satisfy a Prisma *CreateInput shape directly.
export function capabilityColumnFields<T extends CapabilityColumns>(
  c: T,
): Pick<T, (typeof CAPABILITY_COLUMN_KEYS)[number]> {
  const out: Record<string, unknown> = {};
  // Cast on write, not on the function's own signature: the loop's key widens to `keyof CapabilityColumns`, which TS can't narrow back to the exact field — the return type above is what keeps callers precise.
  for (const key of CAPABILITY_COLUMN_KEYS) out[key] = c[key];
  return out as Pick<T, (typeof CAPABILITY_COLUMN_KEYS)[number]>;
}

// atWill is unlimited (null = no cap). A charges-costed effect is gated by the item's shared pool, not a per-item counter — null here (applyActivate spends the pool instead).
export function activatedMaxUses(cap: ActivatedEffectCapability): number | null {
  if (cap.resourceKind === "atWill" || cap.resourceKind === "charges") return null;
  return Math.max(1, cap.resourceCharges);
}

// null when it never rests (atWill, or charges — the pool recharges itself).
export function activatedRechargeRest(cap: ActivatedEffectCapability): "short" | "long" | null {
  if (cap.resourceKind === "atWill" || cap.resourceKind === "charges") return null;
  if (cap.resourceKind === "perRest" && cap.resourcePeriod === "short") return "short";
  return "long";
}

// #555: the first well-formed kind=charges row. Authoring enforces at most one pool per item; extra rows are ignored, not merged.
export function chargePoolOf<T extends CapabilityColumns>(
  rows: T[],
): { cap: ChargesCapability; row: T } | null {
  for (const row of rows) {
    const cap = readCapability(row);
    // Field-presence guard, same reasoning as activatedCapabilityOf: a malformed charges row falls through to opaque, which still carries kind "charges" at runtime — require maxCharges so it can't masquerade as the pool.
    if (cap.kind === "charges" && "maxCharges" in cap) return { cap, row };
  }
  return null;
}

export function describeChargeRecharge(cap: ChargesCapability): string {
  const when =
    cap.rechargeTrigger === "dawn"
      ? "at dawn"
      : cap.rechargeTrigger === "dusk"
        ? "at dusk"
        : cap.rechargeTrigger === "short"
          ? "on a short rest"
          : "on a long rest";
  if (cap.rechargeDice) {
    const bonus = cap.rechargeBonus ? `+${cap.rechargeBonus}` : "";
    return `regains ${cap.rechargeDice.count}d${cap.rechargeDice.faces}${bonus} ${when}`;
  }
  if (cap.rechargeBonus) return `regains ${cap.rechargeBonus} ${when}`;
  return `refills ${when}`;
}

// Not exported — the frontend has its own copy.
function describeActivation(activation: ActivationType): string {
  switch (activation) {
    case "action":
      return "Action";
    case "bonus":
      return "Bonus action";
    case "reaction":
      return "Reaction";
    case "commandWord":
      return "Command word";
  }
}

// A free-text durationText ("10 minutes") is shown verbatim since no minute timer is modeled — the holder toggles it off manually or on a rest.
export function describeActivatedReminder(cap: ActivatedEffectCapability): string {
  const parts = [describeActivation(cap.activation)];
  if (cap.durationText) {
    parts.push(`lasts ${cap.durationText} (toggle off manually)`);
  } else if (cap.duration === "untilRest") {
    parts.push(activatedRechargeRest(cap) === "short" ? "until a short rest" : "until a long rest");
  } else {
    parts.push("while active (toggle off)");
  }
  return parts.join(" · ");
}

// Each drops nulls so the wire shape matches the optional-field DM input; nested dice/recharge mirror the authoring shape.
function serializeCastSpell(cap: CastSpellCapability): SerializedCapability {
  return {
    kind: cap.kind,
    spellId: cap.spellId,
    spellName: cap.spellName,
    spellLevel: cap.spellLevel,
    castLevel: cap.castLevel,
    resource: cap.resource,
    uses: cap.uses,
    concentration: cap.concentration,
    dcMode: cap.dcMode,
    ...(cap.dcValue != null ? { dcValue: cap.dcValue } : {}),
    attackMode: cap.attackMode,
    ...(cap.attackValue != null ? { attackValue: cap.attackValue } : {}),
    ...(cap.resource === "charges" ? { chargeCost: cap.chargeCost } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializeCharges(cap: ChargesCapability): SerializedCapability {
  return {
    kind: cap.kind,
    maxCharges: cap.maxCharges,
    recharge: {
      trigger: cap.rechargeTrigger,
      ...(cap.rechargeDice ? { dice: { count: cap.rechargeDice.count, faces: cap.rechargeDice.faces } } : {}),
      ...(cap.rechargeBonus != null ? { bonus: cap.rechargeBonus } : {}),
    },
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializeGrant(cap: GrantCapability): SerializedCapability {
  return {
    kind: cap.kind,
    grantType: cap.grantType,
    ...(cap.grantOn ? { grantOn: cap.grantOn } : {}),
    ...(cap.grantValueKind ? { grantValueKind: cap.grantValueKind } : {}),
    ...(cap.grantValue ? { grantValue: cap.grantValue } : {}),
    ...(cap.cantBeSurprised ? { cantBeSurprised: true } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

function serializePassiveBonus(cap: PassiveBonusCapability): SerializedCapability {
  return {
    kind: cap.kind,
    target: cap.target,
    op: cap.op,
    value: cap.value,
    ...(cap.targetKey ? { targetKey: cap.targetKey } : {}),
    ...(cap.condition ? { condition: cap.condition } : {}),
    ...(cap.description ? { description: cap.description } : {}),
    ...(cap.dice ? { dice: { count: cap.dice.count, faces: cap.dice.faces, ...(cap.dice.damageType ? { damageType: cap.dice.damageType } : {}) } } : {}),
  };
}

function serializeActivatedEffect(cap: ActivatedEffectCapability): SerializedCapability {
  return {
    kind: cap.kind,
    activation: cap.activation,
    target: cap.target,
    op: cap.op,
    value: cap.value,
    activatedDuration: cap.duration,
    resourceKind: cap.resourceKind,
    resourceCharges: cap.resourceCharges,
    ...(cap.targetKey ? { targetKey: cap.targetKey } : {}),
    ...(cap.resourcePeriod ? { resourcePeriod: cap.resourcePeriod } : {}),
    ...(cap.resourceKind === "charges" ? { chargeCost: cap.chargeCost } : {}),
    ...(cap.durationText ? { durationText: cap.durationText } : {}),
    ...(cap.description ? { description: cap.description } : {}),
  };
}

export function serializeCapability(row: CapabilityColumns): SerializedCapability {
  const cap = readCapability(row);
  switch (cap.kind) {
    case "castSpell":
      return serializeCastSpell(cap);
    case "charges":
      return serializeCharges(cap);
    case "grant":
      return serializeGrant(cap);
    case "passiveBonus":
      return serializePassiveBonus(cap);
    case "activatedEffect":
      return serializeActivatedEffect(cap);
    default:
      // Malformed-row fallthrough: emit the raw row's kind + description so the wire still names the payload.
      return { kind: row.kind as CapabilityKind, ...(row.description ? { description: row.description } : {}) };
  }
}

// Null when the target isn't yet wired into a per-target modifier channel. The "ac" channel (#383) is consumed at the serialize acParts seam, not by buffsByTarget. Reuses the same channel keys active buffs already use so item bonuses and cast buffs sum together on read.
export function passiveBonusChannel(cap: PassiveBonusCapability): string | null {
  switch (cap.target) {
    case "skill":
      return cap.targetKey ?? null;
    case "damage":
      return "meleeDamage";
    case "attack":
      return "attackRoll";
    case "ac":
      return "ac";
    default:
      return null;
  }
}

// Shaped like the fields serializeCharacter reads off an ActiveBuff (source + modifier) so it merges into the same channel.
export interface ItemPassiveContribution {
  target: string;
  modifier: number;
  source: string;
  // #383: surfaced as reminder text where the channel can't auto-apply it.
  condition?: string;
}

// An item is "active" when equipped OR attuned; only then do its scalar add-op capabilities apply.
export interface PassiveBonusItem {
  name: string;
  equipped: boolean;
  attuned: boolean;
  capabilities: CapabilityColumns[];
}

// setTo, dice-valued, and unchanneled targets are skipped this slice.
function passiveBonusContribution(
  col: CapabilityColumns,
  itemName: string,
): ItemPassiveContribution | null {
  const cap = readCapability(col);
  if (cap.kind !== "passiveBonus") return null;
  if (cap.op !== "add") return null;
  if (cap.dice) return null;
  const channel = passiveBonusChannel(cap);
  if (!channel) return null;
  return {
    target: channel,
    modifier: cap.value,
    source: itemName,
    ...(cap.condition ? { condition: cap.condition } : {}),
  };
}

export function deriveItemPassiveBonuses(items: PassiveBonusItem[]): ItemPassiveContribution[] {
  const out: ItemPassiveContribution[] = [];
  for (const item of items) {
    if (!item.equipped && !item.attuned) continue;
    for (const col of item.capabilities) {
      const contribution = passiveBonusContribution(col, item.name);
      if (contribution) out.push(contribution);
    }
  }
  return out;
}

// #545: an item that requires attunement is active only when attuned; otherwise when equipped.
export interface GrantItem {
  name: string;
  equipped: boolean;
  attuned: boolean;
  requiresAttunement: boolean;
  capabilities: CapabilityColumns[];
}

export function isItemActive(item: { equipped: boolean; attuned: boolean; requiresAttunement: boolean }): boolean {
  return item.requiresAttunement ? item.attuned : item.equipped;
}

// Stays backend-private, unlike its advantage/proficiency siblings: serializeCharacter remaps `value` to `damageType` on a resistance/immunity and `condition` on a condition immunity, so the wire shape is a different type that merely looks alike.
export interface ItemTraitGrant {
  value: string;
  source: string;
}

export interface DerivedItemGrants {
  resistances: ItemTraitGrant[];
  immunities: ItemTraitGrant[];
  conditionImmunities: ItemTraitGrant[];
  advantages: ItemAdvantageGrant[];
  proficiencies: ItemProficiencyGrant[];
}

function collectTraitGrant(bucket: ItemTraitGrant[], cap: GrantCapability, source: string) {
  if (cap.grantValue) bucket.push({ value: cap.grantValue, source });
}

function collectAdvantageGrant(out: DerivedItemGrants, cap: GrantCapability, source: string) {
  if (!cap.grantOn) return;
  // initiative/attack are whole-axis — drop any stale skill/ability qualifier.
  const wholeAxis = cap.grantOn === "initiative" || cap.grantOn === "attack";
  out.advantages.push({
    on: cap.grantOn,
    ...(!wholeAxis && cap.grantValueKind ? { valueKind: cap.grantValueKind } : {}),
    ...(!wholeAxis && cap.grantValue ? { value: cap.grantValue } : {}),
    cantBeSurprised: cap.cantBeSurprised,
    source,
    ...(cap.description ? { description: cap.description } : {}),
  });
}

function collectProficiencyGrant(out: DerivedItemGrants, cap: GrantCapability, source: string) {
  if (cap.grantValue && cap.grantValueKind && (PROFICIENCY_KINDS as readonly string[]).includes(cap.grantValueKind)) {
    out.proficiencies.push({ profType: cap.grantValueKind as ProficiencyKind, value: cap.grantValue, source });
  }
}

const GRANT_COLLECTORS: Record<GrantType, (out: DerivedItemGrants, cap: GrantCapability, source: string) => void> = {
  resistance: (out, cap, source) => collectTraitGrant(out.resistances, cap, source),
  immunity: (out, cap, source) => collectTraitGrant(out.immunities, cap, source),
  conditionImmunity: (out, cap, source) => collectTraitGrant(out.conditionImmunities, cap, source),
  advantage: collectAdvantageGrant,
  proficiency: collectProficiencyGrant,
};

// #456: resistance feeds the halve channel; advantage/conditionImmunity/immunity surface as flags + text.
export function deriveItemGrants(items: GrantItem[]): DerivedItemGrants {
  const out: DerivedItemGrants = {
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    advantages: [],
    proficiencies: [],
  };
  for (const item of items) {
    if (!isItemActive(item)) continue;
    for (const col of item.capabilities) {
      const cap = readCapability(col);
      if (cap.kind !== "grant") continue;
      GRANT_COLLECTORS[cap.grantType]?.(out, cap, item.name);
    }
  }
  return out;
}

export function itemResistedDamageTypes(items: GrantItem[]): Set<string> {
  return new Set(deriveItemGrants(items).resistances.map((r) => r.value));
}

export function itemImmuneDamageTypes(items: GrantItem[]): Set<string> {
  return new Set(deriveItemGrants(items).immunities.map((i) => i.value));
}

export interface AttunementPrereq {
  kind: AttunementPrereqKind;
  value: string | null;
}

export interface AttunementSubject {
  classEntries: { name: string; subclassRef?: SubclassCasterRef | null }[];
  raceName: string | null;
  alignment: string | null;
}

// #1485: picks the indefinite article from the initial LETTER, not the initial sound — wrong for a consonant-sounding vowel initial ("an Unicorn Rider") or a silent h ("a Hour"), both reachable since attunementPrereqValue is DM free text.
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

// Every arm routes through withArticle so a future AttunementPrereqKind cannot reintroduce a hardcoded article.
export function describeAttunementPrereq(prereq: AttunementPrereq): string {
  switch (prereq.kind) {
    case "spellcaster":
      return withArticle("spellcaster");
    case "class":
      return withArticle(prereq.value ?? "specific class");
    case "species":
      return withArticle(prereq.value ?? "specific species");
    case "alignment":
      // The article agrees with the interposed alignment, never with "creature".
      return `${withArticle(prereq.value ?? "specific alignment")} creature`;
  }
}

// Comparisons are case-insensitive; spellcaster is met when any class entry has a nonzero caster fraction.
export function meetsAttunementPrereq(prereq: AttunementPrereq, subject: AttunementSubject): boolean {
  const want = (prereq.value ?? "").trim().toLowerCase();
  switch (prereq.kind) {
    case "spellcaster":
      return subject.classEntries.some((e) => casterFractionFor(e.name, e.subclassRef) !== "none");
    case "class":
      return subject.classEntries.some((e) => e.name.trim().toLowerCase() === want);
    case "species":
      return (subject.raceName ?? "").trim().toLowerCase() === want;
    case "alignment":
      return (subject.alignment ?? "").trim().toLowerCase() === want;
  }
}
