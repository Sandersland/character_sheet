import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJournalEntry,
  deleteJournalEntry,
  fetchCampaignArcs,
  fetchChronicleSessions,
  updateJournalEntry,
} from "@/api/journal";

describe("createJournalEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the entry and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createJournalEntry("1", { body: "We arrived at Barovia." });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/journal"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("updateJournalEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /characters/:id/journal/:entryId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await updateJournalEntry("1", "entry-1", { body: "Edited." });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/journal/entry-1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("deleteJournalEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE and returns the updated character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await deleteJournalEntry("1", "entry-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/journal/entry-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("fetchCampaignArcs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/arcs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaignArcs("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/arcs"),
      expect.anything()
    );
  });
});

describe("fetchChronicleSessions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/sessions?characterId=:characterId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchChronicleSessions("camp-1", "char-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toMatch(/\/campaigns\/camp-1\/sessions$/);
    expect(url.searchParams.get("characterId")).toBe("char-1");
  });
});
