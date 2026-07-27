import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import Avatar from "@/components/ui/Avatar";
import DropdownMenu from "@/components/ui/DropdownMenu";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useDiceRollStyle } from "@/features/dice/DiceRollStyleProvider";
import PreferenceSyncNote from "@/features/preferences/PreferenceSyncNote";
import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import {
  THEME_OPTIONS,
  DICE_OPTIONS,
  type PreferenceOption,
} from "@/features/preferences/preferenceOptions";
import type { PreferenceKey } from "@/hooks/usePreferencesSync";
import type { AuthUser } from "@/types/auth";

// A titled radio group of preference options (Appearance, Dice rolls). Each row
// is a menuitemradio so the dropdown's roving focus and aria state stay correct.
// preferenceKey scopes the shared PreferenceSyncNote (#1365) to this group —
// it's nested inside the existing role="group" div (not a direct child of the
// role="menu" panel) so axe's aria-required-children stays satisfied.
function PreferenceRadioGroup<T extends string>({
  label,
  preferenceKey,
  options,
  value: current,
  onSelect,
}: {
  label: string;
  preferenceKey: PreferenceKey;
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
      {/* announce=false: this panel is DropdownMenu's role="menu" (#1365) — see
          PreferenceSyncNote's own comment for why a live role can't nest here. */}
      <PreferenceSyncNote preferenceKey={preferenceKey} className="px-3 pb-1" announce={false} />
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
  // AppHeader mounts as a sibling of the routed pages, never a descendant of
  // CurrentCharacterProvider — so AccountMenu has no campaignId to hand
  // PreferencesSheet even while a character IS on screen (e.g. /characters/:id
  // at md+). The account-global entry point (#1167) stays reachable with no
  // character/campaign in view at all; CharacterSheetHeader's own desktop kebab
  // is the surface that threads campaignId.
  const [prefsOpen, setPrefsOpen] = useState(false);

  return (
    <>
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
            {/* Quick shortcuts — the full surface (Appearance/Dice/Play
                automation) lives in PreferencesSheet below (#1167). */}
            <PreferenceRadioGroup
              label="Appearance"
              preferenceKey="theme"
              options={THEME_OPTIONS}
              value={preference}
              onSelect={setPreference}
            />
            <PreferenceRadioGroup
              label="Dice rolls"
              preferenceKey="diceRollStyle"
              options={DICE_OPTIONS}
              value={diceStyle}
              onSelect={setDiceStyle}
            />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPrefsOpen(true);
                close();
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-parchment-700 transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none"
            >
              Preferences…
            </button>
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
      {prefsOpen && <PreferencesSheet onClose={() => setPrefsOpen(false)} />}
    </>
  );
}
