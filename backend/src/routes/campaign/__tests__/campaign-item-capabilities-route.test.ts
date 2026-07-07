import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "../../../app.js";
import { prisma } from "../../../lib/prisma.js";
import { authCookie } from "../../../test-support/auth.js";
import { ensureTestOwner } from "../../../test-support/owner.js";

// DM authoring of passiveBonus capabilities + attunement prerequisite persists
// and round-trips through the campaign-item route (#546).
const OWNER = "owner-campaign-item-caps-route";

const app = createApp();

describe("campaign item capabilities route (#546)", () => {
  let cookie: string;
  let campaignId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER);
    cookie = await authCookie(OWNER);
    const created = await supertest(app)
      .post("/api/campaigns")
      .set("Cookie", cookie)
      .send({ name: "Caps Campaign" });
    campaignId = created.body.id;
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: OWNER } });
  });

  it("persists a scalar + a dice-valued capability and an attunement prereq", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookie)
      .send({
        name: "Cloak of the Wary Wizard",
        category: "gear",
        rarity: "RARE",
        requiresAttunement: true,
        attunementPrereqKind: "class",
        attunementPrereqValue: "Wizard",
        capabilities: [
          { kind: "passiveBonus", target: "skill", op: "add", value: 2, targetKey: "stealth" },
          {
            kind: "passiveBonus",
            target: "damage",
            op: "add",
            dice: { count: 2, faces: 6, damageType: "fire" },
            condition: "on hit",
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.attunementPrereqKind).toBe("class");
    expect(res.body.attunementPrereqValue).toBe("Wizard");
    expect(res.body.capabilities).toHaveLength(2);
    const scalar = res.body.capabilities.find((c: { target: string }) => c.target === "skill");
    expect(scalar).toMatchObject({ kind: "passiveBonus", op: "add", value: 2, targetKey: "stealth" });
    const dice = res.body.capabilities.find((c: { target: string }) => c.target === "damage");
    expect(dice.dice).toMatchObject({ count: 2, faces: 6, damageType: "fire" });
    expect(dice.condition).toBe("on hit");
  });

  it("REPLACEs capabilities on update — a shorter list drops removed rows", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookie)
      .send({
        name: "Ring of Two Bonuses",
        category: "gear",
        rarity: "UNCOMMON",
        capabilities: [
          { kind: "passiveBonus", target: "ac", op: "add", value: 1 },
          { kind: "passiveBonus", target: "save", op: "add", value: 1, targetKey: "dexterity" },
        ],
      });
    expect(created.body.capabilities).toHaveLength(2);

    const updated = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ capabilities: [{ kind: "passiveBonus", target: "ac", op: "add", value: 1 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.capabilities).toHaveLength(1);
    expect(updated.body.capabilities[0].target).toBe("ac");

    const rows = await prisma.campaignItemCapability.findMany({
      where: { campaignItemId: created.body.id },
    });
    expect(rows).toHaveLength(1);
  });

  it("clears all capabilities when sent an empty array", async () => {
    const created = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookie)
      .send({
        name: "Fading Charm",
        category: "gear",
        rarity: "UNCOMMON",
        capabilities: [{ kind: "passiveBonus", target: "initiative", op: "add", value: 1 }],
      });
    const updated = await supertest(app)
      .patch(`/api/campaigns/${campaignId}/items/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ capabilities: [] });
    expect(updated.status).toBe(200);
    expect(updated.body.capabilities).toBeUndefined();
    const rows = await prisma.campaignItemCapability.findMany({
      where: { campaignItemId: created.body.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("rejects an unknown capability target", async () => {
    const res = await supertest(app)
      .post(`/api/campaigns/${campaignId}/items`)
      .set("Cookie", cookie)
      .send({
        name: "Bad Item",
        category: "gear",
        capabilities: [{ kind: "passiveBonus", target: "luck", op: "add", value: 1 }],
      });
    expect(res.status).toBe(400);
  });
});
