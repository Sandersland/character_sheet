// Stable subclass mechanics-identity vocabulary (#1277) — the join key between
// a seeded `Subclass` catalog row and the `SubclassDefinition` in this
// directory's per-class modules, replacing the substring match on a
// display-name string that let a 2014 "Way of Shadow" monk inherit 2024
// "Warrior of Shadow" mechanics (#1339).
//
// ZERO IMPORTS, ON PURPOSE. `prisma/seed/subclasses.ts` value-imports this
// module, and `tsx prisma/seed.ts` resolves plain relative paths only — no
// `@/` alias resolution. An `import … from "@/lib/..."` here would make
// `npx prisma db seed` throw ERR_MODULE_NOT_FOUND at SEED TIME, which
// tsconfig.seed.json's type-check does NOT catch (a type-only import erases
// before resolution matters; this file has none at all, so the constraint
// can never even be tested against by accident). Same constraint as
// prisma/seed/edition.ts and src/lib/inventory/item-detail-inputs.ts.
//
// Also lives in the LEAF, not classes/registry.ts, to avoid a real import
// cycle: registry.ts imports every per-class module (monk.ts, bard.ts, …),
// several of which import srd.ts, and srd.ts re-exports extra-attack.ts
// (`export * from "@/lib/srd/extra-attack.js"`). If extra-attack.ts needed
// resolveSubclassSlug from registry.ts, the cycle would be
// extra-attack → registry → monk → srd → extra-attack. Keeping the resolver
// in a leaf every consumer imports directly avoids it structurally (#1277 R8)
// — don't move this file into registry.ts.
//
// Why this is a join key, not "content in a TS module" (CLAUDE.md's "content
// is data" rule): SUBCLASS_IDENTITY carries no rules text, no description, no
// mechanics — only the (class, name) pair a slug stands for, which must live
// in code to be type-checked (a closed union makes a stray slug a compile
// error, not a runtime 404). The actual content — description, feature text,
// resource math — stays where it already lived: the seeded Subclass row and
// the SubclassDefinition's features/resourceFn.

export const SUBCLASS_SLUGS = [
  "barbarian-berserker",
  "barbarian-totem-warrior",
  "bard-college-of-lore",
  "bard-college-of-valor",
  "cleric-life-domain",
  "cleric-trickery-domain",
  "druid-circle-of-the-land",
  "druid-circle-of-the-moon",
  "fighter-battle-master",
  "fighter-champion",
  "fighter-eldritch-knight",
  "monk-warrior-of-mercy",
  "monk-warrior-of-shadow",
  "monk-warrior-of-the-elements",
  "monk-warrior-of-the-open-hand",
  "paladin-oath-of-devotion",
  "paladin-oath-of-the-ancients",
  "paladin-oath-of-vengeance",
  "ranger-beast-master",
  "ranger-hunter",
  "rogue-arcane-trickster",
  "rogue-assassin",
  "rogue-thief",
  "sorcerer-draconic-bloodline",
  "sorcerer-wild-magic",
  "warlock-the-archfey",
  "warlock-the-fiend",
  "warlock-the-great-old-one",
  "wizard-bladesinging",
  "wizard-school-of-abjuration",
  "wizard-school-of-evocation",
  "wizard-school-of-illusion",
] as const; // 32 members — the seed's row count (#1277 F1) and the
// lib/classes/*.ts subclass-definition count (#1277 F2) are already a
// perfect bijection; this list is exhaustive over both. Bladesinging
// (#1676, TCoE p.76) is identity-only like Fighter's subclasses — no
// lib/classes/wizard.ts subclass registration exists or is needed, since its
// mechanics ride the F1-F5 engine's seed-row vocabulary, not a
// SubclassDefinition.

export type SubclassSlug = (typeof SUBCLASS_SLUGS)[number];

/**
 * A slug's (class, subclass-registry-key) pair — `classKey` matches CLASSES'
 * keys in registry.ts, `nameKey` matches a ClassDefinition.subclasses key
 * (both lowercase, registry.ts:187's convention). `Record<SubclassSlug, …>`
 * makes this exhaustive both ways: a slug missing an entry, or a key not in
 * SUBCLASS_SLUGS, is a compile error.
 */
export interface SubclassIdentity {
  classKey: string;
  nameKey: string;
}

export const SUBCLASS_IDENTITY: Record<SubclassSlug, SubclassIdentity> = {
  "barbarian-berserker": { classKey: "barbarian", nameKey: "berserker" },
  "barbarian-totem-warrior": { classKey: "barbarian", nameKey: "totem warrior" },
  "bard-college-of-lore": { classKey: "bard", nameKey: "college of lore" },
  "bard-college-of-valor": { classKey: "bard", nameKey: "college of valor" },
  "cleric-life-domain": { classKey: "cleric", nameKey: "life domain" },
  "cleric-trickery-domain": { classKey: "cleric", nameKey: "trickery domain" },
  "druid-circle-of-the-land": { classKey: "druid", nameKey: "circle of the land" },
  "druid-circle-of-the-moon": { classKey: "druid", nameKey: "circle of the moon" },
  "fighter-battle-master": { classKey: "fighter", nameKey: "battle master" },
  "fighter-champion": { classKey: "fighter", nameKey: "champion" },
  "fighter-eldritch-knight": { classKey: "fighter", nameKey: "eldritch knight" },
  "monk-warrior-of-mercy": { classKey: "monk", nameKey: "warrior of mercy" },
  "monk-warrior-of-shadow": { classKey: "monk", nameKey: "warrior of shadow" },
  "monk-warrior-of-the-elements": { classKey: "monk", nameKey: "warrior of the elements" },
  "monk-warrior-of-the-open-hand": { classKey: "monk", nameKey: "warrior of the open hand" },
  "paladin-oath-of-devotion": { classKey: "paladin", nameKey: "oath of devotion" },
  "paladin-oath-of-the-ancients": { classKey: "paladin", nameKey: "oath of the ancients" },
  "paladin-oath-of-vengeance": { classKey: "paladin", nameKey: "oath of vengeance" },
  "ranger-beast-master": { classKey: "ranger", nameKey: "beast master" },
  "ranger-hunter": { classKey: "ranger", nameKey: "hunter" },
  "rogue-arcane-trickster": { classKey: "rogue", nameKey: "arcane trickster" },
  "rogue-assassin": { classKey: "rogue", nameKey: "assassin" },
  "rogue-thief": { classKey: "rogue", nameKey: "thief" },
  "sorcerer-draconic-bloodline": { classKey: "sorcerer", nameKey: "draconic bloodline" },
  "sorcerer-wild-magic": { classKey: "sorcerer", nameKey: "wild magic" },
  "warlock-the-archfey": { classKey: "warlock", nameKey: "the archfey" },
  "warlock-the-fiend": { classKey: "warlock", nameKey: "the fiend" },
  "warlock-the-great-old-one": { classKey: "warlock", nameKey: "the great old one" },
  "wizard-bladesinging": { classKey: "wizard", nameKey: "bladesinging" },
  "wizard-school-of-abjuration": { classKey: "wizard", nameKey: "school of abjuration" },
  "wizard-school-of-evocation": { classKey: "wizard", nameKey: "school of evocation" },
  "wizard-school-of-illusion": { classKey: "wizard", nameKey: "school of illusion" },
};

// Reverse lookup built once at module load, keyed by "classKey::nameKey" —
// resolveSubclassSlug's exact-name fallback path.
const IDENTITY_TO_SLUG = new Map<string, SubclassSlug>(
  (Object.entries(SUBCLASS_IDENTITY) as [SubclassSlug, SubclassIdentity][]).map(
    ([slug, { classKey, nameKey }]) => [`${classKey}::${nameKey}`, slug],
  ),
);

/** The two shapes a character's subclass identity can arrive in — a select
 * widened to include `subclassRef: { select: { slug: true } }` satisfies this
 * structurally with no extra mapping at the call site. */
export interface SubclassIdentityInput {
  subclass?: string | null;
  subclassRef?: { slug: string } | null;
}

/**
 * Resolves a character class entry's subclass onto the stable slug vocabulary
 * (#1277) — the ONE place a character resolves onto SUBCLASS_SLUGS, mirroring
 * resolveEditionRow's exact-then-fallback contract (catalog-edition.ts).
 *
 * Preference order, expressed here and nowhere else:
 *   1. `subclassRef.slug` (the catalog FK) — always trusted when present. A
 *      level-1 Monk created with free-text "Warrior of Mercy" persists the
 *      NAME with `subclassId: null` (subclassGateLevel gates the FK link),
 *      so FK-only would silently strip that character's mechanics — the
 *      exact silent-under-match this function exists to prevent (#1277 R2).
 *   2. Exact, normalized (lowercased + trimmed) `(classKey, subclass)` match
 *      against SUBCLASS_IDENTITY — the vocabulary #1339 already established
 *      at the one gate it fixed, generalized here to all seven.
 *   3. `undefined` — homebrew, no subclass, or a name matching nothing.
 *
 * Never substring-matches: a display name merely CONTAINING an accepted name
 * (e.g. "Warrior of the Open Handbook") resolves to `undefined`, not the
 * contained subclass's slug — the bug class #1339 fixed at one of the seven
 * sites this function now covers uniformly.
 *
 * No `edition` parameter — see the module header's SUBCLASS_IDENTITY comment
 * and CLAUDE.md's edition-as-data rule: no seeded subclass forks under one
 * name today, so a slug alone separates every existing pair. A future
 * same-name fork adds `edition` as the GATE's last parameter (mirroring
 * subclassGateLevel), not this resolver's.
 */
export function resolveSubclassSlug(
  classKey: string,
  input: SubclassIdentityInput | undefined,
): SubclassSlug | undefined {
  // The FK is trusted only when its slug belongs to the class being resolved.
  // A class-mismatched FK (a monk entry pointing at a fighter subclass) is a
  // data anomaly, and returning that slug would hand a caller an identity for
  // the wrong class rather than the honest `undefined` — the identity resolver
  // must not invent one. setSubclass enforces class scoping on write, so this
  // is defence in depth, and it costs one lookup in a table already in scope.
  const fk = input?.subclassRef?.slug;
  const fkIdentity = fk ? SUBCLASS_IDENTITY[fk as SubclassSlug] : undefined;
  if (fkIdentity && fkIdentity.classKey === classKey.trim().toLowerCase()) return fk as SubclassSlug;

  const name = input?.subclass;
  if (!name) return undefined;
  return IDENTITY_TO_SLUG.get(`${classKey.trim().toLowerCase()}::${name.trim().toLowerCase()}`);
}
