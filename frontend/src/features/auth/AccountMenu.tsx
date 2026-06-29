import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import Avatar from "@/components/ui/Avatar";
import DropdownMenu from "@/components/ui/DropdownMenu";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import type { ThemePreference } from "@/hooks/useThemePreference";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

// Avatar-triggered account dropdown: identity, appearance picker, and logout.
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();

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
          <div className="flex items-center gap-2 border-b border-parchment-200 px-3 py-2">
            <Avatar
              name={user?.name ?? null}
              email={user?.email ?? null}
              imageUrl={user?.imageUrl ?? null}
            />
            <span className="flex min-w-0 flex-col">
              {user?.name && (
                <span className="truncate text-sm font-semibold text-parchment-900">
                  {user.name}
                </span>
              )}
              {user?.email && (
                <span className="truncate text-xs text-parchment-600">{user.email}</span>
              )}
            </span>
          </div>
          <div className="border-b border-parchment-200 py-1" role="group" aria-label="Appearance">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-500">
              Appearance
            </p>
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = preference === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => setPreference(value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none ${
                    active ? "text-parchment-900" : "text-parchment-600"
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {active && <Check className="size-4" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
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
