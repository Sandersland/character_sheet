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

  it("cycles theme system -> light -> dark -> system without closing", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Account" }));

    const theme = () => screen.getByRole("menuitem", { name: /Theme:/ });
    expect(theme()).toHaveAccessibleName(/Theme: System/);

    await user.click(theme());
    expect(localStorage.getItem("cs:pref:theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(theme());
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(theme());
    expect(localStorage.getItem("cs:pref:theme")).toBe("system");
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
