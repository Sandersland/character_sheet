import { Link, useMatch } from "react-router-dom";

import AccountMenu from "@/features/auth/AccountMenu";

// Slim app chrome shown when signed in: top-level nav links plus an
// avatar-triggered account menu (identity, theme toggle, logout).
export default function AppHeader() {
  // The creation and level-up ceremonies are full-screen immersive routes
  // (#1176, #1171) with their own chrome — hide the global bar entirely, on
  // every viewport. useMatch("/characters/:id") below is exact and does NOT
  // match the nested /level-up path, so it needs its own match.
  const creating = useMatch("/characters/new");
  const levelingUp = useMatch("/characters/:id/level-up");
  // The mobile character sheet is an immersive 100dvh app-shell with its own
  // header (back link) + bottom nav, so hide this global bar there on phones.
  const sheet = useMatch("/characters/:id");
  const immersiveMobile = Boolean(sheet);

  if (creating || levelingUp) return null;

  return (
    <header
      className={`flex items-center justify-between gap-3 border-b border-parchment-200 bg-parchment-50 px-4 py-2 ${
        immersiveMobile ? "hidden md:flex" : ""
      }`}
    >
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
