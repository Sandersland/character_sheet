import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { parseAsiLevelOr400 } from "@/lib/http/parse-asi-level-param.js";
import { MAX_LEVEL } from "@/lib/leveling/experience.js";

// A minimal res double capturing status + json, so the helper can be exercised
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

describe("parseAsiLevelOr400", () => {
  // The case requireEditionOr400 cannot have: absent is SUCCESS, not a bail, and
  // it must be distinguishable from a rejected value — hence the discriminated
  // result rather than that helper's `T | undefined`.
  it("succeeds with no asiLevel when the param is absent, writing nothing", () => {
    const res = mockRes();
    expect(parseAsiLevelOr400(reqWith({}), res)).toEqual({ ok: true });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("returns the parsed level and writes nothing for an in-range integer", () => {
    const res = mockRes();
    expect(parseAsiLevelOr400(reqWith({ asiLevel: "4" }), res)).toEqual({ ok: true, asiLevel: 4 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("400s a non-numeric value", () => {
    const res = mockRes();
    expect(parseAsiLevelOr400(reqWith({ asiLevel: "abc" }), res)).toEqual({ ok: false });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: `Invalid asiLevel: must be an integer between 1 and ${MAX_LEVEL}` });
  });

  it("400s a level below 1 rather than clamping it", () => {
    const res = mockRes();
    expect(parseAsiLevelOr400(reqWith({ asiLevel: "0" }), res)).toEqual({ ok: false });
    expect(res.statusCode).toBe(400);
  });

  it("400s a level above MAX_LEVEL rather than clamping it", () => {
    const res = mockRes();
    expect(parseAsiLevelOr400(reqWith({ asiLevel: String(MAX_LEVEL + 1) }), res)).toEqual({ ok: false });
    expect(res.statusCode).toBe(400);
  });

  it("400s a non-integer and a repeated param, which Express hands over as an array", () => {
    for (const asiLevel of ["4.5", ["4", "5"]]) {
      const res = mockRes();
      expect(parseAsiLevelOr400(reqWith({ asiLevel }), res), String(asiLevel)).toEqual({ ok: false });
      expect(res.statusCode).toBe(400);
    }
  });
});
