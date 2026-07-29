import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import CampaignsPage from "@/features/campaign/CampaignsPage";
import * as client from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { catalogKeys } from "@/api/queryKeys";
import { SERVED_EDITIONS, seedEditions } from "@/test/editions";
import type { Campaign } from "@/types/character";

vi.mock("@/api/client", () => ({
  fetchCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  // Never actually called in the seeded cases (seedEditions makes the
  // staleTime: Infinity entry permanently fresh) — stubbed so the cold-cache and
  // fetch-failed cases can drive it explicitly.
  fetchEditions: vi.fn(),
}));

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-1",
    name: "The Sunless Citadel",
    ownerId: "u1",
    rulesEdition: "EDITION_2024",
    rulesEditionLabel: "2024 rules",
    inviteCode: "abc123",
    createdAt: new Date().toISOString(),
    role: "OWNER",
    members: [
      {
        id: "m1",
        userId: "u1",
        role: "OWNER",
        user: { id: "u1", name: "Ada", email: "ada@x.dev", imageUrl: null },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seedEditions();
});

describe("CampaignsPage (#246)", () => {
  it("loads campaigns from the list endpoint and links each to its detail page", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([makeCampaign()]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    expect(vi.mocked(client.fetchCampaigns)).toHaveBeenCalled();
    const link = await screen.findByRole("link", { name: /the sunless citadel/i });
    expect(link).toHaveAttribute("href", "/campaigns/camp-1");
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("create flow calls the client and reloads the list", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaigns)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeCampaign({ name: "New Campaign" })]);
    vi.mocked(client.createCampaign).mockResolvedValue(makeCampaign({ name: "New Campaign" }));

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    await user.type(screen.getByLabelText(/campaign name/i), "New Campaign");
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    // Edition defaults to 2024 (schema default) without the DM touching the picker.
    expect(vi.mocked(client.createCampaign)).toHaveBeenCalledWith("New Campaign", "EDITION_2024");
    await waitFor(() => expect(vi.mocked(client.fetchCampaigns)).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("link", { name: /new campaign/i })).toBeInTheDocument();
  });

  it("cannot send 2014 from the campaign form while its content is gated (#1371)", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchCampaigns).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    vi.mocked(client.createCampaign).mockResolvedValue(makeCampaign());

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    await user.type(screen.getByLabelText(/campaign name/i), "Classic Table");
    await user.click(screen.getByRole("radio", { name: "2014 rules" }));
    await user.click(screen.getByRole("button", { name: /create campaign/i }));

    expect(vi.mocked(client.createCampaign)).toHaveBeenCalledWith("Classic Table", "EDITION_2024");
  });

  // #1286: there is no PATCH /campaigns/:id — the edition is immutable from the
  // moment of creation, not just "until the first character joins" (that copy
  // implied an editing window that doesn't exist).
  it("states the edition is fixed at creation, not editable-until-first-join", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    expect(screen.getByText(/can't be changed after the campaign is created/i)).toBeInTheDocument();
    expect(screen.queryByText(/once the first character joins/i)).not.toBeInTheDocument();
  });

  it("does not render a join-by-code form", async () => {
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    expect(screen.queryByRole("button", { name: /join campaign/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/invite code/i)).not.toBeInTheDocument();
  });
});

// #1436: a campaign's edition can never be changed, so this form must never
// write one the DM didn't see. That makes the /api/editions load states part of
// the contract, not incidental loading polish.
describe("CampaignsPage rules edition (#1436)", () => {
  // The fixture deliberately makes display order and the default DISAGREE: rows
  // are 2014-FIRST while the served default is 2024. No positional implementation
  // can satisfy both assertions at once, which is what makes this test durable
  // against a reintroduced `editions[0]`.
  it("checks the SERVED default, not the first row, when the two disagree", async () => {
    const [row2024, row2014] = SERVED_EDITIONS;
    seedEditions({ editions: [row2014, row2024], defaultEdition: "EDITION_2024" });
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["2014 rules", "2024 rules"]);
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "2024 rules" })).toHaveAttribute("aria-checked", "true");
  });

  // The seam that shipped a one-click data-loss path last wave: a control offering
  // only its fallback value before its rows resolved.
  it("cold cache: renders the field's label and notice but NO picker, and disables submit", async () => {
    getQueryClient().removeQueries({ queryKey: catalogKeys.editions() });
    vi.mocked(client.fetchEditions).mockReturnValue(new Promise(() => {}));
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    await screen.findByText(/no campaigns yet/i);
    expect(screen.getByText("Rules edition")).toBeInTheDocument();
    expect(screen.getByText(/can't be changed after the campaign is created/i)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText(/EDITION_/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/campaign name/i), "Too Early");
    expect(screen.getByRole("button", { name: /create campaign/i })).toBeDisabled();
  });

  it("fetch failed: says it won't guess and still refuses to submit", async () => {
    getQueryClient().removeQueries({ queryKey: catalogKeys.editions() });
    vi.mocked(client.fetchEditions).mockRejectedValue(new Error("network down"));
    vi.mocked(client.fetchCampaigns).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/won't guess/i)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/campaign name/i), "No Editions");
    expect(screen.getByRole("button", { name: /create campaign/i })).toBeDisabled();
    expect(vi.mocked(client.createCampaign)).not.toHaveBeenCalled();
  });
});
