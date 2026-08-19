import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReviewDuplicatesModal from "@/features/inbox/ReviewDuplicatesModal";
import type { CampaignEntity, InboxDuplicateClusterRow } from "@/types/character";

const fetchEntities = vi.fn();
const fetchEntityMerges = vi.fn();
const combineEntities = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntities: (...args: unknown[]) => fetchEntities(...args),
  fetchEntityMerges: (...args: unknown[]) => fetchEntityMerges(...args),
  combineEntities: (...args: unknown[]) => combineEntities(...args),
}));

const ROW: InboxDuplicateClusterRow = {
  kind: "DUPLICATE_CLUSTER",
  campaignId: "camp-1",
  campaignName: "Curse of Strahd",
  signature: "sig-dupe",
  entities: [
    { id: "e1", name: "Lil", type: "NPC", visibility: "HIDDEN", mentionCount: 1 },
    { id: "e2", name: "lili", type: "NPC", visibility: "REVEALED", mentionCount: 0 },
    { id: "e3", name: "Lili", type: "NPC", visibility: "REVEALED", mentionCount: 3 },
  ],
  defaultSurvivorId: "e3",
  signalAt: "2026-08-18T12:00:00.000Z",
};

function fullEntity(over: Partial<CampaignEntity> & { id: string }): CampaignEntity {
  return {
    campaignId: "camp-1",
    type: "NPC",
    name: "?",
    aliases: [],
    notes: null,
    visibility: "REVEALED",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const FULL_ENTITIES: CampaignEntity[] = [
  fullEntity({
    id: "e1",
    name: "Lil",
    visibility: "HIDDEN",
    stats: { mentionCount: 1, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: true },
  }),
  fullEntity({
    id: "e2",
    name: "lili",
    stats: { mentionCount: 0, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: false },
  }),
  fullEntity({
    id: "e3",
    name: "Lili",
    stats: { mentionCount: 3, firstMentioned: null, lastMentioned: null, chroniclers: [], hasDescription: false },
  }),
];

describe("ReviewDuplicatesModal", () => {
  beforeEach(() => {
    fetchEntities.mockReset();
    fetchEntityMerges.mockReset();
    combineEntities.mockReset();
    fetchEntities.mockResolvedValue(FULL_ENTITIES);
    fetchEntityMerges.mockResolvedValue([]);
  });

  it("defaults the survivor radio from the feed's defaultSurvivorId and shows the live summary + discarded box", async () => {
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);

    expect(screen.getByRole("radio", { name: /Lili/ })).toBeChecked();
    await waitFor(() => expect(screen.getByText("1 mention moves to Lili · 2 rows deleted")).toBeInTheDocument());
    expect(screen.getByText("Discarded")).toBeInTheDocument();
    expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument();
    expect(screen.getByText(/Descriptions — Lil/)).toBeInTheDocument();
  });

  it("re-picking the survivor updates the summary line and Kept/Combined labels", async () => {
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/rows deleted/)).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: /^Lil\b/ }));

    await waitFor(() => expect(screen.getByText("3 mentions move to Lil · 2 rows deleted")).toBeInTheDocument());
  });

  it("commits sequential combineEntities calls, one per absorbed entity, and closes on full success", async () => {
    combineEntities.mockResolvedValue({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={onClose} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/rows deleted/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(combineEntities.mock.calls).toEqual([
      ["camp-1", "e1", "e3"],
      ["camp-1", "e2", "e3"],
    ]);
  });

  it("on partial failure, shows which combine failed, keeps the modal open, and only retries the remainder", async () => {
    combineEntities.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("Both entities are linked to an item"));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={onClose} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/rows deleted/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    await waitFor(() => expect(screen.getByText(/failed to combine/i)).toBeInTheDocument());
    expect(screen.getByText(/lili failed to combine: Both entities are linked to an item/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // e1 already landed — the survivor choice is now committed, so every radio locks.
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();

    combineEntities.mockClear();
    combineEntities.mockResolvedValue({});
    await user.click(screen.getByRole("button", { name: "Combine and delete 1 entry" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // Only the entity that never landed (e2) is retried — e1 already combined.
    expect(combineEntities).toHaveBeenCalledTimes(1);
    expect(combineEntities).toHaveBeenCalledWith("camp-1", "e2", "e3");
  });

  it("Disregard these calls onDisregard with this row", async () => {
    const onDisregard = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={onDisregard} disregarding={false} />);

    await user.click(screen.getByRole("button", { name: "Disregard these" }));
    expect(onDisregard).toHaveBeenCalledWith(ROW);
  });
});
