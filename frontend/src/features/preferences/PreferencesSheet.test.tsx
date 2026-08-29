import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import { PreferencesContext, type PreferenceSyncState } from "@/hooks/usePreferencesSync";

// jsdom's matchMedia stub reports matches:false for every query, so BottomSheet resolves to its mobile drag-to-dismiss close — synthesize the transitionend it waits for.
function fireTransitionEnd(el: HTMLElement) {
  const e = new Event("transitionend", { bubbles: true });
  Object.defineProperty(e, "propertyName", { value: "transform" });
  el.dispatchEvent(e);
}

// No PreferencesProvider wrapper — relies on the hooks' pure-localStorage fallback.
function renderSheet(props: Partial<Parameters<typeof PreferencesSheet>[0]> = {}) {
  return render(
    <ThemeProvider>
      <DiceRollStyleProvider>
        <PreferencesSheet onClose={vi.fn()} {...props} />
      </DiceRollStyleProvider>
    </ThemeProvider>,
  );
}

// A second helper (never modify renderSheet above) — renderSheet's no-provider tree makes setPreference a no-op, so a sync-error test built on it would pass vacuously.
function renderSheetWithSync(
  sync: PreferenceSyncState,
  props: Partial<Parameters<typeof PreferencesSheet>[0]> = {},
) {
  return render(
    <PreferencesContext.Provider value={{ synced: undefined, setPreference: vi.fn(), sync }}>
      <ThemeProvider>
        <DiceRollStyleProvider>
          <PreferencesSheet onClose={vi.fn()} {...props} />
        </DiceRollStyleProvider>
      </ThemeProvider>
    </PreferencesContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("PreferencesSheet (#1167)", () => {
  it("renders a dialog titled 'Preferences' with all three sections", () => {
    renderSheet();
    expect(screen.getByRole("dialog", { name: /preferences/i })).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Dice")).toBeInTheDocument();
    expect(screen.getByText("Play automation")).toBeInTheDocument();
  });

  it("has no campaign/character context requirement — every player-scoped control is reachable solo", () => {
    renderSheet();
    expect(screen.getByRole("radio", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /animated/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i })).toBeInTheDocument();
  });

  it("picks a theme and it takes effect immediately", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("radio", { name: /dark/i }));

    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: /dark/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /system/i })).not.toBeChecked();
  });

  it("picks a dice-roll style and it persists immediately", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("radio", { name: /quick/i }));

    expect(localStorage.getItem("cs:pref:diceRoll")).toBe("quick");
    expect(screen.getByRole("radio", { name: /quick/i })).toBeChecked();
  });

  it("toggles auto-roll concentration and it persists immediately, defaulting on", async () => {
    const user = userEvent.setup();
    renderSheet();

    const toggle = screen.getByRole("checkbox", { name: /auto-roll concentration saves/i });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    expect(localStorage.getItem("cs:pref:autoRollConcentration")).toBe("false");
    expect(toggle).not.toBeChecked();
  });

  it("toggles when the row's label TEXT is clicked, not just the box", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText(/auto-roll concentration saves/i));

    expect(screen.getByRole("checkbox", { name: /auto-roll concentration saves/i })).not.toBeChecked();
    expect(localStorage.getItem("cs:pref:autoRollConcentration")).toBe("false");
  });

  it("omits the Campaign settings link when no campaignId is supplied", () => {
    renderSheet();
    expect(screen.queryByRole("button", { name: /campaign settings/i })).not.toBeInTheDocument();
  });

  it("shows a Campaign settings link when campaignId is supplied, and it does not duplicate campaign toggles", () => {
    renderSheet({ campaignId: "camp-1", onOpenCampaignSettings: vi.fn() });
    expect(screen.getByRole("button", { name: /campaign settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /share sheet with dm/i })).not.toBeInTheDocument();
  });

  it("firing the Campaign settings link calls the handler and closes this sheet via the shared exit animation", async () => {
    const user = userEvent.setup();
    const onOpenCampaignSettings = vi.fn();
    const onClose = vi.fn();
    const { baseElement } = renderSheet({ campaignId: "camp-1", onOpenCampaignSettings, onClose });

    await user.click(screen.getByRole("button", { name: /campaign settings/i }));

    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
    // onClose defers to BottomSheet's slide-out transitionend, not an instant unmount.
    expect(onClose).not.toHaveBeenCalled();
    fireTransitionEnd(baseElement.querySelector('[role="dialog"]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { baseElement } = renderSheet({ onClose });

    const [closeButton] = screen.getAllByRole("button", { name: "Close" });
    await user.click(closeButton);
    expect(onClose).not.toHaveBeenCalled();
    fireTransitionEnd(baseElement.querySelector('[role="dialog"]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("sync note (#1365)", () => {
    const SYNC_ERROR = "Not saved — this change stays on this device.";

    it("surfaces a failed theme sync inside the Appearance section", () => {
      renderSheetWithSync({ saving: {}, errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } } });
      const appearance = within(screen.getByText("Appearance").closest("fieldset") as HTMLElement);
      expect(appearance.getByRole("alert")).toBeInTheDocument();
    });

    it("surfaces a failed dice sync inside the Dice section and nowhere else", () => {
      renderSheetWithSync({ saving: {}, errors: { diceRollStyle: { message: SYNC_ERROR, retry: vi.fn() } } });
      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      const dice = within(screen.getByText("Dice").closest("fieldset") as HTMLElement);
      expect(dice.getByRole("alert")).toBeInTheDocument();
    });

    it("renders no sync note when every preference is idle", () => {
      renderSheetWithSync({ saving: {}, errors: {} });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("keeps every control enabled while a write is in flight", () => {
      // Nothing here goes disabled while saving (unlike CampaignPreferencesFields' ToggleRow) — this write is optimistic, and disabling would blur a keyboard-focused control.
      renderSheetWithSync({ saving: { theme: true, diceRollStyle: true, autoRollConcentration: true }, errors: {} });
      screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeDisabled());
      expect(
        screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }),
      ).not.toBeDisabled();
    });

    it("has no axe violations while a sync error is showing", async () => {
      const { container } = renderSheetWithSync({
        saving: {},
        errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } },
      });
      expect(await axe(container)).toHaveNoViolations();
    });

    it("retrying a failed sync calls its retry closure", async () => {
      const user = userEvent.setup();
      const retry = vi.fn();
      renderSheetWithSync({ saving: {}, errors: { theme: { message: SYNC_ERROR, retry } } });

      await user.click(screen.getByRole("button", { name: "Retry" }));

      expect(retry).toHaveBeenCalledTimes(1);
    });
  });
});
