/**
 * Pure event → chat-line transform for the Session Log (#1237). No JSX here —
 * SessionLog.tsx maps the FeedItem[] this produces onto `<li>`/`<details>`, and
 * resolves each segment's `tone`/`damageType` to a Tailwind class via
 * `lib/events.ts` (`logToneClass`/`damageTypeTone`).
 *
 * Pipeline: filter reverted/revert → tag rounds → merge attack+damage swings
 * (by `swingId`, #1235) → reverse to oldest-first (chat convention: newest at
 * the bottom) → collapse same-kind roll runs (#983) → insert round separators.
 */

import { formatRollBreakdown } from "@/lib/dice";
import type { CharacterEvent } from "@/types/character";
import type {
  RollEventAttackComponents,
  RollEventData,
  RollEventDamageComponents,
  RollEventMode,
  RollEventModeSource,
} from "@character-sheet/shared-types";

import type { LogTone } from "@/lib/events";

export interface LogSegment {
  text: string;
  bold?: boolean;
  /** Overrides the row's own `italic` for this segment only (e.g. a miss line
   *  is italic overall, but the weapon name inside it isn't — mockup spec). */
  italic?: boolean;
  tone?: LogTone;
  /** Colors this segment by damage type instead of `tone` — physical/unknown
   *  types resolve to neutral ink (see `damageTypeTone` in lib/events.ts). */
  damageType?: string;
}

export interface DrillInRow {
  label: string;
  /** Present for a "formula = total" row; absent for a standalone note-only aside. */
  formula?: string;
  total?: string;
  /** Italic aside, e.g. an advantage/disadvantage reason or "Called a miss…". */
  note?: string;
}

export interface FeedRow {
  id: string;
  round?: number;
  tone: LogTone;
  /** Whole-line italic (miss lines); individual segments can override. */
  italic?: boolean;
  segments: LogSegment[];
  /** Present only for roll-category rows — drives the `<details>` chevron. */
  drillIn?: DrillInRow[];
  /** Roll-run collapse (#983) grouping key; unset for non-roll rows. */
  runKind?: string;
}

export type FeedItem =
  | { kind: "row"; row: FeedRow }
  | { kind: "rollRun"; id: string; label: string; hidden: FeedRow[]; visible: FeedRow }
  | { kind: "separator"; id: string; round: number };

// CombatLogRow and SessionLog must count/render the exact same "displayable"
// set or their counts drift (#1237 regression guard) — both filter through
// `filterActive`/`visibleLogEvents` below rather than repeating the predicate.
function filterActive(events: CharacterEvent[]): CharacterEvent[] {
  return events.filter((e) => !e.reverted && e.type !== "revert");
}

/** Reverted/undo events and round-advance markers are never shown or counted. */
export function visibleLogEvents(events: CharacterEvent[]): CharacterEvent[] {
  return filterActive(events).filter((e) => e.type !== "combatRoundAdvanced");
}

/**
 * Round-per-event map: combatStarted/combatRoundAdvanced/combatEnded anchor a
 * running round counter, and every other event inside a combat block inherits
 * it. Ported unchanged from the pre-#1237 SessionLog.
 */
function buildRoundMap(activeEvents: CharacterEvent[]): Map<string, number> {
  const roundById = new Map<string, number>();
  let currentRound: number | null = null;
  for (const e of [...activeEvents].reverse()) {
    if (e.type === "combatStarted") {
      currentRound = 1;
    } else if (e.type === "combatRoundAdvanced") {
      const dataRound = (e.data as { round?: number } | undefined)?.round;
      currentRound = dataRound ?? (currentRound !== null ? currentRound + 1 : 2);
    } else if (e.type === "combatEnded") {
      currentRound = null;
    } else if (currentRound !== null) {
      roundById.set(e.id, currentRound);
    }
  }
  return roundById;
}

// Shared by the attack/damage/ability-roll builders below, e.g. "+ 3 (Proficiency)".
function signedAddend(value: number, label: string): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign} ${Math.abs(value)} (${label})`;
}

// "Advantage (flanking)" / "Disadvantage (Prone)" — modeSources is only
// populated for attack rolls (#1235); check/save/initiative fall back to the
// bare mode word since their wire shape carries no source list.
function rollModeNote(
  rollMode: RollEventMode | undefined,
  modeSources: RollEventModeSource[] | undefined,
): string | null {
  if (!rollMode || rollMode === "normal") return null;
  const label = rollMode === "advantage" ? "Advantage" : "Disadvantage";
  const names = [...new Set((modeSources ?? []).filter((m) => m.mode === rollMode).map((m) => m.source))];
  return names.length > 0 ? `${label} (${names.join(", ")})` : label;
}

// (component key, display label) pairs, in mockup render order — a lookup
// instead of one `if` per field, shared by the attack/damage drill-in
// builders below to keep each a flat, low-branching function (#1237). Only
// NON-ZERO addends render, per the mockup spec's explicit note — the wire
// type carries no ability NAME (STR vs DEX) for attack/damage rolls, only the
// numeric modifier, so addends are labeled generically ("Ability"), never
// guessed (#1237 mockup/data mismatch — see the session report).
const ATTACK_ADDEND_LABELS: [keyof RollEventAttackComponents, string][] = [
  ["abilityMod", "Ability"],
  ["proficiencyBonus", "Proficiency"],
  ["rangedBonus", "Ranged"],
  ["attackRollBonus", "Bonus"],
];

const DAMAGE_ADDEND_LABELS: [keyof RollEventDamageComponents, string][] = [
  ["abilityMod", "Ability"],
  ["meleeDamageBonus", "Melee bonus"],
];

// `T`'s fields are all-number component records (RollEventAttackComponents /
// RollEventDamageComponents) but neither declares a string index signature,
// so `keyof T` is indexed via a cast rather than widening T's own type.
function labeledAddends<T extends object>(components: T | undefined, labels: [keyof T, string][]): string[] {
  if (!components) return [];
  const values = components as unknown as Record<keyof T, number>;
  return labels.filter(([key]) => values[key]).map(([key, label]) => signedAddend(values[key], label));
}

function buildAttackDrillRow(e: CharacterEvent): DrillInRow {
  const data = (e.data ?? {}) as RollEventData;
  const dieToken = data.faces && data.faces.length > 0 ? `1d20 (${data.nat20 ? "nat 20" : data.faces[0]})` : null;
  const parts = [dieToken, ...labeledAddends(data.attackComponents, ATTACK_ADDEND_LABELS)].filter(
    (p): p is string => p !== null,
  );
  return {
    label: "Attack",
    formula: parts.join(" "),
    total: `${data.total}`,
    note: rollModeNote(data.rollMode, data.modeSources) ?? undefined,
  };
}

// The leading `NdM` token plus its kept faces, e.g. "2d6 (5, 6 — dice doubled)".
// Null when specLabel isn't a recognizable dice spec or faces are missing.
function diceToken(specLabel: string | undefined, faces: number[] | undefined, doubled: boolean): string | null {
  const match = specLabel?.match(/^(\d+d\d+)/);
  if (!match || !faces || faces.length === 0) return null;
  return `${match[1]} (${faces.join(", ")}${doubled ? " — dice doubled" : ""})`;
}

function buildDamageDrillRow(e: CharacterEvent, label = "Damage"): DrillInRow {
  const data = (e.data ?? {}) as RollEventData;
  const dice = diceToken(data.specLabel, data.faces, data.crit === true) ?? data.specLabel;
  const parts = [dice, ...labeledAddends(data.damageComponents, DAMAGE_ADDEND_LABELS)].filter((p): p is string =>
    Boolean(p),
  );
  return {
    label,
    formula: parts.join(" "),
    total: data.damageType ? `${data.total} ${data.damageType}` : `${data.total}`,
  };
}

function damageWordSegment(damageType: string | undefined, trailingWord: boolean): LogSegment {
  const text = damageType ? (trailingWord ? `${damageType} damage.` : `${damageType}.`) : trailingWord ? "damage." : ".";
  return { text, damageType };
}

// The roll-category row builders below (through buildAbilityRollRow) all set
// `drillIn`, which is what gives a row its `<details>` chevron in SessionLog.
function buildAttackOnlyRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (data.verdict !== "miss") {
    // Ambiguous/legacy data (no paired damage event and no confirmed miss) —
    // degrade to the plain summary rather than asserting a result we can't back.
    return { id: e.id, round, tone: "default", segments: [{ text: e.summary }] };
  }
  const source = data.source || e.summary;
  const note = rollModeNote(data.rollMode, data.modeSources);
  return {
    id: e.id,
    round,
    tone: "muted",
    italic: true,
    runKind: "swing",
    segments: [
      { text: source, bold: true, italic: false },
      { text: " — missed." },
      ...(note ? [{ text: ` ${note}` }] : []),
    ],
    drillIn: [buildAttackDrillRow(e), { label: "", note: "Called a miss — no damage rolled." }],
  };
}

// Forward-compat (#1237): RollEventData.target/outcome are reserved but never
// populated (no enemy/target model — self-or-announce, CLAUDE.md). A future
// "→ Goblin hit" continuation just appends one more LogSegment to `segments`
// below — no restructuring needed when that data eventually exists.
function buildSwingRow(
  attackEvent: CharacterEvent | undefined,
  damageEvent: CharacterEvent,
  round: number | undefined,
): FeedRow {
  const dmgData = (damageEvent.data ?? {}) as RollEventData;
  const atkData = (attackEvent?.data ?? {}) as RollEventData;
  const source = dmgData.source || atkData.source || damageEvent.summary;
  const isCrit = dmgData.crit === true || dmgData.verdict === "crit";

  const segments: LogSegment[] = isCrit
    ? [
        { text: source, bold: true },
        { text: " — " },
        { text: "critical hit!", tone: "harm" },
        { text: " " },
        { text: `${dmgData.total}`, bold: true },
        { text: " " },
        damageWordSegment(dmgData.damageType, true),
      ]
    : [
        { text: source, bold: true },
        { text: " — hit for " },
        { text: `${dmgData.total}`, bold: true },
        { text: " " },
        damageWordSegment(dmgData.damageType, false),
      ];

  return {
    id: damageEvent.id,
    round,
    tone: "default",
    runKind: "swing",
    segments,
    drillIn: [
      ...(attackEvent ? [buildAttackDrillRow(attackEvent)] : []),
      buildDamageDrillRow(damageEvent),
    ],
  };
}

function buildDamageOnlyRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  const source = data.source || e.summary;
  return {
    id: e.id,
    round,
    tone: "default",
    runKind: "damageRoll",
    segments: [
      { text: source, bold: true },
      { text: " — " },
      { text: `${data.total}`, bold: true },
      { text: " " },
      damageWordSegment(data.damageType, true),
    ],
    drillIn: [buildDamageDrillRow(e)],
  };
}

function buildAbilityRollRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  // `source` is always pre-resolved display text (e.g. "Perception check",
  // "Initiative") at every call site — never a raw skill/ability key, so no
  // label lookup is needed here (unlike data.skill/data.ability themselves).
  const label = data.source || e.summary;
  // The backend normalizes every unset optional RollEventData field to `null`
  // (a JSON column can't hold `undefined`), not just leaving it absent — a
  // strict `!== undefined` check here rendered a literal "(DC null)" (#1237).
  const dc = data.dc != null ? ` (DC ${data.dc})` : "";
  const formula =
    data.specLabel && data.faces && data.faces.length > 0
      ? formatRollBreakdown(data.specLabel, data.faces)
      : (data.specLabel ?? "");
  return {
    id: e.id,
    round,
    tone: "default",
    runKind: e.type,
    segments: [
      { text: "Rolled " },
      { text: label, bold: true },
      { text: " — " },
      { text: `${data.total}`, bold: true },
      { text: `${dc}.` },
    ],
    drillIn: [
      {
        label: "Roll",
        formula,
        total: `${data.total}`,
        note: rollModeNote(data.rollMode, data.modeSources) ?? undefined,
      },
    ],
  };
}

// Exact mockup copy for the session/combat lifecycle events; buildPlainRow
// below covers the rest of the mockup's color table (heal/damage-taken/
// conditions/resource spend) outside the roll categories, falling back to
// `event.summary` in default ink for everything else (re-styled, not reworded).
const LIFECYCLE_COPY: Partial<Record<string, string>> = {
  sessionStarted: "Session started.",
  sessionEnded: "Session ended.",
  combatStarted: "Combat began.",
  combatEnded: "Combat ended.",
};

// DM award/revoke events (#382) carry the recipient in data.recipientName; the
// feed spans the whole party, so append "→ Recipient" (the stored summary
// alone doesn't say who the grant landed on). Ported from the pre-#1237 code.
function lootSummary(e: CharacterEvent): string | null {
  if (e.type !== "awarded" && e.type !== "revoked") return null;
  const recipient = (e.data as { recipientName?: string } | undefined)?.recipientName;
  return recipient ? `${e.summary} → ${recipient}` : e.summary;
}

function healSentence(e: CharacterEvent): string {
  const data = (e.data ?? {}) as { amount?: number };
  return data.amount !== undefined ? `Healed ${data.amount} HP.` : e.summary;
}

function damageTakenSentence(e: CharacterEvent): string {
  const data = (e.data ?? {}) as { amount?: number; damageType?: string | null; resisted?: boolean; immune?: boolean };
  if (data.amount === undefined) return e.summary;
  const type = data.damageType ? ` ${data.damageType}` : "";
  const note = data.immune ? " (immune)" : data.resisted ? " (resisted)" : "";
  return `Took ${data.amount}${type} damage${note}.`;
}

function toned(e: CharacterEvent, round: number | undefined, tone: LogTone, text: string): FeedRow {
  return { id: e.id, round, tone, segments: [{ text }] };
}

const RESOURCE_EVENT_TYPES = new Set(["spendResource", "restoreResource"]);
const LOOT_EVENT_TYPES = new Set(["awarded", "revoked"]);

// Ordered (predicate, tone, sentence) rules for the mockup's plain-row color
// table — a lookup instead of a branch chain keeps the dispatcher flat (#1237).
const PLAIN_ROW_RULES: { test: (e: CharacterEvent) => boolean; tone: LogTone; text: (e: CharacterEvent) => string }[] = [
  { test: (e) => e.category === "hitPoints" && e.type === "heal", tone: "heal", text: healSentence },
  { test: (e) => e.category === "hitPoints" && e.type === "damage", tone: "harm", text: damageTakenSentence },
  { test: (e) => e.category === "conditions", tone: "harm", text: (e) => e.summary },
  { test: (e) => e.category === "resources" && RESOURCE_EVENT_TYPES.has(e.type), tone: "resource", text: (e) => e.summary },
  { test: (e) => LOOT_EVENT_TYPES.has(e.type), tone: "default", text: (e) => lootSummary(e) ?? e.summary },
];

function buildPlainRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const lifecycle = LIFECYCLE_COPY[e.type];
  if (lifecycle) return toned(e, round, "muted", lifecycle);

  const rule = PLAIN_ROW_RULES.find((r) => r.test(e));
  return toned(e, round, rule?.tone ?? "default", rule ? rule.text(e) : e.summary);
}

// The main dispatch (buildRows, below) walks the newest-first filtered list
// and merges swing pairs; split into one small handler per event kind rather
// than one big branch chain so each stays independently low-complexity (#1237).
function buildSwingPartnerMap(events: CharacterEvent[]): Map<string, CharacterEvent> {
  const map = new Map<string, CharacterEvent>();
  for (const e of events) {
    if (e.type !== "damageRoll") continue;
    const data = e.data as RollEventData | undefined;
    if (data?.swingId) map.set(data.swingId, e);
  }
  return map;
}

// Returns null when this attack's damage partner will render the merged swing
// row instead (rendered at the damage event's position, see handleDamageRollEvent).
function handleAttackRollEvent(
  e: CharacterEvent,
  swingPartner: Map<string, CharacterEvent>,
  round: number | undefined,
): FeedRow | null {
  const data = (e.data ?? {}) as RollEventData;
  const partner = data.swingId ? swingPartner.get(data.swingId) : undefined;
  return partner ? null : buildAttackOnlyRow(e, round);
}

function handleDamageRollEvent(e: CharacterEvent, events: CharacterEvent[], round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (!data.swingId) {
    // A rider (Flame Tongue +2d6) or a spell damage roll — neither carries
    // swingId today (#1235 gap), so it can't be folded into a parent swing
    // line; render it as its own roll row instead of guessing a correlation.
    return buildDamageOnlyRow(e, round);
  }
  const attackEvent = events.find(
    (a) => a.type === "attackRoll" && ((a.data ?? {}) as RollEventData).swingId === data.swingId,
  );
  return buildSwingRow(attackEvent, e, round);
}

const ABILITY_ROLL_TYPES = new Set(["checkRoll", "saveRoll", "initiativeRoll"]);

function buildRows(events: CharacterEvent[], roundById: Map<string, number>): FeedRow[] {
  const swingPartner = buildSwingPartnerMap(events);
  const rows: FeedRow[] = [];
  for (const e of events) {
    const round = roundById.get(e.id);
    if (e.type === "attackRoll") {
      const row = handleAttackRollEvent(e, swingPartner, round);
      if (row) rows.push(row);
    } else if (e.type === "damageRoll") {
      rows.push(handleDamageRollEvent(e, events, round));
    } else if (ABILITY_ROLL_TYPES.has(e.type)) {
      rows.push(buildAbilityRollRow(e, round));
    } else {
      rows.push(buildPlainRow(e, round));
    }
  }
  return rows;
}

const RUN_KIND_LABEL: Record<string, string> = {
  swing: "weapon",
  damageRoll: "damage",
  checkRoll: "check",
  saveRoll: "save",
  initiativeRoll: "initiative",
};

// Walk oldest-first and collapse a maximal run (≥2) of adjacent same-`runKind`
// rows behind a disclosure — a party's worth of initiative rolls otherwise
// buries everything else (#983). The NEWEST row of the run stays visible in
// place (chronologically last); everything earlier in the run collapses.
function collapseRuns(rows: FeedRow[]): FeedItem[] {
  const items: FeedItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.runKind) {
      let j = i + 1;
      while (j < rows.length && rows[j].runKind === row.runKind) j += 1;
      if (j - i >= 2) {
        const visible = rows[j - 1];
        const hidden = rows.slice(i, j - 1);
        const noun = RUN_KIND_LABEL[row.runKind] ?? row.runKind;
        const label = row.runKind === "swing" ? `${hidden.length} earlier ${noun} swings` : `${hidden.length} earlier ${noun} rolls`;
        items.push({ kind: "rollRun", id: visible.id, label, hidden, visible });
        i = j;
        continue;
      }
    }
    items.push({ kind: "row", row });
    i += 1;
  }
  return items;
}

function itemRound(item: FeedItem): number | undefined {
  if (item.kind === "row") return item.row.round;
  if (item.kind === "rollRun") return (item.hidden[0] ?? item.visible).round;
  return undefined;
}

// A round separator marks each transition into a new round; resetting
// `lastRound` on any non-round row means a LATER combat's round 1 gets its
// own separator too, even though the number repeats.
function insertSeparators(items: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = [];
  let lastRound: number | undefined;
  let sepIndex = 0;
  for (const item of items) {
    const round = itemRound(item);
    if (round === undefined) {
      lastRound = undefined;
    } else if (round !== lastRound) {
      out.push({ kind: "separator", id: `sep-${sepIndex++}`, round });
      lastRound = round;
    }
    out.push(item);
  }
  return out;
}

/** Build the ready-to-render chat feed (oldest-first) from a session's raw events. */
export function buildFeedItems(events: CharacterEvent[]): FeedItem[] {
  const active = filterActive(events);
  const roundById = buildRoundMap(active);
  const displayable = active.filter((e) => e.type !== "combatRoundAdvanced");
  const rowsNewestFirst = buildRows(displayable, roundById);
  const oldestFirst = [...rowsNewestFirst].reverse();
  return insertSeparators(collapseRuns(oldestFirst));
}
