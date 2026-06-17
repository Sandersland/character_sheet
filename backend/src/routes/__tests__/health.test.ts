import { describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../app.js";

describe("GET /api/health", () => {
  it("returns ok status", async () => {
    const response = await supertest(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
