import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PreferencesSheet from "@/features/preferences/PreferencesSheet";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";

// jsdom's matchMedia stub reports matches:false for every query, so BottomSheet
// resolves to its mobile drag-to-dismiss close — synthesize the transitionend
// it waits for, mirroring BottomSheet.test.tsx's own convention.
function fireTransitionEnd(el: HTMLElement) {
  const e = new Event("transitionend", { bubbles: true });
  Object.defineProperty(e, "propertyName", { value: "transform" });
  el.dispatchEvent(e);
}

// #1167: the dedicated Preferences surface, reachable with or without a
// character/campaign in view. No PreferencesProvider wrapper — mirrors
// AccountMenu.test.tsx, which relies on the hooks' pure-localStorage fallback.
function renderSheet(props: Partial<Parameters<typeof PreferencesSheet>[0]> = {}) {
  return render(
    <ThemeProvider>
      <DiceRollStyleProvider>
        <PreferencesSheet onClose={vi.fn()} {...props} />
      </DiceRollStyleProvider>
    </ThemeProvider>,
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

  it("firing the Campaign settings link calls the handler and closes this sheet", async () => {
    const user = userEvent.setup();
    const onOpenCampaignSettings = vi.fn();
    const onClose = vi.fn();
    renderSheet({ campaignId: "camp-1", onOpenCampaignSettings, onClose });

    await user.click(screen.getByRole("button", { name: /campaign settings/i }));

    expect(onOpenCampaignSettings).toHaveBeenCalledTimes(1);
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
});
