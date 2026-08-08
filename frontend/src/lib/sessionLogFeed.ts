/**
 * Pure event → chat-line transform for the Session Log (#1237, rewritten for
 * the unified combat resolver #1830). No JSX here — SessionLog maps the
 * FeedItem[] this produces onto `<li>`/`<details>`, and resolves each
 * segment's `tone`/`damageType` to a Tailwind class via
 * `logToneClass`/`damageTypeTone`.
 *
 * Pipeline: filter reverted/revert → tag rounds → build one row per event
 * (a `resolveAction` event is ALREADY one consolidated roll — no attack+damage
 * pairing to do, #1827 model B) → reverse to oldest-first (chat convention:
 * newest at the bottom) → collapse same-kind, same-round roll runs (#983) →
 * insert round separators.
 */

import { abilityLabel } from "@/lib/abilities";
import { formatRollBreakdown } from "@/lib/dice";
import type { CharacterEvent } from "@/types/character";
import type {
  ResolveActionEventData,
  ResolveActionEventEffect,
  ResolveActionEventToHit,
  ResolveActionEventSave,
  RollEventAttackComponents,
  RollEventDamageComponents,
  RollEventData,
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
 * derive their count from this — a resolution counts once (it was always one
 * event, #1827 model B), rows hidden inside a collapsed run still count
 * (they're still log content), round separators never do (#1237 §4 — the two
 * counts drifted when each rolled its own).
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

// Shared by the to-hit/effect/ability-roll builders below, e.g. "+ 3 (Proficiency)".
function signedAddend(value: number, label: string): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign} ${Math.abs(value)} (${label})`;
}

// "Advantage (flanking)" / "Disadvantage (Prone)" — modeSources is only
// POPULATED for the standalone check/save/initiative roll producer; a
// resolveAction's toHit carries no mode-source list (its `bonus` is already
// the resolved flat total, not a decomposed breakdown), so this stays scoped
// to buildAbilityRollRow below.
function rollModeNote(
  rollMode: RollEventMode | undefined,
  modeSources: RollEventModeSource[] | undefined,
): string | null {
  if (!rollMode || rollMode === "normal") return null;
  const label = rollMode === "advantage" ? "Advantage" : "Disadvantage";
  const names = [...new Set((modeSources ?? []).filter((m) => m.mode === rollMode).map((m) => m.source))];
  return names.length > 0 ? `${label} (${names.join(", ")})` : label;
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

// The backend normalizes every unset optional RollEventData field to `null`
// (a JSON column can't hold `undefined`), not just leaving it absent — a
// strict `!== undefined` check here rendered a literal "(DC null)" (#1237).
function dcSuffix(dc: number | undefined | null): string {
  return dc != null ? ` (DC ${dc})` : "";
}

function damageWordSegment(damageType: string | undefined, trailingWord: boolean): LogSegment {
  const text = damageType ? (trailingWord ? `${damageType} damage.` : `${damageType}.`) : trailingWord ? "damage." : ".";
  return { text, damageType };
}

// The trailing "N type damage."/"N type." words after an effect's total is
// already appended to the sentence — shared by the attack-hit, save, and
// auto-hit resolution builders below so each stays a flat, low-branching
// function. A heal has no damage-type word, just " HP.".
function effectTailSegments(effect: ResolveActionEventEffect, trailingWord: boolean): LogSegment[] {
  if (effect.kind === "heal") return [{ text: " HP." }];
  return [{ text: " " }, damageWordSegment(effect.type, trailingWord)];
}

// The leading "1d20 (...)" token for a resolution's to-hit roll. Plain
// "1d20 (12)" when there's no dropped die (a normal roll, or a single-entry
// `faces`); "1d20 (5, 9 — lower kept)" when advantage/disadvantage rolled a
// second die — "lower" vs "higher" decided by comparing the two recorded face
// VALUES, never re-derived from a rollMode (resolveAction carries no such field).
function toHitDieToken(toHit: ResolveActionEventToHit): string {
  const keptLabel = toHit.nat20 ? "nat 20" : `${toHit.kept}`;
  if (toHit.faces.length < 2) return `1d20 (${keptLabel})`;
  const dropped = toHit.faces.find((face) => face !== toHit.kept) ?? toHit.faces[0];
  const keptWord = toHit.kept < dropped ? "lower kept" : toHit.kept > dropped ? "higher kept" : "kept";
  return `1d20 (${keptLabel}, ${dropped} — ${keptWord})`;
}

// (component key, display label) pairs, in mockup render order — a lookup
// instead of one `if` per field, shared by the to-hit/effect drill-in
// builders below. Only NON-ZERO addends render, per the mockup spec's
// explicit note. Reused unchanged from the pre-#1830 attackRoll/damageRoll
// renderer (#1237) — an adapter (#1832/#1833) populates `components` on the
// resolveAction event with this same shape.
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

function unlabeledAddend(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign} ${Math.abs(value)}`;
}

// Floor for when a resolution's effect carries no decomposed `components`
// (pre-adapter — #1832/#1833 populate it): pulls the trailing flat modifier
// straight off the served `spec` text ("1d6 + 4" → 4, "3d4+3" → 3) so the
// drill-in's addend still reconciles `formula` to `total` even with no
// labeled breakdown. `null` when `spec` has no trailing modifier (e.g. "1d8").
function parseSpecModifier(spec: string): number | null {
  const match = spec.match(/([+-])\s*(\d+)\s*$/);
  if (!match) return null;
  return (match[1] === "-" ? -1 : 1) * Number(match[2]);
}

// resolveAction's `toHit.bonus` is the server-resolved flat total (rules
// logic is backend-owned). When an adapter has attached the decomposed
// `components` breakdown, render THAT instead — same labeled-addend
// treatment the pre-#1830 attackRoll drill-in used; otherwise fall back to
// the one flat "+N (Bonus)" line, which still reconciles the formula to
// `total` on its own.
function buildToHitDrillRow(toHit: ResolveActionEventToHit): DrillInRow {
  const dieToken = toHitDieToken(toHit);
  const addends = toHit.components
    ? labeledAddends(toHit.components, ATTACK_ADDEND_LABELS)
    : toHit.bonus !== 0
      ? [signedAddend(toHit.bonus, "Bonus")]
      : [];
  return { label: "Attack", formula: [dieToken, ...addends].join(" "), total: `${toHit.total}` };
}

// The leading `NdM` token plus its kept faces, e.g. "2d6 (5, 6 — dice doubled)".
// Reused for an effect's `spec`/`faces`, same as the old damage drill-in.
function diceToken(spec: string | undefined, faces: number[] | undefined, doubled: boolean): string | null {
  const match = spec?.match(/^(\d+d\d+)/);
  if (!match || !faces || faces.length === 0) return null;
  return `${match[1]} (${faces.join(", ")}${doubled ? " — dice doubled" : ""})`;
}

// The formula must always reconcile to `total` (a mismatch reads as a live
// bug to a player): with `components`, render the labeled addends; without
// them, floor to `spec`'s own trailing modifier (`parseSpecModifier`) as one
// unlabeled addend — either way the dice + addends sum to `total`.
function buildEffectDrillRow(effect: ResolveActionEventEffect): DrillInRow {
  const label = effect.kind === "heal" ? "Healing" : "Damage";
  const dice = diceToken(effect.spec, effect.faces, effect.crit) ?? effect.spec;
  const addends = effect.components
    ? labeledAddends(effect.components, DAMAGE_ADDEND_LABELS)
    : (() => {
        const modifier = parseSpecModifier(effect.spec);
        return modifier ? [unlabeledAddend(modifier)] : [];
      })();
  return {
    label,
    formula: [dice, ...addends].join(" "),
    total: effect.kind === "heal" ? `${effect.total}` : `${effect.total} ${effect.type}`,
  };
}

// A saving throw is announced to the DM, not rolled by the caster (no enemy/
// target model, self-or-announce, CLAUDE.md) — so its drill-in carries no dice
// formula, just the DC the DM rolls against.
function buildSaveDrillRow(save: ResolveActionEventSave): DrillInRow {
  return { label: "Save", total: `DC ${save.dc} ${abilityLabel(save.ability)}` };
}

// A miss carries no effect roll — mirrors the pre-#1830 miss line exactly
// (italic, muted, weapon name un-italicized inside it).
function buildMissResolutionRow(e: CharacterEvent, toHit: ResolveActionEventToHit, source: string, round: number | undefined): FeedRow {
  return {
    id: e.id,
    round,
    tone: "muted",
    italic: true,
    runKind: "resolveAction",
    segments: [{ text: source, bold: true, italic: false }, { text: " — missed." }],
    drillIn: [buildToHitDrillRow(toHit), { label: "", note: "Called a miss — no damage rolled." }],
  };
}

// A hit/crit with no effect data is unreachable from the backend's own
// schema (a hit always carries the rolled effect) but old/malformed events
// could still lack one — degrade to a bare roll line rather than throwing.
function buildBareToHitRow(e: CharacterEvent, toHit: ResolveActionEventToHit, source: string, round: number | undefined): FeedRow {
  return {
    id: e.id,
    round,
    tone: "default",
    runKind: "resolveAction",
    segments: [{ text: "Rolled " }, { text: source, bold: true }, { text: " — " }, { text: `${toHit.total}`, bold: true }, { text: "." }],
    drillIn: [buildToHitDrillRow(toHit)],
  };
}

// Attack-roll resolution (weapon swing, Fire Bolt): to-hit die, then effect
// on anything but a miss. Forward-compat (#1237): a future "→ Goblin hit"
// continuation just appends one more LogSegment — no restructuring needed.
function buildAttackResolutionRow(e: CharacterEvent, data: ResolveActionEventData, source: string, round: number | undefined): FeedRow {
  const toHit = data.toHit!;
  if (toHit.verdict === "miss") return buildMissResolutionRow(e, toHit, source, round);
  if (!data.effect) return buildBareToHitRow(e, toHit, source, round);

  const effect = data.effect;
  const isCrit = toHit.verdict === "crit" || effect.crit === true;
  const isHeal = effect.kind === "heal";
  const segments: LogSegment[] = isCrit
    ? [
        { text: source, bold: true },
        { text: " — " },
        { text: "critical hit!", tone: "harm" },
        { text: " " },
        { text: `${effect.total}`, bold: true },
        ...effectTailSegments(effect, true),
      ]
    : isHeal
      ? [
          { text: source, bold: true },
          { text: " — healed " },
          { text: `${effect.total}`, bold: true },
          { text: " HP." },
        ]
      : [
          { text: source, bold: true },
          { text: " — hit for " },
          { text: `${effect.total}`, bold: true },
          ...effectTailSegments(effect, false),
        ];

  return {
    id: e.id,
    round,
    tone: isHeal ? "heal" : "default",
    runKind: "resolveAction",
    segments,
    drillIn: [buildToHitDrillRow(toHit), buildEffectDrillRow(effect)],
  };
}

// Saving-throw resolution (Sacred Flame): DC announced, no roll of the
// caster's own — effect (if any) follows the DC in one sentence.
function buildSaveResolutionRow(e: CharacterEvent, data: ResolveActionEventData, source: string, round: number | undefined): FeedRow {
  const save = data.save!;
  const effect = data.effect;
  const segments: LogSegment[] = [
    { text: source, bold: true },
    { text: ` — DC ${save.dc} ${abilityLabel(save.ability)} save` },
  ];
  if (effect) {
    segments.push({ text: ", " }, { text: `${effect.total}`, bold: true }, ...effectTailSegments(effect, false));
  } else {
    segments.push({ text: "." });
  }

  const drillIn: DrillInRow[] = [buildSaveDrillRow(save)];
  if (effect) drillIn.push(buildEffectDrillRow(effect));

  return { id: e.id, round, tone: "default", runKind: "resolveAction", segments, drillIn };
}

// Auto-hit (Magic Missile) or a self-targeted heal with neither a to-hit nor
// a save: the effect lands unconditionally. Multi-die effects (Magic
// Missile's 3 darts) are ONE `effect` roll whose `faces` already carries the
// per-dart breakdown — buildEffectDrillRow reads it with no instances model.
function buildEffectOnlyResolutionRow(e: CharacterEvent, data: ResolveActionEventData, source: string, round: number | undefined): FeedRow {
  const effect = data.effect!;
  const isHeal = effect.kind === "heal";
  const segments: LogSegment[] = isHeal
    ? [{ text: source, bold: true }, { text: " — healed " }, { text: `${effect.total}`, bold: true }, { text: " HP." }]
    : [{ text: source, bold: true }, { text: " — " }, { text: `${effect.total}`, bold: true }, ...effectTailSegments(effect, true)];

  return {
    id: e.id,
    round,
    tone: isHeal ? "heal" : "default",
    runKind: "resolveAction",
    segments,
    drillIn: [buildEffectDrillRow(effect)],
  };
}

// No-roll utility resolution (Druidcraft): one tap, done — no drill-in.
function buildNoRollResolutionRow(e: CharacterEvent, source: string, round: number | undefined): FeedRow {
  return {
    id: e.id,
    round,
    tone: "default",
    runKind: "resolveAction",
    segments: [{ text: `Cast ${source}.` }],
  };
}

// Dispatches a `resolveAction` event to its shape — toHit/save/effect are
// mutually exclusive-ish by design (see ResolveActionEventData): a weapon
// swing or attack-roll spell sets toHit, a saving-throw spell sets save, an
// auto-hit or heal-only spell sets only effect, and a no-roll utility spell
// (Druidcraft) sets none of the three.
function buildResolveActionRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as ResolveActionEventData;
  const source = data.source || e.summary;

  if (data.toHit) return buildAttackResolutionRow(e, data, source, round);
  if (data.save) return buildSaveResolutionRow(e, data, source, round);
  if (data.effect) return buildEffectOnlyResolutionRow(e, data, source, round);
  return buildNoRollResolutionRow(e, source, round);
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

const ABILITY_ROLL_TYPES = new Set(["checkRoll", "saveRoll", "initiativeRoll"]);

function buildRows(events: CharacterEvent[], roundById: Map<string, number>): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const e of events) {
    const round = roundById.get(e.id);
    if (e.type === "resolveAction") {
      rows.push(buildResolveActionRow(e, round));
    } else if (ABILITY_ROLL_TYPES.has(e.type)) {
      rows.push(buildAbilityRollRow(e, round));
    } else {
      rows.push(buildPlainRow(e, round));
    }
  }
  return rows;
}

const RUN_KIND_LABEL: Record<string, string> = {
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
  if (runKind === "resolveAction") {
    return `${hiddenCount} earlier ${hiddenCount === 1 ? "resolution" : "resolutions"}`;
  }
  const noun = RUN_KIND_LABEL[runKind] ?? runKind;
  return `${hiddenCount} earlier ${noun} ${hiddenCount === 1 ? "roll" : "rolls"}`;
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
