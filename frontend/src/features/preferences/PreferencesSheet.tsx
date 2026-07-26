import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import BottomSheet from "@/components/ui/BottomSheet";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import { useAutoRollConcentrationPref } from "@/features/hitpoints/concentrationPreference";
import { THEME_OPTIONS, DICE_OPTIONS, type PreferenceOption } from "@/features/preferences/preferenceOptions";

interface PreferencesSheetProps {
  onClose: () => void;
  /** Present only when opened with a character in view (#1167) — gates the
   *  contextual Campaign settings link. Omitted from the account-global entry
   *  point (AccountMenu), which has no character to read a campaign off of. */
  campaignId?: string;
  onOpenCampaignSettings?: () => void;
}

// One labeled radio option, styled as a chip rather than a bare native radio so
// it reads consistently with ToggleRow's row weight. Native <input type=radio>
// (not a custom widget) for free keyboard/label semantics — no custom ARIA needed.
function RadioChip<T extends string>({
  name,
  option,
  checked,
  onSelect,
}: {
  name: string;
  option: PreferenceOption<T>;
  checked: boolean;
  onSelect: (value: T) => void;
}) {
  const Icon: LucideIcon = option.icon;
  return (
    <label
      className={`flex flex-1 cursor-pointer items-center gap-2 rounded-control border px-3 py-2 text-sm font-semibold transition-colors ${
        checked
          ? "border-garnet-600 bg-garnet-50 text-garnet-800"
          : "border-parchment-300 text-parchment-700 hover:bg-parchment-100"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={() => onSelect(option.value)}
        className="sr-only"
      />
      <Icon className="size-4" aria-hidden="true" />
      {option.label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

// Mirrors CampaignPreferencesFields' ToggleRow but standalone — this surface has
// only one boolean toggle today, not worth sharing a component for yet.
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-control border border-parchment-200 px-3 py-2.5">
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-parchment-800">{label}</span>
        <span className="text-xs text-parchment-600">{hint}</span>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        className="mt-1 size-4 accent-arcane-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/**
 * The dedicated player-preferences surface (#1167): Appearance, Dice, and Play
 * automation, all backed by the account-synced store (#1178) so every control
 * takes effect immediately and follows the player across devices. Reachable
 * with or without a campaign — `campaignId`/`onOpenCampaignSettings` are only
 * threaded through by callers that have a character in view (the sheet's
 * kebab menu); the account-global entry point (AccountMenu) omits them, and
 * the link simply doesn't render. Campaign-scoped toggles (shareWithDm,
 * autoFriendlyHealing) are deliberately NOT here — they stay in
 * CampaignSettingsSheet; this surface only links to them.
 */
export default function PreferencesSheet({
  onClose,
  campaignId,
  onOpenCampaignSettings,
}: PreferencesSheetProps) {
  const { preference: theme, setPreference: setTheme } = useTheme();
  const { style: diceStyle, setStyle: setDiceStyle } = useDiceRollStyle();
  const [autoRollConcentration, setAutoRollConcentration] = useAutoRollConcentrationPref();

  return (
    <BottomSheet title="Preferences" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Section title="Appearance">
          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((option) => (
              <RadioChip
                key={option.value}
                name="preferences-theme"
                option={option}
                checked={theme === option.value}
                onSelect={setTheme}
              />
            ))}
          </div>
        </Section>

        <Section title="Dice">
          <div className="flex flex-wrap gap-2">
            {DICE_OPTIONS.map((option) => (
              <RadioChip
                key={option.value}
                name="preferences-dice"
                option={option}
                checked={diceStyle === option.value}
                onSelect={setDiceStyle}
              />
            ))}
          </div>
        </Section>

        <Section title="Play automation">
          <ToggleRow
            label="Auto-roll concentration saves"
            hint="For spellcasters: roll the concentration save automatically when damage might break it. Turn off to roll it yourself (#1166)."
            checked={autoRollConcentration}
            onChange={setAutoRollConcentration}
          />
        </Section>

        {campaignId && onOpenCampaignSettings && (
          <button
            type="button"
            onClick={() => {
              onOpenCampaignSettings();
              onClose();
            }}
            className="self-start text-xs font-semibold text-garnet-700 hover:underline"
          >
            Campaign settings →
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
