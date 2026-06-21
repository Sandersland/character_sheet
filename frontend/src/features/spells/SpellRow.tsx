/**
 * SpellRow — per-spell view in the spellbook list.
 * Shows: prepare toggle (hidden for cantrips), cast button, remove, expand
 * for description + stats. Fires callbacks for parent to handle API calls.
 */

import { useState } from "react";

import { abilityLabel } from "@/lib/abilities";
import type { Spell } from "@/types/character";
import Badge from "@/components/ui/Badge";

const SCHOOL_TONE = {
  abjuration: "arcane",
  conjuration: "arcane",
  divination: "gold",
  enchantment: "garnet",
  evocation: "garnet",
  illusion: "arcane",
  necromancy: "neutral",
  transmutation: "gold",
} as const;

function levelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

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
}

export default function SpellRow({
  spell,
  characterLevel,
  busy,
  onCast,
  onPrepare,
  onForget,
  availableSlots,
}: SpellRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  const isCantrip = spell.level === 0;
  const schoolTone = SCHOOL_TONE[spell.school as keyof typeof SCHOOL_TONE] ?? "neutral";

  // For cantrips with scaling, show the correct dice count at current character level.
  function effectLabel(): string | null {
    if (!spell.effectKind || !spell.effectDiceCount || !spell.effectDiceFaces) return null;
    let count = spell.effectDiceCount;
    if (spell.cantripScaling && isCantrip) {
      if (characterLevel >= 17) count *= 4;
      else if (characterLevel >= 11) count *= 3;
      else if (characterLevel >= 5) count *= 2;
    }
    const mod = spell.effectModifier ? (spell.effectModifier > 0 ? ` + ${spell.effectModifier}` : ` − ${Math.abs(spell.effectModifier)}`) : "";
    const kind = spell.effectKind === "heal" ? "healing" : (spell.damageType ?? "damage");
    return `${count}d${spell.effectDiceFaces}${mod} ${kind}`;
  }

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

  const effect = effectLabel();

  return (
    <li className="py-3">
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
              {spell.concentration && <Badge tone="arcane">conc</Badge>}
              {spell.ritual && <Badge tone="gold">ritual</Badge>}
            </div>
          </div>
          {effect && (
            <p className="text-xs text-parchment-500">{effect}</p>
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
                  : "bg-parchment-100 text-parchment-500 hover:bg-parchment-200"
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
            className="text-parchment-400 hover:text-garnet-600 disabled:opacity-40"
            title={`Remove ${spell.name} from spellbook`}
            aria-label={`Remove ${spell.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Slot picker (for leveled spells with multiple available slot levels) */}
      {slotPickerOpen && !isCantrip && (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-xs text-parchment-500">Cast with slot:</span>
          {availableSlots.map((slotLevel) => (
            <button
              key={slotLevel}
              type="button"
              disabled={busy}
              onClick={() => {
                setSlotPickerOpen(false);
                onCast(spell, slotLevel);
              }}
              className="rounded bg-arcane-100 px-2 py-0.5 text-xs font-semibold text-arcane-800 hover:bg-arcane-200 disabled:opacity-40"
            >
              L{slotLevel}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSlotPickerOpen(false)}
            className="text-xs text-parchment-400 hover:text-parchment-700"
          >
            cancel
          </button>
        </div>
      )}

      {/* Expand: description + stats */}
      {expanded && (
        <div className="mt-2 space-y-1 rounded-control bg-parchment-50 p-3">
          <p className="text-xs text-parchment-500">
            {spell.castingTime} · {spell.range} · {spell.duration}
          </p>
          {spell.attackType && (
            <p className="text-xs text-parchment-500">
              {spell.attackType === "attack" ? "Ranged/melee spell attack" : `${spell.saveAbility ? abilityLabel(spell.saveAbility) : "—"} saving throw`}
            </p>
          )}
          {spell.upcastDicePerLevel && (
            <p className="text-xs text-arcane-700">
              Upcast: +{spell.upcastDicePerLevel}d{spell.effectDiceFaces ?? "?"} per slot level above {spell.level}
            </p>
          )}
          <p className="text-sm text-parchment-700">{spell.description}</p>
        </div>
      )}
    </li>
  );
}
