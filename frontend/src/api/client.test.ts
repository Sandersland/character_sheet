import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteCampaignItem, deleteCharacter, joinSession } from "./client";

// The generic send/throwIfNotOk helpers (#506) are internal — exercised here
// through representative callers to lock the shared ok-check/error-parse/throw
// flow. joinSession keeps this describe here (not in http.test.ts) until it
// moves into api/session.ts (#1270 C11).
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
