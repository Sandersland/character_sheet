import type { AuthProviderInfo, AuthUser } from "@/types/auth";
import { apiFetch, rawFetch, request, send } from "@/api/http";

export async function fetchAuthProviders(): Promise<AuthProviderInfo[]> {
  const data = await request<{ providers: AuthProviderInfo[] }>(
    "/auth/providers",
    undefined,
    "Failed to fetch auth providers",
  );
  return data.providers;
}

// Uses rawFetch (not apiFetch): an expected 401 here must not trip the
// global unauthorized handler — this IS the signed-in probe.
export async function fetchMe(): Promise<AuthUser | null> {
  const response = await rawFetch("/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch current user (${response.status})`);
  }
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function logout(): Promise<void> {
  await send("/auth/logout", { method: "POST" }, "Failed to log out");
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await apiFetch("/health");
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "ok";
  } catch {
    return false;
  }
}
