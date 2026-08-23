// ZERO IMPORTS: tsx can't resolve @/ aliases at seed time.
//
// Kept out of the registry to avoid an import cycle: it imports every
// per-class module, several of which import the SRD module, which
// re-exports extra-attack's exports — a resolver living in the registry
// would make extra-attack -> registry -> monk -> srd -> extra-attack a real cycle.

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
  "monk-way-of-shadow",
  "monk-way-of-the-four-elements",
  "monk-way-of-the-open-hand",
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
] as const;

export type SubclassSlug = (typeof SUBCLASS_SLUGS)[number];

// classKey matches CLASSES' keys; nameKey matches a ClassDefinition.subclasses key (both lowercase).
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
  "monk-way-of-shadow": { classKey: "monk", nameKey: "way of shadow" },
  "monk-way-of-the-four-elements": { classKey: "monk", nameKey: "way of the four elements" },
  "monk-way-of-the-open-hand": { classKey: "monk", nameKey: "way of the open hand" },
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

const IDENTITY_TO_SLUG = new Map<string, SubclassSlug>(
  (Object.entries(SUBCLASS_IDENTITY) as [SubclassSlug, SubclassIdentity][]).map(
    ([slug, { classKey, nameKey }]) => [`${classKey}::${nameKey}`, slug],
  ),
);

export interface SubclassIdentityInput {
  subclass?: string | null;
  subclassRef?: { slug: string } | null;
}

// Resolves a subclass onto the stable slug vocabulary: the catalog FK slug
// wins when it matches the class, else an exact normalized name match
// against SUBCLASS_IDENTITY, else undefined — never a substring match.
export function resolveSubclassSlug(
  classKey: string,
  input: SubclassIdentityInput | undefined,
): SubclassSlug | undefined {
  // Trust the FK slug only when it belongs to this class — defence in depth against a class-mismatched FK.
  const fk = input?.subclassRef?.slug;
  const fkIdentity = fk ? SUBCLASS_IDENTITY[fk as SubclassSlug] : undefined;
  if (fkIdentity && fkIdentity.classKey === classKey.trim().toLowerCase()) return fk as SubclassSlug;

  const name = input?.subclass;
  if (!name) return undefined;
  return IDENTITY_TO_SLUG.get(`${classKey.trim().toLowerCase()}::${name.trim().toLowerCase()}`);
}

export function isEldritchKnightSlug(slug: SubclassSlug | undefined): boolean {
  return slug === "fighter-eldritch-knight";
}
