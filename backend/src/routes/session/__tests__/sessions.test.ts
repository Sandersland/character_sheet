import { afterEach, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { authCookie } from "@/test-support/auth.js";

const OWNER = "owner-sessions-owner";
const PLAYER = "owner-sessions-player";
const OUTSIDER = "owner-sessions-outsider";
const CHAR_OWNER = "test-sessions-char-owner";
const CHAR_PLAYER = "test-sessions-char-player";

let cookieOwner: string;
let cookiePlayer: string;
let cookieOutsider: string;

const agent = (cookie: string) => supertest.agent(app).set("Cookie", cookie);

const BASE_CHAR = {
  alignment: "True Neutral",
  experiencePoints: 900,
  initiativeBonus: 2,
  speed: 30,
  hitPoints: { current: 28, max: 28, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 3, die: "d10", spent: 0 },
  abilityScores: {
    strength: 16, dexterity: 14, constitution: 14,
    intelligence: 10, wisdom: 10, charisma: 8,
  },
  savingThrowProficiencies: ["strength", "constitution"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 50, pp: 0 },
};

async function makeChar(id: string, name: string, ownerId: string) {
  await prisma.character.create({
    data: { ...BASE_CHAR, id, name, ownerId, spellcasting: Prisma.JsonNull },
  });
}

async function setupCampaign(): Promise<string> {
  const created = await agent(cookieOwner).post("/api/campaigns").send({ name: "Phandalin" });
  const { id: campaignId, inviteCode } = created.body as { id: string; inviteCode: string };
  await agent(cookiePlayer).post("/api/campaigns/join").send({ inviteCode });
  await agent(cookieOwner).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_OWNER });
  await agent(cookiePlayer).post(`/api/campaigns/${campaignId}/characters`).send({ characterId: CHAR_PLAYER });
  return campaignId;
}

function startUrl(campaignId: string) {
  return `/api/campaigns/${campaignId}/sessions`;
}

beforeEach(async () => {
  await ensureTestOwner(OWNER);
  await ensureTestOwner(PLAYER);
  await ensureTestOwner(OUTSIDER);
  cookieOwner = await authCookie(OWNER);
  cookiePlayer = await authCookie(PLAYER);
  cookieOutsider = await authCookie(OUTSIDER);
  await makeChar(CHAR_OWNER, "Owner Fighter", OWNER);
  await makeChar(CHAR_PLAYER, "Player Rogue", PLAYER);
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: [CHAR_OWNER, CHAR_PLAYER] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: OWNER } });
});

describe("POST /api/campaigns/:campaignId/sessions — start", () => {
  it("starts a shared session with the first member as participant", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner)
      .post(startUrl(campaignId))
      .send({ characterId: CHAR_OWNER, title: "Night One" });

    expect(res.status).toBe(201);
    expect(res.body.session.status).toBe("active");
    expect(res.body.session.campaignId).toBe(campaignId);
    expect(res.body.session.title).toBe("Night One");
    expect(res.body.session.participants).toHaveLength(1);
    expect(res.body.session.participants[0].characterId).toBe(CHAR_OWNER);
    expect(res.body.character.id).toBe(CHAR_OWNER);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "sessionStarted" },
    });
    expect(event?.sessionId).toBe(res.body.session.id);
  });

  it("409s when a session is already active for the campaign", async () => {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const res = await agent(cookiePlayer).post(startUrl(campaignId)).send({ characterId: CHAR_PLAYER });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already active/i);
  });

  it("403s for a non-member", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOutsider)
      .post(startUrl(campaignId))
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(403);
  });

  // Two truly concurrent starts can both pass the lib-level pre-check and tx-scoped re-check before either
  // commits (#1600 shipped the listening-server fix that makes concurrent supertest calls actually race).
  // Session_campaignId_active_key (see schema.prisma) closes this at the database; the loser's P2002 must map
  // to the same "already active" SessionError the sequential check raises, not a 500.
  it("two concurrent starts for the same campaign yield exactly one active session and no 500", async () => {
    const campaignId = await setupCampaign();

    const [resA, resB] = await Promise.all([
      agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER }),
      agent(cookiePlayer).post(startUrl(campaignId)).send({ characterId: CHAR_PLAYER }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = resA.status === 409 ? resA : resB;
    expect(loser.body.error).toMatch(/already active/i);

    const activeSessions = await prisma.session.findMany({
      where: { campaignId, status: "active" },
    });
    expect(activeSessions).toHaveLength(1);
  });
});

describe("join / leave", () => {
  it("lets a second member late-join an active session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookiePlayer)
      .post(`${startUrl(campaignId)}/${sessionId}/join`)
      .send({ characterId: CHAR_PLAYER });
    expect(res.status).toBe(201);

    const participants = await prisma.sessionParticipant.findMany({ where: { sessionId } });
    expect(participants).toHaveLength(2);
  });

  it("records leftAt on leave", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(200);

    const participant = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(participant.leftAt).not.toBeNull();
  });

  it("clears leftAt on rejoin (single interval)", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/leave`).send({ characterId: CHAR_OWNER });
    const rejoin = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_OWNER });
    expect(rejoin.status).toBe(200);

    const participant = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(participant.leftAt).toBeNull();
  });

  it("rejects a leave on an already-ended session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const res = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(res.status).toBe(409);
  });

  it("rejects a double-leave and keeps the original leftAt", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const first = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(first.status).toBe(200);
    const afterFirst = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });

    const second = await agent(cookieOwner)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_OWNER });
    expect(second.status).toBe(409);
    const afterSecond = await prisma.sessionParticipant.findUniqueOrThrow({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
    });
    expect(afterSecond.leftAt?.getTime()).toBe(afterFirst.leftAt?.getTime());
  });
});

describe("auto-close after the grace period", () => {
  it("auto-closes once every participant has been gone past the grace period", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    // Two hours ago is past the 1h SESSION_GRACE_MS.
    await prisma.sessionParticipant.update({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
      data: { leftAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const active = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(active.status).toBe(200);
    expect(active.body).toBeNull();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("ended");
    expect(session.summary).not.toBeNull();
  });

  it("auto-closes immediately when character deletion has emptied the participant list", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    // Deleting the character cascades its participant row, leaving an active session nobody can rejoin or end.
    await prisma.character.delete({ where: { id: CHAR_OWNER } });

    const active = await agent(cookiePlayer).get(`/api/characters/${CHAR_PLAYER}/sessions/active`);
    expect(active.status).toBe(200);
    expect(active.body).toBeNull();

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe("ended");
    expect(session.endedAt).not.toBeNull();
  });

  it("stays open if someone rejoined before the grace elapsed", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookiePlayer).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_PLAYER });

    await prisma.sessionParticipant.update({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_OWNER } },
      data: { leftAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const active = await agent(cookiePlayer).get(`/api/characters/${CHAR_PLAYER}/sessions/active`);
    expect(active.status).toBe(200);
    expect(active.body?.id).toBe(sessionId);
    expect(active.body?.status).toBe("active");
  });
});

describe("end session", () => {
  it("OWNER force-ends; per-participant summaries and a campaign recap are persisted", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookiePlayer).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_PLAYER });

    await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/resolve-action/transactions`)
      .send({ operations: [{ type: "logRoll", kind: "attack", source: "Longsword", total: 17 }] });
    await agent(cookiePlayer)
      .post(`/api/characters/${CHAR_PLAYER}/resolve-action/transactions`)
      .send({ operations: [{ type: "logRoll", kind: "attack", source: "Dagger", total: 14 }] });

    const end = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(end.status).toBe(200);
    expect(end.body.session.status).toBe("ended");

    const recap = end.body.session.summary;
    expect(recap.participantCount).toBe(2);
    expect(recap.attackRolls).toBe(2);

    const participants = end.body.session.participants as Array<{
      characterId: string;
      summary: { attackRolls: number; characterName: string };
    }>;
    expect(participants).toHaveLength(2);
    for (const p of participants) {
      expect(p.summary).toBeDefined();
      expect(p.summary.attackRolls).toBe(1);
    }
  });

  it("403s end for a non-member", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOutsider).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(res.status).toBe(403);
  });

  it("409s ending an already-ended session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const res = await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});
    expect(res.status).toBe(409);
  });
});

describe("combat requires an active participant", () => {
  it("rejects combat/round from a participant who has left", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/leave`).send({ characterId: CHAR_OWNER });

    const res = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/round`)
      .send({ round: 2 });
    expect(res.status).toBe(409);
  });
});

describe("combat state is server-authoritative", () => {
  async function activeSession(): Promise<{ campaignId: string; sessionId: string }> {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    return { campaignId, sessionId: start.body.session.id as string };
  }

  const startCombatUrl = (sessionId: string) => `/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/start`;
  const endCombatUrl = (sessionId: string) => `/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/end`;
  const roundUrl = (sessionId: string) => `/api/characters/${CHAR_OWNER}/sessions/${sessionId}/combat/round`;
  const combatStateUrl = (characterId: string, sessionId: string) =>
    `/api/characters/${characterId}/sessions/${sessionId}/combat`;

  it("combat/start sets round:1, combatActive:true and persists it on Session", async () => {
    const { sessionId } = await activeSession();
    const res = await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ round: 1, combatActive: true });

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(1);
    expect(session.combatActive).toBe(true);
  });

  it("combat/start is idempotent — a re-press while combat is live does not reset a running round", async () => {
    const { sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    await agent(cookieOwner).post(roundUrl(sessionId)).send({});
    await agent(cookieOwner).post(roundUrl(sessionId)).send({});

    const restart = await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    expect(restart.body).toMatchObject({ round: 3, combatActive: true });

    const startedEvents = await prisma.characterEvent.count({
      where: { sessionId, type: "combatStarted" },
    });
    expect(startedEvents).toBe(1);
  });

  it("combat/end + restart by another participant clears a stranded participant's spell block", async () => {
    const { campaignId, sessionId } = await activeSession();
    await agent(cookiePlayer).post(`${startUrl(campaignId)}/${sessionId}/join`).send({ characterId: CHAR_PLAYER });
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});

    await prisma.sessionParticipant.update({
      where: { sessionId_characterId: { sessionId, characterId: CHAR_PLAYER } },
      data: { spellCastAsAction: "leveled" },
    });
    // PLAYER is a 2024 (default-edition) character: a leveled Action spell limits the bonus action to cantrips, it doesn't fully block it.
    const blocked = await agent(cookiePlayer).get(combatStateUrl(CHAR_PLAYER, sessionId));
    expect(blocked.body.spellEconomy.bonusActionLimitedToCantrips).toBe(true);

    await agent(cookieOwner).post(endCombatUrl(sessionId)).send({});
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});

    const after = await agent(cookiePlayer).get(combatStateUrl(CHAR_PLAYER, sessionId));
    expect(after.body.spellEconomy).toEqual({
      bonusActionBlockedByActionSpell: false,
      bonusActionLimitedToCantrips: false,
      actionLimitedToCantrips: false,
    });
  });

  it("combat/round ignores a client-supplied round and advances by exactly 1", async () => {
    const { sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});

    const res = await agent(cookieOwner).post(roundUrl(sessionId)).send({ round: 999 });
    expect(res.status).toBe(201);
    expect(res.body.round).toBe(2);

    const event = await prisma.characterEvent.findFirst({
      where: { sessionId, type: "combatRoundAdvanced" },
      orderBy: { createdAt: "desc" },
    });
    expect((event?.data as { round?: number } | null)?.round).toBe(2);
  });

  it("combat/round 409s when combat isn't active", async () => {
    const { sessionId } = await activeSession();
    const res = await agent(cookieOwner).post(roundUrl(sessionId)).send({});
    expect(res.status).toBe(409);
  });

  it("two concurrent combat/round calls both land — the increment is never lost to a race", async () => {
    const { sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});

    // The atomic `round = round + 1` UPDATE must apply both concurrent calls, going 1 → 3, not lose one to a read-then-write race and land on 2.
    await Promise.all([
      agent(cookieOwner).post(roundUrl(sessionId)).send({}),
      agent(cookieOwner).post(roundUrl(sessionId)).send({}),
    ]);

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.round).toBe(3);
  });

  it("combat/end clears combatActive and resets round to 0", async () => {
    const { sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    await agent(cookieOwner).post(roundUrl(sessionId)).send({});

    const res = await agent(cookieOwner).post(endCombatUrl(sessionId)).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ round: 0, combatActive: false });
  });

  it("GET .../combat returns the cheap poll shape for a participant", async () => {
    const { sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    await agent(cookieOwner).post(roundUrl(sessionId)).send({});

    const res = await agent(cookieOwner).get(combatStateUrl(CHAR_OWNER, sessionId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ round: 2, combatActive: true });
    expect(typeof res.body.updatedAt).toBe("string");
  });

  it("GET .../combat 404s for a character that never joined the session", async () => {
    const { sessionId } = await activeSession();
    const res = await agent(cookiePlayer).get(combatStateUrl(CHAR_PLAYER, sessionId));
    expect(res.status).toBe(404);
  });

  it("ending the session clears combatActive and resets round (#1030 finding #5)", async () => {
    const { campaignId, sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    await agent(cookieOwner).post(roundUrl(sessionId)).send({});

    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.combatActive).toBe(false);
    expect(session.round).toBe(0);
  });

  it("GET .../combat 409s once the session has ended — it must not serve live state forever", async () => {
    const { campaignId, sessionId } = await activeSession();
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});

    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const res = await agent(cookieOwner).get(combatStateUrl(CHAR_OWNER, sessionId));
    expect(res.status).toBe(409);
  });

  it("GET .../combat 409s for a participant who has left a still-active session", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookiePlayer).post(startUrl(campaignId) + `/${sessionId}/join`).send({ characterId: CHAR_PLAYER });
    await agent(cookieOwner).post(startCombatUrl(sessionId)).send({});
    await agent(cookiePlayer)
      .post(`${startUrl(campaignId)}/${sessionId}/leave`)
      .send({ characterId: CHAR_PLAYER });

    const left = await agent(cookiePlayer).get(combatStateUrl(CHAR_PLAYER, sessionId));
    expect(left.status).toBe(409);
    const stillIn = await agent(cookieOwner).get(combatStateUrl(CHAR_OWNER, sessionId));
    expect(stillIn.status).toBe(200);
  });
});

// The logRoll op (#1861) must persist the byte-for-byte same event shape (category "roll", same type + `data`) as the retired POST .../roll route did, which these tests pin.
describe("roll kinds log under the `roll` category", () => {
  async function activeSession(): Promise<void> {
    const campaignId = await setupCampaign();
    await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
  }

  const resolveUrl = `/api/characters/${CHAR_OWNER}/resolve-action/transactions`;
  function logRoll(body: Record<string, unknown>) {
    return agent(cookieOwner).post(resolveUrl).send({ operations: [{ type: "logRoll", ...body }] });
  }

  it("logs a check roll as type checkRoll under the roll category, with data + null before/after", async () => {
    await activeSession();
    const res = await logRoll({
      kind: "check", source: "Athletics", total: 18,
      ability: "strength", skill: "athletics", dc: 15, rollMode: "advantage", faces: [17],
    });
    expect(res.status).toBe(200);

    const ev = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "checkRoll" },
    });
    expect(ev).not.toBeNull();
    expect(ev!.category).toBe("roll");
    expect(ev!.before).toBeNull();
    expect(ev!.after).toBeNull();
    expect(ev!.summary).toBe("Athletics: 18 vs DC 15");
    expect(ev!.data).toMatchObject({
      kind: "check", ability: "strength", skill: "athletics", dc: 15, rollMode: "advantage", faces: [17],
    });
  });

  it("logs save + initiative rolls under the roll category", async () => {
    await activeSession();
    await logRoll({ kind: "save", source: "Dexterity save", total: 12, ability: "dexterity", dc: 13 });
    await logRoll({ kind: "initiative", source: "Initiative", total: 19, rollMode: "normal" });

    const save = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "saveRoll" } });
    const init = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "initiativeRoll" } });
    expect(save!.category).toBe("roll");
    expect(init!.category).toBe("roll");
    expect(save!.summary).toBe("Dexterity save: 12 vs DC 13");
    expect(init!.summary).toBe("Initiative: 19");
  });

  it("re-homes attack/damage rolls under the roll category", async () => {
    await activeSession();
    await logRoll({ kind: "attack", source: "Longsword", total: 17 });
    await logRoll({ kind: "damage", source: "Longsword", total: 9, damageType: "slashing" });

    const attack = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "attackRoll" } });
    const dmg = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "damageRoll" } });
    expect(attack!.category).toBe("roll");
    expect(dmg!.category).toBe("roll");
    expect(dmg!.summary).toBe("Longsword: 9 slashing");
  });

  it("persists verdict/crit flags/modeSources/attackComponents and shares a swingId with its damage event", async () => {
    await activeSession();
    const modeSources = [{ mode: "disadvantage", kind: "attack", source: "Poisoned" }];
    const attackComponents = { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0 };
    const damageComponents = { abilityMod: 3, meleeDamageBonus: 0 };

    await logRoll({
      kind: "attack", source: "Longsword", total: 8, swingId: "swing-a",
      verdict: "hit", nat20: false, nat1: false, crit: false,
      modeSources, attackComponents,
    });
    await logRoll({
      kind: "damage", source: "Longsword", total: 6, damageType: "slashing",
      swingId: "swing-a", damageComponents,
    });

    const attack = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "attackRoll" } });
    const dmg = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "damageRoll" } });
    expect(attack!.data).toMatchObject({
      swingId: "swing-a", verdict: "hit", nat20: false, nat1: false, crit: false,
      modeSources, attackComponents,
    });
    expect(dmg!.data).toMatchObject({ swingId: "swing-a", damageComponents });
    // swingId is the attack/damage correlation; each request's own batchId differs.
    expect((attack!.data as { swingId: string }).swingId).toBe((dmg!.data as { swingId: string }).swingId);
    expect(attack!.batchId).not.toBe(dmg!.batchId);
  });

  it("gives two unrelated swings distinct swingIds", async () => {
    await activeSession();
    await logRoll({ kind: "attack", source: "Longsword", total: 8, swingId: "swing-a" });
    await logRoll({ kind: "attack", source: "Dagger", total: 12, swingId: "swing-b" });

    const events = await prisma.characterEvent.findMany({ where: { characterId: CHAR_OWNER, type: "attackRoll" }, orderBy: { createdAt: "asc" } });
    expect(events).toHaveLength(2);
    const ids = events.map((e) => (e.data as { swingId: string }).swingId);
    expect(ids).toEqual(["swing-a", "swing-b"]);
  });

  it("never persists target/outcome, even if a caller sends them (#1235 self-or-announce — no enemy/target model)", async () => {
    await activeSession();
    await logRoll({
      kind: "attack", source: "Longsword", total: 8,
      target: { name: "Goblin" }, outcome: "dropped",
    });
    const attack = await prisma.characterEvent.findFirst({ where: { characterId: CHAR_OWNER, type: "attackRoll" } });
    expect(attack!.data).not.toHaveProperty("target");
    expect(attack!.data).not.toHaveProperty("outcome");
  });

  it("persists droppedFaces on an advantage roll; a normal roll's event has no droppedFaces key", async () => {
    await activeSession();
    await logRoll({
      kind: "attack", source: "Longsword", total: 20, faces: [15], droppedFaces: [5], rollMode: "advantage",
    });
    await logRoll({ kind: "attack", source: "Dagger", total: 12, faces: [7] });

    const events = await prisma.characterEvent.findMany({
      where: { characterId: CHAR_OWNER, type: "attackRoll" },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0].data).toMatchObject({ faces: [15], droppedFaces: [5] });
    // writeStandaloneRollEvent persists unset optional fields as JSON null, never as an omitted key.
    expect((events[1].data as { droppedFaces?: unknown }).droppedFaces).toBeNull();
  });

  it("rejects an invalid kind, rollMode, or dc with 400", async () => {
    await activeSession();
    const badKind = await logRoll({ kind: "perception", source: "x", total: 1 });
    expect(badKind.status).toBe(400);
    const badMode = await logRoll({ kind: "check", source: "x", total: 1, rollMode: "super" });
    expect(badMode.status).toBe(400);
    const badDc = await logRoll({ kind: "save", source: "x", total: 1, dc: "high" });
    expect(badDc.status).toBe(400);
  });

  it("makes a standalone roll batch trivially undoable — reverting it succeeds (#1861)", async () => {
    await activeSession();
    await logRoll({ kind: "check", source: "Athletics", total: 18 });
    const ev = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "checkRoll" }, select: { batchId: true },
    });
    const res = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/events/${ev!.batchId}/revert`).send({});
    expect(res.status).toBe(200);
  });
});

describe("GET /api/characters/:id/sessions/active", () => {
  it("returns 200 null when the character is in no campaign", async () => {
    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns 200 null when the campaign has no active session", async () => {
    await setupCampaign();
    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns the active session when one exists", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookieOwner).get(`/api/characters/${CHAR_OWNER}/sessions/active`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
  });

  it("404s for an unknown character", async () => {
    const res = await agent(cookieOwner).get(
      "/api/characters/00000000-0000-0000-0000-000000000000/sessions/active",
    );
    expect(res.status).toBe(404);
  });
});

describe("campaign session history + detail", () => {
  it("lists the campaign's sessions and returns detail with participants + events", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER, title: "S1" });
    const sessionId = start.body.session.id as string;

    const list = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/sessions`);
    expect(list.status).toBe(200);
    expect(list.body.some((s: { id: string }) => s.id === sessionId)).toBe(true);

    const detail = await agent(cookiePlayer).get(`/api/campaigns/${campaignId}/sessions/${sessionId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(sessionId);
    expect(Array.isArray(detail.body.participants)).toBe(true);
    expect(Array.isArray(detail.body.events)).toBe(true);
    expect(detail.body.events.some((e: { type: string }) => e.type === "sessionStarted")).toBe(true);
  });

  it("404s detail for a session in another campaign", async () => {
    const campaignId = await setupCampaign();
    const res = await agent(cookieOwner).get(
      `/api/campaigns/${campaignId}/sessions/00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(404);
  });
});

describe("sessionId threading", () => {
  it("tags an HP event with the campaign's active session for a participant", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const hp = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hp.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "damage" },
    });
    expect(event?.sessionId).toBe(sessionId);
  });

  it("leaves sessionId null when the character is in no campaign", async () => {
    const hp = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/hp`)
      .send({ operations: [{ type: "damage", amount: 5 }] });
    expect(hp.status).toBe(200);

    const event = await prisma.characterEvent.findFirst({
      where: { characterId: CHAR_OWNER, type: "damage" },
    });
    expect(event?.sessionId).toBeNull();
  });
});

describe("retroactive XP to a past session", () => {
  it("tags the award to the explicit session and recomputes its participant summary + recap", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;
    await agent(cookieOwner).post(`${startUrl(campaignId)}/${sessionId}/end`).send({});

    const award = await agent(cookieOwner)
      .post(`/api/characters/${CHAR_OWNER}/experience`)
      .send({ operations: [{ type: "award", amount: 750 }], sessionId });
    expect(award.status).toBe(200);
    expect(award.body.experiencePoints).toBe(BASE_CHAR.experiencePoints + 750);

    const detail = await agent(cookieOwner).get(`/api/campaigns/${campaignId}/sessions/${sessionId}`);
    expect(detail.body.summary.xpGained).toBe(750);
    const participant = detail.body.participants.find(
      (p: { characterId: string }) => p.characterId === CHAR_OWNER,
    );
    expect(participant.summary.xpGained).toBe(750);
  });

  it("400s when the sessionId has no participant for the character", async () => {
    const campaignId = await setupCampaign();
    const start = await agent(cookieOwner).post(startUrl(campaignId)).send({ characterId: CHAR_OWNER });
    const sessionId = start.body.session.id as string;

    const res = await agent(cookiePlayer)
      .post(`/api/characters/${CHAR_PLAYER}/experience`)
      .send({ operations: [{ type: "award", amount: 100 }], sessionId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a participant/i);
  });
});
