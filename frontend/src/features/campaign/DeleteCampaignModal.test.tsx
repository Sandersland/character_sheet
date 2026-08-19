import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as client from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { campaignKeys, characterKeys, sessionKeys } from "@/api/queryKeys";
import DeleteCampaignModal from "@/features/campaign/DeleteCampaignModal";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

vi.mock("@/api/client", () => ({
  deleteCampaign: vi.fn(),
}));

function seedCaches() {
  const queryClient = getQueryClient();
  queryClient.setQueryData(campaignKeys.entities("camp-1"), []);
  queryClient.setQueryData(sessionKeys.campaignList("camp-1"), []);
  queryClient.setQueryData(characterKeys.list(), []);
}

function renderModal() {
  return render(
    <DeleteCampaignModal campaignId="camp-1" campaignName="The Sunless Citadel" onClose={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getQueryClient().clear();
});

describe("DeleteCampaignModal", () => {
  it("deletes, drops the campaign-scoped caches, and navigates to /campaigns", async () => {
    seedCaches();
    vi.mocked(client.deleteCampaign).mockResolvedValue(undefined);
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Delete campaign" }));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith("/campaigns", { replace: true }),
    );
    expect(client.deleteCampaign).toHaveBeenCalledWith("camp-1");
    const queryClient = getQueryClient();
    expect(queryClient.getQueryState(campaignKeys.entities("camp-1"))).toBeUndefined();
    expect(queryClient.getQueryState(sessionKeys.campaignList("camp-1"))).toBeUndefined();
    // Members' characters just had campaignId nulled server-side — refetch, don't trust.
    expect(queryClient.getQueryState(characterKeys.list())?.isInvalidated).toBe(true);
  });

  it("shows the server's error message verbatim and stays open on failure", async () => {
    seedCaches();
    vi.mocked(client.deleteCampaign).mockRejectedValue(
      new Error("End the campaign's active session before deleting it"),
    );
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Delete campaign" }));

    expect(
      await screen.findByText("End the campaign's active session before deleting it"),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(getQueryClient().getQueryState(campaignKeys.entities("camp-1"))).toBeDefined();
  });

  it("closes without deleting on Cancel", async () => {
    const onClose = vi.fn();
    render(
      <DeleteCampaignModal campaignId="camp-1" campaignName="The Sunless Citadel" onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(client.deleteCampaign).not.toHaveBeenCalled();
  });
});
