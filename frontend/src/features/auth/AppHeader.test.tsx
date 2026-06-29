import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test/axe";

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "ada@x.dev", name: "Ada", imageUrl: null },
    logout: vi.fn(),
  }),
}));

import AppHeader from "@/features/auth/AppHeader";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

function renderHeader() {
  return render(
    <ThemeProvider>
      <AppHeader />
    </ThemeProvider>,
  );
}

function themeButton() {
  return screen.getByRole("button", { name: /Theme:/ });
}

describe("AppHeader theme toggle", () => {
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

  it("cycles system -> light -> dark -> system, persisting each step", async () => {
    renderHeader();
    const user = userEvent.setup();

    // Default preference is system.
    expect(themeButton()).toHaveAccessibleName(/Theme: System/);

    await user.click(themeButton());
    expect(localStorage.getItem("cs:pref:theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(themeButton());
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(themeButton());
    expect(localStorage.getItem("cs:pref:theme")).toBe("system");
  });

  it("exposes an accessible name describing the next action", () => {
    renderHeader();
    expect(themeButton()).toHaveAccessibleName(/Switch to/);
  });

  it("has no axe violations", async () => {
    const { container } = renderHeader();
    expect(await axe(container)).toHaveNoViolations();
  });
});
