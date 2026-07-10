import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { parseBodyOr400 } from "@/lib/http/parse-body.js";

// A minimal res double capturing status + json, so the helper can be exercised
// without an Express app.
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

const schema = z.object({ name: z.string().min(1) }).strict();

describe("parseBodyOr400", () => {
  it("returns the parsed data and writes nothing on a valid body", () => {
    const res = mockRes();
    const data = parseBodyOr400(schema, { name: "Aria" }, res);
    expect(data).toEqual({ name: "Aria" });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("writes the standard 400 { error, details } and returns undefined on an invalid body", () => {
    const res = mockRes();
    const data = parseBodyOr400(schema, { name: "" }, res);
    expect(data).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid request body",
      details: schema.safeParse({ name: "" }).error!.flatten(),
    });
  });

  it("400s an unexpected key under a strict schema", () => {
    const res = mockRes();
    const data = parseBodyOr400(schema, { name: "Aria", extra: 1 }, res);
    expect(data).toBeUndefined();
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe("Invalid request body");
  });
});
