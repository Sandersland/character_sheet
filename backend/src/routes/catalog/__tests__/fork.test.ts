import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { prisma } from "@/lib/core/prisma.js";
import { authCookie } from "@/test-support/auth.js";
import { createTestCharacter } from "@/test-support/character.js";
import { ensureTestOwner } from "@/test-support/owner.js";

// POST /api/catalog/entries/:entryId/fork (#1800, epic #1795 5/6): a viewer
// forks visible content into their own USER stash, or a campaign's DM forks
// it into that campaign's CAMPAIGN scope. Real Postgres via supertest against
// the shared `app`.

const OWNER = "owner-fork-route-owner"; // owns a private USER-scope spell, later grants one into the campaign
const VIEWER = "owner-fork-route-viewer"; // forks a GLOBAL entry
const OUTSIDER = "owner-fork-route-outsider"; // can't see OWNER's private spell, not a campaign member
const DM = "owner-fork-route-dm";
const PLAYER = "owner-fork-route-player"; // campaign member, not DM

let cookieOwner: string;
let cookieViewer: string;
let cookieOutsider: string;
let cookieDm: string;
let cookiePlayer: string;
let campaignId: string;
let globalEntryId: string;
let privateEntryId: string;
// #1819: OWNER's authoring character — the create endpoint derives a homebrew
// spell's edition from it. 2014 so these fixtures stay EDITION_2014.
let ownerCharId: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const VALID_SPELL = {
  name: "Fork Route Private Spell",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "A bolt of test energy.",
  classes: ["wizard"],
  effectKind: "damage",
  effectDiceCount: 2,
  effectDiceFaces: 6,
  damageType: "force",
  attackType: "attack",
};

beforeAll(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(VIEWER);
  await ensureTestOwner(OUTSIDER);
  await ensureTestOwner(DM);
  await ensureTestOwner(PLAYER);
  cookieOwner = await authCookie(OWNER);
  cookieViewer = await authCookie(VIEWER);
  cookieOutsider = await authCookie(OUTSIDER);
  cookieDm = await authCookie(DM);
  cookiePlayer = await authCookie(PLAYER);

  const seeded = await prisma.spell.findFirst({
    where: { edition: "EDITION_2014" },
    orderBy: { name: "asc" },
  });
  if (!seeded) throw new Error("expected at least one seeded EDITION_2014 spell fixture");
  globalEntryId = seeded.catalogEntryId;

  ownerCharId = await createTestCharacter(OWNER, { edition: "EDITION_2014", name: "Fork Route Author" });
  const createdPrivate = await agent(cookieOwner).post(`/api/spells/custom?characterId=${ownerCharId}`).send(VALID_SPELL);
  expect(createdPrivate.status).toBe(201);
  privateEntryId = createdPrivate.body.catalog.entryId;

  const campaign = await agent(cookieDm).post("/api/campaigns").send({ name: "Fork Route Campaign" });
  campaignId = campaign.body.id;
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode: campaign.body.inviteCode });
  // OWNER also joins (grants.ts's own POST requires the entry's owner be a
  // member of the target campaign to grant into it — see that route's own
  // comment) so the grant-visibility tests below can have OWNER grant their
  // own homebrew into this campaign for PLAYER (a DIFFERENT member) to fork.
  await agent(cookieOwner).post("/api/campaigns/join").send({ inviteCode: campaign.body.inviteCode });
});

afterAll(async () => {
  await prisma.catalogEntry.deleteMany({ where: { ownerUserId: { in: [OWNER, VIEWER, OUTSIDER, DM, PLAYER] } } });
  if (campaignId) await prisma.catalogEntry.deleteMany({ where: { ownerCampaignId: campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, VIEWER, OUTSIDER, DM, PLAYER] } } });
});

describe("POST /api/catalog/entries/:entryId/fork", () => {
  it("forks a visible (GLOBAL) entry into the caller's own USER scope", async () => {
    const res = await agent(cookieViewer)
      .post(`/api/catalog/entries/${globalEntryId}/fork`)
      .send({ scope: "USER" });
    expect(res.status).toBe(201);
    expect(res.body.entryId).toBeTypeOf("string");
    expect(res.body.entryId).not.toBe(globalEntryId);
    expect(res.body.spell).toMatchObject({ catalog: { scope: "USER", isFork: true, forkedFromId: globalEntryId, editable: true } });

    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: res.body.entryId } });
    expect(entry.scope).toBe("USER");
    expect(entry.ownerUserId).toBe(VIEWER);
    expect(entry.forkedFromId).toBe(globalEntryId);

    const origin = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: globalEntryId } });
    expect(origin.scope).toBe("GLOBAL");
    expect(origin.forkedFromId).toBeNull();
  });

  it("lets that campaign's DM fork into CAMPAIGN scope", async () => {
    const res = await agent(cookieDm)
      .post(`/api/catalog/entries/${globalEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(res.status).toBe(201);

    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: res.body.entryId } });
    expect(entry.scope).toBe("CAMPAIGN");
    expect(entry.ownerCampaignId).toBe(campaignId);
    expect(entry.forkedFromId).toBe(globalEntryId);
  });

  it("403s a non-DM member's attempt to fork into CAMPAIGN scope", async () => {
    const res = await agent(cookiePlayer)
      .post(`/api/catalog/entries/${globalEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(res.status).toBe(403);
  });

  it("403s a non-member's attempt to fork into a campaign they're not in", async () => {
    const res = await agent(cookieOutsider)
      .post(`/api/catalog/entries/${globalEntryId}/fork`)
      .send({ scope: "CAMPAIGN", campaignId });
    expect(res.status).toBe(403);
  });

  it("403s forking an entry the caller can't see (another user's private homebrew)", async () => {
    const res = await agent(cookieOutsider)
      .post(`/api/catalog/entries/${privateEntryId}/fork`)
      .send({ scope: "USER" });
    expect(res.status).toBe(403);
  });

  // #1815 review finding 1 (the confirmed bug this epic exists to fix): the
  // resolver (lib/catalog/entitlement.ts) already shows a shared spell in a
  // campaign member's picker, but the fork route's OWN visibility check had
  // no grants arm at all, so forking it 403'd regardless. A USER-scope entry
  // GRANTED into the DM's campaign, forked by PLAYER (a member, not the
  // owner) — must now succeed.
  it("lets a campaign member fork a USER-scope entry granted into their campaign", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${ownerCharId}`)
      .send({ ...VALID_SPELL, name: "Fork Route Grantable Spell" });
    expect(created.status).toBe(201);
    const grantableEntryId = created.body.catalog.entryId as string;

    await agent(cookieOwner)
      .post(`/api/catalog/entries/${grantableEntryId}/grants`)
      .send({ campaignId })
      .expect(201);

    const res = await agent(cookiePlayer)
      .post(`/api/catalog/entries/${grantableEntryId}/fork`)
      .send({ scope: "USER" });
    expect(res.status).toBe(201);
    expect(res.body.spell).toMatchObject({
      catalog: { scope: "USER", isFork: true, forkedFromId: grantableEntryId, editable: true },
    });

    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: res.body.entryId } });
    expect(entry.ownerUserId).toBe(PLAYER);
  });

  // The same grant, from a caller who is NOT a member of the campaign it was
  // granted into — the grants arm must not admit visibility from a DIFFERENT
  // campaign's membership.
  it("still 403s a non-member forking a USER-scope entry granted into a campaign they're not in", async () => {
    const created = await agent(cookieOwner)
      .post(`/api/spells/custom?characterId=${ownerCharId}`)
      .send({ ...VALID_SPELL, name: "Fork Route Grantable Spell For Outsider" });
    expect(created.status).toBe(201);
    const grantableEntryId = created.body.catalog.entryId as string;

    await agent(cookieOwner)
      .post(`/api/catalog/entries/${grantableEntryId}/grants`)
      .send({ campaignId })
      .expect(201);

    const res = await agent(cookieOutsider)
      .post(`/api/catalog/entries/${grantableEntryId}/fork`)
      .send({ scope: "USER" });
    expect(res.status).toBe(403);
  });

  it("404s an entryId that doesn't exist", async () => {
    const res = await agent(cookieViewer).post("/api/catalog/entries/does-not-exist/fork").send({ scope: "USER" });
    expect(res.status).toBe(404);
  });

  it("400s scope CAMPAIGN with no campaignId (schema-level)", async () => {
    const res = await agent(cookieDm).post(`/api/catalog/entries/${globalEntryId}/fork`).send({ scope: "CAMPAIGN" });
    expect(res.status).toBe(400);
  });
});
