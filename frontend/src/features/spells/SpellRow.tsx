// SpellRow — per-spell view in the grimoire: badges, prepare/forget actions, and
// a tap-to-expand into the shared spell detail card. View/manage only (#1162) —
// casting left this row entirely for the record view's "Cast a spell" door.
import { useState } from "react";

import { canPrepare, type PreparedBudget } from "@/lib/spellList";
import { deriveSpellRow, runeState } from "@/lib/spellRow";
import { effectPreview, componentsLabel } from "@/lib/spellMeta";
import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SpellRowActions from "@/features/spells/SpellRowActions";
import SpellRowBadges from "@/features/spells/SpellRowBadges";
import type { Spell } from "@/types/character";

interface SpellRowProps {
  spell: Spell;
  characterLevel: number;
  /** True if the spellcasting section is busy (disables buttons). */
  busy: boolean;
  onPrepare: (spell: Spell) => void;
  onForget: (spell: Spell) => void;
  /** Prepared-spell budget (#883) gating the rune toggle. */
  budget: PreparedBudget;
  /** Available slot levels — still drives the "no slots" dimming/badge. */
  availableSlots: number[];
  /** True when this spell is the character's active concentration spell. */
  isConcentrating?: boolean;
}

// The detail card's single CTA mirrors the row's own prepare rune (the grimoire's
// only mutating action besides Swap/Forget, which stay row-level).
function prepareCta(
  spell: Spell,
  budget: PreparedBudget,
  busy: boolean,
  onPrepare: (spell: Spell) => void,
  onDone: () => void,
) {
  const state = runeState(spell);
  if (state === "locked") {
    return { label: "Always prepared", disabled: true, onPress: () => {} };
  }
  const blocked = state === "unprepared" && !canPrepare(spell, budget);
  return {
    label: state === "prepared" ? `Unprepare ${spell.name}` : `Prepare ${spell.name}`,
    disabled: busy || blocked,
    onPress: () => {
      onPrepare(spell);
      onDone();
    },
  };
}

export default function SpellRow({
  spell,
  characterLevel,
  busy,
  onPrepare,
  onForget,
  budget,
  availableSlots,
  isConcentrating = false,
}: SpellRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);

  const derived = deriveSpellRow(spell, availableSlots);
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
              onClick={() => setDetailOpen(true)}
              aria-label={`Open ${spell.name}`}
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
          budget={budget}
          busy={busy}
          onPrepare={onPrepare}
          onForget={onForget}
        />
      </div>

      {detailOpen && (
        <SpellDetailCard
          spell={spell}
          onClose={() => setDetailOpen(false)}
          cta={prepareCta(spell, budget, busy, onPrepare, () => setDetailOpen(false))}
        />
      )}
    </li>
  );
}
