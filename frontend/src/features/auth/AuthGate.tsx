import type { ReactNode } from "react";

import LoginPage from "@/pages/LoginPage";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

// Route gate: protected content renders only for an authenticated user. While
// the initial session probe is in flight we render nothing until the load is
// slow enough to warrant a (delayed, centered) spinner — so a fast probe never
// flashes one. An anonymous user (including after a 401 anywhere) gets the login
// screen instead of a white screen.
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const showSpinner = useDelayedFlag(status === "loading");

  if (status === "loading") {
    return showSpinner ? <Spinner variant="page" /> : null;
  }

  if (status === "anonymous") {
    return <LoginPage />;
  }

  return <>{children}</>;
}
