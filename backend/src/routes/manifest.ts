import type { Router } from "express";

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

/**
 * One entry per router `createApp` mounts: every `"public"` entry, then the
 * `requireAuth` gate — an unauthenticated request 401s there and never
 * reaches an authed router — then every `"authed"` entry. `scope` is
 * required so a new entry can't default to public silently. Array order is
 * registration order and load-bearing (Express matches in mount order over
 * non-disjoint paths) — preserve it, don't sort. `mount` is an array for a
 * router owning more than one path at one scope (none exist today);
 * character-scoped routers read `:id` via `Router({ mergeParams: true })`.
 */
export interface RouteMount {
  router: Router;
  mount: string | string[];
  scope: "public" | "authed";
}

export const routeManifest: RouteMount[] = [
  { router: healthRouter, mount: "/api", scope: "public" },
  { router: authRouter, mount: "/api", scope: "public" },

  { router: charactersRouter, mount: "/api", scope: "authed" },
  { router: preferencesRouter, mount: "/api", scope: "authed" },

  // Catalog / reference routers own top-level collection paths.
  { router: referenceRouter, mount: "/api", scope: "authed" },
  { router: itemsRouter, mount: "/api", scope: "authed" },
  { router: spellsRouter, mount: "/api", scope: "authed" },
  // Owns /spells/custom — mounted after spellsRouter (registration order is
  // load-bearing per this file's own docstring) so the fixed "custom" segment
  // never shadows spellsRouter's own paths, though today they're disjoint.
  { router: customSpellsRouter, mount: "/api", scope: "authed" },
  { router: featsRouter, mount: "/api", scope: "authed" },
  { router: grantsRouter, mount: "/api", scope: "authed" },
  { router: forkRouter, mount: "/api", scope: "authed" },
  // Edition-independent by construction (#1436): the only catalog route that
  // takes no `?edition=`, because it is what the client reads to CHOOSE one.
  { router: editionsRouter, mount: "/api", scope: "authed" },

  // Character-scoped routers own their sub-path under /characters/:id and read
  // :id via mergeParams (see each Router({ mergeParams: true })).
  { router: hitPointsRouter, mount: "/api/characters/:id/hp", scope: "authed" },
  { router: inventoryRouter, mount: "/api/characters/:id/inventory", scope: "authed" },
  { router: experienceRouter, mount: "/api/characters/:id/experience", scope: "authed" },
  { router: spellcastingRouter, mount: "/api/characters/:id/spellcasting", scope: "authed" },
  // Unified combat action resolution (#1829, epic #1827) — one undoable
  // resolveAction event per weapon swing / spell cast. Not yet called by the
  // frontend (adapter slices #1832/#1833 migrate useAttackRolls/useSpellPicker).
  { router: resolveActionRouter, mount: "/api/characters/:id/resolve-action", scope: "authed" },
  { router: resourcesRouter, mount: "/api/characters/:id/resources", scope: "authed" },
  { router: conditionsRouter, mount: "/api/characters/:id/conditions", scope: "authed" },
  { router: classRouter, mount: "/api/characters/:id/class", scope: "authed" },
  { router: channelDivinityRouter, mount: "/api/characters/:id/channel-divinity", scope: "authed" },
  { router: advancementRouter, mount: "/api/characters/:id/advancement", scope: "authed" },
  { router: levelUpRouter, mount: "/api/characters/:id/level-up", scope: "authed" },
  { router: portraitRouter, mount: "/api/characters/:id/portrait", scope: "authed" },
  { router: actionsRouter, mount: "/api/characters/:id/actions", scope: "authed" },
  // One endpoint for every automated class/subclass ability; the feature is
  // chosen by URL key out of ABILITY_REGISTRY rather than by its own mount (#1275).
  { router: abilitiesRouter, mount: "/api/characters/:id/abilities", scope: "authed" },
  // activity owns two sub-paths (/activity, /events/:batchId/revert), so it
  // mounts on the character root rather than a single leaf.
  { router: activityRouter, mount: "/api/characters/:id", scope: "authed" },

  // Catalog pickers for abilities whose transactions live on abilitiesRouter (#1275).
  { router: maneuversRouter, mount: "/api/maneuvers", scope: "authed" },
  { router: shadowArtsRouter, mount: "/api/shadow-arts", scope: "authed" },
  { router: disciplinesRouter, mount: "/api/disciplines", scope: "authed" },
  { router: subclassChoicesRouter, mount: "/api/subclass-choices", scope: "authed" },

  { router: sessionsRouter, mount: "/api", scope: "authed" },
  { router: journalRouter, mount: "/api", scope: "authed" },
  { router: campaignsRouter, mount: "/api", scope: "authed" },
  { router: entitiesRouter, mount: "/api", scope: "authed" },
  { router: inboxRouter, mount: "/api", scope: "authed" },
  { router: campaignItemsRouter, mount: "/api", scope: "authed" },
  { router: arcsRouter, mount: "/api", scope: "authed" },
];
