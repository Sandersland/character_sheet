import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import { PreferencesContext, type PreferenceSyncState } from "@/hooks/usePreferencesSync";

// jsdom's matchMedia stub reports matches:false for every query, so BottomSheet
// resolves to its mobile drag-to-dismiss close — synthesize the transitionend
// it waits for, mirroring BottomSheet's own convention.
function fireTransitionEnd(el: HTMLElement) {
  const e = new Event("transitionend", { bubbles: true });
  Object.defineProperty(e, "propertyName", { value: "transform" });
  el.dispatchEvent(e);
}

// #1167: the dedicated Preferences surface, reachable with or without a
// character/campaign in view. No PreferencesProvider wrapper — mirrors
// AccountMenu's own tests, which rely on the hooks' pure-localStorage fallback.
function renderSheet(props: Partial<Parameters<typeof PreferencesSheet>[0]> = {}) {
  return render(
    <ThemeProvider>
      <DiceRollStyleProvider>
        <PreferencesSheet onClose={vi.fn()} {...props} />
      </DiceRollStyleProvider>
    </ThemeProvider>,
  );
}

// #1365: a SECOND helper (never modify renderSheet above) that wraps in a
// real PreferencesContext.Provider — renderSheet's no-provider tree makes
// setPreference a no-op that can never fail, so a sync-error test built on it
// would pass for the wrong reason (vacuous — see M-CTRL-B in the PR).
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
    // No campaignId/onOpenCampaignSettings prop — the solo-reachability case.
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
    // The retired AutoRollConcentrationToggle wrapped its row in a <label>, so
    // clicking the text worked; a <span> row would silently drop that (#1166).
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
    // Campaign-scoped toggles (shareWithDm, autoFriendlyHealing) stay in
    // CampaignSettingsSheet — this surface only links there, never duplicates.
    expect(screen.queryByRole("checkbox", { name: /share sheet with dm/i })).not.toBeInTheDocument();
  });

  it("firing the Campaign settings link calls the handler and closes this sheet via the shared exit animation", async () => {
    const user = userEvent.setup();
    const onOpenCampaignSettings = vi.fn();
    const onClose = vi.fn();
    const { baseElement } = renderSheet({ campaignId: "camp-1", onOpenCampaignSettings, onClose });

    await user.click(screen.getByRole("button", { name: /campaign settings/i }));

    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
    // Routes through BottomSheet's requestClose (#782), not an instant unmount —
    // onClose defers to the slide-out transitionend, same as every other close path.
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
    // Mobile grabber: onClose fires only after the slide-out transition ends.
    expect(onClose).not.toHaveBeenCalled();
    fireTransitionEnd(baseElement.querySelector('[role="dialog"]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("sync note (#1365)", () => {
    it("surfaces a failed theme sync inside the Appearance section", () => {
      renderSheetWithSync({ saving: {}, errors: { theme: "Not saved — this change stays on this device." } });
      const appearance = within(screen.getByText("Appearance").closest("fieldset") as HTMLElement);
      expect(appearance.getByRole("alert")).toBeInTheDocument();
    });

    it("surfaces a failed dice sync inside the Dice section and nowhere else", () => {
      renderSheetWithSync({ saving: {}, errors: { diceRollStyle: "Not saved — this change stays on this device." } });
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
      // The executable form of the F2 decision: unlike CampaignPreferencesFields'
      // ToggleRow, nothing here goes `disabled` while saving — this write is
      // optimistic, so disabling would blur a keyboard-focused control and
      // regress the #1166 click-the-label-text behaviour for no benefit.
      renderSheetWithSync({ saving: { theme: true, diceRollStyle: true, autoRollConcentration: true }, errors: {} });
      screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeDisabled());
      expect(
        screen.getByRole("checkbox", { name: /auto-roll concentration saves/i }),
      ).not.toBeDisabled();
    });

    it("has no axe violations while a sync error is showing", async () => {
      const { container } = renderSheetWithSync({
        saving: {},
        errors: { theme: "Not saved — this change stays on this device." },
      });
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
