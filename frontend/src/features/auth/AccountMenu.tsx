import Avatar from "@/components/ui/Avatar";
import DropdownMenu from "@/components/ui/DropdownMenu";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTheme } from "@/features/theme/ThemeProvider";
import type { ThemePreference } from "@/hooks/useThemePreference";

const THEME_CYCLE: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const THEME_META: Record<ThemePreference, { glyph: string; label: string }> = {
  light: { glyph: "☀", label: "Light" },
  dark: { glyph: "☾", label: "Dark" },
  system: { glyph: "◐", label: "System" },
};

// Avatar-triggered account dropdown: identity, theme cycle, and logout.
export default function AccountMenu() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();

  const current = THEME_META[preference];
  const next = THEME_CYCLE[preference];

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
          <button
            type="button"
            role="menuitem"
            onClick={() => setPreference(next)}
            aria-label={`Theme: ${current.label}. Switch to ${THEME_META[next].label}.`}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-parchment-800 transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none"
          >
            <span aria-hidden="true">{current.glyph}</span>
            {current.label}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void logout();
              close();
            }}
            className="block w-full border-t border-parchment-200 px-3 py-1.5 text-left text-sm text-garnet-700 transition-colors hover:bg-parchment-100 focus-visible:bg-parchment-100 focus-visible:outline-none"
          >
            Log out
          </button>
        </>
      )}
    </DropdownMenu>
  );
}
