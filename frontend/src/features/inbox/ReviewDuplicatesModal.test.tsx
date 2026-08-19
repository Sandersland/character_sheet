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
    // combineDiscardedItems' "notes" category reads notes directly
    // (hasDescription(notes) === notes trimmed non-empty on the backend, the
    // same invariant) — real text here, not just a stats flag.
    notes: "A hedge witch.",
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

  it("shows the live summary IMMEDIATELY off the inbox row's own entities, before the full-entity fetch resolves", () => {
    fetchEntities.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);

    expect(screen.getByRole("radio", { name: /Lili/ })).toBeChecked();
    expect(
      screen.getByText("1 mention moves to Lili, plus any in players' private notes · 2 rows deleted"),
    ).toBeInTheDocument();
  });

  it("fills in the Discarded box's fuller categories once the full entity/merge fetch lands", async () => {
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);

    // "Hidden visibility"/"Descriptions" need stats.hasDescription off the
    // full-entity fetch — a ready-state-only fact, unlike the summary line
    // above, which is already showing from row.entities alone.
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());
    expect(screen.getByText("Discarded")).toBeInTheDocument();
    expect(screen.getByText(/Descriptions — Lil/)).toBeInTheDocument();
  });

  it("re-picking the survivor updates the summary line and Kept/Combined labels", async () => {
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: /^Lil\b/ }));

    await waitFor(() =>
      expect(
        screen.getByText("3 mentions move to Lil, plus any in players' private notes · 2 rows deleted"),
      ).toBeInTheDocument(),
    );
  });

  it("commits ONE atomic combineEntities call with every loser, and closes on success", async () => {
    combineEntities.mockResolvedValue({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={onClose} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(combineEntities).toHaveBeenCalledTimes(1);
    expect(combineEntities).toHaveBeenCalledWith("camp-1", "e3", ["e1", "e2"]);
  });

  it("on rejection, shows the error, keeps the modal open with radios still live, and lets a plain retry resend the same combine", async () => {
    combineEntities
      .mockRejectedValueOnce(new Error("Both entities are linked to an item"))
      .mockResolvedValueOnce({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={onClose} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    // Atomic combine: nothing landed, so there's no "which one failed" — just
    // the backend's own message, verbatim.
    expect(await screen.findByText("Both entities are linked to an item")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // No locking — a rejected atomic combine touched nothing, so the DM can
    // still freely re-pick the survivor before retrying.
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(combineEntities).toHaveBeenCalledTimes(2);
    expect(combineEntities).toHaveBeenLastCalledWith("camp-1", "e3", ["e1", "e2"]);
  });

  it("Disregard these calls onDisregard with this row", async () => {
    const onDisregard = vi.fn();
    const user = userEvent.setup();
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={onDisregard} disregarding={false} />);

    await user.click(screen.getByRole("button", { name: "Disregard these" }));
    expect(onDisregard).toHaveBeenCalledWith(ROW);
  });

  describe("HIDDEN survivor (#1946 follow-up)", () => {
    const HIDDEN_SURVIVOR_ROW: InboxDuplicateClusterRow = {
      ...ROW,
      entities: [
        { id: "e1", name: "Lil", type: "NPC", visibility: "REVEALED", mentionCount: 1 },
        { id: "e2", name: "lili", type: "NPC", visibility: "HIDDEN", mentionCount: 0 },
        { id: "e3", name: "Lili", type: "NPC", visibility: "HIDDEN", mentionCount: 3 },
      ],
      defaultSurvivorId: "e3",
    };

    it("warns that a REVEALED loser's mentions redact to Hidden, before the full-entity fetch resolves", async () => {
      fetchEntities.mockReturnValue(new Promise(() => {})); // never resolves
      render(
        <ReviewDuplicatesModal row={HIDDEN_SURVIVOR_ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />,
      );

      expect(
        screen.getByText('Mentions from Lil will render as "Hidden" until Lili is revealed'),
      ).toBeInTheDocument();
    });

    it("shows the redaction warning alongside the existing Hidden-visibility-dropped item, without conflating them", async () => {
      fetchEntities.mockResolvedValue([
        fullEntity({ id: "e1", name: "Lil", visibility: "REVEALED" }),
        fullEntity({ id: "e2", name: "lili", visibility: "HIDDEN" }),
        fullEntity({ id: "e3", name: "Lili", visibility: "HIDDEN" }),
      ]);
      render(
        <ReviewDuplicatesModal row={HIDDEN_SURVIVOR_ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />,
      );

      // Wait for a ready-state-only fact — "rows deleted" alone also matches
      // the pending placeholder, so it would resolve before the fetch lands.
      await waitFor(() => expect(screen.getByText("Hidden visibility — lili")).toBeInTheDocument());

      // The REVEALED loser's mentions will redact once absorbed into the HIDDEN survivor…
      expect(
        screen.getByText('Mentions from Lil will render as "Hidden" until Lili is revealed'),
      ).toBeInTheDocument();
    });
  });

  describe("2-entity cluster (1 loser) — review finding #1", () => {
    const TWO_ENTITY_ROW: InboxDuplicateClusterRow = {
      ...ROW,
      entities: [
        { id: "e1", name: "Lil", type: "NPC", visibility: "HIDDEN", mentionCount: 1 },
        { id: "e3", name: "Lili", type: "NPC", visibility: "REVEALED", mentionCount: 3 },
      ],
      defaultSurvivorId: "e3",
    };
    const TWO_ENTITY_FULL: CampaignEntity[] = [
      fullEntity({ id: "e1", name: "Lil", visibility: "HIDDEN" }),
      fullEntity({ id: "e3", name: "Lili" }),
    ];

    // A single loser still renders under the bare "Discarded" heading (no
    // "Discarded with X" the way CombineConfirmDialog has) — an unnamed
    // label here would be exactly as ambiguous as a 3-loser one, and would
    // silently point at a different entity once the survivor radio flips.
    it("still names the loser — labels aren't unnamed just because the cluster happens to have only one loser", async () => {
      fetchEntities.mockResolvedValue(TWO_ENTITY_FULL);
      render(
        <ReviewDuplicatesModal row={TWO_ENTITY_ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />,
      );

      await waitFor(() => expect(screen.getByText("Hidden visibility — Lil")).toBeInTheDocument());
      expect(screen.queryByText(/^Hidden visibility$/)).not.toBeInTheDocument();
    });
  });

  it("waits on a still-pending merges fetch, not just the entities fetch, before treating the preview as complete (review finding #4)", async () => {
    let resolveMerges!: (v: unknown[]) => void;
    fetchEntityMerges.mockReturnValue(new Promise((r) => { resolveMerges = r; }));
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);

    // Entities have already landed (FULL_ENTITIES resolves synchronously in
    // beforeEach), but merges hasn't — the fuller categories must not
    // render yet, or the box would look complete while still missing a
    // possible "Prepared identity merges" item.
    await waitFor(() => expect(fetchEntities).toHaveBeenCalled());
    expect(screen.queryByText(/Hidden visibility — Lil/)).not.toBeInTheDocument();

    resolveMerges([]);
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());
  });

  it("surfaces a cross-loser 409 (two character-linked losers, round-2 hardening) readably", async () => {
    combineEntities.mockRejectedValueOnce(new Error("Both entities are linked to a character"));
    render(<ReviewDuplicatesModal row={ROW} onClose={vi.fn()} onDisregard={vi.fn()} disregarding={false} />);
    await waitFor(() => expect(screen.getByText(/Hidden visibility — Lil/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Combine and delete 2 entries" }));

    expect(await screen.findByText("Both entities are linked to a character")).toBeInTheDocument();
  });
});
