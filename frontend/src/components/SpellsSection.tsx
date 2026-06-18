import { formatModifier } from "../lib/abilities";
import type { Character } from "../types/character";
import Badge from "./Badge";
import MeterBar from "./MeterBar";

interface SpellsSectionProps {
  spellcasting: NonNullable<Character["spellcasting"]>;
}

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

export default function SpellsSection({ spellcasting }: SpellsSectionProps) {
  const { spellSaveDC, spellAttackBonus, slots, spells } = spellcasting;

  const byLevel = [...spells].sort((a, b) => a.level - b.level);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-control)] bg-[var(--color-arcane-50)] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-arcane-700)]">
            Spell Save DC
          </p>
          <p className="font-display text-xl font-semibold text-[var(--color-arcane-900)]">
            {spellSaveDC}
          </p>
        </div>
        <div className="h-8 w-px bg-[var(--color-arcane-200)]" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-arcane-700)]">
            Spell Attack
          </p>
          <p className="font-display text-xl font-semibold text-[var(--color-arcane-900)]">
            {formatModifier(spellAttackBonus)}
          </p>
        </div>
      </div>

      {slots.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {slots.map((slot) => (
            <div key={slot.level}>
              <div className="mb-1 flex items-baseline justify-between text-xs text-[var(--color-parchment-600)]">
                <span className="font-medium">Level {slot.level}</span>
                <span className="tabular-nums">
                  {slot.total - slot.used}/{slot.total}
                </span>
              </div>
              <MeterBar
                current={slot.total - slot.used}
                max={slot.total}
                tone="arcane"
                label={`Level ${slot.level} slots remaining`}
              />
            </div>
          ))}
        </div>
      )}

      <ul className="flex flex-col divide-y divide-[var(--color-parchment-200)]">
        {byLevel.map((spell) => (
          <li key={spell.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p
                className={`text-sm font-medium ${
                  spell.prepared
                    ? "text-[var(--color-parchment-900)]"
                    : "text-[var(--color-parchment-500)]"
                }`}
              >
                {spell.name}
              </p>
              <div className="flex items-center gap-1.5">
                <Badge tone="neutral">{levelLabel(spell.level)}</Badge>
                <Badge tone={SCHOOL_TONE[spell.school]}>{spell.school}</Badge>
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--color-parchment-500)]">
              {spell.castingTime} · {spell.range} · {spell.duration}
            </p>
            <p className="mt-1.5 text-sm text-[var(--color-parchment-700)]">
              {spell.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
