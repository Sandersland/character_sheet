import AccountMenu from "@/features/auth/AccountMenu";

// Slim app chrome shown when signed in: an avatar-triggered account menu
// (identity, theme toggle, logout).
export default function AppHeader() {
  return (
    <header className="flex items-center justify-end gap-3 border-b border-parchment-200 bg-parchment-50 px-4 py-2">
      <AccountMenu />
    </header>
  );
}
