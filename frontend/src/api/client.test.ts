import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCampaign,
  deleteCampaignItem,
  deleteCharacter,
  fetchCampaigns,
  fetchLevelUpPlan,
  joinSession,
  submitLevelUp,
} from "./client";
import type { LevelUpSubmission } from "../types/character";

// The generic request<T>/send/throwIfNotOk helpers (#506) are internal — exercised
// here through representative callers to lock the shared ok-check/error-parse/throw flow.
describe("request<T> (json flow, via fetchCampaigns / createCampaign)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body on a plain GET success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "c1", name: "Curse of Strahd" }] })
    );

    await expect(fetchCampaigns()).resolves.toMatchObject([{ name: "Curse of Strahd" }]);
  });

  it("falls back to the labeled message when a plain GET fails with no JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    await expect(fetchCampaigns()).rejects.toThrow("Failed to fetch campaigns (500)");
  });

  it("surfaces the server's { error } message on a non-ok write", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Name already taken" }) })
    );

    await expect(createCampaign("Dupe")).rejects.toThrow("Name already taken");
  });

  it("falls back to the labeled message on a non-ok write with no { error }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    await expect(createCampaign("Boom")).rejects.toThrow("Failed to create campaign (500)");
  });
});

describe("send (void flow, via deleteCampaignItem / joinSession / deleteCharacter)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves without parsing a body on success (tolerates a 204 with no json)", async () => {
    // No json method on the response — a void helper must NOT read the body.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteCampaignItem("camp-1", "item-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("surfaces the server's { error } message when a void call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Owner only" }) })
    );

    await expect(joinSession("camp-1", "sess-1", "char-1")).rejects.toThrow("Owner only");
  });

  it("falls back to the labeled message on a void failure with no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }));

    await expect(deleteCharacter("1")).rejects.toThrow("Failed to delete character 1 (500)");
  });
});

describe("fetchLevelUpPlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const plan = {
    target: { className: "fighter", subclass: null, newLevel: 3, isPrimary: true },
    steps: [{ kind: "hitPoints" }, { kind: "subclass" }, { kind: "review" }],
  };

  it("GETs /level-up/plan with classEntryId + subclassId query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => plan });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLevelUpPlan("c1", { kind: "existing", classEntryId: "entry-1" }, "sub-1")
    ).resolves.toEqual(plan);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toContain("/characters/c1/level-up/plan");
    expect(url.searchParams.get("classEntryId")).toBe("entry-1");
    expect(url.searchParams.get("subclassId")).toBe("sub-1");
    expect(url.searchParams.get("classId")).toBeNull();
  });

  it("maps a kind:new target to the classId param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => plan });
    vi.stubGlobal("fetch", fetchMock);

    await fetchLevelUpPlan("c1", { kind: "new", classId: "class-9" });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("classId")).toBe("class-9");
    expect(url.searchParams.get("classEntryId")).toBeNull();
    expect(url.searchParams.get("subclassId")).toBeNull();
  });

  it("surfaces the server's { error } message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Class entry not found: bogus" }),
      })
    );

    await expect(
      fetchLevelUpPlan("c1", { kind: "existing", classEntryId: "bogus" })
    ).rejects.toThrow("Class entry not found: bogus");
  });
});

describe("submitLevelUp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const submission: LevelUpSubmission = {
    target: { kind: "existing", classEntryId: "entry-1" },
    hp: { method: "average" },
    advancement: { type: "takeAsi", increases: [{ ability: "strength", amount: 2 }] },
  };

  it("POSTs the submission verbatim (NOT wrapped in { operations }) and returns the character", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitLevelUp("c1", submission)).resolves.toMatchObject({ id: "c1" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/c1/level-up/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify(submission) })
    );
  });

  it("surfaces the server's { error } message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "this level-up requires choosing a subclass" }),
      })
    );

    await expect(submitLevelUp("c1", submission)).rejects.toThrow(
      "this level-up requires choosing a subclass"
    );
  });
});
