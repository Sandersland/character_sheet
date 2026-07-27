import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import PreferenceSyncNote from "@/features/preferences/PreferenceSyncNote";
import { PreferencesContext, PREFERENCE_SYNC_ERROR, type PreferenceSyncState } from "@/hooks/usePreferencesSync";

// Stands in for PreferencesProvider with a hand-built sync state — unit tests
// of the note alone, not the provider's own write path (that's
// PreferencesProvider.test.tsx).
function renderNote(preferenceKey: "theme" | "diceRollStyle", sync: PreferenceSyncState) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      PreferencesContext.Provider,
      { value: { synced: undefined, setPreference: vi.fn(), sync } },
      children,
    );
  }
  return render(<PreferenceSyncNote preferenceKey={preferenceKey} />, { wrapper: Wrapper });
}

describe("PreferenceSyncNote", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while the key is idle", () => {
    const { container } = renderNote("theme", { saving: {}, errors: {} });
    expect(container).toBeEmptyDOMElement();
  });

  it("announces a failed sync for its key with role=alert", () => {
    renderNote("theme", { saving: {}, errors: { theme: PREFERENCE_SYNC_ERROR } });
    expect(screen.getByRole("alert")).toHaveTextContent(PREFERENCE_SYNC_ERROR);
  });

  it("ignores another key's error", () => {
    const { container } = renderNote("theme", {
      saving: {},
      errors: { diceRollStyle: PREFERENCE_SYNC_ERROR },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent for a fast in-flight write", () => {
    const { container } = renderNote("theme", { saving: { theme: true }, errors: {} });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Saving… once the write outlasts the delay", () => {
    renderNote("theme", { saving: { theme: true }, errors: {} });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");
  });

  it("an error outranks an in-flight Saving… note", () => {
    renderNote("theme", { saving: { theme: true }, errors: { theme: PREFERENCE_SYNC_ERROR } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
