// --- ClassFeature seeder (#1522/#1523) ---------------------------------------
// The executable counterpart to class-features.ts's DATA (CLASS_FEATURES) —
// split out per #1277 AC 4 / scripts/check-seed-data-modules.sh, which forbids
// prisma/upsert/await logic in a seed DATA module. Mirrors spells.ts /
// rename-spells.ts's existing content/logic split.
import { Prisma, type PrismaClient } from "../../src/generated/prisma/client.js";
import { upsertEditionRow, resolveEditionRow } from "../../src/lib/rules/catalog-edition.js";
import type { SubclassSlug } from "../../src/lib/classes/subclass-slug.js";
import type { SeedEdition } from "./edition.js";
import { CLASS_FEATURES, type ClassFeatureSeedRow } from "./class-features.js";
import { SUBCLASSES } from "./subclasses.js";

// Every descriptor column reset to NULL/default — the literal "populated
// nowhere" state #1523's acceptance criteria pin. Spread onto every row this
// seeder writes; #1528 is what first overrides any of these per-row. The
// three Json? columns use Prisma.DbNull (never a bare `null`): Prisma's
// generated CreateInput type for a nullable Json field only accepts
// InputJsonValue | NullableJsonNullValueInput, rejecting a literal `null` at
// compile time, but that type also accepts Prisma.JsonNull — which stores the
// JSON value `null`, not SQL NULL. Prisma.DbNull is the sentinel that stores
// actual SQL NULL, which is what "populated nowhere" means and what
// class-feature-migration.test.ts's descriptor-column assertions require;
// this repo's own idiom for it is `preferences: Prisma.DbNull` in
// preferences.test.ts. Prisma.JsonNull is right where a column is meant to
// literally hold a JSON `null` value (e.g. the `spellcasting: Prisma.JsonNull`
// test fixture elsewhere in this codebase) — a different intent than this
// reset, which was the bug the arbiter caught here.
const DESCRIPTOR_RESET = {
  resourceKey: null,
  resourceLabel: null,
  resourceRecharge: null,
  resourceTotals: Prisma.DbNull,
  resourceDieTiers: Prisma.DbNull,
  activationCost: null,
  resolverKind: null,
  requiresUnarmored: false,
  regrants: [] as string[],
  // #1909 — plain String? column, "populated nowhere" reset is null like the
  // other scalar descriptor columns above.
  reminder: null,
  // #1912 — same reset shape as the two columns above (plain nullable
  // scalar / plain-default boolean, no Prisma.DbNull sentinel needed).
  count: null,
  actionOnly: false,
  costKind: null,
  costPoolKey: null,
  costBase: null,
  costPerStep: null,
  effectKind: null,
  effectDiceCount: null,
  effectDiceFaces: null,
  effectDieSource: null,
  effectModifier: null,
  effectModifierSource: null,
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  buffTarget: null,
  buffModifier: null,
  derivedStat: null,
  derivedStatTiers: Prisma.DbNull,
  saveDcAbilities: [] as string[],
  // #1691 — same Prisma.DbNull sentinel as the other two Json? descriptor
  // columns above, for the same reason (see this block's own header).
  improvements: Prisma.DbNull,
  // #1686 — same Prisma.DbNull sentinel, same reason: "populated nowhere" for
  // a row that authors no `effectBuffs` list.
  effectBuffs: Prisma.DbNull,
  // #1688 — same Prisma.DbNull sentinel, same reason: "populated nowhere" for
  // a row that authors no `activationRequires` list.
  activationRequires: Prisma.DbNull,
  // #1121 — conditionImmunities is a plain String[] column (like
  // saveDcAbilities above), not Json, so its "populated nowhere" reset is an
  // empty array, not Prisma.DbNull.
  conditionImmunities: [] as string[],
  conditionImmunitiesRequireActiveBuff: null,
  conditionImmunitiesOnBuffStart: null,
};

function partitionKey(classId: string, subclassId: string | null): string {
  return `${classId}::${subclassId ?? "null"}`;
}

// staleCatalogRowsWhere (prune.ts) always builds a THIRD `edition: null`
// OR-branch, because every one of its existing callers (Feat/GrantedAbility/
// Action) has a nullable `edition` column where NULL means "shared".
// ClassFeature.edition is deliberately NON-NULLABLE (#1522 decision: every row
// forks) — verified empirically running `npx prisma db seed` end-to-end:
// Prisma's generated WhereInput for a non-nullable column rejects a literal
// `edition: null` filter outright ("Argument `edition` is missing"), so the
// shared helper's null branch cannot be handed to this model at all. This
// reproduces the SAME per-edition partitioning staleCatalogRowsWhere does,
// restricted to the two editions ClassFeature can actually hold, rather than
// widening the shared helper to special-case a column shape none of its other
// callers has.
//
// staleCatalogRowsWhere's own header documents the `notIn: []` trap: a
// partition with zero seeded rows for one edition builds `notIn: []` for that
// edition's OR-branch, which matches (and deletes) EVERY existing row there —
// fatal for a source that forks, harmless for one that doesn't. On the
// `edition` axis alone, that trap is discharged by non-nullability: there is
// no "zero rows because shared" case to misfire on here, since every
// ClassFeature row names its one edition. But `subclassId` reintroduces the
// IDENTICAL `notIn: []` hazard on a second axis staleCatalogRowsWhere never
// partitions on: a (classId, subclassId) partition that genuinely authors
// zero rows for one edition (#1227's "removed in 2024 means do not author a
// 2024 row") deletes all of that edition's rows here via the SAME empty-array
// mechanism — correct ONLY because pruneStalePartitions (below) has already
// scoped `seeded` to the exact partition before calling this function. The
// same subclassId-is-nullable hazard shows up on two other surfaces: the
// schema's `@@unique([classId, subclassId, name, edition])` (NULLS NOT
// DISTINCT, hand-written in the migration SQL because subclassId can repeat
// as NULL) and seedClassFeatures' JSDoc below, on why the compound `where`
// this helper's caller builds can't use `.upsert()`.
function classFeatureStaleWhere(
  seeded: readonly { identity: string; edition: SeedEdition }[],
  extraWhere: { classId: string; subclassId: string | null },
) {
  const editions: SeedEdition[] = ["EDITION_2014", "EDITION_2024"];
  return {
    AND: [
      extraWhere,
      {
        OR: editions.map((edition) => ({
          edition,
          name: { notIn: seeded.filter((r) => r.edition === edition).map((r) => r.identity) },
        })),
      },
    ],
  };
}

interface ResolvedRow {
  classId: string;
  subclassId: string | null;
  row: ClassFeatureSeedRow;
}

async function resolveClassIdsByName(prisma: PrismaClient): Promise<Map<string, string>> {
  const classNames = [...new Set(CLASS_FEATURES.map((r) => r.className))];
  const classRows = await prisma.characterClass.findMany({
    where: { name: { in: classNames } },
    select: { id: true, name: true },
  });
  return new Map(classRows.map((c) => [c.name, c.id]));
}

async function resolveSubclassCandidatesBySlug(
  prisma: PrismaClient,
): Promise<Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>> {
  const slugs = [...new Set(CLASS_FEATURES.map((r) => r.subclassSlug).filter((s): s is SubclassSlug => s !== null))];
  const subclassRows = await prisma.subclass.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, edition: true },
  });
  const bySlug = new Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>();
  for (const s of subclassRows) {
    const slug = s.slug as SubclassSlug;
    const arr = bySlug.get(slug) ?? [];
    arr.push({ id: s.id, edition: s.edition as SeedEdition | null });
    bySlug.set(slug, arr);
  }
  return bySlug;
}

// Every seeded Subclass row has edition: null today (no subclass forks yet,
// #1306), so both a row's 2014 and 2024 ClassFeature point at the SAME
// Subclass row — correct, and it costs this function nothing to stay correct
// the day a subclass DOES fork, since resolveEditionRow is what's doing the
// resolving, not a bare find. Split out of resolveOneRow (below) purely to
// keep each function's cyclomatic complexity low — see baseFeatureRows'
// comment in class-features.ts on why prisma/seed/** floors at the UNCOVERED
// CRAP formula regardless of real test coverage.
function resolveSubclassId(
  row: ClassFeatureSeedRow,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): string | null {
  if (!row.subclassSlug) return null;
  const candidates = subclassCandidatesBySlug.get(row.subclassSlug) ?? [];
  const match = resolveEditionRow(candidates, row.edition);
  if (!match) {
    throw new Error(`seedClassFeatures: no Subclass row for slug "${row.subclassSlug}" (${row.edition})`);
  }
  return match.id;
}

function resolveOneRow(
  row: ClassFeatureSeedRow,
  classIdByName: Map<string, string>,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): ResolvedRow {
  const classId = classIdByName.get(row.className);
  if (!classId) throw new Error(`seedClassFeatures: unknown class "${row.className}" in CLASS_FEATURES`);
  return { classId, subclassId: resolveSubclassId(row, subclassCandidatesBySlug), row };
}

function resolveRows(
  classIdByName: Map<string, string>,
  subclassCandidatesBySlug: Map<SubclassSlug, { id: string; edition: SeedEdition | null }[]>,
): ResolvedRow[] {
  return CLASS_FEATURES.map((row) => resolveOneRow(row, classIdByName, subclassCandidatesBySlug));
}

// ClassFeatureSeedRow's descriptor fields (#1227 widening) mirror
// DESCRIPTOR_RESET's keys 1:1 — walking DESCRIPTOR_RESET's own key set (never
// a second hand-maintained list) picks out only the fields a row ACTUALLY
// sets. Deliberately skips a field whose value is `undefined` rather than
// spreading it: `{ ...DESCRIPTOR_RESET, ...{ resourceKey: undefined } }`
// would overwrite the reset's `null` with JS's own `undefined`, not leave the
// reset alone. No row authored so far (#1227's Fighter rows included — pools
// stay in resourceFn, actions stay in DERIVED_ACTIONS) sets any of these, so
// this is a no-op today; it exists so #1528+ can populate a row's descriptors
// without a second write path.
function authoredDescriptors(row: ClassFeatureSeedRow): Partial<typeof DESCRIPTOR_RESET> {
  const authored: Partial<Record<string, unknown>> = {};
  for (const key of Object.keys(DESCRIPTOR_RESET)) {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (value !== undefined) authored[key] = value;
  }
  return authored as Partial<typeof DESCRIPTOR_RESET>;
}

async function writeResolvedRows(prisma: PrismaClient, resolved: ResolvedRow[]): Promise<void> {
  for (const { classId, subclassId, row } of resolved) {
    const descriptors = authoredDescriptors(row);
    const data = {
      classId,
      subclassId,
      name: row.name,
      level: row.level,
      description: row.description,
      edition: row.edition,
      ...DESCRIPTOR_RESET,
      ...descriptors,
    };
    await upsertEditionRow(
      prisma.classFeature,
      { classId, subclassId, name: row.name, edition: row.edition },
      data,
      { level: row.level, description: row.description, ...DESCRIPTOR_RESET, ...descriptors },
    );
  }
}

interface Partition {
  classId: string;
  subclassId: string | null;
  rows: ClassFeatureSeedRow[];
}

function groupByPartition(resolved: ResolvedRow[]): Map<string, Partition> {
  const byPartition = new Map<string, Partition>();
  for (const { classId, subclassId, row } of resolved) {
    const key = partitionKey(classId, subclassId);
    const entry = byPartition.get(key);
    if (entry) entry.rows.push(row);
    else byPartition.set(key, { classId, subclassId, rows: [row] });
  }
  return byPartition;
}

// Deletes, within EACH seeded partition, any row whose name isn't in that
// partition's own seeded list (#1227's "removed in 2024 = do not author a
// 2024 row" case — see classFeatureStaleWhere's comment for why a global
// name-scoped prune can't do this).
async function pruneStalePartitions(prisma: PrismaClient, byPartition: Map<string, Partition>): Promise<void> {
  for (const { classId, subclassId, rows } of byPartition.values()) {
    const staleWhere = classFeatureStaleWhere(
      rows.map((r) => ({ identity: r.name, edition: r.edition })),
      { classId, subclassId },
    );
    await prisma.classFeature.deleteMany({ where: staleWhere });
  }
}

// Deletes every row in a (classId, subclassId) partition the seed no longer
// authors AT ALL (e.g. a subclass removed from its class module) — these
// never appear in byPartition, so pruneStalePartitions never touches them.
async function sweepAbandonedPartitions(prisma: PrismaClient, byPartition: Map<string, Partition>): Promise<void> {
  const existingPartitions = await prisma.classFeature.findMany({
    select: { classId: true, subclassId: true },
    distinct: ["classId", "subclassId"],
  });
  const seededPartitionKeys = new Set(byPartition.keys());
  for (const p of existingPartitions) {
    if (!seededPartitionKeys.has(partitionKey(p.classId, p.subclassId))) {
      await prisma.classFeature.deleteMany({ where: { classId: p.classId, subclassId: p.subclassId } });
    }
  }
}

/**
 * Seeds every ClassFeature row (#1522/#1523) and prunes stale ones, scoped per
 * (classId, subclassId) partition rather than globally: a global name-keyed
 * prune (the shape staleCatalogRowsWhere gives its other callers) keys on
 * `name` alone, but 12 feature names (Spellcasting x7, Extra Attack x6,
 * Fighting Style/Oath Spells/Expanded Spell List/Bonus Proficiencies x3 each,
 * plus six more x2) are shared across more than one (class, subclass) scope,
 * so a globally-scoped prune could never retire a stale row for those names
 * while another class/subclass still seeds the same name (#1227).
 *
 * Exported (not module-private like every other seed.ts family) so a test can
 * call it twice in-process and assert idempotency — see
 * granted-ability-fork-reseed.test.ts's header on why seed.ts's own families
 * can't be re-run this way.
 *
 * Uses find-then-write (upsertEditionRow), never `.upsert()`/`.findUnique()`
 * on the compound key: subclassId is NULL for the majority of rows, and
 * Prisma rejects a literal null inside a compound-unique `where` at runtime
 * (verified against the structurally identical Subclass.classId_name key —
 * see upsertEditionRow's JSDoc).
 */
export async function seedClassFeatures(prisma: PrismaClient): Promise<void> {
  const classIdByName = await resolveClassIdsByName(prisma);
  const subclassCandidatesBySlug = await resolveSubclassCandidatesBySlug(prisma);
  const resolved = resolveRows(classIdByName, subclassCandidatesBySlug);

  await writeResolvedRows(prisma, resolved);

  const byPartition = groupByPartition(resolved);
  await pruneStalePartitions(prisma, byPartition);
  await sweepAbandonedPartitions(prisma, byPartition);

  // Runs LAST, after both prune passes, so the window this inspects includes
  // their deletions — a guard that ran first could not see the very emptying
  // it exists to catch (#1525).
  await assertEveryClassEditionPopulated(prisma);
  // Same ordering requirement, one level down: a subclass offered for an
  // edition with zero ClassFeature rows is this bug's general form (#1559,
  // Path of the Totem Warrior's original disclosure) and must also see
  // whatever the prune passes above just deleted.
  await assertEverySubclassEditionPopulated(prisma);
}

const EDITIONS: readonly SeedEdition[] = ["EDITION_2014", "EDITION_2024"];

// Below this, a (class, edition) pair reads as a half-written partition, not
// real content — e.g. a migration that landed a class's base-layer rows but
// not a subclass's, or a retab commit that stopped partway through. Today's
// smallest FULLY authored pair is Warlock's EDITION_2024 at 12 (#1233 — a
// retab shrinks the 2024 half when PHB'24 drops features, so this tracks the
// most-retabbed class rather than the smallest one) — ten leaves two rows of
// slack, tight enough that a bare `>= 1` (which a half-write sails straight
// past) can't hide behind it.
const MIN_ROWS_PER_PAIR = 10;

// Every class whose EDITION_2024 rows are STILL an unverified verbatim copy
// of its EDITION_2014 text (#1522 decision: "authored once, populated
// nowhere" — every class ships with SOME 2024 text so no character is
// featureless mid-epic, but nothing anywhere checks that the copy IS 2024
// content). This list itself IS that disclosure, made machine-readable:
// every name on it is a class assertEveryClassEditionPopulated cannot vouch
// for beyond "a 2024 row exists next to its 2014 twin, and the two agree on
// row count." A retab PR (#1528/#1227 for Fighter, #1134 for the rest)
// removes its class from this list in the SAME diff that makes that class's
// two editions genuinely diverge (a level shift is two rows with two
// `level` values — count stays equal, so it does NOT get removed for that
// alone; an added or dropped 2024-only feature changes the count and DOES).
// A list only ever edited to remove is a ratchet, never a tax. When it is
// empty, the equality check below is dead code — delete it then, not
// before. Cross-links: #1134 (the retab wave), #1522 (the epic this guard
// belongs to).
//
// "Fighter" removed here (#1227, same diff as the content that makes its
// counts diverge: base 5->13, Champion 5->6 EDITION_2024 rows; Battle Master
// stays 6/6 by row COUNT but several rows genuinely reworded). This removal
// is NOT "all of Fighter's 2024 text is verified" — Eldritch Knight's
// EDITION_2024 rows are still verbatim EDITION_2014 copies (no first-party
// source could be found for its PHB'24 text, #1531 owns authoring it) and
// this guard cannot distinguish "genuinely 2024" from "still a copy" for any
// class, Fighter included. The residual is disclosed here, not hidden by the
// ratchet reading green.
//
// "Barbarian" removed here (#1223, same diff as the content that makes its
// rows genuinely diverge: base 12->17 EDITION_2024 rows — Brutal Critical
// drops out, six new 2024-only features join — while both editions still
// land at 21 total rows apiece, since Path of the Totem Warrior authors 5
// EDITION_2014 rows and 0 EDITION_2024 ones). This removal is NOT "all of
// Barbarian's 2024 content is real" — two residuals stay undisclosed nowhere
// else but here: Path of the Totem Warrior has no 2024 successor authored at
// all (out of scope, #1223 research finding 5 — a 2024 character can still
// pick it and gets zero subclass features, since no read path filters
// Subclass by edition), and several of the 2024-only rows are TEXT ONLY with
// no mechanics behind them yet (Weapon Mastery, Primal Knowledge's skill
// grant, Persistent Rage's regain-on-Initiative automation, the Brutal
// Strike/Improved Brutal Strike effect menu, Frenzy's bonus dice,
// Intimidating Presence's announced save DC, Epic Boon's feat grant — #1223
// research finding 6).
//
// "Rogue" removed here (#1231, same diff as the content that makes its rows
// genuinely diverge: base 11->16 EDITION_2024 rows — Blindsense drops out,
// six new 2024-only features join (Weapon Mastery, Steady Aim, Cunning
// Strike, Improved Cunning Strike, Devious Strikes, Epic Boon), while Arcane
// Trickster/Assassin/Thief each keep 5/5 (Assassin's own count is unchanged
// despite Bonus Proficiencies -> Assassin's Tools being a rename and
// Impostor's mechanics folding into Infiltration Expertise's fork) — so the
// two editions land at 26 (2014) vs 31 (2024) total rows, genuinely
// unequal. This removal is NOT "all of Rogue's 2024 content is real" — the
// Cunning Strike effect catalog (dice-spend + enemy-targeted save effects)
// is TEXT ONLY with no mechanics behind it yet, same disclosed gap as
// Barbarian's Brutal Strike menu (#1231 research, mirrors #1223's own
// finding 6).
//
// "Wizard" removed here (#1234, same diff as the content that makes its rows
// genuinely diverge: base 4->8 EDITION_2024 rows, Evocation/Abjuration/
// Illusion each retab their level-2 features to level 3 and rework several
// mechanics — Improved Abjuration/Malleable Illusions/Improved Minor Illusion
// have no like-named 2024 successor, replaced by Spell Breaker/Phantasmal
// Creatures/Improved Illusions respectively). This removal is NOT "all of
// Wizard's 2024 content is real" — several residuals stay undisclosed nowhere
// else but here: Scholar's Expertise mechanic, Epic Boon's feat grant, Ritual
// Adept's ritual path, Memorize Spell's swap, and Spell Breaker's/Phantasmal
// Creatures' always-prepared spells are all TEXT ONLY (the always-prepared
// grants can't be SubclassGrantedSpell rows — that model has no `edition`
// column and Subclass rows are edition-shared, a schema gap, not a scope
// choice, #1234 research). Illusory Self's 2024 slot-expend restore is also
// text-only (a player-initiated cost, not a rest regain — no descriptor
// column exists for it).
// "Warlock" removed here (#1233, same diff as the content that makes its
// rows genuinely diverge: base 5->7 EDITION_2024 rows — Pact Boon drops out,
// Magical Cunning/Contact Patron/Epic Boon join — and The Fiend's own 5
// EDITION_2024 rows rework in place, one renamed ("Expanded Spell List" ->
// "Fiend Spells"); The Archfey and The Great Old One author ZERO EDITION_2024
// rows at all, following Totem Warrior's own precedent, so total counts land
// at 20 (2014) vs 12 (2024) — genuinely unequal, unlike the identical-both-
// editions shape this list exists to flag). This removal is NOT "all of
// Warlock's 2024 content is real" — two residuals stay undisclosed nowhere
// else but here: The Archfey/The Great Old One's PHB'24 reworks were never
// even attempted (non-SRD, no licensed source — #1233 research; a 2024
// character can still pick either and gets zero subclass features, same gap
// as Totem Warrior), and the Eldritch Invocation catalog itself (which
// invocations exist, their prerequisites, Pact Boon folding into it) is
// text-only — no mechanics behind it yet, tracked as a follow-up.
//
// "Ranger" removed here (#1230, same diff as the content that makes its rows
// genuinely diverge: base 11->15 EDITION_2024 rows — Natural Explorer/
// Primeval Awareness/Land's Stride/Hide in Plain Sight/Vanish drop out, nine
// new 2024-only features join, four rework in place (Spellcasting level-
// shifts 2->1, Favored Enemy/Feral Senses/Foe Slayer all full rewrites);
// Hunter goes 4->5 (Giant Killer/Steel Will/Multiattack drop out, Hunter's
// Lore joins, Superior Hunter's Prey fills Multiattack's old L11 slot); Beast
// Master stays 4->4 but Ranger's Companion RENAMES to Primal Companion — so
// the two editions land at 19 (2014) vs 24 (2024) total rows, genuinely
// unequal). This removal is NOT "all of Ranger's 2024 content is real" —
// several residuals stay undisclosed nowhere else but here: Roving's Climb/
// Swim-Speed and +10-ft grants, Deft Explorer's/L9 Expertise's Expertise
// grants, and Hunter's Prey/Defensive Tactics' 2024 rest-swap are all TEXT
// ONLY (#1230 research C6/C7, #1353); Favored Enemy's always-prepared
// Hunter's Mark has no force-prepare mechanism at all (no ClassGrantedSpell
// model exists — #1234's Wizard disclosure, same gap); and Beast Master's
// three companion stat blocks are deliberately never transcribed (mirror-
// sourced content, owner decision, PR body has the two-independent-mirror
// discipline this content was held to).
//
// "Sorcerer" removed here (#1232, same diff as the content that makes its
// rows genuinely diverge: base 5->9 EDITION_2024 rows — Sorcerous Origin
// renames to Sorcerer Subclass, Innate Sorcery/Sorcery Incarnate/Epic Boon/
// Arcane Apotheosis join — Draconic Bloodline's own 5 EDITION_2024 rows
// rework in place, two renamed (Dragon Ancestor folds into Draconic Spells,
// Draconic Presence -> Dragon Companion), and Wild Magic's own 5
// EDITION_2024 rows are mirror-sourced (SRD 5.2 ships only Draconic Sorcery
// for this class — Wild Magic Sorcery isn't in it at all — so these five are
// verified against two independently-agreeing mirrors instead, cited on
// their own rows, sorcerer-features.ts), one renamed (Spell Bombardment ->
// Tamed Surge), so total counts land at 15 (2014) vs 19 (2024) — genuinely
// unequal). This removal is NOT "all of Sorcerer's 2024 content is real" —
// two residuals stay undisclosed nowhere else but here: Draconic Resilience's
// unarmored AC change has no lib/srd/armor-class.ts branch for Sorcerer in
// EITHER edition (#1232 follow-up 1), and Font of Magic's 2024 Min. Sorcerer
// Level gating is text-only — sorceryPointCostForSlot enforces cost and cap
// but not minimum level (#1232 follow-up 2).
//
// "Cleric" removed here (#1225, same diff as the content that makes its rows
// genuinely diverge: base 5->11 EDITION_2024 rows — Destroy Undead and Divine
// Intervention Improvement each get a new-named 2024 successor instead of an
// in-place edit — while Life Domain stays 7/5 and Trickery Domain 6/5, for
// 18 (2014) vs 21 (2024) total rows, genuinely unequal). This removal is NOT
// "all of Cleric's 2024 content is real" — several residuals stay undisclosed
// nowhere else but here: Divine Order's Protector/Thaumaturge choice, Blessed
// Strikes'/Improved Blessed Strikes' Divine Strike/Potent Spellcasting
// choice, Divine Spark's heal-or-damage Channel Divinity option, Epic Boon's
// feat grant, and Divine Intervention's cast-without-a-slot behavior are all
// TEXT ONLY (#1225 research, same disclosed shape as every prior retab
// wave). Life/Trickery Domain Spells are ALSO text only and can't become
// SubclassGrantedSpell rows — that model has no `edition` column and
// Subclass rows are edition-shared, the schema gap Wizard's #1234 disclosed
// first, not a scope choice made here. Trickery Domain's own 2024 text is
// mirror-sourced (owner decision) rather than transcribed from SRD 5.2 —
// Trickery isn't in the SRD — see cleric-features.ts's own header for the
// two independent, non-scraper sources used and the one number
// (Invoke Duplicity's move-range cap) neither confirmed and is therefore
// omitted rather than carried over from 2014.
// "Bard" removed here (#1224, same diff as the content that makes its rows
// genuinely diverge: base 9->10 EDITION_2024 rows — Song of Rest drops out,
// Epic Boon/Words of Creation join, and Expertise/Jack of All Trades/Font of
// Inspiration/Countercharm/Magical Secrets/Superior Inspiration all rework in
// place — while both colleges stay 4->4 with one rename each (Additional
// Magical Secrets -> Magical Discoveries, College of Valor's Bonus
// Proficiencies -> Martial Training), for 17 (2014) vs 18 (2024) total rows,
// genuinely unequal). This removal is NOT "all of Bard's 2024 content is
// real" — several residuals stay undisclosed nowhere else but here: Magical
// Discoveries'/Words of Creation's always-prepared spell grants have no
// SubclassGrantedSpell-equivalent mechanism (that model has no `edition`
// column and Subclass rows are edition-shared, the schema gap Wizard's #1234
// disclosed first), Epic Boon's feat grant is text only, Martial Training's
// weapon-as-Spellcasting-Focus clause has no mechanism, Combat Inspiration's
// Defense/Offense options are text only, and Peerless Skill's
// non-expenditure-on-failure clause is text only (Bardic Inspiration dice are
// spent by a player-initiated op, not auto-tracked per use). College of Valor
// is mirror-sourced (owner decision, #1224) rather than transcribed from SRD
// 5.2 — Valor isn't in the SRD — see bard-features.ts's own header for the
// three independent, non-scraper sources used.
//
// "Paladin" removed here (#1229, same diff as the content that makes its rows
// genuinely diverge: base 12->15 EDITION_2024 rows — Divine Sense and Divine
// Health are cut, Faithful Steed/Abjure Foes/Aura Expansion/Epic Boon join,
// Divine Smite/Improved Divine Smite/Cleansing Touch each rename to Paladin's
// Smite/Radiant Strikes/Restoring Touch — while Devotion/Ancients/Vengeance
// each go 6->5 EDITION_2024 rows, one Channel Divinity option retired per
// oath in favor of the base class's own Abjure Foes). This removal is NOT
// "all of Paladin's 2024 content is real" — two residuals stay undisclosed
// nowhere else but here: Blessed Warrior's/Paladin's Smite's/Faithful Steed's
// mechanics are TEXT ONLY (no cantrip-swap wiring, no free-cast wiring, no
// always-prepared spell grant — the last of these can't become a
// SubclassGrantedSpell row either, the schema gap Wizard's #1234 disclosed
// first), and Oath of the Ancients/Oath of Vengeance's own 2024 text is
// mirror-sourced (owner decision, not in SRD 5.2) with two values (Vow of
// Enmity's action cost, Avenging Angel's duration) deliberately unverified
// against a licensed source — see paladin-features.ts's own header.
//
// "Monk" removed here (#1500, same diff as the content that makes its base
// class genuinely diverge: 18->17 EDITION_2014 rows — Uncanny Metabolism/
// Heightened Focus/Self-Restoration/Perfect Focus/Superior Defense are
// 2024-only; Stillness of Mind/Purity of Body/Tongue of the Sun and
// Moon/Diamond Soul/Timeless Body/Empty Body/Perfect Self are 2014-only, see
// monk-features.ts's own header). The four Warrior-of-* subclasses are still
// an untouched transport-only twin (#1501-#1503) — out of scope for this
// removal, since the class-level count is already unequal regardless.
const EDITIONS_STILL_IDENTICAL = new Set<string>([]);

export interface ClassEditionPopulationSummary {
  pairsChecked: number;
  classRowCount: number;
  minPairCount: number;
  rowsCounted: number;
}

interface ClassPairCounts {
  name: string;
  perEdition: Map<SeedEdition, number>;
}

// Split out of assertEveryClassEditionPopulated purely to keep each
// function's cyclomatic/cognitive complexity low (mirrors baseFeatureRows'
// / resolveSubclassId's split above, for the same fallow ratchet reason —
// prisma/seed/** carries no coverage instrumentation, see their comments).
function collectClassPairCounts(
  classes: { id: string; name: string }[],
  countByPair: Map<string, number>,
): ClassPairCounts[] {
  return classes.map((cls) => {
    const perEdition = new Map<SeedEdition, number>();
    for (const edition of EDITIONS) perEdition.set(edition, countByPair.get(`${cls.id}::${edition}`) ?? 0);
    return { name: cls.name, perEdition };
  });
}

// Isolated so the `?? 0` fallback (never expected to fire —
// collectClassPairCounts always sets both editions — but costs nothing as a
// defensive default) doesn't add a branch to every caller's own complexity
// count; prisma/seed/** has no coverage instrumentation, so an extra branch
// here is an extra 5 points of uncovered CRAP in whichever function holds it.
function pairCount(entry: ClassPairCounts, edition: SeedEdition): number {
  return entry.perEdition.get(edition) ?? 0;
}

// The "silent missing feature" check for ONE (class, edition) pair: 0 rows
// means the class is featureless in that edition; a nonzero count below
// MIN_ROWS_PER_PAIR means a half-written partition (see that constant's own
// comment) — a bare `>= 1` would sail past the second case.
function pairFloorFailure(name: string, edition: SeedEdition, count: number): string | null {
  if (count === 0) return `  ${name} / ${edition}: 0 rows (expected >= 1)`;
  if (count < MIN_ROWS_PER_PAIR) return `  ${name} / ${edition}: ${count} rows (below the >= ${MIN_ROWS_PER_PAIR} floor)`;
  return null;
}

function pairFloorFailures(entry: ClassPairCounts): string[] {
  const failures: string[] = [];
  for (const edition of EDITIONS) {
    const failure = pairFloorFailure(entry.name, edition, pairCount(entry, edition));
    if (failure) failures.push(failure);
  }
  return failures;
}

// The EDITIONS_STILL_IDENTICAL ratchet check (correction 5): a class still
// on that list has never had its 2024 rows genuinely retabbed, so its two
// editions' row counts must still match exactly — divergence there means
// either a retab landed without removing the class from the list, or a
// prune ran unevenly across editions.
function ratchetFailure(entry: ClassPairCounts): string | null {
  if (!EDITIONS_STILL_IDENTICAL.has(entry.name)) return null;
  const c2014 = pairCount(entry, "EDITION_2014");
  const c2024 = pairCount(entry, "EDITION_2024");
  if (c2014 === c2024) return null;
  return (
    `  ${entry.name}: EDITION_2014 has ${c2014} rows but EDITION_2024 has ${c2024} rows — still listed in ` +
    `EDITIONS_STILL_IDENTICAL; remove it there in the same diff that makes this class's editions diverge on purpose`
  );
}

// The anti-vacuity summary (#1525's `triplesVisited`-shaped literals a test
// asserts independently of anything the guard itself could also get wrong).
function summarizePairCounts(entries: ClassPairCounts[]): {
  pairsChecked: number;
  rowsCounted: number;
  minPairCount: number;
} {
  let pairsChecked = 0;
  let rowsCounted = 0;
  let minPairCount = Infinity;
  for (const entry of entries) {
    for (const edition of EDITIONS) {
      pairsChecked += 1;
      const count = pairCount(entry, edition);
      rowsCounted += count;
      if (count < minPairCount) minPairCount = count;
    }
  }
  return { pairsChecked, rowsCounted, minPairCount };
}

/**
 * Post-write presence guard (#1522/#1525): every seeded CharacterClass row
 * must have at least MIN_ROWS_PER_PAIR ClassFeature rows in EACH of
 * EDITION_2014 and EDITION_2024. Non-nullable `ClassFeature.edition` means
 * `featuresFromRows`' `rows.filter((row) => row.edition === edition && ...)`
 * has no shared-row fallback (correctly — every row forks), so a class
 * missing one edition's partition doesn't render 2014 text to a 2024
 * character (the #1430/#1519 failure this schema already closed) — it
 * renders NO features at all, on a sheet that otherwise looks fine. Louder
 * than wrong-edition text, but still silent without this.
 *
 * PRESENCE ONLY, never correctness. "A row exists" and "the row is 2024
 * content" are different assertions, and this only ever makes the first —
 * after #1523 every class's EDITION_2024 rows are unverified verbatim
 * copies of EDITION_2014 text (see EDITIONS_STILL_IDENTICAL above), and this
 * guard is green against a table where every one of them still is. Only
 * #1528/#1227 (Fighter) and the #1134 retabs establish real 2024 content,
 * each asserting against SRD 5.2 values directly — never against "differs
 * from 2014". A green run of this guard must never be read as "the 2024
 * content is real".
 *
 * Anchored on `prisma.characterClass.findMany()` — the runtime truth — not
 * on catalog-data.ts's CLASSES (the seed input, verified to name the exact
 * same 12 classes today) or either in-memory `CLASSES`/`CLASS_MODULES`
 * registry under lib/classes/: both of those are module-private maps that
 * #1532 edits (Fighter leaves lib/classes/registry.ts's CLASSES the same
 * wave this guard ships), so anchoring there would silently stop checking a
 * class the moment it migrates off the old registry — disarming the guard
 * in the same diff that most needs it armed.
 *
 * Exported so a test can call it directly against a deliberately broken DB
 * state — routing the probe through seedClassFeatures itself can only ever
 * pass, since the seeder rewrites every row before this ever runs.
 */
export async function assertEveryClassEditionPopulated(
  prisma: PrismaClient,
): Promise<ClassEditionPopulationSummary> {
  const classes = await prisma.characterClass.findMany({ select: { id: true, name: true } });
  const grouped = await prisma.classFeature.groupBy({ by: ["classId", "edition"], _count: { _all: true } });
  const countByPair = new Map<string, number>();
  for (const g of grouped) countByPair.set(`${g.classId}::${g.edition}`, g._count._all);

  const entries = collectClassPairCounts(classes, countByPair);
  const failures = entries.flatMap((entry) => {
    const ratchet = ratchetFailure(entry);
    return ratchet ? [...pairFloorFailures(entry), ratchet] : pairFloorFailures(entry);
  });

  if (failures.length > 0) {
    throw new Error(
      [
        "seedClassFeatures: ClassFeature population guard failed (#1525) —",
        ...failures,
        "Re-run `npx prisma db seed`. This guard asserts PRESENCE only, never that the",
        "2024 text is genuine 2024 content (#1528/#1227, #1134).",
      ].join("\n"),
    );
  }

  const { pairsChecked, rowsCounted, minPairCount } = summarizePairCounts(entries);
  return { pairsChecked, classRowCount: classes.length, minPairCount, rowsCounted };
}

// The editions a Subclass row is OFFERED for: `edition: null` is shared (both
// editions), an exact tag is that one edition only (#1306's own convention,
// reused here rather than re-deriving it).
function offeredEditions(edition: SeedEdition | null): SeedEdition[] {
  return edition === null ? [...EDITIONS] : [edition];
}

// One seeded Subclass row, pre-joined for the pure check below: `edition` is
// the row's own tag (what it's offered for) and `presentEditions` is which
// editions actually have >= 1 ClassFeature row — kept separate from the DB
// query so subclassPopulationFailures can be unit-tested against fabricated
// input, the same split assertCatalogNamesResolve/collectCatalogNames use in
// validate.ts.
export interface SubclassPresenceInput {
  slug: string;
  edition: SeedEdition | null;
  presentEditions: readonly SeedEdition[];
}

// The guard's own logic, isolated from Prisma: a subclass offered for an
// edition that isn't in `presentEditions` is the general form of #1559's Path
// of the Totem Warrior bug — offered, but zero features once a character
// picks it.
export function subclassPopulationFailures(rows: readonly SubclassPresenceInput[]): string[] {
  return rows.flatMap((row) =>
    offeredEditions(row.edition)
      .filter((offered) => !row.presentEditions.includes(offered))
      .map((offered) => `  ${row.slug} / ${offered}: 0 ClassFeature rows (expected >= 1)`),
  );
}

export interface SubclassEditionPopulationSummary {
  subclassesChecked: number;
  pairsChecked: number;
}

interface SubclassRowForPresence {
  id: string;
  slug: string;
  edition: SeedEdition | null;
}

// Groups ClassFeature's (subclassId, edition) row counts into "which editions
// actually have >= 1 row, per subclass" — split out of
// assertEverySubclassEditionPopulated purely to keep each function's own
// cyclomatic/cognitive complexity low. prisma/seed/** carries no vitest
// coverage instrumentation (vitest.config.ts scopes coverage.include to
// src/**/*.ts), so a function here floors at the UNCOVERED CRAP formula
// CC^2+CC regardless of real test coverage — splitting branches down is the
// only lever, not adding tests (see baseFeatureRows' comment, class-features.ts,
// for the same reasoning; mirrors collectClassPairCounts/pairCount's role one
// level up, for assertEveryClassEditionPopulated).
function groupPresentEditionsBySubclassId(
  featureCounts: readonly { subclassId: string | null; edition: SeedEdition }[],
): Map<string, SeedEdition[]> {
  const bySubclassId = new Map<string, SeedEdition[]>();
  for (const f of featureCounts) {
    // A TYPE narrowing, not a runtime possibility: the caller's groupBy filters
    // `subclassId: { in: [...] }` and SQL's IN never matches NULL, so a
    // base-class row cannot reach here. But the column is nullable, so Prisma
    // types the field `string | null` and the Map below needs `string`. Deleting
    // this line costs a non-null assertion, which is strictly worse.
    if (!f.subclassId) continue;
    const present = bySubclassId.get(f.subclassId) ?? [];
    present.push(f.edition);
    bySubclassId.set(f.subclassId, present);
  }
  return bySubclassId;
}

// Same complexity reasoning as groupPresentEditionsBySubclassId above.
function toSubclassPresenceInputs(
  subclassRows: readonly SubclassRowForPresence[],
  presentEditionsBySubclassId: Map<string, SeedEdition[]>,
): SubclassPresenceInput[] {
  return subclassRows.map((row) => ({
    slug: row.slug,
    edition: row.edition,
    presentEditions: presentEditionsBySubclassId.get(row.id) ?? [],
  }));
}

// The failure-message throw, isolated so assertEverySubclassEditionPopulated's
// own body carries only ONE branch (checking whether to call this at all) —
// same complexity reasoning as the two helpers above. The message text is the
// load-bearing part for the next retab author, which is why it stays attached
// to the one call site that can actually produce `failures`, not hoisted to a
// generic "throw with lines" utility that would separate the words from the
// #1559 citation explaining them.
function throwSubclassPopulationFailure(failures: readonly string[]): never {
  throw new Error(
    [
      "seedClassFeatures: Subclass population guard failed (#1559) —",
      ...failures,
      "Every Subclass row must have at least one ClassFeature row in every edition it is",
      "offered for (edition: null offers both). Either author the missing ClassFeature",
      "rows, or tag the Subclass row's `edition` to the edition(s) it actually has content for.",
    ].join("\n"),
  );
}

/**
 * Post-seed presence guard (#1559): every seeded Subclass row must have at
 * least one ClassFeature row in every edition it is OFFERED for — this bug's
 * general form, disclosed by Path of the Totem Warrior (#1223 authored zero
 * EDITION_2024 rows for it, correctly, since SRD 5.2 replaces it with Path of
 * the Wild Heart, but nothing stopped a 2024 character from still being
 * offered it and landing on a featureless sheet). Every remaining 2024 retab
 * that drops a subclass hits this same shape; this is what turns "we
 * remembered to tag it" into something the seed checks, per-row, forever.
 *
 * PRESENCE ONLY, same caveat as assertEveryClassEditionPopulated: "a row
 * exists" is not "the row is genuine content for that edition".
 *
 * Scoped to `prisma.subclass` rows whose `slug` is in SUBCLASSES — the seed's
 * OWN emitted set — never a bare table scan. A long-lived database can hold
 * a Subclass row the seed no longer emits at all, for example after a rename
 * drops the old slug outright. That row is a different problem from the one
 * this guard checks: reportUnseededSubclassRows (#1562) reports rows like
 * that on every seed run instead. This guard scanning
 * every DB row, instead of only the seeded ones, would hard-fail seeding for
 * anyone carrying such a row — failing the deploy for a problem this guard
 * doesn't own.
 *
 * Exported so a test can call it directly against a deliberately broken DB
 * state, same reasoning as assertEveryClassEditionPopulated's own JSDoc.
 */
export async function assertEverySubclassEditionPopulated(
  prisma: PrismaClient,
): Promise<SubclassEditionPopulationSummary> {
  const seededSlugs = [...new Set(SUBCLASSES.map((s) => s.slug))];
  const subclassRows = await prisma.subclass.findMany({
    where: { slug: { in: seededSlugs } },
    select: { id: true, slug: true, edition: true },
  });
  const featureCounts = await prisma.classFeature.groupBy({
    by: ["subclassId", "edition"],
    where: { subclassId: { in: subclassRows.map((r) => r.id) } },
    _count: { _all: true },
  });

  const presentEditionsBySubclassId = groupPresentEditionsBySubclassId(featureCounts);
  const inputs = toSubclassPresenceInputs(
    subclassRows.map((row) => ({ id: row.id, slug: row.slug, edition: row.edition as SeedEdition | null })),
    presentEditionsBySubclassId,
  );
  const failures = subclassPopulationFailures(inputs);
  if (failures.length > 0) throwSubclassPopulationFailure(failures);

  const pairsChecked = inputs.reduce((n, r) => n + offeredEditions(r.edition).length, 0);
  return { subclassesChecked: subclassRows.length, pairsChecked };
}
