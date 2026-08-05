// Verify-or-recreate persona seeding for the e2e suite. Runs once before all
// specs: signs in via dev-login, then for each roster persona already present
// by name, compares the live character against ROSTER's declared fingerprint
// (personaFingerprint/characterFingerprint/diffFingerprints below) and
// DELETEs + recreates it on any mismatch. In-place repair can't land on the
// declared state — e.g. applySetSubclass (backend/src/lib/classes/class.ts)
// overwrites subclass/subclassId but leaves the previous subclass's
// choicesKnown, granted spells, and maneuvers in place, so a "fixed" persona
// would be a hybrid no spec's expectations describe. A persona that already
// matches is never touched. Each vitest worker gets its own DB clone (#1269),
// so backend's auth.test.ts wiping dev-user-local cannot reach this suite's
// dev DB — the roster survives across runs, which is exactly what makes this
// verify step load-bearing (a stale persona would otherwise go undetected
// forever).
//
// ── Roster (verify-or-recreate: matched by name; a mismatch deletes and
//    recreates from the declaration below) ─────────────────────────────
//   Smoke Fighter   — Fighter L1. Baseline sheet + HP/rest flows.
//   Wizard L5       — Wizard, 6500 XP (L5). Derived spell slots.
//   Warlock L1      — Warlock L1. Level-1 creation cantrip/spell picks.
//   Battle Master   — Fighter, 6500 XP (L5) + Battle Master subclass + one
//                     effect maneuver (Evasive Footwork). Attached to its own
//                     solo campaign so maneuvers.spec can run an in-session
//                     superiority-die spend.
//   Session Fighter — Fighter L1, attached to its own solo campaign so
//                     session.spec can start/resume a live session in-spec.
//   Monk L6         — Monk, 14000 XP (L6), own campaign; unarmed.spec asserts
//                     the Empowered Strikes "Magical" badge in a live session.
//   Elements Monk   — Monk, L6, Warrior of the Elements, own campaign;
//                     Elemental Attunement/Burst live-play automation.
//   Shadow Monk     — Monk, L6, Warrior of Shadow, own campaign; shadow-arts.spec
//                     and shadow-step.spec exercise Shadow Arts/Shadow Step.
//   Open Hand Monk L11 — Monk, 85000 XP (L11), Warrior of the Open Hand, own
//                     campaign; #1250's e2e drives Deflect Attacks, Stunning
//                     Strike, 3-strike Flurry (Heightened Focus, L10), Patient
//                     Defense/Step of the Wind, and the Open Hand Technique rider.
//   2014 Open Hand Monk — EDITION_2014, Monk L6, Way of the Open Hand, own
//                     campaign; monk-2014.spec.ts drives Ki spend (Flurry/
//                     Patient Defense/Step of the Wind's flat 1-ki shapes),
//                     Deflect Missiles + the 1-ki throw-back, and Stunning
//                     Strike.
//   2014 Elements Monk — EDITION_2014, Monk L6, Way of the Four Elements, own
//                     campaign, 2 known Elemental Disciplines (#1506);
//                     monk-2014.spec.ts casts one with an upcast ki amount.
//   2014 Monk of Shadow — EDITION_2014, Monk L13, Way of Shadow, own campaign;
//                     monk-2014.spec.ts drives Shadow Step (the one 2014
//                     Way-of-Shadow feature already wired into the generic
//                     action-sheet resolver — shadowArts/cloakOfShadows/
//                     opportunist have no frontend UI yet for the 2014 4-spell-
//                     menu shape, see that spec's own header comment).
//
// Personas that need a live session each get a DEDICATED campaign: a campaign
// allows only one active session at a time, so sharing one would make the
// session-using specs conflict when Playwright runs files in parallel.
//
// Per-spec state (fresh throwaway characters, learned spells, awarded XP) is
// created inside the specs via e2e/helpers/api.ts — never here — so every spec
// stays independently runnable and these shared personas are never mutated.
// (precision-attack.spec.ts is the one known exception — it learnManeuver()s
// onto the Battle Master persona directly. maneuverNames is a subset check
// below specifically so that doesn't trigger a recreate on every run.)

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
// L11 threshold — gates Monk Heightened Focus's 3-strike Flurry (granted at L10,
// so any L11+ classLevel exercises it) plus subclass L11 features.
const LEVEL_11_XP = 85000;
// L13 threshold — the 2014 Monk of Shadow persona's target level: past Cloak of
// Shadows (Way of Shadow L11) but below Opportunist (L17), same reasoning as
// the ticket that specced it (#1506).
const LEVEL_13_XP = 120000;

interface Persona {
  name: string;
  // #1684: resolved to a speciesId at creation (resolveSpeciesId below) — the
  // flat `race`-name create path is gone. Halfling (2024): no #1690 choice
  // trait (unlike Human's Skillful/Versatile, which would need extra fields
  // no persona here declares) and no maxHp-granting trait (unlike Dwarf's
  // Toughness, which would throw off every persona's HP by species alone).
  // The 2014 personas below use Human instead — Halfling carries 2 variant
  // rows under EDITION_2014 (Lightfoot/Stout) and resolveSpeciesId has no
  // variant support, while 2014 Human's six +1 fixed ability increases need
  // no extra `speciesAbilities` choice (unlike 2014 Half-Elf's floating pick).
  speciesName: string;
  background: string;
  className: string;
  // A character's rulesEdition is write-once and defaults to EDITION_2024
  // when omitted (character-schemas.ts) — every persona above this comment
  // predates #1506 and stays implicitly 2024; only the three 2014 Monk
  // personas below set it. Threaded into the create body (seedCharacterShell)
  // and into ensureCampaign so a personaCampaignName's campaign is created
  // under the SAME edition — campaignsRouter's attach handler 400s a
  // cross-edition character/campaign pair (edition.ts's own docblock).
  rulesEdition?: "EDITION_2014" | "EDITION_2024";
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
  // #1131: a caster's level-1 creation picks, by spell name. Counts must match the
  // class's SRD 5.2 level-1 loadout (resolved to ids in the create body). Every
  // caster persona must be created legal from #1131 on — omitting yields an empty
  // book, so realistic casters list their picks here.
  spells?: { cantripNames: string[]; spellNames: string[] };
  // #1506: Way of the Four Elements' known-discipline picks, by catalog name —
  // resolved via GET /api/disciplines and applied as learnSubclassChoice ops
  // (resources/transactions) post-subclass. Count must match the subclass's
  // level-derived discipline-slot cap (monk.ts's `choices` declaration).
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
    // Wizard level-1 loadout: 3 cantrips + a full 6-spell spellbook (#1513 —
    // the spellbook figure is edition-invariant, not a 2024-only 4).
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
    speciesName: "Halfling",
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
    // #1249/#1250: L11+ so Heightened Focus (L10, 3-strike Flurry) and Open Hand
    // Technique (subclass, L3+) are both live, exercising Deflect Attacks (L3),
    // Stunning Strike (L5), Flurry/Patient Defense/Step of the Wind, and the
    // Open Hand Technique rider (Addle/Push/Topple) in one persona.
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
    // #1506: base 2014 Monk features (Ki, Flurry/Patient Defense/Step of the
    // Wind's flat 1-ki shapes, Deflect Missiles + throw-back, Stunning Strike)
    // all live at L6 — Way of the Open Hand's own subclass features (Open
    // Hand Technique, Stunning-Strike rider) aren't exercised by
    // monk-2014.spec.ts, only the BASE Monk kit under a 2014 subclass so the
    // persona still round-trips a real Subclass row.
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
    // #1506: Way of the Four Elements — 2 discipline slots at L6 (monk.ts's
    // `choices.count`). Fangs of the Fire Snake and Sweeping Cinder Strike are
    // both minLevel 3 and scalable (costPerStep set), so either can exercise
    // an upcast cast; the spec picks Sweeping Cinder Strike (a save-DC damage
    // discipline, Dexterity save vs the monk's ki save DC).
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
    // #1506: L13 — past Cloak of Shadows (Way of Shadow L11, no ki cost) but
    // below Opportunist (L17). Only Shadow Step is exercised by
    // monk-2014.spec.ts (see the ROSTER docblock above for why).
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

// A container that predates the last migration (started before `docker compose
// up --build` regenerated the Prisma client) throws here first: the generated
// client selects columns the DB no longer matches. This must run right after
// login and before any character write — a drifted stack should fail clean,
// not half-seed the roster. It never migrates anything itself; the fix is
// restarting the container, whose CMD chains generate + `migrate deploy` +
// `db seed` (backend/Dockerfile). `subclassId` below hits the same route but
// only for personas that declare a subclass, and only after
// seedCharacterShell has already written — that's fine there because it's not
// guarding against drift, just resolving a name.
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

// Shape both a declared Persona and a live character reduce to, so the two
// can be diffed field-by-field without either side reaching into the other's
// representation (ids vs. names, raw vs. clamped level, etc.).
interface CharacterFingerprint {
  className: string;
  subclassName: string | undefined;
  // #1506: edition is write-once and never re-derivable from anything else in
  // this shape, so a drifted edition (a persona's `rulesEdition` changed
  // without also renaming it) would otherwise never trigger a recreate —
  // exactly the silent-stale failure the roster verify step exists to catch.
  rulesEdition: string;
  experiencePoints: number;
  classLevel: number;
  campaignName: string | undefined;
  maneuverNames: string[];
  cantripNames: string[];
  spellNames: string[];
  // #1506: Way of the Four Elements' known disciplines — SUBSET like
  // maneuverNames/cantripNames/spellNames (a mid-session extra pick is not a
  // staleness signal, only a MISSING declared one is).
  disciplineNames: string[];
}

// A single declared name normalized to the 0-or-1-entry list shape
// maneuverNames compares against (subset semantics — see diffFingerprints).
function toNameList(name: string | undefined): string[] {
  return name ? [name] : [];
}

// A declared name list, defaulted to empty when the persona doesn't declare
// this axis at all (cantripNames/spellNames/disciplineNames all share this
// shape) — split out of personaFingerprint (#1506) so each `??` lives in its
// own single-branch function instead of stacking onto one object literal's
// complexity budget.
function namesOrEmpty(names: string[] | undefined): string[] {
  return names ?? [];
}

// Pure. Normalizes the optionals to the same defaults characterFingerprint
// resolves live state to (no XP / no level-ups declared reads as 0 / L1), so
// an unset field compares equal to its absence rather than always mismatching.
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

// Reads the same shape off GET /api/characters/:id. classes[0]'s level/subclass
// are buildResourcesView's/buildClassesView's clamp-on-read (#125) view, not the
// raw class-entry columns — comparing against the clamped values is what makes a
// level-clamped subclass or level read as the mismatch it is. campaignName is
// resolved by id rather than threaded through personaFingerprint so the latter
// stays pure (no ensureCampaign find-or-create side effect during a read-only
// comparison).
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

// className/subclassName/rulesEdition/experiencePoints/classLevel/campaignName
// are EXACT (undefined === undefined counts as a match). maneuverNames/
// cantripNames/spellNames/disciplineNames are SUBSET — every declared pick
// must be present, extras are ignored. Subset semantics are load-bearing for
// two live cases: a spec appending to the Battle Master's maneuversKnown (see
// the docblock above), and subclass/item-granted spells (mergeGrantedSpells)
// appended to spellcasting.spells beyond what the roster declares — neither
// is a staleness signal, only a MISSING declared pick is. Returns the names
// of the mismatched fields (empty ⇒ no recreate needed).
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

// Resolve a subclass id by name from the reference catalog, scoped to the
// SAME edition the persona is created under (#1506) — a 2014 persona's
// subclass name (e.g. "Way of Shadow") only resolves against the 2014
// catalog; the 2024 sibling ("Warrior of Shadow") is a DIFFERENT Subclass row
// entirely, not a fallback.
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

// Resolve a maneuver id by name from the catalog. `?edition=` is required
// (#1412) and every persona built here is a default-2024 character.
async function maneuverId(cookie: string, name: string): Promise<string> {
  const response = await api(cookie, "/api/maneuvers?edition=EDITION_2024");
  if (!response.ok) throw new Error(`Failed to load maneuvers: ${response.status}`);
  const maneuvers = (await response.json()) as { id: string; name: string }[];
  const match = maneuvers.find((m) => m.name === name);
  if (!match) throw new Error(`Maneuver not found: ${name}`);
  return match.id;
}

// Find (by name) or create a campaign the persona can start sessions in.
// `edition` only matters on the CREATE branch (a found campaign keeps
// whatever edition it already has) — campaignsRouter's attach handler 400s a
// character/campaign edition mismatch (#1506), so a 2014 persona's own
// campaign must be created EDITION_2014 too, never left at the column default.
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

// Every run leaks a live session per session-using campaign (#1466): specs start
// them via enterLiveCombat and never leave, so maybeAutoClose can't fire — and a
// recreate cascades SessionParticipant away, leaving a zero-participant session
// it early-returns on. A campaign left live makes CastSpellDoor defer the cast
// door to Combat, failing the NEXT run's cast specs. Filter on `status`, not
// `endedAt`: `status` is what activeSessionForCampaign reads and closeSession
// claims atomically. The re-read is the only regression guard here (e2e/** is
// excluded from vitest), so an ineffective end fails naming the campaign rather
// than as a locator timeout several specs later.
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

// #1684: resolve a species name → catalog id via GET /api/reference (the
// mechanical anchor replacing the pruned flat `race`-name create field).
// EDITION_2024 default; the 2014 Monk personas (#1506) pass EDITION_2014 —
// each of those uses Human, a species with no variant/choice fields under
// EITHER edition, so this stays the plain by-name lookup (no variantId
// resolution) that every OTHER persona here also uses.
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

// Resolve spell names → catalog ids via GET /api/spells (#1131 create-body picks).
// `?edition=` is REQUIRED since #1712 — EDITION_2024 always, same as
// resolveSpeciesId above: no persona this file declares needs 2014.
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
      // Write-once (character-schemas.ts) — only sent when the persona
      // declares one, so every pre-#1506 persona keeps hitting the server
      // default (EDITION_2024) exactly as before.
      ...(persona.rulesEdition ? { rulesEdition: persona.rulesEdition } : {}),
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
  const subclass = await subclassId(cookie, persona.className, persona.subclassName, persona.rulesEdition);
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

// Resolve a discipline id by name from the 2014-only catalog (GET /api/disciplines).
async function disciplineId(cookie: string, name: string): Promise<string> {
  const response = await api(cookie, "/api/disciplines?edition=EDITION_2014");
  if (!response.ok) throw new Error(`Failed to load disciplines: ${response.status}`);
  const catalog = (await response.json()) as { id: string; name: string }[];
  const match = catalog.find((d) => d.name === name);
  if (!match) throw new Error(`Discipline not found: ${name}`);
  return match.id;
}

// Way of the Four Elements' known-discipline picks (#1506) — a generic
// "choose N" subclass choice (resources.ts's learnSubclassChoice), same
// mechanism Maneuvers/etc. use elsewhere, keyed "fourElementsDisciplines"
// (monk.ts's own `choices` declaration). Requires the subclass to already be
// set (createPersona's ordering), since the choice is only legal once the
// character's own subclass grants it.
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

// Attach to a dedicated campaign so the persona can start a live session.
async function attachToCampaign(cookie: string, id: string, persona: Persona): Promise<void> {
  if (!persona.campaignName) return;
  const campaignId = await ensureCampaign(cookie, persona.campaignName, persona.rulesEdition);
  const res = await api(cookie, `/api/campaigns/${campaignId}/characters`, {
    method: "POST",
    body: JSON.stringify({ characterId: id }),
  });
  if (!res.ok) throw new Error(`Failed to attach ${persona.name} to campaign: ${res.status}`);
}

// Seed one persona: create the shell, then layer on each level-gated extra in
// dependency order (XP before subclass, disciplines after subclass, etc.).
// Each step no-ops when the persona doesn't declare it.
async function createPersona(cookie: string, persona: Persona): Promise<void> {
  const id = await seedCharacterShell(cookie, persona);
  await seedExperience(cookie, id, persona);
  await seedLevelUps(cookie, id, persona);
  await seedSubclass(cookie, id, persona);
  await seedDisciplines(cookie, id, persona);
  await seedManeuver(cookie, id, persona);
  await attachToCampaign(cookie, id, persona);
}

// First occurrence per name: the route orders by name asc and
// findCharacterByName (helpers/api.ts) resolves the same duplicate the same
// way via .find() — first-wins is the only tie-break that keeps this loop
// and the specs looking at the same row. Extra rows are logged, never
// deleted; a human- or spec-made duplicate is not this loop's to clean up.
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

// Verify one already-present roster persona against its live character and
// recreate on a fingerprint mismatch (a no-op skip when it already matches).
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

  // Tautological as written (this is only ever called for a ROSTER persona,
  // so persona.name is trivially a member) — kept as a latch against a future
  // refactor that iterates GET /api/characters instead, which must not be
  // able to reach a DELETE on a "<persona name> <suffix>" debris row.
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

  // Top-level AFTER the loop, never inside createPersona: ensureCampaign is
  // reachable only from attachToCampaign ← createPersona, so a sweep hung off it
  // would never fire on the common path where every persona matches — the exact
  // case #1466 is about. Running last also catches the zero-participant orphan a
  // recreate above just manufactured, and resolving through ensureCampaign (not
  // the stale campaignNameById) targets the same first-wins row attachToCampaign
  // used. ROSTER campaigns only: per-spec throwaways accumulate unboundedly.
  const sessionCampaignNames = new Set(ROSTER.flatMap((p) => (p.campaignName ? [p.campaignName] : [])));
  for (const campaignName of sessionCampaignNames) {
    await endActiveSessions(cookie, await ensureCampaign(cookie, campaignName), campaignName);
  }
}
