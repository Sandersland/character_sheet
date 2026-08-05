import { afterEach, describe, expect, it, vi } from "vitest";

import { castDisciplineTransaction, fetchDisciplines } from "@/api/disciplines";

describe("fetchDisciplines", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the discipline catalog with the character's edition in the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "d1" }] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchDisciplines("EDITION_2014")).resolves.toEqual([{ id: "d1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/disciplines?edition=EDITION_2014"),
      expect.anything(),
    );
  });
});

describe("castDisciplineTransaction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the operations batch to the disciplines ability endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const operations = [{ type: "castDiscipline" as const, entryId: "e1", requestedKi: 2, roll: 7 }];
    await castDisciplineTransaction("1", operations);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/characters/1/abilities/disciplines/transactions"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ operations }) }),
    );
  });
});
