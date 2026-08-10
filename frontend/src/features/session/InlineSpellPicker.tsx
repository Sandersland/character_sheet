/**
 * InlineSpellPicker — the Cast-a-Spell picker for the TurnHub's spell
 * resolution (epic #1827 Slice 6, #1833). Rewritten off the shared resolver:
 * a spell row carries no inline Attack/Cast/self/other button soup — tapping
 * it opens ITS resolver (`spellToResolution` → `useResolution`/
 * `ResolutionRail`, the same rail InlineAttackPicker drives for weapons,
 * #1832). Leveled spells stay grouped by base level with slot pips on the
 * header (unchanged from before); upcasting is the focused resolver's own
 * `SlotLevelSelector`. `commit` fires ONE `resolveAction` op via
 * `api/combat.ts` — replacing the old two-endpoint split (spell attacks
 * through `applySpellcastingTransactions` at Attack-press time, everything
 * else at Cast time) with the single completion-time commit every resolution
 * shape now shares (closes #1824: there is no code path that resolves a cast
 * without spending the economy).
 *
 * Every `castSpell` side effect the old op performed — concentration
 * (set + displaced-prior drop), a buff spell's self-buff (Mage Armor), and a
 * self/ally heal apply (#462) — still happens: the op carries `entryId` (the
 * spellcasting entry) so the backend routes it through the SAME
 * `castAbilityInTx` sequence (`castSpellForResolutionInTx`,
 * lib/spellcasting/spellcasting.ts). A damage spell never sets `apply` — no
 * target/enemy model (self-or-announce, CLAUDE.md), so its effect is
 * announced only. The 5e bonus-action leveled-spell interlock is now resolved
 * SERVER-SIDE (#1439): the resolveAction cast records the per-turn cast kind on
 * the SessionParticipant row, and the picker reads the resolved flags via the
 * `spellEconomy` prop (synced from combat state) rather than a client-held
 * `spellCastThisTurn`. `onCommitSlot` fires on a successful cast to spend the
 * local economy slot; the caller re-reads the interlock from the server.
 *
 * Selection/slot predicates still live in `lib/spellPicker`; this is the
 * thin list/resolver shell.
 */

import { useState } from "react";

import { applyResolveActionOperations, type ResolveActionOperation } from "@/api/client";
import ResolutionRail from "@/features/session/ResolutionRail";
import SlotLevelSelector from "@/features/session/SlotLevelSelector";
import SpellTargetToggle from "@/features/session/SpellTargetToggle";
import { INERT_RESOLUTION_CONSUMERS, useResolution } from "@/features/session/useResolution";
import type { ResolutionRolls, ResolutionTurnState } from "@/features/session/useResolution";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { buildResolveActionOp } from "@/lib/resolveActionOp";
import { castAnnounceLine } from "@/lib/spellCast";
import { spellToResolution } from "@/lib/spellToResolution";
import {
  componentsLabel,
  defaultTarget,
  isAllyTarget,
  levelLabel,
  schoolLabel,
  targetLocked,
  type AllyOption,
  type Target,
} from "@/lib/spellMeta";
import { schoolInk } from "@/lib/spellFlavor";
import {
  availableArcanaLevels,
  availableSlotLevels,
  availableSlotsForSpell,
  castCostBadge,
  filterCastableSpells,
  groupSpellsByLevel,
  hiddenLevelsNote,
  hiddenSpellLevels,
  resolvedSlot,
  restrictionFlagsForSlot,
  slotPipsForLevel,
  slotRestrictionHint,
  sortSpells,
  type EconomySlot,
} from "@/lib/spellPicker";
import type { RecordedSpellCast } from "@/features/session/useTurnState";
import type { Character, Spell, SpellSlots, SpellEconomyState } from "@/types/character";

interface InlineSpellPickerProps {
  /** Active session id — kept for prop-shape parity with sibling pickers (not read directly; the resolveAction mutation is character-scoped). */
  sessionId: string;
  onClose: () => void;
  /** Called after a roll is logged so the Session Log can refresh. */
  onLogChanged: () => void;
  /** Which economy slot this picker is managing. */
  slot: EconomySlot;
  /** True when the slot is still available to spend. */
  slotAvailable: boolean;
  /**
   * Called when a cast succeeds, so TurnHub can commit the appropriate
   * action/bonus/reaction economy slot. The 5e interlock kind is no longer
   * passed here (#1439) — it's recorded server-side by the resolveAction cast
   * and re-read via the combat sync the caller triggers.
   */
  onCommitSlot: () => void;
  /** Server-resolved 5e bonus-action interlock (#1439), synced from session
   *  state — the picker reads these flags, never re-derives the rule. */
  spellEconomy: SpellEconomyState;
  /** Opted-in party members a healing cast can target on their sheet (#462). */
  allies: AllyOption[];
  /**
   * Optional filter on casting time. When provided, only spells whose
   * castingTime starts with this prefix are shown (e.g. "1 action",
   * "1 bonus action", "1 reaction"). Applied to ALL spells including cantrips.
   */
  castingTimeFilter?: string;
  /** Open focused on this spellbook entry (bonus-spell card pre-selection). */
  focusSpellId?: string;
  /** Called after a cast settles so the turn card's cast tally can record it (#1164). */
  onCastSettled?: (recorded: RecordedSpellCast) => void;
}

// The economy AVAILABILITY shim useResolution's `disabled` gates read — mirrors
// InlineAttackPicker's own attackResolutionTurnState (#1832). consume* is the
// shared INERT_RESOLUTION_CONSUMERS (useResolution.ts): the real economy
// commit happens in SpellResolver's handleCommit (via the caller's
// slot-kind-aware onCommitSlot, fired only once the mutation succeeds —
// #1848 review — which also feeds the 5e bonus-action interlock), so
// useResolution's own spendSlot() call at onComplete has nothing left to do.
function spellResolutionTurnState(slotKind: EconomySlot, slotAvailable: boolean): ResolutionTurnState {
  return {
    actionsRemaining: slotKind === "action" && slotAvailable ? 1 : 0,
    bonusActionUsed: slotKind === "bonusAction" ? !slotAvailable : true,
    reactionUsed: slotKind === "reaction" ? !slotAvailable : true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

// Self/ally heal apply (#462) — a damage spell never builds one (no target/
// enemy model, self-or-announce). `amount` is the rolled effect total; 0 (a
// heal that somehow rolled to 0) is skipped, matching castApplyPayload's own
// `apply.amount > 0` gate in ability-cast.ts. `target === "other"` is
// unreachable today — HealTargetRow always renders SpellTargetToggle with
// `healing: true`, whose own "other" branch never mounts (SpellTargetToggle.tsx)
// — but the explicit guard (rather than falling through to the `self`
// return) is defense-in-depth: a heal spell's "other" must relay to the DM
// with no HP change, the same as a damage spell's, never silently heal the
// caster instead (#1848 review, matching the removed castApplyPayload's own
// explicit `return undefined` for this case).
function buildHealApply(
  target: Target,
  amount: number,
): { target: "self" | { characterId: string }; kind: "heal"; amount: number } | undefined {
  if (amount <= 0) return undefined;
  if (target === "other") return undefined;
  if (isAllyTarget(target)) return { target: { characterId: target.characterId }, kind: "heal", amount };
  return { target: "self", kind: "heal", amount };
}

/** "Level 2 · 1 action · 60 feet" meta line for the resolver header. */
function metaLine(spell: Spell): string {
  return `${levelLabel(spell.level)} · ${spell.castingTime} · ${spell.range}`;
}

// The resolveAction op for a spell commit — split out of handleCommit so its
// own ternaries (leveled slotLevel, optional apply) don't count against that
// function's complexity budget (fallow flagged handleCommit's pre-extraction
// CRAP, #1833 review-fix pass).
function buildSpellResolveOp(
  resolution: Parameters<typeof buildResolveActionOp>[0],
  rolls: ResolutionRolls,
  spell: Spell,
  effectiveSlot: number,
  apply: ReturnType<typeof buildHealApply>,
): ResolveActionOperation {
  return buildResolveActionOp(resolution, rolls, {
    ...(spell.level > 0 ? { slotLevel: effectiveSlot } : {}),
    entryId: spell.id,
    ...(apply ? { apply } : {}),
  });
}

// The turn card's cast-tally entry (#1164) — split out alongside
// buildSpellResolveOp for the same complexity-budget reason.
function castSettledEntry(
  spell: Spell,
  isHeal: boolean,
  effectiveSlot: number,
  rolls: ResolutionRolls,
  spellSaveDC: number | undefined,
): RecordedSpellCast {
  return {
    spellName: spell.name,
    level: effectiveSlot,
    total: rolls.effect?.total,
    damageType: !isHeal ? spell.damageType ?? undefined : undefined,
    announce: castAnnounceLine(spell, spellSaveDC) ?? undefined,
  };
}

function SpellResolverHeader({ spell }: { spell: Spell }) {
  const comps = componentsLabel(spell);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-parchment-900">{spell.name}</span>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${schoolInk(spell.school)}`}>
          {schoolLabel(spell.school)}
        </span>
      </div>
      <p className="text-xs text-parchment-600">
        {metaLine(spell)}
        {comps ? ` · ${comps}` : ""}
      </p>
      {spell.description && <p className="text-xs text-parchment-700">{spell.description}</p>}
    </div>
  );
}

// Self/ally target toggle — visible only for a heal-shaped spell, gated here
// (not inline in SpellResolver's JSX) alongside the footer extraction below
// for the same complexity-budget reason InlineAttackPicker's own
// HitGatedSection/DamageRidersPanel are (#1832 review): every inline `&&` in
// a component body is a decision point on both cyclomatic and cognitive score.
function HealTargetRow({
  isHeal,
  spell,
  target,
  completed,
  allies,
  onSelect,
}: {
  isHeal: boolean;
  spell: Spell;
  target: Target;
  completed: boolean;
  allies: AllyOption[];
  onSelect: (target: Target) => void;
}) {
  if (!isHeal) return null;
  return (
    <SpellTargetToggle
      target={target}
      locked={targetLocked(spell)}
      disabled={completed}
      healing
      allies={allies}
      onSelect={onSelect}
    />
  );
}

// The resolver's own footer: "Cast another spell" (once completed) + Close —
// extracted alongside HealTargetRow for the same reason.
function SpellResolverFooter({
  completed,
  onBack,
  onClose,
}: {
  completed: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex gap-2 pt-1">
      {completed && (
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
        >
          Cast another spell
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
      >
        Close
      </button>
    </div>
  );
}

interface SpellResolverProps {
  spell: Spell;
  spellcasting: NonNullable<Character["spellcasting"]>;
  slot: EconomySlot;
  slotAvailable: boolean;
  slotLevels: number[];
  arcanaLevels: number[];
  allies: AllyOption[];
  onCommitSlot: () => void;
  onCastSettled?: (recorded: RecordedSpellCast) => void;
  onLogChanged: () => void;
  onBack: () => void;
  onClose: () => void;
}

// The focused per-spell resolver — remounted (key={spell.id}) every time the
// picker focuses a different spell, so its local state (chosen upcast slot,
// heal target, useResolution's own roll state) never bleeds from one spell
// into the next.
function SpellResolver({
  spell,
  spellcasting,
  slot,
  slotAvailable,
  slotLevels,
  arcanaLevels,
  allies,
  onCommitSlot,
  onCastSettled,
  onLogChanged,
  onBack,
  onClose,
}: SpellResolverProps) {
  const { character } = useCurrentCharacter();
  const isHeal = spell.effectKind === "heal";

  const availableSlots = availableSlotsForSpell(spell, slotLevels, arcanaLevels);
  const [chosenSlot, setChosenSlot] = useState<number | undefined>(availableSlots[0]);
  const effectiveSlot = resolvedSlot(spell, chosenSlot, slotLevels, arcanaLevels) ?? spell.level;

  const [target, setTarget] = useState<Target>(defaultTarget(spell));

  const resolution = spellToResolution(spell, effectiveSlot, {
    spellAttackBonus: spellcasting.spellAttackBonus,
    spellSaveDC: spellcasting.spellSaveDC,
  });

  const resolveActionMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (op: ResolveActionOperation) => applyResolveActionOperations(character.id, [op]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to resolve cast",
    onCharacterWritten: onLogChanged,
  });

  // The economy commit is deferred to the mutation's SUCCESS (#1848 review) —
  // a rejected resolveAction must not mark the turn-state slot spent (the
  // player would be locked out of retrying a cast the server never received,
  // with no way to un-spend short of a reload). This mirrors the pre-#1833
  // `useSpellPicker.handleCast`'s own `await castMutation.mutateAsync(...)`
  // gate, just via `.then()` instead of `async/await` since `commit` itself
  // must stay synchronous (useResolution's own contract, useResolution.ts).
  // A rejected mutation still surfaces via `resolveActionMutation.error`
  // (rendered below) — the `.catch` here only stops it from propagating as
  // an unhandled rejection; the slot simply stays available for a retry
  // (tap "Show all spells" and reselect the same spell to remount fresh).
  function handleCommit(rolls: ResolutionRolls) {
    const apply = isHeal ? buildHealApply(target, rolls.effect?.total ?? 0) : undefined;
    const op = buildSpellResolveOp(resolution, rolls, spell, effectiveSlot, apply);
    resolveActionMutation
      .mutateAsync(op)
      .then(() => {
        onCommitSlot();
        onCastSettled?.(castSettledEntry(spell, isHeal, effectiveSlot, rolls, spellcasting.spellSaveDC));
      })
      .catch(() => {});
  }

  // useResolution's own spendSlot() call (onComplete, AFTER commit runs) is a
  // no-op here — the real economy commit already happened above, inside
  // handleCommit, via the caller's onCommitSlot (the 5e-interlock-aware path
  // TurnResolutionSheets wires per slot kind). This shim only needs to supply
  // the live availability useResolution's `disabled` gates on.
  const turnState = spellResolutionTurnState(slot, slotAvailable);
  const { view } = useResolution({ resolution, turnState, commit: handleCommit });

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-xs font-semibold text-arcane-700 hover:text-arcane-800"
      >
        Show all spells
      </button>
      <SpellResolverHeader spell={spell} />
      <SlotLevelSelector
        baseLevel={spell.level}
        availableSlots={availableSlots}
        spellSlot={effectiveSlot}
        onSelect={setChosenSlot}
      />
      <HealTargetRow
        isHeal={isHeal}
        spell={spell}
        target={target}
        completed={view.completed}
        allies={allies}
        onSelect={setTarget}
      />
      <ResolutionRail view={view} />
      {resolveActionMutation.error && (
        <p className="text-xs font-semibold text-garnet-700">{resolveActionMutation.error}</p>
      )}
      <SpellResolverFooter completed={view.completed} onBack={onBack} onClose={onClose} />
    </div>
  );
}

/** One list row: name, school, cost badge — tap opens the resolver. No
 *  Attack/Cast/self/other controls here (design spec: "no button soup"). */
function SpellListRow({ spell, onSelect }: { spell: Spell; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-2.5 py-3 text-left [&:not(:last-child)]:border-b [&:not(:last-child)]:border-parchment-200"
    >
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium text-parchment-900">{spell.name}</span>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${schoolInk(spell.school)}`}>
            {schoolLabel(spell.school)}
          </span>
        </span>
      </div>
      <span className="shrink-0 text-[11px] text-parchment-500">{castCostBadge(spell)}</span>
    </button>
  );
}

function SpellLevelHeader({ level, slots }: { level: number; slots: SpellSlots[] }) {
  const pips = slotPipsForLevel(slots, level);
  const remaining = pips ? pips.total - pips.used : 0;
  return (
    <div className="flex items-center justify-between pt-2 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-800">
        {level === 0 ? "Cantrips · at will" : `Level ${level}`}
      </p>
      {pips && (
        <span className="flex items-center gap-1">
          {Array.from({ length: pips.total }).map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`inline-block h-2 w-2 rounded-full ${i < remaining ? "bg-gold-500" : "bg-parchment-300"}`}
            />
          ))}
          <span className="sr-only">{`${remaining} of ${pips.total} slots remaining`}</span>
        </span>
      )}
    </div>
  );
}

function emptyMessage(spellcasting: NonNullable<Character["spellcasting"]>, slotLevels: number[]): string {
  if (slotLevels.length === 0) return "No spell slots remaining.";
  return spellcasting.casterModel === "known"
    ? "No known spells available to cast right now."
    : `No ${(spellcasting.preparedLabel ?? "Prepared").toLowerCase()} spells available to cast right now.`;
}

interface SpellListDerivations {
  slotLevels: number[];
  arcanaLevels: number[];
  sortedSpells: Spell[];
  slotUsedHint: string | null;
  hiddenNote: string | null;
}

// The castable-list derivation — split out of the top-level component so its
// own branching (5e restriction flags, the two filter passes) doesn't count
// against InlineSpellPicker's own complexity budget (fallow flagged the
// pre-extraction shape, #1833 review-fix pass). The interlock flags come from
// the SERVER-resolved `economy` via restrictionFlagsForSlot (#1439), the same
// projection turnOptions' bonusSpellOptions calls — so the two never disagree.
function deriveSpellList(
  spellcasting: NonNullable<Character["spellcasting"]>,
  slot: EconomySlot,
  economy: SpellEconomyState,
  castingTimeFilter: string | undefined,
): SpellListDerivations {
  const slotLevels = availableSlotLevels(spellcasting.slots ?? []);
  const arcanaLevels = availableArcanaLevels(spellcasting.arcana ?? []);
  const { bonusActionBlockedByActionSpell, actionLimitedToCantrips } = restrictionFlagsForSlot(
    slot,
    economy,
  );
  const sortedSpells = sortSpells(
    filterCastableSpells(spellcasting.spells, {
      castingTimeFilter,
      slotLevels,
      arcanaLevels,
      bonusActionBlockedByActionSpell,
      actionLimitedToCantrips,
    }),
  );
  const slotUsedHint = slotRestrictionHint(slot, economy);
  // Deliberately NOT the real restriction flags computed above: this footer
  // explains only slot-based hiding (no affordable slot at that level);
  // economy-rule blocking (a leveled spell already cast this turn) is
  // surfaced separately by slotUsedHint. Passing the real flags here would
  // make the footer additionally suppress spells slotUsedHint already
  // explains, double-hiding them with no note either place (carried forward
  // from the pre-#1833 computeHiddenNote's own comment, #1848 review).
  const hiddenNote = hiddenLevelsNote(
    hiddenSpellLevels(spellcasting.spells, {
      castingTimeFilter,
      slotLevels,
      arcanaLevels,
      bonusActionBlockedByActionSpell: false,
      actionLimitedToCantrips: false,
    }),
  );
  return { slotLevels, arcanaLevels, sortedSpells, slotUsedHint, hiddenNote };
}

// The empty-castable-list branch — split out alongside deriveSpellList for
// the same complexity-budget reason.
function EmptySpellState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-parchment-600">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="self-start rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-100"
      >
        Done
      </button>
    </div>
  );
}

// The grouped-list branch — split out alongside EmptySpellState for the same
// complexity-budget reason.
function SpellGroupedList({
  sortedSpells,
  slots,
  slotUsedHint,
  hiddenNote,
  onSelect,
  onClose,
}: {
  sortedSpells: Spell[];
  slots: SpellSlots[];
  slotUsedHint: string | null;
  hiddenNote: string | null;
  onSelect: (spellId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-0">
      {slotUsedHint && (
        <p className="mb-2 rounded bg-parchment-100 px-3 py-2 text-[11px] font-semibold text-parchment-600">
          {slotUsedHint}
        </p>
      )}
      {groupSpellsByLevel(sortedSpells).map((group) => (
        <div key={group.level} className="flex flex-col">
          <SpellLevelHeader level={group.level} slots={slots} />
          {group.spells.map((spell) => (
            <SpellListRow key={spell.id} spell={spell} onSelect={() => onSelect(spell.id)} />
          ))}
        </div>
      ))}
      {hiddenNote && <p className="pt-2 text-center text-[11px] text-parchment-500">{hiddenNote}</p>}
      {!sortedSpells.length && slotUsedHint && (
        <p className="py-2 text-sm text-parchment-600">No spells available.</p>
      )}
      <div className="pt-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export default function InlineSpellPicker({
  onClose,
  onLogChanged,
  slot,
  slotAvailable,
  onCommitSlot,
  spellEconomy,
  castingTimeFilter,
  focusSpellId,
  allies,
  onCastSettled,
}: InlineSpellPickerProps) {
  const { character } = useCurrentCharacter();
  const spellcasting = character.spellcasting;
  const [focusId, setFocusId] = useState<string | null>(focusSpellId ?? null);

  if (!spellcasting) return null;

  const { slotLevels, arcanaLevels, sortedSpells, slotUsedHint, hiddenNote } = deriveSpellList(
    spellcasting,
    slot,
    spellEconomy,
    castingTimeFilter,
  );
  const focusSpell = sortedSpells.find((s) => s.id === focusId);

  if (sortedSpells.length === 0 && !slotUsedHint) {
    return <EmptySpellState message={emptyMessage(spellcasting, slotLevels)} onClose={onClose} />;
  }

  if (focusSpell) {
    return (
      <SpellResolver
        key={focusSpell.id}
        spell={focusSpell}
        spellcasting={spellcasting}
        slot={slot}
        slotAvailable={slotAvailable}
        slotLevels={slotLevels}
        arcanaLevels={arcanaLevels}
        allies={allies}
        onCommitSlot={onCommitSlot}
        onCastSettled={onCastSettled}
        onLogChanged={onLogChanged}
        onBack={() => setFocusId(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <SpellGroupedList
      sortedSpells={sortedSpells}
      slots={spellcasting.slots ?? []}
      slotUsedHint={slotUsedHint}
      hiddenNote={hiddenNote}
      onSelect={setFocusId}
      onClose={onClose}
    />
  );
}
