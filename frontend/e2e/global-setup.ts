// Seeds the shared persona roster once per run. Per-spec state lives inside
// specs, never here. A drifted persona is deleted and recreated whole — an
// in-place repair leaves prior subclass choices/granted spells/maneuvers
// behind, producing a hybrid persona.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

const ABILITY_SCORES = {
  strength: 10,
  dexterity: 14,
  constitution: 14,
  intelligence: 15,
  wisdom: 12,
  charisma: 8,
};

// XP curve is class-independent (levelForExperience).
const LEVEL_5_XP = 6500;
const LEVEL_6_XP = 14000;
const LEVEL_11_XP = 85000;
const LEVEL_13_XP = 120000;

interface Persona {
  name: string;
  // 2014: variant species (Halfling) resolve to undefined in resolveSpeciesId — use non-variant species only.
  speciesName: string;
  background: string;
  className: string;
  // rulesEdition is write-once (createCharacterSchema); campaignsRouter's
  // attach handler 400s a character/campaign edition mismatch, so a
  // campaignName here must be created under the same edition (ensureCampaign).
  rulesEdition?: "EDITION_2014" | "EDITION_2024";
  experiencePoints?: number;
  classLevel?: number;
  subclassName?: string;
  maneuverName?: string;
  campaignName?: string;
  // Omitting yields an empty spellbook; caster personas must list their picks here.
  spells?: { cantripNames: string[]; spellNames: string[] };
  disciplineNames?: string[];
}

const ROSTER: Persona[] = [
  { name: "Smoke Fighter", speciesName: "Halfling", background: "Soldier", className: "Fighter" },
  {
    name: "Wizard L5",
    speciesName: "Halfling",
    background: "Sage",
    className: "Wizard",
    experiencePoints: LEVEL_5_XP,
    spells: {
      cantripNames: ["Fire Bolt", "Mage Hand", "Light"],
      spellNames: ["Magic Missile", "Shield", "Mage Armor", "Burning Hands", "Detect Magic", "Sleep"],
    },
  },
  {
    name: "Warlock L1",
    speciesName: "Halfling",
    background: "Sage",
    className: "Warlock",
    spells: {
      cantripNames: ["Eldritch Blast", "Chill Touch"],
      spellNames: ["Charm Person", "Hideous Laughter"],
    },
  },
  {
    name: "Battle Master",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Fighter",
    experiencePoints: LEVEL_5_XP,
    classLevel: 5,
    subclassName: "Battle Master",
    maneuverName: "Evasive Footwork",
    campaignName: "E2E Solo — Battle Master",
  },
  {
    name: "Session Fighter",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Fighter",
    campaignName: "E2E Solo — Session Fighter",
  },
  {
    name: "Monk L6",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    campaignName: "E2E Solo — Monk L6",
  },
  {
    name: "Elements Monk",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Warrior of the Elements",
    campaignName: "E2E Solo — Elements Monk",
  },
  {
    name: "Shadow Monk",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Warrior of Shadow",
    campaignName: "E2E Solo — Shadow Monk",
  },
  {
    name: "Open Hand Monk L11",
    speciesName: "Halfling",
    background: "Soldier",
    className: "Monk",
    experiencePoints: LEVEL_11_XP,
    classLevel: 11,
    subclassName: "Warrior of the Open Hand",
    campaignName: "E2E Solo — Open Hand Monk",
  },
  {
    name: "2014 Open Hand Monk",
    speciesName: "Human",
    background: "Soldier",
    className: "Monk",
    rulesEdition: "EDITION_2014",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Way of the Open Hand",
    campaignName: "E2E Solo — 2014 Open Hand Monk",
  },
  {
    name: "2014 Elements Monk",
    speciesName: "Human",
    background: "Soldier",
    className: "Monk",
    rulesEdition: "EDITION_2014",
    experiencePoints: LEVEL_6_XP,
    classLevel: 6,
    subclassName: "Way of the Four Elements",
    disciplineNames: ["Fangs of the Fire Snake", "Sweeping Cinder Strike"],
    campaignName: "E2E Solo — 2014 Elements Monk",
  },
  {
    name: "2014 Monk of Shadow",
    speciesName: "Human",
    background: "Soldier",
    className: "Monk",
    rulesEdition: "EDITION_2014",
    experiencePoints: LEVEL_13_XP,
    classLevel: 13,
    subclassName: "Way of Shadow",
    campaignName: "E2E Solo — 2014 Monk of Shadow",
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

// Must run before any character write — a stale generated Prisma client
// (container predating the last migration) fails clean here instead of
// half-seeding the roster.
async function assertCatalogReady(cookie: string): Promise<void> {
  const response = await api(cookie, "/api/reference?edition=EDITION_2024");
  if (!response.ok) {
    throw new Error(
      `Catalog preflight failed: GET /api/reference?edition=EDITION_2024 returned ${response.status}. ` +
        "The backend's generated Prisma client likely predates the current schema " +
        "(a container started before the last migration). Run `docker compose restart backend` " +
        "to re-run generate + migrate deploy + db seed, then retry.",
    );
  }
}

interface CharacterFingerprint {
  className: string;
  subclassName: string | undefined;
  // rulesEdition is write-once and not derivable from any other field here —
  // dropping it from this shape would let an edition drift go undetected.
  rulesEdition: string;
  experiencePoints: number;
  classLevel: number;
  campaignName: string | undefined;
  maneuverNames: string[];
  cantripNames: string[];
  spellNames: string[];
  disciplineNames: string[];
}

function toNameList(name: string | undefined): string[] {
  return name ? [name] : [];
}

function namesOrEmpty(names: string[] | undefined): string[] {
  return names ?? [];
}

function personaFingerprint(persona: Persona): CharacterFingerprint {
  return {
    className: persona.className,
    subclassName: persona.subclassName,
    rulesEdition: persona.rulesEdition ?? "EDITION_2024",
    experiencePoints: persona.experiencePoints ?? 0,
    classLevel: persona.classLevel ?? 1,
    campaignName: persona.campaignName,
    maneuverNames: toNameList(persona.maneuverName),
    cantripNames: namesOrEmpty(persona.spells?.cantripNames),
    spellNames: namesOrEmpty(persona.spells?.spellNames),
    disciplineNames: namesOrEmpty(persona.disciplineNames),
  };
}

interface CharacterDetail {
  rulesEdition: string;
  experiencePoints: number;
  campaignId: string | null;
  classes: { name: string; level: number; subclass: string | null }[];
  resources?: {
    maneuversKnown?: { name: string }[];
    choicesKnown?: Record<string, { name: string }[]>;
  } | null;
  spellcasting?: { spells?: { name: string; level: number }[] } | null;
}

// classes[0]'s level/subclass are buildClassesView's clamp-on-read view, not
// the raw class-entry columns — comparing the clamped values is what makes a
// level-clamped subclass or level read as the mismatch it is.
function characterFingerprint(
  character: CharacterDetail,
  campaignNameById: Map<string, string>,
): CharacterFingerprint {
  const primary = character.classes[0];
  const spells = character.spellcasting?.spells ?? [];
  return {
    className: primary.name,
    subclassName: primary.subclass ?? undefined,
    rulesEdition: character.rulesEdition,
    experiencePoints: character.experiencePoints,
    classLevel: primary.level,
    campaignName: character.campaignId ? campaignNameById.get(character.campaignId) : undefined,
    maneuverNames: (character.resources?.maneuversKnown ?? []).map((m) => m.name),
    disciplineNames: (character.resources?.choicesKnown?.fourElementsDisciplines ?? []).map((d) => d.name),
    cantripNames: spells.filter((s) => s.level === 0).map((s) => s.name),
    spellNames: spells.filter((s) => s.level > 0).map((s) => s.name),
  };
}

// maneuverNames/cantripNames/spellNames/disciplineNames compare as SUBSET,
// not exact: every declared pick must be present but extras are ignored, so
// precision-attack.spec.ts appending to a persona's maneuversKnown, or
// mergeGrantedSpells adding subclass/item spells, is never mistaken for staleness.
function diffFingerprints(declared: CharacterFingerprint, actual: CharacterFingerprint): string[] {
  const mismatches: string[] = [];
  for (const field of ["className", "subclassName", "rulesEdition", "experiencePoints", "classLevel", "campaignName"] as const) {
    if (declared[field] !== actual[field]) mismatches.push(field);
  }
  for (const field of ["maneuverNames", "cantripNames", "spellNames", "disciplineNames"] as const) {
    const actualNames = new Set(actual[field]);
    if (declared[field].some((name) => !actualNames.has(name))) mismatches.push(field);
  }
  return mismatches;
}

// A 2014 subclass name (e.g. "Way of Shadow") only resolves against the 2014
// catalog — the 2024 sibling ("Warrior of Shadow") is a different Subclass
// row entirely, not a fallback, so edition must scope this lookup.
async function subclassId(
  cookie: string,
  className: string,
  subclassName: string,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
): Promise<string> {
  const response = await api(cookie, `/api/reference?edition=${edition}`);
  if (!response.ok) throw new Error(`Failed to load reference: ${response.status}`);
  const { classes } = (await response.json()) as {
    classes: { name: string; subclasses: { id: string; name: string }[] }[];
  };
  const cls = classes.find((c) => c.name === className);
  const sub = cls?.subclasses.find((s) => s.name === subclassName);
  if (!sub) throw new Error(`Subclass not found: ${className} / ${subclassName}`);
  return sub.id;
}

async function maneuverId(cookie: string, name: string): Promise<string> {
  const response = await api(cookie, "/api/maneuvers?edition=EDITION_2024");
  if (!response.ok) throw new Error(`Failed to load maneuvers: ${response.status}`);
  const maneuvers = (await response.json()) as { id: string; name: string }[];
  const match = maneuvers.find((m) => m.name === name);
  if (!match) throw new Error(`Maneuver not found: ${name}`);
  return match.id;
}

// `edition` only matters on the CREATE branch — a found campaign keeps
// whatever edition it already has.
async function ensureCampaign(
  cookie: string,
  name: string,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
): Promise<string> {
  const listResponse = await api(cookie, "/api/campaigns");
  if (!listResponse.ok) throw new Error(`Failed to list campaigns: ${listResponse.status}`);
  const existing = (await listResponse.json()) as { id: string; name: string }[];
  const found = existing.find((c) => c.name === name);
  if (found) return found.id;

  const createResponse = await api(cookie, "/api/campaigns", {
    method: "POST",
    body: JSON.stringify({ name, rulesEdition: edition }),
  });
  if (!createResponse.ok) throw new Error(`Failed to create campaign ${name}: ${createResponse.status}`);
  const { id } = (await createResponse.json()) as { id: string };
  return id;
}

// Filters on `status`, not `endedAt`: `status` is what activeSessionForCampaign
// reads and closeSession claims atomically. A campaign left live makes
// CastSpellDoor defer the cast door to Combat, failing the next run's specs.
async function endActiveSessions(cookie: string, campaignId: string, campaignName: string): Promise<void> {
  const activeSessions = async (): Promise<{ id: string }[]> => {
    const response = await api(cookie, `/api/campaigns/${campaignId}/sessions`);
    if (!response.ok) {
      throw new Error(`Failed to list sessions for "${campaignName}": ${response.status}`);
    }
    const sessions = (await response.json()) as { id: string; status: string }[];
    return sessions.filter((session) => session.status === "active");
  };

  for (const session of await activeSessions()) {
    const response = await api(cookie, `/api/campaigns/${campaignId}/sessions/${session.id}/end`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`Failed to end stale session ${session.id} in "${campaignName}": ${response.status}`);
    }
    console.warn(`global-setup: ended stale active session ${session.id} in "${campaignName}"`);
  }

  const remaining = await activeSessions();
  if (remaining.length > 0) {
    throw new Error(
      `Campaign "${campaignName}" still has an active session after the sweep: ${remaining.map((s) => s.id).join(", ")}`,
    );
  }
}

async function resolveSpeciesId(
  cookie: string,
  name: string,
  edition: "EDITION_2014" | "EDITION_2024" = "EDITION_2024",
): Promise<string> {
  const response = await api(cookie, `/api/reference?edition=${edition}`);
  if (!response.ok) throw new Error(`Failed to load reference: ${response.status}`);
  const { species } = (await response.json()) as { species: { id: string; name: string }[] };
  const match = species.find((s) => s.name === name);
  if (!match) throw new Error(`Species not found in catalog: ${name}`);
  return match.id;
}

async function resolveSpellIds(cookie: string, names: string[]): Promise<string[]> {
  const response = await api(cookie, "/api/spells?edition=EDITION_2024");
  if (!response.ok) throw new Error(`Failed to load spells: ${response.status}`);
  const catalog = (await response.json()) as { id: string; name: string }[];
  const byName = new Map(catalog.map((s) => [s.name, s.id]));
  return names.map((n) => {
    const id = byName.get(n);
    if (!id) throw new Error(`Spell not found in catalog: ${n}`);
    return id;
  });
}

async function creationSpellPicks(cookie: string, persona: Persona): Promise<{ cantripIds: string[]; spellIds: string[] } | undefined> {
  if (!persona.spells) return undefined;
  return {
    cantripIds: await resolveSpellIds(cookie, persona.spells.cantripNames),
    spellIds: await resolveSpellIds(cookie, persona.spells.spellNames),
  };
}

async function seedCharacterShell(cookie: string, persona: Persona): Promise<string> {
  const edition = persona.rulesEdition ?? "EDITION_2024";
  const [speciesId, spells] = await Promise.all([
    resolveSpeciesId(cookie, persona.speciesName, edition),
    creationSpellPicks(cookie, persona),
  ]);
  const response = await api(cookie, "/api/characters", {
    method: "POST",
    body: JSON.stringify({
      name: persona.name,
      alignment: "True Neutral",
      speciesId,
      background: persona.background,
      classes: [{ name: persona.className }],
      abilityScores: ABILITY_SCORES,
      ...(spells ? { spells } : {}),
      // rulesEdition is write-once (createCharacterSchema) — omit it entirely
      // rather than send an explicit default.
      ...(persona.rulesEdition ? { rulesEdition: persona.rulesEdition } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create ${persona.name}: ${response.status} ${await response.text()}`);
  }
  const { id } = (await response.json()) as { id: string };
  return id;
}

async function seedExperience(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.experiencePoints) return;
  const res = await api(cookie, `/api/characters/${id}/experience`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "set", value: persona.experiencePoints }] }),
  });
  if (!res.ok) throw new Error(`Failed to set XP for ${persona.name}: ${res.status}`);
}

// Class-entry level tracks applied HP level-ups, not XP-derived level.
async function seedLevelUps(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.classLevel || persona.classLevel <= 1) return;
  const levelUps = Array.from({ length: persona.classLevel - 1 }, () => ({ type: "levelUp", method: "average" }));
  const res = await api(cookie, `/api/characters/${id}/hp`, {
    method: "POST",
    body: JSON.stringify({ operations: levelUps }),
  });
  if (!res.ok) throw new Error(`Failed to level up ${persona.name}: ${res.status}`);
}

// Fighter grants a subclass at L3, so seedExperience must already have run.
async function seedSubclass(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.subclassName) return;
  const subclass = await subclassId(cookie, persona.className, persona.subclassName, persona.rulesEdition);
  const res = await api(cookie, `/api/characters/${id}/class/transactions`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "setSubclass", subclassId: subclass }] }),
  });
  if (!res.ok) throw new Error(`Failed to set subclass for ${persona.name}: ${res.status}`);
}

async function seedManeuver(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.maneuverName) return;
  const mid = await maneuverId(cookie, persona.maneuverName);
  const res = await api(cookie, `/api/characters/${id}/resources/transactions`, {
    method: "POST",
    body: JSON.stringify({ operations: [{ type: "learnManeuver", maneuverId: mid }] }),
  });
  if (!res.ok) throw new Error(`Failed to learn maneuver for ${persona.name}: ${res.status}`);
}

async function disciplineId(cookie: string, name: string): Promise<string> {
  const response = await api(cookie, "/api/disciplines?edition=EDITION_2014");
  if (!response.ok) throw new Error(`Failed to load disciplines: ${response.status}`);
  const catalog = (await response.json()) as { id: string; name: string }[];
  const match = catalog.find((d) => d.name === name);
  if (!match) throw new Error(`Discipline not found: ${name}`);
  return match.id;
}

// Requires the subclass to already be set (createPersona's ordering) — the
// choice is only legal once the character's own subclass grants it.
async function seedDisciplines(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.disciplineNames?.length) return;
  for (const name of persona.disciplineNames) {
    const optionId = await disciplineId(cookie, name);
    const res = await api(cookie, `/api/characters/${id}/resources/transactions`, {
      method: "POST",
      body: JSON.stringify({
        operations: [{ type: "learnSubclassChoice", choiceKey: "fourElementsDisciplines", optionId }],
      }),
    });
    if (!res.ok) throw new Error(`Failed to learn discipline "${name}" for ${persona.name}: ${res.status}`);
  }
}

async function attachToCampaign(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.campaignName) return;
  const campaignId = await ensureCampaign(cookie, persona.campaignName, persona.rulesEdition);
  const res = await api(cookie, `/api/campaigns/${campaignId}/characters`, {
    method: "POST",
    body: JSON.stringify({ characterId: id }),
  });
  if (!res.ok) throw new Error(`Failed to attach ${persona.name} to campaign: ${res.status}`);
}

// Order is a dependency chain, not incidental: XP before subclass (level
// gate), subclass before disciplines (choice legality). Each step no-ops
// when the persona doesn't declare it.
async function createPersona(cookie: string, persona: Persona): Promise<void> {
  const id = await seedCharacterShell(cookie, persona);
  await seedExperience(cookie, id, persona);
  await seedLevelUps(cookie, id, persona);
  await seedSubclass(cookie, id, persona);
  await seedDisciplines(cookie, id, persona);
  await seedManeuver(cookie, id, persona);
  await attachToCampaign(cookie, id, persona);
}

// First-wins tie-break must match findCharacterByName's (helpers/api.ts), or
// this loop and the specs would resolve a duplicate name to different rows.
function indexCharactersByName(existing: { id: string; name: string }[]): Map<string, string> {
  const idByName = new Map<string, string>();
  const duplicateNames = new Set<string>();
  for (const character of existing) {
    if (idByName.has(character.name)) {
      duplicateNames.add(character.name);
      continue;
    }
    idByName.set(character.name, character.id);
  }
  for (const name of duplicateNames) {
    console.warn(`global-setup: multiple characters named "${name}" found; using the first, ignoring the rest`);
  }
  return idByName;
}

async function verifyOrRecreatePersona(
  cookie: string,
  persona: Persona,
  id: string,
  campaignNameById: Map<string, string>,
  rosterNames: Set<string>,
): Promise<void> {
  const detailResponse = await api(cookie, `/api/characters/${id}`);
  if (!detailResponse.ok) {
    // A 500 here, right after a passing catalog preflight, is a real defect
    // on this specific row — not a reason to blow it away and reseed.
    throw new Error(`Failed to load "${persona.name}" (${id}): ${detailResponse.status}`);
  }
  const character = (await detailResponse.json()) as CharacterDetail;
  const declared = personaFingerprint(persona);
  const actual = characterFingerprint(character, campaignNameById);
  const mismatches = diffFingerprints(declared, actual);
  if (mismatches.length === 0) return;

  // Latch against a future refactor that iterates GET /api/characters instead
  // of ROSTER — that must not be able to reach a DELETE on a debris row.
  if (!rosterNames.has(persona.name)) {
    throw new Error(`Refusing to delete "${persona.name}": not a declared ROSTER persona`);
  }
  const detail = mismatches
    .map((field) => `${field}: ${JSON.stringify(declared[field as keyof CharacterFingerprint])} vs ${JSON.stringify(actual[field as keyof CharacterFingerprint])}`)
    .join(", ");
  console.warn(`global-setup: recreating "${persona.name}" — stale ${detail}`);

  const deleteResponse = await api(cookie, `/api/characters/${id}`, { method: "DELETE" });
  if (!deleteResponse.ok) {
    throw new Error(`Failed to delete stale "${persona.name}" (${id}): ${deleteResponse.status}`);
  }
  await createPersona(cookie, persona);
}

export default async function globalSetup(): Promise<void> {
  const cookie = await devLoginWithRetry();
  await assertCatalogReady(cookie);

  const listResponse = await api(cookie, "/api/characters");
  if (!listResponse.ok) {
    throw new Error(`Failed to list characters: ${listResponse.status}`);
  }
  const existing = (await listResponse.json()) as { id: string; name: string }[];
  const idByName = indexCharactersByName(existing);

  const campaignsResponse = await api(cookie, "/api/campaigns");
  if (!campaignsResponse.ok) {
    throw new Error(`Failed to list campaigns: ${campaignsResponse.status}`);
  }
  const campaigns = (await campaignsResponse.json()) as { id: string; name: string }[];
  const campaignNameById = new Map(campaigns.map((c) => [c.id, c.name]));
  const rosterNames = new Set(ROSTER.map((p) => p.name));

  for (const persona of ROSTER) {
    const id = idByName.get(persona.name);
    if (id) {
      await verifyOrRecreatePersona(cookie, persona, id, campaignNameById, rosterNames);
    } else {
      await createPersona(cookie, persona);
    }
  }

  // Runs top-level after the loop, not inside createPersona/attachToCampaign —
  // otherwise this sweep would never fire on the common path where every
  // persona already matches, missing the leaked session it exists to catch.
  const sessionCampaignNames = new Set(ROSTER.flatMap((p) => (p.campaignName ? [p.campaignName] : [])));
  for (const campaignName of sessionCampaignNames) {
    await endActiveSessions(cookie, await ensureCampaign(cookie, campaignName), campaignName);
  }
}
