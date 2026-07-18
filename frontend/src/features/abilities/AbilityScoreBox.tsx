import { ABILITY_ICONS } from "@/components/ui/icons";
import { abilityModifier, formatModifier } from "@/lib/abilities";
import RollButton from "@/features/dice/RollButton";
import type { AbilityName } from "@/types/character";

interface AbilityScoreBoxProps {
  ability: AbilityName;
  label: string;
  score: number;
  saveProficient?: boolean;
  proficiencyBonus: number;
  /**
   * A calmer, flatter rendering for a reference rail (the desktop live-Combat
   * left rail, #986): border-defined fill, no card shadow, a smaller modifier,
   * and a softer save chip — so the rail recedes and the turn tracker stays the
   * hero. Defaults off (the full-weight Overview box).
   */
  muted?: boolean;
}

/**
 * The classic D&D sheet "ability box": modifier is the primary value
 * (largest, highest contrast), raw score is secondary metadata tucked
 * into a small pill below it — per principles.md's "avoid naked
 * label:value pairs," the modifier *is* the number players read at the
 * table, so it gets the visual weight, not the label.
 *
 * The modifier and "Save" link are clickable roll affordances that emit
 * to `RollResultSeal` via `RollContext`.
 */
export default function AbilityScoreBox({
  ability,
  label,
  score,
  saveProficient,
  proficiencyBonus,
  muted = false,
}: AbilityScoreBoxProps) {
  const modifier = abilityModifier(score);
  const saveBonus = modifier + (saveProficient ? proficiencyBonus : 0);

  const checkSpec = { count: 1, faces: 20, modifier } as const;
  const saveSpec = { count: 1, faces: 20, modifier: saveBonus } as const;
  const AbilityIcon = ABILITY_ICONS[ability];

  return (
    <div
      className={`flex flex-col items-center rounded-card border border-parchment-200 px-3 py-2.5 ${
        muted ? "bg-parchment-100" : "bg-parchment-50 shadow-card"
      }`}
    >
      <span className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        <AbilityIcon aria-hidden="true" className="text-xs text-parchment-400" />
        {label}
      </span>
      <RollButton
        spec={checkSpec}
        label={`${label} check`}
        log={{ kind: "check", source: `${label} check`, ability }}
        className="-mx-1 mt-1 px-1"
      >
        <span
          className={`font-display font-semibold leading-none text-garnet-800 ${
            muted ? "text-xl" : "text-2xl"
          }`}
        >
          {formatModifier(modifier)}
        </span>
      </RollButton>
      <span className="mt-1.5 rounded-full border border-parchment-300 bg-parchment-100 px-2 py-0.5 text-xs tabular-nums text-parchment-700">
        {score}
      </span>
      <div className="mt-1.5 flex items-center gap-1">
        {saveProficient && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${muted ? "bg-arcane-300" : "bg-arcane-500"}`}
            aria-hidden="true"
          />
        )}
        <RollButton
          spec={saveSpec}
          label={`${label} save`}
          log={{ kind: "save", source: `${label} save`, ability }}
          className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-parchment-600 hover:text-garnet-700"
        >
          Save
        </RollButton>
      </div>
    </div>
  );
}
