import type { Character } from "@/types/character";

// Module-private: apiFetch/rawFetch prefix it internally so no sibling
// module builds its own URL or drifts from this one.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

// AuthProvider registers a handler here so a 401 from ANY domain call is
// handled in one place, never per call site. fetchMe deliberately bypasses
// this via rawFetch: a 401 there is the expected "not signed in" answer,
// not a dead session.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// The only call to global fetch in frontend/src/api/ (enforced by
// barrel.test.ts) — every domain module reaches the network through
// apiFetch or rawFetch, never fetch() directly.
export async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, { credentials: "include", ...init });
}

// Always sends the session cookie (cross-origin in dev: 5173 → 4000) and
// routes every response through the shared 401 handler.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await rawFetch(path, init);
  if (response.status === 401) unauthorizedHandler?.();
  return response;
}

// Surfaces the server's { error } message, or a labeled fallback.
async function throwIfNotOk(response: Response, errorLabel: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(body?.error ?? `${errorLabel} (${response.status})`);
}

export async function request<T>(path: string, init: RequestInit | undefined, errorLabel: string): Promise<T> {
  const response = await apiFetch(path, init);
  await throwIfNotOk(response, errorLabel);
  return response.json() as Promise<T>;
}

export async function send(path: string, init: RequestInit | undefined, errorLabel: string): Promise<void> {
  const response = await apiFetch(path, init);
  await throwIfNotOk(response, errorLabel);
}

export const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Shared POST { operations } → Character flow behind the intent-bearing
// transaction endpoints. applyHitPointOperations and
// applyExperienceOperations don't use this (different response/body shape),
// nor does submitLevelUp (body is LevelUpSubmission, not { operations }),
// nor class/subclass abilities, which go through applyAbilityTransactions
// instead (#1275: extra abilityKey URL segment, heterogeneous response).
export async function postTransactions<TOp, TResponse = Character>(
  characterId: string,
  domain: string,
  operations: TOp[],
  errorLabel: string,
): Promise<TResponse> {
  return request<TResponse>(
    `/characters/${characterId}/${domain}/transactions`,
    jsonBody({ operations }),
    errorLabel,
  );
}
