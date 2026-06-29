import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider, useTheme } from "@/features/theme/ThemeProvider";

type Listener = () => void;

function mockMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<Listener>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return dark && query.includes("dark");
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => false,
  }));
  return {
    setDark(next: boolean) {
      dark = next;
      listeners.forEach((cb) => cb());
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={() => setPreference("dark")}>Go dark</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
  });

  it("writes data-theme=light for a stored light preference", () => {
    localStorage.setItem("cs:pref:theme", "light");
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });

  it("writes data-theme=dark for a stored dark preference", () => {
    localStorage.setItem("cs:pref:theme", "dark");
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("setPreference updates the document and persists", async () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Go dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("cs:pref:theme")).toBe("dark");
  });

  it("follows a live system change while preference is system", () => {
    const mm = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe("light");
    act(() => mm.setDark(true));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("removes the matchMedia listener on unmount", () => {
    const mm = mockMatchMedia(false);
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(mm.listenerCount).toBeGreaterThan(0);
    unmount();
    expect(mm.listenerCount).toBe(0);
  });
});
