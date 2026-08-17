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
  sessionId: string;
  onClose: () => void;
  onLogChanged: () => void;
  slot: EconomySlot;
  slotAvailable: boolean;
  onCommitSlot: (batchId?: string) => void;

  spellEconomy: SpellEconomyState;
  allies: AllyOption[];
  castingTimeFilter?: string;
  focusSpellId?: string;
  onCastSettled?: (recorded: RecordedSpellCast) => void;
}

function spellResolutionTurnState(slotKind: EconomySlot, slotAvailable: boolean): ResolutionTurnState {
  return {
    actionsRemaining: slotKind === "action" && slotAvailable ? 1 : 0,
    bonusActionUsed: slotKind === "bonusAction" ? !slotAvailable : true,
    reactionUsed: slotKind === "reaction" ? !slotAvailable : true,
    ...INERT_RESOLUTION_CONSUMERS,
  };
}

const NO_APPLY = undefined;

function buildHealApply(
  target: Target,
  amount: number,
): { target: "self" | { characterId: string }; kind: "heal"; amount: number } | undefined {
  if (amount <= 0) return NO_APPLY;
  if (target === "other") return NO_APPLY;
  if (isAllyTarget(target)) return { target: { characterId: target.characterId }, kind: "heal", amount };
  return { target: "self", kind: "heal", amount };
}

function metaLine(spell: Spell): string {
  return `${levelLabel(spell.level)} · ${spell.castingTime} · ${spell.range}`;
}

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
  onCommitSlot: (batchId?: string) => void;
  onCastSettled?: (recorded: RecordedSpellCast) => void;
  onLogChanged: () => void;
  onBack: () => void;
  onClose: () => void;
}

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
    toCharacter: ({ batchId, ...character }) => {
      void batchId;
      return character;
    },
    fallbackMessage: "Failed to resolve cast",
    onCharacterWritten: onLogChanged,
  });

  function handleCommit(rolls: ResolutionRolls) {
    const apply = isHeal ? buildHealApply(target, rolls.effect?.total ?? 0) : undefined;
    const op = buildSpellResolveOp(resolution, rolls, spell, effectiveSlot, apply);
    resolveActionMutation
      .mutateAsync(op)
      .then((res) => {
        onCommitSlot(res.batchId);
        onCastSettled?.(castSettledEntry(spell, isHeal, effectiveSlot, rolls, spellcasting.spellSaveDC));
      })
      .catch(() => {});
  }

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
      <ResolutionRail view={view} completeLabel="Cast" />
      {resolveActionMutation.error && (
        <p className="text-xs font-semibold text-garnet-700">{resolveActionMutation.error}</p>
      )}
      <SpellResolverFooter completed={view.completed} onBack={onBack} onClose={onClose} />
    </div>
  );
}

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

const SLOT_SPENT_MESSAGE: Record<EconomySlot, string> = {
  action: "You've already taken your action this turn.",
  bonusAction: "You've already used your bonus action this turn.",
  reaction: "You've already used your reaction.",
};

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

  const hiddenNote = hiddenLevelsNote(
    hiddenSpellLevels(spellcasting.spells, { castingTimeFilter, slotLevels, arcanaLevels }),
  );
  return { slotLevels, arcanaLevels, sortedSpells, slotUsedHint, hiddenNote };
}

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

  if (!slotAvailable) {
    return <EmptySpellState message={SLOT_SPENT_MESSAGE[slot]} onClose={onClose} />;
  }

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
