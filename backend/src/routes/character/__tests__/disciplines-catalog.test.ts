import { beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER_ID = "owner-disciplines-catalog";
let COOKIE: string;

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
}

interface DisciplineRow {
  id: string;
  name: string;
  minLevel: number;
  cost: { kind: string; key?: string; base?: number; perStep?: number };
  effect: { dice?: { count: number; faces: number; modifier: number } };
  steps: { ki: number; roll: { count: number; faces: number; modifier: number } }[];
}

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  COOKIE = await authCookie(OWNER_ID);
});

describe("GET /api/disciplines — required ?edition=", () => {
  it("400s an absent ?edition=", async () => {
    const res = await agent().get("/api/disciplines");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing required query parameter: edition");
  });

  it("serves all 16 disciplines to EDITION_2014 and none to EDITION_2024 (2014-only content)", async () => {
    const as2014 = await agent().get("/api/disciplines?edition=EDITION_2014");
    expect(as2014.status).toBe(200);
    const names = (as2014.body as DisciplineRow[]).map((d) => d.name);
    expect(names).toHaveLength(16);
    expect(names).toContain("Fangs of the Fire Snake");

    const as2024 = await agent().get("/api/disciplines?edition=EDITION_2024");
    expect(as2024.status).toBe(200);
    expect(as2024.body).toEqual([]);
  });
});

describe("GET /api/disciplines — cost/effect/steps shape", () => {
  async function byName(name: string): Promise<DisciplineRow> {
    const res = await agent().get("/api/disciplines?edition=EDITION_2014");
    return (res.body as DisciplineRow[]).find((d) => d.name === name)!;
  }

  it("a scalable discipline (Fangs of the Fire Snake, 1 ki base + 1 ki/step) offers one step per ki 1..6, each scaling the dice count", async () => {
    const fangs = await byName("Fangs of the Fire Snake");
    expect(fangs.cost).toEqual({ kind: "pool", key: "ki", base: 1, perStep: 1 });
    expect(fangs.effect.dice).toEqual({ count: 1, faces: 10, modifier: 0 });
    expect(fangs.steps.map((s) => s.ki)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fangs.steps.map((s) => s.roll.count)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const step of fangs.steps) {
      expect(step.roll.faces).toBe(10);
    }
  });

  it("a non-scalable discipline (Fist of Four Thunders, flat 2 ki, no per-step) offers exactly ONE step — PHB'14 allows no overspend without a scaling clause", async () => {
    const fist = await byName("Fist of Four Thunders");
    expect(fist.cost).toEqual({ kind: "pool", key: "ki", base: 2 });
    expect(fist.steps).toEqual([{ ki: 2, roll: { count: 2, faces: 8, modifier: 0 } }]);
  });

  it("a no-dice utility discipline (Shape the Flowing River) offers no cast steps", async () => {
    const shape = await byName("Shape the Flowing River");
    expect(shape.effect.dice).toBeUndefined();
    expect(shape.steps).toEqual([]);
  });
});
