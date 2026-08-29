import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import PreferenceSyncNote from "@/features/preferences/PreferenceSyncNote";
import { PreferencesContext, PREFERENCE_SYNC_ERROR, type PreferenceSyncState } from "@/hooks/usePreferencesSync";

function renderNote(
  preferenceKey: "theme" | "diceRollStyle",
  sync: PreferenceSyncState,
  props: { announce?: boolean } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      PreferencesContext.Provider,
      { value: { synced: undefined, setPreference: vi.fn(), sync } },
      children,
    );
  }
  return render(<PreferenceSyncNote preferenceKey={preferenceKey} {...props} />, { wrapper: Wrapper });
}

function errorState(retry = vi.fn()): PreferenceSyncState {
  return { saving: {}, errors: { theme: { message: PREFERENCE_SYNC_ERROR, retry } } };
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
    renderNote("theme", errorState());
    expect(screen.getByRole("alert")).toHaveTextContent(PREFERENCE_SYNC_ERROR);
  });

  it("ignores another key's error", () => {
    const { container } = renderNote("theme", {
      saving: {},
      errors: { diceRollStyle: { message: PREFERENCE_SYNC_ERROR, retry: vi.fn() } },
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
    renderNote("theme", { saving: { theme: true }, errors: { theme: { message: PREFERENCE_SYNC_ERROR, retry: vi.fn() } } });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  describe("retry (#1365 chunk 4)", () => {
    // Native click via act(), not userEvent — this file runs under fake timers, and userEvent's own delays would need timer bridging not worth it for a single synchronous click.
    it("renders a Retry button that calls the error's retry closure", () => {
      const retry = vi.fn();
      renderNote("theme", errorState(retry));

      act(() => {
        screen.getByRole("button", { name: "Retry" }).click();
      });

      expect(retry).toHaveBeenCalledTimes(1);
    });

    it("omits the Retry button when announce is false (menu context)", () => {
      renderNote("theme", errorState(), { announce: false });
      expect(screen.getByText(PREFERENCE_SYNC_ERROR)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });
  });
});
