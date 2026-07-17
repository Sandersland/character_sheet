import { Check, Dices, Monitor, Moon, Sun, Zap, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import Avatar from "@/components/ui/Avatar";
import DropdownMenu from "@/components/ui/DropdownMenu";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import type { DiceRollStyle } from "@/hooks/useDiceRollStyle";
import type { ThemePreference } from "@/hooks/useThemePreference";
import type { AuthUser } from "@/types/auth";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const DICE_OPTIONS: { value: DiceRollStyle; label: string; icon: LucideIcon }[] = [
  { value: "animated", label: "Animated", icon: Dices },
  { value: "quick", label: "Quick", icon: Zap },
];

interface PreferenceOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

// A titled radio group of preference options (Appearance, Dice rolls). Each row
// is a menuitemradio so the dropdown's roving focus and aria state stay correct.
function PreferenceRadioGroup<T extends string>({
  label,
  options,
  value: current,
  onSelect,
}: {
  label: string;
  options: PreferenceOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="border-b border-parchment-200 py-1" role="group" aria-label={label}>
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
        {label}
      </p>
      {options.map(({ value, label: optionLabel, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onSelect(value)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none ${
              active ? "text-parchment-900" : "text-parchment-600"
            }`}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="flex-1">{optionLabel}</span>
            {active && <Check className="size-4" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

// Signed-in identity row at the top of the dropdown: avatar + name/email.
function AccountIdentityHeader({ user }: { user: AuthUser | null }) {
  const name = user?.name ?? null;
  const email = user?.email ?? null;
  const imageUrl = user?.imageUrl ?? null;
  return (
    <div className="flex items-center gap-2 border-b border-parchment-200 px-3 py-2">
      <Avatar name={name} email={email} imageUrl={imageUrl} />
      <span className="flex min-w-0 flex-col">
        {name && (
          <span className="truncate text-sm font-semibold text-parchment-900">{name}</span>
        )}
        {email && <span className="truncate text-xs text-parchment-600">{email}</span>}
      </span>
    </div>
  );
}

// Avatar-triggered account dropdown: identity, appearance + dice pickers, and logout.
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const { style: diceStyle, setStyle: setDiceStyle } = useDiceRollStyle();

  return (
    <DropdownMenu
      label="Account"
      trigger={
        <Avatar
          name={user?.name ?? null}
          email={user?.email ?? null}
          imageUrl={user?.imageUrl ?? null}
        />
      }
    >
      {(close) => (
        <>
          <AccountIdentityHeader user={user} />
          <PreferenceRadioGroup
            label="Appearance"
            options={THEME_OPTIONS}
            value={preference}
            onSelect={setPreference}
          />
          <PreferenceRadioGroup
            label="Dice rolls"
            options={DICE_OPTIONS}
            value={diceStyle}
            onSelect={setDiceStyle}
          />
          <Link
            to="/about"
            role="menuitem"
            onClick={close}
            className="block w-full px-3 py-1.5 text-left text-sm text-parchment-700 transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none"
          >
            About &amp; credits
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void logout();
              close();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-garnet-700 transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none"
          >
            Log out
          </button>
        </>
      )}
    </DropdownMenu>
  );
}
