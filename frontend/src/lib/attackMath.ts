import { formatRollSpec } from "@/lib/dice";
import type { RollSpec } from "@/lib/dice";
import type { Character } from "@/types/character";
import type {
  AttackDamageRider,
  AttackRollSpec,
  AttackRow,
  AttackRowKind,
  DiceRider,
  RollEventAttackComponents,
  RollEventDamageComponents,
  WeaponGrip,
} from "@character-sheet/shared-types";

// `condition` (e.g. "vs dragons") is reminder text — never auto-gated on a target.
export interface DamageRider {
  id: string;
  spec: AttackRollSpec;
  damageType?: string;
  label: string;
  rollLabel: string;
  logSource: string;
  condition?: string;
}

// Label casing differs deliberately per surface (roll label vs log source vs display name) — do not collapse to one served string.
export interface AttackEntry {
  id: string;
  name: string;
  attackLabel: string;
  damageLabel: string;
  note?: string;
  magical?: boolean;
  attackSpec: AttackRollSpec;
  damageSpec: AttackRollSpec;
  damageType: string;
  attackRollLabel: string;
  damageRollLabel: string;
  logSource: string;
  damageRiders: DamageRider[];
  // Undefined on unarmed/improvised rows — the backend doesn't decompose those (#1235).
  attackComponents?: RollEventAttackComponents;
  damageComponents?: RollEventDamageComponents;
}

function damageRiderLabel(count: number, faces: number, damageType?: string): string {
  const dice = `+${count}d${faces}`;
  return damageType ? `${dice} ${damageType}` : dice;
}

// sourceName is the row's unadorned name — off-hand riders roll/log under the weapon's own name, not "Dagger (off-hand)".
function decorateRider(sourceName: string, rider: AttackDamageRider): DamageRider {
  const label = damageRiderLabel(rider.spec.count, rider.spec.faces, rider.damageType);
  return {
    id: rider.id,
    spec: rider.spec,
    damageType: rider.damageType,
    label,
    rollLabel: `${sourceName}: ${label}`,
    logSource: sourceName,
    ...(rider.condition ? { condition: rider.condition } : {}),
  };
}

export const SNEAK_ATTACK_RIDER_ID = "sneak-attack";

// damageType stays unset — Sneak Attack matches the weapon's damage type (SRD 5.2 "Sneak Attack"; PHB'14 p.96), via handleDamageRider's `?? armedEntry.damageType` fallback.
export function sneakAttackDamageRider(sneak: DiceRider): DamageRider {
  const label = damageRiderLabel(sneak.dice.count, sneak.dice.faces);
  return {
    id: SNEAK_ATTACK_RIDER_ID,
    spec: { count: sneak.dice.count, faces: sneak.dice.faces, modifier: 0 },
    label,
    rollLabel: `Sneak Attack: ${label}`,
    logSource: "Sneak Attack",
  };
}

// The one sanctioned client-side exception to "attack math is served": crit doubles dice count only, applied post-serialization — not duplicated rules logic, do not flag again (#1434/#1378).
export function critDamageSpec(spec: RollSpec): RollSpec {
  return { ...spec, crit: true };
}

export function weaponGripLabel(grip: WeaponGrip | undefined): string {
  return grip === "versatile-two-handed" || grip === "two-handed" ? " (two-handed)" : "";
}

export function unarmedDamageDisplay(unarmed: Character["unarmedStrike"]): number | string {
  const { faces, modifier } = unarmed.damage;
  return faces === 1
    ? Math.max(1, 1 + modifier)
    : `1d${faces}${modifier !== 0 ? ` ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}` : ""}`;
}

export function hasSuperiorityDice(character: Character): boolean {
  return (
    character.resources?.pools?.some(
      (p) => p.key === "superiorityDice" && p.total > 0,
    ) ?? false
  );
}

export function attacksExhausted(attack: { used: number; total: number } | null): boolean {
  return attack !== null && attack.used >= attack.total;
}

// Shared by main-hand and off-hand rows so the two never drift — " (off-hand)" is the only display difference (#813).
function decorateWeaponRow(row: AttackRow): AttackEntry {
  const gripLabel = weaponGripLabel(row.grip);
  return {
    id: row.id,
    name: row.offHand ? `${row.name} (off-hand)` : row.name,
    attackLabel: `+${row.attackSpec.modifier}`,
    damageLabel: `${formatRollSpec(row.damageSpec)} ${row.damageType}${gripLabel}`,
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: `${row.name} attack`,
    damageRollLabel: `${row.name} damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: row.damageRiders.map((rider) => decorateRider(row.name, rider)),
    attackComponents: row.attackComponents,
    damageComponents: row.damageComponents,
  };
}

function decorateUnarmedRow(row: AttackRow, unarmed: Character["unarmedStrike"]): AttackEntry {
  return {
    id: row.id,
    name: row.name,
    attackLabel: `+${row.attackSpec.modifier}`,
    damageLabel: `${unarmedDamageDisplay(unarmed)} ${row.damageType}`,
    magical: row.magical,
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: "Unarmed strike attack",
    damageRollLabel: `Unarmed strike damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: [],
  };
}

// proficient comes from the served improvisedWeapon, not the row — this note is its only reader.
function decorateImprovisedRow(
  row: AttackRow,
  improvised: Character["improvisedWeapon"],
): AttackEntry {
  return {
    id: row.id,
    name: row.name,
    attackLabel: `${row.attackSpec.modifier >= 0 ? "+" : ""}${row.attackSpec.modifier}`,
    damageLabel: `${formatRollSpec(row.damageSpec)} ${row.damageType}`,
    note: improvised.proficient ? undefined : "(no proficiency)",
    attackSpec: row.attackSpec,
    damageSpec: row.damageSpec,
    damageType: row.damageType,
    attackRollLabel: "Improvised weapon attack",
    damageRollLabel: `Improvised weapon damage (${row.damageType})`,
    logSource: row.name,
    damageRiders: [],
  };
}

function decorateRow(character: Character, row: AttackRow): AttackEntry {
  switch (row.kind) {
    case "unarmed":
      return decorateUnarmedRow(row, character.unarmedStrike);
    case "improvised":
      return decorateImprovisedRow(row, character.improvisedWeapon);
    default:
      return decorateWeaponRow(row);
  }
}

// Unarmed and improvised are always served — a missing row is a serializer bug, not a valid empty state.
function rowOfKind(character: Character, kind: AttackRowKind): AttackRow {
  const row = character.attackRows.find((r) => r.kind === kind);
  if (!row) throw new Error(`Character ${character.id} has no ${kind} attack row`);
  return row;
}

function unarmedAndImprovisedEntries(character: Character): AttackEntry[] {
  return character.attackRows
    .filter((row) => row.kind !== "weapon")
    .map((row) => decorateRow(character, row));
}

// Off-hand row excluded — it belongs to the bonus action and shares its weapon's id (see AttackRow).
export function buildAttackEntries(character: Character): AttackEntry[] {
  return character.attackRows
    .filter((row) => !row.offHand)
    .map((row) => decorateRow(character, row));
}

// null when the loadout can't dual-wield; damage already has the ability modifier dropped by deriveOffHandDamage (#732).
export function buildOffHandEntry(character: Character): AttackEntry | null {
  const row = character.attackRows.find((r) => r.offHand);
  return row ? decorateWeaponRow(row) : null;
}

// Collapses same-name equipped weapons into one card (first occurrence wins) — a presentation choice, not a 5e rule; the server emits one un-deduped row per weapon.
function equippedWeaponEntries(character: Character): AttackEntry[] {
  const seen = new Set<string>();
  const entries: AttackEntry[] = [];
  for (const row of character.attackRows) {
    if (row.kind !== "weapon" || row.offHand || seen.has(row.name)) continue;
    seen.add(row.name);
    entries.push(decorateWeaponRow(row));
  }
  return entries;
}

export function buildBonusSwingEntry(character: Character, variant: "twf" | "unarmed"): AttackEntry | null {
  return variant === "unarmed"
    ? decorateRow(character, rowOfKind(character, "unarmed"))
    : buildOffHandEntry(character);
}

// Unlike buildAttackForms, never includes equipped weapons or Improvised — SRD 5.2 grants no weapon choice for Flurry of Blows (#1217).
export function buildUnarmedOnlyForms(character: Character): AttackEntry[] {
  return [decorateRow(character, rowOfKind(character, "unarmed"))];
}

// flurryOfBlows.count (Heightened Focus at Monk 10 per SRD 5.2; no upgrade in SRD 5.1) is resolved server-side — read verbatim, never re-derive from level (#1505/#1244); falls back to 2 when unloaded.
export function flurryStrikeCount(character: Character): number {
  return character.availableActions?.find((a) => a.key === "flurryOfBlows")?.count ?? 2;
}

export function buildAttackForms(character: Character): AttackEntry[] {
  return [...equippedWeaponEntries(character), ...unarmedAndImprovisedEntries(character)];
}
