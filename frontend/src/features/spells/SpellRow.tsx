// SpellRow — per-spell view in the spellbook list: badges, actions, slot picker, expand.
// Derivations live in lib/spellRow; presentational blocks in the sibling subcomponents.
import { useState } from "react";

import { deriveSpellRow, resolveCastAction } from "@/lib/spellRow";
import { effectPreview, componentsLabel } from "@/lib/spellMeta";
import SpellRowActions from "@/features/spells/SpellRowActions";
import SpellRowBadges from "@/features/spells/SpellRowBadges";
import SpellRowDetails from "@/features/spells/SpellRowDetails";
import SpellSlotPicker from "@/features/spells/SpellSlotPicker";
import type { Spell } from "@/types/character";

interface SpellRowProps {
  spell: Spell;
  characterLevel: number;
  /** True if the spellcasting section is busy (disables buttons). */
  busy: boolean;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  /** Available slot levels for the "cast with slot" picker (leveled spells only). */
  availableSlots: number[];
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

  const derived = deriveSpellRow(spell, availableSlots);

  function handleCastClick() {
    const action = resolveCastAction(spell, availableSlots);
    if (action.kind === "openPicker") setSlotPickerOpen((o) => !o);
    else if (action.kind === "castAt") onCast(spell, action.slotLevel);
    else onCast(spell);
  }

  const effect = effectPreview(spell, characterLevel);
  const compStr = componentsLabel(spell);

  return (
    <li className={`py-3 ${derived.noBudget ? "opacity-50" : ""}`}>
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
            <SpellRowBadges spell={spell} derived={derived} isConcentrating={isConcentrating} />
          </div>
          {effect && <p className="text-xs text-parchment-600">{effect}</p>}
          {compStr && <p className="text-[11px] text-parchment-600">{compStr}</p>}
        </div>

        {/* Right: action buttons */}
        <SpellRowActions
          spell={spell}
          derived={derived}
          busy={busy}
          onPrepare={onPrepare}
          onForget={onForget}
          onCastClick={handleCastClick}
        />
      </div>

      {slotPickerOpen && !derived.isCantrip && (
        <SpellSlotPicker
          spell={spell}
          characterLevel={characterLevel}
          availableSlots={availableSlots}
          busy={busy}
          onPick={(slotLevel) => {
            setSlotPickerOpen(false);
            onCast(spell, slotLevel);
          }}
          onCancel={() => setSlotPickerOpen(false)}
        />
      )}

      {expanded && <SpellRowDetails spell={spell} />}
    </li>
  );
}
