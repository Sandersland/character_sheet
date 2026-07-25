import type { Character } from "@/types/character";

// Not exported: apiFetch/rawFetch take a path and prefix it internally, so no
// sibling module needs to build a full URL itself.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

// Centralized handling for an expired/absent session. AuthProvider registers a
// handler (which flips auth state to "anonymous" so the router shows the login
// screen) so a 401 from ANY domain call is handled in one place — never per
// call site. The auth bootstrap (fetchMe) deliberately bypasses this via
// rawFetch: a 401 there is the expected "not signed in" answer, not a session
// that just died.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// The only call to the global fetch in frontend/src/api/ (enforced by
// barrel.test.ts) — every domain module reaches the network through apiFetch
// or rawFetch below, never fetch() directly.
export async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, { credentials: "include", ...init });
}

// Always send the session cookie (cross-origin in dev: 5173 → 4000), and route
// every domain response through the shared 401 handler.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await rawFetch(path, init);
  if (response.status === 401) unauthorizedHandler?.();
  return response;
}

// New endpoint? return request<T>(path, init, "Failed to …") for a JSON reply, or send(path, init, "Failed to …") for a void/204 one.

// Shared non-ok handling: surface the server's { error } message, else a labeled fallback.
async function throwIfNotOk(response: Response, errorLabel: string): Promise<void> {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(body?.error ?? `${errorLabel} (${response.status})`);
}

// apiFetch → ok-check → parsed JSON. The one flow every JSON-returning helper funnels through.
export async function request<T>(path: string, init: RequestInit | undefined, errorLabel: string): Promise<T> {
  const response = await apiFetch(path, init);
  await throwIfNotOk(response, errorLabel);
  return response.json() as Promise<T>;
}

// apiFetch → ok-check for endpoints with no body to parse (deletes, 204s, best-effort logs).
export async function send(path: string, init: RequestInit | undefined, errorLabel: string): Promise<void> {
  const response = await apiFetch(path, init);
  await throwIfNotOk(response, errorLabel);
}

// JSON headers for a POST/PATCH body — shared by every write helper below.
export const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// Shared POST-check-throw-json flow for the intent-bearing transaction endpoints:
// POST …/characters/:id/<domain>/transactions with { operations }, returning the
// full updated Character. Every uniform domain funnels through here — the only
// per-domain differences are the URL segment and the error label. (applyHitPoint-
// Operations and applyExperienceOperations deliberately don't use this: HP unwraps
// { character, concentrationChecks } and XP threads an optional sessionId.
// submitLevelUp doesn't either: its body is the structured LevelUpSubmission
// itself, not an { operations } batch. Class/subclass abilities go through
// applyAbilityTransactions instead (#1275): extra abilityKey URL segment,
// heterogeneous response type.)
export async function postTransactions<TOp>(
  characterId: string,
  domain: string,
  operations: TOp[],
  errorLabel: string,
): Promise<Character> {
  return request<Character>(
    `/characters/${characterId}/${domain}/transactions`,
    jsonBody({ operations }),
    errorLabel,
  );
}
