import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEntity,
  deleteEntity,
  executeEntityMerge,
  fetchEntities,
  fetchEntityActivity,
  fetchEntityBacklinks,
  fetchEntityConnections,
  fetchEntityMerges,
  prepareEntityMerge,
  unmergeEntityMerge,
  updateEntity,
} from "@/api/entities";

// New direct coverage (#1270) — previously only exercised transitively.
describe("fetchEntities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/entities with no query params by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntities("camp-1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toMatch(/\/campaigns\/camp-1\/entities$/);
    expect(url.search).toBe("");
  });

  it("composes q/type/includeStats as query params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntities("camp-1", { q: "gorak", type: "NPC", includeStats: true });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("q")).toBe("gorak");
    expect(url.searchParams.get("type")).toBe("NPC");
    expect(url.searchParams.get("include")).toBe("stats");
  });
});

describe("createEntity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the entity input", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "e1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createEntity("camp-1", { type: "NPC", name: "Gorak" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("updateEntity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /campaigns/:id/entities/:entityId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "e1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await updateEntity("camp-1", "e1", { name: "Gorak the Wise" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/e1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

describe("deleteEntity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deleteEntity("camp-1", "e1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/e1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("fetchEntityBacklinks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/entities/:entityId/backlinks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntityBacklinks("camp-1", "e1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/e1/backlinks"),
      expect.anything()
    );
  });
});

describe("fetchEntityConnections", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /connections with no query by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntityConnections("camp-1", "e1");

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toMatch(/\/campaigns\/camp-1\/entities\/e1\/connections$/);
    expect(url.search).toBe("");
  });

  it("appends ?limit when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntityConnections("camp-1", "e1", { limit: 5 });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("limit")).toBe("5");
  });
});

describe("fetchEntityActivity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/entities/activity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntityActivity("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/activity"),
      expect.anything()
    );
  });
});

describe("fetchEntityMerges", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs /campaigns/:id/entities/merges", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchEntityMerges("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/merges"),
      expect.anything()
    );
  });
});

describe("prepareEntityMerge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the merge input", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await prepareEntityMerge("camp-1", { mergedEntityId: "e1", survivorEntityId: "e2" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/merges"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("executeEntityMerge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /merges/:mergeId/execute", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "m1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await executeEntityMerge("camp-1", "m1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/merges/m1/execute"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("unmergeEntityMerge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a DELETE to /merges/:mergeId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await unmergeEntityMerge("camp-1", "m1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/campaigns/camp-1/entities/merges/m1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
