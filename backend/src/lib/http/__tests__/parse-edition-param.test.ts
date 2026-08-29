import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requireEditionOr400 } from "@/lib/http/parse-edition-param.js";

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

describe("requireEditionOr400", () => {
  it("returns the edition and writes nothing for a recognized value", () => {
    const res = mockRes();
    expect(requireEditionOr400(reqWith({ edition: "EDITION_2014" }), res)).toBe("EDITION_2014");
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("400s an absent param with the missing-parameter message", () => {
    const res = mockRes();
    expect(requireEditionOr400(reqWith({}), res)).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing required query parameter: edition" });
  });

  // Distinct message from the absent case — two 400s are indistinguishable by status alone.
  it("400s an unrecognized value with the unknown-edition message", () => {
    const res = mockRes();
    expect(requireEditionOr400(reqWith({ edition: "xyzzy" }), res)).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Unknown edition: xyzzy" });
  });
});
