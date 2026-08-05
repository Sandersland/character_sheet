import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { parseClassFilterOr400 } from "@/lib/http/parse-class-param.js";
import { parseMaxSpellLevelOr400 } from "@/lib/http/parse-max-spell-level-param.js";

// A minimal res double capturing status + json, so the helpers can be exercised
// without an Express app (verbatim from parse-body.test.ts's mockRes).
function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: vi.fn(function (this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, payload: unknown) {
      this.body = payload;
      return this;
    }),
  };
  return res as typeof res & Response;
}

function reqWith(query: Record<string, unknown>): Pick<Request, "query"> {
  return { query } as Pick<Request, "query">;
}

describe("parseMaxSpellLevelOr400", () => {
  it("succeeds with no maxLevel when the param is absent, writing nothing", () => {
    const res = mockRes();
    expect(parseMaxSpellLevelOr400(reqWith({}), res)).toEqual({ ok: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  // The whole reason this is not a copy of parseAsiLevelOr400: cantrips are
  // level 0, so 0 is in band and its `< 1` floor would have rejected them.
  it("accepts 0 (cantrips) and the 9 ceiling", () => {
    expect(parseMaxSpellLevelOr400(reqWith({ maxLevel: "0" }), mockRes())).toEqual({ ok: true, maxLevel: 0 });
    expect(parseMaxSpellLevelOr400(reqWith({ maxLevel: "9" }), mockRes())).toEqual({ ok: true, maxLevel: 9 });
  });

  it("400s a level above 9 rather than clamping it", () => {
    const res = mockRes();
    expect(parseMaxSpellLevelOr400(reqWith({ maxLevel: "10" }), res)).toEqual({ ok: false });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Invalid maxLevel: must be an integer between 0 and 9" });
  });

  it("400s a negative level", () => {
    const res = mockRes();
    expect(parseMaxSpellLevelOr400(reqWith({ maxLevel: "-1" }), res)).toEqual({ ok: false });
    expect(res.statusCode).toBe(400);
  });

  // `Number("")` is 0 and 0 is legal here, so a blank param must not be read as
  // "cantrips only" — the one case parseAsiLevelOr400 gets for free.
  it("400s a blank, non-integer, or repeated param instead of reading it as 0", () => {
    for (const maxLevel of ["", "   ", "abc", "1.5", ["1", "2"]]) {
      const res = mockRes();
      expect(parseMaxSpellLevelOr400(reqWith({ maxLevel }), res), String(maxLevel)).toEqual({ ok: false });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe("parseClassFilterOr400", () => {
  it("succeeds with no className when the param is absent, writing nothing", () => {
    const res = mockRes();
    expect(parseClassFilterOr400(reqWith({}), res)).toEqual({ ok: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  // SpellClass.className is stored lowercase, so the caller's casing must
  // never reach the query — the client passes a display-cased name ("Warlock").
  it("lowercases and trims the class name", () => {
    expect(parseClassFilterOr400(reqWith({ class: "  Warlock " }), mockRes())).toEqual({
      ok: true,
      className: "warlock",
    });
  });

  it("400s a blank or repeated param", () => {
    for (const cls of ["", "  ", ["wizard", "bard"]]) {
      const res = mockRes();
      expect(parseClassFilterOr400(reqWith({ class: cls }), res), String(cls)).toEqual({ ok: false });
      expect(res.statusCode).toBe(400);
    }
  });
});
