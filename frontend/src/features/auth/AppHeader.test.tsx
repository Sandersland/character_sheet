import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  return renderAt();
}

function renderAt(path?: string) {
  return render(
    <MemoryRouter initialEntries={path ? [path] : undefined}>
      <ThemeProvider>
        <AppHeader />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("AppHeader", () => {
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

  it("renders the account menu trigger", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
  });

  it("shows no theme button, logout button, or identity at rest", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: /Theme:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Log out/ })).toBeNull();
    expect(screen.queryByText("ada@x.dev")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = renderHeader();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders nothing on the creation ceremony route (#1176)", () => {
    renderAt("/characters/new");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
  });

  it("still renders on the character list and on a sheet (#1176)", () => {
    const { unmount } = renderAt("/");
    expect(screen.getByRole("link", { name: "Characters" })).toBeInTheDocument();
    unmount();

    renderAt("/characters/abc");
    expect(screen.getByRole("link", { name: "Characters" })).toBeInTheDocument();
  });
});
