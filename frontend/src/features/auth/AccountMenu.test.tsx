import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { axe } from "@/test/axe";

const logout = vi.fn();
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "ada@x.dev", name: "Ada Lovelace", imageUrl: null },
    logout,
  }),
}));

import AccountMenu from "@/features/auth/AccountMenu";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { DiceRollStyleProvider } from "@/features/dice/DiceRollStyleProvider";
import { PreferencesContext, type PreferenceSyncState } from "@/hooks/usePreferencesSync";

function renderMenu() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <DiceRollStyleProvider>
          <AccountMenu />
        </DiceRollStyleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// A second helper (never modify renderMenu above) that wraps in a real
// PreferencesContext.Provider — renderMenu's no-provider tree makes
// setPreference a no-op, which would make a sync-error test pass vacuously (#1365).
function renderMenuWithSync(sync: PreferenceSyncState) {
  return render(
    <MemoryRouter>
      <PreferencesContext.Provider value={{ synced: undefined, setPreference: vi.fn(), sync }}>
        <ThemeProvider>
          <DiceRollStyleProvider>
            <AccountMenu />
          </DiceRollStyleProvider>
        </ThemeProvider>
      </PreferencesContext.Provider>
    </MemoryRouter>,
  );
}

describe("AccountMenu", () => {
  beforeEach(() => {
    logout.mockClear();
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

  it("shows the avatar trigger with initials", () => {
    renderMenu();
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("reveals the identity name and email when opened", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@x.dev")).toBeInTheDocument();
  });

  it("renders Light/Dark/System options with the current one checked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));

    const light = screen.getByRole("menuitemradio", { name: "Light" });
    const dark = screen.getByRole("menuitemradio", { name: "Dark" });
    const system = screen.getByRole("menuitemradio", { name: "System" });
    expect(light).toBeInTheDocument();
    expect(dark).toBeInTheDocument();
    expect(system).toBeInTheDocument();

    expect(system).toHaveAttribute("aria-checked", "true");
    expect(light).toHaveAttribute("aria-checked", "false");
    expect(dark).toHaveAttribute("aria-checked", "false");
  });

  it("picks a theme directly and marks it active without closing the menu", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));

    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitemradio", { name: "Light" }));
    expect(localStorage.getItem("cs:pref:theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitemradio", { name: "System" }));
    expect(localStorage.getItem("cs:pref:theme")).toBe("system");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("exposes the theme options to keyboard navigation", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));

    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("renders Animated/Quick dice options, defaults to Animated, and switches", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));

    const animated = screen.getByRole("menuitemradio", { name: "Animated" });
    const quick = screen.getByRole("menuitemradio", { name: "Quick" });
    expect(animated).toHaveAttribute("aria-checked", "true");
    expect(quick).toHaveAttribute("aria-checked", "false");

    await user.click(quick);
    expect(localStorage.getItem("cs:pref:diceRoll")).toBe("quick");
    expect(screen.getByRole("menuitemradio", { name: "Quick" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("logs out and closes the menu", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: /Log out/ }));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("has no axe violations when open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(await axe(container)).toHaveNoViolations();
  });

  // Nested here (not a sibling describe) to inherit the beforeEach/afterEach
  // above — a prior sibling-describe version silently relied on leftover state
  // from an earlier suite (#1166/#1167).
  describe("AccountMenu Preferences entry (#1167)", () => {
    it("opens the Preferences sheet from a 'Preferences…' item, with no campaign/character in view", async () => {
      const user = userEvent.setup();
      renderMenu();
      await user.click(screen.getByRole("button", { name: "Account" }));

      await user.click(screen.getByRole("menuitem", { name: /preferences/i }));

      const dialog = screen.getByRole("dialog", { name: /preferences/i });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Appearance")).toBeInTheDocument();
      expect(screen.getByText("Dice")).toBeInTheDocument();
      expect(screen.getByText("Play automation")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /campaign settings/i })).not.toBeInTheDocument();
    });

    it("changing a preference inside the sheet takes effect immediately", async () => {
      const user = userEvent.setup();
      renderMenu();
      await user.click(screen.getByRole("button", { name: "Account" }));
      await user.click(screen.getByRole("menuitem", { name: /preferences/i }));

      await user.click(screen.getByRole("radio", { name: /dark/i }));

      expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });

    it("closes the Preferences sheet", async () => {
      const user = userEvent.setup();
      const { baseElement } = renderMenu();
      await user.click(screen.getByRole("button", { name: "Account" }));
      await user.click(screen.getByRole("menuitem", { name: /preferences/i }));

      const [closeButton] = screen.getAllByRole("button", { name: /close/i });
      await user.click(closeButton);
      // onClose fires only after the slide-out transitionend event, dispatched
      // outside React's batching — act() flushes the setState it triggers.
      act(() => {
        const e = new Event("transitionend", { bubbles: true });
        Object.defineProperty(e, "propertyName", { value: "transform" });
        baseElement.querySelector('[role="dialog"]')?.dispatchEvent(e);
      });
      expect(screen.queryByRole("dialog", { name: /preferences/i })).not.toBeInTheDocument();
    });
  });

  describe("sync note (#1365)", () => {
    // Queried by text, not role="alert": a role="alert" here would fail
    // aria-required-children on DropdownMenu's role="menu" panel, so this
    // surface is visual-only — the Preferences sheet carries the live role.
    const SYNC_ERROR = "Not saved — this change stays on this device.";

    it("surfaces a failed theme sync inside the Appearance quick controls", async () => {
      const user = userEvent.setup();
      renderMenuWithSync({ saving: {}, errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } } });
      await user.click(screen.getByRole("button", { name: "Account" }));

      expect(screen.getByText(SYNC_ERROR)).toBeInTheDocument();
    });

    it("scopes the sync note to its own preference group", async () => {
      const user = userEvent.setup();
      renderMenuWithSync({ saving: {}, errors: { diceRollStyle: { message: SYNC_ERROR, retry: vi.fn() } } });
      await user.click(screen.getByRole("button", { name: "Account" }));

      // These groups ARE aria-labeled — getByRole("group", { name }) is safe here.
      const appearanceGroup = screen.getByRole("group", { name: "Appearance" });
      const diceGroup = screen.getByRole("group", { name: "Dice rolls" });
      expect(within(appearanceGroup).queryByText(SYNC_ERROR)).not.toBeInTheDocument();
      expect(within(diceGroup).getByText(SYNC_ERROR)).toBeInTheDocument();
    });

    it("keeps the menu's roving focus on menu items when a sync note is showing", async () => {
      const user = userEvent.setup();
      renderMenuWithSync({ saving: {}, errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } } });
      await user.click(screen.getByRole("button", { name: "Account" }));

      for (let i = 0; i < 8; i++) {
        await user.keyboard("{ArrowDown}");
        expect(document.activeElement?.getAttribute("role")).toMatch(/^menuitem/);
      }
    });

    it("has no axe violations while a sync error is showing in the menu", async () => {
      const user = userEvent.setup();
      const { container } = renderMenuWithSync({
        saving: {},
        errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } },
      });
      await user.click(screen.getByRole("button", { name: "Account" }));
      expect(await axe(container)).toHaveNoViolations();
    });

    it("omits a Retry control from the quick controls (announce=false suppresses it too)", async () => {
      const user = userEvent.setup();
      renderMenuWithSync({ saving: {}, errors: { theme: { message: SYNC_ERROR, retry: vi.fn() } } });
      await user.click(screen.getByRole("button", { name: "Account" }));

      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    });
  });
});
