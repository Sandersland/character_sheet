import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/client", () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  fetchAuthProviders: vi.fn(),
}));

import { fetchMe, logout as clientLogout, fetchAuthProviders } from "@/api/client";
import { AuthProvider } from "@/features/auth/AuthProvider";
import AuthGate from "@/features/auth/AuthGate";
import AppHeader from "@/features/auth/AppHeader";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

const USER = { id: "u1", email: "ada@x.dev", name: "Ada", imageUrl: null };

function renderGate() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <AppHeader />
          <div>secret content</div>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("AuthGate + AppHeader", () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockReset();
    vi.mocked(clientLogout).mockReset();
    vi.mocked(fetchAuthProviders).mockReset().mockResolvedValue([]);
  });

  it("hides children while loading, then reveals them once authenticated", async () => {
    vi.mocked(fetchMe).mockResolvedValue(USER);
    renderGate();

    // Loading: gate hasn't resolved yet, so protected content isn't shown.
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();

    expect(await screen.findByText("secret content")).toBeInTheDocument();
    // Chrome surfaces the signed-in identity.
    expect(screen.getByText(/ada/i)).toBeInTheDocument();
  });

  it("shows the login screen and hides children when anonymous", async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    renderGate();

    // The login card heading renders; protected content does not.
    expect(await screen.findByText(/^sign in$/i)).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("logout from the header calls the client and drops to the login screen", async () => {
    vi.mocked(fetchMe).mockResolvedValue(USER);
    vi.mocked(clientLogout).mockResolvedValue();
    renderGate();
    await screen.findByText("secret content");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(clientLogout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText("secret content")).not.toBeInTheDocument());
  });
});
