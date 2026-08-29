// seed-verify — provision a signed-in dev user + a representative character so
// UI verification (Playwright, manual review, worktree stacks) has something to
// look at behind auth.
//
// It talks ONLY to a RUNNING backend over HTTP, through the real validated
// endpoints (dev-login → /reference → /characters → /items → inventory
// transactions), so the seeded data exercises the same serialization the app
// does. Nothing here writes to the DB directly.
//
// Requires the stack to have ALLOW_DEV_LOGIN=true (the dev docker-compose sets
// this by default; it is hard-disabled in production regardless of the env).
//
// Usage:
//   npm run seed:verify                                    # default localhost, EDITION_2024
//   SEED_VERIFY_EDITION=EDITION_2014 npm run seed:verify   # provision a 2014 character instead
//   BACKEND_URL=http://localhost:4010 \
//   FRONTEND_URL=http://localhost:5183 npm run seed:verify # a worktree slot
//
// On success it prints the `cs_session` cookie and the frontend URL, ready to
// inject into Playwright before navigating.

import { DEFAULT_RULES_EDITION, isRulesEdition, RULES_EDITION_LABELS } from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

import {
  assertCatalogPopulated,
  pickClassChoice,
  pickSpecies,
  planInventory,
  type CatalogRow,
  type RefClass,
  type RefSpecies,
} from "./seed-verify-helpers.js";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

const SESSION_COOKIE = "cs_session";

// Edition is a REQUESTED input here (an env var), same trust level as a query
// param or a body field — isRulesEdition is the one guard for that (#1506,
// edition.ts), never a re-typed literal union of its own.
const rawEdition = process.env.SEED_VERIFY_EDITION;
if (rawEdition !== undefined && !isRulesEdition(rawEdition)) {
  console.error(
    `\n✗ seed-verify failed: SEED_VERIFY_EDITION must be EDITION_2014 or EDITION_2024, got ${JSON.stringify(rawEdition)}\n`,
  );
  process.exit(1);
}
const EDITION: RulesEdition = rawEdition ?? DEFAULT_RULES_EDITION;

// Edition-suffixed (#1506) so findExisting can't hand back the other edition's character — it
// returns before /api/reference is loaded, so a shared name would let a 2014 run reuse a 2024 row
// and report success.
const CHARACTER_NAME = `Verify Dummy (${RULES_EDITION_LABELS[EDITION]})`;

function die(message: string): never {
  console.error(`\n✗ seed-verify failed: ${message}\n`);
  process.exit(1);
}

function sessionTokenFrom(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

async function api<T>(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; body: T; setCookie: string | null }> {
  const { cookie, headers, ...rest } = init;
  // Fail fast instead of hanging the verification gate if the backend is down
  // or still booting (race with `docker compose up`).
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...rest,
    signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body: body as T, setCookie: res.headers.get("set-cookie") };
}

function report(cookie: string, token: string, charId: string) {
  console.log("\n─────────────────────────────────────────────");
  console.log("✓ verification data ready. Sign in by injecting this cookie:\n");
  console.log(`  ${cookie}`);
  console.log(`\n  Frontend: ${FRONTEND_URL}`);
  console.log(`  Character: ${FRONTEND_URL}/characters/${charId}`);
  console.log("\nPlaywright: browser_navigate to the frontend, then either set the");
  console.log(`  cookie (name "${SESSION_COOKIE}", value "${token}") for the frontend`);
  console.log("  origin, or run an in-page fetch POST /api/auth/dev-login and reload.");
  console.log("─────────────────────────────────────────────\n");
}

type Reference = {
  // `species` is the mechanical anchor (POST /api/characters' speciesId), same as every other
  // creation caller.
  species: RefSpecies[];
  classes: RefClass[];
  backgrounds: { name: string }[];
  alignments: string[];
  // Edition-FORKED lists (#1506) — see assertCatalogPopulated's own comment
  // (seed-verify-helpers.ts) for why these two, specifically, catch a
  // half-shipped edition that species/classes/backgrounds alone would miss.
  conditions: unknown[];
  universalActions: unknown[];
};

function tokenOf(setCookie: string | null, body: { token?: string } | undefined): string | null {
  return sessionTokenFrom(setCookie) ?? body?.token ?? null;
}

async function devLogin(): Promise<{ cookie: string; token: string }> {
  const login = await api<{ token: string; user: { id: string } }>("/api/auth/dev-login", {
    method: "POST",
    body: "{}",
  });
  if (login.status === 404) {
    die(
      "POST /api/auth/dev-login returned 404 — ALLOW_DEV_LOGIN is off on this stack. " +
        "Set ALLOW_DEV_LOGIN=true in backend/.env (see .env.example) and restart the backend.",
    );
  }
  if (login.status !== 200) die(`dev-login returned ${login.status}: ${JSON.stringify(login.body)}`);
  const token = tokenOf(login.setCookie, login.body);
  if (!token) die("dev-login succeeded but no cs_session token was returned");
  return { cookie: `${SESSION_COOKIE}=${token}`, token };
}

// Idempotent: if a previous run already left a "Verify Dummy", reuse it instead
// of piling up duplicates every time verify-frontend runs.
async function findExisting(cookie: string): Promise<{ id: string; name: string } | null> {
  const existing = await api<{ id: string; name: string }[]>("/api/characters", { cookie });
  if (existing.status === 200 && Array.isArray(existing.body)) {
    return existing.body.find((c) => c.name === CHARACTER_NAME) ?? null;
  }
  return null;
}

async function loadReference(cookie: string): Promise<Reference> {
  const ref = await api<Reference>(`/api/reference?edition=${EDITION}`, { cookie });
  if (ref.status !== 200) die(`GET /api/reference returned ${ref.status}: ${JSON.stringify(ref.body)}`);
  const problem = assertCatalogPopulated(ref.body);
  if (problem) die(problem);
  return ref.body;
}

async function createCharacter(
  cookie: string,
  ref: Reference,
  classChoice: { name: string; subclassId?: string },
): Promise<string> {
  // pickSpecies (like pickClassChoice) prefers a species that needs no extra
  // creation fields — see its own comment for why a blind `species[0]` isn't
  // safe (a variant-bearing or choice-bearing first row 400s, #1506).
  const speciesChoice = pickSpecies(ref.species);
  const create = await api<{ id: string; name: string }>("/api/characters", {
    method: "POST",
    cookie,
    body: JSON.stringify({
      name: CHARACTER_NAME,
      alignment: ref.alignments[0],
      ...speciesChoice,
      background: ref.backgrounds[0].name,
      classes: [classChoice],
      abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
      // No `startingEquipment` (#1506):
      // `mode: "gold"` is a 2014-only path now — PHB'24 has no roll-for-gold
      // rule at all (lib/character/create/equipment.ts's resolveStartingGold), so a
      // hardcoded gold-mode body 400s for EVERY EDITION_2024 class, not just
      // some. `mode: "package"` needs a per-class optionIndex/openPicks plan
      // this script has no reason to carry — omitting the field entirely
      // (it's optional) leaves the character at 0 starting currency, and
      // seedInventory below adds real representative gear either way via the
      // same inventory transactions endpoint the app itself uses.
      //
      // Write-once (character-schemas.ts) — always sent explicitly rather
      // than relying on the server default so a 2014 run can never silently
      // provision a 2024 character.
      rulesEdition: EDITION,
    }),
  });
  if (create.status !== 201 && create.status !== 200) {
    die(`POST /api/characters returned ${create.status}: ${JSON.stringify(create.body)}`);
  }
  const charId = create.body.id;
  if (!charId) die(`POST /api/characters returned no id: ${JSON.stringify(create.body)}`);
  console.log(`✓ created character "${create.body.name}" (${classChoice.name}) ${charId}`);
  return charId;
}

async function sellTrinkets(
  cookie: string,
  charId: string,
  inventory: { id: string; itemId?: string }[],
  trinketIds: Set<string>,
) {
  const sellRows = inventory.filter((r) => r.itemId != null && trinketIds.has(r.itemId));
  const sellOps = sellRows.map((r) => ({
    type: "sell",
    inventoryItemId: r.id,
    quantity: 1,
    currencyDelta: { pp: 0, gp: 1, sp: 0, cp: 0 },
  }));
  if (sellOps.length < 2) return;
  const sale = await api(`/api/characters/${charId}/inventory/transactions`, {
    method: "POST",
    cookie,
    body: JSON.stringify({ operations: sellOps }),
  });
  if (sale.status === 200) {
    console.log(`✓ added a ${sellOps.length}-item bulk sale to the activity log`);
  } else {
    console.warn(`  ⚠ bulk sale returned ${sale.status} — skipped`);
  }
}

async function fetchItems(cookie: string): Promise<CatalogRow[] | null> {
  const items = await api<CatalogRow[]>("/api/items", { cookie });
  if (items.status !== 200 || !Array.isArray(items.body) || !items.body.length) {
    console.warn("  ⚠ /api/items empty or unavailable — character has gold but no items");
    return null;
  }
  return items.body;
}

async function acquireAndSell(
  cookie: string,
  charId: string,
  acquireOps: unknown[],
  trinketIds: Set<string>,
) {
  const acq = await api<{ inventory: { id: string; itemId?: string }[] }>(
    `/api/characters/${charId}/inventory/transactions`,
    { method: "POST", cookie, body: JSON.stringify({ operations: acquireOps }) },
  );
  if (acq.status !== 200) {
    console.warn(`  ⚠ inventory acquire returned ${acq.status} — skipping enrichment`);
    return;
  }
  if (trinketIds.size) await sellTrinkets(cookie, charId, acq.body.inventory ?? [], trinketIds);
  console.log(`✓ added inventory (weapon + armor equipped, trinkets)`);
}

async function seedInventory(cookie: string, charId: string) {
  const items = await fetchItems(cookie);
  if (!items) return;
  const { acquireOps, trinketIds } = planInventory(items);
  if (acquireOps.length) await acquireAndSell(cookie, charId, acquireOps, trinketIds);
}

async function main() {
  console.log(`→ seeding verification data against ${BACKEND_URL}`);

  const { cookie, token } = await devLogin();

  const found = await findExisting(cookie);
  if (found) {
    console.log(`✓ reusing existing character "${found.name}" ${found.id}`);
    report(cookie, token, found.id);
    return;
  }

  // ref.classes is already scoped to EDITION (loadReference's ?edition=), so
  // pickClassChoice's subclasses[0].id below can only ever resolve a
  // same-edition subclassId — a 2014 character can never be created with a
  // 2024 subclassId (#1506; crossEditionRejection would 400 it, in resolveSubclass).
  const ref = await loadReference(cookie);
  const { classChoice } = pickClassChoice(ref.classes);
  const charId = await createCharacter(cookie, ref, classChoice);
  await seedInventory(cookie, charId);
  report(cookie, token, charId);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
