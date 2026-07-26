/**
 * Reconcile-on-login + mirror-to-localStorage logic (#1178). Real AuthProvider
 * (mocked @/api/client) wraps PreferencesProvider, matching their actual
 * nesting order — a Probe reads usePreferencesSync() to observe synced state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/client", () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  patchPreferences: vi.fn(),
}));

import { fetchMe, patchPreferences } from "@/api/client";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { PreferencesProvider } from "@/features/preferences/PreferencesProvider";
import { usePreferencesSync } from "@/hooks/usePreferencesSync";
import type { AuthUser, UserPreferences } from "@/types/auth";

const BASE_USER = { id: "u1", email: "ada@x.dev", name: "Ada", imageUrl: null };
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  diceRollStyle: "animated",
  autoRollConcentration: true,
};
const OWNER_KEY = "cs:pref:owner";

function Probe() {
  const { synced, setPreference } = usePreferencesSync();
  return (
    <div>
      <span data-testid="synced">{synced ? JSON.stringify(synced) : "undefined"}</span>
      <button onClick={() => setPreference("theme", "dark")}>Set theme dark</button>
    </div>
  );
}

function renderTree() {
  return render(
    <AuthProvider>
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>
    </AuthProvider>,
  );
}

describe("PreferencesProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMe).mockReset();
    vi.mocked(patchPreferences).mockReset();
  });

  it("migrates this browser's local values up when the account has never stored preferences (no owner marker)", async () => {
    localStorage.setItem("cs:pref:theme", "dark");
    const user: AuthUser = { ...BASE_USER, preferences: null };
    vi.mocked(fetchMe).mockResolvedValue(user);
    const migrated: UserPreferences = { theme: "dark", diceRollStyle: "animated", autoRollConcentration: true };
    vi.mocked(patchPreferences).mockResolvedValue(migrated);

    renderTree();

    await waitFor(() => expect(patchPreferences).toHaveBeenCalledTimes(1));
    expect(patchPreferences).toHaveBeenCalledWith(migrated);
    await waitFor(() =>
      expect(screen.getByTestId("synced")).toHaveTextContent(JSON.stringify(migrated)),
    );
    expect(localStorage.getItem(OWNER_KEY)).toBe(BASE_USER.id);
  });

  it("still migrates when the owner marker names this same account", async () => {
    localStorage.setItem("cs:pref:theme", "dark");
    localStorage.setItem(OWNER_KEY, BASE_USER.id);
    const user: AuthUser = { ...BASE_USER, preferences: null };
    vi.mocked(fetchMe).mockResolvedValue(user);
    const migrated: UserPreferences = { theme: "dark", diceRollStyle: "animated", autoRollConcentration: true };
    vi.mocked(patchPreferences).mockResolvedValue(migrated);

    renderTree();

    await waitFor(() => expect(patchPreferences).toHaveBeenCalledTimes(1));
    expect(patchPreferences).toHaveBeenCalledWith(migrated);
  });

  it("does NOT migrate when the owner marker names a different account — adopts defaults and claims ownership instead", async () => {
    localStorage.setItem("cs:pref:theme", "dark");
    localStorage.setItem(OWNER_KEY, "some-other-user");
    const user: AuthUser = { ...BASE_USER, preferences: null };
    vi.mocked(fetchMe).mockResolvedValue(user);

    renderTree();

    await waitFor(() =>
      expect(screen.getByTestId("synced")).toHaveTextContent(JSON.stringify(DEFAULT_PREFERENCES)),
    );
    expect(patchPreferences).not.toHaveBeenCalled();
    expect(localStorage.getItem("cs:pref:theme")).toBe("system");
    expect(localStorage.getItem(OWNER_KEY)).toBe(BASE_USER.id);
  });

  it("adopts server preferences (no migration) and mirrors them into localStorage, even with untouched local defaults", async () => {
    const serverPrefs: UserPreferences = { theme: "dark", diceRollStyle: "quick", autoRollConcentration: false };
    const user: AuthUser = { ...BASE_USER, preferences: serverPrefs };
    vi.mocked(fetchMe).mockResolvedValue(user);

    renderTree();

    await waitFor(() =>
      expect(screen.getByTestId("synced")).toHaveTextContent(JSON.stringify(serverPrefs)),
    );
    expect(patchPreferences).not.toHaveBeenCalled();
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(localStorage.getItem("cs:pref:diceRoll")).toBe("quick");
    expect(localStorage.getItem("cs:pref:autoRollConcentration")).toBe("false");
  });

  // Fix for the realistic form of the clobber bug: a mutant that treats
  // "stored value happens to equal defaults" the same as "never stored" would
  // wrongly migrate local values up here instead of letting the server win.
  it("server-stored defaults win over differing local values (never-stored vs. stored-as-default)", async () => {
    localStorage.setItem("cs:pref:theme", "dark");
    const user: AuthUser = { ...BASE_USER, preferences: DEFAULT_PREFERENCES };
    vi.mocked(fetchMe).mockResolvedValue(user);

    renderTree();

    await waitFor(() =>
      expect(screen.getByTestId("synced")).toHaveTextContent(JSON.stringify(DEFAULT_PREFERENCES)),
    );
    expect(patchPreferences).not.toHaveBeenCalled();
    expect(localStorage.getItem("cs:pref:theme")).toBe("system");
  });

  it("setPreference mirrors into localStorage immediately and pushes a single-key patch", async () => {
    const serverPrefs: UserPreferences = { theme: "light", diceRollStyle: "animated", autoRollConcentration: true };
    const user: AuthUser = { ...BASE_USER, preferences: serverPrefs };
    vi.mocked(fetchMe).mockResolvedValue(user);
    vi.mocked(patchPreferences).mockResolvedValue({ ...serverPrefs, theme: "dark" });

    renderTree();
    await waitFor(() =>
      expect(screen.getByTestId("synced")).toHaveTextContent(JSON.stringify(serverPrefs)),
    );

    await userEvent.click(screen.getByRole("button", { name: "Set theme dark" }));

    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(patchPreferences).toHaveBeenCalledWith({ theme: "dark" });
  });
});
