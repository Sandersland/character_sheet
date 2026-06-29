import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderMenu() {
  return render(
    <ThemeProvider>
      <AccountMenu />
    </ThemeProvider>,
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

    // Defaults to system.
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

    // Roving focus starts on the first menu item; Arrow keys reach the options.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
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
});
