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
//   npm run seed:verify                                    # default localhost
//   BACKEND_URL=http://localhost:4010 \
//   FRONTEND_URL=http://localhost:5183 npm run seed:verify # a worktree slot
//
// On success it prints the `cs_session` cookie and the frontend URL, ready to
// inject into Playwright before navigating.

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

const SESSION_COOKIE = "cs_session";
const CHARACTER_NAME = "Verify Dummy";

function die(message: string): never {
  console.error(`\n✗ seed-verify failed: ${message}\n`);
  process.exit(1);
}

// Pull the cs_session token out of a Set-Cookie header.
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
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...rest,
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

// Print the cs_session cookie + URLs, ready to inject into Playwright.
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

async function main() {
  console.log(`→ seeding verification data against ${BACKEND_URL}`);

  // 1. Mint a session via the guarded dev-login endpoint.
  const login = await api<{ token: string; user: { id: string } }>("/api/auth/dev-login", {
    method: "POST",
    body: "{}",
  });
  if (login.status === 404) {
    die(
      "POST /api/auth/dev-login returned 404 — ALLOW_DEV_LOGIN is off on this stack. " +
        "Set ALLOW_DEV_LOGIN=true (the dev compose does this by default) and retry.",
    );
  }
  if (login.status !== 200) die(`dev-login returned ${login.status}: ${JSON.stringify(login.body)}`);
  const token = sessionTokenFrom(login.setCookie) ?? login.body?.token;
  if (!token) die("dev-login succeeded but no cs_session token was returned");
  const cookie = `${SESSION_COOKIE}=${token}`;

  // Idempotent: if a previous run already left a "Verify Dummy", reuse it
  // instead of piling up duplicates every time verify-frontend runs.
  const existing = await api<{ id: string; name: string }[]>("/api/characters", { cookie });
  if (existing.status === 200 && Array.isArray(existing.body)) {
    const found = existing.body.find((c) => c.name === CHARACTER_NAME);
    if (found) {
      console.log(`✓ reusing existing character "${found.name}" ${found.id}`);
      report(cookie, token, found.id);
      return;
    }
  }

  // 2. Read valid creation options from the catalog.
  const ref = await api<{
    races: { name: string }[];
    classes: { name: string; subclassLevel: number | null; subclasses: { id: string }[] }[];
    backgrounds: { name: string }[];
    alignments: string[];
  }>("/api/reference", { cookie });
  if (ref.status !== 200) die(`GET /api/reference returned ${ref.status}: ${JSON.stringify(ref.body)}`);
  const { races, classes, backgrounds, alignments } = ref.body;
  if (!races?.length || !classes?.length || !backgrounds?.length) {
    die("catalog is empty — run the DB seed first (the dev stack does this on boot)");
  }

  // Prefer a class that does NOT pick its subclass at level 1 (e.g. Fighter),
  // so we don't need to supply a subclassId. Fall back to the first class +
  // its first subclass id if every class grants a subclass at creation.
  const noSubclass = classes.find((c) => c.subclassLevel == null || c.subclassLevel > 1);
  const chosenClass = noSubclass ?? classes[0];
  const needsSubclass = !noSubclass;
  const classChoice = needsSubclass
    ? { name: chosenClass.name, subclassId: chosenClass.subclasses[0]?.id }
    : { name: chosenClass.name };
  if (needsSubclass && !classChoice.subclassId) {
    die(`class "${chosenClass.name}" needs a subclass at L1 but the catalog has none`);
  }

  // 3. Create the character through the real endpoint.
  const create = await api<{ id: string; name: string }>("/api/characters", {
    method: "POST",
    cookie,
    body: JSON.stringify({
      name: CHARACTER_NAME,
      alignment: alignments[0],
      race: races[0].name,
      background: backgrounds[0].name,
      classes: [classChoice],
      abilityScores: { strength: 15, dexterity: 14, constitution: 13, intelligence: 12, wisdom: 10, charisma: 8 },
      startingEquipment: { mode: "gold", gold: 75 },
    }),
  });
  if (create.status !== 201 && create.status !== 200) {
    die(`POST /api/characters returned ${create.status}: ${JSON.stringify(create.body)}`);
  }
  const charId = create.body.id;
  console.log(`✓ created character "${create.body.name}" (${chosenClass.name}) ${charId}`);

  // 4. Add representative inventory: an equippable weapon + armor, plus two
  //    sellable trinkets we then sell together (one transaction → one batchId →
  //    a "bulk sale" entry in the activity log).
  const items = await api<{ id: string; name: string; weapon?: unknown; armor?: unknown }[]>("/api/items", {
    cookie,
  });
  if (items.status === 200 && Array.isArray(items.body) && items.body.length) {
    const weapon = items.body.find((i) => i.weapon);
    const armor = items.body.find((i) => i.armor);
    const trinkets = items.body.filter((i) => !i.weapon && !i.armor).slice(0, 2);

    const acquireOps = [
      weapon && { type: "acquire", itemId: weapon.id, quantity: 1, equipped: true },
      armor && { type: "acquire", itemId: armor.id, quantity: 1, equipped: true },
      ...trinkets.map((t) => ({ type: "acquire", itemId: t.id, quantity: 3 })),
    ].filter(Boolean);

    if (acquireOps.length) {
      const acq = await api<{ inventory: { id: string; itemId?: string }[] }>(
        `/api/characters/${charId}/inventory/transactions`,
        { method: "POST", cookie, body: JSON.stringify({ operations: acquireOps }) },
      );
      if (acq.status !== 200) {
        console.warn(`  ⚠ inventory acquire returned ${acq.status} — skipping enrichment`);
      } else if (trinkets.length) {
        // Find the freshly-acquired trinket rows (matched by catalog itemId) and
        // sell them in one transaction → one batchId → a "bulk sale" entry.
        const inv = acq.body.inventory ?? [];
        const trinketIds = new Set(trinkets.map((t) => t.id));
        const sellRows = inv.filter((r) => r.itemId != null && trinketIds.has(r.itemId));
        const sellOps = sellRows.map((r) => ({
          type: "sell",
          inventoryItemId: r.id,
          quantity: 1,
          currencyDelta: { pp: 0, gp: 1, sp: 0, cp: 0 },
        }));
        if (sellOps.length >= 2) {
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
      }
      console.log(`✓ added inventory (weapon + armor equipped, trinkets)`);
    }
  } else {
    console.warn("  ⚠ /api/items empty or unavailable — character has gold but no items");
  }

  // 5. Report what to inject into Playwright.
  report(cookie, token, charId);
}

main().catch((error) => die(error instanceof Error ? error.message : String(error)));
