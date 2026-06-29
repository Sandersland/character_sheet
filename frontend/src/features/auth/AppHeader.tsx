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

// Slim app chrome shown when signed in: the current identity + a logout
// affordance. Logout flips auth state to anonymous (AuthGate then shows login).
export default function AppHeader() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const label = user?.name ?? user?.email ?? "Account";

  const current = THEME_META[preference];
  const next = THEME_CYCLE[preference];

  return (
    <header className="flex items-center justify-end gap-3 border-b border-parchment-200 bg-parchment-50 px-4 py-2">
      <span className="flex items-center gap-2 text-sm text-parchment-700">
        {user?.imageUrl && (
          <img src={user.imageUrl} alt="" className="h-6 w-6 rounded-full" />
        )}
        {label}
      </span>
      <button
        type="button"
        onClick={() => setPreference(next)}
        aria-label={`Theme: ${current.label}. Switch to ${THEME_META[next].label}.`}
        className="flex items-center gap-1.5 rounded-control border border-parchment-300 px-3 py-1 text-sm font-semibold text-parchment-700 transition-colors hover:border-garnet-400 hover:text-garnet-700 focus-visible:border-garnet-400 focus-visible:text-garnet-700"
      >
        <span aria-hidden="true">{current.glyph}</span>
        {current.label}
      </button>
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-control border border-parchment-300 px-3 py-1 text-sm font-semibold text-parchment-700 transition-colors hover:border-garnet-400 hover:text-garnet-700 focus-visible:border-garnet-400 focus-visible:text-garnet-700"
      >
        Log out
      </button>
    </header>
  );
}
