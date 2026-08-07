import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFeats, fetchItems, fetchReference, fetchSpells, forkCatalogEntry, shareCatalogEntry, unshareCatalogEntry } from "@/api/catalog";

// Verbatim regression pins from client.test.ts (#1270) — assertions unchanged,
// only the import specifier retargeted.
describe("fetchReference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed catalog on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        races: [{ id: "r1", name: "Human", speed: 30 }],
        classes: [],
        backgrounds: [],
        alignments: ["Lawful Good"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchReference("EDITION_2024")).resolves.toMatchObject({
      races: [{ name: "Human", speed: 30 }],
    });
    // Proves the edition reaches the wire (#1325) — a query param, not a header,
    // so it participates in the queryKey/cache identity structurally.
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/reference\?edition=EDITION_2024$/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchReference("EDITION_2024")).rejects.toThrow();
  });
});

describe("fetchItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed item catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "i1", name: "Club", category: "weapon", damageDice: "1d4", properties: ["light"] },
        ],
      })
    );

    await expect(fetchItems()).resolves.toMatchObject([{ name: "Club", category: "weapon" }]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchItems()).rejects.toThrow();
  });
});

// New coverage (#1270) — fetchSpells/fetchFeats were never directly asserted
// in client.test.ts (only exercised transitively through other suites).
describe("fetchSpells", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed spell catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: "s1", name: "Fireball", level: 3 }],
      })
    );

    await expect(fetchSpells("EDITION_2024")).resolves.toMatchObject([{ name: "Fireball", level: 3 }]);
  });

  // #1712: `?edition=` is now REQUIRED (the route 400s without it) — same pin
  // shape as fetchFeats/fetchReference above.
  it("always sends ?edition=, with class/maxLevel appended when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSpells("EDITION_2014");
    await fetchSpells("EDITION_2024", { className: "wizard", maxLevel: 3 });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/spells\?edition=EDITION_2014$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/spells\?edition=EDITION_2024&class=wizard&maxLevel=3$/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchSpells("EDITION_2024")).rejects.toThrow();
  });
});

describe("fetchFeats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed feat catalog on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "f1", name: "Alert" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFeats("EDITION_2014")).resolves.toMatchObject([{ name: "Alert" }]);
    // Same pin as fetchReference above: the route 400s without it (#1411), and
    // Alert is the seeded row that actually forks by edition.
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/feats\?edition=EDITION_2014$/);
  });

  it("appends ?asiLevel= only when a level is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await fetchFeats("EDITION_2024", 19);
    await fetchFeats("EDITION_2024");
    await fetchFeats("EDITION_2024", undefined);

    // The absent cases must not send `asiLevel=undefined`: the route treats any
    // present-but-unparseable value as a 400 (#1438), so a stringified undefined
    // would break the non-ASI consumers rather than serving them the full catalog.
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/feats\?edition=EDITION_2024&asiLevel=19$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/feats\?edition=EDITION_2024$/);
    expect(fetchMock.mock.calls[2][0]).toMatch(/\/feats\?edition=EDITION_2024$/);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFeats("EDITION_2024")).rejects.toThrow();
  });
});

// #1801, epic #1795 6/6: share (grant) + fork API coverage.
describe("shareCatalogEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { campaignId } to /catalog/entries/:entryId/grants", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "g1", catalogEntryId: "e1", campaignId: "c1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(shareCatalogEntry("e1", "c1")).resolves.toEqual({ id: "g1", catalogEntryId: "e1", campaignId: "c1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/catalog\/entries\/e1\/grants$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ campaignId: "c1" });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "nope" }) }));

    await expect(shareCatalogEntry("e1", "c1")).rejects.toThrow("nope");
  });
});

describe("unshareCatalogEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETEs /catalog/entries/:entryId/grants/:campaignId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => undefined });
    vi.stubGlobal("fetch", fetchMock);

    await unshareCatalogEntry("e1", "c1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/catalog\/entries\/e1\/grants\/c1$/);
    expect(init.method).toBe("DELETE");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "nope" }) }));

    await expect(unshareCatalogEntry("e1", "c1")).rejects.toThrow("nope");
  });
});

describe("forkCatalogEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs { scope: 'USER' } and returns { entryId, spell }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entryId: "e2", spell: { id: "s2", name: "Forked Bolt", level: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(forkCatalogEntry("e1", { scope: "USER" })).resolves.toMatchObject({
      entryId: "e2",
      spell: { name: "Forked Bolt" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/catalog\/entries\/e1\/fork$/);
    expect(JSON.parse(init.body)).toEqual({ scope: "USER" });
  });

  it("POSTs { scope: 'CAMPAIGN', campaignId } for a DM override", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entryId: "e3", spell: { id: "s3", name: "Campaign Override", level: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await forkCatalogEntry("e1", { scope: "CAMPAIGN", campaignId: "c1" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ scope: "CAMPAIGN", campaignId: "c1" });
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "nope" }) }));

    await expect(forkCatalogEntry("e1", { scope: "USER" })).rejects.toThrow("nope");
  });
});
