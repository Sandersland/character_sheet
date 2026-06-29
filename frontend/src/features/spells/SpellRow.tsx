/**
 * SpellRow — per-spell view in the spellbook list.
 * Shows: prepare toggle (hidden for cantrips), cast button, remove, expand
 * for description + stats. Fires callbacks for parent to handle API calls.
 */

import { useState } from "react";

import type { Spell } from "@/types/character";
import Badge from "@/components/ui/Badge";
import {
  SCHOOL_TONE,
  levelLabel,
  effectPreview,
  componentsLabel,
  attackTypeLabel,
  upcastHint,
} from "@/lib/spellMeta";

interface SpellRowProps {
  spell: Spell;
  characterLevel: number;
  /** True if the spellcasting section is busy (disables buttons). */
  busy: boolean;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  /** Available slot levels for the "cast with slot" picker (leveled spells only). */
  availableSlots: number[]; // levels that have remaining slots
  /** True when this spell is the character's active concentration spell. */
  isConcentrating?: boolean;
}

export default function SpellRow({
  spell,
  characterLevel,
  busy,
  onCast,
  onPrepare,
  onForget,
  availableSlots,
  isConcentrating = false,
}: SpellRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  const isCantrip = spell.level === 0;
  const schoolTone = SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral";

  // Castability: leveled spells with no remaining slots are shown but dimmed.
  const noBudget = !isCantrip && availableSlots.length === 0;

  function handleCastClick() {
    if (isCantrip) {
      onCast(spell); // no slot needed
    } else if (availableSlots.length === 0) {
      // No slots — cast at natural level still shows no-slots feedback via parent
      onCast(spell, spell.level);
    } else if (availableSlots.length === 1) {
      // Only one slot level available — cast without picker
      onCast(spell, availableSlots[0]);
    } else {
      setSlotPickerOpen((o) => !o);
    }
  }

  const effect = effectPreview(spell, characterLevel);
  const compStr = componentsLabel(spell);

  return (
    <li className={`py-3 ${noBudget ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {/* Left: name + badges */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <button
              type="button"
              className="text-left text-sm font-medium text-parchment-900 hover:underline"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
            >
              {spell.name}
            </button>
            <div className="flex items-center gap-1">
              <Badge tone="neutral">{levelLabel(spell.level)}</Badge>
              <Badge tone={schoolTone}>{spell.school}</Badge>
              {spell.concentration &&
                (isConcentrating ? (
                  <Badge tone="arcane" className="bg-arcane-700 text-white">
                    concentrating
                  </Badge>
                ) : (
                  <Badge tone="arcane">conc</Badge>
                ))}
              {spell.ritual && <Badge tone="gold">ritual</Badge>}
              {noBudget && <Badge tone="neutral">no slots</Badge>}
            </div>
          </div>
          {effect && (
            <p className="text-xs text-parchment-600">{effect}</p>
          )}
          {compStr && (
            <p className="text-[11px] text-parchment-600">{compStr}</p>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Prepare toggle (non-cantrips only) */}
          {!isCantrip && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPrepare(spell)}
              className={`rounded px-2 py-0.5 text-xs font-semibold transition-colors disabled:opacity-40 ${
                spell.prepared
                  ? "bg-arcane-100 text-arcane-800 hover:bg-arcane-200"
                  : "bg-parchment-100 text-parchment-600 hover:bg-parchment-200"
              }`}
              title={spell.prepared ? "Mark as unprepared" : "Mark as prepared"}
            >
              {spell.prepared ? "prepared" : "unprepared"}
            </button>
          )}

          {/* Cast button */}
          <button
            type="button"
            disabled={busy}
            onClick={handleCastClick}
            className="rounded bg-garnet-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-garnet-700 disabled:opacity-40"
            title={isCantrip ? `Cast ${spell.name}` : `Cast ${spell.name} (choose slot)`}
          >
            Cast
          </button>

          {/* Remove button */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onForget(spell)}
            className="text-parchment-600 hover:text-garnet-600 disabled:opacity-40"
            title={`Remove ${spell.name} from spellbook`}
            aria-label={`Remove ${spell.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Slot picker (for leveled spells with multiple available slot levels) */}
      {slotPickerOpen && !isCantrip && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <span className="py-0.5 text-xs text-parchment-600">Cast with slot:</span>
          {availableSlots.map((slotLevel) => {
            const isUpcast = slotLevel > spell.level;
            // Scaled effect at this slot level (e.g. "10d6 fire damage"); null for utility spells.
            const slotEffect = effectPreview(spell, characterLevel, slotLevel);
            return (
              <button
                key={slotLevel}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSlotPickerOpen(false);
                  onCast(spell, slotLevel);
                }}
                className="flex flex-col items-center rounded bg-arcane-100 px-2 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-200 disabled:opacity-40"
                title={isUpcast ? `Upcast ${spell.name} with a level ${slotLevel} slot` : `Cast ${spell.name} with a level ${slotLevel} slot`}
              >
                <span>
                  L{slotLevel}
                  {isUpcast && <span aria-hidden="true"> ↑</span>}
                </span>
                {isUpcast && slotEffect && (
                  <span className="font-normal text-[10px] text-arcane-800">{slotEffect}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSlotPickerOpen(false)}
            className="py-0.5 text-xs text-parchment-600 hover:text-parchment-700"
          >
            cancel
          </button>
        </div>
      )}

      {/* Expand: description + stats */}
      {expanded && (
        <div className="mt-2 space-y-1 rounded-control bg-parchment-50 p-3">
          <p className="text-xs text-parchment-600">
            {spell.castingTime} · {spell.range} · {spell.duration}
          </p>
          {attackTypeLabel(spell) && (
            <p className="text-xs text-parchment-600">{attackTypeLabel(spell)}</p>
          )}
          {spell.components?.material && spell.components.materialDescription && (
            <p className="text-xs text-parchment-600 italic">
              Material: {spell.components.materialDescription}
            </p>
          )}
          {upcastHint(spell) && (
            <p className="text-xs text-arcane-700">{upcastHint(spell)}</p>
          )}
          <p className="text-sm text-parchment-700">{spell.description}</p>
        </div>
      )}
    </li>
  );
}
