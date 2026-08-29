import type { ReactNode } from "react";

import LoginPage from "@/pages/LoginPage";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

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
