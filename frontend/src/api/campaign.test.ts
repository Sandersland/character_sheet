import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addCharacterToCampaign,
  awardCampaignItem,
  createCampaign,
  createCampaignItem,
  deleteCampaignItem,
  fetchCampaign,
  fetchCampaignItemByEntity,
  fetchCampaignItems,
  fetchCampaigns,
  joinCampaign,
  revokeCampaignItem,
  updateCampaignItem,
} from "@/api/campaign";

// New direct coverage (#1270) — these were only exercised transitively before
// the split. The request<T> json-flow pin (fetchCampaigns/createCampaign) now
// lives in http.test.ts, exercising the shared plumbing through this module.
describe("fetchCampaigns", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaigns();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/campaigns"), expect.anything());
  });
});

describe("createCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { name }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createCampaign("Curse of Strahd");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Curse of Strahd" }) })
    );
  });
});

describe("fetchCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaign("c1");

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/campaigns/c1"), expect.anything());
  });
});

describe("joinCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the invite code to /campaigns/join", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "c1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await joinCampaign("ABC123");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/join"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ inviteCode: "ABC123" }) })
    );
  });
});

describe("addCharacterToCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { characterId } to /campaigns/:id/characters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "char-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await addCharacterToCampaign("char-1", "camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/characters"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ characterId: "char-1" }) })
    );
  });
});

describe("fetchCampaignItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/items", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaignItems("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items"),
      expect.anything()
    );
  });
});

describe("fetchCampaignItemByEntity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/items/by-entity/:entityId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "item-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCampaignItemByEntity("camp-1", "entity-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/by-entity/entity-1"),
      expect.anything()
    );
  });
});

describe("createCampaignItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the item input", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "item-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const input = { entityId: "entity-1", name: "Sword", quantity: 1 };
    await createCampaignItem("camp-1", input as never);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("updateCampaignItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /campaigns/:id/items/:itemId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "item-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await updateCampaignItem("camp-1", "item-1", { name: "Sword +1" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("deleteCampaignItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deleteCampaignItem("camp-1", "item-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("awardCampaignItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /award and returns the updated holder list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ holders: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await awardCampaignItem("camp-1", "item-1", { characterId: "char-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1/award"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("revokeCampaignItem", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /revoke and returns the updated holder list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ holders: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await revokeCampaignItem("camp-1", "item-1", { characterId: "char-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/items/item-1/revoke"),
      expect.objectContaining({ method: "POST" })
    );
  });
});
