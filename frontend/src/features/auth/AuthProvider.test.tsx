import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/client", () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

import { fetchMe, logout as clientLogout, setUnauthorizedHandler } from "@/api/client";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";

const USER = { id: "u1", email: "ada@x.dev", name: "Ada", imageUrl: null };

function Probe() {
  const { status, user, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? "none"}</span>
      <button onClick={() => void logout()}>Log out</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockReset();
    vi.mocked(clientLogout).mockReset();
    vi.mocked(setUnauthorizedHandler).mockReset();
  });

  it("becomes authenticated after fetchMe resolves a user", async () => {
    vi.mocked(fetchMe).mockResolvedValue(USER);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("user")).toHaveTextContent("Ada");
  });

  it("becomes anonymous when fetchMe returns null", async () => {
    vi.mocked(fetchMe).mockResolvedValue(null);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("logout() calls the client and flips to anonymous", async () => {
    vi.mocked(fetchMe).mockResolvedValue(USER);
    vi.mocked(clientLogout).mockResolvedValue();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(clientLogout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
  });

  it("registers an unauthorized handler that flips to anonymous", async () => {
    vi.mocked(fetchMe).mockResolvedValue(USER);
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));

    const handler = vi.mocked(setUnauthorizedHandler).mock.calls
      .map((c) => c[0])
      .find((arg): arg is () => void => typeof arg === "function");
    expect(handler).toBeDefined();

    act(() => handler!());
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
  });
});
