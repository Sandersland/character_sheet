import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFeats, fetchItems, fetchReference, fetchSpells } from "@/api/catalog";

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

    await expect(fetchSpells()).resolves.toMatchObject([{ name: "Fireball", level: 3 }]);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchSpells()).rejects.toThrow();
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

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchFeats("EDITION_2024")).rejects.toThrow();
  });
});
