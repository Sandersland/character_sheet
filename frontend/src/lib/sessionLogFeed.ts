// SessionLog maps this module's FeedItem[] onto <li>/<details>, resolving each segment's tone/damageType via logToneClass/damageTypeTone.
import { abilityLabel } from "@/lib/abilities";
import { formatRollBreakdown } from "@/lib/dice";
import type { CharacterEvent } from "@/types/character";
import type {
  ResolveActionEventData,
  ResolveActionEventEffect,
  ResolveActionEventInstance,
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
  /** Overrides the row's own `italic` for this segment only (e.g. a miss line is italic overall, but the weapon name inside it isn't — mockup spec). */
  italic?: boolean;
  tone?: LogTone;
  /** Colors this segment by damage type instead of `tone` — physical/unknown types resolve to neutral ink (see `damageTypeTone`). */
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
  /** Roll-run collapse grouping key; unset for non-roll rows. */
  runKind?: string;
}

export type FeedItem =
  | { kind: "row"; row: FeedRow }
  | { kind: "rollRun"; id: string; label: string; hidden: FeedRow[]; visible: FeedRow[] }
  | { kind: "separator"; id: string; round: number };

function filterActive(events: CharacterEvent[]): CharacterEvent[] {
  return events.filter((e) => !e.reverted && e.type !== "revert");
}

export function visibleLogEvents(events: CharacterEvent[]): CharacterEvent[] {
  return filterActive(events).filter((e) => e.type !== "combatRoundAdvanced");
}

// CombatLogRow's badge and SessionLog's feed both derive their count from this — they drifted before when each rolled its own (#1237 §4).
export function feedItemRowCount(items: FeedItem[]): number {
  return items.reduce((n, item) => {
    if (item.kind === "separator") return n;
    if (item.kind === "row") return n + 1;
    return n + item.hidden.length + item.visible.length;
  }, 0);
}

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

function signedAddend(value: number, label: string): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign} ${Math.abs(value)} (${label})`;
}

// modeSources is only populated for the standalone check/save/initiative producer — resolveAction's toHit carries no mode-source list, so this stays scoped to buildAbilityRollRow.
function rollModeNote(
  rollMode: RollEventMode | undefined,
  modeSources: RollEventModeSource[] | undefined,
): string | null {
  if (!rollMode || rollMode === "normal") return null;
  const label = rollMode === "advantage" ? "Advantage" : "Disadvantage";
  const names = [...new Set((modeSources ?? []).filter((m) => m.mode === rollMode).map((m) => m.source))];
  return names.length > 0 ? `${label} (${names.join(", ")})` : label;
}

// RollEventData.total is typed required, but a JSON column enforces nothing at runtime — every row builder checks this first and degrades to the stored summary rather than interpolating "undefined".
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

  // `source` is always pre-resolved display text at every call site, never a raw skill/ability key — unlike data.skill/data.ability, no label lookup is needed here.
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

// The backend normalizes unset optional fields to `null`, not omission — a strict `!== undefined` check here rendered a literal "(DC null)".
function dcSuffix(dc: number | undefined | null): string {
  return dc != null ? ` (DC ${dc})` : "";
}

// No trailing punctuation of its own — effectTailSegments appends the shared "damage."/"." ending once, after the last term; undefined/empty damageType (unreachable via the validated write path) degrades to an empty word.
function typeWordSegment(damageType: string | undefined): LogSegment {
  return { text: damageType ?? "", damageType };
}

// Sums the primary `effect` with every typed rider into ONE sentence tail instead of a second feed row (#1822 fix): each term after the first is prefixed " + <total> ", with the shared "damage."/"." ending attached once, to the last term. A heal never carries a rider, so keeps its own fixed " HP." ending.
function effectTailSegments(
  effect: ResolveActionEventEffect,
  riders: ResolveActionEventEffect[],
  trailingWord: boolean,
): LogSegment[] {
  if (effect.kind === "heal") return [{ text: " HP." }];
  const segments: LogSegment[] = [];
  [effect, ...riders].forEach((term, i) => {
    segments.push({ text: i === 0 ? " " : " + " });
    if (i > 0) segments.push({ text: `${term.total}`, bold: true }, { text: " " });
    segments.push(typeWordSegment(term.type));
  });
  segments[segments.length - 1].text += trailingWord ? " damage." : ".";
  return segments;
}

// "lower"/"higher" kept is decided by comparing the two recorded face values, never re-derived from a rollMode — resolveAction carries no such field.
function toHitDieToken(toHit: ResolveActionEventToHit): string {
  const keptLabel = toHit.nat20 ? "nat 20" : `${toHit.kept}`;
  if (toHit.faces.length < 2) return `1d20 (${keptLabel})`;
  const dropped = toHit.faces.find((face) => face !== toHit.kept) ?? toHit.faces[0];
  const keptWord = toHit.kept < dropped ? "lower kept" : toHit.kept > dropped ? "higher kept" : "kept";
  return `1d20 (${keptLabel}, ${dropped} — ${keptWord})`;
}

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

// keyof T is indexed via a cast since neither component record type declares a string index signature.
// `ability` is read off `components` directly and resolved via `abilityLabel` — never the raw key (ad-hoc capitalization has shipped twice).
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

// Pulls the trailing flat modifier off the served `spec` text ("1d6 + 4" → 4) so the drill-in's addend still reconciles `formula` to `total` with no labeled breakdown; null when spec has no trailing modifier.
function parseSpecModifier(spec: string): number | null {
  const match = spec.match(/([+-])\s*(\d+)\s*$/);
  if (!match) return null;
  return (match[1] === "-" ? -1 : 1) * Number(match[2]);
}

// toHit.bonus is the server-resolved flat total (rules logic is backend-owned) — render the decomposed `components` breakdown when an adapter attached one, otherwise fall back to one flat "+N (Bonus)" line.
function buildToHitDrillRow(toHit: ResolveActionEventToHit): DrillInRow {
  const dieToken = toHitDieToken(toHit);
  const addends = toHit.components
    ? labeledAddends(toHit.components, ATTACK_ADDEND_LABELS)
    : toHit.bonus !== 0
      ? [signedAddend(toHit.bonus, "Bonus")]
      : [];
  return { label: "Attack", formula: [dieToken, ...addends].join(" "), total: `${toHit.total}` };
}

function diceToken(spec: string | undefined, faces: number[] | undefined, doubled: boolean): string | null {
  const match = spec?.match(/^(\d+d\d+)/);
  if (!match || !faces || faces.length === 0) return null;
  return `${match[1]} (${faces.join(", ")}${doubled ? " — dice doubled" : ""})`;
}

// The formula must always reconcile to `total`: with `components`, render labeled addends; without them, floor to `spec`'s own trailing modifier as one unlabeled addend.
// `doubled` defaults to `effect.crit`, but the primary effect passes the row's own computed `isCrit` instead — a DM-ruled crit (`toHit.verdict === "crit"`) can have `effect.crit` false, and the drill-in must match the summary's "critical hit!" wording.
function buildEffectDrillRow(effect: ResolveActionEventEffect, doubled: boolean = effect.crit): DrillInRow {
  const label = effect.kind === "heal" ? "Healing" : "Damage";
  const dice = diceToken(effect.spec, effect.faces, doubled) ?? effect.spec;
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

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

// Labeled by the rider's OWN damage type ("Fire"), not the generic "Damage" — riders persisted before `source` existed fall back to the type label.
function buildRiderDrillRow(effect: ResolveActionEventEffect): DrillInRow {
  return { ...buildEffectDrillRow(effect), label: effect.source ?? capitalize(effect.type) };
}

// A saving throw is announced to the DM, not rolled by the caster (self-or-announce, CLAUDE.md) — its drill-in carries no dice formula, just the DC the DM rolls against.
function buildSaveDrillRow(save: ResolveActionEventSave): DrillInRow {
  return { label: "Save", total: `DC ${save.dc} ${abilityLabel(save.ability)}` };
}

// A miss carries no effect roll — italic, muted, with the weapon name un-italicized inside it.
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

// Unreachable via the backend's schema (a hit always carries its effect), but old/malformed events could still lack one — degrade to a bare roll line rather than throwing.
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

// `riders` sum into the SAME sentence/drill-in as the primary effect — a Flame Tongue swing stays exactly one row, and the rider is undoable only as part of this one event.
function buildAttackResolutionRow(
  e: CharacterEvent,
  data: ResolveActionEventData,
  source: string,
  riders: ResolveActionEventEffect[],
  round: number | undefined,
): FeedRow {
  const toHit = data.toHit!;
  if (toHit.verdict === "miss") return buildMissResolutionRow(e, toHit, source, round);
  if (!data.effect) return buildBareToHitRow(e, toHit, source, round);

  const effect = data.effect;
  const isCrit = toHit.verdict === "crit" || effect.crit === true;
  const isHeal = effect.kind === "heal";
  // Assassinate: a crit this app can't verify against a target/AC still needs a legible cause in the log, not just "critical hit!" — see ResolveActionEventData's own contract comment.
  const critLabel = data.assassinate ? "critical hit — Assassinate!" : "critical hit!";
  const segments: LogSegment[] = isCrit
    ? [
        { text: source, bold: true },
        { text: " — " },
        { text: critLabel, tone: "harm" },
        { text: " " },
        { text: `${effect.total}`, bold: true },
        ...effectTailSegments(effect, riders, true),
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
          ...effectTailSegments(effect, riders, false),
        ];

  return {
    id: e.id,
    round,
    tone: isHeal ? "heal" : "default",
    runKind: "resolveAction",
    segments,
    drillIn: [buildToHitDrillRow(toHit), buildEffectDrillRow(effect, isCrit), ...riders.map(buildRiderDrillRow)],
  };
}

function buildSaveResolutionRow(
  e: CharacterEvent,
  data: ResolveActionEventData,
  source: string,
  riders: ResolveActionEventEffect[],
  round: number | undefined,
): FeedRow {
  const save = data.save!;
  const effect = data.effect;
  const isHeal = effect?.kind === "heal";
  const segments: LogSegment[] = [
    { text: source, bold: true },
    { text: ` — DC ${save.dc} ${abilityLabel(save.ability)} save` },
  ];
  if (effect) {
    segments.push({ text: ", " }, { text: `${effect.total}`, bold: true }, ...effectTailSegments(effect, riders, false));
  } else {
    segments.push({ text: "." });
  }

  const drillIn: DrillInRow[] = [buildSaveDrillRow(save)];
  if (effect) drillIn.push(buildEffectDrillRow(effect), ...riders.map(buildRiderDrillRow));

  return { id: e.id, round, tone: isHeal ? "heal" : "default", runKind: "resolveAction", segments, drillIn };
}

// Multi-die effects (e.g. Magic Missile's 3 darts) are ONE `effect` roll whose `faces` already carries the per-dart breakdown — no separate instances model needed.
function buildEffectOnlyResolutionRow(
  e: CharacterEvent,
  data: ResolveActionEventData,
  source: string,
  riders: ResolveActionEventEffect[],
  round: number | undefined,
): FeedRow {
  const effect = data.effect!;
  const isHeal = effect.kind === "heal";
  const segments: LogSegment[] = isHeal
    ? [{ text: source, bold: true }, { text: " — healed " }, { text: `${effect.total}`, bold: true }, { text: " HP." }]
    : [
        { text: source, bold: true },
        { text: " — " },
        { text: `${effect.total}`, bold: true },
        ...effectTailSegments(effect, riders, true),
      ];

  return {
    id: e.id,
    round,
    tone: isHeal ? "heal" : "default",
    runKind: "resolveAction",
    segments,
    drillIn: [buildEffectDrillRow(effect), ...riders.map(buildRiderDrillRow)],
  };
}

function instanceVerdictNote(toHit: ResolveActionEventToHit | null | undefined): string | undefined {
  if (!toHit) return undefined;
  if (toHit.verdict === "miss") return "Missed";
  if (toHit.verdict === "crit") return "Critical hit!";
  return "Hit";
}

// One drillIn row per instance — verdict (when the instance carries its own toHit) plus its damage
// breakdown, reusing buildEffectDrillRow so the dice token/addends render identically to a single-roll effect.
function buildInstanceDrillRow(instance: ResolveActionEventInstance, index: number): DrillInRow {
  const label = `Instance ${index + 1}`;
  const note = instanceVerdictNote(instance.toHit);
  if (!instance.effect) return { label, note: note ?? "No damage rolled." };
  const isCrit = instance.toHit?.verdict === "crit" || instance.effect.crit === true;
  return { ...buildEffectDrillRow(instance.effect, isCrit), label, note };
}

// Every seeded multi-instance effect is one damage type per cast (Scorching Ray's rays all fire, Eldritch
// Blast's beams all force, Magic Missile's darts all force) — taking type/kind from the first present
// effect is safe today. A hypothetical mixed-type instanced effect would collapse to the first type in
// this summary line; the per-instance drill-in still shows each instance's own real type regardless.
function instancesEffectTotal(instances: ResolveActionEventInstance[]): { total: number; type: string; kind: "damage" | "heal" } {
  const effects = instances
    .map((i) => i.effect)
    .filter((eff): eff is ResolveActionEventEffect => eff != null);
  return {
    total: effects.reduce((sum, eff) => sum + eff.total, 0),
    type: effects[0]?.type ?? "",
    kind: effects[0]?.kind ?? "damage",
  };
}

// Every instance missed (Scorching Ray-style, each carrying its own toHit) — same muted/italic treatment
// buildMissResolutionRow gives a single-instance miss, plural wording, one drill-in line per instance
// (each already reads "Missed" via buildInstanceDrillRow). No riders: a total miss lands no damage.
function buildAllMissedInstancedRow(
  e: CharacterEvent,
  instances: ResolveActionEventInstance[],
  source: string,
  round: number | undefined,
): FeedRow {
  return {
    id: e.id,
    round,
    tone: "muted",
    italic: true,
    runKind: "resolveAction",
    segments: [{ text: source, bold: true, italic: false }, { text: " — all missed." }],
    drillIn: instances.map(buildInstanceDrillRow),
  };
}

// A multi-instance cast (Magic Missile's darts, Scorching Ray's rays, Eldritch Blast's beams, #1981/#1982)
// stays one row: the sentence sums every instance's total the same way buildAttackResolutionRow sums
// effect+riders (via effectTailSegments, fed a synthetic effect standing in for the summed instances),
// and the drill-in lists one row per instance (verdict + damage) followed by any cast-level riders.
// `data.instances` is mutually exclusive with top-level toHit/effect at the op schema, but a top-level
// `save` can still ride alongside it (a shared DC across every instance), so it renders first when present.
function buildInstancedResolutionRow(
  e: CharacterEvent,
  data: ResolveActionEventData,
  source: string,
  riders: ResolveActionEventEffect[],
  round: number | undefined,
): FeedRow {
  const instances = data.instances!;
  if (instances.every((i) => i.toHit?.verdict === "miss")) {
    return buildAllMissedInstancedRow(e, instances, source, round);
  }

  const { total, type, kind } = instancesEffectTotal(instances);
  const isHeal = kind === "heal";
  const isCrit = instances.some((i) => i.toHit?.verdict === "crit" || i.effect?.crit === true);
  const combined: ResolveActionEventEffect = { spec: "", faces: [], total, type, kind, crit: false };
  // Assassinate (#1526): the same "critical hit — Assassinate!" cause buildAttackResolutionRow surfaces
  // for a single-instance crit, since an instanced Assassinate crit is just as target-surprised-caused.
  const critLabel = data.assassinate ? "critical hit — Assassinate!" : "critical hit!";
  const segments: LogSegment[] = isCrit
    ? [
        { text: source, bold: true },
        { text: " — " },
        { text: critLabel, tone: "harm" },
        { text: " " },
        { text: `${total}`, bold: true },
        ...effectTailSegments(combined, riders, true),
      ]
    : [
        { text: source, bold: true },
        { text: isHeal ? " — healed " : " — " },
        { text: `${total}`, bold: true },
        ...effectTailSegments(combined, riders, !isHeal),
      ];

  const drillIn: DrillInRow[] = [];
  if (data.save) drillIn.push(buildSaveDrillRow(data.save));
  drillIn.push(...instances.map(buildInstanceDrillRow), ...riders.map(buildRiderDrillRow));

  return { id: e.id, round, tone: isHeal ? "heal" : "default", runKind: "resolveAction", segments, drillIn };
}

function buildNoRollResolutionRow(e: CharacterEvent, source: string, round: number | undefined): FeedRow {
  return {
    id: e.id,
    round,
    tone: "default",
    runKind: "resolveAction",
    segments: [{ text: `Cast ${source}.` }],
  };
}

// toHit/save/effect are mutually exclusive-ish by design (see ResolveActionEventData); `riders` rides along regardless of shape, summed the same way by every builder.
// `instances` is checked first: mutually exclusive with top-level toHit/effect at the op schema, so an
// instanced event never also matches the toHit/effect branches below. Absent/empty falls straight through
// to the pre-#1982 dispatch, unchanged.
function buildResolveActionRow(e: CharacterEvent, round: number | undefined): FeedRow {
  const data = (e.data ?? {}) as ResolveActionEventData;
  const source = data.source || e.summary;
  const riders = data.riders ?? [];

  if (data.instances && data.instances.length > 0) return buildInstancedResolutionRow(e, data, source, riders, round);
  if (data.toHit) return buildAttackResolutionRow(e, data, source, riders, round);
  if (data.save) return buildSaveResolutionRow(e, data, source, riders, round);
  if (data.effect) return buildEffectOnlyResolutionRow(e, data, source, riders, round);
  return buildNoRollResolutionRow(e, source, round);
}

// Exact mockup copy — buildPlainRow covers the rest of the color table, falling back to `event.summary` for everything else (re-styled, not reworded).
const LIFECYCLE_COPY: Partial<Record<string, string>> = {
  sessionStarted: "Session started.",
  sessionEnded: "Session ended.",
  combatStarted: "Combat began.",
  combatEnded: "Combat ended.",
};

// The feed spans the whole party, so append "→ Recipient" — the stored summary alone doesn't say who a DM award/revoke landed on.
function lootSummary(e: CharacterEvent): string | null {
  if (e.type !== "awarded" && e.type !== "revoked") return null;
  const recipient = (e.data as { recipientName?: string } | undefined)?.recipientName;
  return recipient ? `${e.summary} → ${recipient}` : e.summary;
}

// Backend applyHealOp/applyDamageOp append "(before → after HP)" to the summary but the event data carries no beforeCurrent/current fields, so the transition is regex-extracted from the summary text rather than rebuilt.
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

// Preserves the pre-resistance amount + HP transition as a muted trailing tag rather than dropping them — live-play history the mockup didn't consider.
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

// A run collapses only at ≥4 consecutive same-runKind, same-round rows, keeping the most recent 3 visible — a 2-3 swing round shows every line; a 10-attack barrage still collapses.
// The `round` check keeps a run from spanning a round boundary — without it, a run's reported round came from its oldest (hidden) row, so the newer round's separator never rendered.
const RUN_COLLAPSE_THRESHOLD = 4;
const RUN_VISIBLE_COUNT = 3;

// Singular is reachable, not theoretical: the smallest collapsing run is RUN_COLLAPSE_THRESHOLD rows with RUN_VISIBLE_COUNT shown, hiding one.
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
  // Every row in a run shares one round (collapseRuns never spans a boundary), so the first row's round applies to the whole item.
  if (item.kind === "rollRun") return (item.hidden[0] ?? item.visible[0])?.round;
  return undefined;
}

// A round separator marks each transition into a new round; resetting `lastRound` on any non-round row means a LATER combat's round 1 gets its own separator too, even though the number repeats.
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

export function buildFeedItems(events: CharacterEvent[]): FeedItem[] {
  const active = filterActive(events);
  const roundById = buildRoundMap(active);
  const displayable = active.filter((e) => e.type !== "combatRoundAdvanced");
  const rowsNewestFirst = buildRows(displayable, roundById);
  const oldestFirst = [...rowsNewestFirst].reverse();
  return insertSeparators(collapseRuns(oldestFirst));
}
