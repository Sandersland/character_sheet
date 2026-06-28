import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/api/client", () => ({
  fetchAuthProviders: vi.fn(),
}));

import { fetchAuthProviders } from "@/api/client";
import LoginPage from "@/pages/LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.mocked(fetchAuthProviders).mockReset();
  });

  it("renders one sign-in link per provider, pointing at its startUrl", async () => {
    vi.mocked(fetchAuthProviders).mockResolvedValue([
      { id: "google", displayName: "Google", startUrl: "http://api/auth/google/start" },
    ]);

    render(<LoginPage />);

    const link = await screen.findByRole("link", { name: /google/i });
    expect(link).toHaveAttribute("href", "http://api/auth/google/start");
  });

  it("is data-driven — renders a button for each provider returned", async () => {
    vi.mocked(fetchAuthProviders).mockResolvedValue([
      { id: "google", displayName: "Google", startUrl: "http://api/auth/google/start" },
      { id: "github", displayName: "GitHub", startUrl: "http://api/auth/github/start" },
    ]);

    render(<LoginPage />);

    expect(await screen.findByRole("link", { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute(
      "href",
      "http://api/auth/github/start",
    );
  });

  it("shows a helpful message when no providers are configured", async () => {
    vi.mocked(fetchAuthProviders).mockResolvedValue([]);

    render(<LoginPage />);

    expect(await screen.findByText(/no sign-in providers/i)).toBeInTheDocument();
  });
});
