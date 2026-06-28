import type { ReactNode } from "react";

import LoginPage from "@/pages/LoginPage";
import { useAuth } from "@/features/auth/AuthProvider";

// Route gate: protected content renders only for an authenticated user. While
// the initial session probe is in flight we show a minimal placeholder; an
// anonymous user (including after a 401 anywhere) gets the login screen instead
// of a white screen.
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center bg-parchment-100 text-sm text-parchment-500"
      >
        Loading…
      </div>
    );
  }

  if (status === "anonymous") {
    return <LoginPage />;
  }

  return <>{children}</>;
}
