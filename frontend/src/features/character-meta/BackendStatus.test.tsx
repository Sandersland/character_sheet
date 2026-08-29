import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import BackendStatus from "@/features/character-meta/BackendStatus";
import * as client from "@/api/client";

vi.mock("@/api/client", () => ({
  checkHealth: vi.fn(),
}));

const checkHealth = vi.mocked(client.checkHealth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BackendStatus", () => {
  it("renders nothing when the backend is healthy", async () => {
    checkHealth.mockResolvedValue(true);
    render(<BackendStatus />);
    await Promise.resolve();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a labelled indicator when the backend is unreachable", async () => {
    checkHealth.mockResolvedValue(false);
    render(<BackendStatus />);
    const indicator = await screen.findByRole("status");
    expect(indicator).toHaveAttribute("title", "Backend unreachable");
    expect(indicator).toHaveAttribute("aria-label", "Backend unreachable");
  });
});
