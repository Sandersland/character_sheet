import { Link } from "react-router-dom";

import AccountMenu from "@/features/auth/AccountMenu";

// Slim app chrome shown when signed in: top-level nav links plus an
// avatar-triggered account menu (identity, theme toggle, logout).
export default function AppHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-parchment-200 bg-parchment-50 px-4 py-2">
      <nav className="flex items-center gap-4 text-sm font-semibold text-parchment-700">
        <Link to="/" className="hover:text-garnet-700">
          Characters
        </Link>
        <Link to="/campaigns" className="hover:text-garnet-700">
          Campaigns
        </Link>
      </nav>
      <AccountMenu />
    </header>
  );
}
