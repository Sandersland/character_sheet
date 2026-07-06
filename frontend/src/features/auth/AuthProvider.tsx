/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { fetchMe, logout as clientLogout, setUnauthorizedHandler } from "@/api/client";
import type { AuthUser } from "@/types/auth";

// "loading" until the initial fetchMe resolves; then "authenticated" (user set)
// or "anonymous". Route gating keys off this (see App.tsx).
type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const goAnonymous = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Bootstrap auth state from the session cookie once on mount.
  useEffect(() => {
    let active = true;
    fetchMe()
      .then((me) => {
        if (!active) return;
        if (me) {
          setUser(me);
          setStatus("authenticated");
        } else {
          goAnonymous();
        }
      })
      .catch(() => {
        if (active) goAnonymous();
      });
    return () => {
      active = false;
    };
  }, [goAnonymous]);

  // A 401 from any domain call (expired/cleared session) drops us to anonymous,
  // so the router shows the login screen. Registered once; cleared on unmount.
  useEffect(() => {
    setUnauthorizedHandler(goAnonymous);
    return () => setUnauthorizedHandler(null);
  }, [goAnonymous]);

  const logout = useCallback(async () => {
    try {
      await clientLogout();
    } finally {
      goAnonymous();
    }
  }, [goAnonymous]);

  return (
    <AuthContext.Provider value={{ status, user, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
