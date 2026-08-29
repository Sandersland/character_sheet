// A manifest entry whose router has no ROUTER_ENTRIES row fails the completeness check by name — adding a mount to routeManifest still means adding a row to ROUTER_ENTRIES here.
import { describe, expect, it } from "vitest";
import supertest from "supertest";
import type { Router } from "express";

import { app } from "@/test-support/app-server.js";
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
import { disciplinesRouter } from "@/routes/character/disciplines.js";
import { editionsRouter } from "@/routes/catalog/editions.js";
import { entitiesRouter } from "@/routes/campaign/entities.js";
import { sessionsRouter } from "@/routes/session/sessions.js";
import { experienceRouter } from "@/routes/character/experience.js";
import { featsRouter } from "@/routes/catalog/feats.js";
import { forkRouter } from "@/routes/catalog/fork.js";
import { grantsRouter } from "@/routes/catalog/grants.js";
import { healthRouter } from "@/routes/platform/health.js";
import { hitPointsRouter } from "@/routes/character/hitpoints.js";
import { inboxRouter } from "@/routes/campaign/inbox.js";
import { inventoryRouter } from "@/routes/character/inventory.js";
import { itemsRouter } from "@/routes/catalog/items.js";
import { journalRouter } from "@/routes/session/journal.js";
import { levelUpRouter } from "@/routes/character/level-up.js";
import { portraitRouter } from "@/routes/character/portrait.js";
import { shadowArtsRouter } from "@/routes/character/shadow-arts.js";
import { maneuversRouter } from "@/routes/character/maneuvers.js";
import { preferencesRouter } from "@/routes/platform/preferences.js";
import { subclassChoicesRouter } from "@/routes/character/subclass-choices.js";
import { channelDivinityRouter } from "@/routes/character/channel-divinity.js";
import { referenceRouter } from "@/routes/catalog/reference.js";
import { resolveActionRouter } from "@/routes/character/resolve-action.js";
import { resourcesRouter } from "@/routes/character/resources.js";
import { customSpellsRouter } from "@/routes/catalog/custom-spells.js";
import { spellsRouter } from "@/routes/catalog/spells.js";
import { spellcastingRouter } from "@/routes/character/spellcasting.js";

const FAKE_ID = "manifest-auth-boundary-fixture-id";

interface Probe {
  method: "get" | "post" | "patch";
  path: string;
}

interface RouterEntry {
  name: string;
  router: Router;
  probe: Probe;
}

// Keyed by router IDENTITY (a Map below), not mount string or scope, so a scope typo on an already-known router still resolves a name instead of silently dropping from it.each.
// `probe` must be a route the router itself registers — requireAuth is a blanket /api gate, so a made-up path would 401 regardless of wiring.
const ROUTER_ENTRIES: RouterEntry[] = [
  { name: "healthRouter", router: healthRouter, probe: { method: "get", path: "/api/health" } },
  // NOT /api/auth/me: that route deliberately 401s itself when unauthenticated (it IS the session-check endpoint), so it would false-positive as public.
  { name: "authRouter", router: authRouter, probe: { method: "get", path: "/api/auth/providers" } },
  { name: "charactersRouter", router: charactersRouter, probe: { method: "get", path: "/api/characters" } },
  {
    name: "preferencesRouter",
    router: preferencesRouter,
    probe: { method: "patch", path: "/api/preferences" },
  },
  { name: "referenceRouter", router: referenceRouter, probe: { method: "get", path: "/api/reference" } },
  { name: "itemsRouter", router: itemsRouter, probe: { method: "get", path: "/api/items" } },
  { name: "spellsRouter", router: spellsRouter, probe: { method: "get", path: "/api/spells" } },
  {
    name: "customSpellsRouter",
    router: customSpellsRouter,
    probe: { method: "post", path: "/api/spells/custom" },
  },
  { name: "featsRouter", router: featsRouter, probe: { method: "get", path: "/api/feats" } },
  {
    name: "grantsRouter",
    router: grantsRouter,
    probe: { method: "post", path: `/api/catalog/entries/${FAKE_ID}/grants` },
  },
  {
    name: "forkRouter",
    router: forkRouter,
    probe: { method: "post", path: `/api/catalog/entries/${FAKE_ID}/fork` },
  },
  { name: "editionsRouter", router: editionsRouter, probe: { method: "get", path: "/api/editions" } },
  {
    name: "hitPointsRouter",
    router: hitPointsRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/hp` },
  },
  {
    name: "inventoryRouter",
    router: inventoryRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/inventory/transactions` },
  },
  {
    name: "experienceRouter",
    router: experienceRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/experience` },
  },
  {
    name: "spellcastingRouter",
    router: spellcastingRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/spellcasting/transactions` },
  },
  {
    name: "resourcesRouter",
    router: resourcesRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/resources/transactions` },
  },
  {
    name: "resolveActionRouter",
    router: resolveActionRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/resolve-action/transactions` },
  },
  {
    name: "conditionsRouter",
    router: conditionsRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/conditions/transactions` },
  },
  {
    name: "classRouter",
    router: classRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/class/transactions` },
  },
  {
    name: "channelDivinityRouter",
    router: channelDivinityRouter,
    probe: { method: "get", path: `/api/characters/${FAKE_ID}/channel-divinity` },
  },
  {
    name: "advancementRouter",
    router: advancementRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/advancement/transactions` },
  },
  { name: "levelUpRouter", router: levelUpRouter, probe: { method: "get", path: `/api/characters/${FAKE_ID}/level-up/plan` } },
  { name: "portraitRouter", router: portraitRouter, probe: { method: "get", path: `/api/characters/${FAKE_ID}/portrait` } },
  {
    name: "actionsRouter",
    router: actionsRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/actions/transactions` },
  },
  {
    name: "abilitiesRouter",
    router: abilitiesRouter,
    probe: { method: "post", path: `/api/characters/${FAKE_ID}/abilities/stunning-strike/transactions` },
  },
  { name: "activityRouter", router: activityRouter, probe: { method: "get", path: `/api/characters/${FAKE_ID}/activity` } },
  { name: "maneuversRouter", router: maneuversRouter, probe: { method: "get", path: "/api/maneuvers" } },
  { name: "shadowArtsRouter", router: shadowArtsRouter, probe: { method: "get", path: "/api/shadow-arts" } },
  { name: "disciplinesRouter", router: disciplinesRouter, probe: { method: "get", path: "/api/disciplines" } },
  {
    name: "subclassChoicesRouter",
    router: subclassChoicesRouter,
    probe: { method: "get", path: "/api/subclass-choices/huntersPrey" },
  },
  { name: "sessionsRouter", router: sessionsRouter, probe: { method: "get", path: `/api/characters/${FAKE_ID}/sessions` } },
  { name: "journalRouter", router: journalRouter, probe: { method: "post", path: `/api/characters/${FAKE_ID}/journal` } },
  { name: "campaignsRouter", router: campaignsRouter, probe: { method: "get", path: "/api/campaigns" } },
  { name: "entitiesRouter", router: entitiesRouter, probe: { method: "get", path: `/api/campaigns/${FAKE_ID}/entities` } },
  { name: "inboxRouter", router: inboxRouter, probe: { method: "get", path: "/api/inbox" } },
  {
    name: "campaignItemsRouter",
    router: campaignItemsRouter,
    probe: { method: "get", path: `/api/campaigns/${FAKE_ID}/items` },
  },
  { name: "arcsRouter", router: arcsRouter, probe: { method: "get", path: `/api/campaigns/${FAKE_ID}/arcs` } },
];

const ENTRY_BY_ROUTER = new Map(ROUTER_ENTRIES.map((e) => [e.router, e] as const));

function namedEntries(scope: "public" | "authed") {
  return routeManifest
    .filter((entry) => entry.scope === scope)
    .map((entry) => ({ mount: entry.mount, named: ENTRY_BY_ROUTER.get(entry.router) }));
}

describe("route manifest auth boundary", () => {

  it.each(["public", "authed"] as const)(
    "has a named ROUTER_ENTRIES row for every %s manifest entry",
    (scope) => {
      const unnamed = namedEntries(scope).filter((e) => !e.named).map((e) => e.mount);
      expect(unnamed).toEqual([]);
    },
  );

  it.each(
    namedEntries("authed")
      .map((e) => e.named)
      .filter((e): e is RouterEntry => Boolean(e))
      .map((e) => ({ name: e.name, method: e.probe.method, path: e.probe.path })),
  )("401s an unauthenticated $method to $path ($name)", async ({ method, path }) => {
    const res = await supertest(app)[method](path);
    expect(res.status).toBe(401);
  });

  // Asserts the concrete 200, not merely "not 401": a public router mounted ahead of requireAuth but still reading req.user 500s rather than 401s, which "not 401" would miss.
  it.each(
    namedEntries("public")
      .map((e) => e.named)
      .filter((e): e is RouterEntry => Boolean(e))
      .map((e) => ({ name: e.name, method: e.probe.method, path: e.probe.path })),
  )("200s an unauthenticated $method to $path ($name)", async ({ method, path }) => {
    const res = await supertest(app)[method](path);
    expect(res.status).toBe(200);
  });
});
