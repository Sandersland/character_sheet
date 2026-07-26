// Generalizes the single hand-picked case in character/__tests__/authorization.test.ts
// ("auth gate (requireAuth)") into full manifest coverage: every routeManifest
// entry gets exercised, so a future entry is covered automatically without
// editing this file.
import { describe, expect, it } from "vitest";
import supertest from "supertest";
import type { Router } from "express";

import { createApp } from "@/app.js";
import { routeManifest } from "@/routes/manifest.js";
import { abilitiesRouter } from "@/routes/character/abilities.js";
import { actionsRouter } from "@/routes/character/actions.js";
import { activityRouter } from "@/routes/character/activity.js";
import { authRouter } from "@/routes/platform/auth.js";
import { advancementRouter } from "@/routes/character/advancement.js";
import { arcsRouter } from "@/routes/campaign/arcs.js";
import { campaignItemsRouter } from "@/routes/campaign/campaign-items.js";
import { campaignsRouter } from "@/routes/campaign/campaigns.js";
import { classRouter } from "@/routes/character/class.js";
import { charactersRouter } from "@/routes/character/characters.js";
import { conditionsRouter } from "@/routes/character/conditions.js";
import { entitiesRouter } from "@/routes/campaign/entities.js";
import { sessionsRouter } from "@/routes/session/sessions.js";
import { experienceRouter } from "@/routes/character/experience.js";
import { featsRouter } from "@/routes/catalog/feats.js";
import { healthRouter } from "@/routes/platform/health.js";
import { hitPointsRouter } from "@/routes/character/hitpoints.js";
import { inventoryRouter } from "@/routes/character/inventory.js";
import { itemsRouter } from "@/routes/catalog/items.js";
import { journalRouter } from "@/routes/session/journal.js";
import { levelUpRouter } from "@/routes/character/level-up.js";
import { shadowArtsRouter } from "@/routes/character/shadow-arts.js";
import { maneuversRouter } from "@/routes/character/maneuvers.js";
import { subclassChoicesRouter } from "@/routes/character/subclass-choices.js";
import { channelDivinityRouter } from "@/routes/character/channel-divinity.js";
import { referenceRouter } from "@/routes/catalog/reference.js";
import { resourcesRouter } from "@/routes/character/resources.js";
import { spellsRouter } from "@/routes/catalog/spells.js";
import { spellcastingRouter } from "@/routes/character/spellcasting.js";

const FAKE_ID = "manifest-auth-boundary-fixture-id";

interface Probe {
  method: "get" | "post";
  path: string;
}

// One concrete, really-routed request per manifest router — NOT a made-up
// path under the mount prefix. requireAuth is a blanket /api gate (mounted
// once, ahead of every authed router), so a nonexistent path would 401 too;
// hitting each router's own registered route is what proves THIS entry sits
// on the correct side of the gate, catching a scope flip on one specific
// entry rather than re-testing the gate's existence.
//
// Several routers expose no GET at all (mutation-only transactions
// endpoints); those are probed with POST instead — called out per entry
// below rather than silently substituted.
const AUTHED_PROBES = new Map<Router, Probe>([
  [charactersRouter, { method: "get", path: "/api/characters" }],
  [referenceRouter, { method: "get", path: "/api/reference" }],
  [itemsRouter, { method: "get", path: "/api/items" }],
  [spellsRouter, { method: "get", path: "/api/spells" }],
  [featsRouter, { method: "get", path: "/api/feats" }],
  // No GET on hitPointsRouter — only POST "/".
  [hitPointsRouter, { method: "post", path: `/api/characters/${FAKE_ID}/hp` }],
  // No GET on inventoryRouter — only POST /transactions.
  [inventoryRouter, { method: "post", path: `/api/characters/${FAKE_ID}/inventory/transactions` }],
  // No GET on experienceRouter — only POST "/".
  [experienceRouter, { method: "post", path: `/api/characters/${FAKE_ID}/experience` }],
  // No GET on spellcastingRouter — only POST /transactions.
  [spellcastingRouter, { method: "post", path: `/api/characters/${FAKE_ID}/spellcasting/transactions` }],
  // No GET on resourcesRouter — only POST /transactions.
  [resourcesRouter, { method: "post", path: `/api/characters/${FAKE_ID}/resources/transactions` }],
  // No GET on conditionsRouter — only POST /transactions.
  [conditionsRouter, { method: "post", path: `/api/characters/${FAKE_ID}/conditions/transactions` }],
  // No GET on classRouter — only POST /transactions.
  [classRouter, { method: "post", path: `/api/characters/${FAKE_ID}/class/transactions` }],
  [channelDivinityRouter, { method: "get", path: `/api/characters/${FAKE_ID}/channel-divinity` }],
  // No GET on advancementRouter — only POST /transactions.
  [advancementRouter, { method: "post", path: `/api/characters/${FAKE_ID}/advancement/transactions` }],
  [levelUpRouter, { method: "get", path: `/api/characters/${FAKE_ID}/level-up/plan` }],
  // No GET on actionsRouter by design — see actions.ts's file banner.
  [actionsRouter, { method: "post", path: `/api/characters/${FAKE_ID}/actions/transactions` }],
  // No GET on abilitiesRouter — only POST /:abilityKey/transactions.
  [abilitiesRouter, { method: "post", path: `/api/characters/${FAKE_ID}/abilities/sneak-attack/transactions` }],
  [activityRouter, { method: "get", path: `/api/characters/${FAKE_ID}/activity` }],
  [maneuversRouter, { method: "get", path: "/api/maneuvers" }],
  [shadowArtsRouter, { method: "get", path: "/api/shadow-arts" }],
  [subclassChoicesRouter, { method: "get", path: "/api/subclass-choices/huntersPrey" }],
  [sessionsRouter, { method: "get", path: `/api/characters/${FAKE_ID}/sessions` }],
  // No GET on journalRouter — probed with its POST (create-entry) route.
  [journalRouter, { method: "post", path: `/api/characters/${FAKE_ID}/journal` }],
  [campaignsRouter, { method: "get", path: "/api/campaigns" }],
  [entitiesRouter, { method: "get", path: `/api/campaigns/${FAKE_ID}/entities` }],
  [campaignItemsRouter, { method: "get", path: `/api/campaigns/${FAKE_ID}/items` }],
  [arcsRouter, { method: "get", path: `/api/campaigns/${FAKE_ID}/arcs` }],
]);

const PUBLIC_PROBES = new Map<Router, Probe>([
  [healthRouter, { method: "get", path: "/api/health" }],
  // NOT /api/auth/me: that route deliberately 401s itself when unauthenticated
  // (it IS the session-check endpoint), so it would false-positive here.
  [authRouter, { method: "get", path: "/api/auth/providers" }],
]);

function probesFor(scope: "public" | "authed") {
  const table = scope === "public" ? PUBLIC_PROBES : AUTHED_PROBES;
  return routeManifest
    .filter((entry) => entry.scope === scope)
    .map((entry) => ({ mount: entry.mount, probe: table.get(entry.router) }));
}

describe("route manifest auth boundary", () => {
  const app = createApp();

  // Visible-by-construction, not an implicit skip: any manifest entry missing
  // from its probe table fails this assertion by name instead of vanishing
  // from the it.each below.
  it("has a probe for every authed manifest entry", () => {
    const unprobed = probesFor("authed").filter((e) => !e.probe).map((e) => e.mount);
    expect(unprobed).toEqual([]);
  });

  it("has a probe for every public manifest entry", () => {
    const unprobed = probesFor("public").filter((e) => !e.probe).map((e) => e.mount);
    expect(unprobed).toEqual([]);
  });

  it.each(
    probesFor("authed")
      .map((e) => e.probe)
      .filter((probe): probe is Probe => Boolean(probe)),
  )("401s an unauthenticated $method to $path", async (probe) => {
    const res = await supertest(app)[probe.method](probe.path);
    expect(res.status).toBe(401);
  });

  it.each(
    probesFor("public")
      .map((e) => e.probe)
      .filter((probe): probe is Probe => Boolean(probe)),
  )("does not 401 an unauthenticated $method to $path", async (probe) => {
    const res = await supertest(app)[probe.method](probe.path);
    expect(res.status).not.toBe(401);
  });
});
