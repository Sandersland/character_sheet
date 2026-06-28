import { useAuth } from "@/features/auth/AuthProvider";

// Slim app chrome shown when signed in: the current identity + a logout
// affordance. Logout flips auth state to anonymous (AuthGate then shows login).
export default function AppHeader() {
  const { user, logout } = useAuth();
  const label = user?.name ?? user?.email ?? "Account";

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
        onClick={() => void logout()}
        className="rounded-control border border-parchment-300 px-3 py-1 text-sm font-semibold text-parchment-700 transition-colors hover:border-garnet-400 hover:text-garnet-700 focus-visible:border-garnet-400 focus-visible:text-garnet-700"
      >
        Log out
      </button>
    </header>
  );
}
