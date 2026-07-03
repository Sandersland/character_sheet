// Idempotent persona seeding for the e2e suite. Runs once before all specs:
// signs in via dev-login, then creates each roster persona if it's missing
// (matched by name). Personas are (re)built every suite start because the
// backend auth.test.ts wipes dev-user-local as cleanup — so we can't assume any
// survive between a vitest run and this suite.
//
// ── Roster (all idempotent: created only when absent, matched by name) ─────────
//   Smoke Fighter   — Fighter L1. Baseline sheet + HP/rest flows.
//   Wizard L5       — Wizard, 6500 XP (L5). Derived spell slots.
//   Battle Master   — Fighter, 6500 XP (L5) + Battle Master subclass + one
//                     effect maneuver (Evasive Footwork). Attached to its own
//                     solo campaign so maneuvers.spec can run an in-session
//                     superiority-die spend.
//   Session Fighter — Fighter L1, attached to its own solo campaign so
//                     session.spec can start/resume a live session in-spec.
//   Monk L6         — Monk, 14000 XP (L6), own campaign; unarmed.spec asserts
//                     the Ki-Empowered Strikes "Magical" badge in a live session.
//
// Personas that need a live session each get a DEDICATED campaign: a campaign
// allows only one active session at a time, so sharing one would make the
// session-using specs conflict when Playwright runs files in parallel.
//
// Per-spec state (fresh throwaway characters, learned spells, awarded XP) is
// created inside the specs via e2e/helpers/api.ts — never here — so every spec
// stays independently runnable and these shared personas are never mutated.

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 15,
  wisdom: 12,
  charisma: 8,
};

// L5 threshold from the XP curve (backend/src/lib/experience.ts). The curve is
// class-independent, so this is L5 for both the Wizard and the Battle Master.
const LEVEL_5_XP = 6500;
// L6 threshold — gates Monk Ki-Empowered Strikes (magical unarmed strikes).
const LEVEL_6_XP = 14000;

interface Persona {
  name: string;
  race: string;
  background: string;
  className: string;
  experiencePoints?: number;
  // Target class-entry level via HP level-ups (per-class level tracks applied
  // HP level-ups, not XP-derived level). Requires enough XP to unlock it.
  classLevel?: number;
  // Fighter martial archetype to set post-creation (chosen at L3, needs XP).
  subclassName?: string;
  // Battle Master maneuver to learn (by catalog name).
  maneuverName?: string;
  // A dedicated solo campaign to attach to (name); enables live sessions.
  campaignName?: string;
}

const ROSTER: Persona[] = [
  { name: "Smoke Fighter", race: "Human", background: "Soldier", className: "Fighter" },
  { name: "Wizard L5", race: "Human", background: "Sage", className: "Wizard", experiencePoints: LEVEL_5_XP },
  {
    name: "Battle Master",
    race: "Human",
    background: "Soldier",
    className: "Fighter",
    experiencePoints: LEVEL_5_XP,
    subclassName: "Battle Master",
    maneuverName: "Evasive Footwork",
    campaignName: "E2E Solo — Battle Master",
  },
  {
    name: "Session Fighter",
    race: "Human",
    background: "Soldier",
    className: "Fighter",
    campaignName: "E2E Solo — Session Fighter",
  },
  {
    name: "Monk L6",
    race: "Human",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    campaignName: "E2E Solo — Monk L6",
  },
];

// Node fetch doesn't persist cookies, so we thread the session cookie manually.
function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("dev-login did not return a session cookie");
  return setCookie.split(";")[0];
}

async function devLoginWithRetry(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${baseURL}/api/auth/dev-login`, { method: "POST" });
      if (response.ok) return sessionCookie(response);
      lastError = new Error(`dev-login returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Backend never became ready: ${String(lastError)}`);
}

async function api(cookie: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseURL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
  });
}

// Resolve a Fighter subclass id by name from the reference catalog.
async function subclassId(cookie: string, className: string, subclassName: string): Promise<string> {
  const response = await api(cookie, "/api/reference");
  if (!response.ok) throw new Error(`Failed to load reference: ${response.status}`);
  const { classes } = (await response.json()) as {
    classes: { name: string; subclasses: { id: string; name: string }[] }[];
  };
  const cls = classes.find((c) => c.name === className);
  const sub = cls?.subclasses.find((s) => s.name === subclassName);
  if (!sub) throw new Error(`Subclass not found: ${className} / ${subclassName}`);
  return sub.id;
}

// Resolve a maneuver id by name from the catalog.
async function maneuverId(cookie: string, name: string): Promise<string> {
  const response = await api(cookie, "/api/maneuvers");
  if (!response.ok) throw new Error(`Failed to load maneuvers: ${response.status}`);
  const maneuvers = (await response.json()) as { id: string; name: string }[];
  const match = maneuvers.find((m) => m.name === name);
  if (!match) throw new Error(`Maneuver not found: ${name}`);
  return match.id;
}

// Find (by name) or create a campaign the persona can start sessions in.
async function ensureCampaign(cookie: string, name: string): Promise<string> {
  const listResponse = await api(cookie, "/api/campaigns");
  if (!listResponse.ok) throw new Error(`Failed to list campaigns: ${listResponse.status}`);
  const existing = (await listResponse.json()) as { id: string; name: string }[];
  const found = existing.find((c) => c.name === name);
  if (found) return found.id;

  const createResponse = await api(cookie, "/api/campaigns", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!createResponse.ok) throw new Error(`Failed to create campaign ${name}: ${createResponse.status}`);
  const { id } = (await createResponse.json()) as { id: string };
  return id;
}

async function createPersona(cookie: string, persona: Persona): Promise<void> {
  const response = await api(cookie, "/api/characters", {
    method: "POST",
    body: JSON.stringify({
      name: persona.name,
      alignment: "True Neutral",
      race: persona.race,
      background: persona.background,
      classes: [{ name: persona.className }],
      abilityScores: ABILITY_SCORES,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create ${persona.name}: ${response.status} ${await response.text()}`);
  }
  const { id } = (await response.json()) as { id: string };

  // XP goes through the transactions endpoint (not the create body) so the level
  // — and thus spell slots / subclass eligibility — derive server-side exactly as
  // they would in the app.
  if (persona.experiencePoints) {
    const xpResponse = await api(cookie, `/api/characters/${id}/experience`, {
      method: "POST",
      body: JSON.stringify({ operations: [{ type: "set", value: persona.experiencePoints }] }),
    });
    if (!xpResponse.ok) throw new Error(`Failed to set XP for ${persona.name}: ${xpResponse.status}`);
  }

  // Class-entry level tracks applied HP level-ups, not XP-derived level. Drive
  // (classLevel - 1) average level-ups so level-gated features (Ki-Empowered
  // Strikes) derive correctly.
  if (persona.classLevel && persona.classLevel > 1) {
    const levelUps = Array.from({ length: persona.classLevel - 1 }, () => ({
      type: "levelUp",
      method: "average",
    }));
    const hpResponse = await api(cookie, `/api/characters/${id}/hp`, {
      method: "POST",
      body: JSON.stringify({ operations: levelUps }),
    });
    if (!hpResponse.ok) throw new Error(`Failed to level up ${persona.name}: ${hpResponse.status}`);
  }

  // Subclass is chosen post-creation via the class transactions endpoint (Fighter
  // grants it at L3, so the XP set above is a prerequisite).
  if (persona.subclassName) {
    const id_ = await subclassId(cookie, persona.className, persona.subclassName);
    const subResponse = await api(cookie, `/api/characters/${id}/class/transactions`, {
      method: "POST",
      body: JSON.stringify({ operations: [{ type: "setSubclass", subclassId: id_ }] }),
    });
    if (!subResponse.ok) throw new Error(`Failed to set subclass for ${persona.name}: ${subResponse.status}`);
  }

  // Maneuvers are learned via the resource transactions endpoint.
  if (persona.maneuverName) {
    const mid = await maneuverId(cookie, persona.maneuverName);
    const manResponse = await api(cookie, `/api/characters/${id}/resources/transactions`, {
      method: "POST",
      body: JSON.stringify({ operations: [{ type: "learnManeuver", maneuverId: mid }] }),
    });
    if (!manResponse.ok) throw new Error(`Failed to learn maneuver for ${persona.name}: ${manResponse.status}`);
  }

  // Attach to a dedicated campaign so the persona can start a live session.
  if (persona.campaignName) {
    const campaignId = await ensureCampaign(cookie, persona.campaignName);
    const attachResponse = await api(cookie, `/api/campaigns/${campaignId}/characters`, {
      method: "POST",
      body: JSON.stringify({ characterId: id }),
    });
    if (!attachResponse.ok) throw new Error(`Failed to attach ${persona.name} to campaign: ${attachResponse.status}`);
  }
}

export default async function globalSetup(): Promise<void> {
  const cookie = await devLoginWithRetry();

  const listResponse = await api(cookie, "/api/characters");
  if (!listResponse.ok) {
    throw new Error(`Failed to list characters: ${listResponse.status}`);
  }
  const existing = (await listResponse.json()) as { name: string }[];
  const existingNames = new Set(existing.map((c) => c.name));

  for (const persona of ROSTER) {
    if (!existingNames.has(persona.name)) {
      await createPersona(cookie, persona);
    }
  }
}
