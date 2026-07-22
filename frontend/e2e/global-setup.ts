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
//                     the Empowered Strikes "Magical" badge in a live session.
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

// L5 threshold from the XP curve (backend/src/lib/leveling/experience.ts). The curve is
// class-independent, so this is L5 for both the Wizard and the Battle Master.
const LEVEL_5_XP = 6500;
// L6 threshold — gates Monk Empowered Strikes (magical unarmed strikes).
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
  // Four Elements discipline to learn (by catalog name).
  disciplineName?: string;
  // A dedicated solo campaign to attach to (name); enables live sessions.
  campaignName?: string;
  // #1131: a caster's level-1 creation picks, by spell name. Counts must match the
  // class's SRD 5.2 level-1 loadout (resolved to ids in the create body). Every
  // caster persona must be created legal from #1131 on — omitting yields an empty
  // book, so realistic casters list their picks here.
  spells?: { cantripNames: string[]; spellNames: string[] };
}

const ROSTER: Persona[] = [
  { name: "Smoke Fighter", race: "Human", background: "Soldier", className: "Fighter" },
  {
    name: "Wizard L5",
    race: "Human",
    background: "Sage",
    className: "Wizard",
    experiencePoints: LEVEL_5_XP,
    // Wizard level-1 loadout: 3 cantrips + 4 spells (SRD 5.2).
    spells: {
      cantripNames: ["Fire Bolt", "Mage Hand", "Light"],
      spellNames: ["Magic Missile", "Shield", "Mage Armor", "Burning Hands"],
    },
  },
  {
    name: "Warlock L1",
    race: "Human",
    background: "Sage",
    className: "Warlock",
    // Warlock level-1 loadout: 2 cantrips (incl. Eldritch Blast) + 2 spells.
    // Hideous Laughter (SRD 5.2 name) is warlock-legal; Dissonant Whispers is
    // now bard-only (#1132), so it can no longer be a Warlock pick.
    spells: {
      cantripNames: ["Eldritch Blast", "Chill Touch"],
      spellNames: ["Charm Person", "Hideous Laughter"],
    },
  },
  {
    name: "Battle Master",
    race: "Human",
    background: "Soldier",
    className: "Fighter",
    experiencePoints: LEVEL_5_XP,
    classLevel: 5, // apply the HP level-ups → Fighter L5 → Extra Attack (2 attacks)
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
  {
    name: "Four Elements Monk",
    race: "Human",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Way of the Four Elements",
    disciplineName: "Fangs of the Fire Snake",
    campaignName: "E2E Solo — Four Elements Monk",
  },
  {
    name: "Shadow Monk",
    race: "Human",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Warrior of Shadow",
    campaignName: "E2E Solo — Shadow Monk",
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

// Resolve spell names → catalog ids via GET /api/spells (#1131 create-body picks).
async function resolveSpellIds(cookie: string, names: string[]): Promise<string[]> {
  const response = await api(cookie, "/api/spells");
  if (!response.ok) throw new Error(`Failed to load spells: ${response.status}`);
  const catalog = (await response.json()) as { id: string; name: string }[];
  const byName = new Map(catalog.map((s) => [s.name, s.id]));
  return names.map((n) => {
    const id = byName.get(n);
    if (!id) throw new Error(`Spell not found in catalog: ${n}`);
    return id;
  });
}

// The #1131 creation spell/cantrip picks for a caster persona, resolved to ids.
async function creationSpellPicks(cookie: string, persona: Persona): Promise<{ cantripIds: string[]; spellIds: string[] } | undefined> {
  if (!persona.spells) return undefined;
  return {
    cantripIds: await resolveSpellIds(cookie, persona.spells.cantripNames),
    spellIds: await resolveSpellIds(cookie, persona.spells.spellNames),
  };
}

// Create the base character and return its id. Ability scores are fixed; every
// level-gated extra is layered on afterward through the same transaction
// endpoints the app uses, so derived state (slots, subclass eligibility) is exact.
async function seedCharacterShell(cookie: string, persona: Persona): Promise<string> {
  const spells = await creationSpellPicks(cookie, persona);
  const response = await api(cookie, "/api/characters", {
    method: "POST",
    body: JSON.stringify({
      name: persona.name,
      alignment: "True Neutral",
      race: persona.race,
      background: persona.background,
      classes: [{ name: persona.className }],
      abilityScores: ABILITY_SCORES,
      ...(spells ? { spells } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create ${persona.name}: ${response.status} ${await response.text()}`);
  }
  const { id } = (await response.json()) as { id: string };
  return id;
}

// XP goes through the transactions endpoint (not the create body) so the level —
// and thus spell slots / subclass eligibility — derive server-side as in the app.
async function seedExperience(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.experiencePoints) return;
  const res = await api(cookie, `/api/characters/${id}/experience`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "set", value: persona.experiencePoints }] }),
  });
  if (!res.ok) throw new Error(`Failed to set XP for ${persona.name}: ${res.status}`);
}

// Class-entry level tracks applied HP level-ups, not XP-derived level. Drive
// (classLevel - 1) average level-ups so level-gated features (Empowered
// Strikes) derive correctly.
async function seedLevelUps(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.classLevel || persona.classLevel <= 1) return;
  const levelUps = Array.from({ length: persona.classLevel - 1 }, () => ({ type: "levelUp", method: "average" }));
  const res = await api(cookie, `/api/characters/${id}/hp`, {
    method: "POST",
    body: JSON.stringify({ operations: levelUps }),
  });
  if (!res.ok) throw new Error(`Failed to level up ${persona.name}: ${res.status}`);
}

// Subclass is chosen post-creation via the class transactions endpoint (Fighter
// grants it at L3, so the XP set above is a prerequisite).
async function seedSubclass(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.subclassName) return;
  const subclass = await subclassId(cookie, persona.className, persona.subclassName);
  const res = await api(cookie, `/api/characters/${id}/class/transactions`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "setSubclass", subclassId: subclass }] }),
  });
  if (!res.ok) throw new Error(`Failed to set subclass for ${persona.name}: ${res.status}`);
}

// Maneuvers are learned via the resource transactions endpoint.
async function seedManeuver(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.maneuverName) return;
  const mid = await maneuverId(cookie, persona.maneuverName);
  const res = await api(cookie, `/api/characters/${id}/resources/transactions`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "learnManeuver", maneuverId: mid }] }),
  });
  if (!res.ok) throw new Error(`Failed to learn maneuver for ${persona.name}: ${res.status}`);
}

// Elemental disciplines are learned via the resource transactions endpoint.
async function seedDiscipline(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.disciplineName) return;
  const dResponse = await api(cookie, "/api/disciplines");
  if (!dResponse.ok) throw new Error(`Failed to load disciplines: ${dResponse.status}`);
  const catalog = (await dResponse.json()) as { id: string; name: string }[];
  const match = catalog.find((d) => d.name === persona.disciplineName);
  if (!match) throw new Error(`Discipline not found: ${persona.disciplineName}`);
  const res = await api(cookie, `/api/characters/${id}/resources/transactions`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "learnDiscipline", disciplineId: match.id }] }),
  });
  if (!res.ok) throw new Error(`Failed to learn discipline for ${persona.name}: ${res.status}`);
}

// Attach to a dedicated campaign so the persona can start a live session.
async function attachToCampaign(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.campaignName) return;
  const campaignId = await ensureCampaign(cookie, persona.campaignName);
  const res = await api(cookie, `/api/campaigns/${campaignId}/characters`, {
    method: "POST",
    body: JSON.stringify({ characterId: id }),
  });
  if (!res.ok) throw new Error(`Failed to attach ${persona.name} to campaign: ${res.status}`);
}

// Seed one persona: create the shell, then layer on each level-gated extra in
// dependency order (XP before subclass, etc.). Each step no-ops when the
// persona doesn't declare it.
async function createPersona(cookie: string, persona: Persona): Promise<void> {
  const id = await seedCharacterShell(cookie, persona);
  await seedExperience(cookie, id, persona);
  await seedLevelUps(cookie, id, persona);
  await seedSubclass(cookie, id, persona);
  await seedManeuver(cookie, id, persona);
  await seedDiscipline(cookie, id, persona);
  await attachToCampaign(cookie, id, persona);
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
