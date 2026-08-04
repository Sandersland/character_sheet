/**
 * Pure event → chat-line transform for the Session Log (#1237). No JSX here —
 * SessionLog maps the FeedItem[] this produces onto `<li>`/`<details>`, and
 * resolves each segment's `tone`/`damageType` to a Tailwind class via
 * `logToneClass`/`damageTypeTone`.
 *
 * Pipeline: filter reverted/revert → tag rounds → merge attack+damage swings
 * (by `swingId`, #1235) → reverse to oldest-first (chat convention: newest at
 * the bottom) → collapse same-kind, same-round roll runs (#983) → insert round
 * separators.
 */

import { abilityLabel } from "@/lib/abilities";
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
   *  types resolve to neutral ink (see `damageTypeTone`). */
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
  | { kind: "rollRun"; id: string; label: string; hidden: FeedRow[]; visible: FeedRow[] }
  | { kind: "separator"; id: string; round: number };

function filterActive(events: CharacterEvent[]): CharacterEvent[] {
  return events.filter((e) => !e.reverted && e.type !== "revert");
}

/** Reverted/undo events and round-advance markers are never shown or counted. */
export function visibleLogEvents(events: CharacterEvent[]): CharacterEvent[] {
  return filterActive(events).filter((e) => e.type !== "combatRoundAdvanced");
}

/**
 * The "N events" badge (CombatLogRow) and the rendered feed (SessionLog) both
 * derive their count from this — merged swings count once (buildRows already
 * folds an attack+damage pair into one FeedRow), rows hidden inside a
 * collapsed run still count (they're still log content), round separators
 * never do (#1237 §4 — the two counts drifted when each rolled its own).
 */
export function feedItemRowCount(items: FeedItem[]): number {
  return items.reduce((n, item) => {
    if (item.kind === "separator") return n;
    if (item.kind === "row") return n + 1;
    return n + item.hidden.length + item.visible.length;
  }, 0);
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
// POPULATED for attack rolls (#1235's producer, useAttackRolls); the type
// itself carries no such restriction, check/save/initiative just never set
// it, so those fall back to the bare mode word.
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
// NON-ZERO addends render, per the mockup spec's explicit note. "abilityMod"'s
// label here is the fallback for an event logged before #1361 added `ability`
// to the wire type — labeledAddends swaps in the named ability via
// `abilityLabel` whenever the component carries one.
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
// `ability` is read off `components` directly (never through the cast Record,
// which is number-only) and resolved to display text via `abilityLabel` —
// never the raw key (ad-hoc capitalization of ability keys has shipped twice).
function labeledAddends<T extends { ability?: string }>(
  components: T | undefined,
  labels: [keyof T, string][],
): string[] {
  if (!components) return [];
  const values = components as unknown as Record<keyof T, number>;
  return labels
    .filter(([key]) => values[key])
    .map(([key, label]) => {
      const resolvedLabel = key === "abilityMod" && components.ability ? abilityLabel(components.ability) : label;
      return signedAddend(values[key], resolvedLabel);
    });
}

// `RollEventData.total` is typed as required, but old/malformed persisted
// rows can still lack it at runtime (a JSON column enforces nothing) — every
// row builder below checks this FIRST and degrades to the stored summary
// rather than interpolating the literal string "undefined" (#1237 §5).
function hasNumericTotal(data: RollEventData): boolean {
  return typeof data.total === "number";
}

function summaryFallbackRow(e: CharacterEvent, round: number | undefined): FeedRow {
  return { id: e.id, round, tone: "default", segments: [{ text: e.summary }] };
}

// The leading "1d20 (...)" token for an attack roll. Plain "1d20 (12)" when
// there's no dropped die (normal roll, or a pre-#1359 event that never
// carried droppedFaces); "1d20 (5, 9 — lower kept)" when there is one, "lower"
// vs "higher" decided by comparing the two recorded face VALUES — never
// re-derived from `rollMode`, which is a separate field absent on old events.
function attackDieToken(data: RollEventData): string | null {
  if (!data.faces || data.faces.length === 0) return null;
  const keptLabel = data.nat20 ? "nat 20" : `${data.faces[0]}`;
  const dropped = data.droppedFaces?.[0];
  if (dropped === undefined) return `1d20 (${keptLabel})`;
  const keptWord =
    data.faces[0] < dropped ? "lower kept" : data.faces[0] > dropped ? "higher kept" : "kept";
  return `1d20 (${keptLabel}, ${dropped} — ${keptWord})`;
}

function buildAttackDrillRow(e: CharacterEvent): DrillInRow {
  const data = (e.data ?? {}) as RollEventData;
  const dieToken = attackDieToken(data);
  const parts = [dieToken, ...labeledAddends(data.attackComponents, ATTACK_ADDEND_LABELS)].filter(
    (p): p is string => p !== null,
  );
  return {
    label: "Attack",
    // Undefined rather than "" when nothing decomposed: DrillInLine keys off
    // `formula === undefined` to tell a formula row from an aside, so an empty
    // string would render a bare "= 17".
    formula: parts.length > 0 ? parts.join(" ") : undefined,
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
    // Undefined rather than "", same contract as buildAttackDrillRow: DrillInLine
    // keys off `formula === undefined` to tell a formula row from an aside.
    formula: parts.length > 0 ? parts.join(" ") : undefined,
    total: data.damageType ? `${data.total} ${data.damageType}` : `${data.total}`,
  };
}

function damageWordSegment(damageType: string | undefined, trailingWord: boolean): LogSegment {
  const text = damageType ? (trailingWord ? `${damageType} damage.` : `${damageType}.`) : trailingWord ? "damage." : ".";
  return { text, damageType };
}

// An attackRoll with no damage partner: either a confirmed miss, or a solo
// attack roll that never gets one (a spell attack, which carries no swingId
// — #1237 §3). Both branches still render the full sentence + drill-in from
// whatever RollEventData the event carries; only the total-missing guard above
// degrades to the raw summary.
function buildAttackOnlyRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (!hasNumericTotal(data)) return summaryFallbackRow(e, round);

  const source = data.source || e.summary;
  if (data.verdict === "miss") {
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

  return {
    id: e.id,
    round,
    tone: "default",
    runKind: "swing",
    segments: [
      { text: "Rolled " },
      { text: source, bold: true },
      { text: " — " },
      { text: `${data.total}`, bold: true },
      { text: "." },
    ],
    drillIn: [buildAttackDrillRow(e)],
  };
}

function critSwingSegments(source: string, dmgData: RollEventData): LogSegment[] {
  return [
    { text: source, bold: true },
    { text: " — " },
    { text: "critical hit!", tone: "harm" },
    { text: " " },
    { text: `${dmgData.total}`, bold: true },
    { text: " " },
    damageWordSegment(dmgData.damageType, true),
  ];
}

function hitSwingSegments(source: string, dmgData: RollEventData): LogSegment[] {
  return [
    { text: source, bold: true },
    { text: " — hit for " },
    { text: `${dmgData.total}`, bold: true },
    { text: " " },
    damageWordSegment(dmgData.damageType, false),
  ];
}

// The attack partner's own total can independently be missing (old data) —
// omit just its drill-in line rather than losing the whole (otherwise-valid) row.
function attackDrillInFor(attackEvent: CharacterEvent | undefined): DrillInRow[] {
  if (!attackEvent || !hasNumericTotal((attackEvent.data ?? {}) as RollEventData)) return [];
  return [buildAttackDrillRow(attackEvent)];
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
  if (!hasNumericTotal(dmgData)) return summaryFallbackRow(damageEvent, round);

  const atkData = (attackEvent?.data ?? {}) as RollEventData;
  const source = dmgData.source || atkData.source || damageEvent.summary;
  const isCrit = dmgData.crit === true || dmgData.verdict === "crit";

  return {
    id: damageEvent.id,
    round,
    tone: "default",
    runKind: "swing",
    segments: isCrit ? critSwingSegments(source, dmgData) : hitSwingSegments(source, dmgData),
    drillIn: [...attackDrillInFor(attackEvent), buildDamageDrillRow(damageEvent)],
  };
}

function buildDamageOnlyRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (!hasNumericTotal(data)) return summaryFallbackRow(e, round);

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

// The backend normalizes every unset optional RollEventData field to `null`
// (a JSON column can't hold `undefined`), not just leaving it absent — a
// strict `!== undefined` check here rendered a literal "(DC null)" (#1237).
function dcSuffix(dc: number | undefined | null): string {
  return dc != null ? ` (DC ${dc})` : "";
}

function abilityRollFormula(data: RollEventData): string {
  return data.specLabel && data.faces && data.faces.length > 0
    ? formatRollBreakdown(data.specLabel, data.faces)
    : (data.specLabel ?? "");
}

function buildAbilityRollRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (!hasNumericTotal(data)) return summaryFallbackRow(e, round);

  // `source` is always pre-resolved display text (e.g. "Perception check",
  // "Initiative") at every call site — never a raw skill/ability key, so no
  // label lookup is needed here (unlike data.skill/data.ability themselves).
  const label = data.source || e.summary;
  const dc = dcSuffix(data.dc);
  const formula = abilityRollFormula(data);
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

// Backend `applyHealOp`/`applyDamageOp` append "(before → after HP)" to the
// summary, but the structured event data carries no beforeCurrent/current
// fields — the transition can only be recovered from the stored summary text,
// so it's regex-extracted rather than rebuilt.
function hpTransitionTag(summary: string): string | null {
  const match = summary.match(/\(\d+\s*→\s*\d+\s*HP\)/);
  return match ? match[0] : null;
}

function healSegments(e: CharacterEvent): LogSegment[] {
  const data = (e.data ?? {}) as { amount?: number };
  if (data.amount === undefined) return [{ text: e.summary }];
  const tag = hpTransitionTag(e.summary);
  const sentence: LogSegment = { text: `Healed ${data.amount} HP.` };
  return tag ? [sentence, { text: ` ${tag}`, tone: "muted" }] : [sentence];
}

interface DamageTakenData {
  amount?: number;
  damageType?: string | null;
  resisted?: boolean;
  immune?: boolean;
  rawAmount?: number;
}

function damageTakenSentence(data: DamageTakenData): string {
  const type = data.damageType ? ` ${data.damageType}` : "";
  const note = data.immune ? " (immune)" : data.resisted ? " (resisted)" : "";
  return `Took ${data.amount}${type} damage${note}.`;
}

// Preserve the pre-resistance amount + HP transition as a muted trailing tag
// (mockup's `.tag` treatment) rather than dropping them — live-play history
// the mockup didn't consider (#1237 §7).
function damageTakenTag(data: DamageTakenData, summary: string): string | null {
  const rawTag =
    (data.resisted || data.immune) && data.rawAmount !== undefined
      ? `(${data.immune ? "immune, from" : "resisted from"} ${data.rawAmount})`
      : null;
  const tagText = [rawTag, hpTransitionTag(summary)].filter(Boolean).join(" ");
  return tagText || null;
}

function damageTakenSegments(e: CharacterEvent): LogSegment[] {
  const data = (e.data ?? {}) as DamageTakenData;
  if (data.amount === undefined) return [{ text: e.summary }];
  const sentence: LogSegment = { text: damageTakenSentence(data) };
  const tag = damageTakenTag(data, e.summary);
  return tag ? [sentence, { text: ` ${tag}`, tone: "muted" }] : [sentence];
}

const RESOURCE_EVENT_TYPES = new Set(["spendResource", "restoreResource"]);
const LOOT_EVENT_TYPES = new Set(["awarded", "revoked"]);

// Ordered (predicate, tone, segments) rules for the mockup's plain-row color
// table — a lookup instead of a branch chain keeps the dispatcher flat (#1237).
const PLAIN_ROW_RULES: {
  test: (e: CharacterEvent) => boolean;
  tone: LogTone;
  segments: (e: CharacterEvent) => LogSegment[];
}[] = [
  { test: (e) => e.category === "hitPoints" && e.type === "heal", tone: "heal", segments: healSegments },
  { test: (e) => e.category === "hitPoints" && e.type === "damage", tone: "harm", segments: damageTakenSegments },
  { test: (e) => e.category === "conditions", tone: "harm", segments: (e) => [{ text: e.summary }] },
  {
    test: (e) => e.category === "resources" && RESOURCE_EVENT_TYPES.has(e.type),
    tone: "resource",
    segments: (e) => [{ text: e.summary }],
  },
  {
    test: (e) => LOOT_EVENT_TYPES.has(e.type),
    tone: "default",
    segments: (e) => [{ text: lootSummary(e) ?? e.summary }],
  },
];

function buildPlainRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const lifecycle = LIFECYCLE_COPY[e.type];
  if (lifecycle) return { id: e.id, round, tone: "muted", segments: [{ text: lifecycle }] };

  const rule = PLAIN_ROW_RULES.find((r) => r.test(e));
  return {
    id: e.id,
    round,
    tone: rule?.tone ?? "default",
    segments: rule ? rule.segments(e) : [{ text: e.summary }],
  };
}

interface SwingPairing {
  /** damage event id → its paired attack event, for swingIds with a partner. */
  attackForDamage: Map<string, CharacterEvent>;
  /** Attack event ids consumed as a swing partner — these render nothing on
   *  their own; they surface inside the paired damage row instead. */
  consumedAttackIds: Set<string>;
}

// Pairs at MOST one attack with one damage per swingId (#1237 §6): a bug in
// useAttackRolls' swingIdRef (never cleared between damage calls) can log two
// damage events under the same swingId, or — more rarely — two attacks. Every
// event beyond the first pairing must still render as its own standalone row;
// none may vanish. Walks oldest-first so "first attack, first damage" wins
// the pairing regardless of the feed's own (newest-first) order.
function buildSwingPairing(events: CharacterEvent[]): SwingPairing {
  const chronological = [...events].reverse();
  const pendingAttackBySwing = new Map<string, CharacterEvent>();
  const attackForDamage = new Map<string, CharacterEvent>();
  const consumedAttackIds = new Set<string>();
  for (const e of chronological) {
    const data = e.data as RollEventData | undefined;
    if (!data?.swingId) continue;
    if (e.type === "attackRoll") {
      if (!pendingAttackBySwing.has(data.swingId)) pendingAttackBySwing.set(data.swingId, e);
    } else if (e.type === "damageRoll") {
      const pendingAttack = pendingAttackBySwing.get(data.swingId);
      if (pendingAttack) {
        attackForDamage.set(e.id, pendingAttack);
        consumedAttackIds.add(pendingAttack.id);
        pendingAttackBySwing.delete(data.swingId);
      }
    }
  }
  return { attackForDamage, consumedAttackIds };
}

// Returns null when this attack's damage partner will render the merged swing
// row instead (rendered at the damage event's position, see handleDamageRollEvent).
function handleAttackRollEvent(
  e: CharacterEvent,
  pairing: SwingPairing,
  round: number | undefined,
): FeedRow | null {
  return pairing.consumedAttackIds.has(e.id) ? null : buildAttackOnlyRow(e, round);
}

function handleDamageRollEvent(e: CharacterEvent, pairing: SwingPairing, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as RollEventData;
  if (!data.swingId) {
    // A rider (Flame Tongue +2d6) or a spell damage roll — neither carries
    // swingId today (#1235 gap), so it can't be folded into a parent swing
    // line; render it as its own roll row instead of guessing a correlation.
    return buildDamageOnlyRow(e, round);
  }
  return buildSwingRow(pairing.attackForDamage.get(e.id), e, round);
}

const ABILITY_ROLL_TYPES = new Set(["checkRoll", "saveRoll", "initiativeRoll"]);

function buildRows(events: CharacterEvent[], roundById: Map<string, number>): FeedRow[] {
  const pairing = buildSwingPairing(events);
  const rows: FeedRow[] = [];
  for (const e of events) {
    const round = roundById.get(e.id);
    if (e.type === "attackRoll") {
      const row = handleAttackRollEvent(e, pairing, round);
      if (row) rows.push(row);
    } else if (e.type === "damageRoll") {
      rows.push(handleDamageRollEvent(e, pairing, round));
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

// A run collapses only at ≥4 consecutive same-`runKind`, same-`round` rows,
// keeping the most recent 3 visible (#1237 §2) — a normal 2-3 swing round (or
// a Flurry of Blows) shows every line; a 10-attack barrage still collapses.
// The `round` check keeps a run from ever spanning a round boundary (#1237
// §1) — without it, a run's reported round came from its oldest (hidden) row,
// so the newer round's separator silently never rendered.
const RUN_COLLAPSE_THRESHOLD = 4;
const RUN_VISIBLE_COUNT = 3;

// Singular is reachable, not theoretical: the smallest collapsing run is
// RUN_COLLAPSE_THRESHOLD rows with RUN_VISIBLE_COUNT shown, hiding one.
function runLabel(runKind: string, hiddenCount: number): string {
  const noun = RUN_KIND_LABEL[runKind] ?? runKind;
  const unit = runKind === "swing" ? "swing" : "roll";
  return `${hiddenCount} earlier ${noun} ${hiddenCount === 1 ? unit : `${unit}s`}`;
}

function collapseRuns(rows: FeedRow[]): FeedItem[] {
  const items: FeedItem[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.runKind) {
      let j = i + 1;
      while (j < rows.length && rows[j].runKind === row.runKind && rows[j].round === row.round) j += 1;
      const runLength = j - i;
      if (runLength >= RUN_COLLAPSE_THRESHOLD) {
        const splitAt = j - RUN_VISIBLE_COUNT;
        const hidden = rows.slice(i, splitAt);
        const visible = rows.slice(splitAt, j);
        const label = runLabel(row.runKind, hidden.length);
        items.push({ kind: "rollRun", id: visible[0].id, label, hidden, visible });
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
  // Every row in a run shares one round (collapseRuns never spans a
  // boundary), so the first visible/hidden row's round applies to the whole item.
  if (item.kind === "rollRun") return (item.hidden[0] ?? item.visible[0])?.round;
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
